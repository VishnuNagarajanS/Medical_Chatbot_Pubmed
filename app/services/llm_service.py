import logging
from typing import List, Dict

from groq import Groq

from app.config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger(__name__)

BASE_SYSTEM_INSTRUCTIONS = (
    "You are a helpful, natural-sounding voice assistant. "
    "Keep responses conversational and reasonably concise since they will be spoken aloud. "
    "Avoid markdown, bullet points, or formatting that doesn't make sense in speech. "
    "IMPORTANT: Always respond in English only, regardless of the language the user uses."
)

APP_RULES = (
    "Rules:\n"
    "- Never break character from the persona described below, if one is set.\n"
    "- If the user greets you or makes small talk, respond naturally and briefly.\n"
    "- If you don't know something, say so honestly instead of making things up.\n"
    "- Do not mention that you are an AI language model unless explicitly asked."
)


class LLMService:
    """Wrapper around Groq's chat completion API for Phase 2 conversational responses."""

    def __init__(self, api_key: str = GROQ_API_KEY, model: str = GROQ_MODEL) -> None:
        if not api_key:
            raise ValueError("GROQ_API_KEY is not set. Add it to your .env file.")
        self._client = Groq(api_key=api_key)
        self._model = model

    def _build_messages(
        self,
        persona_prompt: str,
        history: List[Dict[str, str]],
        user_message: str,
        document_context: str = "",
        system_context: str = "",
    ) -> List[Dict[str, str]]:
        system_parts = [BASE_SYSTEM_INSTRUCTIONS, APP_RULES]
        if persona_prompt and persona_prompt.strip():
            system_parts.append(f"Persona instructions from admin:\n{persona_prompt.strip()}")

        if system_context and system_context.strip():
            system_parts.append(f"{system_context.strip()}")

        if document_context and document_context.strip():
            system_parts.append(
                "Reference material retrieved from documents the user uploaded. Use it to answer "
                "questions about the document(s). If the user's message is unrelated to this "
                "material, ignore it and just respond normally as a natural conversation:\n\n"
                f"{document_context.strip()}"
            )

        system_message = {"role": "system", "content": "\n\n".join(system_parts)}
        messages = [system_message] + history + [{"role": "user", "content": user_message}]
        return messages

    def generate_reply(
        self,
        persona_prompt: str,
        history: List[Dict[str, str]],
        user_message: str,
        document_context: str = "",
        system_context: str = "",
    ) -> str:
        messages = self._build_messages(persona_prompt, history, user_message, document_context, system_context)

        response = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=0.7,
            max_tokens=220,
        )
        reply = response.choices[0].message.content.strip()
        logger.info("LLM reply generated (%d chars)", len(reply))
        return reply

    def generate_reply_stream(
        self,
        persona_prompt: str,
        history: List[Dict[str, str]],
        user_message: str,
        document_context: str = "",
        system_context: str = "",
    ):
        """Yields text chunks as they arrive. Used in Chunk C (streaming)."""
        messages = self._build_messages(persona_prompt, history, user_message, document_context, system_context)

        stream = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=0.7,
            max_tokens=220,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta