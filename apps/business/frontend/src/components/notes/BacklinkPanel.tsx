"use client";

import { useState, useEffect } from "react";
import { Link2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getBacklinks } from "@/lib/notesApi";
import type { NoteBacklink } from "@/types";

interface Props {
  noteId: number;
  onSelectNote: (id: number) => void;
}

export function BacklinkPanel({ noteId, onSelectNote }: Props) {
  const t = useT();
  const [backlinks, setBacklinks] = useState<NoteBacklink[]>([]);

  useEffect(() => {
    getBacklinks(noteId).then(setBacklinks).catch(() => {});
  }, [noteId]);

  if (backlinks.length === 0) return null;

  return (
    <div className="border-t th-border px-4 py-3">
      <p className="text-[10px] font-semibold th-text-muted uppercase tracking-wider flex items-center gap-1 mb-2">
        <Link2 size={10} /> {t("notes.backlinks")} ({backlinks.length})
      </p>
      <div className="flex flex-col gap-1">
        {backlinks.map(bl => (
          <button
            key={bl.id}
            onClick={() => onSelectNote(bl.id)}
            className="text-left text-xs th-text-2 hover:text-brand-400 transition-colors truncate"
          >
            {bl.title}
          </button>
        ))}
      </div>
    </div>
  );
}
