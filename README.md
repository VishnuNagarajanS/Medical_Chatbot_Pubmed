# AI Voice Agent

A Python/FastAPI voice Q&A application. Speak a question into your microphone and receive a spoken answer from a predefined question bank using semantic matching.

## Features (Phase 1)

- **Voice input** — Record questions via browser microphone
- **Speech-to-text** — Local transcription with [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- **Semantic matching** — [sentence-transformers](https://www.sbert.net/) + [FAISS](https://github.com/facebookresearch/faiss) cosine similarity
- **Text-to-speech** — Natural voice output via [edge-tts](https://github.com/rany2/edge-tts)
- **Web UI** — Record button, live status, transcribed text, and answer display
- **Admin** — Upload/replace Q&A bank via JSON file

## Prerequisites

- Python 3.10+
- [FFmpeg](https://ffmpeg.org/) installed and on your PATH (required by faster-whisper for audio decoding)
- Modern browser with microphone access (Chrome/Edge recommended)
- Internet connection (edge-tts uses Microsoft's online TTS service)

## Quick Start

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 4. Open in browser
# http://localhost:8000
```

On first run, the app downloads the Whisper STT model and sentence-transformer embedding model. This may take a few minutes.

## Project Structure

```
Voice_Agent_V1/
├── app/
│   ├── main.py              # FastAPI entrypoint
│   ├── config.py            # Settings and paths
│   ├── routes/
│   │   ├── ask.py           # POST /api/v1/ask
│   │   └── qa_bank.py       # Q&A bank management
│   ├── services/
│   │   ├── stt_service.py   # faster-whisper wrapper
│   │   ├── tts_service.py   # edge-tts wrapper
│   │   ├── matcher_service.py
│   │   ├── qa_store.py
│   │   └── response_service.py
│   ├── data/
│   │   └── qa_bank.json     # 20 sample Q&A pairs
│   └── models/
│       └── schemas.py
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── media/responses/         # Generated TTS audio files
└── requirements.txt
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check + Q&A count |
| GET | `/api/v1/qa-bank` | List all Q&A pairs |
| POST | `/api/v1/qa-bank/upload` | Upload JSON Q&A bank |
| POST | `/api/v1/ask` | Send audio, get matched answer + TTS |

Interactive API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Sample Q&A JSON Format

```json
[
  {
    "question": "What is FastAPI?",
    "answer": "FastAPI is a modern Python web framework for building APIs."
  }
]
```

## Configuration

Edit `app/config.py` to adjust:

| Setting | Default | Description |
|---------|---------|-------------|
| `STT_MODEL_SIZE` | `base` | Whisper model size (`tiny`, `base`, `small`, …) |
| `MATCH_THRESHOLD` | `0.55` | Minimum cosine similarity for a match |
| `TTS_VOICE` | `en-US-AriaNeural` | edge-tts voice |
| `FALLBACK_MESSAGE` | (see config) | Spoken when no match is found |

## How It Works

1. User records audio in the browser
2. Audio is sent to `POST /api/v1/ask`
3. **STT** transcribes speech to text
4. **Matcher** embeds the question and finds the closest Q&A pair via FAISS
5. If confidence ≥ threshold → return predefined answer; else → fallback message
6. **TTS** converts answer text to MP3 and returns it to the frontend

## Phase 2 (Planned)

- Configurable persona/system prompt
- LLM-driven dynamic conversation (Groq/Gemini/Ollama)
- Multi-turn session memory

## Troubleshooting

| Issue | Fix |
|-------|-----|
| STT fails / invalid audio | Install FFmpeg and ensure it is on PATH |
| Slow first request | Models load on first use; subsequent requests are faster |
| No match for valid question | Lower `MATCH_THRESHOLD` in config or rephrase closer to bank |
| Microphone blocked | Allow mic permission in browser settings |

## License

Internal project — see project documentation for details.
