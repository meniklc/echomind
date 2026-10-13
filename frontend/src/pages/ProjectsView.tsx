import { useState } from "react";
import type { Profile, ProjectItem } from "../types";
import { cleanList, displayText, isPlaceholder } from "../utils/display";

interface ProjectsViewProps {
  profile: Profile;
  onAskAboutProject?: (projectName: string) => void;
}

export function ProjectsView({ profile, onAskAboutProject }: ProjectsViewProps) {
  const [filterTag, setFilterTag] = useState<string>("all");
  const projects = profile.projects || [];

  // Extract unique tags for category filter
  const allTags = Array.from(
    new Set(projects.flatMap((p) => p.tags || []).filter(Boolean)),
  );

  const filteredProjects =
    filterTag === "all"
      ? projects
      : projects.filter((p) => p.tags?.includes(filterTag));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
      {/* View Header */}
      <div className="mb-8 max-w-2xl">
        <p className="font-display text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
          PORTFOLIO PROJECTS
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
          Featured Engineering Projects
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Verified systems spanning AI/ML engineering, RAG pipelines, cybersecurity classification, and full-stack development.
        </p>
      </div>

      {/* Filter Chips */}
      <div className="mb-8 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterTag("all")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
            filterTag === "all"
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-sm"
              : "border border-[var(--line)] bg-[var(--bg-panel)] text-slate-400 hover:text-white"
          }`}
        >
          All Projects ({projects.length})
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setFilterTag(tag)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition ${
              filterTag === tag
                ? "bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-sm"
                : "border border-[var(--line)] bg-[var(--bg-panel)] text-slate-400 hover:text-white"
            }`}
          >
            {tag.replace("-", " ")}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {filteredProjects.map((project: ProjectItem) => {
          const techs = cleanList(project.technologies);
          const tags = cleanList(project.tags);

          return (
            <article
              key={project.id}
              className="surface flex flex-col justify-between rounded-2xl p-6 sm:p-7 shadow-lg border border-[var(--line)] hover:border-teal-500/40 transition-all duration-300"
            >
              <div>
                {/* Header: Title and Status */}
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <h3 className="font-display text-lg sm:text-xl font-semibold text-white">
                    {project.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {project.status && !isPlaceholder(project.status) ? (
                      <span className="rounded-full border border-teal-500/25 bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-medium text-teal-300">
                        {project.status}
                      </span>
                    ) : null}
                    {tags.slice(0, 2).map((tg) => (
                      <span
                        key={tg}
                        className="rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-300 font-mono"
                      >
                        #{tg}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  {displayText(project.short_summary, "Summary pending verification.")}
                </p>

                {/* Problem Solved */}
                {!isPlaceholder(project.problem_solved) ? (
                  <div className="mt-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 p-3 text-xs leading-relaxed text-slate-300">
                    <span className="font-semibold text-teal-400">Problem Solved: </span>
                    {project.problem_solved}
                  </div>
                ) : null}

                {/* Contribution */}
                {!isPlaceholder(project.contribution) ? (
                  <p className="mt-3 text-xs text-slate-300">
                    <span className="font-semibold text-slate-100">Contribution: </span>
                    {project.contribution}
                  </p>
                ) : null}

                {/* Tech Stack */}
                {techs.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1.5">
                      Tech Stack:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {techs.map((t) => (
                        <span
                          key={t}
                          className="rounded-lg border border-[var(--line)] bg-[var(--bg-deep)] px-2.5 py-1 text-xs text-slate-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Footer Actions */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                <div className="flex items-center gap-3">
                  {project.repository_url ? (
                    <a
                      href={project.repository_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-300 hover:text-teal-200 underline underline-offset-4"
                    >
                      <span>📂 View Repository</span>
                      <span className="text-[10px]">↗</span>
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--muted)] italic">
                      Private / Internal Repo
                    </span>
                  )}
                  {project.demo_url && !isPlaceholder(project.demo_url) ? (
                    <a
                      href={project.demo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 underline underline-offset-4"
                    >
                      <span>Live Demo ↗</span>
                    </a>
                  ) : null}
                </div>

                {onAskAboutProject ? (
                  <button
                    type="button"
                    onClick={() => onAskAboutProject(project.name)}
                    className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-[11px] font-medium text-teal-300 hover:bg-teal-500/20 transition"
                  >
                    🎙️ Ask Digital Twin
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
