import { useEffect, useState } from "react";
import { MarkdownView } from "../components/MarkdownView";
import {
  clearAllSessions,
  deleteSession,
  getSession,
  listSessions,
  setActiveSessionId,
} from "../services/conversationHistory";
import type {
  ConversationSession,
  ConversationSessionSummary,
} from "../types";

interface HistoryViewProps {
  onSelectSessionToResume: (sessionId: string) => void;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryView({ onSelectSessionToResume }: HistoryViewProps) {
  const [sessions, setSessions] = useState<ConversationSessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<ConversationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const refreshSessions = async () => {
    setLoading(true);
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (err) {
      console.warn("Failed to list history sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSessions();
  }, []);

  const handleOpenSession = async (id: string) => {
    try {
      const sess = await getSession(id);
      setSelectedSession(sess);
    } catch (err) {
      console.warn("Failed to load session details:", err);
    }
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    setConfirmDeleteId(null);
    if (selectedSession?.id === id) {
      setSelectedSession(null);
    }
    await refreshSessions();
  };

  const handleClearAll = async () => {
    await clearAllSessions();
    setConfirmClearAll(false);
    setSelectedSession(null);
    await refreshSessions();
  };

  const handleResumeInTalk = (sessionId: string) => {
    setActiveSessionId(sessionId);
    onSelectSessionToResume(sessionId);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
            CONVERSATION ARCHIVE
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
            Conversation History
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Past sessions stored securely in your browser's IndexedDB. Reopen or continue any discussion anytime.
          </p>
        </div>

        {sessions.length > 0 ? (
          <div>
            {confirmClearAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-300">Clear all records?</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                >
                  Yes, Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition"
              >
                🗑️ Clear All History
              </button>
            )}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[var(--muted)]">
          Loading conversation history…
        </div>
      ) : sessions.length === 0 ? (
        <div className="surface rounded-2xl p-12 text-center border border-[var(--line)]">
          <p className="text-4xl mb-3">💬</p>
          <h3 className="font-display text-lg font-semibold text-white">
            No saved conversations yet
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)] max-w-md mx-auto">
            Switch to the <strong>Talk</strong> tab and start speaking or typing questions. Your turns will be saved here automatically!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr] items-start">
          {/* Left Column: Sessions List */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Saved Sessions ({sessions.length})
            </p>

            <div className="space-y-2.5 max-h-[38rem] overflow-y-auto pr-1">
              {sessions.map((sess) => {
                const isSelected = selectedSession?.id === sess.id;
                return (
                  <div
                    key={sess.id}
                    className={`surface rounded-xl p-4 transition-all duration-200 cursor-pointer border ${
                      isSelected
                        ? "border-teal-400 bg-teal-500/10 shadow-[0_0_15px_rgba(45,212,191,0.15)]"
                        : "border-[var(--line)] hover:border-slate-600 hover:bg-slate-800/40"
                    }`}
                    onClick={() => void handleOpenSession(sess.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-white text-sm leading-snug line-clamp-1">
                        {sess.title}
                      </h4>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-teal-300 whitespace-nowrap">
                        {sess.turnCount} {sess.turnCount === 1 ? "turn" : "turns"}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-[var(--muted)] line-clamp-2 leading-relaxed">
                      {sess.preview}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-2.5 text-[11px] text-[var(--muted)]">
                      <span>{formatDate(sess.updatedAt)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResumeInTalk(sess.id);
                        }}
                        className="text-teal-300 hover:underline font-medium text-[11px]"
                      >
                        Resume 🎙️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Session Detail Viewer */}
          <div className="surface rounded-2xl p-6 sm:p-7 border border-[var(--line)]">
            {selectedSession ? (
              <div>
                {/* Session Detail Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-4 mb-6">
                  <div>
                    <h3 className="font-display text-lg sm:text-xl font-semibold text-white">
                      {selectedSession.title}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Created {formatDate(selectedSession.createdAt)} · Updated{" "}
                      {formatDate(selectedSession.updatedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleResumeInTalk(selectedSession.id)}
                      className="rounded-xl bg-teal-500 px-3.5 py-1.5 text-xs font-semibold text-[#042f2e] transition hover:brightness-110"
                    >
                      🎙️ Resume in Talk
                    </button>

                    {confirmDeleteId === selectedSession.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDeleteSession(selectedSession.id)}
                          className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-slate-300"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(selectedSession.id)}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20"
                        title="Delete this session"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Chronological Turns */}
                {selectedSession.turns.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[var(--muted)]">
                    No messages recorded in this session.
                  </p>
                ) : (
                  <div className="space-y-4 max-h-[34rem] overflow-y-auto pr-1">
                    {selectedSession.turns.map((turn) => (
                      <div
                        key={turn.id}
                        className={`rounded-xl p-4 text-xs sm:text-sm leading-relaxed ${
                          turn.role === "user"
                            ? "ml-auto max-w-[85%] bg-sky-950/40 border border-sky-800/40 text-slate-100"
                            : "mr-auto max-w-[90%] bg-slate-900/90 border border-slate-800 text-slate-200"
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--muted)]">
                          <span className="font-semibold text-teal-400">
                            {turn.role === "user" ? "You" : "EchoMind"}
                            {turn.mode ? ` · ${turn.mode === "llm" ? "Model" : "Fact Retrieval"}` : ""}
                          </span>
                          <span>{formatDate(turn.timestamp)}</span>
                        </div>

                        {turn.role === "assistant" ? (
                          <MarkdownView content={turn.content} />
                        ) : (
                          <p className="whitespace-pre-wrap">{turn.content}</p>
                        )}

                        {turn.references && turn.references.length > 0 ? (
                          <div className="mt-3 border-t border-[var(--line)] pt-2">
                            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
                              Verified Sources:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {turn.references.map((ref, idx) => (
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
                  </div>
                )}
              </div>
            ) : (
              <div className="py-20 text-center text-sm text-[var(--muted)]">
                Select a session from the list to review its complete conversation transcript.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
