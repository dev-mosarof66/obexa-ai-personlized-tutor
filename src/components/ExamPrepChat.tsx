"use client";

import { useEffect, useMemo, useState } from "react";
import { MarkdownLite } from "@/components/MarkdownLite";
import { PanelHeader } from "@/components/PanelHeader";
import { AlertIcon, BookIcon, ChatIcon, SendIcon, SparkleIcon } from "@/components/icons";
import type { ChatMessage, KnowledgeBaseSummary } from "@/lib/types";

type MatchedDoc = { documentId: string; title: string };
type CourseInfo = { course: string; docCount: number; topics: string[] };

const TOPIC_URL_PARAM = "topic";

function readTopicFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(TOPIC_URL_PARAM);
}

function writeTopicToUrl(topic: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (topic) url.searchParams.set(TOPIC_URL_PARAM, topic);
  else url.searchParams.delete(TOPIC_URL_PARAM);
  window.history.replaceState({}, "", url);
}

function summarizeCourses(documents: KnowledgeBaseSummary[]): CourseInfo[] {
  const byCourse = new Map<string, { docCount: number; topics: Set<string> }>();
  for (const doc of documents) {
    const course = doc.course?.trim() || "Uncategorized";
    if (!byCourse.has(course)) byCourse.set(course, { docCount: 0, topics: new Set() });
    const entry = byCourse.get(course)!;
    entry.docCount++;
    for (const t of doc.analysis.topics ?? []) entry.topics.add(t);
  }
  return Array.from(byCourse.entries())
    .map(([course, { docCount, topics }]) => ({
      course,
      docCount,
      topics: Array.from(topics).sort(),
    }))
    .sort((a, b) => a.course.localeCompare(b.course));
}

