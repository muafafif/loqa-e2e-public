"use client";
import { useState, useRef, useEffect } from "react";
import { KeyRound } from "lucide-react";
import { useConnection } from "@/lib/ConnectionContext";
import { activateLicense } from "@/lib/licenseApi";
import { useT } from "@/lib/i18n";

export function ActivationScreen() {
  const t = useT();
  const { onLicenseActivated } = useConnection();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const state = await activateLicense(key.trim());
      onLicenseActivated(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lock.activation.failed"));
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center th-bg-base">
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600/20 flex items-center justify-center">
            <KeyRound size={28} className="text-brand-400" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold th-text">{t("lock.activation.title")}</h1>
            <p className="text-sm th-text-muted mt-1">
              {t("lock.activation.subtitle")}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="text"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(""); }}
            placeholder={t("lock.activation.placeholder")}
            spellCheck={false}
            className="w-full card px-4 py-3 text-sm th-text placeholder:th-text-muted outline-none focus:border-brand-500 transition-colors font-mono"
          />

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!key.trim() || loading}
            className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? t("lock.activation.activating") : t("lock.activation.activate")}
          </button>
        </form>
      </div>
    </div>
  );
}
