# EchoMind Production Deployment & Architecture Guide

This guide covers deploying **EchoMind** 100% within the generous **Free Tiers** of Render, Vercel, Supabase, Groq, and Edge TTS, with zero continuous hosting costs.

---

## 1. Free-Tier Stack Overview

| Component | Provider | Tier & Resource Limits | Monthly Cost | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com) | Hobby Tier (100GB bandwidth, unlimited builds) | **$0.00** | Instant global edge CDN, automatic HTTPS, SPA rewrites. |
| **Backend API** | [Render](https://render.com) | Free Web Service (512MB RAM, 0.1 CPU) | **$0.00** | Spins down after 15 min of inactivity (cold start ~40s). |
| **LLM Inference** | [Groq](https://groq.com) | Developer Free Tier (30 RPM, 14,400 RPD) | **$0.00** | `llama-3.3-70b-versatile` ultra-fast LPUs. |
| **Speech (TTS)** | [Edge TTS](https://github.com/rany2/edge-tts) | Microsoft Cognitive Free Endpoint | **$0.00** | Neural natural voices (`Jenny`, `Guy`, `Prabhat`). No GPU needed. |
| **Durable Database** | [Supabase](https://supabase.com) | Free Tier (500MB PostgreSQL, 50,000 MAU) | **$0.00** | Stores session turns and ingested facts across devices. |

---

## 2. Supabase Storage Setup (Optional but Recommended)

If you wish to synchronize conversation history across multiple devices:
1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the following schema:
```sql
-- Sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation turns table
CREATE TABLE IF NOT EXISTS public.turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    mode TEXT,
    references JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ingested facts ledger
CREATE TABLE IF NOT EXISTS public.ingested_facts (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url_or_file TEXT,
    import_date TIMESTAMPTZ DEFAULT NOW(),
    verification_status TEXT NOT NULL DEFAULT 'pending_review',
    metadata JSONB DEFAULT '{}'::jsonb
);
```
3. Copy your **Project URL** and **Anon / Public Key** from **Settings → API**.
4. Set them as `SUPABASE_URL` and `SUPABASE_KEY` in your environment.
*(Note: If left empty, EchoMind automatically falls back to local JSON storage and browser IndexedDB.)*

## 2.1 Owner Authentication for Admin Operations

Admin endpoints require a Supabase Auth access token and an owner user ID allowlisted by the backend. Create/confirm the owner account in Supabase Auth, then set:

- Backend `SUPABASE_URL`: the project URL.
- Backend `OWNER_USER_IDS`: the owner Auth user UUID (comma-separated for multiple explicitly authorized owners).
- Backend `SUPABASE_JWT_AUDIENCE`: `authenticated` unless the project uses a different audience.
- Frontend `VITE_SUPABASE_URL`: the same project URL.
- Frontend `VITE_SUPABASE_ANON_KEY`: the Supabase publishable/anon key only. Vite variables are included in the browser bundle; never put a service-role key or signing secret here.
- Backend `SUPABASE_JWT_SECRET`: only needed for legacy HS256 signing projects. Keep it exclusively in backend deployment secrets. Asymmetric signing keys are verified through Supabase's JWKS endpoint.

The backend verifies token signature, issuer, audience, expiration, and subject. It compares the verified subject to `OWNER_USER_IDS`; client-provided identity or UI visibility does not grant access. Every `/api/admin/*` endpoint, including pending-fact reads and approval actions, is protected. Keep Supabase Auth signups restricted to intended users and apply database/storage access policies if those services are later used for private data.

For projects using legacy HS256 signing, set `SUPABASE_JWT_SECRET` only as a backend secret; it is not needed for asymmetric JWKS signing. Disable public signup in Supabase Auth unless public account creation is explicitly needed. Non-owner accounts remain blocked by the backend allowlist.

Authentication does not change the current persistence design: facts and approvals remain in the local JSON ledger, and the conversation history remains browser-local. Do not treat this phase as a storage migration.

---

## 3. Backend Deployment on Render

1. Create a free account at [render.com](https://render.com).
2. Click **New +** → **Blueprint** and connect your GitHub repository `meniklc/echomind`.
3. Render will automatically detect [`render.yaml`](../render.yaml).
4. Fill in the required environment variables:
   - `LLM_API_KEY`: Your Groq API key (`gsk_...`).
   - `CORS_ORIGINS`: `http://localhost:5173,https://your-echomind.vercel.app` (add your Vercel URL once created).
   - `SUPABASE_URL`: (Optional) Your Supabase project URL.
   - `SUPABASE_KEY`: (Optional) Your Supabase anon key.
5. Click **Apply**.
6. Render will build and deploy the FastAPI backend. Your live URL will be e.g. `https://echomind-backend.onrender.com`.
7. Verify health by visiting `https://echomind-backend.onrender.com/health`.

### Handling Render Cold Starts
- Free Render web services spin down after 15 minutes of inactivity.
- The first request after sleep takes ~30–45 seconds to spin up.
- The frontend includes a responsive connectivity check and alert banner instructing users if the backend is waking up.
- *Free Keep-Alive Tip:* You can set up a free monitor on [UptimeRobot](https://uptimerobot.com) to ping `https://echomind-backend.onrender.com/health` every 14 minutes.

---

## 4. Frontend Deployment on Vercel

1. Create a free account at [vercel.com](https://vercel.com).
2. Click **Add New...** → **Project** and select `echomind`.
3. In the project setup:
   - **Root Directory:** Edit to select `frontend`.
   - **Framework Preset:** Vite.
   - **Build Command:** `npm run build`.
   - **Output Directory:** `dist`.
4. In **Environment Variables**, add:
   - `VITE_API_BASE_URL`: `https://echomind-backend.onrender.com` (your live Render backend URL).
5. Click **Deploy**.
6. Vercel will build the frontend and provide your live URL (e.g. `https://echomind.vercel.app`).
7. Update Render's `CORS_ORIGINS` to include this exact Vercel URL.

---

## 5. Realistic Speaking Avatar Options Evaluation

EchoMind currently ships with an ultra-lightweight, 60fps audio-reactive SVG vector character with procedural lip synchronization, micro-saccades, and idle breathing.

If you wish to explore realistic 3D or video avatars in the future, here is the architectural breakdown:

| Avatar Approach | Technology | Pros | Cons / Cost | Free Tier Feasibility |
| :--- | :--- | :--- | :--- | :--- |
| **Animated SVG Avatar (Current)** | Custom SVG + Web Audio API Analyser | • Instant 0ms latency<br>• Works on mobile and low-end devices<br>• No server dependencies<br>• Zero GPU or API cost | • Stylized rather than photorealistic | **100% Free** (Default) |
| **WebGL 3D Viseme Avatar** | Three.js + Ready Player Me GLB + Web Audio | • Fully 3D realistic human model<br>• Free open-source client-side rendering<br>• Real-time blendshapes (jawOpen, mouthSmile) | • Requires ~15MB GLB download on first load<br>• GPU canvas overhead on older phones | **100% Free** (Client-side, recommended next step) |
| **MediaPipe Face Mesh** | Google MediaPipe + Canvas2D | • Real-time morphing of photo or 2D image<br>• Free client-side WebAssembly | • Requires clean portrait photo<br>• Complex blendshape calibration | **100% Free** |
| **SadTalker / Wav2Lip** | PyTorch + Diffusers / ONNX | • Lip-synced photo video output | • Requires dedicated GPU server (T4 or A10G)<br>• 2–5s video generation latency<br>• Costs ~$0.20–$0.50/hr on Modal/Replicate | **Not Feasible on Free Tier** (Requires paid GPU) |
| **HeyGen / D-ID API** | Commercial Streaming Avatar API | • Studio-quality realistic video stream | • Costs ~$0.10–$0.25 per minute of video<br>• Free trial expires quickly | **Paid Service** (Not Free Tier) |

**Recommendation:**
The current animated SVG character is 100% free, reactive, and has zero server footprint. The optimal path to increase realism without incurring hosting costs is adding a **Three.js Ready Player Me 3D model** with client-side audio visemes.
