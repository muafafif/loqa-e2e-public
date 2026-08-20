# LOQA — CLAUDE.md

Dual-app AI knowledge base + finance + inventory + POS system with subscription licensing. Users upload documents, chat with them using RAG, track finances, manage inventory, and process orders — all running locally. Two separate apps share the same codebase structure but serve different personas. Access is gated by a license key (Starter / Pro / Business tier) validated on activation; after that the app runs fully offline.

---

## Apps Overview

| App | Nama | Purpose | Backend port | Frontend port |
|-----|------|---------|-------------|--------------|
| **personal** | LOQA Home | Personal finance + AI assistant | `8000` | `3000` |
| **business** | LOQA Work | Business finance + inventory + AI assistant | `8001` | `3002` |

Both apps are structurally identical for shared features. Features explicitly scoped to one app (e.g., Inventory and Order are business-only) are NOT synced. When syncing frontend files, the only mechanical difference is the port number (`8001` ↔ `8000`).

---

## Project Structure

```
knowledge-ai/
├── apps/
│   ├── personal/
│   │   ├── backend/          # FastAPI, port 8000
│   │   │   ├── app/
│   │   │   │   ├── api/      # Routers: chat, knowledge, models, settings,
│   │   │   │   │              #   metrics, conversations, lock, finance
│   │   │   │   ├── core/     # config.py — paths, env settings
│   │   │   │   ├── models/   # Pydantic models
│   │   │   │   └── services/ # Business logic
│   │   │   ├── models/       # Downloaded GGUF + embed model files
│   │   │   ├── data/         # chromadb/, settings.json, finance.db
│   │   │   ├── requirements.txt
│   │   │   └── .venv/
│   │   ├── frontend/         # Next.js 14, port 3000
│   │   │   └── src/
│   │   │       ├── app/      # page.tsx — root layout
│   │   │       ├── components/
│   │   │       │   ├── chat/
│   │   │       │   ├── finance/
│   │   │       │   ├── knowledge/
│   │   │       │   ├── analytics/
│   │   │       │   ├── lock/
│   │   │       │   └── settings/
│   │   │       ├── lib/      # api.ts, financeApi.ts, exportPdf.ts,
│   │   │       │              # LockContext.tsx, ConnectionContext.tsx,
│   │   │       │              # ThemeContext.tsx, i18n/
│   │   │       └── types/    # index.ts — all shared TS types
│   │   └── tauri-app/        # Desktop wrapper
│   └── business/             # Identical structure; ports 8001/3002
│       ├── backend/
│       ├── frontend/
│       └── tauri-app/
├── shell/                    # Launcher UI (port 3001), lets user choose app
├── start.sh                  # Start any app: ./start.sh [personal|business]
├── Makefile                  # Dev commands
└── CLAUDE.md
```

---

## Running the Apps

```bash
# Recommended — starts backend + frontend + opens browser
./start.sh personal      # http://localhost:3000
./start.sh business      # http://localhost:3002
./start.sh               # shell launcher at http://localhost:3001

# Or via make (parallel)
make dev-personal        # personal backend:8000 + frontend:3000
make dev-business        # business backend:8001 + frontend:3002

# Individual processes
make dev-backend                  # personal backend only
make dev-frontend                 # personal frontend only
make dev-business-backend         # business backend only
make dev-business-frontend        # business frontend only
```

**Always use `.venv/bin/uvicorn` or `.venv/bin/python` — never system Python.**

```bash
# Restart a stuck backend
lsof -i :8001 | grep LISTEN     # find PID
kill <PID>
cd apps/business/backend && .venv/bin/uvicorn app.main:app --reload --port 8001
```

`--reload` spawns watcher + worker. Ctrl+C may leave worker alive — `kill <PID>` on the child if port stays occupied.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI + Python 3.11, SQLite (WAL mode) atau PostgreSQL |
| Frontend | Next.js 14 (App Router), Tailwind CSS, TypeScript |
| Desktop | Tauri wrapper (optional — both apps run in browser too) |
| Local LLM | llama-cpp-python (GGUF models) |
| Embeddings | sentence-transformers (local) or OpenAI/Gemini API |
| Reranker | sentence-transformers CrossEncoder or Cohere API |
| Vector DB | ChromaDB (persisted to `backend/data/chromadb/`) |
| Finance DB | SQLite at `backend/data/finance.db` |
| Charts | recharts v3 |
| PDF Export | jsPDF + jspdf-autotable |

