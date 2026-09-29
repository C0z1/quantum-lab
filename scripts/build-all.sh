#!/bin/bash
# Construye los tres paquetes en secuencia (§6).
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Building C++ Engine ==="
cd "$ROOT/packages/core-engine"
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j"$(nproc)"

echo "=== Installing Python bridge (entorno virtual, §10) ==="
cd "$ROOT/packages/qiskit-bridge"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
pip install -q --upgrade pip
pip install -q -e ".[dev]"
deactivate

echo "=== Installing Electron app ==="
cd "$ROOT/packages/electron-app"
npm install

echo "=== Build complete ==="
