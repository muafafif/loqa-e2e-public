"use client";

import { useState, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { clsx } from "clsx";
import { Plus, Pencil, Trash2, X, ChevronDown, Package, TrendingUp, TrendingDown, SlidersHorizontal } from "lucide-react";
import {
  listItems, createItem, updateItem, deleteItem,
  listCategories, listLocations, createMovement,
} from "@/lib/inventoryApi";
import type { InvItem, InvCategory, InvLocation } from "@/types";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);
}

export function ItemsPanel() {
  const t = useT();
  const [items, setItems] = useState<InvItem[]>([]);
  const [categories, setCategories] = useState<InvCategory[]>([]);
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState<number | "">("");
  const [filterLoc, setFilterLoc] = useState<number | "">("");
  const [filterLow, setFilterLow] = useState(false);

  // Edit form
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<InvItem | null>(null);
  const [form, setForm] = useState({
    name: "", category_id: "" as number | "", location_id: "" as number | "",
    unit: "pcs", qty: "0", min_qty: "0", note: "",
  });

  // Quick stock modal
  const [stockModal, setStockModal] = useState<{ item: InvItem; mode: "in" | "out" | "adj" } | null>(null);
  const [stockQty, setStockQty] = useState("1");
  const [stockNote, setStockNote] = useState("");
  const [stockDate, setStockDate] = useState(new Date().toISOString().slice(0, 10));
  const [stockSaving, setStockSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [its, cats, locs] = await Promise.all([
        listItems({ q: q || undefined, category_id: filterCat || undefined, location_id: filterLoc || undefined, low_stock_only: filterLow }),
        listCategories(),
        listLocations(),
      ]);
      setItems(its);
      setCategories(cats);
      setLocations(locs);
    } catch {} finally { setLoading(false); }
  }, [q, filterCat, filterLoc, filterLow]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditItem(null);
    setForm({ name: "", category_id: "", location_id: "", unit: "pcs", qty: "0", min_qty: "0", note: "" });
    setShowForm(true);
  };

  const openEdit = (item: InvItem) => {
    setEditItem(item);
    setForm({
      name: item.name,
      category_id: item.category_id ?? "",
      location_id: item.location_id ?? "",
      unit: item.unit,
      qty: String(item.qty),
      min_qty: String(item.min_qty),
      note: item.note ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const body = {
      name: form.name.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      location_id: form.location_id ? Number(form.location_id) : null,
      unit: form.unit || "pcs",
      qty: parseFloat(form.qty) || 0,
      min_qty: parseFloat(form.min_qty) || 0,
      note: form.note || null,
    };
    try {
      if (editItem) {
        const { qty: _qty, ...updateBody } = body;
        await updateItem(editItem.id, updateBody);
      } else {
        await createItem(body);
      }
      setShowForm(false);
      load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("inventory.item.deleteConfirm"))) return;
    try { await deleteItem(id); load(); }
    catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  const handleStockSave = async () => {
    if (!stockModal) return;
    const qty = parseFloat(stockQty);
    if (!qty || qty <= 0) return;
    setStockSaving(true);
    try {
      const type = stockModal.mode === "in" ? "in" : stockModal.mode === "out" ? "out" : "adjustment";
      await createMovement({
        item_id: stockModal.item.id,
        location_id: stockModal.item.location_id ?? undefined,
        type,
        qty,
        note: stockNote || null,
        date: stockDate,
      });
      setStockModal(null);
      setStockQty("1");
      setStockNote("");
      load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
    finally { setStockSaving(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 th-bg-surface border-b th-border flex flex-wrap gap-2 shrink-0">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("inventory.item.search")}
          className="flex-1 min-w-0 text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <Select
          value={filterCat}
          onChange={(v) => setFilterCat(v ? Number(v) : "")}
          options={[
            { value: "", label: t("inventory.item.category") },
            ...categories.map((c) => ({ value: c.id.toString(), label: c.name })),
          ]}
        />
        <Select
          value={filterLoc}
          onChange={(v) => setFilterLoc(v ? Number(v) : "")}
          options={[
            { value: "", label: t("inventory.item.location") },
            ...locations.map((l) => ({ value: l.id.toString(), label: l.name })),
          ]}
        />
        <button
          onClick={() => setFilterLow((v) => !v)}
          className={clsx(
            "text-xs px-3 py-2 rounded-lg border transition-colors",
            filterLow ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "th-border th-text-muted hover:th-text"
          )}
        >
          {t("inventory.item.lowStockBadge")}
        </button>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <Plus size={14} />{t("inventory.item.new")}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-2 th-text-muted">
            <Package size={36} className="opacity-30" />
            <p className="text-sm font-medium">{t("inventory.item.empty")}</p>
            <p className="text-xs">{t("inventory.item.emptyHint")}</p>
          </div>
        )}
        {!loading && items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const isLow = item.min_qty > 0 && item.qty <= item.min_qty;
              return (
                <div key={item.id} className={clsx(
                  "th-bg-surface border rounded-xl px-4 py-3 flex items-center gap-3",
                  isLow ? "border-amber-500/30" : "th-border"
                )}>
                  {/* Color dot */}
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.category_color ?? "#6366f1" }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium th-text">{item.name}</span>
                      {isLow && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                          {t("inventory.item.lowStockBadge")}
                        </span>
                      )}
                    </div>
                    <div className="text-xs th-text-muted flex flex-wrap gap-2 mt-0.5">
                      {item.category_name && <span>{item.category_name}</span>}
                      {item.location_name && <span>📍 {item.location_name}</span>}
                      {item.note && <span className="italic">{item.note}</span>}
                    </div>
                  </div>

                  {/* Qty */}
                  <div className="text-right shrink-0">
                    <div className={clsx("text-base font-bold", isLow ? "text-amber-400" : "th-text")}>
                      {fmt(item.qty)}
                    </div>
                    <div className="text-xs th-text-muted">{item.unit}</div>
                  </div>

                  {/* Quick stock actions */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setStockModal({ item, mode: "in" }); setStockQty("1"); setStockNote(""); setStockDate(new Date().toISOString().slice(0, 10)); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg th-bg-elevated hover:text-green-400 th-text-muted transition-colors"
                      title={t("inventory.item.addStock")}
                    >
                      <TrendingUp size={13} />
                    </button>
                    <button
                      onClick={() => { setStockModal({ item, mode: "out" }); setStockQty("1"); setStockNote(""); setStockDate(new Date().toISOString().slice(0, 10)); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg th-bg-elevated hover:text-red-400 th-text-muted transition-colors"
                      title={t("inventory.item.removeStock")}
                    >
                      <TrendingDown size={13} />
                    </button>
                    <button
                      onClick={() => { setStockModal({ item, mode: "adj" }); setStockQty(String(item.qty)); setStockNote(""); setStockDate(new Date().toISOString().slice(0, 10)); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg th-bg-elevated hover:th-text th-text-muted transition-colors"
                      title={t("inventory.item.adjust")}
                    >
                      <SlidersHorizontal size={13} />
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg th-bg-elevated hover:th-text th-text-muted transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg th-bg-elevated hover:text-red-400 th-text-muted transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit/New form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="th-bg-surface border th-border rounded-2xl w-full max-w-md flex flex-col gap-0 overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b th-border">
              <span className="font-semibold th-text text-sm">
                {editItem ? t("inventory.item.edit") : t("inventory.item.new")}
              </span>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              <Field label={t("inventory.item.name")}>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={INPUT}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("inventory.item.category")}>
                  <Select
                    value={form.category_id}
                    onChange={(v) => setForm((f) => ({ ...f, category_id: v ? Number(v) : "" }))}
                    options={[
                      { value: "", label: t("inventory.item.noCategory") },
                      ...categories.map((c) => ({ value: c.id.toString(), label: c.name })),
                    ]}
                  />
                </Field>
                <Field label={t("inventory.item.location")}>
                  <Select
                    value={form.location_id}
                    onChange={(v) => setForm((f) => ({ ...f, location_id: v ? Number(v) : "" }))}
                    options={[
                      { value: "", label: t("inventory.item.noLocation") },
                      ...locations.map((l) => ({ value: l.id.toString(), label: l.name })),
                    ]}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t("inventory.item.unit")}>
                  <input
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
                {!editItem && (
                  <Field label={t("inventory.item.qty")}>
                    <input
                      type="number"
                      value={form.qty}
                      onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                      className={INPUT}
                    />
                  </Field>
                )}
                <Field label={t("inventory.item.minQty")}>
                  <input
                    type="number"
                    value={form.min_qty}
                    onChange={(e) => setForm((f) => ({ ...f, min_qty: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
              </div>
              <Field label={t("inventory.item.note")}>
                <input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className={INPUT}
                />
              </Field>
            </div>
            <div className="flex gap-2 justify-end px-4 py-3 border-t th-border">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg border th-border th-text-muted hover:th-text transition-colors">
                {t("common.cancel")}
              </button>
              <button onClick={handleSave} className="text-sm px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick stock modal */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="th-bg-surface border th-border rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b th-border">
              <div>
                <div className="font-semibold th-text text-sm">
                  {stockModal.mode === "in" ? t("inventory.item.addStock")
                    : stockModal.mode === "out" ? t("inventory.item.removeStock")
                    : t("inventory.item.adjust")}
                </div>
                <div className="text-xs th-text-muted">{stockModal.item.name}</div>
              </div>
              <button onClick={() => setStockModal(null)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {stockModal.mode === "adj" && (
                <p className="text-xs th-text-muted">{t("inventory.movement.adjustHint")}</p>
              )}
              <Field label={t("inventory.movement.qty")}>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label={t("inventory.movement.date")}>
                <input
                  type="date"
                  value={stockDate}
                  onChange={(e) => setStockDate(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label={t("inventory.movement.note")}>
                <input
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  className={INPUT}
                />
              </Field>
            </div>
            <div className="flex gap-2 justify-end px-4 py-3 border-t th-border">
              <button onClick={() => setStockModal(null)} className="text-sm px-4 py-2 rounded-lg border th-border th-text-muted hover:th-text transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleStockSave}
                disabled={stockSaving}
                className="text-sm px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const INPUT = "w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs th-text-muted">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: number | string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 th-text-muted pointer-events-none" />
    </div>
  );
}
