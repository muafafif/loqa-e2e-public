"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { clsx } from "clsx";
import { LayoutDashboard, Package, ArrowLeftRight, Settings } from "lucide-react";
import { DashboardPanel } from "./DashboardPanel";
import { ItemsPanel } from "./ItemsPanel";
import { MovementsPanel } from "./MovementsPanel";
import { SettingsPanel } from "./SettingsPanel";

type Tab = "dashboard" | "items" | "movements" | "settings";

export function InventoryMain() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("dashboard");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard",  label: t("inventory.tab.dashboard"),  icon: <LayoutDashboard size={14} /> },
    { id: "items",      label: t("inventory.tab.items"),      icon: <Package size={14} /> },
    { id: "movements",  label: t("inventory.tab.movements"),  icon: <ArrowLeftRight size={14} /> },
    { id: "settings",   label: t("inventory.tab.settings"),   icon: <Settings size={14} /> },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center border-b th-border th-bg-surface shrink-0 px-2 gap-1 overflow-x-auto">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-3 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0",
              tab === id
                ? "border-brand-500 th-text"
                : "border-transparent th-text-muted hover:th-text"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "dashboard" && <DashboardPanel />}
        {tab === "items"     && <ItemsPanel />}
        {tab === "movements" && <MovementsPanel />}
        {tab === "settings"  && <SettingsPanel />}
      </div>
    </div>
  );
}
