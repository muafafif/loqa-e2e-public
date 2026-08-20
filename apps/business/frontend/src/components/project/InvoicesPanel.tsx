"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { listInvoices, createInvoice, updateInvoice, updateInvoiceLink, deleteInvoice } from "@/lib/projectApi";
import { listAccounts, listCategories } from "@/lib/financeApi";
import type { Project, ProjectInvoice, InvoiceStatus, Account, Category } from "@/types";
import { Plus, Pencil, Trash2, X, Link, LinkIcon } from "lucide-react";
import { clsx } from "clsx";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const STATUS_OPTIONS: { value: InvoiceStatus; label: string; color: string }[] = [
  { value: "draft",      label: "Draft",      color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" },
  { value: "sent",       label: "Terkirim",   color: "bg-sky-500/15 text-sky-400 border-sky-500/20" },
  { value: "paid",       label: "Lunas",      color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  { value: "cancelled",  label: "Dibatalkan", color: "bg-red-500/15 text-red-400 border-red-500/20" },
];

const EMPTY_FORM = {
  invoice_number: "", amount: "", status: "draft" as InvoiceStatus,
  issued_date: new Date().toISOString().slice(0, 10),
  due_date: "", paid_date: "", note: "",
  link_finance: false, account_id: "", category_id: "",
};

export function InvoicesPanel({ project }: { project: Project }) {
  const t = useT();
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectInvoice | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectInvoice | null>(null);
  const [linkTarget, setLinkTarget] = useState<ProjectInvoice | null>(null);
  const [linkForm, setLinkForm] = useState({ account_id: "", category_id: "" });
  const [savingLink, setSavingLink] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | InvoiceStatus>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, acc, cats] = await Promise.all([
        listInvoices(project.id),
        listAccounts(),
        listCategories("income"),
      ]);
      setInvoices(inv);
      setAccounts(acc);
      setIncomeCategories(cats);
    } catch {}
    finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  const totalSent = invoices.filter(i => ["sent", "paid"].includes(i.status)).reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalPending = invoices.filter(i => i.status === "sent").reduce((s, i) => s + i.amount, 0);

  const openNew = () => {
    setEditTarget(null);
    // Auto-generate invoice number
    const next = `INV-${project.id.toString().padStart(3, "0")}-${String(invoices.length + 1).padStart(3, "0")}`;
    setForm({ ...EMPTY_FORM, invoice_number: next });
    setShowForm(true);
  };
  const openEdit = (inv: ProjectInvoice) => {
    setEditTarget(inv);
    setForm({
      invoice_number: inv.invoice_number,
      amount: String(inv.amount),
      status: inv.status,
      issued_date: inv.issued_date,
      due_date: inv.due_date ?? "",
      paid_date: inv.paid_date ?? "",
      note: inv.note ?? "",
      link_finance: false,
      account_id: "",
      category_id: "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.invoice_number.trim() || !form.amount) return;
    setSaving(true);
    try {
      if (editTarget) {
        await updateInvoice(editTarget.id, {
          invoice_number: form.invoice_number.trim(),
          amount: parseFloat(form.amount),
          status: form.status,
          issued_date: form.issued_date,
          due_date: form.due_date || undefined,
          paid_date: form.paid_date || undefined,
          note: form.note.trim() || undefined,
        });
      } else {
        await createInvoice(project.id, {
          invoice_number: form.invoice_number.trim(),
          amount: parseFloat(form.amount),
          status: form.status,
          issued_date: form.issued_date,
          due_date: form.due_date || undefined,
          paid_date: form.paid_date || undefined,
          note: form.note.trim() || undefined,
          link_finance: form.link_finance,
          account_id: form.link_finance && form.account_id ? parseInt(form.account_id) : undefined,
          category_id: form.link_finance && form.category_id ? parseInt(form.category_id) : undefined,
        });
      }
      setShowForm(false);
      await load();
    } catch {}
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteInvoice(deleteTarget.id); setDeleteTarget(null); await load(); } catch {}
  };

  const openLink = (inv: ProjectInvoice) => { setLinkTarget(inv); setLinkForm({ account_id: "", category_id: "" }); };
  const handleSaveLink = async () => {
    if (!linkTarget) return;
    setSavingLink(true);
    try {
      await updateInvoiceLink(linkTarget.id, {
        link_finance: true,
        account_id: linkForm.account_id ? parseInt(linkForm.account_id) : undefined,
        category_id: linkForm.category_id ? parseInt(linkForm.category_id) : undefined,
      });
      setLinkTarget(null);
      await load();
    } catch {}
    finally { setSavingLink(false); }
  };

  const filtered = filterStatus === "all" ? invoices : invoices.filter(i => i.status === filterStatus);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b th-border glass-surface shrink-0 flex-wrap">
        <div className="flex-1">
          <h2 className="text-sm font-semibold th-text">{t("project.invoices")} — {project.name}</h2>
          <p className="text-xs th-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{t("project.invoice.totalSent")}: <span className="text-sky-400 font-semibold">{fmt(totalSent)}</span></span>
            <span>·</span>
            <span>{t("project.invoice.totalPaid")}: <span className="text-emerald-400 font-semibold">{fmt(totalPaid)}</span></span>
            <span>·</span>
            <span>{t("project.invoice.totalPending")}: <span className="text-amber-400 font-semibold">{fmt(totalPending)}</span></span>
          </p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(["all", "draft", "sent", "paid", "cancelled"] as ("all" | InvoiceStatus)[]).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={clsx("px-2 py-1 rounded-lg text-xs font-medium transition-all", filterStatus === s ? "bg-brand-600 text-white" : "th-bg-elevated th-text-muted hover:th-text")}>
              {s === "all" ? "Semua" : STATUS_OPTIONS.find(o => o.value === s)?.label}
            </button>
          ))}
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors">
          <Plus size={13} /> {t("project.invoice.new")}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="text-center py-10 text-sm th-text-muted">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm th-text-muted">{t("project.invoice.empty")}</div>
        ) : (
          filtered.map(inv => {
            const statusOpt = STATUS_OPTIONS.find(o => o.value === inv.status)!;
            const isOverdue = inv.status === "sent" && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10);
            return (
              <div key={inv.id} className="th-bg-surface rounded-2xl border th-border hover:border-brand-500/20 transition-all">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold th-text">{inv.invoice_number}</span>
                      <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", statusOpt.color)}>
                        {statusOpt.label}
                      </span>
                      {isOverdue && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                          Jatuh Tempo
                        </span>
                      )}
                      {inv.link_finance === 1 && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          <LinkIcon size={9} /> {t("project.invoice.linked")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs th-text-muted">
                      <span>Terbit: {inv.issued_date}</span>
                      {inv.due_date && <span>JT: {inv.due_date}</span>}
                      {inv.paid_date && <span>Lunas: {inv.paid_date}</span>}
                      {inv.note && <span className="truncate max-w-[200px]">{inv.note}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 mr-2">
                    <span className="text-base font-bold th-text">{fmt(inv.amount)}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {inv.link_finance === 0 && (
                      <button onClick={() => openLink(inv)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                        <Link size={11} /> Link
                      </button>
                    )}
                    <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg th-text-muted hover:th-text hover:th-bg-elevated">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteTarget(inv)} className="p-1.5 rounded-lg th-text-muted hover:text-red-400 hover:th-bg-elevated">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
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
              <h2 className="text-sm font-semibold th-text">{editTarget ? t("project.invoice.edit") : t("project.invoice.new")}</h2>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.number")} *</label>
                  <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.amount")} *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              {/* Status */}
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.status")}</label>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUS_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setForm(f => ({ ...f, status: o.value }))}
                      className={clsx("px-2.5 py-1 rounded-lg text-xs font-medium border transition-all", form.status === o.value ? o.color : "th-bg-elevated th-text-muted th-border")}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Dates */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.issuedDate")}</label>
                  <input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-xs th-text focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.dueDate")}</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-xs th-text focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.paidDate")}</label>
                  <input type="date" value={form.paid_date} onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-xs th-text focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.note")}</label>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional..." className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text placeholder:th-text-muted focus:outline-none focus:border-brand-500" />
              </div>

              {/* Finance link — hanya saat create baru */}
              {!editTarget && (
                <div className={clsx("rounded-xl border p-3 transition-all", form.link_finance ? "border-emerald-500/30 bg-emerald-500/5" : "th-border th-bg-elevated")}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => setForm(f => ({ ...f, link_finance: !f.link_finance }))}
                      className={clsx("w-9 h-5 rounded-full transition-all relative shrink-0", form.link_finance ? "bg-emerald-500" : "th-bg-base border th-border")}>
                      <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", form.link_finance ? "left-4" : "left-0.5")} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold th-text">{t("project.invoice.linkFinance")}</p>
                      <p className="text-[11px] th-text-muted mt-0.5">{t("project.invoice.linkFinanceDesc")}</p>
                    </div>
                  </label>
                  {form.link_finance && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div>
                        <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.account")}</label>
                        <select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                          <option value="">Pilih akun...</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.category")}</label>
                        <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                          <option value="">Pilih kategori...</option>
                          {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t th-border shrink-0">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">{t("common.cancel")}</button>
              <button onClick={handleSave} disabled={saving || !form.invoice_number.trim() || !form.amount} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50">{saving ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Link finance modal */}
      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-sm shadow-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold th-text">{t("project.invoice.linkNow")}</h2>
            <p className="text-xs th-text-muted">{t("project.invoice.linkFinanceDesc")}</p>
            <p className="text-sm font-bold th-text">{linkTarget.invoice_number} — {fmt(linkTarget.amount)}</p>
            <div>
              <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.account")}</label>
              <select value={linkForm.account_id} onChange={e => setLinkForm(f => ({ ...f, account_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                <option value="">Pilih akun...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium th-text-muted block mb-1">{t("project.invoice.category")}</label>
              <select value={linkForm.category_id} onChange={e => setLinkForm(f => ({ ...f, category_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl th-bg-elevated border th-border text-sm th-text focus:outline-none focus:border-brand-500">
                <option value="">Pilih kategori...</option>
                {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setLinkTarget(null)} className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm">{t("common.cancel")}</button>
              <button onClick={handleSaveLink} disabled={savingLink} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50">{savingLink ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="th-bg-surface rounded-2xl border th-border w-full max-w-sm shadow-xl p-5 space-y-4">
            <p className="text-sm th-text-muted">{t("project.invoice.deleteConfirm")}</p>
            <p className="text-sm font-semibold th-text">{deleteTarget.invoice_number} — {fmt(deleteTarget.amount)}</p>
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
