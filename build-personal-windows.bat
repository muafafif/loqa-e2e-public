@echo off
:: Build LOQA Home for Windows
:: Usage:
::   build-personal-windows.bat          (auto-detect GPU)
::   build-personal-windows.bat --cuda   (force CUDA)
::   build-personal-windows.bat --cpu    (force CPU only)
setlocal enabledelayedexpansion

set APP=personal
set BACKEND_DIR=apps\%APP%\backend
set TAURI_DIR=apps\%APP%\tauri-app
set FRONTEND_DIR=apps\%APP%\frontend
set RESOURCES_DIR=%TAURI_DIR%\src-tauri
set CUDA_BUILD=0
set FORCE_CPU=0

:: Parse arguments
for %%A in (%*) do (
    if /I "%%A"=="--cuda" set CUDA_BUILD=1
    if /I "%%A"=="--cpu"  set FORCE_CPU=1
)

echo === LOQA Home — Windows Build ===
echo.

:: Auto-detect CUDA if no flag given
if "%CUDA_BUILD%"=="0" if "%FORCE_CPU%"=="0" (
    echo Mendeteksi GPU NVIDIA...
    nvidia-smi >nul 2>&1
    if !errorlevel! == 0 (
        set CUDA_BUILD=1
        echo      GPU NVIDIA terdeteksi — build dengan CUDA.
    ) else (
        echo      GPU NVIDIA tidak ditemukan — build CPU only.
    )
)

if "%CUDA_BUILD%"=="1" (
    echo Variant: CUDA ^(NVIDIA GPU^)
) else (
    echo Variant: CPU only
)
echo.

:: 1. Setup Python venv
echo [1/5] Setting up Python environment...
cd %BACKEND_DIR%
if not exist ".venv" (
    python -m venv .venv
)
.venv\Scripts\pip install --upgrade pip --quiet
.venv\Scripts\pip install pyinstaller --quiet

:: Install llama-cpp-python — CUDA or CPU
if "%CUDA_BUILD%"=="1" (
    echo      Installing llama-cpp-python with CUDA support...
    set CMAKE_ARGS=-DLLAMA_CUDA=on
    .venv\Scripts\pip install llama-cpp-python --force-reinstall --quiet
) else (
    echo      Installing llama-cpp-python ^(CPU^)...
    .venv\Scripts\pip install llama-cpp-python --quiet
)

:: Install remaining deps (llama-cpp-python excluded to avoid double install)
.venv\Scripts\pip install -r requirements.txt --quiet
cd ..\..\..\..

:: 2. Build backend binary
echo [2/5] Building backend binary...
cd %BACKEND_DIR%
.venv\Scripts\pyinstaller build_backend.spec --noconfirm --clean
cd ..\..\..\..

:: 3. Copy backend binary to Tauri resources
echo [3/5] Copying backend binary to Tauri resources...
copy /Y "%BACKEND_DIR%\dist\knowledge-ai-backend.exe" "%RESOURCES_DIR%\knowledge-ai-backend.exe"
if errorlevel 1 (
    echo ERROR: Failed to copy backend binary.
    exit /b 1
)

:: 4. Build frontend
echo [4/5] Building frontend...
cd %FRONTEND_DIR%
call npm install --silent
call npm run build
cd ..\..\..\..

:: 5. Build Tauri app
echo [5/5] Building Tauri app...
cd %TAURI_DIR%
call cargo tauri build
cd ..\..\..\..

echo.
echo === Build complete ===
echo Output: %TAURI_DIR%\src-tauri\target\release\bundle\
if "%CUDA_BUILD%"=="1" (
    echo NOTE: CUDA build requires NVIDIA driver 520+ on the target machine.
)
endlocal
