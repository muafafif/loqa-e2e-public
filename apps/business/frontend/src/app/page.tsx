"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ConnectionProvider, useConnection } from "@/lib/ConnectionContext";
import { LockProvider, useLock } from "@/lib/LockContext";
import { I18nProvider, useT } from "@/lib/i18n";
import { SettingsModal, type SavedContext } from "@/components/settings/SettingsModal";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { AnalyticsPanel } from "@/components/analytics/AnalyticsPanel";
import { FinanceMain } from "@/components/finance/FinanceMain";
import { FinanceAppLockScreen } from "@/components/finance/FinanceAppLockScreen";
import { InventoryMain } from "@/components/inventory/InventoryMain";
import { OrderMain } from "@/components/order/OrderMain";
import { ProjectMain } from "@/components/project/ProjectMain";
import { PocketSidebar } from "@/components/finance/PocketSidebar";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import ConversationList from "@/components/chat/ConversationList";
import { getFinanceAppLock, listPockets } from "@/lib/financeApi";
import type { Conversation, Pocket } from "@/types";
import {
  Settings, MessageSquare, BarChart2,
  Wallet, Package, ShoppingCart, NotebookPen, AlertTriangle, RefreshCw, HardHat,
} from "lucide-react";
import { clsx } from "clsx";
import { ActivationScreen } from "@/components/lock/ActivationScreen";

export default function Home() {
  return (
    <I18nProvider>
      <LockProvider>
        <ConnectionProvider>
          <AppShell />
        </ConnectionProvider>
      </LockProvider>
    </I18nProvider>
  );
}

function AppShell() {
  const { phase } = useConnection();
  if (phase === "checking") return <SplashScreen />;
  if (phase === "locked") return <ActivationScreen />;
  return <MainLayout />;
}

function SplashScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 th-bg-base">
      {/* Logo mark — breathing pulse */}
      <div style={{ animation: "loqa-breathe 2.4s ease-in-out infinite" }}>
        <svg width="80" height="80" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="sp-bg" cx="42" cy="36" r="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#130828"/>
              <stop offset="100%" stopColor="#050110"/>
            </radialGradient>
            <linearGradient id="sp-lh" x1="19" y1="13" x2="70" y2="141" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#8b5cf6"/>
              <stop offset="40%" stopColor="#6d28d9"/>
              <stop offset="100%" stopColor="#2e1065"/>
            </linearGradient>
            <linearGradient id="sp-rh" x1="45" y1="13" x2="131" y2="141" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f5f3ff"/>
              <stop offset="20%" stopColor="#c4b5fd"/>
              <stop offset="55%" stopColor="#8b5cf6"/>
              <stop offset="100%" stopColor="#4c1d95"/>
            </linearGradient>
            <linearGradient id="sp-sh" x1="45" y1="13" x2="95" y2="70" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="white" stopOpacity=".62"/>
              <stop offset="100%" stopColor="white" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="sp-cv" x1="45" y1="13" x2="102" y2="141" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="white" stopOpacity=".95"/>
              <stop offset="35%" stopColor="white" stopOpacity=".65"/>
              <stop offset="100%" stopColor="white" stopOpacity=".08"/>
            </linearGradient>
            <linearGradient id="sp-sp" x1="45" y1="13" x2="115" y2="29" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f0abfc" stopOpacity=".9"/>
              <stop offset="100%" stopColor="#6366f1" stopOpacity=".3"/>
            </linearGradient>
            <radialGradient id="sp-amb" cx="80" cy="80" r="72" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity=".7"/>
              <stop offset="50%" stopColor="#5b21b6" stopOpacity=".25"/>
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
            </radialGradient>
            <filter id="sp-f-xl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
            <filter id="sp-f-md" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.8"/></filter>
            <filter id="sp-f-sm" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
          </defs>
          <rect width="160" height="160" rx="36" fill="url(#sp-bg)"/>
          <ellipse cx="80" cy="80" rx="68" ry="64" fill="url(#sp-amb)" filter="url(#sp-f-xl)"/>
          <polygon points="45,13 19,67 35,128 102,141" fill="url(#sp-lh)"/>
          <polygon points="45,13 115,29 131,83 102,141" fill="url(#sp-rh)"/>
          <polygon points="45,13 115,29 131,83 102,141" fill="url(#sp-sh)"/>
          <line x1="19" y1="67" x2="45" y2="13" stroke="rgba(255,255,255,.28)" strokeWidth="1.2"/>
          <line x1="45" y1="13" x2="115" y2="29" stroke="url(#sp-sp)" strokeWidth="1.8"/>
          <line x1="45" y1="13" x2="102" y2="141" stroke="white" strokeOpacity=".18" strokeWidth="10" filter="url(#sp-f-md)" strokeLinecap="round"/>
          <line x1="45" y1="13" x2="102" y2="141" stroke="url(#sp-cv)" strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="45" cy="13" r="6" fill="white" fillOpacity=".22" filter="url(#sp-f-sm)"/>
          <circle cx="45" cy="13" r="2.8" fill="white" fillOpacity=".96"/>
        </svg>
      </div>

      {/* Wordmark */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-2xl font-bold tracking-tight" style={{ color: "rgb(var(--accent-300))" }}>
          LOQA
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "rgb(var(--accent-600))" }}>
          Work
        </span>
      </div>

      {/* Connecting indicator */}
      <div className="flex items-center gap-2" style={{ color: "rgba(var(--accent-400), 0.5)" }}>
        <span className="text-[11px] tracking-wide">Menghubungkan</span>
        <span style={{ animation: "loqa-dot 1.2s ease-in-out infinite" }}>·</span>
        <span style={{ animation: "loqa-dot 1.2s ease-in-out infinite", animationDelay: "0.2s" }}>·</span>
        <span style={{ animation: "loqa-dot 1.2s ease-in-out infinite", animationDelay: "0.4s" }}>·</span>
      </div>

    </div>
  );
}

