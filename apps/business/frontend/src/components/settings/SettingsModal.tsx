"use client";

import { useState, useEffect, useRef } from "react";
import {
  getSettings, saveSettings, getLocalModels, getHFFiles,
  streamModelDownload, testChatConnection, testEmbedConnection, testRerankerConnection,
  testDatabaseConnection, saveDatabaseConfig,
  deleteLocalModel, getOllamaModels, streamOllamaPull, deleteOllamaModel,
  type OllamaModel,
} from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { useConnection } from "@/lib/ConnectionContext";
import { useLock } from "@/lib/LockContext";
import { LockSetupModal } from "@/components/lock/LockSetupModal";
import { useT, useLocale, type Locale } from "@/lib/i18n";
import { Tooltip } from "@/components/ui/Tooltip";
import { AppSettings, LocalModel, HFFile, ThemeConfig, RerankerConfig, ChunkingConfig, DatabaseConfig } from "@/types";
import {
  X, Download, RefreshCw, Check, Zap, AlertCircle, Loader,
  Sun, Moon, Sliders, Trash2, Lock, LockOpen, Shield, Timer,
  MessageSquare, Database, FileText, HardDrive, Palette, Globe,
} from "lucide-react";
import { clsx } from "clsx";

export type SavedContext = "chat" | "embed" | "reranker" | "database";

interface Props {
  onClose: () => void;
  initialTab?: Tab;
  onSaved?: (ctx: SavedContext[]) => void;
}

type Tab = "chat" | "embed" | "ingestion" | "models" | "appearance" | "security" | "language" | "database";
type ModelManagerTab = "chat" | "embed" | "reranker";
type TestState = "idle" | "loading" | "ok" | "error";
interface TestResult { state: TestState; message: string; }

const DEFAULT_RERANKER: RerankerConfig = {
  enabled: false,
  provider: "local",
  model_name: "",
  api_key: "",
  top_k: 5,
  initial_fetch: 20,
};

const DEFAULT_CHUNKING: ChunkingConfig = {
  strategy: "word",
  chunk_size: 500,
  overlap: 50,
  min_chunk_size: 50,
};

const DEFAULT_DATABASE: DatabaseConfig = {
  enabled: false,
  host: "localhost",
  port: 5432,
  dbname: "",
  user: "",
  password: "",
};

const DEFAULT_SETTINGS: AppSettings = {
  chat: {
    provider: "local",
    model_name: "",
    endpoint: undefined,
    temperature: 0.7,
    max_tokens: 2048,
    system_prompt: "You are a helpful assistant that answers questions based on the provided documents.",
  },
  embed: { provider: "local", model_name: "nomic-ai/nomic-embed-text-v1" },
  reranker: DEFAULT_RERANKER,
  reindex_thresholds: { tier1_mb: 50, tier2_mb: 200 },
  theme: { mode: "dark", accent: "#0284c7" },
  chunking: DEFAULT_CHUNKING,
  database: DEFAULT_DATABASE,
};

