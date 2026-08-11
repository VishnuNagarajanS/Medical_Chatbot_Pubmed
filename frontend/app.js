const API_BASE = "";

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const recordBtn = document.getElementById("record-btn");
const transcribedText = document.getElementById("transcribed-text");
const matchedQuestion = document.getElementById("matched-question");
const answerText = document.getElementById("answer-text");
const confidenceScore = document.getElementById("confidence-score");
const answerAudio = document.getElementById("answer-audio");
const qaUpload = document.getElementById("qa-upload");
const uploadBtn = document.getElementById("upload-btn");
const uploadStatus = document.getElementById("upload-status");
const qaCount = document.getElementById("qa-count");
const qaList = document.getElementById("qa-list");

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const STATES = {
  idle: { dot: "idle", text: "Ready — click the mic to start" },
  listening: { dot: "listening", text: "Listening… speak your question" },
  processing: { dot: "processing", text: "Processing your question…" },
  speaking: { dot: "speaking", text: "Speaking the answer…" },
  error: { dot: "error", text: "Something went wrong" },
};

function setStatus(state, customText) {
  const cfg = STATES[state] || STATES.idle;
  statusDot.className = `status-dot ${cfg.dot}`;
  statusText.textContent = customText || cfg.text;
}

async function loadQABank() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/qa-bank`);
    const body = await res.json();
    if (!body.success || !body.data) return;

    qaCount.textContent = body.data.length;
    qaList.innerHTML = body.data
      .map(
        (pair) =>
          `<li><strong>Q:</strong> ${escapeHtml(pair.question)}<br><strong>A:</strong> ${escapeHtml(pair.answer)}</li>`
      )
      .join("");
  } catch (err) {
    console.error("Failed to load Q&A bank:", err);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioChunks = [];

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  mediaRecorder = new MediaRecorder(stream, { mimeType });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    sendAudio(new Blob(audioChunks, { type: mimeType }));
  };

  mediaRecorder.start();
  isRecording = true;
  recordBtn.classList.add("recording");
  setStatus("listening");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  isRecording = false;
  recordBtn.classList.remove("recording");
}

recordBtn.addEventListener("click", async () => {
  if (isRecording) {
    stopRecording();
    return;
  }

  try {
    await startRecording();
  } catch (err) {
    setStatus("error", "Microphone access denied or unavailable.");
    console.error(err);
  }
});

async function sendAudio(blob) {
  setStatus("processing");
  recordBtn.disabled = true;

  const formData = new FormData();
  formData.append("audio", blob, "question.webm");

  try {
    const res = await fetch(`${API_BASE}/api/v1/ask`, {
      method: "POST",
      body: formData,
    });
    const body = await res.json();

    if (!body.success) {
      const msg = body.error?.message || "Request failed.";
      setStatus("error", msg);
      return;
    }

    const data = body.data;
    transcribedText.textContent = data.transcribed_question || "—";
    transcribedText.classList.remove("muted");
    matchedQuestion.textContent = data.matched_question || "No match found";
    matchedQuestion.classList.remove("muted");
    answerText.textContent = data.answer_text || "—";
    answerText.classList.remove("muted");
    confidenceScore.textContent =
      data.confidence_score != null ? `${(data.confidence_score * 100).toFixed(1)}%` : "—";
    confidenceScore.classList.remove("muted");

    if (data.answer_audio_url) {
      answerAudio.hidden = false;
      answerAudio.src = data.answer_audio_url;
      setStatus("speaking");
      try {
        await answerAudio.play();
      } catch (playErr) {
        console.warn("Auto-play blocked:", playErr);
      }
      answerAudio.onended = () => setStatus("idle");
    } else {
      setStatus("idle");
    }
  } catch (err) {
    setStatus("error", "Network error — is the server running?");
    console.error(err);
  } finally {
    recordBtn.disabled = false;
  }
}

uploadBtn.addEventListener("click", async () => {
  const file = qaUpload.files[0];
  if (!file) {
    uploadStatus.textContent = "Please select a JSON file first.";
    uploadStatus.className = "upload-status error";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  uploadBtn.disabled = true;
  uploadStatus.textContent = "Uploading…";
  uploadStatus.className = "upload-status";

  try {
    const res = await fetch(`${API_BASE}/api/v1/qa-bank/upload`, {
      method: "POST",
      body: formData,
    });
    const body = await res.json();

    if (!body.success) {
      uploadStatus.textContent = body.error?.message || "Upload failed.";
      uploadStatus.className = "upload-status error";
      return;
    }

    uploadStatus.textContent = `Loaded ${body.data.loaded_count} Q&A pairs successfully.`;
    uploadStatus.className = "upload-status success";
    qaUpload.value = "";
    await loadQABank();
  } catch (err) {
    uploadStatus.textContent = "Upload failed — network error.";
    uploadStatus.className = "upload-status error";
    console.error(err);
  } finally {
    uploadBtn.disabled = false;
  }
});

loadQABank();
