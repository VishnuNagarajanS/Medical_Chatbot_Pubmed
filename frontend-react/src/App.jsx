import { useState } from "react";
import Sidebar from "./components/Sidebar";
import AuraOrb from "./components/AuraOrb";
import LiveCaption from "./components/LiveCaption";
import SettingsPanel from "./components/SettingsPanel";
import ConversationHistoryModal from "./components/ConversationHistoryModal";
import ChatMode from "./components/ChatMode";
import { useConversation } from "./hooks/useConversation";
import { useTextChat } from "./hooks/useTextChat";

const STATUS_TEXT = {
  idle: "Click \"Start Conversation\" to start",
  listening: "Listening… speak naturally",
  speaking: "Recording your voice…",
  processing: "Thinking…",
};

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // "voice" = existing voice-agent experience, "chat" = new text chatbot mode.
  // Settings (persona) and uploaded documents are global/backend-side, so
  // switching modes doesn't need to reset or duplicate them.
  const [mode, setMode] = useState("voice");

  const {
    errorMessage,
    isSessionActive,
    vadStatus,
    amplitude,
    audioPlayerRef,
    captionText,
    captionRole,
    beginConversation,
    endCurrentConversation,
  } = useConversation();

  const {
    messages: chatMessages,
    isSending: isChatSending,
    errorMessage: chatErrorMessage,
    sendChatMessage,
    newChatConversation,
  } = useTextChat();

  // "New Conversation" resets whichever mode is currently active.
  // Voice mode: only ENDS the current session (if one is active) and
  // returns the UI to the idle/Start state — it must never auto-start a new
  // session or trigger listening on its own. The user has to explicitly
  // click "Start Conversation" to begin the next one.
  // Chat mode: clears the message thread and ends the backend session so
  // the next message starts a fresh one.
  const handleNewConversation = async () => {
    if (mode === "voice") {
      if (isSessionActive) {
        await endCurrentConversation();
      }
    } else {
      await newChatConversation();
    }
  };

  const handleStartConversation = async () => {
    await beginConversation();
  };

  const handleModeChange = async (nextMode) => {
    if (nextMode === mode) return;
    // Leaving voice mode while a session is live should stop listening/
    // playback cleanly rather than leaving it running in the background.
    if (mode === "voice" && isSessionActive) {
      await endCurrentConversation();
    }
    setMode(nextMode);
  };

  return (
    <div className="app-layout">
      <Sidebar
        onNewConversation={handleNewConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        isSessionActive={mode === "voice" ? isSessionActive : chatMessages.length > 0}
        mode={mode}
        onModeChange={handleModeChange}
      />

      <main className="main-content">
        <header className="main-header">
          <div className="main-header-text">
            <h1 className="main-title-display">Aura</h1>
            <p className="main-subtitle">
              {mode === "voice"
                ? (isSessionActive ? "Always listening" : "Ready to start")
                : "Chatbot mode"}
            </p>
          </div>

          <button
            className="history-trigger"
            onClick={() => setHistoryOpen(true)}
            aria-label="View past conversations"
            title="Conversation history"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        {mode === "voice" ? (
          <>
            <div className="voice-stage">
              <AuraOrb status={isSessionActive ? vadStatus : "idle"} amplitude={amplitude} />
              <p className="voice-status-text">
                {isSessionActive ? STATUS_TEXT[vadStatus] || STATUS_TEXT.idle : STATUS_TEXT.idle}
              </p>
              {errorMessage && <p className="voice-error-text">{errorMessage}</p>}
              {!isSessionActive && (
                <button
                  className="start-conversation-btn"
                  onClick={handleStartConversation}
                >
                  Start Conversation
                </button>
              )}
            </div>

            <LiveCaption text={captionText} role={captionRole} />

            {/* hidden audio element used to play AI responses */}
            <audio ref={audioPlayerRef} hidden />
          </>
        ) : (
          <ChatMode
            messages={chatMessages}
            isSending={isChatSending}
            errorMessage={chatErrorMessage}
            onSend={sendChatMessage}
          />
        )}
      </main>

      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConversationHistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
