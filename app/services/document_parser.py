import asyncio
import io
import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = (".pdf", ".docx", ".txt", ".md")
_executor = ThreadPoolExecutor(max_workers=4)


async def extract_text(filename: str, content: bytes) -> str:
    """Extract plain text from an uploaded document's raw bytes asynchronously."""
    lower = filename.lower()

    if lower.endswith(".pdf"):
        return await asyncio.to_thread(_extract_pdf, content)
    if lower.endswith(".docx"):
        return await asyncio.to_thread(_extract_docx, content)
    if lower.endswith((".txt", ".md")):
        return content.decode("utf-8", errors="ignore")

    raise ValueError("Unsupported file type. Please upload a PDF, DOCX, or TXT file.")


def _extract_pdf(content: bytes) -> str:
    from pypdf import PdfReader
    from concurrent.futures import ThreadPoolExecutor

    reader = PdfReader(io.BytesIO(content))
    total_pages = len(reader.pages)

    def extract_page_text(args):
        idx, page = args
        try:
            return page.extract_text() or ""
        except Exception as exc:
            # Don't let one bad page kill the whole document.
            logger.warning("Failed to extract text from page %d/%d: %s", idx + 1, total_pages, exc)
            return ""

    with ThreadPoolExecutor(max_workers=4) as executor:
        pages = list(executor.map(extract_page_text, enumerate(reader.pages)))

    text = "\n".join(pages)
    extracted_chars = len(text.strip())
    non_empty_pages = sum(1 for p in pages if p.strip())

    logger.info(
        "PDF extraction: %d/%d pages had text, %d chars total",
        non_empty_pages, total_pages, extracted_chars,
    )

    # If almost nothing came out, this is very likely a scanned/image-only PDF.
    # pypdf can't OCR it — surface a clear reason instead of a silent generic failure.
    if total_pages > 0 and non_empty_pages / total_pages < 0.05:
        raise ValueError(
            f"This PDF appears to be scanned/image-based — only {non_empty_pages} of "
            f"{total_pages} pages had extractable text. It needs OCR before it can be used."
        )

    return text


def _extract_docx(content: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs)