"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useLock } from "@/lib/LockContext";
import {
  getFinanceMonthly, getFinanceTimeline, getFinanceAccountsSummary,
  listTransactions, listAccounts,
  type MonthlyPoint, type TimelinePoint, type AccountSummary,
} from "@/lib/financeApi";
import { exportFinancePdf } from "@/lib/exportPdf";
import { LockPopup } from "@/components/lock/LockPopup";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { clsx } from "clsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  ReferenceLine, Area, AreaChart,
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
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
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

export function ReportsPanel({ pocketId, pockets }: Props) {
  const t = useT();
  const { status: lockStatus } = useLock();

  const [range, setRange]       = useState<ReportRange>("90d");
  const [monthly, setMonthly]   = useState<MonthlyPoint[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [filterPocketId, setFilterPocketId]   = useState<number | null>(null);
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null);
  const [pendingLockedPocket, setPendingLockedPocket] = useState<Pocket | null>(null);

  // Dropdown open state
  const [pocketOpen, setPocketOpen]   = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const pocketRef  = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click

  // Load accounts list for filter
  useEffect(() => {
    listAccounts().then(setAllAccounts).catch(() => {});
  }, []);

  // Reset internal filters when sidebar pocket changes
  useEffect(() => {
    setFilterPocketId(null);
    setFilterAccountId(null);
  }, [pocketId]);

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

  const handleExport = async () => {
    setExporting(true);
    try {
      const { from, to } = toRange(range);
      const rangeLabels: Record<ReportRange, string> = {
        "30d": "30 Hari", "90d": "3 Bulan", "180d": "6 Bulan", "1y": "1 Tahun",
      };
      const allTx = await listTransactions({
        date_from: from,
        date_to: to,
        pocket_id: effectivePocketId,
        account_id: effectiveAccountId,
        limit: 10000,
        offset: 0,
      });
      const selectedPocket  = pockets.find(p => p.id === effectivePocketId);
      const selectedAccount = allAccounts.find(a => a.id === effectiveAccountId);
      const contextLabel = [
        selectedPocket  ? `Kantong: ${selectedPocket.name}`  : null,
        selectedAccount ? `Akun: ${selectedAccount.name}` : null,
      ].filter(Boolean).join(" · ");
      await exportFinancePdf({
        appName: "LOQA Work",
        rangeLabel: rangeLabels[range] + (contextLabel ? ` · ${contextLabel}` : ""),
        from,
        to,
        totalIncome,
        totalExpense,
        net,
        monthly,
        accounts,
        transactions: allTx.transactions,
      });
    } catch (err) {
      alert("PDF error: " + (err instanceof Error ? err.message : String(err)));
    } finally { setExporting(false); }
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
    { id: "30d",  label: "30 Hari" },
    { id: "90d",  label: "3 Bulan" },
    { id: "180d", label: "6 Bulan" },
    { id: "1y",   label: "1 Tahun" },
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

  const selectedPocketLabel = filterPocketId != null
    ? pockets.find(p => p.id === filterPocketId)?.name ?? t("finance.report.allPockets")
    : t("finance.report.allPockets");

  const selectedAccountLabel = filterAccountId != null
    ? allAccounts.find(a => a.id === filterAccountId)?.name ?? t("finance.report.allAccounts")
    : t("finance.report.allAccounts");

  const Spinner = () => (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 max-w-3xl mx-auto flex flex-col gap-5">
      {/* Toolbar row 1: range + export */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {ranges.map(({ id, label }) => (
            <button key={id} onClick={() => setRange(id)}
              className={clsx("px-3 py-1.5 rounded-lg text-xs transition-colors",
                range === id ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text"
              )}>{label}</button>
          ))}
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          <Download size={13} />
          {exporting ? "Mengekspor..." : t("finance.report.exportPdf")}
        </button>
      </div>

      {/* Toolbar row 2: filters */}
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

      {loading ? <Spinner /> : (
        <>
          {/* Cashflow summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card px-4 py-3 flex flex-col gap-1">
              <span className="text-[11px] th-text-muted flex items-center gap-1"><TrendingUp size={12} className="text-emerald-400" />{t("finance.summary.income")}</span>
              <span className="font-bold th-text text-base">{fmt(totalIncome)}</span>
            </div>
            <div className="card px-4 py-3 flex flex-col gap-1">
              <span className="text-[11px] th-text-muted flex items-center gap-1"><TrendingDown size={12} className="text-red-400" />{t("finance.summary.expense")}</span>
              <span className="font-bold th-text text-base">{fmt(totalExpense)}</span>
            </div>
            <div className="card px-4 py-3 flex flex-col gap-1">
              <span className="text-[11px] th-text-muted">{t("finance.summary.net")}</span>
              <span className={clsx("font-bold text-base", net >= 0 ? "text-emerald-400" : "text-red-400")}>
                {net >= 0 ? "+" : ""}{fmt(net)}
              </span>
            </div>
          </div>

          {/* Monthly stacked bar */}
          {monthly.length > 0 && (
            <div className="card p-4 flex flex-col gap-3">
              <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wide">
                {t("finance.report.monthly")}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ left: 0, right: 8, top: 4, bottom: 0 }} barGap={3}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtShort} tick={TICK_STYLE} axisLine={false} tickLine={false} width={48} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v: unknown) => fmt(Number(v))} labelFormatter={(l: unknown) => fmtMonth(String(l))} />
                  <Legend {...LEGEND_PROPS} />
                  <Bar dataKey="income"  name={t("finance.summary.income")}  fill={CHART_COLORS.income}  radius={[4,4,0,0]} maxBarSize={28} fillOpacity={0.9} />
                  <Bar dataKey="expense" name={t("finance.summary.expense")} fill={CHART_COLORS.expense} radius={[4,4,0,0]} maxBarSize={28} fillOpacity={0.9} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Daily cashflow — area chart */}
          {cumulativeData.length > 0 && (
            <div className="card p-4 flex flex-col gap-3">
              <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wide">
                {t("finance.report.dailyFlow")}
              </h3>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={cumulativeData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS.income}  stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART_COLORS.income}  stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS.expense} stopOpacity={0.2} />
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
                  <Area type="monotone" dataKey="income"  name={t("finance.summary.income")}  stroke={CHART_COLORS.income}  fill="url(#gradIncome)"  strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="expense" name={t("finance.summary.expense")} stroke={CHART_COLORS.expense} fill="url(#gradExpense)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cumulative" name={t("finance.report.cumulative")} stroke={CHART_COLORS.cumulative} dot={false} strokeWidth={2} strokeDasharray="5 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Account distribution pie */}
          {accountPieData.length > 0 && (
            <div className="card p-4 flex flex-col gap-3">
              <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wide">
                {t("finance.report.accountDist")}
              </h3>
              <div className="flex items-center gap-6">
                <div className="w-40 h-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={accountPieData} cx="50%" cy="50%" innerRadius={36} outerRadius={66}
                        dataKey="value" stroke="none" paddingAngle={3}>
                        {accountPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip {...TOOLTIP_PROPS} formatter={(v: unknown) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                  {accountPieData.map((a, i) => {
                    const total = accountPieData.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? Math.round(a.value / total * 100) : 0;
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.fill }} />
                          <span className="text-xs th-text truncate flex-1">{a.name}</span>
                          <span className="text-xs font-bold th-text tabular-nums shrink-0">{fmt(a.value)}</span>
                          <span className="text-[10px] th-text-muted w-8 text-right">{pct}%</span>
                        </div>
                        <div className="ml-4 h-1 rounded-full th-bg-elevated overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: a.fill }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {monthly.length === 0 && timeline.length === 0 && accountPieData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 th-text-muted">
              <span className="text-sm">{t("finance.report.noData")}</span>
            </div>
          )}
        </>
      )}

      {/* Lock popup for locked pockets */}
      {pendingLockedPocket && (
        <LockPopup
          itemLabel={pendingLockedPocket.name}
          onUnlocked={() => {
            const p = pendingLockedPocket;
            setPendingLockedPocket(null);
            setFilterPocketId(p.id);
          }}
          onClose={() => setPendingLockedPocket(null)}
        />
      )}
    </div>
  );
}
