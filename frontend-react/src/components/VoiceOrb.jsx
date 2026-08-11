export default function VoiceOrb({ status, amplitude }) {
    // scale the orb based on live amplitude (subtle idle pulse -> bigger when loud)
    const scale = 1 + Math.min(amplitude * 4, 0.6);
  
    const stateClass = {
      idle: "orb-idle",
      listening: "orb-listening",
      speaking: "orb-speaking",
      processing: "orb-processing",
    }[status] || "orb-idle";
  
    return (
      <div className="voice-orb-wrapper">
        <div
          className={`voice-orb ${stateClass}`}
          style={{ transform: `scale(${scale})` }}
        >
          <div className="voice-orb-core" />
          <div className="voice-orb-ring voice-orb-ring-1" />
          <div className="voice-orb-ring voice-orb-ring-2" />
        </div>
      </div>
   
  );
  }