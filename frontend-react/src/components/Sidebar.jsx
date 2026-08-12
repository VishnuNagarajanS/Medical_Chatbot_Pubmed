import { useEffect, useRef, useState } from "react";
import { deleteDocument, getDocuments, uploadDocument } from "../services/api";

const UPLOAD_STATUS_MESSAGES = [
  "Reading document…",
  "Gathering the key details…",
  "Understanding the content…",
  "Breaking it into pieces…",
  "Connecting the ideas…",
  "Almost done…",
];
const UPLOAD_STATUS_INTERVAL_MS = 1800;

export default function Sidebar({ onNewConversation, onOpenSettings, isSessionActive, mode, onModeChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploadStatus, setUploadStatus] = useState(""); // "", "uploading", "error"
  const [uploadError, setUploadError] = useState("");
  const [uploadMessageIndex, setUploadMessageIndex] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    refreshDocuments().then(() => {
      // resume polling if a doc was already mid-processing (e.g. after page reload)
    });
  }, []);

  useEffect(() => {
    if (documents.some((d) => d.status === "processing")) {
      pollDocumentStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.length]);

  useEffect(() => {
    if (uploadStatus !== "uploading") return;

    setUploadMessageIndex(0);
    const intervalId = setInterval(() => {
      setUploadMessageIndex((i) => (i + 1) % UPLOAD_STATUS_MESSAGES.length);
    }, UPLOAD_STATUS_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [uploadStatus]);

  const refreshDocuments = async () => {
    try {
      const docs = await getDocuments();
      setDocuments(docs || []);
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  };

  const handleAddDocumentClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setUploadStatus("uploading");
    setUploadError("");
    try {
      const result = await uploadDocument(file);
      // Add document immediately with processing status
      setDocuments((prev) => [
        ...prev,
        { doc_id: result.doc_id, name: result.name, chunk_count: 0, status: "processing" },
      ]);
      setUploadStatus("");
      // Start polling for status updates
      pollDocumentStatus();
    } catch (err) {
      console.error("Failed to upload document:", err);
      setUploadStatus("error");
      setUploadError(err.message || "Upload failed.");
    }
  };

  const pollDocumentStatus = async () => {
    // Poll every 2 seconds to update document statuses
    const pollInterval = setInterval(async () => {
      try {
        const docs = await getDocuments();
        setDocuments(docs || []);
        
        // Stop polling if all documents are ready or failed
        const allDone = docs?.every(d => d.status === "ready" || d.status === "failed");
        if (allDone) {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Failed to poll document status:", err);
      }
    }, 2000);

    // Clean up after 5 minutes max
    setTimeout(() => clearInterval(pollInterval), 300000);
  };

  const handleRemoveDocument = async (docId) => {
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.doc_id !== docId));
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <svg className="sidebar-logo" viewBox="0 0 32 32" width="28" height="28" fill="none">
            <circle cx="16" cy="16" r="14" stroke="url(#logoGradient)" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="6" fill="url(#logoGradient)" />
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff6ec4" />
                <stop offset="50%" stopColor="#7873f5" />
                <stop offset="100%" stopColor="#42d7f5" />
              </linearGradient>
            </defs>
          </svg>
          {!collapsed && <span className="sidebar-title">Aura</span>}
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle sidebar"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <button className="sidebar-item sidebar-new-btn" onClick={onNewConversation}>
        <span className="sidebar-icon">+</span>
        {!collapsed && <span>New Conversation</span>}
      </button>

      <div className="sidebar-section">
        {!collapsed && <span className="sidebar-section-label">Mode</span>}
        <div className={`mode-switch ${collapsed ? "mode-switch-collapsed" : ""}`}>
          <button
            className={`mode-switch-btn ${mode === "voice" ? "mode-switch-btn-active" : ""}`}
            onClick={() => onModeChange("voice")}
            aria-pressed={mode === "voice"}
            title="Voice agent mode"
          >
            <span className="sidebar-icon">🎙</span>
            {!collapsed && <span>Voice Agent</span>}
          </button>
          <button
            className={`mode-switch-btn ${mode === "chat" ? "mode-switch-btn-active" : ""}`}
            onClick={() => onModeChange("chat")}
            aria-pressed={mode === "chat"}
            title="Chatbot mode"
          >
            <span className="sidebar-icon">💬</span>
            {!collapsed && <span>Chatbot</span>}
          </button>
        </div>
      </div>

      <div className="sidebar-section">
        {!collapsed && <span className="sidebar-section-label">Current Session</span>}
        <div className="sidebar-item sidebar-session-indicator">
          <span className={`session-dot ${isSessionActive ? "session-active" : ""}`} />
          {!collapsed && <span>{isSessionActive ? "Active conversation" : "No active session"}</span>}
        </div>
      </div>

      <div className="sidebar-section">
        {!collapsed && <span className="sidebar-section-label">Documents</span>}

        <button
          className="sidebar-item"
          onClick={handleAddDocumentClick}
          disabled={uploadStatus === "uploading"}
        >
          <span className="sidebar-icon">⇪</span>
          {!collapsed && (
            <span className={uploadStatus === "uploading" ? "sidebar-upload-cycling" : ""}>
              {uploadStatus === "uploading" ? UPLOAD_STATUS_MESSAGES[uploadMessageIndex] : "Add Source"}
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          hidden
          onChange={handleFileSelected}
        />

        {!collapsed && uploadStatus === "error" && (
          <p className="sidebar-doc-error">{uploadError}</p>
        )}

        {!collapsed && documents.length > 0 && (
          <ul className="sidebar-doc-list">
            {documents.map((doc) => (
              <li key={doc.doc_id} className="sidebar-doc-item" title={doc.name}>
                <span className="sidebar-doc-name">
                  {doc.name}
                  {doc.status === "processing" && (
                  <span className="sidebar-doc-status">
                    {doc.total_pages > 0
                      ? `Scanning… ${doc.progress_percent}% (${doc.processed_pages}/${doc.total_pages} pages)`
                      : "Starting…"}
                  </span>
                  )}
                  {doc.status === "failed" && (
                    <span className="sidebar-doc-status sidebar-doc-status-failed">Failed</span>
                  )}
                </span>
                <button
                  className="sidebar-doc-remove"
                  onClick={() => handleRemoveDocument(doc.doc_id)}
                  aria-label={`Remove ${doc.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={onOpenSettings}>
          <span className="sidebar-icon">⚙</span>
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}
