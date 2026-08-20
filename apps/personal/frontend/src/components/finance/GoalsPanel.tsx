"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Target } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listGoals, createGoal, updateGoal, deleteGoal } from "@/lib/financeApi";
import type { FinancialGoal } from "@/types";
import { clsx } from "clsx";

const PRESET_COLORS = [
  { value: "#0284c7", label: "Biru" },
  { value: "#16a34a", label: "Hijau" },
  { value: "#7c3aed", label: "Ungu" },
  { value: "#ea580c", label: "Oranye" },
  { value: "#dc2626", label: "Merah" },
  { value: "#6b7280", label: "Abu" },
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatAmount(n: number): string {
  return n.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function daysUntil(deadline: string): number {
  const now = new Date();
  const d = new Date(deadline);
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

interface GoalDraft {
  name: string;
  target_amount: string;
  saved_amount: string;
  deadline: string;
  color: string;
  icon: string;
  note: string;
}

function emptyDraft(): GoalDraft {
  return {
    name: "",
    target_amount: "",
    saved_amount: "0",
    deadline: "",
    color: "#0284c7",
    icon: "target",
    note: "",
  };
}

function draftFromGoal(g: FinancialGoal): GoalDraft {
  return {
    name: g.name,
    target_amount: String(g.target_amount),
    saved_amount: String(g.saved_amount),
    deadline: g.deadline ?? "",
    color: g.color,
    icon: g.icon,
    note: g.note ?? "",
  };
}

export function GoalsPanel() {
  const t = useT();
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<FinancialGoal | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listGoals();
      setGoals(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditTarget(null);
    setDraft(emptyDraft());
    setError("");
    setShowForm(true);
  }

  function openEdit(g: FinancialGoal) {
    setEditTarget(g);
    setDraft(draftFromGoal(g));
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditTarget(null);
    setError("");
  }

  function set(field: keyof GoalDraft, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetAmt = parseFloat(draft.target_amount);
    const savedAmt = parseFloat(draft.saved_amount);
    if (!draft.name.trim()) { setError("Nama tujuan wajib diisi."); return; }
    if (isNaN(targetAmt) || targetAmt <= 0) { setError("Target harus lebih dari 0."); return; }
    if (isNaN(savedAmt) || savedAmt < 0) { setError("Sudah ditabung tidak boleh negatif."); return; }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name: draft.name.trim(),
        target_amount: targetAmt,
        saved_amount: savedAmt,
        deadline: draft.deadline || null,
        color: draft.color,
        icon: draft.icon || "target",
        note: draft.note.trim() || null,
      };
      if (editTarget) {
        await updateGoal(editTarget.id, payload);
      } else {
        await createGoal(payload);
      }
      await load();
      closeForm();
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g: FinancialGoal) {
    if (!confirm(t("finance.goal.deleteConfirm"))) return;
    try {
      await deleteGoal(g.id);
      setGoals((prev) => prev.filter((x) => x.id !== g.id));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold th-text">{t("finance.goal.title")}</h2>
        <button
          onClick={openCreate}
          className="btn-brand flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus size={14} />
          {t("finance.goal.new")}
        </button>
      </div>

      {/* Goal cards */}
      {loading ? (
        <p className="th-text-muted text-sm">{t("common.loading")}</p>
      ) : goals.length === 0 ? (
        <div className="th-bg-surface rounded-xl p-8 text-center">
          <Target size={32} className="mx-auto mb-3 th-text-muted opacity-40" />
          <p className="th-text-muted text-sm">{t("finance.goal.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => {
            const pct = Math.min(100, g.target_amount > 0 ? (g.saved_amount / g.target_amount) * 100 : 0);
            const achieved = g.saved_amount >= g.target_amount;
            const remaining = g.target_amount - g.saved_amount;
            let deadlineLabel: React.ReactNode = null;
            if (g.deadline) {
              const days = daysUntil(g.deadline);
              if (days < 0) {
                deadlineLabel = (
                  <span className="text-xs font-medium" style={{ color: "#dc2626" }}>
                    {t("finance.goal.overdue")}
                  </span>
                );
              } else {
                deadlineLabel = (
                  <span className="text-xs th-text-muted">
                    {t("finance.goal.daysLeft").replace("{n}", String(days))}
                  </span>
                );
              }
            }

            return (
              <div key={g.id} className="th-bg-surface rounded-xl p-4 space-y-3 border th-border">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="shrink-0 w-3 h-3 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="font-semibold th-text text-sm truncate">{g.name}</span>
                    <span className="text-xs th-text-muted shrink-0 opacity-60 border th-border rounded px-1">
                      {g.icon}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(g)}
                      className="p-1 rounded th-text-muted hover:th-text transition-colors"
                      title={t("common.edit")}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(g)}
                      className="p-1 rounded th-text-muted hover:text-red-500 transition-colors"
                      title={t("common.delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex items-baseline justify-between text-xs th-text-muted">
                  <span>
                    <span className="font-semibold th-text text-sm">
                      {formatAmount(g.saved_amount)}
                    </span>
                    {" / "}
                    {formatAmount(g.target_amount)}
                  </span>
                  <span className="font-semibold" style={{ color: g.color }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 th-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: g.color }}
                  />
                </div>

                {/* Status row */}
                <div className="flex items-center justify-between text-xs">
                  {achieved ? (
                    <span className="font-semibold" style={{ color: "#16a34a" }}>
                      {t("finance.goal.achieved")} ✓
                    </span>
                  ) : (
                    <span className="th-text-muted">
                      {t("finance.goal.needed")
                        .replace("{amount}", formatAmount(remaining))}
                    </span>
                  )}
                  {deadlineLabel}
                </div>

                {/* Note */}
                {g.note && (
                  <p className="text-xs th-text-muted italic truncate">{g.note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeForm} />
          <div className="relative th-bg-base rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 overflow-y-auto max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold th-text text-base">
                {editTarget ? t("finance.goal.edit") : t("finance.goal.new")}
              </h3>
              <button onClick={closeForm} className="p-1 th-text-muted hover:th-text">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium th-text-2 mb-1">
                  {t("finance.goal.name")}
                </label>
                <input
                  className="input-field w-full"
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={t("finance.goal.name")}
                  autoFocus
                />
              </div>

              {/* Target amount */}
              <div>
                <label className="block text-xs font-medium th-text-2 mb-1">
                  {t("finance.goal.target")}
                </label>
                <input
                  className="input-field w-full"
                  type="number"
                  min="1"
                  step="any"
                  value={draft.target_amount}
                  onChange={(e) => set("target_amount", e.target.value)}
                  placeholder="0"
                />
              </div>

              {/* Saved amount */}
              <div>
                <label className="block text-xs font-medium th-text-2 mb-1">
                  {t("finance.goal.saved")}
                </label>
                <input
                  className="input-field w-full"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.saved_amount}
                  onChange={(e) => set("saved_amount", e.target.value)}
                  placeholder="0"
                />
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-xs font-medium th-text-2 mb-1">
                  {t("finance.goal.deadlineOptional")}
                </label>
                <input
                  className="input-field w-full"
                  type="date"
                  value={draft.deadline}
                  min={today()}
                  onChange={(e) => set("deadline", e.target.value)}
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium th-text-2 mb-1">
                  {t("finance.goal.color")}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => set("color", c.value)}
                      className={clsx(
                        "w-7 h-7 rounded-full border-2 transition-transform",
                        draft.color === c.value
                          ? "border-brand-400 scale-110"
                          : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Icon label */}
              <div>
                <label className="block text-xs font-medium th-text-2 mb-1">
                  {t("finance.goal.note")} (Ikon)
                </label>
                <input
                  className="input-field w-full"
                  value={draft.icon}
                  onChange={(e) => set("icon", e.target.value)}
                  placeholder="target"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-medium th-text-2 mb-1">
                  {t("finance.goal.note")}
                </label>
                <input
                  className="input-field w-full"
                  value={draft.note}
                  onChange={(e) => set("note", e.target.value)}
                  placeholder={t("finance.goal.note")}
                />
              </div>

              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 py-2 rounded-lg text-sm font-medium th-bg-elevated th-text hover:opacity-80 transition-opacity"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                >
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
