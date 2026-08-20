import type {
  Project, ProjectBudgetItem, ProjectWorker, ProjectWorkerPayment,
  ProjectInvoice, ProjectDashboard, ProjectStatus,
} from "@/types";

const BASE = "http://localhost:8001/api/projects";

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getProjectDashboard(): Promise<ProjectDashboard> {
  const res = await fetch(`${BASE}/dashboard`);
  return res.json();
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(status?: ProjectStatus): Promise<Project[]> {
  const url = status ? `${BASE}?status=${status}` : BASE;
  const res = await fetch(url);
  const data = await res.json();
  return data.projects ?? [];
}

export async function getProject(id: number): Promise<Project> {
  const res = await fetch(`${BASE}/${id}`);
  return res.json();
}

export async function createProject(body: Omit<Project, "id" | "created_at" | "updated_at">): Promise<Project> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateProject(id: number, body: Partial<Project>): Promise<Project> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  await fetch(`${BASE}/${id}`, { method: "DELETE" });
}

// ── Budget Items (RAB) ────────────────────────────────────────────────────────

export async function listBudgetItems(projectId: number): Promise<ProjectBudgetItem[]> {
  const res = await fetch(`${BASE}/${projectId}/budget`);
  const data = await res.json();
  return data.items ?? [];
}

export async function createBudgetItem(
  projectId: number,
  body: Omit<ProjectBudgetItem, "id" | "project_id" | "total_price" | "created_at" | "updated_at">,
): Promise<ProjectBudgetItem> {
  const res = await fetch(`${BASE}/${projectId}/budget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateBudgetItem(
  itemId: number,
  body: Partial<Omit<ProjectBudgetItem, "id" | "project_id" | "total_price" | "created_at" | "updated_at">>,
): Promise<ProjectBudgetItem> {
  const res = await fetch(`${BASE}/budget/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteBudgetItem(itemId: number): Promise<void> {
  await fetch(`${BASE}/budget/${itemId}`, { method: "DELETE" });
}

// ── Workers ───────────────────────────────────────────────────────────────────

export async function listWorkers(projectId: number): Promise<ProjectWorker[]> {
  const res = await fetch(`${BASE}/${projectId}/workers`);
  const data = await res.json();
  return data.workers ?? [];
}

export async function createWorker(
  projectId: number,
  body: Omit<ProjectWorker, "id" | "project_id" | "total_paid" | "created_at" | "updated_at">,
): Promise<ProjectWorker> {
  const res = await fetch(`${BASE}/${projectId}/workers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateWorker(workerId: number, body: Partial<ProjectWorker>): Promise<ProjectWorker> {
  const res = await fetch(`${BASE}/workers/${workerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteWorker(workerId: number): Promise<void> {
  await fetch(`${BASE}/workers/${workerId}`, { method: "DELETE" });
}

// ── Worker Payments ───────────────────────────────────────────────────────────

export async function listWorkerPayments(projectId: number): Promise<ProjectWorkerPayment[]> {
  const res = await fetch(`${BASE}/${projectId}/payments`);
  const data = await res.json();
  return data.payments ?? [];
}

export async function createWorkerPayment(
  projectId: number,
  body: {
    worker_id: number;
    worker_name?: string;
    amount: number;
    date: string;
    note?: string;
    link_finance: boolean;
    account_id?: number;
    category_id?: number;
  },
): Promise<ProjectWorkerPayment> {
  const res = await fetch(`${BASE}/${projectId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateWorkerPaymentLink(
  paymentId: number,
  body: { link_finance: boolean; account_id?: number; category_id?: number },
): Promise<ProjectWorkerPayment> {
  const res = await fetch(`${BASE}/payments/${paymentId}/link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteWorkerPayment(paymentId: number): Promise<void> {
  await fetch(`${BASE}/payments/${paymentId}`, { method: "DELETE" });
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function listInvoices(projectId: number): Promise<ProjectInvoice[]> {
  const res = await fetch(`${BASE}/${projectId}/invoices`);
  const data = await res.json();
  return data.invoices ?? [];
}

export async function createInvoice(
  projectId: number,
  body: {
    invoice_number: string;
    amount: number;
    status?: string;
    issued_date: string;
    due_date?: string;
    paid_date?: string;
    note?: string;
    link_finance: boolean;
    account_id?: number;
    category_id?: number;
  },
): Promise<ProjectInvoice> {
  const res = await fetch(`${BASE}/${projectId}/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateInvoice(invoiceId: number, body: Partial<ProjectInvoice>): Promise<ProjectInvoice> {
  const res = await fetch(`${BASE}/invoices/${invoiceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateInvoiceLink(
  invoiceId: number,
  body: { link_finance: boolean; account_id?: number; category_id?: number },
): Promise<ProjectInvoice> {
  const res = await fetch(`${BASE}/invoices/${invoiceId}/link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteInvoice(invoiceId: number): Promise<void> {
  await fetch(`${BASE}/invoices/${invoiceId}`, { method: "DELETE" });
}
