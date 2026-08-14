import { supabase } from "./supabase";
import type {
  ChatMessage,
  DocumentAnalysis,
  ExamEntry,
  KnowledgeBaseEntry,
  KnowledgeBaseSummary,
  ScenarioQuestion,
} from "./types";

// Persisted in Supabase (see supabase/schema.sql) — documentId/examId are the
// Postgres row ids, generated on insert rather than passed in.

export async function saveKnowledgeBaseEntry(
  rawText: string,
  analysis: DocumentAnalysis,
  course: string
): Promise<KnowledgeBaseEntry> {
  const { data, error } = await supabase
    .from("documents")
    .insert({ raw_text: rawText, analysis, course })
    .select("id, raw_text, analysis, course")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save document: ${error?.message ?? "unknown error"}`);
  }

  return { documentId: data.id, rawText: data.raw_text, analysis: data.analysis, course: data.course };
}

export async function listKnowledgeBaseEntries(): Promise<KnowledgeBaseSummary[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, analysis, course, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list documents: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    documentId: row.id,
    analysis: row.analysis,
    course: row.course,
    createdAt: row.created_at,
  }));
}

export async function getKnowledgeBaseEntry(documentId: string): Promise<KnowledgeBaseEntry | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, raw_text, analysis, course")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !data) return null;
  return { documentId: data.id, rawText: data.raw_text, analysis: data.analysis, course: data.course };
}

/**
 * RAG-lite retrieval across the whole knowledge base: scores every stored
 * document against the topic string (weighted keyword matching over
 * subject/title/concepts/facts/objectives, then raw text) and returns the
 * top matches. No vector DB — matches the HLD's "context stuffing" approach,
 * just extended across documents instead of a single active one.
 */
export async function findRelevantDocuments(
  topic: string,
  limit = 3
): Promise<KnowledgeBaseEntry[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, raw_text, analysis, course");

  if (error) {
    throw new Error(`Failed to search documents: ${error.message}`);
  }

  const words = topic
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);

  if (words.length === 0 || !data) return [];

  const scored = data.map((row) => {
    const entry: KnowledgeBaseEntry = {
      documentId: row.id,
      rawText: row.raw_text,
      analysis: row.analysis,
      course: row.course,
    };
    return { entry, score: scoreDocument(words, entry) };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

function scoreDocument(topicWords: string[], entry: KnowledgeBaseEntry): number {
  const { analysis, rawText, course } = entry;
  const weightedFields: { text: string; weight: number }[] = [
    { text: (analysis.topics ?? []).join(" "), weight: 6 },
    { text: course, weight: 5 },
    { text: analysis.subject, weight: 5 },
    { text: analysis.title, weight: 5 },
    { text: analysis.concepts.map((c) => `${c.name} ${c.description}`).join(" "), weight: 3 },
    { text: analysis.keyFacts.join(" "), weight: 2 },
    { text: analysis.learningObjectives.join(" "), weight: 2 },
    { text: rawText.slice(0, 20000), weight: 1 },
  ];

  let score = 0;
  for (const { text, weight } of weightedFields) {
    const lower = text.toLowerCase();
    for (const word of topicWords) {
      const occurrences = lower.split(word).length - 1;
      score += occurrences * weight;
    }
  }
  return score;
}

/**
 * Exact-match retrieval for the Question Generator: the user picks a course
 * and (optionally) specific topics from real extracted values shown in the
 * UI, so — unlike findRelevantDocuments' fuzzy keyword scoring for free-text
 * chat — this filters precisely instead of guessing relevance.
 */
export async function findDocumentsByCourseAndTopics(
  course: string,
  topics: string[]
): Promise<KnowledgeBaseEntry[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, raw_text, analysis, course")
    .eq("course", course);

  if (error) {
    throw new Error(`Failed to search documents: ${error.message}`);
  }

  const entries: KnowledgeBaseEntry[] = (data ?? []).map((row) => ({
    documentId: row.id,
    rawText: row.raw_text,
    analysis: row.analysis,
    course: row.course,
  }));

  if (topics.length === 0) return entries;

  return entries.filter((e) => (e.analysis.topics ?? []).some((t) => topics.includes(t)));
}

export async function saveExam(
  documentId: string,
  topic: string,
  questions: ScenarioQuestion[]
): Promise<ExamEntry> {
  const { data, error } = await supabase
    .from("exams")
    .insert({ document_id: documentId, topic, questions })
    .select("id, document_id, topic, questions")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save exam: ${error?.message ?? "unknown error"}`);
  }

  return { examId: data.id, documentId: data.document_id, topic: data.topic, questions: data.questions };
}

export async function getExam(examId: string): Promise<ExamEntry | null> {
  const { data, error } = await supabase
    .from("exams")
    .select("id, document_id, topic, questions")
    .eq("id", examId)
    .maybeSingle();

  if (error || !data) return null;
  return { examId: data.id, documentId: data.document_id, topic: data.topic, questions: data.questions };
}

export async function saveChatMessage(topic: string, message: ChatMessage): Promise<void> {
  const { error } = await supabase
    .from("chat_messages")
    .insert({ topic, role: message.role, content: message.content });

  if (error) {
    throw new Error(`Failed to save chat message: ${error.message}`);
  }
}

export async function getChatHistory(topic: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("topic", topic)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load chat history: ${error.message}`);
  }

  return (data ?? []).map((row) => ({ role: row.role, content: row.content }));
}
