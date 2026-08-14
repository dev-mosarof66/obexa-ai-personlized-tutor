"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PanelHeader } from "@/components/PanelHeader";
import {
  AlertIcon,
  BookIcon,
  ChevronDownIcon,
  RefreshIcon,
  UploadCloudIcon,
  XIcon,
} from "@/components/icons";
import { useUploadQueue } from "@/lib/uploadQueue";
import type { KnowledgeBaseSummary } from "@/lib/types";

type TopicGroup = { topic: string; documents: KnowledgeBaseSummary[] };
type CourseGroup = {
  course: string;
  documents: KnowledgeBaseSummary[];
  topicGroups: TopicGroup[];
  untopicked: KnowledgeBaseSummary[];
};

function groupByCourseAndTopic(documents: KnowledgeBaseSummary[]): CourseGroup[] {
  const byCourse = new Map<string, KnowledgeBaseSummary[]>();
  for (const doc of documents) {
    const course = doc.course?.trim() || "Uncategorized";
    if (!byCourse.has(course)) byCourse.set(course, []);
    byCourse.get(course)!.push(doc);
  }

  return Array.from(byCourse.entries()).map(([course, docs]) => {
    const byTopic = new Map<string, KnowledgeBaseSummary[]>();
    const untopicked: KnowledgeBaseSummary[] = [];
    for (const doc of docs) {
      const topics = doc.analysis.topics ?? [];
      if (topics.length === 0) {
        untopicked.push(doc);
        continue;
      }
      for (const topic of topics) {
        if (!byTopic.has(topic)) byTopic.set(topic, []);
        byTopic.get(topic)!.push(doc);
      }
    }
    return {
      course,
      documents: docs,
      topicGroups: Array.from(byTopic.entries()).map(([topic, tDocs]) => ({ topic, documents: tDocs })),
      untopicked,
    };
  });
}

