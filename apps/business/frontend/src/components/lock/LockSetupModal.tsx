"use client";
import { useState } from "react";
import { X, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useLock } from "@/lib/LockContext";
import { useT } from "@/lib/i18n";

type Mode = "setup" | "change";

interface Props {
  mode: Mode;
  onClose: () => void;
}

export function LockSetupModal({ mode, onClose }: Props) {
  const { setupPin, changePin, status } = useLock();
  const t = useT();

  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [timeout, setTimeout] = useState(status?.timeout_minutes ?? 30);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const TIMEOUT_OPTIONS = [5, 10, 15, 30, 60, 120, 0] as const;
  const timeoutLabel = (m: number) => m === 0 ? t("security.never") : m < 60 ? `${m} min` : `${m / 60}h`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPin.length < 4) { setError(t("security.pinTooShort")); return; }
    if (newPin !== confirmPin) { setError(t("security.pinMismatch")); return; }

    setLoading(true);
    if (mode === "setup") {
      await setupPin(newPin, timeout === 0 ? 99999 : timeout);
      setDone(true);
    } else {
      const ok = await changePin(oldPin, newPin);
      if (!ok) { setError(t("security.oldPinWrong")); setLoading(false); return; }
      setDone(true);
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
        <div className="th-bg-surface border th-border rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <ShieldCheck size={24} className="text-green-400" />
          </div>
          <p className="text-sm font-medium th-text">
            {mode === "setup" ? t("security.pinCreated") : t("security.pinChanged")}
          </p>
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm transition-colors">
            {t("common.done")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
      <div className="th-bg-surface border th-border rounded-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b th-border">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-brand-400" />
            <span className="text-sm font-semibold th-text">
              {mode === "setup" ? t("security.setupTitle") : t("security.changeTitle")}
            </span>
          </div>
          <button onClick={onClose} className="th-text-muted hover:th-text transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {mode === "change" && (
            <div>
              <label className="text-xs th-text-muted mb-1.5 block">{t("security.oldPin")}</label>
              <div className="relative">
                <input
                  type={showOld ? "text" : "password"}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  placeholder="PIN saat ini"
                  className="w-full th-bg-elevated border th-border rounded-xl px-4 py-2.5 pr-10 text-sm th-text placeholder:th-text-muted outline-none focus:border-brand-500"
                />
                <button type="button" onClick={() => setShowOld(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 th-text-muted">
                  {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs th-text-muted mb-1.5 block">
              {mode === "change" ? t("security.newPin") : t("security.createPin")} <span className="text-brand-400">{t("security.pinMinLength")}</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="PIN baru"
                className="w-full th-bg-elevated border th-border rounded-xl px-4 py-2.5 pr-10 text-sm th-text placeholder:th-text-muted outline-none focus:border-brand-500"
              />
              <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 th-text-muted">
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs th-text-muted mb-1.5 block">{t("security.confirmPin")}</label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Ulangi PIN baru"
              className="w-full th-bg-elevated border th-border rounded-xl px-4 py-2.5 text-sm th-text placeholder:th-text-muted outline-none focus:border-brand-500"
            />
          </div>

          {mode === "setup" && (
            <div>
              <label className="text-xs th-text-muted mb-1.5 block">{t("security.autoLockAfter")}</label>
              <div className="grid grid-cols-4 gap-1.5">
                {TIMEOUT_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTimeout(m)}
                    className={`py-1.5 rounded-lg text-xs transition-colors ${
                      timeout === m
                        ? "bg-brand-600 text-white"
                        : "th-bg-elevated th-text-muted hover:th-text border th-border"
                    }`}
                  >
                    {timeoutLabel(m)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl th-bg-elevated th-text text-sm hover:opacity-80 transition-opacity">
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading || !newPin || !confirmPin || (mode === "change" && !oldPin)}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm transition-colors"
            >
              {loading ? t("common.saving") : mode === "setup" ? t("security.createPin") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
