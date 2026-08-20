export interface Citation {
  index: number;
  source: string;
  page: number | null;
  chunk_index: number | null;
  score: number;
  excerpt: string;
}

export type MessageActionType = "tool_call" | "tool_result" | "tool_error" | "context_injection";

export interface MessageAction {
  action: MessageActionType;
  label: string;
  detail: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  loading?: boolean;
  offline?: boolean;
  error?: boolean;
  metrics?: MessageMetrics;
  thinking?: string;
  actions?: MessageAction[];
}

export interface KbInfo {
  kb_id: string;
  consistent: boolean;
  file_count: number;
  locked?: boolean;
}

export interface ConsistencyReport {
  consistent: boolean;
  files: Record<string, {
    manifest_hash: string | null;
    models: Record<string, { hash: string | null; status: "ok" | "outdated" | "missing" }>;
  }>;
}

export interface ReindexPlan {
  new_model: string;
  total_mb: number;
  tier: 1 | 2 | 3;
  requires_confirmation: boolean;
  kb_count: number;
  file_count: number;
}

export interface MessageMetrics {
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

export interface SessionMetrics {
  session_id: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  message_count: number;
  rag_count: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  session_duration_s: number;
}

export interface PeriodMetrics {
  period: string;
  messages: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  rag_count: number;
  sessions: number;
  by_model: { model_name: string; provider: string; input_tokens: number; output_tokens: number; messages: number; avg_latency: number }[];
  timeline: { label: string; tokens: number; messages: number }[];
}

export interface KbMetrics {
  kb_id: string;
  chunks: number;
  docs: number;
  ts: number;
}

export interface ChatModelConfig {
  provider: "local" | "ollama" | "openai" | "gemini" | "deepseek" | "openai_compatible";
  model_name: string;
  endpoint?: string;
  api_key?: string;
  temperature: number;
  max_tokens: number;
  supports_tools?: boolean;
  system_prompt: string;
}

export interface EmbedModelConfig {
  provider: "local" | "ollama" | "openai" | "gemini";
  model_name: string;
  api_key?: string;
  endpoint?: string;
}

export interface RerankerConfig {
  enabled: boolean;
  provider: "local" | "ollama" | "cohere";
  model_name: string;
  api_key?: string;
  endpoint?: string;
  top_k: number;
  initial_fetch: number;
}

export interface ReindexThresholds {
  tier1_mb: number;
  tier2_mb: number;
}

export interface ThemeConfig {
  mode: "dark" | "light";
  accent: string;
}

export interface ChunkingConfig {
  strategy: "word" | "sentence" | "paragraph";
  chunk_size: number;
  overlap: number;
  min_chunk_size: number;
}

export interface DatabaseConfig {
  enabled: boolean;
  host: string;
  port: number;
  dbname: string;
  user: string;
  password: string;
}

export interface AppSettings {
  chat: ChatModelConfig;
  embed: EmbedModelConfig;
  reranker?: RerankerConfig;
  reindex_thresholds?: ReindexThresholds;
  theme?: ThemeConfig;
  chunking?: ChunkingConfig;
  database?: DatabaseConfig;
}

export interface LocalModel {
  name: string;
  size_mb: number;
  type: string;
  path: string;
  partial?: boolean;
  repo_id?: string;
}

export interface HFFile {
  filename: string;
  url: string;
}

export interface Conversation {
  id: string;
  title: string;
  kb_id: string | null;
  created_at: number;
  updated_at: number;
  pinned: number;
  locked: number;
  chat_mode: "rag" | "chat_only" | "finance" | "unified";
  pocket_id: number | null;
  summary?: string | null;
  persona_prompt?: string | null;
}

export interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  created_at: number;
  failed?: number;
}

export interface ConversationDetail extends Conversation {
  messages: PersistedMessage[];
}

// ── Finance ───────────────────────────────────────────────────────────────────

export type AccountType = "cash" | "bank" | "ewallet" | "credit" | "investment" | "other";
export type TransactionType = "income" | "expense" | "transfer";
export type PLType = "gross_income" | "cogs" | null;

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  color: string;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  pl_type: PLType;
  created_at: number;
}

export interface PLMonthRow {
  month: string;
  gross_income: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  opex: number;
  other_income: number;
  net_profit: number;
  net_margin: number;
}

export interface Pocket {
  id: number;
  name: string;
  color: string;
  icon: string;
  locked: number;
  created_at: number;
  updated_at: number;
}

export interface Transaction {
  id: number;
  account_id: number;
  category_id: number | null;
  pocket_id: number | null;
  to_account_id: number | null;
  type: TransactionType;
  amount: number;
  date: string;
  description: string | null;
  note: string | null;
  tags: string | null;
  created_at: number;
  updated_at: number;
  // joined fields
  account_name: string;
  currency: string;
  to_account_name: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  pocket_name: string | null;
  pocket_locked: number | null; // 1 = locked, 0 = unlocked, null = no pocket
}

export interface TransactionDraft {
  account_id: number | null;
  category_id: number | null;
  pocket_id: number | null;
  to_account_id: number | null;
  type: TransactionType;
  amount: string;       // string for form input
  date: string;
  description: string;
  note: string;
  tags: string;
}

export interface FinanceSummary {
  total_income: number;
  total_expense: number;
  net: number;
  tx_count: number;
  total_balance: number;
  by_category: {
    name: string | null;
    color: string | null;
    icon: string | null;
    type: TransactionType;
    total: number;
    count: number;
  }[];
}

