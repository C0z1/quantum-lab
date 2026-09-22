# CLAUDE.md — Quantum Lab

> **Lee este archivo completo antes de escribir una sola línea de código.**
> Este es el documento de referencia canónico para construir el Quantum Lab.

---

## 1. Visión del Proyecto

**Quantum Lab** es una aplicación de escritorio interactiva que traduce algoritmos cuánticos complejos (Grover, Shor, Teletransportación) en experiencias visuales 3D inmersivas y pedagógicas. Está dirigida a personas **sin conocimientos previos de computación cuántica**, pero mantiene rigor técnico total.

### Stack Tecnológico
| Capa | Tecnología | Rol |
|---|---|---|
| UI / 3D | Electron + Three.js | Renderizado 3D a 60fps, controles de usuario |
| Motor Matemático | C++ (C++20) + Eigen3 + ZeroMQ | Álgebra lineal sobre vectores de estado complejos |
| Simulación Cuántica | Python 3.11+ + Qiskit + Aer | Circuitos cuánticos de referencia y validación |
| IPC | ZeroMQ (REQ/REP + PUB/SUB) + MessagePack | Comunicación de baja latencia entre procesos |

---

## 2. Arquitectura de Comunicación (IPC)

**Decisión inamovible:** ZeroMQ con procesos separados. NO usar N-API addons para la ruta crítica de cómputo.

```
[Renderer Process]          [Main Process]           [C++ Engine]          [Python/Qiskit]
  Three.js / UI    ←IPC→   ZMQ Dealer Socket  ←ZMQ→  ZMQ REP/PUB Server  ←subprocess→  Qiskit Sim
  (60fps libre)            (broker / forward)         (cómputo pesado)                   (validación)
```

### Sockets ZeroMQ
- **`ipc:///tmp/quantum-lab-cmd`** → REQ/REP: Electron envía comandos, C++ responde ACK
- **`ipc:///tmp/quantum-lab-stream`** → PUB/SUB: C++ publica frames del vector de estado en tiempo real, topic `"statevec"`

### Serialización
- Protocolo: **MessagePack** (binario). Nunca JSON para datos de vector de estado.
- Layout del frame en `Float64Array` al Renderer: `[re₀, im₀, prob₀, re₁, im₁, prob₁, ...]`
- Probabilidad precalculada en C++: `prob = |α|² = re² + im²`

---

## 3. Estructura de Carpetas

Construye **exactamente** esta estructura. No improvises ubicaciones:

```
quantum-lab/
├── packages/
│   ├── core-engine/                  # C++ — Motor matemático
│   │   ├── src/
│   │   │   ├── main.cpp              # Entry point: arranca ZMQ server
│   │   │   ├── zmq_server.cpp/.h     # REP + PUB sockets, dispatch de comandos
│   │   │   ├── state_vector.cpp/.h   # Gestión del vector de estado cuántico
│   │   │   ├── quantum_gate.cpp/.h   # Puertas: H, X, CNOT, Toffoli, Phase
│   │   │   ├── grover.cpp/.h         # Algoritmo de Grover completo
│   │   │   ├── shor.cpp/.h           # Algoritmo de Shor (fase 2)
│   │   │   └── teleportation.cpp/.h  # Teletransportación (fase 2)
│   │   ├── include/
│   │   │   └── eigen/                # Eigen3 header-only (copiar o usar vcpkg)
│   │   ├── tests/
│   │   │   ├── test_state_vector.cpp
│   │   │   └── test_grover.cpp
│   │   ├── CMakeLists.txt
│   │   └── vcpkg.json
│   │
│   ├── qiskit-bridge/                # Python — Simulación cuántica
│   │   ├── algorithms/
│   │   │   ├── grover.py             # Circuito Grover con Qiskit
│   │   │   ├── shor.py
│   │   │   └── teleportation.py
│   │   ├── bridge/
│   │   │   ├── zmq_client.py         # Recibe comandos de C++ si se necesita
│   │   │   └── serializer.py         # NumPy array → MessagePack bytes
│   │   ├── tests/
│   │   │   └── test_grover.py
│   │   ├── main.py                   # Entry: modo subprocess, lee stdin JSON
│   │   └── pyproject.toml
│   │
│   └── electron-app/                 # Electron + Three.js
│       ├── src/
│       │   ├── main/
│       │   │   ├── index.js          # BrowserWindow, lifecycle, ipcMain handlers
│       │   │   ├── zmq-bridge.js     # QuantumBridge class (REQ + SUB sockets)
│       │   │   └── process-mgr.js    # Spawn C++ engine y Python
│       │   ├── renderer/
│       │   │   ├── index.html        # Shell HTML mínimo
│       │   │   ├── preload.js        # contextBridge: expone quantumAPI
│       │   │   ├── scene.js          # Three.js: setup, cámara, luces, RAF
│       │   │   ├── visualizer.js     # Mapeo vector de estado → objetos 3D
│       │   │   ├── ui.js             # Controles: qubits, target, iteraciones
│       │   │   └── styles.css
│       │   └── assets/
│       │       └── shaders/          # GLSL custom si se necesitan
│       └── package.json
│
├── docs/
│   ├── architecture.md
│   └── quantum-concepts.md           # Glosario pedagógico para UI
├── scripts/
│   ├── build-all.sh                  # CMake + pip + npm en secuencia
│   └── dev.sh                        # Lanza los 3 procesos con concurrently
├── CLAUDE.md                         # Este archivo
└── README.md
```

