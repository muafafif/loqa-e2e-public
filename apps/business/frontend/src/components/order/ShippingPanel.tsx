"use client";

import { useState, useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { clsx } from "clsx";
import { Plus, Pencil, Trash2, Upload, MapPin, Building2, Map, Home } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  listCities, createCity, updateCity, deleteCity,
  listDistricts, createDistrict, updateDistrict, deleteDistrict,
  listVillages, createVillage, updateVillage, deleteVillage,
  listAddresses, createAddress, updateAddress, deleteAddress,
  importWilayahCsv,
} from "@/lib/orderApi";
import type { City, District, Village, ShippingAddress } from "@/types";

type Tab = "cities" | "districts" | "villages" | "addresses";

export function ShippingPanel() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("cities");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "cities",    label: t("order.shipping.cities"),    icon: <Building2 size={13} /> },
    { id: "districts", label: t("order.shipping.districts"), icon: <Map size={13} /> },
    { id: "villages",  label: t("order.shipping.villages"),  icon: <MapPin size={13} /> },
    { id: "addresses", label: t("order.shipping.addresses"), icon: <Home size={13} /> },
  ];

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center border-b th-border px-4 gap-0 overflow-x-auto shrink-0">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-3 text-xs border-b-2 transition-colors whitespace-nowrap",
              tab === id ? "border-brand-500 th-text" : "border-transparent th-text-muted hover:th-text"
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "cities"    && <CitiesTab />}
        {tab === "districts" && <DistrictsTab />}
        {tab === "villages"  && <VillagesTab />}
        {tab === "addresses" && <AddressesTab />}
      </div>
    </div>
  );
}

// ── Cities ────────────────────────────────────────────────────────────────────

