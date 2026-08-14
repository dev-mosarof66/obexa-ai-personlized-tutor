# Obexa — Hackathon MVP HLD & LLD (Combined: Knowledge Base + Scenario Exam)

> **This version supersedes all prior versions.** Two of the challenge brief's example ideas — "Course Knowledge Base" and "Smart Exam Preparation" — are merged into one product, sharing a single knowledge-base artifact. Scope is cropped to a strict **2.5-hour** build window (including demo recording + Devpost submission) for RUET's "Build with AI" hackathon.

## 0. What Changed From Prior Versions

| Area | Earlier draft | Current MVP |
|---|---|---|
| Question format | Multiple-choice (MCQ) | **Scenario-based**, open-ended — matches how RUET actually examines students |
| Answer checking | Auto-checked against a fixed option | **AI-graded**: student types a free-text answer, Gemini scores it against a rubric |
| Product scope | Exam builder only | **Exam builder + Course Knowledge Base chat**, sharing one knowledge base |
| Persistence | None specified | **Minimal**: one in-memory `Map` (documentId → {text, analysis}). No schema, no migrations. Optional single JSON file if it needs to survive a restart — not required for the demo |
| Time budget | 3 hours | **2.5 hours**, demo video + Devpost submission included in that budget |
| Endpoints | analyze / generate / verify (3, sequential) | analyze / chat / build-exam / grade (4) — generate+verify+regenerate merged into one internal endpoint to cut wiring time |

Language (English-only) and the vanilla JS/Tailwind-CDN frontend decision from the prior crop still stand.

---

## 1. Product Overview

### Product Name
**Obexa**
*Upload a course PDF once. Chat with it. Get an AI-graded scenario exam from it. One knowledge base, two features.*

### Problem
Two separate student pain points, normally solved by two separate tools:
1. Understanding dense course material and clearing confusions about it (needs a way to ask questions of it, not just re-read it).
2. Practicing for exams that are scenario/case-based, not MCQ — assessed against course learning outcomes (OBE — Outcome-Based Education) — and getting feedback on open-ended answers, which is otherwise only available from a human grader.

### Solution
A student uploads course/lecture material once. The AI agent orchestrates that material into one shared knowledge base — decomposing it into subject, concepts, key facts, and learning objectives (section 5) — rather than treating it as an opaque blob. That knowledge base powers:
- **Chat** — ask the material questions directly, in plain language, to learn a topic or clear a specific confusion — grounded only in what was uploaded, so it says "not covered" instead of guessing.
- **Practice exam (OBE)** — Gemini generates scenario-based, application-level questions with rubrics — each grounded in a specific concept/learning objective extracted during decomposition, not a generic question bank. The student answers in free text, and Gemini grades each answer against its rubric with feedback.

### Core Value Proposition
> **One upload. Understand it, clear your confusions, then get tested against real learning outcomes — with feedback, not just a score.**

---

## 2. Scope

### MVP — Must Have
- Single PDF upload → shared knowledge base (analysis + raw text, in-memory)
- Chat interface over that knowledge base (RAG-lite via context stuffing — no vector DB needed at this document size)
- Scenario-based question generation with rubrics
- Batched verification + single regeneration pass (internal to one endpoint)
- Free-text answer input per question
- Batched AI grading against rubric → score + feedback + model answer per question
- Simple 2-step progress UI (Analyzing → Building)

### Explicitly Out of Scope (Hackathon)
- Bangla language support
- MCQ / numerical question types
- Multiple PDFs
- Real database (Postgres, vector DB, Redis) — in-memory only
- SSE / polling for live sub-step progress
- Multi-round regeneration or re-grading
- Auth, payments, production deployment

---

## 3. High-Level Architecture

```text
                     ┌──────────────────────┐
                     │       USER            │
                     └──────────┬────────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │  Single-page frontend │
                     │  (HTML/JS/Tailwind)   │
                     │                       │
                     │  Upload + Config      │
                     │  Chat Panel           │
                     │  Exam Viewer          │
                     │  Grading Results      │
                     └──────────┬────────────┘
                                │
                          HTTP / JSON
                                │
                                ▼
                     ┌──────────────────────┐
                     │   Node.js/Express     │
                     │                       │
                     │ /api/analyze          │
                     │ /api/chat             │
                     │ /api/build-exam       │
                     │ /api/grade            │
                     └──────────┬────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼                       ▼
          ┌──────────────────┐    ┌──────────────────┐
          │  In-memory Map    │    │    Gemini API     │
          │  documentId →     │    │                    │
          │  { text, analysis}│    │                    │
          └──────────────────┘    └──────────────────┘
```

