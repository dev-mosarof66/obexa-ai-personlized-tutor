"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { PanelHeader } from "@/components/PanelHeader";
import { AlertIcon, CheckCircleIcon, ChevronDownIcon, RefreshIcon, SparkleIcon } from "@/components/icons";
import { useExamQueue, type ExamJobStatus } from "@/lib/examQueue";
import type { ExamConfig, KnowledgeBaseSummary } from "@/lib/types";

type PipelineStep = "generate" | "verify" | "regenerate" | "finalize";
type Difficulty = "easy" | "medium" | "hard";

const STEP_LABEL: Record<PipelineStep, string> = {
  generate: "Generating candidate questions",
  verify: "Verifying against source material",
  regenerate: "Regenerating rejected questions",
  finalize: "Saving to knowledge base",
};

const STATUS_TO_STEP: Partial<Record<ExamJobStatus, PipelineStep>> = {
  generating: "generate",
  verifying: "verify",
  regenerating: "regenerate",
  finalizing: "finalize",
};

const DIFFICULTY_STYLE: Record<Difficulty, { badge: string; border: string }> = {
  easy: { badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", border: "border-l-emerald-500" },
  medium: { badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400", border: "border-l-amber-500" },
  hard: { badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400", border: "border-l-rose-500" },
};

export function QuestionGenerator() {
  const { jobs, activeJobId, setActiveJobId, startJob, dismissJob } = useExamQueue();
  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;

  const [documents, setDocuments] = useState<KnowledgeBaseSummary[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [config, setConfig] = useState<ExamConfig>({
    course: "",
    topics: [],
    questionCount: 5,
    difficulty: { easy: 2, medium: 2, hard: 1 },
  });

  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => setDocuments(data.documents ?? []))
      .catch(() => setLoadError("Failed to load the knowledge base."))
      .finally(() => setLoadingCourses(false));
  }, []);

  const courses = useMemo(
    () => Array.from(new Set(documents.map((d) => d.course?.trim()).filter(Boolean))).sort(),
    [documents]
  );

  const topicsForCourse = useMemo(() => {
    if (!config.course) return [];
    const set = new Set<string>();
    for (const doc of documents) {
      if (doc.course?.trim() !== config.course) continue;
      for (const t of doc.analysis.topics ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [documents, config.course]);

  function selectCourse(course: string) {
    setConfig((c) => ({ ...c, course, topics: [] }));
  }

  function toggleSolution(id: string) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  }

  function submit() {
    if (!config.course.trim()) return;
    const id = startJob(config);
    setActiveJobId(id);
  }

  function startNewSet() {
    if (activeJob && (activeJob.status === "done" || activeJob.status === "error")) {
      dismissJob(activeJob.id);
    }
    setActiveJobId(null);
    setConfig((c) => ({ ...c, course: "", topics: [] }));
    setRevealed({});
  }

  const phase: "config" | "pipeline" | "results" =
    !activeJob || activeJob.status === "error" ? "config" : activeJob.status === "done" ? "results" : "pipeline";

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<SparkleIcon className="h-5 w-5" />}
        title="Question Generator"
        description="Scenario-based practice questions with worked solutions, grounded in your material"
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {(loadError || activeJob?.status === "error") && (
          <div className="mb-4 flex max-w-xl items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{loadError ?? activeJob?.error}</p>
          </div>
        )}

        {phase === "config" && (
          <div className="max-w-md space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-sm text-foreground/60">
              Pick a course, and optionally one or more topics within it. The
              agent generates realistic, scenario-based practice questions from
              that material, verifies each one against it, and regenerates
              anything that fails verification — nothing is saved unverified.
              Each question comes with a worked solution, not an auto-grader.
              Generation keeps running in the background even if you switch
              pages.
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

            {config.course && (
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-foreground/50">
                  Topics{" "}
                  <span className="normal-case text-foreground/40">
                    (optional — leave empty for the whole course)
                  </span>
                </label>
                {topicsForCourse.length === 0 ? (
                  <p className="text-sm text-foreground/50">No extracted topics for this course yet.</p>
                ) : (
                  <MultiSelectDropdown
                    options={topicsForCourse}
                    selected={config.topics}
                    onChange={(topics) => setConfig((c) => ({ ...c, topics }))}
                    placeholder="Select topics…"
                  />
                )}
              </div>
            )}

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
              onClick={submit}
              disabled={!config.course.trim()}
              className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm shadow-brand/30 transition-colors hover:bg-brand-strong disabled:opacity-50"
            >
              Generate questions
            </button>
          </div>
        )}

        {phase === "pipeline" && activeJob && (
          <div className="max-w-md rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold">
              Building questions on &ldquo;{activeJob.label}&rdquo;
            </h3>
            <p className="mb-4 text-xs text-foreground/50">
              Running in the background — feel free to switch pages, this keeps going.
            </p>
            <ul className="space-y-4">
              {(["generate", "verify", "regenerate", "finalize"] as PipelineStep[])
                .filter(
                  (step) =>
                    step !== "regenerate" ||
                    STATUS_TO_STEP[activeJob.status] === "regenerate" ||
                    activeJob.log.some((l) => l.startsWith("Regenerated"))
                )
                .map((step, idx, arr) => {
                  const doneLine = activeJob.log.find((l) =>
                    step === "generate"
                      ? l.startsWith("Generated")
                      : step === "verify"
                      ? l.startsWith("Verified")
                      : step === "regenerate"
                      ? l.startsWith("Regenerated")
                      : l.startsWith("Saved")
                  );
                  const active = STATUS_TO_STEP[activeJob.status] === step;
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

        {phase === "results" && activeJob && (
          <div className="max-w-3xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                &ldquo;{activeJob.label}&rdquo; — {activeJob.questions.length} questions
              </h3>
              <button
                type="button"
                onClick={startNewSet}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-brand/10 hover:text-brand"
              >
                New set
              </button>
            </div>
            {activeJob.questions.map((q, i) => {
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
