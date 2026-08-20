"use client";

import { useState } from "react";
import { Download, Sparkles, X } from "lucide-react";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onExport: (includeInsight: boolean) => void;
  exporting: boolean;
  aiAvailable: boolean;
  /** Label shown next to the status indicator while generating */
  generatingInsight?: boolean;
}

export function ExportDialog({ open, onClose, onExport, exporting, aiAvailable, generatingInsight }: Props) {
  const t = useT();
  const [includeInsight, setIncludeInsight] = useState(false);

  if (!open) return null;

  const busy = exporting || generatingInsight;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative glass-card w-full max-w-sm mx-4 p-5 flex flex-col gap-4 shadow-xl"
        style={{ border: "1px solid rgb(var(--border))" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgb(16 185 129 / 0.15)", border: "1px solid rgb(16 185 129 / 0.25)" }}
            >
              <Download size={14} style={{ color: "#10b981" }} />
            </div>
            <span className="text-sm font-semibold" style={{ color: "rgb(var(--tx-primary))" }}>
              {t("common.exportDialog.title")}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ color: "rgb(var(--tx-muted))" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* AI Insight toggle */}
        <div
          className="flex items-start gap-3 p-3 rounded-xl"
          style={{
            background: aiAvailable
              ? includeInsight
                ? "rgb(var(--accent-600) / 0.12)"
                : "rgb(255 255 255 / 0.03)"
              : "rgb(255 255 255 / 0.02)",
            border: `1px solid ${aiAvailable && includeInsight ? "rgb(var(--accent-500) / 0.3)" : "rgb(var(--border))"}`,
            opacity: aiAvailable ? 1 : 0.5,
          }}
        >
          <div className="mt-0.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)" }}
            >
              <Sparkles size={14} style={{ color: "rgb(var(--accent-400))" }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold" style={{ color: "rgb(var(--tx-primary))" }}>
                {t("common.exportDialog.aiInsight")}
              </span>
              <button
                role="switch"
                aria-checked={includeInsight}
                disabled={!aiAvailable || busy}
                onClick={() => setIncludeInsight(v => !v)}
                className="relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: includeInsight && aiAvailable
                    ? "rgb(var(--accent-500))"
                    : "rgb(255 255 255 / 0.1)",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: includeInsight && aiAvailable ? "translateX(16px)" : "translateX(0)" }}
                />
              </button>
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: "rgb(var(--tx-muted))" }}>
              {aiAvailable
                ? t("common.exportDialog.aiInsightDesc")
                : t("common.exportDialog.aiInsightUnavailable")}
            </p>
            {generatingInsight && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="w-3 h-3 border border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px]" style={{ color: "rgb(var(--accent-400))" }}>
                  {t("common.exportDialog.generatingInsight")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-1.5 rounded-xl text-xs transition-all disabled:opacity-40"
            style={{
              background: "rgb(255 255 255 / 0.05)",
              border: "1px solid rgb(var(--border))",
              color: "rgb(var(--tx-secondary))",
            }}
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => onExport(includeInsight && aiAvailable)}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            style={{
              background: "rgb(16 185 129 / 0.15)",
              color: "#10b981",
              border: "1px solid rgb(16 185 129 / 0.25)",
            }}
          >
            {busy ? (
              <>
                <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                {t("common.exportingPdf")}
              </>
            ) : (
              <>
                <Download size={12} />
                {t("common.exportDialog.export")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
