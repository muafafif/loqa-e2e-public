"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { I18nProvider, useT } from "@/lib/i18n";
import { LockProvider } from "@/lib/LockContext";
import { NotesMain } from "./NotesMain";

export function NotesShell() {
  return (
    <I18nProvider>
      <LockProvider>
        <NotesShellInner />
      </LockProvider>
    </I18nProvider>
  );
}

function NotesShellInner() {
  const t = useT();
  const router = useRouter();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="px-4 py-3 border-b th-border glass-surface flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-xs th-text-2 hover:th-text transition-colors"
        >
          <ArrowLeft size={14} />
          {t("common.back")}
        </button>
        <span className="text-sm font-semibold th-text">{t("notes.title")}</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <NotesMain />
      </div>
    </div>
  );
}
