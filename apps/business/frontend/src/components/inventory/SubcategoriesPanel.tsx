"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, FolderOpen, Upload } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { CsvImportModal } from "./CsvImportModal";
import { useT } from "@/lib/i18n";
import {
  listCategories,
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from "@/lib/inventoryApi";
import type { InvCategory as Category, Subcategory } from "@/types";

interface FormState {
  category_id: string;
  name: string;
  description: string;
}

const EMPTY: FormState = { category_id: "", name: "", description: "" };

export function SubcategoriesPanel() {
  const t = useT();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<Subcategory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    try { setCategories(await listCategories()); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    try { setSubcategories(await listSubcategories(filterCategoryId)); } catch { /* ignore */ }
  }, [filterCategoryId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY, category_id: filterCategoryId ? String(filterCategoryId) : "" });
    setShowForm(true);
  }

  function openEdit(s: Subcategory) {
    setEditTarget(s);
    setForm({
      category_id: String(s.category_id),
      name: s.name,
      description: s.description ?? "",
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category_id) return;
    setSaving(true);
    try {
      const payload = {
        category_id: Number(form.category_id),
        name: form.name,
        description: form.description || undefined,
      };
      if (editTarget) await updateSubcategory(editTarget.id, payload);
      else await createSubcategory(payload);
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(s: Subcategory) {
    if (!confirm(t("inventory.subcategory.deleteConfirm"))) return;
    await deleteSubcategory(s.id);
    await load();
  }

  // Group subcategories by category
  const grouped: { category: Category; items: Subcategory[] }[] = [];
  if (filterCategoryId) {
    const cat = categories.find((c) => c.id === filterCategoryId);
    if (cat) grouped.push({ category: cat, items: subcategories });
  } else {
    for (const cat of categories) {
      const items = subcategories.filter((s) => s.category_id === cat.id);
      if (items.length > 0) grouped.push({ category: cat, items });
    }
    // uncategorized shouldn't happen (FK required) but guard anyway
    const orphans = subcategories.filter((s) => !categories.find((c) => c.id === s.category_id));
    if (orphans.length > 0) {
      grouped.push({ category: { id: 0, name: "—", description: null, subcategory_count: 0, created_at: 0, updated_at: 0 }, items: orphans });
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex-1 max-w-xs">
          <SearchableSelect
            value={filterCategoryId?.toString() ?? ""}
            onChange={(v) => setFilterCategoryId(v ? Number(v) : undefined)}
            clearable
            placeholder={t("inventory.subcategory.allCategories")}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
          />
        </div>
        <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg th-bg-elevated th-text-muted hover:th-text border th-border text-xs transition-colors shrink-0">
          <Upload size={13} />{t("common.importCsv")}
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors shrink-0"
        >
          <Plus size={13} />
          {t("inventory.subcategory.new")}
        </button>
      </div>

      {subcategories.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("inventory.subcategory.empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(({ category, items }) => (
            <div key={category.id}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <p className="text-xs font-semibold th-text-muted uppercase tracking-wider">{category.name}</p>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((s) => (
                  <div key={s.id} className="card p-3 flex items-start gap-3 ml-4">
                    <div className="p-1.5 rounded-lg th-bg-elevated shrink-0">
                      <FolderOpen size={14} className="th-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium th-text">{s.name}</p>
                      {s.description && (
                        <p className="text-xs th-text-muted mt-0.5">{s.description}</p>
                      )}
                      <p className="text-xs th-text-muted mt-0.5">
                        {t("inventory.subcategory.productCount")}: {s.product_count}
                      </p>
                    </div>
                    <button onClick={() => openEdit(s)} className="p-1 th-text-muted hover:th-text transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => handleDelete(s)} className="p-1 th-text-muted hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold th-text">
                {editTarget ? t("inventory.subcategory.edit") : t("inventory.subcategory.new")}
              </h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.subcategory.category")}</label>
                <SearchableSelect
                  value={form.category_id}
                  onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                  placeholder="— pilih kategori —"
                  options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.subcategory.name")}</label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.subcategory.description")}</label>
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
        <CsvImportModal importType="subcategories" onClose={() => setShowImport(false)} onSuccess={() => { setShowImport(false); load(); }} />
      )}
    </div>
  );
}
