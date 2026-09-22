#!/bin/bash
# Arranque de un comando para Ubuntu / WSL2: instala dependencias del sistema y
# compila los tres paquetes. Tras terminar, ejecuta ./scripts/dev.sh.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== [1/2] Instalando dependencias del sistema (sudo) ==="
sudo apt-get update
sudo apt-get install -y \
  build-essential cmake pkg-config \
  libeigen3-dev libzmq3-dev cppzmq-dev libmsgpack-dev nlohmann-json3-dev libgtest-dev \
  python3 python3-venv python3-pip nodejs npm \
  libgtk-3-0 libnss3 libasound2t64 2>/dev/null || \
sudo apt-get install -y libgtk-3-0 libnss3 libasound2   # nombre alterno en Ubuntu 22.04

echo "=== [2/2] Compilando (C++, Python, Electron) ==="
bash "$ROOT/scripts/build-all.sh"

echo
echo "=== Listo. Ejecuta la app con:  ./scripts/dev.sh  ==="
