# LOQA — Local Question & Answer

> **Proprietary Software** — Source code ini hanya boleh dilihat untuk keperluan evaluasi.
> Penggunaan, modifikasi, distribusi, dan penggunaan komersial tanpa izin tertulis dilarang.
> Lihat [LICENSE](LICENSE) untuk detail lengkap.

**Your data. Your device. Your decision.**

Aplikasi AI knowledge base pribadi dan bisnis yang berjalan sepenuhnya di komputer Anda. Upload dokumen, chat dengan AI, kelola keuangan, lacak inventori, dan proses pesanan — tanpa data keluar dari perangkat Anda.

| App | Nama | Kegunaan |
|-----|------|---------|
| **personal** | LOQA Home | Asisten AI pribadi + keuangan pribadi |
| **business** | LOQA Work | Asisten AI bisnis + keuangan + inventori + proyek |

---

## Fitur Utama

- **Chat dengan dokumen** — Upload PDF, DOCX, atau TXT, lalu tanya langsung ke AI
- **Berjalan lokal** — Model AI berjalan di komputer Anda, tanpa langganan cloud
- **Mendukung cloud AI** — OpenAI, Gemini, atau Ollama sebagai alternatif
- **Keuangan** — Pencatatan transaksi, laporan P&L, dan analitik
- **Inventori** — Manajemen stok multi-gudang, gambar produk, import CSV, dan log import *(LOQA Work)*
- **Point of Sale** — Kasir dengan kalkulator kembalian, manajemen pesanan, dan riwayat order *(LOQA Work)*
- **Manajemen Proyek** — RAB, manajemen pekerja, pembayaran, dan invoice dengan integrasi keuangan *(LOQA Work)*
- **Privasi penuh** — Data tidak pernah dikirim ke server eksternal

---

## Cara Install (Aplikasi Binary)

### Prasyarat

- **Ollama** *(direkomendasikan untuk model AI lokal)* — [ollama.com](https://ollama.com)
- Atau gunakan provider cloud: OpenAI / Gemini *(butuh API key)*

### Download

> Halaman release tersedia di tab **Releases** repositori ini.

| Platform | File |
|----------|------|
| macOS | `LOQA-Home_x.x.x_aarch64.dmg` / `x64.dmg` |
| Windows | `LOQA-Home_x.x.x_x64-setup.exe` |

1. Download installer sesuai platform
2. Install seperti aplikasi biasa
3. Buka aplikasi — backend berjalan otomatis di background
4. Buka **Settings** untuk mengatur provider AI

---

## Cara Build dari Source

### Prasyarat Build

| Tool | Versi | Keterangan |
|------|-------|-----------|
| Python | 3.11+ | Backend |
| Node.js | 18+ | Frontend |
| Rust | 1.77+ | Tauri |
| Cargo Tauri CLI | 1.x | `cargo install tauri-cli` |

### macOS

```bash
# Clone repositori
git clone <repo-url>
cd knowledge-ai

# Build LOQA Home
make build-personal-mac

# Build LOQA Work
make build-business-mac
```

Output installer: `apps/personal/tauri-app/src-tauri/target/release/bundle/`

### Windows

Buka **Command Prompt** (bukan PowerShell) di folder project:

```bat
:: Build LOQA Home (auto-detect GPU NVIDIA)
build-personal-windows.bat

:: Build LOQA Work (auto-detect GPU NVIDIA)
build-business-windows.bat
```

Script secara otomatis mendeteksi GPU NVIDIA. Jika terdeteksi, binary akan dikompilasi dengan dukungan CUDA untuk inferensi lebih cepat.

**Flag manual (opsional):**

```bat
build-personal-windows.bat --cuda   :: Paksa CUDA
build-personal-windows.bat --cpu    :: Paksa CPU only
```

> **Catatan Windows:** Build pertama membutuhkan [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) dengan komponen "Desktop development with C++".

Output installer: `apps\personal\tauri-app\src-tauri\target\release\bundle\`

---

## Cara Menjalankan Mode Developer

### Prasyarat

```bash
# Install backend dependencies
cd apps/personal/backend
python3.11 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Install frontend dependencies
cd apps/personal/frontend
npm install
```

### Jalankan

```bash
# LOQA Home (backend port 8000, frontend port 3000)
make dev-personal

# LOQA Work (backend port 8001, frontend port 3002)
make dev-business
```

Atau jalankan lewat script:

```bash
./start.sh personal   # http://localhost:3000
./start.sh business   # http://localhost:3002
```

### Dengan Docker

```bash
# Jalankan LOQA Home
make docker-up-personal

# Jalankan LOQA Work
make docker-up-business

# Jalankan keduanya
make docker-up
```

**Menghentikan Docker:**

```bash
make docker-down-personal          # Stop saja, data tetap
make docker-down-personal-clean    # Stop + hapus data (model tetap)
make docker-down-personal-purge    # Stop + hapus semua termasuk model
```

---

## Konfigurasi Provider AI

Buka **Settings** di dalam aplikasi untuk mengatur provider:

### Ollama *(Rekomendasi — gratis, offline)*

1. Install Ollama dari [ollama.com](https://ollama.com)
2. Di Settings → Chat Model, pilih **Ollama**
3. Download model dari menu **Kelola Model**

### Local GGUF *(Built-in, tanpa Ollama)*

1. Di Settings → Chat Model, pilih **Local**
2. Buka **Kelola Model → Chat**
3. Cari repositori HuggingFace dan download model `.gguf`

Model yang direkomendasikan:

| Kegunaan | Model | Ukuran |
|---------|-------|--------|
| Chat — ringan | `unsloth/gemma-3-4b-it-GGUF` | ~2.5 GB |
| Chat — lebih pintar | `unsloth/Qwen3-8B-GGUF` | ~5 GB |
| Baca Dokumen | `nomic-ai/nomic-embed-text-v1` | ~270 MB |
| Penyaring | `cross-encoder/ms-marco-MiniLM-L-6-v2` | ~90 MB |

### OpenAI / Gemini *(cloud, butuh API key)*

1. Di Settings → Chat Model, pilih **OpenAI** atau **Gemini**
2. Masukkan API key
3. Pilih nama model

---

## Struktur Proyek

```
knowledge-ai/
├── apps/
│   ├── personal/          # LOQA Home (port 8000/3000)
│   │   ├── backend/       # FastAPI + Python
│   │   ├── frontend/      # Next.js 14
│   │   └── tauri-app/     # Desktop wrapper
│   └── business/          # LOQA Work (port 8001/3002)
├── shell/                 # Launcher UI (port 3001)
├── docker/                # Docker Compose files
├── build-personal-mac.sh
├── build-business-mac.sh
├── build-personal-windows.bat
├── build-business-windows.bat
├── start.sh
└── Makefile
```

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | FastAPI, Python 3.11, SQLite / PostgreSQL |
| Frontend | Next.js 14, Tailwind CSS, TypeScript |
| Desktop | Tauri |
| Model AI lokal | llama-cpp-python (GGUF) |
| Embedding | sentence-transformers |
| Vector DB | ChromaDB |
| Database | SQLite — `finance.db`, `inventory.db`, `order.db`, `project.db` (terpisah per modul) |
| Penyimpanan gambar | `backend/data/product_images/` (lokal, tidak ke cloud) |

---

## Lisensi

Lihat file `LICENSE` untuk detail.
