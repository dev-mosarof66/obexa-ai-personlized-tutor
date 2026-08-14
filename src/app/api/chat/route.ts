import { NextResponse } from "next/server";
import { buildSourceContext } from "@/lib/context";
import { generateText } from "@/lib/gemini";
import { CHAT_AGENT_PROMPT } from "@/lib/prompts";
import { findRelevantDocuments, saveChatMessage } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

export async function POST(req: Request) {
  const { topic, message, history } = (await req.json()) as {
    topic?: string;
    message?: string;
    history?: ChatMessage[];
  };

  if (!topic?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "topic and message are required." }, { status: 400 });
  }
  const normalizedTopic = topic.trim();

  let matches;
  try {
    matches = await findRelevantDocuments(normalizedTopic);
  } catch {
    return NextResponse.json({ error: "Failed to search the knowledge base." }, { status: 502 });
  }

  if (matches.length === 0) {
    return NextResponse.json({
      reply: `Nothing in the knowledge base matches "${normalizedTopic}" yet. Upload a document covering this topic on the Knowledge Base page first.`,
      matchedDocuments: [],
    });
  }

  const historyText = (history ?? [])
    .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
    .join("\n");

  const userContent = `## Student's topic
${normalizedTopic}

## Retrieved source material
${buildSourceContext(matches)}

## Conversation so far
${historyText || "(none)"}

## New student message
${message}`;

  try {
    const reply = await generateText(CHAT_AGENT_PROMPT, userContent);

    // Best-effort persistence — a DB hiccup here shouldn't fail a reply the
    // student is already looking at.
    Promise.all([
      saveChatMessage(normalizedTopic, { role: "user", content: message }),
      saveChatMessage(normalizedTopic, { role: "model", content: reply }),
    ]).catch(() => {});

    return NextResponse.json({
      reply,
      matchedDocuments: matches.map((m) => ({ documentId: m.documentId, title: m.analysis.title })),
    });
  } catch {
    return NextResponse.json({ error: "Chat request failed. Please try again." }, { status: 502 });
  }
}
