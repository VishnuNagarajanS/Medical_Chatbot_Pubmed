import { useEffect, useRef } from "react";

export default function LiveCaption({ text, role }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [text]);

  if (!text) return null;

  return (
    <div className={`live-caption live-caption-${role}`}>
      <span className="live-caption-label">{role === "user" ? "You" : "Aura"}</span>
      <div className="live-caption-scroll" ref={scrollRef}>
        <p className="live-caption-text">
          {text}
          <span className="live-caption-cursor">▍</span>
        </p>
      </div>
    </div>
  );
}