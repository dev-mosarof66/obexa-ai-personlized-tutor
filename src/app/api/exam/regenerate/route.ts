import { NextResponse } from "next/server";
import { buildSourceContext } from "@/lib/context";
import { generateJson } from "@/lib/gemini";
import { REGENERATOR_PROMPT } from "@/lib/prompts";
import { findDocumentsByCourseAndTopics } from "@/lib/store";
import type { ExamCandidate } from "@/lib/types";

export async function POST(req: Request) {
  const { course, topics, rejected } = (await req.json()) as {
    course?: string;
    topics?: string[];
    rejected?: { candidate: ExamCandidate; issues: string[] }[];
  };

  if (!course?.trim() || !rejected?.length) {
    return NextResponse.json({ error: "course and rejected are required." }, { status: 400 });
  }

  let matches;
  try {
    matches = await findDocumentsByCourseAndTopics(course, topics ?? []);
  } catch {
    return NextResponse.json({ error: "Failed to search the knowledge base." }, { status: 502 });
  }

  if (matches.length === 0) {
    return NextResponse.json(
      { error: `No documents in "${course}" match this request anymore.` },
      { status: 404 }
    );
  }

  const userContent = `## Source material
${buildSourceContext(matches)}

## Rejected questions and their issues
${JSON.stringify(rejected, null, 2)}`;

  try {
    const fixed = await generateJson<ExamCandidate[]>(REGENERATOR_PROMPT, userContent);
    return NextResponse.json({ fixed });
  } catch {
    return NextResponse.json({ error: "Regeneration failed. Please try again." }, { status: 502 });
  }
}
