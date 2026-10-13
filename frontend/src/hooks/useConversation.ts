import { useCallback, useEffect, useRef, useState } from "react";

import { sendChat, synthesizeSpeech } from "../services/api";
import {
  createSession,
  getOrCreateActiveSession,
  getSession,
  saveTurn,
  setActiveSessionId,
} from "../services/conversationHistory";
import type {
  ChatHistoryItem,
  ChatMessage,
  ConversationTurn,
  InteractionState,
} from "../types";
import { stripMarkdownForSpeech } from "../utils/markdown";

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

  // Session & persistence state
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionTitle, setSessionTitle] = useState<string>("New Conversation");
  const [storageStatus, setStorageStatus] = useState<"saved" | "saving" | "error">("saved");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef(0);
  const objectUrlsRef = useRef<string[]>([]);
  const lastSpokenTextRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string>("");

  activeSessionIdRef.current = sessionId;

  // Initialize or restore active session from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;

    getOrCreateActiveSession()
      .then((session) => {
        if (cancelled) return;
        setSessionId(session.id);
        setSessionTitle(session.title);
        // Map stored turns to ChatMessage list
        const loadedMessages: ChatMessage[] = session.turns.map((t) => ({
          id: t.id,
          role: t.role,
          content: t.content,
          timestamp: t.timestamp,
          references: t.references,
          mode: t.mode,
          audioUrl: t.audioUrl,
        }));
        setMessages(loadedMessages);
      })
      .catch((err) => {
        console.warn("Failed to load active session:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
        // Autoplay may be blocked; text remains available.
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
      const spokenText = stripMarkdownForSpeech(text).slice(0, 1200);
      try {
        const blob = await synthesizeSpeech(spokenText);
        if (requestId !== requestIdRef.current) return;
        await playAudio(blob, requestId);
      } catch {
        if (requestId !== requestIdRef.current) return;
        try {
          setState("speaking");
          await speakWithBrowser(spokenText);
          if (requestId === requestIdRef.current) {
            setError(
              "Neural TTS was unavailable, so browser voice fallback was used.",
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

      const now = Date.now();
      const userMessageId = uid();
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: trimmed,
        timestamp: now,
      };

      setMessages((prev) => [...prev, userMessage]);

      // Ensure active session exists and persist user turn
      let currentSessId = activeSessionIdRef.current;
      if (!currentSessId) {
        try {
          const fresh = await createSession(trimmed);
          currentSessId = fresh.id;
          setSessionId(fresh.id);
          setSessionTitle(fresh.title);
        } catch {
          currentSessId = `temp-${now}`;
        }
      }

      setStorageStatus("saving");
      const userTurn: ConversationTurn = {
        id: userMessageId,
        role: "user",
        content: trimmed,
        timestamp: now,
        status: "completed",
      };

      saveTurn(currentSessId, userTurn)
        .then((updated) => {
          setSessionTitle(updated.title);
          setStorageStatus("saved");
        })
        .catch(() => setStorageStatus("error"));

      // Bound history to recent 6 turns for LLM request
      const history: ChatHistoryItem[] = messages
        .slice(-6)
        .map((m) => ({
          role: m.role,
          content: m.content.trim().slice(0, 2000),
        }))
        .filter((m) => m.content.length > 0);

      try {
        const response = await sendChat(trimmed, history);
        if (requestId !== requestIdRef.current) return;

        const assistantTime = Date.now();
        const assistantMessageId = uid();
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: response.answer,
          timestamp: assistantTime,
          references: response.references,
          mode: response.mode,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Auto-save assistant turn to IndexedDB
        const assistantTurn: ConversationTurn = {
          id: assistantMessageId,
          role: "assistant",
          content: response.answer,
          timestamp: assistantTime,
          status: "completed",
          references: response.references,
          mode: response.mode,
        };

        saveTurn(currentSessId, assistantTurn)
          .then(() => setStorageStatus("saved"))
          .catch(() => setStorageStatus("error"));

        await speakAnswer(response.answer, requestId);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Something went wrong.");

        // Record error status turn in session
        const errorTurn: ConversationTurn = {
          id: uid(),
          role: "assistant",
          content: "Request failed to generate response.",
          timestamp: Date.now(),
          status: "error",
        };
        saveTurn(currentSessId, errorTurn).catch(() => {});
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

  /**
   * Start a brand new conversation session.
   */
  const startNewSession = useCallback(async () => {
    stopSpeaking();
    try {
      const fresh = await createSession();
      setSessionId(fresh.id);
      setSessionTitle(fresh.title);
      setMessages([]);
      setError(null);
    } catch (err) {
      console.warn("Failed to create new session:", err);
    }
  }, [stopSpeaking]);

  /**
   * Load an existing historical session into view.
   */
  const loadSession = useCallback(
    async (id: string) => {
      stopSpeaking();
      try {
        const session = await getSession(id);
        if (!session) return;
        setActiveSessionId(session.id);
        setSessionId(session.id);
        setSessionTitle(session.title);
        const mapped: ChatMessage[] = session.turns.map((t) => ({
          id: t.id,
          role: t.role,
          content: t.content,
          timestamp: t.timestamp,
          references: t.references,
          mode: t.mode,
          audioUrl: t.audioUrl,
        }));
        setMessages(mapped);
        setError(null);
      } catch (err) {
        console.warn("Failed to load session:", err);
      }
    },
    [stopSpeaking],
  );

  return {
    messages,
    state,
    error,
    busy,
    audioRef,
    sessionId,
    sessionTitle,
    storageStatus,
    ask,
    stopSpeaking,
    replayLast,
    startNewSession,
    loadSession,
    setState,
    setError,
  };
}
