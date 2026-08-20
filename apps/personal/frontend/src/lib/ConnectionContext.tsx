"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { getConnectionStatus, ConnectionStatus, testRerankerConnection, getSettings } from "./api";
import { getLicenseStatus, LicenseState } from "./licenseApi";

export type ConnectionPhase =
  | "checking"      // initial check on app start
  | "locked"        // license not activated or revoked
  | "setup"         // not connected, showing setup overlay
  | "ready"         // both chat + embed connected
  | "chat_only";    // only chat connected, user chose chat-only mode

export interface RerankerStatus {
  ok: boolean;
  error: string;
  enabled: boolean;
}

interface ConnectionContextValue {
  phase: ConnectionPhase;
  status: ConnectionStatus | null;
  isChecking: boolean;
  rerankerStatus: RerankerStatus | null;
  licenseState: LicenseState | null;
  recheckReranker: () => Promise<void>;
  recheck: () => Promise<void>;
  chooseChatOnly: () => void;
  chooseFullMode: () => void;
  onLicenseActivated: (state: LicenseState) => void;
  // Returns null if embed is ok, or an error string if not configured/connected
  tryEnableRag: () => Promise<string | null>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<ConnectionPhase>("checking");
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [rerankerStatus, setRerankerStatus] = useState<RerankerStatus | null>(null);
  const [licenseState, setLicenseState] = useState<LicenseState | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const check = useCallback(async (): Promise<ConnectionStatus> => {
    setIsChecking(true);
    try {
      const s = await getConnectionStatus();
      setStatus(s);
      return s;
    } catch {
      // Backend unreachable — treat as both models offline
      const offline: ConnectionStatus = {
        chat: { ok: false, error: "Backend unreachable" },
        embed: { ok: false, error: "Backend unreachable" },
      };
      setStatus(offline);
      return offline;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const checkReranker = useCallback(async () => {
    try {
      const settings = await getSettings();
      const cfg = settings.reranker;
      if (!cfg?.enabled || !cfg?.model_name) {
        setRerankerStatus(null);
        return;
      }
      const result = await testRerankerConnection(cfg);
      setRerankerStatus({ ok: result.ok, error: result.error ?? "", enabled: true });
    } catch {
      setRerankerStatus(null);
    }
  }, []);

  const recheckReranker = useCallback(async () => {
    await checkReranker();
  }, [checkReranker]);

  const applyStatus = useCallback((s: ConnectionStatus, isBackground: boolean) => {
    const bothOk = s.chat.ok && s.embed.ok;

    if (bothOk) {
      setPhase((prev) => (prev === "chat_only" ? "chat_only" : "ready"));
      return;
    }

    if (isBackground) {
      if (phaseRef.current === "chat_only" && !s.chat.ok) {
        setPhase("setup");
      } else if (phaseRef.current === "ready" && (!s.chat.ok || !s.embed.ok)) {
        setPhase("setup");
      }
    } else {
      setPhase("setup");
    }
  }, []);

  const recheck = useCallback(async () => {
    const s = await check();
    applyStatus(s, false);
  }, [check, applyStatus]);

  const onLicenseActivated = useCallback(({ status, tier, expires_at, license_key }: LicenseState) => {
    setLicenseState({ status, tier, expires_at, license_key });
    setPhase("checking");
    check().then((s: ConnectionStatus) => applyStatus(s, false));
    checkReranker();
  }, [check, applyStatus, checkReranker]);

  // Initial check on mount — license first, then connection
  useEffect(() => {
    const run = async () => {
      localStorage.removeItem("ka_chat_only");
      try {
        const ls = await getLicenseStatus();
        setLicenseState(ls);
        if (ls.status === "not_activated" || ls.status === "revoked") {
          setPhase("locked");
          return;
        }
      } catch {
        // Backend unreachable on startup — proceed to connection check
      }
      const s = await check();
      applyStatus(s, false);
      checkReranker();
    };
    run();
  }, [check, applyStatus, checkReranker]);

  const chooseChatOnly = useCallback(() => {
    localStorage.setItem("ka_chat_only", "1");
    setPhase("chat_only");
  }, []);

  const chooseFullMode = useCallback(() => {
    localStorage.removeItem("ka_chat_only");
    check().then((s) => applyStatus(s, false));
  }, [check, applyStatus]);

  // Check embed is configured & reachable before enabling RAG mode.
  // Returns null on success, or a translated-ready error key on failure.
  const tryEnableRag = useCallback(async (): Promise<string | null> => {
    const s = await check();
    if (s.embed.ok) {
      localStorage.removeItem("ka_chat_only");
      setPhase("ready");
      return null;
    }
    // Return the backend error message so the caller can surface it
    return s.embed.error || "embed_not_configured";
  }, [check]);

  return (
    <ConnectionContext.Provider
      value={{
        phase, status, isChecking,
        rerankerStatus, recheckReranker,
        licenseState, onLicenseActivated,
        recheck, chooseChatOnly, chooseFullMode, tryEnableRag,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used inside ConnectionProvider");
  return ctx;
}