type Panel = "chat" | "workspace" | "analytics" | "finance" | "inventory" | "order" | "project";

function MainLayout() {
  const { status, isChecking, recheck, tryEnableRag } = useConnection();
  const t = useT();

  const [panel, setPanel] = useState<Panel>("chat");
  const [showSettings, setShowSettings] = useState<false | "chat" | "embed" | "ingestion" | "models" | "appearance" | "security" | "language">(false);
  const [workspaceEmbedWarning, setWorkspaceEmbedWarning] = useState(false);
  const [navLoading, setNavLoading] = useState<Panel | null>(null);
  const [reconnecting, setReconnecting] = useState<{ message: string } | null>(null);

  // Chat state
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [convListRefresh, setConvListRefresh] = useState(0);
  const sessionId = useMemo(() => `s_${Date.now().toString(36)}`, []);

  // Finance state
  const [pockets, setPockets] = useState<Pocket[]>([]);
  const [selectedPocketId, setSelectedPocketId] = useState<number | null>(null);
  const [financeAppLocked, setFinanceAppLocked] = useState(false);
  const [financeAppUnlocked, setFinanceAppUnlocked] = useState(false);
  const { status: lockStatus } = useLock();

  const loadPockets = useCallback(async () => {
    try { setPockets(await listPockets()); } catch {}
  }, []);

  useEffect(() => { loadPockets(); }, [loadPockets]);

  useEffect(() => {
    if (panel !== "finance") return;
    getFinanceAppLock()
      .then(data => {
        setFinanceAppLocked(data.locked);
        if (!data.locked || lockStatus?.unlocked) setFinanceAppUnlocked(true);
      })
      .catch(() => setFinanceAppUnlocked(true));
  }, [panel, lockStatus?.unlocked]);

  const handleSelectConv = useCallback((conv: Conversation) => {
    setSelectedConvId(conv.id);
  }, []);

  const handleConvCreated = useCallback((convId: string) => {
    setSelectedConvId(convId);
    setConvListRefresh(n => n + 1);
  }, []);

  const handleNavClick = useCallback(async (id: Panel) => {
    if (id === "workspace") {
      setNavLoading("workspace");
      const err = await tryEnableRag();
      setNavLoading(null);
      if (err) {
        setWorkspaceEmbedWarning(true);
        setPanel("workspace");
        return;
      }
      setWorkspaceEmbedWarning(false);
    }
    setPanel(id);
  }, [tryEnableRag]);

  const handleSaved = useCallback(async (ctx: SavedContext[]) => {
    const msgs: Record<SavedContext, string> = {
      chat:     "Menghubungkan model AI…",
      embed:    "Menghubungkan embedder…",
      reranker: "Menghubungkan reranker…",
      database: "Migrasi & menghubungkan database…",
    };
    const message = ctx.map(c => msgs[c]).join(" · ");
    setShowSettings(false);
    setReconnecting({ message });
    await recheck();
    setReconnecting(null);
  }, [recheck]);

  const chatOk = status?.chat.ok ?? false;
  const showModelBanner = status && !chatOk;

  const navItems: { id: Panel; icon: React.ReactNode; label: string }[] = [
    { id: "chat",      icon: <MessageSquare size={14} />, label: t("nav.chat")          },
    { id: "workspace", icon: <NotebookPen size={14} />,   label: "Workspace"             },
    { id: "finance",   icon: <Wallet size={14} />,        label: t("persona.finance")   },
    { id: "inventory", icon: <Package size={14} />,       label: t("inventory.title")   },
    { id: "order",     icon: <ShoppingCart size={14} />,  label: t("order.title")       },
    { id: "project",   icon: <HardHat size={14} />,       label: t("project.title")     },
    { id: "analytics", icon: <BarChart2 size={14} />,     label: t("nav.analytics")     },
  ];

  const hasSidebar = panel === "chat" || panel === "finance";

  return (
    <div className="flex flex-col h-screen overflow-hidden th-bg-base">

      {/* ── Top nav bar ─────────────────────────────────────────────── */}
      <header className="h-12 shrink-0 glass-surface border-b th-border flex items-center px-4 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 mr-1">
          <svg width="28" height="28" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="nb-bg" cx="42" cy="36" r="110" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#130828"/>
                <stop offset="100%" stopColor="#050110"/>
              </radialGradient>
              <linearGradient id="nb-lh" x1="19" y1="13" x2="70" y2="141" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#8b5cf6"/>
                <stop offset="40%" stopColor="#6d28d9"/>
                <stop offset="100%" stopColor="#2e1065"/>
              </linearGradient>
              <linearGradient id="nb-rh" x1="45" y1="13" x2="131" y2="141" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#f5f3ff"/>
                <stop offset="20%" stopColor="#c4b5fd"/>
                <stop offset="55%" stopColor="#8b5cf6"/>
                <stop offset="100%" stopColor="#4c1d95"/>
              </linearGradient>
              <linearGradient id="nb-sh" x1="45" y1="13" x2="95" y2="70" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="white" stopOpacity=".62"/>
                <stop offset="100%" stopColor="white" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="nb-cv" x1="45" y1="13" x2="102" y2="141" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="white" stopOpacity=".95"/>
                <stop offset="35%" stopColor="white" stopOpacity=".65"/>
                <stop offset="100%" stopColor="white" stopOpacity=".08"/>
              </linearGradient>
              <linearGradient id="nb-sp" x1="45" y1="13" x2="115" y2="29" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#f0abfc" stopOpacity=".9"/>
                <stop offset="100%" stopColor="#6366f1" stopOpacity=".3"/>
              </linearGradient>
            </defs>
            <rect width="160" height="160" rx="36" fill="url(#nb-bg)"/>
            <polygon points="45,13 19,67 35,128 102,141" fill="url(#nb-lh)"/>
            <polygon points="45,13 115,29 131,83 102,141" fill="url(#nb-rh)"/>
            <polygon points="45,13 115,29 131,83 102,141" fill="url(#nb-sh)"/>
            <line x1="19" y1="67" x2="45" y2="13" stroke="rgba(255,255,255,.28)" strokeWidth="1.2"/>
            <line x1="45" y1="13" x2="115" y2="29" stroke="url(#nb-sp)" strokeWidth="1.8"/>
            <line x1="45" y1="13" x2="102" y2="141" stroke="url(#nb-cv)" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="45" cy="13" r="2.8" fill="white" fillOpacity=".96"/>
          </svg>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-[13px] th-text tracking-tight">LOQA</span>
            <span className="text-[8px] font-bold text-brand-400 uppercase tracking-[0.2em]">Work</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-5 th-border" />

        {/* Nav items */}
        <nav className="flex items-center gap-0.5 flex-1">
          {navItems.map(({ id, icon, label }) => {
            const isLoading = navLoading === id;
            const isActive = panel === id;
            return (
              <button
                key={id}
                data-testid={`nav-${id}`}
                onClick={() => handleNavClick(id)}
                disabled={navLoading !== null}
                className={clsx(
                  "btn-brand flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150",
                  isActive
                    ? "bg-brand-600 text-white shadow-brand-sm"
                    : "th-text-muted hover:th-text hover:th-bg-elevated",
                  navLoading !== null && !isLoading && "opacity-40 cursor-not-allowed",
                )}
              >
                {isLoading ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <span className={isActive ? "text-white/90" : "th-text-muted"}>{icon}</span>
                )}
                {label}
              </button>
            );
          })}
        </nav>

        {/* Right — settings */}
        <div className="flex items-center gap-1.5">
          {status && !chatOk && (
            <button
              onClick={() => setShowSettings("chat")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[11px] font-medium hover:bg-amber-500/20 transition-colors"
            >
              <AlertTriangle size={10} />
              Model tidak terhubung
            </button>
          )}
          <button
            onClick={() => setShowSettings("chat")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg th-text-muted hover:th-text hover:th-bg-elevated transition-all text-[11px] font-medium"
          >
            <Settings size={12} />
            {t("nav.settings")}
          </button>
        </div>
      </header>

      {/* ── Inline model warning banner ──────────────────────────────── */}
      {showModelBanner && (
        <ModelWarningBanner
          isChecking={isChecking}
          onConfigure={() => setShowSettings("chat")}
          onRecheck={recheck}
        />
      )}

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Contextual left sidebar ── */}
        {hasSidebar && (
          <aside className="w-56 shrink-0 glass-surface border-r th-border flex flex-col overflow-hidden">
            {panel === "chat" && (
              <div className="flex-1 overflow-hidden">
                <ConversationList
                  selectedConvId={selectedConvId}
                  onSelect={handleSelectConv}
                  onNewChat={() => setSelectedConvId(null)}
                  refreshTrigger={convListRefresh}
                />
              </div>
            )}

            {panel === "finance" && (
              <div className="flex-1 overflow-hidden">
                <PocketSidebar
                  pockets={pockets}
                  selectedPocketId={selectedPocketId}
                  onSelect={setSelectedPocketId}
                  onRefresh={loadPockets}
                />
              </div>
            )}
          </aside>
        )}

        {/* ── Main content ── */}
        <main className="flex-1 flex overflow-hidden">
          {panel === "chat" && (
            <ChatWindow
              kbId={null}
              chatOnly={true}
              sessionId={sessionId}
              convId={selectedConvId}
              onConvCreated={handleConvCreated}
            />
          )}
          {panel === "workspace" && (
            workspaceEmbedWarning
              ? <EmbedModelGate onConfigure={() => { setShowSettings("embed"); }} onRecheck={async () => { const err = await tryEnableRag(); if (!err) setWorkspaceEmbedWarning(false); }} />
              : <WorkspacePanel />
          )}
          {panel === "analytics" && <AnalyticsPanel sessionId={sessionId} />}
          {panel === "finance" && (
            financeAppLocked && !financeAppUnlocked
              ? <FinanceAppLockScreen onUnlocked={() => setFinanceAppUnlocked(true)} />
              : <FinanceMain
                  pockets={pockets}
                  selectedPocketId={selectedPocketId}
                  onPocketsChange={loadPockets}
                />
          )}
          {panel === "inventory" && <InventoryMain />}
          {panel === "order" && <OrderMain />}
          {panel === "project" && <ProjectMain />}
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          initialTab={showSettings}
          onClose={() => setShowSettings(false)}
          onSaved={handleSaved}
        />
      )}

      {reconnecting && <ConnectionOverlay message={reconnecting.message} />}
    </div>
  );
}

