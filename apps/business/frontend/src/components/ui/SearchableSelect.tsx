"use client";

import { useState, useRef, useEffect, useId } from "react";
import { ChevronDown, X } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}

export function SearchableSelect({
  value, onChange, options, placeholder = "Select…", clearable = false, disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : options;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "ArrowDown" && !open) setOpen(true);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        className={[
          "flex items-center gap-1 w-full text-sm th-bg-elevated th-text border th-border rounded-lg px-3 py-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500 select-none",
          disabled ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <span className={`flex-1 truncate ${!selected ? "th-text-muted" : ""}`}>
          {selected ? selected.label : placeholder}
        </span>
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="th-text-muted hover:th-text shrink-0"
            tabIndex={-1}
          >
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} className="th-text-muted shrink-0 pointer-events-none" />
      </div>

      {/* Dropdown */}
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full th-bg-elevated border th-border rounded-lg shadow-lg overflow-hidden"
        >
          {/* Search input */}
          <div className="px-2 pt-2 pb-1">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari…"
              className="w-full text-sm th-bg-surface th-text border th-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
                e.stopPropagation();
              }}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs th-text-muted text-center">Tidak ada hasil</p>
            ) : (
              filtered.map((opt) => (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => handleSelect(opt.value)}
                  className={[
                    "px-3 py-2 text-sm cursor-pointer transition-colors",
                    opt.value === value
                      ? "bg-brand-500/15 text-brand-400"
                      : "th-text hover:th-bg-surface",
                  ].join(" ")}
                >
                  <div className="truncate">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-xs th-text-muted truncate">{opt.sublabel}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
