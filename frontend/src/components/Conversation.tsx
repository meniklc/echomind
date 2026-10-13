import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useConversation } from "../hooks/useConversation";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import type { InteractionState } from "../types";
import { Avatar } from "./Avatar";
import { MarkdownView } from "./MarkdownView";
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
    audioRef,
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSubmit();
    }
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
  const hasAssistantMessages = messages.some((m) => m.role === "assistant");

  return (
    <section
      id="conversation"
      ref={panelRef}
      className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16"
    >
      <div className="mb-8 max-w-2xl">
        <p className="font-display text-sm font-semibold tracking-[0.18em] text-[var(--accent)]">
          CONVERSATION & TALKING AVATAR
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">
          Speak with Medha Nipuna's Digital Twin
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Ask questions about education at UVCE, AI/ML internships at Apti and SkillDisk, projects, skills, or career goals.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[320px_1fr]">
        {/* Left: Talking Avatar Card */}
        <div className="surface sticky top-6 flex flex-col items-center rounded-2xl p-6 text-center">
          <Avatar
            state={state}
            isListening={speech.listening}
            audioRef={audioRef}
            onToggleMic={toggleMic}
            onStopSpeaking={stopSpeaking}
            onReplay={() => void replayLast()}
            canReplay={hasAssistantMessages}
            micSupported={speech.supported}
            busy={busy}
            error={speech.error}
          />
          <div className="mt-4 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
            <p>Animated avatar with real-time audio sync & voice synthesis.</p>
          </div>
        </div>

        {/* Right: Conversation Dialogue & Controls */}
        <div className="surface overflow-hidden rounded-2xl">
          {/* Header bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-3.5 md:px-6">
            <Waveform
              active={activeWave}
              label={stateLabel(state, speech.listening)}
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-[var(--line)] bg-[var(--bg-deep)] px-2.5 py-1 text-slate-300">
                Port: 8001
              </span>
              <span className="rounded-md border border-[var(--line)] bg-[var(--bg-deep)] px-2.5 py-1 text-teal-300">
                Hybrid RAG
              </span>
            </div>
          </div>

          {/* Messages list */}
          <div
            className="flex max-h-[30rem] min-h-[19rem] flex-col gap-4 overflow-y-auto px-4 py-5 md:px-6"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[14rem] flex-col items-center justify-center text-center">
                <p className="text-sm font-medium text-slate-300">
                  Ready to chat! Select a suggested question below or type your own.
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Supports follow-up questions, voice input, and markdown formatting.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[85%] ${
                    message.role === "user"
                      ? "ml-auto bg-[rgba(56,189,248,0.12)] border border-[rgba(56,189,248,0.25)] text-slate-100"
                      : "mr-auto bg-[rgba(15,23,42,0.95)] border border-[var(--line)] text-slate-200"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <span>
                      {message.role === "user" ? "You" : "EchoMind"}
                      {message.mode ? ` · ${message.mode === "llm" ? "Model" : "Fact Retrieval"}` : ""}
                    </span>
                  </div>

                  {message.role === "assistant" ? (
                    <MarkdownView content={message.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}

                  {message.references && message.references.length > 0 ? (
                    <div className="mt-3 border-t border-[var(--line)] pt-2.5">
                      <p className="mb-1.5 text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">
                        Verified Sources
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {message.references.map((ref) => (
                          <li key={`${ref.type}-${ref.label}-${ref.url || ref.section}`}>
                            {ref.url ? (
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-xs text-teal-300 hover:border-teal-400"
                              >
                                <span>🔗</span>
                                <span>{ref.label}</span>
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-slate-800/60 px-2.5 py-0.5 text-xs text-slate-300">
                                <span>📌</span>
                                <span>{ref.label}</span>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Error Banner */}
          {error ? (
            <div
              className="border-t border-[var(--line)] bg-[rgba(251,113,133,0.08)] px-4 py-3 text-xs text-[var(--danger)] md:px-6"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {/* Input Form */}
          <form
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-4 md:flex-row md:items-center md:px-6"
          >
            <label className="sr-only" htmlFor="question-input">
              Ask a question
            </label>
            <input
              id="question-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                speech.listening
                  ? "Listening to your voice…"
                  : "Ask about AI Learn, PhishCure, UVCE, skills, or experience…"
              }
              disabled={busy || speech.listening}
              className="min-h-12 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg-deep)] px-4 text-sm text-white placeholder:text-slate-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={busy || speech.listening || !draft.trim()}
              className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#042f2e] transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Thinking…" : "Send"}
            </button>
          </form>

          {/* Suggested Questions */}
          {suggestedQuestions.length > 0 ? (
            <div className="border-t border-[var(--line)] px-4 py-3.5 md:px-6">
              <p className="mb-2.5 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Suggested Questions
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
                    className="rounded-full border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-1 text-left text-xs text-slate-300 transition hover:border-teal-400/50 hover:text-white disabled:opacity-40"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
