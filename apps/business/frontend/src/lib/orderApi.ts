import type {
  City, District, Village, ShippingAddress, Order, BarcodeResult, OrderSettings, KasirSuggestion,
} from "@/types";

const BASE = "http://localhost:8001/api/orders";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function json(method: string, body: unknown, path = "") {
  return req(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Settings ───────────────────────────────────────────────────────────────────

export const getOrderSettings = (): Promise<OrderSettings> => req("/settings");
export const saveOrderSettings = (data: Partial<OrderSettings>): Promise<OrderSettings> =>
  json("POST", data, "/settings") as Promise<OrderSettings>;

// ── Wilayah ────────────────────────────────────────────────────────────────────

export const listCities = (): Promise<City[]> => req("/wilayah/cities");
export const createCity = (name: string): Promise<City> =>
  json("POST", { name }, "/wilayah/cities") as Promise<City>;
export const updateCity = (id: number, name: string): Promise<City> =>
  json("PATCH", { name }, `/wilayah/cities/${id}`) as Promise<City>;
export const deleteCity = (id: number): Promise<void> =>
  req(`/wilayah/cities/${id}`, { method: "DELETE" });

export const listDistricts = (cityId?: number): Promise<District[]> =>
  req(`/wilayah/districts${cityId ? `?city_id=${cityId}` : ""}`);
export const createDistrict = (city_id: number, name: string): Promise<District> =>
  json("POST", { city_id, name }, "/wilayah/districts") as Promise<District>;
export const updateDistrict = (id: number, name: string): Promise<District> =>
  json("PATCH", { name }, `/wilayah/districts/${id}`) as Promise<District>;
export const deleteDistrict = (id: number): Promise<void> =>
  req(`/wilayah/districts/${id}`, { method: "DELETE" });

export const listVillages = (districtId?: number): Promise<Village[]> =>
  req(`/wilayah/villages${districtId ? `?district_id=${districtId}` : ""}`);
export const createVillage = (district_id: number, name: string): Promise<Village> =>
  json("POST", { district_id, name }, "/wilayah/villages") as Promise<Village>;
export const updateVillage = (id: number, name: string): Promise<Village> =>
  json("PATCH", { name }, `/wilayah/villages/${id}`) as Promise<Village>;
export const deleteVillage = (id: number): Promise<void> =>
  req(`/wilayah/villages/${id}`, { method: "DELETE" });

export async function importWilayahCsv(file: File): Promise<{ cities: number; districts: number; villages: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(BASE + "/wilayah/import", { method: "POST", body: form });
  return res.json();
}

// ── Shipping Addresses ─────────────────────────────────────────────────────────

export const listAddresses = (): Promise<ShippingAddress[]> => req("/addresses");
export const createAddress = (data: Omit<ShippingAddress, "id" | "created_at" | "updated_at" | "city_name" | "district_name" | "village_name">): Promise<ShippingAddress> =>
  json("POST", data, "/addresses") as Promise<ShippingAddress>;
export const updateAddress = (id: number, data: Partial<ShippingAddress>): Promise<ShippingAddress> =>
  json("PATCH", data, `/addresses/${id}`) as Promise<ShippingAddress>;
export const deleteAddress = (id: number): Promise<void> =>
  req(`/addresses/${id}`, { method: "DELETE" });

// ── Barcode ────────────────────────────────────────────────────────────────────

export const lookupBarcode = (barcode: string): Promise<BarcodeResult> =>
  req(`/barcode/${encodeURIComponent(barcode)}`);

// ── Orders ────────────────────────────────────────────────────────────────────

export interface OrderListResult { orders: Order[]; total: number }
export interface OrderCreatePayload {
  items: { variant_id: number; qty: number; selling_price: number; cost_method?: string }[];
  status?: string;
  customer_name?: string;
  customer_phone?: string;
  note?: string;
  shipping_address_id?: number | null;
  warehouse_id?: number | null;
  account_id?: number | null;
  category_id?: number | null;
  cost_method?: string;
  date: string;
}

export const listOrders = (params?: { status?: string; q?: string; limit?: number; offset?: number }): Promise<OrderListResult> => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const s = qs.toString();
  return req(`${s ? "?" + s : ""}`);
};

export const getOrder = (id: number): Promise<Order> => req(`/${id}`);

export const createOrder = (data: OrderCreatePayload): Promise<Order> =>
  json("POST", data) as Promise<Order>;

export interface OrderUpdatePayload {
  customer_name?: string | null;
  customer_phone?: string | null;
  note?: string | null;
  status?: string;
  shipping_address_id?: number | null;
  warehouse_id?: number | null;
  account_id?: number | null;
  category_id?: number | null;
  date?: string;
}

export const updateOrder = (id: number, data: OrderUpdatePayload): Promise<Order> =>
  json("PATCH", data, `/${id}`) as Promise<Order>;

export const cancelOrder = (id: number): Promise<Order> =>
  req(`/${id}/cancel`, { method: "POST" });

export const deleteOrder = (id: number): Promise<void> =>
  req(`/${id}`, { method: "DELETE" });

export const searchProductsForKasir = (q: string, limit = 10): Promise<KasirSuggestion[]> =>
  req(`/products/search?q=${encodeURIComponent(q)}&limit=${limit}`);

// ── Insight summary ────────────────────────────────────────────────────────────

export interface OrderKpi {
  total_orders: number;
  total_revenue: number;
  avg_order_value: number;
  cancelled_orders: number;
}

export interface OrderMonthly {
  month: string;
  label: string;
  revenue: number;
  orders: number;
}

export interface OrderMonthlyByStatus {
  month: string;
  label: string;
  draft: number;
  draft_rev: number;
  waiting_for_payment: number;
  waiting_for_payment_rev: number;
  on_process: number;
  on_process_rev: number;
  completed: number;
  completed_rev: number;
  cancelled: number;
  cancelled_rev: number;
}

export interface OrderStatusCount {
  count: number;
  total: number;
}

export interface OrderTopProduct {
  name: string;
  qty: number;
  revenue: number;
}

export interface OrderDaily {
  date: string;
  orders: number;
  revenue: number;
}

export interface OrderSummary {
  kpi: OrderKpi;
  monthly: OrderMonthly[];
  monthly_by_status: OrderMonthlyByStatus[];
  status_breakdown: Record<string, OrderStatusCount>;
  top_products: OrderTopProduct[];
  daily: OrderDaily[];
}

export const getOrderSummary = (params?: { date_from?: string; date_to?: string; months?: number }): Promise<OrderSummary> => {
  const qs = new URLSearchParams();
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  if (params?.months) qs.set("months", String(params.months));
  const s = qs.toString();
  return req(`/summary${s ? "?" + s : ""}`);
};
