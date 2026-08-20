"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Lock } from "lucide-react";
import { clsx } from "clsx";

const MAX_VISIBLE = 8;

export interface FilterDropdownProps<T> {
  label: string;
  selectedLabel: string;
  open: boolean;
  onToggle: () => void;
  onClear?: () => void;
  dropRef: React.RefObject<HTMLDivElement>;
  items: T[];
  selectedId: number | null;
  allLabel: string;
  onSelectAll: () => void;
  onSelect: (item: T) => void;
  getId:    (item: T) => number;
  getName:  (item: T) => string;
  getColor: (item: T) => string;
  isLocked?: (item: T) => boolean;
  lockStatus?: boolean;
}

export function FilterDropdown<T>({
  label, selectedLabel, open, onToggle, onClear, dropRef,
  items, selectedId, allLabel, onSelectAll, onSelect,
  getId, getName, getColor, isLocked, lockStatus,
}: FilterDropdownProps<T>) {
  const [query, setQuery] = useState("");
  const searchRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? items.filter(item => getName(item).toLowerCase().includes(query.toLowerCase()))
    : items;

  const isActive = selectedId !== null;

  // Sync dropRef → containerRef so callers can pass a ref if needed (no-op now)
  useEffect(() => {
    (dropRef as React.MutableRefObject<HTMLDivElement | null>).current = containerRef.current;
  });

  // Close on outside click — same pattern as SearchableSelect
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onToggle]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) searchRef.current?.focus();
    if (!open) setQuery("");
  }, [open]);

  return (
    // containerRef wraps BOTH trigger and dropdown — outside-click detection is accurate
    <div ref={containerRef} className="relative shrink-0 w-[160px]">
      {/* Trigger */}
      <div
        className="flex items-center rounded-xl text-xs w-full overflow-hidden cursor-pointer"
        style={{
          background: isActive ? "rgb(var(--accent-600) / 0.12)" : "rgb(255 255 255 / 0.04)",
          border: `1px solid ${isActive ? "rgb(var(--accent-500) / 0.35)" : "rgb(var(--border))"}`,
        }}
        onClick={() => onToggle()}
      >
        <div className="flex items-center gap-1.5 pl-3 pr-1 py-1.5 flex-1 min-w-0">
          <span className="shrink-0 text-[11px]" style={{ color: "rgb(var(--tx-muted))" }}>{label}:</span>
          <span
            className="font-semibold truncate flex-1"
            style={{ color: isActive ? "rgb(var(--accent-400))" : "rgb(var(--tx-primary))" }}
          >
            {selectedLabel}
          </span>
          <ChevronDown
            size={11}
            className={clsx("transition-transform shrink-0", open && "rotate-180")}
            style={{ color: "rgb(var(--tx-muted))" }}
          />
        </div>

        {isActive && onClear && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onClear(); }}
            className="px-1.5 py-1.5 shrink-0 hover:bg-white/10 rounded-r-xl"
            style={{ color: "rgb(var(--accent-400))" }}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Dropdown — same-container absolute, no portal */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-[200] flex flex-col rounded-xl shadow-xl overflow-hidden"
          style={{
            width: "208px",
            background: "rgb(var(--bg-elevated, 30 30 40))",
            border: "1px solid rgb(var(--border))",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Search — always visible */}
          <div className="px-2 pt-2 pb-1 shrink-0">
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cari..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg outline-none"
              style={{
                background: "rgb(255 255 255 / 0.06)",
                border: "1px solid rgb(var(--border))",
                color: "rgb(var(--tx-primary))",
              }}
              onKeyDown={e => {
                if (e.key === "Escape") { onToggle(); }
                e.stopPropagation();
              }}
            />
          </div>

          <div className="overflow-y-auto p-1" style={{ maxHeight: `${MAX_VISIBLE * 32}px` }}>
            {!query && (
              <button
                type="button"
                onClick={() => { onSelectAll(); setQuery(""); }}
                className={clsx("w-full text-left px-3 py-2 text-xs rounded-lg transition-colors",
                  selectedId === null ? "bg-brand-600/20 text-brand-400" : "hover:bg-white/5")}
                style={{ color: selectedId === null ? undefined : "rgb(var(--tx-primary))" }}
              >
                {allLabel}
              </button>
            )}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-center" style={{ color: "rgb(var(--tx-muted))" }}>
                Tidak ditemukan
              </p>
            )}
            {filtered.map(item => {
              const locked = isLocked?.(item) && !lockStatus;
              return (
                <button
                  type="button"
                  key={getId(item)}
                  onClick={() => { onSelect(item); setQuery(""); }}
                  className={clsx(
                    "w-full text-left px-3 py-2 text-xs flex items-center gap-2 rounded-lg transition-colors",
                    selectedId === getId(item) ? "bg-brand-600/20 text-brand-400" : "hover:bg-white/5",
                    locked && "opacity-70"
                  )}
                  style={{ color: selectedId === getId(item) ? undefined : "rgb(var(--tx-primary))" }}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getColor(item) }} />
                  <span className="flex-1 truncate">{getName(item)}</span>
                  {locked && <Lock size={10} className="shrink-0" style={{ color: "rgb(var(--tx-muted))" }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
