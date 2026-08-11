from dataclasses import dataclass
from typing import Optional

from app.config import FALLBACK_MESSAGE
from app.services.matcher_service import MatcherService, MatchResult


@dataclass
class ResponseResult:
    transcribed_question: str
    matched_question: Optional[str]
    answer_text: str
    confidence_score: float


class ResponseService:
    """
    Phase 1 response generation via semantic Q&A matching.
    Phase 2 can replace this with LLM-driven generation without changing STT/TTS layers.
    """

    def __init__(self, matcher: MatcherService, fallback_message: str = FALLBACK_MESSAGE) -> None:
        self._matcher = matcher
        self._fallback_message = fallback_message

    def generate(self, transcribed_question: str) -> ResponseResult:
        match: MatchResult = self._matcher.match(transcribed_question)

        if match.matched and match.pair is not None:
            return ResponseResult(
                transcribed_question=transcribed_question,
                matched_question=match.pair.question,
                answer_text=match.pair.answer,
                confidence_score=match.confidence_score,
            )

        return ResponseResult(
            transcribed_question=transcribed_question,
            matched_question=None,
            answer_text=self._fallback_message,
            confidence_score=match.confidence_score,
        )
