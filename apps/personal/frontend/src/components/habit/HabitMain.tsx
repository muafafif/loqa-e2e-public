"use client";

import { useState, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { getTodayStatus, listHabits, checkIn, deleteHabit, updateHabit } from "@/lib/habitApi";
import { useHabitReminder } from "@/lib/useHabitReminder";
import type { Habit, HabitWithStatus } from "@/types";
import { HabitForm } from "./HabitForm";
import { HabitDetailPanel } from "./HabitDetailPanel";
import { Plus, Flame, Archive, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const DAY_KEYS = [
  "habit.days.sun", "habit.days.mon", "habit.days.tue", "habit.days.wed",
  "habit.days.thu", "habit.days.fri", "habit.days.sat",
] as const;

export function HabitMain() {
  const t = useT();
  const [habits, setHabits] = useState<HabitWithStatus[]>([]);
  const [allHabits, setAllHabits] = useState<Habit[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Habit | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [optimisticIds, setOptimisticIds] = useState<Set<number>>(new Set());

  const today = todayStr();

  const load = useCallback(async () => {
    const [todayData, allData] = await Promise.all([
      getTodayStatus(today),
      listHabits(),
    ]);
    setHabits(todayData);
    setAllHabits(allData);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // Wire up reminders for all active habits with reminder_time set
  useHabitReminder(allHabits.filter(h => h.active === 1));

  const activeHabits = habits.filter(h => h.active === 1);
  const archivedHabits = allHabits.filter(h => h.active === 0);
  const doneCount = activeHabits.filter(h => h.checked_today || optimisticIds.has(h.id)).length;

  async function handleCheckIn(habit: HabitWithStatus) {
    // Optimistic toggle
    const willCheck = !(habit.checked_today || optimisticIds.has(habit.id));
    setOptimisticIds(prev => {
      const next = new Set(prev);
      if (willCheck) next.add(habit.id);
      else next.delete(habit.id);
      return next;
    });
    setHabits(prev =>
      prev.map(h => h.id === habit.id ? { ...h, checked_today: willCheck } : h)
    );
    try {
      await checkIn(habit.id, today);
    } catch {
      // Revert on error
      setHabits(prev =>
        prev.map(h => h.id === habit.id ? { ...h, checked_today: !willCheck } : h)
      );
      setOptimisticIds(prev => {
        const next = new Set(prev);
        if (willCheck) next.delete(habit.id); else next.add(habit.id);
        return next;
      });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("habit.deleteConfirm"))) return;
    await deleteHabit(id);
    await load();
  }

  async function handleToggleArchive(habit: Habit) {
    await updateHabit(habit.id, { active: habit.active === 1 ? 0 : 1 });
    await load();
  }

  function openCreate() { setEditTarget(null); setShowForm(true); }
  function openEdit(h: Habit) { setEditTarget(h); setShowForm(true); }

  if (detailId !== null) {
    return (
      <HabitDetailPanel
        habitId={detailId}
        onBack={() => { setDetailId(null); load(); }}
        onEdit={(h) => { setDetailId(null); openEdit(h); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold th-text">{t("habit.title")}</h1>
          <p className="text-xs th-text-muted mt-0.5">
            {doneCount} {t("habit.of")} {activeHabits.length} {t("habit.done")}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium transition-colors"
        >
          <Plus size={13} />
          {t("habit.new")}
        </button>
      </div>

      {/* Progress bar */}
      {activeHabits.length > 0 && (
        <div className="px-5 pb-4">
          <div className="h-1.5 rounded-full th-bg-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${activeHabits.length ? (doneCount / activeHabits.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Habit cards */}
      <div className="px-5 flex flex-col gap-2 pb-4">
        {activeHabits.length === 0 && (
          <p className="text-sm th-text-muted text-center py-12">{t("habit.empty")}</p>
        )}
        {activeHabits.map(habit => (
          <HabitCard
            key={habit.id}
            habit={habit}
            today={today}
            onCheckIn={() => handleCheckIn(habit)}
            onEdit={() => openEdit(habit)}
            onDelete={() => handleDelete(habit.id)}
            onArchive={() => handleToggleArchive(habit)}
            onDetail={() => setDetailId(habit.id)}
          />
        ))}
      </div>

      {/* Archived section */}
      {archivedHabits.length > 0 && (
        <div className="px-5 pb-6">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-1.5 text-xs th-text-muted hover:th-text transition-colors mb-2"
          >
            <Archive size={12} />
            {t("habit.showArchived")} ({archivedHabits.length})
          </button>
          {showArchived && (
            <div className="flex flex-col gap-2">
              {archivedHabits.map(habit => (
                <div key={habit.id} className="card p-3 flex items-center gap-3 opacity-50">
                  <span className="text-xl">{habit.icon}</span>
                  <span className="flex-1 text-sm th-text-muted line-through">{habit.name}</span>
                  <button
                    onClick={() => handleToggleArchive(habit)}
                    className="text-xs th-text-muted hover:th-text px-2 py-1 rounded transition-colors"
                  >
                    {t("habit.unarchive")}
                  </button>
                  <button
                    onClick={() => handleDelete(habit.id)}
                    className="text-xs text-red-400 hover:text-red-500 px-2 py-1 rounded transition-colors"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <HabitForm
          initial={editTarget}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Habit Card ────────────────────────────────────────────────────────────────

interface HabitCardProps {
  habit: HabitWithStatus;
  today: string;
  onCheckIn: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onDetail: () => void;
}

function HabitCard({ habit, onCheckIn, onEdit, onDelete, onArchive, onDetail }: HabitCardProps) {
  const t = useT();
  const checked = habit.checked_today;

  return (
    <div
      className={clsx(
        "card p-3.5 flex items-center gap-3 transition-all",
        checked && "opacity-75"
      )}
    >
      {/* Check-in button */}
      <button
        onClick={onCheckIn}
        className={clsx(
          "w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
          checked
            ? "border-transparent text-white"
            : "border-current th-text-muted hover:border-brand-500"
        )}
        style={checked ? { backgroundColor: habit.color, borderColor: habit.color } : {}}
        title={checked ? t("habit.undoCheckIn") : t("habit.checkIn")}
      >
        {checked && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Icon + name */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-lg shrink-0">{habit.icon}</span>
        <div className="min-w-0">
          <p className={clsx("text-sm font-medium th-text truncate", checked && "line-through th-text-muted")}>
            {habit.name}
          </p>
          {habit.description && (
            <p className="text-[11px] th-text-muted truncate">{habit.description}</p>
          )}
        </div>
      </div>

      {/* Streak badge */}
      <StreakBadge habitId={habit.id} color={habit.color} />

      {/* Mini heatmap — last 7 days */}
      <MiniHeatmap habitId={habit.id} color={habit.color} />

      {/* Detail arrow + menu */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onDetail} className="p-1 th-text-muted hover:th-text transition-colors" title={t("habit.statsTitle")}>
          <ChevronRight size={14} />
        </button>
        <HabitMenu onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ── Streak Badge ──────────────────────────────────────────────────────────────

function StreakBadge({ habitId, color }: { habitId: number; color: string }) {
  const t = useT();
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    import("@/lib/habitApi").then(api =>
      api.getHabitStats(habitId).then(s => setStreak(s.current_streak))
    );
  }, [habitId]);

  if (!streak) return null;
  return (
    <div
      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0"
      style={{ backgroundColor: `${color}22`, color }}
      title={`${t("habit.streakCurrent")}: ${streak} ${t("habit.streakDays")}`}
    >
      <Flame size={11} />
      {streak}
    </div>
  );
}

// ── Mini Heatmap (7 days) ─────────────────────────────────────────────────────

function MiniHeatmap({ habitId, color }: { habitId: number; color: string }) {
  const [days, setDays] = useState<boolean[]>([]);

  useEffect(() => {
    const today = new Date();
    const dateFrom = new Date(today);
    dateFrom.setDate(today.getDate() - 6);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    import("@/lib/habitApi").then(api =>
      api.getHabitLogs(habitId, fmt(dateFrom), fmt(today)).then(logs => {
        const logSet = new Set(logs);
        const result: boolean[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          result.push(logSet.has(fmt(d)));
        }
        setDays(result);
      })
    );
  }, [habitId]);

  if (days.length === 0) return <div className="w-14" />;

  return (
    <div className="flex gap-0.5 shrink-0">
      {days.map((checked, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-sm th-bg-elevated"
          style={{ backgroundColor: checked ? color : undefined }}
        />
      ))}
    </div>
  );
}

// ── Kebab menu ────────────────────────────────────────────────────────────────

function HabitMenu({ onEdit, onArchive, onDelete }: { onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1 th-text-muted hover:th-text transition-colors rounded"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="7" cy="3" r="1.2" />
          <circle cx="7" cy="7" r="1.2" />
          <circle cx="7" cy="11" r="1.2" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-50 w-36 th-bg-surface border th-border rounded-xl shadow-xl overflow-hidden py-1">
            <button onClick={() => { setOpen(false); onEdit(); }} className="w-full text-left px-3 py-2 text-xs th-text hover:th-bg-elevated transition-colors">
              {t("common.edit")}
            </button>
            <button onClick={() => { setOpen(false); onArchive(); }} className="w-full text-left px-3 py-2 text-xs th-text hover:th-bg-elevated transition-colors">
              {t("habit.archive")}
            </button>
            <button onClick={() => { setOpen(false); onDelete(); }} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:th-bg-elevated transition-colors">
              {t("common.delete")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
