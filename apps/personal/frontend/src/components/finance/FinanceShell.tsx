"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useLock } from "@/lib/LockContext";
import { getFinanceAppLock, listPockets } from "@/lib/financeApi";
import { FinanceAppLockScreen } from "./FinanceAppLockScreen";
import { FinanceMain } from "./FinanceMain";
import type { Pocket } from "@/types";

export function FinanceShell() {
  const t = useT();
  const router = useRouter();
  const { status } = useLock();
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [appUnlocked, setAppUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pockets, setPockets] = useState<Pocket[]>([]);
  const [selectedPocketId, setSelectedPocketId] = useState<number | null>(null);

  const loadPockets = useCallback(async () => {
    try { setPockets(await listPockets()); } catch {}
  }, []);

  useEffect(() => {
    getFinanceAppLock()
      .then((data) => {
        setAppLockEnabled(data.locked);
        if (!data.locked || status?.unlocked) setAppUnlocked(true);
      })
      .catch(() => setAppUnlocked(true))
      .finally(() => setLoading(false));
    loadPockets();
  }, [status?.unlocked, loadPockets]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center th-bg-base">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (appLockEnabled && !appUnlocked) {
    return <FinanceAppLockScreen onUnlocked={() => setAppUnlocked(true)} />;
  }

  return (
    <div className="flex h-screen flex-col th-bg-base overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 th-bg-surface border-b th-border shrink-0">
        <button
          onClick={() => router.push("/")}
          className="th-text-muted hover:th-text transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-brand-400" />
          <span className="font-semibold text-sm th-text">{t("finance.title")}</span>
        </div>
      </header>
      <FinanceMain
        pockets={pockets}
        selectedPocketId={selectedPocketId}
        onPocketsChange={loadPockets}
      />
    </div>
  );
}
