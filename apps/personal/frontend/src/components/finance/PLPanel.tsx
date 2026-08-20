"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useLock } from "@/lib/LockContext";
import { getFinancePL, listAccounts } from "@/lib/financeApi";
import { LockPopup } from "@/components/lock/LockPopup";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import {
  Download, TrendingUp, TrendingDown, Minus, Info,
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
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}rb`;
  return String(n);
}
function fmtPct(n: number) { return `${n >= 0 ? "" : ""}${n.toFixed(1)}%`; }

interface Props {
  pocketId: number | null;
  pockets: Pocket[];
}

export function PLPanel({ pocketId, pockets }: Props) {
  const t = useT();
  const { status: lockStatus } = useLock();

  const [range, setRange]     = useState<PLRange>("12m");
  const [rows, setRows]       = useState<PLMonthRow[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

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

  // Totals across all months
  const totals = rows.reduce(
    (acc, r) => ({
      gross_income: acc.gross_income + r.gross_income,
      cogs:         acc.cogs + r.cogs,
      gross_profit: acc.gross_profit + r.gross_profit,
      opex:         acc.opex + r.opex,
      other_income: acc.other_income + r.other_income,
      net_profit:   acc.net_profit + r.net_profit,
    }),
    { gross_income: 0, cogs: 0, gross_profit: 0, opex: 0, other_income: 0, net_profit: 0 }
  );
  const totalGrossMargin = totals.gross_income > 0 ? totals.gross_profit / totals.gross_income * 100 : 0;
  const totalNetMargin   = totals.gross_income > 0 ? totals.net_profit   / totals.gross_income * 100 : 0;

  const hasData = rows.some(r => r.gross_income > 0 || r.cogs > 0 || r.opex > 0);

  // Chart data: bars for profit/loss components, line for net margin %
  const chartData = rows.map(r => ({
    month:        r.month,
    gross_profit: r.gross_profit,
    opex:         -r.opex,
    other_income: r.other_income,
    net_profit:   r.net_profit,
    net_margin:   r.net_margin,
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const { exportPLPdf } = await import("@/lib/exportPdf");
      const rangeLabel = range === "3m" ? "3 Bulan" : range === "6m" ? "6 Bulan" : "12 Bulan";
      const selPocket  = pockets.find(p => p.id === effectivePocketId);
      const selAccount = allAccounts.find(a => a.id === effectiveAccountId);
      const ctx = [
        selPocket  ? `Kantong: ${selPocket.name}`  : null,
        selAccount ? `Akun: ${selAccount.name}` : null,
      ].filter(Boolean).join(" · ");
      await exportPLPdf({
        appName: "LOQA Work",
        rangeLabel: rangeLabel + (ctx ? ` · ${ctx}` : ""),
        rows,
        totals: { ...totals, gross_margin: totalGrossMargin, net_margin: totalNetMargin },
      });
    } catch (err) {
      alert("PDF error: " + (err instanceof Error ? err.message : String(err)));
    } finally { setExporting(false); }
  };

  const selectedPocketLabel  = filterPocketId  != null ? pockets.find(p => p.id === filterPocketId)?.name  ?? t("finance.report.allPockets")  : t("finance.report.allPockets");
  const selectedAccountLabel = filterAccountId != null ? allAccounts.find(a => a.id === filterAccountId)?.name ?? t("finance.report.allAccounts") : t("finance.report.allAccounts");

  const Spinner = () => (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Margin status color + label
  function marginStatus(pct: number) {
    if (pct > 0)  return { color: "text-emerald-400", label: t("finance.pl.profitable") };
    if (pct < 0)  return { color: "text-red-400",     label: t("finance.pl.loss") };
    return { color: "text-amber-400", label: t("finance.pl.breakeven") };
  }
  const netStatus = marginStatus(totalNetMargin);

  return (
    <div className="p-4 max-w-4xl mx-auto flex flex-col gap-5">

      {/* Toolbar row 1: range + export */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {(["3m","6m","12m"] as PLRange[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={clsx("px-3 py-1.5 rounded-lg text-xs transition-colors",
                range === r ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text"
              )}>
              {r === "3m" ? "3 Bulan" : r === "6m" ? "6 Bulan" : "12 Bulan"}
            </button>
          ))}
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !hasData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          <Download size={13} />
          {exporting ? "Mengekspor..." : t("finance.pl.exportPdf")}
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

      {loading ? <Spinner /> : !hasData ? (
        /* Empty / setup hint */
        <div className="th-bg-surface border th-border rounded-2xl p-6 flex flex-col gap-3 items-center text-center">
          <Info size={28} className="th-text-muted opacity-60" />
          <p className="text-sm th-text font-medium">{t("finance.pl.noData")}</p>
          <p className="text-xs th-text-muted max-w-sm">{t("finance.pl.setupHint")}</p>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t("finance.pl.grossIncome"),  value: fmt(totals.gross_income), color: "text-emerald-400", icon: <TrendingUp size={12} className="text-emerald-400" /> },
              { label: t("finance.pl.grossMargin"),  value: fmtPct(totalGrossMargin), color: "text-sky-400",     icon: <Minus size={12} className="text-sky-400" /> },
              { label: t("finance.pl.netProfit"),    value: fmt(totals.net_profit),   color: totals.net_profit >= 0 ? "text-emerald-400" : "text-red-400", icon: totals.net_profit >= 0 ? <TrendingUp size={12} className="text-emerald-400" /> : <TrendingDown size={12} className="text-red-400" /> },
              { label: t("finance.pl.netMargin"),    value: fmtPct(totalNetMargin),   color: netStatus.color,   icon: null },
            ].map((card, i) => (
              <div key={i} className="card px-4 py-3 flex flex-col gap-1">
                <span className="text-[11px] th-text-muted flex items-center gap-1">{card.icon}{card.label}</span>
                <span className={clsx("font-bold text-base", card.color)}>{card.value}</span>
                {i === 3 && <span className={clsx("text-[11px] font-medium", netStatus.color)}>{netStatus.label}</span>}
              </div>
            ))}
          </div>

          {/* Net margin % line + profit bars chart */}
          <div className="card p-4 flex flex-col gap-3">
            <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wide">{t("finance.pl.marginChart")}</h3>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }} barGap={4}>
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
                <Bar yAxisId="amt" dataKey="gross_profit" name={t("finance.pl.grossProfit")} radius={[4,4,0,0]} maxBarSize={28}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.gross_profit >= 0 ? CHART_COLORS.income : CHART_COLORS.expense} fillOpacity={0.88} />
                  ))}
                </Bar>
                <Bar yAxisId="amt" dataKey="opex" name={t("finance.pl.opex")} fill={CHART_COLORS.hpp} fillOpacity={0.75} radius={[4,4,0,0]} maxBarSize={28} />
                <Line yAxisId="pct" type="monotone" dataKey="net_margin" name={t("finance.pl.netMargin")} stroke={CHART_COLORS.net} strokeWidth={2.5} dot={{ r: 3.5, fill: CHART_COLORS.net, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* P&L Statement table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b th-border">
              <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wide">{t("finance.pl.statement")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b th-border th-bg-elevated">
                    <th className="text-left px-4 py-2.5 th-text-muted font-semibold">{t("finance.pl.statement")}</th>
                    {rows.map(r => (
                      <th key={r.month} className="text-right px-3 py-2.5 th-text-muted font-medium whitespace-nowrap">{fmtMonth(r.month)}</th>
                    ))}
                    <th className="text-right px-4 py-2.5 th-text font-bold whitespace-nowrap border-l th-border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Gross Income */}
                  <PLRow label={t("finance.pl.grossIncome")} rows={rows} field="gross_income" total={totals.gross_income} className="text-emerald-400 font-semibold" />

                  {/* COGS */}
                  <PLRow label={`  − ${t("finance.pl.cogs")}`} rows={rows} field="cogs" total={totals.cogs} negate className="th-text-muted" />

                  {/* Gross Profit */}
                  <PLRow label={t("finance.pl.grossProfit")} rows={rows} field="gross_profit" total={totals.gross_profit} highlight
                    suffix={row => row.gross_income > 0 ? ` (${row.gross_margin.toFixed(1)}%)` : ""}
                    totalSuffix={totals.gross_income > 0 ? ` (${totalGrossMargin.toFixed(1)}%)` : ""}
                  />

                  {/* OpEx */}
                  <PLRow label={`  − ${t("finance.pl.opex")}`} rows={rows} field="opex" total={totals.opex} negate className="th-text-muted" />

                  {/* Other income */}
                  {rows.some(r => r.other_income > 0) && (
                    <PLRow label={`  + ${t("finance.pl.otherIncome")}`} rows={rows} field="other_income" total={totals.other_income} className="th-text-muted" />
                  )}

                  {/* Net Profit */}
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

// ── Helper: table row ──────────────────────────────────────────────────────────

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
    return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "th-text-muted";
  }

  return (
    <tr className={clsx("border-b th-border last:border-0", highlight && "th-bg-elevated/50")}>
      <td className={clsx("px-4 py-2 th-text whitespace-nowrap", className)}>{label}</td>
      {rows.map(r => {
        const raw = r[field] as number;
        const display = negate ? -raw : raw;
        return (
          <td key={r.month} className={clsx("text-right px-3 py-2 tabular-nums whitespace-nowrap", className, isProfit && cellColor(raw))}>
            {fmt(display)}{suffix ? <span className="th-text-muted text-[10px]">{suffix(r)}</span> : null}
          </td>
        );
      })}
      <td className={clsx("text-right px-4 py-2 font-bold tabular-nums border-l th-border whitespace-nowrap", highlight ? "th-text" : "th-text-muted", isProfit && cellColor(total))}>
        {fmt(negate ? -total : total)}{totalSuffix ? <span className="font-normal text-[10px] th-text-muted">{totalSuffix}</span> : null}
      </td>
    </tr>
  );
}
