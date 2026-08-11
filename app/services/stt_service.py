import asyncio
import logging
import re
import tempfile
from pathlib import Path
from typing import Optional

from faster_whisper import WhisperModel

from app.config import STT_COMPUTE_TYPE, STT_DEVICE, STT_MODEL_SIZE

logger = logging.getLogger(__name__)

# Only English is supported by this assistant.
#
# IMPORTANT: Whisper does not transcribe "language-agnostically" and then
# translate — it first guesses the spoken language, then decodes the ENTIRE
# audio using that language's vocabulary/script. On short clips (a few
# seconds) that language guess is unreliable, and a wrong guess doesn't just
# mistranslate — it produces garbage text in the wrong script (e.g. English
# speech about "the Chola kingdom" coming out as Urdu-script gibberish).
#
# Because of that, we NEVER use an auto-detected-language transcription as
# the text shown to the user. The primary decode is always forced to
# language=ALLOWED_LANGUAGE, so what's displayed is always decoded through
# the English vocabulary. A separate, independent auto-detect pass is run
# only to decide whether to reject the input as genuine non-English speech —
# its own transcribed text is discarded and never surfaced.
#
# PERF NOTE: the two passes are independent of each other, so they're run
# concurrently in a thread pool instead of one-after-another. CTranslate2
# (which faster-whisper uses under the hood) releases the GIL during
# inference, so this genuinely overlaps on multi-core CPUs — same result,
# roughly half the wall-clock time.
ALLOWED_LANGUAGE = "en"
LANGUAGE_CONFIDENCE_THRESHOLD = 0.65

# Heuristic used to decide whether the forced-English decode is "real"
# English and not just Whisper hallucinating words onto foreign audio (in
# which case we trust the auto-detect pass's non-English verdict instead).
MIN_ENGLISH_WORD_COUNT = 2
_ENGLISH_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "what", "who", "how",
    "why", "when", "where", "tell", "me", "about", "you", "i", "can",
    "please", "do", "does", "did", "to", "of", "in", "on", "for", "and",
    "it", "that", "this", "with",
}


class NonEnglishSpeechError(Exception):
    """Raised when confident, non-empty speech is detected in a non-English language."""

    def __init__(self, language: str, probability: float) -> None:
        self.language = language
        self.probability = probability
        super().__init__(
            f"Detected non-English speech (language={language}, confidence={probability:.2f})"
        )


def _looks_like_english(text: str) -> bool:
    """Cheap heuristic: does this text contain enough recognizable English
    words to trust it over a shaky non-English language-id guess?"""
    words = re.findall(r"[a-zA-Z']+", text.lower())
    if len(words) < MIN_ENGLISH_WORD_COUNT:
        return False
    ascii_word_ratio = len(words) / max(len(text.split()), 1)
    has_stopword = any(w in _ENGLISH_STOPWORDS for w in words)
    return ascii_word_ratio >= 0.6 and has_stopword


class STTService:
    """Speech-to-text using faster-whisper."""

    def __init__(
        self,
        model_size: str = STT_MODEL_SIZE,
        device: str = STT_DEVICE,
        compute_type: str = STT_COMPUTE_TYPE,
    ) -> None:
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._model: Optional[WhisperModel] = None

    def _ensure_model(self) -> WhisperModel:
        if self._model is None:
            logger.info(
                "Loading Whisper model '%s' on %s (%s)",
                self._model_size,
                self._device,
                self._compute_type,
            )
            self._model = WhisperModel(
                self._model_size,
                device=self._device,
                compute_type=self._compute_type,
            )
        return self._model

    def _run(self, audio_path: Path, language: Optional[str] = None):
        # Unchanged from before — same beam_size, same vad_filter, same everything.
        model = self._ensure_model()
        segments, info = model.transcribe(
            str(audio_path), beam_size=5, vad_filter=True, language=language
        )
        segments = list(segments)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return text, info

    def _decide(self, text: str, detect_info) -> str:
        """Exact same decision logic as before — just pulled out so both the
        sync and async paths use one copy of it."""
        logger.info(
            "Forced-English transcript: %r | auto-detect=%s (confidence=%.2f)",
            text,
            detect_info.language,
            detect_info.language_probability,
        )

        if (
            text
            and detect_info.language != ALLOWED_LANGUAGE
            and detect_info.language_probability >= LANGUAGE_CONFIDENCE_THRESHOLD
        ):
            if _looks_like_english(text):
                return text
            raise NonEnglishSpeechError(detect_info.language, detect_info.language_probability)

        return text

    def transcribe(self, audio_path: Path) -> str:
        """Original sequential version — kept for any callers that still need
        a plain sync call. Logic identical to before."""
        text, _ = self._run(audio_path, language=ALLOWED_LANGUAGE)
        _, detect_info = self._run(audio_path)
        return self._decide(text, detect_info)

    async def transcribe_async(self, audio_path: Path) -> str:
        """Same two passes, same decision logic — run concurrently instead of
        one after another, and off the event loop so FastAPI stays responsive
        to other requests while this runs."""
        loop = asyncio.get_event_loop()
        (text, _), (_, detect_info) = await asyncio.gather(
            loop.run_in_executor(None, self._run, audio_path, ALLOWED_LANGUAGE),
            loop.run_in_executor(None, self._run, audio_path, None),
        )
        return self._decide(text, detect_info)

    def transcribe_bytes(self, audio_bytes: bytes, suffix: str = ".webm") -> str:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = Path(tmp.name)
        try:
            return self.transcribe(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

    async def transcribe_bytes_async(self, audio_bytes: bytes, suffix: str = ".webm") -> str:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = Path(tmp.name)
        try:
            return await self.transcribe_async(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)