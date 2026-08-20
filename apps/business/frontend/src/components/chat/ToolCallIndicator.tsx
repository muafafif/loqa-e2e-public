"use client";

export type ChatStatus = "thinking" | "tooling" | "context_injection" | "tool_error" | "generating" | string;

interface Props {
  label: string;
  variant?: "spinner" | "error";
}

export function ToolCallIndicator({ label, variant = "spinner" }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs th-text-muted th-bg-elevated border th-border rounded-xl w-fit">
      {variant === "error" ? (
        <span className="w-3 h-3 rounded-full bg-red-400/60 shrink-0" />
      ) : (
        <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
      )}
      {label}
    </div>
  );
}
