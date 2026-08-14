"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ChatMessage } from "./types";

type ChatSessionValue = {
  topic: string | null;
  setTopic: Dispatch<SetStateAction<string | null>>;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
};

const ChatSessionContext = createContext<ChatSessionValue | null>(null);

// Lives in the (app) layout (not inside ExamPrepChat) so the active topic and
// its messages survive navigating to another page and back — the page
// component remounts, this provider doesn't.
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  return (
    <ChatSessionContext.Provider value={{ topic, setTopic, messages, setMessages }}>
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSession() {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) throw new Error("useChatSession must be used within a ChatSessionProvider");
  return ctx;
}
