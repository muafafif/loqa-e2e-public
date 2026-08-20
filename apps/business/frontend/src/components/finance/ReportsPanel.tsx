"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useLock } from "@/lib/LockContext";
import {
  getFinanceMonthly, getFinanceTimeline, getFinanceAccountsSummary,
  listTransactions, listAccounts,
  type MonthlyPoint, type TimelinePoint, type AccountSummary,
} from "@/lib/financeApi";
import { exportFinancePdf, generateAiInsight, buildFinancePrompt } from "@/lib/exportPdf";
import { LockPopup } from "@/components/lock/LockPopup";
import { ExportDialog } from "@/components/ui/ExportDialog";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useConnection } from "@/lib/ConnectionContext";
import { Download, TrendingUp, TrendingDown, Wallet, BarChart2 } from "lucide-react";
import { clsx } from "clsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  ReferenceLine, Area, AreaChart, Line,
} from "recharts";
import { CHART_COLORS, TICK_STYLE, GRID_PROPS, TOOLTIP_PROPS, LEGEND_PROPS } from "@/lib/chartConfig";
import type { Pocket, Account } from "@/types";

type ReportRange = "30d" | "90d" | "180d" | "1y";

function toRange(range: ReportRange): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const to = fmt(now);
  const from = new Date(now);
  if (range === "30d")  from.setDate(from.getDate() - 30);
  if (range === "90d")  from.setDate(from.getDate() - 90);
  if (range === "180d") from.setDate(from.getDate() - 180);
  if (range === "1y")   from.setFullYear(from.getFullYear() - 1);
  return { from: fmt(from), to };
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "decimal", maximumFractionDigits: 0 }).format(n);
}
function fmtShort(n: number) {
  const abs = Math.abs(n); const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}rb`;
  return String(n);
}
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`;
}

const PALETTE = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];
const DEFAULT_ACCOUNT_COLOR = "#0284c7";

