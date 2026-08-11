import { useEffect, useState } from "react";
import { AgentAudioVisualizerAura } from "./agent-audio-visualizer-aura";

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export default function AuraOrb({ status, amplitude }) {
  const [hue, setHue] = useState(190);

  useEffect(() => {
    let raf;
    const cycleSpeed = { idle: 0.02, listening: 0.05, speaking: 0.15, processing: 0.25 }[status] || 0.05;
    const tick = () => {
      setHue((h) => (h + cycleSpeed) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const color = hslToHex(hue, 85, 60);

  return (
    <div className="aura-wrapper">
      <AgentAudioVisualizerAura size="xl" status={status} amplitude={amplitude} color={color} colorShift={0.45} />
    </div>
  );
}