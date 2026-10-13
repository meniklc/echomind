export type InteractionState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface PortfolioReference {
  type: "profile" | "project" | "link";
  label: string;
  section?: string | null;
  url?: string | null;
  project_id?: string | null;
}

export type NavigationTab =
  | "talk"
  | "portfolio"
  | "experience"
  | "projects"
  | "history"
  | "admin";

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status: "completed" | "error";
  references?: PortfolioReference[];
  mode?: "llm" | "fact_retrieval";
  audioUrl?: string | null;
}

export interface ConversationSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: ConversationTurn[];
}

export interface ConversationSessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turnCount: number;
  preview: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  references?: PortfolioReference[];
  audioUrl?: string | null;
  mode?: "llm" | "fact_retrieval";
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  answer: string;
  references: PortfolioReference[];
  mode: "llm" | "fact_retrieval";
  status: "ok" | "insufficient_info" | "error";
}

export interface EducationItem {
  institution: string;
  degree: string;
  field?: string;
  start_year?: number | null;
  end_year?: number | null;
  status?: string;
  highlights?: string[];
}

export interface ExperienceItem {
  title: string;
  organization: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  type?: string;
  highlights?: string[];
}

export interface AchievementItem {
  title: string;
  issuer?: string;
  date?: string;
  url?: string | null;
  notes?: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  short_summary: string;
  problem_solved?: string;
  technologies?: string[];
  contribution?: string;
  status?: string;
  outcomes?: string[];
  repository_url?: string | null;
  demo_url?: string | null;
  tags?: string[];
  notes?: string;
}

export interface Profile {
  name: string;
  headline: string;
  summary: string;
  interests: string[];
  education: EducationItem[];
  skills: Record<string, string[]>;
  experience: ExperienceItem[];
  achievements: AchievementItem[];
  career_goals: string;
  links: Record<string, string | null>;
  suggested_questions: string[];
  disclaimer: string;
  projects: ProjectItem[];
}
