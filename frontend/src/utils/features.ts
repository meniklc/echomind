/**
 * Build-time feature flags.
 *
 * The Admin knowledge-ingestion panel depends on Supabase Auth, which is not yet
 * configured for public production use. It is therefore only exposed in local
 * development, or when `VITE_ENABLE_ADMIN` is explicitly set to "true".
 *
 * Note: this only controls *visibility*. Every `/api/admin/*` endpoint enforces
 * owner authentication server-side, so hiding the tab is never the security
 * boundary.
 */
export function isAdminEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  return import.meta.env.VITE_ENABLE_ADMIN === "true";
}

export const ADMIN_ENABLED = isAdminEnabled();
