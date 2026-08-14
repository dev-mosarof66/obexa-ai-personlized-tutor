# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Obexa — a hackathon MVP (RUET "Build with AI"). Full product spec, architecture,
data models, API contracts, and prompt text live in
[`Obexa_HLD_LLD.md`](Obexa_HLD_LLD.md) at the repo root — read it before
making non-trivial changes; this file only summarizes what's needed to navigate the code.

One PDF upload builds a shared in-memory knowledge base that powers two features: a chat
panel over the document, and an AI-generated/AI-graded scenario exam.

## Commands

```bash
npm run dev      # start dev server (Turbopack) on localhost:3000
npm run build    # production build — also runs the TypeScript check
npm run lint      # eslint
```

No test suite is configured yet.

## Environment

`GEMINI_API_KEY` must be set in `.env.local` (gitignored). All Gemini calls run
server-side only — never expose this key with a `NEXT_PUBLIC_` prefix.

## Architecture

Next.js App Router, `src/app/api/*/route.ts` route handlers stand in for the Express
backend described in the HLD. Four endpoints, matching HLD section 6 exactly:

- `POST /api/analyze` — multipart PDF upload → `pdf-parse` extracts text → one Gemini
  call (Document Agent) analyzes it → result stored in the in-memory knowledge base.
- `POST /api/chat` — looks up the stored document by `documentId`, stuffs
  `rawText` + `analysis` + conversation history into one Gemini call. No vector DB;
  this document size doesn't need one (RAG-lite via context stuffing).
- `POST /api/build-exam` — three **sequential** Gemini calls behind one HTTP round
  trip: generate (`questionCount + 3` candidates) → verify (batched) → regenerate
  rejected candidates (batched, single pass, no re-verification). This is the core
  "agentic" piece of the app — see HLD section 11.
- `POST /api/grade` — one batched Gemini call scores every submitted answer against
  its question's rubric.

Supporting modules in `src/lib/`:

- `types.ts` — every shared interface (`DocumentAnalysis`, `ScenarioQuestion`,
  `GradingResult`, etc.), copied verbatim from HLD section 5. Keep these in sync with
  the HLD if either changes.
- `store.ts` — the two in-memory `Map`s (`knowledgeBase` by `documentId`, `exams` by
  `examId`). Stashed on `globalThis` so Next dev-mode module reloads don't wipe state
  mid-session. There is no database and no persistence — restarting the server clears
  everything, by design (see HLD section 2, "Explicitly Out of Scope").
- `gemini.ts` — the only place that talks to `@google/genai`. `generateJson<T>` and
  `generateText` both retry once automatically on failure or unparseable JSON, per HLD
  section 9 error handling. Route handlers should always go through these, never call
  the SDK directly.
- `prompts.ts` — the five system prompts (Document Agent, Chat Agent, Scenario
  Generator, Verifier, Regenerator, Grader), verbatim from HLD section 7.

Frontend (`src/app/page.tsx` etc.) should follow the state flow in HLD section 8:
upload → analyzing → knowledge-base-ready, from which chat and exam-config/build
branch independently. Chat is enabled only once `documentId` exists.

### Next.js version note

This repo was scaffolded on a pre-release Next.js version (16.3.1) — see the
auto-generated `AGENTS.md` block, which warns that APIs/conventions may differ from
what's in training data. If something App-Router-related behaves unexpectedly, check
`node_modules/next/dist/docs/` before assuming older-Next.js conventions apply.
