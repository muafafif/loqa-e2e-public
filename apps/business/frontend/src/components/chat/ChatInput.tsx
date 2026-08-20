"use client";

import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { ArrowUp, Square } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isStreaming?: boolean;
  onCancel?: () => void;
}

export function ChatInput({ onSend, disabled, placeholder, isStreaming, onCancel }: Props) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !disabled;

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  return (
    <div
      className="relative rounded-2xl transition-all duration-200"
      style={{
        background: "rgb(var(--bg-elevated))",
        border: `1px solid ${focused ? "rgb(var(--accent-500) / 0.5)" : "rgb(var(--border))"}`,
        boxShadow: focused
          ? "0 0 0 3px rgb(var(--accent-600) / 0.1), 0 4px 24px rgb(0 0 0 / 0.2)"
          : "0 2px 8px rgb(0 0 0 / 0.15)",
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled && !isStreaming}
        placeholder={placeholder ?? "Tanya apa saja…"}
        rows={1}
        className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed pt-4 pb-12 px-4"
        style={{
          color: "rgb(var(--tx-primary))",
          maxHeight: "180px",
        }}
      />
      {/* placeholder color fix via style tag in parent */}

      {/* Bottom toolbar */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
            style={{
              color: "rgb(var(--tx-muted))",
              background: "rgb(var(--bg-base) / 0.8)",
              border: "1px solid rgb(var(--border-subtle))",
            }}>
            ↵ kirim
          </span>
          <span className="text-[10px]" style={{ color: "rgb(var(--tx-muted))" }}>
            ⇧↵ baris baru
          </span>
        </div>

        {isStreaming && onCancel ? (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-95"
            style={{
              background: "rgb(var(--bg-base))",
              color: "rgb(var(--tx-secondary))",
              border: "1px solid rgb(var(--border))",
            }}
          >
            <Square size={11} className="fill-current" />
            Hentikan
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95"
            style={{
              background: canSend
                ? "rgb(var(--accent-500))"
                : "rgb(var(--bg-base))",
              color: canSend ? "white" : "rgb(var(--tx-muted))",
              border: `1px solid ${canSend ? "transparent" : "rgb(var(--border))"}`,
              boxShadow: canSend ? "0 2px 8px rgb(var(--accent-600) / 0.4)" : "none",
            }}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
