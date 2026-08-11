from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None


class QAPair(BaseModel):
    question: str
    answer: str


class QAPairWithId(QAPair):
    id: int


class QABankUploadResult(BaseModel):
    loaded_count: int


class AskResponseData(BaseModel):
    transcribed_question: str
    matched_question: Optional[str]
    answer_text: str
    confidence_score: float
    answer_audio_url: Optional[str] = None
    answer_audio_base64: Optional[str] = None
    audio_error: Optional[str] = None


class HealthData(BaseModel):
    status: str = "ok"
    qa_count: int = 0
class PersonaSettingsRequest(BaseModel):
    persona_prompt: str


class PersonaSettingsData(BaseModel):
    saved: bool
    persona_prompt: str
class ConversationStartData(BaseModel):
    session_id: str


class ConversationMessageData(BaseModel):
    transcribed_text: str
    response_text: str
    response_audio_url: Optional[str] = None
    response_audio_base64: Optional[str] = None
    audio_error: Optional[str] = None
    session_id: str


class ConversationEndData(BaseModel):
    ended: bool


class ConversationDeleteData(BaseModel):
    deleted: bool


class ConversationMessage(BaseModel):
    role: str
    content: str


class ConversationSummary(BaseModel):
    session_id: str
    started_at: str
    ended_at: Optional[str] = None
    messages: List[ConversationMessage]


class ConversationHistoryData(BaseModel):
    conversations: List[ConversationSummary]

class DocumentData(BaseModel):
    doc_id: str
    name: str
    chunk_count: int
    status: str = "processing"  # "processing" (partially indexed) | "ready" | "failed"
    total_pages: int = 0
    processed_pages: int = 0
    progress_percent: int = 0


class DocumentUploadResult(BaseModel):
    doc_id: str
    name: str
    chunk_count: int = 0  # 0 until processing completes
    status: str = "processing"


class DocumentDeleteResult(BaseModel):
    deleted: bool