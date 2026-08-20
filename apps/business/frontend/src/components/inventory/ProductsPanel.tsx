"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, AlertTriangle,
  Upload, Image as ImageIcon, ChevronLeft,
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { CsvImportModal } from "./CsvImportModal";
import { useT } from "@/lib/i18n";
import {
  listProducts, createProduct, updateProduct, deleteProduct,
  listBrands, listCategories, listSubcategories,
  createVariant, updateVariant, deleteVariant,
  listStockLevels,
  uploadProductImage, deleteProductImage, listProductImages,
  PRODUCT_IMAGE_BASE, MAX_IMAGE_MB, MAX_IMAGES_PER_PRODUCT,
  type ProductImage,
} from "@/lib/inventoryApi";
import type {
  Product, Brand, InvCategory as Category, Subcategory,
  ProductVariant, StockLevel, ProductType, CostMethod,
} from "@/types";
import { clsx } from "clsx";

const PAGE_SIZE = 25;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface ProductForm {
  name: string;
  sku: string;
  unit: string;
  min_stock: string;
  type: ProductType;
  cost_method: CostMethod;
  brand_id: string;
  category_id: string;
  subcategory_id: string;
  active: boolean;
  is_for_sale: boolean;
  description: string;
}

interface VariantForm {
  name: string;
  sku_suffix: string;
  fixed_cost: string;
  selling_price: string;
  default_unit_cost: string;
  color: string;
}

const EMPTY_PRODUCT: ProductForm = {
  name: "", sku: "", unit: "pcs", min_stock: "0",
  type: "physical", cost_method: "average",
  brand_id: "", category_id: "", subcategory_id: "",
  active: true, is_for_sale: true, description: "",
};
const EMPTY_VARIANT: VariantForm = {
  name: "", sku_suffix: "", fixed_cost: "", selling_price: "",
  default_unit_cost: "", color: "#6b7280",
};

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ── Image uploader (inside product form) ──────────────────────────────────────

