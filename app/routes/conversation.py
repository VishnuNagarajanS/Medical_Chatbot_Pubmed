import logging

from fastapi import APIRouter, File, Form, Request, UploadFile
from app.models.schemas import (
    ApiResponse,
    ConversationDeleteData,
    ConversationEndData,
    ConversationHistoryData,
    ConversationMessage,
    ConversationMessageData,
    ConversationStartData,
    ConversationSummary,
    ErrorDetail,
)
from app.services.conversation_manager import ConversationManager
from app.services.document_store import DocumentStore
from app.services.llm_service import LLMService
from app.services.stt_service import NonEnglishSpeechError, STTService
from app.services.tts_service import TTSService, TTSSynthesisError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/conversation", tags=["conversation"])


@router.post("/start", response_model=ApiResponse[ConversationStartData])
async def start_conversation(request: Request) -> ApiResponse[ConversationStartData]:
    conversation_manager: ConversationManager = request.app.state.conversation_manager
    session = conversation_manager.start_session()
    return ApiResponse(success=True, data=ConversationStartData(session_id=session.session_id))


@router.post("/message", response_model=ApiResponse[ConversationMessageData])
async def send_message(
    request: Request,
    audio: UploadFile = File(...),
    session_id: str = Form(...),
) -> ApiResponse[ConversationMessageData]:
    conversation_manager: ConversationManager = request.app.state.conversation_manager
    stt_service: STTService = request.app.state.stt_service
    llm_service: LLMService = request.app.state.llm_service
    tts_service: TTSService = request.app.state.tts_service

    session = conversation_manager.get_session(session_id)
    if session is None:
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="SESSION_NOT_FOUND", message="Invalid or expired session_id."),
        )

    content = await audio.read()
    if not content:
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="INVALID_AUDIO", message="Uploaded audio file is empty."),
        )

    suffix = ".webm"
    if audio.filename and "." in audio.filename:
        suffix = "." + audio.filename.rsplit(".", 1)[-1].lower()

    try:
        transcribed = await stt_service.transcribe_bytes_async(content, suffix=suffix)
    except NonEnglishSpeechError as exc:
        logger.info("Rejected non-English speech: %s", exc)
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code="NON_ENGLISH_SPEECH",
                message="I can only understand English right now. Please try again in English.",
            ),
        )
    except Exception as exc:
        logger.exception("STT failed")
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="STT_FAILED", message=f"Speech-to-text failed: {exc}"),
        )

    #if not transcribed.strip():
        #return ApiResponse(
            #success=False,
            #error=ErrorDetail(code="NO_SPEECH", message="Could not detect speech. Please try again."),
        #)

    history = conversation_manager.get_history(session_id)

    document_store: DocumentStore = request.app.state.document_store
    relevant_chunks = document_store.search(transcribed)
    document_context = "\n\n---\n\n".join(
        f'From "{chunk.doc_name}":\n{chunk.text}' for chunk in relevant_chunks
    )

    # Add document status (including in-progress ones) to system context
    system_context = f"Document status:\n{document_store.get_document_status_summary()}"

    try:
        # Always use the current global persona, not the one frozen at session start,
        # so changing/resetting it in Settings takes effect on the active conversation too.
        # document_context is only non-empty when the question is actually relevant to an
        # uploaded document, so normal conversation is unaffected when nothing matches.
        reply_text = llm_service.generate_reply(
            persona_prompt=conversation_manager.get_persona(),
            history=history,
            user_message=transcribed,
            document_context=document_context,
            system_context=system_context,
        )
    except Exception as exc:
        logger.exception("LLM generation failed")
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="LLM_FAILED", message=f"Response generation failed: {exc}"),
        )

    try:
        audio_path = await tts_service.synthesize(reply_text, filename_prefix="reply")
    except TTSSynthesisError as exc:
        # The text reply already succeeded — don't throw it away just because
        # voice playback failed. Return it normally, with no audio and a
        # short, user-safe note (never the raw exception/URL) instead.
        logger.warning("TTS failed for session %s, returning text-only reply", session_id)
        conversation_manager.append_exchange(session_id, transcribed, reply_text)
        return ApiResponse(
            success=True,
            data=ConversationMessageData(
                transcribed_text=transcribed,
                response_text=reply_text,
                response_audio_url=None,
                audio_error=exc.user_message,
                session_id=session_id,
            ),
        )

    conversation_manager.append_exchange(session_id, transcribed, reply_text)

    response_audio_base64 = await tts_service.audio_base64(audio_path)

    return ApiResponse(
        success=True,
        data=ConversationMessageData(
            transcribed_text=transcribed,
            response_text=reply_text,
            response_audio_url=tts_service.audio_url(audio_path),
            response_audio_base64=response_audio_base64,
            session_id=session_id,
        ),
    )

@router.get("/history", response_model=ApiResponse[ConversationHistoryData])
async def get_conversation_history(request: Request) -> ApiResponse[ConversationHistoryData]:
    conversation_manager: ConversationManager = request.app.state.conversation_manager
    sessions = conversation_manager.get_all_conversations()
    conversations = [
        ConversationSummary(
            session_id=s.session_id,
            started_at=s.started_at.isoformat(),
            ended_at=s.ended_at.isoformat() if s.ended_at else None,
            messages=[ConversationMessage(role=m["role"], content=m["content"]) for m in s.history],
        )
        for s in sessions
    ]
    return ApiResponse(success=True, data=ConversationHistoryData(conversations=conversations))

@router.delete("/history/{session_id}", response_model=ApiResponse[ConversationDeleteData])
async def delete_conversation_history(request: Request, session_id: str) -> ApiResponse[ConversationDeleteData]:
    """Delete one archived (ended) conversation from the history popup. This
    only removes it from the past-conversations archive — it never touches
    an active/live session (use DELETE /{session_id} for that)."""
    conversation_manager: ConversationManager = request.app.state.conversation_manager
    deleted = conversation_manager.delete_conversation(session_id)
    if not deleted:
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="CONVERSATION_NOT_FOUND", message="Conversation not found."),
        )
    return ApiResponse(success=True, data=ConversationDeleteData(deleted=True))

@router.delete("/{session_id}", response_model=ApiResponse[ConversationEndData])
async def end_conversation(request: Request, session_id: str) -> ApiResponse[ConversationEndData]:
    conversation_manager: ConversationManager = request.app.state.conversation_manager
    ended = conversation_manager.end_session(session_id)
    return ApiResponse(success=True, data=ConversationEndData(ended=ended))