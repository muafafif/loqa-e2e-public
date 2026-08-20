"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare, Pin, PinOff, Trash2, Search, Plus, Trash, Lock, LockOpen, Wallet, Package, BookOpen, LayoutGrid } from "lucide-react";
import { clsx } from "clsx";
import type { Conversation } from "@/types";
import {
  listConversations,
  pinConversation,
  deleteConversation,
  deleteAllConversations,
  lockConversation,
} from "@/lib/api";
import { useLock } from "@/lib/LockContext";
import { LockPopup } from "@/components/lock/LockPopup";
import { useT } from "@/lib/i18n";

interface Props {
  selectedConvId: string | null;
  onSelect: (conv: Conversation) => void;
  onNewChat: () => void;
  refreshTrigger?: number;
  chatMode?: string;
}

function ModeBadge({ mode }: { mode: string }) {
  const cfg: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    finance:   { label: "Keuangan",  icon: <Wallet size={8} />,      color: "rgb(52 211 153)" },
    inventory: { label: "Inventori", icon: <Package size={8} />,     color: "rgb(251 191 36)" },
    rag:       { label: "Dokumen",   icon: <BookOpen size={8} />,    color: "rgb(96 165 250)" },
    unified:   { label: "All-in-1",  icon: <LayoutGrid size={8} />,  color: "rgb(var(--accent-400))" },
    chat_only: { label: "Chat",      icon: <MessageSquare size={8} />, color: "rgb(var(--tx-muted))" },
  };
  const c = cfg[mode] ?? cfg.chat_only;
  return (
    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-md text-[8px] font-semibold leading-none shrink-0"
      style={{ background: `${c.color}18`, color: c.color, border: `1px solid ${c.color}30` }}>
      {c.icon}
      {c.label}
    </span>
  );
}

