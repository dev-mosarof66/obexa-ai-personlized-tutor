"use client";

import { useEffect, useMemo, useState } from "react";
import { PanelHeader } from "@/components/PanelHeader";
import { AlertIcon, CheckCircleIcon, ChevronDownIcon, RefreshIcon, SparkleIcon } from "@/components/icons";
import type { ExamCandidate, ExamConfig, KnowledgeBaseSummary, ScenarioQuestion, VerifierResult } from "@/lib/types";

type Phase = "config" | "pipeline" | "results";
type PipelineStep = "generate" | "verify" | "regenerate" | "finalize";
type Difficulty = "easy" | "medium" | "hard";

const STEP_LABEL: Record<PipelineStep, string> = {
  generate: "Generating candidate questions",
  verify: "Verifying against source material",
  regenerate: "Regenerating rejected questions",
  finalize: "Saving to knowledge base",
};

const DIFFICULTY_STYLE: Record<Difficulty, { badge: string; border: string }> = {
  easy: { badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", border: "border-l-emerald-500" },
  medium: { badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400", border: "border-l-amber-500" },
  hard: { badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400", border: "border-l-rose-500" },
};

export function QuestionGenerator({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [documents, setDocuments] = useState<KnowledgeBaseSummary[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  const [phase, setPhase] = useState<Phase>("config");
  const [config, setConfig] = useState<ExamConfig>({
    course: "",
    topics: [],
    questionCount: 5,
    difficulty: { easy: 2, medium: 2, hard: 1 },
  });

  const [currentStep, setCurrentStep] = useState<PipelineStep | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<ScenarioQuestion[]>([]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [resultLabel, setResultLabel] = useState("");

  useEffect(() => {
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => setDocuments(data.documents ?? []))
      .catch(() => setError("Failed to load the knowledge base."))
      .finally(() => setLoadingCourses(false));
  }, []);

  const courses = useMemo(
    () => Array.from(new Set(documents.map((d) => d.course?.trim()).filter(Boolean))).sort(),
    [documents]
  );

  const label = config.course;

  function selectCourse(course: string) {
    setConfig((c) => ({ ...c, course, topics: [] }));
  }

  function toggleSolution(id: string) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  }

  async function runPipeline() {
    if (!config.course.trim()) return;
    setPhase("pipeline");
    setError(null);
    setLog([]);
    setResultLabel(label);

    try {
      // 1. Generate
      setCurrentStep("generate");
      const genRes = await fetch("/api/exam/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error ?? "Generation failed.");
      const candidates: ExamCandidate[] = genData.candidates;
      const docId: string = genData.documentId;
      setLog((l) => [
        ...l,
        `Generated ${candidates.length} candidates from ${genData.matchedDocuments.length} source document(s).`,
      ]);

      // 2. Verify
      setCurrentStep("verify");
      const verifyRes = await fetch("/api/exam/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: config.course, topics: config.topics, candidates }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error ?? "Verification failed.");
      const verdicts: VerifierResult[] = verifyData.verdicts;
      const verdictById = new Map(verdicts.map((v) => [v.id, v]));

      const accepted: ScenarioQuestion[] = [];
      const rejected: { candidate: ExamCandidate; issues: string[] }[] = [];
      for (const candidate of candidates) {
        const verdict = verdictById.get(candidate.id);
        if (verdict?.recommendation === "accept") {
          accepted.push({ ...candidate, verification: { status: "verified" } });
        } else {
          rejected.push({ candidate, issues: verdict?.issues ?? ["Failed verification"] });
        }
      }
      setLog((l) => [
        ...l,
        `Verified: ${accepted.length} accepted, ${rejected.length} flagged for regeneration.`,
      ]);

      // 3. Regenerate rejected (single batched pass, no re-verification)
      if (rejected.length > 0) {
        setCurrentStep("regenerate");
        const regenRes = await fetch("/api/exam/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ course: config.course, topics: config.topics, rejected }),
        });
        const regenData = await regenRes.json();
        if (!regenRes.ok) throw new Error(regenData.error ?? "Regeneration failed.");
        const fixed: ExamCandidate[] = regenData.fixed;
        const issuesById = new Map(rejected.map((r) => [r.candidate.id, r.issues]));
        fixed.forEach((candidate) => {
          accepted.push({
            ...candidate,
            verification: {
              status: "regenerated",
              reasoning: issuesById.get(candidate.id)?.join("; "),
            },
          });
        });
        setLog((l) => [...l, `Regenerated ${fixed.length} question(s).`]);
      }

      const finalQuestions = accepted.slice(0, config.questionCount);

      // 4. Finalize (persist)
      setCurrentStep("finalize");
      const finalizeRes = await fetch("/api/exam/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId, topic: label, questions: finalQuestions }),
      });
      const finalizeData = await finalizeRes.json();
      if (!finalizeRes.ok) throw new Error(finalizeData.error ?? "Failed to save.");
      setLog((l) => [...l, "Saved."]);

      setQuestions(finalQuestions);
      setRevealed({});
      setCurrentStep(null);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question generation failed.");
      setCurrentStep(null);
      setPhase("config");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<SparkleIcon className="h-5 w-5" />}
        title="Question Generator"
        description="Scenario-based practice questions with worked solutions, grounded in your material"
        onMenuClick={onOpenMenu}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {error && (
          <div className="mb-4 flex max-w-xl items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {phase === "config" && (
          <div className="max-w-md space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-sm text-foreground/60">
              Pick a course. The agent generates realistic, scenario-based
              practice questions from that course's material, verifies each
              one against it, and regenerates anything that fails
              verification — nothing is saved unverified. Each question comes
              with a worked solution, not an auto-grader.
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-foreground/50">
                Course
              </label>
              {loadingCourses ? (
                <p className="text-sm text-foreground/50">Loading knowledge base…</p>
              ) : courses.length === 0 ? (
                <p className="text-sm text-foreground/50">
                  No courses yet — upload material on the Knowledge Base page first.
                </p>
              ) : (
                <select
                  value={config.course}
                  onChange={(e) => selectCourse(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="">Select a course…</option>
                  {courses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-foreground/50">
                Number of questions
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={config.questionCount}
                onChange={(e) => setConfig({ ...config, questionCount: Number(e.target.value) })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-foreground/50">
                Difficulty mix
              </label>
              <div className="flex gap-2">
                {(["easy", "medium", "hard"] as const).map((level) => (
                  <div
                    key={level}
                    className={`flex-1 rounded-lg border border-border px-2 py-2 text-center ${DIFFICULTY_STYLE[level].badge}`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide">{level}</p>
                    <input
                      type="number"
                      min={0}
                      value={config.difficulty[level]}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          difficulty: { ...config.difficulty, [level]: Number(e.target.value) },
                        })
                      }
                      className="mt-1 w-full bg-transparent text-center text-lg font-semibold outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={runPipeline}
              disabled={!config.course.trim()}
              className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm shadow-brand/30 transition-colors hover:bg-brand-strong disabled:opacity-50"
            >
              Generate questions
            </button>
          </div>
        )}

        {phase === "pipeline" && (
          <div className="max-w-md rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold">Building questions on &ldquo;{label}&rdquo;</h3>
            <ul className="space-y-4">
              {(["generate", "verify", "regenerate", "finalize"] as PipelineStep[])
                .filter((step) => step !== "regenerate" || currentStep === "regenerate" || log.some((l) => l.startsWith("Regenerated")))
                .map((step, idx, arr) => {
                  const doneLine = log.find((l) =>
                    step === "generate"
                      ? l.startsWith("Generated")
                      : step === "verify"
                      ? l.startsWith("Verified")
                      : step === "regenerate"
                      ? l.startsWith("Regenerated")
                      : l.startsWith("Saved")
                  );
                  const active = currentStep === step;
                  const last = idx === arr.length - 1;
                  return (
                    <li key={step} className="relative flex gap-3 pb-1">
                      {!last && (
                        <span
                          className={`absolute left-2.75 top-6 h-full w-px ${
                            doneLine ? "bg-brand" : "bg-border"
                          }`}
                        />
                      )}
                      <span
                        className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
                          doneLine ? "bg-brand" : active ? "bg-brand/60 animate-pulse" : "bg-border"
                        }`}
                      >
                        {doneLine && <CheckCircleIcon className="h-3.5 w-3.5" />}
                      </span>
                      <div>
                        <p className={`text-sm ${doneLine || active ? "font-medium text-foreground" : "text-foreground/40"}`}>
                          {STEP_LABEL[step]}
                        </p>
                        {doneLine && <p className="text-xs text-foreground/50">{doneLine}</p>}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        {phase === "results" && (
          <div className="max-w-3xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">&ldquo;{resultLabel}&rdquo; — {questions.length} questions</h3>
              <button
                type="button"
                onClick={() => {
                  setPhase("config");
                  setConfig({ ...config, course: "", topics: [] });
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-brand/10 hover:text-brand"
              >
                New set
              </button>
            </div>
            {questions.map((q, i) => {
              const open = !!revealed[q.id];
              return (
                <div
                  key={q.id}
                  className={`rounded-xl border border-border border-l-4 bg-surface p-4 shadow-sm ${DIFFICULTY_STYLE[q.difficulty].border}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-foreground/50">Q{i + 1}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${DIFFICULTY_STYLE[q.difficulty].badge}`}>
                      {q.difficulty}
                    </span>
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                      {q.concept}
                    </span>
                    {q.verification.status === "verified" ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircleIcon className="h-3 w-3" /> Verified
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                        title={q.verification.reasoning}
                      >
                        <RefreshIcon className="h-3 w-3" /> Regenerated
                      </span>
                    )}
                  </div>
                  <p className="mb-2 text-sm text-foreground/70">{q.scenario}</p>
                  <p className="mb-3 text-sm font-medium">{q.question}</p>

                  <button
                    type="button"
                    onClick={() => toggleSolution(q.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
                  >
                    {open ? "Hide solution" : "Show solution"}
                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>

                  {open && (
                    <div className="mt-3 space-y-3 rounded-lg bg-brand/5 p-3">
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                          Model answer
                        </p>
                        <p className="text-sm text-foreground/80">{q.modelAnswer}</p>
                      </div>
                      {q.rubric.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                            A strong answer covers
                          </p>
                          <ul className="space-y-1">
                            {q.rubric.map((r, j) => (
                              <li key={j} className="flex items-start gap-1.5 text-sm text-foreground/80">
                                <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                {r.point}
                              </li>
                            ))}
                          </ul>
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
    </div>
  );
}
