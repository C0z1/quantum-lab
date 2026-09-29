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
  // Itera en [0,200]: valores negativos o desmesurados (vía llamada directa a la
  // API) se saturan para no inundar el stream ni entrar en bucles absurdos.
  const safeIters = Number.isInteger(iters) ? Math.max(0, Math.min(iters, 200)) : 0;
  return { n, target, iters: safeIters };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

// Garantiza que el puente exista antes de despachar un comando; si no, lanza un
// error legible (mejor que "Cannot read properties of null").
function requireBridge() {
  if (!bridge) throw new Error('motor no disponible: el puente no se inició');
  return bridge;
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

  // QL_NO_ENGINE=1 -> no arranca el motor (prueba de degradación: comandos que
  // expiran, chip "sin conexión", errores capturados sin tumbar la app).
  if (!process.env.QL_NO_ENGINE) procMgr.startEngine();
  // Bridge de Qiskit para validación en vivo (opcional; degrada si no está).
  if (!process.env.QL_NO_PYTHON) {
    try {
      procMgr.startPython();
    } catch (e) {
      console.error('[main] no se pudo iniciar el bridge Python:', e.message);
    }
  }
  await new Promise((r) => setTimeout(r, 600)); // dejar que el motor haga bind

  bridge = new QuantumBridge(endpoints);
  bridge.on('state-update', (frame) => sendToRenderer('quantum:state-update', frame));
  bridge.on('status', (s) => sendToRenderer('quantum:engine-status', s));
  bridge.on('error', (e) => console.error('[bridge]', e.message));
  await bridge.connect();
  // Verifica con un PING real antes de anunciar el motor como online (ZeroMQ
  // "connect" tiene éxito aunque no haya motor). Así el chip refleja la verdad.
  const online = await bridge.ping();
  sendToRenderer('quantum:engine-status', { connected: online });
}