---

## 4. Especificaciones Técnicas Detalladas

### 4.1 C++ — `core-engine`

#### Compilador y estándar
```cmake
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_BUILD_TYPE Release)
# Flags obligatorios:
target_compile_options(quantum-engine PRIVATE -O3 -march=native -fopenmp)
```

#### Dependencias (vcpkg.json)
```json
{
  "name": "quantum-engine",
  "version": "0.1.0",
  "dependencies": [
    "zeromq",
    "cppzmq",
    "msgpack-cxx",
    "eigen3",
    "nlohmann-json",
    "gtest"
  ]
}
```

#### CMakeLists.txt completo
```cmake
cmake_minimum_required(VERSION 3.20)
project(quantum_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_BUILD_TYPE Release)

find_package(ZeroMQ REQUIRED)
find_package(cppzmq REQUIRED)
find_package(msgpack-cxx REQUIRED)
find_package(Eigen3 REQUIRED)
find_package(nlohmann_json REQUIRED)

add_executable(quantum-engine
    src/main.cpp
    src/zmq_server.cpp
    src/state_vector.cpp
    src/quantum_gate.cpp
    src/grover.cpp
)

target_link_libraries(quantum-engine PRIVATE
    libzmq cppzmq msgpack-cxx Eigen3::Eigen nlohmann_json::nlohmann_json
)

target_compile_options(quantum-engine PRIVATE -O3 -march=native -fopenmp)

# Tests
enable_testing()
add_subdirectory(tests)
```

#### `state_vector.h` — Interfaz requerida
```cpp
#pragma once
#include <Eigen/Dense>
#include <complex>
#include <vector>
#include <cstdint>

using Amplitude   = std::complex<double>;
using StateVector = Eigen::VectorXcd;   // Vector columna de complejos, tamaño dinámico

class QuantumStateVector {
public:
    explicit QuantumStateVector(int n_qubits);

    void reset();                          // Estado |0...0⟩
    void applyHadamardAll();               // H⊗n: superposición uniforme
    void applyHadamard(int qubit);         // H sobre un qubit específico
    void applyX(int qubit);                // Puerta X (NOT)
    void applyCNOT(int control, int target);
    void applyPhase(int qubit, double theta); // Puerta de fase R(θ)
    void applyOracle(int target_state);    // Oráculo de Grover
    void applyDiffuser();                  // Difusor de Grover (2|ψ⟩⟨ψ| - I)

    // Acceso al estado
    const StateVector& state() const { return sv_; }
    int dim() const { return 1 << n_qubits_; }
    int n_qubits() const { return n_qubits_; }

    // Vector de probabilidades |α|²
    Eigen::VectorXd probabilities() const;

private:
    int n_qubits_;
    StateVector sv_;

    // Producto de Kronecker para construir operadores de n qubits
    Eigen::MatrixXcd kronecker(const Eigen::MatrixXcd& A,
                               const Eigen::MatrixXcd& B) const;
    Eigen::MatrixXcd gateMatrix(int qubit, const Eigen::MatrixXcd& gate) const;
};
```

