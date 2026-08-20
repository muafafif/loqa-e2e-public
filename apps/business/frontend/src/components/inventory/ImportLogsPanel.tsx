"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Upload, Download, Trash2, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertTriangle, FileText, RefreshCw,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { clsx } from "clsx";
import {
  listImportLogs, getImportLog, deleteImportLog, downloadImportResultCsv,
  type ImportLogSummary, type ImportLogDetail,
} from "@/lib/inventoryApi";
import { CsvImportModal } from "./CsvImportModal";

const PAGE_SIZE = 20;

const FMT_DATE = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

function fmtDate(ms: number) { return FMT_DATE.format(new Date(ms)); }

const TYPE_LABELS: Record<string, string> = {
  products_with_variants: "Produk & Varian",
  products:               "Produk",
  variants:               "Varian",
  brands:                 "Brand",
  categories:             "Kategori",
  subcategories:          "Subkategori",
  warehouses:             "Gudang",
  product_categories:     "Kategori Produk",
};

function StatusBadge({ log }: { log: ImportLogSummary }) {
  if (log.error_count === 0) {
    return (
      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium shrink-0">
        <CheckCircle2 size={10} />
        Sukses
      </span>
    );
  }
  if (log.imported === 0) {
    return (
      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium shrink-0">
        <XCircle size={10} />
        Gagal
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium shrink-0">
      <AlertTriangle size={10} />
      Sebagian
    </span>
  );
}

// ── Error detail row ──────────────────────────────────────────────────────────

const ERROR_PREVIEW_LIMIT = 5;

function ErrorTable({ errors, logId, importType }: {
  errors: ImportLogDetail["errors"];
  logId: number;
  importType: string;
}) {
  const t = useT();
  const [downloading, setDownloading] = useState(false);
  if (errors.length === 0) return null;

  const preview = errors.slice(0, ERROR_PREVIEW_LIMIT);
  const overflow = errors.length - ERROR_PREVIEW_LIMIT;

  const handleDownload = async () => {
    setDownloading(true);
    try { await downloadImportResultCsv(logId, importType); }
    catch { /* ignore */ }
    finally { setDownloading(false); }
  };

  return (
    <div className="rounded-xl border th-border overflow-hidden">
      <div className="px-3 py-2 th-bg-elevated border-b th-border flex items-center justify-between">
        <span className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
          <XCircle size={12} />
          {errors.length} baris gagal
        </span>
        {overflow > 0 && (
          <span className="text-[11px] th-text-muted">
            {t("inventory.import.errorsPreview").replace("{n}", String(ERROR_PREVIEW_LIMIT))}
          </span>
        )}
      </div>
      <div className="divide-y th-border">
        {preview.map((err, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 shrink-0 mt-0.5 font-mono">
              Baris {err.row}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium text-amber-400">{err.field}</span>
              <span className="text-xs th-text-muted"> — {err.message}</span>
            </div>
          </div>
        ))}
      </div>
      {overflow > 0 && (
        <div className="px-3 py-2.5 th-bg-elevated border-t th-border flex items-center justify-between">
          <span className="text-xs th-text-muted">
            {t("inventory.import.errorsOverflow").replace("{n}", String(overflow))}
          </span>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-40"
          >
            <Download size={11} />
            {downloading ? "…" : t("inventory.import.downloadResult")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({
  log,
  onDelete,
  onRefresh,
}: {
  log: ImportLogSummary;
  onDelete: (id: number) => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ImportLogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (detail) return;
    setLoadingDetail(true);
    try {
      setDetail(await getImportLog(log.id));
    } catch { /* ignore */ }
    finally { setLoadingDetail(false); }
  };

  const handleDownloadResult = async () => {
    setDownloading(true);
    try {
      await downloadImportResultCsv(log.id, log.import_type);
    } catch { /* ignore */ }
    finally { setDownloading(false); }
  };

  const handleDelete = async () => {
    if (!confirm(t("inventory.import.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await deleteImportLog(log.id);
      onDelete(log.id);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  const typeLabel = TYPE_LABELS[log.import_type] ?? log.import_type;
  const isCombined = log.import_type === "products_with_variants";

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:th-bg-elevated transition-colors"
        onClick={handleExpand}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium th-text truncate max-w-[180px]">{log.filename}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full th-bg-elevated th-text-muted border th-border shrink-0">
              {typeLabel}
            </span>
            <StatusBadge log={log} />
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {isCombined ? (
              <>
                {log.products_imported > 0 && (
                  <span className="text-[11px] text-emerald-400">{log.products_imported} produk</span>
                )}
                {log.variants_imported > 0 && (
                  <span className="text-[11px] text-emerald-400">{log.variants_imported} varian</span>
                )}
              </>
            ) : (
              log.imported > 0 && (
                <span className="text-[11px] text-emerald-400">{log.imported} berhasil</span>
              )
            )}
            {log.error_count > 0 && (
              <span className="text-[11px] text-red-400">{log.error_count} gagal</span>
            )}
            <span className="text-[11px] th-text-muted">{log.total_rows} total baris</span>
            <span className="text-[11px] th-text-muted">{fmtDate(log.created_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleDownloadResult}
            disabled={downloading}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg th-bg-elevated border th-border th-text-muted hover:th-text hover:border-brand-500/30 transition-colors disabled:opacity-40"
            title={t("inventory.import.downloadResult")}
          >
            <Download size={11} />
            {downloading ? "…" : t("inventory.import.downloadResult")}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 th-text-muted hover:text-red-400 transition-colors disabled:opacity-40"
            title={t("common.delete")}
          >
            <Trash2 size={13} />
          </button>
        </div>

        <div className="th-text-muted shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t th-border px-4 py-3 flex flex-col gap-3">
          {loadingDetail && (
            <p className="text-xs th-text-muted">Memuat detail…</p>
          )}
          {detail && (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Total Baris", value: detail.total_rows, color: "th-text" },
                  { label: "Berhasil", value: isCombined ? `${detail.products_imported}P + ${detail.variants_imported}V` : detail.imported, color: "text-emerald-400" },
                  { label: "Gagal", value: detail.errors.length, color: detail.errors.length > 0 ? "text-red-400" : "th-text-muted" },
                  { label: "Di-skip", value: detail.skipped, color: detail.skipped > 0 ? "text-amber-400" : "th-text-muted" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="th-bg-elevated rounded-lg px-3 py-2 text-center">
                    <div className={clsx("text-sm font-bold", color)}>{value}</div>
                    <div className="text-[10px] th-text-muted mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {/* Error table */}
              <ErrorTable errors={detail.errors} logId={log.id} importType={log.import_type} />

              {detail.errors.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span className="text-xs text-emerald-400">Semua baris berhasil diimpor tanpa error.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ImportLogsPanel() {
  const t = useT();
  const [logs, setLogs] = useState<ImportLogSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (pg = 0) => {
    setLoading(true);
    try {
      const res = await listImportLogs({ limit: PAGE_SIZE, offset: pg * PAGE_SIZE });
      setLogs(res.logs);
      setTotal(res.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const handleDelete = (id: number) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setTotal((t) => t - 1);
  };

  return (
    <div className="p-4 max-w-3xl mx-auto flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold th-text">{t("inventory.import.title")}</h2>
          <p className="text-xs th-text-muted mt-0.5">{t("inventory.import.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(page)}
            disabled={loading}
            className="p-2 th-text-muted hover:th-text transition-colors disabled:opacity-40"
            title={t("common.refresh")}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors"
          >
            <Upload size={13} />
            {t("common.importCsv")}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && logs.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3 th-text-muted">
          <FileText size={36} className="opacity-30" />
          <p className="text-sm font-medium">{t("inventory.import.empty")}</p>
          <p className="text-xs">{t("inventory.import.emptyHint")}</p>
        </div>
      )}

      {/* Log list */}
      {logs.length > 0 && (
        <div className="flex flex-col gap-2">
          {logs.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              onDelete={handleDelete}
              onRefresh={() => load(page)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => { const p = Math.max(0, page - 1); setPage(p); load(p); }}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border th-border th-text-muted hover:th-text disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={13} />
            {t("common.prev")}
          </button>
          <span className="text-xs th-text-muted">
            {t("inventory.product.page")} {page + 1} {t("inventory.product.of")} {totalPages}
          </span>
          <button
            onClick={() => { const p = Math.min(totalPages - 1, page + 1); setPage(p); load(p); }}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border th-border th-text-muted hover:th-text disabled:opacity-40 transition-colors"
          >
            {t("common.next")}
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <CsvImportModal
          importType="products_with_variants"
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); setPage(0); load(0); }}
        />
      )}
    </div>
  );
}
