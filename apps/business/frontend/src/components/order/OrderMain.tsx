"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { KasirPanel } from "./KasirPanel";
import { OrderHistoryPanel } from "./OrderHistoryPanel";
import { ShippingPanel } from "./ShippingPanel";
import { OrderSettingsPanel } from "./OrderSettingsPanel";
import { OrderInsightPanel } from "./OrderInsightPanel";
import { clsx } from "clsx";
import { ShoppingCart, ClipboardList, Truck, Settings, BarChart2 } from "lucide-react";

type Tab = "kasir" | "history" | "insight" | "shipping" | "settings";

export function OrderMain() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("kasir");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "kasir",    label: t("order.kasir"),    icon: <ShoppingCart size={14} /> },
    { id: "history",  label: t("order.history"),  icon: <ClipboardList size={14} /> },
    { id: "insight",  label: t("order.insight"),  icon: <BarChart2 size={14} /> },
    { id: "shipping", label: t("order.shipping"), icon: <Truck size={14} /> },
    { id: "settings", label: t("order.settings"), icon: <Settings size={14} /> },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center glass-surface border-b th-border shrink-0 px-3 gap-1 overflow-x-auto scrollbar-none">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            data-testid={`order-tab-${id}`}
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

      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "kasir"    && <KasirPanel />}
        {tab === "history"  && <div className="flex-1 overflow-y-auto"><OrderHistoryPanel /></div>}
        {tab === "insight"  && <div className="flex-1 overflow-hidden flex flex-col"><OrderInsightPanel /></div>}
        {tab === "shipping" && <div className="flex-1 overflow-y-auto"><ShippingPanel /></div>}
        {tab === "settings" && <div className="flex-1 overflow-y-auto"><OrderSettingsPanel /></div>}
      </div>
    </div>
  );
}
