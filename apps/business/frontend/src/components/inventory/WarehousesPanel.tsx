"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Warehouse, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from "@/lib/inventoryApi";
import type { Warehouse as WarehouseType } from "@/types";
import { CsvImportModal } from "./CsvImportModal";

interface FormState {
  name: string;
  location: string;
  note: string;
}

const EMPTY: FormState = { name: "", location: "", note: "" };
const PAGE_SIZE = 20;

export function WarehousesPanel() {
  const t = useT();
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setWarehouses(await listWarehouses()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditTarget(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(w: WarehouseType) {
    setEditTarget(w);
    setForm({ name: w.name, location: w.location ?? "", note: w.note ?? "" });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, location: form.location || undefined, note: form.note || undefined };
      if (editTarget) await updateWarehouse(editTarget.id, payload);
      else await createWarehouse(payload);
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(w: WarehouseType) {
    if (!confirm(t("inventory.warehouse.deleteConfirm"))) return;
    await deleteWarehouse(w.id);
    await load();
  }

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold th-text">{t("inventory.warehouses")}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg th-bg-elevated th-text-muted hover:th-text border th-border text-xs transition-colors">
            <Upload size={13} />{t("common.importCsv")}
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors">
            <Plus size={13} />{t("inventory.warehouse.new")}
          </button>
        </div>
      </div>

      {warehouses.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("inventory.warehouse.empty")}</p>
      ) : (() => {
        const totalPages = Math.max(1, Math.ceil(warehouses.length / PAGE_SIZE));
        const paged = warehouses.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        return (
          <>
            <div className="flex flex-col gap-2">
              {paged.map((w) => (
                <div key={w.id} className="card p-3 flex items-start gap-3">
                  <div className="p-1.5 rounded-lg th-bg-elevated shrink-0">
                    <Warehouse size={14} className="th-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium th-text">{w.name}</p>
                    {w.location && <p className="text-xs th-text-muted mt-0.5">{w.location}</p>}
                    {w.note && <p className="text-xs th-text-muted italic mt-0.5">{w.note}</p>}
                  </div>
                  <button onClick={() => openEdit(w)} className="p-1 th-text-muted hover:th-text transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleDelete(w)} className="p-1 th-text-muted hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border th-border th-text-muted hover:th-text disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={13} />{t("common.prev")}
                </button>
                <span className="text-xs th-text-muted">
                  {t("inventory.product.page")} {page + 1} {t("inventory.product.of")} {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border th-border th-text-muted hover:th-text disabled:opacity-40 transition-colors"
                >
                  {t("common.next")}<ChevronRight size={13} />
                </button>
              </div>
            )}
          </>
        );
      })()}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold th-text">
                {editTarget ? t("inventory.warehouse.edit") : t("inventory.warehouse.new")}
              </h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.warehouse.name")}</label>
                <input required autoFocus value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.warehouse.location")}</label>
                <input value={form.location}
                  onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                  className="input-field" placeholder="Jl. Raya No. 1, Jakarta" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.warehouse.note")}</label>
                <textarea value={form.note} rows={2}
                  onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                  className="input-field resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-xl border th-border th-text text-sm transition-colors hover:th-bg-elevated">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors">
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showImport && (
        <CsvImportModal importType="warehouses" onClose={() => setShowImport(false)} onSuccess={() => { setShowImport(false); load(); }} />
      )}
    </div>
  );
}
