import type { Profile } from "../types";
import { cleanList, displayText, isPlaceholder } from "../utils/display";

interface PortfolioViewProps {
  profile: Profile;
}

export function PortfolioView({ profile }: PortfolioViewProps) {
  const skills = Object.entries(profile.skills || {})
    .map(([key, values]) => [key, cleanList(values)] as const)
    .filter(([, values]) => values.length > 0);

  const links = Object.entries(profile.links || {}).filter(
    ([, value]) => value && !isPlaceholder(value),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-12">
      {/* View Header */}
      <div className="mb-8 max-w-2xl">
        <p className="font-display text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
          PORTFOLIO & PROFILE
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
          {displayText(profile.name, "Kothlapuram L C Medha Nipuna")}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {displayText(profile.headline, "Final-year B.Tech CSE student | AI/ML Engineering | LLM Applications")}
        </p>
      </div>

      <div className="grid gap-8">
        {/* Professional Summary */}
        <section className="surface rounded-2xl p-6 sm:p-7">
          <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
            <span>✨</span> Professional Summary
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            {displayText(
              profile.summary,
              "Final-year B.Tech CSE student graduating in 2027, focused on AI/ML engineering, LLM applications, RAG, and backend development. Interested in building reliable AI systems for real-world problems.",
            )}
          </p>
          {profile.interests && profile.interests.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <span
                  key={interest}
                  className="rounded-full border border-teal-500/25 bg-teal-500/10 px-3 py-1 text-xs text-teal-300 font-medium"
                >
                  {interest}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {/* Education */}
        <section className="surface rounded-2xl p-6 sm:p-7">
          <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
            <span>🎓</span> Education & Academics
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {profile.education?.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg-deep)] p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-white text-sm sm:text-base">
                    {displayText(item.degree)} {item.field ? `in ${item.field}` : ""}
                  </h4>
                  {item.status ? (
                    <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-[10px] uppercase font-semibold text-teal-300">
                      {item.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs sm:text-sm text-teal-300">
                  {displayText(item.institution, "Institution")}
                </p>
                {item.end_year ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Graduating {item.end_year}
                  </p>
                ) : null}
                {item.highlights && item.highlights.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-slate-300">
                    {item.highlights.map((hl, hIdx) => (
                      <li key={hIdx} className="flex items-center gap-1.5">
                        <span className="text-teal-400">▸</span> {hl}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* Technical Skills */}
        <section className="surface rounded-2xl p-6 sm:p-7">
          <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
            <span>⚡</span> Technical Skills
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {skills.map(([group, values]) => (
              <div
                key={group}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg-deep)] p-4 sm:p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-400">
                  {group.replaceAll("_", " ")}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {values.map((val) => (
                    <span
                      key={val}
                      className="rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 py-1 text-xs text-slate-200"
                    >
                      {val}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Career Goals & Interests */}
        <section className="surface rounded-2xl p-6 sm:p-7">
          <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
            <span>🎯</span> Career Goals & Target Roles
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            {displayText(
              profile.career_goals,
              "Become a Machine Learning Engineer, gain industry experience building AI systems, and eventually explore entrepreneurship or AI research. Areas of particular interest include healthcare, sustainability, and technology projects.",
            )}
          </p>
        </section>

        {/* Links & Contact */}
        <section className="surface rounded-2xl p-6 sm:p-7">
          <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
            <span>🔗</span> Connect & Portfolio Links
          </h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {links.map(([key, value]) => {
              const urlStr = String(value);
              const isEmail = key.toLowerCase() === "email" || urlStr.includes("@");
              return (
                <a
                  key={key}
                  href={isEmail ? `mailto:${urlStr}` : urlStr}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-deep)] px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
                >
                  <span className="capitalize">{key}</span>
                  <span className="text-xs text-[var(--muted)]">↗</span>
                </a>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
