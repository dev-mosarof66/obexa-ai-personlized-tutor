import { NextResponse } from "next/server";
import { buildSourceContext } from "@/lib/context";
import { generateJson } from "@/lib/gemini";
import { VERIFIER_PROMPT } from "@/lib/prompts";
import { findDocumentsByCourseAndTopics } from "@/lib/store";
import type { ExamCandidate, VerifierResult } from "@/lib/types";

export async function POST(req: Request) {
  const { course, topics, candidates } = (await req.json()) as {
    course?: string;
    topics?: string[];
    candidates?: ExamCandidate[];
  };

  if (!course?.trim() || !candidates?.length) {
    return NextResponse.json({ error: "course and candidates are required." }, { status: 400 });
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

## Candidate questions to verify
${JSON.stringify(candidates, null, 2)}`;

  try {
    const verdicts = await generateJson<VerifierResult[]>(VERIFIER_PROMPT, userContent);
    return NextResponse.json({ verdicts });
  } catch {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 502 });
  }
}
