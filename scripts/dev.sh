#!/bin/bash
# Lanza los 3 procesos en paralelo (§6). El motor C++ debe estar compilado.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY_CMD="python3 main.py"
if [ -d "packages/qiskit-bridge/.venv" ]; then
  PY_CMD=". .venv/bin/activate && python main.py"
fi

npx concurrently \
  --names "C++,Python,Electron" \
  --prefix-colors "cyan,yellow,magenta" \
  "packages/core-engine/build/quantum-engine" \
  "cd packages/qiskit-bridge && $PY_CMD" \
  "cd packages/electron-app && npm run dev"
