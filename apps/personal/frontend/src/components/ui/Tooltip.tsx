"use client";
import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { clsx } from "clsx";

export function Tooltip({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full flex items-center justify-center th-text-muted hover:th-text transition-colors"
        aria-label="Info"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-64 card shadow-xl p-3 text-xs th-text leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
}
