from dotenv import load_dotenv
load_dotenv()
from pathlib import Path
import os
BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BASE_DIR / "app"
DATA_DIR = APP_DIR / "data"
MEDIA_DIR = BASE_DIR / "media" / "responses"
FRONTEND_DIR = BASE_DIR / "frontend"

QA_BANK_PATH = DATA_DIR / "qa_bank.json"

STT_MODEL_SIZE = "base"
STT_DEVICE = "cpu"
STT_COMPUTE_TYPE = "int8"

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DEVICE = "cpu"  # "cpu" or "cuda" for GPU acceleration
EMBEDDING_BATCH_SIZE = 32  # Batch size for encoding chunks
EMBEDDING_CACHE_QUERIES = True  # Cache query embeddings for faster repeated queries
MATCH_THRESHOLD = 0.55

TTS_VOICE = "en-US-AriaNeural"
FALLBACK_MESSAGE = "Sorry, I don't have an answer for that yet."

MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"