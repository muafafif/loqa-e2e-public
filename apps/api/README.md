# LOQA API

Backend service for licensing, subscription, and payment. Handles the full lifecycle from invoice creation to offline JWT issuance.

> Proposed account authentication redesign: [Authentication Improvement Plan: Ory Kratos](../../docs/auth-kratos-plan.md). The plan keeps account sessions, offline license JWTs, and the desktop PIN lock as separate security boundaries.

---

## Architecture

Domain-based structure. Each domain is self-contained (model, repository, service, handler). Handlers do input + one service call + output only — no business logic, no direct repo access.

```
internal/
├── auth/         JWT middleware for API routes
├── config/       Env-based config (godotenv)
├── db/           GORM connection + AutoMigrate
├── device/       Device activation records (fingerprint-based)
├── license/      License key generation, activation, JWT signing
├── payment/      Payment provider interface
├── plan/         Plan definitions (included seats) + pricing matrix
├── subscription/ Subscription lifecycle
├── user/         User model
├── webhook/      Xendit webhook handlers
└── xendit/       Xendit payment provider implementation

cmd/
├── server/       HTTP server entrypoint
└── admin-cli/    Admin CLI (sub, plan, key commands)

configs/
└── plans.json    Plan + pricing seed manifest
```

---

## Running

