"use client";

import { useState, useEffect, useCallback } from "react";
import { ClipboardCheck } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useT } from "@/lib/i18n";
import { listWarehouses, listStockLevels, createOpname } from "@/lib/inventoryApi";
import { listAccounts, listCategories } from "@/lib/financeApi";
import type { Warehouse, StockLevel, Account, Category } from "@/types";
import { clsx } from "clsx";

interface OpnameRow {
  variant_id: number;
  warehouse_id: number;
  product_name: string;
  variant_name: string;
  unit: string;
  system_qty: number;
  physical_qty: string;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

export function StockOpnamePanel() {
  const t = useT();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [, setStockLevels] = useState<StockLevel[]>([]);
  const [rows, setRows] = useState<OpnameRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayIso());
  const [linkFinance, setLinkFinance] = useState(false);
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [shrinkageCategoryId, setShrinkageCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const [whs, accs, cats] = await Promise.all([
        listWarehouses(), listAccounts(), listCategories("expense"),
      ]);
      setWarehouses(whs);
      setAccounts(accs);
      setCategories(cats);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => {
    if (!selectedWarehouse) { setRows([]); return; }
    listStockLevels(parseInt(selectedWarehouse))
      .then(levels => {
        setStockLevels(levels);
        setRows(levels.map(sl => ({
          variant_id:   sl.variant_id,
          warehouse_id: sl.warehouse_id,
          product_name: sl.product_name,
          variant_name: sl.variant_name,
          unit:         sl.unit,
          system_qty:   sl.qty,
          physical_qty: String(sl.qty),
        })));
      })
      .catch(() => {});
  }, [selectedWarehouse]);

  function updatePhysical(idx: number, val: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, physical_qty: val } : r));
  }

  const diffs = rows.filter(r => {
    const phys = parseFloat(r.physical_qty);
    return !isNaN(phys) && Math.abs(phys - r.system_qty) >= 0.001;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (diffs.length === 0) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await createOpname({
        note: note || undefined,
        date,
        items: diffs.map(r => ({
          variant_id:   r.variant_id,
          warehouse_id: r.warehouse_id,
          physical_qty: parseFloat(r.physical_qty),
        })),
        link_finance:          linkFinance,
        finance_account_id:    financeAccountId ? parseInt(financeAccountId) : undefined,
        shrinkage_category_id: shrinkageCategoryId ? parseInt(shrinkageCategoryId) : undefined,
      });
      setResult({ count: res.count });
      // refresh levels
      if (selectedWarehouse) {
        const levels = await listStockLevels(parseInt(selectedWarehouse));
        setStockLevels(levels);
        setRows(levels.map(sl => ({
          variant_id:   sl.variant_id,
          warehouse_id: sl.warehouse_id,
          product_name: sl.product_name,
          variant_name: sl.variant_name,
          unit:         sl.unit,
          system_qty:   sl.qty,
          physical_qty: String(sl.qty),
        })));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan opname");
    } finally { setSaving(false); }
  }

  function fmt(n: number) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={16} className="th-text-muted" />
        <h2 className="text-sm font-semibold th-text">{t("inventory.opname.title")}</h2>
      </div>
      <p className="text-xs th-text-muted">{t("inventory.opname.desc")}</p>

      {/* Warehouse selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs th-text-muted">{t("inventory.movement.warehouse")}</label>
        <div className="max-w-xs">
          <SearchableSelect
            value={selectedWarehouse}
            onChange={(v) => { setSelectedWarehouse(v); setResult(null); }}
            placeholder={t("inventory.opname.selectWarehouse")}
            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
          />
        </div>
      </div>

      {!selectedWarehouse && (
        <p className="text-sm th-text-muted text-center py-10">{t("inventory.opname.selectWarehouse")}</p>
      )}

      {selectedWarehouse && rows.length === 0 && (
        <p className="text-sm th-text-muted text-center py-10">{t("inventory.product.empty")}</p>
      )}

      {rows.length > 0 && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Success/error banner */}
          {result && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs">
              <ClipboardCheck size={13} />
              {result.count > 0
                ? `${result.count} penyesuaian berhasil disimpan.`
                : t("inventory.opname.noChanges")}
            </div>
          )}
          {error && <p className="text-xs text-red-400 th-bg-elevated px-3 py-2 rounded-xl">{error}</p>}

          {/* Stock table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b th-border th-bg-elevated">
                    <th className="text-left px-3 py-2.5 th-text-muted font-semibold">Produk</th>
                    <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.opname.systemQty")}</th>
                    <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.opname.physicalQty")}</th>
                    <th className="text-right px-3 py-2.5 th-text-muted font-semibold">{t("inventory.opname.diff")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const phys = parseFloat(r.physical_qty);
                    const diff = isNaN(phys) ? null : phys - r.system_qty;
                    const hasDiff = diff !== null && Math.abs(diff) >= 0.001;
                    return (
                      <tr key={`${r.variant_id}-${r.warehouse_id}`}
                        className={clsx("border-b th-border last:border-0", hasDiff && "bg-amber-500/5")}>
                        <td className="px-3 py-2 th-text">
                          <p className="font-medium">{r.product_name}</p>
                          <p className="th-text-muted text-[10px]">{r.variant_name}</p>
                        </td>
                        <td className="px-3 py-2 text-right th-text-muted tabular-nums">
                          {fmt(r.system_qty)} {r.unit}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number" step="any" min="0"
                            value={r.physical_qty}
                            onChange={e => updatePhysical(idx, e.target.value)}
                            className={clsx(
                              "w-24 text-right input-field py-0.5 text-xs tabular-nums",
                              hasDiff && "border-amber-400/50"
                            )}
                          />
                        </td>
                        <td className={clsx("px-3 py-2 text-right tabular-nums font-medium",
                          diff === null ? "th-text-muted" :
                          diff > 0 ? "text-emerald-400" :
                          diff < 0 ? "text-red-400" : "th-text-muted"
                        )}>
                          {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)} ${r.unit}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Opname metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs th-text-muted">{t("inventory.opname.date")}</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs th-text-muted">{t("inventory.opname.note")}</label>
              <input value={note} onChange={e => setNote(e.target.value)} className="input-field" />
            </div>
          </div>

          {/* Finance integration for shrinkage */}
          <div className="th-bg-elevated rounded-xl p-3 flex flex-col gap-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={linkFinance}
                onChange={e => setLinkFinance(e.target.checked)} className="rounded" />
              <div>
                <p className="text-xs th-text font-medium">{t("inventory.opname.linkFinance")}</p>
                <p className="text-[11px] th-text-muted">Kerugian stok hilang/rusak dicatat sebagai Beban Penyusutan (bukan HPP)</p>
              </div>
            </label>
            {linkFinance && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.movement.financeAccount")}</label>
                  <SearchableSelect
                    value={financeAccountId}
                    onChange={setFinanceAccountId}
                    placeholder="— Pilih akun —"
                    options={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.opname.shrinkageCategory")}</label>
                  <SearchableSelect
                    value={shrinkageCategoryId}
                    onChange={setShrinkageCategoryId}
                    clearable
                    placeholder="— Pilih kategori —"
                    options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Diff summary + submit */}
          <div className="flex items-center justify-between">
            <p className="text-xs th-text-muted">
              {diffs.length} item berubah dari {rows.length} total
            </p>
            <button type="submit"
              disabled={saving || diffs.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors">
              <ClipboardCheck size={13} />
              {saving ? t("common.saving") : t("inventory.opname.submit")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
