import type { ReactNode } from "react";

import type { Profile, ProjectItem } from "../types";
import { cleanList, displayText, isPlaceholder } from "../utils/display";

interface PortfolioProps {
  profile: Profile;
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

function PlaceholderNote({ text }: { text?: string }) {
  return (
    <p className="text-sm text-[var(--muted)]">
      {text || "Details pending — edit the JSON knowledge base to replace placeholders."}
    </p>
  );
}

function ProjectCard({ project }: { project: ProjectItem }) {
  const techs = cleanList(project.technologies);
  const summary = displayText(project.short_summary, "Summary not yet provided.");
  return (
    <article className="surface rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h4 className="font-display text-lg font-semibold text-white">{project.name}</h4>
        {project.status && !isPlaceholder(project.status) ? (
          <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]">
            {project.status}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{summary}</p>
      {!isPlaceholder(project.problem_solved) ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Problem: {project.problem_solved}
        </p>
      ) : null}
      {!isPlaceholder(project.contribution) ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Contribution: {project.contribution}
        </p>
      ) : null}
      {techs.length > 0 ? (
        <p className="mt-3 text-xs text-slate-400">Tech: {techs.join(", ")}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {project.repository_url ? (
          <a href={project.repository_url} target="_blank" rel="noreferrer">
            Repository
          </a>
        ) : null}
        {project.demo_url && !isPlaceholder(project.demo_url) ? (
          <a href={project.demo_url} target="_blank" rel="noreferrer">
            Demo
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function Portfolio({ profile }: PortfolioProps) {
  const skills = Object.entries(profile.skills || {})
    .map(([key, values]) => [key, cleanList(values)] as const)
    .filter(([, values]) => values.length > 0);

  const links = Object.entries(profile.links || {}).filter(
    ([, value]) => value && !isPlaceholder(value),
  );

  return (
    <section id="portfolio" className="mx-auto max-w-6xl px-5 pb-20 md:px-8">
      <div className="mb-10 max-w-2xl">
        <p className="font-display text-sm font-semibold tracking-[0.18em] text-[var(--accent)]">
          PORTFOLIO
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-white md:text-4xl">
          Verified professional profile
        </h2>
        <p className="mt-3 text-[var(--muted)]">
          Sourced from editable knowledge files. Placeholder fields are shown honestly until you replace them.
        </p>
      </div>

      <div className="grid gap-12">
        <Section id="summary" title="Professional summary">
          {!isPlaceholder(profile.summary) ? (
            <p className="max-w-3xl text-base leading-relaxed text-slate-300">{profile.summary}</p>
          ) : (
            <PlaceholderNote text="Add your summary in backend/app/knowledge/profile.json." />
          )}
        </Section>

        <Section id="education" title="Education">
          {profile.education?.some((item) => !isPlaceholder(item.institution) && !isPlaceholder(item.degree)) ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {profile.education.map((item, index) => (
                <li key={`${item.institution}-${index}`} className="surface rounded-2xl p-5">
                  <p className="font-medium text-white">{displayText(item.degree)}</p>
                  <p className="mt-1 text-sm text-slate-300">{displayText(item.institution)}</p>
                  {item.field && !isPlaceholder(item.field) ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">{item.field}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <PlaceholderNote />
          )}
        </Section>

        <Section id="skills" title="Technical skills">
          {skills.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {skills.map(([group, values]) => (
                <div key={group} className="surface rounded-2xl p-5">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                    {group.replaceAll("_", " ")}
                  </p>
                  <p className="mt-3 text-sm text-slate-200">{values.join(", ")}</p>
                </div>
              ))}
            </div>
          ) : (
            <PlaceholderNote text="Replace skill PLACEHOLDER values in profile.json." />
          )}
        </Section>

        <Section id="experience" title="Experience & internships">
          {profile.experience?.some(
            (item) => !isPlaceholder(item.title) && !isPlaceholder(item.organization),
          ) ? (
            <ul className="grid gap-4">
              {profile.experience.map((item, index) => (
                <li key={`${item.title}-${index}`} className="surface rounded-2xl p-5">
                  <p className="font-medium text-white">{displayText(item.title)}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {displayText(item.organization)}
                    {item.start_date && !isPlaceholder(item.start_date)
                      ? ` · ${item.start_date} – ${displayText(item.end_date, "Present")}`
                      : ""}
                  </p>
                  {cleanList(item.highlights).length > 0 ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                      {cleanList(item.highlights).map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <PlaceholderNote />
          )}
        </Section>

        <Section id="projects" title="Projects">
          <div className="grid gap-4 md:grid-cols-2">
            {profile.projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </Section>

        <Section id="achievements" title="Certifications & achievements">
          {profile.achievements?.some((item) => !isPlaceholder(item.title)) ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {profile.achievements.map((item, index) => (
                <li key={`${item.title}-${index}`} className="surface rounded-2xl p-5">
                  <p className="font-medium text-white">{displayText(item.title)}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {[item.issuer, item.date]
                      .filter((v) => v && !isPlaceholder(v))
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <PlaceholderNote />
          )}
        </Section>

        <Section id="contact" title="Resume & contact">
          {!isPlaceholder(profile.career_goals) ? (
            <p className="mb-4 max-w-3xl text-sm leading-relaxed text-slate-300">
              <span className="text-white">Career goals: </span>
              {profile.career_goals}
            </p>
          ) : (
            <PlaceholderNote text="Add career_goals in profile.json for stronger role-fit answers." />
          )}
          {links.length > 0 ? (
            <ul className="flex flex-wrap gap-3">
              {links.map(([key, value]) => (
                <li key={key}>
                  {key === "email" ? (
                    <a className="surface inline-flex rounded-xl px-4 py-2 text-sm" href={`mailto:${value}`}>
                      Email
                    </a>
                  ) : (
                    <a
                      className="surface inline-flex rounded-xl px-4 py-2 text-sm capitalize"
                      href={value || undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {key}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <PlaceholderNote text="GitHub is set; add resume, LinkedIn, and email when ready." />
          )}
        </Section>
      </div>
    </section>
  );
}
