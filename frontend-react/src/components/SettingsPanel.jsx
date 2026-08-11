import { useEffect, useState } from "react";
import { getPersona, setPersona } from "../services/api";

const PRESET_PERSONAS = [
  { label: "Default Assistant", prompt: "" },
  { label: "Teacher", prompt: "Act like a patient school teacher. Ask the student questions one at a time and give simple, encouraging feedback." },
  { label: "Interviewer", prompt: "Act like a professional technical interviewer conducting a mock interview. Ask one question at a time and give brief constructive feedback before moving on." },
  { label: "HR Recruiter", prompt: "Act like a friendly HR recruiter screening a candidate. Ask about background, experience, and motivation." },
  { label: "Coding Mentor", prompt: "Act like a supportive coding mentor. Explain concepts using simple, practical examples." },
];

export default function SettingsPanel({ isOpen, onClose }) {
  const [promptText, setPromptText] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [status, setStatus] = useState(""); // "", "saving", "saved", "error"

  useEffect(() => {
    if (!isOpen) return;
    getPersona()
      .then((data) => {
        setPromptText(data.persona_prompt || "");
        setSavedPrompt(data.persona_prompt || "");
      })
      .catch((err) => console.error("Failed to load persona:", err));
  }, [isOpen]);

  const handleSave = async () => {
    setStatus("saving");
    try {
      await setPersona(promptText);
      setSavedPrompt(promptText);
      setStatus("saved");
      setTimeout(() => setStatus(""), 1500);
    } catch (err) {
      console.error("Failed to save persona:", err);
      setStatus("error");
    }
  };

  const handleReset = async () => {
    setStatus("saving");
    try {
      await setPersona(""); // "" = default assistant, no custom persona
      setPromptText("");
      setSavedPrompt("");
      setStatus("saved");
      setTimeout(() => setStatus(""), 1500);
    } catch (err) {
      console.error("Failed to reset persona:", err);
      setStatus("error");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <label className="settings-label">Persona Prompt</label>
        <p className="settings-hint">
          Describe how the assistant should behave. This applies to new conversations.
        </p>

        <div className="settings-presets">
          {PRESET_PERSONAS.map((preset) => (
            <button
              key={preset.label}
              className="preset-chip"
              onClick={() => setPromptText(preset.prompt)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <textarea
          className="settings-textarea"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="e.g. Act like a technical interviewer conducting a mock interview."
          rows={6}
        />

        <div className="settings-actions">
          <button className="settings-btn-secondary" onClick={handleReset}>
            Reset
          </button>
          <button className="settings-btn-primary" onClick={handleSave} disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>

        {status === "saved" && <p className="settings-status settings-status-success">Saved successfully.</p>}
        {status === "error" && <p className="settings-status settings-status-error">Failed to save. Try again.</p>}
      </div>
    </div>
  );
}