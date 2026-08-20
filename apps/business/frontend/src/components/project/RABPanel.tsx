"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { listBudgetItems, createBudgetItem, updateBudgetItem, deleteBudgetItem } from "@/lib/projectApi";
import type { Project, ProjectBudgetItem } from "@/types";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { clsx } from "clsx";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const EMPTY_FORM = { category: "Umum", description: "", qty: "1", unit: "ls", unit_price: "0" };

export function RABPanel({ project }: { project: Project }) {
  const t = useT();
  const [items, setItems] = useState<ProjectBudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectBudgetItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectBudgetItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listBudgetItems(project.id)); } catch {}
    finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  const grandTotal = items.reduce((s, i) => s + i.total_price, 0);
  const contractValue = project.contract_value ?? 0;

  // group by category
  const grouped = items.reduce<Record<string, ProjectBudgetItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const openNew = () => { setEditTarget(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (item: ProjectBudgetItem) => {
    setEditTarget(item);
    setForm({
      category: item.category,
      description: item.description,
      qty: String(item.qty),
      unit: item.unit,
      unit_price: String(item.unit_price),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      const payload = {
        category: form.category.trim() || "Umum",
        description: form.description.trim(),
        qty: parseFloat(form.qty) || 1,
        unit: form.unit.trim() || "ls",
        unit_price: parseFloat(form.unit_price) || 0,
      };
      if (editTarget) {
        await updateBudgetItem(editTarget.id, payload);
      } else {
        await createBudgetItem(project.id, payload);
      }
      setShowForm(false);
      await load();
    } catch {}
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteBudgetItem(deleteTarget.id); setDeleteTarget(null); await load(); } catch {}
  };

  const previewTotal = (parseFloat(form.qty) || 0) * (parseFloat(form.unit_price) || 0);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b th-border glass-surface shrink-0">
        <div className="flex-1">
          <h2 className="text-sm font-semibold th-text">{t("project.rab")} — {project.name}</h2>
          {contractValue > 0 && (
            <p className="text-xs th-text-muted mt-0.5">
              Nilai Kontrak: <span className="text-emerald-400 font-semibold">{fmt(contractValue)}</span>
              {grandTotal > 0 && (
                <> · RAB: <span className="text-brand-400 font-semibold">{fmt(grandTotal)}</span>
                  {" · "}
                  <span className={grandTotal > contractValue ? "text-red-400" : "text-emerald-400"}>
                    {grandTotal > contractValue ? "Melebihi" : "Sisa"}: {fmt(Math.abs(contractValue - grandTotal))}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          <Plus size={13} /> {t("project.rab.new")}
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-10 text-sm th-text-muted">{t("common.loading")}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-sm th-text-muted">{t("project.rab.empty")}</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 glass-surface border-b th-border">
              <tr>
                <th className="text-left px-4 py-2.5 th-text-muted font-medium w-8">#</th>
                <th className="text-left px-4 py-2.5 th-text-muted font-medium">Uraian</th>
                <th className="text-right px-4 py-2.5 th-text-muted font-medium w-20">{t("project.rab.qty")}</th>
                <th className="text-left px-4 py-2.5 th-text-muted font-medium w-16">{t("project.rab.unit")}</th>
                <th className="text-right px-4 py-2.5 th-text-muted font-medium w-32">{t("project.rab.unitPrice")}</th>
                <th className="text-right px-4 py-2.5 th-text-muted font-medium w-36">{t("project.rab.totalPrice")}</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([cat, catItems]) => {
                const catTotal = catItems.reduce((s, i) => s + i.total_price, 0);
                return (
                  <>
                    <tr key={`cat-${cat}`} className="th-bg-elevated">
                      <td colSpan={5} className="px-4 py-2 font-semibold th-text text-xs">{cat}</td>
                      <td className="px-4 py-2 text-right font-semibold text-brand-400">{fmt(catTotal)}</td>
                      <td />
                    </tr>
                    {catItems.map((item, idx) => (
                      <tr key={item.id} className="border-b th-border hover:th-bg-elevated group">
                        <td className="px-4 py-2.5 th-text-muted">{idx + 1}</td>
                        <td className="px-4 py-2.5 th-text">{item.description}</td>
                        <td className="px-4 py-2.5 text-right th-text">{item.qty}</td>
                        <td className="px-4 py-2.5 th-text-muted">{item.unit}</td>
                        <td className="px-4 py-2.5 text-right th-text">{fmt(item.unit_price)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold th-text">{fmt(item.total_price)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(item)} className="p-1 rounded th-text-muted hover:th-text">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => setDeleteTarget(item)} className="p-1 rounded th-text-muted hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 glass-surface border-t-2 th-border">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-sm font-bold th-text">{t("project.rab.grandTotal")}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-brand-400">{fmt(grandTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b th-border">
              <h2 className="text-sm font-semibold th-text">
                {editTarget ? t("project.rab.edit") : t("project.rab.new")}
              </h2>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.rab.category")}</label>
                <input
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="Pekerjaan Sipil, Material, dll..."
                  className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.rab.description")} *</label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Uraian pekerjaan..."
                  className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.rab.qty")}</label>
                  <input
                    type="number"
                    value={form.qty}
                    onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.rab.unit")}</label>
                  <input
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="m², kg, ls..."
                    className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.rab.unitPrice")}</label>
                  <input
                    type="number"
                    value={form.unit_price}
                    onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              {previewTotal > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl th-bg-elevated">
                  <span className="text-xs th-text-muted">{t("project.rab.totalPrice")}</span>
                  <span className="text-sm font-bold text-brand-400">{fmt(previewTotal)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t th-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.description.trim()}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-sm shadow-xl p-5 space-y-4">
            <p className="text-sm th-text-muted">{t("project.rab.deleteConfirm")}</p>
            <p className="text-sm font-semibold th-text">"{deleteTarget.description}"</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">{t("common.cancel")}</button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-semibold">{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
