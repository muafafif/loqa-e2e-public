# PyInstaller spec file for building the FastAPI backend into a single binary
import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# Resolve package locations by importing them directly — works regardless of
# venv layout, system Python, or CI runner path structure.
import llama_cpp
import chromadb
import torch

LLAMA_CPP_LIB = str(Path(llama_cpp.__file__).parent / 'lib')
CHROMADB_MIGRATIONS = str(Path(chromadb.__file__).parent / 'migrations')
TORCH_LIB = str(Path(torch.__file__).parent / 'lib')

# google.* is a PEP-420 namespace package (__file__ is None) — PyInstaller
# cannot discover its submodules automatically, so we collect them explicitly.
google_hidden = (
    collect_submodules('google.generativeai') +
    collect_submodules('google.ai.generativelanguage_v1beta') +
    collect_submodules('google.api_core') +
    collect_submodules('google.auth') +
    collect_submodules('google.protobuf')
)
google_datas = (
    collect_data_files('google.generativeai') +
    collect_data_files('google.ai.generativelanguage_v1beta') +
    collect_data_files('google.protobuf')
)

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=[],
    datas=[
        # llama_cpp loads its native dylibs/dlls via ctypes using __file__ as base path.
        # Must be included as datas so they land at llama_cpp/lib/ in the bundle.
        (LLAMA_CPP_LIB, 'llama_cpp/lib'),

        # ChromaDB reads its SQL migration files at runtime via importlib.resources.
        (CHROMADB_MIGRATIONS, 'chromadb/migrations'),

        # PyTorch loads its shared libs via its own loader — include them as datas.
        (TORCH_LIB, 'torch/lib'),

        # google.* namespace package data files (proto descriptors, etc.)
        *google_datas,
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'chromadb',
        'chromadb.db.impl',
        'chromadb.db.impl.sqlite',
        'chromadb.segment',
        'chromadb.segment.impl',
        'chromadb.segment.impl.vector',
        'chromadb.segment.impl.vector.local_hnsw',
        'chromadb.segment.impl.metadata',
        'chromadb.segment.impl.metadata.sqlite',
        'chromadb.migrations',
        'chromadb.api',
        'chromadb.api.client',
        'chromadb.telemetry',
        'chromadb.telemetry.product',
        'chromadb.telemetry.product.posthog',
        'sentence_transformers',
        'sentence_transformers.cross_encoder',
        'llama_cpp',
        'llama_cpp._ggml',
        'llama_cpp._internals',
        'llama_cpp._ctypes_extensions',
        'huggingface_hub',
        'pypdf',
        'docx',
        'openai',
        'sklearn',
        'sklearn.utils',
        'sklearn.utils._cython_blas',
        *google_hidden,
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'IPython',
        'notebook',
        'jupyter',
        'PIL.ImageTk',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='loqa-home-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[
        # Don't compress these — UPX can corrupt native ML libs
        'libllama*',
        'libggml*',
        'libtorch*',
        'torch_cpu*',
    ],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
