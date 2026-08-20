"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listAccounts, createAccount, updateAccount, deleteAccount } from "@/lib/financeApi";
import type { Account, AccountType } from "@/types";
import type { TranslationKey } from "@/lib/i18n/en";
import { clsx } from "clsx";

const ACCOUNT_TYPES: AccountType[] = ["cash", "bank", "ewallet", "credit", "investment", "other"];

function typeLabel(t: (k: TranslationKey) => string, type: AccountType) {
  const map: Record<AccountType, TranslationKey> = {
    cash: "finance.account.typeCash",
    bank: "finance.account.typeBank",
    ewallet: "finance.account.typeEwallet",
    credit: "finance.account.typeCredit",
    investment: "finance.account.typeInvestment",
    other: "finance.account.typeOther",
  };
  return t(map[type]);
}

interface FormState {
  name: string;
  type: AccountType;
  balance: string;
  currency: string;
  color: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  name: "", type: "cash", balance: "0", currency: "IDR", color: "#0284c7", note: "",
};

export function AccountsPanel() {
  const t = useT();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listAccounts();
      setAccounts(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(acc: Account) {
    setEditTarget(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      balance: String(acc.balance),
      currency: acc.currency,
      color: acc.color,
      note: acc.note ?? "",
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        balance: parseFloat(form.balance) || 0,
        currency: form.currency,
        color: form.color,
        note: form.note || null,
      };
      if (editTarget) {
        await updateAccount(editTarget.id, payload);
      } else {
        await createAccount(payload);
      }
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(acc: Account) {
    if (!confirm(t("finance.account.deleteConfirm"))) return;
    await deleteAccount(acc.id);
    await load();
  }

  function fmt(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "decimal", maximumFractionDigits: 0 }).format(n);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold th-text">{t("finance.accounts")}</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors"
        >
          <Plus size={13} />
          {t("finance.account.new")}
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("finance.account.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((acc) => (
            <div key={acc.id} className="card p-4 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium th-text truncate">{acc.name}</p>
                <p className="text-xs th-text-muted">{typeLabel(t, acc.type)} · {acc.currency}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold th-text">{fmt(acc.balance)}</p>
              </div>
              <button onClick={() => openEdit(acc)} className="p-1.5 th-text-muted hover:th-text transition-colors">
                <Pencil size={13} />
              </button>
              <button onClick={() => handleDelete(acc)} className="p-1.5 th-text-muted hover:text-red-400 transition-colors">
                <Trash2 size={13} />
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
                {editTarget ? t("finance.account.edit") : t("finance.account.new")}
              </h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <Field label={t("finance.account.name")}>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  autoFocus
                />
              </Field>

              <Field label={t("finance.account.type")}>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}
                  className="input-field"
                >
                  {ACCOUNT_TYPES.map((tp) => (
                    <option key={tp} value={tp}>{typeLabel(t, tp)}</option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("finance.account.balance")}>
                  <input
                    type="number"
                    value={form.balance}
                    onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                    className="input-field"
                  />
                </Field>
                <Field label={t("finance.account.currency")}>
                  <input
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="input-field"
                    maxLength={5}
                  />
                </Field>
              </div>

              <div className="flex items-center gap-3">
                <Field label={t("finance.account.color")} className="flex-shrink-0">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-9 w-16 rounded-lg border th-border cursor-pointer th-bg-elevated"
                  />
                </Field>
                <Field label={t("finance.account.note")} className="flex-1">
                  <input
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    className="input-field"
                  />
                </Field>
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

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <label className="text-xs th-text-muted">{label}</label>
      {children}
    </div>
  );
}
