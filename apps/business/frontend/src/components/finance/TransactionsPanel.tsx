"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Search, Pencil, Trash2, X, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useT } from "@/lib/i18n";
import { useLock } from "@/lib/LockContext";
import {
  listTransactions, createTransaction, updateTransaction, deleteTransaction,
  listAccounts, listCategories, listPockets,
} from "@/lib/financeApi";
import type { Transaction, Account, Category, Pocket, TransactionType, TransactionDraft, FeeType } from "@/types";
import { clsx } from "clsx";

interface FeeDraft {
  label: string;
  fee_type: FeeType;
  amount: string;
}

const PAGE_SIZE = 20;
const TX_TYPES: TransactionType[] = ["income", "expense", "transfer"];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyDraft(): TransactionDraft {
  return {
    account_id: null, category_id: null, pocket_id: null, to_account_id: null,
    type: "expense", amount: "", date: today(),
    description: "", note: "", tags: "",
  };
}

interface Props {
  pocketId: number | null;
}

export function TransactionsPanel({ pocketId }: Props) {
  const t = useT();
  const { status: lockStatus } = useLock();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | undefined>();
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [draft, setDraft] = useState<TransactionDraft>(emptyDraft());
  const [fees, setFees] = useState<FeeDraft[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [, setPockets] = useState<Pocket[]>([]);
  const [saving, setSaving] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTransactions({
        pocket_id: pocketId ?? undefined,
        type: typeFilter,
        q: q || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setTransactions(result.transactions);
      setTotal(result.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [pocketId, typeFilter, q, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [pocketId, typeFilter, q]);

  async function loadMeta() {
    const [accs, cats, pks] = await Promise.all([listAccounts(), listCategories(), listPockets()]);
    setAccounts(accs);
    setCategories(cats);
    setPockets(pks);
  }

  function openCreate() {
    loadMeta();
    setEditTarget(null);
    const d = emptyDraft();
    if (pocketId) d.pocket_id = pocketId;
    setDraft(d);
    setFees([]);
    setShowForm(true);
  }

  function openEdit(tx: Transaction) {
    loadMeta();
    setEditTarget(tx);
    setDraft({
      account_id: tx.account_id,
      category_id: tx.category_id,
      pocket_id: tx.pocket_id,
      to_account_id: tx.to_account_id,
      type: tx.type,
      amount: String(tx.amount),
      date: tx.date,
      description: tx.description ?? "",
      note: tx.note ?? "",
      tags: tx.tags ?? "",
    });
    setFees(
      (tx.fees ?? []).map((f) => ({
        label: f.label,
        fee_type: f.fee_type,
        amount: String(Math.abs(f.amount)),
      }))
    );
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.account_id || !draft.amount) return;
    if (draft.type === "transfer" && !draft.to_account_id) return;
    setSaving(true);
    try {
      const feePayload = fees
        .filter((f) => f.label.trim() && f.amount)
        .map((f) => ({ label: f.label.trim(), fee_type: f.fee_type, amount: parseFloat(f.amount) }));
      const payload = {
        account_id: draft.account_id,
        category_id: draft.category_id,
        pocket_id: draft.pocket_id,
        to_account_id: draft.type === "transfer" ? draft.to_account_id : null,
        type: draft.type,
        amount: parseFloat(draft.amount),
        date: draft.date,
        description: draft.description || undefined,
        note: draft.note || undefined,
        tags: draft.tags || undefined,
        fees: feePayload.length ? feePayload : undefined,
      };
      if (editTarget) {
        await updateTransaction(editTarget.id, { ...payload, fees: feePayload });
      } else {
        await createTransaction(payload);
      }
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tx: Transaction) {
    if (!confirm(t("finance.tx.deleteConfirm"))) return;
    await deleteTransaction(tx.id);
    await load();
  }

  function handleQChange(val: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setQ(val), 300);
  }

  function txTypeLabel(type: TransactionType) {
    return { income: t("finance.tx.income"), expense: t("finance.tx.expense"), transfer: t("finance.tx.transfer") }[type];
  }

  function fmt(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "decimal", maximumFractionDigits: 0 }).format(n);
  }

  // A transaction is masked if its pocket is locked AND the session is not unlocked
  function isPocketLocked(tx: Transaction): boolean {
    if (!tx.pocket_id) return false;
    return !!(tx.pocket_locked && !lockStatus?.unlocked);
  }

  const filteredCategories = categories.filter((c) => !draft.type || c.type === draft.type);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  // Accounts available for destination (exclude source)
  const toAccounts = accounts.filter((a) => a.id !== draft.account_id);

  return (
    <div className="p-4 max-w-3xl mx-auto flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold th-text flex-1">{t("finance.transactions")}</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors"
        >
          <Plus size={13} />
          {t("finance.tx.new")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 th-text-muted" />
          <input
            placeholder={t("finance.tx.searchPlaceholder")}
            onChange={(e) => handleQChange(e.target.value)}
            className="w-full th-bg-elevated border th-border rounded-lg pl-8 pr-3 py-1.5 text-xs th-text placeholder:th-text-muted outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setTypeFilter(undefined)}
            className={clsx("px-2.5 py-1 rounded-lg text-xs transition-colors", !typeFilter ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text")}
          >
            All
          </button>
          {TX_TYPES.map((tp) => (
            <button
              key={tp}
              onClick={() => setTypeFilter(tp)}
              className={clsx("px-2.5 py-1 rounded-lg text-xs transition-colors", typeFilter === tp ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text")}
            >
              {txTypeLabel(tp)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("finance.tx.empty")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {transactions.map((tx) => {
            const locked = isPocketLocked(tx);
            return (
              <div key={tx.id} className={clsx(
                "border th-border rounded-xl px-4 py-3 flex items-center gap-3",
                locked ? "th-bg-elevated opacity-70" : "th-bg-surface"
              )}>
                {locked ? (
                  <Lock size={12} className="th-text-muted shrink-0" />
                ) : (
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: tx.category_color ?? (tx.type === "income" ? "#10b981" : tx.type === "expense" ? "#ef4444" : "#94a3b8") }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  {locked ? (
                    <p className="text-sm th-text-muted italic">{t("finance.tx.lockedMask")}</p>
                  ) : (
                    <p className="text-sm th-text truncate">
                      {tx.description || tx.category_name || txTypeLabel(tx.type)}
                      {tx.type === "transfer" && tx.to_account_name && (
                        <span className="th-text-muted"> → {tx.to_account_name}</span>
                      )}
                    </p>
                  )}
                  <p className="text-xs th-text-muted">
                    {tx.date}
                    {!locked && <> · {tx.account_name}</>}
                    {tx.pocket_name && <> · <span className={clsx(tx.pocket_locked ? "opacity-60" : "")}>{locked ? "🔒 —" : tx.pocket_name}</span></>}
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={clsx(
                    "text-sm font-semibold",
                    locked ? "th-text-muted" :
                    tx.type === "income" ? "text-emerald-400" : tx.type === "expense" ? "text-red-400" : "th-text-muted"
                  )}>
                    {locked ? "••••" : (
                      <>
                        {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "↔"}
                        {fmt(tx.fees?.length ? (tx.grand_total ?? tx.amount) : tx.amount)}
                      </>
                    )}
                  </span>
                  {!locked && (tx.fees?.length ?? 0) > 0 && (
                    <span className="text-xs th-text-muted">
                      {fmt(tx.amount)} + {tx.fees!.length} {t("finance.tx.hasFees")}
                    </span>
                  )}
                </div>
                {!locked && (
                  <>
                    <button onClick={() => openEdit(tx)} className="p-1 th-text-muted hover:th-text transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => handleDelete(tx)} className="p-1 th-text-muted hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="p-1.5 th-bg-elevated rounded-lg th-text-muted hover:th-text disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs th-text-muted">{page + 1} / {totalPages}</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="p-1.5 th-bg-elevated rounded-lg th-text-muted hover:th-text disabled:opacity-40 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold th-text">
                {editTarget ? t("finance.tx.edit") : t("finance.tx.new")}
              </h3>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {/* Type */}
              <div className="flex gap-1">
                {TX_TYPES.map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, type: tp, category_id: null, to_account_id: null }))}
                    className={clsx(
                      "flex-1 py-1.5 rounded-lg text-xs transition-colors",
                      draft.type === tp ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text"
                    )}
                  >
                    {txTypeLabel(tp)}
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("finance.tx.amount")}</label>
                <input
                  required
                  autoFocus
                  type="number"
                  min="0"
                  step="any"
                  value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                  className="input-field text-lg font-semibold"
                  placeholder="0"
                />
              </div>

              {/* Source Account */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">
                  {draft.type === "transfer" ? `${t("finance.tx.account")} (sumber)` : t("finance.tx.account")}
                </label>
                <SearchableSelect
                  value={draft.account_id?.toString() ?? ""}
                  onChange={(v) => setDraft((d) => ({ ...d, account_id: v ? parseInt(v) : null, to_account_id: null }))}
                  placeholder={t("finance.tx.selectAccount")}
                  options={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
                />
              </div>

              {/* Destination Account — only for transfer */}
              {draft.type === "transfer" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("finance.tx.toAccount")}</label>
                  <SearchableSelect
                    value={draft.to_account_id?.toString() ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, to_account_id: v ? parseInt(v) : null }))}
                    placeholder={t("finance.tx.selectToAccount")}
                    options={toAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
                  />
                </div>
              )}

              {/* Category — not shown for transfer */}
              {draft.type !== "transfer" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("finance.tx.category")}</label>
                  <SearchableSelect
                    value={draft.category_id?.toString() ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, category_id: v ? parseInt(v) : null }))}
                    clearable
                    placeholder={t("finance.tx.selectCategory")}
                    options={filteredCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                  />
                </div>
              )}

              {/* Date */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("finance.tx.date")}</label>
                <input
                  required
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                  className="input-field"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("finance.tx.description")}</label>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  className="input-field"
                />
              </div>

              {/* Note */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("finance.tx.note")}</label>
                <input
                  value={draft.note}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                  className="input-field"
                />
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("finance.tx.tags")}</label>
                <input
                  value={draft.tags}
                  onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                  className="input-field"
                  placeholder="tag1, tag2"
                />
              </div>

              {/* Additional Fees */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs th-text-muted">{t("finance.tx.fees")}</label>
                  <button
                    type="button"
                    onClick={() => setFees((f) => [...f, { label: "", fee_type: "other", amount: "" }])}
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    + {t("finance.tx.feeAdd")}
                  </button>
                </div>
                {fees.map((fee, idx) => (
                  <div key={idx} className="flex gap-1.5 items-start">
                    <input
                      type="text"
                      placeholder={t("finance.tx.feeLabel")}
                      value={fee.label}
                      onChange={(e) => setFees((f) => f.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                      className="input-field flex-1 min-w-0"
                    />
                    <select
                      value={fee.fee_type}
                      onChange={(e) => setFees((f) => f.map((x, i) => i === idx ? { ...x, fee_type: e.target.value as FeeType } : x))}
                      className="input-field w-24 shrink-0"
                    >
                      <option value="shipping">{t("finance.tx.feeShipping")}</option>
                      <option value="tax">{t("finance.tx.feeTax")}</option>
                      <option value="discount">{t("finance.tx.feeDiscount")}</option>
                      <option value="other">{t("finance.tx.feeOther")}</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={fee.amount}
                      onChange={(e) => setFees((f) => f.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                      className="input-field w-24 shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => setFees((f) => f.filter((_, i) => i !== idx))}
                      className="p-1.5 th-text-muted hover:text-red-400 transition-colors shrink-0 mt-0.5"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {fees.length > 0 && draft.amount && (
                  <div className="flex flex-col gap-0.5 border-t th-border pt-2 mt-0.5">
                    <div className="flex justify-between text-xs th-text-muted">
                      <span>{t("finance.tx.subtotal")}</span>
                      <span>{fmt(parseFloat(draft.amount) || 0)}</span>
                    </div>
                    {fees.filter((f) => f.label && f.amount).map((f, idx) => {
                      const amt = parseFloat(f.amount) || 0;
                      return (
                        <div key={idx} className="flex justify-between text-xs th-text-muted">
                          <span className="truncate max-w-[60%]">
                            {f.label}
                            {f.fee_type === "discount" && <span className="text-red-400 ml-1">(-)</span>}
                          </span>
                          <span className={f.fee_type === "discount" ? "text-red-400" : ""}>{fmt(Math.abs(amt))}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between text-xs font-semibold th-text border-t th-border pt-1 mt-0.5">
                      <span>{t("finance.tx.grandTotal")}</span>
                      <span>
                        {fmt(
                          (parseFloat(draft.amount) || 0) +
                          fees.filter((f) => f.label && f.amount).reduce((acc, f) => {
                            const amt = parseFloat(f.amount) || 0;
                            return acc + (f.fee_type === "discount" ? -amt : amt);
                          }, 0)
                        )}
                      </span>
                    </div>
                  </div>
                )}
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
