// Proceso Main de Electron: ventana, ciclo de vida, spawn de procesos y
// forwarding de frames del motor C++ hacia el Renderer via ipcMain/webContents.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { QuantumBridge } = require('./zmq-bridge');
const { ProcessManager } = require('./process-mgr');

// --- Flags de entorno (solo para CI / entornos headless; la app normal no los usa) ---
// QL_NO_SANDBOX=1  -> desactiva el sandbox (necesario al correr como root en contenedor)
// QL_SOFTWARE_GL=1 -> WebGL por software (SwiftShader) cuando no hay GPU
// QL_CAPTURE=<png>  -> ejecuta un Grover, captura la ventana al PNG dado y sale
if (process.env.QL_NO_SANDBOX) app.commandLine.appendSwitch('no-sandbox');
if (process.env.QL_SOFTWARE_GL) {
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

let mainWindow = null;
let bridge = null;
let procMgr = null;

const MAX_QUBITS = 20; // §8

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0a0e1a',
    title: 'Quantum Lab',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true, // §8
      nodeIntegration: false, // §8: el Renderer NUNCA accede a Node directamente
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Reenviar el estado del motor cuando el renderer termina de cargar, por si el
  // evento 'status' del bridge se emitió antes de que hubiera listeners.
  mainWindow.webContents.on('did-finish-load', () => {
    const connected = !!(bridge && bridge._connected);
    mainWindow.webContents.send('quantum:engine-status', { connected });
  });
}

// Validacion de inputs en el Main antes de enviar al motor (§8).
function validateGroverParams(params) {
  const n = Number(params?.nQubits ?? params?.n_qubits);
  const target = Number(params?.targetState ?? params?.target_state);
  const iters = Number(params?.iterations ?? 0);
  if (!Number.isInteger(n) || n < 1 || n > MAX_QUBITS)
    throw new Error('n_qubits fuera de rango [1,20]');
  if (!Number.isInteger(target) || target < 0 || target >= 1 << n)
    throw new Error('target_state fuera de rango');
  return { n, target, iters: Number.isInteger(iters) ? iters : 0 };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

async function setupBridge() {
  procMgr = new ProcessManager();
  const endpoints = await procMgr.init(); // elige puertos TCP libres
  // Supervisión: reenviar eventos del gestor de procesos al renderer.
  procMgr.on('status', (s) => sendToRenderer('quantum:engine-status', s));
  procMgr.on('log', (msg, level) => sendToRenderer('quantum:engine-log', { msg, level }));
  procMgr.on('down', () =>
    sendToRenderer('quantum:engine-status', { connected: false, fatal: true })
  );

  procMgr.startEngine();
  await new Promise((r) => setTimeout(r, 600)); // dejar que el motor haga bind

  bridge = new QuantumBridge(endpoints);
  bridge.on('state-update', (frame) => sendToRenderer('quantum:state-update', frame));
  bridge.on('status', (s) => sendToRenderer('quantum:engine-status', s));
  bridge.on('error', (e) => console.error('[bridge]', e.message));
  await bridge.connect();
  sendToRenderer('quantum:engine-status', { connected: true });
}

// --- Handlers IPC (invocados desde preload via ipcRenderer.invoke) ---
ipcMain.handle('quantum:run-grover', async (_evt, params) => {
  const { n, target, iters } = validateGroverParams(params);
  return bridge.sendCommand({
    type: 'RUN_GROVER',
    n_qubits: n,
    target_state: target,
    iterations: iters,
    stream_intermediate: true,
  });
});

ipcMain.handle('quantum:run-shor', async (_evt, params) => {
  const N = Number(params?.N ?? params?.n ?? 15);
  const a = Number(params?.a ?? 7);
  if (!Number.isInteger(N) || N < 3) throw new Error('N debe ser entero >= 3');
  if (!Number.isInteger(a) || a < 2 || a >= N) throw new Error('a debe cumplir 2 <= a < N');
  return bridge.sendCommand({ type: 'RUN_SHOR', N, a });
});

ipcMain.handle('quantum:run-teleportation', async (_evt, params) => {
  const theta = Number(params?.theta ?? Math.PI / 3);
  const phi = Number(params?.phi ?? Math.PI / 4);
  if (!Number.isFinite(theta) || !Number.isFinite(phi)) throw new Error('theta/phi inválidos');
  return bridge.sendCommand({ type: 'RUN_TELEPORTATION', theta, phi });
});

ipcMain.handle('quantum:stop', async () => {
  return bridge ? bridge.sendCommand({ type: 'PING' }) : { status: 'ERROR' };
});

// Hook de captura headless (gated por QL_CAPTURE): dispara un Grover, espera a
// que las barras se estabilicen y guarda un PNG de la ventana. No se activa en
// uso normal.
async function runCaptureAndExit(pngPath) {
  const algo = process.env.QL_ALGO || 'grover';
  try {
    await new Promise((r) => {
      if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', r);
      else r();
    });
    await new Promise((r) => setTimeout(r, 900));
    // Conduce la UI real: selecciona la pestaña y ejecuta.
    await mainWindow.webContents.executeJavaScript(`
      (function(){
        const tab = document.querySelector('[data-algo="${algo}"]');
        if (tab) tab.click();
        const run = document.getElementById('run');
        if (run) run.click();
        return !!run;
      })();
    `);
    await new Promise((r) => setTimeout(r, 3000)); // convergencia de animaciones
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(pngPath, image.toPNG());
    console.log(`[capture] screenshot (${algo}) escrito en ${pngPath}`);
  } catch (e) {
    console.error('[capture] error:', e.message);
  } finally {
    app.quit();
  }
}

// Captura una secuencia de frames (para GIF). QL_GIFDIR = carpeta destino.
async function captureGifAndExit(dir) {
  const algo = process.env.QL_ALGO || 'grover';
  const frames = Number(process.env.QL_GIFFRAMES || 44);
  const interval = Number(process.env.QL_GIFINT || 90);
  try {
    await new Promise((r) => {
      if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', r);
      else r();
    });
    await new Promise((r) => setTimeout(r, 900));
    await mainWindow.webContents.executeJavaScript(`
      (function(){ const t=document.querySelector('[data-algo="${algo}"]'); if(t)t.click();
        const r=document.getElementById('run'); if(r)r.click(); return true; })();`);
    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < frames; i++) {
      const img = await mainWindow.webContents.capturePage();
      fs.writeFileSync(`${dir}/f_${String(i).padStart(3, '0')}.png`, img.toPNG());
      await new Promise((r) => setTimeout(r, interval));
    }
    console.log(`[gif] ${frames} frames escritos en ${dir}`);
  } catch (e) {
    console.error('[gif] error:', e.message);
  } finally {
    app.quit();
  }
}

app.whenReady().then(async () => {
  createWindow();
  try {
    await setupBridge();
  } catch (e) {
    console.error('[main] setupBridge falló:', e.message);
  }
  if (process.env.QL_GIFDIR) captureGifAndExit(process.env.QL_GIFDIR);
  else if (process.env.QL_CAPTURE) runCaptureAndExit(process.env.QL_CAPTURE);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (bridge) bridge.disconnect();
  if (procMgr) procMgr.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (bridge) bridge.disconnect();
  if (procMgr) procMgr.stopAll();
});
