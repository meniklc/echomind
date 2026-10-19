# EchoMind Phase 1 — Stabilization & Audit

> **Status:** local stabilization complete and verified; **not yet committed or deployed**.
> This document supersedes the accuracy of the older `docs/phase1_*.md` files for the
> current codebase. Those files describe an earlier implementation run and their test
> counts (29/30) no longer match the repository.

## 1. Scope

Phase 1 only: diagnose the real production failures, fix them, and test them.
Phases 2–7 are **not** implemented here; see the roadmap at the end.

## 2. Root causes found

| Symptom | Root cause | Evidence |
| --- | --- | --- |
| Chat always answered in `fact_retrieval` mode, with "the configured language model was unavailable". | Groq retired `llama-3.3-70b-versatile` (Render blueprint) and `llama-3.1-8b-instant` (default). Both return HTTP 404 `model_not_found`. | Live Groq calls; deployed `/api/chat` returned `"mode":"fact_retrieval"`. |
| Voice sounded male / wrong. | Edge TTS websocket returns HTTP 403 from Microsoft, so the client fell back to the browser's default voice (often male). Additionally an empty/invalid `TTS_VOICE` silently fell back to the OS voice. | Local Edge TTS request → 403. |
| Questions like "about your projects" were misread as a self-introduction. | Naive substring match on `"about you"` matched `"about your projects"`. | Retrieval unit tests. |
| Education questions phrased as "where do you study" returned nothing. | Missing `study/studying/studies` intent keywords. | Retrieval tests. |
| Admin tab visible in production. | No build-time gate; Supabase Auth not configured. | Frontend inspection. |
| Tests polluted a tracked file. | Ingestion tests appended to `backend/app/knowledge/sessions.json`. | `git diff` after a test run. |

## 3. Changes made

### Backend

- `app/core/config.py`
  - `llm_model` default → `openai/gpt-oss-20b`.
  - New `llm_fallback_models` (`LLM_FALLBACK_MODELS`) and `llm_max_tokens` (`LLM_MAX_TOKENS=800`).
  - New `llm_model_candidates` property: ordered, de-duplicated, primary first.
- `app/services/llm.py`
  - Per-request model fallback on `400/404` + `model_not_found`/decommissioned codes, so a stale
    Render env self-heals without a redeploy.
  - Explicit handling for 401 (auth), 429 (rate limit), timeout, transport errors, malformed
    JSON, and empty content.
  - Structured warnings log the model/status/code — never the key or headers.
  - `FactRetrievalProvider` now handles identity/name intent and produces a data-driven,
    honest "not documented" message from the knowledge base.
- `app/services/retrieval.py`
  - Word-boundary matching for `about you` / `about yourself` / `who you are`.
  - Added identity-name and education ("study") intents; broadened project-list phrasings.
  - `interests`, `verified_documents` count as substantive facts.
- `app/services/tts.py`
  - `DEFAULT_TTS_VOICE = "en-US-JennyNeural"` and `resolve_voice()`: empty/malformed voice ids
    fall back safely; well-formed unknown ids are preserved.
- `app/api/routes.py` / `app/schemas/health.py`
  - `/health` now reports `llm_model` (only when configured) and the resolved `tts_voice`.
    It never exposes the API key.
  - `/api/tts/voices` also returns the `default` voice.
- `app/services/chat.py`
  - `status` is consistent (`insufficient_info` when no substantive facts), and the fallback
    reply is still labelled as fact retrieval.

### Frontend

- `src/utils/features.ts` (new): `ADMIN_ENABLED` — true in dev, or when
  `VITE_ENABLE_ADMIN=true`.
- `Navbar.tsx` / `HomePage.tsx`: hide the Admin tab in production unless enabled, and never
  leave the UI on an unreachable tab.
- `HomePage.tsx`: production load-error text no longer tells users to run a local server.
- `useConversation.ts`: browser fallback prefers a female English voice.

### Config / docs

- `render.yaml`: `LLM_MODEL=openai/gpt-oss-20b`, `LLM_FALLBACK_MODELS=openai/gpt-oss-120b`,
  CORS origin corrected to the verified production frontend
  (`https://echomind-frontend-umber.vercel.app`).
- `.env.example`, `backend/.env.example`, `frontend/.env.example` updated accordingly.

## 4. Verification performed

| Check | Result |
| --- | --- |
| Backend test suite (`pytest -q`) | **102 passed** |
| Frontend unit tests (`npm test`) | **8 passed** |
| Frontend production build (`npm run build`) | **OK** (tsc + vite) |
| Local `/health` with real key | `llm_mode=llm`, `llm_model=openai/gpt-oss-20b` |
| Local `/api/chat` with real Groq key | `mode=llm`, grounded answer |
| Stale model (`llama-3.3-70b-versatile`) → real Groq 404 | logged fallback, then `mode=llm` via `openai/gpt-oss-20b` |
| Deployed admin routes | `/api/admin/auth/me`, `/ingest/status`, `/ingest/pending` → **401** |
| `sessions.json` after tests | unchanged relative to the user's pre-existing edit |

Deployed `/health` still lacks the new fields and deployed `/api/chat` still returns
`fact_retrieval` — **the deployed backend is running the old code**. A redeploy is required.

## 5. Known external blockers

- **Edge TTS 403** from Microsoft (`wss://speech.platform.bing.com/...`) cannot be fixed in
  code. Until it recovers, the app uses the browser voice (now preferring a female English one).
- **Render dashboard** may still hold `LLM_MODEL=llama-3.3-70b-versatile`. The code tolerates it
  via fallback, but the dashboard/blueprint should be set to `openai/gpt-oss-20b` for clarity.

## 6. Roadmap (not implemented)

- **Phase 2** — Deploy this stabilization to Render/Vercel and verify production E2E.
- **Phase 3** — Real authentication for the admin/ingestion panel (Supabase Auth wiring).
- **Phase 4** — Ingestion pipeline hardening (validation, idempotency, provenance).
- **Phase 5** — Retrieval quality evaluation and broader question coverage.
- **Phase 6** — Multi-persona / "Digital Me" architecture (tenant-scoped knowledge bases).
- **Phase 7** — Observability, rate limiting, and cost controls.