`/api/analyze` is the only step that writes to the store. `/api/chat` and `/api/build-exam` both read from it — that shared read is the entire "knowledge base" mechanism. No separate ingestion pipeline for each feature.

---

## 4. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/JS |
| Styling | Tailwind CSS (CDN) |
| Backend | Node.js + Express |
| AI | Gemini API |
| PDF extraction | `pdf-parse` |
| Validation | Zod (or manual checks if time-constrained) |
| Storage | In-memory `Map`, keyed by `documentId` |
| Deployment | Localhost |

---

## 5. Core Data Models

### Knowledge Base Entry (stored in Map)
```ts
interface KnowledgeBaseEntry {
  documentId: string;
  rawText: string;
  analysis: DocumentAnalysis;
}
```

### Document Analysis
```ts
interface DocumentAnalysis {
  subject: string;
  title: string;
  concepts: { name: string; description: string }[];
  keyFacts: string[];
  learningObjectives: string[];
}
```
This is the "splitting it down" step: the Document Agent decomposes the raw upload into structured pieces instead of leaving it as one text blob. `concepts` and `learningObjectives` are reused downstream by both features — `concepts` ground chat answers, and `learningObjectives`/`concepts` ground scenario questions (`ScenarioQuestion.concept`, below) so every exam question maps back to something the material actually claims to teach — the OBE link.

### Exam Configuration
```ts
interface ExamConfig {
  subject: string;
  chapter?: string;
  questionCount: number; // demo target: 5
  difficulty: { easy: number; medium: number; hard: number };
}
```

### Scenario Question
```ts
interface ScenarioQuestion {
  id: string;
  scenario: string;        // the case/situation description
  question: string;        // what the student must answer
  difficulty: "easy" | "medium" | "hard";
  concept: string;
  modelAnswer: string;
  rubric: { point: string; weight: number }[];
  verification: { status: "verified" | "failed"; reasoning?: string };
}
```

### Grading Result
```ts
interface GradingResult {
  questionId: string;
  score: number;
  maxScore: number;
  matchedPoints: string[];
  missedPoints: string[];
  feedback: string;
}
```

### Chat Message
```ts
interface ChatMessage {
  role: "user" | "model";
  content: string;
}
```

---

## 6. API Design

### `POST /api/analyze`
Request: multipart PDF upload.
Server: extract text (`pdf-parse`) → Document Agent (Gemini) → store `{documentId, rawText, analysis}` in the Map.
Response: `{ documentId, analysis }`.

### `POST /api/chat`
The "learn / clear confusions" surface — free-form Q&A over the decomposed knowledge base, not a fixed quiz.
Request: `{ documentId, message, history: ChatMessage[] }`
Server: look up `rawText`/`analysis` by `documentId`, build a context-stuffed prompt with `history`, one Gemini call.
Response: `{ reply: string }`.

### `POST /api/build-exam`
Request: `{ documentId, config: ExamConfig }`
Server, internally, three sequential Gemini calls:
1. **Generate** — `config.questionCount + 3` scenario candidates with rubrics, grounded in stored analysis.
2. **Verify** — one batched call checks all candidates for source relevance, rubric quality, difficulty accuracy.
3. **Regenerate** — one batched call fixes any failed candidates. No further verification round.

Response: `{ examId, questions: ScenarioQuestion[] }` (trimmed/selected to `questionCount`).

Frontend shows a single "Building your exam..." loading state for this call — the three internal Gemini calls are not exposed as live UI steps, only narrated in the demo video.

### `POST /api/grade`
Request: `{ examId, answers: { questionId: string; answer: string }[] }`
Server: one batched Gemini call scoring every answer against its question's rubric.
Response: `{ results: GradingResult[] }`.

---

## 7. Prompt Architecture

### Document Agent (`/api/analyze`)
```text
You are a curriculum analysis agent.
Analyze ONLY the supplied source material (English).
Extract: subject, title, core concepts, key facts, learning objectives.
Do not introduce information not supported by the source.
Return structured JSON only.
```

### Chat Agent (`/api/chat`)
```text
You are a course material assistant. Answer ONLY using the supplied
document analysis and source text. If the material doesn't cover the
question, say so plainly rather than guessing.
Keep answers concise and student-friendly.
```