---

## Finance Module

### Database Schema (`finance.db`)

All tables created in `finance_service.py` via `init_db()` + `_run_migrations()`.

```
accounts      id, name, type, balance, currency, color, note, created_at, updated_at
categories    id, name, type, color, icon, pl_type, created_at
pockets       id, name, color, icon, locked, created_at, updated_at
transactions  id, account_id, category_id, pocket_id, to_account_id,
              type, amount, date, description, note, tags, created_at, updated_at
finance_config  key, value   (app-level lock, PIN)
```

**Key field details:**
- `categories.type` — `"income" | "expense" | "transfer"`
- `categories.pl_type` — `NULL` (unclassified/opex), `"gross_income"` (Pendapatan Kotor), `"cogs"` (HPP)
- `transactions.type` — `"income" | "expense" | "transfer"`
- `transactions.to_account_id` — only set for transfers
- `transactions.pocket_id` → `pockets.locked` — joined as `pocket_locked` in all transaction queries
- `pockets.locked` — `1` = locked, `0` = unlocked (integer, not boolean)
- All `created_at` / `updated_at` — milliseconds since epoch (JS `Date.now()` style)
- `date` — ISO string `"YYYY-MM-DD"` (not timestamp)

**Migrations** run on every startup via `_run_migrations()`, catching `OperationalError` for already-applied ones. Add new migrations to the list — never modify existing entries.

### Finance API Routes

