# EchoMind Phase 1 — Implementation Guide

## 1. Overview of Changes

This document details the modifications made across the backend and frontend to implement Phase 1 of EchoMind: an intent-aware, grounded AI digital twin representing **Kothlapuram L C Medha Nipuna**, complete with an audio-synchronized talking avatar and safe markdown rendering.

---

## 2. Repeated-Chat Failure: Root Cause & Fix

### 2.1 Problem Diagnosis
When testing consecutive conversation turns:
1. Turn 1: *"Explain my AI Learn internship and the work I did on the project."* -> Answer generated (~850-1200 chars).
2. Turn 2: *"What technologies did I use for the AI tutor?"* -> **HTTP 422 Unprocessable Entity**.

### 2.2 Root Cause
In `backend/app/schemas/chat.py`, the schema definition was:
```python
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=800)
```
When the assistant responded to Turn 1, the response length was ~950 characters. On Turn 2, the frontend submitted `history` containing that assistant message. Pydantic validation rejected the message with:
`ValidationError: String should have at most 800 characters [type=string_too_long]`, returning an HTTP 422.

### 2.3 Coordinated Fix
1. **`backend/app/schemas/chat.py`**:
   - Increased `ChatMessage.content` maximum length from 800 to 4,000 characters.
   - Added `strip_content` validator to ensure messages cannot be empty or whitespace-only.
   - Increased `ChatRequest.history` max length from 8 to 12 turns.
2. **`backend/app/core/config.py`**:
   - Updated `chat_max_history_message_chars` to 4,000 and `chat_max_history_turns` to 12.
3. **`frontend/src/hooks/useConversation.ts`**:
   - Slices history to the last 6 messages.
   - Truncates each history message to 2,000 characters and filters out empty items before sending.
   - Prevents duplicate requests when `busy` is true.

---

## 3. Personal RAG Engine Implementation

### 3.1 Local Semantic Embeddings (`backend/app/services/semantic.py`)
- Integrated `fastembed` using `sentence-transformers/all-MiniLM-L6-v2`.
- Execution: Pure CPU inference via local ONNX runtime with zero PyTorch bloat.
- Model caching: ONNX weights (~67 MB) are cached locally in the system temporary directory (`fastembed_cache`).
- In-memory embedding cache (`_EMBEDDING_CACHE`) ensures knowledge chunks and queries are embedded efficiently.
- **Resilient Fallback**: Includes a pure-Python character 3-gram and word frequency vector space model with cosine similarity in case of model initialization issues or offline constraints.

### 3.2 Selective, Intent-Aware Retrieval (`backend/app/services/retrieval.py`)
- **Intent Classifier**: Automatically recognizes user intents for `summary`, `education`, `skills`, `experience`, `projects_list`, `project_detail`, `career_goals`, `achievements`, and `links`.
- **Follow-Up Context Resolution**: Uses recent history turns to resolve implicit pronouns or phrases like *"the AI tutor"* or *"that project"* to specific projects (`ai-learn`).
- **Selective Project Filter**: Explicit project queries (e.g., PhishCure, SecuraLM, AI Learn) return strictly the target project. Unrelated projects sharing generic keywords are suppressed.
- **Domain Mismatch Guard**: Questions mentioning unrelated professional domains (e.g., cardiac surgeon, pilot, quantum physics, Nobel Prize) do not trigger software/AI experience matches, cleanly marking `has_substantive_facts: False`.
- **Hybrid Score Fusion**: Combines normalized BM25 lexical score and dense semantic similarity:
  $$\text{Score} = 0.5 \times \text{BM25}_{\text{norm}} + 0.5 \times \text{Semantic} + \text{AliasBoost}$$
  Relevance threshold of 0.40 filters out low-confidence noise.

---

## 4. Grounded Chat Orchestration

### 4.1 Non-Repetitive System Prompt (`backend/app/services/llm.py`)
- Instructs the model to answer directly and conversationally without repeating lengthy introductions like *"I am EchoMind..."* on every message.
- Strictly grounds generation in verified facts.
- Distinguishes ongoing/internship work from completed work based on the `status` field.
- Instructs the model to admit missing facts politely and answer general technical concepts without falsely claiming personal authorship.

