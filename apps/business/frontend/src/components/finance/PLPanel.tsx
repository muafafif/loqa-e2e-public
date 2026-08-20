"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useLock } from "@/lib/LockContext";
import { getFinancePL, listAccounts } from "@/lib/financeApi";
import { LockPopup } from "@/components/lock/LockPopup";
import { ExportDialog } from "@/components/ui/ExportDialog";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { useConnection } from "@/lib/ConnectionContext";
import { generateAiInsight, buildPLPrompt } from "@/lib/exportPdf";
import {
  Download, TrendingUp, TrendingDown, Minus,
  Info, BarChart2,
} from "lucide-react";
import { clsx } from "clsx";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { CHART_COLORS, TICK_STYLE, GRID_PROPS, TOOLTIP_PROPS, LEGEND_PROPS } from "@/lib/chartConfig";
import type { PLMonthRow, Pocket, Account } from "@/types";

type PLRange = "3m" | "6m" | "12m";
const RANGE_MONTHS: Record<PLRange, number> = { "3m": 3, "6m": 6, "12m": 12 };

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`;
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
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

interface Props {
  pocketId: number | null;
  pockets: Pocket[];
}

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

export function PLPanel({ pocketId, pockets }: Props) {
  const t = useT();
  const { status: lockStatus } = useLock();
  const { status: connStatus } = useConnection();

  const [range, setRange]     = useState<PLRange>("12m");
  const [rows, setRows]       = useState<PLMonthRow[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
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
      const data = await getFinancePL(RANGE_MONTHS[range], effectivePocketId, effectiveAccountId);
      setRows(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [range, effectivePocketId, effectiveAccountId]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce(
    (acc, r) => ({
      gross_income: acc.gross_income + r.gross_income,
      cogs: acc.cogs + r.cogs,
      gross_profit: acc.gross_profit + r.gross_profit,
      opex: acc.opex + r.opex,
      other_income: acc.other_income + r.other_income,
      net_profit: acc.net_profit + r.net_profit,
    }),
    { gross_income: 0, cogs: 0, gross_profit: 0, opex: 0, other_income: 0, net_profit: 0 }
  );
  const totalGrossMargin = totals.gross_income > 0 ? totals.gross_profit / totals.gross_income * 100 : 0;
  const totalNetMargin   = totals.gross_income > 0 ? totals.net_profit   / totals.gross_income * 100 : 0;
  const hasData = rows.some(r => r.gross_income > 0 || r.cogs > 0 || r.opex > 0);

  const chartData = rows.map(r => ({
    month: r.month,
    gross_profit: r.gross_profit,
    opex: -r.opex,
    other_income: r.other_income,
    net_profit: r.net_profit,
    net_margin: r.net_margin,
  }));

  function handleSelectPocket(p: Pocket | null) {
    if (p && p.locked && !lockStatus?.unlocked) {
      setPendingLockedPocket(p);
      setPocketOpen(false);
      return;
    }
    setFilterPocketId(p ? p.id : null);
    setPocketOpen(false);
  }

  const handleExport = async (includeInsight: boolean) => {
    setExporting(true);
    try {
      const { exportPLPdf } = await import("@/lib/exportPdf");
      const rangeLabel = range === "3m" ? "3 Bulan" : range === "6m" ? "6 Bulan" : "12 Bulan";
      const selPocket  = pockets.find(p => p.id === effectivePocketId);
      const selAccount = allAccounts.find(a => a.id === effectiveAccountId);
      const ctx = [
        selPocket  ? `Kantong: ${selPocket.name}` : null,
        selAccount ? `Akun: ${selAccount.name}` : null,
      ].filter(Boolean).join(" · ");

      let aiInsight: string | undefined;
      if (includeInsight) {
        setGeneratingInsight(true);
        const result = await generateAiInsight(buildPLPrompt({ rangeLabel, totals, grossMargin: totalGrossMargin, netMargin: totalNetMargin, rows }));
        setGeneratingInsight(false);
        if (result) aiInsight = result;
      }

      await exportPLPdf({
        appName: "LOQA Work",
        rangeLabel: rangeLabel + (ctx ? ` · ${ctx}` : ""),
        rows,
        totals: { ...totals, gross_margin: totalGrossMargin, net_margin: totalNetMargin },
        aiInsight,
      });
    } catch (err) {
      alert("PDF error: " + (err instanceof Error ? err.message : String(err)));
    } finally { setExporting(false); setGeneratingInsight(false); setExportDialogOpen(false); }
  };

  const selectedPocketLabel  = filterPocketId  != null ? pockets.find(p => p.id === filterPocketId)?.name  ?? t("finance.report.allPockets")  : t("finance.report.allPockets");
  const selectedAccountLabel = filterAccountId != null ? allAccounts.find(a => a.id === filterAccountId)?.name ?? t("finance.report.allAccounts") : t("finance.report.allAccounts");

  function marginStatus(pct: number) {
    if (pct > 0) return { cls: "gradient-text-income", label: t("finance.pl.profitable") };
    if (pct < 0) return { cls: "gradient-text-expense", label: t("finance.pl.loss") };
    return { cls: "text-amber-400", label: t("finance.pl.breakeven") };
  }
  const netStatus = marginStatus(totalNetMargin);

  return (
    <div className="p-5 max-w-4xl mx-auto flex flex-col gap-5">

      {/* ── Toolbar row 1: range + export ── */}
      <div className="flex items-center gap-3">
        <div className="tab-glass flex">
          {(["3m","6m","12m"] as PLRange[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={clsx("tab-glass-item btn-brand", range === r && "active")}>
              {r === "3m" ? "3 Bln" : r === "6m" ? "6 Bln" : "12 Bln"}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button onClick={() => setExportDialogOpen(true)} disabled={exporting || generatingInsight || !hasData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "rgb(16 185 129 / 0.15)", color: "#10b981", border: "1px solid rgb(16 185 129 / 0.25)" }}>
            <Download size={12} />
            {exporting || generatingInsight ? t("common.exportingPdf") : t("common.exportPdf")}
          </button>
        </div>
      </div>

      {/* ── Toolbar row 2: filters ── */}
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

      {loading ? <Spinner /> : !hasData ? (
        <div className="glass-card p-8 flex flex-col gap-3 items-center text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgb(var(--accent-600) / 0.1)", border: "1px solid rgb(var(--accent-500) / 0.15)" }}>
            <Info size={20} style={{ color: "rgb(var(--accent-400))", opacity: 0.6 }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "rgb(var(--tx-primary))" }}>{t("finance.pl.noData")}</p>
          <p className="text-xs max-w-sm" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.pl.setupHint")}</p>
        </div>
      ) : (
        <>
          {/* ── KPI strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: t("finance.pl.grossIncome"), value: fmt(totals.gross_income),
                cls: "gradient-text-income",
                icon: <TrendingUp size={11} />, iconBg: "rgb(16 185 129 / 0.12)", iconBorder: "rgb(16 185 129 / 0.2)", iconColor: "#10b981",
              },
              {
                label: t("finance.pl.grossMargin"), value: fmtPct(totalGrossMargin),
                cls: "text-sky-400",
                icon: <Minus size={11} />, iconBg: "rgb(14 165 233 / 0.12)", iconBorder: "rgb(14 165 233 / 0.2)", iconColor: "#38bdf8",
              },
              {
                label: t("finance.pl.netProfit"), value: fmt(totals.net_profit),
                cls: totals.net_profit >= 0 ? "gradient-text-income" : "gradient-text-expense",
                icon: totals.net_profit >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />,
                iconBg: totals.net_profit >= 0 ? "rgb(16 185 129 / 0.12)" : "rgb(244 63 94 / 0.12)",
                iconBorder: totals.net_profit >= 0 ? "rgb(16 185 129 / 0.2)" : "rgb(244 63 94 / 0.2)",
                iconColor: totals.net_profit >= 0 ? "#10b981" : "#f43f5e",
              },
              {
                label: t("finance.pl.netMargin"), value: fmtPct(totalNetMargin),
                cls: netStatus.cls,
                icon: <BarChart2 size={11} />, iconBg: "rgb(var(--accent-600) / 0.12)", iconBorder: "rgb(var(--accent-500) / 0.2)", iconColor: "rgb(var(--accent-400))",
              },
            ].map((card, i) => (
              <div key={i} className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center"
                    style={{ background: card.iconBg, border: `1px solid ${card.iconBorder}`, color: card.iconColor }}>
                    {card.icon}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{card.label}</span>
                </div>
                <span className={clsx("text-2xl font-bold stat-number", card.cls)}>{card.value}</span>
                {i === 3 && <span className={clsx("text-[11px] font-semibold", netStatus.cls)}>{netStatus.label}</span>}
              </div>
            ))}
          </div>

          {/* ── Margin chart ── */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                <BarChart2 size={11} />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                {t("finance.pl.marginChart")}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }} barGap={4}>
                <defs>
                  <linearGradient id="gradGrossProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.income} stopOpacity={1} />
                    <stop offset="100%" stopColor={CHART_COLORS.income} stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis yAxisId="amt" tickFormatter={fmtShort} tick={TICK_STYLE} axisLine={false} tickLine={false} width={50} />
                <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v}%`} tick={TICK_STYLE} axisLine={false} tickLine={false} width={42} />
                <Tooltip
                  {...TOOLTIP_PROPS}
                  formatter={(v: unknown, name: unknown) => {
                    const n = String(name ?? "");
                    if (n === t("finance.pl.netMargin")) return [`${Number(v).toFixed(1)}%`, n];
                    return [fmt(Math.abs(Number(v))), n];
                  }}
                  labelFormatter={(l: unknown) => fmtMonth(String(l))}
                />
                <Legend {...LEGEND_PROPS} />
                <ReferenceLine yAxisId="amt" y={0} stroke="rgba(148 163 184 / 0.2)" strokeDasharray="4 2" />
                <ReferenceLine yAxisId="pct" y={0} stroke="transparent" />
                <Bar yAxisId="amt" dataKey="gross_profit" name={t("finance.pl.grossProfit")} radius={[6,6,0,0]} maxBarSize={32}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.gross_profit >= 0 ? "url(#gradGrossProfit)" : CHART_COLORS.expense} fillOpacity={0.9} />
                  ))}
                </Bar>
                <Bar yAxisId="amt" dataKey="opex" name={t("finance.pl.opex")} fill={CHART_COLORS.hpp} fillOpacity={0.75} radius={[6,6,0,0]} maxBarSize={32} />
                <Line yAxisId="pct" type="monotone" dataKey="net_margin" name={t("finance.pl.netMargin")}
                  stroke={CHART_COLORS.net} strokeWidth={2.5}
                  dot={{ r: 4, fill: CHART_COLORS.net, strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ── P&L table ── */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{ borderColor: "rgb(var(--border))" }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
                <BarChart2 size={10} />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                {t("finance.pl.statement")}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: "rgb(var(--border))", background: "rgb(255 255 255 / 0.02)" }}>
                    <th className="text-left px-5 py-3 font-bold uppercase tracking-[0.08em] text-[10px]" style={{ color: "rgb(var(--tx-muted))" }}>{t("finance.pl.statement")}</th>
                    {rows.map(r => (
                      <th key={r.month} className="text-right px-3 py-3 font-semibold whitespace-nowrap text-[10px]" style={{ color: "rgb(var(--tx-muted))" }}>{fmtMonth(r.month)}</th>
                    ))}
                    <th className="text-right px-5 py-3 font-bold whitespace-nowrap text-[10px] border-l" style={{ color: "rgb(var(--tx-primary))", borderColor: "rgb(var(--border))" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <PLRow label={t("finance.pl.grossIncome")} rows={rows} field="gross_income" total={totals.gross_income} className="gradient-text-income font-semibold" />
                  <PLRow label={`  − ${t("finance.pl.cogs")}`} rows={rows} field="cogs" total={totals.cogs} negate className="" />
                  <PLRow label={t("finance.pl.grossProfit")} rows={rows} field="gross_profit" total={totals.gross_profit} highlight
                    suffix={row => row.gross_income > 0 ? ` (${row.gross_margin.toFixed(1)}%)` : ""}
                    totalSuffix={totals.gross_income > 0 ? ` (${totalGrossMargin.toFixed(1)}%)` : ""}
                  />
                  <PLRow label={`  − ${t("finance.pl.opex")}`} rows={rows} field="opex" total={totals.opex} negate className="" />
                  {rows.some(r => r.other_income > 0) && (
                    <PLRow label={`  + ${t("finance.pl.otherIncome")}`} rows={rows} field="other_income" total={totals.other_income} className="" />
                  )}
                  <PLRow label={t("finance.pl.netProfit")} rows={rows} field="net_profit" total={totals.net_profit} highlight isProfit
                    suffix={row => row.gross_income > 0 ? ` (${row.net_margin.toFixed(1)}%)` : ""}
                    totalSuffix={totals.gross_income > 0 ? ` (${totalNetMargin.toFixed(1)}%)` : ""}
                  />
                </tbody>
              </table>
            </div>
          </div>
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

interface PLRowProps {
  label: string;
  rows: PLMonthRow[];
  field: keyof PLMonthRow;
  total: number;
  negate?: boolean;
  highlight?: boolean;
  isProfit?: boolean;
  className?: string;
  suffix?: (row: PLMonthRow) => string;
  totalSuffix?: string;
}

function PLRow({ label, rows, field, total, negate, highlight, isProfit, className, suffix, totalSuffix }: PLRowProps) {
  function cellColor(v: number) {
    if (!isProfit) return "";
    return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "";
  }

  return (
    <tr className="border-b last:border-0"
      style={{
        borderColor: "rgb(var(--border))",
        background: highlight ? "rgb(255 255 255 / 0.025)" : undefined,
      }}>
      <td className={clsx("px-5 py-2.5 whitespace-nowrap font-medium", className)} style={{ color: className ? undefined : "rgb(var(--tx-muted))" }}>{label}</td>
      {rows.map(r => {
        const raw = r[field] as number;
        const display = negate ? -raw : raw;
        return (
          <td key={r.month} className={clsx("text-right px-3 py-2.5 tabular-nums whitespace-nowrap", isProfit ? cellColor(raw) : "")}
            style={{ color: isProfit ? undefined : "rgb(var(--tx-muted))" }}>
            {fmt(display)}{suffix ? <span className="text-[10px] ml-0.5" style={{ color: "rgb(var(--tx-muted))" }}>{suffix(r)}</span> : null}
          </td>
        );
      })}
      <td className={clsx("text-right px-5 py-2.5 font-bold tabular-nums border-l whitespace-nowrap", isProfit ? cellColor(total) : "")}
        style={{ borderColor: "rgb(var(--border))", color: isProfit ? undefined : highlight ? "rgb(var(--tx-primary))" : "rgb(var(--tx-muted))" }}>
        {fmt(negate ? -total : total)}{totalSuffix ? <span className="font-normal text-[10px] ml-0.5" style={{ color: "rgb(var(--tx-muted))" }}>{totalSuffix}</span> : null}
      </td>
    </tr>
  );
}
