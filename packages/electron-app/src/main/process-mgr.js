// Gestion del ciclo de vida de los procesos hijos: motor C++ y bridge Python.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Resuelve rutas relativas al repo (sin hardcodear absolutos, §10).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PYTHON_DIR = path.join(REPO_ROOT, 'packages', 'qiskit-bridge');
const EXE = process.platform === 'win32' ? 'quantum-engine.exe' : 'quantum-engine';

// El binario del motor puede estar (a) empaquetado como recurso extra, o (b) en
// el build de desarrollo (Linux/mac en build/, MSVC en build/Release/).
function resolveEngineBin() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'engine', EXE),
    path.join(REPO_ROOT, 'packages', 'core-engine', 'build', EXE),
    path.join(REPO_ROOT, 'packages', 'core-engine', 'build', 'Release', EXE),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

class ProcessManager {
  constructor() {
    this._engine = null;
    this._python = null;
  }

  // Lanza el motor C++. Devuelve el ChildProcess o null si el binario no existe.
  startEngine() {
    const bin = resolveEngineBin();
    if (!bin) {
      console.error('[process-mgr] engine binary not found (busqué recurso empaquetado y build/).');
      console.error('[process-mgr] compila primero: cd packages/core-engine && cmake --build build');
      return null;
    }
    console.log(`[process-mgr] engine: ${bin}`);
    this._engine = spawn(bin, [], { stdio: ['ignore', 'pipe', 'pipe'] });
    this._engine.stdout.on('data', (d) => process.stdout.write(`[C++] ${d}`));
    this._engine.stderr.on('data', (d) => process.stderr.write(`[C++] ${d}`));
    this._engine.on('exit', (code) => console.log(`[process-mgr] engine exit ${code}`));
    return this._engine;
  }

  // Lanza el bridge Python en modo subprocess (stdin/stdout JSON).
  startPython() {
    const main = path.join(PYTHON_DIR, 'main.py');
    if (!fs.existsSync(main)) {
      console.error(`[process-mgr] python bridge not found: ${main}`);
      return null;
    }
    this._python = spawn('python3', [main], {
      cwd: PYTHON_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._python.stderr.on('data', (d) => process.stderr.write(`[PY] ${d}`));
    this._python.on('exit', (code) => console.log(`[process-mgr] python exit ${code}`));
    return this._python;
  }

  // Envia un comando JSON al bridge Python y resuelve con la respuesta.
  validateWithPython(cmd) {
    return new Promise((resolve, reject) => {
      if (!this._python) return reject(new Error('python not started'));
      const onData = (buf) => {
        this._python.stdout.off('data', onData);
        try { resolve(JSON.parse(buf.toString().trim().split('\n').pop())); }
        catch (e) { reject(e); }
      };
      this._python.stdout.on('data', onData);
      this._python.stdin.write(JSON.stringify(cmd) + '\n');
    });
  }

  stopAll() {
    if (this._engine) this._engine.kill('SIGTERM');
    if (this._python) this._python.kill('SIGTERM');
  }
}

module.exports = { ProcessManager, resolveEngineBin, PYTHON_DIR };
