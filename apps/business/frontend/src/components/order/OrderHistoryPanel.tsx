"use client";

import { useState, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { clsx } from "clsx";
import { Search, ChevronDown, ChevronUp, Trash2, XCircle, Package, Pencil, X, Image as ImageIcon } from "lucide-react";
import { PRODUCT_IMAGE_BASE } from "@/lib/inventoryApi";
import {
  listOrders, cancelOrder, deleteOrder, getOrder, updateOrder,
  listAddresses,
} from "@/lib/orderApi";
import { listAccounts } from "@/lib/financeApi";
import { listWarehouses } from "@/lib/inventoryApi";
import type { Order, OrderItem, OrderStatus, ShippingAddress, Account, Warehouse } from "@/types";
import { SearchableSelect } from "./SearchableSelect";

const FMT = new Intl.NumberFormat("id-ID");
function fmt(n: number) { return FMT.format(n); }

const ALL_STATUSES: OrderStatus[] = [
  "draft", "waiting_for_payment", "on_process", "completed", "cancelled",
];

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft:               ["waiting_for_payment", "on_process", "completed", "cancelled"],
  waiting_for_payment: ["draft", "on_process", "completed", "cancelled"],
  on_process:          ["completed", "cancelled"],
  completed:           ["cancelled"],
  cancelled:           [],
};

