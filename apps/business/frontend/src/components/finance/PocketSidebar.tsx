"use client";

import { useState } from "react";
import { Plus, Lock, Unlock, Pencil, Trash2, Inbox } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useLock } from "@/lib/LockContext";
import { createPocket, updatePocket, deletePocket, setPocketLocked } from "@/lib/financeApi";
import { LockPopup } from "@/components/lock/LockPopup";
import type { Pocket } from "@/types";
import { clsx } from "clsx";

interface Props {
  pockets: Pocket[];
  selectedPocketId: number | null;
  onSelect: (id: number | null) => void;
  onRefresh: () => void;
}

export function PocketSidebar({ pockets, selectedPocketId, onSelect, onRefresh }: Props) {
  const t = useT();
  const { status: lockStatus } = useLock();
  const [editing, setEditing] = useState<Pocket | null>(null);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingLockedPocket, setPendingLockedPocket] = useState<Pocket | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    await createPocket({ name: newName.trim() });
    setNewName("");
    setIsCreating(false);
    onRefresh();
  }

  async function handleUpdate() {
    if (!editing || !newName.trim()) return;
    await updatePocket(editing.id, { name: newName.trim() });
    setEditing(null);
    setNewName("");
    onRefresh();
  }

  async function handleDelete(p: Pocket) {
    if (!confirm(t("finance.pocket.deleteConfirm"))) return;
    await deletePocket(p.id);
    if (selectedPocketId === p.id) onSelect(null);
    onRefresh();
  }

  async function handleToggleLock(p: Pocket) {
    const willLock = !p.locked;
    if (willLock && !lockStatus?.unlocked) {
      // Need PIN to lock — just lock it without needing unlock
      await setPocketLocked(p.id, true);
      onRefresh();
      return;
    }
    if (!willLock && !lockStatus?.unlocked) {
      // Need PIN to unlock
      setPendingLockedPocket(p);
      return;
    }
    await setPocketLocked(p.id, willLock);
    onRefresh();
  }

  function handleSelectPocket(p: Pocket) {
    if (p.locked && !lockStatus?.unlocked) {
      setPendingLockedPocket(p);
      return;
    }
    onSelect(p.id === selectedPocketId ? null : p.id);
  }

  function startEdit(p: Pocket) {
    setEditing(p);
    setNewName(p.name);
    setIsCreating(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b th-border">
        <span className="text-xs font-semibold th-text-muted uppercase tracking-wide">Pockets</span>
        <button
          onClick={() => { setIsCreating(true); setEditing(null); setNewName(""); }}
          className="th-text-muted hover:th-text transition-colors"
          title={t("finance.pocket.new")}
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-0.5">
        {/* All Transactions */}
        <button
          onClick={() => onSelect(null)}
          className={clsx(
            "w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors",
            selectedPocketId === null ? "bg-brand-600/20 text-brand-400" : "th-text-2 hover:th-text th-bg-elevated/0 hover:th-bg-elevated"
          )}
        >
          <Inbox size={12} />
          <span className="truncate">{t("finance.pocket.all")}</span>
        </button>

        {pockets.map((p) => (
          <div key={p.id} className="group relative">
            {editing?.id === p.id ? (
              <form
                onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}
                className="px-2 py-1"
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={handleUpdate}
                  onKeyDown={(e) => e.key === "Escape" && (setEditing(null), setNewName(""))}
                  className="w-full th-bg-elevated border th-border rounded-lg px-2 py-1 text-xs th-text outline-none focus:border-brand-500"
                />
              </form>
            ) : (
              <div
                className={clsx(
                  "flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors",
                  selectedPocketId === p.id ? "bg-brand-600/20 text-brand-400" : "th-text-2 hover:th-text hover:th-bg-elevated"
                )}
                onClick={() => handleSelectPocket(p)}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-xs truncate flex-1">{p.name}</span>
                {p.locked ? <Lock size={11} className="th-text-muted shrink-0" /> : null}
              </div>
            )}

            {/* Hover actions */}
            {editing?.id !== p.id && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-inherit">
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                  className="p-1 th-text-muted hover:th-text transition-colors"
                  title={t("common.edit")}
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleLock(p); }}
                  className="p-1 th-text-muted hover:th-text transition-colors"
                  title={p.locked ? t("finance.pocket.unlock") : t("finance.pocket.lock")}
                >
                  {p.locked ? <Unlock size={11} /> : <Lock size={11} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                  className="p-1 th-text-muted hover:text-red-400 transition-colors"
                  title={t("common.delete")}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        ))}

        {pockets.length === 0 && !isCreating && (
          <p className="px-3 py-4 text-xs th-text-muted text-center leading-relaxed">
            {t("finance.pocket.empty")}
          </p>
        )}
      </div>

      {/* New pocket input */}
      {isCreating && (
        <div className="px-2 py-2 border-t th-border">
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => { if (!newName.trim()) setIsCreating(false); }}
              onKeyDown={(e) => e.key === "Escape" && (setIsCreating(false), setNewName(""))}
              placeholder={t("finance.pocket.name")}
              className="w-full th-bg-elevated border th-border rounded-lg px-2 py-1.5 text-xs th-text placeholder:th-text-muted outline-none focus:border-brand-500"
            />
          </form>
        </div>
      )}

      {pendingLockedPocket && (
        <LockPopup
          itemLabel={pendingLockedPocket.name}
          onUnlocked={() => {
            const p = pendingLockedPocket;
            setPendingLockedPocket(null);
            // After unlock, select the pocket
            onSelect(p.id);
          }}
          onClose={() => setPendingLockedPocket(null)}
        />
      )}
    </div>
  );
}
