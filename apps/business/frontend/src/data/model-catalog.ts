export type ModelTag =
  | "multilingual"
  | "math"
  | "coding"
  | "vision"
  | "audio"
  | "thinking"
  | "fast";

export interface CatalogModel {
  id: string;
  name: string;
  family: string;
  repo_id: string;
  filename: string;
  size_gb: number;
  ram_gb: number;
  context_k: number;       // context window in thousands of tokens
  languages: string;       // factual claim from model card, e.g. "119 bahasa"
  tags: ModelTag[];
  personas: string[];
  specs: string[];         // verifiable facts only: features, capabilities
}

export interface EmbedCatalogModel {
  id: string;
  name: string;
  repo_id: string;
  size_mb: number;
  ram_mb: number;
  dimensions: number;
  languages: string;
  specs: string[];
}

// ── Chat Models ────────────────────────────────────────────────────────────────
// specs: only verifiable facts from official model cards
// No performance claims, no "best", no comparative language

export const CHAT_MODEL_CATALOG: CatalogModel[] = [

  // ── Qwen3.5 ─────────────────────────────────────────────────────────────────
  {
    id: "qwen3.5-4b",
    name: "Qwen3.5 4B",
    family: "Qwen3.5",
    repo_id: "unsloth/Qwen3.5-4B-GGUF",
    filename: "Qwen3.5-4B-Q4_K_M.gguf",
    size_gb: 2.74,
    ram_gb: 6,
    context_k: 262,
    languages: "201 bahasa",
    tags: ["multilingual", "math", "coding", "vision", "thinking"],
    personas: ["knowledge", "finance", "code", "general"],
    specs: [
      "201 bahasa & dialek",
      "Context 262K token",
      "Multimodal: teks + gambar",
      "Thinking mode (on/off)",
      "Tool use & function calling",
    ],
  },

  // ── Qwen3 ───────────────────────────────────────────────────────────────────
  {
    id: "qwen3-8b",
    name: "Qwen3 8B",
    family: "Qwen3",
    repo_id: "unsloth/Qwen3-8B-GGUF",
    filename: "Qwen3-8B-Q4_K_M.gguf",
    size_gb: 5.03,
    ram_gb: 8,
    context_k: 131,
    languages: "119 bahasa",
    tags: ["multilingual", "math", "coding", "thinking"],
    personas: ["knowledge", "finance", "code", "general"],
    specs: [
      "119 bahasa",
      "Context 32K native, 131K dengan YaRN",
      "Thinking mode (on/off)",
      "Tool use & function calling",
      "8.2B parameter",
    ],
  },
  {
    id: "qwen3-4b",
    name: "Qwen3 4B",
    family: "Qwen3",
    repo_id: "unsloth/Qwen3-4B-GGUF",
    filename: "Qwen3-4B-Q4_K_M.gguf",
    size_gb: 2.5,
    ram_gb: 6,
    context_k: 131,
    languages: "119 bahasa",
    tags: ["multilingual", "math", "coding", "thinking"],
    personas: ["knowledge", "finance", "code", "general"],
    specs: [
      "119 bahasa",
      "Context 32K native, 131K dengan YaRN",
      "Thinking mode (on/off)",
      "Tool use & function calling",
    ],
  },
  {
    id: "qwen3-1.7b",
    name: "Qwen3 1.7B",
    family: "Qwen3",
    repo_id: "unsloth/Qwen3-1.7B-GGUF",
    filename: "Qwen3-1.7B-Q4_K_M.gguf",
    size_gb: 1.1,
    ram_gb: 4,
    context_k: 131,
    languages: "119 bahasa",
    tags: ["multilingual", "thinking", "fast"],
    personas: ["knowledge", "finance", "general"],
    specs: [
      "119 bahasa",
      "Context 32K native, 131K dengan YaRN",
      "Thinking mode (on/off)",
      "1.7B parameter",
    ],
  },
  {
    id: "qwen3-0.6b",
    name: "Qwen3 0.6B",
    family: "Qwen3",
    repo_id: "unsloth/Qwen3-0.6B-GGUF",
    filename: "Qwen3-0.6B-Q4_K_M.gguf",
    size_gb: 0.4,
    ram_gb: 2,
    context_k: 32,
    languages: "119 bahasa",
    tags: ["multilingual", "thinking", "fast"],
    personas: ["general"],
    specs: [
      "119 bahasa",
      "Context 32K token",
      "Thinking mode (on/off)",
      "0.6B parameter",
    ],
  },

  // ── Qwen2.5 ─────────────────────────────────────────────────────────────────
  {
    id: "qwen2.5-3b",
    name: "Qwen2.5 3B",
    family: "Qwen2.5",
    repo_id: "bartowski/Qwen2.5-3B-Instruct-GGUF",
    filename: "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    size_gb: 1.9,
    ram_gb: 4,
    context_k: 128,
    languages: "29+ bahasa",
    tags: ["multilingual", "math", "coding"],
    personas: ["knowledge", "finance", "general"],
    specs: [
      "29+ bahasa",
      "Context 128K token",
      "Instruction following",
      "Tool use",
    ],
  },

  // ── Gemma 4 ─────────────────────────────────────────────────────────────────
  {
    id: "gemma4-e4b",
    name: "Gemma 4 E4B",
    family: "Gemma 4",
    repo_id: "unsloth/gemma-4-E4B-it-GGUF",
    filename: "gemma-4-E4B-it-Q4_K_M.gguf",
    size_gb: 4.98,
    ram_gb: 8,
    context_k: 128,
    languages: "140+ bahasa (pre-training)",
    tags: ["multilingual", "vision", "audio", "thinking"],
    personas: ["knowledge", "general"],
    specs: [
      "140+ bahasa pre-training",
      "Context 128K token",
      "Multimodal: teks + gambar + audio",
      "Thinking mode built-in",
      "Function calling",
      "4.5B parameter aktif (8B total embedding)",
    ],
  },
  {
    id: "gemma4-e2b",
    name: "Gemma 4 E2B",
    family: "Gemma 4",
    repo_id: "unsloth/gemma-4-E2B-it-GGUF",
    filename: "gemma-4-E2B-it-Q4_K_M.gguf",
    size_gb: 3.11,
    ram_gb: 6,
    context_k: 128,
    languages: "140+ bahasa (pre-training)",
    tags: ["multilingual", "vision", "audio", "fast"],
    personas: ["knowledge", "general"],
    specs: [
      "140+ bahasa pre-training",
      "Context 128K token",
      "Multimodal: teks + gambar + audio",
      "Function calling",
      "2.3B parameter aktif (5.1B total embedding)",
    ],
  },

  // ── Gemma 3 ─────────────────────────────────────────────────────────────────
  {
    id: "gemma3-4b",
    name: "Gemma 3 4B",
    family: "Gemma 3",
    repo_id: "unsloth/gemma-3-4b-it-GGUF",
    filename: "gemma-3-4b-it-Q4_K_M.gguf",
    size_gb: 2.5,
    ram_gb: 6,
    context_k: 128,
    languages: "140+ bahasa (pre-training)",
    tags: ["multilingual", "vision"],
    personas: ["knowledge", "general"],
    specs: [
      "140+ bahasa pre-training",
      "Context 128K token",
      "Multimodal: teks + gambar",
    ],
  },
  {
    id: "gemma3-1b",
    name: "Gemma 3 1B",
    family: "Gemma 3",
    repo_id: "unsloth/gemma-3-1b-it-GGUF",
    filename: "gemma-3-1b-it-Q4_K_M.gguf",
    size_gb: 0.8,
    ram_gb: 3,
    context_k: 128,
    languages: "140+ bahasa (pre-training)",
    tags: ["multilingual", "vision", "fast"],
    personas: ["general"],
    specs: [
      "140+ bahasa pre-training",
      "Context 128K token",
      "Multimodal: teks + gambar",
      "1B parameter",
    ],
  },

  // ── Phi-4 ────────────────────────────────────────────────────────────────────
  {
    id: "phi4-mini",
    name: "Phi-4 Mini",
    family: "Phi-4",
    repo_id: "unsloth/Phi-4-mini-instruct-GGUF",
    filename: "Phi-4-mini-instruct-Q4_K_M.gguf",
    size_gb: 2.5,
    ram_gb: 6,
    context_k: 128,
    languages: "Bahasa Inggris (utama)",
    tags: ["math", "coding"],
    personas: ["code", "finance"],
    specs: [
      "Context 128K token",
      "Fokus Bahasa Inggris",
      "Function calling",
      "3.8B parameter",
    ],
  },

  // ── Llama 3.2 ────────────────────────────────────────────────────────────────
  {
    id: "llama3.2-3b",
    name: "Llama 3.2 3B",
    family: "Llama 3.2",
    repo_id: "unsloth/Llama-3.2-3B-Instruct-GGUF",
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    size_gb: 2.0,
    ram_gb: 5,
    context_k: 128,
    languages: "8 bahasa resmi (EN, DE, FR, IT, PT, HI, ES, TH)",
    tags: ["fast"],
    personas: ["general"],
    specs: [
      "8 bahasa resmi",
      "Context 128K token",
      "Instruction following",
      "3B parameter",
    ],
  },
];