interface Props {
  pocketId: number | null;
  pockets: Pocket[];
}

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Chart section header ────────────────────────────────────────────────────────
function ChartSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
          {icon}
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export function ReportsPanel({ pocketId, pockets }: Props) {
  const t = useT();
  const { status: lockStatus } = useLock();
  const { status: connStatus } = useConnection();

  const [range, setRange]       = useState<ReportRange>("90d");
  const [monthly, setMonthly]   = useState<MonthlyPoint[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [generatingInsight, setGeneratingInsight] = useState(false);

  const [filterPocketId, setFilterPocketId]   = useState<number | null>(null);
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null);
  const [pendingLockedPocket, setPendingLockedPocket] = useState<Pocket | null>(null);

  const [pocketOpen, setPocketOpen]   = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const pocketRef  = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);


  useEffect(() => { listAccounts().then(setAllAccounts).catch(() => {}); }, []);

  useEffect(() => { setFilterPocketId(null); setFilterAccountId(null); }, [pocketId]);

  const effectivePocketId  = filterPocketId  ?? pocketId ?? undefined;
  const effectiveAccountId = filterAccountId ?? undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = toRange(range);
      const months = range === "30d" ? 3 : range === "90d" ? 6 : range === "180d" ? 9 : 12;
      const [m, tl, ac] = await Promise.all([
        getFinanceMonthly(months, effectivePocketId, effectiveAccountId),
        getFinanceTimeline(from, to, effectivePocketId, effectiveAccountId),
        getFinanceAccountsSummary(effectiveAccountId),
      ]);
      setMonthly(m);
      setTimeline(tl);
      setAccounts(ac);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [range, effectivePocketId, effectiveAccountId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (includeInsight: boolean) => {
    setExporting(true);
    try {
      const { from, to } = toRange(range);
      const rangeLabels: Record<ReportRange, string> = {
        "30d": "30 Hari", "90d": "3 Bulan", "180d": "6 Bulan", "1y": "1 Tahun",
      };
      const allTx = await listTransactions({
        date_from: from, date_to: to,
        pocket_id: effectivePocketId, account_id: effectiveAccountId,
        limit: 10000, offset: 0,
      });
      const selectedPocket  = pockets.find(p => p.id === effectivePocketId);
      const selectedAccount = allAccounts.find(a => a.id === effectiveAccountId);
      const contextLabel = [
        selectedPocket  ? `Kantong: ${selectedPocket.name}`  : null,
        selectedAccount ? `Akun: ${selectedAccount.name}` : null,
      ].filter(Boolean).join(" · ");

      let aiInsight: string | undefined;
      if (includeInsight) {
        setGeneratingInsight(true);
        const result = await generateAiInsight(buildFinancePrompt({ from, to, totalIncome, totalExpense, net, monthly }));
        setGeneratingInsight(false);
        if (result) aiInsight = result;
      }

      await exportFinancePdf({
        appName: "LOQA Work",
        rangeLabel: rangeLabels[range] + (contextLabel ? ` · ${contextLabel}` : ""),
        from, to, totalIncome, totalExpense, net, monthly,
        timeline, accounts,
        transactions: allTx.transactions,
        aiInsight,
      });
    } catch (err) {
      alert("PDF error: " + (err instanceof Error ? err.message : String(err)));
    } finally { setExporting(false); setGeneratingInsight(false); setExportDialogOpen(false); }
  };

  function handleSelectPocket(p: Pocket | null) {
    if (p && p.locked && !lockStatus?.unlocked) {
      setPendingLockedPocket(p);
      setPocketOpen(false);
      return;
    }
    setFilterPocketId(p ? p.id : null);
    setPocketOpen(false);
  }

  const ranges: { id: ReportRange; label: string }[] = [
    { id: "30d", label: "30 Hari" },
    { id: "90d", label: "3 Bln" },
    { id: "180d", label: "6 Bln" },
    { id: "1y", label: "1 Thn" },
  ];

  const totalIncome  = timeline.reduce((s, d) => s + d.income,  0);
  const totalExpense = timeline.reduce((s, d) => s + d.expense, 0);
  const net = totalIncome - totalExpense;

  const cumulativeData = (() => {
    let cum = 0;
    return timeline.map(d => {
      cum += d.income - d.expense;
      return { ...d, cumulative: cum };
    });
  })();

  const accountsPositive = accounts.filter(a => a.balance > 0);
  const accountPieData = accountsPositive.map((a, i) => ({
    name: a.name,
    value: a.balance,
    fill: (a.color && a.color !== DEFAULT_ACCOUNT_COLOR) ? a.color : PALETTE[i % PALETTE.length],
  }));

  const selectedPocketLabel  = filterPocketId  != null ? pockets.find(p => p.id === filterPocketId)?.name  ?? t("finance.report.allPockets")  : t("finance.report.allPockets");
  const selectedAccountLabel = filterAccountId != null ? allAccounts.find(a => a.id === filterAccountId)?.name ?? t("finance.report.allAccounts") : t("finance.report.allAccounts");

  return (
    <div className="p-5 max-w-4xl mx-auto flex flex-col gap-5">

      {/* ── Toolbar row 1: range + export ── */}
      <div className="flex items-center gap-3">
        <div className="tab-glass flex">
          {ranges.map(({ id, label }) => (
            <button key={id} onClick={() => setRange(id)}
              className={clsx("tab-glass-item btn-brand", range === id && "active")}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button onClick={() => setExportDialogOpen(true)} disabled={exporting || generatingInsight}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
            style={{ background: "rgb(16 185 129 / 0.15)", color: "#10b981", border: "1px solid rgb(16 185 129 / 0.25)" }}>
            <Download size={12} />
            {exporting || generatingInsight ? t("common.exportingPdf") : t("common.exportPdf")}
          </button>
        </div>
      </div>

      {/* ── Toolbar row 2: filters (no wrap — fixed-width dropdowns) ── */}
      <div className="flex items-center gap-2 -mt-2">
        <FilterDropdown
          label={t("finance.report.filterPocket")} selectedLabel={selectedPocketLabel}
          open={pocketOpen} onToggle={() => { setPocketOpen(v => !v); setAccountOpen(false); }}
          dropRef={pocketRef as React.RefObject<HTMLDivElement>}
          items={pockets} selectedId={filterPocketId} allLabel={t("finance.report.allPockets")}
          onSelectAll={() => handleSelectPocket(null)}
          onSelect={p => handleSelectPocket(p)}
          getId={p => p.id} getName={p => p.name} getColor={p => p.color}
          isLocked={p => !!p.locked} lockStatus={lockStatus?.unlocked}
          onClear={() => { setFilterPocketId(null); }}
        />
        <FilterDropdown
          label={t("finance.report.filterAccount")} selectedLabel={selectedAccountLabel}
          open={accountOpen} onToggle={() => { setAccountOpen(v => !v); setPocketOpen(false); }}
          dropRef={accountRef as React.RefObject<HTMLDivElement>}
          items={allAccounts} selectedId={filterAccountId} allLabel={t("finance.report.allAccounts")}
          onSelectAll={() => { setFilterAccountId(null); setAccountOpen(false); }}
          onSelect={a => { setFilterAccountId(a.id); setAccountOpen(false); }}
          getId={a => a.id} getName={a => a.name} getColor={a => a.color}
          onClear={() => { setFilterAccountId(null); }}
        />
      </div>

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
        exporting={exporting}
        generatingInsight={generatingInsight}
        aiAvailable={!!connStatus?.chat.ok}
      />

      {loading ? <Spinner /> : (
        <>
          {/* ── KPI strip ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: "rgb(16 185 129 / 0.12)", border: "1px solid rgb(16 185 129 / 0.2)" }}>
                  <TrendingUp size={11} style={{ color: "#10b981" }} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.summary.income")}</span>
              </div>
              <span className="text-2xl font-bold stat-number gradient-text-income">{fmt(totalIncome)}</span>
            </div>
            <div className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: "rgb(244 63 94 / 0.12)", border: "1px solid rgb(244 63 94 / 0.2)" }}>
                  <TrendingDown size={11} style={{ color: "#f43f5e" }} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.summary.expense")}</span>
              </div>
              <span className="text-2xl font-bold stat-number gradient-text-expense">{fmt(totalExpense)}</span>
            </div>
            <div className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: "rgb(var(--accent-600) / 0.12)", border: "1px solid rgb(var(--accent-500) / 0.2)" }}>
                  <Wallet size={11} style={{ color: "rgb(var(--accent-400))" }} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.summary.net")}</span>
              </div>
              <span className={clsx("text-2xl font-bold stat-number", net >= 0 ? "gradient-text-income" : "gradient-text-expense")}>{net >= 0 ? "+" : ""}{fmt(net)}</span>
            </div>
          </div>

          {/* ── Charts ── */}
          {monthly.length > 0 && (
            <ChartSection title={t("finance.report.monthly")} icon={<BarChart2 size={11} />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{ left: 0, right: 8, top: 4, bottom: 0 }} barGap={3}>
                  <defs>
                    <linearGradient id="gradIncome2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.income} stopOpacity={1} />
                      <stop offset="100%" stopColor={CHART_COLORS.income} stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="gradExpense2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.expense} stopOpacity={1} />
                      <stop offset="100%" stopColor={CHART_COLORS.expense} stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtShort} tick={TICK_STYLE} axisLine={false} tickLine={false} width={48} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v: unknown) => fmt(Number(v))} labelFormatter={(l: unknown) => fmtMonth(String(l))} />
                  <Legend {...LEGEND_PROPS} />
                  <Bar dataKey="income"  name={t("finance.summary.income")}  fill="url(#gradIncome2)"  radius={[6,6,0,0]} maxBarSize={32} />
                  <Bar dataKey="expense" name={t("finance.summary.expense")} fill="url(#gradExpense2)" radius={[6,6,0,0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {cumulativeData.length > 0 && (
            <ChartSection title={t("finance.report.dailyFlow")} icon={<TrendingUp size={11} />}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={cumulativeData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradIncomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS.income}  stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.income}  stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExpenseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS.expense} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART_COLORS.expense} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="date" tick={TICK_STYLE} axisLine={false} tickLine={false}
                    tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmtShort} tick={TICK_STYLE} axisLine={false} tickLine={false} width={48} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v: unknown) => fmt(Number(v))} labelFormatter={(l: unknown) => String(l)} />
                  <Legend {...LEGEND_PROPS} />
                  <ReferenceLine y={0} stroke="rgba(148 163 184 / 0.2)" strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="income"  name={t("finance.summary.income")}  stroke={CHART_COLORS.income}  fill="url(#gradIncomeFill)"  strokeWidth={2.5} dot={false} />
                  <Area type="monotone" dataKey="expense" name={t("finance.summary.expense")} stroke={CHART_COLORS.expense} fill="url(#gradExpenseFill)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="cumulative" name={t("finance.report.cumulative")} stroke={CHART_COLORS.cumulative} dot={false} strokeWidth={2} strokeDasharray="5 3" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {/* ── Account distribution ── */}
          {accountPieData.length > 0 && (
            <ChartSection title={t("finance.report.accountDist")} icon={<Wallet size={11} />}>
              <div className="flex items-center gap-8">
                <div className="shrink-0" style={{ width: 160, height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={accountPieData} cx="50%" cy="50%" innerRadius={44} outerRadius={72}
                        dataKey="value" stroke="none" paddingAngle={3}>
                        {accountPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip {...TOOLTIP_PROPS} formatter={(v: unknown) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-3 flex-1 min-w-0">
                  {accountPieData.map((a, i) => {
                    const total = accountPieData.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? Math.round(a.value / total * 100) : 0;
                    return (
                      <div key={i} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.fill }} />
                          <span className="text-xs font-medium truncate flex-1" style={{ color: "rgb(var(--tx-primary))" }}>{a.name}</span>
                          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: "rgb(var(--tx-primary))" }}>{fmt(a.value)}</span>
                          <span className="text-[10px] w-8 text-right shrink-0" style={{ color: "rgb(var(--tx-muted))" }}>{pct}%</span>
                        </div>
                        <div className="ml-4 h-1.5 rounded-full overflow-hidden" style={{ background: "rgb(255 255 255 / 0.06)" }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: a.fill, boxShadow: `0 0 8px ${a.fill}80` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ChartSection>
          )}

          {monthly.length === 0 && timeline.length === 0 && accountPieData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: "rgb(var(--tx-muted))" }}>
              <BarChart2 size={32} style={{ opacity: 0.3 }} />
              <span className="text-sm">{t("finance.report.noData")}</span>
            </div>
          )}
        </>
      )}

      {pendingLockedPocket && (
        <LockPopup
          itemLabel={pendingLockedPocket.name}
          onUnlocked={() => { const p = pendingLockedPocket; setPendingLockedPocket(null); setFilterPocketId(p.id); }}
          onClose={() => setPendingLockedPocket(null)}
        />
      )}
    </div>
  );
}
