"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { clsx } from "clsx";
import { Plus, Pencil, Trash2, X, MapPin, Tag } from "lucide-react";
import {
  listLocations, createLocation, updateLocation, deleteLocation,
  listCategories, createCategory, updateCategory, deleteCategory,
} from "@/lib/inventoryApi";
import type { InvLocation, InvCategory } from "@/types";

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#78716c",
];

const INPUT = "w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500";

export function SettingsPanel() {
  const t = useT();
  const [section, setSection] = useState<"locations" | "categories">("locations");

  return (
    <div className="p-4 flex flex-col gap-4 max-w-lg">
      {/* Section switcher */}
      <div className="flex rounded-xl overflow-hidden border th-border">
        <button
          onClick={() => setSection("locations")}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-colors",
            section === "locations" ? "bg-brand-600 text-white" : "th-text-muted hover:th-text th-bg-elevated"
          )}
        >
          <MapPin size={13} />
          {t("inventory.settings.locations")}
        </button>
        <button
          onClick={() => setSection("categories")}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-colors",
            section === "categories" ? "bg-brand-600 text-white" : "th-text-muted hover:th-text th-bg-elevated"
          )}
        >
          <Tag size={13} />
          {t("inventory.settings.categories")}
        </button>
      </div>

      {section === "locations" && <LocationsSection />}
      {section === "categories" && <CategoriesSection />}
    </div>
  );
}

/* ─── Locations ─────────────────────────────────────────────────────────── */

function LocationsSection() {
  const t = useT();
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InvLocation | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setLocations(await listLocations()); } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setName("");
    setNote("");
    setShowForm(true);
  };

  const openEdit = (loc: InvLocation) => {
    setEditing(loc);
    setName(loc.name);
    setNote(loc.note ?? "");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateLocation(editing.id, { name: name.trim(), ...(note.trim() && { note: note.trim() }) });
      } else {
        await createLocation({ name: name.trim(), ...(note.trim() && { note: note.trim() }) });
      }
      setShowForm(false);
      load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("inventory.settings.location.deleteConfirm"))) return;
    try { await deleteLocation(id); load(); }
    catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b th-border">
        <span className="text-xs font-semibold th-text-muted uppercase tracking-wide">
          {t("inventory.settings.locations")}
        </span>
        <button
          onClick={openNew}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <Plus size={12} />{t("inventory.settings.location.new")}
        </button>
      </div>

      <div className="p-3 flex flex-col gap-1">
        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && locations.length === 0 && (
          <p className="text-sm th-text-muted text-center py-4">{t("inventory.settings.location.empty")}</p>
        )}

        {locations.map((loc) => (
          <div key={loc.id} className="flex items-center gap-3 px-3 py-2 th-bg-elevated rounded-lg">
            <MapPin size={14} className="th-text-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm th-text font-medium">{loc.name}</div>
              {loc.note && <div className="text-xs th-text-muted truncate">{loc.note}</div>}
            </div>
            <button onClick={() => openEdit(loc)} className="th-text-muted hover:th-text transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={() => handleDelete(loc.id)} className="th-text-muted hover:text-red-400 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="th-bg-surface border th-border rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b th-border">
              <span className="font-semibold th-text text-sm">
                {editing ? t("inventory.settings.location.edit") : t("inventory.settings.location.new")}
              </span>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <Field label={t("inventory.settings.location.name")}>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label={t("inventory.settings.location.note")}>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={INPUT}
                />
              </Field>
            </div>
            <div className="flex gap-2 justify-end px-4 py-3 border-t th-border">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg border th-border th-text-muted hover:th-text transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
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

/* ─── Categories ────────────────────────────────────────────────────────── */

function CategoriesSection() {
  const t = useT();
  const [categories, setCategories] = useState<InvCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InvCategory | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setCategories(await listCategories()); } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setName("");
    setColor(COLORS[0]);
    setShowForm(true);
  };

  const openEdit = (cat: InvCategory) => {
    setEditing(cat);
    setName(cat.name);
    setColor(cat.color);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateCategory(editing.id, { name: name.trim(), color });
      } else {
        await createCategory({ name: name.trim(), color });
      }
      setShowForm(false);
      load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("inventory.settings.category.deleteConfirm"))) return;
    try { await deleteCategory(id); load(); }
    catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b th-border">
        <span className="text-xs font-semibold th-text-muted uppercase tracking-wide">
          {t("inventory.settings.categories")}
        </span>
        <button
          onClick={openNew}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <Plus size={12} />{t("inventory.settings.category.new")}
        </button>
      </div>

      <div className="p-3 flex flex-col gap-1">
        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && categories.length === 0 && (
          <p className="text-sm th-text-muted text-center py-4">{t("inventory.settings.category.empty")}</p>
        )}

        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3 px-3 py-2 th-bg-elevated rounded-lg">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm th-text font-medium">{cat.name}</div>
              <div className="text-xs th-text-muted">{cat.item_count} item</div>
            </div>
            <button onClick={() => openEdit(cat)} className="th-text-muted hover:th-text transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={() => handleDelete(cat.id)} className="th-text-muted hover:text-red-400 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="th-bg-surface border th-border rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b th-border">
              <span className="font-semibold th-text text-sm">
                {editing ? t("inventory.settings.category.edit") : t("inventory.settings.category.new")}
              </span>
              <button onClick={() => setShowForm(false)} className="th-text-muted hover:th-text"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <Field label={t("inventory.settings.category.name")}>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label={t("inventory.settings.category.color")}>
                <div className="flex flex-wrap gap-2 pt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={clsx(
                        "w-7 h-7 rounded-full transition-transform",
                        color === c ? "scale-125 ring-2 ring-offset-2 ring-brand-500" : "hover:scale-110"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </Field>
            </div>
            <div className="flex gap-2 justify-end px-4 py-3 border-t th-border">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg border th-border th-text-muted hover:th-text transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs th-text-muted">{label}</label>
      {children}
    </div>
  );
}
