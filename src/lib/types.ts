// Data models per Obexa_HLD_LLD.md section 5.

export interface DocumentAnalysis {
  subject: string;
  title: string;
  // Broad topic/chapter-level groupings (e.g. "Binary Trees") — coarser than
  // concepts, used to organize the knowledge base within a course.
  topics: string[];
  concepts: { name: string; description: string }[];
  keyFacts: string[];
  learningObjectives: string[];
}

export interface KnowledgeBaseEntry {
  documentId: string;
  course: string;
  rawText: string;
  analysis: DocumentAnalysis;
}

export interface KnowledgeBaseSummary {
  documentId: string;
  course: string;
  analysis: DocumentAnalysis;
  createdAt: string;
}

export interface ExamConfig {
  course: string;
  topics: string[]; // selected topic names within the course; empty = whole course
  questionCount: number; // demo target: 5
  difficulty: { easy: number; medium: number; hard: number };
}

export interface ScenarioQuestion {
  id: string;
  scenario: string;
  question: string;
  difficulty: "easy" | "medium" | "hard";
  concept: string;
  modelAnswer: string;
  rubric: { point: string; weight: number }[];
  verification: { status: "verified" | "regenerated"; reasoning?: string };
}

export type ExamCandidate = Omit<ScenarioQuestion, "verification">;

export type VerifierResult = {
  id: string;
  valid: boolean;
  issues: string[];
  recommendation: "accept" | "regenerate";
};

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ExamEntry {
  examId: string;
  documentId: string;
  topic: string;
  questions: ScenarioQuestion[];
}
