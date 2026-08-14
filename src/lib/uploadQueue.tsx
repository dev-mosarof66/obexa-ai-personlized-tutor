"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type UploadJobStatus = "queued" | "processing" | "done" | "error";

export type UploadJob = {
  id: string;
  fileName: string;
  course: string;
  status: UploadJobStatus;
  error?: string;
};

type UploadQueueValue = {
  jobs: UploadJob[];
  completedCount: number;
  enqueueFiles: (files: File[], course: string) => void;
  dismissJob: (id: string) => void;
};

const MAX_CONCURRENT_UPLOADS = 2;

const UploadQueueContext = createContext<UploadQueueValue | null>(null);

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const idCounter = useRef(0);
  const pending = useRef<{ id: string; file: File; course: string }[]>([]);
  const activeCount = useRef(0);

  const runNext = useCallback(() => {
    while (activeCount.current < MAX_CONCURRENT_UPLOADS && pending.current.length > 0) {
      const next = pending.current.shift();
      if (!next) break;
      const { id, file, course } = next;
      activeCount.current++;
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "processing" } : j)));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("course", course);

      fetch("/api/analyze", { method: "POST", body: formData })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
          setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "done" } : j)));
          setCompletedCount((c) => c + 1);
        })
        .catch((err) => {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === id
                ? { ...j, status: "error", error: err instanceof Error ? err.message : "Analysis failed." }
                : j
            )
          );
        })
        .finally(() => {
          activeCount.current--;
          runNext();
        });
    }
  }, []);

  const enqueueFiles = useCallback(
    (files: File[], course: string) => {
      const newJobs: UploadJob[] = files.map((file) => ({
        id: `job-${Date.now()}-${idCounter.current++}`,
        fileName: file.name,
        course,
        status: "queued",
      }));
      setJobs((prev) => [...prev, ...newJobs]);
      newJobs.forEach((job, i) => pending.current.push({ id: job.id, file: files[i], course }));
      runNext();
    },
    [runNext]
  );

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  return (
    <UploadQueueContext.Provider value={{ jobs, completedCount, enqueueFiles, dismissJob }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue must be used within UploadQueueProvider");
  return ctx;
}
