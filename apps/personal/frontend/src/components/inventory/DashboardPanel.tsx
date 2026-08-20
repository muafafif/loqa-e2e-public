"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Package, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { getDashboard } from "@/lib/inventoryApi";
import type { InvDashboard } from "@/types";
import { clsx } from "clsx";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
}

export function DashboardPanel() {
  const t = useT();
  const [data, setData] = useState<InvDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 flex flex-col gap-4 max-w-2xl">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label={t("inventory.dashboard.totalItems")}
          value={String(data.total_items)}
          icon={<Package size={16} className="text-brand-400" />}
        />
        <KpiCard
          label={t("inventory.dashboard.lowStock")}
          value={String(data.low_stock_count)}
          icon={<AlertTriangle size={16} className={data.low_stock_count > 0 ? "text-amber-400" : "text-zinc-400"} />}
          accent={data.low_stock_count > 0 ? "amber" : undefined}
        />
      </div>

      {/* Low stock list */}
      <Section title={t("inventory.dashboard.lowStockItems")}>
        {data.low_stock_items.length === 0 ? (
          <p className="text-sm th-text-muted py-2">{t("inventory.dashboard.allGood")}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {data.low_stock_items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2 th-bg-elevated rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="text-sm th-text font-medium truncate">{item.name}</div>
                  <div className="text-xs th-text-muted">
                    {item.location_name ?? t("inventory.item.noLocation")}
                    {item.category_name && ` · ${item.category_name}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-amber-400">{fmt(item.qty)} {item.unit}</div>
                  <div className="text-xs th-text-muted">min {fmt(item.min_qty)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* By category */}
      {data.by_category.length > 0 && (
        <Section title={t("inventory.dashboard.byCategory")}>
          <div className="flex flex-col gap-1">
            {data.by_category.map((c) => (
              <div key={c.category_name} className="flex items-center gap-2 px-3 py-1.5 th-bg-elevated rounded-lg">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <span className="flex-1 text-sm th-text">{c.category_name}</span>
                <span className="text-xs th-text-muted">{c.item_count} item</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* By location */}
      {data.by_location.length > 0 && (
        <Section title={t("inventory.dashboard.byLocation")}>
          <div className="flex flex-wrap gap-2">
            {data.by_location.map((l) => (
              <span key={l.location_name} className="text-xs px-2.5 py-1 th-bg-elevated th-text rounded-full border th-border">
                {l.location_name} · {l.item_count}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Recent movements */}
      <Section title={t("inventory.dashboard.recentMovements")}>
        {data.recent_movements.length === 0 ? (
          <p className="text-sm th-text-muted py-2">{t("inventory.dashboard.noMovements")}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {data.recent_movements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 th-bg-elevated rounded-lg">
                <MovTypeBadge type={m.type} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm th-text truncate">{m.item_name}</div>
                  <div className="text-xs th-text-muted">{m.date}{m.note ? ` · ${m.note}` : ""}</div>
                </div>
                <div className={clsx(
                  "text-sm font-medium shrink-0",
                  m.type === "in" ? "text-green-400" : m.type === "out" ? "text-red-400" : "th-text-muted"
                )}>
                  {m.type === "in" ? "+" : m.type === "out" ? "−" : "="}{fmt(m.qty)} {m.unit}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b th-border">
        <span className="text-xs font-semibold th-text-muted uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function KpiCard({ label, value, icon, accent }: {
  label: string; value: string; icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className={clsx(
      "th-bg-surface border rounded-xl p-4 flex flex-col gap-1",
      accent === "amber" ? "border-amber-500/30" : "th-border"
    )}>
      <div className="flex items-center gap-2 th-text-muted text-xs">{icon}{label}</div>
      <div className="text-2xl font-bold th-text">{value}</div>
    </div>
  );
}

function MovTypeBadge({ type }: { type: string }) {
  const t = useT();
  const map: Record<string, { label: string; cls: string }> = {
    in:         { label: t("inventory.movement.type.in"),         cls: "bg-green-500/15 text-green-400" },
    out:        { label: t("inventory.movement.type.out"),        cls: "bg-red-500/15 text-red-400" },
    adjustment: { label: t("inventory.movement.type.adjustment"), cls: "bg-zinc-500/15 th-text-muted" },
  };
  const { label, cls } = map[type] ?? map.adjustment;
  return (
    <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", cls)}>
      {label}
    </span>
  );
}
