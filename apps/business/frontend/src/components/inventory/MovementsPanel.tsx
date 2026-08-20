"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Settings2, Pencil, Trash2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useT } from "@/lib/i18n";
import {
  listMovements, createMovement, patchMovementFinance, deleteMovement,
  listProducts, listWarehouses,
} from "@/lib/inventoryApi";
import { listAccounts, listCategories } from "@/lib/financeApi";
import type { StockMovement, Product, Warehouse, MovementType } from "@/types";
import type { Account, Category } from "@/types";
import { clsx } from "clsx";

const MOVEMENT_TYPES: MovementType[] = ["in", "out", "adjustment"];

function MovementBadge({ type }: { type: MovementType }) {
  const t = useT();
  const map: Record<MovementType, { label: string; cls: string; icon: React.ReactNode }> = {
    in:         { label: t("inventory.movement.typeIn"),         cls: "bg-emerald-500/15 text-emerald-400", icon: <ArrowDownCircle size={10} /> },
    out:        { label: t("inventory.movement.typeOut"),        cls: "bg-red-500/15 text-red-400",         icon: <ArrowUpCircle size={10} /> },
    opname:     { label: t("inventory.movement.typeOpname"),     cls: "bg-sky-500/15 text-sky-400",         icon: <CheckCircle2 size={10} /> },
    adjustment: { label: t("inventory.movement.typeAdjustment"), cls: "bg-amber-500/15 text-amber-400",     icon: <Settings2 size={10} /> },
  };
  const { label, cls, icon } = map[type] ?? map.adjustment;
  return (
    <span className={clsx("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium", cls)}>
      {icon}{label}
    </span>
  );
}

function FinanceBadge({ linked }: { linked: number }) {
  const t = useT();
  return linked
    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">{t("inventory.movement.linkedBadge")}</span>
    : <span className="text-[10px] px-1.5 py-0.5 rounded-full th-bg-elevated th-text-muted font-medium">{t("inventory.movement.unlinkedBadge")}</span>;
}

