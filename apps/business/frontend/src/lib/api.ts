const BASE_URL = "http://localhost:8001/api";

export async function getSettings() {
  const res = await fetch(`${BASE_URL}/settings`);
  return res.json();
}

export async function saveSettings(settings: unknown) {
  const res = await fetch(`${BASE_URL}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getLocalModels(type: "chat" | "embed" | "reranker" = "chat") {
  const res = await fetch(`${BASE_URL}/models/local?model_type=${type}`);
  return res.json();
}

export async function getLocalDeps(): Promise<{ llama_cpp: boolean; sentence_transformers: boolean }> {
  const res = await fetch(`${BASE_URL}/models/local/deps`);
  return res.json();
}

export interface ConnectionStatus {
  chat: { ok: boolean; error: string };
  embed: { ok: boolean; error: string };
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${BASE_URL}/settings/status`);
  return res.json();
}

export async function testChatConnection(config: unknown): Promise<{ ok: boolean; response?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/settings/test/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function testEmbedConnection(config: unknown): Promise<{ ok: boolean; dimensions?: number; error?: string }> {
  const res = await fetch(`${BASE_URL}/settings/test/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function testRerankerConnection(config: unknown): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/settings/test/reranker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function testDatabaseConnection(config: unknown): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${BASE_URL}/settings/test/database`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function saveDatabaseConfig(config: unknown): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${BASE_URL}/settings/database`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function deleteLocalModel(filename: string, modelType: "chat" | "embed" | "reranker"): Promise<{ deleted?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/models`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, model_type: modelType }),
  });
  return res.json();
}

// ── Ollama ────────────────────────────────────────────────────────────────────

export interface OllamaModel {
  name: string;
  size_mb: number;
  family: string;
  parameter_size: string;
}

export async function getOllamaModels(endpoint = "http://localhost:11434"): Promise<{ models: OllamaModel[]; connected: boolean; error?: string }> {
  const res = await fetch(`${BASE_URL}/models/ollama/tags?endpoint=${encodeURIComponent(endpoint)}`);
  if (!res.ok) return { models: [], connected: false, error: "Request failed" };
  return res.json();
}

export function streamOllamaPull(
  modelName: string,
  endpoint = "http://localhost:11434",
  onEvent: (e: { status: string; progress: number; total_mb?: number; downloaded_mb?: number; message?: string }) => void,
  abortController?: AbortController,
) {
  fetch(`${BASE_URL}/models/ollama/pull/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, endpoint }),
    signal: abortController?.signal,
  }).then(async (res) => {
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          try { onEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
        }
      }
    }
  }).catch(() => {});
}

export async function deleteOllamaModel(modelName: string, endpoint = "http://localhost:11434"): Promise<{ deleted?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/models/ollama/${encodeURIComponent(modelName)}?endpoint=${encodeURIComponent(endpoint)}`, { method: "DELETE" });
  return res.json();
}

export async function getHFFiles(repoId: string, modelType: "chat" | "embed" | "reranker" = "chat", signal?: AbortSignal) {
  const res = await fetch(
    `${BASE_URL}/models/huggingface/files?repo_id=${encodeURIComponent(repoId)}&model_type=${modelType}`,
    { signal }
  );
  try {
    return await res.json();
  } catch {
    return { error: `Server mengembalikan respons tidak valid (HTTP ${res.status})` };
  }
}

export async function getKnowledgeBases() {
  const res = await fetch(`${BASE_URL}/knowledge`);
  return res.json();
}

export async function getKbConsistency(kbId: string) {
  const res = await fetch(`${BASE_URL}/knowledge/${kbId}/consistency`);
  return res.json();
}

export async function uploadDocument(kbId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/knowledge/${kbId}/upload`, {
    method: "POST",
    body: form,
  });
  return res.json();
}

export async function deleteKnowledgeBase(kbId: string) {
  const res = await fetch(`${BASE_URL}/knowledge/${kbId}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function getReindexPlan(modelName: string) {
  const res = await fetch(`${BASE_URL}/knowledge/reindex/plan?model_name=${encodeURIComponent(modelName)}`);
  return res.json();
}

export function streamReindex(
  modelName: string,
  onProgress: (e: { type: string; kb_id?: string; filename?: string; percent?: number; done?: number; total?: number }) => void,
  onDone: () => void,
): void {
  fetch(`${BASE_URL}/knowledge/reindex/run?model_name=${encodeURIComponent(modelName)}`, { method: "POST" })
    .then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const e = JSON.parse(line.slice(6));
            if (e.type === "done") onDone();
            else onProgress(e);
          } catch {}
        }
      }
      onDone();
    })
    .catch(() => {});
}

