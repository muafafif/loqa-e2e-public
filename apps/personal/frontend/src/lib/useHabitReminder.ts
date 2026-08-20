"use client";

import { useEffect, useRef } from "react";
import type { Habit } from "@/types";

function parseTime(timeStr: string): { h: number; m: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { h, m };
}

function msUntil(h: number, m: number): number {
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

function todayWeekday(): number {
  return new Date().getDay(); // 0=Sun … 6=Sat
}

export function useHabitReminder(habits: Habit[]) {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Clear previous timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const todayDay = todayWeekday();

    for (const habit of habits) {
      if (!habit.active || !habit.reminder_time) continue;
      if (!habit.frequency.includes(todayDay)) continue;

      const { h, m } = parseTime(habit.reminder_time);
      const delay = msUntil(h, m);

      const timer = setTimeout(() => {
        new Notification(`⏰ ${habit.name}`, {
          body: habit.description ?? "Saatnya membangun kebiasaanmu!",
          icon: "/favicon.ico",
          tag: `habit-${habit.id}`,
        });
      }, delay);

      timersRef.current.push(timer);
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [habits]);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}
