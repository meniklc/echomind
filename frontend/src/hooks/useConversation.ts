import { useCallback, useEffect, useRef, useState } from "react";

import { sendChat, synthesizeSpeech } from "../services/api";
import type { ChatHistoryItem, ChatMessage, InteractionState } from "../types";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      reject(new Error("Browser speech synthesis unavailable"));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("Browser speech synthesis failed"));
    window.speechSynthesis.speak(utterance);
  });
}

export function useConversation() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<InteractionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef(0);
  const objectUrlsRef = useRef<string[]>([]);
  const lastSpokenTextRef = useRef<string | null>(null);

  const stopSpeaking = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setState((prev) => (prev === "speaking" ? "idle" : prev));
  }, []);

  const cleanupUrls = useCallback(() => {
    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
  }, []);

  useEffect(() => cleanupUrls, [cleanupUrls]);

  const playAudio = useCallback(
    async (blob: Blob, requestId: number) => {
      if (requestId !== requestIdRef.current) return;
      const objectUrl = URL.createObjectURL(blob);
      objectUrlsRef.current.push(objectUrl);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.src = objectUrl;

      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].role === "assistant") {
            next[i] = { ...next[i], audioUrl: objectUrl };
            break;
          }
        }
        return next;
      });

      try {
        setState("speaking");
        await audio.play();
        await new Promise<void>((resolve) => {
          const onEnded = () => {
            audio.removeEventListener("ended", onEnded);
            resolve();
          };
          audio.addEventListener("ended", onEnded);
        });
      } catch {
        // Autoplay may be blocked; captions remain available.
      } finally {
        if (requestId === requestIdRef.current) {
          setState("idle");
        }
      }
    },
    [],
  );

  const speakAnswer = useCallback(
    async (text: string, requestId: number) => {
      lastSpokenTextRef.current = text;
      try {
        const blob = await synthesizeSpeech(text.slice(0, 1200));
        if (requestId !== requestIdRef.current) return;
        await playAudio(blob, requestId);
      } catch {
        if (requestId !== requestIdRef.current) return;
        try {
          setState("speaking");
          await speakWithBrowser(text);
          if (requestId === requestIdRef.current) {
            setError(
              "Neural TTS was unavailable, so the browser voice fallback was used. Captions remain available.",
            );
          }
        } catch {
          if (requestId === requestIdRef.current) {
            setError("Speech unavailable. Text reply is still available.");
          }
        } finally {
          if (requestId === requestIdRef.current) {
            setState("idle");
          }
        }
      }
    },
    [playAudio],
  );

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      stopSpeaking();
      const requestId = ++requestIdRef.current;
      setBusy(true);
      setError(null);
      setState("thinking");

      const userMessage: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMessage]);

      const history: ChatHistoryItem[] = messages
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const response = await sendChat(trimmed, history);
        if (requestId !== requestIdRef.current) return;

        const assistantMessage: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: response.answer,
          references: response.references,
          mode: response.mode,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        await speakAnswer(response.answer, requestId);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (requestId === requestIdRef.current) {
          setBusy(false);
          setState((prev) => (prev === "thinking" ? "idle" : prev));
        }
      }
    },
    [busy, messages, speakAnswer, stopSpeaking],
  );

  const replayLast = useCallback(async () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;

    if (last.audioUrl && audioRef.current) {
      stopSpeaking();
      audioRef.current.src = last.audioUrl;
      setState("speaking");
      try {
        await audioRef.current.play();
        await new Promise<void>((resolve) => {
          const audio = audioRef.current!;
          const onEnded = () => {
            audio.removeEventListener("ended", onEnded);
            resolve();
          };
          audio.addEventListener("ended", onEnded);
        });
      } catch {
        setError("Could not replay audio. Try asking again.");
      } finally {
        setState("idle");
      }
      return;
    }

    await speakAnswer(last.content, requestIdRef.current);
  }, [messages, speakAnswer, stopSpeaking]);

  return {
    messages,
    state,
    error,
    busy,
    ask,
    stopSpeaking,
    replayLast,
    setState,
    setError,
  };
}
