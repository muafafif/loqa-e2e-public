import type {
  Warehouse, ProductCategory, Product, ProductVariant,
  StockLevel, StockMovement, InventoryDashboard,
  MovementType, CostMethod,
  Brand, InvCategory as Category, Subcategory,
  BrandReportRow, CategoryReportRow, ProductProfitRow,
} from "@/types";

const BASE = "http://localhost:8001/api/inventory";

// ── Warehouses ────────────────────────────────────────────────────────────────

export async function listWarehouses(): Promise<Warehouse[]> {
  const res = await fetch(`${BASE}/warehouses`);
  const data = await res.json();
  return data.warehouses ?? [];
}

export async function createWarehouse(body: { name: string; location?: string; note?: string }): Promise<Warehouse> {
  const res = await fetch(`${BASE}/warehouses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateWarehouse(id: number, body: Partial<{ name: string; location: string; note: string }>): Promise<Warehouse> {
  const res = await fetch(`${BASE}/warehouses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteWarehouse(id: number): Promise<void> {
  await fetch(`${BASE}/warehouses/${id}`, { method: "DELETE" });
}

// ── Product Categories (legacy) ───────────────────────────────────────────────

export async function listProductCategories(): Promise<ProductCategory[]> {
  const res = await fetch(`${BASE}/product-categories`);
  const data = await res.json();
  return data.categories ?? [];
}

export async function createProductCategory(body: { name: string; color?: string }): Promise<ProductCategory> {
  const res = await fetch(`${BASE}/product-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateProductCategory(id: number, body: Partial<{ name: string; color: string }>): Promise<ProductCategory> {
  const res = await fetch(`${BASE}/product-categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteProductCategory(id: number): Promise<void> {
  await fetch(`${BASE}/product-categories/${id}`, { method: "DELETE" });
}

// ── Brands ────────────────────────────────────────────────────────────────────

export async function listBrands(): Promise<Brand[]> {
  const res = await fetch(`${BASE}/brands`);
  const data = await res.json();
  return data.brands ?? [];
}

export async function createBrand(body: { name: string; description?: string }): Promise<Brand> {
  const res = await fetch(`${BASE}/brands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateBrand(id: number, body: Partial<{ name: string; description: string | null }>): Promise<Brand> {
  const res = await fetch(`${BASE}/brands/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteBrand(id: number): Promise<void> {
  await fetch(`${BASE}/brands/${id}`, { method: "DELETE" });
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE}/categories`);
  const data = await res.json();
  return data.categories ?? [];
}

export async function createCategory(body: { name: string; description?: string }): Promise<Category> {
  const res = await fetch(`${BASE}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateCategory(id: number, body: Partial<{ name: string; description: string | null }>): Promise<Category> {
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

// ── Subcategories ─────────────────────────────────────────────────────────────

export async function listSubcategories(categoryId?: number): Promise<Subcategory[]> {
  const url = categoryId != null ? `${BASE}/subcategories?category_id=${categoryId}` : `${BASE}/subcategories`;
  const res = await fetch(url);
  const data = await res.json();
  return data.subcategories ?? [];
}

export async function createSubcategory(body: { category_id: number; name: string; description?: string }): Promise<Subcategory> {
  const res = await fetch(`${BASE}/subcategories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateSubcategory(id: number, body: Partial<{ category_id: number; name: string; description: string | null }>): Promise<Subcategory> {
  const res = await fetch(`${BASE}/subcategories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteSubcategory(id: number): Promise<void> {
  await fetch(`${BASE}/subcategories/${id}`, { method: "DELETE" });
}

// ── Products ──────────────────────────────────────────────────────────────────

export const PRODUCT_IMAGE_BASE = "http://localhost:8001/api/inventory/images";
export const MAX_IMAGE_MB = 2;
export const MAX_IMAGES_PER_PRODUCT = 8;

export interface ProductImage {
  id: number;
  product_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  created_at: number;
}

export interface ProductListResult {
  products: Product[];
  total: number;
}

export async function listProducts(opts?: {
  activeOnly?: boolean;
  brandId?: number;
  subcategoryId?: number;
  categoryId?: number;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<ProductListResult> {
  const params = new URLSearchParams();
  if (opts?.activeOnly)              params.set("active_only",    "true");
  if (opts?.brandId != null)         params.set("brand_id",       String(opts.brandId));
  if (opts?.subcategoryId != null)   params.set("subcategory_id", String(opts.subcategoryId));
  if (opts?.categoryId != null)      params.set("category_id",    String(opts.categoryId));
  if (opts?.q)                       params.set("q",              opts.q);
  if (opts?.limit != null)           params.set("limit",          String(opts.limit));
  if (opts?.offset != null)          params.set("offset",         String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`${BASE}/products${qs ? "?" + qs : ""}`);
  const data = await res.json();
  return { products: data.products ?? [], total: data.total ?? 0 };
}

export async function createProduct(body: {
  name: string;
  sku?: string;
  unit?: string;
  min_stock?: number;
  active?: boolean;
  is_for_sale?: boolean;
  brand_id?: number | null;
  subcategory_id?: number | null;
  description?: string | null;
}): Promise<Product> {
  const res = await fetch(`${BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateProduct(id: number, body: Partial<{
  name: string;
  sku: string | null;
  unit: string;
  min_stock: number;
  active: boolean;
  is_for_sale: boolean;
  brand_id: number | null;
  subcategory_id: number | null;
  description: string | null;
}>): Promise<Product> {
  const res = await fetch(`${BASE}/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteProduct(id: number): Promise<void> {
  await fetch(`${BASE}/products/${id}`, { method: "DELETE" });
}

// ── Product Images ────────────────────────────────────────────────────────────

export async function listProductImages(productId: number): Promise<ProductImage[]> {
  const res = await fetch(`${BASE}/products/${productId}/images`);
  const data = await res.json();
  return data.images ?? [];
}

export async function uploadProductImage(productId: number, file: File): Promise<ProductImage> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/products/${productId}/images`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Gagal mengunggah gambar");
  }
  return res.json();
}

export async function deleteProductImage(imageId: number): Promise<void> {
  const res = await fetch(`${BASE}/images/${imageId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Gagal menghapus gambar");
}

export async function reorderProductImages(productId: number, imageIds: number[]): Promise<void> {
  await fetch(`${BASE}/products/${productId}/images/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(imageIds),
  });
}

// ── Variants ──────────────────────────────────────────────────────────────────

export async function createVariant(productId: number, body: {
  name: string; sku_suffix?: string; fixed_cost?: number | null; selling_price?: number | null; default_unit_cost?: number | null; color?: string;
}): Promise<ProductVariant> {
  const res = await fetch(`${BASE}/products/${productId}/variants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateVariant(id: number, body: Partial<{
  name: string; sku_suffix: string; fixed_cost: number | null; selling_price: number | null; default_unit_cost: number | null; color: string;
}>): Promise<ProductVariant> {
  const res = await fetch(`${BASE}/variants/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteVariant(id: number): Promise<void> {
  await fetch(`${BASE}/variants/${id}`, { method: "DELETE" });
}

// ── Stock Levels ──────────────────────────────────────────────────────────────

export async function listStockLevels(warehouseId?: number): Promise<StockLevel[]> {
  const url = warehouseId ? `${BASE}/stock?warehouse_id=${warehouseId}` : `${BASE}/stock`;
  const res = await fetch(url);
  const data = await res.json();
  return data.stock ?? [];
}

// ── Movements ─────────────────────────────────────────────────────────────────

export interface MovementQuery {
  variant_id?: number;
  warehouse_id?: number;
  type?: MovementType;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export async function listMovements(query?: MovementQuery): Promise<{ movements: StockMovement[]; total: number }> {
  const params = new URLSearchParams();
  if (query?.variant_id != null)   params.set("variant_id",   String(query.variant_id));
  if (query?.warehouse_id != null) params.set("warehouse_id", String(query.warehouse_id));
  if (query?.type)                 params.set("type",         query.type);
  if (query?.date_from)            params.set("date_from",    query.date_from);
  if (query?.date_to)              params.set("date_to",      query.date_to);
  if (query?.limit != null)        params.set("limit",        String(query.limit));
  if (query?.offset != null)       params.set("offset",       String(query.offset));
  const qs = params.toString();
  const res = await fetch(`${BASE}/movements${qs ? "?" + qs : ""}`);
  const data = await res.json();
  return { movements: data.movements ?? [], total: data.total ?? 0 };
}

export async function createMovement(body: {
  variant_id: number;
  warehouse_id: number;
  type: MovementType;
  qty: number;
  unit_cost?: number | null;
  cost_method?: CostMethod;
  selling_price?: number | null;
  note?: string;
  date?: string;
  link_finance?: boolean;
  finance_account_id?: number | null;
  finance_category_id?: number | null;
}): Promise<StockMovement> {
  const res = await fetch(`${BASE}/movements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Gagal menyimpan pergerakan stok");
  }
  return res.json();
}

export async function deleteMovement(id: number): Promise<void> {
  const res = await fetch(`${BASE}/movements/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Gagal menghapus pergerakan stok");
  }
}

export async function patchMovementFinance(
  movementId: number,
  body: {
    link_finance: boolean;
    finance_account_id?: number | null;
    finance_category_id?: number | null;
  }
): Promise<StockMovement> {
  const res = await fetch(`${BASE}/movements/${movementId}/finance`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Gagal memperbarui catatan keuangan");
  }
  return res.json();
}

// ── Stock Opname ──────────────────────────────────────────────────────────────

export async function createOpname(body: {
  note?: string;
  date?: string;
  items: { variant_id: number; warehouse_id: number; physical_qty: number }[];
  link_finance?: boolean;
  finance_account_id?: number | null;
  shrinkage_category_id?: number | null;
}): Promise<{ movements: StockMovement[]; count: number }> {
  const res = await fetch(`${BASE}/opname`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Gagal menyimpan stock opname");
  }
  return res.json();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getInventoryDashboard(warehouseId?: number): Promise<InventoryDashboard> {
  const url = warehouseId ? `${BASE}/dashboard?warehouse_id=${warehouseId}` : `${BASE}/dashboard`;
  const res = await fetch(url);
  return res.json();
}

export async function getTurnoverReport(months = 12, warehouseId?: number): Promise<{ month: string; hpp_out: number; tx_count: number }[]> {
  const params = new URLSearchParams({ months: String(months) });
  if (warehouseId != null) params.set("warehouse_id", String(warehouseId));
  const res = await fetch(`${BASE}/report/turnover?${params.toString()}`);
  return res.json();
}

export async function getBrandReport(): Promise<BrandReportRow[]> {
  const res = await fetch(`${BASE}/report/brands`);
  const data = await res.json();
  return data.brands ?? [];
}

export async function getCategoryReport(): Promise<CategoryReportRow[]> {
  const res = await fetch(`${BASE}/report/categories`);
  const data = await res.json();
  return data.categories ?? [];
}

export async function getProfitPerProduct(params?: {
  date_from?: string;
  date_to?: string;
  warehouse_id?: number;
}): Promise<ProductProfitRow[]> {
  const qs = new URLSearchParams();
  if (params?.date_from)            qs.set("date_from",    params.date_from);
  if (params?.date_to)              qs.set("date_to",      params.date_to);
  if (params?.warehouse_id != null) qs.set("warehouse_id", String(params.warehouse_id));
  const query = qs.toString();
  const res = await fetch(`${BASE}/report/profit${query ? "?" + query : ""}`);
  const data = await res.json();
  return data.rows ?? [];
}


// ── CSV Import ────────────────────────────────────────────────────────────────

export interface CsvImportResult {
  imported: number;
  errors: { row: number; field: string; message: string }[];
}

export async function importCsv(importType: string, file: File): Promise<CsvImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/import/${importType}`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Import gagal" }));
    throw new Error(err.detail ?? "Import gagal");
  }
  return res.json();
}

export async function downloadCsvTemplate(importType: string): Promise<void> {
  const res = await fetch(`${BASE}/import/template/${importType}`);
  if (!res.ok) throw new Error("Gagal mengunduh template");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `template_${importType}.csv`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Import Logs ───────────────────────────────────────────────────────────────

export interface ImportLogError {
  row: number;
  field: string;
  message: string;
}

export interface ImportLogSummary {
  id: number;
  import_type: string;
  filename: string;
  total_rows: number;
  imported: number;
  skipped: number;
  products_imported: number;
  variants_imported: number;
  error_count: number;
  created_at: number;
}

export interface ImportLogDetail extends ImportLogSummary {
  errors: ImportLogError[];
}

export async function listImportLogs(opts?: { limit?: number; offset?: number }): Promise<{ logs: ImportLogSummary[]; total: number }> {
  const qs = new URLSearchParams();
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  if (opts?.offset != null) qs.set("offset", String(opts.offset));
  const res = await fetch(`${BASE}/import/logs${qs.toString() ? "?" + qs : ""}`);
  return res.json();
}

export async function getImportLog(id: number): Promise<ImportLogDetail> {
  const res = await fetch(`${BASE}/import/logs/${id}`);
  if (!res.ok) throw new Error("Log tidak ditemukan");
  return res.json();
}

export async function deleteImportLog(id: number): Promise<void> {
  await fetch(`${BASE}/import/logs/${id}`, { method: "DELETE" });
}

export async function downloadImportResultCsv(id: number, importType: string): Promise<void> {
  const res = await fetch(`${BASE}/import/logs/${id}/result.csv`);
  if (!res.ok) throw new Error("Gagal mengunduh CSV hasil import");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `result_${id}_${importType}.csv`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
