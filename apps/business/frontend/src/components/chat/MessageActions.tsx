"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Wrench, CheckCircle, XCircle, Database, BrainCircuit } from "lucide-react";
import { clsx } from "clsx";
import type { MessageAction } from "@/types";

interface Props {
  actions?: MessageAction[];
  thinking?: string;
}

const ACTION_ICONS = {
  tool_call:          <Wrench size={11} className="shrink-0" />,
  tool_result:        <CheckCircle size={11} className="shrink-0 text-green-400" />,
  tool_error:         <XCircle size={11} className="shrink-0 text-red-400" />,
  context_injection:  <Database size={11} className="shrink-0 text-blue-400" />,
};

const ACTION_COLORS: Record<MessageAction["action"], string> = {
  tool_call:         "text-yellow-400",
  tool_result:       "text-green-400",
  tool_error:        "text-red-400",
  context_injection: "text-blue-400",
};

const ACTION_LABELS: Record<MessageAction["action"], string> = {
  tool_call:         "Tool Call",
  tool_result:       "Tool Result",
  tool_error:        "Tool Error",
  context_injection: "Context Injection",
};

function ActionRow({ item }: { item: MessageAction }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!item.detail;

  return (
    <div className="text-[11px]">
      <button
        onClick={() => hasDetail && setOpen((s) => !s)}
        className={clsx(
          "flex items-center gap-1.5 w-full text-left",
          hasDetail ? "cursor-pointer hover:opacity-80" : "cursor-default",
          ACTION_COLORS[item.action],
        )}
      >
        {ACTION_ICONS[item.action]}
        <span className="font-medium">{ACTION_LABELS[item.action]}</span>
        <span className="th-text-muted font-normal truncate">— {item.label}</span>
        {hasDetail && (
          <span className="ml-auto shrink-0 th-text-muted">
            {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </span>
        )}
      </button>
      {open && hasDetail && (
        <pre className="mt-1 ml-4 px-2 py-1.5 rounded bg-black/20 th-text-muted overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-48">
          {(() => {
            try { return JSON.stringify(JSON.parse(item.detail), null, 2); }
            catch { return item.detail; }
          })()}
        </pre>
      )}
    </div>
  );
}

export function MessageActions({ actions, thinking }: Props) {
  const [open, setOpen] = useState(false);

  const hasThinking = !!thinking;
  const hasActions = actions && actions.length > 0;
  if (!hasThinking && !hasActions) return null;

  const hasError = actions?.some((a) => a.action === "tool_error");
  const hasTools = actions?.some((a) => a.action === "tool_call");
  const hasContext = actions?.some((a) => a.action === "context_injection");

  const summaryParts: string[] = [];
  if (hasContext) summaryParts.push("Context Injection");
  if (hasTools) {
    const tools = actions!.filter((a) => a.action === "tool_call").map((a) => a.label);
    summaryParts.push(...tools.map((t) => `Tool: ${t}`));
  }
  if (hasThinking) summaryParts.push("Thinking");

  return (
    <div className="mb-2 border th-border rounded-lg overflow-hidden text-[11px]">
      {/* Header toggle */}
      <button
        onClick={() => setOpen((s) => !s)}
        className={clsx(
          "w-full flex items-center gap-1.5 px-2.5 py-1.5 th-bg-elevated hover:opacity-80 transition-opacity",
          hasError ? "text-red-400" : "th-text-muted",
        )}
      >
        {hasError
          ? <XCircle size={11} className="shrink-0" />
          : hasContext
          ? <Database size={11} className="shrink-0 text-blue-400" />
          : hasTools
          ? <Wrench size={11} className="shrink-0 text-yellow-400" />
          : <BrainCircuit size={11} className="shrink-0 text-purple-400" />
        }
        <span className="flex-1 text-left truncate">
          {summaryParts.join(" · ")}
        </span>
        {open ? <ChevronUp size={10} className="shrink-0" /> : <ChevronDown size={10} className="shrink-0" />}
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-2.5 py-2 flex flex-col gap-2 border-t th-border th-bg-base">
          {actions?.map((item, i) => <ActionRow key={i} item={item} />)}
          {hasThinking && (
            <div className="text-[11px]">
              <div className="flex items-center gap-1.5 text-purple-400 font-medium mb-1">
                <BrainCircuit size={11} className="shrink-0" />
                Thinking
              </div>
              <pre className="ml-4 px-2 py-1.5 rounded bg-black/20 th-text-muted overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-64">
                {thinking}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