export function KnowledgeBasePanel({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const { jobs, completedCount, enqueueFiles, dismissJob } = useUploadQueue();
  const [documents, setDocuments] = useState<KnowledgeBaseSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedCourses, setCollapsedCourses] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [courseInput, setCourseInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "processing");

  async function loadDocuments() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load knowledge base.");
      setDocuments(data.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge base.");
    } finally {
      setLoadingList(false);
    }
  }

  // Refetch whenever a background upload finishes, even if it started on
  // another tab and completed while this panel wasn't mounted.
  useEffect(() => {
    loadDocuments();
  }, [completedCount]);

  const knownCourses = useMemo(
    () => Array.from(new Set(documents.map((d) => d.course?.trim()).filter(Boolean))).sort(),
    [documents]
  );

  const courseGroups = useMemo(() => groupByCourseAndTopic(documents), [documents]);

  function handleFiles(files: File[]) {
    const pdfs = files.filter((f) => f.type === "application/pdf");
    if (pdfs.length === 0) return;
    setError(null);
    enqueueFiles(pdfs, courseInput.trim());
  }

  function toggleCourse(course: string) {
    setCollapsedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(course)) next.delete(course);
      else next.add(course);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<BookIcon className="h-5 w-5" />}
        title="Knowledge Base"
        description="Every upload here powers Exam Prep chat and the Question Generator"
        onMenuClick={onOpenMenu}
        right={
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-foreground shadow-sm shadow-brand/30 transition-colors hover:bg-brand-strong"
          >
            <UploadCloudIcon className="h-4 w-4" />
            <span className="hidden sm:block sm:text-xs">Upload PDFs</span>
            {activeJobs.length > 0 && (
              <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-xs">{activeJobs.length}</span>
            )}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        <div className="mb-4 max-w-sm">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Course Name <span className="text-rose-500">*</span>
          </label>
          <input
            list="known-courses"
            value={courseInput}
            onChange={(e) => setCourseInput(e.target.value)}
            placeholder="e.g. Data Structures"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <datalist id="known-courses">
            {knownCourses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {jobs.some((j) => j.status !== "done") && (
          <div className="mb-4 space-y-2">
            {jobs
              .filter((j) => j.status !== "done")
              .map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  {job.status === "error" ? (
                    <AlertIcon className="h-4 w-4 shrink-0 text-rose-500" />
                  ) : (
                    <RefreshIcon
                      className={`h-4 w-4 shrink-0 text-brand ${job.status === "processing" ? "animate-spin" : ""}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {job.course ? `${job.course} — ${job.fileName}` : job.fileName}
                    </p>
                    <p className="truncate text-xs text-foreground/50">
                      {job.status === "queued" && "Waiting for a free upload slot…"}
                      {job.status === "processing" && "Extracting text and analyzing with Gemini…"}
                      {job.status === "error" && (job.error ?? "Analysis failed.")}
                    </p>
                  </div>
                  {job.status === "error" && (
                    <button
                      type="button"
                      onClick={() => dismissJob(job.id)}
                      className="shrink-0 text-foreground/40 hover:text-foreground"
                      aria-label="Dismiss"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors sm:px-6 sm:py-12 ${
            dragging ? "border-brand bg-brand/5" : "border-border hover:border-brand/50 hover:bg-brand/5"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
            <UploadCloudIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-medium">Drop lecture PDFs here, or click to browse</p>
          </div>
        </div>

        {loadingList && <p className="text-sm text-foreground/50">Loading knowledge base…</p>}

        {courseGroups.length > 0 && (
          <>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/50">
              Knowledge Base
              <span className="ml-1.5 normal-case text-foreground/40">
                ({courseGroups.length} course{courseGroups.length === 1 ? "" : "s"})
              </span>
            </h2>
            <div className="space-y-4">
              {courseGroups.map((group) => {
              const collapsed = collapsedCourses.has(group.course);
              return (
                <div key={group.course} className="overflow-hidden rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => toggleCourse(group.course)}
                    className="flex w-full items-center gap-2 bg-surface px-4 py-3 text-left"
                  >
                    <ChevronDownIcon
                      className={`h-4 w-4 shrink-0 text-foreground/40 transition-transform ${
                        collapsed ? "-rotate-90" : ""
                      }`}
                    />
                    <h3 className="text-sm font-semibold">{group.course}</h3>
                    <span className="text-xs text-foreground/50">
                      {group.documents.length} document{group.documents.length === 1 ? "" : "s"} ·{" "}
                      {group.topicGroups.length} topic{group.topicGroups.length === 1 ? "" : "s"}
                    </span>
                  </button>

                  {!collapsed && (
                    <div className="space-y-4 border-t border-border p-3 sm:p-4">
                      {group.topicGroups.map((tg) => (
                        <div key={tg.topic}>
                          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
                            {tg.topic}
                            <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium normal-case text-brand">
                              {tg.documents.length}
                            </span>
                          </p>
                          <div className="space-y-2">
                            {tg.documents.map((doc) => (
                              <DocumentCard
                                key={`${tg.topic}-${doc.documentId}`}
                                doc={doc}
                                expanded={expandedId === doc.documentId}
                                onToggle={() =>
                                  setExpandedId(expandedId === doc.documentId ? null : doc.documentId)
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ))}

                      {group.untopicked.length > 0 && (
                        <div>
                          {group.topicGroups.length > 0 && (
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                              Other documents
                            </p>
                          )}
                          <div className="space-y-2">
                            {group.untopicked.map((doc) => (
                              <DocumentCard
                                key={doc.documentId}
                                doc={doc}
                                expanded={expandedId === doc.documentId}
                                onToggle={() =>
                                  setExpandedId(expandedId === doc.documentId ? null : doc.documentId)
                                }
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DocumentCard({
  doc,
  expanded,
  onToggle,
}: {
  doc: KnowledgeBaseSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <BookIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.analysis.title}</p>
          <p className="truncate text-xs text-foreground/50">
            {doc.analysis.subject} · {doc.analysis.concepts.length} concepts ·{" "}
            {new Date(doc.createdAt).toLocaleDateString()}
          </p>
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-foreground/40 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="grid gap-5 border-t border-border px-4 py-4 sm:grid-cols-2">
          <div>
            {(doc.analysis.topics ?? []).length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  Topics
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {doc.analysis.topics.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">Concepts</p>
            <ul className="space-y-1.5">
              {doc.analysis.concepts.map((c) => (
                <li key={c.name} className="text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-foreground/55"> — {c.description}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                Key facts
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-foreground/70">
                {doc.analysis.keyFacts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                Learning objectives
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-foreground/70">
                {doc.analysis.learningObjectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
