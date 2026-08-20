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
  chat_mode: "rag" | "chat_only" | "finance" | "inventory" | "unified";
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

export type FeeType = "shipping" | "tax" | "discount" | "other";

export interface TransactionFee {
  label: string;
  fee_type: FeeType;
  amount: number;
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
  fees?: TransactionFee[] | null;
  grand_total?: number;
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
  fees?: TransactionFee[];
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

// ── Inventory ─────────────────────────────────────────────────────────────────

export type MovementType = "in" | "out" | "opname" | "adjustment";
export type CostMethod = "fifo" | "average" | "fixed";
export type ProductType = "physical" | "service" | "digital";

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

export interface ProductProfitRow {
  product_id: number;
  product_name: string;
  product_sku: string | null;
  variant_id: number;
  variant_name: string;
  sku_suffix: string | null;
  unit: string;
  qty_sold: number;
  revenue: number;
  cogs_fifo: number;
  cogs_average: number;
  cogs_fixed: number;
  profit_fifo: number;
  profit_average: number;
  profit_fixed: number;
  margin_fifo: number;
  margin_average: number;
  margin_fixed: number;
  stock_qty: number;
  stock_value: number;
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

export interface ProductImage {
  id: number;
  product_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  created_at: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  min_stock: number;
  active: number;
  is_for_sale: number;
  type: ProductType | null;
  cost_method: CostMethod | null;
  description: string | null;
  variants: ProductVariant[];
  images: ProductImage[];
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
  finance_account_id: number | null;
  finance_category_id: number | null;
  link_finance: boolean;
  // cost breakdown per method (only present on "out" movements)
  cost_fifo: number | null;
  cost_average: number | null;
  cost_fixed: number | null;
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

// ── Order ─────────────────────────────────────────────────────────────────────

export type OrderStatus = "draft" | "waiting_for_payment" | "on_process" | "completed" | "cancelled";

export interface City {
  id: number;
  name: string;
  created_at: number;
}

export interface District {
  id: number;
  city_id: number;
  city_name: string;
  name: string;
  created_at: number;
}

export interface Village {
  id: number;
  district_id: number;
  district_name: string;
  city_name: string;
  name: string;
  created_at: number;
}

export interface ShippingAddress {
  id: number;
  label: string;
  recipient_name: string | null;
  phone: string | null;
  city_id: number | null;
  city_name: string | null;
  district_id: number | null;
  district_name: string | null;
  village_id: number | null;
  village_name: string | null;
  detail: string | null;
  created_at: number;
  updated_at: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  variant_id: number;
  variant_name: string;
  sku_suffix: string | null;
  product_name: string;
  product_sku: string | null;
  unit: string;
  qty: number;
  selling_price: number;
  subtotal: number;
  cost_method: string | null;
  movement_id: number | null;
  finance_tx_id: number | null;
  product_image: string | null;
  created_at: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  status: OrderStatus;
  shipping_address_id: number | null;
  address_label: string | null;
  recipient_name: string | null;
  address_phone: string | null;
  city_name: string | null;
  district_name: string | null;
  village_name: string | null;
  address_detail: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  account_id: number | null;
  category_id: number | null;
  cost_method: CostMethod;
  total_amount: number;
  date: string;
  created_at: number;
  updated_at: number;
  items: OrderItem[];
}

export interface BarcodeResult {
  variant_id: number;
  variant_name: string;
  sku_suffix: string | null;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  unit: string;
  selling_price: number | null;
  fixed_cost: number | null;
  is_for_sale: number;
  product_image: string | null;
  stock_levels: { warehouse_id: number; warehouse_name: string; qty: number; avg_cost: number }[];
}

export interface OrderSettings {
  default_account_id: number | null;
  default_category_id: number | null;
  default_cost_method: CostMethod;
  default_warehouse_id: number | null;
}

export interface CartItem {
  variant_id: number;
  variant_name: string;
  product_name: string;
  product_sku: string | null;
  sku_suffix: string | null;
  unit: string;
  qty: number;
  selling_price: number;
  cost_method: string;
  product_image: string | null;
}

export interface KasirSuggestion {
  variant_id: number;
  variant_name: string;
  sku_suffix: string | null;
  selling_price: number | null;
  fixed_cost: number | null;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  unit: string;
  product_image: string | null;
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

// ─── Project ──────────────────────────────────────────────────────────────────

export type ProjectStatus = "active" | "completed" | "on_hold" | "cancelled";
export type WorkerRateType = "daily" | "fixed" | "percent";
export type WorkerStatus = "active" | "done";
export type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled";

export interface Project {
  id: number;
  name: string;
  client_name: string | null;
  client_contact: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  contract_value: number | null;
  description: string | null;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface ProjectBudgetItem {
  id: number;
  project_id: number;
  category: string;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  total_price: number;
  created_at: number;
  updated_at: number;
}

export interface ProjectWorker {
  id: number;
  project_id: number;
  name: string;
  role: string | null;
  rate_type: WorkerRateType;
  rate_amount: number;
  status: WorkerStatus;
  note: string | null;
  total_paid: number | null;
  created_at: number;
  updated_at: number;
}

export interface ProjectWorkerPayment {
  id: number;
  worker_id: number;
  project_id: number;
  amount: number;
  date: string;
  note: string | null;
  link_finance: number;
  finance_tx_id: number | null;
  worker_name: string;
  worker_role: string | null;
  created_at: number;
}

export interface ProjectInvoice {
  id: number;
  project_id: number;
  invoice_number: string;
  amount: number;
  status: InvoiceStatus;
  issued_date: string;
  due_date: string | null;
  paid_date: string | null;
  note: string | null;
  link_finance: number;
  finance_tx_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface ProjectDashboard {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  on_hold_projects: number;
  total_contract_value: number;
  total_rab: number;
  total_paid_workers: number;
  invoices_pending_count: number;
  invoices_pending_value: number;
  recent_projects: (Project & { rab_total: number | null; paid_workers: number | null; worker_count: number })[];
}
