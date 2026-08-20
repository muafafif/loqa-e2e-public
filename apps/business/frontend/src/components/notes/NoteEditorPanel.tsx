"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Eye, Pencil, Sparkles, Loader2, Pin,
  MessageSquare, Wand2,
} from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/lib/i18n";
import { getNote, updateNote, streamNoteAi } from "@/lib/notesApi";
import { BacklinkPanel } from "./BacklinkPanel";
import type { Note } from "@/types";

interface Props {
  noteId: number;
  onSelectNote: (id: number) => void;
  onTitleChange?: (id: number, title: string) => void;
}

type ViewMode = "edit" | "preview";
type AiAction = "summarize" | "continue" | "ask";

export function NoteEditorPanel({ noteId, onSelectNote, onTitleChange }: Props) {
  const t = useT();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<ViewMode>("edit");
  const [dirty, setDirty] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAction, setAiAction] = useState<AiAction | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNote(null);
    setAiOpen(false);
    setAiResult("");
    setAiError(null);
    setAiStatus(null);
    setAiAction(null);
    getNote(noteId).then(n => {
      setNote(n);
      setTitle(n.title);
      setContent(n.content);
      setDirty(false);
    }).catch(() => {});
  }, [noteId]);

  const save = useCallback(async (t: string, c: string) => {
    await updateNote(noteId, { title: t, content: c });
    setDirty(false);
    onTitleChange?.(noteId, t);
  }, [noteId, onTitleChange]);

  const scheduleAutoSave = useCallback((tl: string, c: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(tl, c), 1200);
  }, [save]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setDirty(true);
    scheduleAutoSave(val, content);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    setDirty(true);
    scheduleAutoSave(title, val);
  };

  const handleTogglePin = async () => {
    if (!note) return;
    const updated = await updateNote(noteId, { pinned: !note.pinned });
    setNote(updated);
  };

  const handleRunAi = async (action: AiAction, questionOverride?: string) => {
    setAiAction(action);
    setAiResult("");
    setAiError(null);
    setAiStatus(null);
    if (aiAbort.current) aiAbort.current.abort();
    aiAbort.current = new AbortController();
    const ctrl = aiAbort.current;
    setAiLoading(true);
    try {
      // Flush any pending autosave so backend reads current content
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (dirty) await save(title, content);
      const textarea = textareaRef.current;
      const sel =
        textarea && textarea.selectionStart !== textarea.selectionEnd
          ? content.slice(textarea.selectionStart, textarea.selectionEnd)
          : undefined;
      await streamNoteAi(
        noteId,
        action,
        { prompt: action === "ask" ? (questionOverride ?? aiQuestion) : undefined, selection: sel },
        text => { setAiStatus(null); setAiResult(prev => prev + text); },
        ctrl.signal,
        (status) => {
          if (status === "indexing") setAiStatus("Mengindeks catatan ke memori…");
        },
      );
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      setAiError(msg.includes("Failed to fetch") ? "Tidak bisa terhubung ke server. Pastikan backend berjalan." : msg);
    } finally {
      if (!ctrl.signal.aborted) setAiLoading(false);
    }
  };

  const handleInsertResult = () => {
    if (!aiResult) return;
    const newContent = content + (content.endsWith("\n") ? "" : "\n") + "\n" + aiResult;
    setContent(newContent);
    setDirty(true);
    scheduleAutoSave(title, newContent);
    setAiResult("");
    setAiAction(null);
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const isLong = content.length > 6000;

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin th-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b th-border glass-surface flex items-center gap-3 shrink-0 flex-wrap">
        <input
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder={t("notes.untitled")}
          className="flex-1 min-w-0 bg-transparent outline-none text-base font-semibold th-text placeholder:th-text-muted"
        />

        <span
          className={clsx("text-[11px] tabular-nums shrink-0", isLong ? "text-amber-400" : "th-text-muted")}
          title={isLong ? "Catatan panjang — AI akan menggunakan indeks semantik untuk menjawab" : undefined}
        >
          {wordCount} {t("notes.wordCount")}
          {isLong && " · indeks"}
        </span>

        {dirty && <span className="text-[11px] th-text-muted shrink-0">•</span>}

        <button
          onClick={handleTogglePin}
          className={clsx(
            "p-1.5 rounded-lg transition-colors shrink-0",
            note.pinned ? "text-brand-400 bg-brand-600/10" : "th-text-muted hover:th-text hover:th-bg-elevated"
          )}
          title={note.pinned ? t("notes.unpin") : t("notes.pin")}
        >
          <Pin size={14} />
        </button>

        {/* AI toggle */}
        <button
          onClick={() => setAiOpen(v => !v)}
          className={clsx(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0",
            aiOpen ? "bg-brand-600 text-white" : "btn-brand th-text-2 hover:th-text th-bg-elevated border th-border"
          )}
        >
          <Sparkles size={12} />
          AI
        </button>

        {/* View mode toggle */}
        <div className="flex rounded-xl overflow-hidden border th-border th-bg-elevated shrink-0">
          {(["edit", "preview"] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                "btn-brand px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 flex items-center gap-1",
                mode === m ? "bg-brand-600 text-white" : "th-text-2 hover:th-text"
              )}
            >
              {m === "edit" ? <><Pencil size={11} />{t("notes.edit")}</> : <><Eye size={11} />{t("notes.preview")}</>}
            </button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {mode === "edit" ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              placeholder={"Start writing… (Markdown supported, [[wikilink]] for backlinks)"}
              className="flex-1 resize-none bg-transparent outline-none p-6 text-sm th-text leading-relaxed font-mono scrollbar-thin"
              spellCheck={false}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              <MarkdownPreview content={content} onWikiLink={() => {}} />
            </div>
          )}

          {/* AI Panel */}
          {aiOpen && (
            <div className="border-t th-border glass-surface flex flex-col shrink-0" style={{ maxHeight: "40%" }}>
              {/* Action buttons row — selalu terlihat */}
              <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap shrink-0 border-b th-border">
                <Sparkles size={13} className="text-brand-400 shrink-0" />
                <span className="text-xs font-semibold th-text">AI Assistant</span>
                <div className="flex items-center gap-1 ml-auto flex-wrap">
                  {(["summarize", "continue", "ask"] as AiAction[]).map(a => (
                    <button
                      key={a}
                      onClick={() => { setAiError(null); setAiResult(""); if (a !== "ask") handleRunAi(a); else setAiAction("ask"); }}
                      disabled={aiLoading}
                      className={clsx(
                        "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50",
                        aiAction === a ? "bg-brand-600 text-white" : "th-bg-elevated th-text-2 hover:th-text border th-border"
                      )}
                    >
                      {a === "summarize" ? t("notes.ai.summarize")
                        : a === "continue" ? t("notes.ai.continue")
                        : t("notes.ai.ask")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ask input */}
              {aiAction === "ask" && (
                <div className="px-4 py-2 flex gap-2 shrink-0 border-b th-border">
                  <input
                    autoFocus
                    value={aiQuestion}
                    onChange={e => setAiQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && aiQuestion.trim()) handleRunAi("ask", aiQuestion); }}
                    placeholder={t("notes.ai.askPlaceholder")}
                    className="input-field flex-1 text-xs py-1.5"
                  />
                  <button
                    onClick={() => handleRunAi("ask", aiQuestion)}
                    disabled={aiLoading || !aiQuestion.trim()}
                    className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors hover:bg-brand-500"
                  >
                    {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                  </button>
                </div>
              )}

              {/* Error */}
              {aiError && (
                <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 shrink-0">
                  {aiError}
                </div>
              )}

              {/* Result area — scrollable, mengisi sisa ruang */}
              {(aiLoading || aiResult) && (
                <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 text-xs th-text leading-relaxed whitespace-pre-wrap min-h-0">
                  {aiLoading && !aiResult && (
                    <span className="th-text-muted flex items-center gap-1.5">
                      <Loader2 size={11} className="animate-spin" />
                      {aiStatus ?? t("notes.ai.generating")}
                    </span>
                  )}
                  {aiResult}
                </div>
              )}

              {/* Insert button — selalu di bawah, tidak tertimpa result */}
              {aiResult && !aiLoading && (
                <div className="px-4 py-2 border-t th-border shrink-0">
                  <button
                    onClick={handleInsertResult}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 transition-colors"
                  >
                    <Wand2 size={12} /> Insert into note
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Backlinks sidebar */}
        <div className="w-44 shrink-0 border-l th-border overflow-y-auto scrollbar-thin">
          <BacklinkPanel noteId={noteId} onSelectNote={onSelectNote} />
        </div>
      </div>
    </div>
  );
}

// ─── Markdown Preview ─────────────────────────────────────────────────────────

function MarkdownPreview({ content, onWikiLink }: { content: string; onWikiLink: (title: string) => void }) {
  const lines = content.split("\n");
  const rendered: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      rendered.push(
        <pre key={`code-${i}`} className="card p-4 overflow-x-auto my-3">
          <code className="text-xs font-mono th-text">{codeLines.join("\n")}</code>
        </pre>
      );
      i++; continue;
    }

    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const sizes = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-xs"];
      const weights = ["font-bold", "font-bold", "font-semibold", "font-semibold", "font-medium", "font-medium"];
      rendered.push(
        <div key={`h-${i}`} className={`${sizes[level - 1]} ${weights[level - 1]} th-text mt-4 mb-1`}>
          {renderInlineWiki(hMatch[2], onWikiLink)}
        </div>
      );
      i++; continue;
    }

    if (/^-{3,}$|^\*{3,}$/.test(line.trim())) {
      rendered.push(<hr key={`hr-${i}`} className="border-t th-border my-4" />);
      i++; continue;
    }

    if (line.startsWith("> ")) {
      rendered.push(
        <blockquote key={`bq-${i}`} className="border-l-2 border-brand-500/60 pl-3 my-2 th-text-muted italic text-sm">
          {renderInlineWiki(line.slice(2), onWikiLink)}
        </blockquote>
      );
      i++; continue;
    }

    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
      rendered.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 my-2 flex flex-col gap-0.5">
          {items.map((item, j) => <li key={j} className="text-sm th-text">{renderInlineWiki(item, onWikiLink)}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
      rendered.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 my-2 flex flex-col gap-0.5">
          {items.map((item, j) => <li key={j} className="text-sm th-text">{renderInlineWiki(item, onWikiLink)}</li>)}
        </ol>
      );
      continue;
    }

    if (line.trim() === "") { rendered.push(<div key={`br-${i}`} className="h-2" />); i++; continue; }

    rendered.push(
      <p key={`p-${i}`} className="text-sm th-text leading-relaxed my-1">
        {renderInlineWiki(line, onWikiLink)}
      </p>
    );
    i++;
  }

  return <div className="max-w-2xl">{rendered}</div>;
}

function renderInlineWiki(text: string, onWikiLink: (title: string) => void): React.ReactNode[] {
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[\[([^\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^\)]+)\))/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={m.index}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={m.index}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      nodes.push(<code key={m.index} className="px-1.5 py-0.5 rounded text-xs bg-black/30 font-mono">{m[4]}</code>);
    } else if (m[5] !== undefined) {
      const wl = m[5];
      nodes.push(
        <button key={m.index} onClick={() => onWikiLink(wl)}
          className="text-brand-400 underline underline-offset-2 hover:text-brand-300 transition-colors">
          {wl}
        </button>
      );
    } else if (m[6] !== undefined && m[7] !== undefined) {
      nodes.push(
        <a key={m.index} href={m[7]} target="_blank" rel="noopener noreferrer"
          className="text-brand-400 underline underline-offset-2 hover:text-brand-300 transition-colors">
          {m[6]}
        </a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

