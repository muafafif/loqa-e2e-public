import type { NoteFolder, NoteListItem, Note, NoteBacklink, NoteSearchResult, NoteGraphData } from "@/types";

const BASE = "http://localhost:8001/api/notes";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Folders ─────────────────────────────────────────────────────────────────

export const listFolders = (): Promise<NoteFolder[]> => req("/folders");

export const createFolder = (data: {
  name: string; color?: string; icon?: string; parent_id?: number | null; sort_order?: number;
}): Promise<NoteFolder> => req("/folders", { method: "POST", body: JSON.stringify(data) });

export const updateFolder = (id: number, data: Partial<NoteFolder>): Promise<NoteFolder> =>
  req(`/folders/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteFolder = (id: number): Promise<void> =>
  req(`/folders/${id}`, { method: "DELETE" });

// ─── Notes ───────────────────────────────────────────────────────────────────

export const listNotes = (folderId?: number): Promise<NoteListItem[]> =>
  req(folderId != null ? `?folder_id=${folderId}` : "");

export const getNote = (id: number): Promise<Note> => req(`/${id}`);

export const createNote = (data: {
  title?: string; content?: string; folder_id?: number | null;
}): Promise<Note> => req("", { method: "POST", body: JSON.stringify(data) });

export const updateNote = (id: number, data: {
  title?: string; content?: string; folder_id?: number | null; pinned?: boolean;
}): Promise<Note> => req(`/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteNote = (id: number): Promise<void> =>
  req(`/${id}`, { method: "DELETE" });

export const getBacklinks = (id: number): Promise<NoteBacklink[]> =>
  req(`/${id}/backlinks`);

// ─── Search & Graph ──────────────────────────────────────────────────────────

export const searchNotes = (q: string, limit = 30): Promise<NoteSearchResult[]> =>
  req(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);

export const getNoteGraph = (): Promise<NoteGraphData> => req("/graph");

// ─── KB Index ────────────────────────────────────────────────────────────────

export const indexNote = (id: number, kbId: string): Promise<{ status: string; kb_id: string }> =>
  req(`/${id}/index`, { method: "POST", body: JSON.stringify({ kb_id: kbId }) });

export const deindexNote = (id: number): Promise<{ status: string }> =>
  req(`/${id}/index`, { method: "DELETE" });

// ─── AI Streaming ────────────────────────────────────────────────────────────

export async function streamNoteAi(
  noteId: number,
  action: "summarize" | "continue" | "ask",
  opts: { prompt?: string; selection?: string },
  onToken: (text: string) => void,
  signal?: AbortSignal,
  onStatus?: (status: string) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/${noteId}/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...opts }),
    signal,
  });
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const ev = JSON.parse(raw);
        if (ev.type === "token") onToken(ev.text);
        else if (ev.type === "status") onStatus?.(ev.text);
      } catch { /* skip */ }
    }
  }
}
