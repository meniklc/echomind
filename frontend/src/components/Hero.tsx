import type { Profile } from "../types";
import { cleanList, displayText, isPlaceholder } from "../utils/display";

interface HeroProps {
  profile: Profile | null;
  onTalk: () => void;
}

export function Hero({ profile, onTalk }: HeroProps) {
  const name = displayText(profile?.name, "Portfolio owner");
  const headline = displayText(profile?.headline, "AI / ML & software engineering");
  const interests = cleanList(profile?.interests);
  const summary = profile?.summary && !isPlaceholder(profile.summary)
    ? profile.summary
    : "Ask about skills, projects, experience, and career goals through a natural conversation.";

  return (
    <header className="relative overflow-hidden border-b border-[var(--line)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_40%,rgba(45,212,191,0.05)_70%,transparent_100%)]" />
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 pb-16 pt-10 md:px-8 md:pb-20 md:pt-14">
        <nav className="flex items-center justify-between gap-4">
          <p className="font-display text-sm font-semibold tracking-[0.22em] text-[var(--accent)]">
            ECHOMIND
          </p>
          <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
            <a href="#conversation">Talk</a>
            <a href="#portfolio">Portfolio</a>
          </div>
        </nav>

        <div className="rise grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div className="space-y-6">
            <p className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl">
              EchoMind
            </p>
            <div className="space-y-3">
              <h1 className="max-w-xl text-2xl font-medium text-white/95 sm:text-3xl">
                {name}
              </h1>
              <p className="max-w-xl text-lg text-[var(--muted)]">{headline}</p>
              <p className="max-w-2xl text-base leading-relaxed text-slate-300">{summary}</p>
            </div>

            {interests.length > 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Interests: {interests.join(" · ")}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onTalk}
                className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#042f2e] transition hover:brightness-110"
              >
                Talk to My Digital Twin
              </button>
              <a
                href="#portfolio"
                className="rounded-xl border border-[var(--line)] px-5 py-3 text-sm text-slate-200 transition hover:border-teal-400/40"
              >
                Browse portfolio
              </a>
            </div>
          </div>

          <aside className="surface rise rounded-2xl p-5 md:p-6" style={{ animationDelay: "120ms" }}>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Transparency</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              {displayText(
                profile?.disclaimer,
                "EchoMind is an AI representation of this professional profile — not the human candidate.",
              )}
            </p>
          </aside>
        </div>
      </div>
    </header>
  );
}
