"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Tag } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listCategories, createCategory, updateCategory, deleteCategory } from "@/lib/financeApi";
import type { Category, TransactionType, PLType } from "@/types";
import { clsx } from "clsx";

const TX_TYPES: TransactionType[] = ["income", "expense", "transfer"];

interface FormState {
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  pl_type: PLType;
}

const EMPTY_FORM: FormState = { name: "", type: "expense", color: "#6b7280", icon: "tag", pl_type: null };

export function CategoriesPanel() {
  const t = useT();
  const [categories, setCategories] = useState<Category[]>([]);
  const [typeFilter, setTypeFilter] = useState<TransactionType | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listCategories(typeFilter);
      setCategories(data);
    } catch { /* ignore */ }
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  function txTypeLabel(type: TransactionType) {
    const map: Record<TransactionType, string> = {
      income: t("finance.tx.income"),
      expense: t("finance.tx.expense"),
      transfer: t("finance.tx.transfer"),
    };
    return map[type];
  }

  function plTypeBadgeColor(pl: PLType): string {
    if (pl === "gross_income") return "bg-emerald-500/20 text-emerald-400";
    if (pl === "cogs") return "bg-orange-500/20 text-orange-400";
    return "";
  }

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditTarget(cat);
    setForm({ name: cat.name, type: cat.type, color: cat.color, icon: cat.icon, pl_type: cat.pl_type ?? null });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, pl_type: form.pl_type ?? null };
      if (editTarget) {
        await updateCategory(editTarget.id, payload);
      } else {
        await createCategory(payload);
      }
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat: Category) {
    if (!confirm(t("finance.category.deleteConfirm"))) return;
    await deleteCategory(cat.id);
    await load();
  }

  const showPlType = form.type === "income" || form.type === "expense";

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold th-text">{t("finance.categories")}</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors"
        >
          <Plus size={13} />
          {t("finance.category.new")}
        </button>
      </div>

      {/* Type filter */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setTypeFilter(undefined)}
          className={clsx("px-3 py-1 rounded-lg text-xs transition-colors", !typeFilter ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text")}
        >
          All
        </button>
        {TX_TYPES.map((tp) => (
          <button
            key={tp}
            onClick={() => setTypeFilter(tp)}
            className={clsx("px-3 py-1 rounded-lg text-xs transition-colors", typeFilter === tp ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text")}
          >
            {txTypeLabel(tp)}
          </button>
        ))}
      </div>

      {categories.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("finance.category.empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {categories.map((cat) => (
            <div key={cat.id} className="card p-3 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm th-text truncate">{cat.name}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="text-[11px] th-text-muted">{txTypeLabel(cat.type)}</span>
                  {cat.pl_type && (
                    <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full font-medium", plTypeBadgeColor(cat.pl_type))}>
                      {cat.pl_type === "cogs" ? "HPP" : "Pend. Kotor"}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => openEdit(cat)} className="p-1 th-text-muted hover:th-text transition-colors">
                <Pencil size={12} />
              </button>
              <button onClick={() => handleDelete(cat)} className="p-1 th-text-muted hover:text-red-400 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold th-text">
                {editTarget ? t("finance.category.edit") : t("finance.category.new")}
              </h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("finance.category.name")}</label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("finance.category.type")}</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TransactionType, pl_type: null }))}
                  className="input-field"
                >
                  {TX_TYPES.map((tp) => (
                    <option key={tp} value={tp}>{txTypeLabel(tp)}</option>
                  ))}
                </select>
              </div>

              {/* P&L classification — only for income/expense */}
              {showPlType && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted flex items-center gap-1">
                    <Tag size={11} />
                    {t("finance.category.plType")}
                  </label>
                  <select
                    value={form.pl_type ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, pl_type: (e.target.value || null) as PLType }))}
                    className="input-field"
                  >
                    <option value="">{t("finance.category.plTypeNone")}</option>
                    {form.type === "income" && (
                      <option value="gross_income">{t("finance.category.plTypeGrossIncome")}</option>
                    )}
                    {form.type === "expense" && (
                      <option value="cogs">{t("finance.category.plTypeCogs")}</option>
                    )}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("finance.category.color")}</label>
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-9 w-full rounded-lg border th-border cursor-pointer th-bg-elevated"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("finance.category.icon")}</label>
                  <input
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                    className="input-field"
                    placeholder="tag"
                  />
                </div>
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
