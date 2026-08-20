"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useLock } from "@/lib/LockContext";
import {
  getFinanceSummary,
  getFinanceMonthly, getFinanceTimeline, getFinanceAccountsSummary,
  getFinancePL, listTransactions, listAccounts,
  type MonthlyPoint, type TimelinePoint, type AccountSummary,
} from "@/lib/financeApi";
import { exportFinancePdf } from "@/lib/exportPdf";
import { LockPopup } from "@/components/lock/LockPopup";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import type { FinanceSummary, PLMonthRow, Pocket, Account } from "@/types";
import {
  TrendingUp, TrendingDown, Minus, Wallet,
  Download, Info, BarChart2,
} from "lucide-react";
import { clsx } from "clsx";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area, ReferenceLine,
  ComposedChart, Line,
} from "recharts";
import {
  CHART_COLORS, TICK_STYLE, GRID_PROPS, TOOLTIP_PROPS, LEGEND_PROPS,
} from "@/lib/chartConfig";

// ── Types ──────────────────────────────────────────────────────────────────────
type SubTab  = "kpi" | "trend" | "pl";
type Period  = "today" | "week" | "month" | "all";
type ReportRange = "30d" | "90d" | "180d" | "1y";
type PLRange = "3m" | "6m" | "12m";

interface Props {
  pocketId: number | null;
  pockets:  Pocket[];
}

// ── Formatters (shared) ────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "decimal", maximumFractionDigits: 0 }).format(n);
}
function fmtShort(n: number) {
  const abs = Math.abs(n); const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000)     return `${sign}${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000)         return `${sign}${(abs / 1_000).toFixed(0)}rb`;
  return String(n);
}
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`;
}

const PALETTE = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];
const DEFAULT_ACCOUNT_COLOR = "#0284c7";
const RANGE_PL_MONTHS: Record<PLRange, number> = { "3m": 3, "6m": 6, "12m": 12 };

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
export function OverviewPanel({ pocketId, pockets }: Props) {
  const t = useT();
  const { status: lockStatus } = useLock();
  const [subTab, setSubTab] = useState<SubTab>("kpi");

  // shared: accounts list for filters
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  useEffect(() => { listAccounts().then(setAllAccounts).catch(() => {}); }, []);

  // reset filters when sidebar pocket changes
  const [filterPocketIdKpi,   setFilterPocketIdKpi]   = useState<number | null>(null);
  const [filterAccountIdKpi,  setFilterAccountIdKpi]  = useState<number | null>(null);
  const [filterPocketIdTrend, setFilterPocketIdTrend] = useState<number | null>(null);
  const [filterAccountIdTrend,setFilterAccountIdTrend]= useState<number | null>(null);
  const [filterPocketIdPL,    setFilterPocketIdPL]    = useState<number | null>(null);
  const [filterAccountIdPL,   setFilterAccountIdPL]   = useState<number | null>(null);
  useEffect(() => {
    setFilterPocketIdKpi(null);   setFilterAccountIdKpi(null);
    setFilterPocketIdTrend(null); setFilterAccountIdTrend(null);
    setFilterPocketIdPL(null);    setFilterAccountIdPL(null);
  }, [pocketId]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "rgb(var(--bg-base))" }}>
      {/* Sub-tab bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <div className="tab-glass flex">
          {(["kpi","trend","pl"] as SubTab[]).map(id => (
            <button key={id} onClick={() => setSubTab(id)}
              className={clsx("tab-glass-item btn-brand", subTab === id && "active")}>
              {id === "kpi"   ? t("finance.overview.kpi")
              : id === "trend" ? t("finance.overview.trend")
              :                  t("finance.pl.title")}
            </button>
          ))}
        </div>
      </div>
      <div className="accent-line mx-5 shrink-0" />

      {/* Sub-tab content */}
      <div className="flex-1 overflow-y-auto">
        {subTab === "kpi" && (
          <KpiSection
            pocketId={pocketId} pockets={pockets}
            allAccounts={allAccounts} lockStatus={lockStatus}
            filterPocketId={filterPocketIdKpi}   setFilterPocketId={setFilterPocketIdKpi}
            filterAccountId={filterAccountIdKpi} setFilterAccountId={setFilterAccountIdKpi}
          />
        )}
        {subTab === "trend" && (
          <TrendSection
            pocketId={pocketId} pockets={pockets}
            allAccounts={allAccounts} lockStatus={lockStatus}
            filterPocketId={filterPocketIdTrend}   setFilterPocketId={setFilterPocketIdTrend}
            filterAccountId={filterAccountIdTrend} setFilterAccountId={setFilterAccountIdTrend}
          />
        )}
        {subTab === "pl" && (
          <PLSection
            pocketId={pocketId} pockets={pockets}
            allAccounts={allAccounts} lockStatus={lockStatus}
            filterPocketId={filterPocketIdPL}   setFilterPocketId={setFilterPocketIdPL}
            filterAccountId={filterAccountIdPL} setFilterAccountId={setFilterAccountIdPL}
          />
        )}
      </div>
    </div>
  );
}

// ── KPI sub-tab ────────────────────────────────────────────────────────────────
interface SectionProps {
  pocketId: number | null;
  pockets: Pocket[];
  allAccounts: Account[];
  lockStatus: { unlocked?: boolean } | null;
  filterPocketId: number | null;   setFilterPocketId: (v: number | null) => void;
  filterAccountId: number | null;  setFilterAccountId: (v: number | null) => void;
}

