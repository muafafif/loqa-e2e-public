"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, FolderPlus, Search, Pin, Folder, FileText, MoreHorizontal,
  Pencil, Trash2, ChevronRight, ChevronDown,
} from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/lib/i18n";
import {
  listFolders, createFolder, deleteFolder, updateFolder,
  listNotes, createNote, deleteNote, updateNote,
} from "@/lib/notesApi";
import type { NoteFolder, NoteListItem } from "@/types";

interface Props {
  activeNoteId: number | null;
  onSelectNote: (id: number) => void;
  onNoteCreated: (id: number) => void;
}


export function NotesSidebar({ activeNoteId, onSelectNote, onNoteCreated }: Props) {
  const t = useT();
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState<number | null>(null);
  const [editingFolder, setEditingFolder] = useState<number | null>(null);
  const [folderName, setFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const reload = useCallback(async () => {
    const [f, n] = await Promise.all([listFolders(), listNotes(activeFolderId ?? undefined)]);
    setFolders(f);
    setNotes(n);
  }, [activeFolderId]);

  useEffect(() => { reload(); }, [reload]);

  const handleNewNote = async () => {
    const note = await createNote({
      title: t("notes.untitled"),
      folder_id: activeFolderId,
    });
    await reload();
    onNoteCreated(note.id);
  };

  const handleDeleteNote = async (id: number) => {
    if (!confirm(t("notes.deleteConfirm"))) return;
    await deleteNote(id);
    await reload();
  };

  const handleTogglePin = async (note: NoteListItem) => {
    await updateNote(note.id, { pinned: !note.pinned });
    await reload();
  };

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) { setAddingFolder(false); return; }
    await createFolder({ name: newFolderName.trim() });
    setNewFolderName("");
    setAddingFolder(false);
    await reload();
  };

  const handleDeleteFolder = async (id: number) => {
    if (!confirm(t("notes.deleteFolderConfirm"))) return;
    await deleteFolder(id);
    if (activeFolderId === id) setActiveFolderId(null);
    await reload();
  };

  const handleRenameFolder = async (id: number) => {
    if (!folderName.trim()) { setEditingFolder(null); return; }
    await updateFolder(id, { name: folderName.trim() });
    setEditingFolder(null);
    await reload();
  };

  const filteredNotes = search.trim()
    ? notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : notes;

  const pinnedNotes = filteredNotes.filter(n => n.pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.pinned);

  return (
    <div className="flex flex-col h-full w-64 shrink-0 border-r th-border th-bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-3 py-3 border-b th-border flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold th-text flex-1">{t("notes.title")}</span>
        <button onClick={() => setAddingFolder(true)} className="p-1.5 rounded-lg hover:th-bg-elevated th-text-2 transition-colors" title={t("notes.newFolder")}>
          <FolderPlus size={14} />
        </button>
        <button onClick={handleNewNote} className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors" title={t("notes.newNote")}>
          <Plus size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b th-border shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 th-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("notes.search")}
            className="input-field w-full pl-7 py-1.5 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* New folder input */}
        {addingFolder && (
          <div className="px-3 py-2 border-b th-border">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleNewFolder(); if (e.key === "Escape") setAddingFolder(false); }}
              onBlur={handleNewFolder}
              placeholder={t("notes.newFolder")}
              className="input-field w-full py-1 text-xs"
            />
          </div>
        )}

        {/* All notes row */}
        <button
          onClick={() => { setActiveFolderId(null); }}
          className={clsx(
            "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
            activeFolderId === null ? "th-text bg-brand-600/10 border-r-2 border-brand-500" : "th-text-2 hover:th-bg-elevated"
          )}
        >
          <FileText size={13} />
          <span className="flex-1 text-left">{t("notes.allNotes")}</span>
        </button>

        {/* Folders */}
        {folders.map(folder => (
          <div key={folder.id}>
            <div
              className={clsx(
                "flex items-center gap-1.5 px-2 py-1.5 text-xs cursor-pointer transition-colors",
                activeFolderId === folder.id ? "th-text bg-brand-600/10 border-r-2 border-brand-500" : "th-text-2 hover:th-bg-elevated"
              )}
            >
              <button
                onClick={() => setExpandedFolders(prev => {
                  const next = new Set(prev);
                  if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
                  return next;
                })}
                className="p-0.5"
              >
                {expandedFolders.has(folder.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <Folder size={13} style={{ color: folder.color }} />
              {editingFolder === folder.id ? (
                <input
                  autoFocus
                  value={folderName}
                  onChange={e => setFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleRenameFolder(folder.id); if (e.key === "Escape") setEditingFolder(null); }}
                  onBlur={() => handleRenameFolder(folder.id)}
                  className="input-field flex-1 py-0 text-xs"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate" onClick={() => setActiveFolderId(folder.id)}>{folder.name}</span>
              )}
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setMenuId(menuId === folder.id ? null : folder.id); }}
                  className="p-0.5 opacity-0 group-hover:opacity-100 hover:opacity-100 rounded th-text-muted hover:th-text transition"
                >
                  <MoreHorizontal size={12} />
                </button>
                {menuId === folder.id && (
                  <div className="absolute right-0 top-full mt-1 z-50 card p-1 flex flex-col gap-0.5 min-w-[120px]">
                    <button
                      onClick={() => { setEditingFolder(folder.id); setFolderName(folder.name); setMenuId(null); }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs th-text hover:th-bg-elevated"
                    >
                      <Pencil size={11} /> Rename
                    </button>
                    <button
                      onClick={() => { handleDeleteFolder(folder.id); setMenuId(null); }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-400/10"
                    >
                      <Trash2 size={11} /> {t("common.delete")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Divider */}
        {folders.length > 0 && <div className="border-b th-border mx-3 my-1" />}

        {/* Pinned notes */}
        {pinnedNotes.length > 0 && (
          <div>
            <p className="px-3 py-1 text-[10px] font-semibold th-text-muted uppercase tracking-wider flex items-center gap-1">
              <Pin size={10} /> {t("notes.pinned")}
            </p>
            {pinnedNotes.map(note => (
              <NoteRow
                key={note.id}
                note={note}
                active={note.id === activeNoteId}
                onSelect={() => onSelectNote(note.id)}
                onDelete={() => handleDeleteNote(note.id)}
                onTogglePin={() => handleTogglePin(note)}
                t={t}
              />
            ))}
          </div>
        )}

        {/* Regular notes */}
        {unpinnedNotes.length === 0 && pinnedNotes.length === 0 ? (
          <p className="px-4 py-6 text-xs th-text-muted text-center">{t("notes.empty")}</p>
        ) : (
          unpinnedNotes.map(note => (
            <NoteRow
              key={note.id}
              note={note}
              active={note.id === activeNoteId}
              onSelect={() => onSelectNote(note.id)}
              onDelete={() => handleDeleteNote(note.id)}
              onTogglePin={() => handleTogglePin(note)}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NoteRow({
  note, active, onSelect, onDelete, onTogglePin, t,
}: {
  note: NoteListItem;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      onClick={onSelect}
      className={clsx(
        "group relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-xs",
        active ? "th-text bg-brand-600/10 border-r-2 border-brand-500" : "th-text-2 hover:th-bg-elevated"
      )}
    >
      {note.pinned ? <Pin size={11} className="text-brand-400 shrink-0" /> : <FileText size={11} className="th-text-muted shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{note.title || t("notes.untitled")}</p>
        {note.kb_id && <span className="text-[10px] text-emerald-400">{t("notes.indexed")}</span>}
      </div>
      <div className="relative">
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          className="p-0.5 opacity-0 group-hover:opacity-100 rounded th-text-muted hover:th-text transition"
        >
          <MoreHorizontal size={12} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 card p-1 flex flex-col gap-0.5 min-w-[140px]">
            <button
              onClick={e => { e.stopPropagation(); onTogglePin(); setMenuOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs th-text hover:th-bg-elevated"
            >
              <Pin size={11} /> {note.pinned ? t("notes.unpin") : t("notes.pin")}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-400/10"
            >
              <Trash2 size={11} /> {t("common.delete")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
