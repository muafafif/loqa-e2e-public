"use client";

import { useState, useEffect } from "react";
import { getPeriodMetrics, getKbMetrics, getSessionMetrics } from "@/lib/api";
import { PeriodMetrics, KbMetrics, SessionMetrics } from "@/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from "recharts";
import { CHART_COLORS, TICK_STYLE, GRID_PROPS, TOOLTIP_PROPS } from "@/lib/chartConfig";
import { Hash, MessageSquare, Database, Zap, RefreshCw, BookOpen, Activity, Clock, Brain } from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/lib/i18n";

interface Props {
  sessionId: string;
}

type Period = "day" | "week" | "month";

export function AnalyticsPanel({ sessionId }: Props) {
  const t = useT();
  const [period, setPeriod] = useState<Period>("day");
  const [periodData, setPeriodData] = useState<PeriodMetrics | null>(null);
  const [sessionData, setSessionData] = useState<SessionMetrics | null>(null);
  const [kbData, setKbData] = useState<KbMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [p, s, k] = await Promise.all([
      getPeriodMetrics(period),
      getSessionMetrics(sessionId),
      getKbMetrics(),
    ]);
    setPeriodData(p);
    setSessionData(s);
    setKbData(k.knowledge_bases ?? []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [period, sessionId]);

  const PERIODS: { id: Period; label: string }[] = [
    { id: "day",   label: t("analytics.periodDay") },
    { id: "week",  label: t("analytics.periodWeek") },
    { id: "month", label: t("analytics.periodMonth") },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-y-auto scrollbar-thin min-w-0" style={{ background: "rgb(var(--bg-base))" }}>
      {/* Header */}
      <div className="px-5 py-3 border-b flex items-center justify-between shrink-0 glass-surface" style={{ borderColor: "rgb(var(--border))" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgb(var(--accent-700)) 0%, rgb(var(--accent-500)) 100%)" }}>
            <Activity size={13} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-sm leading-none" style={{ color: "rgb(var(--tx-primary))" }}>{t("analytics.title")}</h2>
            <p className="text-[10px] mt-0.5" style={{ color: "rgb(var(--tx-muted))" }}>Usage metrics & knowledge base stats</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="tab-glass flex">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={clsx("tab-glass-item btn-brand", period === p.id && "active")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
            style={{ background: "rgb(255 255 255 / 0.05)", border: "1px solid rgb(var(--border))", color: "rgb(var(--tx-muted))" }}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-5 max-w-5xl w-full mx-auto">

        {/* ── Hero stat row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <HeroStat
            label={t("analytics.totalTokens")}
            value={periodData ? fmt(periodData.total_tokens) : "—"}
            sub={periodData ? `↑${fmt(periodData.input_tokens)} ↓${fmt(periodData.output_tokens)}` : undefined}
            icon={<Hash size={13} />}
            color="brand"
          />
          <HeroStat
            label={t("analytics.messages")}
            value={periodData ? String(periodData.messages) : "—"}
            icon={<MessageSquare size={13} />}
            color="brand"
          />
          <HeroStat
            label={t("analytics.avgLatency")}
            value={periodData ? fmtMs(periodData.avg_latency_ms) : "—"}
            sub={periodData?.max_latency_ms ? `max ${fmtMs(periodData.max_latency_ms)}` : undefined}
            icon={<Clock size={13} />}
            color="brand"
          />
          <HeroStat
            label={t("analytics.sessions")}
            value={periodData ? String(periodData.sessions) : "—"}
            icon={<Activity size={13} />}
            color="brand"
          />
        </div>

        {/* ── Charts row ── */}
        {periodData && periodData.timeline.length > 0 && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Token timeline */}
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)" }}>
                  <Hash size={11} style={{ color: "rgb(var(--accent-400))" }} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                  {t("analytics.tokenTimeline")}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={periodData.timeline} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGradToken" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={CHART_COLORS.brand} stopOpacity={1} />
                      <stop offset="100%" stopColor={CHART_COLORS.cumulative} stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK_STYLE} tickFormatter={(v) => fmt(v)} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v: unknown) => [fmt(Number(v)), t("analytics.tokens")]} />
                  <Bar dataKey="tokens" fill="url(#barGradToken)" radius={[6,6,0,0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Message volume */}
            <div className="glass-card p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)" }}>
                  <MessageSquare size={11} style={{ color: "rgb(var(--accent-400))" }} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>
                  {t("analytics.messageVolume")}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={periodData.timeline} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradMsg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS.net} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={CHART_COLORS.net} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK_STYLE} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_PROPS} />
                  <Area type="monotone" dataKey="messages" stroke={CHART_COLORS.net} fill="url(#gradMsg)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Session stats + By Model/KB ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* Current session */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <SectionHeader title={t("analytics.session")} icon={<Zap size={12} />} />
            <div className="flex flex-col gap-2">
              <SessionRow label={t("analytics.totalTokens")} value={sessionData ? fmt(sessionData.total_tokens) : "—"}
                sub={sessionData ? `↑${fmt(sessionData.total_input_tokens)} ↓${fmt(sessionData.total_output_tokens)}` : undefined} />
              <div className="h-px" style={{ background: "rgb(var(--border))" }} />
              <SessionRow label={t("analytics.messages")} value={sessionData ? String(sessionData.message_count) : "—"} />
              <div className="h-px" style={{ background: "rgb(var(--border))" }} />
              <SessionRow label={t("analytics.avgLatency")} value={sessionData ? fmtMs(sessionData.avg_latency_ms) : "—"}
                sub={sessionData?.max_latency_ms ? `max ${fmtMs(sessionData.max_latency_ms)}` : undefined} />
              <div className="h-px" style={{ background: "rgb(var(--border))" }} />
              <SessionRow label={t("analytics.ragQueries")} value={sessionData ? String(sessionData.rag_count) : "—"} />
            </div>
          </div>

          {/* By model */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <SectionHeader title={t("analytics.byModel")} icon={<Brain size={12} />} />
            {!periodData || periodData.by_model.length === 0 ? (
              <p className="text-xs" style={{ color: "rgb(var(--tx-muted))" }}>—</p>
            ) : (
              <div className="flex flex-col gap-2">
                {periodData.by_model.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-xl transition-colors"
                    style={{ background: "rgb(255 255 255 / 0.03)", border: "1px solid rgb(var(--border))" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgb(var(--accent-600) / 0.12)", border: "1px solid rgb(var(--accent-500) / 0.15)" }}>
                      <Zap size={11} style={{ color: "rgb(var(--accent-400))" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate leading-none" style={{ color: "rgb(var(--tx-primary))" }}>{m.model_name || t("analytics.unknown")}</p>
                      <p className="text-[10px] capitalize mt-0.5" style={{ color: "rgb(var(--tx-muted))" }}>{m.provider}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold gradient-text-brand stat-number">{fmt(m.input_tokens + m.output_tokens)}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "rgb(var(--tx-muted))" }}>{m.messages} {t("analytics.msgs")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By KB */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <SectionHeader title={t("analytics.byKb")} icon={<Database size={12} />} />
            {kbData.length === 0 ? (
              <p className="text-xs" style={{ color: "rgb(var(--tx-muted))" }}>{t("analytics.noKb")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {kbData.map((kb) => (
                  <div key={kb.kb_id} className="flex items-center gap-3 py-2 px-3 rounded-xl"
                    style={{ background: "rgb(255 255 255 / 0.03)", border: "1px solid rgb(var(--border))" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgb(var(--accent-600) / 0.12)", border: "1px solid rgb(var(--accent-500) / 0.15)" }}>
                      <BookOpen size={11} style={{ color: "rgb(var(--accent-400))" }} />
                    </div>
                    <span className="flex-1 text-xs font-medium truncate" style={{ color: "rgb(var(--tx-primary))" }}>{kb.kb_id}</span>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold gradient-text-brand stat-number">{fmt(kb.chunks)}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "rgb(var(--tx-muted))" }}>{kb.docs} {t("analytics.docs")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function HeroStat({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; color: "brand" | "income" | "expense";
}) {
  const gradClass = color === "income" ? "gradient-text-income" : color === "expense" ? "gradient-text-expense" : "gradient-text-brand";
  return (
    <div className="kpi-card inner-highlight px-4 py-4 flex flex-col gap-2 relative overflow-hidden">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{label}</p>
      </div>
      <p className={`text-3xl font-bold leading-none stat-number ${gradClass}`}>{value}</p>
      {sub && <p className="text-[10px] leading-snug" style={{ color: "rgb(var(--tx-muted))" }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
        style={{ background: "rgb(var(--accent-600) / 0.15)", border: "1px solid rgb(var(--accent-500) / 0.2)", color: "rgb(var(--accent-400))" }}>
        {icon}
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgb(var(--tx-muted))" }}>{title}</span>
    </div>
  );
}

function SessionRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <p className="text-[11px]" style={{ color: "rgb(var(--tx-muted))" }}>{label}</p>
      <div className="text-right">
        <p className="text-sm font-bold stat-number gradient-text-brand">{value}</p>
        {sub && <p className="text-[10px]" style={{ color: "rgb(var(--tx-muted))" }}>{sub}</p>}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}
