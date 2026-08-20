"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import {
  listWorkers, createWorker, updateWorker, deleteWorker,
  listWorkerPayments, createWorkerPayment, updateWorkerPaymentLink, deleteWorkerPayment,
} from "@/lib/projectApi";
import { listAccounts, listCategories } from "@/lib/financeApi";
import type { Project, ProjectWorker, ProjectWorkerPayment, Account, Category } from "@/types";
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronUp, Link, LinkIcon } from "lucide-react";
import { clsx } from "clsx";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const RATE_TYPES = [
  { value: "fixed", label: "Tetap" },
  { value: "daily", label: "Harian" },
  { value: "percent", label: "% Kontrak" },
];

const EMPTY_WORKER_FORM = { name: "", role: "", rate_type: "fixed", rate_amount: "0", status: "active", note: "" };
const EMPTY_PAY_FORM = {
  amount: "", date: new Date().toISOString().slice(0, 10), note: "",
  link_finance: false, account_id: "", category_id: "",
};

export function WorkersPanel({ project }: { project: Project }) {
  const t = useT();
  const [workers, setWorkers] = useState<ProjectWorker[]>([]);
  const [payments, setPayments] = useState<ProjectWorkerPayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWorker, setExpandedWorker] = useState<number | null>(null);

  // Worker form
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [editWorker, setEditWorker] = useState<ProjectWorker | null>(null);
  const [workerForm, setWorkerForm] = useState(EMPTY_WORKER_FORM);
  const [savingWorker, setSavingWorker] = useState(false);
  const [deleteWorkerTarget, setDeleteWorkerTarget] = useState<ProjectWorker | null>(null);

  // Payment form
  const [payTarget, setPayTarget] = useState<ProjectWorker | null>(null);
  const [payForm, setPayForm] = useState(EMPTY_PAY_FORM);
  const [savingPay, setSavingPay] = useState(false);
  const [deletePayTarget, setDeletePayTarget] = useState<ProjectWorkerPayment | null>(null);

  // Link finance form (existing payment)
  const [linkPayTarget, setLinkPayTarget] = useState<ProjectWorkerPayment | null>(null);
  const [linkForm, setLinkForm] = useState({ account_id: "", category_id: "" });
  const [savingLink, setSavingLink] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, p, acc, cats] = await Promise.all([
        listWorkers(project.id),
        listWorkerPayments(project.id),
        listAccounts(),
        listCategories("expense"),
      ]);
      setWorkers(w);
      setPayments(p);
      setAccounts(acc);
      setExpenseCategories(cats);
    } catch {}
    finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  const paymentsFor = (workerId: number) => payments.filter(p => p.worker_id === workerId);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  // Worker CRUD
  const openNewWorker = () => { setEditWorker(null); setWorkerForm(EMPTY_WORKER_FORM); setShowWorkerForm(true); };
  const openEditWorker = (w: ProjectWorker) => {
    setEditWorker(w);
    setWorkerForm({ name: w.name, role: w.role ?? "", rate_type: w.rate_type, rate_amount: String(w.rate_amount), status: w.status, note: w.note ?? "" });
    setShowWorkerForm(true);
  };
  const handleSaveWorker = async () => {
    if (!workerForm.name.trim()) return;
    setSavingWorker(true);
    try {
      const payload = { name: workerForm.name.trim(), role: workerForm.role.trim() || null, rate_type: workerForm.rate_type as any, rate_amount: parseFloat(workerForm.rate_amount) || 0, status: workerForm.status as any, note: workerForm.note.trim() || null };
      if (editWorker) await updateWorker(editWorker.id, payload);
      else await createWorker(project.id, payload as any);
      setShowWorkerForm(false);
      await load();
    } catch {}
    finally { setSavingWorker(false); }
  };
  const handleDeleteWorker = async () => {
    if (!deleteWorkerTarget) return;
    try { await deleteWorker(deleteWorkerTarget.id); setDeleteWorkerTarget(null); await load(); } catch {}
  };

  // Payment
  const openPay = (w: ProjectWorker) => { setPayTarget(w); setPayForm(EMPTY_PAY_FORM); };
  const handleSavePay = async () => {
    if (!payTarget || !payForm.amount) return;
    setSavingPay(true);
    try {
      await createWorkerPayment(project.id, {
        worker_id: payTarget.id,
        worker_name: payTarget.name,
        amount: parseFloat(payForm.amount),
        date: payForm.date,
        note: payForm.note.trim() || undefined,
        link_finance: payForm.link_finance,
        account_id: payForm.link_finance && payForm.account_id ? parseInt(payForm.account_id) : undefined,
        category_id: payForm.link_finance && payForm.category_id ? parseInt(payForm.category_id) : undefined,
      });
      setPayTarget(null);
      await load();
    } catch {}
    finally { setSavingPay(false); }
  };
  const handleDeletePay = async () => {
    if (!deletePayTarget) return;
    try { await deleteWorkerPayment(deletePayTarget.id); setDeletePayTarget(null); await load(); } catch {}
  };

  // Link finance (existing payment)
  const openLink = (pay: ProjectWorkerPayment) => {
    setLinkPayTarget(pay);
    setLinkForm({ account_id: "", category_id: "" });
  };
  const handleSaveLink = async () => {
    if (!linkPayTarget) return;
    setSavingLink(true);
    try {
      await updateWorkerPaymentLink(linkPayTarget.id, {
        link_finance: true,
        account_id: linkForm.account_id ? parseInt(linkForm.account_id) : undefined,
        category_id: linkForm.category_id ? parseInt(linkForm.category_id) : undefined,
      });
      setLinkPayTarget(null);
      await load();
    } catch {}
    finally { setSavingLink(false); }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b th-border glass-surface shrink-0">
        <div className="flex-1">
          <h2 className="text-sm font-semibold th-text">{t("project.workers")} — {project.name}</h2>
          <p className="text-xs th-text-muted mt-0.5">
            {workers.length} anggota · Total dibayar: <span className="text-amber-400 font-semibold">{fmt(totalPaid)}</span>
          </p>
        </div>
        <button
          onClick={openNewWorker}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          <Plus size={13} /> {t("project.worker.new")}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="text-center py-10 text-sm th-text-muted">{t("common.loading")}</div>
        ) : workers.length === 0 ? (
          <div className="text-center py-10 text-sm th-text-muted">{t("project.worker.empty")}</div>
        ) : (
          workers.map(w => {
            const workerPayments = paymentsFor(w.id);
            const isExpanded = expandedWorker === w.id;
            return (
              <div key={w.id} className="th-bg-surface rounded-2xl border th-border overflow-hidden">
                {/* Worker row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-xl th-bg-elevated flex items-center justify-center text-xs font-bold text-brand-400">
                    {w.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold th-text">{w.name}</span>
                      <span className={clsx(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                        w.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : "bg-brand-500/15 text-brand-400 border-brand-500/20"
                      )}>
                        {w.status === "active" ? "Aktif" : "Selesai"}
                      </span>
                    </div>
                    <p className="text-xs th-text-muted mt-0.5">
                      {w.role || "—"} · {RATE_TYPES.find(r => r.value === w.rate_type)?.label}: {fmt(w.rate_amount)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 mr-2">
                    <p className="text-sm font-bold text-amber-400">{fmt(w.total_paid ?? 0)}</p>
                    <p className="text-[10px] th-text-muted">dibayar</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openPay(w)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                      <Plus size={11} /> Bayar
                    </button>
                    <button onClick={() => openEditWorker(w)} className="p-1.5 rounded-lg th-text-muted hover:th-text hover:th-bg-elevated">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteWorkerTarget(w)} className="p-1.5 rounded-lg th-text-muted hover:text-red-400 hover:th-bg-elevated">
                      <Trash2 size={12} />
                    </button>
                    {workerPayments.length > 0 && (
                      <button
                        onClick={() => setExpandedWorker(isExpanded ? null : w.id)}
                        className="p-1.5 rounded-lg th-text-muted hover:th-text hover:th-bg-elevated"
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment history */}
                {isExpanded && workerPayments.length > 0 && (
                  <div className="border-t th-border">
                    {workerPayments.map(pay => (
                      <div key={pay.id} className="flex items-center gap-3 px-4 py-2.5 hover:th-bg-elevated group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold th-text">{fmt(pay.amount)}</span>
                            <span className="text-[10px] th-text-muted">{pay.date}</span>
                            {pay.note && <span className="text-[10px] th-text-muted truncate">· {pay.note}</span>}
                          </div>
                        </div>
                        {pay.link_finance === 1 ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            <LinkIcon size={9} /> {t("project.payment.linked")}
                          </span>
                        ) : (
                          <button
                            onClick={() => openLink(pay)}
                            className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Link size={9} /> {t("project.payment.linkNow")}
                          </button>
                        )}
                        <button onClick={() => setDeletePayTarget(pay)} className="p-1 rounded th-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Worker form modal */}
      {showWorkerForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b th-border">
              <h2 className="text-sm font-semibold th-text">{editWorker ? t("project.worker.edit") : t("project.worker.new")}</h2>
              <button onClick={() => setShowWorkerForm(false)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.worker.name")} *</label>
                  <input value={workerForm.name} onChange={e => setWorkerForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama..." className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.worker.role")}</label>
                  <input value={workerForm.role} onChange={e => setWorkerForm(f => ({ ...f, role: e.target.value }))} placeholder="Mandor, Tukang..." className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.worker.rateType")}</label>
                  <select value={workerForm.rate_type} onChange={e => setWorkerForm(f => ({ ...f, rate_type: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                    {RATE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.worker.rateAmount")}</label>
                  <input type="number" value={workerForm.rate_amount} onChange={e => setWorkerForm(f => ({ ...f, rate_amount: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.worker.status")}</label>
                <div className="flex gap-2">
                  {[{ v: "active", l: "Aktif" }, { v: "done", l: "Selesai" }].map(s => (
                    <button key={s.v} onClick={() => setWorkerForm(f => ({ ...f, status: s.v }))}
                      className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", workerForm.status === s.v ? "bg-brand-600 text-white border-brand-600" : "th-bg-elevated th-text-muted th-border")}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.worker.note")}</label>
                <input value={workerForm.note} onChange={e => setWorkerForm(f => ({ ...f, note: e.target.value }))} placeholder="Catatan..." className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t th-border">
              <button onClick={() => setShowWorkerForm(false)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">{t("common.cancel")}</button>
              <button onClick={handleSaveWorker} disabled={savingWorker || !workerForm.name.trim()} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50">{savingWorker ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment form modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b th-border">
              <div>
                <h2 className="text-sm font-semibold th-text">{t("project.payment.new")}</h2>
                <p className="text-xs th-text-muted mt-0.5">{payTarget.name}</p>
              </div>
              <button onClick={() => setPayTarget(null)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.payment.amount")} *</label>
                  <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.payment.date")}</label>
                  <input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.payment.note")}</label>
                <input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional..." className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500" />
              </div>

              {/* Finance link toggle */}
              <div className={clsx("rounded-xl border p-3 transition-all", payForm.link_finance ? "border-emerald-500/30 bg-emerald-500/5" : "th-border th-bg-elevated")}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setPayForm(f => ({ ...f, link_finance: !f.link_finance }))}
                    className={clsx("w-9 h-5 rounded-full transition-all relative shrink-0", payForm.link_finance ? "bg-emerald-500" : "th-bg-base border th-border")}
                  >
                    <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", payForm.link_finance ? "left-4" : "left-0.5")} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold th-text">{t("project.payment.linkFinance")}</p>
                    <p className="text-[11px] th-text-muted mt-0.5">{t("project.payment.linkFinanceDesc")}</p>
                  </div>
                </label>
                {payForm.link_finance && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label className="text-xs font-medium th-text-muted block mb-1">{t("project.payment.account")}</label>
                      <select value={payForm.account_id} onChange={e => setPayForm(f => ({ ...f, account_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                        <option value="">Pilih akun...</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium th-text-muted block mb-1">{t("project.payment.category")}</label>
                      <select value={payForm.category_id} onChange={e => setPayForm(f => ({ ...f, category_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                        <option value="">Pilih kategori...</option>
                        {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t th-border">
              <button onClick={() => setPayTarget(null)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">{t("common.cancel")}</button>
              <button onClick={handleSavePay} disabled={savingPay || !payForm.amount} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50">{savingPay ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Link finance for existing payment */}
      {linkPayTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-sm shadow-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold th-text">{t("project.payment.linkNow")}</h2>
            <p className="text-xs th-text-muted">{t("project.payment.linkFinanceDesc")}</p>
            <p className="text-sm font-bold th-text">{fmt(linkPayTarget.amount)} · {linkPayTarget.date}</p>
            <div>
              <label className="text-xs font-medium th-text-muted block mb-1">{t("project.payment.account")}</label>
              <select value={linkForm.account_id} onChange={e => setLinkForm(f => ({ ...f, account_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                <option value="">Pilih akun...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium th-text-muted block mb-1">{t("project.payment.category")}</label>
              <select value={linkForm.category_id} onChange={e => setLinkForm(f => ({ ...f, category_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                <option value="">Pilih kategori...</option>
                {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setLinkPayTarget(null)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">{t("common.cancel")}</button>
              <button onClick={handleSaveLink} disabled={savingLink} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50">{savingLink ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete worker confirm */}
      {deleteWorkerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-sm shadow-xl p-5 space-y-4">
            <p className="text-sm th-text-muted">{t("project.worker.deleteConfirm")}</p>
            <p className="text-sm font-semibold th-text">"{deleteWorkerTarget.name}"</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteWorkerTarget(null)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">{t("common.cancel")}</button>
              <button onClick={handleDeleteWorker} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-semibold">{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete payment confirm */}
      {deletePayTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-sm shadow-xl p-5 space-y-4">
            <p className="text-sm th-text-muted">{t("project.payment.deleteConfirm")}</p>
            <p className="text-sm font-semibold th-text">{fmt(deletePayTarget.amount)} · {deletePayTarget.date}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletePayTarget(null)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">{t("common.cancel")}</button>
              <button onClick={handleDeletePay} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-semibold">{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
