import type {
  Account, Category, Pocket, Transaction, FinanceSummary,
  TransactionType, PLMonthRow,
} from "@/types";

const BASE = "http://localhost:8001/api/finance";

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function listAccounts(): Promise<Account[]> {
  const res = await fetch(`${BASE}/accounts`);
  const data = await res.json();
  return data.accounts ?? [];
}

export async function createAccount(body: Omit<Account, "id" | "created_at" | "updated_at">): Promise<Account> {
  const res = await fetch(`${BASE}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateAccount(id: number, body: Partial<Account>): Promise<Account> {
  const res = await fetch(`${BASE}/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteAccount(id: number): Promise<void> {
  await fetch(`${BASE}/accounts/${id}`, { method: "DELETE" });
}

// ── App-level lock ────────────────────────────────────────────────────────────

export async function getFinanceAppLock(): Promise<{ locked: boolean }> {
  const res = await fetch(`${BASE}/lock`);
  return res.json();
}

export async function setFinanceAppLock(locked: boolean): Promise<{ locked: boolean }> {
  const res = await fetch(`${BASE}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locked }),
  });
  return res.json();
}

// ── Pockets ───────────────────────────────────────────────────────────────────

export async function listPockets(): Promise<Pocket[]> {
  const res = await fetch(`${BASE}/pockets`);
  const data = await res.json();
  return data.pockets ?? [];
}

export async function createPocket(body: { name: string; color?: string; icon?: string }): Promise<Pocket> {
  const res = await fetch(`${BASE}/pockets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updatePocket(id: number, body: Partial<{ name: string; color: string; icon: string }>): Promise<Pocket> {
  const res = await fetch(`${BASE}/pockets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deletePocket(id: number): Promise<void> {
  await fetch(`${BASE}/pockets/${id}`, { method: "DELETE" });
}

export async function setPocketLocked(id: number, locked: boolean): Promise<Pocket> {
  const res = await fetch(`${BASE}/pockets/${id}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locked }),
  });
  return res.json();
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories(type?: TransactionType): Promise<Category[]> {
  const url = type ? `${BASE}/categories?type=${type}` : `${BASE}/categories`;
  const res = await fetch(url);
  const data = await res.json();
  return data.categories ?? [];
}

export async function createCategory(body: Omit<Category, "id" | "created_at">): Promise<Category> {
  const res = await fetch(`${BASE}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateCategory(id: number, body: Partial<Category>): Promise<Category> {
  const res = await fetch(`${BASE}/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteCategory(id: number): Promise<void> {
  await fetch(`${BASE}/categories/${id}`, { method: "DELETE" });
}

// ── Transactions ──────────────────────────────────────────────────────────────

export interface TransactionQuery {
  account_id?: number;
  category_id?: number;
  pocket_id?: number;
  type?: TransactionType;
  date_from?: string;
  date_to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listTransactions(query?: TransactionQuery): Promise<{ transactions: Transaction[]; total: number }> {
  const params = new URLSearchParams();
  if (query?.account_id != null) params.set("account_id", String(query.account_id));
  if (query?.category_id != null) params.set("category_id", String(query.category_id));
  if (query?.pocket_id != null) params.set("pocket_id", String(query.pocket_id));
  if (query?.type) params.set("type", query.type);
  if (query?.date_from) params.set("date_from", query.date_from);
  if (query?.date_to) params.set("date_to", query.date_to);
  if (query?.q) params.set("q", query.q);
  if (query?.limit != null) params.set("limit", String(query.limit));
  if (query?.offset != null) params.set("offset", String(query.offset));
  const qs = params.toString();
  const res = await fetch(`${BASE}/transactions${qs ? "?" + qs : ""}`);
  const data = await res.json();
  return { transactions: data.transactions ?? [], total: data.total ?? 0 };
}

export interface FeeDraft {
  label: string;
  fee_type: "shipping" | "tax" | "discount" | "other";
  amount: number; // always positive; backend negates discount
}

export async function createTransaction(body: {
  account_id: number;
  category_id?: number | null;
  pocket_id?: number | null;
  to_account_id?: number | null;
  type: TransactionType;
  amount: number;
  date: string;
  description?: string;
  note?: string;
  tags?: string;
  fees?: FeeDraft[];
}): Promise<Transaction> {
  const res = await fetch(`${BASE}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateTransaction(id: number, body: Partial<{
  account_id: number;
  category_id: number | null;
  pocket_id: number | null;
  to_account_id: number | null;
  type: TransactionType;
  amount: number;
  date: string;
  description: string;
  note: string;
  tags: string;
  fees: FeeDraft[];
}>): Promise<Transaction> {
  const res = await fetch(`${BASE}/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteTransaction(id: number): Promise<void> {
  await fetch(`${BASE}/transactions/${id}`, { method: "DELETE" });
}

// ── Summary ───────────────────────────────────────────────────────────────────

export async function getFinanceSummary(
  date_from?: string,
  date_to?: string,
  pocket_id?: number,
  account_id?: number,
): Promise<FinanceSummary> {
  const params = new URLSearchParams();
  if (date_from) params.set("date_from", date_from);
  if (date_to) params.set("date_to", date_to);
  if (pocket_id != null) params.set("pocket_id", String(pocket_id));
  if (account_id != null) params.set("account_id", String(account_id));
  const qs = params.toString();
  const res = await fetch(`${BASE}/summary${qs ? "?" + qs : ""}`);
  return res.json();
}

export interface TimelinePoint { date: string; income: number; expense: number; }
export interface MonthlyPoint  { month: string; income: number; expense: number; }
export interface AccountSummary { id: number; name: string; type: string; balance: number; currency: string; color: string; }

export async function getFinanceTimeline(
  date_from?: string,
  date_to?: string,
  pocket_id?: number,
  account_id?: number,
): Promise<TimelinePoint[]> {
  const params = new URLSearchParams();
  if (date_from) params.set("date_from", date_from);
  if (date_to) params.set("date_to", date_to);
  if (pocket_id != null) params.set("pocket_id", String(pocket_id));
  if (account_id != null) params.set("account_id", String(account_id));
  const qs = params.toString();
  const res = await fetch(`${BASE}/summary/timeline${qs ? "?" + qs : ""}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.timeline ?? []);
}

export async function getFinanceMonthly(
  months = 12,
  pocket_id?: number,
  account_id?: number,
): Promise<MonthlyPoint[]> {
  const params = new URLSearchParams({ months: String(months) });
  if (pocket_id != null) params.set("pocket_id", String(pocket_id));
  if (account_id != null) params.set("account_id", String(account_id));
  const res = await fetch(`${BASE}/summary/monthly?${params.toString()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.monthly ?? []);
}

export async function getFinanceAccountsSummary(account_id?: number): Promise<AccountSummary[]> {
  const params = new URLSearchParams();
  if (account_id != null) params.set("account_id", String(account_id));
  const qs = params.toString();
  const res = await fetch(`${BASE}/summary/accounts${qs ? "?" + qs : ""}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.accounts ?? []);
}

export async function getFinancePL(
  months = 12,
  pocket_id?: number,
  account_id?: number,
): Promise<PLMonthRow[]> {
  const params = new URLSearchParams({ months: String(months) });
  if (pocket_id != null) params.set("pocket_id", String(pocket_id));
  if (account_id != null) params.set("account_id", String(account_id));
  const res = await fetch(`${BASE}/report/pl?${params.toString()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.pl ?? []);
}

export async function exportTransactionsCSV(query?: TransactionQuery): Promise<void> {
  const all = await listTransactions({ ...query, limit: 5000, offset: 0 });
  const rows = all.transactions ?? [];
  if (!rows.length) return;

  const headers = ["Tanggal", "Jenis", "Jumlah", "Akun", "Kategori", "Deskripsi", "Catatan", "Tags"];
  const escape = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [r.date, r.type, r.amount, r.account_name ?? "", r.category_name ?? "",
       r.description ?? "", r.note ?? "", r.tags ?? ""].map(escape).join(",")
    ),
  ];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `keuangan_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
