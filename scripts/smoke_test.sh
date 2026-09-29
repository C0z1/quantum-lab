#!/usr/bin/env bash
# Pruebas de humo headless de la app Electron: regresión de robustez.
# Corre los arneses adversarios y falla (exit≠0) si detecta una regresión.
#
# Requisitos: xvfb, el motor C++ compilado (packages/core-engine/build), y la
# app con el bundle hecho (npm run bundle). Pensado para CI y uso local.
set -uo pipefail
cd "$(dirname "$0")/../packages/electron-app" || exit 2

ELECTRON=./node_modules/.bin/electron
fail=0

run() {
  # Uso: run VAR=val VAR2=val2 ... -> ejecuta electron headless y devuelve stdout.
  timeout 120 env QL_SOFTWARE_GL=1 "$@" xvfb-run -a "$ELECTRON" . --no-sandbox 2>/dev/null
}

echo "== 1) estrés adversario (motor arriba) =="
S=$(run QL_STRESS=1 | grep -oE '\[stress\] \{.*\}' | sed 's/\[stress\] //' | head -1)
echo "  $S"
node -e '
  const s = JSON.parse(process.argv[1] || "{}");
  const bad = (s.thrown && s.thrown.length) || s.mismatched > 0 || s.anyNaN === true || s.bufferLen === undefined;
  if (bad) { console.error("  REGRESIÓN: estrés", JSON.stringify(s)); process.exit(1); }
  console.log("  OK estrés (thrown=0, mismatched=0, anyNaN=false)");
' "$S" || fail=1

echo "== 2) degradación sin motor =="
N=$(run QL_NO_ENGINE=1 QL_NOENGINE_TEST=1 | grep -oE '\[noengine\] \{.*\}' | sed 's/\[noengine\] //' | head -1)
echo "  $N"
node -e '
  const s = JSON.parse(process.argv[1] || "{}");
  const bad = (s.thrown && s.thrown.length) || s.alive !== true || s.engineText !== "sin conexión";
  if (bad) { console.error("  REGRESIÓN: sin motor", JSON.stringify(s)); process.exit(1); }
  console.log("  OK sin motor (alive, sin conexión, thrown=0)");
' "$N" || fail=1

if [ "$fail" -ne 0 ]; then
  echo "SMOKE: FALLÓ"
  exit 1
fi
echo "SMOKE: OK"
