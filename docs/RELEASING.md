# Publicar una versión (release)

El instalador se construye **solo en GitHub Actions**. No hace falta el `.bat` de
overlay salvo cuando se entrega desde un entorno sin acceso de push (contenedor
de Claude). Desde tu máquina, el flujo normal es git + un tag.

## Flujo normal (desde tu equipo)

```bash
git add -A
git commit -m "…"
git push origin main

# Dispara la construcción de instaladores + release:
git tag -f v1.3
git push --force origin refs/tags/v1.3
```

Al pushear un tag `v*`, el workflow `Build installers` (`.github/workflows/release.yml`):

1. Compila el motor C++ nativo en Windows, Linux y macOS.
2. Empaqueta el **bridge de Qiskit con PyInstaller** (habilita la validación en
   vivo sin requerir Python en la máquina del usuario). Es *best-effort*: si
   falla en algún SO, el instalador se construye igual y la validación en vivo
   queda como "no disponible".
3. Empaqueta la app con electron-builder e incluye motor y bridge como recursos.
4. Publica los instaladores en la Release del tag:
   - Windows: `QuantumLab-Setup-<versión>.exe` (NSIS)
   - Linux: `*.AppImage`
   - macOS: `*.dmg`

Sigue el avance en Actions y descarga los binarios desde Releases.

## Integración continua (cada push/PR a main)

`.github/workflows/ci.yml` corre:

- **C++**: build + `ctest` + `clang-format`.
- **Qiskit**: `ruff` + `pytest`.
- **Electron**: `prettier` + `eslint`.
- **Pruebas de humo (headless)**: `scripts/smoke_test.sh` bajo Xvfb —
  estrés adversario (cambios de algoritmo, spam, reejecuciones a medio stream)
  y degradación sin motor. Falla el build si hay excepciones no capturadas,
  contaminación del buffer o si la app no degrada correctamente.

## Si el push falla por credenciales

- **Revoca** cualquier Personal Access Token que se haya compartido en texto
  plano y genera uno nuevo (Settings → Developer settings → Tokens, permiso
  `repo`), o usa `gh auth login`.
- Verifica el remoto: `git remote -v` → debe apuntar a
  `https://github.com/C0z1/quantum-lab.git`.
- Nunca embebas el token en la URL del remoto ni en un script.

## Verificación local rápida antes de publicar

```bash
cd packages/electron-app
npm run bundle
npm run format:check && npx eslint src
# Humo (requiere el motor compilado y xvfb):
bash ../../scripts/smoke_test.sh
```

## Pendiente (mejora futura)

- **Auto-update** del `.exe` (electron-updater + feed en la Release) para que los
  usuarios reciban nuevas versiones sin reinstalar.
- **Firma de código** (Windows/macOS): hoy el instalador va sin firmar (preview),
  lo que muestra advertencias de SmartScreen/Gatekeeper.
