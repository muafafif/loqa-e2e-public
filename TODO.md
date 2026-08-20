# TODO — License Enforcement

Mekanisme aktivasi & validasi license key sudah jalan end-to-end (Go API `apps/api` +
`license_service.py` di kedua backend + `ActivationScreen` di kedua frontend, lihat
[PR #1](https://github.com/MuhammadHasbiAshshiddieqy/loqa/pull/1)). Yang **belum** ada
adalah *enforcement*: endpoint lain belum benar-benar digembok oleh status/tier lisensi.
Tracking detail ada di `apps/api/README.md` § Checklist.

Rencana entitlements sudah digeser dari **tier-based** (`starter/pro/business`) ke
**module-based** (daftar modul eksplisit per key) supaya web admin bisa generate key
secara fleksibel — lihat § 6. `tier` tetap dipakai untuk pricing/self-checkout, tapi
enforcement baca `modules[]`, bukan `tier`.

Dua hal yang sudah **ada** di Go API (`apps/api`) dan tinggal diekspos lewat admin UI,
bukan fitur baru:
- **Batas device per key** — `internal/license/service.go` `activateDevice()` sudah
  cek `deviceRepo.CountActive()` vs `plan.IncludedSeats + subscription.ExtraSeats`,
  raise `ErrSeatLimitReached` (403) kalau penuh. Device sama boleh re-aktivasi tanpa
  makan seat baru. "Key cuma 2 device" = set `included_seats`/`extra_seats` = 2.
- **Tanpa batas waktu** — `internal/subscription/service.go`, cycle `lifetime` bikin
  `ExpiresAt = nil`; `Activate`/`Validate` cuma expired-check kalau `ExpiresAt != nil`.
  Jadi `expires_at: null` = tidak pernah expired, pattern-nya sudah dipakai tier
  lifetime yang ada sekarang — form admin tinggal expose opsi ini.

---

## 1. `require_license` dependency (backend, both apps) — Step 1 ✅

- [x] Buat `app/api/deps/license.py` di `apps/personal/backend` dan `apps/business/backend`
  - `require_license()` — raise `403` hanya untuk `not_activated`/`revoked`
  - `require_active_license()` (baru, tidak ada di spec awal) — raise `403` juga untuk
    `expired`, dipakai khusus router AI. Keputusan ini diambil karena spec literal di
    `apps/api/README.md` ("403 jika status bukan valid") kontradiksi sama CLAUDE.md
    ("expired = limited mode, data intact, AI dibatasi") — lihat § 1a di bawah.
  - Keduanya return `LicenseState` supaya caller bisa baca `modules`/`tier` nanti

### 1a. Kenapa dua dependency, bukan satu

`expired` **tidak** dianggap lockout penuh — untuk produk dengan tagline "Your data,
your device, your decision", nge-block akses ke data sendiri (finance/notes/inventory)
gara-gara telat bayar kontradiksi sama janji brand, dan untuk LOQA Work bisa ganggu
operasional bisnis harian (nggak bisa cek stok/POS cuma karena kartu gagal charge
sehari). `not_activated`/`revoked` tetap full lockout (belum pernah aktivasi, atau
memang diblokir device-nya).

## 2. Gate semua protected endpoint (backend, both apps) — Step 2 ✅

- [x] Apply `Depends(require_active_license)` ke router AI: `chat`, `knowledge`, `models`
- [x] Apply `Depends(require_license)` ke router data: `settings`, `metrics`,
      `conversations`, `lock`, `finance`, `inventory`, `notes` (+ `habits` di personal;
      `orders`, `projects` di business)
- [x] `license.router` dan `/health` sengaja **tidak** digembok — itu yang dipakai app
      buat cek status/aktivasi di awal
- [x] **Divalidasi** — venv ringan dibuat khusus (fastapi + pydantic-settings + httpx +
      python-jose + psutil, tanpa dependency ML berat), lalu `require_license`/
      `require_active_license` ditest lewat `TestClient` FastAPI beneran terhadap
      `license_service.py` asli (bukan mock) untuk keempat status: `not_activated`,
      `revoked`, `expired`, `valid` — di kedua app (personal & business). Semua 8
      assertion PASS: not_activated/revoked → 403 di data+AI route; expired → data
      route 200, AI route 403 (limited mode); valid → semua 200. Belum test lewat
      `./start.sh` beneran (full app dengan semua router+ML deps) — itu di luar scope
      yang bisa divalidasi cepat di sini, tapi logic dependency-nya sendiri terverifikasi.

## 3. Module-based endpoint gating (backend, business only) — Step 3

> Diganti dari "tier-based" jadi "module-based" — lihat § 6 untuk skema `modules[]`.

- [ ] Tambah `require_module(module_key)` dependency — raise `403` jika `module_key` tidak ada
      di `license.claims.modules`
- [ ] Apply ke router `inventory` → `require_module("inventory")`
- [ ] Apply ke router `orders` → `require_module("order")`
- [ ] Apply ke `finance/report/pl` → `require_module("finance.pl")`

## 4. Embed RSA public key di app (backend, both apps) — Step 4

- [ ] Simpan RSA public key ke `backend/app/core/license_pub.pem`
- [ ] Update `config.py` — baca dari file `.pem` sebagai fallback saat env `LICENSE_PUBLIC_KEY` kosong
- [ ] Hapus `LICENSE_PUBLIC_KEY` dari `.env` — key harusnya di-bundle di binary, bukan env

## 5. Module-based nav gating (frontend, both apps) — Step 5

> Diganti dari "tier-based" jadi "module-based" — lihat § 6.

- [ ] Baca `licenseState.modules: string[]` dari `useConnection()` (ganti pemakaian `tier`)
- [ ] Sembunyikan nav Inventory + Order jika `modules` tidak mengandung `"inventory"`/`"order"`
- [ ] Sembunyikan tab P&L di `FinanceMain` jika `modules` tidak mengandung `"finance.pl"`

---

## 6. Web Admin — generate license key secara dinamis

Tujuan: admin bisa buat key manual (tanpa lewat flow pembayaran Xendit) dengan pilihan
bebas — app scope, modul, jangka waktu, seat — dan gampang di-extend saat ada modul baru.

### 6.1 Module registry (foundation, source of truth)

- [ ] Buat `apps/api/configs/modules.json` — daftar modul kanonis, contoh:
      ```json
      [
        { "key": "chat", "label": "Chat & Knowledge Base", "app_scope": "both" },
        { "key": "finance", "label": "Finance", "app_scope": "both" },
        { "key": "finance.pl", "label": "Laporan P&L", "app_scope": "business" },
        { "key": "inventory", "label": "Inventory", "app_scope": "business" },
        { "key": "order", "label": "Order / POS", "app_scope": "business" },
        { "key": "project", "label": "Project Management", "app_scope": "business" }
      ]
      ```
- [ ] Ini **satu-satunya tempat** modul didaftarkan — Admin CLI, admin API, dan web admin
      semua baca dari sini. Modul baru = tambah satu entry, tidak ada migration DB.

### 6.2 Skema DB (`apps/api`, Postgres) ✅

- [x] **Ditaruh di `subscriptions`, bukan `licenses`** — deviasi dari rencana awal.
      Setelah baca kode asli, `subscriptions` sudah jadi tempat field entitlement lain
      (`Tier`, `ExpiresAt`, `ExtraSeats`); `licenses` cuma nyimpen key string + status
      aktif/revoked. Konsisten sama pola yang ada = taruh `Modules`/`AppScope` di
      `subscriptions` juga (`internal/subscription/model.go`).
- [x] `Modules` — custom type `plan.StringArray` (`internal/plan/types.go`), kolom
      `jsonb`, nullable (implement `sql.Scanner`/`driver.Valuer` sendiri pakai stdlib
      `encoding/json` — sengaja **tidak** nambah dependency baru kayak
      `gorm.io/datatypes` karena nggak bisa `go mod tidy`/fetch package baru di
      environment pengerjaan ini)
- [x] `AppScope` — `plan.AppScope` (string biasa), kolom `NOT NULL DEFAULT 'both'` —
      beda perlakuan dari `Modules` karena plain string nggak aman di-scan dari SQL
      NULL tanpa pointer/`sql.NullString`, jadi butuh default di level DB
- [x] `plans.Modules`/`plans.AppScope` juga ditambah (`internal/plan/model.go`) — sama
      persis alasannya, dipakai buat snapshot "dari plan" di § 6.4/6.5 nanti
- [x] Kolom `tier` tetap ada di `subscriptions`/`plans` (label pricing), **tidak lagi
      jadi sumber kebenaran enforcement** setelah Step 3 (§3) jalan
- [x] Backfill: `internal/db/backfill.go` — `BackfillModuleDefaults()`, jalan di setiap
      startup server (dipanggil dari `main.go` setelah `db.Migrate()`), idempotent
      (skip row yang `Modules` udah keisi). Mapping tier→modules persis dari CLAUDE.md
      § Feature Gating by Tier (starter=personal+chat/finance, pro=both+finance.pl,
      business=both+semua modul).
- [x] `subscription.Service.Create()` (dipanggil dari webhook Xendit first-payment)
      sekarang snapshot `Modules`/`AppScope` dari `planRepo.GetPlan()` langsung saat
      subscription dibuat — bukan nunggu backfill jalan di restart berikutnya. Ini
      nambah `planRepo` sebagai constructor param baru di `subscription.NewService()`,
      jadi semua caller (`main.go` + 2 test file) ikut di-update.

### 6.3 JWT claims

- [x] Tambah `modules`/`app_scope`/`claims_version` (`internal/license/signer.go`
      `Claims` struct) — `Signer.Sign()` sekarang minta 2 parameter tambahan
      (`modules`, `appScope`), kedua caller di `service.go` (`Activate`/`Validate`)
      sudah dipassing dari `sub.Modules`/`sub.AppScope`. `ClaimsVersion = 2` konstan,
      diset di setiap token baru.
- [ ] **Belum dikerjakan**: logic di app (Python `license_service.py`) buat baca
      `claims_version` dan paksa `/validate` ulang kalau JWT lama (versi 1, field
      `modules` kosong). Sengaja di-skip untuk sekarang — belum ada JWT v1 yang
      beredar di device customer nyata (produk belum rilis publik, lihat § 7.3), jadi
      belum ada kasus nyata yang butuh migrasi. Kerjakan sebelum rilis publik pertama
      kalau by then sudah ada beta tester yang pegang token v1.
- [ ] **Belum dikerjakan**: `/api/license/status` (Python, `api/license.py`) dan
      `licenseApi.ts` (frontend) belum expose `modules` dari claims — itu bagian dari
      Step 3/5, bukan § 6.3. JWT-nya sekarang sudah bawa `modules`, tinggal dibaca.

### 6.4 Admin API (Go, endpoint baru — protected, admin-only)

- [ ] Auth admin: mulai dari static `ADMIN_API_KEY` via env (cukup untuk MVP internal,
      bukan multi-admin dengan role) — catat sebagai shortcut, upgrade nanti kalau perlu
- [ ] `GET /admin/modules` — serve isi `configs/modules.json` (buat render checkbox di UI)
- [ ] `POST /admin/licenses` — generate key manual, dua mode:
      - **Dari plan**: body `{ plan_id, app_scope?, expires_at, seats?, customer_label }`
        — `modules`/`app_scope`/`seats` default di-*snapshot* dari plan saat create
        (edit plan nanti tidak mengubah key yang sudah terbit — lihat § 6.5)
      - **Custom**: body `{ app_scope, modules[], expires_at, seats, customer_label }`
        — override manual, dipakai khusus klien spesial/promo
      - `expires_at`: ISO date, atau `null` eksplisit untuk **tanpa batas waktu**
        (sama seperti pattern `plan.CycleLifetime` yang sudah ada di
        `internal/subscription/service.go`)
      - `seats`: jumlah device yang boleh aktif bersamaan — dipakai sebagai
        `included_seats` untuk key ini, ditegakkan oleh mekanisme seat yang **sudah
        ada** di `activateDevice()` (`internal/license/service.go`), bukan fitur baru
      - Tidak butuh invoice Xendit — ini jalur manual yang dimaksud user.
- [ ] `GET /admin/licenses` — list key + filter (status, app_scope, aktif/expired)
- [ ] `GET /admin/licenses/{id}` — detail: activations, seat usage, modules, riwayat
- [ ] `PATCH /admin/licenses/{id}` — edit `modules`/`app_scope`/`expires_at`/`seats` pada
      key yang sudah ada (device dapat entitlement baru otomatis di siklus `/validate`
      berikutnya, maks 10 menit)
- [ ] `POST /admin/licenses/{id}/revoke` — reuse logic revoke yang sudah ada

### 6.5 Admin API — CRUD Plan/Tier

Supaya bikin tier baru (atau promo) tidak perlu edit `configs/plans.json` + redeploy.

- [ ] `GET /admin/plans` — list semua plan (termasuk yang dibuat lewat admin, bukan cuma
      dari seed file)
- [ ] `POST /admin/plans` — buat tier baru: `{ name, tier_key, app_scope, modules[],
      included_seats, pricing: { monthly?, yearly?, lifetime? } }`
- [ ] `PATCH /admin/plans/{id}` — edit plan existing (nama, modul, harga, seats)
      — **tidak** retroaktif ke license yang sudah terbit dari plan ini (snapshot,
      lihat § 6.2)
- [ ] `DELETE /admin/plans/{id}` atau soft-delete (`archived`) — plan yang sudah pernah
      dipakai sebaiknya tidak benar-benar dihapus, biar riwayat license lama tetap
      bisa ditelusuri balik ke plan aslinya
- [ ] Endpoint checkout web publik (`web/pricing`) tetap baca dari `plans` yang sama —
      tier baru yang dibuat admin otomatis muncul di halaman pricing tanpa deploy ulang
      *(opsional, bisa menyusul — dicatat di sini supaya tidak lupa)*

### 6.6 Web Admin App (baru)

- [ ] App baru `apps/admin` (Next.js, internal-only, terpisah dari `web/` marketing site
      dan dari `personal`/`business` — tidak masuk `Makefile` dev-personal/dev-business)
- [ ] Auth: login sederhana pakai `ADMIN_API_KEY` (form input token, simpan di
      session/cookie) — cukup untuk tim internal kecil
- [ ] Halaman **List License** — tabel + filter (status, app scope, expired)
- [ ] Halaman **Create License** — toggle mode **Dari Plan** vs **Custom**:
      - Dari Plan: dropdown pilih tier (baca `GET /admin/plans`) → modul/seat/app_scope
        auto-terisi (read-only, bisa lihat tapi tidak edit — kalau mau beda, pindah ke
        mode Custom)
      - Custom: pilih app scope (radio), pilih modul (checkbox, render dari
        `GET /admin/modules`), jumlah seat (angka bebas)
      - Durasi (dipakai di kedua mode): preset **Bulanan / Tahunan / Lifetime (tanpa
        batas waktu)** atau custom date — pilih "Lifetime" mengirim `expires_at: null`
- [ ] Halaman **Detail License** — lihat activations per device (device mana yang
      terpakai dari kuota seat), edit modul/seat, revoke
- [ ] Halaman **Manage Plans** — CRUD tier (§ 6.5): list, create, edit, archive
- [ ] Styling: pakai token tema yang sama dengan app (`th-*` classes) biar konsisten,
      tapi tidak perlu sekomplit UI customer-facing — ini tool internal

### 6.7 Kenapa desain ini gampang di-extend

Modul baru di masa depan = **3 langkah, tanpa migration DB**:
1. Tambah 1 entry di `configs/modules.json`
2. Tambah 1 `require_module("modul_baru")` di router backend yang relevan
3. Checkbox modul baru otomatis muncul di web admin (karena UI baca dari `GET /admin/modules`, bukan hardcoded)

---

## 7. Production Readiness / Hardening

Temuan dari audit langsung ke kode `apps/api` + pipeline CI/CD — bukan fitur baru,
tapi gap yang bisa jadi masalah nyata di production (data korup, abuse, atau rilis
ketahan). Prioritas relatif ada di § Urutan pengerjaan.

### 7.1 Bug korektnes (perlu diperbaiki, bukan cuma "nice to have")

- [x] **Race condition seat limit** — diperbaiki. Logic check-then-insert dipindah
      dari `license.service.activateDevice()` ke `device.Repository.ActivateWithSeatCheck()`
      (`internal/device/repository.go`), dibungkus `db.Transaction(...)` +
      `pg_advisory_xact_lock(licenseKeyID)` supaya aktivasi bersamaan untuk key yang
      sama diserialisasi — tidak bisa lagi dua device lolos count-check bersamaan.
      Test baru: `TestIntegration_Activate_ConcurrentExceedsSeat_OnlyOneSucceeds`
      (8 goroutine rebutan 1 seat, assert cuma 1 yang berhasil).
- [x] **Webhook Xendit tidak idempotent** — diperbaiki. Tabel baru
      `processed_webhook_events` (`internal/webhook/idempotency.go`) via
      `INSERT ... ON CONFLICT (id, source) DO NOTHING`, dicek di awal
      `HandleFirstPayment`/`HandleXenditRecurring` pakai `event.ID` dari payload
      Xendit — event yang sudah diproses langsung return `200 OK` tanpa proses ulang
      (penting: harus tetap 200, bukan error, supaya Xendit berhenti retry).
      Ditambah field `ID` ke `XenditRecurringEvent` (sebelumnya belum ada).
      Test baru: `TestHandleFirstPayment_DuplicateEventID_CreatesSubscriptionOnce`,
      `TestHandleRecurring_DuplicateEventID_ExtendsOnce`.
      **Divalidasi** — Go 1.25.12 di-install lokal (via tarball resmi, bukan lewat
      Homebrew yang butuh sudo), Postgres 16 di Docker buat integration test.
      `go build ./...` ✅ `go vet ./...` ✅ `gofmt` bersih (kecuali 3 file pre-existing
      yang tidak disentuh) `go test ./...` ✅ **44/44 test PASS**, termasuk test
      concurrency & idempotency di atas.

### 7.2 Keamanan

- [ ] **Rencana rotasi RSA signing key** — Step 4 (§4) embed public key ke binary app.
      Belum ada strategi kalau `LICENSE_PRIVATE_KEY` perlu dirotasi (bocor, dsb).
      Tanpa `kid` di JWT header + dukungan multi-public-key di app, rotasi key bikin
      semua JWT offline lama tidak valid untuk app yang belum update binary.
      Rekomendasi: tambah `kid` claim + array public key (bukan single key) di
      `license_pub.pem`/config, app coba semua key yang dikenal saat verify offline.
- [ ] **Rate limiting** belum ada di `/activate`, `/validate`, dan endpoint `/admin/*`
      yang direncanakan (§6.4-6.5). Risiko rendah untuk brute-force key (64-bit
      entropy), tapi tetap celah abuse/DoS di endpoint publik tanpa auth.
      Rekomendasi: middleware rate-limit per-IP (mis. `chi` + `httprate`).
- [ ] **CORS belum diset** di Go API (`go.mod` tidak ada dependency CORS). Begitu web
      admin (§6.6) manggil `/admin/*` dari browser, ini **blocking**, bukan opsional —
      harus di-address bareng § 6.4.
- [ ] **`.env.example` tidak ada** di `apps/api` — tambahkan biar setup env var
      (`DATABASE_URL`, `JWT_SECRET`, `LICENSE_PRIVATE_KEY`, `ADMIN_API_KEY`, dst)
      terdokumentasi, tidak cuma di README prose.

### 7.3 CI/CD & deployment

- [ ] **Workflow test dibuat manual-only** — `.github/workflows/test.yml` sudah dibuat
      (go vet + gofmt check + go test dengan Postgres service container), tapi trigger
      cuma `workflow_dispatch` (manual) supaya **tidak makan kuota Actions minutes**
      di GitHub Free tier. Aktifkan `pull_request`/`push` trigger setelah repo pindah
      tier berbayar (atau kalau kuota gratis tidak lagi jadi masalah).
- [ ] **`build.yml` — push trigger sengaja dimatikan** (lihat komentar baris 4-6:
      *"aktifkan kembali saat billing sudah siap"*). Reaktifkan setelah Step 1-5 +
      § 6 (enforcement + admin) selesai dan siap rilis publik. Sampai saat itu, biarkan
      manual (`workflow_dispatch`) — jangan ubah triggernya duluan.
- [ ] **Tidak ada deployment artifact untuk `apps/api`** — tidak ada Dockerfile, tidak
      ada dokumentasi hosting/TLS/backup untuk Go API. Ini API yang jadi gatekeeper
      seluruh produk (semua app cek ke sini saat aktivasi + tiap 10 menit validate) —
      perlu tempat resmi jalanin di production sebelum publish key ke customer nyata.
- [ ] **Installer belum code-signed** (dicatat sendiri di `build.yml`: *"belum ada code
      signing"*) — user macOS/Windows dapat warning Gatekeeper/SmartScreen saat install.
      Butuh sertifikat code-signing (berbayar) — tidak blocking teknis, tapi bagian dari
      pengalaman rilis produk berbayar. Dicatat sebagai item terpisah, prioritas rendah.

---

## Go API (`apps/api`) — belum ada

- [ ] Admin CLI `license get --subscription-id=X` — ambil key berdasarkan subscription
- [ ] Admin CLI `sub list` / `sub revoke`
- [ ] Self-service flow — kirim key otomatis via email setelah pembayaran
- [ ] Simpan pending invoice di DB sebelum pembayaran (metadata lookup lebih kaya)

---

## Urutan pengerjaan yang disarankan

1. ~~**§7.1** (race condition seat limit + webhook idempotency)~~ — **selesai & tervalidasi**
   (`go build`/`go vet`/`go test` — 44/44 pass, termasuk test konkurensi & idempotency,
   dijalankan lokal dengan Go 1.25.12 + Postgres 16 beneran di Docker).
2. ~~**Step 1 → Step 2**~~ — **selesai & tervalidasi** (`require_license`/
   `require_active_license` ditest via FastAPI `TestClient` beneran terhadap
   `license_service.py` asli, 8/8 assertion pass di kedua app — lihat § 1a/§ 2).
3. ~~**§6.2 → §6.3**~~ — **selesai & tervalidasi** (skema `modules`/`app_scope` di
   `subscriptions`+`plans`, backfill, JWT claims v2 — termasuk 3 test khusus buat
   `BackfillModuleDefaults()` yang jalan langsung ke Postgres beneran, semua pass).
4. **§6.1 → §6.4 → §6.5** (module registry + admin API license CRUD + admin API plan
   CRUD) — sekalian address **§7.2 CORS** di endpoint `/admin/*` waktu bikin ini, jangan
   ditambal belakangan. Bisa ditest lewat curl/admin-cli dulu sebelum ada UI.
5. **Step 3 → Step 5** (module-based gating backend + frontend, sepasang — jangan gate
   salah satu doang)
6. **Step 4 + §7.2 key rotation plan** (public key di-bundle) — desain dukungan
   multi-key/`kid` **sebelum** binary pertama dirilis ke user, karena begitu ada app
   di luar sana pakai skema single-key, migrasi ke multi-key jadi jauh lebih ribet
7. **§6.6** (Web Admin UI) — setelah API-nya (§6.4, §6.5) siap dipanggil
8. **§7.2 sisanya** (rate limiting, `.env.example`) — bisa paralel kapan saja, tidak
   blocking fitur lain
9. **§7.3** (reaktifkan `.github/workflows/test.yml` ke trigger otomatis, deployment
   artifact `apps/api`, reaktifkan `build.yml`, code signing) — di ujung, pas siap rilis
   publik. `test.yml` sudah ada filenya tapi **tetap manual-only** sampai poin ini.
10. Go API admin CLI/self-service items — bisa paralel, tidak blocking rilis app