export function SettingsModal({ onClose, initialTab, onSaved }: Props) {
  const { theme, setTheme } = useTheme();
  const { recheckReranker } = useConnection();
  const t = useT();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>(initialTab ?? "chat");
  const [localChatModels, setLocalChatModels] = useState<LocalModel[]>([]);
  const [localEmbedModels, setLocalEmbedModels] = useState<LocalModel[]>([]);
  const [localRerankerModels, setLocalRerankerModels] = useState<LocalModel[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [showOllamaSetup, setShowOllamaSetup] = useState(false);
  const [showBuiltInSetup, setShowBuiltInSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [chatTest, setChatTest] = useState<TestResult>({ state: "idle", message: "" });
  const [embedTest, setEmbedTest] = useState<TestResult>({ state: "idle", message: "" });
  const [rerankerTest, setRerankerTest] = useState<TestResult>({ state: "idle", message: "" });
  const [dbTest, setDbTest] = useState<TestResult>({ state: "idle", message: "" });
  const [dbSave, setDbSave] = useState<TestResult>({ state: "idle", message: "" });
  const [accentInput, setAccentInput] = useState(theme.accent);
  // Snapshot theme at open time — restored on close-without-save
  const originalThemeRef = useRef<ThemeConfig>(theme);
  const themeSavedRef = useRef(false);
  // Model Manager state lifted here so it survives tab switches
  const [mmTabs, setMmTabs] = useState<Record<ModelManagerTab, TabState>>({
    chat:     { ...EMPTY_TAB },
    embed:    { ...EMPTY_TAB },
    reranker: { ...EMPTY_TAB },
  });
  const mmAbortRefs = useRef<Record<string, AbortController>>({});
  const lastSavedRef = useRef<AppSettings | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      const merged: AppSettings = { ...DEFAULT_SETTINGS, ...s };
      setSettings(merged);
      lastSavedRef.current = merged;
      if (merged.theme) setAccentInput(merged.theme.accent);
    }).catch(() => {});
    refreshLocalModels();
  }, []);

  const refreshLocalModels = () => {
    getLocalModels("chat").then((d) => setLocalChatModels(d.models ?? [])).catch(() => {});
    getLocalModels("embed").then((d) => setLocalEmbedModels(d.models ?? [])).catch(() => {});
    getLocalModels("reranker").then((d) => setLocalRerankerModels(d.models ?? [])).catch(() => {});
  };

  const refreshOllamaModels = (endpoint?: string) => {
    const ep = endpoint ?? settings.chat.endpoint ?? "http://localhost:11434";
    const base = ep.replace(/\/v1\/?$/, "");
    getOllamaModels(base).then((d) => {
      setOllamaConnected(d.connected);
      setOllamaModels(d.models);
    }).catch(() => { setOllamaConnected(false); setOllamaModels([]); });
  };

  // Refresh Ollama list whenever provider switches to ollama
  useEffect(() => {
    if (settings.chat.provider === "ollama") refreshOllamaModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.chat.provider]);

  const handleSave = async () => {
    setSaving(true);
    // Detect what changed before saving
    const prev = lastSavedRef.current;
    const changed: SavedContext[] = [];
    if (!prev ||
        prev.chat.provider !== settings.chat.provider ||
        prev.chat.model_name !== settings.chat.model_name ||
        prev.chat.endpoint !== settings.chat.endpoint) {
      changed.push("chat");
    }
    if (!prev ||
        prev.embed.provider !== settings.embed.provider ||
        prev.embed.model_name !== settings.embed.model_name) {
      changed.push("embed");
    }
    if (!prev ||
        JSON.stringify(prev.reranker) !== JSON.stringify(settings.reranker)) {
      changed.push("reranker");
    }
    await saveSettings(settings);
    lastSavedRef.current = settings;
    themeSavedRef.current = true;
    originalThemeRef.current = settings.theme ?? originalThemeRef.current;
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    recheckReranker();
    if (changed.length > 0) onSaved?.(changed);
  };

  const handleTestChat = async () => {
    setChatTest({ state: "loading", message: "" });
    const r = await testChatConnection(settings.chat);
    setChatTest(r.ok
      ? { state: "ok", message: r.response ?? "Connection successful" }
      : { state: "error", message: r.error ?? "Unknown error" });
  };

  const handleTestEmbed = async () => {
    setEmbedTest({ state: "loading", message: "" });
    const r = await testEmbedConnection(settings.embed);
    setEmbedTest(r.ok
      ? { state: "ok", message: `OK · ${r.dimensions} dimensions` }
      : { state: "error", message: r.error ?? "Unknown error" });
  };

  const handleTestReranker = async () => {
    setRerankerTest({ state: "loading", message: "" });
    const r = await testRerankerConnection(settings.reranker ?? DEFAULT_RERANKER);
    setRerankerTest(r.ok
      ? { state: "ok", message: r.message ?? "Reranker ready" }
      : { state: "error", message: r.error ?? "Unknown error" });
    // Update global reranker status so banner updates immediately
    recheckReranker();
  };

  const handleClose = () => {
    if (!themeSavedRef.current) {
      // Rollback live theme preview to what it was when modal opened
      setTheme(originalThemeRef.current);
    }
    onClose();
  };

  const applyThemeChange = (t: ThemeConfig) => {
    setTheme(t);
    setSettings((s) => ({ ...s, theme: t }));
  };

  const builtInChatReady = localChatModels.filter(m => !m.partial).length > 0;
  const builtInEmbedReady = localEmbedModels.length > 0;
  const builtInRerankerReady = localRerankerModels.length > 0;

  const reranker = settings.reranker ?? DEFAULT_RERANKER;
  const setReranker = (r: Partial<RerankerConfig>) =>
    setSettings((s) => ({ ...s, reranker: { ...(s.reranker ?? DEFAULT_RERANKER), ...r } }));

  const chunking = settings.chunking ?? DEFAULT_CHUNKING;
  const setChunking = (c: Partial<ChunkingConfig>) =>
    setSettings((s) => ({ ...s, chunking: { ...(s.chunking ?? DEFAULT_CHUNKING), ...c } }));

  const database = settings.database ?? DEFAULT_DATABASE;
  const setDatabase = (d: Partial<DatabaseConfig>) =>
    setSettings((s) => ({ ...s, database: { ...(s.database ?? DEFAULT_DATABASE), ...d } }));

  const handleTestDatabase = async () => {
    setDbTest({ state: "loading", message: "" });
    const r = await testDatabaseConnection(database);
    setDbTest(r.ok
      ? { state: "ok", message: r.message ?? "Koneksi berhasil" }
      : { state: "error", message: r.message ?? "Koneksi gagal" });
  };

  const handleSaveDatabase = async () => {
    setDbSave({ state: "loading", message: "" });
    const r = await saveDatabaseConfig(database);
    setDbSave(r.ok
      ? { state: "ok", message: r.message ?? "Tersimpan" }
      : { state: "error", message: r.message ?? "Gagal menyimpan" });
    if (r.ok) {
      setTimeout(() => setDbSave({ state: "idle", message: "" }), 3000);
      onSaved?.(["database"]);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: "chat",       label: t("settings.tabChat"),       icon: <MessageSquare size={15} />, desc: "Model & koneksi AI" },
    { id: "embed",      label: t("settings.tabEmbed"),      icon: <Database size={15} />,      desc: "Embedding & reranker" },
    { id: "ingestion",  label: t("settings.tabIngestion"),  icon: <FileText size={15} />,      desc: "Cara memotong dokumen" },
    { id: "models",     label: t("settings.tabModels"),     icon: <HardDrive size={15} />,     desc: "Kelola model lokal" },
    { id: "database",   label: "Database",                  icon: <Database size={15} />,      desc: "SQLite atau PostgreSQL" },
    { id: "appearance", label: t("settings.tabAppearance"), icon: <Palette size={15} />,       desc: "Tema & warna aksen" },
    { id: "language",   label: t("settings.tabLanguage"),   icon: <Globe size={15} />,         desc: "Bahasa tampilan" },
    { id: "security",   label: t("settings.tabSecurity"),   icon: <Shield size={15} />,        desc: "PIN & auto-lock" },
  ];

  const activeTab = TABS.find(t => t.id === tab)!;


  return (
    <>
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="th-bg-surface border th-border rounded-2xl w-full max-w-4xl max-h-[88vh] flex overflow-hidden shadow-2xl">

        {/* ── Left sidebar nav ── */}
        <div className="w-52 shrink-0 border-r th-border flex flex-col th-bg-base">
          {/* Logo area */}
          <div className="px-5 py-5 border-b th-border">
            <p className="text-sm font-bold th-text">Setelan</p>
            <p className="text-[11px] th-text-muted mt-0.5">LOQA Work</p>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-2">
            {TABS.map((t) => {
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    tab === t.id
                      ? "bg-brand-600/15 text-brand-400 border-r-2 border-brand-500"
                      : "th-text-muted hover:th-text hover:th-bg-elevated"
                  )}
                >
                  <span className={tab === t.id ? "text-brand-400" : "th-text-muted"}>{t.icon}</span>
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              );
            })}
          </nav>

        </div>

        {/* ── Right content area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Section header */}
          <div className="px-7 py-5 border-b th-border shrink-0 flex items-center gap-2.5">
            <span className="text-brand-400">{activeTab.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold th-text">{activeTab.label}</p>
              <p className="text-xs th-text-muted">{activeTab.desc}</p>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg th-text-muted hover:th-text hover:th-bg-elevated transition-colors"
              title="Tutup"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-7 py-6">

          {/* ── Chat Model ── */}
          {tab === "chat" && (
            <div className="flex flex-col gap-5">
              <Field
                label="Layanan AI"
                tooltip="Pilih dari mana AI Anda berasal. OpenAI & Gemini butuh internet dan berbayar. Ollama gratis dan jalan di komputer Anda sendiri."
              >
                <div className="flex flex-col gap-1.5">
                  <select
                    value={settings.chat.provider}
                    onChange={(e) => {
                      const p = e.target.value as AppSettings["chat"]["provider"];
                      const defaults: Partial<AppSettings["chat"]> =
                        p === "ollama" ? { endpoint: "http://localhost:11434/v1", model_name: "llama3.2" } :
                        p === "local" ? { endpoint: undefined, model_name: "" } :
                        p === "openai" ? { endpoint: undefined } : {};
                      if (p === "deepseek") {
                        defaults.endpoint = "https://api.deepseek.com";
                        defaults.model_name = "deepseek-v4-flash";
                      }
                      setSettings((s) => ({ ...s, chat: { ...s.chat, ...defaults, provider: p } }));
                      setChatTest({ state: "idle", message: "" });
                      if (p === "ollama") refreshOllamaModels(defaults.endpoint);
                    }}
                    className="input-field"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="openai_compatible">OpenAI-Compatible (LM Studio, dll)</option>
                    <option value="local">Local GGUF</option>
                  </select>
                  {settings.chat.provider === "ollama" && (
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-[11px] font-medium ${ollamaConnected === true ? "text-green-500" : ollamaConnected === false ? "text-red-400" : "th-text-muted"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ollamaConnected === true ? "bg-green-500" : ollamaConnected === false ? "bg-red-400" : "bg-gray-400"}`} />
                        {ollamaConnected === true ? "Ollama terdeteksi" : ollamaConnected === false ? "Ollama tidak ditemukan" : "Memeriksa…"}
                      </span>
                      <button type="button" onClick={() => setShowOllamaSetup(true)} className="text-[11px] text-brand-400 hover:text-brand-300 underline transition-colors">
                        Cara install Ollama
                      </button>
                      <button type="button" onClick={() => refreshOllamaModels()} className="text-[11px] th-text-muted hover:th-text transition-colors" title="Refresh koneksi Ollama">↺</button>
                    </div>
                  )}
                  {settings.chat.provider === "local" && (
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-[11px] font-medium ${builtInChatReady ? "text-green-500" : "text-amber-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${builtInChatReady ? "bg-green-500" : "bg-amber-400"}`} />
                        {builtInChatReady ? "Model tersedia" : "Belum ada model GGUF"}
                      </span>
                      <button type="button" onClick={() => setShowBuiltInSetup(true)} className="text-[11px] text-brand-400 hover:text-brand-300 underline transition-colors">
                        Cara setup Local
                      </button>
                    </div>
                  )}
                </div>
              </Field>

              <Field
                label="Nama Model"
                tooltip="Versi AI yang digunakan. Semakin baru biasanya semakin pintar, tapi membutuhkan lebih banyak memori."
              >
                {settings.chat.provider === "local" ? (
                  <select
                    value={settings.chat.model_name}
                    onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, model_name: e.target.value } }))}
                    className="input-field"
                  >
                    <option value="">-- Pilih model GGUF --</option>
                    {localChatModels.filter(m => !m.partial).map((m) => (
                      <option key={m.name} value={m.name}>{m.name} ({m.size_mb} MB)</option>
                    ))}
                  </select>
                ) : settings.chat.provider === "ollama" ? (
                  <div className="flex flex-col gap-1.5">
                    {ollamaConnected && ollamaModels.length > 0 ? (
                      <select
                        value={settings.chat.model_name}
                        onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, model_name: e.target.value } }))}
                        className="input-field"
                      >
                        <option value="">-- Pilih model Ollama --</option>
                        {ollamaModels.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name}{m.parameter_size ? ` (${m.parameter_size})` : ""}{m.size_mb ? ` · ${m.size_mb} MB` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={settings.chat.model_name}
                        onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, model_name: e.target.value } }))}
                        placeholder="llama3.2"
                        className="input-field"
                      />
                    )}
                    {ollamaConnected === false && (
                      <p className="text-[11px] text-amber-400">
                        Ollama belum berjalan. Install dan jalankan Ollama, lalu klik ↺ untuk refresh.
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    value={settings.chat.model_name}
                    onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, model_name: e.target.value } }))}
                    placeholder={settings.chat.provider === "gemini" ? "gemini-1.5-flash" : settings.chat.provider === "deepseek" ? "deepseek-v4-flash" : "gpt-4o-mini"}
                    className="input-field"
                  />
                )}
              </Field>

              {settings.chat.provider !== "local" && (
                <Field
                  label="Kunci Akses (API Key)"
                  tooltip="Seperti password untuk mengakses layanan AI. Didapat dari website OpenAI atau Gemini. Tidak pernah dikirim ke server manapun selain server AI yang Anda pilih."
                >
                  <input
                    type="password"
                    value={settings.chat.api_key ?? ""}
                    onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, api_key: e.target.value } }))}
                    placeholder="sk-..."
                    className="input-field"
                  />
                </Field>
              )}

              {(settings.chat.provider === "openai_compatible" || settings.chat.provider === "deepseek") && (
                <Field
                  label="Alamat Server"
                  tooltip="Diisi otomatis untuk OpenAI dan Gemini. Ubah hanya jika Anda menjalankan server AI sendiri (Ollama, LM Studio, dll)."
                >
                  <input
                    value={settings.chat.endpoint ?? ""}
                    onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, endpoint: e.target.value } }))}
                    placeholder={settings.chat.provider === "deepseek" ? "https://api.deepseek.com" : "http://localhost:1234/v1"}
                    className="input-field"
                  />
                </Field>
              )}

              <Field
                label={`Kreativitas Jawaban: ${settings.chat.temperature}`}
                tooltip="Rendah = jawaban lebih konsisten dan akurat. Tinggi = jawaban lebih bervariasi dan kreatif. Untuk tanya-jawab fakta, pilih rendah (0.1–0.5)."
              >
                <input type="range" min="0" max="2" step="0.1"
                  value={settings.chat.temperature}
                  onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, temperature: parseFloat(e.target.value) } }))}
                  className="w-full accent-brand-500"
                />
              </Field>

              <Field
                label="Batas Panjang Jawaban"
                tooltip="Jawaban AI akan dipotong jika melewati batas ini. Naikkan jika AI sering berhenti di tengah kalimat."
              >
                <input type="number" min="256" max="8192" step="256"
                  value={settings.chat.max_tokens}
                  onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, max_tokens: parseInt(e.target.value) } }))}
                  className="input-field"
                />
              </Field>

              <Field
                label="Instruksi Awal untuk AI"
                tooltip="Kalimat yang diam-diam dikirim ke AI sebelum setiap percakapan dimulai. Contoh: 'Selalu jawab dalam Bahasa Indonesia.'"
              >
                <textarea
                  value={settings.chat.system_prompt}
                  onChange={(e) => setSettings((s) => ({ ...s, chat: { ...s.chat, system_prompt: e.target.value } }))}
                  rows={4}
                  className="input-field resize-none"
                />
              </Field>

              <TestConnectionRow label="Tes Koneksi" state={chatTest.state} message={chatTest.message} onTest={handleTestChat} disabled={!settings.chat.model_name} />
            </div>
          )}

          {/* ── Embed Model ── */}
          {tab === "embed" && (
            <div className="flex flex-col gap-4">
              <Field
                label="Layanan"
                tooltip="Sama seperti model chat, tapi khusus untuk membaca dan memahami isi dokumen Anda."
              >
                <div className="flex flex-col gap-1.5">
                  <select
                    value={settings.embed.provider}
                    onChange={(e) => {
                      const p = e.target.value as AppSettings["embed"]["provider"];
                      const defaults: Partial<AppSettings["embed"]> =
                        p === "ollama" ? { endpoint: "http://localhost:11434/v1", model_name: "nomic-embed-text" } :
                        p === "local" ? { endpoint: undefined, model_name: "" } : {};
                      setSettings((s) => ({ ...s, embed: { ...s.embed, ...defaults, provider: p } }));
                      setEmbedTest({ state: "idle", message: "" });
                      if (p === "ollama") refreshOllamaModels();
                    }}
                    className="input-field"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="local">Local (sentence-transformers)</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                  </select>
                  {settings.embed.provider === "ollama" && (
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-[11px] font-medium ${ollamaConnected === true ? "text-green-500" : ollamaConnected === false ? "text-red-400" : "th-text-muted"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ollamaConnected === true ? "bg-green-500" : ollamaConnected === false ? "bg-red-400" : "bg-gray-400"}`} />
                        {ollamaConnected === true ? "Ollama terdeteksi" : ollamaConnected === false ? "Ollama tidak ditemukan" : "Memeriksa…"}
                      </span>
                      <button type="button" onClick={() => setShowOllamaSetup(true)} className="text-[11px] text-brand-400 hover:text-brand-300 underline transition-colors">
                        Cara install Ollama
                      </button>
                      <button type="button" onClick={() => refreshOllamaModels()} className="text-[11px] th-text-muted hover:th-text transition-colors" title="Refresh">↺</button>
                    </div>
                  )}
                  {settings.embed.provider === "local" && (
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-[11px] font-medium ${builtInEmbedReady ? "text-green-500" : "text-amber-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${builtInEmbedReady ? "bg-green-500" : "bg-amber-400"}`} />
                        {builtInEmbedReady ? "Model tersedia" : "Belum ada model embedding"}
                      </span>
                      <button type="button" onClick={() => setShowBuiltInSetup(true)} className="text-[11px] text-brand-400 hover:text-brand-300 underline transition-colors">
                        Cara setup Local
                      </button>
                    </div>
                  )}
                </div>
              </Field>

              <Field
                label="Model Baca Dokumen"
                tooltip="Model yang mengubah teks dokumen menjadi data yang bisa dicari. Diperlukan agar AI bisa menjawab dari dokumen Anda."
              >
                {settings.embed.provider === "local" ? (
                  <div className="flex flex-col gap-1.5">
                    <select
                      value={settings.embed.model_name}
                      onChange={(e) => setSettings((s) => ({ ...s, embed: { ...s.embed, model_name: e.target.value } }))}
                      className="input-field"
                    >
                      <option value="">-- Pilih model Local --</option>
                      {localEmbedModels.map((m) => (
                        <option key={m.name} value={m.name}>{m.name} ({m.size_mb} MB)</option>
                      ))}
                    </select>
                    {!builtInEmbedReady && (
                      <p className="text-xs th-text-muted">Belum ada model. Buka <span className="th-text font-medium">Kelola Model → Baca Dokumen</span> untuk download.</p>
                    )}
                  </div>
                ) : settings.embed.provider === "ollama" ? (
                  <div className="flex flex-col gap-1.5">
                    <input
                      value={settings.embed.model_name}
                      onChange={(e) => setSettings((s) => ({ ...s, embed: { ...s.embed, model_name: e.target.value } }))}
                      placeholder="nomic-embed-text"
                      className="input-field"
                    />
                    <p className="text-[11px] th-text-muted">Jalankan <code className="th-text font-mono bg-black/20 px-1 rounded">ollama pull nomic-embed-text</code> atau pilih model lain.</p>
                  </div>
                ) : (
                  <input
                    value={settings.embed.model_name}
                    onChange={(e) => setSettings((s) => ({ ...s, embed: { ...s.embed, model_name: e.target.value } }))}
                    placeholder={settings.embed.provider === "gemini" ? "models/text-embedding-004" : "text-embedding-3-small"}
                    className="input-field"
                  />
                )}
              </Field>

              {settings.embed.provider !== "local" && settings.embed.provider !== "ollama" && (
                <Field label="Kunci Akses (API Key)">
                  <input type="password"
                    value={settings.embed.api_key ?? ""}
                    onChange={(e) => setSettings((s) => ({ ...s, embed: { ...s.embed, api_key: e.target.value } }))}
                    placeholder="sk-..."
                    className="input-field"
                  />
                </Field>
              )}

              {/* Re-index thresholds */}
              <div className="border th-border rounded-xl p-3 flex flex-col gap-3">
                <p className="text-xs font-medium th-text-2 uppercase tracking-wider">Batas Pembaruan Otomatis</p>
                <p className="text-[10px] th-text-muted -mt-1">
                  Ketika Anda mengganti model baca dokumen, semua dokumen perlu diproses ulang. Atur di sini kapan proses ini berjalan otomatis atau meminta konfirmasi.
                </p>
                <Field label={`Otomatis tanpa notifikasi: ≤ ${settings.reindex_thresholds?.tier1_mb ?? 50} MB`}>
                  <input type="range" min="10" max="200" step="10"
                    value={settings.reindex_thresholds?.tier1_mb ?? 50}
                    onChange={(e) => setSettings((s) => ({
                      ...s,
                      reindex_thresholds: { ...s.reindex_thresholds ?? { tier1_mb: 50, tier2_mb: 200 }, tier1_mb: parseFloat(e.target.value) }
                    }))}
                    className="w-full accent-brand-500"
                  />
                </Field>
                <Field label={`Minta konfirmasi dulu: > ${settings.reindex_thresholds?.tier2_mb ?? 200} MB`}>
                  <input type="range" min="50" max="1000" step="50"
                    value={settings.reindex_thresholds?.tier2_mb ?? 200}
                    onChange={(e) => setSettings((s) => ({
                      ...s,
                      reindex_thresholds: { ...s.reindex_thresholds ?? { tier1_mb: 50, tier2_mb: 200 }, tier2_mb: parseFloat(e.target.value) }
                    }))}
                    className="w-full accent-brand-500"
                  />
                </Field>
                <p className="text-[10px] th-text-muted">
                  ≤{settings.reindex_thresholds?.tier1_mb ?? 50} MB: silent · {settings.reindex_thresholds?.tier1_mb ?? 50}–{settings.reindex_thresholds?.tier2_mb ?? 200} MB: progress bar · &gt;{settings.reindex_thresholds?.tier2_mb ?? 200} MB: requires confirmation
                </p>
              </div>

              {/* Reranker */}
              <div className="border th-border rounded-xl p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders size={14} className="th-text-2" />
                    <span className="text-sm font-medium th-text">Tingkatkan Akurasi Pencarian Dokumen</span>
                    <span className="text-[10px] th-bg-elevated th-text-muted px-1.5 py-0.5 rounded">Penyaring Lanjutan</span>
                    <Tooltip content="Fitur opsional yang menyaring ulang hasil pencarian dokumen agar lebih relevan. Membutuhkan model tambahan." />
                  </div>
                  {/* Toggle switch */}
                  <button
                    role="switch"
                    aria-checked={reranker.enabled}
                    onClick={() => setReranker({ enabled: !reranker.enabled })}
                    className={clsx(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      reranker.enabled ? "bg-brand-600" : "th-bg-elevated border th-border"
                    )}
                  >
                    <span
                      className={clsx(
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                        reranker.enabled ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {reranker.enabled && (
                  <>
                    <Field label="Provider">
                      <div className="flex flex-col gap-1.5">
                        <select
                          value={reranker.provider ?? "local"}
                          onChange={(e) => {
                            const p = e.target.value as RerankerConfig["provider"];
                            const defaults: Partial<RerankerConfig> =
                              p === "ollama" ? { endpoint: "http://localhost:11434/v1", model_name: "" } :
                              p === "local" ? { endpoint: undefined, model_name: "" } : { model_name: "", api_key: "" };
                            setReranker({ ...defaults, provider: p });
                            setRerankerTest({ state: "idle", message: "" });
                            if (p === "ollama") refreshOllamaModels();
                          }}
                          className="input-field"
                        >
                          <option value="local">Local (cross-encoder)</option>
                          <option value="ollama">Ollama</option>
                          <option value="cohere">Cohere Rerank API</option>
                        </select>
                        {(reranker.provider ?? "local") === "ollama" && (
                          <div className="flex items-center gap-2">
                            <span className={`flex items-center gap-1 text-[11px] font-medium ${ollamaConnected === true ? "text-green-500" : ollamaConnected === false ? "text-red-400" : "th-text-muted"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${ollamaConnected === true ? "bg-green-500" : ollamaConnected === false ? "bg-red-400" : "bg-gray-400"}`} />
                              {ollamaConnected === true ? "Ollama terdeteksi" : ollamaConnected === false ? "Ollama tidak ditemukan" : "Memeriksa…"}
                            </span>
                            <button type="button" onClick={() => setShowOllamaSetup(true)} className="text-[11px] text-brand-400 hover:text-brand-300 underline transition-colors">
                              Cara install Ollama
                            </button>
                            <button type="button" onClick={() => refreshOllamaModels()} className="text-[11px] th-text-muted hover:th-text transition-colors" title="Refresh">↺</button>
                          </div>
                        )}
                        {(reranker.provider ?? "local") === "local" && (
                          <div className="flex items-center gap-2">
                            <span className={`flex items-center gap-1 text-[11px] font-medium ${builtInRerankerReady ? "text-green-500" : "text-amber-400"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${builtInRerankerReady ? "bg-green-500" : "bg-amber-400"}`} />
                              {builtInRerankerReady ? "Model tersedia" : "Belum ada model penyaring"}
                            </span>
                            <button type="button" onClick={() => setShowBuiltInSetup(true)} className="text-[11px] text-brand-400 hover:text-brand-300 underline transition-colors">
                              Cara setup Local
                            </button>
                          </div>
                        )}
                      </div>
                    </Field>

                    {(reranker.provider ?? "local") === "local" ? (
                      <Field label="Model Penyaring">
                        <div className="flex flex-col gap-1.5">
                          <select
                            value={reranker.model_name}
                            onChange={(e) => { setReranker({ model_name: e.target.value }); setRerankerTest({ state: "idle", message: "" }); }}
                            className="input-field"
                          >
                            <option value="">-- Pilih model Local --</option>
                            {localRerankerModels.map((m) => (
                              <option key={m.name} value={m.name}>{m.name} ({m.size_mb} MB)</option>
                            ))}
                          </select>
                          {!builtInRerankerReady && (
                            <p className="text-[10px] th-text-muted">Belum ada model. Buka <span className="th-text font-medium">Kelola Model → Penyaring</span> untuk download.</p>
                          )}
                        </div>
                      </Field>
                    ) : (reranker.provider ?? "local") === "ollama" ? (
                      <Field label="Model Penyaring (Ollama)">
                        <div className="flex flex-col gap-1.5">
                          <input
                            value={reranker.model_name}
                            onChange={(e) => { setReranker({ model_name: e.target.value }); setRerankerTest({ state: "idle", message: "" }); }}
                            placeholder="mixedbread-ai/mxbai-rerank-xsmall-v1"
                            className="input-field"
                          />
                          <p className="text-[11px] th-text-muted">Masukkan nama model reranker yang kompatibel dengan Ollama.</p>
                        </div>
                      </Field>
                    ) : (
                      <>
                        <Field label="Model">
                          <select
                            value={reranker.model_name}
                            onChange={(e) => { setReranker({ model_name: e.target.value }); setRerankerTest({ state: "idle", message: "" }); }}
                            className="input-field"
                          >
                            <option value="">-- Select Cohere model --</option>
                            <option value="rerank-english-v3.0">rerank-english-v3.0</option>
                            <option value="rerank-multilingual-v3.0">rerank-multilingual-v3.0</option>
                            <option value="rerank-english-v2.0">rerank-english-v2.0</option>
                            <option value="rerank-multilingual-v2.0">rerank-multilingual-v2.0</option>
                          </select>
                        </Field>
                        <Field label="API Key">
                          <input
                            type="password"
                            value={reranker.api_key ?? ""}
                            onChange={(e) => { setReranker({ api_key: e.target.value }); setRerankerTest({ state: "idle", message: "" }); }}
                            placeholder="co-..."
                            className="input-field"
                          />
                        </Field>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <Field label={`Initial fetch: ${reranker.initial_fetch}`}>
                        <input type="range" min="10" max="50" step="5"
                          value={reranker.initial_fetch}
                          onChange={(e) => setReranker({ initial_fetch: parseInt(e.target.value) })}
                          className="w-full accent-brand-500"
                        />
                      </Field>
                      <Field label={`Return top: ${reranker.top_k}`}>
                        <input type="range" min="1" max="20" step="1"
                          value={reranker.top_k}
                          onChange={(e) => setReranker({ top_k: parseInt(e.target.value) })}
                          className="w-full accent-brand-500"
                        />
                      </Field>
                    </div>
                    <p className="text-[10px] th-text-muted">
                      Fetches {reranker.initial_fetch} candidate chunks, re-ranks and returns the best {reranker.top_k}.
                    </p>
                    <TestConnectionRow
                      label="Tes Koneksi Penyaring"
                      state={rerankerTest.state}
                      message={rerankerTest.message}
                      onTest={handleTestReranker}
                      disabled={!reranker.model_name || ((reranker.provider ?? "local") === "cohere" && !reranker.api_key)}
                    />
                  </>
                )}
              </div>

              <TestConnectionRow label="Tes Koneksi" state={embedTest.state} message={embedTest.message} onTest={handleTestEmbed} disabled={!settings.embed.model_name} />
            </div>
          )}

          {/* ── Ingestion ── */}
          {tab === "ingestion" && (
            <ChunkingTab chunking={chunking} setChunking={setChunking} />
          )}

          {/* ── Model Manager — always mounted, hidden when inactive ── */}
          <div className={tab === "models" ? "" : "hidden"}>
            <ModelManagerPanel
              chatProvider={settings.chat.provider}
              embedProvider={settings.embed.provider}
              rerankerProvider={reranker.provider ?? "local"}
              rerankerEnabled={reranker.enabled}
              ollamaEndpoint={settings.chat.endpoint ?? "http://localhost:11434/v1"}
              ollamaConnected={ollamaConnected}
              ollamaModels={ollamaModels}
              onOllamaRefresh={() => refreshOllamaModels()}
              localChatModels={localChatModels}
              localEmbedModels={localEmbedModels}
              localRerankerModels={localRerankerModels}
              onDeleted={refreshLocalModels}
              onOllamaDeleted={() => refreshOllamaModels()}
              tabs={mmTabs}
              setTabs={setMmTabs}
              abortRefs={mmAbortRefs}
            />
          </div>

          {/* ── Appearance ── */}
          {tab === "appearance" && (
            <AppearanceTab
              theme={settings.theme ?? { mode: "dark", accent: "#0284c7" }}
              accentInput={accentInput}
              setAccentInput={setAccentInput}
              onChange={applyThemeChange}
            />
          )}

          {/* ── Security ── */}
          {tab === "security" && <SecurityTab />}

          {/* ── Language ── */}
          {tab === "language" && <LanguageTab />}

          {/* ── Database ── */}
          {tab === "database" && (
            <DatabaseTab
              database={database}
              setDatabase={setDatabase}
              dbTest={dbTest}
              dbSave={dbSave}
              onTest={handleTestDatabase}
              onSave={handleSaveDatabase}
            />
          )}
          </div>

          {/* Footer Save button */}
          {tab !== "models" && tab !== "security" && tab !== "language" && tab !== "database" && (
            <div className="px-7 py-4 border-t th-border shrink-0 flex items-center justify-between">
              <p className="text-xs th-text-muted">Perubahan disimpan ke settings.json</p>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors text-white"
              >
                {saved ? <><Check size={14} /> Tersimpan</> : saving ? <><Loader size={14} className="animate-spin" /> Menyimpan…</> : <><Check size={14} /> {t("settings.save")}</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    {showOllamaSetup && <OllamaSetupModal onClose={() => setShowOllamaSetup(false)} />}
    {showBuiltInSetup && <BuiltInSetupModal onClose={() => setShowBuiltInSetup(false)} />}
    </>
  );
}

/* ── Ollama Setup Modal ── */
function OllamaSetupModal({ onClose }: { onClose: () => void }) {
  const [osTab, setOsTab] = useState<"windows" | "macos" | "linux">("macos");

  const OS_TABS: { id: "windows" | "macos" | "linux"; label: string }[] = [
    { id: "macos", label: "macOS" },
    { id: "windows", label: "Windows" },
    { id: "linux", label: "Linux" },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="th-bg-surface border th-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b th-border shrink-0">
          <div>
            <p className="text-sm font-semibold th-text">Cara Install Ollama</p>
            <p className="text-[11px] th-text-muted mt-0.5">Model AI berjalan lokal di komputer Anda</p>
          </div>
          <button onClick={onClose} className="th-text-muted hover:th-text transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* OS tabs */}
        <div className="flex border-b th-border shrink-0">
          {OS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setOsTab(t.id)}
              className={clsx(
                "px-5 py-2.5 text-sm font-medium transition-colors",
                osTab === t.id ? "th-text border-b-2 border-brand-500" : "th-text-muted hover:th-text"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {osTab === "macos" && (
            <div className="flex flex-col gap-4 text-sm th-text-2">
              <div>
                <p className="font-semibold th-text mb-2">Opsi 1 — Download langsung (direkomendasikan)</p>
                <ol className="list-decimal list-inside space-y-2 text-[13px]">
                  <li>Buka <span className="font-mono th-text bg-black/20 px-1.5 py-0.5 rounded">ollama.com</span> dan klik <span className="th-text font-medium">Download</span></li>
                  <li>Buka file <span className="font-mono th-text">Ollama.dmg</span> yang sudah diunduh dan drag ke Applications</li>
                  <li>Buka Ollama dari Launchpad — ikon muncul di menu bar</li>
                </ol>
              </div>
              <div>
                <p className="font-semibold th-text mb-2">Opsi 2 — Homebrew</p>
                <CodeBlock code="brew install ollama" />
                <CodeBlock code="ollama serve" className="mt-1" />
              </div>
              <div>
                <p className="font-semibold th-text mb-2">Download model pertama</p>
                <CodeBlock code="ollama pull llama3.2" />
                <p className="text-xs th-text-muted mt-1.5">Atau langsung dari tab <span className="th-text font-medium">Kelola Model</span> di atas.</p>
              </div>
            </div>
          )}

          {osTab === "windows" && (
            <div className="flex flex-col gap-4 text-sm th-text-2">
              <div>
                <p className="font-semibold th-text mb-2">Install Ollama</p>
                <ol className="list-decimal list-inside space-y-2 text-[13px]">
                  <li>Buka <span className="font-mono th-text bg-black/20 px-1.5 py-0.5 rounded">ollama.com</span> dan klik <span className="th-text font-medium">Download for Windows</span></li>
                  <li>Jalankan installer <span className="font-mono th-text">OllamaSetup.exe</span></li>
                  <li>Ollama akan berjalan otomatis di background (ikon tray)</li>
                </ol>
              </div>
              <div>
                <p className="font-semibold th-text mb-2">Download model pertama (Command Prompt / PowerShell)</p>
                <CodeBlock code="ollama pull llama3.2" />
                <p className="text-xs th-text-muted mt-1.5">Atau langsung dari tab <span className="th-text font-medium">Kelola Model</span> di atas.</p>
              </div>
              <div className="th-bg-elevated rounded-lg px-3 py-2.5 text-[12px] th-text-muted">
                <p className="font-semibold th-text mb-1">Persyaratan</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Windows 10 atau lebih baru (64-bit)</li>
                  <li>RAM minimal 8 GB (direkomendasikan 16 GB+)</li>
                  <li>GPU NVIDIA CUDA opsional untuk performa lebih cepat</li>
                </ul>
              </div>
            </div>
          )}

          {osTab === "linux" && (
            <div className="flex flex-col gap-4 text-sm th-text-2">
              <div>
                <p className="font-semibold th-text mb-2">Install via skrip resmi</p>
                <CodeBlock code="curl -fsSL https://ollama.com/install.sh | sh" />
              </div>
              <div>
                <p className="font-semibold th-text mb-2">Jalankan sebagai service (opsional)</p>
                <CodeBlock code={`sudo systemctl enable ollama\nsudo systemctl start ollama`} />
              </div>
              <div>
                <p className="font-semibold th-text mb-2">Download model pertama</p>
                <CodeBlock code="ollama pull llama3.2" />
                <p className="text-xs th-text-muted mt-1.5">Atau langsung dari tab <span className="th-text font-medium">Kelola Model</span> di atas.</p>
              </div>
              <div className="th-bg-elevated rounded-lg px-3 py-2.5 text-[12px] th-text-muted">
                <p className="font-semibold th-text mb-1">GPU NVIDIA</p>
                <p>Ollama otomatis mendeteksi GPU NVIDIA dengan driver versi 450.80.02+. Tidak perlu konfigurasi tambahan.</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t th-border shrink-0 flex items-center justify-between">
          <p className="text-xs th-text-muted">Setelah install, klik ↺ di halaman Chat Model untuk refresh status koneksi.</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-medium text-white transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Local Setup Modal ── */
function BuiltInSetupModal({ onClose }: { onClose: () => void }) {
  const STEPS: { title: string; desc: string }[] = [
    {
      title: "Pilih provider Local",
      desc: "Di tab Chat Model, Baca Dokumen, atau Penyaring — pilih \"Local\" sebagai provider.",
    },
    {
      title: "Buka Kelola Model",
      desc: "Klik menu Kelola Model di panel kiri Settings. Pilih sub-tab sesuai kebutuhan: Chat, Baca Dokumen, atau Penyaring.",
    },
    {
      title: "Cari dan unduh model",
      desc: "Masukkan nama repositori HuggingFace (contoh: unsloth/gemma-3-4b-it-GGUF), klik Cari, pilih file model, lalu klik Unduh. Tunggu hingga selesai.",
    },
    {
      title: "Pilih model yang sudah diunduh",
      desc: "Kembali ke tab pengaturan provider, pilih model dari dropdown. Klik Simpan.",
    },
  ];

  const RECOMMENDATIONS: { label: string; value: string; desc: string }[] = [
    { label: "Chat — ringan", value: "unsloth/gemma-3-4b-it-GGUF", desc: "~2.5 GB, cocok untuk komputer dengan RAM 8 GB" },
    { label: "Chat — lebih pintar", value: "unsloth/Qwen3-8B-GGUF", desc: "~5 GB, butuh RAM 16 GB+" },
    { label: "Baca Dokumen", value: "nomic-ai/nomic-embed-text-v1", desc: "~270 MB, multibahasa" },
    { label: "Penyaring", value: "cross-encoder/ms-marco-MiniLM-L-6-v2", desc: "~90 MB, ringan" },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="th-bg-surface border th-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b th-border shrink-0">
          <div>
            <p className="text-sm font-semibold th-text">Cara Menggunakan Provider Local</p>
            <p className="text-[11px] th-text-muted mt-0.5">Model berjalan langsung di komputer Anda, tanpa internet</p>
          </div>
          <button onClick={onClose} className="th-text-muted hover:th-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            {STEPS.map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] th-text font-medium">{step.title}</p>
                  <p className="text-[12px] th-text-muted mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="th-bg-elevated rounded-xl px-4 py-3">
            <p className="text-[12px] font-semibold th-text mb-2">Rekomendasi model</p>
            <div className="flex flex-col gap-2">
              {RECOMMENDATIONS.map((r) => (
                <div key={r.value} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-brand-400">{r.label}</span>
                  </div>
                  <span className="text-[11px] font-mono th-text">{r.value}</span>
                  <span className="text-[11px] th-text-muted">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t th-border shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-medium text-white transition-colors"
          >
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <pre className={clsx("th-bg-base border th-border rounded-lg px-3 py-2.5 text-[12px] font-mono th-text overflow-x-auto", className)}>
      {code}
    </pre>
  );
}

/* ── Model Manager Panel (self-contained state) ── */
const MM_TABS: { id: ModelManagerTab; label: string; placeholder: string }[] = [
  { id: "chat",     label: "Chat",           placeholder: "e.g. bartowski/Llama-3.2-3B-Instruct-GGUF" },
  { id: "embed",    label: "Baca Dokumen",   placeholder: "e.g. sentence-transformers/all-MiniLM-L6-v2" },
  { id: "reranker", label: "Penyaring",      placeholder: "e.g. cross-encoder/ms-marco-MiniLM-L-6-v2" },
];

const MM_TAB_LABELS: Record<ModelManagerTab, string> = {
  chat: "Chat",
  embed: "Baca Dokumen",
  reranker: "Penyaring",
};

interface RepoDownloadState {
  status: "idle" | "resolving" | "downloading" | "done" | "error";
  progress: number;
  currentFile?: string;
  fileIndex?: number;
  fileTotal?: number;
  downloadedMb?: number;
  totalMb?: number;
  errorMsg?: string;
}

interface TabState {
  hfRepoId: string;
  hfFiles: HFFile[];
  hfLoading: boolean;
  hfError: string;
  // chat: per-file keyed by filename; embed/reranker: keyed by repo id
  downloads: Record<string, RepoDownloadState>;
}

const EMPTY_TAB: TabState = { hfRepoId: "", hfFiles: [], hfLoading: false, hfError: "", downloads: {} };

// Cloud providers: no local model to manage
const CLOUD_CHAT_PROVIDERS = ["openai", "gemini", "deepseek", "openai_compatible"];
const CLOUD_EMBED_PROVIDERS = ["openai", "gemini"];
const CLOUD_RERANKER_PROVIDERS = ["cohere"];

function providerBadge(provider: string): string {
  if (provider === "ollama") return "Ollama";
  if (provider === "local") return "Local";
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Gemini";
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "openai_compatible") return "Custom";
  if (provider === "cohere") return "Cohere";
  return provider;
}

function ModelManagerPanel({
  chatProvider, embedProvider, rerankerProvider, rerankerEnabled,
  ollamaEndpoint, ollamaConnected, ollamaModels, onOllamaRefresh, onOllamaDeleted,
  localChatModels, localEmbedModels, localRerankerModels, onDeleted,
  tabs, setTabs, abortRefs,
}: {
  chatProvider: string;
  embedProvider: string;
  rerankerProvider: string;
  rerankerEnabled: boolean;
  ollamaEndpoint: string;
  ollamaConnected: boolean | null;
  ollamaModels: OllamaModel[];
  onOllamaRefresh: () => void;
  localChatModels: LocalModel[];
  localEmbedModels: LocalModel[];
  localRerankerModels: LocalModel[];
  onDeleted: () => void;
  onOllamaDeleted: () => void;
  tabs: Record<ModelManagerTab, TabState>;
  setTabs: React.Dispatch<React.SetStateAction<Record<ModelManagerTab, TabState>>>;
  abortRefs: React.MutableRefObject<Record<string, AbortController>>;
}) {
  const [mmTab, setMmTab] = useState<ModelManagerTab>("chat");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [ollamaPullName, setOllamaPullName] = useState("");
  const [ollamaPullState, setOllamaPullState] = useState<{ status: string; progress: number; total_mb?: number; downloaded_mb?: number } | null>(null);
  const ollamaPullAbort = useRef<AbortController | null>(null);

  // Per-sub-tab provider
  const providerForTab = (id: ModelManagerTab) =>
    id === "chat" ? chatProvider : id === "embed" ? embedProvider : rerankerProvider;

  const currentProvider = providerForTab(mmTab);
  const isCloudTab = (id: ModelManagerTab) => {
    const p = providerForTab(id);
    if (id === "chat") return CLOUD_CHAT_PROVIDERS.includes(p);
    if (id === "embed") return CLOUD_EMBED_PROVIDERS.includes(p);
    return CLOUD_RERANKER_PROVIDERS.includes(p);
  };
  const isOllamaTab = (id: ModelManagerTab) => providerForTab(id) === "ollama";

  const isOllamaMode = isOllamaTab(mmTab);
  const isCloud = isCloudTab(mmTab);
  const tab = tabs[mmTab];
  const isRepoType = (mmTab === "embed" || mmTab === "reranker") && !isOllamaMode && !isCloud;
  const current = MM_TABS.find((t) => t.id === mmTab)!;
  const installedModels =
    mmTab === "chat" ? localChatModels :
    mmTab === "embed" ? localEmbedModels :
    localRerankerModels;

  const ollamaBase = ollamaEndpoint.replace(/\/v1\/?$/, "");

  function handleOllamaPull() {
    if (!ollamaPullName.trim()) return;
    ollamaPullAbort.current?.abort();
    ollamaPullAbort.current = new AbortController();
    setOllamaPullState({ status: "starting", progress: 0 });
    streamOllamaPull(
      ollamaPullName.trim(),
      ollamaBase,
      (e) => {
        setOllamaPullState(e);
        if (e.status === "done") { onOllamaDeleted(); setOllamaPullName(""); setTimeout(() => setOllamaPullState(null), 2000); }
        if (e.status === "error") setTimeout(() => setOllamaPullState(null), 4000);
      },
      ollamaPullAbort.current,
    );
  }

  async function handleOllamaDelete(modelName: string) {
    setDeleting(modelName);
    await deleteOllamaModel(modelName, ollamaBase);
    setDeleting(null);
    onOllamaDeleted();
  }

  const setTab = (tabId: ModelManagerTab, patch: Partial<TabState>) =>
    setTabs((p) => ({ ...p, [tabId]: { ...p[tabId], ...patch } }));

  const setDownload = (tabId: ModelManagerTab, key: string, ds: RepoDownloadState) =>
    setTabs((p) => ({
      ...p,
      [tabId]: { ...p[tabId], downloads: { ...p[tabId].downloads, [key]: ds } },
    }));

  const cancelDownload = (tabId: ModelManagerTab, key: string) => {
    const abortKey = `${tabId}:${key}`;
    abortRefs.current[abortKey]?.abort();
    delete abortRefs.current[abortKey];
    setDownload(tabId, key, { status: "idle", progress: 0 });
  };

  const fetchHFFiles = async (overrideRepoId?: string) => {
    const repoId = overrideRepoId ?? tab.hfRepoId;
    if (!repoId.trim()) return;
    const tabId = mmTab;
    const abortKey = `${tabId}:browse`;
    abortRefs.current[abortKey]?.abort();
    const controller = new AbortController();
    abortRefs.current[abortKey] = controller;
    setTab(tabId, { hfLoading: true, hfFiles: [], hfError: "", ...(overrideRepoId ? { hfRepoId: overrideRepoId } : {}) });
    try {
      const data = await getHFFiles(repoId.trim(), tabId as "chat" | "embed" | "reranker", controller.signal);
      if (controller.signal.aborted) return;
      if (data.error) {
        setTab(tabId, { hfLoading: false, hfFiles: [], hfError: data.error });
      } else if ((data.files ?? []).length === 0) {
        setTab(tabId, { hfLoading: false, hfFiles: [], hfError: "Tidak ada file .gguf ditemukan di repo ini." });
      } else {
        setTab(tabId, { hfLoading: false, hfFiles: data.files, hfError: "" });
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "AbortError") return; // user cancelled, no error shown
      setTab(tabId, { hfLoading: false, hfError: `Error: ${(err as { message?: string })?.message ?? "Tidak diketahui"}` });
    } finally {
      delete abortRefs.current[abortKey];
    }
  };

  const cancelBrowse = () => {
    const abortKey = `${mmTab}:browse`;
    abortRefs.current[abortKey]?.abort();
    delete abortRefs.current[abortKey];
    setTab(mmTab, { hfLoading: false });
  };

  // Chat: download a single .gguf file. explicitRepoId can be passed for resume without tab input.
  const handleChatDownload = (filename: string, explicitRepoId?: string) => {
    const tabId = mmTab;
    const repoId = (explicitRepoId ?? tab.hfRepoId).trim();
    const abortKey = `${tabId}:${filename}`;
    abortRefs.current[abortKey]?.abort();
    const controller = new AbortController();
    abortRefs.current[abortKey] = controller;
    setDownload(tabId, filename, { status: "downloading", progress: 0 });
    streamModelDownload(repoId, filename, "chat", (event) => {
      if (controller.signal.aborted) return;
      const s = event.status as string;
      setDownload(tabId, filename, {
        status: s === "done" ? "done" : s === "error" ? "error" : "downloading",
        progress: event.progress,
        downloadedMb: event.downloaded_mb,
        totalMb: event.total_mb,
        errorMsg: s === "error" ? event.message : undefined,
      });
      if (s === "done") { delete abortRefs.current[abortKey]; onDeleted(); }
    }, controller);
  };

  // Embed/Reranker: download entire repo, keyed by repo id
  const handleRepoInstall = () => {
    const tabId = mmTab;
    const repoId = tab.hfRepoId.trim();
    const abortKey = `${tabId}:${repoId}`;
    abortRefs.current[abortKey]?.abort();
    const controller = new AbortController();
    abortRefs.current[abortKey] = controller;
    setDownload(tabId, repoId, { status: "resolving", progress: 0 });
    streamModelDownload(repoId, repoId, tabId, (event) => {
      if (controller.signal.aborted) return;
      const s = event.status as string;
      const e = event as Record<string, unknown>;
      if (s === "resolving") {
        setDownload(tabId, repoId, { status: "resolving", progress: 0 });
      } else if (s === "downloading") {
        setDownload(tabId, repoId, {
          status: "downloading",
          progress: event.progress,
          currentFile: e.current_file as string | undefined,
          fileIndex: e.file_index as number | undefined,
          fileTotal: e.file_total as number | undefined,
          downloadedMb: event.downloaded_mb,
          totalMb: event.total_mb,
        });
      } else if (s === "done") {
        delete abortRefs.current[abortKey];
        setDownload(tabId, repoId, { status: "done", progress: 100 });
        onDeleted();
      } else if (s === "error") {
        setDownload(tabId, repoId, { status: "error", progress: 0, errorMsg: event.message });
      }
    }, controller);
  };

  const handleDelete = async (modelName: string) => {
    setDeleting(modelName);
    await deleteLocalModel(modelName, mmTab);
    setDeleting(null);
    onDeleted();
  };

  const repoId = tab.hfRepoId.trim();
  const repoDs = tab.downloads[repoId];
  const repoActive = repoDs?.status === "resolving" || repoDs?.status === "downloading";

  return (
    <div className="flex flex-col gap-4">
      {/* Type tabs */}
      <div className="flex rounded-xl overflow-hidden border th-border">
        {MM_TABS.map((t) => {
          const cloud = isCloudTab(t.id);
          const rerankerOff = t.id === "reranker" && !rerankerEnabled;
          const p = providerForTab(t.id);
          const ollamaNotReady = !cloud && !rerankerOff && p === "ollama" && ollamaConnected !== true;
          const disabled = cloud || rerankerOff || ollamaNotReady;
          const badge = providerBadge(p);
          const active = mmTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => !disabled && setMmTab(t.id)}
              disabled={disabled}
              title={
                rerankerOff ? "Aktifkan Penyaring di tab Baca Dokumen terlebih dahulu" :
                cloud ? `Provider ${badge} tidak memerlukan model lokal` :
                ollamaNotReady ? "Ollama belum terkoneksi" :
                undefined
              }
              className={clsx(
                "flex-1 flex flex-col items-center py-2 text-sm transition-colors",
                disabled
                  ? "opacity-35 cursor-not-allowed th-bg-elevated th-text-muted"
                  : active
                    ? "bg-brand-600 text-white"
                    : "th-text-2 hover:th-text th-bg-elevated"
              )}
            >
              <span className="capitalize">{t.label}</span>
              <span className={clsx(
                "text-[10px] font-medium mt-0.5",
                active && !disabled ? "text-white/70" : "th-text-muted"
              )}>{rerankerOff ? "Nonaktif" : ollamaNotReady ? "Offline" : badge}</span>
            </button>
          );
        })}
      </div>

      {/* ── Cloud provider: no local model needed ── */}
      {isCloud && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 th-text-muted">
          <div className="w-14 h-14 rounded-2xl th-bg-elevated border th-border flex items-center justify-center text-2xl">
            ☁️
          </div>
          <div className="text-center">
            <p className="text-sm th-text font-medium">{providerBadge(currentProvider)}</p>
            <p className="text-xs th-text-muted mt-1 max-w-xs">
              Provider ini tidak memerlukan model lokal.
              Atur API key dan pilih model di tab <span className="th-text font-medium">
                {mmTab === "chat" ? "Chat Model" : mmTab === "embed" ? "Baca Dokumen" : "Penyaring"}
              </span>.
            </p>
          </div>
        </div>
      )}

      {/* ── Ollama mode: pull + list ── */}
      {isOllamaMode && !isCloud && (
        <div className="flex flex-col gap-3">
          {/* Connection status */}
          <div className="flex items-center justify-between th-bg-elevated rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${ollamaConnected === true ? "bg-green-500" : ollamaConnected === false ? "bg-red-400" : "bg-gray-400"}`} />
              <span className="text-xs th-text">
                {ollamaConnected === true ? `Ollama terhubung · ${ollamaBase}` : ollamaConnected === false ? "Ollama tidak ditemukan" : "Memeriksa koneksi…"}
              </span>
            </div>
            <button onClick={onOllamaRefresh} className="text-xs th-text-muted hover:th-text transition-colors px-2">↺ Refresh</button>
          </div>

          {ollamaConnected === false && (
            <div className="th-bg-elevated rounded-xl px-3 py-3 text-[11px] th-text-muted leading-relaxed border th-border">
              Ollama belum berjalan. Pastikan Ollama sudah diinstall dan jalankan <code className="th-text font-mono bg-black/20 px-1 rounded">ollama serve</code>, lalu klik Refresh.
            </div>
          )}

          {/* Pull a new model */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium th-text-muted uppercase tracking-wider">Download model baru</p>
            <div className="th-bg-elevated rounded-lg px-3 py-2 text-[11px] th-text-muted leading-relaxed">
              Masukkan nama model dari <span className="th-text font-medium">ollama.com/library</span>.
              Contoh populer:
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(mmTab === "embed"
                  ? ["nomic-embed-text", "mxbai-embed-large", "bge-m3", "all-minilm"]
                  : mmTab === "reranker"
                  ? ["qllm/bge-reranker-v2-m3", "qllm/mxbai-rerank-xsmall-v1"]
                  : ["llama3.2", "mistral", "gemma3:4b", "qwen2.5:7b", "phi4-mini"]
                ).map(n => (
                  <button key={n} onClick={() => setOllamaPullName(n)} className="px-2 py-0.5 rounded bg-brand-600/15 text-brand-400 border border-brand-500/20 hover:bg-brand-600/25 transition-colors">
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={ollamaPullName}
                onChange={e => setOllamaPullName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleOllamaPull()}
                placeholder={mmTab === "embed" ? "nomic-embed-text, mxbai-embed-large…" : mmTab === "reranker" ? "nama model reranker ollama…" : "llama3.2, mistral, gemma3:4b…"}
                disabled={!ollamaConnected}
                className="input-field flex-1"
              />
              <button
                onClick={ollamaPullState && ollamaPullState.status !== "done" && ollamaPullState.status !== "error"
                  ? () => { ollamaPullAbort.current?.abort(); setOllamaPullState(null); }
                  : handleOllamaPull}
                disabled={!ollamaConnected || !ollamaPullName.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 transition-colors shrink-0"
              >
                {ollamaPullState && ollamaPullState.status !== "done" && ollamaPullState.status !== "error"
                  ? <><X size={14} /> Batalkan</>
                  : <><Download size={14} /> Pull</>}
              </button>
            </div>
            {ollamaPullState && (
              <div className="flex flex-col gap-1.5 th-bg-elevated rounded-xl px-3 py-2.5 border th-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs th-text capitalize">{ollamaPullState.status}</span>
                  {ollamaPullState.status === "done" ? (
                    <span className="text-xs text-green-500 flex items-center gap-1"><Check size={12} /> Selesai</span>
                  ) : ollamaPullState.status === "error" ? (
                    <span className="text-xs text-red-400">Gagal</span>
                  ) : (
                    <span className="text-xs text-brand-400">{ollamaPullState.progress}%</span>
                  )}
                </div>
                {ollamaPullState.progress > 0 && ollamaPullState.status !== "done" && (
                  <>
                    <div className="w-full h-1.5 th-bg-base rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${ollamaPullState.progress}%` }} />
                    </div>
                    <span className="text-[10px] th-text-muted text-right">
                      {ollamaPullState.downloaded_mb != null && ollamaPullState.total_mb
                        ? `${ollamaPullState.downloaded_mb} / ${ollamaPullState.total_mb} MB` : ""}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Installed Ollama models */}
          <div>
            <p className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-2">Model Ollama yang terpasang</p>
            {ollamaModels.length === 0 ? (
              <p className="text-sm th-text-muted">
                {ollamaConnected ? "Belum ada model. Pull model di atas untuk memulai." : "Hubungkan Ollama untuk melihat model."}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {ollamaModels.map(m => (
                  <div key={m.name} className="flex items-center gap-2 th-bg-elevated px-3 py-2.5 rounded-lg">
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm th-text truncate">{m.name}</span>
                      <span className="text-[10px] th-text-muted">
                        {[m.family, m.parameter_size, m.size_mb ? `${m.size_mb} MB` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <button
                      onClick={() => handleOllamaDelete(m.name)}
                      disabled={deleting === m.name}
                      className="text-xs th-text-muted hover:text-red-400 transition-colors px-2 py-1 rounded"
                    >
                      {deleting === m.name ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HF search — only shown when local provider */}
      {!isOllamaMode && !isCloud && <div className="flex flex-col gap-4">
        {/* Context hint per tab */}
        {mmTab === "chat" && (
          <div className="th-bg-elevated rounded-lg px-3 py-2 text-[11px] th-text-muted leading-relaxed flex flex-col gap-2">
            <span>
              Masukkan ID repositori HuggingFace, lalu klik <span className="th-text font-medium">Cari Model</span> untuk melihat file <span className="th-text font-medium">.gguf</span> yang tersedia.
              Format .gguf adalah format model AI yang berjalan langsung di komputer Anda.
            </span>
            <div className="flex flex-col gap-1">
              <span className="th-text font-medium text-[10px] uppercase tracking-wide">Rekomendasi</span>
              <button
                onClick={() => fetchHFFiles("unsloth/gemma-4-E2B-it-GGUF")}
                className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-600/15 hover:bg-brand-600/25 border border-brand-500/20 text-brand-400 text-[10px] font-medium transition-colors"
              >
                ✦ unsloth/gemma-4-E2B-it-GGUF
              </button>
            </div>
          </div>
        )}
        {mmTab === "embed" && (
          <div className="th-bg-elevated rounded-lg px-3 py-2 text-[11px] th-text-muted leading-relaxed">
            Masukkan ID repositori HuggingFace, lalu klik <span className="th-text font-medium">Unduh & Pasang</span> untuk mengunduh model pembaca dokumen.
            Gunakan model <span className="th-text font-medium">sentence-transformers</span>.
            Contoh: <span className="th-text font-mono">sentence-transformers/all-MiniLM-L6-v2</span>
          </div>
        )}
        {mmTab === "reranker" && (
          <div className="th-bg-elevated rounded-lg px-3 py-2 text-[11px] th-text-muted leading-relaxed">
            Masukkan ID repositori HuggingFace, lalu klik <span className="th-text font-medium">Unduh & Pasang</span> untuk mengunduh model penyaring.
            Gunakan model <span className="th-text font-medium">cross-encoder</span>.
            Contoh: <span className="th-text font-mono">cross-encoder/ms-marco-MiniLM-L-6-v2</span>
          </div>
        )}

        <input
          value={tab.hfRepoId}
          onChange={(e) => setTab(mmTab, { hfRepoId: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (isRepoType ? handleRepoInstall() : fetchHFFiles())}
          placeholder={current.placeholder}
          className="input-field"
        />
        {isRepoType ? (
          <div className="flex gap-2">
            <button
              onClick={handleRepoInstall}
              disabled={repoActive || !tab.hfRepoId.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 rounded-lg text-sm text-white transition-colors"
            >
              {repoActive
                ? <><Loader size={14} className="animate-spin" /> Mengunduh...</>
                : <><Download size={14} /> Unduh & Pasang</>
              }
            </button>
            {repoActive && (
              <button
                onClick={() => cancelDownload(mmTab, repoId)}
                className="px-3 py-2 rounded-lg text-sm th-bg-elevated hover:bg-red-950/40 th-text-muted hover:text-red-400 border th-border transition-colors"
                title="Batalkan instalasi"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={tab.hfLoading ? cancelBrowse : () => fetchHFFiles()}
              disabled={!tab.hfLoading && !tab.hfRepoId.trim()}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors disabled:opacity-40",
                tab.hfLoading
                  ? "th-bg-elevated th-text-muted hover:bg-red-950/40 hover:text-red-400"
                  : "th-bg-elevated hover:opacity-80 th-text-2"
              )}
            >
              {tab.hfLoading
                ? <><X size={14} /> Batalkan</>
                : <><RefreshCw size={14} /> Cari Model</>
              }
            </button>
          </div>
        )}

        {/* Error message */}
        {tab.hfError && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-400 text-xs">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{tab.hfError}</span>
          </div>
        )}

      {/* Embed/Reranker: repo-level progress */}
      {isRepoType && repoDs && repoDs.status !== "idle" && (
        <div className="flex flex-col gap-2 th-bg-elevated rounded-xl px-4 py-3 border th-border">
          <div className="flex items-center justify-between">
            <span className="text-sm th-text truncate flex-1">{repoId}</span>
            {repoDs.status === "done" ? (
              <span className="flex items-center gap-1 text-xs text-green-500 shrink-0"><Check size={13} /> Ready</span>
            ) : repoDs.status === "error" ? (
              <span className="flex items-center gap-1 text-xs text-red-400 shrink-0"><AlertCircle size={13} /> Failed</span>
            ) : (
              <span className="text-xs text-brand-500 shrink-0">{repoDs.progress}%</span>
            )}
          </div>

          {repoActive && (
            <>
              <div className="w-full h-2 th-bg-base rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all duration-200"
                  style={{ width: `${repoDs.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] th-text-muted">
                <span className="truncate max-w-[70%]">
                  {repoDs.status === "resolving"
                    ? "Resolving file list..."
                    : repoDs.currentFile
                      ? `${repoDs.currentFile} (${repoDs.fileIndex}/${repoDs.fileTotal})`
                      : "Preparing..."}
                </span>
                <span className="shrink-0">
                  {repoDs.downloadedMb != null && repoDs.totalMb
                    ? `${repoDs.downloadedMb} / ${repoDs.totalMb} MB`
                    : ""}
                </span>
              </div>
            </>
          )}

          {repoDs.status === "error" && repoDs.errorMsg && (
            <p className="text-[10px] text-red-400">{repoDs.errorMsg}</p>
          )}
        </div>
      )}

      {/* Chat: file list from HF */}
      {!isRepoType && tab.hfFiles.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {tab.hfFiles.map((f) => {
            const dl = tab.downloads[f.filename];
            const isActive = dl?.status === "downloading";
            const installedFull = installedModels.find((m) => m.name === f.filename && !m.partial);
            const installedPartial = installedModels.find((m) => m.name === f.filename && m.partial);
            return (
              <div key={f.filename} className="flex flex-col gap-1.5 th-bg-elevated px-3 py-2.5 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm th-text truncate">{f.filename}</span>
                  {dl?.status === "error" ? (
                    <span className="flex items-center gap-1 text-xs text-red-400 shrink-0"><AlertCircle size={13} /> Failed</span>
                  ) : isActive ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-brand-500">{dl.progress}%</span>
                      <button onClick={() => cancelDownload(mmTab, f.filename)} className="th-text-muted hover:text-red-400 transition-colors" title="Batalkan">
                        <X size={13} />
                      </button>
                    </div>
                  ) : installedFull ? (
                    <span className="flex items-center gap-1 text-xs text-green-500 shrink-0"><Check size={13} /> Installed</span>
                  ) : installedPartial ? (
                    <button
                      onClick={() => handleChatDownload(f.filename, installedPartial.repo_id)}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors shrink-0"
                      title="Lanjutkan download"
                    >
                      <RefreshCw size={13} /> Lanjutkan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleChatDownload(f.filename)}
                      className="flex items-center gap-1 text-xs th-text-muted hover:text-brand-500 transition-colors shrink-0"
                    >
                      <Download size={13} /> Unduh
                    </button>
                  )}
                </div>
                {isActive && (
                  <>
                    <div className="w-full h-1.5 th-bg-base rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${dl.progress}%` }} />
                    </div>
                    <span className="text-[10px] th-text-muted text-right">
                      {dl.downloadedMb != null && dl.totalMb ? `${dl.downloadedMb} / ${dl.totalMb} MB` : ""}
                    </span>
                  </>
                )}
                {dl?.status === "error" && dl.errorMsg && (
                  <p className="text-[10px] text-red-400">{dl.errorMsg}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Installed models */}
      <div>
        <p className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-2">
          Model {MM_TAB_LABELS[mmTab]} yang terpasang
        </p>
        {installedModels.length === 0 ? (
          <p className="text-sm th-text-muted">Belum ada model yang terpasang.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {installedModels.map((m) => {
              const dlState = tab.downloads[m.name];
              const isDownloading = dlState?.status === "downloading" || dlState?.status === "resolving";
              const canResume = m.partial && !isDownloading && !!m.repo_id;

              return (
                <div key={m.name} className="flex flex-col gap-1.5 th-bg-elevated px-3 py-2.5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm th-text truncate">{m.name}</span>
                      {m.repo_id && (
                        <span className="text-[10px] th-text-muted truncate font-mono">{m.repo_id}</span>
                      )}
                    </div>

                    {m.partial ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                        {m.size_mb} MB · partial
                      </span>
                    ) : (
                      <span className="text-xs th-text-muted shrink-0">{m.size_mb} MB</span>
                    )}

                    {isDownloading && (
                      <span className="flex items-center gap-1 text-xs text-brand-500 shrink-0">
                        <Loader size={12} className="animate-spin" />
                        {dlState?.progress ?? 0}%
                        <button
                          onClick={() => cancelDownload(mmTab, m.name)}
                          className="hover:text-red-400 transition-colors ml-0.5"
                          title="Batalkan"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    )}

                    {canResume && (
                      <button
                        onClick={() => handleChatDownload(m.name, m.repo_id!)}
                        className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-400 shrink-0 transition-colors"
                        title={`Resume dari ${m.repo_id}`}
                      >
                        <RefreshCw size={12} /> Lanjutkan
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(m.name)}
                      disabled={deleting === m.name}
                      className="th-text-muted hover:text-red-400 disabled:opacity-30 shrink-0 transition-colors"
                      title="Hapus dari storage"
                    >
                      {deleting === m.name ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>

                  {/* Progress bar for active download in installed list */}
                  {isDownloading && dlState?.progress != null && (
                    <>
                      <div className="w-full h-1.5 th-bg-base rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${dlState.progress}%` }} />
                      </div>
                      <span className="text-[10px] th-text-muted text-right">
                        {dlState.downloadedMb != null && dlState.totalMb
                          ? `${dlState.downloadedMb} / ${dlState.totalMb} MB`
                          : ""}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>}
    </div>
  );
}

/* ── Chunking Tab ── */
function ChunkingTab({
  chunking, setChunking,
}: {
  chunking: ChunkingConfig;
  setChunking: (c: Partial<ChunkingConfig>) => void;
}) {
  const STRATEGIES = [
    { id: "word",      label: "Word",      desc: "Dipotong berdasarkan jumlah kata. Cepat dan konsisten — cocok untuk sebagian besar dokumen." },
    { id: "sentence",  label: "Sentence",  desc: "Dipotong pada akhir kalimat. Lebih baik untuk teks naratif dan dokumen Q&A." },
    { id: "paragraph", label: "Paragraph", desc: "Dipotong pada baris kosong antar paragraf. Terbaik untuk teks yang sudah terstruktur rapi." },
  ] as const;

  const unitLabel = chunking.strategy === "word" ? "words" : "chars";
  const maxChunkSize = chunking.strategy === "word" ? 2000 : 4000;
  const maxOverlap = chunking.strategy === "word" ? 500 : 1000;

  const estimatedChunks = (docWords: number) => {
    const effective = Math.max(1, chunking.chunk_size - chunking.overlap);
    return Math.ceil(docWords / effective);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Strategy */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium th-text-muted uppercase tracking-wider">Cara Memotong Dokumen</p>
        <p className="text-[11px] th-text-muted -mt-1">
          Dokumen yang diunggah akan dipotong-potong agar lebih mudah dicari. Pilih cara yang sesuai dengan jenis dokumen Anda.
        </p>
        <div className="flex flex-col gap-2">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              onClick={() => setChunking({ strategy: s.id })}
              className={clsx(
                "flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors",
                chunking.strategy === s.id
                  ? "border-brand-500 bg-brand-600/10"
                  : "th-border th-bg-elevated hover:opacity-80"
              )}
            >
              <div className={clsx(
                "mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors",
                chunking.strategy === s.id ? "border-brand-500 bg-brand-500" : "th-border"
              )} />
              <div>
                <p className={clsx("text-sm font-medium", chunking.strategy === s.id ? "text-brand-500" : "th-text")}>{s.label}</p>
                <p className="text-xs th-text-muted mt-0.5">{s.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chunk Size */}
      <Field label={`Ukuran potongan: ${chunking.chunk_size} ${unitLabel}`}>
        <input
          type="range"
          min={chunking.strategy === "word" ? 50 : 200}
          max={maxChunkSize}
          step={chunking.strategy === "word" ? 50 : 100}
          value={chunking.chunk_size}
          onChange={(e) => setChunking({ chunk_size: parseInt(e.target.value) })}
          className="w-full accent-brand-500"
        />
        <div className="flex justify-between text-[10px] th-text-muted">
          <span>{chunking.strategy === "word" ? "50 words" : "200 chars"}</span>
          <span>{chunking.strategy === "word" ? "2000 words" : "4000 chars"}</span>
        </div>
      </Field>

      {/* Overlap */}
      <Field label={`Tumpang tindih: ${chunking.overlap} ${unitLabel}`}>
        <input
          type="range"
          min={0}
          max={maxOverlap}
          step={chunking.strategy === "word" ? 10 : 50}
          value={chunking.overlap}
          onChange={(e) => setChunking({ overlap: parseInt(e.target.value) })}
          className="w-full accent-brand-500"
        />
        <div className="flex justify-between text-[10px] th-text-muted">
          <span>0 (no overlap)</span>
          <span>{maxOverlap} {unitLabel}</span>
        </div>
      </Field>

      {/* Min Chunk Size */}
      <Field label={`Ukuran minimum potongan: ${chunking.min_chunk_size}`}>
        <input
          type="number"
          min={0}
          max={500}
          value={chunking.min_chunk_size}
          onChange={(e) => setChunking({ min_chunk_size: parseInt(e.target.value) || 0 })}
          className="input-field"
        />
        <p className="text-[10px] th-text-muted">Potongan yang lebih pendek dari ini akan diabaikan.</p>
      </Field>

      {/* Summary */}
      <div className="th-bg-elevated rounded-xl px-4 py-3 flex flex-col gap-1 border th-border">
        <p className="text-xs font-medium th-text">Perkiraan hasil</p>
        <p className="text-[11px] th-text-muted">
          Dokumen 1.000 kata → sekitar <strong className="th-text">{estimatedChunks(1000)}</strong> potongan
          &nbsp;·&nbsp;
          Dokumen 10.000 kata → sekitar <strong className="th-text">{estimatedChunks(10000)}</strong> potongan
        </p>
        {chunking.overlap >= chunking.chunk_size && (
          <p className="text-[11px] text-amber-400 mt-1">Overlap ≥ chunk size — this will create many duplicate chunks.</p>
        )}
      </div>
    </div>
  );
}

/* ── Appearance Tab ── */
function AppearanceTab({
  theme, accentInput, setAccentInput, onChange,
}: {
  theme: ThemeConfig;
  accentInput: string;
  setAccentInput: (v: string) => void;
  onChange: (t: ThemeConfig) => void;
}) {
  const isValidHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

  const handleHexInput = (v: string) => {
    setAccentInput(v);
    if (isValidHex(v)) onChange({ ...theme, accent: v });
  };

  // Each preset: [base hex (600), label, lighter stop for gradient display]
  const PRESETS: { hex: string; label: string; from: string; to: string }[] = [
    { hex: "#7c3aed", label: "Violet",   from: "#a78bfa", to: "#6d28d9" },
    { hex: "#2563eb", label: "Biru",     from: "#60a5fa", to: "#1d4ed8" },
    { hex: "#0891b2", label: "Cyan",     from: "#22d3ee", to: "#0e7490" },
    { hex: "#0d9488", label: "Teal",     from: "#2dd4bf", to: "#0f766e" },
    { hex: "#16a34a", label: "Hijau",    from: "#4ade80", to: "#15803d" },
    { hex: "#ca8a04", label: "Kuning",   from: "#fbbf24", to: "#a16207" },
    { hex: "#ea580c", label: "Oranye",   from: "#fb923c", to: "#c2410c" },
    { hex: "#db2777", label: "Pink",     from: "#f472b6", to: "#be185d" },
    { hex: "#dc2626", label: "Merah",    from: "#f87171", to: "#b91c1c" },
    { hex: "#64748b", label: "Slate",    from: "#94a3b8", to: "#475569" },
  ];

  const modeLabel = (mode: "dark" | "light") => mode === "dark" ? "Gelap" : "Terang";

  return (
    <div className="flex flex-col gap-6">
      {/* Mode */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium th-text-muted uppercase tracking-wider">Tema Warna</p>
        <div className="flex gap-3">
          {(["dark", "light"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChange({ ...theme, mode })}
              className={clsx(
                "flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border transition-colors",
                theme.mode === mode
                  ? "border-brand-500 bg-brand-600/10 text-brand-500"
                  : "th-border th-text-muted hover:th-border hover:th-text-2"
              )}
            >
              {mode === "dark" ? <Moon size={20} /> : <Sun size={20} />}
              <span className="text-xs capitalize font-medium">{modeLabel(mode)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Accent */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium th-text-muted uppercase tracking-wider">Warna Aksen</p>

        <div className="grid grid-cols-5 gap-2">
          {PRESETS.map((p) => {
            const isActive = theme.accent === p.hex;
            return (
              <button
                key={p.hex}
                onClick={() => { setAccentInput(p.hex); onChange({ ...theme, accent: p.hex }); }}
                className={clsx(
                  "relative flex flex-col items-center gap-1.5 py-2 px-1 rounded-xl border transition-all duration-150 hover:scale-[1.03]",
                  isActive
                    ? "border-white/30 scale-[1.03]"
                    : "border-transparent hover:border-white/10"
                )}
                style={{
                  background: isActive
                    ? `linear-gradient(145deg, ${p.from}, ${p.to})`
                    : `linear-gradient(145deg, ${p.from}22, ${p.to}44)`,
                  boxShadow: isActive ? `0 4px 16px ${p.to}60` : "none",
                }}
                title={p.label}
              >
                <div
                  className="w-6 h-6 rounded-full shadow-inner"
                  style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                />
                <span className="text-[9px] font-semibold leading-none" style={{ color: isActive ? "white" : p.from }}>
                  {p.label}
                </span>
                {isActive && (
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white/80" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Color picker swatch */}
          <div className="w-8 h-8 rounded-lg border th-border shrink-0 overflow-hidden relative">
            <input
              type="color"
              value={isValidHex(accentInput) ? accentInput : theme.accent}
              onChange={(e) => { setAccentInput(e.target.value); onChange({ ...theme, accent: e.target.value }); }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="w-full h-full" style={{ backgroundColor: isValidHex(accentInput) ? accentInput : theme.accent }} />
          </div>
          <input
            value={accentInput}
            onChange={(e) => handleHexInput(e.target.value)}
            placeholder="#0284c7"
            maxLength={7}
            className={clsx("input-field font-mono text-sm", accentInput && !isValidHex(accentInput) ? "border-red-500" : "")}
          />
        </div>

        {/* Preview */}
        {(() => {
          const activePreset = PRESETS.find(p => p.hex === theme.accent);
          const from = activePreset?.from ?? theme.accent;
          const to = activePreset?.to ?? theme.accent;
          return (
            <div className="rounded-xl border th-border overflow-hidden">
              <div className="px-3 py-2 th-bg-elevated text-[10px] th-text-muted uppercase tracking-wider">Pratinjau</div>
              <div className="p-4 flex flex-col gap-2.5 th-bg-surface">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{
                    background: `linear-gradient(135deg, ${from}, ${to})`,
                    boxShadow: `0 2px 10px ${to}55`,
                  }}
                >
                  Tombol Utama
                </button>
                <div className="flex gap-2 items-center">
                  <span
                    className="px-2 py-0.5 rounded text-[11px] font-semibold"
                    style={{ background: `${theme.accent}25`, color: from, border: `1px solid ${theme.accent}40` }}
                  >
                    Badge
                  </span>
                  <div className="h-px flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${from}, ${to})` }} />
                </div>
                <div
                  className="h-1.5 w-full rounded-full overflow-hidden"
                  style={{ background: `linear-gradient(90deg, ${from}, ${to})`, opacity: 0.7 }}
                />
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ── shared sub-components ── */
function TestConnectionRow({ label, state, message, onTest, disabled }: {
  label: string; state: TestState; message: string; onTest: () => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        onClick={onTest}
        disabled={disabled || state === "loading"}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm th-bg-elevated hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0 th-text-2"
      >
        {state === "loading" ? <Loader size={13} className="animate-spin" /> : <Zap size={13} />}
        {label}
      </button>
      {state === "ok" && (
        <span className="flex items-center gap-1 text-xs text-green-500">
          <Check size={12} /> {message}
        </span>
      )}
      {state === "error" && (
        <span className="flex items-center gap-1 text-xs text-red-400 truncate">
          <AlertCircle size={12} className="shrink-0" />
          <span className="truncate" title={message}>{message}</span>
        </span>
      )}
    </div>
  );
}

// ── Language Tab ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<Locale, string> = {
  en: "You are a helpful assistant that answers questions based on the provided documents. Always cite your sources.",
  id: "Kamu adalah asisten yang membantu menjawab pertanyaan berdasarkan dokumen yang diberikan. Selalu sebutkan sumber jawabanmu.",
};

function LanguageTab() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [showPromptSuggest, setShowPromptSuggest] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);

  const LOCALE_OPTIONS: { value: Locale; label: string; flag: string }[] = [
    { value: "en", label: t("language.en"), flag: "🇬🇧" },
    { value: "id", label: t("language.id"), flag: "🇮🇩" },
  ];

  function handleSelect(l: Locale) {
    if (l === locale) return;
    const alreadySuggested = localStorage.getItem(`ka_lang_suggested_${l}`);
    setLocale(l);
    if (!alreadySuggested) {
      setPendingLocale(l);
      setShowPromptSuggest(true);
    }
  }

  async function handleAcceptPrompt() {
    if (!pendingLocale) return;
    localStorage.setItem(`ka_lang_suggested_${pendingLocale}`, "1");
    setShowPromptSuggest(false);
    // Update system prompt in settings
    try {
      const res = await fetch("http://localhost:8001/api/settings");
      const s = await res.json();
      const updated = { ...s, chat: { ...s.chat, system_prompt: SYSTEM_PROMPTS[pendingLocale] } };
      await fetch("http://localhost:8001/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } catch {}
    setPendingLocale(null);
  }

  function handleDeclinePrompt() {
    if (pendingLocale) localStorage.setItem(`ka_lang_suggested_${pendingLocale}`, "1");
    setShowPromptSuggest(false);
    setPendingLocale(null);
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      <div className="flex flex-col gap-3">
        <p className="text-xs th-text-muted">{t("language.select")}</p>
        <div className="flex flex-col gap-2">
          {LOCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                locale === opt.value
                  ? "border-brand-500 bg-brand-600/10 th-text"
                  : "th-border th-bg-elevated th-text-2 hover:th-text"
              }`}
            >
              <span className="text-xl">{opt.flag}</span>
              <span className="text-sm font-medium">{opt.label}</span>
              {locale === opt.value && (
                <span className="ml-auto text-xs text-brand-400">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* One-time system prompt suggestion */}
      {showPromptSuggest && pendingLocale && (
        <div className="th-bg-elevated border border-brand-500/30 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-xs th-text">
            {t("language.systemPromptChanged", { lang: LOCALE_OPTIONS.find(o => o.value === pendingLocale)?.label ?? pendingLocale })}
          </p>
          <p className="text-xs th-text-muted">{t("language.systemPromptSuggest")}</p>
          <div className="text-[11px] th-text-muted bg-black/20 rounded-lg p-2 font-mono">
            {SYSTEM_PROMPTS[pendingLocale]}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAcceptPrompt}
              className="flex-1 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs transition-colors"
            >
              {t("language.systemPromptYes")}
            </button>
            <button
              onClick={handleDeclinePrompt}
              className="flex-1 py-1.5 rounded-lg th-bg-surface border th-border th-text-2 text-xs hover:th-text transition-colors"
            >
              {t("language.systemPromptNo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Database Tab ──────────────────────────────────────────────────────────────

function DatabaseTab({
  database, setDatabase, dbTest, dbSave, onTest, onSave,
}: {
  database: DatabaseConfig;
  setDatabase: (d: Partial<DatabaseConfig>) => void;
  dbTest: TestResult;
  dbSave: TestResult;
  onTest: () => void;
  onSave: () => void;
}) {
  const isPostgres = database.enabled;
  const canTest = isPostgres && !!database.host && !!database.dbname;
  const canSave = !isPostgres || (!!database.host && !!database.dbname);

  return (
    <div className="flex flex-col gap-5">
      {/* Toggle */}
      <div className="flex items-center justify-between px-4 py-3 th-bg-elevated rounded-xl border th-border">
        <div>
          <p className="text-sm font-medium th-text">Gunakan PostgreSQL</p>
          <p className="text-xs th-text-muted mt-0.5">
            {isPostgres ? "Data disimpan ke PostgreSQL server" : "Data disimpan ke SQLite (default, lokal)"}
          </p>
        </div>
        <button
          onClick={() => setDatabase({ enabled: !isPostgres })}
          className={clsx(
            "relative w-11 h-6 rounded-full transition-colors shrink-0",
            isPostgres ? "bg-brand-500" : "th-bg-base border th-border"
          )}
        >
          <span className={clsx(
            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
            isPostgres ? "translate-x-5" : "translate-x-0"
          )} />
        </button>
      </div>

      {/* Postgres fields */}
      {isPostgres && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Host">
                <input
                  value={database.host}
                  onChange={(e) => setDatabase({ host: e.target.value })}
                  placeholder="localhost"
                  className="input-field"
                />
              </Field>
            </div>
            <div className="w-28">
              <Field label="Port">
                <input
                  type="number"
                  value={database.port}
                  onChange={(e) => setDatabase({ port: parseInt(e.target.value) || 5432 })}
                  placeholder="5432"
                  className="input-field"
                />
              </Field>
            </div>
          </div>

          <Field label="Nama Database">
            <input
              value={database.dbname}
              onChange={(e) => setDatabase({ dbname: e.target.value })}
              placeholder="loqa"
              className="input-field"
            />
          </Field>

          <Field label="Username">
            <input
              value={database.user}
              onChange={(e) => setDatabase({ user: e.target.value })}
              placeholder="postgres"
              className="input-field"
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              value={database.password}
              onChange={(e) => setDatabase({ password: e.target.value })}
              placeholder="••••••••"
              className="input-field"
            />
          </Field>

          <TestConnectionRow
            label="Tes Koneksi"
            state={dbTest.state}
            message={dbTest.message}
            onTest={onTest}
            disabled={!canTest}
          />
        </div>
      )}

      {/* Info box */}
      <div className="th-bg-elevated rounded-xl px-4 py-3 flex flex-col gap-1.5 border th-border text-xs th-text-muted">
        {isPostgres ? (
          <>
            <p className="font-medium th-text-2">Catatan PostgreSQL</p>
            <p>• Database harus sudah dibuat sebelumnya di server PostgreSQL.</p>
            <p>• Migrasi tabel dijalankan otomatis saat pertama kali terhubung.</p>
            <p>• Data SQLite lama tidak akan dipindahkan secara otomatis.</p>
          </>
        ) : (
          <>
            <p className="font-medium th-text-2">Mode SQLite (Default)</p>
            <p>• Data disimpan di file lokal di folder data aplikasi.</p>
            <p>• Tidak memerlukan konfigurasi tambahan.</p>
            <p>• Cocok untuk penggunaan pribadi di satu perangkat.</p>
          </>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onSave}
          disabled={!canSave || dbSave.state === "loading"}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors"
        >
          {dbSave.state === "loading"
            ? <><Loader size={14} className="animate-spin" /> Menyimpan…</>
            : dbSave.state === "ok"
            ? <><Check size={14} /> Tersimpan</>
            : <><Check size={14} /> Simpan Konfigurasi</>}
        </button>
        {dbSave.state === "ok" && (
          <span className="text-xs text-green-500">{dbSave.message}</span>
        )}
        {dbSave.state === "error" && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle size={12} className="shrink-0" />
            <span className="truncate" title={dbSave.message}>{dbSave.message}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium th-text-2">{label}</label>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      {children}
    </div>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const { status, lock, setTimeout: setLockTimeout, refresh } = useLock();
  const t = useT();
  const [showSetup, setShowSetup] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const [timeoutVal, setTimeoutVal] = useState(status?.timeout_minutes ?? 30);

  const TIMEOUT_OPTIONS = [5, 10, 15, 30, 60, 120, 0] as const;
  const timeoutLabel = (m: number) => m === 0 ? t("security.never") : m < 60 ? `${m} min` : `${m / 60}h`;

  async function handleTimeoutChange(m: number) {
    setTimeoutVal(m);
    await setLockTimeout(m === 0 ? 99999 : m);
  }

  if (!status) return null;
  // eslint-disable-next-line react/display-name
  return (
    <div className="flex flex-col gap-5 py-2">
      {/* PIN Setup */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-brand-400" />
          <span className="text-sm font-semibold th-text">{t("security.title")}</span>
        </div>

        {!status.pin_set ? (
          <div className="th-bg-elevated rounded-xl p-4 flex flex-col gap-3">
            <p className="text-xs th-text-muted">{t("security.description")}</p>
            <button
              onClick={() => setShowSetup(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm transition-colors w-fit"
            >
              <Lock size={14} />
              {t("security.createPin")}
            </button>
          </div>
        ) : (
          <div className="th-bg-elevated rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${status.unlocked ? "bg-green-400" : "bg-amber-400"}`} />
              <span className="text-xs th-text">
                {status.unlocked ? t("security.sessionActive") : t("security.sessionLocked")}
              </span>
              {status.unlocked && status.remaining_seconds > 0 && (
                <span className="text-[10px] th-text-muted ml-auto flex items-center gap-1">
                  <Timer size={10} />
                  {t("security.remainingTime", { n: Math.ceil(status.remaining_seconds / 60) })}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {status.unlocked && (
                <button
                  onClick={async () => { await lock(); await refresh(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg th-bg-surface border th-border text-xs th-text-2 hover:th-text transition-colors"
                >
                  <Lock size={12} />
                  {t("security.lockNow")}
                </button>
              )}
              <button
                onClick={() => setShowChange(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg th-bg-surface border th-border text-xs th-text-2 hover:th-text transition-colors"
              >
                <LockOpen size={12} />
                {t("security.changePin")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Timeout Setting */}
      {status.pin_set && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Timer size={15} className="text-brand-400" />
            <span className="text-sm font-semibold th-text">{t("security.autoLock")}</span>
          </div>
          <p className="text-xs th-text-muted -mt-1">{t("security.autoLockDesc")}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {TIMEOUT_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => handleTimeoutChange(m)}
                className={`py-2 rounded-lg text-xs transition-colors ${
                  timeoutVal === m || (m === 0 && timeoutVal > 120)
                    ? "bg-brand-600 text-white"
                    : "th-bg-elevated th-text-muted hover:th-text border th-border"
                }`}
              >
                {timeoutLabel(m)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="th-bg-elevated rounded-xl p-4 flex flex-col gap-1.5">
        <p className="text-xs font-medium th-text-2">{t("security.howItWorks")}</p>
        <ul className="text-[11px] th-text-muted space-y-1 list-disc list-inside">
          <li>{t("security.fact1")}</li>
          <li>{t("security.fact2")}</li>
          <li>{t("security.fact3")}</li>
          <li>{t("security.fact4")}</li>
        </ul>
      </div>

      {showSetup && <LockSetupModal mode="setup" onClose={() => { setShowSetup(false); refresh(); }} />}
      {showChange && <LockSetupModal mode="change" onClose={() => { setShowChange(false); refresh(); }} />}
    </div>
  );
}
