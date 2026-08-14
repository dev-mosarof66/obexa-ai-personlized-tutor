import { NextResponse } from "next/server";
import { saveExam } from "@/lib/store";
import type { ScenarioQuestion } from "@/lib/types";

export async function POST(req: Request) {
  const { documentId, topic, questions } = (await req.json()) as {
    documentId?: string;
    topic?: string;
    questions?: ScenarioQuestion[];
  };

  if (!documentId || !topic?.trim() || !questions?.length) {
    return NextResponse.json({ error: "documentId, topic, and questions are required." }, { status: 400 });
  }

  try {
    const exam = await saveExam(documentId, topic, questions);
    return NextResponse.json({ examId: exam.examId });
  } catch {
    return NextResponse.json({ error: "Failed to save exam. Please try again." }, { status: 502 });
  }
}
