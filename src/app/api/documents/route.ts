import { NextResponse } from "next/server";
import { listKnowledgeBaseEntries } from "@/lib/store";

export async function GET() {
  try {
    const documents = await listKnowledgeBaseEntries();
    return NextResponse.json({ documents });
  } catch (err) {
    console.error("Failed to load knowledge base:", err);
    return NextResponse.json({ error: "Failed to load knowledge base." }, { status: 502 });
  }
}
