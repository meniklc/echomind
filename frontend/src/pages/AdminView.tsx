/**
 * AdminView — EchoMind Knowledge Ingestion Admin Panel
 *
 * Provides:
 *  - Ingestion status overview (total / verified / pending facts, last sync, source breakdown)
 *  - GitHub sync: trigger re-sync for the meniklc profile
 *  - File upload: resume, project docs (PDF / DOCX / TXT / MD / JSON)
 *  - LinkedIn export import: structured parse with pending review
 *  - Pending fact review: approve / reject facts before they enter the retrieval index
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FactItem,
  IngestionResult,
  IngestionStatus,
} from "../services/api";
import {
  fetchIngestionStatus,
  fetchPendingFacts,
  reviewFact,
  syncGitHub,
  uploadFile,
  uploadLinkedIn,
  ApiError,
  checkAdminAccess,
} from "../services/api";
import { getSupabaseAuthClient } from "../services/auth";
import type { Session } from "@supabase/supabase-js";

// ============================================================
// Utility components
// ============================================================

function Badge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: "success" | "warning" | "danger" | "neutral" | "info";
}) {
  const cls = {
    success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    warning: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    danger: "bg-rose-500/10 text-rose-300 border-rose-500/25",
    neutral: "bg-slate-700/50 text-slate-400 border-slate-600/50",
    info: "bg-teal-500/10 text-teal-300 border-teal-500/25",
  }[variant];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[#0c1220] px-4 py-4 flex flex-col gap-1">
      <p className="text-[11px] uppercase tracking-widest text-[var(--muted)]">
        {label}
      </p>
      <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-teal-400 mb-3 flex items-center gap-2">
      <span className="h-px flex-1 bg-teal-500/20" />
      {children}
      <span className="h-px flex-1 bg-teal-500/20" />
    </h2>
  );
}

function AlertBox({
  type,
  message,
}: {
  type: "error" | "success" | "info";
  message: string;
}) {
  const cls = {
    error: "border-rose-500/30 bg-rose-500/5 text-rose-300",
    success: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    info: "border-teal-500/30 bg-teal-500/5 text-teal-300",
  }[type];
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${cls}`}
      role="alert"
    >
      {message}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-teal-400"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="60"
        strokeDashoffset="15"
      />
    </svg>
  );
}

// ============================================================
// Status Overview
// ============================================================

function StatusPanel({
  status,
  loading,
  onRefresh,
}: {
  status: IngestionStatus | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const lastSync = status?.last_sync_time
    ? new Date(status.last_sync_time).toLocaleString()
    : "Never";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeading>Knowledge Index Status</SectionHeading>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-slate-400 hover:text-white transition disabled:opacity-50"
        >
          {loading ? <Spinner /> : <span>&#8635;</span>}
          Refresh
        </button>
      </div>

      {loading && !status ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : status ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Facts" value={status.total_facts} />
            <StatCard
              label="Verified"
              value={status.verified_facts}
              sub="Active in retrieval"
            />
            <StatCard
              label="Pending Review"
              value={status.pending_review_facts}
              sub="Awaiting admin approval"
            />
            <StatCard label="Last Sync" value={lastSync} />
          </div>

          {Object.keys(status.sources_summary).length > 0 && (
            <div className="rounded-xl border border-[var(--line)] bg-[#0c1220] p-4">
              <p className="text-xs uppercase tracking-widest text-[var(--muted)] mb-3">
                Source Breakdown
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(status.sources_summary).map(
                  ([source, count]) => (
                    <div
                      key={source}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs"
                    >
                      <span className="text-teal-300 font-medium">{count}</span>
                      <span className="text-[var(--muted)]">{source}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <AlertBox type="info" message="Connect to the backend to see status." />
      )}
    </div>
  );
}

// ============================================================
// GitHub Sync
// ============================================================

function GitHubSyncPanel({
  onComplete,
}: {
  onComplete: (result: IngestionResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [token, setToken] = useState("");
  const [includeReadmes, setIncludeReadmes] = useState(true);

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await syncGitHub("meniklc", token || undefined, includeReadmes);
      setResult(res);
      onComplete(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHeading>GitHub Sync</SectionHeading>
      <p className="text-xs text-[var(--muted)] leading-relaxed">
        Syncs all public (non-forked) repositories from{" "}
        <a
          href="https://github.com/meniklc"
          target="_blank"
          rel="noreferrer"
          className="text-teal-400 hover:underline"
        >
          github.com/meniklc
        </a>{" "}
        including metadata and READMEs. Excludes forks, secrets, and build
        artifacts. Results are auto-verified and immediately searchable.
      </p>

      <div className="rounded-xl border border-[var(--line)] bg-[#0c1220] p-4 space-y-3">
        <div>
          <label
            htmlFor="gh-token"
            className="block text-xs text-[var(--muted)] mb-1"
          >
            Optional: GitHub Token (higher rate limit, never stored server-side)
          </label>
          <input
            id="gh-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_..."
            className="w-full rounded-lg border border-[var(--line)] bg-[#070b14] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input
            type="checkbox"
            checked={includeReadmes}
            onChange={(e) => setIncludeReadmes(e.target.checked)}
            className="accent-teal-400"
          />
          Include README files
        </label>

        <button
          type="button"
          id="admin-github-sync-btn"
          onClick={() => void handleSync()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500/10 border border-teal-500/30 px-4 py-2.5 text-sm font-medium text-teal-300 hover:bg-teal-500/15 transition disabled:opacity-50"
        >
          {loading ? (
            <>
              <Spinner /> Syncing repositories...
            </>
          ) : (
            "Sync GitHub Repositories"
          )}
        </button>
      </div>

      {error && <AlertBox type="error" message={error} />}
      {result && <IngestionResultCard result={result} />}
    </div>
  );
}

// ============================================================
// File Upload
// ============================================================

function FileUploadPanel({
  label,
  description,
  acceptedFormats,
  onUpload,
  panelId,
}: {
  label: string;
  description: string;
  acceptedFormats: string;
  onUpload: (file: File) => Promise<IngestionResult>;
  panelId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await onUpload(file);
        setResult(res);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setLoading(false);
      }
    },
    [onUpload],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="space-y-3">
      <SectionHeading>{label}</SectionHeading>
      <p className="text-xs text-[var(--muted)] leading-relaxed">{description}</p>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-xl border-2 border-dashed border-[var(--line)] hover:border-teal-500/40 bg-[#0c1220] px-6 py-8 text-center transition group"
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          id={`${panelId}-file-input`}
          type="file"
          accept={acceptedFormats}
          className="hidden"
          onChange={handleChange}
        />
        <div className="text-3xl mb-3 opacity-60 group-hover:opacity-90 transition">
          {loading ? "" : ""}
        </div>
        <p className="text-sm text-slate-400 group-hover:text-slate-200 transition">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner /> Processing {fileName}...
            </span>
          ) : fileName ? (
            <span>
              <span className="text-teal-300">{fileName}</span> — click or drop
              another file
            </span>
          ) : (
            <>
              Drop a file here or{" "}
              <span className="text-teal-400">click to browse</span>
            </>
          )}
        </p>
        <p className="text-[11px] text-slate-600 mt-1">{acceptedFormats}</p>
      </div>

      {error && <AlertBox type="error" message={error} />}
      {result && <IngestionResultCard result={result} />}
    </div>
  );
}

// ============================================================
// Ingestion Result Card
// ============================================================

function IngestionResultCard({ result }: { result: IngestionResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-emerald-300 font-semibold text-sm">
          Ingestion complete
        </span>
        <Badge label={`${result.imported_count} imported`} variant="success" />
        {result.pending_count > 0 && (
          <Badge
            label={`${result.pending_count} pending review`}
            variant="warning"
          />
        )}
        {result.conflicts_detected > 0 && (
          <Badge
            label={`${result.conflicts_detected} conflict(s)`}
            variant="danger"
          />
        )}
      </div>
      <p className="text-xs text-[var(--muted)]">Source: {result.source}</p>

      {result.details.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="text-xs text-teal-400 hover:underline"
          >
            {expanded ? "Hide" : "Show"} {result.details.length} detail(s)
          </button>
          {expanded && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
              {result.details.map((fact) => (
                <div
                  key={fact.id}
                  className="flex items-start gap-2 text-xs text-slate-400"
                >
                  <span
                    className={
                      fact.verification_status === "verified"
                        ? "text-emerald-400"
                        : fact.verification_status === "pending_review"
                          ? "text-amber-400"
                          : "text-rose-400"
                    }
                  >
                    {fact.verification_status === "verified"
                      ? "[ok]"
                      : fact.verification_status === "pending_review"
                        ? "[pending]"
                        : "[rejected]"}
                  </span>
                  <span className="flex-1 leading-snug">{fact.title}</span>
                  {fact.conflicts.length > 0 && (
                    <Badge label="conflict" variant="danger" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Pending Facts Review Panel
// ============================================================

function PendingReviewPanel({ onActed }: { onActed: () => void }) {
  const [facts, setFacts] = useState<FactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pending = await fetchPendingFacts();
      setFacts(pending);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load pending facts.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActingId(id);
    try {
      await reviewFact(id, action);
      setFacts((prev) => prev.filter((f) => f.id !== id));
      onActed();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeading>Pending Review</SectionHeading>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-xs text-teal-400 hover:underline disabled:opacity-50"
        >
          {loading ? "Loading..." : "Reload"}
        </button>
      </div>

      {error && <AlertBox type="error" message={error} />}

      {loading && facts.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : facts.length === 0 ? (
        <AlertBox
          type="success"
          message="No facts pending review. All knowledge is approved and active."
        />
      ) : (
        <div className="space-y-2">
          {facts.map((fact) => {
            const isExpanded = expandedId === fact.id;
            const acting = actingId === fact.id;
            return (
              <div
                key={fact.id}
                className="rounded-xl border border-amber-500/20 bg-amber-500/4 p-4 space-y-2"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center mb-1">
                      <Badge label={fact.entity_type} variant="neutral" />
                      <Badge label={fact.source} variant="info" />
                      {fact.conflicts.length > 0 && (
                        <Badge
                          label={`${fact.conflicts.length} conflict`}
                          variant="danger"
                        />
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {fact.title}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {fact.source_url_or_file} &middot;{" "}
                      {new Date(fact.import_date).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      id={`admin-approve-${fact.id}`}
                      onClick={() => void handleAction(fact.id, "approve")}
                      disabled={acting}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-50"
                    >
                      {acting ? "..." : "Approve"}
                    </button>
                    <button
                      type="button"
                      id={`admin-reject-${fact.id}`}
                      onClick={() => void handleAction(fact.id, "reject")}
                      disabled={acting}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
                    >
                      {acting ? "..." : "Reject"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : fact.id)
                      }
                      className="text-xs text-slate-500 hover:text-slate-300 transition px-1"
                    >
                      {isExpanded ? "Hide" : "View"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap border-t border-amber-500/10 pt-2">
                      {fact.content.slice(0, 600)}
                      {fact.content.length > 600 && "..."}
                    </p>

                    {fact.conflicts.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-rose-300">
                          Detected conflicts:
                        </p>
                        {fact.conflicts.map((c, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300"
                          >
                            <span className="font-medium capitalize">
                              [{c.severity}]
                            </span>{" "}
                            {c.description}
                            {c.existing_value && (
                              <span className="text-slate-500">
                                {" "}
                                (existing: {c.existing_value})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main AdminView export
// ============================================================

export function AdminView() {
  const [authState, setAuthState] = useState<
    "checking" | "signed_out" | "owner" | "forbidden" | "error" | "unconfigured"
  >("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const authCheckId = useRef(0);
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const validateSession = useCallback(async (session: Session | null) => {
    const checkId = ++authCheckId.current;
    setAuthError(null);
    if (!session) {
      setAuthState("signed_out");
      return;
    }

    setAuthState("checking");
    try {
      await checkAdminAccess(session.access_token);
      if (checkId === authCheckId.current) setAuthState("owner");
    } catch (err: unknown) {
      if (checkId !== authCheckId.current) return;
      if (err instanceof ApiError && err.status === 403) {
        setAuthState("forbidden");
        setAuthError("This account is authenticated but is not on the owner allowlist.");
      } else if (err instanceof ApiError && err.status === 401) {
        setAuthState("signed_out");
        setAuthError("Your session is invalid or expired. Please sign in again.");
      } else {
        setAuthState("error");
        setAuthError(err instanceof Error ? err.message : "Owner access could not be verified.");
      }
    }
  }, []);

  useEffect(() => {
    const client = getSupabaseAuthClient();
    if (!client) {
      setAuthState("unconfigured");
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthState("error");
        setAuthError("Unable to check the sign-in session.");
        return;
      }
      void validateSession(data.session);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (active) void validateSession(session);
    });
    return () => {
      active = false;
      authCheckId.current += 1;
      subscription.unsubscribe();
    };
  }, [validateSession]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = getSupabaseAuthClient();
    if (!client) {
      setAuthState("unconfigured");
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    setSigningIn(false);
    if (error) {
      setAuthError("Sign-in failed. Check the email and password, then try again.");
      return;
    }
    setPassword("");
    await validateSession(data.session);
  };

  const handleSignOut = async () => {
    const client = getSupabaseAuthClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      setAuthError("Could not sign out cleanly. Please retry.");
      return;
    }
    setAuthState("signed_out");
  };

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const s = await fetchIngestionStatus();
      setStatus(s);
    } catch (err: unknown) {
      setStatusError(
        err instanceof Error
          ? err.message
          : "Backend unavailable. Start FastAPI on port 8001 and try again.",
      );
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authState === "owner") void loadStatus();
  }, [authState, loadStatus, refreshCount]);

  const triggerRefresh = () => setRefreshCount((c) => c + 1);

  if (authState !== "owner") {
    return (
      <div className="mx-auto max-w-lg w-full px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-[var(--line)] bg-[#0c1220] p-6 space-y-4">
          <h1 className="text-xl font-display font-bold text-white">Owner sign-in</h1>
          {authState === "checking" ? (
            <div className="flex justify-center py-4" role="status">
              <Spinner />
            </div>
          ) : authState === "unconfigured" ? (
            <AlertBox
              type="error"
              message="Owner sign-in is not configured. Set the Supabase frontend URL and publishable/anon key."
            />
          ) : authState === "forbidden" ? (
            <>
              <AlertBox type="error" message={authError || "Owner access is required."} />
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-slate-300"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              {authError && <AlertBox type="error" message={authError} />}
              <form onSubmit={(event) => void handleSignIn(event)} className="space-y-3">
                <label className="block space-y-1 text-xs text-[var(--muted)]">
                  Email
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-[var(--line)] bg-[#070b14] px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block space-y-1 text-xs text-[var(--muted)]">
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-[var(--line)] bg-[#070b14] px-3 py-2 text-sm text-white"
                  />
                </label>
                <button
                  type="submit"
                  disabled={signingIn}
                  className="rounded-lg bg-teal-500/15 px-4 py-2 text-sm font-medium text-teal-300 disabled:opacity-50"
                >
                  {signingIn ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-8 sm:px-6 space-y-10">
      {/* Page header */}
      <div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-display font-bold text-white tracking-tight">
            Knowledge Admin
          </h1>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-slate-400 hover:text-white"
          >
            Sign out
          </button>
        </div>
        <p className="text-sm text-[var(--muted)] mt-1">
          Import, review, and manage the knowledge index that powers
          EchoMind&apos;s responses. Facts must pass an admin review step before
          entering the retrieval pipeline.
        </p>
        {statusError && (
          <div className="mt-3">
            <AlertBox type="error" message={statusError} />
          </div>
        )}
      </div>

      {/* Status overview */}
      <StatusPanel
        status={status}
        loading={statusLoading}
        onRefresh={triggerRefresh}
      />

      <div className="h-px bg-[var(--line)]" />

      {/* GitHub sync */}
      <GitHubSyncPanel onComplete={triggerRefresh} />

      <div className="h-px bg-[var(--line)]" />

      {/* Resume / document upload */}
      <FileUploadPanel
        label="Resume / Document Upload"
        description="Upload your resume or project documentation (PDF, DOCX, TXT, Markdown, or JSON). Text is extracted, sanitised, and queued for review before entering the retrieval index."
        acceptedFormats=".pdf,.docx,.txt,.md,.json"
        onUpload={uploadFile}
        panelId="resume-upload"
      />

      <div className="h-px bg-[var(--line)]" />

      {/* LinkedIn export */}
      <FileUploadPanel
        label="LinkedIn Export Import"
        description="Download your LinkedIn data archive (Settings > Data Privacy > Get a copy of your data) and upload the Profile PDF or a CSV/TXT export. EchoMind parses it locally — LinkedIn is never scraped."
        acceptedFormats=".pdf,.txt,.csv"
        onUpload={uploadLinkedIn}
        panelId="linkedin-upload"
      />

      <div className="h-px bg-[var(--line)]" />

      {/* Pending review */}
      <PendingReviewPanel onActed={triggerRefresh} />

      {/* Footer */}
      <p className="text-xs text-slate-600 text-center pb-4">
        Admin actions affect only the local knowledge index. No API keys or
        personal data are transmitted outside your network during review.
      </p>
    </div>
  );
}
