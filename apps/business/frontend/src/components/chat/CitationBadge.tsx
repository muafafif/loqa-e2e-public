"use client";

import { useState, useRef, useEffect } from "react";
import { Citation } from "@/types";
import { FileText, X } from "lucide-react";

interface Props {
  citation: Citation;
}

export function CitationBadge({ citation }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-brand-600/20 text-brand-400 hover:bg-brand-600/40 border border-brand-600/30 transition-colors cursor-pointer"
      >
        {citation.index}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-72 card shadow-xl p-3 flex flex-col gap-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <FileText size={13} className="text-brand-500 shrink-0" />
              <span className="text-xs font-medium th-text truncate">{citation.source}</span>
            </div>
            <button onClick={() => setOpen(false)} className="th-text-muted hover:th-text-2 shrink-0">
              <X size={13} />
            </button>
          </div>

          {/* Meta */}
          <div className="flex gap-2 text-[10px] th-text-muted">
            {citation.page && (
              <span className="th-bg-elevated px-1.5 py-0.5 rounded">Page {citation.page}</span>
            )}
            {citation.chunk_index != null && (
              <span className="th-bg-elevated px-1.5 py-0.5 rounded">Chunk {citation.chunk_index}</span>
            )}
            <span className="th-bg-elevated px-1.5 py-0.5 rounded">
              {Math.round(citation.score * 100)}% match
            </span>
          </div>

          {/* Excerpt */}
          <p className="text-xs th-text-2 leading-relaxed line-clamp-4 border-t th-border pt-2">
            {citation.excerpt}
          </p>
        </div>
      )}
    </span>
  );
}
