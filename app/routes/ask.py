import json
import logging
from typing import List

from fastapi import APIRouter, File, Request, UploadFile

from app.models.schemas import (
    ApiResponse,
    AskResponseData,
    ErrorDetail,
    QABankUploadResult,
    QAPair,
    QAPairWithId,
)
from app.services.matcher_service import MatcherService
from app.services.response_service import ResponseService
from app.services.stt_service import NonEnglishSpeechError, STTService
from app.services.tts_service import TTSService, TTSSynthesisError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["ask"])


def _get_services(request: Request):
    return (
        request.app.state.stt_service,
        request.app.state.response_service,
        request.app.state.tts_service,
    )


@router.post("/ask", response_model=ApiResponse[AskResponseData])
async def ask_question(request: Request, audio: UploadFile = File(...)) -> ApiResponse[AskResponseData]:
    stt_service: STTService
    response_service: ResponseService
    tts_service: TTSService
    stt_service, response_service, tts_service = _get_services(request)

    if not audio.filename:
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="INVALID_AUDIO", message="No audio file provided."),
        )

    content = await audio.read()
    max_size = request.app.state.max_audio_size
    if len(content) > max_size:
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code="AUDIO_TOO_LARGE",
                message=f"Audio file exceeds maximum size of {max_size // (1024 * 1024)} MB.",
            ),
        )

    if len(content) == 0:
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

    if not transcribed.strip():
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code="NO_SPEECH",
                message="Could not detect speech in the audio. Please try again.",
            ),
        )

    result = response_service.generate(transcribed)

    try:
        prefix = "answer" if result.matched_question else "fallback"
        audio_path = await tts_service.synthesize(result.answer_text, filename_prefix=prefix)
    except TTSSynthesisError as exc:
        # Text answer already succeeded — return it with no audio and a
        # short, user-safe note instead of failing the whole request.
        logger.warning("TTS failed, returning text-only answer")
        return ApiResponse(
            success=True,
            data=AskResponseData(
                transcribed_question=result.transcribed_question,
                matched_question=result.matched_question,
                answer_text=result.answer_text,
                confidence_score=round(result.confidence_score, 4),
                answer_audio_url=None,
                audio_error=exc.user_message,
            ),
        )

    answer_audio_base64 = await tts_service.audio_base64(audio_path)

    return ApiResponse(
        success=True,
        data=AskResponseData(
            transcribed_question=result.transcribed_question,
            matched_question=result.matched_question,
            answer_text=result.answer_text,
            confidence_score=round(result.confidence_score, 4),
            answer_audio_url=tts_service.audio_url(audio_path),
            answer_audio_base64=answer_audio_base64,
        ),
    )