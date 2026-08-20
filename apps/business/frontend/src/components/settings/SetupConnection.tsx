"use client";

import { useState } from "react";
import { useConnection } from "@/lib/ConnectionContext";
import { SettingsModal } from "./SettingsModal";
import { BrainCircuit, CheckCircle, XCircle, Loader, Settings, RefreshCw, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "@/components/ui/Tooltip";

export function SetupConnection() {
  const { status, isChecking, recheck, chooseChatOnly, chooseFullMode } = useConnection();
  const [chatOnlyMode, setChatOnlyMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const chatOk = status?.chat.ok ?? false;
  const embedOk = status?.embed.ok ?? false;

  const canStart = chatOnlyMode ? chatOk : (chatOk && embedOk);

  return (
    <div className="fixed inset-0 th-bg-base flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-600/20 flex items-center justify-center">
            <BrainCircuit size={28} className="text-brand-500" />
          </div>
          <h1 className="text-xl font-semibold">LOQA Work</h1>
          <p className="text-sm th-text-muted">Sistem AI untuk bisnis Anda</p>
        </div>

        {/* Mode toggle — two card buttons */}
        <div className="th-bg-surface border th-border rounded-2xl p-1 flex gap-1">
          <button
            onClick={() => setChatOnlyMode(false)}
            className={clsx(
              "flex-1 flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-medium transition-colors",
              !chatOnlyMode ? "bg-brand-600 text-white" : "th-text-muted hover:th-text"
            )}
          >
            <span className="text-sm">📄</span>
            <span>Chat + Dokumen</span>
            <span className={clsx("text-[10px] font-normal", !chatOnlyMode ? "text-white/70" : "th-text-muted")}>
              AI menjawab berdasarkan file yang Anda simpan
            </span>
          </button>
          <button
            onClick={() => setChatOnlyMode(true)}
            className={clsx(
              "flex-1 flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-medium transition-colors",
              chatOnlyMode ? "bg-brand-600 text-white" : "th-text-muted hover:th-text"
            )}
          >
            <span className="text-sm">💬</span>
            <span>Chat Biasa</span>
            <span className={clsx("text-[10px] font-normal", chatOnlyMode ? "text-white/70" : "th-text-muted")}>
              Tanya AI tanpa perlu upload dokumen
            </span>
          </button>
        </div>

        {/* Status cards */}
        <div className="flex flex-col gap-2">
          <StatusCard
            label="🤖 Model AI"
            tooltip="Model AI adalah 'otak' yang menjawab pertanyaan Anda. Jika menggunakan Ollama atau server lokal, masukkan alamatnya di Setelan."
            ok={chatOk}
            error={status?.chat.error}
            checking={isChecking}
            unconfigured={!status}
            required
          />
          <StatusCard
            label="📄 Model Baca Dokumen"
            tooltip="Diperlukan hanya jika Anda ingin mengobrol dengan dokumen PDF atau file teks. Jika tidak punya, pilih mode Chat Biasa."
            ok={embedOk}
            error={status?.embed.error}
            checking={isChecking}
            unconfigured={!status}
            required={!chatOnlyMode}
            skipped={chatOnlyMode}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => canStart && (chatOnlyMode ? chooseChatOnly() : chooseFullMode())}
            disabled={!canStart}
            className={clsx(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors",
              canStart
                ? "bg-brand-600 hover:bg-brand-700 text-white"
                : "th-bg-elevated th-text-muted opacity-40 cursor-not-allowed"
            )}
          >
            <ArrowRight size={15} />
            Mulai →
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl th-bg-elevated hover:opacity-80 text-sm th-text-2 transition-opacity"
            >
              <Settings size={14} />
              ⚙ Konfigurasi
            </button>
            <button
              onClick={recheck}
              disabled={isChecking}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl th-bg-elevated hover:opacity-80 disabled:opacity-50 text-sm th-text-2 transition-opacity"
            >
              <RefreshCw size={14} className={isChecking ? "animate-spin" : ""} />
              {isChecking ? "Memeriksa..." : "Coba Lagi"}
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal onClose={() => { setShowSettings(false); recheck(); }} />
      )}
    </div>
  );
}

function StatusCard({
  label, tooltip, ok, error, checking, unconfigured, required, skipped,
}: {
  label: string;
  tooltip?: string;
  ok: boolean;
  error?: string;
  checking: boolean;
  unconfigured: boolean;
  required?: boolean;
  skipped?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
        skipped
          ? "th-border th-bg-surface opacity-40"
          : ok ? "border-green-800 bg-green-950/30"
          : checking || unconfigured ? "th-border th-bg-surface"
          : "border-red-900 bg-red-950/20"
      )}
    >
      <div className="shrink-0">
        {skipped ? (
          <div className="w-[18px] h-[18px] rounded-full border-2 th-border" />
        ) : checking || unconfigured ? (
          <Loader size={18} className="text-gray-500 animate-spin" />
        ) : ok ? (
          <CheckCircle size={18} className="text-green-400" />
        ) : (
          <XCircle size={18} className="text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium th-text">{label}</p>
          {tooltip && <Tooltip content={tooltip} />}
          {!required && !skipped && (
            <span className="text-[10px] th-text-muted th-bg-elevated px-1.5 py-0.5 rounded">optional</span>
          )}
          {skipped && (
            <span className="text-[10px] th-text-muted th-bg-elevated px-1.5 py-0.5 rounded">skipped</span>
          )}
        </div>
        {!skipped && !checking && !unconfigured && !ok && error && (
          <p className="text-xs text-red-400 truncate mt-0.5" title={error}>{error}</p>
        )}
        {!skipped && !checking && !unconfigured && ok && (
          <p className="text-xs text-green-500 mt-0.5">Terhubung ✓</p>
        )}
        {skipped && (
          <p className="text-xs th-text-muted mt-0.5">Tidak dibutuhkan di mode Chat Biasa</p>
        )}
      </div>
    </div>
  );
}
