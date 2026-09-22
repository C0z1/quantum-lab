#!/bin/bash
# Empaqueta el bridge de Qiskit como ejecutable independiente con PyInstaller
# (OPCIONAL). El resultado se copia a electron-app/py-bin/ para incluirlo como
# recurso extra del instalador. Requiere el venv con qiskit + pyinstaller.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/packages/qiskit-bridge"

python3 -m pip install --quiet pyinstaller
python3 -m PyInstaller qiskit-bridge.spec --noconfirm --clean

DST="$ROOT/packages/electron-app/py-bin"
rm -rf "$DST"; mkdir -p "$DST"
cp -r dist/qiskit-bridge/* "$DST"/
echo "=== Bridge empaquetado en $DST ==="
echo "Para incluirlo en el instalador, añade a package.json > build.extraResources:"
echo '  { "from": "py-bin", "to": "qiskit-bridge", "filter": ["**/*"] }'