export function ExamPrepChat({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [documents, setDocuments] = useState<KnowledgeBaseSummary[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseQuery, setCourseQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  const [topicInput, setTopicInput] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [matchedDocuments, setMatchedDocuments] = useState<MatchedDoc[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => setDocuments(data.documents ?? []))
      .catch(() => {})
      .finally(() => setLoadingCourses(false));
  }, []);

  const courses = useMemo(() => summarizeCourses(documents), [documents]);
  const filteredCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => c.course.toLowerCase().includes(q));
  }, [courses, courseQuery]);

  const courseTopics = useMemo(
    () => courses.find((c) => c.course === selectedCourse)?.topics ?? [],
    [courses, selectedCourse]
  );
  const topicSuggestions = useMemo(() => {
    const q = topicInput.trim().toLowerCase();
    if (!q) return courseTopics;
    return courseTopics.filter((t) => t.toLowerCase().includes(q));
  }, [courseTopics, topicInput]);

  async function loadHistory(t: string) {
    setLoadingHistory(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/history?topic=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load chat history.");
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat history.");
    } finally {
      setLoadingHistory(false);
    }
  }

  // A topic in the URL survives a refresh — the actual conversation lives in
  // Supabase (chat_messages), keyed by topic, so we just re-fetch it.
  useEffect(() => {
    const t = readTopicFromUrl();
    if (t) {
      setTopic(t);
      loadHistory(t);
    }
  }, []);

  function startTopic(value?: string) {
    const t = (value ?? topicInput).trim();
    if (!t) return;
    setTopic(t);
    setMatchedDocuments([]);
    setError(null);
    writeTopicToUrl(t);
    loadHistory(t);
  }

  function changeTopic() {
    setTopic(null);
    setTopicInput("");
    setMessages([]);
    setMatchedDocuments([]);
    setError(null);
    setSelectedCourse(null);
    setCourseQuery("");
    writeTopicToUrl(null);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || !topic) return;

    const history = messages;
    const nextMessages: ChatMessage[] = [...history, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, message: text, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat request failed.");
      setMessages([...nextMessages, { role: "model", content: data.reply }]);
      setMatchedDocuments(data.matchedDocuments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!topic) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader
          icon={<ChatIcon className="h-5 w-5" />}
          title="Exam Preparation Helper"
          description="Chat with your knowledge base to learn a topic or clear a confusion"
          onMenuClick={onOpenMenu}
        />
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
            {!selectedCourse ? (
              <>
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <BookIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-3 text-center text-sm font-semibold">Which course?</h3>
                <p className="mt-1 text-center text-xs text-foreground/55">
                  Search a course from your knowledge base to start.
                </p>
                <input
                  value={courseQuery}
                  onChange={(e) => setCourseQuery(e.target.value)}
                  placeholder="Search course name…"
                  className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                  autoFocus
                />
                <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
                  {loadingCourses && (
                    <p className="py-2 text-center text-xs text-foreground/50">Loading courses…</p>
                  )}
                  {!loadingCourses && courses.length === 0 && (
                    <p className="py-2 text-center text-xs text-foreground/50">
                      Nothing in the knowledge base yet — upload a course PDF first.
                    </p>
                  )}
                  {!loadingCourses && courses.length > 0 && filteredCourses.length === 0 && (
                    <p className="py-2 text-center text-xs text-foreground/50">
                      No course matches &ldquo;{courseQuery}&rdquo;.
                    </p>
                  )}
                  {filteredCourses.map((c) => (
                    <button
                      key={c.course}
                      type="button"
                      onClick={() => setSelectedCourse(c.course)}
                      className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-brand/40 hover:bg-brand/10"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{c.course}</span>
                      <span className="ml-2 shrink-0 text-xs text-foreground/50">
                        {c.docCount} doc{c.docCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setSelectedCourse(null)}
                    className="text-xs font-medium text-foreground/50 hover:text-brand"
                  >
                    ← Change course
                  </button>
                  <span className="truncate text-xs font-medium text-brand">{selectedCourse}</span>
                </div>
                <h3 className="mt-3 text-center text-sm font-semibold">What topic are you stuck on?</h3>
                <p className="mt-1 text-center text-xs text-foreground/55">
                  Pick a suggestion, or type your own — we&apos;ll search the
                  material before answering.
                </p>
                <div className="relative mt-4">
                  <div className="flex gap-2">
                    <input
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && startTopic()}
                      placeholder="e.g. Binary Search Trees"
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => startTopic()}
                      disabled={!topicInput.trim()}
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-strong disabled:opacity-50"
                    >
                      Start
                    </button>
                  </div>
                  {topicInput.trim() && topicSuggestions.length > 0 && (
                    <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-md">
                      {topicSuggestions.slice(0, 6).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => startTopic(t)}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-brand/10"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!topicInput.trim() && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                      Suggested topics
                    </p>
                    {courseTopics.length === 0 ? (
                      <p className="text-xs text-foreground/50">
                        No topics extracted for this course yet — type your own above.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {courseTopics.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => startTopic(t)}
                            className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<ChatIcon className="h-5 w-5" />}
        title={topic}
        description={
          matchedDocuments.length > 0
            ? `Sources: ${matchedDocuments.map((d) => d.title).join(", ")}`
            : "No sources matched yet"
        }
        onMenuClick={onOpenMenu}
        right={
          <button
            type="button"
            onClick={changeTopic}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-brand/10 hover:text-brand"
          >
            Change topic
          </button>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {loadingHistory && (
          <p className="text-sm text-foreground/50">Loading conversation…</p>
        )}
        {!loadingHistory && messages.length === 0 && (
          <p className="text-sm text-foreground/50">
            Ask anything about &ldquo;{topic}&rdquo; — concepts, definitions, or
            things you&apos;re stuck on.
          </p>
        )}
        {!loadingHistory && messages.map((m, i) => (
          <div
            key={i}
            className={`flex items-end gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                m.role === "user" ? "bg-foreground/10 text-foreground/70" : "bg-linear-to-br from-brand to-fuchsia-500 text-white"
              }`}
            >
              {m.role === "user" ? "You" : <SparkleIcon className="h-3.5 w-3.5" />}
            </span>
            <div
              className={`max-w-2xl rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "rounded-br-sm whitespace-pre-wrap leading-relaxed bg-brand text-brand-foreground"
                  : "rounded-bl-sm bg-surface text-foreground border border-border"
              }`}
            >
              {m.role === "model" ? <MarkdownLite content={m.content} /> : m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-end gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand to-fuchsia-500 text-white">
              <SparkleIcon className="h-3.5 w-3.5" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40" />
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-4 pr-1.5 shadow-sm transition-colors focus-within:border-brand">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Ask about ${topic}…`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand-strong disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