### 4.2 Graceful Error Fallback (`backend/app/services/chat.py`)
- Groq timeouts, 401 Unauthorized, 429 Rate Limits, or 5xx provider errors trigger the `FactRetrievalProvider` fallback without crashing or returning HTTP 500.
- Secrets and API keys are never leaked in error messages or logs.

---

## 5. Animated Talking Avatar & Safe UI

### 5.1 Animated Talking Avatar (`frontend/src/components/Avatar.tsx`)
- **SVG Character Styling**: Clean vector portrait depicting Medha Nipuna with modern styling, styled hair, glasses, expressive eyes, and dynamic mouth.
- **Web Audio Synchronization**: Connects to the audio playback stream via Web Audio API `AudioContext` and `AnalyserNode`. Measures real-time audio energy and morphs the mouth curve (`mouthOpen` 0 to 16px) and teeth visibility in sync with speech.
- **Natural Organic Blinking**: Blinking loop triggers automatically at randomized intervals between 2.0s and 5.5s.
- **State Feedback**: Interactive aura glows in real time: Idle (cyan), Listening (emerald), Thinking (purple pulse), Speaking (teal wave), Error (rose).
- **Controls**: Includes instant microphone toggle, speech interruption button (*Stop Speaking*), and audio *Replay Voice* button.

### 5.2 Safe Markdown & Speech Separation (`MarkdownView.tsx` & `markdown.ts`)
- **`MarkdownView.tsx`**: Renders bold (`**bold**`), italics, inline code, headers, and lists. Sanitizes links to only allow `http:`, `https:`, and `mailto:` protocols, completely preventing XSS.
- **`stripMarkdownForSpeech()`**: Strips markdown markers before passing text to Edge TTS, ensuring asterisks, brackets, and raw URLs are never spoken aloud.

---

## 6. Personal Knowledge Editing Guide

To update personal facts without touching Python code, edit the JSON files in `backend/app/knowledge/`:

### Updating Profile Facts (`backend/app/knowledge/profile.json`)
```json
{
  "name": "Kothlapuram L C Medha Nipuna",
  "headline": "Final-year B.Tech CSE student | AI/ML Engineering | LLM Applications | RAG",
  "education": [
    {
      "institution": "UVCE Bengaluru",
      "degree": "B.Tech",
      "field": "Computer Science Engineering",
      "end_year": 2027,
      "status": "ongoing",
      "highlights": ["CGPA: 9.12/10 through Semester 6"]
    }
  ],
  "experience": [ ... ],
  "career_goals": "...",
  "links": { ... }
}
```

### Adding or Updating Projects (`backend/app/knowledge/projects.json`)
```json
{
  "projects": [
    {
      "id": "my-new-project",
      "name": "Project Name",
      "short_summary": "1-2 sentence overview.",
      "problem_solved": "What problem does this solve?",
      "technologies": ["Python", "FastAPI", "React"],
      "contribution": "Specific individual contribution.",
      "status": "completed | in-progress",
      "outcomes": ["Verified measurable outcome."],
      "repository_url": "https://github.com/...",
      "demo_url": null,
      "tags": ["ai-ml", "rag"]
    }
  ]
}
```

---

## 7. How to Run Locally

### Backend (Port 8001)
```powershell
cd d:\nipuna-btech\projects\echomind\backend
..\.venv\Scripts\uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8001 --reload
```

### Frontend (Port 5173)
```powershell
cd d:\nipuna-btech\projects\echomind\frontend
npm run dev
```

### Run Automated Tests
```powershell
cd d:\nipuna-btech\projects\echomind\backend
..\.venv\Scripts\pytest -v
```

### Environment Configuration (`.env`)
```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=<your-groq-api-key>
LLM_MODEL=llama-3.1-8b-instant
LLM_TIMEOUT_SECONDS=30.0
TTS_VOICE=en-US-JennyNeural
TTS_RATE=+0%
TTS_MAX_CHARS=1200
TTS_TIMEOUT_SECONDS=45.0
```