#### Protocolo de mensajes ZeroMQ

**Comando de entrada (JSON via REQ socket):**
```json
{
  "type": "RUN_GROVER",
  "n_qubits": 3,
  "target_state": 5,
  "iterations": 2,
  "stream_intermediate": true
}
```

**Frame de salida (MessagePack via PUB socket, topic "statevec"):**
```cpp
struct StateVectorFrame {
    uint32_t iteration;      // 0 = estado inicial, N = iteración N
    uint32_t n_qubits;
    uint32_t state_size;     // 2^n_qubits
    bool is_final;
    std::vector<double> data; // Layout: [re0, im0, prob0, re1, im1, prob1, ...]
    MSGPACK_DEFINE(iteration, n_qubits, state_size, is_final, data);
};
```

#### Algoritmo de Grover — Pseudocódigo de implementación
```
grover(n, target, iterations):
  1. sv = QuantumStateVector(n)
  2. sv.applyHadamardAll()         → superposición uniforme
  3. PUBLISH frame(iteration=0)
  4. for i in 1..iterations:
       a. sv.applyOracle(target)   → invierte fase del estado target
       b. sv.applyDiffuser()       → amplificación de amplitudes
       c. PUBLISH frame(iteration=i)
  5. PUBLISH frame(is_final=true)
```

### 4.2 Python — `qiskit-bridge`

#### pyproject.toml
```toml
[project]
name = "qiskit-bridge"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "qiskit>=1.0.0",
    "qiskit-aer>=0.14.0",
    "numpy>=1.26.0",
    "msgpack>=1.0.7",
    "pyzmq>=25.0.0",
]
```

#### `main.py` — Modo subprocess
```python
# Lee comandos de stdin (JSON, una línea por comando)
# Escribe resultados a stdout (JSON, una línea por resultado)
# Stderr para logs de debug
import sys, json
from algorithms.grover import run_grover

for line in sys.stdin:
    cmd = json.loads(line.strip())
    if cmd["type"] == "VALIDATE_GROVER":
        result = run_grover(cmd["n_qubits"], cmd["target_state"], cmd["iterations"])
        print(json.dumps(result), flush=True)
```

#### `algorithms/grover.py` — Interfaz requerida
```python
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
import numpy as np

def run_grover(n_qubits: int, target_state: int, iterations: int) -> dict:
    """
    Retorna:
    {
        "statevector": [[re, im], ...],  # Lista de amplitudes complejas
        "probabilities": [float, ...],   # |α|² para cada estado
        "counts": {"101": 512, ...},     # Counts del muestreo
        "iterations": int
    }
    """
    ...
```

### 4.3 Electron — `electron-app`

#### package.json
```json
{
  "name": "quantum-lab",
  "version": "0.1.0",
  "main": "src/main/index.js",
  "scripts": {
    "dev": "electron .",
    "build": "electron-builder"
  },
  "dependencies": {
    "zeromq": "^6.0.0",
    "msgpackr": "^1.10.0",
    "three": "^0.164.0"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0",
    "concurrently": "^8.0.0"
  }
}
```