All prefixed `/api/finance`:

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/accounts` | List / create accounts |
| PATCH/DELETE | `/accounts/{id}` | Update / delete account |
| GET/POST | `/categories` | List (`?type=`) / create categories |
| PATCH/DELETE | `/categories/{id}` | Update / delete category |
| GET/POST | `/pockets` | List / create pockets |
| PATCH/DELETE | `/pockets/{id}` | Update / delete pocket |
| POST | `/pockets/{id}/lock` | Toggle pocket lock |
| GET | `/lock` | Get app-level lock state |
| POST | `/lock` | Set app-level lock |
| POST | `/lock/setup` | Create PIN |
| POST | `/lock/unlock` | Unlock with PIN |
| POST | `/lock/lock` | Manual lock |
| POST | `/lock/change-pin` | Change PIN |
| GET | `/lock/status` | Get lock status |
| GET/POST/PATCH/DELETE | `/transactions` | CRUD + list (with filters) |
| GET | `/summary` | KPI summary (`date_from`, `date_to`, `pocket_id`) |
| GET | `/summary/timeline` | Daily income/expense (`date_from`, `date_to`, `pocket_id`, `account_id`) |
| GET | `/summary/monthly` | Monthly income/expense (`months`, `pocket_id`, `account_id`) |
| GET | `/summary/accounts` | Account balances for charts (`account_id`) |
| GET | `/report/pl` | P&L report (`months`, `pocket_id`, `account_id`) |

### Finance Frontend Components

All in `src/components/finance/`:

| Component | Description |
|-----------|-------------|
| `FinanceShell.tsx` | Outer wrapper with back-to-chat button |
| `FinanceMain.tsx` | Tab bar + pocket sidebar orchestrator |
| `PocketSidebar.tsx` | Pocket list + lock/unlock + CRUD |
| `OverviewPanel.tsx` | Summary KPIs, donut chart, category bar chart |
| `ReportsPanel.tsx` | Range selector, monthly bar, daily cashflow line, account pie + filters |
| `PLPanel.tsx` | P&L report — net margin chart, L/R statement table **(business only)** |
| `TransactionsPanel.tsx` | Paginated transactions + search/filter + CRUD form |
| `AccountsPanel.tsx` | Account management |
| `CategoriesPanel.tsx` | Category management + `pl_type` selector |
| `FinanceChatPanel.tsx` | AI chat in finance context |
| `FinanceAppLockScreen.tsx` | PIN entry screen for app-level lock |

**Tab order in `FinanceMain.tsx` (business):** Overview → Reports → Laba Rugi → Transactions → Accounts → Categories → Chat
**Tab order in `FinanceMain.tsx` (personal):** Overview → Transactions → Accounts → Categories → Chat

### P&L Classification

Categories can be tagged with `pl_type` to feed the P&L report:
- `"gross_income"` on an **income** category → counted as Pendapatan Kotor (operating revenue)
- `"cogs"` on an **expense** category → counted as HPP
- `null` on income → Pendapatan Lain-lain (other income, added back after opex)
- `null` on expense → Beban Operasional (opex)

P&L formula per month: `gross_profit = gross_income - cogs` → `net_profit = gross_profit - opex + other_income`

### Finance Key Patterns

**Pocket lock flow:** `PocketSidebar` and `ReportsPanel` / `PLPanel` use `useLock()` from `LockContext` to check `lockStatus?.unlocked`. If a pocket's `locked === 1` and the app is not unlocked, clicking it shows `<LockPopup>` which calls `unlock(pin)`. On success, the action proceeds.

**Transaction masking:** `isPocketLocked(tx)` in `TransactionsPanel` checks `tx.pocket_locked` (joined from DB) directly — does **not** look up the local pockets state array.

**Account filter in reports:** `ReportsPanel` and `PLPanel` both maintain local `filterPocketId` / `filterAccountId` state that overrides the sidebar `pocketId` prop. The effective IDs are: `effectivePocketId = filterPocketId ?? pocketId ?? undefined`.

---

## AI / Chat Module

### Backend Services

| Service | File | Responsibility |
|---------|------|----------------|
| `llm_service` | `llm_service.py` | Chat inference — local GGUF via llama-cpp, OpenAI, Gemini, OpenAI-compatible |
| `embed_service` | `embed_service.py` | Text embedding — local sentence-transformers, OpenAI, Gemini |
| `reranker_service` | `reranker_service.py` | Re-rank RAG results — local CrossEncoder or Cohere API |
| `knowledge_service` | `knowledge_service.py` | CRUD for knowledge bases, ChromaDB interaction |
| `document_service` | `document_service.py` | Parse PDF/DOCX/TXT, chunk text |
| `document_store` | `document_store.py` | Manifest + hash tracking for consistency checks |
| `model_manager` | `model_manager.py` | List/download/delete local models |
| `reindex_service` | `reindex_service.py` | Re-embed KB when embed model changes |
| `settings_service` | `settings_service.py` | Load/save `data/settings.json` (falls back to defaults on corrupt file) |
| `metrics_service` | `metrics_service.py` | Token/latency tracking per session and period |
| `finance_service` | `finance_service.py` | All finance CRUD + summary queries |
| `lock_service` | `lock_service.py` | Global PIN / session lock |
| `crypto_service` | `crypto_service.py` | AES-256-GCM encryption for locked conversations/KBs |
| `conversation_service` | `conversation_service.py` | Persist, list, delete chat conversations |

### Local LLM — Critical Pattern

**Always use `create_chat_completion()`**, not raw `__call__` or `_stream_local` with manual prompts. The model's built-in chat template is applied automatically, preventing `<|user|>` / `<|assistant|>` tokens from leaking into output.

```python
stream = self._local_model.create_chat_completion(
    messages=messages,          # list of {"role": ..., "content": ...}
    max_tokens=config.max_tokens,
    temperature=config.temperature,
    stream=True,
)
```

`_stream_local` yields a `{"__metrics__": True, ...}` sentinel dict as the last item. Always guard with `isinstance(token, str)` when consuming the stream outside of the main chat path.

### Chat API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat/stream` | SSE streaming chat (RAG, chat-only, or finance mode) |
| GET | `/settings/status` | Test chat + embed connection |
| POST | `/settings/test/chat` | Test chat config |
| POST | `/settings/test/embed` | Test embed config |
| POST | `/settings/test/reranker` | Test reranker config |
| GET | `/knowledge` | List KBs |
| POST | `/knowledge/{kb_id}/upload` | Upload doc |
| DELETE | `/knowledge/{kb_id}` | Delete KB |
| GET | `/knowledge/{kb_id}/consistency` | Check KB freshness |
| POST | `/knowledge/reindex/run` | Re-index KB (SSE) |
| GET | `/models/local` | Installed models |
| POST | `/models/download/stream` | Download from HF (SSE) |
| DELETE | `/models` | Delete model |
| GET | `/metrics/session/{id}` | Session stats |
| GET | `/metrics/period/{period}` | Aggregated stats (day/week/month) |

---

## Frontend Architecture

### Key Files

**`src/lib/api.ts`** — all non-finance fetch calls. SSE streams: always add `.catch(() => {})` to avoid unhandled AbortError when streams cancel.

