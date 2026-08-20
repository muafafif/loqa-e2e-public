"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Layers, Upload } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listCategories, createCategory, updateCategory, deleteCategory } from "@/lib/inventoryApi";
import type { InvCategory as Category } from "@/types";
import { CsvImportModal } from "./CsvImportModal";

interface FormState {
  name: string;
  description: string;
}

const EMPTY: FormState = { name: "", description: "" };

export function CategoriesPanel() {
  const t = useT();
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setCategories(await listCategories()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditTarget(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(c: Category) {
    setEditTarget(c);
    setForm({ name: c.name, description: c.description ?? "" });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description || undefined };
      if (editTarget) await updateCategory(editTarget.id, payload);
      else await createCategory(payload);
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(c: Category) {
    if (!confirm(t("inventory.category.deleteConfirm2"))) return;
    await deleteCategory(c.id);
    await load();
  }

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold th-text">{t("inventory.masterData.tabs.categories")}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg th-bg-elevated th-text-muted hover:th-text border th-border text-xs transition-colors">
            <Upload size={13} />{t("common.importCsv")}
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors">
            <Plus size={13} />{t("inventory.category.new")}
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("inventory.category.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <div key={c.id} className="card p-3 flex items-start gap-3">
              <div className="p-1.5 rounded-lg th-bg-elevated shrink-0">
                <Layers size={14} className="th-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium th-text">{c.name}</p>
                {c.description && (
                  <p className="text-xs th-text-muted mt-0.5">{c.description}</p>
                )}
                <p className="text-xs th-text-muted mt-0.5">
                  {t("inventory.category.subcategoryCount")}: {c.subcategory_count}
                </p>
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
                {editTarget ? t("inventory.category.edit") : t("inventory.category.new")}
              </h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.category.name")}</label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.category.description")}</label>
                <textarea
                  value={form.description}
                  rows={2}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="input-field resize-none"
                />
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
        <CsvImportModal importType="categories" onClose={() => setShowImport(false)} onSuccess={() => { setShowImport(false); load(); }} />
      )}
    </div>
  );
}
