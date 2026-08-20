"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { useT } from "@/lib/i18n";
import { InventoryMain } from "./InventoryMain";

export function InventoryShell() {
  const t = useT();
  const router = useRouter();

  return (
    <div className="flex h-screen flex-col th-bg-base overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 th-bg-surface border-b th-border shrink-0">
        <button
          onClick={() => router.back()}
          className="th-text-muted hover:th-text transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Package size={18} className="text-brand-400" />
          <span className="font-semibold text-sm th-text">{t("inventory.title")}</span>
        </div>
      </header>
      <InventoryMain />
    </div>
  );
}