**`src/lib/financeApi.ts`** — all finance fetch calls. Base URL hard-coded per app:
- personal: `http://localhost:8000/api/finance`
- business: `http://localhost:8001/api/finance`

**`src/lib/exportPdf.ts`** — two exported functions:
- `exportFinancePdf(opts)` — general report PDF (portrait A4)
- `exportPLPdf(opts)` — P&L statement PDF (landscape A4)

Both use dynamic `import("jspdf")` / `import("jspdf-autotable")` to avoid SSR issues.

**`src/lib/LockContext.tsx`** — `useLock()` hook. Provides `{ status, unlock, lock }`. Status polls every 30s; touch() debounced to once per 10s on user activity.

**`src/lib/ConnectionContext.tsx`** — app phase machine: `checking → setup → ready | chat_only`.

**`src/app/page.tsx`** — root layout. Top nav bar (`h-12`) with logo + LOQA/Work label + module nav buttons (Chat, Workspace, Finance, Inventory, Order, Analytics) + Settings button. No bottom nav or persona dropdown. Nav items are buttons that call `handleNavClick(id)`; Workspace triggers `tryEnableRag()` first and shows a spinner while checking. Contextual left sidebar (w-56) only renders for `panel === "chat"` (ConversationList) or `panel === "finance"` (PocketSidebar).

### Components Map

```
src/components/
├── chat/         ChatWindow, ChatMessage, CitationBadge, ChatInput, ConversationList
├── workspace/    WorkspacePanel  (Knowledge Base + Notes; requires embed model)
├── finance/      (see Finance Components table above)
├── inventory/    (see Inventory Components table above — business only)
├── order/        (see Order Module below — business only)
├── analytics/    AnalyticsPanel
├── lock/         LockPopup, LockScreen
└── settings/     SettingsModal, SetupConnection
```

### Theme System

CSS variable classes: `th-bg-base`, `th-bg-surface`, `th-bg-elevated`, `th-text`, `th-text-2`, `th-text-muted`, `th-border`.
Accent color: `bg-brand-*` / `text-brand-*` — generated dynamically from the accent hex in settings.
Never use raw Tailwind color classes (`bg-blue-600`) for interactive elements — always `bg-brand-*` so the accent color is respected.

---

## i18n

Supported locales: `en` (English), `id` (Bahasa Indonesia).

```
src/lib/i18n/
├── en.ts     English strings — source of truth
├── id.ts     Indonesian strings — must have every key from en.ts
└── index.ts  exports useT() hook + I18nProvider
```

**Rules:**
1. Never hardcode user-visible strings — always `t("key")`
2. Add to **both** `en.ts` and `id.ts` at the same time
3. Key namespaces: `common.*`, `nav.*`, `chat.*`, `settings.*`, `knowledge.*`, `lock.*`, `analytics.*`, `finance.*`, `persona.*`
4. Finance sub-namespaces: `finance.tx.*`, `finance.account.*`, `finance.category.*`, `finance.pocket.*`, `finance.summary.*`, `finance.report.*`, `finance.pl.*`, `finance.chat.*`, `finance.appLock.*`

---

## Model Storage Conventions

**Chat models (.gguf):** `backend/models/chat/filename.gguf`
- Partial download: `filename.gguf.part` (resumable via HTTP Range)
- Repo sidecar: `filename.gguf.meta`

**Embed/Reranker:** `backend/models/embed/org--model/` (slug: `/` → `--`)
- Always pass `trust_remote_code=True` to `SentenceTransformer()`
- `nomic-embed-text-v1` requires `einops` package

---

## Settings Storage

`backend/data/settings.json` — loaded by `settings_service.py`. Falls back to defaults on corrupt/malformed JSON (try/except around `json.load`). Schema in `backend/app/models/settings.py`, mirrored in `frontend/src/types/index.ts`.

Sections: `chat`, `embed`, `reranker`, `chunking`, `theme`, `reindex_thresholds`, `database`.

**Settings tab order:** Chat Model → Read Documents → Document Storage → Manage AI Models → Database → Appearance → Language → Security

---

## Database

App default ke SQLite. PostgreSQL bisa diaktifkan lewat Settings → Database tab.

