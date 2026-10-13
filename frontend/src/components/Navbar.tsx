import type { NavigationTab } from "../types";

interface NavbarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  candidateName?: string;
  isListening?: boolean;
}

const NAV_ITEMS: { id: NavigationTab; label: string; icon: string }[] = [
  { id: "talk", label: "Talk", icon: "🎙️" },
  { id: "portfolio", label: "Portfolio", icon: "👤" },
  { id: "experience", label: "Experience", icon: "💼" },
  { id: "projects", label: "Projects", icon: "🚀" },
  { id: "history", label: "History", icon: "📜" },
  { id: "admin", label: "Admin", icon: "⚙️" },
];

export function Navbar({
  activeTab,
  onSelectTab,
  candidateName = "Medha Nipuna",
  isListening = false,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[#070b14]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 md:px-8">
        {/* Brand / Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSelectTab("talk")}
            className="flex items-center gap-2.5 text-left focus:outline-none"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 font-display font-bold text-sm shadow-[0_0_12px_rgba(45,212,191,0.25)]">
              E
            </span>
            <div>
              <p className="font-display text-sm font-semibold tracking-wider text-white">
                EchoMind
              </p>
              <p className="text-[11px] text-[var(--muted)] leading-tight">
                {candidateName}
              </p>
            </div>
          </button>

          {isListening ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live Voice
            </span>
          ) : null}
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto py-1" aria-label="Main Navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-medium transition whitespace-nowrap focus:outline-none ${
                  isActive
                    ? "bg-teal-500/15 text-teal-300 border border-teal-500/35 shadow-[0_0_15px_rgba(45,212,191,0.15)]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
