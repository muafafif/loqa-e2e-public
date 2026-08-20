"use client";
import { useState, useRef, useEffect } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { useLock } from "@/lib/LockContext";
import { useT } from "@/lib/i18n";

export function LockScreen() {
  const { unlock, status } = useLock();
  const t = useT();
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin || loading) return;
    setLoading(true);
    setError("");
    const ok = await unlock(pin);
    setLoading(false);
    if (!ok) {
      setError(t("lock.wrongPin"));
      setPin("");
      inputRef.current?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center th-bg-base">
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600/20 flex items-center justify-center">
            <Lock size={28} className="text-brand-400" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold th-text">{t("lock.title")}</h1>
            <p className="text-sm th-text-muted mt-1">
              {status?.timeout_minutes
                ? t("lock.subtitle", { n: status.timeout_minutes })
                : t("lock.subtitleGeneric")}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type={show ? "text" : "password"}
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(""); }}
              placeholder={t("lock.title") + "..."}
              className="w-full card px-4 py-3 pr-11 text-sm th-text placeholder:th-text-muted outline-none focus:border-brand-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 th-text-muted hover:th-text transition-colors"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!pin || loading}
            className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? t("lock.checking") : t("lock.openSession")}
          </button>
        </form>
      </div>
    </div>
  );
}
