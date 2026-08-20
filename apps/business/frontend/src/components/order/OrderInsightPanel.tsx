"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, ShoppingCart, DollarSign, XCircle, Clock, FileText, AlertCircle, Download } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Tooltip as InfoTooltip } from "@/components/ui/Tooltip";
import { getOrderSummary } from "@/lib/orderApi";
import type { OrderSummary } from "@/lib/orderApi";
import { CHART_COLORS, TICK_STYLE, GRID_PROPS, TOOLTIP_PROPS } from "@/lib/chartConfig";
import { exportOrderInsightPdf, generateAiInsight, buildOrderPrompt } from "@/lib/exportPdf";
import { ExportDialog } from "@/components/ui/ExportDialog";
import { useConnection } from "@/lib/ConnectionContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, PieChart, Pie, Legend,
} from "recharts";
import { clsx } from "clsx";

const FMT_ID = new Intl.NumberFormat("id-ID");
function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return FMT_ID.format(n);
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}
function fmtCurrency(n: number) { return "Rp " + fmt(n); }

// Warna per status — konsisten di semua grafik
const STATUS_COLOR: Record<string, string> = {
  draft:               "#71717a",  // zinc
  waiting_for_payment: "#f59e0b",  // amber
  on_process:          "#3b82f6",  // blue
  completed:           "#10b981",  // emerald
  cancelled:           "#f43f5e",  // rose
};

type RangeOption = 3 | 6 | 12;