interface FormState {
  variant_id: string;
  warehouse_id: string;
  type: MovementType;
  qty: string;
  unit_cost: string;
  selling_price: string;
  note: string;
  date: string;
  link_finance: boolean;
  finance_account_id: string;
  finance_category_id: string;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

const EMPTY_FORM: FormState = {
  variant_id: "", warehouse_id: "", type: "in", qty: "",
  unit_cost: "", selling_price: "", note: "", date: todayIso(),
  link_finance: false, finance_account_id: "", finance_category_id: "",
};

export function MovementsPanel() {
  const t = useT();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE = 30;

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [filterType, setFilterType] = useState<MovementType | "">("");
  const [filterWarehouse, setFilterWarehouse] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Finance edit modal
  const [editFinanceMovement, setEditFinanceMovement] = useState<StockMovement | null>(null);
  const [financeForm, setFinanceForm] = useState({ link_finance: false, finance_account_id: "", finance_category_id: "" });
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [financeSaving, setFinanceSaving] = useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const [prodsResult, whs, accs, cats] = await Promise.all([
        listProducts({ limit: 200 }), listWarehouses(), listAccounts(), listCategories(),
      ]);
      setProducts(prodsResult.products);
      setWarehouses(whs);
      setAccounts(accs);
      setCategories(cats);
    } catch { /* ignore */ }
  }, []);

  const loadMovements = useCallback(async () => {
    try {
      const res = await listMovements({
        type: filterType || undefined,
        warehouse_id: filterWarehouse ? parseInt(filterWarehouse) : undefined,
        limit: PAGE,
        offset: page * PAGE,
      });
      setMovements(res.movements);
      setTotal(res.total);
    } catch { /* ignore */ }
  }, [filterType, filterWarehouse, page]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadMovements(); }, [loadMovements]);

  // flat variant list for select
  const allVariants = products.flatMap(p =>
    p.variants.map(v => ({
      id: v.id,
      label: `${p.name}${v.name !== p.name ? ` — ${v.name}` : ""}`,
      unit: p.unit,
      selling_price: v.selling_price,
      default_unit_cost: v.default_unit_cost,
      is_for_sale: !!p.is_for_sale,
    }))
  );

  const selectedVariant = allVariants.find(v => String(v.id) === form.variant_id);
  const needsUnitCost = form.type === "in" || form.type === "adjustment";
  const needsSellingPrice = form.type === "out" && (selectedVariant?.is_for_sale ?? true);

  function handleVariantChange(variantId: string) {
    const v = allVariants.find(av => String(av.id) === variantId);
    setForm(f => ({
      ...f,
      variant_id: variantId,
      unit_cost: v?.default_unit_cost != null ? String(v.default_unit_cost) : f.unit_cost,
      selling_price: v?.selling_price != null ? String(v.selling_price) : "",
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createMovement({
        variant_id:          parseInt(form.variant_id),
        warehouse_id:        parseInt(form.warehouse_id),
        type:                form.type,
        qty:                 parseFloat(form.qty),
        unit_cost:           form.unit_cost ? parseFloat(form.unit_cost) : undefined,
        selling_price:       needsSellingPrice && form.selling_price ? parseFloat(form.selling_price) : undefined,
        note:                form.note || undefined,
        date:                form.date,
        link_finance:        form.link_finance,
        finance_account_id:  form.finance_account_id ? parseInt(form.finance_account_id) : undefined,
        finance_category_id: form.finance_category_id ? parseInt(form.finance_category_id) : undefined,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setPage(0);
      await loadMovements();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await deleteMovement(deleteId);
      setDeleteId(null);
      setPage(0);
      await loadMovements();
    } catch { /* ignore */ } finally {
      setDeleting(false);
    }
  }

  function openFinanceEdit(m: StockMovement) {
    setEditFinanceMovement(m);
    setFinanceForm({
      link_finance: !!m.finance_linked,
      finance_account_id: "",
      finance_category_id: "",
    });
    setFinanceError(null);
  }

  async function handleFinanceSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editFinanceMovement) return;
    setFinanceSaving(true);
    setFinanceError(null);
    try {
      const updated = await patchMovementFinance(editFinanceMovement.id, {
        link_finance: financeForm.link_finance,
        finance_account_id: financeForm.finance_account_id ? parseInt(financeForm.finance_account_id) : null,
        finance_category_id: financeForm.finance_category_id ? parseInt(financeForm.finance_category_id) : null,
      });
      setMovements((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m));
      setEditFinanceMovement(null);
    } catch (err: unknown) {
      setFinanceError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setFinanceSaving(false);
    }
  }

  function fmt(n: number | null | undefined) {
    if (n == null) return "—";
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
  }

  const totalPages = Math.ceil(total / PAGE);

  return (
    <div className="p-4 max-w-4xl mx-auto flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold th-text">{t("inventory.movements")}</h2>
        <button onClick={() => { setForm({ ...EMPTY_FORM, date: todayIso() }); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors">
          <Plus size={13} />
          {t("inventory.movement.new")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="w-36">
          <SearchableSelect
            value={filterType}
            onChange={v => { setFilterType(v as MovementType | ""); setPage(0); }}
            options={[
              { value: "", label: t("common.all") || "Semua Jenis" },
              ...MOVEMENT_TYPES.map(tp => ({
                value: tp,
                label: t(`inventory.movement.type${tp.charAt(0).toUpperCase() + tp.slice(1)}` as never),
              })),
            ]}
          />
        </div>
        <div className="w-44">
          <SearchableSelect
            value={filterWarehouse}
            onChange={(v) => { setFilterWarehouse(v); setPage(0); }}
            clearable
            placeholder={t("inventory.warehouse.allWarehouses")}
            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
          />
        </div>
      </div>

      {/* Table */}
      {movements.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("inventory.movement.empty")}</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b th-border th-bg-elevated">
                  <th className="text-left px-3 py-2.5 th-text-muted font-semibold">Tanggal</th>
                  <th className="text-left px-3 py-2.5 th-text-muted font-semibold">Produk</th>
                  <th className="text-left px-3 py-2.5 th-text-muted font-semibold">Gudang</th>
                  <th className="text-left px-3 py-2.5 th-text-muted font-semibold">Jenis</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">Qty</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">HPP Aktif</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold hidden lg:table-cell">FIFO</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold hidden lg:table-cell">Avg</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold hidden lg:table-cell">Fixed</th>
                  <th className="text-right px-3 py-2.5 th-text-muted font-semibold">Harga Jual</th>
                  <th className="text-left px-3 py-2.5 th-text-muted font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id} className="border-b th-border last:border-0 hover:th-bg-elevated/40 transition-colors">
                    <td className="px-3 py-2 th-text-muted whitespace-nowrap">{m.date}</td>
                    <td className="px-3 py-2 th-text">
                      <p className="font-medium">{m.product_name}</p>
                      <p className="th-text-muted text-[10px]">{m.variant_name}{m.sku_suffix ? ` (${m.sku_suffix})` : ""}</p>
                    </td>
                    <td className="px-3 py-2 th-text-muted whitespace-nowrap">{m.warehouse_name}</td>
                    <td className="px-3 py-2"><MovementBadge type={m.type} /></td>
                    <td className="px-3 py-2 text-right th-text tabular-nums">
                      <span className={m.type === "out" || (m.type === "opname" && m.qty < 0) ? "text-red-400" : "text-emerald-400"}>
                        {m.qty > 0 && m.type !== "out" ? "+" : ""}{m.qty} {m.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.type === "out" ? (
                        <div>
                          <span className="th-text">{fmt(m.total_cost)}</span>
                          {m.cost_method && (
                            <span className="block text-[10px] th-text-muted uppercase font-mono">{m.cost_method}</span>
                          )}
                        </div>
                      ) : (
                        <span className="th-text-muted">{fmt(m.total_cost)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right th-text-muted tabular-nums hidden lg:table-cell">
                      {m.type === "out" ? fmt(m.cost_fifo ?? 0) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right th-text-muted tabular-nums hidden lg:table-cell">
                      {m.type === "out" ? fmt(m.cost_average ?? 0) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right th-text-muted tabular-nums hidden lg:table-cell">
                      {m.type === "out" ? fmt(m.cost_fixed ?? 0) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.type === "out" && m.selling_price != null
                        ? <span className="text-emerald-400">{fmt(m.selling_price * m.qty)}</span>
                        : <span className="th-text-muted">—</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <FinanceBadge linked={m.finance_linked} />
                        <button
                          onClick={() => openFinanceEdit(m)}
                          className="p-0.5 th-text-muted hover:th-text transition-colors"
                          title={t("inventory.movement.editFinance")}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => setDeleteId(m.id)}
                          className="p-0.5 th-text-muted hover:text-red-400 transition-colors"
                          title={t("common.delete")}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t th-border">
              <span className="text-xs th-text-muted">{total} total</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  className="px-2 py-1 text-xs rounded th-bg-elevated th-text disabled:opacity-40 transition-colors hover:th-bg-elevated">
                  ‹
                </button>
                <span className="px-2 py-1 text-xs th-text-muted">{page + 1}/{totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                  className="px-2 py-1 text-xs rounded th-bg-elevated th-text disabled:opacity-40 transition-colors hover:th-bg-elevated">
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-xs mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold th-text">{t("inventory.movement.deleteTitle")}</h3>
              <p className="text-xs th-text-muted">{t("inventory.movement.deleteDesc")}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl border th-border th-text text-sm transition-colors hover:th-bg-elevated disabled:opacity-40"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm transition-colors"
              >
                {deleting ? t("common.loading") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finance edit modal */}
      {editFinanceMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold th-text">{t("inventory.movement.editFinance")}</h3>
                <p className="text-[11px] th-text-muted mt-0.5">
                  {editFinanceMovement.product_name} · {editFinanceMovement.variant_name} · {editFinanceMovement.date}
                </p>
              </div>
              <button onClick={() => setEditFinanceMovement(null)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>

            {financeError && (
              <p className="text-xs text-red-400 th-bg-elevated px-3 py-2 rounded-lg">{financeError}</p>
            )}

            <form onSubmit={handleFinanceSave} className="flex flex-col gap-3">
              <div className="th-bg-elevated rounded-xl p-3 flex flex-col gap-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={financeForm.link_finance}
                    onChange={(e) => setFinanceForm((f) => ({ ...f, link_finance: e.target.checked }))}
                    className="rounded"
                  />
                  <div>
                    <p className="text-xs th-text font-medium">{t("inventory.movement.linkFinance")}</p>
                    {editFinanceMovement.finance_linked
                      ? <p className="text-[11px] text-emerald-400">{t("inventory.movement.currentlyLinked")}</p>
                      : <p className="text-[11px] th-text-muted">{t("inventory.movement.currentlyUnlinked")}</p>
                    }
                  </div>
                </label>

                {financeForm.link_finance && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs th-text-muted">{t("inventory.movement.financeAccount")} *</label>
                      <SearchableSelect
                        value={financeForm.finance_account_id}
                        onChange={(v) => setFinanceForm((f) => ({ ...f, finance_account_id: v }))}
                        placeholder={`— ${t("inventory.movement.selectAccount")} —`}
                        options={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs th-text-muted">{t("inventory.movement.financeCategory")}</label>
                      <SearchableSelect
                        value={financeForm.finance_category_id}
                        onChange={(v) => setFinanceForm((f) => ({ ...f, finance_category_id: v }))}
                        clearable
                        placeholder={`— ${t("common.all")} —`}
                        options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                      />
                    </div>
                    <p className="text-[11px] th-text-muted">{t("inventory.movement.editFinanceNote")}</p>
                  </>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditFinanceMovement(null)}
                  className="flex-1 py-2 rounded-xl border th-border th-text text-sm transition-colors hover:th-bg-elevated"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={financeSaving}
                  className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors"
                >
                  {financeSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold th-text">{t("inventory.movement.new")}</h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors"><X size={16} /></button>
            </div>

            {error && <p className="text-xs text-red-400 th-bg-elevated px-3 py-2 rounded-lg">{error}</p>}

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {/* Type */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.movement.type")}</label>
                <div className="flex gap-1.5">
                  {MOVEMENT_TYPES.map(tp => (
                    <button key={tp} type="button"
                      onClick={() => setForm(f => ({ ...f, type: tp }))}
                      className={clsx("flex-1 py-1.5 rounded-lg text-xs transition-colors",
                        form.type === tp ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text")}>
                      {t(`inventory.movement.type${tp.charAt(0).toUpperCase() + tp.slice(1)}` as never)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product / Variant */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.movement.product")}</label>
                <SearchableSelect
                  value={form.variant_id}
                  onChange={(v) => handleVariantChange(v)}
                  placeholder="— Pilih produk —"
                  options={allVariants.map((v) => ({ value: String(v.id), label: v.label }))}
                />
              </div>

              {/* Warehouse */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.movement.warehouse")}</label>
                <SearchableSelect
                  value={form.warehouse_id}
                  onChange={(v) => setForm((f) => ({ ...f, warehouse_id: v }))}
                  placeholder="— Pilih gudang —"
                  options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
                />
              </div>

              {/* Qty + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.movement.qty")}</label>
                  <input required type="number" min="0.001" step="any" value={form.qty}
                    onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} className="input-field" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.movement.date")}</label>
                  <input required type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="input-field" />
                </div>
              </div>

              {/* Unit cost (for IN / adjustment) */}
              {needsUnitCost && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.movement.unitCost")}</label>
                  <input required={form.type === "in"} type="number" min="0" step="any" value={form.unit_cost}
                    onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} className="input-field" />
                </div>
              )}

              {/* Selling price (for OUT) */}
              {needsSellingPrice && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.movement.sellingPrice")}</label>
                  <input type="number" min="0" step="any" value={form.selling_price}
                    onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))}
                    className="input-field" placeholder={t("inventory.movement.sellingPricePlaceholder")} />
                </div>
              )}

              {/* Note */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.movement.note")}</label>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="input-field" />
              </div>

              {/* Finance integration */}
              <div className="th-bg-elevated rounded-xl p-3 flex flex-col gap-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.link_finance}
                    onChange={e => setForm(f => ({ ...f, link_finance: e.target.checked }))} className="rounded" />
                  <div>
                    <p className="text-xs th-text font-medium">{t("inventory.movement.linkFinance")}</p>
                    <p className="text-[11px] th-text-muted">{t("inventory.movement.linkFinanceDesc")}</p>
                  </div>
                </label>
                {form.link_finance && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs th-text-muted">{t("inventory.movement.financeAccount")}</label>
                      <SearchableSelect
                        value={form.finance_account_id}
                        onChange={(v) => setForm((f) => ({ ...f, finance_account_id: v }))}
                        placeholder="— Pilih akun —"
                        options={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs th-text-muted">{t("inventory.movement.financeCategory")}</label>
                      <SearchableSelect
                        value={form.finance_category_id}
                        onChange={(v) => setForm((f) => ({ ...f, finance_category_id: v }))}
                        clearable
                        placeholder="— Opsional —"
                        options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl border th-border th-text text-sm transition-colors hover:th-bg-elevated">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors">
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
