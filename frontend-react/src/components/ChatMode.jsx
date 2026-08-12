import { useEffect, useRef, useState } from "react";

export default function ChatMode({ messages, isSending, errorMessage, onSend }) {
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isSending]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setInputValue(e.target.value);
    // auto-grow textarea up to a reasonable cap
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="chat-mode">
      <div className="chat-mode-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-mode-empty">
            <p>Ask me anything, or upload a document from the sidebar and I'll answer questions about it.</p>
          </div>
        ) : (
          <div className="chat-mode-messages">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chat-mode-row ${msg.role === "user" ? "chat-mode-row-user" : "chat-mode-row-ai"}`}
              >
                <div className={`chat-mode-avatar ${msg.role === "user" ? "chat-mode-avatar-user" : "chat-mode-avatar-ai"}`}>
                  {msg.role === "user" ? "U" : "AI"}
                </div>
                <div className={`chat-mode-bubble ${msg.role === "user" ? "chat-mode-bubble-user" : "chat-mode-bubble-ai"}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="chat-mode-row chat-mode-row-ai">
                <div className="chat-mode-avatar chat-mode-avatar-ai">AI</div>
                <div className="chat-mode-bubble chat-mode-bubble-ai chat-mode-typing">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {errorMessage && <p className="chat-mode-error">{errorMessage}</p>}

      <div className="chat-mode-input-bar">
        <textarea
          ref={textareaRef}
          className="chat-mode-input"
          value={inputValue}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
        />
        <button
          className="chat-mode-send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || isSending}
          aria-label="Send message"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 12L20 4L14 20L11 13L4 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