- Semua service menggunakan `db_adapter.py` — jangan pernah `import sqlite3` langsung di service files
- `get_db("name")` mengembalikan `_SQLiteConn` atau `_PostgresConn` tergantung config
- Helper dialect-aware: `conn.like_op()`, `conn.month_format(col)`, `conn.ts_to_hour(col)`, `conn.ts_to_date(col)`, `conn.last_insert_id(cur)`, `conn.lock_for_update(table, where, params)`
- `LIKE` → selalu pakai `conn.like_op()` (SQLite: `LIKE`, PostgreSQL: `ILIKE`)
- FTS5 (`conv_fts`, `notes_fts`) hanya tersedia di SQLite — search functions harus cek `conn.dialect` dan fallback ke `ILIKE` di PostgreSQL
- `metrics_service.py` sudah dimigrasikan ke adapter — **jangan** pakai raw `sqlite3` di service manapun

---

## Re-index Flow

When embed model changes, existing KB vectors are stale. Three tiers by total KB size:
- **Tier 1** (≤50 MB): silent background re-index
- **Tier 2** (50–200 MB): progress bar shown
- **Tier 3** (>200 MB): requires user confirmation

---

## Sync Rules: Business ↔ Personal

The business app is the **primary development target** — new features are built there first, then mirrored.

**When syncing a file from business → personal:**
1. Copy the file
2. Replace all `localhost:8001` → `localhost:8000`
3. Replace `"LOQA Work"` → `"LOQA Home"` (in strings/PDF exports)
4. No other changes needed — component logic is identical

**Files currently ahead in business (not yet in personal):** *(none for shared features)*

**Business-only features (intentionally NOT in personal):**
- Inventory module — all of `src/components/inventory/`, `src/lib/inventoryApi.ts`, backend `inventory_service.py`, `api/inventory.py`, `models/inventory.py`, `inventory.db`
- Order / POS module — all of `src/components/order/`, `src/lib/orderApi.ts`, backend `order_service.py`, `api/order.py`, `order.db`
- Reports + P&L tabs in `FinanceMain.tsx` — `ReportsPanel.tsx` and `PLPanel.tsx`

---

## Inventory Module (Business Only)

### Database (`inventory.db` — separate from `finance.db`)

| Table | Description |
|-------|-------------|
| `warehouses` | id, name, location, note |
| `product_categories` | id, name, color |
| `products` | id, category_id, name, sku, unit, min_stock, active, description |
| `product_variants` | id, product_id, name, sku_suffix, fixed_cost |
| `product_images` | id, product_id, filename, sort_order — stored at `backend/data/product_images/` |
| `stock_batches` | id, variant_id, warehouse_id, movement_id, purchase_price, qty_initial, qty_remaining, date — FIFO tracking |
| `stock_levels` | id, variant_id, warehouse_id, qty, avg_cost — materialized, updated on every movement |
| `stock_movements` | id, variant_id, warehouse_id, type, qty, unit_cost, cost_method, total_cost, note, date, finance_tx_id, finance_linked |
| `csv_import_logs` | id, filename, status, total_rows, ok_rows, error_rows, skipped_rows, result_csv_path, created_at |

### HPP Cost Methods (per movement OUT)
- **FIFO** — deducts oldest batch first, total_cost = sum of batch prices taken
- **Average** — uses `stock_levels.avg_cost`, batch deduction oldest-first
- **Fixed** — uses `product_variants.fixed_cost`, batch deduction oldest-first

### Movement Types
- `in` — stock received, requires `unit_cost`; creates new batch; updates avg_cost
- `out` — stock sold/used, requires `cost_method`; deducts batches
- `opname` — stock count delta (positive or negative); shrinkage (negative) can link to finance as **Beban Penyusutan** (NOT HPP/COGS)
- `adjustment` — manual correction

### Finance Integration
Each movement has `link_finance: bool`. When true:
- Creates a finance transaction via `finance_service.create_transaction()`
- Stores `finance_tx_id` on movement
- Sets `finance_linked = 1`
- Frontend shows badge: **"Keuangan ✓"** (green) or **"Mandiri"** (gray)
- Shrinkage from opname uses a separate expense category (NOT `pl_type="cogs"`)

