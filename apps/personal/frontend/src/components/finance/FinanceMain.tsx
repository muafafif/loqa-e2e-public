"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { Pocket } from "@/types";
import { OverviewPanel } from "./OverviewPanel";
import { AccountsPanel } from "./AccountsPanel";
import { CategoriesPanel } from "./CategoriesPanel";
import { TransactionsPanel } from "./TransactionsPanel";
import { GoalsPanel } from "./GoalsPanel";
import { clsx } from "clsx";
import { BarChart2, CreditCard, Tag, List, Target } from "lucide-react";

type Tab = "overview" | "goals" | "transactions" | "accounts" | "categories";

interface Props {
  pockets: Pocket[];
  selectedPocketId: number | null;
  onPocketsChange: () => void;
}

export function FinanceMain({ pockets, selectedPocketId, onPocketsChange }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",     label: t("finance.overview"),         icon: <BarChart2 size={14} /> },
    { id: "goals",        label: t("finance.goal.title"),       icon: <Target size={14} /> },
    { id: "transactions", label: t("finance.transactions"),     icon: <List size={14} /> },
    { id: "accounts",     label: t("finance.accounts"),         icon: <CreditCard size={14} /> },
    { id: "categories",   label: t("finance.categories"),       icon: <Tag size={14} /> },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center glass-surface border-b th-border shrink-0 px-3 gap-1 overflow-x-auto scrollbar-none">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              "btn-brand flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl my-1.5 transition-all duration-150 whitespace-nowrap shrink-0",
              tab === id
                ? "bg-brand-600 text-white shadow-brand-sm"
                : "th-text-muted hover:th-text hover:th-bg-elevated font-medium"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={clsx("flex-1", tab === "overview" ? "overflow-hidden" : "overflow-y-auto")}>
        {tab === "overview"     && <OverviewPanel pocketId={selectedPocketId} pockets={pockets} />}
        {tab === "goals"        && <GoalsPanel />}
        {tab === "transactions" && <TransactionsPanel pocketId={selectedPocketId} />}
        {tab === "accounts"     && <AccountsPanel />}
        {tab === "categories"   && <CategoriesPanel />}
      </div>
    </div>
  );
}
