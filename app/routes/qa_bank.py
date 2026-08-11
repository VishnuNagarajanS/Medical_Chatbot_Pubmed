import json
import logging
from typing import List

from fastapi import APIRouter, File, Request, UploadFile

from app.models.schemas import ApiResponse, ErrorDetail, QABankUploadResult, QAPair, QAPairWithId
from app.services.matcher_service import MatcherService
from app.services.qa_store import QAStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/qa-bank", tags=["qa-bank"])


@router.get("", response_model=ApiResponse[List[QAPairWithId]])
async def get_qa_bank(request: Request) -> ApiResponse[List[QAPairWithId]]:
    qa_store: QAStore = request.app.state.qa_store
    return ApiResponse(success=True, data=qa_store.get_all())


@router.post("/upload", response_model=ApiResponse[QABankUploadResult])
async def upload_qa_bank(
    request: Request,
    file: UploadFile = File(...),
) -> ApiResponse[QABankUploadResult]:
    qa_store: QAStore = request.app.state.qa_store
    matcher: MatcherService = request.app.state.matcher_service

    if not file.filename or not file.filename.lower().endswith(".json"):
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="INVALID_FILE", message="Please upload a JSON file."),
        )

    content = await file.read()
    try:
        raw = json.loads(content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="INVALID_JSON", message=f"Malformed JSON: {exc}"),
        )

    if not isinstance(raw, list):
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="INVALID_JSON", message="Q&A bank must be a JSON array."),
        )

    pairs: List[QAPair] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question", "")).strip()
        answer = str(item.get("answer", "")).strip()
        if question and answer:
            pairs.append(QAPair(question=question, answer=answer))

    if not pairs:
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code="EMPTY_BANK",
                message="No valid question-answer pairs found in the uploaded file.",
            ),
        )

    count = qa_store.replace_all(pairs)
    matcher.rebuild_index()

    return ApiResponse(success=True, data=QABankUploadResult(loaded_count=count))