### Inventory API Routes (`/api/inventory`)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/warehouses` | List / create warehouses |
| PATCH/DELETE | `/warehouses/{id}` | Update / delete |
| GET/POST | `/categories` | Product categories |
| PATCH/DELETE | `/categories/{id}` | Update / delete |
| GET/POST | `/products` | List (`?active_only=`) / create |
| PATCH/DELETE | `/products/{id}` | Update / delete |
| POST | `/products/{id}/variants` | Add variant |
| PATCH/DELETE | `/variants/{id}` | Update / delete variant |
| GET | `/products/{id}/images` | List product images |
| POST | `/products/{id}/images` | Upload product image (multipart) |
| DELETE | `/images/{image_id}` | Delete product image |
| PUT | `/products/{id}/images/reorder` | Reorder images by `image_ids` array |
| GET | `/images/{filename}` | Serve product image file |
| GET | `/stock` | Stock levels (`?warehouse_id=`) |
| GET/POST | `/movements` | List / create movement |
| POST | `/opname` | Submit stock opname session |
| GET | `/dashboard` | KPI + low stock + monthly HPP |
| GET | `/report/turnover` | Monthly turnover data |
| GET | `/import-logs` | List CSV import logs |
| GET | `/import-logs/{id}` | Get single import log detail |
| GET | `/import-logs/{id}/download` | Download result CSV for an import log |
| DELETE | `/import-logs/{id}` | Delete import log |

### Inventory Frontend Components

| Component | Description |
|-----------|-------------|
| `InventoryShell.tsx` | Outer wrapper with back button |
| `InventoryMain.tsx` | Tab bar orchestrator |
| `InventoryDashboard.tsx` | KPI cards, HPP bar chart, low-stock table |
| `ProductsPanel.tsx` | Product + variant CRUD, subcategory filter, search, pagination, stock qty display, product images |
| `WarehousesPanel.tsx` | Warehouse CRUD |
| `MovementsPanel.tsx` | Movement history table + form (in/out/adjustment) |
| `StockOpnamePanel.tsx` | Physical count vs system diff table, finance link for shrinkage |
| `ImportLogsPanel.tsx` | CSV import history — status, row counts, error preview, download result CSV |

**Tab order (InventoryMain):** Dashboard → Products → Master Data → Movements → Stock Opname → Import → Chat
**Tab order (MasterDataPanel):** Categories → Subcategories → Brands → Warehouses

### Product Images
- Images stored at `backend/data/product_images/` — served via `/api/inventory/images/{filename}`
- Max images per product and max file size configurable; accepted types: JPEG, PNG, WebP
- Reorder via drag or explicit `reorder` endpoint with `image_ids` array
- Images only uploadable after product is saved (product_id required)

### CSV Import Logs
- Every CSV import session creates a `csv_import_logs` record
- Result CSV (`result_csv_path`) contains all rows with `status` + `message` columns — `ok`, `error`, or `skipped`
- Skipped rows on re-import = already-existing SKUs (idempotent import)
- `ImportLogsPanel` shows error preview (first N rows) + download button for full result CSV

### Persona Entry
Inventory is accessible from the persona popup in `apps/business/frontend/src/app/page.tsx` → routes to `/inventory`.

---

## Workspace Panel (Both Apps)

`src/components/workspace/WorkspacePanel.tsx` — requires embed model to be configured. If embed is not connected, `tryEnableRag()` returns an error and the panel shows `EmbedModelGate`. Features:
- Knowledge Base management: list KBs, upload documents (PDF/DOCX/TXT), delete KBs, consistency check
- Notes: folder-based personal notes with Markdown editor
- Conversations: list + delete saved conversations (pinnable)
- All KB/document actions share the same ChromaDB backend used by Chat RAG mode

**Entry point:** Nav button "Workspace" in top nav → `handleNavClick("workspace")` → `tryEnableRag()` → if ok, sets phase to "ready" and shows WorkspacePanel; if not ok, shows `EmbedModelGate`.

---

## Project Module (Business Only)

Manajemen proyek untuk bisnis berbasis kontrak (kontraktor, konsultan, jasa). Disimpan di `project.db` — terpisah dari `finance.db`.

### Database (`project.db`)

| Table | Description |
|-------|-------------|
| `projects` | id, name, client_name, client_contact, status, start_date, end_date, contract_value, description, color |
| `project_budget_items` | id, project_id, category, description, qty, unit, unit_price — RAB (Rencana Anggaran Biaya) |
| `project_workers` | id, project_id, name, role, rate_type, rate_amount, status, note |
| `project_worker_payments` | id, worker_id, project_id, amount, date, note, link_finance, finance_tx_id |
| `project_invoices` | id, project_id, invoice_number, amount, status, issued_date, due_date, paid_date, note, link_finance, finance_tx_id |