export function OrderHistoryPanel() {
  const t = useT();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listOrders({ q: q || undefined, status: status || undefined, limit: LIMIT, offset });
      setOrders(res.orders);
      setTotal(res.total);
    } catch {} finally {
      setLoading(false);
    }
  }, [q, status, offset]);

  useEffect(() => { setOffset(0); }, [q, status]);
  useEffect(() => { load(); }, [load]);

  const handleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); setExpandedOrder(null); return; }
    setExpandedId(id);
    try {
      const order = await getOrder(id);
      setExpandedOrder(order);
    } catch {}
  };

  const handleCancel = async (id: number) => {
    if (!confirm(t("order.history.cancelConfirm"))) return;
    try {
      await cancelOrder(id);
      load();
      if (expandedId === id) { setExpandedId(null); setExpandedOrder(null); }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDelete = async (id: number, orderNumber: string) => {
    if (!confirm(t("order.history.deleteConfirm", { orderNumber }))) return;
    try {
      await deleteOrder(id);
      load();
      if (expandedId === id) { setExpandedId(null); setExpandedOrder(null); }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  };

  const handleEditSaved = () => {
    setEditingOrder(null);
    load();
    setExpandedId(null);
    setExpandedOrder(null);
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("order.history.search")}
            className="w-full pl-8 pr-3 py-2 text-sm th-bg-surface th-text border th-border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="w-48">
          <SearchableSelect
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: t("order.history.allStatus") },
              ...ALL_STATUSES.map(s => ({
                value: s,
                label: t(`order.history.status.${s}` as any),
              })),
            ]}
          />
        </div>
      </div>

      {loading && <p className="text-sm th-text-muted">Loading…</p>}

      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-2 th-text-muted">
          <Package size={36} className="opacity-30" />
          <p className="text-sm font-medium">{t("order.history.empty")}</p>
          <p className="text-xs">{t("order.history.emptyHint")}</p>
        </div>
      )}

      {orders.map((order) => {
        const isExpanded = expandedId === order.id;
        const detail = isExpanded ? expandedOrder : null;
        const isCancellable = order.status !== "cancelled" && ALLOWED_TRANSITIONS[order.status].includes("cancelled");
        return (
          <div key={order.id} className="card overflow-hidden">
            {/* Header row */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:th-bg-elevated transition-colors"
              onClick={() => handleExpand(order.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs th-text-muted">{order.order_number}</span>
                  <StatusBadge status={order.status} />
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-sm th-text font-medium truncate">
                    {order.customer_name ?? "—"}
                  </span>
                  {order.customer_phone && (
                    <span className="text-xs th-text-muted">{order.customer_phone}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold th-text">{fmt(order.total_amount)}</div>
                <div className="text-xs th-text-muted">{order.date}</div>
              </div>
              <div className="th-text-muted">
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t th-border px-4 py-3 flex flex-col gap-3">
                {detail ? (
                  <>
                    {/* Items */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs th-text-muted border-b th-border">
                            <th className="w-9" />
                            <th className="text-left font-medium pb-1">Produk</th>
                            <th className="text-right font-medium pb-1 w-16">Qty</th>
                            <th className="text-right font-medium pb-1 w-24">Harga</th>
                            <th className="text-center font-medium pb-1 w-16">HPP</th>
                            <th className="text-right font-medium pb-1 w-24">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.items.map((item: OrderItem) => (
                            <tr key={item.id} className="border-b th-border last:border-0">
                              <td className="py-1.5 pr-2 w-9">
                                {item.product_image ? (
                                  <img
                                    src={`${PRODUCT_IMAGE_BASE}/${item.product_image}`}
                                    alt=""
                                    className="w-7 h-7 object-cover rounded border th-border"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded th-bg-elevated border th-border flex items-center justify-center">
                                    <ImageIcon size={10} className="th-text-muted opacity-30" />
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5">
                                <div className="th-text">{item.product_name}</div>
                                <div className="text-xs th-text-muted">{item.variant_name}</div>
                              </td>
                              <td className="text-right th-text py-1.5">{item.qty} {item.unit}</td>
                              <td className="text-right th-text py-1.5">{fmt(item.selling_price)}</td>
                              <td className="text-center py-1.5">
                                <span className="text-xs th-text-muted uppercase">{item.cost_method ?? "—"}</span>
                              </td>
                              <td className="text-right th-text font-medium py-1.5">{fmt(item.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {detail.warehouse_name && (
                        <>
                          <span className="th-text-muted">{t("order.history.warehouse")}</span>
                          <span className="th-text">{detail.warehouse_name}</span>
                        </>
                      )}
                      {detail.city_name && (
                        <>
                          <span className="th-text-muted">{t("order.history.shippingTo")}</span>
                          <span className="th-text">
                            {[detail.village_name, detail.district_name, detail.city_name].filter(Boolean).join(", ")}
                          </span>
                        </>
                      )}
                      {detail.note && (
                        <>
                          <span className="th-text-muted">{t("order.history.note")}</span>
                          <span className="th-text">{detail.note}</span>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs th-text-muted">Loading…</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 justify-end border-t th-border pt-2 flex-wrap">
                  {order.status !== "cancelled" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border th-border th-text-muted hover:text-brand-400 hover:border-brand-400 transition-colors"
                    >
                      <Pencil size={13} />
                      {t("order.history.edit")}
                    </button>
                  )}
                  {isCancellable && (
                    <button
                      onClick={() => handleCancel(order.id)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border th-border th-text-muted hover:text-amber-400 hover:border-amber-400 transition-colors"
                    >
                      <XCircle size={13} />
                      {t("order.history.cancel")}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(order.id, order.order_number)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border th-border th-text-muted hover:text-red-400 hover:border-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                    {t("order.history.delete")}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

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

      {/* Edit modal */}
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const t = useT();
  const styles: Record<OrderStatus, string> = {
    draft: "bg-zinc-500/15 text-zinc-400",
    waiting_for_payment: "bg-yellow-500/15 text-yellow-400",
    on_process: "bg-blue-500/15 text-blue-400",
    completed: "bg-emerald-500/15 text-emerald-400",
    cancelled: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", styles[status] ?? "bg-zinc-500/15 text-zinc-400")}>
      {t(`order.history.status.${status}` as any)}
    </span>
  );
}

function EditOrderModal({
  order, onClose, onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [customerName, setCustomerName] = useState(order.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(order.customer_phone ?? "");
  const [note, setNote] = useState(order.note ?? "");
  const [date, setDate] = useState(order.date);
  const [warehouseId, setWarehouseId] = useState<number | null>(order.warehouse_id);
  const [accountId, setAccountId] = useState<number | null>(order.account_id);
  const [addressId, setAddressId] = useState<number | null>(order.shipping_address_id);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listWarehouses(), listAccounts(), listAddresses()]).then(([whs, accs, addrs]) => {
      setWarehouses(whs);
      setAccounts(accs);
      setAddresses(addrs);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateOrder(order.id, {
        status,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        note: note || null,
        date,
        warehouse_id: warehouseId,
        account_id: accountId,
        shipping_address_id: addressId,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md th-bg-surface border th-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b th-border shrink-0">
          <div>
            <h2 className="font-semibold th-text">{t("order.history.editModal.title")}</h2>
            <p className="text-xs th-text-muted font-mono">{order.order_number}</p>
          </div>
          <button onClick={onClose} className="th-text-muted hover:th-text transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Status */}
          <div>
            <label className="text-xs th-text-muted mb-1 block">{t("order.history.editModal.status")}</label>
            <div className="flex flex-wrap gap-2">
              {/* Current status always shown as active */}
              <button
                key={order.status}
                disabled
                className="text-xs px-3 py-1.5 rounded-full border font-medium bg-brand-500 border-brand-500 text-white opacity-80"
              >
                {t(`order.history.status.${order.status}` as any)}
              </button>
              {/* Allowed transitions */}
              {ALLOWED_TRANSITIONS[order.status].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={clsx(
                    "text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
                    status === s && s !== order.status
                      ? "bg-brand-500 border-brand-500 text-white"
                      : "th-border th-text-muted hover:th-text"
                  )}
                >
                  {t(`order.history.status.${s}` as any)}
                </button>
              ))}
            </div>
            {order.status === "cancelled" && (
              <p className="text-xs th-text-muted mt-1">{t("order.history.editModal.cancelledLocked")}</p>
            )}
          </div>

          {/* Customer name */}
          <div>
            <label className="text-xs th-text-muted mb-1 block">{t("order.history.editModal.customerName")}</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Customer phone */}
          <div>
            <label className="text-xs th-text-muted mb-1 block">{t("order.history.editModal.customerPhone")}</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs th-text-muted mb-1 block">{t("order.history.editModal.date")}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Warehouse */}
          <div>
            <label className="text-xs th-text-muted mb-1 block">{t("order.history.editModal.warehouse")}</label>
            <SearchableSelect
              value={warehouseId?.toString() ?? ""}
              onChange={(v) => setWarehouseId(v ? parseInt(v) : null)}
              clearable
              placeholder={t("order.checkout.noWarehouse")}
              options={warehouses.map((w) => ({ value: w.id.toString(), label: w.name }))}
            />
          </div>

          {/* Account */}
          <div>
            <label className="text-xs th-text-muted mb-1 block">{t("order.history.editModal.account")}</label>
            <SearchableSelect
              value={accountId?.toString() ?? ""}
              onChange={(v) => setAccountId(v ? parseInt(v) : null)}
              clearable
              placeholder={t("order.checkout.noAccount")}
              options={accounts.map((a) => ({ value: a.id.toString(), label: a.name }))}
            />
          </div>

          {/* Address */}
          <div>
            <label className="text-xs th-text-muted mb-1 block">{t("order.history.editModal.address")}</label>
            <SearchableSelect
              value={addressId?.toString() ?? ""}
              onChange={(v) => setAddressId(v ? parseInt(v) : null)}
              clearable
              placeholder={t("order.checkout.noAddress")}
              options={addresses.map((a) => ({
                value: a.id.toString(),
                label: a.label,
                sublabel: a.city_name ?? undefined,
              }))}
            />
          </div>

          {/* Note */}
          <div>
            <label className="text-xs th-text-muted mb-1 block">{t("order.history.editModal.note")}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t th-border px-5 py-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-40 transition-colors"
          >
            {saving ? t("order.history.editModal.saving") : t("order.history.editModal.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
