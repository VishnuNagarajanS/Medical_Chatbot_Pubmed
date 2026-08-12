const API_BASE = "http://127.0.0.1:8000";

async function handleResponse(res) {
  const body = await res.json();
  if (!body.success) {
    const message = body.error?.message || "Request failed.";
    throw new Error(message);
  }
  return body.data;
}

export async function setPersona(personaPrompt) {
  const res = await fetch(`${API_BASE}/api/v1/settings/persona`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persona_prompt: personaPrompt }),
  });
  return handleResponse(res);
}

export async function getPersona() {
  const res = await fetch(`${API_BASE}/api/v1/settings/persona`);
  return handleResponse(res);
}

export async function startConversation() {
  const res = await fetch(`${API_BASE}/api/v1/conversation/start`, {
    method: "POST",
  });
  return handleResponse(res);
}

export async function sendMessage(sessionId, audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "message.webm");
  formData.append("session_id", sessionId);

  const res = await fetch(`${API_BASE}/api/v1/conversation/message`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
}

export async function sendTextMessage(sessionId, message) {
  const res = await fetch(`${API_BASE}/api/v1/conversation/message-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return handleResponse(res);
}

export async function endConversation(sessionId) {
  const res = await fetch(`${API_BASE}/api/v1/conversation/${sessionId}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/v1/documents/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
}

export async function getDocuments() {
  const res = await fetch(`${API_BASE}/api/v1/documents`);
  return handleResponse(res);
}

export async function deleteDocument(docId) {
  const res = await fetch(`${API_BASE}/api/v1/documents/${docId}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function getConversationHistory() {
  const res = await fetch(`${API_BASE}/api/v1/conversation/history`);
  return handleResponse(res);
}

export async function deleteConversationHistory(sessionId) {
  const res = await fetch(`${API_BASE}/api/v1/conversation/history/${sessionId}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}