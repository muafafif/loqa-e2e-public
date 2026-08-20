"use client";

import { useState } from "react";
import { Network, Search as SearchIcon } from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/lib/i18n";
import { NotesSidebar } from "./NotesSidebar";
import { NoteEditorPanel } from "./NoteEditorPanel";
import { GraphPanel } from "./GraphPanel";
import { NoteSearchPanel } from "./NoteSearchPanel";

type Tab = "editor" | "graph" | "search";

export function NotesMain() {
  const t = useT();
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("editor");

  const handleSelectNote = (id: number) => {
    setActiveNoteId(id);
    setTab("editor");
  };

  const handleNoteCreated = (id: number) => {
    setActiveNoteId(id);
    setTab("editor");
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <NotesSidebar
        activeNoteId={activeNoteId}
        onSelectNote={handleSelectNote}
        onNoteCreated={handleNoteCreated}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="px-4 py-2 border-b th-border glass-surface flex items-center gap-1 shrink-0">
          <button
            onClick={() => setTab("editor")}
            className={clsx(
              "btn-brand flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150",
              tab === "editor" ? "bg-brand-600 text-white shadow-brand-sm" : "th-text-2 hover:th-text"
            )}
          >
            {t("notes.edit")}
          </button>
          <button
            onClick={() => setTab("search")}
            className={clsx(
              "btn-brand flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150",
              tab === "search" ? "bg-brand-600 text-white shadow-brand-sm" : "th-text-2 hover:th-text"
            )}
          >
            <SearchIcon size={11} />
            {t("notes.search").replace("…", "")}
          </button>
          <button
            onClick={() => setTab("graph")}
            className={clsx(
              "btn-brand flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150",
              tab === "graph" ? "bg-brand-600 text-white shadow-brand-sm" : "th-text-2 hover:th-text"
            )}
          >
            <Network size={11} />
            {t("notes.graph")}
          </button>
        </div>

        {/* Panel */}
        <div className="flex-1 flex overflow-hidden">
          {tab === "editor" && (
            activeNoteId ? (
              <NoteEditorPanel
                noteId={activeNoteId}
                onSelectNote={handleSelectNote}
              />
            ) : (
              <EmptyState onNewNote={() => {}} t={t} />
            )
          )}
          {tab === "graph" && <GraphPanel onSelectNote={handleSelectNote} />}
          {tab === "search" && <NoteSearchPanel onSelectNote={handleSelectNote} />}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ t }: { t: ReturnType<typeof useT>; onNewNote?: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 th-text-muted">
      <div className="w-16 h-16 rounded-2xl th-bg-elevated border th-border flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      </div>
      <p className="text-sm font-medium th-text">{t("notes.empty")}</p>
      <p className="text-xs th-text-muted">Select a note or create a new one</p>
    </div>
  );
}
