"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import {
  Scan, Trash2, Plus, Minus, ShoppingCart, X, CheckCircle2,
  ChevronDown, ChevronUp, Calculator, Image as ImageIcon,
} from "lucide-react";
import { PRODUCT_IMAGE_BASE } from "@/lib/inventoryApi";
import {
  lookupBarcode, createOrder, listAddresses, getOrderSettings, searchProductsForKasir,
  type OrderCreatePayload,
} from "@/lib/orderApi";
import { listAccounts } from "@/lib/financeApi";
import { listWarehouses } from "@/lib/inventoryApi";
import { listCategories as listFinanceCategories } from "@/lib/financeApi";
import type {
  CartItem, BarcodeResult, ShippingAddress, Account, Warehouse, Category, KasirSuggestion,
} from "@/types";
import { SearchableSelect } from "./SearchableSelect";

const FMT = new Intl.NumberFormat("id-ID");
function fmt(n: number) { return FMT.format(n); }

function parseRawNumber(s: string): number {
  // Strip thousand separators (dots in id-ID) then parse
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

type OrderStatusOption = "draft" | "waiting_for_payment" | "on_process";

// ── Success overlay ────────────────────────────────────────────────────────────

function SuccessOverlay({ orderNumber, onDismiss }: { orderNumber: string; onDismiss: () => void }) {
  const t = useT();
  useEffect(() => {
    const id = setTimeout(onDismiss, 2800);
    return () => clearTimeout(id);
  }, [onDismiss]);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="th-bg-elevated border th-border rounded-2xl p-8 flex flex-col items-center gap-3 shadow-xl text-center max-w-xs">
        <CheckCircle2 size={48} className="text-green-400" />
        <p className="font-bold th-text text-lg">{t("order.kasir.success")}</p>
        <p className="text-sm th-text-muted font-mono">{orderNumber}</p>
        <p className="text-xs th-text-muted">{t("order.kasir.successHint")}</p>
      </div>
    </div>
  );
}

// ── Change calculator ──────────────────────────────────────────────────────────

