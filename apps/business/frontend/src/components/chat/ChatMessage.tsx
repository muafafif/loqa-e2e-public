"use client";

import { Message } from "@/types";
import { CitationBadge } from "./CitationBadge";
import { ToolCallIndicator } from "./ToolCallIndicator";
import { MessageActions } from "./MessageActions";
import { WifiOff, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { MarkdownContent } from "@/lib/markdown";
import { useT } from "@/lib/i18n";

interface ChatMessageProps {
  message: Message;
  statusLabel?: string | null;
}

function LoqaAvatar({ error }: { error?: boolean }) {
  if (error) {
    return (
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "rgb(239 68 68 / 0.15)", border: "1px solid rgb(239 68 68 / 0.3)" }}>
        <AlertTriangle size={13} style={{ color: "rgb(248 113 113)" }} />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 select-none"
      style={{
        background: "linear-gradient(135deg, rgb(var(--accent-600)) 0%, rgb(var(--accent-500)) 100%)",
        boxShadow: "0 2px 8px rgb(var(--accent-600) / 0.4)",
      }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1L12.196 4V10L7 13L1.804 10V4L7 1Z" fill="white" fillOpacity="0.9" />
        <path d="M7 4L9.598 5.5V8.5L7 10L4.402 8.5V5.5L7 4Z" fill="white" fillOpacity="0.4" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
      style={{
        background: "rgb(var(--bg-elevated))",
        border: "1px solid rgb(var(--border))",
      }}>
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle cx="6.5" cy="4.5" r="2.5" stroke="rgb(var(--tx-secondary))" strokeWidth="1.3"/>
        <path d="M1.5 12C1.5 9.515 3.791 7.5 6.5 7.5s5 2.015 5 4.5" stroke="rgb(var(--tx-secondary))" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export function ChatMessage({ message, statusLabel }: ChatMessageProps) {
  const t = useT();
  const isUser = message.role === "user";
  const isError = !!(message.offline || message.error);
  const hasCitations = !!(message.citations?.length);

  if (isUser) {
    return (
      <div className="flex justify-end gap-2.5 px-4 py-2">
        <div className="max-w-[72%]">
          <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "linear-gradient(135deg, rgb(var(--accent-600)) 0%, rgb(var(--accent-500)) 100%)",
              color: "white",
              boxShadow: "0 2px 12px rgb(var(--accent-600) / 0.3)",
            }}>
            <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
          </div>
        </div>
        <UserAvatar />
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 px-4 py-2">
      <LoqaAvatar error={isError} />

      <div className="flex-1 min-w-0 max-w-[85%] flex flex-col gap-2">
        {message.loading ? (
          <div className="flex items-center gap-3 py-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "rgb(var(--accent-400))",
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
            {statusLabel && (
              <span className="text-xs" style={{ color: "rgb(var(--tx-muted))" }}>
                {statusLabel}
              </span>
            )}
          </div>
        ) : (
          <>
            <MessageActions actions={message.actions} thinking={message.thinking} />
            <div
              className={clsx("rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed prose-chat",
                isError && "border"
              )}
              style={isError ? {
                background: "rgb(239 68 68 / 0.08)",
                borderColor: "rgb(239 68 68 / 0.2)",
                color: "rgb(248 113 113)",
              } : {
                background: "rgb(var(--bg-surface))",
                border: "1px solid rgb(var(--border-subtle))",
                color: "rgb(var(--tx-primary))",
              }}
            >
              {isError ? (
                <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
              ) : (
                <MarkdownContent content={message.content} citations={message.citations ?? []} />
              )}
            </div>
          </>
        )}

        {hasCitations && !message.loading && (
          <div className="flex flex-wrap gap-1 px-1">
            {message.citations!.map((c) => (
              <CitationBadge key={c.index} citation={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