**Project status:** `active` | `completed` | `on_hold`
**Invoice status:** `draft` | `sent` | `paid`
**Worker rate_type:** `fixed` | `daily` | `hourly`

### Finance Integration
- Worker payment dengan `link_finance = true` → membuat transaksi **expense** di `finance.db`
- Invoice dengan `link_finance = true` → membuat transaksi **income** di `finance.db`
- Keduanya menyimpan `finance_tx_id` untuk referensi balik

### Project API Routes (`/api/projects`)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/projects` | List (`?status=`) / create project |
| GET | `/projects/dashboard` | KPI: total, aktif, selesai, nilai kontrak, RAB, invoice pending |
| GET/PATCH/DELETE | `/projects/{id}` | Get / update / delete project |
| GET/POST | `/projects/{id}/budget` | List / create RAB item |
| PATCH/DELETE | `/budget/{item_id}` | Update / delete RAB item |
| GET/POST | `/projects/{id}/workers` | List / add worker |
| PATCH/DELETE | `/workers/{worker_id}` | Update / delete worker |
| GET/POST | `/projects/{id}/payments` | List / create worker payment |
| PATCH | `/payments/{id}/link` | Toggle finance link on payment |
| DELETE | `/payments/{id}` | Delete payment |
| GET/POST | `/projects/{id}/invoices` | List / create invoice |
| PATCH | `/invoices/{id}` | Update invoice |
| PATCH | `/invoices/{id}/link` | Toggle finance link on invoice |
| DELETE | `/invoices/{id}` | Delete invoice |

### Project Frontend Components

| Component | Description |
|-----------|-------------|
| `ProjectMain.tsx` | Tab bar orchestrator — Dashboard + Proyek; detail mode shows sub-tabs |
| `ProjectDashboard.tsx` | KPI cards: total proyek, nilai kontrak, RAB aktif, invoice pending, daftar proyek aktif |
| `ProjectsPanel.tsx` | List semua proyek + CRUD form |
| `RABPanel.tsx` | Rencana Anggaran Biaya — item budget per kategori, qty, unit price, total |
| `WorkersPanel.tsx` | Manajemen pekerja per proyek + riwayat pembayaran + finance link |
| `InvoicesPanel.tsx` | Invoice per proyek — draft/sent/paid + finance link |

**Tab order (ProjectMain):** Dashboard → Proyek
**Sub-tab order (detail proyek):** RAB → Pekerja → Invoice

---

## Order Module (Business Only)

Point-of-sale and order management system for LOQA Work.

### Tabs (`OrderMain.tsx`)

| Tab | Component | Description |
|-----|-----------|-------------|
| Kasir | `KasirPanel.tsx` | POS interface: barcode/SKU scan, cart, checkout, change calculator, customer & delivery info |
| Riwayat | `OrderHistoryPanel.tsx` | Order history with filters |
| Insight | `OrderInsightPanel.tsx` | Sales analytics |
| Pengiriman | `ShippingPanel.tsx` | Shipping/delivery management |
| Setelan | `OrderSettingsPanel.tsx` | Order module settings |

### Key Patterns
- Kasir scan flow: enter barcode/SKU → `productNotFound` or add to cart → adjust qty → checkout → creates finance transaction (income) and inventory movement (out)
- Finance integration: each order checkout creates a transaction in `finance_service` and an inventory movement OUT in `inventory_service` (when `link_finance = true`)
- `order.db` is separate from `finance.db` and `inventory.db`

---

## Subscription & Licensing

LOQA uses a license key model. There is no SaaS subscription — users pay once per license period and the app runs fully offline after activation.

### Billing Models

Three billing options per tier — all are **per device, 1 license = 1 device**:

| Model | Description |
|-------|-------------|
| **Bulanan** | Monthly subscription, cancel anytime |
| **Tahunan** | Annual subscription, ~20% cheaper than monthly |
| **Lifetime** | One-time purchase, never pay again |

### Tiers & Pricing (approximate)

| Tier | App Access | Monthly | Yearly | Lifetime |
|------|-----------|---------|--------|----------|
| **Starter** | LOQA Home · 1 device | Rp 49.000 | Rp 39.000/mo | Rp 1.590.000 |
| **Pro** | LOQA Home + Work · 1 device | Rp 99.000 | Rp 79.000/mo | Rp 3.290.000 |
| **Business** | LOQA Home + Work · 5 devices | Rp 299.000 | Rp 239.000/mo | Rp 9.870.000 |

