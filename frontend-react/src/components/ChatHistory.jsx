export default function ChatHistory({ messages }) {
    if (messages.length === 0) {
      return (
        <div className="chat-history-empty">
          <p>Your conversation will appear here once you start speaking.</p>
        </div>
      );
    }
  
    return (
      <div className="chat-history">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-bubble chat-bubble-${msg.role}`}>
            <span className="chat-bubble-label">
              {msg.role === "user" ? "You" : "Assistant"}
            </span>
            <p className="chat-bubble-text">{msg.text}</p>
          </div>
        ))}
      </div>
    );
  }