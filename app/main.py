import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from app.routes import ask, conversation, documents, qa_bank, settings
from app.services.conversation_manager import ConversationManager
from app.services.document_store import DocumentStore
from app.services.llm_service import LLMService

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import FRONTEND_DIR, MAX_AUDIO_SIZE_BYTES, MEDIA_DIR
from app.models.schemas import ApiResponse, HealthData
from app.routes import ask, qa_bank
from app.services.matcher_service import MatcherService
from app.services.qa_store import QAStore
from app.services.response_service import ResponseService
from app.services.stt_service import STTService
from app.services.tts_service import TTSService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

MEDIA_FILE_TTL_SECONDS = 30 * 60  # delete generated audio older than 30 minutes
MEDIA_CLEANUP_INTERVAL_SECONDS = 10 * 60  # check every 10 minutes


async def _cleanup_old_media_loop():
    """Background loop: deletes TTS audio files older than MEDIA_FILE_TTL_SECONDS.
    These files only exist so the frontend can fetch/play them once — nothing
    reuses them, so there's no reason to keep them around."""
    while True:
        try:
            now = time.time()
            deleted = 0
            for f in MEDIA_DIR.glob("*.mp3"):
                if now - f.stat().st_mtime > MEDIA_FILE_TTL_SECONDS:
                    f.unlink(missing_ok=True)
                    deleted += 1
            if deleted:
                logger.info("Cleaned up %d expired TTS audio file(s)", deleted)
        except Exception:
            logger.exception("Media cleanup loop failed")
        await asyncio.sleep(MEDIA_CLEANUP_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    qa_store = QAStore()
    count = qa_store.load()

    matcher_service = MatcherService(qa_store)
    matcher_service.rebuild_index()

    app.state.qa_store = qa_store
    app.state.matcher_service = matcher_service
    app.state.stt_service = STTService()
    # Load the Whisper model now (startup), not on the first user request —
    # avoids a multi-second delay on someone's very first question.
    await asyncio.to_thread(app.state.stt_service._ensure_model)
    app.state.tts_service = TTSService()
    app.state.response_service = ResponseService(matcher_service)
    app.state.llm_service = LLMService()
    app.state.conversation_manager = ConversationManager()
    app.state.document_store = DocumentStore()
    # Preload the embedding model at startup too, not on the first
    # document upload/search.
    await asyncio.to_thread(app.state.document_store._ensure_model)
    app.state.max_audio_size = MAX_AUDIO_SIZE_BYTES

    logger.info("AI Voice Agent started with %d Q&A pairs", count)

    cleanup_task = asyncio.create_task(_cleanup_old_media_loop())

    yield

    cleanup_task.cancel()
    logger.info("AI Voice Agent shutting down")


app = FastAPI(
    title="AI Voice Agent",
    description="Phase 1: Predefined Q&A voice agent with STT, semantic matching, and TTS.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media/responses", StaticFiles(directory=str(MEDIA_DIR)), name="media")

app.include_router(ask.router)
app.include_router(qa_bank.router)
app.include_router(ask.router)
app.include_router(qa_bank.router)
app.include_router(settings.router)
app.include_router(conversation.router)
app.include_router(documents.router)

@app.get("/api/v1/health", response_model=ApiResponse[HealthData])
async def health() -> ApiResponse[HealthData]:
    return ApiResponse(
        success=True,
        data=HealthData(status="ok", qa_count=app.state.qa_store.count),
    )


@app.get("/")
async def serve_frontend():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Frontend not found. API is running at /docs"}


frontend_static = FRONTEND_DIR
if frontend_static.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_static)), name="static")