### Scenario Generator (`/api/build-exam`, step 1)
```text
You are an expert examiner. Generate scenario-based exam questions
grounded strictly in the supplied document analysis — the kind used
in university-level exams, not multiple-choice.
Each question needs: a realistic scenario, a clear question, a model
answer, and a grading rubric (key points with weights).
Respect the requested difficulty distribution and count + buffer.
Return structured JSON only.
```

### Verifier (`/api/build-exam`, step 2 — batched)
```text
You are an adversarial exam quality-control agent.
For EACH candidate question, check: source relevance, model-answer
correctness/completeness, rubric quality, scenario realism, difficulty
accuracy.
Return a JSON array, one result per question: valid (bool),
issues (string[]), recommendation ("accept" | "regenerate").
```

### Regenerator (`/api/build-exam`, step 3 — batched)
```text
You are revising rejected exam questions.
For each rejected question and its issues, produce a corrected
scenario question grounded in the source material.
Return structured JSON only.
```

### Grader (`/api/grade` — batched)
```text
You are grading student answers against a rubric.
For each answer, check which rubric points are addressed, which are
missing, and assign a score out of the rubric's total weight.
Give concise, constructive feedback — specific to what the student
wrote, not generic.
Return structured JSON only.
```

---

## 8. Frontend Flow

```text
IDLE → UPLOAD → [Step 1: Analyzing] → KNOWLEDGE BASE READY
                                            │
                        ┌───────────────────┼───────────────────┐
                        ▼                                       ▼
                  CHAT PANEL                         CONFIGURE → [Step 2: Building]
                  (available anytime                            → EXAM VIEWER
                   after analysis)                               (free-text per Q)
                                                                        │
                                                                        ▼
                                                              SUBMIT FOR GRADING
                                                                        │
                                                                        ▼
                                                              GRADING RESULTS
                                                     (score + feedback + model answer)
```

Chat and exam generation both branch off the same "knowledge base ready" state — the student can do either, or both, from one upload.

---

## 9. Error Handling

- **Invalid/unreadable PDF:** "Unable to extract text from this PDF. Please upload a text-based PDF."
- **Gemini call fails (any endpoint):** one automatic retry, then a clear inline error — never a silent hang.
- **Invalid JSON from Gemini:** parse → validate (Zod or manual) → on failure, retry once before failing gracefully.
- **Chat before analysis completes:** disable the chat input until `documentId` exists.

---

## 10. 2.5-Hour Implementation Plan

| Time | Task |
|---|---|
| 0:00–0:10 | Express server, in-memory Map, single HTML/JS/Tailwind skeleton, one test Gemini call |
| 0:10–0:30 | `/api/analyze` — PDF extract + Document Agent, store in Map |
| 0:30–0:40 | `/api/chat` — RAG-lite over stored analysis + text |
| 0:40–1:15 | `/api/build-exam` — generate + batch-verify + single regen, internal to one endpoint |
| 1:15–1:30 | `/api/grade` — batched AI grading vs rubric |
| 1:30–1:50 | Frontend: upload/config, 2-step timeline, chat panel |
| 1:50–2:02 | Frontend: exam viewer (free-text) + submit-for-grading + results view |
| 2:02–2:10 | Error handling + quick style pass |
| 2:10–2:20 | Full run-through with known-good English PDF: analyze, chat, generate+answer+grade — fix bugs |
| 2:20–2:30 | Record demo video (chat, then exam+grading) + fill Devpost submission |

### Recommended demo target
**5 scenario questions from one known-good English RUET course PDF.**

```text
Chat: 2 quick questions about the material
Exam: 8 candidates generated → batch verify → 1 regen pass → 5 final questions
Student answers all 5 → 1 batched grading call → scores + feedback
```

**Derisking tip:** test-extract text from the chosen demo PDF with `pdf-parse` *before* the clock starts.

---

## 11. Why This Is Still Agentic

1. **Goal orientation** — build a usable knowledge base, then a valid graded exam from it.
2. **Task decomposition** — split the raw upload into subject/concepts/facts/objectives, then analyze → (generate → verify → regenerate) → grade, plus a parallel chat capability over the same base.
3. **Evaluation** — the verifier judges the generator's output; the grader judges the student's.
4. **Feedback** — failed questions regenerate; graded answers return targeted feedback, not just a score.
5. **Autonomous iteration** — accept/regenerate decisions happen without human input.
6. **Outcome alignment (OBE)** — scenario questions aren't pulled from a generic bank; each one is grounded in a concept/learning objective the decomposition step actually extracted from the student's own material.

Merging generate+verify+regenerate into one endpoint changed the *wiring*, not the *reasoning chain* — all three Gemini calls still happen, just under one API surface instead of three round trips.
