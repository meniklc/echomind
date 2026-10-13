import type { ChatHistoryItem, ChatResponse, Profile } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function url(path: string): string {
  return `${API_BASE}${path}`;
}

// =========================================================================
// Core public API
// =========================================================================

export async function fetchProfile(): Promise<Profile> {
  const response = await fetch(url("/api/profile"));
  if (!response.ok) {
    throw new Error("Unable to load portfolio profile.");
  }
  return response.json() as Promise<Profile>;
}

export async function sendChat(
  question: string,
  history: ChatHistoryItem[],
): Promise<ChatResponse> {
  const response = await fetch(url("/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history, speak: false }),
  });
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new Error(detail || "Chat request failed.");
  }
  return response.json() as Promise<ChatResponse>;
}

export async function synthesizeSpeech(text: string): Promise<Blob> {
  const response = await fetch(url("/api/tts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new Error(detail || "Speech synthesis failed.");
  }
  return response.blob();
}

// =========================================================================
// Admin ingestion types
// =========================================================================

export interface IngestionStatus {
  total_facts: number;
  verified_facts: number;
  pending_review_facts: number;
  last_sync_time: string | null;
  sources_summary: Record<string, number>;
}

export interface ConflictItem {
  conflict_type: string;
  description: string;
  existing_value: string | null;
  proposed_value: string | null;
  severity: string;
}

export interface FactItem {
  id: string;
  entity_type: string;
  title: string;
  content: string;
  source: string;
  source_url_or_file: string;
  import_date: string;
  verification_status: "verified" | "pending_review" | "rejected";
  metadata: Record<string, unknown>;
  conflicts: ConflictItem[];
}

export interface IngestionResult {
  source: string;
  imported_count: number;
  pending_count: number;
  conflicts_detected: number;
  status: string;
  details: FactItem[];
}

// =========================================================================
// Admin ingestion API helpers
// =========================================================================

export async function fetchIngestionStatus(): Promise<IngestionStatus> {
  const response = await fetch(url("/api/admin/ingest/status"));
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new Error(detail || "Failed to fetch ingestion status.");
  }
  return response.json() as Promise<IngestionStatus>;
}

export async function fetchPendingFacts(): Promise<FactItem[]> {
  const response = await fetch(url("/api/admin/ingest/pending"));
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new Error(detail || "Failed to fetch pending facts.");
  }
  return response.json() as Promise<FactItem[]>;
}

export async function syncGitHub(
  username = "meniklc",
  token?: string,
  includeReadmes = true,
): Promise<IngestionResult> {
  const response = await fetch(url("/api/admin/ingest/github"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      token: token || null,
      include_readmes: includeReadmes,
    }),
  });
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new Error(detail || "GitHub sync failed.");
  }
  return response.json() as Promise<IngestionResult>;
}

export async function uploadFile(file: File): Promise<IngestionResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(url("/api/admin/ingest/file"), {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new Error(detail || "File upload failed.");
  }
  return response.json() as Promise<IngestionResult>;
}

export async function uploadLinkedIn(file: File): Promise<IngestionResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(url("/api/admin/ingest/linkedin"), {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new Error(detail || "LinkedIn import failed.");
  }
  return response.json() as Promise<IngestionResult>;
}

export async function reviewFact(
  factId: string,
  action: "approve" | "reject",
  note?: string,
): Promise<{ status: string; fact_id: string; verification_status: string }> {
  const response = await fetch(url("/api/admin/ingest/review"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fact_id: factId, action, note: note || null }),
  });
  if (!response.ok) {
    const detail = await safeDetail(response);
    throw new Error(detail || "Review action failed.");
  }
  return response.json() as Promise<{
    status: string;
    fact_id: string;
    verification_status: string;
  }>;
}

// =========================================================================
// Internal helpers
// =========================================================================

async function safeDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
    return null;
  } catch {
    return null;
  }
}
