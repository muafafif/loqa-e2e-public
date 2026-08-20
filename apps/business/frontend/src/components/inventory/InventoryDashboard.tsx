"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Package, DollarSign, RefreshCw, Percent, Download, Tag, Layers, BarChart2, TrendingUp } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useT } from "@/lib/i18n";
import {
  getInventoryDashboard, listWarehouses,
  getBrandReport, getCategoryReport, getProfitPerProduct,
} from "@/lib/inventoryApi";
import { exportInventoryPdf, generateAiInsight, buildInventoryPrompt } from "@/lib/exportPdf";
import { ExportDialog } from "@/components/ui/ExportDialog";
import { useConnection } from "@/lib/ConnectionContext";
import type { InventoryDashboard as DashboardData, Warehouse, BrandReportRow, CategoryReportRow, ProductProfitRow, CostMethod } from "@/types";
import { clsx } from "clsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { CHART_COLORS, TICK_STYLE, GRID_PROPS, TOOLTIP_PROPS } from "@/lib/chartConfig";

type SubTab = "dashboard" | "reports";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}
function fmtShort(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000)     return `${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000)         return `${(abs / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`;
}
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Main export ────────────────────────────────────────────────────────────────
export function InventoryDashboard() {
  const t = useT();
  const [subTab, setSubTab] = useState<SubTab>("dashboard");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab bar */}
      <div className="px-5 pt-4 pb-3 shrink-0">
        <div className="tab-glass inline-flex">
          {(["dashboard", "reports"] as SubTab[]).map(id => (
            <button key={id} onClick={() => setSubTab(id)}
              className={clsx("tab-glass-item btn-brand", subTab === id && "active")}>
              {id === "dashboard" ? t("inventory.dashboard") : t("inventory.reports")}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 overflow-y-auto">
        {subTab === "dashboard" && <DashboardSection />}
        {subTab === "reports"   && <ReportsSection />}
      </div>
    </div>
  );
}

// ── Dashboard sub-tab ──────────────────────────────────────────────────────────
function DashboardSection() {
  const t = useT();
  const [data, setData] = useState<DashboardData | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filterWarehouse, setFilterWarehouse] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, whs] = await Promise.all([
        getInventoryDashboard(filterWarehouse ? parseInt(filterWarehouse) : undefined),
        listWarehouses(),
      ]);
      setData(dash);
      setWarehouses(whs);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filterWarehouse]);

  useEffect(() => { load(); }, [load]);

  const kpis = data ? [
    {
      label: t("inventory.dashboard.assetValue"),
      value: `Rp ${fmtShort(data.total_asset_value)}`,
      full: data.operational_asset_value > 0
        ? `Dagang: ${fmtShort(data.trade_asset_value)} · Ops: ${fmtShort(data.operational_asset_value)}`
        : `Rp ${fmt(data.total_asset_value)}`,
      icon: <DollarSign size={12} />, iconBg: "rgb(14 165 233 / 0.12)", iconBorder: "rgb(14 165 233 / 0.2)", iconColor: "#38bdf8",
      valueCls: "text-sky-400",
    },
    {
      label: t("inventory.dashboard.hppMonth"),
      value: `Rp ${fmtShort(data.hpp_this_month)}`,
      full: `Rp ${fmt(data.hpp_this_month)}`,
      icon: <Package size={12} />, iconBg: "rgb(249 115 22 / 0.12)", iconBorder: "rgb(249 115 22 / 0.2)", iconColor: "#fb923c",
      valueCls: "text-orange-400",
    },
    {
      label: t("inventory.dashboard.turnover"),
      value: `${data.inventory_turnover}×`,
      full: t("inventory.dashboard.turnoverSub"),
      icon: <RefreshCw size={12} />, iconBg: "rgb(16 185 129 / 0.12)", iconBorder: "rgb(16 185 129 / 0.2)", iconColor: "#10b981",
      valueCls: "gradient-text-income",
    },
    {
      label: t("inventory.dashboard.grossMargin"),
      value: `${data.gross_margin_pct}%`,
      full: `Rp ${fmt(data.gross_margin_month)}`,
      icon: <TrendingUp size={12} />,
      iconBg: data.gross_margin_pct >= 0 ? "rgb(var(--accent-600) / 0.12)" : "rgb(244 63 94 / 0.12)",
      iconBorder: data.gross_margin_pct >= 0 ? "rgb(var(--accent-500) / 0.2)" : "rgb(244 63 94 / 0.2)",
      iconColor: data.gross_margin_pct >= 0 ? "rgb(var(--accent-400))" : "#f43f5e",
      valueCls: data.gross_margin_pct >= 0 ? "gradient-text-brand" : "gradient-text-expense",
    },
    {
      label: t("inventory.dashboard.lowStock"),
      value: String(data.low_stock_count),
      full: `${data.low_stock_count} item`,
      icon: <AlertTriangle size={12} />,
      iconBg: data.low_stock_count > 0 ? "rgb(245 158 11 / 0.12)" : "rgb(255 255 255 / 0.04)",
      iconBorder: data.low_stock_count > 0 ? "rgb(245 158 11 / 0.2)" : "rgb(var(--border))",
      iconColor: data.low_stock_count > 0 ? "#fbbf24" : "rgb(var(--tx-muted))",
      valueCls: data.low_stock_count > 0 ? "text-amber-400" : "",
    },
  ] : [];

  return (
    <div className="p-4 max-w-4xl mx-auto flex flex-col gap-5">
      {/* Header + filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-44 ml-auto">
          <SearchableSelect
            value={filterWarehouse}
            onChange={setFilterWarehouse}
            clearable
            placeholder={t("inventory.warehouse.allWarehouses")}
            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
          />
        </div>
      </div>

      {loading ? <Spinner /> : !data ? null : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpis.map((k, i) => (
              <div key={i} className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: k.iconBg, border: `1px solid ${k.iconBorder}`, color: k.iconColor }}>
                    {k.icon}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] truncate" style={{ color: "rgb(var(--tx-muted))" }}>{k.label}</span>
                </div>
                <span className={clsx("text-xl font-bold stat-number", k.valueCls) || "th-text"}>{k.value}</span>
                <span className="text-[10px] truncate" style={{ color: "rgb(var(--tx-muted))" }} title={k.full}>{k.full}</span>
              </div>
            ))}
          </div>

          {/* Monthly HPP bar chart */}
          {data.monthly_hpp.length > 0 && (
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(249 115 22 / 0.12)", border: "1px solid rgb(249 115 22 / 0.2)", color: "#fb923c" }}>
                  <BarChart2 size={11} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                  {t("inventory.dashboard.hppChart")}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.monthly_hpp} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradHpp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.hpp} stopOpacity={1} />
                      <stop offset="100%" stopColor={CHART_COLORS.hpp} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtShort} tick={TICK_STYLE} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    {...TOOLTIP_PROPS}
                    formatter={(v: unknown) => [`Rp ${fmt(Number(v))}`, "HPP"]}
                    labelFormatter={(l: unknown) => fmtMonth(String(l))}
                  />
                  <ReferenceLine y={0} stroke="rgba(148 163 184 / 0.2)" />
                  <Bar dataKey="hpp" name="HPP" fill="url(#gradHpp)" radius={[6,6,0,0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Low stock items */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{ borderColor: "rgb(var(--border))" }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                style={{ background: data.low_stock_count > 0 ? "rgb(245 158 11 / 0.12)" : "rgb(255 255 255 / 0.04)", border: `1px solid ${data.low_stock_count > 0 ? "rgb(245 158 11 / 0.2)" : "rgb(var(--border))"}`, color: data.low_stock_count > 0 ? "#fbbf24" : "rgb(var(--tx-muted))" }}>
                <AlertTriangle size={10} />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                {t("inventory.dashboard.lowStockItems")}
              </span>
            </div>
            {(data.low_stock_items ?? []).length === 0 ? (
              <p className="text-sm th-text-muted text-center py-6">{t("inventory.dashboard.noLowStock")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "rgb(var(--border))", background: "rgb(255 255 255 / 0.02)" }}>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgb(var(--tx-muted))" }}>Produk</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgb(var(--tx-muted))" }}>Gudang</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgb(var(--tx-muted))" }}>Stok</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgb(var(--tx-muted))" }}>Minimum</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgb(var(--tx-muted))" }}>Nilai Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.low_stock_items ?? []).map((item, i) => (
                      <tr key={i} className="border-b th-border last:border-0">
                        <td className="px-4 py-2 th-text">
                          <p className="font-medium">{item.product_name}</p>
                          <p className="th-text-muted text-[10px]">{item.variant_name}</p>
                        </td>
                        <td className="px-4 py-2 th-text-muted">{item.warehouse_name}</td>
                        <td className="px-4 py-2 text-right text-amber-400 font-medium tabular-nums">
                          {item.qty} {item.unit}
                        </td>
                        <td className="px-4 py-2 text-right th-text-muted tabular-nums">
                          {item.min_stock} {item.unit}
                        </td>
                        <td className="px-4 py-2 text-right th-text-muted tabular-nums">
                          Rp {fmt(item.qty * item.avg_cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Reports sub-tab ────────────────────────────────────────────────────────────
function ReportsSection() {
  const t = useT();
  const { status: connStatus } = useConnection();
  const [brands, setBrands] = useState<BrandReportRow[] | null>(null);
  const [categories, setCategories] = useState<CategoryReportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [generatingInsight, setGeneratingInsight] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [br, cat] = await Promise.all([getBrandReport(), getCategoryReport()]);
      setBrands(br);
      setCategories(cat);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleExport(includeInsight: boolean) {
    setExporting(true);
    try {
      const [dash, br, cat] = await Promise.all([
        getInventoryDashboard(),
        getBrandReport(),
        getCategoryReport(),
      ]);

      let aiInsight: string | undefined;
      if (includeInsight) {
        setGeneratingInsight(true);
        const result = await generateAiInsight(buildInventoryPrompt({
          totalAssetValue: dash.total_asset_value,
          hppMonth: dash.hpp_this_month,
          grossMarginMonth: dash.gross_margin_month,
          grossMarginPct: dash.gross_margin_pct,
          turnover: dash.inventory_turnover,
          lowStockCount: dash.low_stock_count,
          topBrands: br.slice(0, 5).map(b => ({ name: b.brand_name || "Tanpa Brand", stockValue: b.stock_value, marginPct: b.margin_pct })),
        }));
        setGeneratingInsight(false);
        if (result) aiInsight = result;
      }

      await exportInventoryPdf({
        appName: "LOQA Work",
        dashboard: dash,
        brands: br,
        categories: cat,
        t,
        aiInsight,
      });
    } catch (err) {
      alert("PDF error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
      setGeneratingInsight(false);
      setExportDialogOpen(false);
    }
  }

  return (
    <div className="p-4 max-w-5xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2 ml-auto">
          {!brands && (
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border th-border th-text text-xs hover:th-bg-elevated transition-colors disabled:opacity-40"
            >
              {loading ? "..." : t("common.all")}
            </button>
          )}
          <button
            onClick={() => setExportDialogOpen(true)}
            disabled={exporting || generatingInsight}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors disabled:opacity-40"
          >
            <Download size={13} />
            {exporting || generatingInsight ? t("common.exportingPdf") : t("common.exportPdf")}
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

      {/* Profit per SKU section — always visible */}
      <ProfitPerSkuSection />

      {/* Brand table */}
      {brands && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Tag size={13} className="th-text-muted" />
            <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider">{t("inventory.report.brands")}</h3>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b th-border th-bg-elevated">
                  <th className="text-left px-3 py-2 th-text-muted font-medium">{t("inventory.report.brandName")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.productCount")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.stockValue")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.hppMonth")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.revenueMonth")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.marginPct")}</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((b, i) => (
                  <tr key={b.brand_id} className={i % 2 === 0 ? "" : "th-bg-elevated/40"}>
                    <td className="px-3 py-2 th-text font-medium">{b.brand_name || t("inventory.report.noBrand")}</td>
                    <td className="px-3 py-2 th-text-muted text-right tabular-nums">{b.product_count}</td>
                    <td className="px-3 py-2 th-text text-right tabular-nums">{fmt(b.stock_value)}</td>
                    <td className="px-3 py-2 th-text-muted text-right tabular-nums">{fmt(b.hpp_month)}</td>
                    <td className="px-3 py-2 th-text-muted text-right tabular-nums">{fmt(b.revenue_month)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={b.margin_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {fmtPct(b.margin_pct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category table */}
      {categories && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Layers size={13} className="th-text-muted" />
            <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider">{t("inventory.report.categories")}</h3>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b th-border th-bg-elevated">
                  <th className="text-left px-3 py-2 th-text-muted font-medium">{t("inventory.report.categoryName")}</th>
                  <th className="text-left px-3 py-2 th-text-muted font-medium">{t("inventory.report.subcategoryName")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.productCount")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.stockValue")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.hppMonth")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.revenueMonth")}</th>
                  <th className="text-right px-3 py-2 th-text-muted font-medium">{t("inventory.report.marginPct")}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr key={`${c.category_id}-${c.subcategory_id ?? "all"}`} className={i % 2 === 0 ? "" : "th-bg-elevated/40"}>
                    <td className="px-3 py-2 th-text font-medium">{c.category_name || t("inventory.report.noCategory")}</td>
                    <td className="px-3 py-2 th-text-muted">{c.subcategory_name ?? "—"}</td>
                    <td className="px-3 py-2 th-text-muted text-right tabular-nums">{c.product_count}</td>
                    <td className="px-3 py-2 th-text text-right tabular-nums">{fmt(c.stock_value)}</td>
                    <td className="px-3 py-2 th-text-muted text-right tabular-nums">{fmt(c.hpp_month)}</td>
                    <td className="px-3 py-2 th-text-muted text-right tabular-nums">{fmt(c.revenue_month)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={c.margin_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {fmtPct(c.margin_pct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!brands && !loading && (
        <p className="text-sm th-text-muted py-8 text-center">
          Klik <strong>Load</strong> untuk memuat laporan, atau langsung <strong>Export PDF</strong>.
        </p>
      )}
    </div>
  );
}

// ── Profit per SKU section ─────────────────────────────────────────────────────
function ProfitPerSkuSection() {
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [rows, setRows] = useState<ProductProfitRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [costMethod, setCostMethod] = useState<CostMethod>("average");

  // Load warehouses once for the filter dropdown
  useEffect(() => {
    listWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProfitPerProduct({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        warehouse_id: warehouseId ? parseInt(warehouseId) : undefined,
      });
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, warehouseId]);

  // Auto-load on first render
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!rows || rows.length === 0) return;
    const cogsKey  = `cogs_${costMethod}` as keyof ProductProfitRow;
    const profKey  = `profit_${costMethod}` as keyof ProductProfitRow;
    const margKey  = `margin_${costMethod}` as keyof ProductProfitRow;
    const headers  = [
      "Product", "Variant", "SKU", t("inventory.report.qtySold"), "Unit",
      t("inventory.report.revenue"), t("inventory.report.cogs"),
      t("inventory.report.profit_"), t("inventory.report.margin"),
      t("inventory.report.stockQty"), t("inventory.report.stockValue"),
    ];
    const csvRows = [
      headers.join(","),
      ...rows.map(r => [
        `"${r.product_name}"`,
        `"${r.variant_name}"`,
        `"${[r.product_sku, r.sku_suffix].filter(Boolean).join("-") || ""}"`,
        r.qty_sold,
        r.unit,
        r.revenue,
        r[cogsKey],
        r[profKey],
        r[margKey],
        r.stock_qty,
        r.stock_value,
      ].join(",")),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-per-sku-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const COST_METHODS: CostMethod[] = ["fifo", "average", "fixed"];
  const costLabel: Record<CostMethod, string> = { fifo: "FIFO", average: "Average", fixed: "Fixed" };

  const cogsKey   = `cogs_${costMethod}`   as keyof ProductProfitRow;
  const profitKey = `profit_${costMethod}` as keyof ProductProfitRow;
  const marginKey = `margin_${costMethod}` as keyof ProductProfitRow;

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <BarChart2 size={13} className="th-text-muted" />
        <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider">
          {t("inventory.report.profitTitle")}
        </h3>
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex flex-wrap items-end gap-3">
        {/* Date From */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] th-text-muted font-semibold uppercase tracking-wide">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="input-field text-xs py-1 w-36"
          />
        </div>
        {/* Date To */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] th-text-muted font-semibold uppercase tracking-wide">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="input-field text-xs py-1 w-36"
          />
        </div>
        {/* Warehouse */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] th-text-muted font-semibold uppercase tracking-wide">
            {t("inventory.warehouse.allWarehouses")}
          </label>
          <SearchableSelect
            value={warehouseId}
            onChange={setWarehouseId}
            clearable
            placeholder={t("inventory.warehouse.allWarehouses")}
            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
          />
        </div>
        {/* Action buttons */}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border th-border th-text text-xs hover:th-bg-elevated transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? t("common.loading") : t("common.refresh")}
          </button>
          <button
            onClick={exportCsv}
            disabled={!rows || rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border th-border th-text text-xs hover:th-bg-elevated transition-colors disabled:opacity-40"
          >
            <Download size={12} />
            {t("inventory.report.exportCsv")}
          </button>
        </div>
      </div>

      {/* Cost method toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] th-text-muted font-semibold uppercase tracking-wide">
          {t("inventory.report.costMethodSelect")}:
        </span>
        <div className="flex gap-1">
          {COST_METHODS.map(m => (
            <button
              key={m}
              onClick={() => setCostMethod(m)}
              className={clsx(
                "px-3 py-1 text-xs rounded-lg font-semibold transition-all",
                costMethod === m
                  ? "bg-brand-600 text-white"
                  : "th-bg-elevated th-text-muted hover:th-text border th-border"
              )}
            >
              {costLabel[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <Spinner />
      ) : !rows ? null : rows.length === 0 ? (
        <p className="text-sm th-text-muted text-center py-8">{t("inventory.report.noSales")}</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b th-border th-bg-elevated">
                  <th className="text-left px-3 py-2.5 th-text-muted font-semibold">
                    {t("inventory.product.name")}
                  </th>
                  <th className="text-left px-3 py-2.5 th-text-muted font-semibold">Variant</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.report.qtySold")}</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.report.revenue")}</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.report.cogs")}</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.report.profit_")}</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.report.margin")}</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.report.stockQty")}</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.report.stockValue")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const cogs   = Number(row[cogsKey]);
                  const profit = Number(row[profitKey]);
                  const margin = Number(row[marginKey]);
                  const sku = [row.product_sku, row.sku_suffix].filter(Boolean).join("-");
                  return (
                    <tr key={row.variant_id} className={clsx("border-b th-border last:border-0", i % 2 !== 0 && "th-bg-elevated/40")}>
                      <td className="px-3 py-2 th-text">
                        <p className="font-medium">{row.product_name}</p>
                        {sku && <p className="th-text-muted text-[10px]">{sku}</p>}
                      </td>
                      <td className="px-3 py-2 th-text-muted">{row.variant_name}</td>
                      <td className="px-3 py-2 text-right th-text tabular-nums">
                        {row.qty_sold} {row.unit}
                      </td>
                      <td className="px-3 py-2 text-right th-text tabular-nums font-medium">
                        {fmt(row.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right th-text-muted tabular-nums">
                        {fmt(cogs)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        <span className={profit > 0 ? "text-emerald-400" : profit < 0 ? "text-red-400" : "th-text-muted"}>
                          {fmt(profit)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={clsx(
                          "font-semibold",
                          margin > 0 ? "text-emerald-400" : margin < 0 ? "text-red-400" : "th-text-muted"
                        )}>
                          {fmtPct(margin)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right th-text-muted tabular-nums">
                        {row.stock_qty} {row.unit}
                      </td>
                      <td className="px-3 py-2 text-right th-text-muted tabular-nums">
                        {fmt(row.stock_value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