#### `preload.js` — API expuesta al Renderer (NO cambiar esta interfaz)
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quantumAPI', {
    // Comandos al motor
    runGrover:         (params) => ipcRenderer.invoke('quantum:run-grover', params),
    runShor:           (params) => ipcRenderer.invoke('quantum:run-shor', params),
    runTeleportation:  (params) => ipcRenderer.invoke('quantum:run-teleportation', params),
    stopExecution:     ()       => ipcRenderer.invoke('quantum:stop'),

    // Suscripción a frames del vector de estado
    onStateUpdate:  (cb) => ipcRenderer.on('quantum:state-update', (_, frame) => cb(frame)),
    onEngineStatus: (cb) => ipcRenderer.on('quantum:engine-status', (_, s) => cb(s)),

    // Limpieza de listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
```

#### `zmq-bridge.js` — Clase QuantumBridge (estructura obligatoria)
```javascript
// npm install zeromq msgpackr
const { Request, Subscriber } = require('zeromq');
const { unpack } = require('msgpackr');
const { EventEmitter } = require('events');

class QuantumBridge extends EventEmitter {
    constructor() { super(); /* REQ + SUB sockets */ }

    async connect()           { /* bind sockets, startSubscribeLoop */ }
    async sendCommand(cmd)    { /* serialize JSON → REQ, await ACK */ }
    async _startSubscribeLoop() { /* for await (PUB frames) → emit 'state-update' */ }
    _buildTransferableFrame(raw) { /* MsgPack → { iteration, nQubits, stateSize, data: Float64Array } */ }
    disconnect()              { /* close sockets */ }
}

module.exports = { QuantumBridge };
```

#### `visualizer.js` — Clase GroverVisualizer (Three.js)
```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class GroverVisualizer {
    constructor(canvas) { /* renderer, scene, camera, OrbitControls */ }

    initBars(stateSize)        { /* BoxGeometry × stateSize, espaciados en X */ }
    updateFromFrame(frame)     { /* lerp scale.y con prob, color por amplitud */ }
    highlightTarget(index)     { /* resaltar el estado solución en verde */ }
    reset()                    { /* limpiar escena */ }
    _startRenderLoop()         { /* requestAnimationFrame loop */ }
    _addLights()               { /* AmbientLight + DirectionalLight */ }
    _onResize()                { /* actualizar aspect ratio */ }
}
```

**Mapeo visual de datos al mundo 3D:**
- `bar.scale.y = lerp(current, prob * n_states * 3, 0.12)` — interpolación suave
- `bar.position.y = bar.scale.y / 2` — pivote en la base
- Color: `HSL(0.3 * (1 - prob * n_states), 0.8, 0.5)` — azul→verde→amarillo según probabilidad
- Frame rate: Three.js corre su propio RAF independiente del IPC

---

## 5. Secuencia de Construcción (Build Order)

**Construye en este orden exacto. No saltes pasos.**

### Fase 1 — Hello World IPC (Prioridad MÁXIMA)

**Objetivo: Hacer fluir datos de C++ → Electron → Three.js antes de cualquier lógica cuántica.**

#### Paso 1.1: C++ ZeroMQ Hello
- Crear `zmq_server.cpp` mínimo: servidor REP que responde `"PONG"` a cualquier mensaje
- Crear `main.cpp` que arranque el servidor
- Compilar con CMake
- Verificar: `echo "PING" | nc -U /tmp/quantum-lab-cmd` (o cliente Python temporal)

#### Paso 1.2: Node.js ZeroMQ Hello
- Crear `zmq-bridge.js` mínimo: envía `"PING"`, loguea respuesta
- Crear `index.js` mínimo: BrowserWindow + spawn del binario C++ + llamar bridge
- Verificar: `console.log("PONG received")` en terminal de Electron

#### Paso 1.3: Streaming a Three.js
- Extender C++ para publicar `[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]` (8 valores) cada 100ms via PUB
- Extender bridge para SUB y forward via ipcMain
- Extender preload.js con `onStateUpdate`
- Crear `visualizer.js` con 8 cubos cuya altura = valor recibido
- Verificar: cubos se mueven en la ventana de Electron

### Fase 2 — Motor Matemático C++

**Objetivo: Implementar el vector de estado real con Eigen3.**

#### Paso 2.1: `QuantumStateVector`
- Implementar `state_vector.cpp/.h` con la interfaz definida en §4.1
- Test unitario: `applyHadamardAll()` sobre 1 qubit → vector `[1/√2, 1/√2]`
- Test unitario: norma del vector siempre = 1.0 (invariante cuántico)

#### Paso 2.2: Puertas cuánticas
- Implementar matrices de puertas: H, X, CNOT, Phase, Toffoli
- Implementar `kronecker()` para extender puertas a sistemas de n qubits
- Test: `applyX(0)` sobre `|00⟩` produce `|10⟩`

#### Paso 2.3: Algoritmo de Grover
- Implementar `applyOracle(target)`: multiplica por -1 la amplitud del índice target
- Implementar `applyDiffuser()`: reflexión sobre la media `(2|ψ⟩⟨ψ| - I)`
- Test: para n=3, target=5, después de 2 iteraciones, `probabilities()[5] > 0.7`
- Integrar con `zmq_server.cpp`: al recibir `RUN_GROVER`, ejecutar y publicar frames

### Fase 3 — Python/Qiskit

**Objetivo: Validación independiente de los resultados C++.**

#### Paso 3.1: `grover.py`
- Implementar circuito Grover con `QuantumCircuit` de Qiskit
- Usar `AerSimulator` con `statevector` method
- Retornar JSON con `statevector` y `probabilities`

#### Paso 3.2: Integración con C++
- Implementar `main.py` en modo subprocess (stdin/stdout JSON)
- En `zmq_server.cpp`: después de cada ejecución C++, lanzar Python para validar
- Loguear divergencias `|result_cpp - result_python| > 1e-9`

### Fase 4 — UI completa

**Objetivo: Experiencia pedagógica completa.**

#### Paso 4.1: Controles de usuario
- Panel lateral: slider de n qubits (1-10), selector de estado objetivo, número de iteraciones
- Botones: Ejecutar, Pausar, Reset, Paso a paso
- Display: iteración actual, probabilidad máxima, qubit target

#### Paso 4.2: Visualización Grover
- Barras 3D de probabilidad con animación suave (lerp)
- Estado objetivo resaltado en verde con glow
- Contador de iteraciones visible
- Curva de convergencia 2D superpuesta (Chart.js o D3 en panel secundario)

#### Paso 4.3: Esferas de Bloch (n ≤ 3 qubits)
- Una esfera por qubit
- Actualización del vector de Bloch en tiempo real desde las amplitudes
- Punto rojo = estado actual sobre la esfera

---

## 6. Comandos de Desarrollo

```bash
# Instalar todo desde cero
./scripts/build-all.sh

