import { useEffect, useState } from "react";

import { Conversation } from "../components/Conversation";
import { Hero } from "../components/Hero";
import { Portfolio } from "../components/Portfolio";
import { fetchProfile } from "../services/api";
import type { Profile } from "../types";

export function HomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load profile.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <Hero
        profile={profile}
        onTalk={() => setFocusToken((value) => value + 1)}
      />

      {loadError ? (
        <div className="mx-auto max-w-6xl px-5 pt-8 md:px-8" role="alert">
          <p className="rounded-xl border border-[var(--danger)]/40 bg-[rgba(251,113,133,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
            {loadError} Start the backend on port 8000, then refresh.
          </p>
        </div>
      ) : null}

      <Conversation
        suggestedQuestions={
          profile?.suggested_questions?.length
            ? profile.suggested_questions
            : [
                "Tell me about yourself.",
                "Explain your strongest AI/ML project.",
                "What technologies do you work with?",
                "What experience do you have?",
                "What are your career goals?",
                "Why would you be suitable for this role?",
              ]
        }
        focusToken={focusToken}
      />

      {profile ? <Portfolio profile={profile} /> : (
        <div className="mx-auto max-w-6xl px-5 pb-20 text-sm text-[var(--muted)] md:px-8">
          Loading portfolio sections…
        </div>
      )}

      <footer className="border-t border-[var(--line)] py-8 text-center text-xs text-[var(--muted)]">
        EchoMind MVP · AI digital twin · Editable knowledge base
      </footer>
    </div>
  );
}
