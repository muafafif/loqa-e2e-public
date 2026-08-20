"use client";

import { useState, useRef, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { importCsv, downloadCsvTemplate, downloadImportResultCsv } from "@/lib/inventoryApi";
import { X, Upload, Download, CheckCircle, AlertTriangle, FileText } from "lucide-react";
import { clsx } from "clsx";

interface ImportResult {
  imported: number;
  products_imported?: number;
  variants_imported?: number;
  errors: { row: number; field: string; message: string }[];
  log_id?: number;
}

export type CsvImportType =
  | "products"
  | "variants"
  | "products_with_variants"
  | "brands"
  | "categories"
  | "subcategories"
  | "warehouses"
  | "product_categories";

const TYPE_LABELS: Record<CsvImportType, string> = {
  products:               "Produk",
  variants:               "Varian Produk",
  products_with_variants: "Produk & Varian",
  brands:                 "Brand",
  categories:             "Kategori",
  subcategories:          "Subkategori",
  warehouses:             "Gudang",
  product_categories:     "Kategori Produk",
};

interface Props {
  importType: CsvImportType;
  onClose: () => void;
  onSuccess: () => void;
}

export function CsvImportModal({ importType, onClose, onSuccess }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [logId, setLogId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [downloadingResult, setDownloadingResult] = useState(false);

  const label = TYPE_LABELS[importType];
  const isCombined = importType === "products_with_variants";

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      alert("File harus berformat .csv");
      return;
    }
    setFile(f);
    setResult(null);
    setLogId(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await importCsv(importType, file) as ImportResult & { log_id?: number };
      setResult(res);
      if (res.log_id) setLogId(res.log_id);
      if (res.imported > 0) onSuccess();
    } catch (err) {
      setResult({
        imported: 0,
        errors: [{ row: 0, field: "file", message: err instanceof Error ? err.message : "Gagal mengimpor" }],
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try { await downloadCsvTemplate(importType); }
    finally { setDownloadingTemplate(false); }
  };

  const handleDownloadResult = async () => {
    if (!logId) return;
    setDownloadingResult(true);
    try { await downloadImportResultCsv(logId, importType); }
    finally { setDownloadingResult(false); }
  };

  const hasErrors  = (result?.errors.length ?? 0) > 0;
  const hasSuccess = (result?.imported ?? 0) > 0;

  const summaryText = () => {
    if (!result) return "";
    const parts: string[] = [];
    if (isCombined && result.products_imported != null) {
      if (result.products_imported > 0) parts.push(`${result.products_imported} produk`);
      if ((result.variants_imported ?? 0) > 0) parts.push(`${result.variants_imported} varian`);
    } else if (result.imported > 0) {
      parts.push(`${result.imported} baris`);
    }
    return parts.length ? `${parts.join(" + ")} berhasil diimpor` : "";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
    >
      <div className="th-bg-surface rounded-2xl border th-border w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b th-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold th-text">Import CSV — {label}</h2>
            <p className="text-xs th-text-muted mt-0.5">
              Upload file CSV untuk menambah data {label.toLowerCase()} secara massal
            </p>
          </div>
          <button onClick={onClose} className="th-text-muted hover:th-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Template download */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl th-bg-elevated border th-border">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-brand-400" />
              <div>
                <p className="text-xs font-medium th-text">Template CSV</p>
                <p className="text-[11px] th-text-muted">Unduh template dengan kolom dan contoh data</p>
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600/10 text-brand-400 border border-brand-500/20 hover:bg-brand-600/20 transition-colors disabled:opacity-50"
            >
              <Download size={12} />
              {downloadingTemplate ? "..." : t("common.downloadTemplate")}
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !result && fileRef.current?.click()}
            className={clsx(
              "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all py-8",
              result
                ? "cursor-default opacity-50"
                : "cursor-pointer",
              dragging
                ? "border-brand-500 bg-brand-500/5"
                : file && !result
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "th-border hover:border-brand-500/40 hover:bg-brand-500/5"
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {file ? (
              <>
                <CheckCircle size={28} className="text-emerald-400" />
                <div className="text-center">
                  <p className="text-sm font-semibold th-text">{file.name}</p>
                  <p className="text-xs th-text-muted mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </>
            ) : (
              <>
                <Upload size={28} className="th-text-muted" />
                <div className="text-center">
                  <p className="text-sm font-medium th-text">{t("common.importFileDrop")}</p>
                  <p className="text-xs th-text-muted mt-0.5">Format: .csv · Maks 500 baris per file</p>
                </div>
              </>
            )}
          </div>

          {/* Result summary — no inline error list */}
          {result && (
            <div className="space-y-3">
              {/* Status banner */}
              <div className={clsx(
                "flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium",
                hasErrors && !hasSuccess
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : hasErrors
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              )}>
                {hasErrors && !hasSuccess
                  ? <AlertTriangle size={16} />
                  : <CheckCircle size={16} />}
                <div>
                  {hasSuccess && <p>{summaryText()}</p>}
                  {hasErrors && (
                    <p className={hasSuccess ? "text-xs font-normal mt-0.5 opacity-80" : ""}>
                      {result.errors.length} baris gagal atau di-skip
                    </p>
                  )}
                  {!hasSuccess && !hasErrors && <p>Tidak ada data yang diimpor.</p>}
                </div>
              </div>

              {/* Download result CSV */}
              {logId && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl th-bg-elevated border th-border">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="th-text-muted" />
                    <div>
                      <p className="text-xs font-medium th-text">{t("inventory.import.resultCsv")}</p>
                      <p className="text-[11px] th-text-muted">{t("inventory.import.resultCsvDesc")}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDownloadResult}
                    disabled={downloadingResult}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600/10 text-brand-400 border border-brand-500/20 hover:bg-brand-600/20 transition-colors disabled:opacity-50"
                  >
                    <Download size={12} />
                    {downloadingResult ? "…" : t("common.download")}
                  </button>
                </div>
              )}

              {/* Re-import hint */}
              <p className="text-[11px] th-text-muted text-center">
                {t("inventory.import.resultCsvHint")}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t th-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl th-bg-elevated th-text text-sm hover:opacity-80 transition-opacity"
          >
            {result ? t("common.close") : t("common.cancel")}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Upload size={13} />
              {importing ? t("common.importing") : t("common.importCsv")}
            </button>
          )}
          {result && !logId && file && (
            <button
              onClick={() => { setResult(null); setLogId(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl th-bg-elevated th-text text-sm transition-colors hover:opacity-80"
            >
              Coba lagi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
