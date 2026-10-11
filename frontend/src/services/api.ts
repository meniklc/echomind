import type { ChatHistoryItem, ChatResponse, Profile } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function url(path: string): string {
  return `${API_BASE}${path}`;
}

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

async function safeDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
    return null;
  } catch {
    return null;
  }
}