```bash
# Server
go run cmd/server/main.go

# Admin CLI
go run cmd/admin-cli/*.go <command>
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL DSN |
| `JWT_SECRET` | HS256 secret for API auth |
| `PORT` | Server port (default: 8080) |
| `XENDIT_API_KEY` | Xendit API key |
| `XENDIT_WEBHOOK_SECRET` | Xendit callback token for webhook validation |
| `LICENSE_PRIVATE_KEY` | RSA private key (PEM, `\n`-escaped) for RS256 JWT signing |
| `LICENSE_OFFLINE_DAYS` | Grace period before app must re-validate online (default: 30) |

---

## Admin CLI Commands

```bash
# Subscription
go run cmd/admin-cli/*.go sub create-invoice --user-id=1 --tier=starter --cycle=monthly --email=x@x.com
go run cmd/admin-cli/*.go sub list --user-id=1
go run cmd/admin-cli/*.go sub revoke --id=1

# Plan seeding
go run cmd/admin-cli/*.go plan seed
go run cmd/admin-cli/*.go plan seed --file=configs/plans.json

# RSA key pair generation
go run cmd/admin-cli/*.go key gen-rsa
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/activate` | — | Activate license key, returns RS256 JWT |
| POST | `/validate` | — | Re-validate token online, returns fresh JWT |
| POST | `/webhooks/xendit/invoice` | token | First payment webhook → creates subscription + license key |
| POST | `/webhooks/xendit/recurring` | token | Recurring payment webhook → extends subscription |
| POST | `/api/subscriptions` | JWT | Create subscription (manual) |
| GET | `/api/subscriptions` | JWT | List subscriptions for user |
| GET | `/api/subscriptions/{id}` | JWT | Get subscription by ID |
| POST | `/api/subscriptions/{id}/cancel` | JWT | Cancel subscription |
| POST | `/api/subscriptions/{id}/revoke` | JWT | Revoke entire license key immediately |
| POST | `/api/subscriptions/{id}/devices/{fingerprint}/revoke` | JWT | Initiate 2-phase device revocation (Phase 1) |

---

## License Flow

```
Admin CLI
  └─ create-invoice (Xendit invoice created, external_id = loqa-sub-{userID}-{tier}-{cycle})
       └─ User pays
            └─ Xendit webhook → subscription created → license key generated (LOQA-XXXX-XXXX-XXXX-XXXX)
                 └─ App calls POST /activate with key + device fingerprint
                      └─ Seat check → device activation record created → RS256 JWT returned
                           └─ App stores JWT, runs fully offline for up to LICENSE_OFFLINE_DAYS
                                └─ Background worker calls POST /validate every 10 minutes
                                     ├─ 200 → fresh JWT saved, grace period reset
                                     ├─ 403 → revoked flag set, app enters limited mode
                                     └─ network error → skipped, retried next cycle
```

### Device Revocation (2-Phase)

Revocation is split into two phases to handle offline devices gracefully.

```
Phase 1 — Admin initiates (device can be offline)
  POST /api/subscriptions/{id}/devices/{fingerprint}/revoke
    └─ activation.status set to "revoke_pending"
    └─ License key stays active — other devices unaffected

Phase 2 — Device comes online
  POST /validate
    └─ Server sees "revoke_pending" on activation
    └─ activation.status set to "deactivated" → seat freed
    └─ Returns 403 with body "device revoked"
    └─ App clears local JWT and enters limited mode
```

### JWT Claims

```json
{
  "license_key": "LOQA-xxxx-xxxx-xxxx-xxxx",
  "tier": "starter",
  "expires_at": "2026-07-01T...",
  "fingerprint": "<sha256 of device hardware>",
  "exp": "<30 days from activation>",
  "iat": "..."
}
```

- `exp` — JWT offline grace period (30 days). App must re-validate online after this.
- `expires_at` — Subscription end date. App shows warning and blocks on expiry.
- `fingerprint` — Opaque device hash (MAC + CPU + disk serial). Sent on `/validate` for server-side check.

### Seat Enforcement

Effective seats = `plan.included_seats + subscription.extra_seats`

- New device: seat count checked before activation record is created.
- Same fingerprint: re-activation succeeds (no new seat consumed).
- Seat limit reached: `403 Forbidden`.

---

## Plans & Pricing

Stored in DB, seeded from `configs/plans.json`. Edit the JSON and re-run `plan seed` to update.

| Tier | Included Seats | Monthly | Yearly | Lifetime |
|------|---------------|---------|--------|----------|
| Starter | 1 | 49.000 | 468.000 | 1.590.000 |
| Pro | 1 | 99.000 | 948.000 | 3.290.000 |
| Business | 5 | 299.000 | 2.868.000 | 9.870.000 |

Extra seat price: Starter 20k / Pro 30k / Business 50k per seat.

---

## Checklist

### Done
- [x] Xendit invoice creation (admin CLI)
- [x] Webhook: first payment → subscription + license key auto-generated
- [x] Webhook: recurring (handler wired, `Extend` stub)
- [x] RS256 key pair generation (`admin key gen-rsa`)
- [x] `POST /activate` — validates key, checks seats, creates device record, returns JWT
- [x] `POST /validate` — re-validates token online, returns fresh JWT (resets offline grace period)
- [x] 2-phase device revocation — Phase 1 marks `revoke_pending`, Phase 2 completes on next validate
- [x] Device fingerprint tracking (`activations` table)
- [x] Seat enforcement (included + extra seats); seat freed after Phase 2 revocation
- [x] DB-backed plans and pricing (`plans`, `pricings` tables)
- [x] Plan seed from `configs/plans.json`
- [x] Integration tests (19 cases: activate, validate, revoke device)

### Pending
- [x] `Extend` service implementation — renew subscription on recurring payment
- [ ] Admin CLI `license get --subscription-id=X` — retrieve key by subscription
- [ ] Admin CLI `sub list` / `sub revoke` — not yet implemented
- [ ] Self-service flow — auto key delivery (email) after payment
- [ ] Pending invoice DB record — store invoice before payment for richer metadata lookup

### Pending — Core App Integration (FastAPI + Next.js)

#### FastAPI (`apps/personal/backend` + `apps/business/backend`)
- [x] `license_service.py` — device fingerprint (MAC + CPU + disk via `uuid`/`psutil`), `activate(key)`, `validate()` with offline RS256 fallback, JWT stored at `data/license.jwt`
- [x] Background worker in `license_service.py` — calls `validate()` every 10 minutes; 200 → saves fresh JWT; 403 → sets revoked flag; network error → skipped
- [x] `api/license.py` — `GET /api/license/status` (reads in-memory state, offline), `POST /api/license/activate` (calls Go API, stores JWT)
- [x] Startup hook in `main.py` — local JWT check on boot (no network); spawns background worker

**Step 1 — `require_license` dependency** *(backend, both apps)*
- [ ] Add `app/api/deps/license.py` — `require_license()` FastAPI dependency; reads `get_state()`; raises 403 if status is not `valid`; returns `LicenseState` so callers can read tier

**Step 2 — Gate all protected endpoints** *(backend, both apps)*
- [ ] Apply `Depends(require_license)` to all routers except `/api/license/*` and `/health`
- [ ] Affected routers: `chat`, `knowledge`, `models`, `settings`, `metrics`, `conversations`, `lock`, `finance`, `notes` (both apps); `inventory`, `orders`, `projects` (business only)

**Step 3 — Tier-based endpoint gating** *(backend, business only)*
- [ ] Add `require_tier(min_tier)` dependency — raises 403 if `license.tier` is below `min_tier`
- [ ] Apply to `inventory` + `orders` routers: require `business`
- [ ] Apply to `finance/report/pl` endpoint: require `pro` or `business`

**Step 4 — Embed public key in app** *(backend, both apps)*
- [ ] Save RSA public key to `backend/app/core/license_pub.pem`
- [ ] Update `config.py` to read from PEM file as fallback when `LICENSE_PUBLIC_KEY` env is empty
- [ ] Remove `LICENSE_PUBLIC_KEY` from `.env` — key lives in the binary, not env

#### Frontend (`apps/personal/frontend` + `apps/business/frontend`)
- [x] New `"locked"` phase in `ConnectionContext` — set when `/api/license/status` returns `not_activated` or `revoked`
- [x] `ActivationScreen` component — license key input form, calls `POST /api/license/activate`, transitions to normal flow on success
- [x] Wire `ActivationScreen` into `AppShell` — renders when `phase === "locked"`

**Step 5 — Tier-based nav gating** *(frontend, both apps)*
- [ ] Read `licenseState.tier` from `useConnection()`
- [ ] Hide Inventory + Order nav items if tier is not `business`
- [ ] Hide P&L tab in `FinanceMain` if tier is not `pro` or `business`
