"use client";

import { useState, useRef, useCallback } from "react";
import { Search, FileText, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { searchNotes } from "@/lib/notesApi";
import type { NoteSearchResult } from "@/types";

interface Props {
  onSelectNote: (id: number) => void;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function NoteSearchPanel({ onSelectNote }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchNotes(q);
        setResults(res);
        setSearched(true);
      } catch { /* ignore */ }
      setLoading(false);
    }, 300);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b th-border glass-surface shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-muted" />
          <input
            autoFocus
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder={t("notes.search")}
            className="input-field w-full pl-9 py-2 text-sm"
          />
          {loading && (
            <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin th-text-muted" />
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {!searched && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Search size={32} className="th-text-muted opacity-30" />
            <p className="text-sm th-text-muted">Type to search your notes</p>
          </div>
        )}

        {searched && results.length === 0 && !loading && (
          <p className="text-sm th-text-muted text-center py-16">{t("notes.searchEmpty")}</p>
        )}

        <div className="flex flex-col gap-2 max-w-2xl mx-auto">
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => onSelectNote(r.id)}
              className="card p-4 text-left flex items-start gap-3 hover:border-brand-500/30 transition-all"
            >
              <FileText size={14} className="text-brand-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold th-text truncate">{r.title}</p>
                  <span className="text-[10px] th-text-muted shrink-0">{relativeTime(r.updated_at)}</span>
                </div>
                {r.excerpt && (
                  <p
                    className="text-xs th-text-muted line-clamp-2 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: r.excerpt }}
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