export function streamChat(
  messages: { role: string; content: string }[],
  kbId: string | null,
  sessionId: string,
  onToken: (token: string) => void,
  onCitations: (citations: import("@/types").Citation[]) => void,
  onMetrics: (m: { input_tokens: number; output_tokens: number; latency_ms: number }) => void,
  onDone: (convId?: string) => void,
  convId?: string | null,
  onConvCreated?: (convId: string, title: string) => void,
  chatMode?: string,
  onError?: (message: string) => void,
  pocketId?: number | null,
  onAction?: (action: import("@/types").MessageAction) => void,
  onStatus?: (status: string) => void,
  onThinking?: (content: string) => void,
): () => void {
  const controller = new AbortController();

  fetch(`${BASE_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      kb_id: kbId,
      use_rag: !!kbId,
      session_id: sessionId,
      conv_id: convId ?? null,
      chat_mode: chatMode ?? "rag",
      pocket_id: pocketId ?? null,
    }),
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "token") onToken(event.content);
          if (event.type === "citations") onCitations(event.citations);
          if (event.type === "metrics") onMetrics(event);
          if (event.type === "conv_created") onConvCreated?.(event.conv_id, event.title);
          if (event.type === "done") onDone(event.conv_id);
          if (event.type === "error") { onError?.(event.message); onDone(); }
          if (event.type === "action") onAction?.({ action: event.action, label: event.label, detail: event.detail });
          if (event.type === "status") onStatus?.(event.status);
          if (event.type === "thinking") onThinking?.(event.content);
        } catch {}
      }
    }
    onDone();
  }).catch(() => {});

  return () => controller.abort();
}

// ── Lock API ───────────────────────────────────────────────────────────────────

export async function lockConversation(convId: string, locked: boolean): Promise<void> {
  await fetch(`${BASE_URL}/conversations/${convId}/lock`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locked }),
  });
}

export async function lockKnowledgeBase(kbId: string, locked: boolean): Promise<{ ok?: boolean; detail?: string }> {
  const res = await fetch(`${BASE_URL}/knowledge/${kbId}/lock`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locked }),
  });
  return res.json();
}

// ── Conversation API ───────────────────────────────────────────────────────────

export async function listConversations(q?: string, chatMode?: string, pocketId?: number | null, kbId?: string | null, excludeMode?: string): Promise<import("@/types").Conversation[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (chatMode) params.set("chat_mode", chatMode);
  if (pocketId != null) params.set("pocket_id", String(pocketId));
  if (kbId) params.set("kb_id", kbId);
  if (excludeMode) params.set("exclude_mode", excludeMode);
  const qs = params.toString();
  const res = await fetch(`${BASE_URL}/conversations${qs ? "?" + qs : ""}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.conversations ?? []);
}

export async function getConversation(convId: string): Promise<import("@/types").ConversationDetail> {
  const res = await fetch(`${BASE_URL}/conversations/${convId}`);
  return res.json();
}

export async function pinConversation(convId: string, pinned: boolean): Promise<void> {
  await fetch(`${BASE_URL}/conversations/${convId}/pin`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
}

export async function deleteConversation(convId: string): Promise<void> {
  await fetch(`${BASE_URL}/conversations/${convId}`, { method: "DELETE" });
}

export async function setConversationPersona(convId: string, personaPrompt: string | null): Promise<void> {
  await fetch(`${BASE_URL}/conversations/${convId}/persona`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persona_prompt: personaPrompt || null }),
  });
}

export async function deleteAllConversations(chatMode?: string, kbId?: string, excludeMode?: string): Promise<void> {
  const params = new URLSearchParams();
  if (chatMode) params.set("chat_mode", chatMode);
  if (kbId) params.set("kb_id", kbId);
  if (excludeMode) params.set("exclude_mode", excludeMode);
  const qs = params.toString();
  await fetch(`${BASE_URL}/conversations${qs ? "?" + qs : ""}`, { method: "DELETE" });
}

export async function summarizeConversation(convId: string, messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conv_id: convId, messages }),
  });
  const data = await res.json();
  return data.summary ?? "";
}

export async function getSessionMetrics(sessionId: string) {
  const res = await fetch(`${BASE_URL}/metrics/session/${sessionId}`);
  return res.json();
}

export async function getPeriodMetrics(period: "day" | "week" | "month") {
  const res = await fetch(`${BASE_URL}/metrics/period/${period}`);
  return res.json();
}

export async function getKbMetrics() {
  const res = await fetch(`${BASE_URL}/metrics/kb`);
  return res.json();
}

export interface ContextSummary {
  finance: { total_income: number; total_expense: number; net: number; total_balance: number; tx_count: number } | null;
  inventory: { total_asset_value: number; low_stock_count: number; hpp_this_month: number } | null;
}

export async function getContextSummary(): Promise<ContextSummary> {
  const res = await fetch(`${BASE_URL}/chat/context-summary`);
  return res.json();
}

export function streamModelDownload(
  repoId: string,
  filename: string,
  modelType: string,
  onProgress: (data: {
    progress: number;
    status: string;
    message: string;
    downloaded_mb?: number;
    total_mb?: number;
    filename?: string;
  }) => void,
  controller?: AbortController,
): void {
  fetch(`${BASE_URL}/models/download/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_id: repoId, filename, model_type: modelType }),
    signal: controller?.signal,
  }).then(async (res) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          onProgress(event);
        } catch {}
      }
    }
  }).catch(() => {});
}
