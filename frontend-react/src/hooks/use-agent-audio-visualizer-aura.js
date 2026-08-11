import { useEffect, useRef, useState, useCallback } from 'react';
import { animate, useMotionValue, useMotionValueEvent } from 'motion/react';

const DEFAULT_SPEED = 10;
const DEFAULT_AMPLITUDE = 2;
const DEFAULT_FREQUENCY = 0.5;
const DEFAULT_SCALE = 0.2;
const DEFAULT_BRIGHTNESS = 1.5;
const DEFAULT_TRANSITION = { duration: 0.5, ease: 'easeOut' };
const DEFAULT_PULSE_TRANSITION = {
  duration: 0.35,
  ease: 'easeOut',
  repeat: Infinity,
  repeatType: 'mirror',
};

function useAnimatedValue(initialValue) {
  const [value, setValue] = useState(initialValue);
  const motionValue = useMotionValue(initialValue);
  const controlsRef = useRef(null);
  useMotionValueEvent(motionValue, 'change', (v) => setValue(v));

  const animateFn = useCallback((targetValue, transition) => {
    controlsRef.current = animate(motionValue, targetValue, transition);
  }, [motionValue]);

  return { value, motionValue, controls: controlsRef, animate: animateFn };
}

/**
 * Adapted for our custom voice pipeline (no LiveKit Room/audioTrack dependency).
 * status: "idle" | "listening" | "speaking" | "processing"
 * amplitude: 0-1 live mic amplitude from our VAD hook
 */
export function useAgentAudioVisualizerAura(status, amplitude = 0) {
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const {
    value: scale,
    animate: animateScale,
    motionValue: scaleMotionValue,
  } = useAnimatedValue(DEFAULT_SCALE);
  const { value: shaderAmplitude, animate: animateAmplitude } = useAnimatedValue(DEFAULT_AMPLITUDE);
  const { value: frequency, animate: animateFrequency } = useAnimatedValue(DEFAULT_FREQUENCY);
  const { value: brightness, animate: animateBrightness } = useAnimatedValue(DEFAULT_BRIGHTNESS);

  useEffect(() => {
    switch (status) {
      case 'idle':
        setSpeed(10);
        animateScale(0.2, DEFAULT_TRANSITION);
        animateAmplitude(1.2, DEFAULT_TRANSITION);
        animateFrequency(0.4, DEFAULT_TRANSITION);
        animateBrightness(1.0, DEFAULT_TRANSITION);
        return;
      case 'listening':
        setSpeed(20);
        animateScale(0.3, { type: 'spring', duration: 1.0, bounce: 0.35 });
        animateAmplitude(1.0, DEFAULT_TRANSITION);
        animateFrequency(0.7, DEFAULT_TRANSITION);
        animateBrightness([1.5, 2.0], DEFAULT_PULSE_TRANSITION);
        return;
      case 'processing':
        setSpeed(30);
        animateScale(0.3, DEFAULT_TRANSITION);
        animateAmplitude(0.5, DEFAULT_TRANSITION);
        animateFrequency(1, DEFAULT_TRANSITION);
        animateBrightness([0.5, 2.5], DEFAULT_PULSE_TRANSITION);
        return;
      case 'speaking':
        setSpeed(70);
        animateScale(0.3, DEFAULT_TRANSITION);
        animateAmplitude(0.75, DEFAULT_TRANSITION);
        animateFrequency(1.25, DEFAULT_TRANSITION);
        animateBrightness(1.5, DEFAULT_TRANSITION);
        return;
      default:
        return;
    }
  }, [status, animateScale, animateAmplitude, animateFrequency, animateBrightness]);

  useEffect(() => {
    if (status === 'speaking' && amplitude > 0 && !scaleMotionValue.isAnimating()) {
      animateScale(0.2 + 0.2 * Math.min(amplitude, 1), { duration: 0 });
    }
  }, [status, amplitude, scaleMotionValue, animateScale]);

  return {
    speed,
    scale,
    amplitude: shaderAmplitude,
    frequency,
    brightness,
  };
}