export interface FinancialGoal {
  id: number;
  name: string;
  target_amount: number;
  saved_amount: number;
  deadline: string | null;
  color: string;
  icon: string;
  note: string | null;
  created_at: number;
  updated_at: number;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export type MovementType = "in" | "out" | "opname" | "adjustment";
export type CostMethod = "fifo" | "average" | "fixed";

export interface Warehouse {
  id: number;
  name: string;
  location: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface ProductCategory {
  id: number;
  name: string;
  color: string;
  created_at: number;
}

export interface Brand {
  id: number;
  name: string;
  description: string | null;
  product_count: number;
  created_at: number;
  updated_at: number;
}

export interface InvCategory {
  id: number;
  name: string;
  description: string | null;
  subcategory_count: number;
  created_at: number;
  updated_at: number;
}

export interface Subcategory {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  description: string | null;
  product_count: number;
  created_at: number;
  updated_at: number;
}

export interface BrandReportRow {
  brand_id: number;
  brand_name: string;
  product_count: number;
  stock_value: number;
  hpp_month: number;
  revenue_month: number;
  margin_month: number;
  margin_pct: number;
}

export interface CategoryReportRow {
  category_id: number;
  category_name: string;
  subcategory_id: number | null;
  subcategory_name: string | null;
  product_count: number;
  stock_value: number;
  hpp_month: number;
  revenue_month: number;
  margin_month: number;
  margin_pct: number;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  name: string;
  sku_suffix: string | null;
  fixed_cost: number | null;
  selling_price: number | null;
  default_unit_cost: number | null;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  min_stock: number;
  active: number;
  is_for_sale: number;
  variants: ProductVariant[];
  created_at: number;
  updated_at: number;
  // joined fields
  brand_id: number | null;
  brand_name: string | null;
  subcategory_id: number | null;
  subcategory_name: string | null;
  category_id: number | null;
  category_name: string | null;
}

export interface StockLevel {
  variant_id: number;
  warehouse_id: number;
  qty: number;
  avg_cost: number;
  variant_name: string;
  sku_suffix: string | null;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  unit: string;
  min_stock: number;
  category_name: string | null;
  category_color: string | null;
  warehouse_name: string;
}

export interface StockMovement {
  id: number;
  variant_id: number;
  warehouse_id: number;
  type: MovementType;
  qty: number;
  unit_cost: number | null;
  cost_method: CostMethod | null;
  total_cost: number | null;
  selling_price: number | null;
  note: string | null;
  date: string;
  finance_tx_id: number | null;
  finance_linked: number;
  created_at: number;
  // joined
  variant_name: string;
  sku_suffix: string | null;
  product_name: string;
  unit: string;
  warehouse_name: string;
}

export interface InventoryDashboard {
  total_asset_value: number;
  trade_asset_value: number;
  operational_asset_value: number;
  hpp_this_month: number;
  annual_cogs: number;
  inventory_turnover: number;
  low_stock_count: number;
  gross_revenue_month: number;
  gross_margin_month: number;
  gross_margin_pct: number;
  monthly_hpp: { month: string; hpp: number }[];
  low_stock_items: {
    product_name: string;
    variant_name: string;
    qty: number;
    min_stock: number;
    unit: string;
    warehouse_name: string;
    avg_cost: number;
  }[];
}

// ── Personal Inventory ────────────────────────────────────────────────────────

export interface InvLocation {
  id: number;
  name: string;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface InvCategory {
  id: number;
  name: string;
  color: string;
  item_count: number;
  created_at: number;
}

export interface InvItem {
  id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  location_id: number | null;
  location_name: string | null;
  unit: string;
  qty: number;
  min_qty: number;
  note: string | null;
  active: number;
  created_at: number;
  updated_at: number;
}

export type InvMovementType = "in" | "out" | "adjustment";

export interface InvMovement {
  id: number;
  item_id: number;
  item_name: string;
  unit: string;
  location_id: number | null;
  location_name: string | null;
  type: InvMovementType;
  qty: number;
  note: string | null;
  date: string;
  created_at: number;
}

export interface InvDashboard {
  total_items: number;
  low_stock_count: number;
  low_stock_items: {
    id: number;
    name: string;
    qty: number;
    min_qty: number;
    unit: string;
    location_name: string | null;
    category_name: string | null;
    category_color: string | null;
  }[];
  by_category: { category_name: string; color: string; item_count: number; total_qty: number }[];
  by_location: { location_name: string; item_count: number }[];
  recent_movements: InvMovement[];
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export interface NoteFolder {
  id: number;
  name: string;
  color: string;
  icon: string;
  parent_id: number | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface NoteListItem {
  id: number;
  title: string;
  folder_id: number | null;
  pinned: number;
  kb_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface Note extends NoteListItem {
  content: string;
}

export interface NoteBacklink {
  id: number;
  title: string;
  updated_at: number;
}

export interface NoteSearchResult {
  id: number;
  title: string;
  folder_id: number | null;
  updated_at: number;
  excerpt: string;
}

export interface NoteGraphData {
  nodes: { id: number; title: string }[];
  links: { source: number; target: number }[];
}

// ── Habit Tracker ─────────────────────────────────────────────────────────────

export interface Habit {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequency: number[]; // 0=Sun … 6=Sat
  reminder_time: string | null; // "HH:MM"
  active: number; // 1 | 0
  created_at: number;
  updated_at: number;
}

export interface HabitWithStatus extends Habit {
  checked_today: boolean;
}

export interface HabitStats {
  total: number;
  current_streak: number;
  longest_streak: number;
  rate_7: number;
  rate_30: number;
  heatmap: { date: string; checked: boolean }[];
}

export interface HabitCheckInResult {
  checked: boolean;
  date: string;
}
