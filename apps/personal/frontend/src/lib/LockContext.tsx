"use client";
import {
  createContext, useContext, useCallback, useEffect, useRef, useState,
} from "react";

interface LockStatus {
  pin_set: boolean;
  unlocked: boolean;
  timeout_minutes: number;
  remaining_seconds: number;
}

interface LockContextValue {
  status: LockStatus | null;
  refresh: () => Promise<void>;
  setupPin: (pin: string, timeoutMinutes: number) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => Promise<void>;
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
  setTimeout: (minutes: number) => Promise<void>;
  touch: () => void;
}

const LockContext = createContext<LockContextValue | null>(null);
const BASE = "http://localhost:8000/api";

export function LockProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LockStatus | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/lock/status`);
      const data = await res.json();
      setStatus(data);
    } catch {
      // backend not available yet
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Batch touch calls — send at most once per 10s
  const touch = useCallback(() => {
    if (touchTimer.current) return;
    touchTimer.current = setTimeout(() => {
      touchTimer.current = null;
      fetch(`${BASE}/lock/touch`, { method: "POST" }).catch(() => {});
      refresh();
    }, 10_000);
  }, [refresh]);

  // Reset idle timer on any user interaction
  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    const handler = () => touch();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [touch]);

  const setupPin = useCallback(async (pin: string, timeoutMinutes: number) => {
    await fetch(`${BASE}/lock/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, timeout_minutes: timeoutMinutes }),
    });
    await refresh();
  }, [refresh]);

  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    const res = await fetch(`${BASE}/lock/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    await refresh();
    return res.ok;
  }, [refresh]);

  const lock = useCallback(async () => {
    await fetch(`${BASE}/lock/lock`, { method: "POST" });
    await refresh();
  }, [refresh]);

  const changePin = useCallback(async (oldPin: string, newPin: string): Promise<boolean> => {
    const res = await fetch(`${BASE}/lock/change-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old_pin: oldPin, new_pin: newPin }),
    });
    await refresh();
    return res.ok;
  }, [refresh]);

  const setTimeoutMinutes = useCallback(async (minutes: number) => {
    await fetch(`${BASE}/lock/timeout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeout_minutes: minutes }),
    });
    await refresh();
  }, [refresh]);

  return (
    <LockContext.Provider value={{
      status,
      refresh,
      setupPin,
      unlock,
      lock,
      changePin,
      setTimeout: setTimeoutMinutes,
      touch,
    }}>
      {children}
    </LockContext.Provider>
  );
}

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used within LockProvider");
  return ctx;
}
