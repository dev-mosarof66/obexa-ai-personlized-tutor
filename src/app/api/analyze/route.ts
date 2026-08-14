import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { generateJson } from "@/lib/gemini";
import { DOCUMENT_AGENT_PROMPT } from "@/lib/prompts";
import { saveKnowledgeBaseEntry } from "@/lib/store";
import type { DocumentAnalysis } from "@/lib/types";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");
  const courseRaw = formData.get("course");
  const course = typeof courseRaw === "string" ? courseRaw.trim() : "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No PDF file provided." }, { status: 400 });
  }

  let rawText: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    rawText = result.text.trim();
  } catch (err) {
    console.error("PDF extraction failed:", err);
    return NextResponse.json(
      { error: "Unable to extract text from this PDF. Please upload a text-based PDF." },
      { status: 422 }
    );
  }

  if (!rawText) {
    return NextResponse.json(
      { error: "Unable to extract text from this PDF. Please upload a text-based PDF." },
      { status: 422 }
    );
  }

  let analysis: DocumentAnalysis;
  try {
    analysis = await generateJson<DocumentAnalysis>(DOCUMENT_AGENT_PROMPT, rawText);
  } catch {
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 502 });
  }

  let documentId: string;
  try {
    ({ documentId } = await saveKnowledgeBaseEntry(rawText, analysis, course));
  } catch {
    return NextResponse.json({ error: "Failed to save document. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ documentId, analysis });
}
