"use client";

import { useState, useCallback } from "react";
import { Download, Tag, Layers } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  getInventoryDashboard,
  getBrandReport,
  getCategoryReport,
} from "@/lib/inventoryApi";
import { exportInventoryPdf, generateAiInsight, buildInventoryPrompt } from "@/lib/exportPdf";
import { ExportDialog } from "@/components/ui/ExportDialog";
import { useConnection } from "@/lib/ConnectionContext";
import type { BrandReportRow, CategoryReportRow } from "@/types";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export function InventoryReportsPanel() {
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
    <div className="p-4 max-w-4xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold th-text">{t("inventory.reports")}</h2>
        <div className="flex gap-2">
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