function KpiSection({ pocketId, pockets, allAccounts, lockStatus, filterPocketId, setFilterPocketId, filterAccountId, setFilterAccountId }: SectionProps) {
  const t = useT();
  const [period, setPeriod]   = useState<Period>("month");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingLocked, setPendingLocked] = useState<Pocket | null>(null);

  const [pocketOpen,  setPocketOpen]  = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const pocketRef  = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);


  const effectivePocketId  = filterPocketId  ?? pocketId ?? undefined;
  const effectiveAccountId = filterAccountId ?? undefined;

  function toDateRange(p: Period): { from?: string; to?: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
    if (p === "today") { const t = d(now); return { from: t, to: t }; }
    if (p === "week") { const s = new Date(now); s.setDate(now.getDate()-now.getDay()); return { from: d(s), to: d(now) }; }
    if (p === "month") return { from: d(new Date(now.getFullYear(), now.getMonth(), 1)), to: d(now) };
    return {};
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = toDateRange(period);
      setSummary(await getFinanceSummary(from, to, effectivePocketId, effectiveAccountId));
    } catch { /* ignore */ } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, effectivePocketId, effectiveAccountId]);

  useEffect(() => { load(); }, [load]);

  const periods: { id: Period; label: string }[] = [
    { id: "today", label: t("finance.summary.today") },
    { id: "week",  label: t("finance.summary.thisWeek") },
    { id: "month", label: t("finance.summary.thisMonth") },
    { id: "all",   label: t("finance.summary.allTime") },
  ];

  const donutData = summary ? [
    { name: t("finance.summary.income"),  value: summary.total_income,  fill: "#10b981" },
    { name: t("finance.summary.expense"), value: summary.total_expense, fill: "#ef4444" },
  ].filter(d => d.value > 0) : [];

  const barData = summary
    ? (summary.by_category ?? []).filter(c => c.type !== "transfer").slice(0, 10).map(c => ({
        name: (c.name ?? t("finance.tx.noCategory")).length > 18 ? (c.name ?? "").slice(0,16)+"…" : (c.name ?? t("finance.tx.noCategory")),
        total: c.total, fill: c.color ?? "#6b7280",
      }))
    : [];

  const selPocketLabel  = filterPocketId  != null ? pockets.find(p => p.id === filterPocketId)?.name  ?? t("finance.report.allPockets") : t("finance.report.allPockets");
  const selAccountLabel = filterAccountId != null ? allAccounts.find(a => a.id === filterAccountId)?.name ?? t("finance.report.allAccounts") : t("finance.report.allAccounts");

  return (
    <div className="p-5 max-w-3xl mx-auto flex flex-col gap-5">
      {/* Toolbar row 1: period */}
      <div className="flex items-center gap-2">
        <div className="tab-glass flex">
          {periods.map(({ id, label }) => (
            <button key={id} onClick={() => setPeriod(id)}
              className={clsx("tab-glass-item btn-brand", period === id && "active")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar row 2: filters */}
      <div className="flex items-center gap-2 -mt-2">
        <FilterDropdown
          label={t("finance.report.filterPocket")} selectedLabel={selPocketLabel}
          open={pocketOpen} onToggle={() => { setPocketOpen(v=>!v); setAccountOpen(false); }}
          dropRef={pocketRef as React.RefObject<HTMLDivElement>}
          items={pockets} selectedId={filterPocketId} allLabel={t("finance.report.allPockets")}
          onSelectAll={() => { setFilterPocketId(null); setPocketOpen(false); }}
          onSelect={p => {
            if (p.locked && !lockStatus?.unlocked) { setPendingLocked(p); setPocketOpen(false); return; }
            setFilterPocketId(p.id); setPocketOpen(false);
          }}
          getId={p => p.id} getName={p => p.name} getColor={p => p.color}
          isLocked={p => !!p.locked} lockStatus={lockStatus?.unlocked}
          onClear={() => { setFilterPocketId(null); }}
        />
        <FilterDropdown
          label={t("finance.report.filterAccount")} selectedLabel={selAccountLabel}
          open={accountOpen} onToggle={() => { setAccountOpen(v=>!v); setPocketOpen(false); }}
          dropRef={accountRef as React.RefObject<HTMLDivElement>}
          items={allAccounts} selectedId={filterAccountId} allLabel={t("finance.report.allAccounts")}
          onSelectAll={() => { setFilterAccountId(null); setAccountOpen(false); }}
          onSelect={a => { setFilterAccountId(a.id); setAccountOpen(false); }}
          getId={a => a.id} getName={a => a.name} getColor={a => a.color}
          onClear={() => { setFilterAccountId(null); }}
        />
      </div>

      {loading ? <Spinner /> : summary ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t("finance.summary.income"),  value: fmt(summary.total_income),  icon: <TrendingUp size={13} />,  iconColor: "#34d399", iconBg: "rgb(16 185 129 / 0.12)", borderColor: "rgb(16 185 129 / 0.2)", gradClass: "gradient-text-income" },
              { label: t("finance.summary.expense"), value: fmt(summary.total_expense), icon: <TrendingDown size={13} />, iconColor: "#fb7185", iconBg: "rgb(244 63 94 / 0.12)", borderColor: "rgb(244 63 94 / 0.2)",  gradClass: "gradient-text-expense" },
              { label: t("finance.summary.net"),     value: (summary.net>=0?"+":"")+fmt(summary.net),
                icon: <Minus size={13} />,
                iconColor: summary.net>=0 ? "#a78bfa" : "#fb923c",
                iconBg: summary.net>=0 ? "rgb(139 92 246 / 0.12)" : "rgb(251 146 60 / 0.12)",
                borderColor: summary.net>=0 ? "rgb(139 92 246 / 0.2)" : "rgb(251 146 60 / 0.2)",
                gradClass: summary.net>=0 ? "gradient-text-brand" : "text-orange-400" },
              { label: t("finance.summary.balance"), value: fmt(summary.total_balance), icon: <Wallet size={13} />, iconColor: "#a78bfa", iconBg: "rgb(139 92 246 / 0.12)", borderColor: "rgb(139 92 246 / 0.2)", gradClass: "gradient-text-brand" },
            ].map((card, i) => (
              <div key={i} className="kpi-card inner-highlight p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{card.label}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: card.iconBg, border: `1px solid ${card.borderColor}` }}>
                    <span style={{ color: card.iconColor }}>{card.icon}</span>
                  </div>
                </div>
                <p className={clsx("text-3xl font-bold stat-number", card.gradClass)}>{card.value}</p>
              </div>
            ))}
          </div>

          {donutData.length > 0 && (
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                  <Wallet size={11} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.report.cashflow")}</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="w-36 h-36 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={34} outerRadius={60} dataKey="value" stroke="none" paddingAngle={3}>
                        {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip {...TOOLTIP_PROPS} formatter={(v: unknown) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-3 flex-1">
                  {donutData.map((d, i) => {
                    const total = donutData.reduce((s,x)=>s+x.value,0);
                    const pct   = total > 0 ? Math.round(d.value/total*100) : 0;
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:d.fill}} />
                          <span className="text-xs th-text-muted flex-1">{d.name}</span>
                          <span className="text-xs font-bold th-text tabular-nums">{fmt(d.value)}</span>
                          <span className="text-[10px] th-text-muted w-8 text-right">{pct}%</span>
                        </div>
                        <div className="ml-4 h-1 rounded-full overflow-hidden" style={{ background: "rgb(255 255 255 / 0.06)" }}>
                          <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,backgroundColor:d.fill, boxShadow: `0 0 6px ${d.fill}80`}} />
                        </div>
                      </div>
                    );
                  })}
                  {summary.total_income > 0 && summary.total_expense > 0 && (
                    <div className="pt-2 border-t th-border text-[11px] th-text-muted flex justify-between">
                      <span>Rasio beban</span>
                      <span className="font-semibold">{Math.round(summary.total_expense/summary.total_income*100)}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {barData.length > 0 && (
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                  <BarChart2 size={11} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.summary.byCategory")}</span>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(barData.length * 38 + 16, 200)}>
                <BarChart data={barData} layout="vertical" margin={{left:8,right:40,top:0,bottom:0}}>
                  <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
                  <XAxis type="number" tickFormatter={(v:unknown)=>fmtShort(Number(v))} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v:unknown)=>fmt(Number(v))} />
                  <Bar dataKey="total" radius={[0,8,8,0]} maxBarSize={26}>
                    {barData.map((d,i)=><Cell key={i} fill={d.fill} fillOpacity={0.92} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : null}

      {pendingLocked && (
        <LockPopup itemLabel={pendingLocked.name}
          onUnlocked={() => { setFilterPocketId(pendingLocked.id); setPendingLocked(null); }}
          onClose={() => setPendingLocked(null)}
        />
      )}
    </div>
  );
}

// ── Trend sub-tab ──────────────────────────────────────────────────────────────
function TrendSection({ pocketId, pockets, allAccounts, lockStatus, filterPocketId, setFilterPocketId, filterAccountId, setFilterAccountId }: SectionProps) {
  const t = useT();
  const [range, setRange]       = useState<ReportRange>("90d");
  const [monthly, setMonthly]   = useState<MonthlyPoint[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pendingLocked, setPendingLocked] = useState<Pocket | null>(null);

  const [pocketOpen,  setPocketOpen]  = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const pocketRef  = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);


  function toReportRange(r: ReportRange) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const d   = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
    const to  = d(now); const from = new Date(now);
    if (r === "30d")  from.setDate(from.getDate()-30);
    if (r === "90d")  from.setDate(from.getDate()-90);
    if (r === "180d") from.setDate(from.getDate()-180);
    if (r === "1y")   from.setFullYear(from.getFullYear()-1);
    return { from: d(from), to };
  }

  const effectivePocketId  = filterPocketId  ?? pocketId ?? undefined;
  const effectiveAccountId = filterAccountId ?? undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = toReportRange(range);
      const months = range==="30d"?3:range==="90d"?6:range==="180d"?9:12;
      const [m, tl, ac] = await Promise.all([
        getFinanceMonthly(months, effectivePocketId, effectiveAccountId),
        getFinanceTimeline(from, to, effectivePocketId, effectiveAccountId),
        getFinanceAccountsSummary(effectiveAccountId),
      ]);
      setMonthly(m); setTimeline(tl); setAccounts(ac);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [range, effectivePocketId, effectiveAccountId]);

  useEffect(() => { load(); }, [load]);

  const totalIncome  = timeline.reduce((s,d)=>s+d.income,  0);
  const totalExpense = timeline.reduce((s,d)=>s+d.expense, 0);
  const net = totalIncome - totalExpense;

  const cumulativeData = (() => {
    let cum = 0;
    return timeline.map(d => { cum += d.income - d.expense; return { ...d, cumulative: cum }; });
  })();

  const accountsPositive = accounts.filter(a => a.balance > 0);
  const accountPieData   = accountsPositive.map((a, i) => ({
    name: a.name, value: a.balance,
    fill: (a.color && a.color !== DEFAULT_ACCOUNT_COLOR) ? a.color : PALETTE[i % PALETTE.length],
  }));

  const selPocketLabel  = filterPocketId  != null ? pockets.find(p=>p.id===filterPocketId)?.name  ?? t("finance.report.allPockets") : t("finance.report.allPockets");
  const selAccountLabel = filterAccountId != null ? allAccounts.find(a=>a.id===filterAccountId)?.name ?? t("finance.report.allAccounts") : t("finance.report.allAccounts");

  const handleExport = async () => {
    setExporting(true);
    try {
      const { from, to } = toReportRange(range);
      const rangeLabels: Record<ReportRange, string> = { "30d":"30 Hari", "90d":"3 Bulan", "180d":"6 Bulan", "1y":"1 Tahun" };
      const allTx = await listTransactions({ date_from:from, date_to:to, pocket_id:effectivePocketId, account_id:effectiveAccountId, limit:10000, offset:0 });
      const selPocket  = pockets.find(p=>p.id===effectivePocketId);
      const selAccount = allAccounts.find(a=>a.id===effectiveAccountId);
      const ctx = [selPocket?`Kantong: ${selPocket.name}`:null, selAccount?`Akun: ${selAccount.name}`:null].filter(Boolean).join(" · ");
      await exportFinancePdf({ appName:"LOQA Home", rangeLabel:rangeLabels[range]+(ctx?` · ${ctx}`:""), from, to, totalIncome, totalExpense, net, monthly, accounts, transactions:allTx.transactions });
    } catch (err) { alert("PDF error: "+(err instanceof Error?err.message:String(err))); }
    finally { setExporting(false); }
  };

  const ranges: { id: ReportRange; label: string }[] = [
    { id:"30d", label:"30 Hari" }, { id:"90d", label:"3 Bulan" },
    { id:"180d", label:"6 Bulan" }, { id:"1y", label:"1 Tahun" },
  ];

  return (
    <div className="p-5 max-w-3xl mx-auto flex flex-col gap-5">
      {/* Toolbar row 1: range + export */}
      <div className="flex items-center gap-2">
        <div className="tab-glass flex">
          {ranges.map(({id,label}) => (
            <button key={id} onClick={() => setRange(id)}
              className={clsx("tab-glass-item btn-brand", range===id && "active")}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={handleExport} disabled={exporting}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
          style={{ background: "rgb(16 185 129 / 0.15)", color: "#10b981", border: "1px solid rgb(16 185 129 / 0.25)" }}>
          <Download size={12} />
          {exporting ? "Mengekspor..." : t("finance.report.exportPdf")}
        </button>
      </div>

      {/* Toolbar row 2: filters */}
      <div className="flex items-center gap-2 -mt-2">
        <FilterDropdown
          label={t("finance.report.filterPocket")} selectedLabel={selPocketLabel}
          open={pocketOpen} onToggle={() => { setPocketOpen(v=>!v); setAccountOpen(false); }}
          dropRef={pocketRef as React.RefObject<HTMLDivElement>}
          items={pockets} selectedId={filterPocketId} allLabel={t("finance.report.allPockets")}
          onSelectAll={() => { setFilterPocketId(null); setPocketOpen(false); }}
          onSelect={p => {
            if (p.locked && !lockStatus?.unlocked) { setPendingLocked(p); setPocketOpen(false); return; }
            setFilterPocketId(p.id); setPocketOpen(false);
          }}
          getId={p=>p.id} getName={p=>p.name} getColor={p=>p.color}
          isLocked={p=>!!p.locked} lockStatus={lockStatus?.unlocked}
          onClear={() => { setFilterPocketId(null); }}
        />
        <FilterDropdown
          label={t("finance.report.filterAccount")} selectedLabel={selAccountLabel}
          open={accountOpen} onToggle={() => { setAccountOpen(v=>!v); setPocketOpen(false); }}
          dropRef={accountRef as React.RefObject<HTMLDivElement>}
          items={allAccounts} selectedId={filterAccountId} allLabel={t("finance.report.allAccounts")}
          onSelectAll={() => { setFilterAccountId(null); setAccountOpen(false); }}
          onSelect={a => { setFilterAccountId(a.id); setAccountOpen(false); }}
          getId={a=>a.id} getName={a=>a.name} getColor={a=>a.color}
          onClear={() => { setFilterAccountId(null); }}
        />
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t("finance.summary.income"),  value: fmt(totalIncome),  icon: <TrendingUp size={11} />, iconBg: "rgb(16 185 129 / 0.12)", iconBorder: "rgb(16 185 129 / 0.2)", iconColor: "#10b981", cls: "gradient-text-income" },
              { label: t("finance.summary.expense"), value: fmt(totalExpense), icon: <TrendingDown size={11} />, iconBg: "rgb(244 63 94 / 0.12)", iconBorder: "rgb(244 63 94 / 0.2)", iconColor: "#f43f5e", cls: "gradient-text-expense" },
              { label: t("finance.summary.net"),     value: (net>=0?"+":"")+fmt(net), icon: <Wallet size={11} />,
                iconBg: net>=0 ? "rgb(var(--accent-600) / 0.12)" : "rgb(251 146 60 / 0.12)",
                iconBorder: net>=0 ? "rgb(var(--accent-500) / 0.2)" : "rgb(251 146 60 / 0.2)",
                iconColor: net>=0 ? "rgb(var(--accent-400))" : "#fb923c",
                cls: net>=0 ? "gradient-text-brand" : "text-orange-400" },
            ].map((c,i) => (
              <div key={i} className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: c.iconBg, border: `1px solid ${c.iconBorder}`, color: c.iconColor }}>
                    {c.icon}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{c.label}</span>
                </div>
                <span className={clsx("text-2xl font-bold stat-number", c.cls)}>{c.value}</span>
              </div>
            ))}
          </div>

          {monthly.length > 0 && (
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                  <BarChart2 size={11} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.report.monthly")}</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{left:0,right:8,top:4,bottom:0}} barGap={3}>
                  <defs>
                    <linearGradient id="trendInc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLORS.income} stopOpacity={1}/><stop offset="100%" stopColor={CHART_COLORS.income} stopOpacity={0.6}/></linearGradient>
                    <linearGradient id="trendExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLORS.expense} stopOpacity={1}/><stop offset="100%" stopColor={CHART_COLORS.expense} stopOpacity={0.6}/></linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tickFormatter={(v:unknown)=>fmtMonth(String(v))} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v:unknown)=>fmtShort(Number(v))} tick={TICK_STYLE} axisLine={false} tickLine={false} width={48} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v:unknown)=>fmt(Number(v))} labelFormatter={(l:unknown)=>fmtMonth(String(l))} />
                  <Legend {...LEGEND_PROPS} />
                  <Bar dataKey="income"  name={t("finance.summary.income")}  fill="url(#trendInc)" radius={[6,6,0,0]} maxBarSize={32} />
                  <Bar dataKey="expense" name={t("finance.summary.expense")} fill="url(#trendExp)" radius={[6,6,0,0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {cumulativeData.length > 0 && (
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(16 185 129 / 0.12)", border: "1px solid rgb(16 185 129 / 0.2)", color: "#10b981" }}>
                  <TrendingUp size={11} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.report.dailyFlow")}</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={cumulativeData} margin={{left:0,right:8,top:4,bottom:0}}>
                  <defs>
                    <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS.income} stopOpacity={0.3}/><stop offset="95%" stopColor={CHART_COLORS.income} stopOpacity={0}/></linearGradient>
                    <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS.expense} stopOpacity={0.25}/><stop offset="95%" stopColor={CHART_COLORS.expense} stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="date" tick={TICK_STYLE} axisLine={false} tickLine={false} tickFormatter={(d:unknown)=>String(d).slice(5)} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v:unknown)=>fmtShort(Number(v))} tick={TICK_STYLE} axisLine={false} tickLine={false} width={48} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v:unknown)=>fmt(Number(v))} labelFormatter={(l:unknown)=>String(l)} />
                  <Legend {...LEGEND_PROPS} />
                  <ReferenceLine y={0} stroke="rgba(148 163 184 / 0.2)" strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="income"  name={t("finance.summary.income")}  stroke={CHART_COLORS.income}  fill="url(#gI)" strokeWidth={2.5} dot={false} />
                  <Area type="monotone" dataKey="expense" name={t("finance.summary.expense")} stroke={CHART_COLORS.expense} fill="url(#gE)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="cumulative" name={t("finance.report.cumulative")} stroke={CHART_COLORS.cumulative} dot={false} strokeWidth={2} strokeDasharray="5 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {accountPieData.length > 0 && (
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                  <Wallet size={11} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.report.accountDist")}</span>
              </div>
              <div className="flex items-center gap-8">
                <div className="shrink-0" style={{ width: 160, height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={accountPieData} cx="50%" cy="50%" innerRadius={44} outerRadius={72} dataKey="value" stroke="none" paddingAngle={3}>
                        {accountPieData.map((d,i)=><Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip {...TOOLTIP_PROPS} formatter={(v:unknown)=>fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-3 flex-1 min-w-0">
                  {accountPieData.map((a,i) => {
                    const total = accountPieData.reduce((s,x)=>s+x.value,0);
                    const pct   = total > 0 ? Math.round(a.value/total*100) : 0;
                    return (
                      <div key={i} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:a.fill}} />
                          <span className="text-xs font-medium truncate flex-1" style={{ color: "rgb(var(--tx-primary))" }}>{a.name}</span>
                          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: "rgb(var(--tx-primary))" }}>{fmt(a.value)}</span>
                          <span className="text-[10px] w-8 text-right" style={{ color: "rgb(var(--tx-muted))" }}>{pct}%</span>
                        </div>
                        <div className="ml-4 h-1.5 rounded-full overflow-hidden" style={{ background: "rgb(255 255 255 / 0.06)" }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{width:`${pct}%`,backgroundColor:a.fill, boxShadow:`0 0 8px ${a.fill}80`}} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {monthly.length===0 && timeline.length===0 && accountPieData.length===0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 th-text-muted">
              <span className="text-sm">{t("finance.report.noData")}</span>
            </div>
          )}
        </>
      )}

      {pendingLocked && (
        <LockPopup itemLabel={pendingLocked.name}
          onUnlocked={() => { setFilterPocketId(pendingLocked.id); setPendingLocked(null); }}
          onClose={() => setPendingLocked(null)}
        />
      )}
    </div>
  );
}

// ── P&L sub-tab ────────────────────────────────────────────────────────────────
function PLSection({ pocketId, pockets, allAccounts, lockStatus, filterPocketId, setFilterPocketId, filterAccountId, setFilterAccountId }: SectionProps) {
  const t = useT();
  const [range, setRange]     = useState<PLRange>("12m");
  const [rows, setRows]       = useState<PLMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pendingLocked, setPendingLocked] = useState<Pocket | null>(null);

  const [pocketOpen,  setPocketOpen]  = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const pocketRef  = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);


  const effectivePocketId  = filterPocketId  ?? pocketId ?? undefined;
  const effectiveAccountId = filterAccountId ?? undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getFinancePL(RANGE_PL_MONTHS[range], effectivePocketId, effectiveAccountId));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [range, effectivePocketId, effectiveAccountId]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce(
    (acc,r) => ({ gross_income:acc.gross_income+r.gross_income, cogs:acc.cogs+r.cogs, gross_profit:acc.gross_profit+r.gross_profit, opex:acc.opex+r.opex, other_income:acc.other_income+r.other_income, net_profit:acc.net_profit+r.net_profit }),
    { gross_income:0, cogs:0, gross_profit:0, opex:0, other_income:0, net_profit:0 }
  );
  const totalGrossMargin = totals.gross_income > 0 ? totals.gross_profit / totals.gross_income * 100 : 0;
  const totalNetMargin   = totals.gross_income > 0 ? totals.net_profit   / totals.gross_income * 100 : 0;
  const hasData = rows.some(r => r.gross_income > 0 || r.cogs > 0 || r.opex > 0);

  const chartData = rows.map(r => ({
    month: r.month,
    gross_profit: r.gross_profit,
    opex: -r.opex,
    net_profit: r.net_profit,
    net_margin: r.net_margin,
  }));

  function marginStatus(pct: number) {
    if (pct > 0) return { color:"text-emerald-400", label:t("finance.pl.profitable") };
    if (pct < 0) return { color:"text-red-400",     label:t("finance.pl.loss") };
    return { color:"text-amber-400", label:t("finance.pl.breakeven") };
  }
  const netStatus = marginStatus(totalNetMargin);

  const selPocketLabel  = filterPocketId  != null ? pockets.find(p=>p.id===filterPocketId)?.name  ?? t("finance.report.allPockets") : t("finance.report.allPockets");
  const selAccountLabel = filterAccountId != null ? allAccounts.find(a=>a.id===filterAccountId)?.name ?? t("finance.report.allAccounts") : t("finance.report.allAccounts");

  const handleExport = async () => {
    setExporting(true);
    try {
      const { exportPLPdf } = await import("@/lib/exportPdf");
      const rangeLabel = range==="3m"?"3 Bulan":range==="6m"?"6 Bulan":"12 Bulan";
      const selPocket  = pockets.find(p=>p.id===effectivePocketId);
      const selAccount = allAccounts.find(a=>a.id===effectiveAccountId);
      const ctx = [selPocket?`Kantong: ${selPocket.name}`:null, selAccount?`Akun: ${selAccount.name}`:null].filter(Boolean).join(" · ");
      await exportPLPdf({ appName:"LOQA Home", rangeLabel:rangeLabel+(ctx?` · ${ctx}`:""), rows, totals:{...totals,gross_margin:totalGrossMargin,net_margin:totalNetMargin} });
    } catch (err) { alert("PDF error: "+(err instanceof Error?err.message:String(err))); }
    finally { setExporting(false); }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto flex flex-col gap-5">
      {/* Toolbar row 1: range + export */}
      <div className="flex items-center gap-2">
        <div className="tab-glass flex">
          {(["3m","6m","12m"] as PLRange[]).map(r => (
            <button key={r} onClick={()=>setRange(r)}
              className={clsx("tab-glass-item btn-brand", range===r && "active")}>
              {r==="3m"?"3 Bln":r==="6m"?"6 Bln":"12 Bln"}
            </button>
          ))}
        </div>
        <button onClick={handleExport} disabled={exporting||!hasData}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
          style={{ background: "rgb(16 185 129 / 0.15)", color: "#10b981", border: "1px solid rgb(16 185 129 / 0.25)" }}>
          <Download size={12} />
          {exporting?"Mengekspor...":t("finance.pl.exportPdf")}
        </button>
      </div>

      {/* Toolbar row 2: filters */}
      <div className="flex items-center gap-2 -mt-2">
        <FilterDropdown
          label={t("finance.report.filterPocket")} selectedLabel={selPocketLabel}
          open={pocketOpen} onToggle={() => { setPocketOpen(v=>!v); setAccountOpen(false); }}
          dropRef={pocketRef as React.RefObject<HTMLDivElement>}
          items={pockets} selectedId={filterPocketId} allLabel={t("finance.report.allPockets")}
          onSelectAll={() => { setFilterPocketId(null); setPocketOpen(false); }}
          onSelect={p => {
            if (p.locked && !lockStatus?.unlocked) { setPendingLocked(p); setPocketOpen(false); return; }
            setFilterPocketId(p.id); setPocketOpen(false);
          }}
          getId={p=>p.id} getName={p=>p.name} getColor={p=>p.color}
          isLocked={p=>!!p.locked} lockStatus={lockStatus?.unlocked}
          onClear={() => { setFilterPocketId(null); }}
        />
        <FilterDropdown
          label={t("finance.report.filterAccount")} selectedLabel={selAccountLabel}
          open={accountOpen} onToggle={() => { setAccountOpen(v=>!v); setPocketOpen(false); }}
          dropRef={accountRef as React.RefObject<HTMLDivElement>}
          items={allAccounts} selectedId={filterAccountId} allLabel={t("finance.report.allAccounts")}
          onSelectAll={() => { setFilterAccountId(null); setAccountOpen(false); }}
          onSelect={a => { setFilterAccountId(a.id); setAccountOpen(false); }}
          getId={a=>a.id} getName={a=>a.name} getColor={a=>a.color}
          onClear={() => { setFilterAccountId(null); }}
        />
      </div>

      {loading ? <Spinner /> : !hasData ? (
        <div className="th-bg-surface border th-border rounded-2xl p-6 flex flex-col gap-3 items-center text-center">
          <Info size={28} className="th-text-muted opacity-60" />
          <p className="text-sm th-text font-medium">{t("finance.pl.noData")}</p>
          <p className="text-xs th-text-muted max-w-sm">{t("finance.pl.setupHint")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:t("finance.pl.grossIncome"), value:fmt(totals.gross_income), cls:"gradient-text-income", icon:<TrendingUp size={11}/>, iconBg:"rgb(16 185 129 / 0.12)", iconBorder:"rgb(16 185 129 / 0.2)", iconColor:"#10b981" },
              { label:t("finance.pl.grossMargin"), value:fmtPct(totalGrossMargin), cls:"text-sky-400", icon:<Minus size={11}/>, iconBg:"rgb(14 165 233 / 0.12)", iconBorder:"rgb(14 165 233 / 0.2)", iconColor:"#38bdf8" },
              { label:t("finance.pl.netProfit"),   value:fmt(totals.net_profit),   cls:totals.net_profit>=0?"gradient-text-income":"gradient-text-expense",
                icon:totals.net_profit>=0?<TrendingUp size={11}/>:<TrendingDown size={11}/>,
                iconBg:totals.net_profit>=0?"rgb(16 185 129 / 0.12)":"rgb(244 63 94 / 0.12)",
                iconBorder:totals.net_profit>=0?"rgb(16 185 129 / 0.2)":"rgb(244 63 94 / 0.2)",
                iconColor:totals.net_profit>=0?"#10b981":"#f43f5e" },
              { label:t("finance.pl.netMargin"),   value:fmtPct(totalNetMargin),   cls:netStatus.color, icon:<BarChart2 size={11}/>, iconBg:"rgb(var(--accent-600) / 0.12)", iconBorder:"rgb(var(--accent-500) / 0.2)", iconColor:"rgb(var(--accent-400))" },
            ].map((card,i) => (
              <div key={i} className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: card.iconBg, border: `1px solid ${card.iconBorder}`, color: card.iconColor }}>
                    {card.icon}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{card.label}</span>
                </div>
                <span className={clsx("text-2xl font-bold stat-number", card.cls)}>{card.value}</span>
                {i===3 && <span className={clsx("text-[11px] font-semibold", netStatus.color)}>{netStatus.label}</span>}
              </div>
            ))}
          </div>

          <div className="glass-card p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                <BarChart2 size={11} />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.pl.marginChart")}</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{left:0,right:16,top:4,bottom:0}} barGap={4}>
                <defs>
                  <linearGradient id="plGrossProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.income} stopOpacity={1} />
                    <stop offset="100%" stopColor={CHART_COLORS.income} stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis yAxisId="amt" tickFormatter={(v:unknown)=>fmtShort(Number(v))} tick={TICK_STYLE} axisLine={false} tickLine={false} width={50} />
                <YAxis yAxisId="pct" orientation="right" tickFormatter={(v:unknown)=>`${v}%`} tick={TICK_STYLE} axisLine={false} tickLine={false} width={42} />
                <Tooltip {...TOOLTIP_PROPS}
                  formatter={(v:unknown, name:unknown) => {
                    const n = String(name??"");
                    if (n===t("finance.pl.netMargin")) return [`${Number(v).toFixed(1)}%`, n];
                    return [fmt(Math.abs(Number(v))), n];
                  }}
                  labelFormatter={(l:unknown)=>fmtMonth(String(l))}
                />
                <Legend {...LEGEND_PROPS} />
                <ReferenceLine yAxisId="amt" y={0} stroke="rgba(148 163 184 / 0.2)" strokeDasharray="4 2" />
                <ReferenceLine yAxisId="pct" y={0} stroke="transparent" />
                <Bar yAxisId="amt" dataKey="gross_profit" name={t("finance.pl.grossProfit")} radius={[6,6,0,0]} maxBarSize={32}>
                  {chartData.map((e,i)=><Cell key={i} fill={e.gross_profit>=0?"url(#plGrossProfit)":CHART_COLORS.expense} fillOpacity={0.9}/>)}
                </Bar>
                <Bar yAxisId="amt" dataKey="opex" name={t("finance.pl.opex")} fill={CHART_COLORS.hpp} fillOpacity={0.75} radius={[6,6,0,0]} maxBarSize={32} />
                <Line yAxisId="pct" type="monotone" dataKey="net_margin" name={t("finance.pl.netMargin")} stroke={CHART_COLORS.net} strokeWidth={2.5} dot={{r:4,fill:CHART_COLORS.net,strokeWidth:0}} activeDot={{r:6}} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{ borderColor: "rgb(var(--border))" }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                <BarChart2 size={10} />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.pl.statement")}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: "rgb(var(--border))", background: "rgb(255 255 255 / 0.02)" }}>
                    <th className="text-left px-5 py-3 font-bold uppercase tracking-[0.08em] text-[10px]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.pl.statement")}</th>
                    {rows.map(r=><th key={r.month} className="text-right px-3 py-3 font-semibold whitespace-nowrap text-[10px]" style={{ color: "rgb(var(--tx-muted))" }}>{fmtMonth(r.month)}</th>)}
                    <th className="text-right px-5 py-3 font-bold whitespace-nowrap text-[10px] border-l" style={{ color: "rgb(var(--tx-primary))", borderColor: "rgb(var(--border))" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <PLRow label={t("finance.pl.grossIncome")} rows={rows} field="gross_income" total={totals.gross_income} className="gradient-text-income font-semibold" />
                  <PLRow label={`  − ${t("finance.pl.cogs")}`} rows={rows} field="cogs" total={totals.cogs} negate className="" />
                  <PLRow label={t("finance.pl.grossProfit")} rows={rows} field="gross_profit" total={totals.gross_profit} highlight
                    suffix={r=>r.gross_income>0?` (${r.gross_margin.toFixed(1)}%)`:""}
                    totalSuffix={totals.gross_income>0?` (${totalGrossMargin.toFixed(1)}%)`:""}
                  />
                  <PLRow label={`  − ${t("finance.pl.opex")}`} rows={rows} field="opex" total={totals.opex} negate className="" />
                  {rows.some(r=>r.other_income>0) && (
                    <PLRow label={`  + ${t("finance.pl.otherIncome")}`} rows={rows} field="other_income" total={totals.other_income} className="" />
                  )}
                  <PLRow label={t("finance.pl.netProfit")} rows={rows} field="net_profit" total={totals.net_profit} highlight isProfit
                    suffix={r=>r.gross_income>0?` (${r.net_margin.toFixed(1)}%)`:""}
                    totalSuffix={totals.gross_income>0?` (${totalNetMargin.toFixed(1)}%)`:""}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pendingLocked && (
        <LockPopup itemLabel={pendingLocked.name}
          onUnlocked={() => { setFilterPocketId(pendingLocked.id); setPendingLocked(null); }}
          onClose={() => setPendingLocked(null)}
        />
      )}
    </div>
  );
}