// --- Handlers IPC (invocados desde preload via ipcRenderer.invoke) ---
ipcMain.handle('quantum:run-grover', async (_evt, params) => {
  const { n, target, iters } = validateGroverParams(params);
  return requireBridge().sendCommand({
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
  return requireBridge().sendCommand({ type: 'RUN_SHOR', N, a });
});

ipcMain.handle('quantum:run-teleportation', async (_evt, params) => {
  const theta = Number(params?.theta ?? Math.PI / 3);
  const phi = Number(params?.phi ?? Math.PI / 4);
  if (!Number.isFinite(theta) || !Number.isFinite(phi)) throw new Error('theta/phi inválidos');
  return requireBridge().sendCommand({ type: 'RUN_TELEPORTATION', theta, phi });
});

ipcMain.handle('quantum:run-dj', async (_evt, params) => {
  const n = Number(params?.nQubits ?? 3);
  const balanced = !!params?.balanced;
  if (!Number.isInteger(n) || n < 1 || n > 19) throw new Error('n en [1,19]');
  return requireBridge().sendCommand({ type: 'RUN_DJ', n_qubits: n, balanced });
});

ipcMain.handle('quantum:run-bv', async (_evt, params) => {
  const n = Number(params?.nQubits ?? 4);
  const hidden = Number(params?.hidden ?? 0);
  if (!Number.isInteger(n) || n < 1 || n > 19) throw new Error('n en [1,19]');
  if (!Number.isInteger(hidden) || hidden < 0 || hidden >= 1 << n)
    throw new Error('hidden fuera de rango');
  return requireBridge().sendCommand({ type: 'RUN_BV', n_qubits: n, hidden });
});

ipcMain.handle('quantum:run-qft', async (_evt, params) => {
  const n = Number(params?.nQubits ?? 4);
  const m = Number(params?.periodExp ?? 2);
  if (!Number.isInteger(n) || n < 1 || n > 16) throw new Error('n en [1,16]');
  if (!Number.isInteger(m) || m < 0 || m > n) throw new Error('period_exp en [0,n]');
  return requireBridge().sendCommand({ type: 'RUN_QFT', n_qubits: n, period_exp: m });
});

ipcMain.handle('quantum:stop', async () => {
  return bridge ? bridge.sendCommand({ type: 'PING' }) : { status: 'ERROR' };
});

// Validación EN VIVO del run actual: ejecuta el mismo caso en Qiskit y compara
// sus probabilidades con las del motor C++ que envía el renderer. Devuelve la
// divergencia real de ESTOS parámetros (no un snapshot). Degrada con {ok:false}.
const VALIDATE_MAP = {
  grover: (p) => ({
    type: 'VALIDATE_GROVER',
    n_qubits: p.nQubits,
    target_state: p.targetState,
    iterations: p.iterations,
  }),
  teleport: (p) => ({ type: 'VALIDATE_TELEPORTATION', theta: p.theta, phi: p.phi }),
  shor: (p) => ({ type: 'VALIDATE_SHOR', N: p.N, a: p.a }),
  dj: (p) => ({ type: 'VALIDATE_DJ', n_qubits: p.nQubits, balanced: p.balanced }),
  bv: (p) => ({ type: 'VALIDATE_BV', n_qubits: p.nQubits, hidden: p.hidden }),
  qft: (p) => ({ type: 'VALIDATE_QFT', n_qubits: p.nQubits, period_exp: p.periodExp }),
};

function maxProbDelta(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return NaN;
  const n = Math.min(a.length, b.length);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(Number(a[i]) - Number(b[i]));
    if (Number.isFinite(d) && d > m) m = d;
  }
  return m;
}

let _validating = false;
ipcMain.handle('quantum:validate-live', async (_evt, payload) => {
  const algo = payload?.algo;
  const build = VALIDATE_MAP[algo];
  if (!build) return { ok: false, error: 'algoritmo desconocido' };
  if (!Array.isArray(payload?.probs) || !payload.probs.length) {
    return { ok: false, error: 'ejecuta el algoritmo antes de validar' };
  }
  if (_validating) return { ok: false, error: 'validación en curso' };
  _validating = true;
  try {
    const cmd = build(payload.params || {});
    const res = await procMgr.validateWithPython(cmd);
    if (!res || res.status !== 'OK' || !res.result) {
      return { ok: false, error: (res && res.error) || 'sin respuesta de Qiskit' };
    }
    const ref = res.result.probabilities || res.result.counting_probabilities;
    const delta = maxProbDelta(payload.probs, ref);
    if (!Number.isFinite(delta)) return { ok: false, error: 'no se pudo comparar' };
    const tolerance = 1e-9;
    return {
      ok: true,
      delta,
      tolerance,
      pass: delta < tolerance,
      reference: res.reference || 'Qiskit',
      states: Math.min(payload.probs.length, ref.length),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    _validating = false;
  }
});

// Hook de captura headless (gated por QL_CAPTURE): dispara un Grover, espera a
// que las barras se estabilicen y guarda un PNG de la ventana. No se activa en
// uso normal.
async function runCaptureAndExit(pngPath) {
  const algo = process.env.QL_ALGO || 'grover';
  const cspErrors = [];
  mainWindow.webContents.on('console-message', (_e, _lvl, message) => {
    if (/content security policy|refused to|csp/i.test(message)) cspErrors.push(message);
  });
  try {
    await new Promise((r) => {
      if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', r);
      else r();
    });
    await new Promise((r) => setTimeout(r, 900));
    // Conduce la UI real: selecciona la pestaña y ejecuta.
    const view = process.env.QL_VIEW || '3d';
    const usePreset = !!process.env.QL_PRESET;
    await mainWindow.webContents.executeJavaScript(`
      (function(){
        const tab = document.querySelector('[data-algo="${algo}"]');
        if (tab) tab.click();
        const trigger = document.getElementById('${usePreset ? 'preset' : 'run'}');
        if (trigger) trigger.click();
        const seg = document.querySelector('[data-view="${view}"]');
        if (seg) seg.click();
        if (${process.env.QL_CONSOLE ? 'true' : 'false'}) {
          const cb = document.getElementById('btnConsole');
          if (cb) cb.click();
        }
        return !!trigger;
      })();
    `);
    await new Promise((r) => setTimeout(r, 3000)); // convergencia de animaciones
    // Abre el panel de validación si se pide (verificación de UI + CSP).
    if (process.env.QL_VALIDPANEL) {
      const vp = await mainWindow.webContents.executeJavaScript(`
        (function(){
          const c = document.getElementById('verifiedChip'); if (c) c.click();
          const o = document.getElementById('validOverlay');
          const secs = document.querySelectorAll('#validBody .valg');
          const rows = document.querySelectorAll('#validBody .valg-t tr').length;
          const sample = (secs[0] && secs[0].querySelector('.valg-n') || {}).textContent;
          return JSON.stringify({
            open: !!o && !o.hidden,
            algoSections: secs.length,
            totalRows: rows,
            firstAlgo: sample,
            summaryHasBadge: !!document.querySelector('#validSummary .vs-badge'),
            badgeText: (document.querySelector('#validSummary .vs-badge')||{}).textContent
          });
        })();`);
      console.log('[validpanel]', vp);
      await new Promise((r) => setTimeout(r, 400));
      // Validación EN VIVO: pulsa el botón y espera el veredicto de Qiskit.
      if (process.env.QL_VALIDLIVE) {
        await mainWindow.webContents.executeJavaScript(
          `(function(){ const b=document.getElementById('btnValidateLive'); if(b)b.click(); return !!b; })();`
        );
        await new Promise((r) => setTimeout(r, 12000)); // import de qiskit + ejecución
        const live = await mainWindow.webContents.executeJavaScript(
          `(function(){ const o=document.getElementById('vlResult'); return JSON.stringify({ cls:o?o.className:null, text:o?o.textContent:null }); })();`
        );
        console.log('[validlive]', live);
      }
    }
    // Sonda de verificación: estado del progress rail y (si aplica) del preset.
    const probe = await mainWindow.webContents.executeJavaScript(`
      (function(){
        const rail = document.getElementById('progressRail');
        const fill = document.getElementById('progressFill');
        const vals = {};
        document.querySelectorAll('#params input, #params select').forEach(el => { vals[el.id] = el.value; });
        return JSON.stringify({
          railExists: !!rail,
          fillWidth: fill ? fill.style.width : null,
          fillDone: fill ? fill.classList.contains('done') : null,
          params: vals
        });
      })();
    `);
    console.log('[probe]', probe);
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(pngPath, image.toPNG());
    console.log(`[capture] screenshot (${algo}) escrito en ${pngPath}`);
    console.log('[csp] violaciones:', JSON.stringify(cspErrors.slice(0, 8)));
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

// Prueba de estrés adversaria (gated por QL_STRESS): golpea la app con cambios
// de algoritmo, spam de preset y reejecuciones a medio stream, capturando
// errores de la página; al final reporta la integridad del buffer.
async function runStressAndExit() {
  const errors = [];
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 || /error|NaN|undefined is not|cannot read/i.test(message)) {
      errors.push(message);
    }
  });
  try {
    await new Promise((r) => {
      if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', r);
      else r();
    });
    await new Promise((r) => setTimeout(r, 900));
    const report = await mainWindow.webContents.executeJavaScript(`
      (async function(){
        const out = { steps: [], thrown: [] };
        const click = (sel) => { const el = document.querySelector(sel); if (el) el.click(); return !!el; };
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        window.addEventListener('error', (e) => out.thrown.push(String(e.message)));
        window.addEventListener('unhandledrejection', (e) => out.thrown.push('reject:' + String(e.reason)));
        const algos = ['grover','teleport','shor','dj','bv','qft'];
        // 1) Cambio rápido de algoritmo + preset, sin esperar a que termine.
        for (const a of algos) {
          click('[data-algo="'+a+'"]');
          click('#preset');
          await wait(120); // a medio stream
        }
        // 2) Spam de preset en grover.
        click('[data-algo="grover"]');
        for (let i=0;i<8;i++){ click('#preset'); await wait(40); }
        // 3) Cambio a circuito y de vuelta durante reproducción.
        click('[data-view="circuit"]'); await wait(80);
        click('[data-view="3d"]'); await wait(80);
        // 4) Contaminación por tamaño: Grover grande (256) interrumpido a medio
        //    stream por teleport (8). No deben sobrevivir frames de tamaño 256.
        const setRange = (id, v) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.value = String(v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        click('[data-algo="grover"]');
        setRange('g_nq', 8); setRange('g_tgt', 200); setRange('g_it', 20);
        click('#run');
        await wait(90); // interrumpe a medio stream del Grover grande
        click('[data-algo="teleport"]'); click('#run');
        // Deja estabilizar y recoge integridad del buffer.
        await wait(2500);
        // Sonda global desde el módulo de escena (expuesto para depuración).
        const dbg = window.__qlDebug || {};
        const buf = (dbg.state && dbg.state.buffer) || [];
        const exp = dbg.state && dbg.state.expectSize;
        out.bufferLen = buf.length;
        out.expectSize = exp;
        out.mismatched = exp ? buf.filter(f => f.stateSize !== exp).length : 0;
        out.anyNaN = buf.some(f => f.data && Array.prototype.some.call(f.data, v => !Number.isFinite(v)));
        out.algo = dbg.state && dbg.state.algo;
        return out;
      })();
    `);
    console.log('[stress]', JSON.stringify(report));
    console.log('[stress] page-errors', JSON.stringify(errors.slice(0, 10)));
  } catch (e) {
    console.error('[stress] error:', e.message);
  } finally {
    app.quit();
  }
}

// Prueba de degradación sin motor (QL_NOENGINE_TEST): ejecuta un run que
// expirará y verifica que la app sobrevive, captura el error y no lanza.
async function runNoEngineAndExit() {
  try {
    await new Promise((r) => {
      if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', r);
      else r();
    });
    await new Promise((r) => setTimeout(r, 900));
    const report = await mainWindow.webContents.executeJavaScript(`
      (async function(){
        const out = { thrown: [] };
        window.addEventListener('error', (e) => out.thrown.push(String(e.message)));
        window.addEventListener('unhandledrejection', (e) => out.thrown.push('reject:' + String(e.reason)));
        const click = (sel) => { const el = document.querySelector(sel); if (el) el.click(); };
        click('[data-algo="grover"]'); click('#run');
        await new Promise(r => setTimeout(r, 6000)); // deja expirar el comando (RCVTIMEO 5s)
        const dbg = window.__qlDebug || {};
        out.bufferLen = (dbg.state && dbg.state.buffer || []).length;
        out.alive = !!document.getElementById('viewport');
        out.engineText = (document.getElementById('engineText')||{}).textContent;
        return out;
      })();
    `);
    console.log('[noengine]', JSON.stringify(report));
  } catch (e) {
    console.error('[noengine] error:', e.message);
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
  if (process.env.QL_NOENGINE_TEST) runNoEngineAndExit();
  else if (process.env.QL_STRESS) runStressAndExit();
  else if (process.env.QL_GIFDIR) captureGifAndExit(process.env.QL_GIFDIR);
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
  // Salvaguarda de cierre: un socket ZMQ con una operación pendiente (p. ej. un
  // comando en vuelo con el motor caído) puede mantener vivo el bucle de eventos
  // e impedir que el proceso termine. Forzamos la salida tras un breve margen.
  // El timer va con unref() para no bloquear él mismo una salida natural.
  setTimeout(() => process.exit(0), 800).unref();
});
