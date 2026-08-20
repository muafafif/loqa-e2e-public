"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Grid3X3, Upload } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  listProductCategories,
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
} from "@/lib/inventoryApi";
import type { ProductCategory } from "@/types";
import { CsvImportModal } from "./CsvImportModal";

interface FormState {
  name: string;
  color: string;
}

const EMPTY: FormState = { name: "", color: "#6b7280" };

const PRESET_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#6b7280",
];

export function ProductCategoriesPanel() {
  const t = useT();
  const [items, setItems] = useState<ProductCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try { setItems(await listProductCategories()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditTarget(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(c: ProductCategory) {
    setEditTarget(c);
    setForm({ name: c.name, color: c.color });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, color: form.color };
      if (editTarget) await updateProductCategory(editTarget.id, payload);
      else await createProductCategory(payload);
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(c: ProductCategory) {
    if (!confirm(t("inventory.productCategory.deleteConfirm"))) return;
    await deleteProductCategory(c.id);
    await load();
  }

  const filtered = search
    ? items.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("inventory.productCategory.search")}
          className="input-field text-sm flex-1 max-w-xs"
        />
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg th-bg-elevated th-text-muted hover:th-text border th-border text-xs transition-colors shrink-0"
        >
          <Upload size={13} />
          {t("common.importCsv")}
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors shrink-0"
        >
          <Plus size={13} />
          {t("inventory.productCategory.new")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("inventory.productCategory.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <div key={c.id} className="card p-3 flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-lg shrink-0"
                style={{ backgroundColor: c.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium th-text">{c.name}</p>
              </div>
              <button onClick={() => openEdit(c)} className="p-1 th-text-muted hover:th-text transition-colors">
                <Pencil size={12} />
              </button>
              <button onClick={() => handleDelete(c)} className="p-1 th-text-muted hover:text-red-400 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold th-text">
                {editTarget ? t("inventory.productCategory.edit") : t("inventory.productCategory.new")}
              </h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.productCategory.name")}</label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs th-text-muted">{t("inventory.productCategory.color")}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color }))}
                      className="w-6 h-6 rounded-full transition-transform hover:scale-110 ring-offset-1"
                      style={{
                        backgroundColor: color,
                        outline: form.color === color ? `2px solid ${color}` : "none",
                        outlineOffset: "2px",
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    title="Custom color"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-xl border th-border th-text text-sm transition-colors hover:th-bg-elevated"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImport && (
        <CsvImportModal
          importType="product_categories"
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load(); }}
        />
      )}
    </div>
  );
}
