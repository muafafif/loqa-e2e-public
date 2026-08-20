"use client";

import { useState, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { clsx } from "clsx";
import { Plus, Trash2, X, ChevronDown, ArrowLeftRight } from "lucide-react";
import { listMovements, createMovement, deleteMovement, listItems, listLocations } from "@/lib/inventoryApi";
import type { InvMovement, InvItem, InvLocation } from "@/types";

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);
}

export function MovementsPanel() {
  const t = useT();
  const [movements, setMovements] = useState<InvMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const [items, setItems] = useState<InvItem[]>([]);
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [filterItem, setFilterItem] = useState<number | "">("");

  // New movement form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    item_id: "" as number | "",
    location_id: "" as number | "",
    type: "in" as "in" | "out" | "adjustment",
    qty: "1",
    note: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMovements({
        item_id: filterItem || undefined,
        limit: LIMIT,
        offset,
      });
      setMovements(res.movements);
      setTotal(res.total);
    } catch {} finally { setLoading(false); }
  }, [filterItem, offset]);

  useEffect(() => { setOffset(0); }, [filterItem]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([listItems(), listLocations()])
      .then(([its, locs]) => { setItems(its); setLocations(locs); })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.item_id || !form.qty) return;
    setSaving(true);
    try {
      await createMovement({
        item_id: Number(form.item_id),
        location_id: form.location_id ? Number(form.location_id) : null,
        type: form.type,
        qty: parseFloat(form.qty),
        note: form.note || null,
        date: form.date,
      });
      setShowForm(false);
      setForm({
        item_id: "", location_id: "", type: "in", qty: "1",
        note: "", date: new Date().toISOString().slice(0, 10),
      });
      load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("inventory.movement.deleteConfirm"))) return;
    try { await deleteMovement(id); load(); }
    catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  const typeColor = {
    in:         "bg-green-500/15 text-green-400",
    out:        "bg-red-500/15 text-red-400",
    adjustment: "bg-zinc-500/15 th-text-muted",
  };

  const typeLabel = {
    in:         t("inventory.movement.type.in"),
    out:        t("inventory.movement.type.out"),
    adjustment: t("inventory.movement.type.adjustment"),
  };

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-3 th-bg-surface border-b th-border flex gap-2 flex-wrap shrink-0">
        <Sel
          value={filterItem}
          onChange={(v) => setFilterItem(v ? Number(v) : "")}
          options={[
            { value: "", label: t("inventory.movement.item") },
            ...items.map((i) => ({ value: i.id.toString(), label: i.name })),
          ]}
        />
        <button
          onClick={() => {
            setForm({ item_id: "", location_id: "", type: "in", qty: "1", note: "", date: new Date().toISOString().slice(0, 10) });
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors ml-auto"
        >
          <Plus size={14} />{t("inventory.movement.new")}
        </button>
      </div>

      {/* List */}
      <div className="p-4 flex flex-col gap-2">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && movements.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-2 th-text-muted">
            <ArrowLeftRight size={36} className="opacity-30" />
            <p className="text-sm">{t("inventory.movement.empty")}</p>
          </div>
        )}

        {movements.map((m) => (
          <div key={m.id} className="card px-4 py-3 flex items-center gap-3">
            <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", typeColor[m.type])}>
              {typeLabel[m.type]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm th-text font-medium truncate">{m.item_name}</div>
              <div className="text-xs th-text-muted">
                {m.date}
                {m.location_name && ` · ${m.location_name}`}
                {m.note && ` · ${m.note}`}
              </div>
            </div>
            <div className={clsx(
              "text-sm font-bold shrink-0",
              m.type === "in" ? "text-green-400" : m.type === "out" ? "text-red-400" : "th-text-muted"
            )}>
              {m.type === "in" ? "+" : m.type === "out" ? "−" : "="}{fmt(m.qty)} {m.unit}
            </div>
            <button
              onClick={() => handleDelete(m.id)}
              className="th-text-muted hover:text-red-400 transition-colors shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex justify-center gap-2 pt-2">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
              disabled={offset === 0}
              className="px-3 py-1.5 text-xs th-bg-surface border th-border th-text rounded-lg disabled:opacity-40 hover:th-bg-elevated transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs th-text-muted self-center">
              {offset + 1}–{Math.min(offset + LIMIT, total)} / {total}
            </span>
            <button
              onClick={() => setOffset((o) => o + LIMIT)}
              disabled={offset + LIMIT >= total}
              className="px-3 py-1.5 text-xs th-bg-surface border th-border th-text rounded-lg disabled:opacity-40 hover:th-bg-elevated transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* New movement modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="th-bg-surface border th-border rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b th-border">
              <span className="font-semibold th-text text-sm">{t("inventory.movement.new")}</span>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <Field label={t("inventory.movement.item")}>
                <Sel
                  value={form.item_id}
                  onChange={(v) => setForm((f) => ({ ...f, item_id: v ? Number(v) : "" }))}
                  options={[
                    { value: "", label: "— pilih barang —" },
                    ...items.map((i) => ({ value: i.id.toString(), label: i.name })),
                  ]}
                />
              </Field>

              {/* Type selector */}
              <Field label="Tipe">
                <div className="flex gap-2">
                  {(["in", "out", "adjustment"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setForm((f) => ({ ...f, type }))}
                      className={clsx(
                        "flex-1 text-xs py-2 rounded-lg border transition-colors",
                        form.type === type
                          ? type === "in" ? "bg-green-500/20 border-green-500/40 text-green-400"
                            : type === "out" ? "bg-red-500/20 border-red-500/40 text-red-400"
                            : "bg-zinc-500/20 border-zinc-500/40 th-text"
                          : "th-border th-text-muted hover:th-text"
                      )}
                    >
                      {typeLabel[type]}
                    </button>
                  ))}
                </div>
                {form.type === "adjustment" && (
                  <p className="text-xs th-text-muted mt-1">{t("inventory.movement.adjustHint")}</p>
                )}
              </Field>

              <Field label={t("inventory.movement.qty")}>
                <input
                  autoFocus
                  type="number" min={0}
                  value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                  className={INPUT}
                />
              </Field>

              <Field label={t("inventory.movement.location")}>
                <Sel
                  value={form.location_id}
                  onChange={(v) => setForm((f) => ({ ...f, location_id: v ? Number(v) : "" }))}
                  options={[
                    { value: "", label: t("inventory.item.noLocation") },
                    ...locations.map((l) => ({ value: l.id.toString(), label: l.name })),
                  ]}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("inventory.movement.date")}>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
                <Field label={t("inventory.movement.note")}>
                  <input
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
              </div>
            </div>
            <div className="flex gap-2 justify-end px-4 py-3 border-t th-border">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg border th-border th-text-muted hover:th-text transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.item_id}
                className="text-sm px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const INPUT = "w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs th-text-muted">{label}</label>
      {children}
    </div>
  );
}

function Sel({ value, onChange, options }: {
  value: number | string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 th-text-muted pointer-events-none" />
    </div>
  );
}
