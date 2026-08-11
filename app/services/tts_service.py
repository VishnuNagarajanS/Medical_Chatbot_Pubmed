import asyncio
import base64
import logging
import uuid
from pathlib import Path

import edge_tts

from app.config import MEDIA_DIR, TTS_VOICE

logger = logging.getLogger(__name__)

TTS_MAX_ATTEMPTS = 3
TTS_RETRY_BACKOFF_SECONDS = 1.5


class TTSSynthesisError(Exception):
    """Raised when speech synthesis fails after all retries."""

    def __init__(self, user_message: str, original: Exception) -> None:
        self.user_message = user_message
        self.original = original
        super().__init__(user_message)


class TTSService:
    """Text-to-speech using edge-tts."""

    def __init__(self, voice: str = TTS_VOICE, output_dir: Path = MEDIA_DIR) -> None:
        self._voice = voice
        self._output_dir = output_dir
        self._output_dir.mkdir(parents=True, exist_ok=True)

    async def synthesize(self, text: str, filename_prefix: str = "answer") -> Path:
        """Unchanged — still saves the mp3 to disk. Kept as-is so the cleanup
        loop and the /media/responses URL fallback keep working exactly as before."""
        filename = f"{filename_prefix}_{uuid.uuid4().hex[:12]}.mp3"
        output_path = self._output_dir / filename

        last_error: Exception | None = None
        for attempt in range(1, TTS_MAX_ATTEMPTS + 1):
            try:
                communicate = edge_tts.Communicate(text, self._voice)
                await communicate.save(str(output_path))
                logger.info("Generated TTS audio: %s (attempt %d)", output_path.name, attempt)
                return output_path
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning(
                    "TTS attempt %d/%d failed: %s", attempt, TTS_MAX_ATTEMPTS, exc
                )
                if attempt < TTS_MAX_ATTEMPTS:
                    await asyncio.sleep(TTS_RETRY_BACKOFF_SECONDS * attempt)

        logger.exception("TTS failed after %d attempts", TTS_MAX_ATTEMPTS, exc_info=last_error)
        raise TTSSynthesisError(
            "Voice playback is temporarily unavailable. You can still read the response below.",
            last_error,
        )

    def audio_url(self, file_path: Path) -> str:
        return f"/media/responses/{file_path.name}"

    async def audio_base64(self, file_path: Path) -> str:
        """Read the just-generated mp3 and base64-encode it, so the frontend
        can play it straight from the JSON response instead of making a
        second HTTP round trip to fetch it by URL."""
        data = await asyncio.to_thread(file_path.read_bytes)
        encoded = base64.b64encode(data).decode("ascii")
        return f"data:audio/mpeg;base64,{encoded}"