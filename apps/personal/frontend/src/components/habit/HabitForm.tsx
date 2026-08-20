"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { createHabit, updateHabit } from "@/lib/habitApi";
import { requestNotificationPermission } from "@/lib/useHabitReminder";
import type { Habit } from "@/types";
import { X, Bell, BellOff } from "lucide-react";
import { clsx } from "clsx";

const PRESET_COLORS = [
  "#0284c7", "#16a34a", "#dc2626", "#d97706",
  "#7c3aed", "#db2777", "#0891b2", "#65a30d",
];

const PRESET_ICONS = ["⭐", "💪", "📚", "🏃", "🧘", "💧", "🥗", "😴", "✍️", "🎯", "🎸", "🧹"];

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_KEYS = [
  "habit.days.sun", "habit.days.mon", "habit.days.tue", "habit.days.wed",
  "habit.days.thu", "habit.days.fri", "habit.days.sat",
] as const;

interface Props {
  initial: Habit | null;
  onClose: () => void;
  onSaved: () => void;
}

export function HabitForm({ initial, onClose, onSaved }: Props) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "⭐");
  const [color, setColor] = useState(initial?.color ?? "#0284c7");
  const [frequency, setFrequency] = useState<number[]>(initial?.frequency ?? [0, 1, 2, 3, 4, 5, 6]);
  const [reminderEnabled, setReminderEnabled] = useState(!!initial?.reminder_time);
  const [reminderTime, setReminderTime] = useState(initial?.reminder_time ?? "08:00");
  const [notifState, setNotifState] = useState<"idle" | "denied">("idle");
  const [saving, setSaving] = useState(false);

  function toggleDay(day: number) {
    setFrequency(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  }

  async function handleReminderToggle(want: boolean) {
    if (!want) { setReminderEnabled(false); return; }
    const perm = await requestNotificationPermission();
    if (perm === "granted") {
      setReminderEnabled(true);
      setNotifState("idle");
    } else {
      setNotifState("denied");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      icon,
      color,
      frequency,
      reminder_time: reminderEnabled ? reminderTime : null,
    };
    try {
      if (initial) {
        await updateHabit(initial.id, data);
      } else {
        await createHabit(data);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md th-bg-surface border th-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold th-text">
            {initial ? t("habit.edit") : t("habit.new")}
          </h3>
          <button onClick={onClose} className="th-text-muted hover:th-text transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4 px-5 pb-5">
          {/* Icon picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs th-text-muted">{t("habit.icon")}</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_ICONS.map(em => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setIcon(em)}
                  className={clsx(
                    "w-9 h-9 text-lg rounded-lg transition-all flex items-center justify-center",
                    icon === em ? "ring-2 ring-brand-500 th-bg-elevated" : "th-bg-elevated hover:ring-1 hover:ring-brand-400"
                  )}
                >
                  {em}
                </button>
              ))}
              {/* Custom emoji input */}
              <input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                maxLength={4}
                className="w-9 h-9 text-center text-lg th-bg-elevated border th-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="✏️"
              />
            </div>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs th-text-muted">{t("habit.name")}</label>
            <input
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field"
              placeholder="Baca buku 30 menit…"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-xs th-text-muted">{t("habit.description")}</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input-field"
              placeholder="Detail atau catatan…"
            />
          </div>

          {/* Color */}
          <div className="flex flex-col gap-2">
            <label className="text-xs th-text-muted">{t("habit.color")}</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={clsx(
                    "w-7 h-7 rounded-full transition-all",
                    color === c && "ring-2 ring-offset-2 ring-brand-500"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border-0 p-0 overflow-hidden"
              />
            </div>
          </div>

          {/* Frequency */}
          <div className="flex flex-col gap-2">
            <label className="text-xs th-text-muted">{t("habit.frequency")}</label>
            <div className="flex gap-1.5">
              {DAYS.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={clsx(
                    "flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
                    frequency.includes(day)
                      ? "text-white"
                      : "th-bg-elevated th-text-muted hover:th-text"
                  )}
                  style={frequency.includes(day) ? { backgroundColor: color } : {}}
                >
                  {t(DAY_KEYS[day])}
                </button>
              ))}
            </div>
          </div>

          {/* Reminder */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs th-text-muted">{t("habit.reminderTime")}</label>
              <button
                type="button"
                onClick={() => handleReminderToggle(!reminderEnabled)}
                className={clsx(
                  "flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors",
                  reminderEnabled ? "text-white" : "th-bg-elevated th-text-muted hover:th-text"
                )}
                style={reminderEnabled ? { backgroundColor: color } : {}}
              >
                {reminderEnabled ? <Bell size={12} /> : <BellOff size={12} />}
                {reminderEnabled ? t("habit.reminderOn") : t("habit.reminderNone")}
              </button>
            </div>
            {notifState === "denied" && (
              <p className="text-[11px] text-red-400">{t("habit.notifDenied")}</p>
            )}
            {reminderEnabled && (
              <input
                type="time"
                value={reminderTime}
                onChange={e => setReminderTime(e.target.value)}
                className="input-field"
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl text-sm th-bg-elevated th-text hover:th-text transition-colors">
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
