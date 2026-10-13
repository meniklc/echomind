# EchoMind Phase 1 — Architecture Specification

## 1. Executive Summary & Product Vision

**EchoMind** is an interactive personal AI digital twin representing **Kothlapuram L C Medha Nipuna** (final-year B.Tech Computer Science student at UVCE Bengaluru, graduating in 2027). The system allows visitors, recruiters, and collaborators to explore Medha's background, technical skills, AI/ML internships, project architectures, contributions, and career goals through natural conversation and voice interaction with an animated talking avatar.

Phase 1 focuses on building a rock-solid, grounded single-user digital twin while establishing clean module boundaries so that the core engine can later power multi-persona digital twins without rewriting retrieval or conversation infrastructure.

---

## 2. System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                  BROWSER FRONTEND                                 |
|                                                                                   |
|  +----------------------------+             +----------------------------------+  |
|  |       Talking Avatar       |             |           Chat Interface         |  |
|  | - SVG Facial Contours      |             | - Safe MarkdownView Component    |  |
|  | - Natural Blinking Loop    |             | - Multi-turn History (Bounded)   |  |
|  | - Web Audio FFT Analyser   |<----------->| - Functional Source Reference    |  |
|  | - Audio-Synchronized Mouth |  Audio sync |   Cards & Project Chips          |  |
|  | - Replay & Mic Controls    |             | - Duplicate Submission Guard     |  |
|  +----------------------------+             +----------------------------------+  |
+----------------------------------------+------------------------------------------+
                                         | HTTP / REST (Vite Proxy)
                                         v
+-----------------------------------------------------------------------------------+
|                             BACKEND API LAYER (FastAPI : 8001)                    |
|                                                                                   |
|  - CORS Security Policy                                                           |
|  - Endpoints:                                                                     |
|      * GET  /health          -> Service & LLM/TTS provider status                 |
|      * GET  /api/profile     -> Public profile & project schema                   |
|      * POST /api/chat        -> ChatRequest (question, bounded history, speak)    |
|      * POST /api/tts         -> Edge TTS Neural speech synthesis                  |
+----------------------------------------+------------------------------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                                                               |
         v                                                               v
+----------------------------------+           +----------------------------------+
|      RAG RETRIEVAL ENGINE        |           |      CHAT ORCHESTRATION & LLM    |
|                                  |           |                                  |
| 1. Query Normalization & Tokens  |           | Primary: Groq API                |
| 2. Follow-Up Subject Resolution  |           |  - Model: llama-3.1-8b-instant   |
| 3. Intent Detection              |           |  - Grounded System Prompt        |
| 4. Lexical BM25 Scoring          |           |  - Direct, Non-Repetitive Intro  |
| 5. Dense Semantic Embeddings     |           |  - Bounded Context History       |
|    - FastEmbed (all-MiniLM-L6-v2)|           |                                  |
|    - Local ONNX runtime cache    |           | Fallback: FactRetrievalProvider  |
|    - Cosine Similarity & TF-IDF  |           |  - Offline / Keyless Generation  |
| 6. Hybrid Score Fusion & Threshold|          |  - Zero Secret Leakage           |
| 7. Selective Project Retrieval   |           +----------------------------------+
+----------------------------------+
         |
         v
