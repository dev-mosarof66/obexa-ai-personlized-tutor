"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, ChatIcon, RefreshIcon, SparkleIcon, XIcon } from "@/components/icons";
import { useExamQueue } from "@/lib/examQueue";
import { useMobileMenu } from "@/lib/mobileMenu";
import { useUploadQueue } from "@/lib/uploadQueue";

const NAV_ITEMS: { href: string; label: string; icon: typeof BookIcon }[] = [
  {
    href: "/kb",
    label: "Knowledge Base",
    icon: BookIcon,
  },
  {
    href: "/exam-prep",
    label: "Exam Preparation Helper",
    icon: ChatIcon,
  },
  {
    href: "/question-gen",
    label: "Question Generator",
    icon: SparkleIcon,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { open, closeMenu } = useMobileMenu();

  const { jobs } = useUploadQueue();
  const activeUploads = jobs.filter((j) => j.status === "queued" || j.status === "processing").length;

  const { jobs: examJobs } = useExamQueue();
  const activeExamJobs = examJobs.filter((j) => j.status !== "done" && j.status !== "error").length;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 shrink-0 flex-col border-r border-border bg-surface transition-transform duration-300 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-border px-5 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-brand to-fuchsia-500 text-sm font-bold text-white shadow-sm shadow-brand/30">
                O
              </span>
              <h1 className="text-lg font-semibold tracking-tight">Obexa</h1>
            </div>
            <button
              type="button"
              onClick={closeMenu}
              aria-label="Close menu"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-brand/10 md:hidden"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-sm text-foreground/80 text-tighter">
            Your Personal AI Partner for Learning.
          </p>
        </div>

        <nav className="flex-1 space-y-1.5 p-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMenu}
              className={`flex w-full items-center justify-between px-3 py-2 text-left cursor-pointer transition-all duration-300 ${
                pathname === item.href
                  ? "border-l-2 border-blue-700"
                  : "text-foreground/70 hover:bg-brand/10 hover:text-foreground"
              }`}
            >
              <p className="text-sm font-medium">{item.label}</p>
              {item.href === "/kb" && activeUploads > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                  <RefreshIcon className="h-2.5 w-2.5 animate-spin" />
                  {activeUploads}
                </span>
              )}
              {item.href === "/question-gen" && activeExamJobs > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                  <RefreshIcon className="h-2.5 w-2.5 animate-spin" />
                  {activeExamJobs}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
