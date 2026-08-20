"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { getProjectDashboard } from "@/lib/projectApi";
import type { Project, ProjectDashboard as DashData } from "@/types";
import { FolderKanban, TrendingUp, Users, FileText, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif", completed: "Selesai", on_hold: "Ditahan", cancelled: "Dibatalkan",
};
const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  completed: "bg-brand-500/15 text-brand-400 border-brand-500/20",
  on_hold: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/20",
};

export function ProjectDashboard({ onSelectProject }: { onSelectProject: (p: Project) => void }) {
  const t = useT();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjectDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center th-text-muted text-sm">
        {t("common.loading")}
      </div>
    );
  }

  if (!data) return null;

  const kpis = [
    {
      label: t("project.dashboard.totalProjects"),
      value: data.total_projects,
      sub: `${data.active_projects} ${t("project.dashboard.activeProjects")} · ${data.completed_projects} ${t("project.dashboard.completedProjects")}`,
      icon: <FolderKanban size={18} className="text-brand-400" />,
      color: "brand",
    },
    {
      label: t("project.dashboard.contractValue"),
      value: fmt(data.total_contract_value),
      sub: `RAB: ${fmt(data.total_rab)}`,
      icon: <TrendingUp size={18} className="text-emerald-400" />,
      color: "emerald",
    },
    {
      label: t("project.dashboard.paidWorkers"),
      value: fmt(data.total_paid_workers),
      sub: t("project.dashboard.workers"),
      icon: <Users size={18} className="text-amber-400" />,
      color: "amber",
    },
    {
      label: t("project.dashboard.pendingInvoices"),
      value: fmt(data.invoices_pending_value),
      sub: `${data.invoices_pending_count} invoice`,
      icon: <FileText size={18} className="text-sky-400" />,
      color: "sky",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="th-bg-surface rounded-2xl border th-border p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs th-text-muted font-medium">{k.label}</span>
              <div className="w-8 h-8 rounded-xl th-bg-elevated flex items-center justify-center">
                {k.icon}
              </div>
            </div>
            <span className="text-xl font-bold th-text">{k.value}</span>
            <span className="text-xs th-text-muted">{k.sub}</span>
          </div>
        ))}
      </div>

      {/* Active projects list */}
      <div className="th-bg-surface rounded-2xl border th-border overflow-hidden">
        <div className="px-4 py-3 border-b th-border">
          <h3 className="text-sm font-semibold th-text">{t("project.dashboard.recentProjects")}</h3>
        </div>
        {data.recent_projects.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm th-text-muted">{t("project.dashboard.empty")}</div>
        ) : (
          <div className="divide-y th-border">
            {data.recent_projects.map((p) => {
              const rab = p.rab_total ?? 0;
              const paid = p.paid_workers ?? 0;
              const progressPct = rab > 0 ? Math.min(100, (paid / rab) * 100) : 0;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className="w-full px-4 py-3 hover:th-bg-elevated transition-colors text-left flex items-center gap-3"
                >
                  {/* Color dot */}
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium th-text truncate">{p.name}</span>
                      <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", STATUS_COLOR[p.status])}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    {p.client_name && (
                      <p className="text-xs th-text-muted truncate">{p.client_name}</p>
                    )}
                    {rab > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full th-bg-elevated overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] th-text-muted shrink-0">
                          {progressPct.toFixed(0)}% terserap
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    {p.contract_value ? (
                      <span className="text-sm font-semibold th-text">{fmt(p.contract_value)}</span>
                    ) : null}
                    <div className="text-xs th-text-muted mt-0.5">
                      {p.worker_count} {t("project.dashboard.workers")}
                    </div>
                  </div>

                  <ChevronRight size={14} className="th-text-muted shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
