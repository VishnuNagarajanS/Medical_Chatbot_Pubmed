import { useEffect, useState } from "react";
import { deleteConversationHistory, getConversationHistory } from "../services/api";

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConversationHistoryModal({ isOpen, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setLoading(true);
    setError("");
    setConfirmDeleteId(null);
    getConversationHistory()
      .then((data) => {
        if (cancelled) return;
        const list = data.conversations || [];
        setConversations(list);
        // Keep every entry collapsed by default — the user expands whichever
        // one they want to read instead of always having to collapse the
        // first (most recent) one first.
        setExpandedId(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load conversation history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeleteClick = (e, sessionId) => {
    e.stopPropagation(); // don't toggle expand/collapse when hitting the trash icon
    setConfirmDeleteId(sessionId);
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

  const handleConfirmDelete = async (e, sessionId) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      await deleteConversationHistory(sessionId);
      setConversations((prev) => prev.filter((c) => c.session_id !== sessionId));
      if (expandedId === sessionId) setExpandedId(null);
    } catch (err) {
      console.error("Failed to delete conversation:", err);
      setError(err.message || "Failed to delete conversation.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h2>Past Conversations</h2>
          <button className="history-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {loading && <p className="history-status">Loading…</p>}
        {!loading && error && <p className="history-status history-status-error">{error}</p>}
        {!loading && !error && conversations.length === 0 && (
          <p className="history-status">No conversations yet. Start one to see it here.</p>
        )}

        <div className="history-list">
          {conversations.map((conv) => {
            const isExpanded = expandedId === conv.session_id;
            const firstUserMsg = conv.messages.find((m) => m.role === "user")?.content;

            return (
              <div key={conv.session_id} className="history-item">
                <div
                  className="history-item-header"
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(isExpanded ? null : conv.session_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(isExpanded ? null : conv.session_id);
                    }
                  }}
                >
                  <div className="history-item-meta">
                    <span className="history-item-time">{formatTime(conv.started_at)}</span>
                    <span className="history-item-preview">
                      {firstUserMsg || "Conversation"}
                    </span>
                  </div>

                  <div className="history-item-actions">
                    {confirmDeleteId === conv.session_id ? (
                      <span className="history-delete-confirm">
                        <button
                          className="history-delete-confirm-btn"
                          onClick={(e) => handleConfirmDelete(e, conv.session_id)}
                          disabled={deletingId === conv.session_id}
                        >
                          {deletingId === conv.session_id ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          className="history-delete-cancel-btn"
                          onClick={handleCancelDelete}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        className="history-item-delete"
                        onClick={(e) => handleDeleteClick(e, conv.session_id)}
                        aria-label="Delete conversation"
                        title="Delete conversation"
                      >
                        🗑
                      </button>
                    )}
                    <span className="history-item-caret">{isExpanded ? "▾" : "▸"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="history-chat">
                    {conv.messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`chat-bubble chat-bubble-${
                          msg.role === "user" ? "user" : "assistant"
                        }`}
                      >
                        <span className="chat-bubble-label">
                          {msg.role === "user" ? "You" : "Aura"}
                        </span>
                        <p className="chat-bubble-text">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