function ProductImageUploader({
  productId,
  images,
  onChanged,
}: {
  productId: number;
  images: ProductImage[];
  onChanged: () => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const file = files[0];
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t("inventory.product.imageTypeInvalid"));
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(t("inventory.product.imageTooBig").replace("{size}", String(MAX_IMAGE_MB)));
      return;
    }
    if (images.length >= MAX_IMAGES_PER_PRODUCT) {
      setError(t("inventory.product.imageMaxReached").replace("{max}", String(MAX_IMAGES_PER_PRODUCT)));
      return;
    }
    setUploading(true);
    try {
      await uploadProductImage(productId, file);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (img: ProductImage) => {
    if (!confirm(t("inventory.product.imageDeleteConfirm"))) return;
    try {
      await deleteProductImage(img.id);
      onChanged();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs th-text-muted">{t("inventory.product.images")}</label>
        <span className="text-[10px] th-text-muted">
          {images.length}/{MAX_IMAGES_PER_PRODUCT}
        </span>
      </div>
      <p className="text-[11px] th-text-muted leading-tight">
        {t("inventory.product.imagesHint")
          .replace("{max}", String(MAX_IMAGES_PER_PRODUCT))
          .replace("{size}", String(MAX_IMAGE_MB))}
      </p>

      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={`${PRODUCT_IMAGE_BASE}/${img.filename}`}
                alt=""
                className="w-16 h-16 object-cover rounded-lg border th-border"
              />
              <button
                type="button"
                onClick={() => handleDelete(img)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
              <span className="absolute bottom-0.5 left-0.5 right-0.5 text-[9px] text-center text-white/80 bg-black/40 rounded px-0.5 truncate">
                {fmtBytes(img.size_bytes)}
              </span>
            </div>
          ))}
        </div>
      )}

      {images.length < MAX_IMAGES_PER_PRODUCT && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg th-bg-elevated th-border border th-text-muted hover:th-text transition-colors disabled:opacity-40"
          >
            <ImageIcon size={12} />
            {uploading ? t("inventory.product.imageUploading") : t("inventory.product.imageUpload")}
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ProductsPanel() {
  const t = useT();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set());

  const [showProductForm, setShowProductForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT);
  const [imageModalProduct, setImageModalProduct] = useState<{ id: number; name: string } | null>(null);
  const [imageModalImages, setImageModalImages] = useState<ProductImage[]>([]);

  const [showVariantForm, setShowVariantForm] = useState<number | null>(null);
  const [editVariant, setEditVariant] = useState<ProductVariant | null>(null);
  const [variantForm, setVariantForm] = useState<VariantForm>(EMPTY_VARIANT);
  const [saving, setSaving] = useState(false);

  const [filterCategoryId, setFilterCategoryId] = useState<number | undefined>(undefined);
  const [filterSubcategoryId, setFilterSubcategoryId] = useState<number | undefined>(undefined);
  const [filterBrandId, setFilterBrandId] = useState<number | undefined>(undefined);
  const [showInactive, setShowInactive] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Subcategories visible in the filter dropdown — filtered by selected category
  const filterSubcategories = filterCategoryId
    ? subcategories.filter((s) => s.category_id === filterCategoryId)
    : subcategories;

  const loadMeta = useCallback(async () => {
    try {
      const [br, cats, subs, stock] = await Promise.all([
        listBrands(), listCategories(), listSubcategories(), listStockLevels(),
      ]);
      setBrands(br);
      setCategories(cats);
      setSubcategories(subs);
      setStockLevels(stock);
    } catch { /* ignore */ }
  }, []);

  const loadProducts = useCallback(async (
    pg = 0, q = "",
    catId?: number, subCatId?: number, brandId?: number, inactive = false,
  ) => {
    try {
      const result = await listProducts({
        activeOnly: !inactive,
        brandId,
        categoryId: catId,
        subcategoryId: subCatId,
        q: q || undefined,
        limit: PAGE_SIZE,
        offset: pg * PAGE_SIZE,
      });
      setProducts(result.products);
      setTotal(result.total);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadProducts(page, search, filterCategoryId, filterSubcategoryId, filterBrandId, showInactive);
  }, [loadProducts, page, search, filterCategoryId, filterSubcategoryId, filterBrandId, showInactive]);

  const applyFilter = (opts: {
    catId?: number; subCatId?: number; brandId?: number; inactive?: boolean;
  }) => {
    setPage(0);
    if ("catId" in opts) setFilterCategoryId(opts.catId);
    if ("subCatId" in opts) setFilterSubcategoryId(opts.subCatId);
    if ("brandId" in opts) setFilterBrandId(opts.brandId);
    if (opts.inactive !== undefined) setShowInactive(opts.inactive);
  };

  const clearFilters = () => {
    setPage(0);
    setFilterCategoryId(undefined);
    setFilterSubcategoryId(undefined);
    setFilterBrandId(undefined);
  };

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(val);
      setPage(0);
    }, 300);
  };

  const reload = () => loadProducts(page, search, filterCategoryId, filterSubcategoryId, filterBrandId, showInactive);

  async function openImageModal(productId: number, productName: string) {
    const imgs = await listProductImages(productId).catch(() => [] as ProductImage[]);
    setImageModalImages(imgs);
    setImageModalProduct({ id: productId, name: productName });
  }

  function closeImageModal() {
    setImageModalProduct(null);
    setImageModalImages([]);
    reload();
  }

  function totalStock(variantId: number): number {
    return stockLevels.filter((s) => s.variant_id === variantId).reduce((a, s) => a + s.qty, 0);
  }

  function isLowStock(product: Product): boolean {
    return product.variants.some((v) => totalStock(v.id) <= product.min_stock);
  }

  const formSubcategories = productForm.category_id
    ? subcategories.filter((s) => s.category_id === Number(productForm.category_id))
    : [];

  function openCreateProduct() {
    setEditProduct(null);
    setProductForm(EMPTY_PRODUCT);
    setShowProductForm(true);
  }

  function openEditProduct(p: Product) {
    setEditProduct(p);
    setProductForm({
      name: p.name,
      sku: p.sku ?? "",
      unit: p.unit,
      min_stock: String(p.min_stock),
      type: (p.type as ProductType) ?? "physical",
      cost_method: (p.cost_method as CostMethod) ?? "average",
      brand_id: String(p.brand_id ?? ""),
      category_id: String(p.category_id ?? ""),
      subcategory_id: String(p.subcategory_id ?? ""),
      active: !!p.active,
      is_for_sale: !!p.is_for_sale,
      description: p.description ?? "",
    });
    setShowProductForm(true);
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (productForm.is_for_sale) {
      if (!productForm.brand_id) { alert(t("inventory.product.validBrand")); return; }
      if (!productForm.subcategory_id) { alert(t("inventory.product.validSubcategory")); return; }
    } else {
      if (!productForm.subcategory_id) { alert(t("inventory.product.validSubcategoryAsset")); return; }
    }
    setSaving(true);
    try {
      const isPhysical = productForm.type === "physical";
      const payload = {
        name: productForm.name,
        sku: productForm.sku || undefined,
        unit: productForm.unit,
        min_stock: isPhysical ? (parseFloat(productForm.min_stock) || 0) : 0,
        type: productForm.type,
        cost_method: productForm.cost_method,
        brand_id: productForm.brand_id ? parseInt(productForm.brand_id) : null,
        subcategory_id: productForm.subcategory_id ? parseInt(productForm.subcategory_id) : null,
        active: productForm.active,
        is_for_sale: productForm.is_for_sale,
        description: productForm.description || null,
      };
      if (editProduct) {
        await updateProduct(editProduct.id, payload);
        setShowProductForm(false);
        await reload();
      } else {
        const created = await createProduct(payload);
        setShowProductForm(false);
        await reload();
        // Immediately open image modal for the new product
        await openImageModal(created.id, created.name);
      }
    } finally { setSaving(false); }
  }

  async function handleDeleteProduct(p: Product) {
    if (!confirm(t("inventory.product.deleteConfirm"))) return;
    await deleteProduct(p.id);
    await reload();
  }

  function openCreateVariant(productId: number) {
    setEditVariant(null);
    setVariantForm(EMPTY_VARIANT);
    setShowVariantForm(productId);
  }

  function openEditVariant(v: ProductVariant) {
    setEditVariant(v);
    setVariantForm({
      name: v.name,
      sku_suffix: v.sku_suffix ?? "",
      fixed_cost: v.fixed_cost != null ? String(v.fixed_cost) : "",
      selling_price: v.selling_price != null ? String(v.selling_price) : "",
      default_unit_cost: v.default_unit_cost != null ? String(v.default_unit_cost) : "",
      color: v.color ?? "#6b7280",
    });
    setShowVariantForm(v.product_id);
  }

  async function handleSaveVariant(e: React.FormEvent) {
    e.preventDefault();
    if (!showVariantForm) return;
    setSaving(true);
    try {
      const payload = {
        name: variantForm.name,
        sku_suffix: variantForm.sku_suffix || undefined,
        fixed_cost: variantForm.fixed_cost ? parseFloat(variantForm.fixed_cost) : null,
        selling_price: variantForm.selling_price ? parseFloat(variantForm.selling_price) : null,
        default_unit_cost: variantForm.default_unit_cost ? parseFloat(variantForm.default_unit_cost) : null,
        color: variantForm.color,
      };
      if (editVariant) await updateVariant(editVariant.id, payload);
      else await createVariant(showVariantForm, payload);
      setShowVariantForm(null);
      await reload();
    } finally { setSaving(false); }
  }

  async function handleDeleteVariant(v: ProductVariant) {
    if (!confirm(t("inventory.product.deleteVariantConfirm"))) return;
    await deleteVariant(v.id);
    await reload();
  }

  function fmt(n: number) {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
  }

  const variantProductIsForSale = () => {
    if (!showVariantForm) return true;
    const p = products.find((p) => p.id === showVariantForm);
    return p ? !!p.is_for_sale : true;
  };

  return (
    <div className="p-4 max-w-3xl mx-auto flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold th-text">{t("inventory.products")}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg th-bg-elevated th-text-muted hover:th-text border th-border text-xs transition-colors"
          >
            <Upload size={13} />
            {t("common.importCsv")}
          </button>
          <button
            onClick={openCreateProduct}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors"
          >
            <Plus size={13} />
            {t("inventory.product.new")}
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder={t("inventory.product.search")}
        className="w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex-1 min-w-[120px] max-w-[160px]">
          <SearchableSelect
            value={filterCategoryId?.toString() ?? ""}
            onChange={(v) => applyFilter({
              catId: v ? Number(v) : undefined,
              subCatId: undefined, // reset subcategory when category changes
              brandId: filterBrandId,
            })}
            clearable
            placeholder={t("inventory.product.categoryFilter")}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
          />
        </div>
        <div className="flex-1 min-w-[120px] max-w-[160px]">
          <SearchableSelect
            value={filterSubcategoryId?.toString() ?? ""}
            onChange={(v) => applyFilter({ catId: filterCategoryId, subCatId: v ? Number(v) : undefined, brandId: filterBrandId })}
            clearable
            disabled={filterSubcategories.length === 0}
            placeholder={t("inventory.product.subcategoryFilter")}
            options={filterSubcategories.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        </div>
        <div className="flex-1 min-w-[120px] max-w-[160px]">
          <SearchableSelect
            value={filterBrandId?.toString() ?? ""}
            onChange={(v) => applyFilter({ catId: filterCategoryId, subCatId: filterSubcategoryId, brandId: v ? Number(v) : undefined })}
            clearable
            placeholder={t("inventory.product.brand")}
            options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
          />
        </div>
        {(filterCategoryId || filterSubcategoryId || filterBrandId) && (
          <button
            onClick={clearFilters}
            className="px-2 py-1 rounded-lg text-xs th-text-muted hover:th-text transition-colors border th-border"
            title="Reset filter"
          >
            <X size={11} />
          </button>
        )}
        <button
          onClick={() => applyFilter({ catId: filterCategoryId, subCatId: filterSubcategoryId, brandId: filterBrandId, inactive: !showInactive })}
          className={clsx(
            "px-2.5 py-1 rounded-lg text-xs transition-colors border whitespace-nowrap",
            showInactive
              ? "bg-brand-600/20 text-brand-400 border-brand-600/40"
              : "th-text-muted hover:th-text th-border"
          )}
        >
          {showInactive ? t("inventory.product.hideInactive") : t("inventory.product.showInactive")}
        </button>
      </div>

      {/* Product list */}
      {products.length === 0 ? (
        <p className="text-sm th-text-muted py-8 text-center">{t("inventory.product.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((p) => {
            const open = expanded.has(p.id);
            const low = isLowStock(p);
            const thumb = p.images?.[0];
            return (
              <div key={p.id} className="card overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                    className="shrink-0 th-text-muted hover:th-text transition-colors"
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {/* Thumbnail */}
                  {thumb ? (
                    <img
                      src={`${PRODUCT_IMAGE_BASE}/${thumb.filename}`}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover shrink-0 border th-border"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg th-bg-elevated border th-border shrink-0 flex items-center justify-center">
                      <ImageIcon size={14} className="th-text-muted opacity-40" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium th-text truncate">{p.name}</span>
                      {low && <AlertTriangle size={12} className="text-amber-400 shrink-0" />}
                      {!p.active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full th-bg-elevated th-text-muted">
                          {t("inventory.product.inactive")}
                        </span>
                      )}
                      {p.type === "service" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400">
                          {t("inventory.product.typeService")}
                        </span>
                      )}
                      {p.type === "digital" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">
                          {t("inventory.product.typeDigital")}
                        </span>
                      )}
                      {!p.is_for_sale && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400">
                          {t("inventory.product.operationalAsset")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {p.sku && <span className="text-[11px] th-text-muted font-mono">{p.sku}</span>}
                      <span className="text-[11px] th-text-muted">{p.unit}</span>
                      {p.brand_name && <span className="text-[11px] th-text-muted">{p.brand_name}</span>}
                      {p.subcategory_name && (
                        <span className="text-[11px] th-text-muted">
                          {p.category_name && `${p.category_name} / `}{p.subcategory_name}
                        </span>
                      )}
                      <span className="text-[11px] th-text-muted">{p.variants.length} varian</span>
                      {p.type === "physical" && p.cost_method && (
                        <span className="text-[11px] th-text-muted uppercase font-mono">{p.cost_method}</span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-[11px] th-text-muted mt-0.5 truncate">{p.description}</p>
                    )}
                  </div>

                  <button
                    onClick={() => openImageModal(p.id, p.name)}
                    className="p-1 th-text-muted hover:th-text transition-colors relative"
                    title={t("inventory.product.manageImages")}
                  >
                    <ImageIcon size={12} />
                    {p.images && p.images.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand-500" />
                    )}
                  </button>
                  <button onClick={() => openEditProduct(p)} className="p-1 th-text-muted hover:th-text transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleDeleteProduct(p)} className="p-1 th-text-muted hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>

                {open && (
                  <div className="border-t th-border th-bg-elevated/30 px-3 py-2 flex flex-col gap-1.5">
                    {/* Images strip */}
                    {p.images && p.images.length > 0 && (
                      <div className="flex gap-1.5 mb-1 flex-wrap">
                        {p.images.map((img) => (
                          <img
                            key={img.id}
                            src={`${PRODUCT_IMAGE_BASE}/${img.filename}`}
                            alt=""
                            className="w-12 h-12 object-cover rounded-lg border th-border"
                          />
                        ))}
                      </div>
                    )}

                    {p.variants.map((v) => {
                      const qty = totalStock(v.id);
                      const isVarLow = qty <= p.min_stock;
                      const varStocks = stockLevels.filter((s) => s.variant_id === v.id);
                      const varOpen = expandedVariants.has(v.id);
                      return (
                        <div key={v.id}>
                          <div
                            className="flex items-center gap-2 py-1 px-2 rounded-lg hover:th-bg-elevated transition-colors cursor-pointer"
                            onClick={() => setExpandedVariants((s) => { const n = new Set(s); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n; })}
                          >
                            <span className="shrink-0 th-text-muted">
                              {varOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </span>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v.color ?? "#6b7280" }} />
                            <span className="text-xs th-text flex-1 truncate">{v.name}</span>
                            {v.sku_suffix && <span className="text-[11px] th-text-muted font-mono">{v.sku_suffix}</span>}
                            {v.default_unit_cost != null && <span className="text-[11px] th-text-muted">Beli: {fmt(v.default_unit_cost)}</span>}
                            {p.is_for_sale && v.selling_price != null && (
                              <span className="text-[11px] text-emerald-400">Jual: {fmt(v.selling_price)}</span>
                            )}
                            <span className={clsx("text-[11px] font-medium tabular-nums", isVarLow ? "text-amber-400" : "th-text-muted")}>
                              {qty} {p.unit}
                            </span>
                            <button onClick={(e) => { e.stopPropagation(); openEditVariant(v); }} className="p-0.5 th-text-muted hover:th-text transition-colors">
                              <Pencil size={10} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteVariant(v); }} className="p-0.5 th-text-muted hover:text-red-400 transition-colors">
                              <Trash2 size={10} />
                            </button>
                          </div>
                          {varOpen && varStocks.length > 0 && (
                            <div className="ml-8 mb-1 flex flex-col gap-0.5">
                              {varStocks.map((s) => (
                                <div key={s.warehouse_id} className="flex items-center gap-2 px-2 py-0.5 text-[11px] th-text-muted">
                                  <span className="flex-1">{s.warehouse_name}</span>
                                  <span className="tabular-nums">{s.qty} {p.unit}</span>
                                  {s.avg_cost > 0 && <span className="tabular-nums th-text-muted/60">avg {fmt(s.avg_cost)}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          {varOpen && varStocks.length === 0 && (
                            <p className="ml-8 mb-1 px-2 text-[11px] th-text-muted/60">Belum ada stok di gudang manapun</p>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => openCreateVariant(p.id)}
                      className="flex items-center gap-1 text-xs th-text-muted hover:th-text transition-colors py-1 px-2"
                    >
                      <Plus size={11} />
                      {t("inventory.product.addVariant")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border th-border th-text-muted hover:th-text disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={13} />
            {t("common.prev")}
          </button>
          <span className="text-xs th-text-muted">
            {t("inventory.product.page")} {page + 1} {t("inventory.product.of")} {totalPages}
            <span className="ml-2 th-text-muted/60">({total} {t("inventory.products").toLowerCase()})</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border th-border th-text-muted hover:th-text disabled:opacity-40 transition-colors"
          >
            {t("common.next")}
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* Product form modal */}
      {showProductForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold th-text">
                {editProduct ? t("inventory.product.edit") : t("inventory.product.new")}
              </h3>
              <button onClick={() => setShowProductForm(false)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="flex flex-col gap-3">
              {/* Product type */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.product.type")}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["physical", "service", "digital"] as ProductType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setProductForm((f) => ({ ...f, type }))}
                      className={clsx(
                        "py-1.5 rounded-lg text-xs font-medium transition-colors border",
                        productForm.type === type
                          ? "bg-brand-600/20 text-brand-400 border-brand-600/40"
                          : "th-bg-elevated th-text-muted th-border hover:th-text"
                      )}
                    >
                      {t(`inventory.product.type.${type}` as Parameters<typeof t>[0])}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.product.name")}</label>
                <input
                  required
                  autoFocus
                  value={productForm.name}
                  onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.product.sku")}</label>
                  <input
                    value={productForm.sku}
                    onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                    className="input-field"
                    placeholder="SKU-001"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.product.unit")}</label>
                  <input
                    required
                    value={productForm.unit}
                    onChange={(e) => setProductForm((f) => ({ ...f, unit: e.target.value }))}
                    className="input-field"
                    placeholder="pcs"
                  />
                </div>
              </div>

              {productForm.type === "physical" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.product.minStock")}</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={productForm.min_stock}
                    onChange={(e) => setProductForm((f) => ({ ...f, min_stock: e.target.value }))}
                    className="input-field"
                  />
                </div>
              )}

              {productForm.type === "physical" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.product.costMethod")}</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["fifo", "average", "fixed"] as CostMethod[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setProductForm((f) => ({ ...f, cost_method: m }))}
                        className={clsx(
                          "py-1.5 rounded-lg text-xs font-medium transition-colors border",
                          productForm.cost_method === m
                            ? "bg-brand-600/20 text-brand-400 border-brand-600/40"
                            : "th-bg-elevated th-text-muted th-border hover:th-text"
                        )}
                      >
                        {m === "fifo" ? "FIFO" : m === "average" ? t("inventory.product.costAverage") : t("inventory.product.costFixed")}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] th-text-muted">{t("inventory.product.costMethodDesc")}</p>
                </div>
              )}

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.product.description")}</label>
                <textarea
                  rows={2}
                  value={productForm.description}
                  onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                  className="input-field resize-none text-sm"
                  placeholder={t("inventory.product.descriptionPlaceholder")}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.product.brand")}</label>
                <SearchableSelect
                  value={productForm.brand_id}
                  onChange={(v) => setProductForm((f) => ({ ...f, brand_id: v }))}
                  clearable
                  placeholder={t("inventory.product.noBrand")}
                  options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">
                  {t("inventory.product.category")} <span className="text-red-400">*</span>
                </label>
                <SearchableSelect
                  value={productForm.category_id}
                  onChange={(v) => setProductForm((f) => ({ ...f, category_id: v, subcategory_id: "" }))}
                  placeholder={`— ${t("inventory.product.selectCategory")} —`}
                  options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">
                  {t("inventory.product.subcategory")} <span className="text-red-400">*</span>
                </label>
                <SearchableSelect
                  value={productForm.subcategory_id}
                  onChange={(v) => setProductForm((f) => ({ ...f, subcategory_id: v }))}
                  disabled={!productForm.category_id}
                  placeholder={!productForm.category_id
                    ? `— ${t("inventory.product.selectCategoryFirst")} —`
                    : `— ${t("inventory.product.selectSubcategory")} —`}
                  options={formSubcategories.map((s) => ({ value: String(s.id), label: s.name }))}
                />
              </div>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productForm.active}
                  onChange={(e) => setProductForm((f) => ({ ...f, active: e.target.checked }))}
                  className="rounded mt-0.5"
                />
                <div>
                  <span className="text-xs th-text">{t("inventory.product.activeLabel")}</span>
                  <p className="text-[11px] th-text-muted">{t("inventory.product.activeDesc")}</p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productForm.is_for_sale}
                  onChange={(e) => setProductForm((f) => ({ ...f, is_for_sale: e.target.checked }))}
                  className="rounded mt-0.5"
                />
                <div>
                  <span className="text-xs th-text">{t("inventory.product.isForSale")}</span>
                  <p className="text-[11px] th-text-muted">{t("inventory.product.isForSaleDesc")}</p>
                </div>
              </label>

              {/* Image button — open dedicated image modal */}
              {editProduct && (
                <button
                  type="button"
                  onClick={() => openImageModal(editProduct.id, editProduct.name)}
                  className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border th-border th-text-muted hover:th-text transition-colors"
                >
                  <ImageIcon size={13} />
                  {t("inventory.product.manageImages")}
                  {editProduct.images && editProduct.images.length > 0 && (
                    <span className="ml-auto text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full">
                      {editProduct.images.length}
                    </span>
                  )}
                </button>
              )}
              {!editProduct && (
                <p className="text-[11px] th-text-muted italic">
                  {t("inventory.product.imagesSaveFirst")}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowProductForm(false)}
                  className="flex-1 py-2 rounded-xl border th-border th-text text-sm transition-colors hover:th-bg-elevated"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Variant form modal */}
      {showVariantForm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold th-text">
                {editVariant ? t("inventory.product.variantName") : t("inventory.product.addVariant")}
              </h3>
              <button onClick={() => setShowVariantForm(null)} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveVariant} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.product.variantName")}</label>
                <input
                  required
                  autoFocus
                  value={variantForm.name}
                  onChange={(e) => setVariantForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  placeholder="S / Merah / 500ml"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.product.skuSuffix")}</label>
                <input
                  value={variantForm.sku_suffix}
                  onChange={(e) => setVariantForm((f) => ({ ...f, sku_suffix: e.target.value }))}
                  className="input-field"
                  placeholder="-S"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.product.variantColor")}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={variantForm.color}
                    onChange={(e) => setVariantForm((f) => ({ ...f, color: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer border th-border bg-transparent"
                  />
                  <input
                    value={variantForm.color}
                    onChange={(e) => setVariantForm((f) => ({ ...f, color: e.target.value }))}
                    className="input-field flex-1 font-mono text-xs"
                    placeholder="#6b7280"
                  />
                </div>
              </div>
              <div className={variantProductIsForSale() ? "grid grid-cols-2 gap-3" : ""}>
                <div className="flex flex-col gap-1">
                  <label className="text-xs th-text-muted">{t("inventory.product.defaultUnitCost")}</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={variantForm.default_unit_cost}
                    onChange={(e) => setVariantForm((f) => ({ ...f, default_unit_cost: e.target.value }))}
                    className="input-field"
                    placeholder="Opsional"
                  />
                </div>
                {variantProductIsForSale() && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs th-text-muted">{t("inventory.product.sellingPrice")}</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={variantForm.selling_price}
                      onChange={(e) => setVariantForm((f) => ({ ...f, selling_price: e.target.value }))}
                      className="input-field"
                      placeholder="Opsional"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs th-text-muted">{t("inventory.product.fixedCost")}</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={variantForm.fixed_cost}
                  onChange={(e) => setVariantForm((f) => ({ ...f, fixed_cost: e.target.value }))}
                  className="input-field"
                  placeholder="Opsional"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowVariantForm(null)}
                  className="flex-1 py-2 rounded-xl border th-border th-text text-sm transition-colors hover:th-bg-elevated"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImport && (
        <CsvImportModal
          importType="products_with_variants"
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); reload(); }}
        />
      )}

      {/* ── Dedicated Image Modal ── */}
      {imageModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b th-border shrink-0">
              <div>
                <h3 className="text-sm font-semibold th-text">{t("inventory.product.images")}</h3>
                <p className="text-xs th-text-muted mt-0.5 truncate max-w-[280px]">{imageModalProduct.name}</p>
              </div>
              <button onClick={closeImageModal} className="th-text-muted hover:th-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <ProductImageUploader
                productId={imageModalProduct.id}
                images={imageModalImages}
                onChanged={async () => {
                  const fresh = await listProductImages(imageModalProduct.id).catch(() => [] as ProductImage[]);
                  setImageModalImages(fresh);
                }}
              />
            </div>
            <div className="px-5 py-3 border-t th-border shrink-0">
              <button
                onClick={closeImageModal}
                className="w-full py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