# Desarrollo (3 procesos en paralelo)
./scripts/dev.sh

# Solo compilar C++
cd packages/core-engine
cmake -B build -DCMAKE_TOOLCHAIN_FILE=../../vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build build -j$(nproc)

# Tests C++
cd packages/core-engine/build && ctest --output-on-failure

# Instalar Python
cd packages/qiskit-bridge && pip install -e ".[dev]"

# Test Python
cd packages/qiskit-bridge && python -m pytest tests/ -v

# Electron dev
cd packages/electron-app && npm install && npm run dev
```

#### `scripts/build-all.sh`
```bash
#!/bin/bash
set -e
echo "=== Building C++ Engine ==="
cd packages/core-engine
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc)

echo "=== Installing Python bridge ==="
cd ../qiskit-bridge
pip install -e .

echo "=== Installing Electron app ==="
cd ../electron-app
npm install

echo "=== Build complete ==="
```

#### `scripts/dev.sh`
```bash
#!/bin/bash
concurrently \
  --names "C++,Python,Electron" \
  --prefix-colors "cyan,yellow,magenta" \
  "packages/core-engine/build/quantum-engine" \
  "cd packages/qiskit-bridge && python main.py" \
  "cd packages/electron-app && npm run dev"
```

---

## 7. Convenciones de Código

### C++
- Nombres de clases: `PascalCase`
- Métodos y variables: `snake_case`
- Constantes: `UPPER_SNAKE_CASE`
- Smart pointers siempre: `std::unique_ptr`, `std::shared_ptr`
- NO usar `new`/`delete` directamente
- Eigen: usar `VectorXcd` para vectores de estado, `MatrixXcd` para operadores
- ZeroMQ: siempre verificar `zmq::recv_result_t` para errores

### JavaScript / Node.js
- ES modules (`import`/`export`) en renderer, CommonJS en main
- `async/await` en lugar de callbacks
- Nunca bloquear el event loop con cómputo síncrono
- Three.js: actualizar estado fuera del RAF, solo renderizar dentro

### Python
- Type hints en todas las funciones públicas
- `numpy` para todas las operaciones numéricas (no listas Python para vectores)
- Retornar siempre dicts serializables a JSON

---

## 8. Reglas de Seguridad IPC

1. **El Renderer Process NUNCA tiene acceso directo a Node.js** (`nodeIntegration: false` siempre)
2. **contextBridge es el único canal** entre Main y Renderer
3. **Validar todos los inputs** en el Main Process antes de enviarlos al motor C++
4. **El motor C++ rechaza** comandos con n_qubits > 20 (2²⁰ = 1M amplitudes = límite de memoria razonable)
5. **Timeout en ZeroMQ**: `ZMQ_RCVTIMEO = 5000ms` para evitar bloqueos indefinidos

---

## 9. Testing y Validación

### Invariante cuántico (verificar en CADA test C++)
```cpp
// La suma de probabilidades SIEMPRE debe ser 1.0
ASSERT_NEAR(sv.probabilities().sum(), 1.0, 1e-10);
```

### Test de Grover (golden values)
| n qubits | target | iteraciones | prob(target) esperada |
|---|---|---|---|
| 1 | 1 | 1 | 1.0 |
| 2 | 3 | 1 | 1.0 |
| 3 | 5 | 2 | ~0.945 |
| 4 | 7 | 3 | ~0.961 |

### Comparación C++ vs Qiskit
- Tolerancia: `max(|prob_cpp[i] - prob_python[i]|) < 1e-9` para todos los estados

---

## 10. Lo que NO debes hacer

- ❌ NO usar `N-API`/`node-gyp` addons para la ruta crítica de cómputo
- ❌ NO ejecutar operaciones pesadas en el Renderer Process
- ❌ NO usar JSON para serializar vectores de estado (usar MessagePack)
- ❌ NO usar `nodeIntegration: true` en Electron
- ❌ NO hardcodear paths absolutos (usar `path.join(__dirname, ...)`)
- ❌ NO usar `std::vector<std::complex<double>>` para el estado principal (usar `Eigen::VectorXcd`)
- ❌ NO bloquear el socket ZMQ REP más de 10ms (responder ACK inmediato, computar después)
- ❌ NO instalar paquetes Python en el sistema globalmente: usar entorno virtual

---

## 11. Primer Comando a Ejecutar

Cuando Claude Code abra este proyecto, lo **primero** que debe hacer es:

```bash
# 1. Crear la estructura de carpetas
mkdir -p packages/core-engine/src packages/core-engine/tests packages/core-engine/include
mkdir -p packages/qiskit-bridge/algorithms packages/qiskit-bridge/bridge packages/qiskit-bridge/tests
mkdir -p packages/electron-app/src/main packages/electron-app/src/renderer packages/electron-app/src/assets/shaders
mkdir -p docs scripts

# 2. Verificar dependencias del sistema
which cmake && cmake --version
which python3 && python3 --version
which node && node --version
which npm && npm --version

# 3. Verificar que vcpkg está disponible o instalarlo
which vcpkg || git clone https://github.com/microsoft/vcpkg.git && ./vcpkg/bootstrap-vcpkg.sh
```

Después seguir la **Fase 1** de la sección §5 en orden estricto.

---

*Generado para el proyecto Quantum Lab — Laboratorio Cuántico Interactivo*
*Stack: C++20 + Eigen3 + ZeroMQ | Python 3.11 + Qiskit | Electron 30 + Three.js r164*
