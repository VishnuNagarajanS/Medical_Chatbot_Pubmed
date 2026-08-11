import { useCallback, useEffect, useRef, useState } from "react";

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useLiveTranscript() {
  const [liveText, setLiveText] = useState("");
  const recognitionRef = useRef(null);
  const isActiveRef = useRef(false);

  const start = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      console.warn("Speech Recognition API not supported in this browser.");
      return;
    }
    if (isActiveRef.current) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        interim += event.results[i][0].transcript;
      }
      setLiveText(interim);
    };

    recognition.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("Speech recognition error:", e.error);
      }
    };

    recognition.onend = () => {
      // browser auto-stops after a pause; restart if we're still supposed to be listening
      if (isActiveRef.current) {
        try {
          recognition.start();
        } catch (err) {
          // ignore "already started" race condition
        }
      }
    };

    recognitionRef.current = recognition;
    isActiveRef.current = true;
    try {
      recognition.start();
    } catch (err) {
      console.warn("Could not start speech recognition:", err);
    }
  }, []);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setLiveText("");
  }, []);

  const clear = useCallback(() => setLiveText(""), []);

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { liveText, start, stop, clear };
}