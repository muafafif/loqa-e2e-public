"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Check } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { getOrderSettings, saveOrderSettings } from "@/lib/orderApi";
import { listAccounts } from "@/lib/financeApi";
import { listWarehouses } from "@/lib/inventoryApi";
import { listCategories as listFinanceCategories } from "@/lib/financeApi";
import type { Account, Warehouse, Category } from "@/types";

export function OrderSettingsPanel() {
  const t = useT();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [accountId, setAccountId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [costMethod, setCostMethod] = useState("fifo");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      getOrderSettings(),
      listAccounts(),
      listWarehouses(),
      listFinanceCategories("income"),
    ]).then(([settings, accs, whs, cats]) => {
      setAccountId(settings.default_account_id);
      setWarehouseId(settings.default_warehouse_id);
      setCategoryId(settings.default_category_id);
      setCostMethod(settings.default_cost_method ?? "fifo");
      setAccounts(accs);
      setWarehouses(whs);
      setCategories(cats);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveOrderSettings({
        default_account_id: accountId,
        default_warehouse_id: warehouseId,
        default_category_id: categoryId,
        default_cost_method: costMethod as "fifo" | "average" | "fixed",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 max-w-md flex flex-col gap-4">
      <Row label={t("order.settings.defaultAccount")}>
        <SearchableSelect
          value={accountId?.toString() ?? ""}
          onChange={(v) => setAccountId(v ? parseInt(v) : null)}
          clearable
          placeholder={t("order.checkout.noAccount")}
          options={accounts.map((a) => ({ value: a.id.toString(), label: a.name }))}
        />
      </Row>

      <Row label={t("order.settings.defaultWarehouse")}>
        <SearchableSelect
          value={warehouseId?.toString() ?? ""}
          onChange={(v) => setWarehouseId(v ? parseInt(v) : null)}
          clearable
          placeholder={t("order.checkout.noWarehouse")}
          options={warehouses.map((w) => ({ value: w.id.toString(), label: w.name }))}
        />
      </Row>

      <Row label={t("order.settings.defaultCategory")}>
        <SearchableSelect
          value={categoryId?.toString() ?? ""}
          onChange={(v) => setCategoryId(v ? parseInt(v) : null)}
          clearable
          placeholder={t("order.checkout.noCategory")}
          options={categories.map((c) => ({ value: c.id.toString(), label: c.name }))}
        />
      </Row>

      <Row label={t("order.settings.defaultCostMethod")}>
        <SearchableSelect
          value={costMethod}
          onChange={setCostMethod}
          options={[
            { value: "fifo", label: "FIFO" },
            { value: "average", label: "Average" },
            { value: "fixed", label: "Fixed" },
          ]}
        />
      </Row>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm hover:bg-brand-600 disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <Check size={12} />{t("order.settings.saved")}
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs th-text-muted">{label}</label>
      {children}
    </div>
  );
}
