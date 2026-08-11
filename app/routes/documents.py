import logging
from typing import List

from fastapi import APIRouter, BackgroundTasks, File, Request, UploadFile

from app.models.schemas import (
    ApiResponse,
    DocumentData,
    DocumentDeleteResult,
    DocumentUploadResult,
    ErrorDetail,
)
from app.services.document_parser import SUPPORTED_EXTENSIONS, extract_text
from app.services.document_store import DocumentStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

MAX_DOCUMENT_SIZE_BYTES = 32 * 1024 * 1024  # 32 MB
BATCH_PAGE_SIZE = 20  # pages per incremental indexing batch


async def process_document_background(doc_id: str, filename: str, content: bytes, document_store: DocumentStore):
    """Background task: extract + index a document incrementally so it becomes
    partially searchable while large PDFs are still being processed."""
    try:
        if filename.lower().endswith(".pdf"):
            import io
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(content))
            total_pages = len(reader.pages)
            document_store.set_total_pages(doc_id, total_pages)

            for start in range(0, total_pages, BATCH_PAGE_SIZE):
                batch = reader.pages[start:start + BATCH_PAGE_SIZE]
                texts = []
                for p in batch:
                    try:
                        texts.append(p.extract_text() or "")
                    except Exception as exc:
                        logger.warning("Doc %s: failed to extract a page: %s", doc_id, exc)
                        texts.append("")
                await document_store.add_text_batch(doc_id, "\n".join(texts), len(batch))
                logger.info(
                    "Doc %s: indexed %d/%d pages",
                    doc_id, min(start + BATCH_PAGE_SIZE, total_pages), total_pages,
                )
        else:
            text = await extract_text(filename, content)
            await document_store.add_text_batch(doc_id, text, 1)

        document_store.mark_ready(doc_id)
        logger.info("Background processing completed for document %s", doc_id)
    except Exception as exc:
        logger.exception("Background processing failed for document %s: %s", doc_id, exc)
        document_store.mark_failed(doc_id)


@router.get("", response_model=ApiResponse[List[DocumentData]])
async def list_documents(request: Request) -> ApiResponse[List[DocumentData]]:
    document_store: DocumentStore = request.app.state.document_store
    docs = [
        DocumentData(
            doc_id=d.doc_id,
            name=d.name,
            chunk_count=d.chunk_count,
            status=d.status,
            total_pages=d.total_pages,
            processed_pages=d.processed_pages,
            progress_percent=d.progress_percent,
        )
        for d in document_store.documents
    ]
    return ApiResponse(success=True, data=docs)


@router.post("/upload", response_model=ApiResponse[DocumentUploadResult])
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> ApiResponse[DocumentUploadResult]:
    document_store: DocumentStore = request.app.state.document_store

    if not file.filename or not file.filename.lower().endswith(SUPPORTED_EXTENSIONS):
        return ApiResponse(
            success=False,
            error=ErrorDetail(
                code="INVALID_FILE",
                message="Please upload a PDF, DOCX, or TXT file.",
            ),
        )

    content = await file.read()
    if len(content) > MAX_DOCUMENT_SIZE_BYTES:
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="FILE_TOO_LARGE", message="Document exceeds the 32 MB limit."),
        )

    document = document_store.add_document_pending(file.filename)

    background_tasks.add_task(
        process_document_background,
        document.doc_id,
        file.filename,
        content,
        document_store
    )

    return ApiResponse(
        success=True,
        data=DocumentUploadResult(
            doc_id=document.doc_id,
            name=document.name,
            chunk_count=0,
            status="processing",
        ),
    )


@router.delete("/{doc_id}", response_model=ApiResponse[DocumentDeleteResult])
async def delete_document(request: Request, doc_id: str) -> ApiResponse[DocumentDeleteResult]:
    document_store: DocumentStore = request.app.state.document_store
    removed = document_store.remove_document(doc_id)
    if not removed:
        return ApiResponse(
            success=False,
            error=ErrorDetail(code="NOT_FOUND", message="Document not found."),
        )
    return ApiResponse(success=True, data=DocumentDeleteResult(deleted=True))