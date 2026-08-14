"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ExamQueueProvider } from "@/lib/examQueue";
import { MobileMenuProvider } from "@/lib/mobileMenu";
import { UploadQueueProvider } from "@/lib/uploadQueue";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <UploadQueueProvider>
      <ExamQueueProvider>
        <MobileMenuProvider>
          <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </div>
          </div>
        </MobileMenuProvider>
      </ExamQueueProvider>
    </UploadQueueProvider>
  );
}
