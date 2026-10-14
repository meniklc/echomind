# EchoMind

Voice-first AI digital twin for a professional portfolio. Recruiters can ask questions by microphone or text, read captioned answers, and hear neural TTS when available.

EchoMind is an **AI representation** of the portfolio owner — it does not pretend to be the human candidate.

## Repository status

Monorepo MVP:

- `frontend/` — React + Vite + TypeScript + Tailwind CSS
- `backend/` — FastAPI + structured JSON knowledge base + Edge TTS + OpenAI-compatible LLM (optional)

## Quick start

### 1. Backend

```bash
python -m venv .venv

# Windows
.\.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r backend/requirements.txt
copy backend\.env.example backend\.env   # Windows
# cp backend/.env.example backend/.env  # macOS / Linux

cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

This repo’s Vite proxy defaults to port `8001` (override with `VITE_PROXY_TARGET`, e.g. `http://127.0.0.1:8000`).

Health check: [http://127.0.0.1:8001/health](http://127.0.0.1:8001/health)

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` and `/health` to the backend (`http://127.0.0.1:8001` by default in this repo; override with `VITE_PROXY_TARGET` if needed).

## Configuration

Copy `backend/.env.example` → `backend/.env`.

| Variable | Purpose |
| --- | --- |
| `CORS_ORIGINS` | Allowed frontend origins (comma-separated) |
| `LLM_API_KEY` | Optional. Empty → **fact-retrieval mode** (no paid API) |
| `LLM_BASE_URL` | OpenAI-compatible base URL (default Groq-compatible) |
| `LLM_MODEL` | Model name |
| `TTS_VOICE` | Edge TTS neural voice (default `en-US-JennyNeural`) |
| `SUPABASE_URL` | Supabase project URL used by backend token verification |
| `OWNER_USER_IDS` | Comma-separated Supabase Auth user UUIDs authorized for admin APIs |
| `SUPABASE_JWT_AUDIENCE` | Access-token audience (default `authenticated`) |
| `SUPABASE_JWT_SECRET` | Backend-only legacy HS256 signing secret, if applicable |
| `VITE_SUPABASE_URL` | Frontend Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend publishable/anon key only; never a service-role key |

Admin sign-in uses Supabase Auth email/password. The frontend anon/publishable key is public by design; the backend independently verifies each admin access token and enforces `OWNER_USER_IDS`. See the [deployment guide](./docs/deployment_guide.md#21-owner-authentication-for-admin-operations) for setup.

### LLM modes

1. **Fact-retrieval mode** (default when `LLM_API_KEY` is empty): answers are composed only from retrieved JSON facts. No external model is called, and responses are not claimed as LLM output.
2. **LLM mode**: set `LLM_API_KEY` (and optionally `LLM_BASE_URL` / `LLM_MODEL`) for an OpenAI-compatible free-tier or local endpoint (for example Groq or Ollama’s OpenAI-compatible API).

If the configured LLM fails at runtime, the API falls back to fact retrieval and notes that in the answer.

### Knowledge base (edit without code changes)

- `backend/app/knowledge/profile.json`
- `backend/app/knowledge/projects.json`

Fields marked `PLACEHOLDER` must be replaced with verified details. Do not invent employers, metrics, certifications, or outcomes.

**Verified so far from public GitHub (`meniklc`):**

- Name: K L C Medha Nipuna
- GitHub: https://github.com/meniklc
- Project repo URLs for Phishcure, COVID-19 mini project, HemoCloud (BBMS candidate), NexusOps AI

Please supply: headline, summary, education, skills, experience, career goals, resume/LinkedIn/email, and non-placeholder project descriptions/contributions/outcomes. Confirm whether BBMS maps to HemoCloud and add CogniX details if it should appear publicly.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Service health + LLM/TTS mode |
| `GET` | `/api/profile` | Public portfolio JSON |
| `POST` | `/api/chat` | Profile-grounded Q&A |
| `POST` | `/api/tts` | Returns `audio/mpeg` (Edge TTS) |

## Tests

```bash
# Backend (from repo root, venv active)
cd backend
pytest -q

# Frontend production build
cd frontend
npm run build
```

## Deployment notes

### Frontend (Vercel / static host)

1. Set root to `frontend` (or configure install/build commands for that folder).
2. Build: `npm run build`
3. Output: `frontend/dist`
4. Set `VITE_API_BASE_URL` to your public backend URL (no trailing slash).

### Backend (Python host)

Deploy the `backend` app with uvicorn/gunicorn-compatible ASGI hosting.

Requirements:

- Outbound HTTPS for Edge TTS and (if enabled) the LLM provider
- Environment variables from `.env.example`
- Update `CORS_ORIGINS` to your frontend domain(s)

Persistent local disk is not required; TTS uses temporary files and deletes them after synthesis.

## Voice behaviour

- Microphone is **not** auto-started on page load
- Browser Web Speech API when supported; text input always available
- Backend neural TTS via `edge-tts` (requires outbound access to Microsoft Edge neural voices)
- If backend TTS fails, the UI falls back to the browser `speechSynthesis` API so answers can still be spoken
- Captions remain if all speech output fails
- Stop / replay controls for audio
- Sequential turn-taking (not full-duplex)

**Note:** Older `edge-tts` versions may receive HTTP 403 from the speech service. This project pins `edge-tts==7.2.8`. The Microsoft endpoint can still change without notice — treat Edge TTS as a free-to-start MVP dependency, not a production SLA.

## Out of scope (MVP)

Voice cloning, photorealistic avatars, lip-sync, vector DB RAG, auth, and paid APIs as hard dependencies.
