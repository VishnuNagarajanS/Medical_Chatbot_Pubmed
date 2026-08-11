import json
import logging
from pathlib import Path
from typing import List, Optional

from app.config import QA_BANK_PATH
from app.models.schemas import QAPair, QAPairWithId

logger = logging.getLogger(__name__)


class QAStore:
    """In-memory Q&A bank backed by a JSON file."""

    def __init__(self, bank_path: Path = QA_BANK_PATH) -> None:
        self._bank_path = bank_path
        self._pairs: List[QAPairWithId] = []

    @property
    def count(self) -> int:
        return len(self._pairs)

    def load(self) -> int:
        if not self._bank_path.exists():
            logger.warning("Q&A bank file not found at %s", self._bank_path)
            self._pairs = []
            return 0

        with open(self._bank_path, encoding="utf-8") as f:
            raw = json.load(f)

        if not isinstance(raw, list):
            raise ValueError("Q&A bank must be a JSON array of question-answer pairs.")

        self._pairs = [
            QAPairWithId(id=i + 1, question=item["question"], answer=item["answer"])
            for i, item in enumerate(raw)
            if item.get("question") and item.get("answer")
        ]
        logger.info("Loaded %d Q&A pairs from %s", len(self._pairs), self._bank_path)
        return len(self._pairs)

    def get_all(self) -> List[QAPairWithId]:
        return list(self._pairs)

    def get_by_id(self, pair_id: int) -> Optional[QAPairWithId]:
        for pair in self._pairs:
            if pair.id == pair_id:
                return pair
        return None

    def replace_all(self, pairs: List[QAPair]) -> int:
        self._pairs = [
            QAPairWithId(id=i + 1, question=p.question, answer=p.answer)
            for i, p in enumerate(pairs)
            if p.question.strip() and p.answer.strip()
        ]
        self._bank_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._bank_path, "w", encoding="utf-8") as f:
            json.dump(
                [{"question": p.question, "answer": p.answer} for p in self._pairs],
                f,
                indent=2,
                ensure_ascii=False,
            )
        logger.info("Saved %d Q&A pairs to %s", len(self._pairs), self._bank_path)
        return len(self._pairs)
