import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Avatar } from "../components/Avatar";
import { MarkdownView } from "../components/MarkdownView";
import { Waveform } from "../components/Waveform";
import type { ChatMessage, InteractionState } from "../types";

interface TalkViewProps {
  messages: ChatMessage[];
  state: InteractionState;
  error: string | null;
  busy: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  speechListening: boolean;
  speechTranscript: string;
  speechSupported: boolean;
  speechError: string | null;
  sessionTitle: string;
  storageStatus: "saved" | "saving" | "error";
  suggestedQuestions: string[];
  onToggleMic: () => void;
  onStopSpeaking: () => void;
  onReplay: () => void;
  onAsk: (question: string) => Promise<void>;
  onStartNewSession: () => void;
  onResetSpeechTranscript: () => void;
}

function stateLabel(state: InteractionState, listening: boolean): string {
  if (listening) return "Listening to your voice…";
  switch (state) {
    case "thinking":
      return "Thinking & retrieving verified facts…";
    case "speaking":
      return "Speaking…";
    case "error":
      return "Something went wrong";
    default:
      return "Ready to speak";
  }
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TalkView({
  messages,
  state,
  error,
  busy,
  audioRef,
  speechListening,
  speechTranscript,
  speechSupported,
  speechError,
  sessionTitle,
  storageStatus,
  suggestedQuestions,
  onToggleMic,
  onStopSpeaking,
  onReplay,
  onAsk,
  onStartNewSession,
  onResetSpeechTranscript,
}: TalkViewProps) {
  // Transcript visibility: HIDDEN BY DEFAULT per requirement
  const [showTranscript, setShowTranscript] = useState(false);
  // Optional fallback typed input: collapsed by default
  const [showTypeFallback, setShowTypeFallback] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);

  // When speech recognition produces text, sync to draft and auto-ask when done
  useEffect(() => {
    if (!speechListening && speechTranscript.trim()) {
      const q = speechTranscript.trim();
      onResetSpeechTranscript();
      void onAsk(q);
    }
  }, [speechListening, speechTranscript, onAsk, onResetSpeechTranscript]);

  // Scroll transcript when new messages arrive and transcript is open
  useEffect(() => {
    if (showTranscript) {
      transcriptBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showTranscript]);

  const handleTextSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || speechListening) return;
    setDraft("");
    await onAsk(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleTextSubmit();
    }
  };

  const hasAssistantMessages = messages.some((m) => m.role === "assistant");
  const hasAnyTurns = messages.length > 0;
  const activeWave = speechListening || state === "speaking" || state === "thinking";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12">
      {/* Session Header / Meta Info */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300">Session:</span>
          <span className="max-w-[260px] truncate text-teal-300 font-mono" title={sessionTitle}>
            {sessionTitle}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${
              storageStatus === "saved"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : storageStatus === "saving"
                ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            }`}
          >
            {storageStatus === "saved" ? "Saved" : storageStatus === "saving" ? "Saving…" : "Storage Error"}
          </span>
        </div>

        <button
          type="button"
          onClick={onStartNewSession}
          className="rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 py-1 text-slate-300 transition hover:border-teal-400/50 hover:text-white"
        >
          + New Session
        </button>
      </div>

      {/* Voice-First Hero Card: Centered Animated Talking Avatar */}
      <section
        className="surface relative overflow-hidden rounded-3xl p-6 sm:p-10 text-center shadow-2xl border border-teal-500/20"
        aria-label="Voice Interaction"
      >
        {/* Subtle background radial glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.08),transparent_70%)]" />

        {/* Live Audio State Indicator */}
        <div className="mb-6 flex items-center justify-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--bg-deep)] px-4 py-1.5 shadow-sm">
            <Waveform active={activeWave} />
            <span className="text-xs font-medium text-slate-200">
              {stateLabel(state, speechListening)}
            </span>
          </div>
        </div>

        {/* Avatar Component */}
        <div className="my-2 flex justify-center">
          <Avatar
            state={state}
            isListening={speechListening}
            audioRef={audioRef}
            onToggleMic={onToggleMic}
            onStopSpeaking={onStopSpeaking}
            onReplay={onReplay}
            canReplay={hasAssistantMessages}
            micSupported={speechSupported}
            busy={busy}
            error={speechError || error}
          />
        </div>

        {/* Live Speech Recognition Transcription Badge */}
        {speechListening ? (
          <div className="mt-4 mx-auto max-w-md rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200 animate-pulse">
            <p className="font-semibold uppercase tracking-wider text-[10px] text-emerald-400">
              Hearing You Speak:
            </p>
            <p className="mt-1 text-sm italic">
              {speechTranscript || "Listening… speak clearly into your microphone"}
            </p>
          </div>
        ) : null}

        {/* Suggested Conversation Starters */}
        <div className="mt-8 border-t border-[var(--line)] pt-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Tap a question or ask with your voice:
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {suggestedQuestions.slice(0, 5).map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy || speechListening}
                onClick={() => void onAsk(q)}
                className="rounded-full border border-[var(--line)] bg-[var(--bg-elevated)] px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-teal-400/50 hover:text-white disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Action Controls Footer: Transcript Toggle & Optional Fallback Type Toggle */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 pt-4 border-t border-[var(--line)] text-xs">
          {/* Transcript Toggle Button */}
          <button
            type="button"
            onClick={() => setShowTranscript((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-deep)] px-3.5 py-2 text-slate-300 transition hover:border-teal-400/50 hover:text-white"
          >
            <span>{showTranscript ? "👁️ Hide Transcript" : "📄 Show Transcript"}</span>
            {hasAnyTurns ? (
              <span className="rounded-full bg-teal-500/20 px-1.5 py-0.2 text-[10px] text-teal-300 font-mono">
                {messages.length}
              </span>
            ) : null}
          </button>

          {/* Optional Type Fallback Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setShowTypeFallback((prev) => !prev);
              if (!showTypeFallback) {
                setTimeout(() => inputRef.current?.focus(), 100);
              }
            }}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-deep)] px-3.5 py-2 text-slate-300 transition hover:border-teal-400/50 hover:text-white"
          >
            <span>⌨️ {showTypeFallback ? "Hide Typed Input" : "Type Question Fallback"}</span>
          </button>
        </div>

        {/* Collapsible Optional Typed Input (Fallback) */}
        {showTypeFallback ? (
          <form
            onSubmit={(event) => void handleTextSubmit(event)}
            className="mt-4 flex flex-col sm:flex-row items-center gap-2 max-w-lg mx-auto"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question here…"
              disabled={busy || speechListening}
              className="w-full min-h-10 rounded-xl border border-[var(--line)] bg-[var(--bg-deep)] px-4 text-xs text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || speechListening || !draft.trim()}
              className="w-full sm:w-auto rounded-xl bg-teal-500 px-4 py-2.5 text-xs font-semibold text-[#042f2e] transition hover:brightness-110 disabled:opacity-40 whitespace-nowrap"
            >
              Submit
            </button>
          </form>
        ) : null}
      </section>

      {/* Optional Transcript Panel (Hidden by default, toggled via Show/Hide Transcript) */}
      {showTranscript ? (
        <section
          className="mt-6 surface rounded-2xl p-5 border border-[var(--line)] transition-all"
          aria-label="Conversation Transcript"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 mb-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                Chronological Conversation Transcript
              </h3>
              <p className="text-[11px] text-[var(--muted)]">
                Recognized speech and answers are updated automatically and auto-saved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTranscript(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕ Close
            </button>
          </div>

          {!hasAnyTurns ? (
            <p className="py-6 text-center text-xs text-[var(--muted)]">
              No speech recorded in this session yet. Speak or select a question to begin.
            </p>
          ) : (
            <div className="flex max-h-96 flex-col gap-3.5 overflow-y-auto pr-1" aria-live="polite">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-3.5 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "ml-auto max-w-[85%] bg-sky-950/40 border border-sky-800/40 text-slate-100"
                      : "mr-auto max-w-[88%] bg-slate-900/90 border border-slate-800 text-slate-200"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    <span className="font-semibold text-teal-400">
                      {m.role === "user" ? "You" : "EchoMind"}
                      {m.mode ? ` · ${m.mode === "llm" ? "Model" : "Fact Retrieval"}` : ""}
                    </span>
                    {m.timestamp ? <span>{formatTime(m.timestamp)}</span> : null}
                  </div>

                  {m.role === "assistant" ? (
                    <MarkdownView content={m.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}

                  {/* Grounded Source References */}
                  {m.references && m.references.length > 0 ? (
                    <div className="mt-2.5 border-t border-[var(--line)] pt-2">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
                        Verified Sources:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {m.references.map((ref, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-300"
                          >
                            <span>📌</span>
                            <span>{ref.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
              <div ref={transcriptBottomRef} />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
