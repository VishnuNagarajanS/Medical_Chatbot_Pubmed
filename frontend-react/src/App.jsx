import { useState } from "react";
import Sidebar from "./components/Sidebar";
import AuraOrb from "./components/AuraOrb";
import LiveCaption from "./components/LiveCaption";
import SettingsPanel from "./components/SettingsPanel";
import ConversationHistoryModal from "./components/ConversationHistoryModal";
import { useConversation } from "./hooks/useConversation";

const STATUS_TEXT = {
  idle: "Click \"Start Conversation\" to start",
  listening: "Listening… speak naturally",
  speaking: "Recording your voice…",
  processing: "Thinking…",
};

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  // "New Conversation" only ENDS the current session (if one is active) and
  // returns the UI to the idle/Start state — it must never auto-start a new
  // session or trigger listening on its own. The user has to explicitly
  // click "Start Conversation" to begin the next one.
  const handleNewConversation = async () => {
    if (isSessionActive) {
      await endCurrentConversation();
    }
  };

  const handleStartConversation = async () => {
    await beginConversation();
  };

  return (
    <div className="app-layout">
      <Sidebar
        onNewConversation={handleNewConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        isSessionActive={isSessionActive}
      />

      <main className="main-content">
        <header className="main-header">
          <div className="main-header-text">
            <h1 className="main-title-display">Aura</h1>
            <p className="main-subtitle">
              {isSessionActive ? "Always listening" : "Ready to start"}
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
      </main>

      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConversationHistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
