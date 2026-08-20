"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus, FileText, Database, Upload, Trash2, Search,
  ChevronRight, ChevronDown, Network, NotebookPen,
  FolderPlus, Folder, Pin, MoreHorizontal, Pencil,
  AlertTriangle, CheckCircle, Lock, LockOpen, MessageSquare,
} from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/lib/i18n";
import {
  getKnowledgeBases, uploadDocument, deleteKnowledgeBase,
  getKbConsistency, lockKnowledgeBase,
  listConversations, deleteConversation,
} from "@/lib/api";
import {
  listFolders, createFolder, deleteFolder, updateFolder,
  listNotes, createNote, deleteNote, updateNote,
} from "@/lib/notesApi";
import { useLock } from "@/lib/LockContext";
import { LockPopup } from "@/components/lock/LockPopup";
import { NoteEditorPanel } from "@/components/notes/NoteEditorPanel";
import { GraphPanel } from "@/components/notes/GraphPanel";
import { NoteSearchPanel } from "@/components/notes/NoteSearchPanel";
import { ChatWindow } from "@/components/chat/ChatWindow";
import type { KbInfo, ConsistencyReport, NoteFolder, NoteListItem, Conversation } from "@/types";

type SidebarMode = "notes" | "docs";
type NoteView = "editor" | "graph";
type DocView = "chat" | "files";

