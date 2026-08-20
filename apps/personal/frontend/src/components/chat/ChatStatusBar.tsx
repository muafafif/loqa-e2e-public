"use client";

import { MessageMetrics } from "@/types";
import { Cpu, Clock, Hash, Zap } from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/lib/i18n";

interface Props {
  sessionTotals: { input_tokens: number; output_tokens: number; latency_ms: number };
  lastMetrics: MessageMetrics | null;
  messageCount: number;
  isStreaming: boolean;
  sessionId: string;
}

export function ChatStatusBar({ sessionTotals, lastMetrics, messageCount, isStreaming, sessionId }: Props) {
  const t = useT();
  const total = sessionTotals.input_tokens + sessionTotals.output_tokens;

  return (
    <div className="px-4 py-1.5 border-t th-border flex items-center gap-4 text-[11px] th-text-muted th-bg-surface">
      <Stat
        icon={<Hash size={10} />}
        label={t("chat.statusTokens")}
        value={total > 0 ? formatNumber(total) : "—"}
        detail={total > 0 ? `↑${formatNumber(sessionTotals.input_tokens)} ↓${formatNumber(sessionTotals.output_tokens)}` : undefined}
        active={total > 0}
      />

      <Stat
        icon={<Cpu size={10} />}
        label={t("chat.statusMessages")}
        value={messageCount > 0 ? String(messageCount) : "—"}
        active={messageCount > 0}
      />

      <Stat
        icon={<Clock size={10} />}
        label={t("chat.statusLatency")}
        value={lastMetrics ? formatLatency(lastMetrics.latency_ms) : "—"}
        active={!!lastMetrics}
      />

      {isStreaming && (
        <div className="ml-auto flex items-center gap-1 text-brand-500">
          <Zap size={10} className="animate-pulse" />
          <span>{t("chat.statusGenerating")}</span>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon, label, value, detail, active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  active?: boolean;
}) {
  return (
    <div className={clsx("flex items-center gap-1", active ? "th-text-2" : "th-text-muted")}>
      {icon}
      <span className={clsx("font-medium", active && "th-text-2")}>{value}</span>
      <span>{label}</span>
      {detail && <span className="th-text-muted ml-0.5">{detail}</span>}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}