export function OrderInsightPanel() {
  const t = useT();
  const { status: connStatus } = useConnection();
  const [data, setData] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<RangeOption>(6);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatingInsight, setGeneratingInsight] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOrderSummary({ months }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (includeInsight: boolean) => {
    if (!data) return;
    setExporting(true);
    try {
      let aiInsight: string | undefined;
      if (includeInsight) {
        setGeneratingInsight(true);
        const result = await generateAiInsight(buildOrderPrompt({
          months, kpi: data.kpi, monthly: data.monthly, topProducts: data.top_products,
        }));
        setGeneratingInsight(false);
        if (result) aiInsight = result;
      }
      await exportOrderInsightPdf({
        appName: "LOQA Work", months, kpi: data.kpi,
        monthly: data.monthly, topProducts: data.top_products,
        statusBreakdown: data.status_breakdown, aiInsight,
      });
    } catch (err) {
      alert("PDF error: " + (err instanceof Error ? err.message : String(err)));
    } finally { setExporting(false); setGeneratingInsight(false); setExportDialogOpen(false); }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const sb = data?.status_breakdown ?? {};
  const pendingCount  = (sb.draft?.count ?? 0) + (sb.waiting_for_payment?.count ?? 0) + (sb.on_process?.count ?? 0);
  const pendingValue  = (sb.draft?.total ?? 0) + (sb.waiting_for_payment?.total ?? 0) + (sb.on_process?.total ?? 0);
  const completedValue = sb.completed?.total ?? 0;
  const cancelledCount = sb.cancelled?.count ?? 0;

  // Donut data: semua status yang ada
  const statusOrder = ["draft", "waiting_for_payment", "on_process", "completed", "cancelled"] as const;
  const statusLabel: Record<string, string> = {
    draft: t("order.history.status.draft"),
    waiting_for_payment: t("order.history.status.waiting_for_payment"),
    on_process: t("order.history.status.on_process"),
    completed: t("order.history.status.completed"),
    cancelled: t("order.history.status.cancelled"),
  };
  const donutData = statusOrder
    .filter((s) => (sb[s]?.count ?? 0) > 0)
    .map((s) => ({ name: statusLabel[s], value: sb[s]?.count ?? 0, status: s }));

  const kpis = data ? [
    {
      label: t("order.insight.totalOrders"),
      value: String(data.kpi.total_orders),
      icon: <ShoppingCart size={12} />,
      iconBg: "rgb(var(--accent-600) / 0.12)", iconBorder: "rgb(var(--accent-500) / 0.2)", iconColor: "rgb(var(--accent-400))",
      valueCls: "gradient-text-brand",
    },
    {
      label: t("order.insight.totalRevenue"),
      value: fmtCurrency(data.kpi.total_revenue),
      icon: <DollarSign size={12} />,
      iconBg: "rgb(16 185 129 / 0.12)", iconBorder: "rgb(16 185 129 / 0.2)", iconColor: "#10b981",
      valueCls: "gradient-text-income",
    },
    {
      label: t("order.insight.avgOrderValue"),
      value: fmtCurrency(data.kpi.avg_order_value),
      icon: <TrendingUp size={12} />,
      iconBg: "rgb(139 92 246 / 0.12)", iconBorder: "rgb(139 92 246 / 0.2)", iconColor: "#a78bfa",
      valueCls: "gradient-text-brand",
    },
    {
      label: t("order.insight.cancelledOrders"),
      value: String(data.kpi.cancelled_orders),
      icon: <XCircle size={12} />,
      iconBg: "rgb(244 63 94 / 0.12)", iconBorder: "rgb(244 63 94 / 0.2)", iconColor: "#fb7185",
      valueCls: "gradient-text-expense",
    },
  ] : [];

  const isEmpty = !data || (data.monthly.every((m) => m.orders === 0) && data.top_products.length === 0);

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="tab-glass flex">
          {([3, 6, 12] as RangeOption[]).map((m) => (
            <button key={m} onClick={() => setMonths(m)}
              className={clsx("tab-glass-item btn-brand", months === m && "active")}>
              {m}M
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setExportDialogOpen(true)} disabled={!data || exporting || generatingInsight}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
            style={{ background: "rgb(16 185 129 / 0.15)", color: "#10b981", border: "1px solid rgb(16 185 129 / 0.25)" }}>
            <Download size={12} />
            {exporting || generatingInsight ? t("common.exportingPdf") : t("common.exportPdf")}
          </button>
          <button onClick={load} disabled={loading}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
            style={{ background: "rgb(255 255 255 / 0.04)", border: "1px solid rgb(var(--border))", color: "rgb(var(--tx-muted))" }}
            title={t("common.refresh")}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
        exporting={exporting}
        generatingInsight={generatingInsight}
        aiAvailable={!!connStatus?.chat.ok}
      />

      {error && (
        <div className="p-3 rounded-xl text-sm" style={{ background: "rgb(244 63 94 / 0.08)", border: "1px solid rgb(244 63 94 / 0.2)", color: "#fb7185" }}>
          {error}
        </div>
      )}

      {isEmpty && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: "rgb(var(--tx-muted))" }}>
          <ShoppingCart size={32} style={{ opacity: 0.3 }} />
          <p className="text-sm">{t("order.insight.empty")}</p>
        </div>
      )}

      {data && !isEmpty && (
        <>
          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: k.iconBg, border: `1px solid ${k.iconBorder}`, color: k.iconColor }}>
                    {k.icon}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] truncate" style={{ color: "rgb(var(--tx-muted))" }}>{k.label}</p>
                </div>
                <p className={clsx("text-xl font-bold stat-number", k.valueCls)}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* ── Pipeline cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Pending pipeline */}
            <div className="glass-card px-4 py-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={12} style={{ color: "#f59e0b" }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                  {t("order.insight.pendingPipeline")}
                </span>
                <InfoTooltip content={t("order.insight.pendingPipelineDesc")} />
              </div>
              <p className="text-lg font-bold" style={{ color: "#f59e0b" }}>{fmtCurrency(pendingValue)}</p>
              <p className="text-xs" style={{ color: "rgb(var(--tx-muted))" }}>{pendingCount} {t("order.insight.pendingOrders")}</p>
            </div>
            {/* Completed revenue */}
            <div className="glass-card px-4 py-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={12} style={{ color: "#10b981" }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                  {t("order.insight.completedRevenue")}
                </span>
              </div>
              <p className="text-lg font-bold gradient-text-income">{fmtCurrency(completedValue)}</p>
              <p className="text-xs" style={{ color: "rgb(var(--tx-muted))" }}>{sb.completed?.count ?? 0} {t("order.insight.completedOrders")}</p>
            </div>
            {/* Cancelled */}
            <div className="glass-card px-4 py-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={12} style={{ color: "#f43f5e" }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                  {t("order.insight.cancelledOrders")}
                </span>
              </div>
              <p className="text-lg font-bold" style={{ color: "#f43f5e" }}>{cancelledCount}</p>
              <p className="text-xs" style={{ color: "rgb(var(--tx-muted))" }}>{fmtCurrency(sb.cancelled?.total ?? 0)}</p>
            </div>
          </div>

          {/* ── Revenue + Order count charts ── */}
          {data.monthly.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Monthly revenue */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: "rgb(16 185 129 / 0.12)", border: "1px solid rgb(16 185 129 / 0.2)", color: "#10b981" }}>
                    <DollarSign size={11} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                    {t("order.insight.monthlyRevenue")}
                  </span>
                  <InfoTooltip content={t("order.insight.chartScope")} />
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRevBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.income} stopOpacity={1} />
                        <stop offset="100%" stopColor={CHART_COLORS.income} stopOpacity={0.55} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK_STYLE} tickFormatter={(v: unknown) => fmtShort(Number(v))} axisLine={false} tickLine={false} width={48} />
                    <Tooltip {...TOOLTIP_PROPS}
                      formatter={(v: unknown, name: unknown) => [
                        name === "revenue" ? fmtCurrency(Number(v)) : String(v),
                        name === "revenue" ? t("order.insight.revenue") : t("order.insight.orders"),
                      ]}
                      labelFormatter={(l: unknown) => String(l)}
                    />
                    <Bar dataKey="revenue" fill="url(#gradRevBar)" radius={[6,6,0,0]} name="revenue" maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly order count */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: "rgb(var(--accent-600) / 0.12)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                    <ShoppingCart size={11} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                    {t("order.insight.monthlyOrders")}
                  </span>
                  <InfoTooltip content={t("order.insight.chartScope")} />
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={CHART_COLORS.brand} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={CHART_COLORS.brand} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK_STYLE} allowDecimals={false} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...TOOLTIP_PROPS}
                      formatter={(v: unknown) => [String(v), t("order.insight.orders")]}
                      labelFormatter={(l: unknown) => String(l)}
                    />
                    <Area type="monotone" dataKey="orders" stroke={CHART_COLORS.brand} fill="url(#ordersGrad)"
                      strokeWidth={2.5} dot={{ r: 4, fill: CHART_COLORS.brand, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Status breakdown: Donut + Stacked bar ── */}
          {data.monthly_by_status.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Donut — distribusi status */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: "rgb(var(--accent-600) / 0.12)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                    <FileText size={11} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                    {t("order.insight.statusBreakdown")}
                  </span>
                </div>
                {donutData.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie data={donutData} dataKey="value" innerRadius={52} outerRadius={80}
                          paddingAngle={2} startAngle={90} endAngle={-270}>
                          {donutData.map((entry) => (
                            <Cell key={entry.status} fill={STATUS_COLOR[entry.status]} />
                          ))}
                        </Pie>
                        <Tooltip
                          {...TOOLTIP_PROPS}
                          formatter={(v: unknown, _: unknown, props: any) => [
                            `${v} pesanan`,
                            props?.payload?.name ?? "",
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2 flex-1">
                      {statusOrder.filter((s) => (sb[s]?.count ?? 0) > 0).map((s) => (
                        <div key={s} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[s] }} />
                          <span className="text-xs flex-1 truncate" style={{ color: "rgb(var(--tx-primary))" }}>
                            {statusLabel[s]}
                          </span>
                          <span className="text-xs font-semibold tabular-nums" style={{ color: "rgb(var(--tx-muted))" }}>
                            {sb[s]?.count ?? 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs th-text-muted text-center py-8">{t("order.insight.empty")}</p>
                )}
              </div>

              {/* Stacked bar — jumlah pesanan per status per bulan */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: "rgb(var(--accent-600) / 0.12)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                    <ShoppingCart size={11} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                    {t("order.insight.monthlyByStatus")}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.monthly_by_status} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK_STYLE} allowDecimals={false} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      {...TOOLTIP_PROPS}
                      formatter={(v: unknown, name: unknown) => [
                        String(v),
                        statusLabel[String(name)] ?? String(name),
                      ]}
                      labelFormatter={(l: unknown) => String(l)}
                    />
                    <Legend
                      formatter={(value) => (
                        <span style={{ fontSize: 10, color: "rgb(var(--tx-muted))" }}>
                          {statusLabel[value] ?? value}
                        </span>
                      )}
                    />
                    {statusOrder.map((s) => (
                      <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLOR[s]}
                        name={s} maxBarSize={40}
                        radius={s === "cancelled" ? [6,6,0,0] : [0,0,0,0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Top products ── */}
          {data.top_products.length > 0 && (
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(var(--accent-600) / 0.12)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                  <TrendingUp size={11} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                  {t("order.insight.topProducts")}
                </span>
                <InfoTooltip content={t("order.insight.chartScope")} />
              </div>
              <div className="flex flex-col gap-3">
                {data.top_products.map((p, i) => {
                  const maxRev = data.top_products[0].revenue;
                  const pct = maxRev > 0 ? (p.revenue / maxRev) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs w-5 shrink-0 text-right font-bold" style={{ color: "rgb(var(--tx-muted))" }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-medium truncate" style={{ color: "rgb(var(--tx-primary))" }}>{p.name}</span>
                          <span className="text-xs shrink-0" style={{ color: "rgb(var(--tx-muted))" }}>{fmt(p.qty)} {t("order.insight.units")}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgb(255 255 255 / 0.06)" }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: "linear-gradient(90deg, rgb(var(--accent-600)), rgb(var(--accent-400)))", boxShadow: "0 0 8px rgb(var(--accent-500) / 0.4)" }} />
                        </div>
                      </div>
                      <span className="text-xs font-semibold shrink-0 w-20 text-right gradient-text-income">{fmtCurrency(p.revenue)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
