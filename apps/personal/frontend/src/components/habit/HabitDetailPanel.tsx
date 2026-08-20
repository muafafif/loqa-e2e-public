"use client";

import { useState, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { getHabitStats, getHabitStats as _gs } from "@/lib/habitApi";
import type { Habit, HabitStats } from "@/types";
import { ArrowLeft, Pencil, Flame, TrendingUp, Award, CheckSquare } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  habitId: number;
  onBack: () => void;
  onEdit: (h: Habit) => void;
}

export function HabitDetailPanel({ habitId, onBack, onEdit }: Props) {
  const t = useT();
  const [habit, setHabit] = useState<Habit | null>(null);
  const [stats, setStats] = useState<HabitStats | null>(null);

  const load = useCallback(async () => {
    const [habitRes, statsRes] = await Promise.all([
      fetch(`http://localhost:8000/api/habits/${habitId}`).then(r => r.json()),
      getHabitStats(habitId),
    ]);
    setHabit(habitRes);
    setStats(statsRes);
  }, [habitId]);

  useEffect(() => { load(); }, [load]);

  if (!habit || !stats) {
    return (
      <div className="flex items-center justify-center h-full th-text-muted text-sm">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 th-text-muted hover:th-text transition-colors rounded-lg th-bg-elevated">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 flex items-center gap-2.5">
          <span className="text-2xl">{habit.icon}</span>
          <div>
            <h2 className="text-sm font-semibold th-text">{habit.name}</h2>
            {habit.description && <p className="text-xs th-text-muted">{habit.description}</p>}
          </div>
        </div>
        <button
          onClick={() => onEdit(habit)}
          className="p-1.5 th-text-muted hover:th-text transition-colors rounded-lg th-bg-elevated"
        >
          <Pencil size={14} />
        </button>
      </div>

      <div className="px-5 flex flex-col gap-5 pb-8">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Flame size={16} />}
            label={t("habit.streakCurrent")}
            value={`${stats.current_streak} ${t("habit.streakDays")}`}
            color={habit.color}
          />
          <StatCard
            icon={<Award size={16} />}
            label={t("habit.streakLongest")}
            value={`${stats.longest_streak} ${t("habit.streakDays")}`}
            color={habit.color}
          />
          <StatCard
            icon={<TrendingUp size={16} />}
            label={t("habit.rate7")}
            value={`${stats.rate_7}%`}
            color={habit.color}
          />
          <StatCard
            icon={<CheckSquare size={16} />}
            label={t("habit.total")}
            value={String(stats.total)}
            color={habit.color}
          />
        </div>

        {/* Completion bars */}
        <div className="card p-4 flex flex-col gap-3">
          <CompletionBar label={t("habit.rate7")} value={stats.rate_7} color={habit.color} />
          <CompletionBar label={t("habit.rate30")} value={stats.rate_30} color={habit.color} />
        </div>

        {/* Heatmap — 84 days */}
        <div className="card p-4">
          <p className="text-xs font-medium th-text-muted mb-3">{t("habit.heatmap")}</p>
          <Heatmap data={stats.heatmap} color={habit.color} />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span className="text-[11px] font-medium th-text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold th-text">{value}</p>
    </div>
  );
}

function CompletionBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs th-text-muted">{label}</span>
        <span className="text-xs font-semibold th-text">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full th-bg-elevated overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function Heatmap({ data, color }: { data: { date: string; checked: boolean }[]; color: string }) {
  // 84 days = 12 weeks × 7 days, displayed as columns (week) × rows (day)
  const weeks: { date: string; checked: boolean }[][] = [];
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map(({ date, checked }) => (
            <div
              key={date}
              title={date}
              className={clsx(
                "w-3.5 h-3.5 rounded-sm transition-colors th-bg-elevated",
                date === today && "outline outline-1 outline-offset-1"
              )}
              style={{
                backgroundColor: checked ? color : undefined,
                outlineColor: date === today ? color : undefined,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
