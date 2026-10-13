/**
 * Dedicated IndexedDB persistent conversation history service.
 * Handles sessions, ordered turns, metadata, and active session persistence.
 */

import type {
  ConversationSession,
  ConversationSessionSummary,
  ConversationTurn,
} from "../types";

const DB_NAME = "echomind_history_db";
const DB_VERSION = 1;
const STORE_NAME = "sessions";
const ACTIVE_SESSION_KEY = "echomind_active_session_id";

// In-memory fallback if IndexedDB is unavailable or restricted
const inMemoryStore = new Map<string, ConversationSession>();

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

function generateId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatSessionTitle(question: string): string {
  const clean = question.trim().replace(/\s+/g, " ");
  if (clean.length <= 48) return clean;
  return `${clean.slice(0, 48).trim()}…`;
}

/**
 * Get active session ID from local storage so active conversations survive refreshes.
 */
export function getActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveSessionId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_SESSION_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  } catch {
    // Ignore storage quota or access issues
  }
}

/**
 * Create a new conversation session.
 */
export async function createSession(initialTitle = "New Conversation"): Promise<ConversationSession> {
  const session: ConversationSession = {
    id: generateId(),
    title: initialTitle,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    turns: [],
  };

  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("IndexedDB save failed, using memory fallback:", err);
    inMemoryStore.set(session.id, session);
  }

  setActiveSessionId(session.id);
  return session;
}

/**
 * Fetch a session by its ID.
 */
export async function getSession(sessionId: string): Promise<ConversationSession | null> {
  if (inMemoryStore.has(sessionId)) {
    return inMemoryStore.get(sessionId) || null;
  }

  try {
    const db = await getDB();
    return await new Promise<ConversationSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(sessionId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return inMemoryStore.get(sessionId) || null;
  }
}

/**
 * Get or create the active session.
 */
export async function getOrCreateActiveSession(): Promise<ConversationSession> {
  const activeId = getActiveSessionId();
  if (activeId) {
    const existing = await getSession(activeId);
    if (existing) return existing;
  }
  return createSession();
}

/**
 * Save or append a turn to a session.
 */
export async function saveTurn(sessionId: string, turn: ConversationTurn): Promise<ConversationSession> {
  let session = await getSession(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      title: turn.role === "user" ? formatSessionTitle(turn.content) : "Conversation",
      createdAt: turn.timestamp || Date.now(),
      updatedAt: Date.now(),
      turns: [],
    };
  }

  // Auto-name session from first user turn if title is default
  if (
    turn.role === "user" &&
    (session.title === "New Conversation" || session.turns.length === 0)
  ) {
    session.title = formatSessionTitle(turn.content);
  }

  // Append turn in chronological order
  session.turns.push(turn);
  session.updatedAt = Date.now();

  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("IndexedDB turn save error, stored in memory fallback:", err);
    inMemoryStore.set(session.id, session);
  }

  return session;
}

/**
 * List all sessions sorted by most recent activity (updatedAt descending).
 */
export async function listSessions(): Promise<ConversationSessionSummary[]> {
  const results: ConversationSession[] = [];

  try {
    const db = await getDB();
    const rawSessions = await new Promise<ConversationSession[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    results.push(...rawSessions);
  } catch {
    results.push(...Array.from(inMemoryStore.values()));
  }

  // Include any in-memory sessions not yet saved
  for (const [id, s] of inMemoryStore) {
    if (!results.some((r) => r.id === id)) {
      results.push(s);
    }
  }

  // Sort by updatedAt descending
  results.sort((a, b) => b.updatedAt - a.updatedAt);

  return results.map((s) => {
    const lastAssistantTurn = [...s.turns].reverse().find((t) => t.role === "assistant");
    const preview =
      lastAssistantTurn?.content ||
      s.turns[0]?.content ||
      "No messages recorded yet.";

    return {
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      turnCount: s.turns.length,
      preview: preview.length > 90 ? `${preview.slice(0, 90).trim()}…` : preview,
    };
  });
}

/**
 * Delete a specific session.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  inMemoryStore.delete(sessionId);
  if (getActiveSessionId() === sessionId) {
    setActiveSessionId(null);
  }

  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Handled in memory
  }
}

/**
 * Clear all conversation history.
 */
export async function clearAllSessions(): Promise<void> {
  inMemoryStore.clear();
  setActiveSessionId(null);

  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Handled in memory
  }
}
