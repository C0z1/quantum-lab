# Quantum Lab

**Interactive quantum laboratory** — translates six quantum algorithms (Grover, Teleportation, Shor, Deutsch-Jozsa, Bernstein-Vazirani, QFT) into immersive 3D visualizations with full technical rigor.

[![CI](https://github.com/C0z1/quantum-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/C0z1/quantum-lab/actions/workflows/ci.yml)
[![Build installers](https://github.com/C0z1/quantum-lab/actions/workflows/release.yml/badge.svg)](https://github.com/C0z1/quantum-lab/actions/workflows/release.yml)
[![Release](https://img.shields.io/github/v/release/C0z1/quantum-lab?include_prereleases)](https://github.com/C0z1/quantum-lab/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-8052ff.svg)](https://github.com/C0z1/quantum-lab/blob/main/LICENSE)

`C++20 · Eigen3 · ZeroMQ` · `Python · Qiskit` · `Electron · Three.js`

![Quantum Lab — Grover playback](docs/img/playback.gif)

---

## Changelog

### v1.3.0 — Shell IDE: 3-column layout + bottom console

| File | Change |
|---|---|
| `src/renderer/ui.js` | 3-column layout: file explorer · editor · preview panel |
| `src/renderer/styles.css` | Full redesign — CSS variables, blur effects, gradients |
| `src/renderer/scene.js` | Camera adjustments for the new side panel |
| `src/renderer/index.html` | Rebuilt shell HTML structure |
| `src/main/index.js` | Window size updated for the new layout |
| `package.json` | Version bump to `1.3.0` |
| `docs/ui-shell-contract.md` | UI shell design contract (332 lines) |

**Latest commit**

```
6b00835  feat(ui): shell IDE de 3 columnas + consola inferior (v1.3.0)
         Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Download

Windows installers are built automatically on each release via GitHub Actions:

**[Releases](https://github.com/C0z1/quantum-lab/releases) → `QuantumLab-Setup-<version>.exe`**

> Preview release. The installer bundles the C++ engine and the Electron app — Python is not required at runtime. Windows SmartScreen may prompt on first launch: click **More info → Run anyway**.

---

## Features

**Six algorithms**, each with a dedicated 3D visualization:

- **Grover** — probability energy columns, convergence curve, and per-iteration shockwaves
- **Teleportation** — Bloch spheres, entanglement channel with particles, completion burst (fidelity 1.000)
- **Shor** — phase estimation (QPE)-based factorization; s/r peaks in the counting register
- **Deutsch-Jozsa** — constant vs. balanced oracle decision in **one** query (phase kickback)
- **Bernstein-Vazirani** — recovers the hidden string `a` in **one** query; single peak at `|a⟩`
- **QFT** — uniform comb transforms into spaced peaks: the foundation of Shor and phase estimation

**Shell IDE v1.3** — 3-column layout with integrated bottom console

**Interactive playback** — play/pause, step-by-step, timeline scrubbing, speed control 0.5×–4×  
Keyboard shortcuts: `Space`, `←`/`→`, `R`

**C++ engine** (Eigen3) scaling up to 20 qubits, communicated via **ZeroMQ + MessagePack**

**Cross-validation C++ ↔ Qiskit** at machine precision

---

## Screenshots

| Grover | Teleportation | Shor |
|---|---|---|
| ![Grover](docs/img/grover.png) | ![Teleportation](docs/img/teleport.png) | ![Shor](docs/img/shor.png) |

---

## Architecture

Three independent processes communicating over ZeroMQ:

```
[Renderer]            [Main (Electron)]        [C++ Engine]           [Python/Qiskit]
Three.js / UI  <IPC>  ipcMain + QuantumBridge  <ZMQ REQ/REP>  engine (compute)
(60fps)               (REQ + SUB)              <ZMQ PUB/SUB>  statevec frames
                            └── subprocess ──────────────────> validation (optional)
```

| Socket | Address | Pattern |
|---|---|---|
| cmd | `tcp://127.0.0.1:5770` | REQ/REP, immediate ACK |
| stream | `tcp://127.0.0.1:5771` | PUB/SUB, MessagePack frames `[re, im, prob, …]` |

See [`docs/architecture.md`](docs/architecture.md) · [`docs/quantum-concepts.md`](docs/quantum-concepts.md) · [`docs/ui-shell-contract.md`](docs/ui-shell-contract.md)

---

## Building from Source

### Windows

The native installer is compiled in CI (GitHub Actions, Windows runner + vcpkg + MSVC).  
Requirements: Visual Studio 2022 Build Tools, [vcpkg](https://github.com/microsoft/vcpkg), Node 18+.  
Full workflow in [`.github/workflows/release.yml`](.github/workflows/release.yml).  
For local development, **WSL2 (Ubuntu)** is recommended — follow the Linux steps below.

### Linux / WSL2

```bash
./scripts/bootstrap.sh   # install system dependencies and build everything
./scripts/dev.sh         # launch C++ engine + Python + Electron
```

### macOS

```bash
brew install cmake eigen zeromq cppzmq msgpack-cxx nlohmann-json googletest python@3.11 node
./scripts/build-all.sh && ./scripts/dev.sh
```

---

## Verification

```bash
cd packages/core-engine/build && ctest --output-on-failure   # 31/31 C++ tests
cd packages/qiskit-bridge && pytest tests/ -v                # 35/35 Qiskit tests
python3 scripts/validate.py                                  # C++ <-> Qiskit, 6 algorithms (max|dp| ~ 1e-14)
```

**Golden values (Grover)**

| n | target | iterations | P(target) |
|---|---|---|---|
| 2 | 3 | 1 | 1.000 |
| 3 | 5 | 2 | 0.945 |
| 4 | 7 | 3 | 0.961 |

---

## License

MIT — see [LICENSE](LICENSE).