function ConnectionOverlay({ message }: { message: string }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-8"
      style={{ backdropFilter: "blur(18px) saturate(0.7)", WebkitBackdropFilter: "blur(18px) saturate(0.7)", background: "rgba(var(--bg-base), 0.55)" }}
    >
      <div style={{ animation: "loqa-breathe 2.4s ease-in-out infinite" }}>
        <svg width="64" height="64" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="co-bg" cx="42" cy="36" r="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#130828"/>
              <stop offset="100%" stopColor="#050110"/>
            </radialGradient>
            <linearGradient id="co-lh" x1="19" y1="13" x2="70" y2="141" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#8b5cf6"/>
              <stop offset="40%" stopColor="#6d28d9"/>
              <stop offset="100%" stopColor="#2e1065"/>
            </linearGradient>
            <linearGradient id="co-rh" x1="45" y1="13" x2="131" y2="141" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f5f3ff"/>
              <stop offset="20%" stopColor="#c4b5fd"/>
              <stop offset="55%" stopColor="#8b5cf6"/>
              <stop offset="100%" stopColor="#4c1d95"/>
            </linearGradient>
            <linearGradient id="co-sh" x1="45" y1="13" x2="95" y2="70" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="white" stopOpacity=".62"/>
              <stop offset="100%" stopColor="white" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="co-cv" x1="45" y1="13" x2="102" y2="141" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="white" stopOpacity=".95"/>
              <stop offset="35%" stopColor="white" stopOpacity=".65"/>
              <stop offset="100%" stopColor="white" stopOpacity=".08"/>
            </linearGradient>
            <linearGradient id="co-sp" x1="45" y1="13" x2="115" y2="29" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f0abfc" stopOpacity=".9"/>
              <stop offset="100%" stopColor="#6366f1" stopOpacity=".3"/>
            </linearGradient>
            <radialGradient id="co-amb" cx="80" cy="80" r="72" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity=".7"/>
              <stop offset="50%" stopColor="#5b21b6" stopOpacity=".25"/>
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
            </radialGradient>
            <filter id="co-f-xl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
            <filter id="co-f-md" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.8"/></filter>
            <filter id="co-f-sm" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
          </defs>
          <rect width="160" height="160" rx="36" fill="url(#co-bg)"/>
          <ellipse cx="80" cy="80" rx="68" ry="64" fill="url(#co-amb)" filter="url(#co-f-xl)"/>
          <polygon points="45,13 19,67 35,128 102,141" fill="url(#co-lh)"/>
          <polygon points="45,13 115,29 131,83 102,141" fill="url(#co-rh)"/>
          <polygon points="45,13 115,29 131,83 102,141" fill="url(#co-sh)"/>
          <line x1="19" y1="67" x2="45" y2="13" stroke="rgba(255,255,255,.28)" strokeWidth="1.2"/>
          <line x1="45" y1="13" x2="115" y2="29" stroke="url(#co-sp)" strokeWidth="1.8"/>
          <line x1="45" y1="13" x2="102" y2="141" stroke="white" strokeOpacity=".18" strokeWidth="10" filter="url(#co-f-md)" strokeLinecap="round"/>
          <line x1="45" y1="13" x2="102" y2="141" stroke="url(#co-cv)" strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="45" cy="13" r="6" fill="white" fillOpacity=".22" filter="url(#co-f-sm)"/>
          <circle cx="45" cy="13" r="2.8" fill="white" fillOpacity=".96"/>
        </svg>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium" style={{ color: "rgb(var(--accent-300))" }}>
          {message}
        </p>
        <div className="flex items-center gap-1.5" style={{ color: "rgba(var(--accent-400), 0.45)" }}>
          <span style={{ animation: "loqa-dot 1.2s ease-in-out infinite" }}>·</span>
          <span style={{ animation: "loqa-dot 1.2s ease-in-out infinite", animationDelay: "0.2s" }}>·</span>
          <span style={{ animation: "loqa-dot 1.2s ease-in-out infinite", animationDelay: "0.4s" }}>·</span>
        </div>
      </div>
    </div>
  );
}

