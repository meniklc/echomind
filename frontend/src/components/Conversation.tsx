import { useEffect, useRef, useState, type FormEvent } from "react";

import { useConversation } from "../hooks/useConversation";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import type { InteractionState } from "../types";
import { Waveform } from "./Waveform";

interface ConversationProps {
  suggestedQuestions: string[];
  focusToken: number;
}

function stateLabel(state: InteractionState, listening: boolean): string {
  if (listening) return "Listening…";
  switch (state) {
    case "thinking":
      return "Thinking…";
    case "speaking":
      return "Speaking…";
    case "error":
      return "Something went wrong";
    default:
      return "Ready";
  }
}

export function Conversation({ suggestedQuestions, focusToken }: ConversationProps) {
  const {
    messages,
    state,
    error,
    busy,
    ask,
    stopSpeaking,
    replayLast,
    setState,
    setError,
  } = useConversation();
  const speech = useSpeechRecognition();
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusToken > 0) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inputRef.current?.focus();
    }
  }, [focusToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, state]);

  useEffect(() => {
    if (!speech.listening && speech.transcript) {
      setDraft(speech.transcript);
    }
  }, [speech.listening, speech.transcript]);

  useEffect(() => {
    if (speech.error) {
      setError(speech.error);
      setState("error");
    }
  }, [speech.error, setError, setState]);

  const onSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || speech.listening) return;
    setDraft("");
    speech.reset();
    await ask(text);
  };

  const toggleMic = () => {
    if (busy) return;
    if (speech.listening) {
      speech.stop();
      return;
    }
    stopSpeaking();
    speech.start();
  };

  const activeWave = speech.listening || state === "speaking" || state === "thinking";

  return (
    <section
      id="conversation"
      ref={panelRef}
      className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20"
    >
      <div className="mb-8 max-w-2xl">
        <p className="font-display text-sm font-semibold tracking-[0.18em] text-[var(--accent)]">
          CONVERSATION
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-white md:text-4xl">
          Speak with the digital twin
        </h2>
        <p className="mt-3 text-[var(--muted)]">
          Use your microphone or type a question. Answers appear as captions and play as speech when available.
        </p>
      </div>

      <div className="surface overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-4 md:px-6">
          <Waveform
            active={activeWave}
            label={stateLabel(state, speech.listening)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={stopSpeaking}
              disabled={state !== "speaking"}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
            >
              Stop speaking
            </button>
            <button
              type="button"
              onClick={() => void replayLast()}
              disabled={!messages.some((m) => m.role === "assistant") || busy}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
            >
              Replay
            </button>
          </div>
        </div>

        <div
          className="flex max-h-[28rem] min-h-[18rem] flex-col gap-4 overflow-y-auto px-4 py-5 md:px-6"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No messages yet. Try a suggested question below, or ask anything about the verified portfolio.
            </p>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[80%] ${
                  message.role === "user"
                    ? "ml-auto bg-[rgba(56,189,248,0.12)] text-slate-100"
                    : "mr-auto bg-[rgba(15,23,42,0.9)] text-slate-200"
                }`}
              >
                <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  {message.role === "user" ? "You" : "EchoMind"}
                  {message.mode ? ` · ${message.mode === "llm" ? "model" : "fact retrieval"}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.references && message.references.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {message.references.map((ref) => (
                      <li key={`${ref.type}-${ref.label}-${ref.url || ref.section}`}>
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-full border border-[var(--line)] px-2.5 py-1 text-xs"
                          >
                            {ref.label}
                          </a>
                        ) : (
                          <span className="inline-flex rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]">
                            {ref.label}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <div className="border-t border-[var(--line)] bg-[rgba(251,113,133,0.08)] px-4 py-3 text-sm text-[var(--danger)] md:px-6" role="alert">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-4 md:flex-row md:items-center md:px-6"
        >
          <button
            type="button"
            onClick={toggleMic}
            disabled={busy || !speech.supported}
            aria-pressed={speech.listening}
            title={
              speech.supported
                ? speech.listening
                  ? "Stop listening"
                  : "Start microphone"
                : "Speech recognition not supported — use text input"
            }
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-40 ${
              speech.listening
                ? "bg-[var(--danger)] text-white"
                : "bg-[var(--bg-elevated)] text-slate-100 border border-[var(--line)]"
            }`}
          >
            {speech.listening ? "Stop mic" : "Microphone"}
          </button>

          <label className="sr-only" htmlFor="question-input">
            Ask a question
          </label>
          <input
            id="question-input"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              speech.supported
                ? "Ask about projects, skills, experience…"
                : "Type your question (mic unsupported here)"
            }
            disabled={busy || speech.listening}
            className="min-h-12 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg-deep)] px-4 text-sm text-white placeholder:text-slate-500 disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={busy || speech.listening || !draft.trim()}
            className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#042f2e] disabled:opacity-40"
          >
            Send
          </button>
        </form>

        {suggestedQuestions.length > 0 ? (
          <div className="border-t border-[var(--line)] px-4 py-4 md:px-6">
            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Suggested questions
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={busy || speech.listening}
                  onClick={() => {
                    setDraft(question);
                    void ask(question);
                  }}
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-left text-xs text-slate-300 transition hover:border-teal-400/40 disabled:opacity-40"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
