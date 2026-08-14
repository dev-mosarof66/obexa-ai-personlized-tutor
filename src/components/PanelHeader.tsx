"use client";

import type { ReactNode } from "react";
import { MenuIcon } from "@/components/icons";
import { useMobileMenu } from "@/lib/mobileMenu";

export function PanelHeader({
  icon,
  title,
  description,
  right,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  const { openMenu } = useMobileMenu();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-3 py-2 sm:px-6 sm:py-4">
      <button
        type="button"
        onClick={openMenu}
        aria-label="Open menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:bg-brand/10 md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>
      <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {description && (
            <p className="truncate text-xs text-foreground/55">{description}</p>
          )}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2 sm:ml-auto">{right}</div>}
    </div>
  );
}
