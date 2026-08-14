"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { ExamCandidate, ExamConfig, ScenarioQuestion, VerifierResult } from "./types";

export type ExamJobStatus =
  | "generating"
  | "verifying"
  | "regenerating"
  | "finalizing"
  | "done"
  | "error";

export type ExamJob = {
  id: string;
  config: ExamConfig;
  label: string;
  status: ExamJobStatus;
  log: string[];
  questions: ScenarioQuestion[];
  examId?: string;
  error?: string;
};

type ExamQueueValue = {
  jobs: ExamJob[];
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
  startJob: (config: ExamConfig) => string;
  dismissJob: (id: string) => void;
};

const ExamQueueContext = createContext<ExamQueueValue | null>(null);

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

export function ExamQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ExamJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const idCounter = useRef(0);

  const updateJob = useCallback((id: string, patch: Partial<ExamJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const appendLog = useCallback((id: string, line: string) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, log: [...j.log, line] } : j)));
  }, []);

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setActiveJobId((cur) => (cur === id ? null : cur));
  }, []);

  const startJob = useCallback(
    (config: ExamConfig) => {
      const id = `exam-${Date.now()}-${idCounter.current++}`;
      const label = config.topics.length > 0 ? config.topics.join(", ") : config.course;
      const job: ExamJob = { id, config, label, status: "generating", log: [], questions: [] };
      setJobs((prev) => [...prev, job]);

      (async () => {
        try {
          // 1. Generate
          const genData = await postJson<{
            documentId: string;
            matchedDocuments: { documentId: string; title: string }[];
            candidates: ExamCandidate[];
          }>("/api/exam/generate", { config });
          const { candidates, documentId: docId } = genData;
          appendLog(
            id,
            `Generated ${candidates.length} candidates from ${genData.matchedDocuments.length} source document(s).`
          );

          // 2. Verify
          updateJob(id, { status: "verifying" });
          const verifyData = await postJson<{ verdicts: VerifierResult[] }>("/api/exam/verify", {
            course: config.course,
            topics: config.topics,
            candidates,
          });
          const verdictById = new Map(verifyData.verdicts.map((v) => [v.id, v]));

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
          appendLog(id, `Verified: ${accepted.length} accepted, ${rejected.length} flagged for regeneration.`);

          // 3. Regenerate rejected (single batched pass, no re-verification)
          if (rejected.length > 0) {
            updateJob(id, { status: "regenerating" });
            const regenData = await postJson<{ fixed: ExamCandidate[] }>("/api/exam/regenerate", {
              course: config.course,
              topics: config.topics,
              rejected,
            });
            const issuesById = new Map(rejected.map((r) => [r.candidate.id, r.issues]));
            regenData.fixed.forEach((candidate) => {
              accepted.push({
                ...candidate,
                verification: {
                  status: "regenerated",
                  reasoning: issuesById.get(candidate.id)?.join("; "),
                },
              });
            });
            appendLog(id, `Regenerated ${regenData.fixed.length} question(s).`);
          }

          const finalQuestions = accepted.slice(0, config.questionCount);

          // 4. Finalize (persist)
          updateJob(id, { status: "finalizing" });
          const finalizeData = await postJson<{ examId: string }>("/api/exam/finalize", {
            documentId: docId,
            topic: label,
            questions: finalQuestions,
          });
          appendLog(id, "Saved.");

          updateJob(id, { status: "done", questions: finalQuestions, examId: finalizeData.examId });
        } catch (err) {
          updateJob(id, {
            status: "error",
            error: err instanceof Error ? err.message : "Question generation failed.",
          });
        }
      })();

      return id;
    },
    [appendLog, updateJob]
  );

  return (
    <ExamQueueContext.Provider value={{ jobs, activeJobId, setActiveJobId, startJob, dismissJob }}>
      {children}
    </ExamQueueContext.Provider>
  );
}

export function useExamQueue() {
  const ctx = useContext(ExamQueueContext);
  if (!ctx) throw new Error("useExamQueue must be used within ExamQueueProvider");
  return ctx;
}
