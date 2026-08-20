"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { InventoryDashboard } from "./InventoryDashboard";
import { ProductsPanel } from "./ProductsPanel";
import { MasterDataPanel } from "./MasterDataPanel";
import { MovementsPanel } from "./MovementsPanel";
import { StockOpnamePanel } from "./StockOpnamePanel";
import { ImportLogsPanel } from "./ImportLogsPanel";
import { clsx } from "clsx";
import { BarChart2, Package, Database, ArrowLeftRight, ClipboardCheck, Upload } from "lucide-react";

type Tab = "dashboard" | "products" | "masterdata" | "movements" | "opname" | "imports";

export function InventoryMain() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("dashboard");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard",  label: t("inventory.dashboard"),  icon: <BarChart2 size={14} /> },
    { id: "products",   label: t("inventory.products"),   icon: <Package size={14} /> },
    { id: "masterdata", label: t("inventory.masterData"), icon: <Database size={14} /> },
    { id: "movements",  label: t("inventory.movements"),  icon: <ArrowLeftRight size={14} /> },
    { id: "opname",     label: t("inventory.opname"),     icon: <ClipboardCheck size={14} /> },
    { id: "imports",    label: t("inventory.import.tab"), icon: <Upload size={14} /> },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center glass-surface border-b th-border shrink-0 px-3 gap-1 overflow-x-auto scrollbar-none">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            data-testid={`inventory-tab-${id}`}
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
      <div className={clsx("flex-1", tab === "dashboard" ? "overflow-hidden" : "flex flex-col overflow-hidden")}>
        {tab === "dashboard"  && <InventoryDashboard />}
        {tab === "products"   && <div className="flex-1 overflow-y-auto"><ProductsPanel /></div>}
        {tab === "masterdata" && <MasterDataPanel />}
        {tab === "movements"  && <div className="flex-1 overflow-y-auto"><MovementsPanel /></div>}
        {tab === "opname"     && <div className="flex-1 overflow-y-auto"><StockOpnamePanel /></div>}
        {tab === "imports"    && <div className="flex-1 overflow-y-auto"><ImportLogsPanel /></div>}
      </div>
    </div>
  );
}