export function WorkspacePanel() {
  const t = useT();
  const { status: lockStatus } = useLock();
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionId = useMemo(() => `ws_${Date.now().toString(36)}`, []);

  // ── Sidebar mode ─────────────────────────────────────────────────────────
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("notes");

  // ── KB state ─────────────────────────────────────────────────────────────
  const [kbs, setKbs] = useState<KbInfo[]>([]);
  const [expandedKb, setExpandedKb] = useState<string | null>(null);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const [kbConvHistory, setKbConvHistory] = useState<Conversation[]>([]);
  const [creatingKb, setCreatingKb] = useState(false);
  const [newKbName, setNewKbName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [consistencyReports, setConsistencyReports] = useState<Record<string, ConsistencyReport>>({});
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  const [pendingLockedKb, setPendingLockedKb] = useState<KbInfo | null>(null);
  const [docView, setDocView] = useState<DocView>("chat");

  // ── Notes state ──────────────────────────────────────────────────────────
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [editingFolder, setEditingFolder] = useState<number | null>(null);
  const [folderName, setFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [noteMenu, setNoteMenu] = useState<number | null>(null);
  const [noteView, setNoteView] = useState<NoteView>("editor");
  const [search, setSearch] = useState("");

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadKbs = useCallback(async () => {
    const data = await getKnowledgeBases().catch(() => ({ knowledge_bases: [] }));
    setKbs(data.knowledge_bases ?? []);
  }, []);

  const loadKbHistory = useCallback(async (kbId: string) => {
    const data = await listConversations(undefined, "rag", undefined, kbId).catch(() => []);
    setKbConvHistory(data);
  }, []);

  const loadNotes = useCallback(async () => {
    const [f, n] = await Promise.all([listFolders(), listNotes()]);
    setFolders(f);
    setNotes(n);
  }, []);

  useEffect(() => { loadKbs(); loadNotes(); }, [loadKbs, loadNotes]);

  // ── KB handlers ───────────────────────────────────────────────────────────
  const handleCreateKb = () => {
    const name = newKbName.trim();
    if (!name) return;
    setKbs(prev => [...prev, { kb_id: name, consistent: true, file_count: 0 }]);
    setSelectedKbId(name);
    setNewKbName("");
    setCreatingKb(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedKbId || !e.target.files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(e.target.files)) {
        await uploadDocument(selectedKbId, file);
      }
      await loadKbs();
    } finally { setUploading(false); e.target.value = ""; }
  };

  const handleDeleteKb = async (kbId: string) => {
    if (!confirm(`Hapus knowledge base "${kbId}"?`)) return;
    await deleteKnowledgeBase(kbId).catch(() => {});
    await loadKbs();
    if (selectedKbId === kbId) setSelectedKbId(null);
  };

  const handleToggleLockKb = async (kb: KbInfo) => {
    if (kb.locked && !lockStatus?.unlocked) {
      setPendingLockedKb(kb);
      setLockMsg("Masukkan PIN untuk membuka kunci KB ini");
      return;
    }
    await lockKnowledgeBase(kb.kb_id, !kb.locked).catch(() => {});
    await loadKbs();
  };

  const handleCheckConsistency = async (kbId: string) => {
    const report = await getKbConsistency(kbId).catch(() => null);
    if (report) setConsistencyReports(prev => ({ ...prev, [kbId]: report }));
  };

  const handleSelectKb = (kb: KbInfo) => {
    setSelectedKbId(kb.kb_id);
    setExpandedKb(expandedKb === kb.kb_id ? null : kb.kb_id);
    setChatConvId(null);
    setKbConvHistory([]);
    loadKbHistory(kb.kb_id);
    if (!consistencyReports[kb.kb_id]) handleCheckConsistency(kb.kb_id);
  };

  // ── Note handlers ─────────────────────────────────────────────────────────
  const handleNewNote = async (folderId?: number) => {
    const note = await createNote({ title: t("notes.untitled"), folder_id: folderId ?? null });
    await loadNotes();
    setActiveNoteId(note.id);
    setNoteView("editor");
  };

  const handleDeleteNote = async (id: number) => {
    if (!confirm(t("notes.deleteConfirm"))) return;
    await deleteNote(id);
    if (activeNoteId === id) setActiveNoteId(null);
    await loadNotes();
  };

  const handleTogglePin = async (note: NoteListItem) => {
    await updateNote(note.id, { pinned: !note.pinned });
    await loadNotes();
  };

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) { setAddingFolder(false); return; }
    await createFolder({ name: newFolderName.trim() });
    setNewFolderName("");
    setAddingFolder(false);
    await loadNotes();
  };

  const handleDeleteFolder = async (id: number) => {
    if (!confirm(t("notes.deleteFolderConfirm"))) return;
    await deleteFolder(id);
    await loadNotes();
  };

  const handleRenameFolder = async (id: number) => {
    if (!folderName.trim()) { setEditingFolder(null); return; }
    await updateFolder(id, { name: folderName.trim() });
    setEditingFolder(null);
    await loadNotes();
  };

  // ── Filtered notes ────────────────────────────────────────────────────────
  const filteredNotes = search.trim()
    ? notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : notes;

  const notesInFolder = (folderId: number) =>
    filteredNotes.filter(n => n.folder_id === folderId);

  const pinnedNotes = filteredNotes.filter(n => n.pinned && !n.folder_id);
  const rootNotes = filteredNotes.filter(n => !n.pinned && !n.folder_id);

  // ── Active KB ─────────────────────────────────────────────────────────────
  const activeKb = kbs.find(k => k.kb_id === selectedKbId) ?? null;
  const activeReport = selectedKbId ? consistencyReports[selectedKbId] : undefined;
  const activeDocFiles = activeReport ? Object.keys(activeReport.files) : [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ── Left sidebar ── */}
      <div className="w-64 shrink-0 flex flex-col border-r th-border overflow-hidden">

        {/* Mode switcher */}
        <div className="px-2 py-2 border-b th-border shrink-0 flex gap-1">
          <button
            onClick={() => setSidebarMode("notes")}
            className={clsx(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              sidebarMode === "notes"
                ? "bg-brand-600 text-white"
                : "th-text-muted hover:th-text hover:th-bg-elevated"
            )}
          >
            <NotebookPen size={11} />
            Catatan
          </button>
          <button
            onClick={() => setSidebarMode("docs")}
            className={clsx(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              sidebarMode === "docs"
                ? "bg-brand-600 text-white"
                : "th-text-muted hover:th-text hover:th-bg-elevated"
            )}
          >
            <Database size={11} />
            Dokumen
          </button>
        </div>

        {/* ── Notes sidebar ── */}
        {sidebarMode === "notes" && (
          <>
            {/* Notes toolbar */}
            <div className="px-2 py-1.5 border-b th-border shrink-0 flex items-center gap-1">
              <div className="relative flex-1">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 th-text-muted" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t("notes.search")}
                  className="input-field w-full pl-7 py-1 text-xs"
                />
              </div>
              <button
                onClick={() => setAddingFolder(true)}
                className="p-1.5 rounded-lg hover:th-bg-elevated th-text-muted transition-colors shrink-0"
                title={t("notes.newFolder")}
              >
                <FolderPlus size={12} />
              </button>
              <button
                onClick={() => handleNewNote()}
                className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors shrink-0"
                title={t("notes.newNote")}
              >
                <Plus size={12} />
              </button>
            </div>

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
              {addingFolder && (
                <div className="px-2 py-1.5">
                  <input
                    autoFocus value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleNewFolder(); if (e.key === "Escape") setAddingFolder(false); }}
                    onBlur={handleNewFolder}
                    placeholder={t("notes.newFolder")}
                    className="input-field w-full py-1 text-xs"
                  />
                </div>
              )}

              {pinnedNotes.length > 0 && (
                <div className="mt-1">
                  <SectionHeader icon={<Pin size={9} />} label={t("notes.pinned")} />
                  {pinnedNotes.map(note => (
                    <NoteItem
                      key={note.id} note={note} active={note.id === activeNoteId}
                      menuOpen={noteMenu === note.id}
                      onSelect={() => { setActiveNoteId(note.id); setNoteView("editor"); }}
                      onMenuToggle={() => setNoteMenu(noteMenu === note.id ? null : note.id)}
                      onDelete={() => { handleDeleteNote(note.id); setNoteMenu(null); }}
                      onTogglePin={() => { handleTogglePin(note); setNoteMenu(null); }}
                      t={t}
                    />
                  ))}
                </div>
              )}

              {folders.map(folder => {
                const isExpanded = expandedFolders.has(folder.id);
                const folderNotes = notesInFolder(folder.id);
                return (
                  <div key={folder.id}>
                    <div className="group flex items-center gap-1 px-2 py-1 hover:th-bg-elevated transition-colors cursor-pointer">
                      <button
                        className="p-0.5 th-text-muted"
                        onClick={() => setExpandedFolders(prev => {
                          const next = new Set(prev);
                          if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
                          return next;
                        })}
                      >
                        {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                      <Folder size={12} style={{ color: folder.color }} className="shrink-0" />
                      {editingFolder === folder.id ? (
                        <input
                          autoFocus value={folderName}
                          onChange={e => setFolderName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleRenameFolder(folder.id); if (e.key === "Escape") setEditingFolder(null); }}
                          onBlur={() => handleRenameFolder(folder.id)}
                          className="input-field flex-1 py-0 text-xs"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 text-xs th-text-2 truncate">{folder.name}</span>
                      )}
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                        <button onClick={() => handleNewNote(folder.id)} className="p-0.5 th-text-muted hover:th-text rounded"><Plus size={11} /></button>
                        <button onClick={() => { setEditingFolder(folder.id); setFolderName(folder.name); }} className="p-0.5 th-text-muted hover:th-text rounded"><Pencil size={11} /></button>
                        <button onClick={() => handleDeleteFolder(folder.id)} className="p-0.5 text-red-400/60 hover:text-red-400 rounded"><Trash2 size={11} /></button>
                      </div>
                    </div>
                    {isExpanded && folderNotes.map(note => (
                      <NoteItem
                        key={note.id} note={note} active={note.id === activeNoteId} indent
                        menuOpen={noteMenu === note.id}
                        onSelect={() => { setActiveNoteId(note.id); setNoteView("editor"); }}
                        onMenuToggle={() => setNoteMenu(noteMenu === note.id ? null : note.id)}
                        onDelete={() => { handleDeleteNote(note.id); setNoteMenu(null); }}
                        onTogglePin={() => { handleTogglePin(note); setNoteMenu(null); }}
                        t={t}
                      />
                    ))}
                    {isExpanded && folderNotes.length === 0 && (
                      <p className="pl-9 py-1 text-[10px] th-text-muted">{t("notes.emptyFolder")}</p>
                    )}
                  </div>
                );
              })}

              {rootNotes.length > 0 && folders.length > 0 && (
                <SectionHeader icon={<FileText size={9} />} label={t("notes.allNotes")} />
              )}
              {rootNotes.map(note => (
                <NoteItem
                  key={note.id} note={note} active={note.id === activeNoteId}
                  menuOpen={noteMenu === note.id}
                  onSelect={() => { setActiveNoteId(note.id); setNoteView("editor"); }}
                  onMenuToggle={() => setNoteMenu(noteMenu === note.id ? null : note.id)}
                  onDelete={() => { handleDeleteNote(note.id); setNoteMenu(null); }}
                  onTogglePin={() => { handleTogglePin(note); setNoteMenu(null); }}
                  t={t}
                />
              ))}

              {filteredNotes.length === 0 && !search && (
                <div className="px-4 py-5 text-center">
                  <p className="text-xs th-text-muted">{t("notes.empty")}</p>
                  <button onClick={() => handleNewNote()} className="mt-1.5 text-xs text-brand-400 hover:text-brand-300">
                    + {t("notes.newNote")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Docs sidebar ── */}
        {sidebarMode === "docs" && (
          <>
            {/* Docs toolbar */}
            <div className="px-3 py-2 border-b th-border shrink-0 flex items-center gap-1.5">
              <span className="text-xs th-text-muted flex-1">Knowledge Base</span>
              <button
                onClick={() => setCreatingKb(true)}
                className="p-1.5 rounded-lg th-text-muted hover:th-text hover:th-bg-elevated transition-colors"
                title="Tambah KB"
              >
                <Plus size={12} />
              </button>
            </div>

            {/* KB list */}
            <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
              {creatingKb && (
                <div className="px-2 py-2">
                  <input
                    autoFocus value={newKbName}
                    onChange={e => setNewKbName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCreateKb(); if (e.key === "Escape") setCreatingKb(false); }}
                    onBlur={() => { if (newKbName.trim()) handleCreateKb(); else setCreatingKb(false); }}
                    placeholder="Nama Knowledge Base"
                    className="input-field w-full py-1 text-xs"
                  />
                </div>
              )}

              {kbs.map(kb => {
                const isSelected = selectedKbId === kb.kb_id;
                const report = consistencyReports[kb.kb_id];
                return (
                  <div key={kb.kb_id}>
                    <div
                      className={clsx(
                        "group flex items-center gap-2 px-3 py-2 cursor-pointer hover:th-bg-elevated transition-colors",
                        isSelected && "bg-brand-600/8 border-r-2 border-brand-500"
                      )}
                      onClick={() => handleSelectKb(kb)}
                    >
                      <Database size={12} className={clsx("shrink-0", isSelected ? "text-brand-400" : "th-text-muted")} />
                      <div className="flex-1 min-w-0">
                        <p className={clsx("text-xs truncate", isSelected ? "th-text font-medium" : "th-text-2")}>{kb.kb_id}</p>
                        <p className="text-[10px] th-text-muted">{kb.file_count} dokumen</p>
                      </div>
                      {!kb.consistent && <AlertTriangle size={10} className="text-amber-400 shrink-0" />}
                      {report?.consistent && <CheckCircle size={10} className="text-emerald-400 shrink-0" />}
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleLockKb(kb); }}
                          className="p-0.5 th-text-muted hover:th-text rounded"
                        >
                          {kb.locked ? <Lock size={10} /> : <LockOpen size={10} />}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteKb(kb.kb_id); }}
                          className="p-0.5 text-red-400/60 hover:text-red-400 rounded"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {kbs.length === 0 && !creatingKb && (
                <div className="px-4 py-8 text-center">
                  <Database size={24} className="mx-auto th-text-muted opacity-30 mb-2" />
                  <p className="text-xs th-text-muted">Belum ada Knowledge Base</p>
                  <button onClick={() => setCreatingKb(true)} className="mt-1.5 text-xs text-brand-400 hover:text-brand-300">
                    + Buat KB baru
                  </button>
                </div>
              )}

              {/* KB conversation history */}
              {selectedKbId && (kbConvHistory.length > 0 || chatConvId) && (
                <div className="border-t th-border mt-1 pt-1">
                  <div className="px-3 py-1.5 flex items-center gap-1.5">
                    <MessageSquare size={10} className="th-text-muted" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider th-text-muted flex-1">Riwayat Chat</span>
                    <button
                      onClick={() => { setChatConvId(null); setDocView("chat"); }}
                      className="p-0.5 th-text-muted hover:text-brand-400 rounded transition-colors"
                      title="Chat baru"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                  {kbConvHistory.map(conv => (
                    <div key={conv.id} className="group relative">
                      <button
                        onClick={() => { setChatConvId(conv.id); setDocView("chat"); }}
                        className={clsx(
                          "w-full text-left flex items-center gap-2 px-3 py-1.5 pr-7 transition-colors hover:th-bg-elevated",
                          chatConvId === conv.id && "bg-brand-600/8 border-r-2 border-brand-500"
                        )}
                      >
                        <MessageSquare size={10} className={clsx("shrink-0", chatConvId === conv.id ? "text-brand-400" : "th-text-muted")} />
                        <span className={clsx("flex-1 text-xs truncate", chatConvId === conv.id ? "th-text font-medium" : "th-text-2")}>
                          {conv.title}
                        </span>
                      </button>
                      <button
                        onClick={async e => {
                          e.stopPropagation();
                          await deleteConversation(conv.id);
                          if (chatConvId === conv.id) setChatConvId(null);
                          loadKbHistory(selectedKbId);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 rounded transition-colors"
                      >
                        <Trash2 size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Notes mode main panel ── */}
        {sidebarMode === "notes" && (
          <>
            {/* Notes view tabs */}
            <div className="px-4 py-2 border-b th-border glass-surface shrink-0 flex items-center gap-1">
              <button
                onClick={() => setNoteView("editor")}
                className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  noteView === "editor" ? "bg-brand-600 text-white" : "th-text-muted hover:th-text hover:th-bg-elevated"
                )}
              >
                <NotebookPen size={11} />
                Editor
              </button>
              <button
                onClick={() => setNoteView("graph")}
                className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  noteView === "graph" ? "bg-brand-600 text-white" : "th-text-muted hover:th-text hover:th-bg-elevated"
                )}
              >
                <Network size={11} />
                Graf
              </button>
              {activeNoteId && noteView === "editor" && (
                <span className="ml-2 text-[11px] th-text-muted">
                  · <span className="th-text-2 font-medium">
                    {notes.find(n => n.id === activeNoteId)?.title || t("notes.untitled")}
                  </span>
                </span>
              )}
            </div>

            <div className="flex-1 flex overflow-hidden">
              {noteView === "editor" && activeNoteId && (
                <NoteEditorPanel
                  noteId={activeNoteId}
                  onSelectNote={id => { setActiveNoteId(id); setNoteView("editor"); }}
                  onTitleChange={(id, title) =>
                    setNotes(prev => prev.map(n => n.id === id ? { ...n, title } : n))
                  }
                />
              )}
              {noteView === "editor" && !activeNoteId && <EmptyEditor onNew={() => handleNewNote()} t={t} />}
              {noteView === "graph" && (
                <GraphPanel onSelectNote={id => { setActiveNoteId(id); setNoteView("editor"); }} />
              )}
            </div>
          </>
        )}

        {/* ── Docs mode main panel ── */}
        {sidebarMode === "docs" && (
          <>
            {/* Docs view tabs + KB info */}
            <div className="px-4 py-2 border-b th-border glass-surface shrink-0 flex items-center gap-1">
              {selectedKbId ? (
                <>
                  <button
                    onClick={() => setDocView("chat")}
                    className={clsx(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                      docView === "chat" ? "bg-brand-600 text-white" : "th-text-muted hover:th-text hover:th-bg-elevated"
                    )}
                  >
                    <MessageSquare size={11} />
                    Chat
                  </button>
                  <button
                    onClick={() => setDocView("files")}
                    className={clsx(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                      docView === "files" ? "bg-brand-600 text-white" : "th-text-muted hover:th-text hover:th-bg-elevated"
                    )}
                  >
                    <FileText size={11} />
                    Dokumen
                  </button>
                  <span className="ml-2 text-[11px] th-text-muted">
                    · <span className="th-text-2 font-medium">{selectedKbId}</span>
                  </span>
                </>
              ) : (
                <span className="text-xs th-text-muted">Pilih Knowledge Base untuk mulai</span>
              )}
            </div>

            <div className="flex-1 flex overflow-hidden">
              {!selectedKbId && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 th-text-muted">
                  <div className="w-14 h-14 rounded-2xl th-bg-elevated border th-border flex items-center justify-center">
                    <Database size={22} className="opacity-40" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium th-text mb-1">Pilih Knowledge Base</p>
                    <p className="text-xs th-text-muted">
                      Pilih KB di sidebar untuk chat atau lihat dokumen
                    </p>
                  </div>
                  {kbs.length === 0 && (
                    <button
                      onClick={() => setCreatingKb(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-500 transition-colors"
                    >
                      <Plus size={14} /> Buat Knowledge Base
                    </button>
                  )}
                </div>
              )}

              {selectedKbId && docView === "chat" && (
                <ChatWindow
                  kbId={selectedKbId}
                  chatOnly={false}
                  sessionId={sessionId}
                  convId={chatConvId}
                  onConvCreated={(id) => {
                    setChatConvId(id);
                    loadKbHistory(selectedKbId);
                  }}
                />
              )}

              {selectedKbId && docView === "files" && (
                <DocFilesPanel
                  kbId={selectedKbId}
                  kb={activeKb}
                  report={activeReport}
                  docFiles={activeDocFiles}
                  uploading={uploading}
                  onUploadClick={() => fileRef.current?.click()}
                />
              )}
            </div>

            <input
              type="file" ref={fileRef} multiple className="hidden"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleUpload}
            />
          </>
        )}
      </div>

      {lockMsg && pendingLockedKb && (
        <LockPopup
          itemLabel={pendingLockedKb.kb_id}
          onClose={() => { setLockMsg(null); setPendingLockedKb(null); }}
          onUnlocked={() => {
            setLockMsg(null);
            handleToggleLockKb(pendingLockedKb);
            setPendingLockedKb(null);
          }}
        />
      )}
    </div>
  );
}

// ── DocFilesPanel ─────────────────────────────────────────────────────────────

function DocFilesPanel({
  kbId, kb, report, docFiles, uploading, onUploadClick,
}: {
  kbId: string;
  kb: KbInfo | null;
  report: ConsistencyReport | undefined;
  docFiles: string[];
  uploading: boolean;
  onUploadClick: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden p-5 gap-4">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div>
          <p className="text-sm font-semibold th-text">{kbId}</p>
          <p className="text-xs th-text-muted">{kb?.file_count ?? 0} dokumen tersimpan</p>
        </div>
        <button
          onClick={onUploadClick}
          disabled={uploading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <Upload size={12} />
          {uploading ? "Mengupload…" : "Upload Dokumen"}
        </button>
      </div>

      {/* Consistency status */}
      {report && (
        <div className={clsx(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs border",
          report.consistent
            ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
            : "bg-amber-500/8 border-amber-500/20 text-amber-400"
        )}>
          {report.consistent
            ? <><CheckCircle size={12} /> Semua dokumen konsisten dengan index</>
            : <><AlertTriangle size={12} /> Beberapa dokumen perlu di-reindex</>
          }
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        {docFiles.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {docFiles.map(fname => {
              const fileStatus = report?.files?.[fname];
              return (
                <div key={fname} className="flex items-center gap-3 px-3 py-2.5 rounded-xl th-bg-elevated border th-border">
                  <FileText size={14} className="th-text-muted shrink-0" />
                  <span className="flex-1 text-xs th-text truncate" title={fname}>{fname}</span>
                  {fileStatus && (() => {
                    const allOk = Object.values(fileStatus.models).every(m => m.status === "ok");
                    return (
                      <span className={clsx("text-[10px] font-medium shrink-0", allOk ? "text-emerald-400" : "text-amber-400")}>
                        {allOk ? "OK" : "Stale"}
                      </span>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-3 th-text-muted">
            <FileText size={28} className="opacity-30" />
            <p className="text-sm">Belum ada dokumen</p>
            <button
              onClick={onUploadClick}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-500 transition-colors"
            >
              <Upload size={14} /> Upload Dokumen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-0.5 text-[10px] font-semibold th-text-muted uppercase tracking-wider">
      {icon} {label}
    </div>
  );
}

function NoteItem({
  note, active, indent, menuOpen, onSelect, onMenuToggle, onDelete, onTogglePin, t,
}: {
  note: NoteListItem;
  active: boolean;
  indent?: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenuToggle: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      onClick={onSelect}
      className={clsx(
        "group relative flex items-center gap-2 py-1 cursor-pointer transition-colors text-xs",
        indent ? "pl-7 pr-2" : "px-3",
        active ? "bg-brand-600/10 border-r-2 border-brand-500 th-text" : "th-text-2 hover:th-bg-elevated"
      )}
    >
      {note.pinned
        ? <Pin size={10} className="text-brand-400 shrink-0" />
        : <FileText size={10} className="th-text-muted shrink-0" />
      }
      <span className="flex-1 truncate">{note.title || t("notes.untitled")}</span>
      {note.kb_id && <span className="text-[9px] text-emerald-400 shrink-0">KB</span>}
      <div className="relative">
        <button
          onClick={e => { e.stopPropagation(); onMenuToggle(); }}
          className="p-0.5 opacity-0 group-hover:opacity-100 rounded th-text-muted hover:th-text transition"
        >
          <MoreHorizontal size={11} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 card p-1 flex flex-col gap-0.5 min-w-[130px]">
            <button
              onClick={e => { e.stopPropagation(); onTogglePin(); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs th-text hover:th-bg-elevated"
            >
              <Pin size={10} /> {note.pinned ? t("notes.unpin") : t("notes.pin")}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-400/10"
            >
              <Trash2 size={10} /> {t("common.delete")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyEditor({ onNew, t }: { onNew: () => void; t: ReturnType<typeof useT> }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 th-text-muted">
      <div className="w-14 h-14 rounded-2xl th-bg-elevated border th-border flex items-center justify-center">
        <NotebookPen size={22} className="opacity-40" />
      </div>
      <p className="text-sm font-medium th-text">{t("notes.empty")}</p>
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-500 transition-colors"
      >
        <Plus size={14} /> {t("notes.newNote")}
      </button>
    </div>
  );
}