// ── P&L table row helper ───────────────────────────────────────────────────────
interface PLRowProps {
  label: string; rows: PLMonthRow[]; field: keyof PLMonthRow; total: number;
  negate?: boolean; highlight?: boolean; isProfit?: boolean;
  className?: string; suffix?: (r: PLMonthRow) => string; totalSuffix?: string;
}
function PLRow({ label, rows, field, total, negate, highlight, isProfit, className, suffix, totalSuffix }: PLRowProps) {
  function cellColor(v: number) {
    if (!isProfit) return "";
    return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "";
  }
  return (
    <tr className="border-b last:border-0"
      style={{ borderColor: "rgb(var(--border))", background: highlight ? "rgb(255 255 255 / 0.025)" : undefined }}>
      <td className={clsx("px-5 py-2.5 whitespace-nowrap font-medium", className)} style={{ color: className ? undefined : "rgb(var(--tx-muted))" }}>{label}</td>
      {rows.map(r => {
        const raw = r[field] as number;
        return (
          <td key={r.month} className={clsx("text-right px-3 py-2.5 tabular-nums whitespace-nowrap", isProfit ? cellColor(raw) : "")}
            style={{ color: isProfit ? undefined : "rgb(var(--tx-muted))" }}>
            {fmt(negate ? -raw : raw)}{suffix ? <span className="text-[10px] ml-0.5" style={{ color: "rgb(var(--tx-muted))" }}>{suffix(r)}</span> : null}
          </td>
        );
      })}
      <td className={clsx("text-right px-5 py-2.5 font-bold tabular-nums border-l whitespace-nowrap", isProfit ? cellColor(total) : "")}
        style={{ borderColor: "rgb(var(--border))", color: isProfit ? undefined : highlight ? "rgb(var(--tx-primary))" : "rgb(var(--tx-muted))" }}>
        {fmt(negate?-total:total)}{totalSuffix?<span className="font-normal text-[10px] ml-0.5" style={{ color: "rgb(var(--tx-muted))" }}>{totalSuffix}</span>:null}
      </td>
    </tr>
  );
}
