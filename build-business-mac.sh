#!/usr/bin/env bash
# Build LOQA Work for macOS — produces a signed .dmg and .app bundle
# Usage: ./build-business-mac.sh [--arch arm64|x86_64|universal]
#
# Requirements:
#   - Python 3.11    (python3.11 on PATH)
#   - Node.js >= 18  (node, npm on PATH)
#   - Rust + Cargo   (rustup recommended)
#   - Tauri CLI      (cargo install tauri-cli)
#   - Xcode CLI tools (xcode-select --install)
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
APP="business"
APP_NAME="LOQA Work"
BACKEND_BINARY="loqa-work-backend"
BACKEND_PORT="8001"
BACKEND_DIR="apps/$APP/backend"
FRONTEND_DIR="apps/$APP/frontend"
TAURI_DIR="apps/$APP/tauri-app"
RESOURCES_DIR="$TAURI_DIR/src-tauri"

# Architecture: arm64 (Apple Silicon), x86_64 (Intel), or universal (both)
ARCH="${1:-}"
if [[ "$ARCH" == --arch=* ]]; then ARCH="${ARCH#--arch=}"; fi
if [[ -z "$ARCH" ]]; then
  ARCH=$(uname -m)   # auto-detect: arm64 or x86_64
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
step() { echo ""; echo "▶ $*"; }
ok()   { echo "  ✓ $*"; }
fail() { echo "  ✗ $*" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "╔══════════════════════════════════════╗"
echo "║   $APP_NAME — macOS Build            ║"
echo "╚══════════════════════════════════════╝"
echo "  Arch : $ARCH"
echo "  Root : $ROOT_DIR"

# ── Preflight checks ──────────────────────────────────────────────────────────
step "Checking prerequisites..."
command -v python3.11 >/dev/null 2>&1 || fail "python3.11 not found"
command -v node       >/dev/null 2>&1 || fail "node not found"
command -v cargo      >/dev/null 2>&1 || fail "cargo not found (install Rust via rustup)"
cargo tauri --version >/dev/null 2>&1 || fail "cargo-tauri not found (run: cargo install tauri-cli)"
ok "All prerequisites found"

# ── Step 1: Python venv + deps ────────────────────────────────────────────────
step "[1/6] Setting up Python environment..."
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
  python3.11 -m venv .venv
  ok "Created .venv"
fi
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install "pyinstaller>=6.0" --quiet
.venv/bin/pip install -r requirements.txt --quiet
ok "Python dependencies installed"
cd "$ROOT_DIR"

# ── Step 2: Build backend binary with PyInstaller ─────────────────────────────
step "[2/6] Building backend binary (PyInstaller)..."
cd "$BACKEND_DIR"

if [[ "$ARCH" == "universal" ]]; then
  # Build for both architectures then lipo-merge
  ok "Building arm64 slice..."
  ARCHFLAGS="-arch arm64" \
    .venv/bin/python -m PyInstaller build_backend.spec --noconfirm --clean \
    --distpath dist/arm64
  ok "Building x86_64 slice..."
  ARCHFLAGS="-arch x86_64" \
    .venv/bin/python -m PyInstaller build_backend.spec --noconfirm --clean \
    --distpath dist/x86_64
  mkdir -p dist/universal
  lipo -create \
    "dist/arm64/$BACKEND_BINARY" \
    "dist/x86_64/$BACKEND_BINARY" \
    -output "dist/universal/$BACKEND_BINARY"
  ok "Universal binary created with lipo"
  BINARY_PATH="dist/universal/$BACKEND_BINARY"
else
  .venv/bin/python -m PyInstaller build_backend.spec --noconfirm --clean
  BINARY_PATH="dist/$BACKEND_BINARY"
fi

[ -f "$BINARY_PATH" ] || fail "Backend binary not found at $BINARY_PATH"
ok "Backend binary built: $BINARY_PATH"
cd "$ROOT_DIR"

# ── Step 3: Copy binary to Tauri resources ────────────────────────────────────
step "[3/6] Staging backend binary for Tauri..."
cp "$BACKEND_DIR/$BINARY_PATH" "$RESOURCES_DIR/$BACKEND_BINARY"
chmod +x "$RESOURCES_DIR/$BACKEND_BINARY"
ok "Copied to $RESOURCES_DIR/$BACKEND_BINARY"

# ── Step 4: Build Next.js frontend (static export) ───────────────────────────
step "[4/6] Building frontend..."
cd "$FRONTEND_DIR"
npm install --silent
npm run build
ok "Frontend built"
cd "$ROOT_DIR"

# ── Step 5: Tauri build ───────────────────────────────────────────────────────
step "[5/6] Building Tauri app (.app + .dmg)..."
cd "$TAURI_DIR"
if [[ "$ARCH" == "universal" ]]; then
  cargo tauri build --target universal-apple-darwin
else
  cargo tauri build
fi
cd "$ROOT_DIR"

# ── Step 6: Report output ─────────────────────────────────────────────────────
step "[6/6] Build complete!"
BUNDLE_DIR="$TAURI_DIR/src-tauri/target"
if [[ "$ARCH" == "universal" ]]; then
  BUNDLE_DIR="$BUNDLE_DIR/universal-apple-darwin/release/bundle"
else
  BUNDLE_DIR="$BUNDLE_DIR/release/bundle"
fi

echo ""
echo "  Output directory: $BUNDLE_DIR"
echo ""
if [ -d "$BUNDLE_DIR/dmg" ]; then
  echo "  DMG installer:"
  ls "$BUNDLE_DIR/dmg/"*.dmg 2>/dev/null | while read f; do
    echo "    → $f  ($(du -sh "$f" | cut -f1))"
  done
fi
if [ -d "$BUNDLE_DIR/macos" ]; then
  echo "  App bundle:"
  ls "$BUNDLE_DIR/macos/"*.app 2>/dev/null | while read f; do
    echo "    → $f"
  done
fi
echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Done — $APP_NAME ready to ship!   ║"
echo "╚══════════════════════════════════════╝"
