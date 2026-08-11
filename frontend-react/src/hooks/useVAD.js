import { useCallback, useEffect, useRef, useState } from "react";

const SILENCE_THRESHOLD = 0.05;
const SILENCE_DURATION_MS = 2500; // give more room for natural pauses before cutting off
const MIN_SPEECH_DURATION_MS = 800;
/**
 * Hands-free voice activity detection.
 * Continuously listens to the mic, auto-detects speech start/stop,
 * and calls onSpeechCaptured(audioBlob) when a speech segment ends.
 */
export function useVAD(onSpeechCaptured) {
  const [status, setStatus] = useState("idle"); // idle | listening | speaking | processing
  const [amplitude, setAmplitude] = useState(0);

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const rafRef = useRef(null);

  const speechStartTimeRef = useRef(null);
  const silenceStartTimeRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isActiveRef = useRef(false);
  const isProcessingRef = useRef(false); // flag to prevent new speech detection while agent is speaking

  const stopRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      if (blob.size > 0) {
        setStatus("processing");
        isProcessingRef.current = true; // Mark as processing to prevent new speech detection
        onSpeechCaptured(blob);
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
  }, [onSpeechCaptured]);

  const monitorLoop = useCallback(() => {
    if (!isActiveRef.current || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);

    // compute RMS amplitude (0 to ~1)
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    setAmplitude(rms);

    const now = Date.now();

    // Skip speech detection if currently processing (agent speaking)
    if (isProcessingRef.current) {
      rafRef.current = requestAnimationFrame(monitorLoop);
      return;
    }

    if (rms > SILENCE_THRESHOLD) {
      // sound detected
      if (!isSpeakingRef.current) {
        isSpeakingRef.current = true;
        speechStartTimeRef.current = now;
        setStatus("speaking");
        startRecorder();
      }
      silenceStartTimeRef.current = null;
    } else {
      // silence detected
      if (isSpeakingRef.current) {
        if (silenceStartTimeRef.current === null) {
          silenceStartTimeRef.current = now;
        }
        const silenceDuration = now - silenceStartTimeRef.current;
        const speechDuration = now - speechStartTimeRef.current;

        if (silenceDuration >= SILENCE_DURATION_MS && speechDuration >= MIN_SPEECH_DURATION_MS) {
          isSpeakingRef.current = false;
          silenceStartTimeRef.current = null;
          stopRecorder();
        }
      }
    }

    rafRef.current = requestAnimationFrame(monitorLoop);
  }, [startRecorder, stopRecorder]);

  const start = useCallback(async () => {
    if (isActiveRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    isActiveRef.current = true;
    setStatus("listening");
    monitorLoop();
  }, [monitorLoop]);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    isSpeakingRef.current = false;
    silenceStartTimeRef.current = null;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopRecorder();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus("idle");
    setAmplitude(0);
  }, [stopRecorder]);

  // resume listening automatically after processing finishes
  const resumeListening = useCallback(() => {
    if (isActiveRef.current) {
      isProcessingRef.current = false; // Clear processing flag to allow new speech detection
      setStatus("listening");
    }
  }, []);

  useEffect(() => {
    return () => stop(); // cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, amplitude, start, stop, resumeListening };
}