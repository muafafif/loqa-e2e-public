"use client";
import { useState, useRef, useEffect } from "react";
import { Lock, Eye, EyeOff, X } from "lucide-react";
import { useLock } from "@/lib/LockContext";
import { useT } from "@/lib/i18n";

interface Props {
  /** Label shown in the popup title, e.g. conversation title or KB name */
  itemLabel: string;
  onUnlocked: () => void;
  onClose: () => void;
}

export function LockPopup({ itemLabel, onUnlocked, onClose }: Props) {
  const { unlock } = useLock();
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
    if (ok) {
      onUnlocked();
    } else {
      setError(t("lock.wrongPin"));
      setPin("");
      inputRef.current?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-xs mx-4 th-bg-surface border th-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-600/20 flex items-center justify-center shrink-0">
              <Lock size={16} className="text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-semibold th-text">{t("lock.openSession")}</p>
              <p className="text-[11px] th-text-muted truncate max-w-[180px]">{itemLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="th-text-muted hover:th-text transition-colors mt-0.5 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* PIN form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type={show ? "text" : "password"}
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(""); }}
              placeholder="PIN..."
              className="w-full th-bg-elevated border th-border rounded-xl px-3 py-2.5 pr-10 text-sm th-text placeholder:th-text-muted outline-none focus:border-brand-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 th-text-muted hover:th-text transition-colors"
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={!pin || loading}
            className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? t("lock.checking") : t("lock.openSession")}
          </button>
        </form>
      </div>
    </div>
  );
}
