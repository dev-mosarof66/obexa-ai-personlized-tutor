import { NextResponse } from "next/server";
import { getChatHistory } from "@/lib/store";

export async function GET(req: Request) {
  const topic = new URL(req.url).searchParams.get("topic")?.trim();

  if (!topic) {
    return NextResponse.json({ error: "topic query param is required." }, { status: 400 });
  }

  try {
    const messages = await getChatHistory(topic);
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ error: "Failed to load chat history." }, { status: 502 });
  }
}
