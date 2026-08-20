"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { listProjects, createProject, updateProject, deleteProject } from "@/lib/projectApi";
import type { Project, ProjectStatus } from "@/types";
import { Plus, Pencil, Trash2, ChevronRight, X, Info } from "lucide-react";
import { clsx } from "clsx";

const STATUS_OPTIONS: { value: ProjectStatus; label: string; color: string }[] = [
  { value: "active",    label: "Aktif",      color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  { value: "completed", label: "Selesai",    color: "bg-brand-500/15 text-brand-400 border-brand-500/20" },
  { value: "on_hold",   label: "Ditahan",    color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  { value: "cancelled", label: "Dibatalkan", color: "bg-red-500/15 text-red-400 border-red-500/20" },
];

const COLORS = [
  "#6b7280","#8b5cf6","#3b82f6","#10b981","#f59e0b",
  "#ef4444","#ec4899","#14b8a6","#f97316","#84cc16",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

type FilterStatus = "all" | ProjectStatus;

const EMPTY_FORM = {
  name: "", client_name: "", client_contact: "",
  status: "active" as ProjectStatus,
  start_date: "", end_date: "", contract_value: "",
  description: "", color: "#6b7280",
};

const PENDING_TAB_LABEL: Record<string, string> = {
  rab: "Anggaran (RAB)",
  workers: "Tim",
  invoices: "Invoice",
};

export function ProjectsPanel({
  selectedProject,
  onSelectProject,
  pendingTab,
}: {
  selectedProject: Project | null;
  onSelectProject: (p: Project) => void;
  pendingTab?: string | null;
}) {
  const t = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await listProjects()); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: Project) => {
    setEditTarget(p);
    setForm({
      name: p.name,
      client_name: p.client_name ?? "",
      client_contact: p.client_contact ?? "",
      status: p.status,
      start_date: p.start_date ?? "",
      end_date: p.end_date ?? "",
      contract_value: p.contract_value != null ? String(p.contract_value) : "",
      description: p.description ?? "",
      color: p.color,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        client_name: form.client_name.trim() || null,
        client_contact: form.client_contact.trim() || null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        contract_value: form.contract_value ? parseFloat(form.contract_value) : null,
        description: form.description.trim() || null,
        color: form.color,
      };
      if (editTarget) {
        await updateProject(editTarget.id, payload);
      } else {
        await createProject(payload as any);
      }
      setShowForm(false);
      await load();
    } catch {}
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch {}
  };

  const filtered = filter === "all" ? projects : projects.filter(p => p.status === filter);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Hint banner saat diarahkan dari tab lain */}
      {pendingTab && (
        <div className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 border-b border-brand-500/20 shrink-0">
          <Info size={13} className="text-brand-400 shrink-0" />
          <span className="text-xs text-brand-300">
            Pilih proyek untuk membuka tab <span className="font-semibold">{PENDING_TAB_LABEL[pendingTab] ?? pendingTab}</span> — klik tombol <span className="font-semibold">Buka</span> pada proyek yang diinginkan.
          </span>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b th-border glass-surface shrink-0 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {(["all", "active", "completed", "on_hold", "cancelled"] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={clsx(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                filter === s ? "bg-brand-600 text-white" : "th-bg-elevated th-text-muted hover:th-text"
              )}
            >
              {s === "all" ? "Semua" : STATUS_OPTIONS.find(o => o.value === s)?.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            <Plus size={13} />
            {t("project.new")}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="text-center py-10 text-sm th-text-muted">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm th-text-muted">{t("project.empty")}</div>
        ) : (
          filtered.map(p => {
            const statusOpt = STATUS_OPTIONS.find(o => o.value === p.status)!;
            const isSelected = selectedProject?.id === p.id;
            return (
              <div
                key={p.id}
                className={clsx(
                  "th-bg-surface rounded-2xl border transition-all",
                  isSelected ? "border-brand-500/60 shadow-brand-sm" : "th-border hover:border-brand-500/30"
                )}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold th-text truncate">{p.name}</span>
                      <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", statusOpt.color)}>
                        {statusOpt.label}
                      </span>
                    </div>
                    {p.client_name && <p className="text-xs th-text-muted mt-0.5 truncate">{p.client_name}</p>}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {p.start_date && <span className="text-[11px] th-text-muted">{p.start_date}</span>}
                      {p.start_date && p.end_date && <span className="text-[11px] th-text-muted">→</span>}
                      {p.end_date && <span className="text-[11px] th-text-muted">{p.end_date}</span>}
                      {p.contract_value != null && (
                        <span className="text-[11px] font-semibold text-emerald-400">{fmt(p.contract_value)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1.5 rounded-lg th-text-muted hover:th-text hover:th-bg-elevated transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="p-1.5 rounded-lg th-text-muted hover:text-red-400 hover:th-bg-elevated transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                    <button
                      onClick={() => onSelectProject(p)}
                      className={clsx(
                        "flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ml-1",
                        isSelected
                          ? "bg-brand-600 text-white"
                          : "th-bg-elevated th-text-muted hover:th-text"
                      )}
                    >
                      Buka <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
                {p.description && (
                  <div className="px-4 pb-3">
                    <p className="text-xs th-text-muted leading-relaxed line-clamp-2">{p.description}</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b th-border shrink-0">
              <h2 className="text-sm font-semibold th-text">
                {editTarget ? t("project.edit") : t("project.new")}
              </h2>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.name")} *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nama proyek..."
                  className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500"
                />
              </div>
              {/* Client */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.client")}</label>
                  <input
                    value={form.client_name}
                    onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    placeholder="Nama klien..."
                    className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.clientContact")}</label>
                  <input
                    value={form.client_contact}
                    onChange={e => setForm(f => ({ ...f, client_contact: e.target.value }))}
                    placeholder="Telepon / email..."
                    className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              {/* Status */}
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.status.active")}</label>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUS_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setForm(f => ({ ...f, status: o.value }))}
                      className={clsx(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                        form.status === o.value ? o.color : "th-bg-elevated th-text-muted th-border"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Dates */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.startDate")}</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.endDate")}</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              {/* Contract value */}
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.contractValue")}</label>
                <input
                  type="number"
                  value={form.contract_value}
                  onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500"
                />
              </div>
              {/* Description */}
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.description")}</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Deskripsi proyek..."
                  className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>
              {/* Color */}
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.color")}</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={clsx(
                        "w-7 h-7 rounded-full border-2 transition-all",
                        form.color === c ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t th-border shrink-0">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm hover:opacity-80 transition-opacity"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
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
            <h2 className="text-sm font-semibold th-text">{t("project.delete")}</h2>
            <p className="text-sm th-text-muted leading-relaxed">{t("project.deleteConfirm")}</p>
            <p className="text-sm font-semibold th-text">"{deleteTarget.name}"</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">
                {t("common.cancel")}
              </button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-semibold">
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