### License Key Flow
1. User purchases a license key (subscription or lifetime) via the website
2. On first launch, app prompts for license key input
3. Key is validated against a remote server (one-time internet connection required)
4. After validation, app runs 100% offline — no data is sent to server
5. When subscription expires: app enters limited mode (data intact, AI features restricted); Lifetime keys never expire
6. Keys are device-bound; user can deactivate from one device and reactivate on another via a license management panel

### Feature Gating by Tier
- **Starter**: Chat (model lokal), Knowledge Base & RAG, Finance dasar, Analytics — **no** P&L, Inventory, Order
- **Pro**: + Finance lengkap + P&L — **no** Inventory, Order
- **Business**: All modules including Inventory + Order (POS)

---

## Website (`web/`)

Marketing website at `web/` — Next.js 14 (App Router), served separately from the app. Not part of the Makefile; run with `cd web && npm run dev` (port 3000 by default).

### Pages & Components

| File | Description |
|------|-------------|
| `web/app/page.tsx` | Homepage: Navbar → Hero → Features → WhyLocal → Pricing → Download → Footer |
| `web/app/pricing/page.tsx` | Pricing detail page with full feature comparison + FAQ |
| `web/components/Navbar.tsx` | Fixed top nav with LOQA mark logo, links: Fitur / Kenapa Lokal? / Harga / Download |
| `web/components/Hero.tsx` | Hero with interactive app preview — 6 switchable module tabs (Chat/Workspace/Finance/Inventory/Order/Analytics) that mirror actual app layout |
| `web/components/Features.tsx` | 6 feature cards with intersection observer fade-in |
| `web/components/WhyLocal.tsx` | Privacy / local-first value props |
| `web/components/Pricing.tsx` | Pricing cards — accepts `compact` prop; homepage uses `compact={true}`, `/pricing` uses `compact={false}` |
| `web/components/Download.tsx` | Fetches GitHub releases API (async Server Component) |
| `web/components/Footer.tsx` | Footer with LOQA mark logo |

### Hero Preview Accuracy
The Hero app preview must reflect the **actual app layout**:
- Top nav bar (h-12): logo mark + "LOQA Work" label + module tab buttons + Settings
- No bottom nav, no sidebar for non-chat/finance modules
- Chat module: left sidebar (ConversationList) + ChatWindow without RAG indicator
- Finance module: left PocketSidebar + FinanceMain tab bar
- Workspace module: KB list sidebar + document list + upload dropzone
- Inventory module: tab bar only (no sidebar)
- Order module: tab bar + Kasir layout (product grid + cart)
- Analytics module: full-width panel

---

## Known Gotchas

- **AbortError in console**: All SSE stream consumers must have `.catch(() => {})` — abort signals throw unhandled rejections.
- **`--reload` double process**: Backend spawns watcher + worker. Ctrl+C may leave worker alive on the port.
- **`trust_remote_code`**: Required for nomic-embed and similar. Needs `sentence-transformers>=3.2.0`.
- **recharts v3 TypeScript**: Tooltip `formatter` must be `(v: unknown) => fmt(Number(v))` — not `(v: number) => ...`. `labelFormatter` must be `(l: unknown) => String(l)`.
- **jsPDF dynamic import**: Both export functions use `await import("jspdf")` — do not top-level import or it breaks SSR.
- **Pocket lock is `number`**: `Pocket.locked` is `0 | 1` (SQLite integer), not boolean. Use `!!p.locked` or `p.locked === 1`, not `p.locked === true`.
- **`pocket_locked` in transactions**: Always joined from DB; use `tx.pocket_locked` directly in `isPocketLocked()` — never look up the local pockets state array.
- **`pl_type` can be `null`**: In SQLite it's stored as NULL; Python returns it as `None`; TypeScript type is `PLType = "gross_income" | "cogs" | null`. Handle all three values.
- **Tab state isolation**: Model Manager uses `Record<ModelManagerTab, TabState>` — each of chat/embed/reranker has independent state. Capture `tabId` at function start to avoid stale closures.
- **`settings.json` corruption**: Concurrent writes can produce two concatenated JSON objects. `settings_service.py` wraps `json.load()` in try/except and resets to defaults.
- **Model Manager always mounted**: Uses `hidden` CSS class when inactive — do not conditionally render it or download state is lost on tab switch.
