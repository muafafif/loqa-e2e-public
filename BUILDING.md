# Panduan Build — LOQA Home & LOQA Work

Dokumen ini menjelaskan cara membuat installer `.dmg` (macOS) dan `.exe` (Windows) untuk kedua aplikasi.

---

## Daftar Isi

- [Gambaran Umum](#gambaran-umum)
- [GitHub Actions — Auto Build](#github-actions--auto-build)
- [Prasyarat](#prasyarat)
- [Build macOS (.dmg)](#build-macos-dmg)
- [Build Windows (.exe)](#build-windows-exe)
- [Troubleshooting](#troubleshooting)

---

## GitHub Actions — Auto Build

Cara termudah untuk membuat installer adalah lewat GitHub Actions — tidak perlu setup apapun di komputer lokal.

### Cara Kerja

Setiap kali ada perubahan yang di-push ke branch `main`, GitHub Actions otomatis membangun semua installer:

| Installer | Platform |
|-----------|----------|
| `LOQA Home_x.x.x_aarch64.dmg` | macOS Apple Silicon (M1/M2/M3) |
| `LOQA Home_x.x.x_x64.dmg` | macOS Intel |
| `LOQA Home_x.x.x_x64-setup.exe` | Windows (semua PC) |
| `LOQA Home_x.x.x_x64-setup-cuda.exe` | Windows (NVIDIA GPU) |
| `LOQA Work_x.x.x_aarch64.dmg` | macOS Apple Silicon |
| `LOQA Work_x.x.x_x64.dmg` | macOS Intel |
| `LOQA Work_x.x.x_x64-setup.exe` | Windows (semua PC) |
| `LOQA Work_x.x.x_x64-setup-cuda.exe` | Windows (NVIDIA GPU) |

---

### Trigger 1 — Push ke main (hasil di Artifacts)

Setiap push ke `main` otomatis memulai build. Hasilnya tersimpan sebagai **Artifacts** selama 7 hari.

**Cara mengambil hasil build:**

1. Buka tab **Actions** di repositori GitHub
2. Klik run terbaru (yang berlabel ✅ atau sedang berjalan 🟡)
3. Scroll ke bawah ke bagian **Artifacts**
4. Download installer yang diinginkan

```
Actions → [run terbaru] → Artifacts → installer-personal-mac-arm64
                                     installer-personal-windows-cpu
                                     installer-business-mac-arm64
                                     ... (8 total)
```

> Build selesai dalam ±20–30 menit. Artifacts tersedia segera setelah seluruh job selesai.

---

### Trigger 2 — Push tag versi (hasil di Releases)

Untuk distribusi publik, buat tag versi. Build yang sama akan berjalan, lalu semua installer di-attach ke **GitHub Release** sebagai draft otomatis.

**Langkah-langkah:**

**1. Update nomor versi** di kedua file `tauri.conf.json`:

```bash
# apps/personal/tauri-app/src-tauri/tauri.conf.json
# apps/business/tauri-app/src-tauri/tauri.conf.json
```

Ubah field `"version"` sesuai versi baru, misalnya `"1.0.0"`.

**2. Commit perubahan:**

```bash
git add apps/personal/tauri-app/src-tauri/tauri.conf.json \
        apps/business/tauri-app/src-tauri/tauri.conf.json
git commit -m "chore: bump version to 1.0.0"
git push origin main
```

**3. Buat dan push tag:**

```bash
git tag v1.0.0
git push origin v1.0.0
```

**4. Publish Release:**

Setelah build selesai (±20–30 menit):

1. Buka tab **Releases** di repositori GitHub
2. Klik draft release yang baru muncul (berlabel `LOQA v1.0.0`)
3. Periksa deskripsi dan installer yang ter-attach
4. Klik **Publish release**

> Installer akan otomatis bernama sesuai versi, misalnya `LOQA Home_1.0.0_aarch64.dmg`.

---

### Trigger 3 — Manual (tanpa push)

Untuk menjalankan build tanpa melakukan push:

1. Buka tab **Actions** di repositori GitHub
2. Klik workflow **Build Installers** di sidebar kiri
3. Klik tombol **Run workflow**
4. Pilih branch `main`, klik **Run workflow**

Hasilnya tersimpan sebagai Artifacts seperti Trigger 1.

---

### Melihat Progress Build

Build terdiri dari dua tahap yang berjalan secara bertahap:

```
Tahap 1 — Backend (±10 menit, 8 job parallel)
  personal-backend-mac-arm64
  personal-backend-mac-x64
  personal-backend-windows-cpu
  personal-backend-windows-cuda
  business-backend-mac-arm64
  business-backend-mac-x64
  business-backend-windows-cpu
  business-backend-windows-cuda
        ↓ selesai semua
Tahap 2 — Tauri (±15 menit, 8 job parallel)
  installer-personal-mac-arm64    → .dmg
  installer-personal-mac-x64      → .dmg
  installer-personal-windows-cpu  → -setup.exe
  installer-personal-windows-cuda → -setup-cuda.exe
  installer-business-mac-arm64    → .dmg
  installer-business-mac-x64      → .dmg
  installer-business-windows-cpu  → -setup.exe
  installer-business-windows-cuda → -setup-cuda.exe
```

Jika salah satu job gagal, job lainnya tetap berjalan. Klik job yang gagal untuk melihat log error.

---

### Batalkan Build yang Tidak Diperlukan

Jika push ke `main` dilakukan berkali-kali dalam waktu singkat, build sebelumnya otomatis dibatalkan — hanya build terbaru yang berjalan. Tidak perlu dibatalkan secara manual.

---

## Gambaran Umum

Proses build terdiri dari dua tahap:

```
1. Backend (Python)  →  PyInstaller  →  knowledge-ai-backend[.exe]
                                               ↓
2. Frontend (Next.js) + Backend binary  →  Tauri  →  .dmg / .exe
```

Backend dikompilasi menjadi satu binary mandiri menggunakan PyInstaller, kemudian di-bundle bersama frontend oleh Tauri menjadi installer final.

---

## Prasyarat

Semua tool di bawah harus diinstall manual sebelum menjalankan perintah build apapun. Script build tidak menginstall Python, Node, atau Rust secara otomatis.

---

### macOS — Install Semua Prasyarat

Jalankan perintah berikut satu per satu di Terminal:

**1. Xcode Command Line Tools**

```bash
xcode-select --install
```

Sebuah dialog akan muncul — klik Install dan tunggu hingga selesai.

**2. Homebrew** (jika belum ada)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**3. Python 3.11 dan Node.js**

```bash
brew install python@3.11 node
```

**4. Rust**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Ikuti instruksi di layar (tekan Enter untuk pilihan default), lalu jalankan:

```bash
source ~/.cargo/env
```

**5. Tauri CLI**

```bash
cargo install tauri-cli --version "^1"
```

> Proses ini membutuhkan waktu beberapa menit karena mengkompilasi dari source.

**Verifikasi semua sudah terinstall:**

```bash
python3.11 --version   # Python 3.11.x
node --version         # v18.x atau lebih baru
cargo --version        # cargo 1.77.x atau lebih baru
cargo tauri --version  # tauri-cli 1.x.x
```

---

### Windows — Install Semua Prasyarat

**1. Python 3.11+**

Download installer dari [python.org](https://www.python.org/downloads/windows/) dan jalankan.

> **Penting:** Centang **"Add Python to PATH"** sebelum klik Install.

**2. Node.js 18+**

Download installer dari [nodejs.org](https://nodejs.org/) dan jalankan.

**3. Visual Studio Build Tools 2022**

Download dari [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) dan jalankan.

> **Penting:** Saat memilih komponen, centang **"Desktop development with C++"**.

**4. Rust**

Download dan jalankan `rustup-init.exe` dari [rustup.rs](https://rustup.rs/).

Ikuti instruksi di layar (tekan Enter untuk pilihan default). Setelah selesai, **tutup dan buka ulang Command Prompt**.

**5. Tauri CLI**

Buka Command Prompt baru, lalu jalankan:

```bat
cargo install tauri-cli --version "^1"
```

> Proses ini membutuhkan waktu beberapa menit.

**6. WebView2** (jika tidak ada)

Sudah termasuk di Windows 10/11. Jika build gagal karena WebView2 tidak ditemukan: [download di sini](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

**7. Driver NVIDIA** (opsional — untuk build CUDA)

Install driver versi 520+ dari [nvidia.com/drivers](https://www.nvidia.com/drivers). Script build akan otomatis mendeteksinya.

**Verifikasi semua sudah terinstall** (di Command Prompt baru):

```bat
python --version      :: Python 3.11.x
node --version        :: v18.x atau lebih baru
cargo --version       :: cargo 1.77.x atau lebih baru
cargo tauri --version :: tauri-cli 1.x.x
```

---

## Build macOS (.dmg)

> Harus dijalankan di mesin macOS. Pastikan semua prasyarat di atas sudah terinstall terlebih dahulu.
> Build untuk Apple Silicon dan Intel masing-masing harus dilakukan di mesin yang sesuai.

Setelah prasyarat terpenuhi, cukup jalankan satu perintah dari folder root project:

### LOQA Home

```bash
make build-personal-mac
```

### LOQA Work

```bash
make build-business-mac
```

### Apa yang Dilakukan Script

Script `build-personal-mac.sh` / `build-business-mac.sh` menjalankan langkah berikut secara otomatis:

**Langkah 1 — Setup Python environment**

```bash
cd apps/personal/backend
python3.11 -m venv .venv
.venv/bin/pip install pyinstaller
.venv/bin/pip install -r requirements.txt
```

**Langkah 2 — Kompilasi backend dengan PyInstaller**

```bash
.venv/bin/pyinstaller build_backend.spec --noconfirm --clean
# Output: apps/personal/backend/dist/knowledge-ai-backend
```

**Langkah 3 — Salin binary ke Tauri resources**

```bash
cp dist/knowledge-ai-backend apps/personal/tauri-app/src-tauri/
```

**Langkah 4 — Build frontend**

```bash
cd apps/personal/frontend
npm install
npm run build
```

**Langkah 5 — Build Tauri (.dmg)**

```bash
cd apps/personal/tauri-app
cargo tauri build
```

### Output

```
apps/personal/tauri-app/src-tauri/target/release/bundle/
├── dmg/
│   └── LOQA Home_0.1.0_aarch64.dmg   ← installer untuk distribusi
└── macos/
    └── LOQA Home.app                  ← app bundle (tanpa installer)
```

---

## Build Windows (.exe)

> Harus dijalankan di mesin Windows. Pastikan semua prasyarat di atas sudah terinstall terlebih dahulu.
> Buka **Command Prompt** (bukan PowerShell) di folder root project.

Setelah prasyarat terpenuhi, cukup jalankan satu perintah:

### LOQA Home

```bat
:: Auto-detect GPU NVIDIA — CUDA jika ada, CPU jika tidak
build-personal-windows.bat

:: Paksa CPU only
build-personal-windows.bat --cpu

:: Paksa CUDA (NVIDIA GPU)
build-personal-windows.bat --cuda
```

### LOQA Work

```bat
build-business-windows.bat
build-business-windows.bat --cpu
build-business-windows.bat --cuda
```

### Deteksi GPU Otomatis

Script menjalankan `nvidia-smi` untuk mendeteksi keberadaan driver NVIDIA:

- **Driver ditemukan** → build dengan CUDA (inferensi lebih cepat di GPU)
- **Driver tidak ditemukan** → build CPU only

### Perbedaan CPU vs CUDA Build

| | CPU | CUDA |
|-|-----|------|
| Prasyarat user | Tidak ada | NVIDIA driver 520+ |
| Kecepatan inferensi | Lambat–sedang | Cepat |
| Ukuran installer | Lebih kecil | Lebih besar (~300 MB+) |
| Kompatibilitas | Semua PC | Hanya PC dengan GPU NVIDIA |

### Apa yang Dilakukan Script

**Langkah 1 — Setup Python environment**

```bat
cd apps\personal\backend
python -m venv .venv
.venv\Scripts\pip install pyinstaller
```

Untuk CUDA, script menambahkan variabel lingkungan sebelum install `llama-cpp-python`:

```bat
set CMAKE_ARGS=-DLLAMA_CUDA=on
.venv\Scripts\pip install llama-cpp-python --force-reinstall
```

**Langkah 2 — Kompilasi backend dengan PyInstaller**

```bat
.venv\Scripts\pyinstaller build_backend.spec --noconfirm --clean
:: Output: apps\personal\backend\dist\knowledge-ai-backend.exe
```

**Langkah 3 — Salin binary ke Tauri resources**

```bat
copy dist\knowledge-ai-backend.exe apps\personal\tauri-app\src-tauri\
```

**Langkah 4 — Build frontend**

```bat
cd apps\personal\frontend
npm install
npm run build
```

**Langkah 5 — Build Tauri (.exe)**

```bat
cd apps\personal\tauri-app
cargo tauri build
```

### Output

```
apps\personal\tauri-app\src-tauri\target\release\bundle\
├── msi\
│   └── LOQA Home_0.1.0_x64_en-US.msi    ← installer MSI
└── nsis\
    └── LOQA Home_0.1.0_x64-setup.exe     ← installer EXE ← untuk distribusi
```

> Gunakan file di folder `nsis/` untuk distribusi — ukurannya lebih kecil dan tidak butuh Windows Installer.

---

## Troubleshooting

### `cargo tauri` tidak ditemukan

```bash
cargo install tauri-cli --version "^1"
```

### PyInstaller gagal: `ModuleNotFoundError`

Pastikan semua dependensi sudah terinstall di venv yang benar:

```bash
# macOS/Linux
.venv/bin/pip install -r requirements.txt

# Windows
.venv\Scripts\pip install -r requirements.txt
```

Jika modul tertentu masih tidak ditemukan, tambahkan ke bagian `hiddenimports` di `build_backend.spec`.

### macOS: `knowledge-ai-backend` tidak ada izin eksekusi

```bash
chmod +x apps/personal/tauri-app/src-tauri/knowledge-ai-backend
```

### Windows: build CUDA gagal — `CMake not found`

CMake sudah termasuk di Visual Studio Build Tools. Pastikan komponen **"Desktop development with C++"** sudah diinstall, lalu restart Command Prompt.

### Windows: `nvidia-smi` tidak dikenali padahal ada GPU NVIDIA

Driver belum terinstall atau path tidak terdaftar. Install driver terbaru dari [nvidia.com/drivers](https://www.nvidia.com/drivers), lalu jalankan ulang script. Atau paksa CUDA manual:

```bat
build-personal-windows.bat --cuda
```

### Ukuran binary terlalu besar

PyInstaller menyertakan seluruh Python runtime. Ini normal — ukuran backend binary sekitar 500 MB–1 GB tergantung dependensi. Tauri mengompresnya saat membuat installer.

Untuk mengurangi ukuran, tambahkan modul yang tidak dipakai ke bagian `excludes` di `build_backend.spec`:

```python
excludes=['tkinter', 'matplotlib', 'PIL', 'IPython'],
```

---

## Catatan Distribusi

- **macOS**: file `.dmg` bisa langsung didistribusikan. Tanpa code signing Apple, user perlu klik kanan → Open saat pertama kali membuka aplikasi.
- **Windows**: file `.exe` di folder `nsis/` bisa langsung didistribusikan. Tanpa code signing, Windows SmartScreen akan menampilkan peringatan — user bisa klik "More info" → "Run anyway".
- **Code signing** direkomendasikan untuk distribusi publik agar tidak ada peringatan keamanan.
