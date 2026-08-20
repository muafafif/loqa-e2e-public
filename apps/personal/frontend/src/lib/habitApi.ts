import type { Habit, HabitWithStatus, HabitStats, HabitCheckInResult } from "@/types";

const BASE = "http://localhost:8000/api/habits";

export async function listHabits(activeOnly = false): Promise<Habit[]> {
  const res = await fetch(`${BASE}?active_only=${activeOnly}`);
  if (!res.ok) throw new Error("Failed to list habits");
  return res.json();
}

export async function getTodayStatus(date: string): Promise<HabitWithStatus[]> {
  const res = await fetch(`${BASE}/today?date=${encodeURIComponent(date)}`);
  if (!res.ok) throw new Error("Failed to get today status");
  return res.json();
}

export async function createHabit(data: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  frequency?: number[];
  reminder_time?: string | null;
}): Promise<Habit> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create habit");
  return res.json();
}

export async function updateHabit(id: number, data: Partial<{
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequency: number[];
  reminder_time: string | null;
  active: number;
}>): Promise<Habit> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update habit");
  return res.json();
}

export async function deleteHabit(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete habit");
}

export async function checkIn(id: number, date: string): Promise<HabitCheckInResult> {
  const res = await fetch(`${BASE}/${id}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  });
  if (!res.ok) throw new Error("Failed to check in");
  return res.json();
}

export async function getHabitStats(id: number): Promise<HabitStats> {
  const res = await fetch(`${BASE}/${id}/stats`);
  if (!res.ok) throw new Error("Failed to get stats");
  return res.json();
}

export async function getHabitLogs(id: number, dateFrom: string, dateTo: string): Promise<string[]> {
  const res = await fetch(`${BASE}/${id}/logs?date_from=${dateFrom}&date_to=${dateTo}`);
  if (!res.ok) throw new Error("Failed to get logs");
  return res.json();
}
