# Arquitectura — Quantum Lab

## Visión general

Quantum Lab separa el cómputo pesado de la visualización mediante **procesos
independientes** que se comunican por **ZeroMQ** (nunca N-API en la ruta
crítica, §10). Esto mantiene el Renderer a 60 fps sin importar cuánto tarde el
motor cuántico.

```
[Renderer]                [Main (Electron)]        [C++ Engine]              [Python/Qiskit]
Three.js / UI  ←IPC───→   ipcMain + QuantumBridge  ←ZMQ REQ/REP──→  ZMQ server (cómputo)
(RAF 60fps)     contextBridge   (REQ + SUB)         ←ZMQ PUB/SUB──→  frames statevec
                                     │
                                     └── ProcessManager ──subprocess (stdin/stdout JSON)──→ Qiskit (validación)
```

## Procesos

| Proceso | Lenguaje | Responsabilidad |
|---|---|---|
| Renderer | JS (ES modules) | UI, Three.js, mapeo estado→3D. Sin acceso a Node (`nodeIntegration:false`). |
| Main | JS (CommonJS) | Ciclo de vida, `ipcMain`, validación de inputs, arranque de hijos. |
| core-engine | C++20 + Eigen3 | Vector de estado, puertas, Grover. Servidor ZMQ REP + PUB. |
| qiskit-bridge | Python 3.11 + Qiskit | Circuitos de referencia y validación numérica. |

## Canales ZeroMQ

- **`ipc:///tmp/quantum-lab-cmd`** — REQ/REP. Electron envía comandos JSON; el
  motor responde un **ACK inmediato** y computa en un hilo aparte (§10: el REP
  no se bloquea > 10 ms). `ZMQ_RCVTIMEO = 5000 ms` (§8).
- **`ipc:///tmp/quantum-lab-stream`** — PUB/SUB, topic `"statevec"`. El motor
  publica un `StateVectorFrame` por iteración, serializado en **MessagePack**.

### Formato del frame

`StateVectorFrame { iteration, n_qubits, state_size, is_final, data }`, donde
`data` es `[re₀, im₀, prob₀, re₁, im₁, prob₁, …]` con `prob = re² + im²`
precalculada en C++. `msgpackr` lo decodifica en el Main y lo convierte a
`Float64Array` antes de enviarlo al Renderer.

## Motor matemático

El estado vive como `Eigen::VectorXcd` de dimensión `2ⁿ`. Las puertas de un
qubit se aplican por **indexado directo de amplitudes** (in-place), no
construyendo matrices `2ⁿ × 2ⁿ`; así el motor escala hasta n=20 (§8) sin agotar
memoria. Convención **little-endian** (qubit 0 = bit menos significativo),
idéntica a Qiskit, de modo que los índices de estado coinciden entre ambos
backends.

Grover: superposición uniforme → (oráculo de fase + difusor de reflexión sobre
la media) × iteraciones. El difusor usa `newᵢ = 2·media − ampᵢ`, equivalente a
`2|s⟩⟨s| − I`.

## Validación (§3.2)

La validación C++ ↔ Qiskit se ejecuta como herramienta explícita
(`scripts/validate.py`) en lugar de acoplarse dentro del bucle REP del motor,
para respetar la regla de no bloquear el socket. `ProcessManager.validateWithPython`
permite además lanzar la validación desde el Main bajo demanda. La tolerancia es
`max|prob_cpp − prob_python| < 1e-9`; en la práctica la divergencia observada es
~1e-15 (precisión de máquina).

## Seguridad IPC (§8)

`contextIsolation: true`, `nodeIntegration: false`; `preload.js` es el único
puente (`contextBridge`). El Main valida todos los inputs (rango de qubits y de
estado objetivo) antes de enviarlos al motor, que a su vez rechaza n_qubits fuera
de `[1, 20]`.