+-----------------------------------------------------------------------------------+
|                            KNOWLEDGE BASE (Editable JSON)                         |
|                                                                                   |
|  - backend/app/knowledge/profile.json   -> Education, Skills, Internships, Goals  |
|  - backend/app/knowledge/projects.json  -> SecuraLM, PhishCure, AI Learn, etc.    |
+-----------------------------------------------------------------------------------+
```

---

## 3. Core Component Architecture

### 3.1 Personal Knowledge Base (Decoupled Layer)
- **`profile.json`**: Encapsulates verified identity, education at UVCE Bengaluru (CGPA 9.12/10), categorized technical skills, verified internship roles (Apti Business Solutions, SkillDisk, HID Global), career goals, and social links.
- **`projects.json`**: Structured array of verified projects including `ai-learn`, `phishcure`, `securalm`, `nexusops-ai`, `covid19-prediction`, `bbms`, and `cognix`.
- **Extensibility**: All personal facts remain in pure JSON. Adding or refining project outcomes requires zero Python or TypeScript code changes.

### 3.2 Hybrid RAG Pipeline
The retrieval pipeline (`backend/app/services/retrieval.py` & `semantic.py`) solves the core limitations of naïve keyword search:
1. **Query Normalization & Tokenization**: Preserves technical keywords (`ai/ml`, `b.tech`, `ocr`, `rag`, `vlm`, `c++`, `fastapi`).
2. **Follow-Up Context Resolution**: Inspects conversation history to resolve pronouns and implicit targets (e.g., Question: *"What technologies did I use for the AI tutor?"* -> resolves to `ai-learn`).
3. **Intent Classification**: Distinguishes summary, education, technical skills, internships, project details, portfolio overview, career goals, links, and unknown topics.
4. **Project Selectivity**: A question targeted at one project retrieves strictly that project. Unrelated projects sharing generic words (like "Python" or "system") are filtered out.
5. **Dense Semantic Embeddings**:
   - Uses `fastembed` with `sentence-transformers/all-MiniLM-L6-v2` executed via local ONNX runtime.
   - Model size: ~67 MB ONNX cached locally in temp directory (`fastembed_cache`).
   - Generates 384-dimensional dense vectors with cosine similarity scoring.
   - Includes pure-Python vector/n-gram fallback for resilience.
6. **Score Fusion & Relevance Filtering**:
   - Lexical BM25 score normalized with sigmoid dampening: `norm_bm25 = bm25 / (bm25 + 2.0)`.
   - Combined score: `score = 0.5 * norm_bm25 + 0.5 * semantic_sim + alias_bonus`.
   - Relevance filtering suppresses noise below the 0.40 threshold.
7. **Grounded Source Attribution**: Attaches verified `PortfolioReference` metadata for returned sections and projects only.

### 3.3 Chat Orchestration & History Management
- **Bounded Request Schema**:
  - `ChatMessage.content`: Bounded up to 4,000 characters with non-empty strip validator.
  - `ChatRequest.history`: Bounded up to 12 turns.
  - Prevents the HTTP 422 validation failure that previously blocked repeated chats when assistant answers exceeded 800 characters.
- **Grounded Prompting**:
  - Injects strictly verified facts into system prompt.
  - Clear negative constraints: admit when a personal detail is missing; answer general knowledge without falsely claiming ownership; avoid repetitive self-introductions on follow-up turns.
- **Resilient Fallback**:
  - Catches Groq 401, 429, 5xx, or network timeouts and immediately serves structured answers via `FactRetrievalProvider`.

### 3.4 Animated Talking Avatar Architecture
- **Vector Portrait Engine**: High-fidelity SVG illustration with responsive layers: facial base, layered hair, glasses, animated eyebrows, eyelids, and morphing mouth path.
- **Audio Synchronization**:
  - Integrates Web Audio API (`AudioContext` and `AnalyserNode`).
  - Connects to the existing `HTMLAudioElement` during speech playback.
  - `requestAnimationFrame` samples frequency bins and calculates instantaneous speech energy.
  - Morphs mouth path openness (`mouthOpen` 0.0 to 1.0) and teeth highlights in real time.
  - Seamlessly falls back to an organic speech oscillation rhythm if audio element direct tap is blocked.
- **Lifelike State Transitions**:
  - Natural blinking with randomized intervals (2.0s to 5.5s).
  - Multi-state aura: Idle (subtle cyan), Listening (emerald pulse), Thinking (purple pulse), Speaking (dynamic teal wave), Error (amber glow).
  - Quick replay and instant stop-speaking interruption capabilities.

### 3.5 Safe Markdown & Speech Separation
- **`MarkdownView.tsx`**: Parses inline bold, italics, code, safe external links (`http:`, `https:`, `mailto:`), headers, and lists. Strips raw HTML and prevents XSS.
- **`stripMarkdownForSpeech`**: Converts markdown formatting into clean conversational plain text before passing to Edge TTS, ensuring asterisks and raw link URLs are never vocalized.
