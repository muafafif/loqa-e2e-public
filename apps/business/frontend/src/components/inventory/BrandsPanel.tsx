"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Tag, Upload } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listBrands, createBrand, updateBrand, deleteBrand } from "@/lib/inventoryApi";
import type { Brand } from "@/types";
import { CsvImportModal } from "./CsvImportModal";

interface FormState {
  name: string;
  description: string;
}

const EMPTY: FormState = { name: "", description: "" };

export function BrandsPanel() {
  const t = useT();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<Brand | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try { setBrands(await listBrands()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditTarget(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(b: Brand) {
    setEditTarget(b);
    setForm({ name: b.name, description: b.description ?? "" });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description || undefined };
      if (editTarget) await updateBrand(editTarget.id, payload);
      else await createBrand(payload);
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(b: Brand) {
    if (!confirm(t("inventory.brand.deleteConfirm"))) return;
    await deleteBrand(b.id);
    await load();
  }

  const filtered = search
    ? brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : brands;

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari brand..."
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
          {t("inventory.brand.new")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("inventory.brand.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((b) => (
            <div key={b.id} className="card p-3 flex items-start gap-3">
              <div className="p-1.5 rounded-lg th-bg-elevated shrink-0">
                <Tag size={14} className="th-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium th-text">{b.name}</p>
                {b.description && (
                  <p className="text-xs th-text-muted mt-0.5">{b.description}</p>
                )}
                <p className="text-xs th-text-muted mt-0.5">
                  {t("inventory.brand.productCount")}: {b.product_count}
                </p>
              </div>
              <button onClick={() => openEdit(b)} className="p-1 th-text-muted hover:th-text transition-colors">
                <Pencil size={12} />
              </button>
              <button onClick={() => handleDelete(b)} className="p-1 th-text-muted hover:text-red-400 transition-colors">
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
                {editTarget ? t("inventory.brand.edit") : t("inventory.brand.new")}
              </h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.brand.name")}</label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.brand.description")}</label>
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
        <CsvImportModal
          importType="brands"
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load(); }}
        />
      )}
    </div>
  );
}
