import { NextResponse } from "next/server";
import { buildSourceContext } from "@/lib/context";
import { generateJson } from "@/lib/gemini";
import { SCENARIO_GENERATOR_PROMPT } from "@/lib/prompts";
import { findDocumentsByCourseAndTopics } from "@/lib/store";
import type { ExamCandidate, ExamConfig } from "@/lib/types";

const CANDIDATE_BUFFER = 3;

export async function POST(req: Request) {
  const { config } = (await req.json()) as { config?: ExamConfig };

  if (!config?.course?.trim() || !config.questionCount) {
    return NextResponse.json({ error: "config.course and config.questionCount are required." }, { status: 400 });
  }

  const topics = config.topics ?? [];
  const label = topics.length > 0 ? topics.join(", ") : config.course;

  let matches;
  try {
    matches = await findDocumentsByCourseAndTopics(config.course, topics);
  } catch {
    return NextResponse.json({ error: "Failed to search the knowledge base." }, { status: 502 });
  }

  if (matches.length === 0) {
    return NextResponse.json(
      {
        error:
          topics.length > 0
            ? `No documents in "${config.course}" cover ${label} yet.`
            : `No documents found under course "${config.course}" yet.`,
      },
      { status: 404 }
    );
  }

  const targetCount = config.questionCount + CANDIDATE_BUFFER;
  const userContent = `## Requested course
${config.course}

## Requested topics
${topics.length > 0 ? topics.join(", ") : "(all topics in this course)"}

## Source material
${buildSourceContext(matches)}

## Config
${JSON.stringify({ ...config, questionCount: targetCount }, null, 2)}`;

  try {
    const candidates = await generateJson<ExamCandidate[]>(SCENARIO_GENERATOR_PROMPT, userContent);
    return NextResponse.json({
      documentId: matches[0].documentId,
      matchedDocuments: matches.map((m) => ({ documentId: m.documentId, title: m.analysis.title })),
      candidates,
    });
  } catch {
    return NextResponse.json({ error: "Question generation failed. Please try again." }, { status: 502 });
  }
}