function ModelWarningBanner({
  isChecking, onConfigure, onRecheck,
}: {
  isChecking: boolean;
  onConfigure: () => void;
  onRecheck: () => void;
}) {
  return (
    <div className="shrink-0 px-4 py-1.5 bg-red-500/8 border-b border-red-500/20 flex items-center gap-3 text-xs">
      <AlertTriangle size={12} className="text-red-400 shrink-0" />
      <span className="flex-1 text-red-300">
        Model AI belum terhubung. Beberapa fitur tidak tersedia.
      </span>
      <button onClick={onConfigure} className="text-brand-400 hover:text-brand-300 underline underline-offset-2">
        Konfigurasi
      </button>
      <button
        onClick={onRecheck}
        disabled={isChecking}
        className="flex items-center gap-1 th-text-muted hover:th-text disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={10} className={isChecking ? "animate-spin" : ""} />
        Coba Lagi
      </button>
    </div>
  );
}

function EmbedModelGate({ onConfigure, onRecheck }: { onConfigure: () => void; onRecheck: () => Promise<void> }) {
  const [rechecking, setRechecking] = useState(false);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 th-bg-base">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <AlertTriangle size={24} className="text-amber-400" />
      </div>
      <div className="text-center max-w-sm">
        <p className="text-base font-semibold th-text mb-2">Model Embedding Diperlukan</p>
        <p className="text-sm th-text-muted leading-relaxed">
          Fitur Workspace membutuhkan model embedding untuk mengindeks dan mencari catatan serta Knowledge Base.
          Konfigurasikan model embedding di Setelan untuk melanjutkan.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfigure}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Settings size={14} />
          Buka Setelan
        </button>
        <button
          onClick={async () => { setRechecking(true); await onRecheck(); setRechecking(false); }}
          disabled={rechecking}
          className="flex items-center gap-2 px-4 py-2 th-bg-elevated hover:opacity-80 th-text text-sm rounded-xl border th-border transition-opacity disabled:opacity-50"
        >
          <RefreshCw size={14} className={rechecking ? "animate-spin" : ""} />
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
