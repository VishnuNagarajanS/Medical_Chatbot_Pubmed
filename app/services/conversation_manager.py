import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

MAX_HISTORY_MESSAGES = 20  # keep last N messages (user+assistant) to control token usage
MAX_ARCHIVED_CONVERSATIONS = 50  # cap how many past conversations we keep in memory


@dataclass
class ConversationSession:
    session_id: str
    persona_prompt: str = ""
    history: List[Dict[str, str]] = field(default_factory=list)
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None


class ConversationManager:
    """In-memory store for active conversation sessions, plus a short archive
    of recently ended conversations so past history can be displayed in the
    history popup. Note: this archive lives in memory only and resets if the
    server restarts."""

    def __init__(self) -> None:
        self._sessions: Dict[str, ConversationSession] = {}
        self._archive: List[ConversationSession] = []
        self._active_persona_prompt: str = ""

    # ---- Persona (global setting, applied to new sessions) ----

    def set_persona(self, persona_prompt: str) -> None:
        self._active_persona_prompt = persona_prompt.strip()
        logger.info("Persona prompt updated (%d chars)", len(self._active_persona_prompt))

    def get_persona(self) -> str:
        return self._active_persona_prompt

    # ---- Session lifecycle ----

    def start_session(self) -> ConversationSession:
        session_id = f"sess_{uuid.uuid4().hex[:12]}"
        session = ConversationSession(session_id=session_id, persona_prompt=self._active_persona_prompt)
        self._sessions[session_id] = session
        logger.info("Started conversation session %s", session_id)
        return session

    def get_session(self, session_id: str) -> Optional[ConversationSession]:
        return self._sessions.get(session_id)

    def end_session(self, session_id: str) -> bool:
        session = self._sessions.pop(session_id, None)
        if session is None:
            return False

        session.ended_at = datetime.now(timezone.utc)
        logger.info("Ended conversation session %s", session_id)

        # Only archive conversations that actually had an exchange — an
        # immediate start -> end with no speech isn't worth showing in history.
        if session.history:
            self._archive.append(session)
            if len(self._archive) > MAX_ARCHIVED_CONVERSATIONS:
                self._archive = self._archive[-MAX_ARCHIVED_CONVERSATIONS:]

        return True

    # ---- History management ----

    def append_exchange(self, session_id: str, user_message: str, assistant_reply: str) -> None:
        session = self._sessions.get(session_id)
        if session is None:
            return

        session.history.append({"role": "user", "content": user_message})
        session.history.append({"role": "assistant", "content": assistant_reply})

        # trim to last MAX_HISTORY_MESSAGES to avoid unbounded growth / token blowup
        if len(session.history) > MAX_HISTORY_MESSAGES:
            session.history = session.history[-MAX_HISTORY_MESSAGES:]

    def get_history(self, session_id: str) -> List[Dict[str, str]]:
        session = self._sessions.get(session_id)
        return session.history if session else []

    # ---- Past conversations (for the history popup) ----

    def get_all_conversations(self) -> List[ConversationSession]:
        """Ended conversations, most recent first."""
        return list(reversed(self._archive))

    def delete_conversation(self, session_id: str) -> bool:
        """Remove one archived conversation (used by the history popup's
        delete button). Does not touch any live/active session."""
        for i, session in enumerate(self._archive):
            if session.session_id == session_id:
                del self._archive[i]
                logger.info("Deleted archived conversation %s", session_id)
                return True
        return False