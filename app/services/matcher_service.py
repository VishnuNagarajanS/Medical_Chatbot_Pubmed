import logging
from dataclasses import dataclass
from typing import List, Optional

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import EMBEDDING_MODEL, MATCH_THRESHOLD
from app.models.schemas import QAPairWithId
from app.services.qa_store import QAStore

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    pair: Optional[QAPairWithId]
    confidence_score: float
    matched: bool


class MatcherService:
    """Semantic question matching using sentence-transformers and FAISS."""

    def __init__(
        self,
        qa_store: QAStore,
        model_name: str = EMBEDDING_MODEL,
        threshold: float = MATCH_THRESHOLD,
    ) -> None:
        self._qa_store = qa_store
        self._model_name = model_name
        self._threshold = threshold
        self._model: Optional[SentenceTransformer] = None
        self._index: Optional[faiss.IndexFlatIP] = None
        self._pair_ids: List[int] = []

    def _ensure_model(self) -> SentenceTransformer:
        if self._model is None:
            logger.info("Loading embedding model: %s", self._model_name)
            self._model = SentenceTransformer(self._model_name)
        return self._model

    def rebuild_index(self) -> None:
        pairs = self._qa_store.get_all()
        if not pairs:
            self._index = None
            self._pair_ids = []
            logger.info("Q&A index cleared (no pairs loaded)")
            return

        model = self._ensure_model()
        questions = [p.question for p in pairs]
        embeddings = model.encode(questions, normalize_embeddings=True, show_progress_bar=False)
        embeddings = np.asarray(embeddings, dtype=np.float32)

        self._index = faiss.IndexFlatIP(embeddings.shape[1])
        self._index.add(embeddings)
        self._pair_ids = [p.id for p in pairs]
        logger.info("Built FAISS index with %d questions", len(pairs))

    def match(self, question_text: str) -> MatchResult:
        if not question_text.strip():
            return MatchResult(pair=None, confidence_score=0.0, matched=False)

        if self._index is None or self._index.ntotal == 0:
            return MatchResult(pair=None, confidence_score=0.0, matched=False)

        model = self._ensure_model()
        query = model.encode([question_text], normalize_embeddings=True, show_progress_bar=False)
        query = np.asarray(query, dtype=np.float32)

        scores, indices = self._index.search(query, 1)
        score = float(scores[0][0])
        idx = int(indices[0][0])

        if idx < 0 or idx >= len(self._pair_ids):
            return MatchResult(pair=None, confidence_score=score, matched=False)

        pair = self._qa_store.get_by_id(self._pair_ids[idx])
        matched = score >= self._threshold and pair is not None
        return MatchResult(pair=pair if matched else None, confidence_score=score, matched=matched)