function CitiesTab() {
  const t = useT();
  const [items, setItems] = useState<City[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => listCities().then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditId(null); setName(""); setShowForm(true); };
  const openEdit = (c: City) => { setEditId(c.id); setName(c.name); setShowForm(true); };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editId) await updateCity(editId, name.trim());
      else await createCity(name.trim());
      setShowForm(false);
      load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("order.shipping.city.deleteConfirm"))) return;
    try { await deleteCity(id); load(); } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await importWilayahCsv(file);
      setImportMsg(t("order.shipping.importResult")
        .replace("{cities}", String(res.cities))
        .replace("{districts}", String(res.districts))
        .replace("{villages}", String(res.villages)));
      load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold th-text">{t("order.shipping.cities")}</span>
        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border th-border th-text-muted hover:th-text transition-colors"
          >
            <Upload size={13} />{t("order.shipping.importCsv")}
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            <Plus size={13} />{t("order.shipping.city.new")}
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
      </div>

      {importMsg && (
        <p className="text-xs text-green-400 th-bg-surface border th-border px-3 py-2 rounded-lg">{importMsg}</p>
      )}

      <p className="text-xs th-text-muted">{t("order.shipping.importCsvDesc")}</p>

      {showForm && (
        <div className="card p-3 flex flex-col gap-2">
          <span className="text-xs font-semibold th-text">{editId ? t("order.shipping.city.edit") : t("order.shipping.city.new")}</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={t("order.shipping.city.name")}
            className="text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs px-3 py-1.5 rounded-lg border th-border th-text-muted hover:th-text transition-colors">Cancel</button>
            <button onClick={handleSave} className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">Save</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("order.shipping.city.empty")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 th-bg-surface border th-border rounded-lg">
              <span className="flex-1 text-sm th-text">{c.name}</span>
              <button onClick={() => openEdit(c)} className="th-text-muted hover:th-text transition-colors"><Pencil size={13} /></button>
              <button onClick={() => handleDelete(c.id)} className="th-text-muted hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Districts ─────────────────────────────────────────────────────────────────

function DistrictsTab() {
  const t = useT();
  const [cities, setCities] = useState<City[]>([]);
  const [items, setItems] = useState<District[]>([]);
  const [filterCityId, setFilterCityId] = useState<number | undefined>();
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState<number | "">("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { listCities().then(setCities).catch(() => {}); }, []);
  const load = () => listDistricts(filterCityId).then(setItems).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filterCityId]);

  const openNew = () => { setEditId(null); setName(""); setCityId(""); setShowForm(true); };
  const openEdit = (d: District) => { setEditId(d.id); setName(d.name); setCityId(d.city_id); setShowForm(true); };

  const handleSave = async () => {
    if (!name.trim() || !cityId) return;
    try {
      if (editId) await updateDistrict(editId, name.trim());
      else await createDistrict(Number(cityId), name.trim());
      setShowForm(false); load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("order.shipping.district.deleteConfirm"))) return;
    try { await deleteDistrict(id); load(); } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold th-text">{t("order.shipping.districts")}</span>
        <button onClick={openNew} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">
          <Plus size={13} />{t("order.shipping.district.new")}
        </button>
      </div>

      <SearchableSelect
        value={filterCityId?.toString() ?? ""}
        onChange={(v) => setFilterCityId(v ? Number(v) : undefined)}
        clearable
        placeholder="Semua Kota"
        options={cities.map((c) => ({ value: String(c.id), label: c.name }))}
      />

      {showForm && (
        <div className="card p-3 flex flex-col gap-2">
          <span className="text-xs font-semibold th-text">{editId ? t("order.shipping.district.edit") : t("order.shipping.district.new")}</span>
          {!editId && (
            <SearchableSelect
              value={cityId?.toString() ?? ""}
              onChange={(v) => setCityId(v ? Number(v) : "")}
              placeholder={`${t("order.shipping.district.city")}…`}
              options={cities.map((c) => ({ value: String(c.id), label: c.name }))}
            />
          )}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={t("order.shipping.district.name")}
            className="text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs px-3 py-1.5 rounded-lg border th-border th-text-muted hover:th-text transition-colors">Cancel</button>
            <button onClick={handleSave} className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">Save</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("order.shipping.district.empty")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2 th-bg-surface border th-border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="text-sm th-text">{d.name}</div>
                <div className="text-xs th-text-muted">{d.city_name}</div>
              </div>
              <button onClick={() => openEdit(d)} className="th-text-muted hover:th-text transition-colors"><Pencil size={13} /></button>
              <button onClick={() => handleDelete(d.id)} className="th-text-muted hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Villages ──────────────────────────────────────────────────────────────────

function VillagesTab() {
  const t = useT();
  const [districts, setDistricts] = useState<District[]>([]);
  const [items, setItems] = useState<Village[]>([]);
  const [filterDistrictId, setFilterDistrictId] = useState<number | undefined>();
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [districtId, setDistrictId] = useState<number | "">("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { listDistricts().then(setDistricts).catch(() => {}); }, []);
  const load = () => listVillages(filterDistrictId).then(setItems).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filterDistrictId]);

  const openNew = () => { setEditId(null); setName(""); setDistrictId(""); setShowForm(true); };
  const openEdit = (v: Village) => { setEditId(v.id); setName(v.name); setDistrictId(v.district_id); setShowForm(true); };

  const handleSave = async () => {
    if (!name.trim() || !districtId) return;
    try {
      if (editId) await updateVillage(editId, name.trim());
      else await createVillage(Number(districtId), name.trim());
      setShowForm(false); load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("order.shipping.village.deleteConfirm"))) return;
    try { await deleteVillage(id); load(); } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold th-text">{t("order.shipping.villages")}</span>
        <button onClick={openNew} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">
          <Plus size={13} />{t("order.shipping.village.new")}
        </button>
      </div>

      <SearchableSelect
        value={filterDistrictId?.toString() ?? ""}
        onChange={(v) => setFilterDistrictId(v ? Number(v) : undefined)}
        clearable
        placeholder="Semua Kecamatan"
        options={districts.map((d) => ({ value: String(d.id), label: `${d.name} – ${d.city_name}` }))}
      />

      {showForm && (
        <div className="card p-3 flex flex-col gap-2">
          <span className="text-xs font-semibold th-text">{editId ? t("order.shipping.village.edit") : t("order.shipping.village.new")}</span>
          {!editId && (
            <SearchableSelect
              value={districtId?.toString() ?? ""}
              onChange={(v) => setDistrictId(v ? Number(v) : "")}
              placeholder={`${t("order.shipping.village.district")}…`}
              options={districts.map((d) => ({ value: String(d.id), label: `${d.name} – ${d.city_name}` }))}
            />
          )}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={t("order.shipping.village.name")}
            className="text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs px-3 py-1.5 rounded-lg border th-border th-text-muted hover:th-text transition-colors">Cancel</button>
            <button onClick={handleSave} className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">Save</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("order.shipping.village.empty")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-3 py-2 th-bg-surface border th-border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="text-sm th-text">{v.name}</div>
                <div className="text-xs th-text-muted">{v.district_name} · {v.city_name}</div>
              </div>
              <button onClick={() => openEdit(v)} className="th-text-muted hover:th-text transition-colors"><Pencil size={13} /></button>
              <button onClick={() => handleDelete(v.id)} className="th-text-muted hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Addresses ─────────────────────────────────────────────────────────────────

function AddressesTab() {
  const t = useT();
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    label: "", recipient_name: "", phone: "",
    city_id: "" as number | "", district_id: "" as number | "", village_id: "" as number | "",
    detail: "",
  });

  const load = () => listAddresses().then(setAddresses).catch(() => {});
  useEffect(() => { load(); listCities().then(setCities).catch(() => {}); }, []);
  useEffect(() => {
    if (!form.city_id) { setDistricts([]); return; }
    listDistricts(Number(form.city_id)).then(setDistricts).catch(() => {});
    setForm((f) => ({ ...f, district_id: "", village_id: "" }));
  }, [form.city_id]);
  useEffect(() => {
    if (!form.district_id) { setVillages([]); return; }
    listVillages(Number(form.district_id)).then(setVillages).catch(() => {});
    setForm((f) => ({ ...f, village_id: "" }));
  }, [form.district_id]);

  const openNew = () => {
    setEditId(null);
    setForm({ label: "", recipient_name: "", phone: "", city_id: "", district_id: "", village_id: "", detail: "" });
    setShowForm(true);
  };
  const openEdit = (a: ShippingAddress) => {
    setEditId(a.id);
    setForm({
      label: a.label, recipient_name: a.recipient_name ?? "", phone: a.phone ?? "",
      city_id: a.city_id ?? "", district_id: a.district_id ?? "", village_id: a.village_id ?? "",
      detail: a.detail ?? "",
    });
    setShowForm(true);
  };

  const setF = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.label.trim()) return;
    const body = {
      label: form.label.trim(),
      recipient_name: form.recipient_name || undefined,
      phone: form.phone || undefined,
      city_id: form.city_id ? Number(form.city_id) : undefined,
      district_id: form.district_id ? Number(form.district_id) : undefined,
      village_id: form.village_id ? Number(form.village_id) : undefined,
      detail: form.detail || undefined,
    };
    try {
      if (editId) await updateAddress(editId, body);
      else await createAddress(body as Parameters<typeof createAddress>[0]);
      setShowForm(false); load();
    } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("order.shipping.address.deleteConfirm"))) return;
    try { await deleteAddress(id); load(); } catch (err) { alert(err instanceof Error ? err.message : "Error"); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold th-text">{t("order.shipping.addresses")}</span>
        <button onClick={openNew} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">
          <Plus size={13} />{t("order.shipping.address.new")}
        </button>
      </div>

      {showForm && (
        <div className="card p-3 flex flex-col gap-2">
          <span className="text-xs font-semibold th-text">{editId ? t("order.shipping.address.edit") : t("order.shipping.address.new")}</span>
          <input
            autoFocus
            value={form.label}
            onChange={(e) => setF("label", e.target.value)}
            placeholder={t("order.shipping.address.label")}
            className="text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.recipient_name}
              onChange={(e) => setF("recipient_name", e.target.value)}
              placeholder={t("order.shipping.address.recipient")}
              className="text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <input
              value={form.phone}
              onChange={(e) => setF("phone", e.target.value)}
              placeholder={t("order.shipping.address.phone")}
              className="text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <SearchableSelect
            value={form.city_id?.toString() ?? ""}
            onChange={(v) => setF("city_id", v ? Number(v) : "")}
            placeholder={`${t("order.shipping.address.city")}…`}
            options={cities.map((c) => ({ value: String(c.id), label: c.name }))}
          />
          <SearchableSelect
            value={form.district_id?.toString() ?? ""}
            onChange={(v) => setF("district_id", v ? Number(v) : "")}
            disabled={!form.city_id}
            placeholder={`${t("order.shipping.address.district")}…`}
            options={districts.map((d) => ({ value: String(d.id), label: d.name }))}
          />
          <SearchableSelect
            value={form.village_id?.toString() ?? ""}
            onChange={(v) => setF("village_id", v ? Number(v) : "")}
            disabled={!form.district_id}
            placeholder={`${t("order.shipping.address.village")}…`}
            options={villages.map((v) => ({ value: String(v.id), label: v.name }))}
          />
          <textarea
            value={form.detail}
            onChange={(e) => setF("detail", e.target.value)}
            placeholder={t("order.shipping.address.detail")}
            rows={2}
            className="text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs px-3 py-1.5 rounded-lg border th-border th-text-muted hover:th-text transition-colors">Cancel</button>
            <button onClick={handleSave} className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors">Save</button>
          </div>
        </div>
      )}

      {addresses.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("order.shipping.address.empty")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {addresses.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2 th-bg-surface border th-border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium th-text">{a.label}</div>
                <div className="text-xs th-text-muted">
                  {[a.recipient_name, a.phone].filter(Boolean).join(" · ")}
                </div>
                {a.city_name && (
                  <div className="text-xs th-text-muted">
                    {[a.village_name, a.district_name, a.city_name].filter(Boolean).join(", ")}
                  </div>
                )}
                {a.detail && <div className="text-xs th-text-muted">{a.detail}</div>}
              </div>
              <button onClick={() => openEdit(a)} className="th-text-muted hover:th-text transition-colors"><Pencil size={13} /></button>
              <button onClick={() => handleDelete(a.id)} className="th-text-muted hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