export default function ConversationList({ selectedConvId, onSelect, onNewChat, refreshTrigger }: Props) {
  const { status: lockStatus } = useLock();
  const t = useT();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [pendingLockedConv, setPendingLockedConv] = useState<Conversation | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q?: string) => {
    const data = await listConversations(q, undefined, undefined, undefined, "rag");
    setConvs(data);
  }, []);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(query.trim() || undefined), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, load]);

  function handleSelectConv(conv: Conversation) {
    if (conv.locked && !lockStatus?.unlocked) {
      setPendingLockedConv(conv);
      return;
    }
    onSelect(conv);
  }

  async function handlePin(e: React.MouseEvent, conv: Conversation) {
    e.stopPropagation();
    await pinConversation(conv.id, !conv.pinned);
    load(query.trim() || undefined);
  }

  async function handleDelete(e: React.MouseEvent, conv: Conversation) {
    e.stopPropagation();
    await deleteConversation(conv.id);
    load(query.trim() || undefined);
    if (selectedConvId === conv.id) onNewChat();
  }

  async function handleLock(e: React.MouseEvent, conv: Conversation) {
    e.stopPropagation();
    if (!lockStatus?.pin_set) {
      setLockError(t("chat.lockNeedPin"));
      setTimeout(() => setLockError(null), 3000);
      return;
    }
    if (!lockStatus?.unlocked) {
      setLockError(t("chat.lockNeedUnlock"));
      setTimeout(() => setLockError(null), 3000);
      return;
    }
    await lockConversation(conv.id, !conv.locked);
    load(query.trim() || undefined);
  }

  async function handleDeleteAll() {
    await deleteAllConversations(undefined, undefined, "rag");
    setShowDeleteAll(false);
    setConvs([]);
    onNewChat();
  }

  function formatDate(ms: number) {
    const now = Date.now();
    const diff = now - ms;
    if (diff < 60_000) return t("chat.justNow");
    if (diff < 3_600_000) return t("chat.minutesAgo", { n: Math.floor(diff / 60_000) });
    if (diff < 86_400_000) return t("chat.hoursAgo", { n: Math.floor(diff / 3_600_000) });
    if (diff < 7 * 86_400_000) return t("chat.daysAgo", { n: Math.floor(diff / 86_400_000) });
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function getGroupLabel(ms: number): string {
    const now = Date.now();
    const diff = now - ms;
    if (diff < 86_400_000) return "Hari ini";
    if (diff < 2 * 86_400_000) return "Kemarin";
    if (diff < 7 * 86_400_000) return "7 hari terakhir";
    if (diff < 30 * 86_400_000) return "30 hari terakhir";
    return new Date(ms).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  const grouped: { label: string; items: Conversation[] }[] = [];
  const pinned = convs.filter((c) => c.pinned);
  if (pinned.length > 0) grouped.push({ label: "Disematkan", items: pinned });
  const unpinned = convs.filter((c) => !c.pinned);
  const seen = new Set<string>();
  for (const conv of unpinned) {
    const label = getGroupLabel(conv.updated_at);
    if (!seen.has(label)) {
      seen.add(label);
      grouped.push({ label, items: unpinned.filter((c) => getGroupLabel(c.updated_at) === label) });
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "rgb(var(--bg-surface))" }}>
      {/* Top actions */}
      <div className="px-3 pt-3 pb-2 flex gap-2">
        <button
          onClick={onNewChat}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl text-white transition-all duration-150 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, rgb(var(--accent-600)) 0%, rgb(var(--accent-500)) 100%)",
            boxShadow: "0 2px 8px rgb(var(--accent-600) / 0.35)",
          }}
        >
          <Plus size={12} strokeWidth={2.5} />
          {t("chat.newChat")}
        </button>
        <button
          onClick={() => setShowDeleteAll(true)}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
          style={{ background: "rgb(var(--bg-elevated))", color: "rgb(var(--tx-muted))" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "rgb(248 113 113)";
            (e.currentTarget as HTMLElement).style.background = "rgb(239 68 68 / 0.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "rgb(var(--tx-muted))";
            (e.currentTarget as HTMLElement).style.background = "rgb(var(--bg-elevated))";
          }}
          title={t("chat.deleteAll")}
        >
          <Trash size={12} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-all"
          style={{ background: "rgb(var(--bg-elevated))", border: "1px solid rgb(var(--border))" }}>
          <Search size={11} style={{ color: "rgb(var(--tx-muted))" }} className="shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chat.searchPlaceholder")}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "rgb(var(--tx-primary))" }}
          />
        </div>
      </div>

      {/* Lock error */}
      {lockError && (
        <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-xl text-[10px] leading-snug"
          style={{ background: "rgb(245 158 11 / 0.12)", border: "1px solid rgb(245 158 11 / 0.25)", color: "rgb(251 191 36)" }}>
          {lockError}
        </div>
      )}

      {/* Separator */}
      <div className="mx-3 mb-1 h-px" style={{ background: "rgb(var(--border-subtle))" }} />

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {convs.length === 0 ? (
          <div className="py-10 text-center">
            <MessageSquare size={20} className="mx-auto mb-2 opacity-20" style={{ color: "rgb(var(--tx-muted))" }} />
            <p className="text-xs" style={{ color: "rgb(var(--tx-muted))" }}>
              {query ? t("chat.notFound") : t("chat.noConversations")}
            </p>
          </div>
        ) : (
          grouped.map(({ label, items }) => (
            <div key={label}>
              <div className="px-1.5 pt-2.5 pb-1">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "rgb(var(--tx-muted))" }}>
                  {label}
                </span>
              </div>
              {items.map((conv) => {
                const isSelected = selectedConvId === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConv(conv)}
                    className="w-full text-left px-2 py-2 rounded-xl mb-0.5 group flex items-start gap-2 transition-all duration-100"
                    style={{
                      background: isSelected ? "rgb(var(--accent-600) / 0.12)" : "transparent",
                      border: `1px solid ${isSelected ? "rgb(var(--accent-500) / 0.2)" : "transparent"}`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.background = "rgb(var(--bg-elevated))";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }
                    }}
                  >
                    <span className="shrink-0 mt-0.5" style={{
                      color: conv.locked ? "rgb(251 191 36)"
                        : isSelected ? "rgb(var(--accent-400))"
                        : "rgb(var(--tx-muted))"
                    }}>
                      {conv.locked ? <Lock size={10} /> : <MessageSquare size={10} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate leading-snug"
                        style={{ color: isSelected ? "rgb(var(--accent-300))" : "rgb(var(--tx-primary))" }}>
                        {conv.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <ModeBadge mode={conv.chat_mode} />
                        <span className="text-[9px]" style={{ color: "rgb(var(--tx-muted))" }}>
                          {formatDate(conv.updated_at)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleLock(e, conv)}
                        className="p-1 rounded-md transition-colors"
                        style={{ color: conv.locked ? "rgb(251 191 36)" : "rgb(var(--tx-muted))" }}
                        title={conv.locked ? t("chat.unlockConv") : t("chat.lockConv")}
                      >
                        {conv.locked ? <LockOpen size={10} /> : <Lock size={10} />}
                      </button>
                      <button
                        onClick={(e) => handlePin(e, conv)}
                        className="p-1 rounded-md transition-colors"
                        style={{ color: "rgb(var(--tx-muted))" }}
                        title={conv.pinned ? "Unpin" : "Pin"}
                      >
                        {conv.pinned ? <PinOff size={10} /> : <Pin size={10} />}
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, conv)}
                        className="p-1 rounded-md transition-colors"
                        style={{ color: "rgb(var(--tx-muted))" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "rgb(248 113 113)"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "rgb(var(--tx-muted))"}
                        title="Hapus"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Delete All Confirm */}
      {showDeleteAll && (
        <div className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgb(0 0 0 / 0.6)", backdropFilter: "blur(4px)" }}>
          <div className="mx-4 max-w-xs w-full rounded-2xl p-5"
            style={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", boxShadow: "0 20px 60px rgb(0 0 0 / 0.5)" }}>
            <p className="text-sm font-semibold mb-1" style={{ color: "rgb(var(--tx-primary))" }}>
              {t("chat.deleteAllTitle")}
            </p>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: "rgb(var(--tx-muted))" }}>
              {t("chat.deleteAllDesc")}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteAll(false)}
                className="flex-1 text-xs py-2 rounded-xl transition-opacity hover:opacity-80"
                style={{ background: "rgb(var(--bg-elevated))", color: "rgb(var(--tx-secondary))", border: "1px solid rgb(var(--border))" }}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDeleteAll}
                className="flex-1 text-xs py-2 rounded-xl font-semibold text-white transition-colors"
                style={{ background: "rgb(239 68 68)" }}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingLockedConv && (
        <LockPopup
          itemLabel={pendingLockedConv.title}
          onUnlocked={() => {
            onSelect(pendingLockedConv);
            setPendingLockedConv(null);
          }}
          onClose={() => setPendingLockedConv(null)}
        />
      )}
    </div>
  );
}
