// Gestion del ciclo de vida de los procesos hijos: motor C++ y bridge Python.
// - Elige puertos TCP libres dinamicamente (evita choques).
// - Supervisa el motor: si cae, lo relanza con backoff y avisa por eventos.
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const net = require('net');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PYTHON_DIR = path.join(REPO_ROOT, 'packages', 'qiskit-bridge');
const IS_WIN = process.platform === 'win32';
const ENGINE_EXE = IS_WIN ? 'quantum-engine.exe' : 'quantum-engine';
const BRIDGE_EXE = IS_WIN ? 'qiskit-bridge.exe' : 'qiskit-bridge';

// Binario del motor: recurso empaquetado, o build de desarrollo.
function resolveEngineBin() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'engine', ENGINE_EXE),
    path.join(REPO_ROOT, 'packages', 'core-engine', 'build', ENGINE_EXE),
    path.join(REPO_ROOT, 'packages', 'core-engine', 'build', 'Release', ENGINE_EXE),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// Bridge Python: ejecutable empaquetado con PyInstaller, o python3 main.py.
function resolvePythonBridge() {
  const bundled =
    process.resourcesPath && path.join(process.resourcesPath, 'qiskit-bridge', BRIDGE_EXE);
  if (bundled && fs.existsSync(bundled))
    return { cmd: bundled, args: [], cwd: path.dirname(bundled) };
  const main = path.join(PYTHON_DIR, 'main.py');
  if (fs.existsSync(main)) {
    const py = IS_WIN ? 'python' : 'python3';
    return { cmd: py, args: [main], cwd: PYTHON_DIR };
  }
  return null;
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

class ProcessManager extends EventEmitter {
  constructor() {
    super();
    this._engine = null;
    this._python = null;
    this._stopping = false;
    this._restarts = 0;
    this.endpoints = null; // { cmd, stream } tras init()
  }

  // Elige puertos libres y arma los endpoints TCP.
  async init() {
    let cmd = await pickFreePort();
    let stream = await pickFreePort();
    while (stream === cmd) stream = await pickFreePort();
    this.endpoints = {
      cmd: `tcp://127.0.0.1:${cmd}`,
      stream: `tcp://127.0.0.1:${stream}`,
    };
    return this.endpoints;
  }

  // Lanza (o relanza) el motor C++ en los endpoints elegidos.
  startEngine() {
    const bin = resolveEngineBin();
    if (!bin) {
      this.emit('log', 'motor no encontrado (compílalo: cmake --build build)', 'err');
      this.emit('status', { connected: false });
      return null;
    }
    const env = {
      ...process.env,
      QL_CMD_ENDPOINT: this.endpoints.cmd,
      QL_STREAM_ENDPOINT: this.endpoints.stream,
    };
    this._engine = spawn(bin, [], { stdio: ['ignore', 'pipe', 'pipe'], env });
    this._engine.stdout.on('data', (d) => process.stdout.write(`[C++] ${d}`));
    this._engine.stderr.on('data', (d) => process.stderr.write(`[C++] ${d}`));
    this._engine.on('exit', (code, signal) => this._onEngineExit(code, signal));
    return this._engine;
  }

  _onEngineExit(code, signal) {
    if (this._stopping) return;
    this.emit('status', { connected: false });
    // Backoff exponencial acotado; hasta 6 reintentos.
    if (this._restarts >= 6) {
      this.emit('log', 'motor caído: reintentos agotados', 'err');
      this.emit('down');
      return;
    }
    const delay = Math.min(4000, 400 * 2 ** this._restarts);
    this._restarts += 1;
    this.emit('log', `motor caído (code ${code ?? signal}); reintentando en ${delay} ms…`, 'warn');
    setTimeout(() => {
      if (this._stopping) return;
      this.startEngine();
      // Se considera recuperado tras un breve arranque estable.
      setTimeout(() => {
        if (!this._stopping && this._engine && this._engine.exitCode === null) {
          this._restarts = 0;
          this.emit('status', { connected: true });
          this.emit('log', 'motor reiniciado', 'ok');
        }
      }, 700);
    }, delay);
  }

  startPython() {
    const r = resolvePythonBridge();
    if (!r) {
      console.error('[process-mgr] python bridge no encontrado');
      return null;
    }
    this._python = spawn(r.cmd, r.args, { cwd: r.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this._python.stderr.on('data', (d) => process.stderr.write(`[PY] ${d}`));
    this._python.on('exit', (code) => console.log(`[process-mgr] python exit ${code}`));
    return this._python;
  }

  validateWithPython(cmd) {
    return new Promise((resolve, reject) => {
      if (!this._python) return reject(new Error('python not started'));
      const onData = (buf) => {
        this._python.stdout.off('data', onData);
        try {
          resolve(JSON.parse(buf.toString().trim().split('\n').pop()));
        } catch (e) {
          reject(e);
        }
      };
      this._python.stdout.on('data', onData);
      this._python.stdin.write(JSON.stringify(cmd) + '\n');
    });
  }

  stopAll() {
    this._stopping = true;
    if (this._engine) this._engine.kill('SIGTERM');
    if (this._python) this._python.kill('SIGTERM');
  }
}

module.exports = { ProcessManager, resolveEngineBin, resolvePythonBridge, PYTHON_DIR };
