"use client";

import { useState } from "react";
import { ExamPrepChat } from "@/components/ExamPrepChat";
import { KnowledgeBasePanel } from "@/components/KnowledgeBasePanel";
import { QuestionGenerator } from "@/components/QuestionGenerator";
import { Sidebar, type View } from "@/components/Sidebar";
import { UploadQueueProvider } from "@/lib/uploadQueue";

export default function Home() {
  const [view, setView] = useState<View>("kb");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openMenu = () => setSidebarOpen(true);

  return (
    <UploadQueueProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar
          activeView={view}
          onSelectView={(v) => {
            setView(v);
            setSidebarOpen(false);
          }}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-hidden">
            {view === "kb" && <KnowledgeBasePanel onOpenMenu={openMenu} />}
            {view === "exam-prep" && <ExamPrepChat onOpenMenu={openMenu} />}
            {view === "question-gen" && <QuestionGenerator onOpenMenu={openMenu} />}
          </main>
        </div>
      </div>
    </UploadQueueProvider>
  );
}