// ── Embed Models ───────────────────────────────────────────────────────────────

export const EMBED_MODEL_CATALOG: EmbedCatalogModel[] = [
  {
    id: "nomic-embed-v1",
    name: "Nomic Embed Text v1",
    repo_id: "nomic-ai/nomic-embed-text-v1",
    size_mb: 274,
    ram_mb: 500,
    dimensions: 768,
    languages: "Multibahasa",
    specs: [
      "768 dimensi",
      "Context 8192 token",
      "Memerlukan trust_remote_code=True",
    ],
  },
  {
    id: "multilingual-e5-small",
    name: "Multilingual E5 Small",
    repo_id: "intfloat/multilingual-e5-small",
    size_mb: 118,
    ram_mb: 250,
    dimensions: 384,
    languages: "100+ bahasa",
    specs: [
      "384 dimensi",
      "100+ bahasa",
      "Context 512 token",
    ],
  },
  {
    id: "paraphrase-multilingual",
    name: "Paraphrase Multilingual MiniLM L12",
    repo_id: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    size_mb: 118,
    ram_mb: 250,
    dimensions: 384,
    languages: "50+ bahasa",
    specs: [
      "384 dimensi",
      "50+ bahasa",
      "Context 128 token",
      "Dioptimalkan untuk sentence similarity",
    ],
  },
];

// ── Tag metadata ───────────────────────────────────────────────────────────────

export const TAG_LABELS: Record<ModelTag, string> = {
  multilingual: "Multibahasa",
  math:         "Matematika",
  coding:       "Coding",
  vision:       "Gambar",
  audio:        "Audio",
  thinking:     "Thinking Mode",
  fast:         "Ringan",
};

export const TAG_COLORS: Record<ModelTag, string> = {
  multilingual: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  math:         "bg-purple-500/15 text-purple-400 border-purple-500/30",
  coding:       "bg-green-500/15 text-green-400 border-green-500/30",
  vision:       "bg-pink-500/15 text-pink-400 border-pink-500/30",
  audio:        "bg-orange-500/15 text-orange-400 border-orange-500/30",
  thinking:     "bg-violet-500/15 text-violet-400 border-violet-500/30",
  fast:         "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export function getModelsForPersona(persona: string): CatalogModel[] {
  return CHAT_MODEL_CATALOG.filter((m) => m.personas.includes(persona));
}
