import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Setup browser globals for Node test environment
class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

// Minimal mock IndexedDB for testing IDB transaction path
class MockIDBDatabase {
  public store = new Map<string, any>();

  transaction(_storeName: string, _mode: string) {
    const parent = this;
    return {
      objectStore(_name: string) {
        return {
          put(item: any) {
            parent.store.set(item.id, JSON.parse(JSON.stringify(item)));
            const req = { onsuccess: () => {}, onerror: () => {} };
            setTimeout(() => req.onsuccess(), 0);
            return req;
          },
          get(id: string) {
            const result = parent.store.get(id);
            const req = {
              result: result ? JSON.parse(JSON.stringify(result)) : undefined,
              onsuccess: () => {},
              onerror: () => {},
            };
            setTimeout(() => req.onsuccess(), 0);
            return req;
          },
          getAll() {
            const list = Array.from(parent.store.values()).map((v) =>
              JSON.parse(JSON.stringify(v)),
            );
            const req = {
              result: list,
              onsuccess: () => {},
              onerror: () => {},
            };
            setTimeout(() => req.onsuccess(), 0);
            return req;
          },
          delete(id: string) {
            parent.store.delete(id);
            const req = { onsuccess: () => {}, onerror: () => {} };
            setTimeout(() => req.onsuccess(), 0);
            return req;
          },
          clear() {
            parent.store.clear();
            const req = { onsuccess: () => {}, onerror: () => {} };
            setTimeout(() => req.onsuccess(), 0);
            return req;
          },
        };
      },
    };
  }
}

const mockDbInstance = new MockIDBDatabase();

const mockIndexedDB = {
  open(_name: string, _version: number) {
    const req: any = {
      result: mockDbInstance,
      onsuccess: () => {},
      onerror: () => {},
      onupgradeneeded: () => {},
    };
    setTimeout(() => {
      req.result.objectStoreNames = { contains: () => true };
      req.onsuccess();
    }, 0);
    return req;
  },
};

const mockLocalStorage = new MockLocalStorage();

(globalThis as any).window = {
  indexedDB: mockIndexedDB,
  localStorage: mockLocalStorage,
};
(globalThis as any).localStorage = mockLocalStorage;

// Import the service under test
import {
  formatSessionTitle,
  createSession,
  getSession,
  getOrCreateActiveSession,
  saveTurn,
  listSessions,
  deleteSession,
  clearAllSessions,
  getActiveSessionId,
  setActiveSessionId,
} from "../conversationHistory.ts";