function ChangeCalculator({ total }: { total: number }) {
  const t = useT();
  const [cashInput, setCashInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const cash = parseRawNumber(cashInput);
  const change = cash >= total ? cash - total : null;

  const quickAmounts = (() => {
    const amounts: number[] = [];
    const steps = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
    for (const s of steps) {
      const rounded = Math.ceil(total / s) * s;
      if (!amounts.includes(rounded) && amounts.length < 4) amounts.push(rounded);
    }
    return amounts;
  })();

  return (
    <div className="mt-3 pt-3 border-t th-border">
      <div className="flex items-center gap-1.5 mb-2">
        <Calculator size={12} className="th-text-muted" />
        <span className="text-xs font-medium th-text-muted">{t("order.kasir.change")}</span>
      </div>
      <div className="flex gap-1 flex-wrap mb-2">
        {quickAmounts.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setCashInput(fmt(a))}
            className="text-xs px-2 py-0.5 rounded th-bg-base border th-border th-text hover:bg-brand-500 hover:border-brand-500 hover:text-white transition-colors"
          >
            {fmt(a)}
          </button>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={cashInput}
        onChange={(e) => setCashInput(e.target.value)}
        placeholder={t("order.kasir.cashReceived")}
        className="w-full text-sm th-bg-base th-text border th-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 text-right font-mono"
      />
      {change !== null && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs th-text-muted">{t("order.kasir.changeAmount")}</span>
          <span className="text-base font-bold text-green-400 font-mono">{fmt(change)}</span>
        </div>
      )}
      {cashInput && cash < total && (
        <p className="mt-1 text-xs text-red-400 text-right">{t("order.kasir.cashInsufficient")}</p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function KasirPanel() {
  const t = useT();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // SKU suggestions
  const [suggestions, setSuggestions] = useState<KasirSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Order form state (right panel — always visible)
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [addressId, setAddressId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatusOption>("on_process");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<string | null>(null);

  // Collapsible sections in right panel
  const [showDetails, setShowDetails] = useState(false);
  const [showAccounting, setShowAccounting] = useState(false);

  // Dropdown data
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dropdownLoaded, setDropdownLoaded] = useState(false);

  // Load dropdown data once on mount
  useEffect(() => {
    Promise.all([
      listAddresses(),
      listWarehouses(),
      listAccounts(),
      listFinanceCategories("income"),
      getOrderSettings(),
    ]).then(([addrs, whs, accs, cats, settings]) => {
      setAddresses(addrs);
      setWarehouses(whs);
      setAccounts(accs);
      setCategories(cats);
      setWarehouseId(settings.default_warehouse_id);
      setAccountId(settings.default_account_id);
      setCategoryId(settings.default_category_id);
      setDropdownLoaded(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  // Close suggestion dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionRef.current &&
        !suggestionRef.current.contains(e.target as Node) &&
        barcodeRef.current !== e.target
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleBarcodeChange = (val: string) => {
    setBarcodeInput(val);
    setError(null);
    if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    suggestDebounce.current = setTimeout(async () => {
      setSuggestionLoading(true);
      try {
        const results = await searchProductsForKasir(val.trim(), 8);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setSuggestionLoading(false);
      }
    }, 200);
  };

  const addToCart = useCallback((item: {
    variant_id: number;
    variant_name: string;
    product_name: string;
    product_sku: string | null;
    sku_suffix: string | null;
    unit: string;
    selling_price: number | null;
    fixed_cost: number | null;
    product_image?: string | null;
  }) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.variant_id === item.variant_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          variant_id: item.variant_id,
          variant_name: item.variant_name,
          product_name: item.product_name,
          product_sku: item.product_sku,
          sku_suffix: item.sku_suffix,
          unit: item.unit,
          qty: 1,
          selling_price: item.selling_price ?? 0,
          cost_method: item.fixed_cost != null ? "fixed" : "fifo",
          product_image: item.product_image ?? null,
        },
      ];
    });
  }, []);

  const addSuggestionToCart = (s: KasirSuggestion) => {
    setShowSuggestions(false);
    setBarcodeInput("");
    setError(null);
    addToCart(s);
    barcodeRef.current?.focus();
  };

  const handleBarcodeScan = useCallback(async (raw: string) => {
    const barcode = raw.trim();
    if (!barcode) return;
    setError(null);
    setShowSuggestions(false);
    setScanning(true);
    try {
      const result: BarcodeResult = await lookupBarcode(barcode);
      if (!result.is_for_sale) {
        setError(t("order.kasir.notForSale"));
        return;
      }
      addToCart(result);
    } catch {
      setError(t("order.kasir.productNotFound"));
    } finally {
      setScanning(false);
      setBarcodeInput("");
      barcodeRef.current?.focus();
    }
  }, [t, addToCart]);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (suggestions.length > 0 && showSuggestions) {
        addSuggestionToCart(suggestions[0]);
      } else {
        handleBarcodeScan(barcodeInput);
      }
    }
    if (e.key === "Escape") setShowSuggestions(false);
  };

  const updateQty = (variantId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => c.variant_id === variantId ? { ...c, qty: c.qty + delta } : c)
        .filter((c) => c.qty > 0)
    );
  };

  const updatePrice = (variantId: number, price: number) => {
    setCart((prev) =>
      prev.map((c) => c.variant_id === variantId ? { ...c, selling_price: price } : c)
    );
  };

  const updateCostMethod = (variantId: number, method: string) => {
    setCart((prev) =>
      prev.map((c) => c.variant_id === variantId ? { ...c, cost_method: method } : c)
    );
  };

  const removeItem = (variantId: number) => {
    setCart((prev) => prev.filter((c) => c.variant_id !== variantId));
  };

  const total = cart.reduce((s, c) => s + c.qty * c.selling_price, 0);

  const resetForm = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setNote("");
    setAddressId(null);
    setOrderStatus("on_process");
    setDate(new Date().toISOString().slice(0, 10));
    setSubmitError(null);
    barcodeRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: OrderCreatePayload = {
        items: cart.map((c) => ({
          variant_id: c.variant_id,
          qty: c.qty,
          selling_price: c.selling_price,
          cost_method: c.cost_method,
        })),
        status: orderStatus,
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        note: note || undefined,
        shipping_address_id: addressId,
        warehouse_id: warehouseId,
        account_id: accountId,
        category_id: categoryId,
        date,
      };
      const order = await createOrder(payload);
      setSuccessOrder(order.order_number);
      resetForm();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* ── Success overlay ── */}
      {successOrder && (
        <SuccessOverlay
          orderNumber={successOrder}
          onDismiss={() => setSuccessOrder(null)}
        />
      )}

      {/* ── LEFT: Scan + Cart ── */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Barcode input bar */}
        <div className="px-4 py-3 th-bg-surface border-b th-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Scan size={15} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-muted z-10" />
              <input
                ref={barcodeRef}
                value={barcodeInput}
                onChange={(e) => handleBarcodeChange(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder={t("order.kasir.barcodePlaceholder")}
                className="w-full pl-9 pr-3 py-2 text-sm th-bg-elevated th-text th-border border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                disabled={scanning}
                autoComplete="off"
              />
              {showSuggestions && (
                <div
                  ref={suggestionRef}
                  className="absolute z-50 left-0 right-0 top-full mt-1 th-bg-elevated border th-border rounded-lg shadow-lg overflow-hidden"
                >
                  {suggestionLoading ? (
                    <p className="px-3 py-2 text-xs th-text-muted">Mencari…</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto">
                      {suggestions.map((s) => {
                        const sku = [s.product_sku, s.sku_suffix].filter(Boolean).join("");
                        return (
                          <div
                            key={s.variant_id}
                            onMouseDown={(e) => { e.preventDefault(); addSuggestionToCart(s); }}
                            className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:th-bg-surface transition-colors"
                          >
                            {s.product_image ? (
                              <img
                                src={`${PRODUCT_IMAGE_BASE}/${s.product_image}`}
                                alt=""
                                className="w-8 h-8 object-cover rounded shrink-0 border th-border"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded th-bg-elevated border th-border shrink-0 flex items-center justify-center">
                                <ImageIcon size={12} className="th-text-muted opacity-40" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="th-text font-medium truncate">{s.product_name}</div>
                              <div className="text-xs th-text-muted truncate">
                                {s.variant_name}{sku ? ` · ${sku}` : ""}
                              </div>
                            </div>
                            <div className="text-xs th-text-muted shrink-0 ml-1">
                              {s.selling_price != null ? fmt(s.selling_price) : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => handleBarcodeScan(barcodeInput)}
              disabled={scanning || !barcodeInput.trim()}
              className="px-3 py-2 text-sm rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors shrink-0"
            >
              {t("order.kasir.addToCart")}
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
          <p className="mt-1 text-xs th-text-muted">{t("order.kasir.barcodeHint")}</p>
        </div>

        {/* Cart items */}
        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 th-text-muted">
            <ShoppingCart size={36} className="opacity-30" />
            <p className="text-sm font-medium">{t("order.kasir.cartEmpty")}</p>
            <p className="text-xs text-center px-8">{t("order.kasir.cartEmptyHint")}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="th-bg-surface sticky top-0 z-10">
                <tr className="text-xs th-text-muted border-b th-border">
                  <th className="w-10" />
                  <th className="px-2 py-2 text-left font-medium">{t("order.kasir.product")}</th>
                  <th className="px-2 py-2 text-center font-medium w-28">{t("order.kasir.qty")}</th>
                  <th className="px-2 py-2 text-right font-medium w-32">{t("order.kasir.price")}</th>
                  <th className="px-2 py-2 text-center font-medium w-20">{t("order.kasir.costMethod")}</th>
                  <th className="px-4 py-2 text-right font-medium w-28">{t("order.kasir.subtotal")}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.variant_id} className="border-b th-border hover:th-bg-elevated transition-colors">
                    <td className="pl-2 py-2 w-10">
                      {item.product_image ? (
                        <img
                          src={`${PRODUCT_IMAGE_BASE}/${item.product_image}`}
                          alt=""
                          className="w-8 h-8 object-cover rounded border th-border"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded th-bg-elevated border th-border flex items-center justify-center">
                          <ImageIcon size={12} className="th-text-muted opacity-30" />
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium th-text text-sm leading-tight">{item.product_name}</div>
                      <div className="text-xs th-text-muted">
                        {item.variant_name}{item.sku_suffix ? ` · ${item.sku_suffix}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateQty(item.variant_id, -1)}
                          className="w-6 h-6 flex items-center justify-center rounded th-bg-elevated hover:th-bg-surface th-text transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (v > 0) setCart((prev) => prev.map((c) => c.variant_id === item.variant_id ? { ...c, qty: v } : c));
                          }}
                          className="w-12 text-center text-sm th-bg-elevated th-text border th-border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <button
                          onClick={() => updateQty(item.variant_id, 1)}
                          className="w-6 h-6 flex items-center justify-center rounded th-bg-elevated hover:th-bg-surface th-text transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        value={item.selling_price}
                        onChange={(e) => updatePrice(item.variant_id, parseFloat(e.target.value) || 0)}
                        className="w-full text-right text-sm th-bg-elevated th-text border th-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={item.cost_method}
                        onChange={(e) => updateCostMethod(item.variant_id, e.target.value)}
                        className="text-xs th-bg-elevated th-text border th-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full"
                      >
                        <option value="fifo">FIFO</option>
                        <option value="average">Avg</option>
                        <option value="fixed">Fixed</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right th-text font-medium">
                      {fmt(item.qty * item.selling_price)}
                    </td>
                    <td className="pr-2 py-2">
                      <button
                        onClick={() => removeItem(item.variant_id)}
                        className="th-text-muted hover:text-red-400 transition-colors"
                        title={t("order.kasir.removeItem")}
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cart footer */}
        {cart.length > 0 && (
          <div className="shrink-0 border-t th-border th-bg-surface px-4 py-2 flex items-center justify-between gap-4">
            <button
              onClick={() => setCart([])}
              className="text-sm th-text-muted hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <Trash2 size={14} />
              {t("order.kasir.clearCart")}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs th-text-muted">{cart.length} {t("order.history.items")}</span>
              <div className="text-right">
                <div className="text-xs th-text-muted">{t("order.kasir.total")}</div>
                <div className="text-lg font-bold th-text">{fmt(total)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Order panel (always visible) ── */}
      <div className="w-72 border-l th-border th-bg-surface flex flex-col overflow-hidden shrink-0">
        <div className="px-4 py-3 border-b th-border shrink-0">
          <h3 className="font-semibold th-text text-sm">{t("order.checkout.title")}</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Status pills ── */}
          <div className="px-4 pt-3 pb-2">
            <label className="text-xs th-text-muted mb-1.5 block">{t("order.checkout.status")}</label>
            <div className="flex gap-1.5 flex-wrap">
              {(["on_process", "waiting_for_payment", "draft"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setOrderStatus(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                    orderStatus === s
                      ? "bg-brand-500 border-brand-500 text-white"
                      : "th-border th-text-muted hover:th-text"
                  }`}
                >
                  {t(`order.history.status.${s}` as any)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Date ── */}
          <div className="px-4 pb-3">
            <label className="text-xs th-text-muted mb-1 block">{t("order.checkout.date")}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* ── Customer (collapsible) ── */}
          <div className="border-t th-border">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium th-text hover:th-bg-elevated transition-colors"
            >
              <span>{t("order.kasir.sectionCustomer")}</span>
              {showDetails ? <ChevronUp size={13} className="th-text-muted" /> : <ChevronDown size={13} className="th-text-muted" />}
            </button>
            {showDetails && (
              <div className="px-4 pb-3 flex flex-col gap-2.5">
                <div>
                  <label className="text-xs th-text-muted mb-1 block">{t("order.checkout.customerName")}</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs th-text-muted mb-1 block">{t("order.checkout.customerPhone")}</label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs th-text-muted mb-1 block">{t("order.checkout.shippingAddress")}</label>
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
                <div>
                  <label className="text-xs th-text-muted mb-1 block">{t("order.checkout.note")}</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Accounting (collapsible) ── */}
          <div className="border-t th-border">
            <button
              type="button"
              onClick={() => setShowAccounting((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium th-text hover:th-bg-elevated transition-colors"
            >
              <span>{t("order.kasir.sectionAccounting")}</span>
              {showAccounting ? <ChevronUp size={13} className="th-text-muted" /> : <ChevronDown size={13} className="th-text-muted" />}
            </button>
            {showAccounting && (
              <div className="px-4 pb-3 flex flex-col gap-2.5">
                <div>
                  <label className="text-xs th-text-muted mb-1 block">{t("order.checkout.warehouse")}</label>
                  <SearchableSelect
                    value={warehouseId?.toString() ?? ""}
                    onChange={(v) => setWarehouseId(v ? parseInt(v) : null)}
                    clearable
                    placeholder={t("order.checkout.noWarehouse")}
                    options={warehouses.map((w) => ({ value: w.id.toString(), label: w.name }))}
                  />
                </div>
                <div>
                  <label className="text-xs th-text-muted mb-1 block">{t("order.checkout.account")}</label>
                  <SearchableSelect
                    value={accountId?.toString() ?? ""}
                    onChange={(v) => setAccountId(v ? parseInt(v) : null)}
                    clearable
                    placeholder={t("order.checkout.noAccount")}
                    options={accounts.map((a) => ({ value: a.id.toString(), label: a.name }))}
                  />
                </div>
                <div>
                  <label className="text-xs th-text-muted mb-1 block">{t("order.checkout.category")}</label>
                  <SearchableSelect
                    value={categoryId?.toString() ?? ""}
                    onChange={(v) => setCategoryId(v ? parseInt(v) : null)}
                    clearable
                    placeholder={t("order.checkout.noCategory")}
                    options={categories.map((c) => ({ value: c.id.toString(), label: c.name }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Change calculator (only when cart has items) ── */}
          {cart.length > 0 && (
            <div className="border-t th-border px-4 py-3">
              <ChangeCalculator total={total} />
            </div>
          )}
        </div>

        {/* ── Footer: summary + submit ── */}
        <div className="shrink-0 border-t th-border px-4 py-3 flex flex-col gap-3">
          {cart.length > 0 && (
            <div className="space-y-1">
              {cart.map((item) => (
                <div key={item.variant_id} className="flex items-baseline justify-between text-xs th-text-muted">
                  <span className="truncate mr-2 max-w-[140px]">{item.product_name} ×{item.qty}</span>
                  <span className="shrink-0 font-mono">{fmt(item.qty * item.selling_price)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t th-border">
                <span className="text-xs th-text-muted font-medium">{t("order.kasir.total")}</span>
                <span className="text-lg font-bold th-text font-mono">{fmt(total)}</span>
              </div>
            </div>
          )}

          {submitError && <p className="text-xs text-red-400">{submitError}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting || cart.length === 0 || !dropdownLoaded}
            className="w-full py-2.5 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-40 transition-colors"
          >
            {submitting ? t("order.checkout.submitting") : t("order.checkout.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
