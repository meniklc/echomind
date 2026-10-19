import { useEffect, useState } from "react";

import { Navbar } from "../components/Navbar";
import { useConversation } from "../hooks/useConversation";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { fetchProfile } from "../services/api";
import type { NavigationTab, Profile } from "../types";
import { ADMIN_ENABLED } from "../utils/features";
import { AdminView } from "./AdminView";
import { ExperienceView } from "./ExperienceView";
import { HistoryView } from "./HistoryView";
import { PortfolioView } from "./PortfolioView";
import { ProjectsView } from "./ProjectsView";
import { TalkView } from "./TalkView";

const DEFAULT_SUGGESTED_QUESTIONS = [
  "Tell me about yourself.",
  "Explain your strongest AI/ML project.",
  "What technologies do you work with?",
  "What experience do you have?",
  "What are your career goals?",
  "Why would you be suitable for this role?",
];

export function HomePage() {
  const [activeTab, setActiveTab] = useState<NavigationTab>("talk");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Global conversation state preserved across tabs
  const conv = useConversation();
  // Speech recognition hook
  const speech = useSpeechRecognition();

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load profile.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // If the admin panel is disabled, never leave the UI on an unreachable tab.
  useEffect(() => {
    if (!ADMIN_ENABLED && activeTab === "admin") {
      setActiveTab("talk");
    }
  }, [activeTab]);

  const handleToggleMic = () => {
    if (speech.listening) {
      speech.stop();
    } else {
      speech.start();
    }
  };

  const handleAskAboutProject = (projectName: string) => {
    setActiveTab("talk");
    void conv.ask(`Tell me about your ${projectName} project and your contributions.`);
  };

  const handleResumeSession = (sessionId: string) => {
    void conv.loadSession(sessionId);
    setActiveTab("talk");
  };

  const candidateName = profile?.name || "Kothlapuram L C Medha Nipuna";
  const suggestedQuestions =
    profile?.suggested_questions && profile.suggested_questions.length > 0
      ? profile.suggested_questions
      : DEFAULT_SUGGESTED_QUESTIONS;

  return (
    <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100">
      {/* Top Fixed / Sticky Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        candidateName={candidateName}
        isListening={speech.listening}
      />

      {/* Backend Connectivity Error Alert */}
      {loadError ? (
        <div className="mx-auto max-w-6xl w-full px-4 pt-4 sm:px-6 md:px-8" role="alert">
          <div className="rounded-xl border border-[var(--danger)]/40 bg-[rgba(251,113,133,0.08)] px-4 py-3 text-xs sm:text-sm text-[var(--danger)] flex items-center justify-between">
            <span>
              {loadError}
              {import.meta.env.DEV
                ? " Ensure the FastAPI backend is running on port 8001, then refresh."
                : " The service may be temporarily unavailable — please try again shortly."}
            </span>
            <button
              type="button"
              onClick={() => setLoadError(null)}
              className="text-xs text-rose-300 hover:text-white ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {/* Main Content: Render ONLY the active section */}
      <main className="flex-1 w-full" id="main-content">
        {activeTab === "talk" && (
          <TalkView
            messages={conv.messages}
            state={conv.state}
            error={conv.error}
            busy={conv.busy}
            audioRef={conv.audioRef}
            speechListening={speech.listening}
            speechTranscript={speech.transcript}
            speechSupported={speech.supported}
            speechError={speech.error}
            sessionTitle={conv.sessionTitle}
            storageStatus={conv.storageStatus}
            suggestedQuestions={suggestedQuestions}
            onToggleMic={handleToggleMic}
            onStopSpeaking={conv.stopSpeaking}
            onReplay={conv.replayLast}
            onAsk={conv.ask}
            onStartNewSession={conv.startNewSession}
            onResetSpeechTranscript={speech.reset}
          />
        )}

        {activeTab === "portfolio" && (
          profile ? (
            <PortfolioView profile={profile} />
          ) : (
            <div className="mx-auto max-w-5xl px-4 py-20 text-center text-sm text-[var(--muted)]">
              Loading portfolio details…
            </div>
          )
        )}

        {activeTab === "experience" && (
          profile ? (
            <ExperienceView profile={profile} />
          ) : (
            <div className="mx-auto max-w-5xl px-4 py-20 text-center text-sm text-[var(--muted)]">
              Loading experience details…
            </div>
          )
        )}

        {activeTab === "projects" && (
          profile ? (
            <ProjectsView
              profile={profile}
              onAskAboutProject={handleAskAboutProject}
            />
          ) : (
            <div className="mx-auto max-w-6xl px-4 py-20 text-center text-sm text-[var(--muted)]">
              Loading projects…
            </div>
          )
        )}

        {activeTab === "history" && (
          <HistoryView onSelectSessionToResume={handleResumeSession} />
        )}

        {activeTab === "admin" && ADMIN_ENABLED && <AdminView />}
      </main>

      {/* Global Footer */}
      <footer className="border-t border-[var(--line)] py-6 text-center text-xs text-[var(--muted)]">
        <p>
          EchoMind · Personal AI Digital Twin for {candidateName} · Voice-First Experience
        </p>
      </footer>
    </div>
  );
}

