"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownLite } from "@/components/MarkdownLite";
import { PanelHeader } from "@/components/PanelHeader";
import { AlertIcon, BookIcon, ChatIcon, SendIcon, SparkleIcon } from "@/components/icons";
import { useChatSession } from "@/lib/chatSession";
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

export function ExamPrepChat() {
  const [documents, setDocuments] = useState<KnowledgeBaseSummary[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseQuery, setCourseQuery] = useState("");

  // Lives in ChatSessionProvider (mounted in the (app) layout), not local
  // state, so the active topic and its messages survive navigating away to
  // another page and back — this component remounts on every route change.
  const { topic, setTopic, messages, setMessages } = useChatSession();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, loading, loadingHistory]);

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
    () => courses.find((c) => c.course === topic)?.topics ?? [],
    [courses, topic]
  );

  // Derived, not stored: matches whatever /api/chat's findRelevantDocuments
  // will actually use for this course, so the header is accurate immediately
  // on selecting a course and after restoring history — not just post-send.
  const matchedDocuments: MatchedDoc[] = useMemo(() => {
    if (!topic) return [];
    return documents
      .filter((d) => (d.course?.trim() || "Uncategorized") === topic)
      .slice(0, 3)
      .map((d) => ({ documentId: d.documentId, title: d.analysis.title }));
  }, [documents, topic]);

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

  // Restore the active conversation on mount: if the topic already lives in
  // ChatSessionProvider (came back from another page — messages are already
  // cached, no refetch needed), otherwise fall back to the URL (survives a
  // hard refresh) and fetch it from Supabase.
  useEffect(() => {
    if (topic) {
      writeTopicToUrl(topic);
      if (messages.length === 0) loadHistory(topic);
      return;
    }
    const t = readTopicFromUrl();
    if (t) {
      setTopic(t);
      loadHistory(t);
    }
  }, []);

  function startCourse(course: string) {
    setTopic(course);
    setError(null);
    writeTopicToUrl(course);
    loadHistory(course);
  }

  function changeTopic() {
    setTopic(null);
    setMessages([]);
    setError(null);
    setCourseQuery("");
    writeTopicToUrl(null);
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
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
        />
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <BookIcon className="h-6 w-6" />
            </span>
            <h3 className="mt-3 text-center text-sm font-semibold">Which course?</h3>
            <p className="mt-1 text-center text-xs text-foreground/55">
              Search a course from your knowledge base to start chatting —
              you can ask about any topic once you&apos;re in.
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
                  onClick={() => startCourse(c.course)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-brand/40 hover:bg-brand/10"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{c.course}</span>
                  <span className="ml-2 shrink-0 text-xs text-foreground/50">
                    {c.docCount} doc{c.docCount === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
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
        right={
          <button
            type="button"
            onClick={changeTopic}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-brand/10 hover:text-brand"
          >
            Change course
          </button>
        }
      />

      <div ref={scrollContainerRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {loadingHistory && (
          <p className="text-sm text-foreground/50">Loading conversation…</p>
        )}
        {!loadingHistory && messages.length === 0 && (
          <div>
            <p className="text-sm text-foreground/50">
              Ask anything about &ldquo;{topic}&rdquo; — concepts, definitions, or
              things you&apos;re stuck on.
            </p>
            {courseTopics.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  Or ask about a specific topic
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {courseTopics.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => send(`Tell me about ${t}.`)}
                      disabled={loading}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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
            onClick={() => send()}
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