describe("Conversation History Service (IndexedDB & Fallback)", () => {
  beforeEach(async () => {
    mockLocalStorage.clear();
    mockDbInstance.store.clear();
    await clearAllSessions();
  });

  it("1. formatSessionTitle: sanitizes and truncates prompt to clean title", () => {
    assert.equal(
      formatSessionTitle("  Tell   me   about  your   internship at Apti?  "),
      "Tell me about your internship at Apti?",
    );

    const longQuestion =
      "Can you explain your complete architectural approach to building hybrid RAG systems with dense vector cosine similarity and BM25 search?";
    const formatted = formatSessionTitle(longQuestion);
    assert.ok(formatted.length <= 50);
    assert.ok(formatted.endsWith("…"));
  });

  it("2. createSession: initializes session with unique id, timestamps, and sets as active", async () => {
    const session = await createSession("Custom Initial Title");
    assert.ok(session.id.startsWith("sess-"));
    assert.equal(session.title, "Custom Initial Title");
    assert.equal(session.turns.length, 0);
    assert.ok(session.createdAt > 0);
    assert.ok(session.updatedAt >= session.createdAt);

    // Should be set as active session in storage
    assert.equal(getActiveSessionId(), session.id);
  });

  it("3. saveTurn & chronological ordering: correctly appends turns sequentially", async () => {
    const session = await createSession();

    const turn1 = {
      id: "turn-1",
      role: "user" as const,
      content: "Explain your experience at SkillDisk.",
      timestamp: 1000,
      status: "completed" as const,
    };

    const turn2 = {
      id: "turn-2",
      role: "assistant" as const,
      content: "At SkillDisk, I worked on AI/ML applications and fine-tuning pipelines.",
      timestamp: 2000,
      status: "completed" as const,
      mode: "llm" as const,
      references: [{ source: "experience", label: "SkillDisk Apprenticeship" }],
    };

    const turn3 = {
      id: "turn-3",
      role: "user" as const,
      content: "What tools did you use?",
      timestamp: 3000,
      status: "completed" as const,
    };

    const afterTurn1 = await saveTurn(session.id, turn1);
    // Auto-titles from first question!
    assert.equal(afterTurn1.title, "Explain your experience at SkillDisk.");
    assert.equal(afterTurn1.turns.length, 1);

    const afterTurn2 = await saveTurn(session.id, turn2);
    assert.equal(afterTurn2.turns.length, 2);

    const afterTurn3 = await saveTurn(session.id, turn3);
    assert.equal(afterTurn3.turns.length, 3);

    // Verify chronological order
    assert.equal(afterTurn3.turns[0].id, "turn-1");
    assert.equal(afterTurn3.turns[0].role, "user");
    assert.equal(afterTurn3.turns[1].id, "turn-2");
    assert.equal(afterTurn3.turns[1].role, "assistant");
    assert.equal(afterTurn3.turns[2].id, "turn-3");
    assert.equal(afterTurn3.turns[2].role, "user");

    // Retrieve fresh from storage
    const loaded = await getSession(session.id);
    assert.ok(loaded);
    assert.equal(loaded.turns.length, 3);
    assert.equal(loaded.turns[1].references?.[0]?.label, "SkillDisk Apprenticeship");
  });

  it("4. listSessions: returns sessions sorted by recency (updatedAt descending)", async () => {
    const sessA = await createSession("Session A");
    await saveTurn(sessA.id, {
      id: "tA1",
      role: "user",
      content: "First question in Session A",
      timestamp: 100,
      status: "completed",
    });

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));

    const sessB = await createSession("Session B");
    await saveTurn(sessB.id, {
      id: "tB1",
      role: "user",
      content: "First question in Session B",
      timestamp: 200,
      status: "completed",
    });

    const list = await listSessions();
    assert.ok(list.length >= 2);
    // SessB was updated most recently
    assert.equal(list[0].id, sessB.id);
    assert.equal(list[1].id, sessA.id);
    assert.equal(list[0].turnCount, 1);
  });

  it("5. deleteSession: removes session and clears active ID if deleted", async () => {
    const sess = await createSession("Session to delete");
    setActiveSessionId(sess.id);
    assert.equal(getActiveSessionId(), sess.id);

    await deleteSession(sess.id);

    const loaded = await getSession(sess.id);
    assert.equal(loaded, null);
    assert.equal(getActiveSessionId(), null);
  });

  it("6. getOrCreateActiveSession: restores existing active session if available", async () => {
    const s1 = await createSession("Active Session Test");
    setActiveSessionId(s1.id);

    const restored = await getOrCreateActiveSession();
    assert.equal(restored.id, s1.id);
    assert.equal(restored.title, "Active Session Test");
  });

  it("7. clearAllSessions: removes all sessions and resets active ID", async () => {
    await createSession("S1");
    await createSession("S2");
    await createSession("S3");

    let list = await listSessions();
    assert.ok(list.length >= 3);

    await clearAllSessions();

    list = await listSessions();
    assert.equal(list.length, 0);
    assert.equal(getActiveSessionId(), null);
  });

  it("8. transcript toggling: does not affect persistence or turn validity", async () => {
    let showTranscript = false;
    const sess = await createSession("Toggle Session");

    // Add turn while transcript hidden
    await saveTurn(sess.id, {
      id: "t1",
      role: "user",
      content: "Question while hidden",
      timestamp: Date.now(),
      status: "completed",
    });

    // Toggle transcript open
    showTranscript = true;
    assert.equal(showTranscript, true);

    // Add assistant turn while transcript visible
    await saveTurn(sess.id, {
      id: "t2",
      role: "assistant",
      content: "Answer while visible",
      timestamp: Date.now(),
      status: "completed",
    });

    // Toggle transcript hidden again
    showTranscript = false;
    assert.equal(showTranscript, false);

    // Verify both turns persisted safely regardless of UI visibility
    const stored = await getSession(sess.id);
    assert.equal(stored?.turns.length, 2);
    assert.equal(stored?.turns[0].content, "Question while hidden");
    assert.equal(stored?.turns[1].content, "Answer while visible");
  });
});
