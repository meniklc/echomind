import type { Profile } from "../types";
import { cleanList, displayText } from "../utils/display";

interface ExperienceViewProps {
  profile: Profile;
}

export function ExperienceView({ profile }: ExperienceViewProps) {
  const experiences = profile.experience || [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-12">
      {/* View Header */}
      <div className="mb-8 max-w-2xl">
        <p className="font-display text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
          EXPERIENCE & INTERNSHIPS
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
          Professional Background
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Verified internships and apprenticeship roles in AI/ML development and software engineering.
        </p>
      </div>

      {experiences.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No experience entries recorded yet.</p>
      ) : (
        <div className="relative border-l border-teal-500/30 pl-6 sm:pl-8 ml-3 sm:ml-4 space-y-8">
          {experiences.map((item, idx) => {
            const highlights = cleanList(item.highlights);
            const dateStr = item.start_date
              ? `${item.start_date} – ${displayText(item.end_date, "Present")}`
              : "Timeline verified in profile";

            return (
              <article key={idx} className="relative surface rounded-2xl p-6 sm:p-7 shadow-lg">
                {/* Timeline node */}
                <span className="absolute -left-[31px] sm:-left-[39px] top-6 flex h-4 w-4 items-center justify-center rounded-full border-2 border-teal-400 bg-[#070b14]" />

                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg sm:text-xl font-semibold text-white">
                      {displayText(item.title)}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-teal-300">
                      {displayText(item.organization)}
                    </p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-1">
                    <span className="rounded-full border border-[var(--line)] bg-[var(--bg-deep)] px-3 py-1 text-xs text-slate-300 font-mono">
                      {dateStr}
                    </span>
                    {item.type ? (
                      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-semibold">
                        {item.type}
                      </span>
                    ) : null}
                  </div>
                </div>

                {highlights.length > 0 ? (
                  <div className="mt-4 border-t border-[var(--line)] pt-3.5">
                    <p className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 font-semibold">
                      Key Responsibilities & Contributions:
                    </p>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
                      {highlights.map((hl, hIdx) => (
                        <li key={hIdx} className="flex items-start gap-2.5 leading-relaxed">
                          <span className="text-teal-400 mt-1">▸</span>
                          <span>{hl}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
