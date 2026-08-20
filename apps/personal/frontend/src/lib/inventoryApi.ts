import type { InvLocation, InvCategory, InvItem, InvMovement, InvDashboard } from "@/types";

const BASE = "http://localhost:8000/api/inventory";

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

// ── Locations ─────────────────────────────────────────────────────────────────

export const listLocations = (): Promise<InvLocation[]> => req("/locations");
export const createLocation = (data: { name: string; note?: string }): Promise<InvLocation> =>
  json("POST", data, "/locations") as Promise<InvLocation>;
export const updateLocation = (id: number, data: Partial<{ name: string; note: string }>): Promise<InvLocation> =>
  json("PATCH", data, `/locations/${id}`) as Promise<InvLocation>;
export const deleteLocation = (id: number): Promise<void> =>
  req(`/locations/${id}`, { method: "DELETE" });

// ── Categories ────────────────────────────────────────────────────────────────

export const listCategories = (): Promise<InvCategory[]> => req("/categories");
export const createCategory = (data: { name: string; color?: string }): Promise<InvCategory> =>
  json("POST", data, "/categories") as Promise<InvCategory>;
export const updateCategory = (id: number, data: Partial<{ name: string; color: string }>): Promise<InvCategory> =>
  json("PATCH", data, `/categories/${id}`) as Promise<InvCategory>;
export const deleteCategory = (id: number): Promise<void> =>
  req(`/categories/${id}`, { method: "DELETE" });

// ── Items ─────────────────────────────────────────────────────────────────────

export interface ItemQuery {
  category_id?: number;
  location_id?: number;
  low_stock_only?: boolean;
  active_only?: boolean;
  q?: string;
}

export const listItems = (params?: ItemQuery): Promise<InvItem[]> => {
  const qs = new URLSearchParams();
  if (params?.category_id != null) qs.set("category_id", String(params.category_id));
  if (params?.location_id != null) qs.set("location_id", String(params.location_id));
  if (params?.low_stock_only) qs.set("low_stock_only", "true");
  if (params?.active_only === false) qs.set("active_only", "false");
  if (params?.q) qs.set("q", params.q);
  const s = qs.toString();
  return req(`/items${s ? "?" + s : ""}`);
};

export const getItem = (id: number): Promise<InvItem> => req(`/items/${id}`);

export const createItem = (data: {
  name: string;
  category_id?: number | null;
  location_id?: number | null;
  unit?: string;
  qty?: number;
  min_qty?: number;
  note?: string | null;
}): Promise<InvItem> => json("POST", data, "/items") as Promise<InvItem>;

export const updateItem = (id: number, data: Partial<{
  name: string;
  category_id: number | null;
  location_id: number | null;
  unit: string;
  min_qty: number;
  note: string | null;
  active: number;
}>): Promise<InvItem> => json("PATCH", data, `/items/${id}`) as Promise<InvItem>;

export const deleteItem = (id: number): Promise<void> =>
  req(`/items/${id}`, { method: "DELETE" });

// ── Movements ─────────────────────────────────────────────────────────────────

export const listMovements = (params?: {
  item_id?: number;
  location_id?: number;
  limit?: number;
  offset?: number;
}): Promise<{ movements: InvMovement[]; total: number }> => {
  const qs = new URLSearchParams();
  if (params?.item_id != null) qs.set("item_id", String(params.item_id));
  if (params?.location_id != null) qs.set("location_id", String(params.location_id));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const s = qs.toString();
  return req(`/movements${s ? "?" + s : ""}`);
};

export const createMovement = (data: {
  item_id: number;
  location_id?: number | null;
  type: "in" | "out" | "adjustment";
  qty: number;
  note?: string | null;
  date: string;
}): Promise<InvMovement> => json("POST", data, "/movements") as Promise<InvMovement>;

export const deleteMovement = (id: number): Promise<void> =>
  req(`/movements/${id}`, { method: "DELETE" });

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboard = (): Promise<InvDashboard> => req("/dashboard");
