// scene.js — orquesta el visualizador 3D, el gráfico 2D y el shell de UI, con un
// sistema de reproducción (play/pausa, paso a paso, línea de tiempo, velocidad):
// los frames del motor se almacenan en un buffer y se reproducen bajo un cursor.
import { QuantumVisualizer } from './visualizer.js';
import { Chart2D } from './chart.js';
import { UIController } from './ui.js';

const viewport = document.getElementById('viewport');
const viz = new QuantumVisualizer(viewport);

const ui = new UIController({
  onTab: (algo, params) => configureFor(algo, params),
  onReset: () => resetRun(),
  onRun: (algo, params) => runAlgorithm(algo, params),
  onPlay: () => togglePlay(),
  onStep: () => stepBy(1),
  onRestart: () => setCursor(0, false),
  onSeek: (i) => {
    pause();
    setCursor(i, i > state.cursor);
  },
  onSpeed: () => cycleSpeed(),
  // Ajustes en vivo.
  onBloom: (v) => viz.setBloom(v),
  onParticles: (on) => viz.setParticles(on),
  onAutoRotate: (on) => viz.setAutoRotate(on),
  onDefaultSpeed: (idx) => {
    state.speedIdx = idx;
    ui.setPlayback({ speed: SPEEDS[idx] });
  },
  onPresentToggle: () => togglePresent(),
});
const chart = new Chart2D(ui.chartCanvas);

const SPEEDS = [0.5, 1, 2, 4];
const state = {
  algo: 'grover',
  target: 5,
  theta: 0,
  phi: 0,
  fidelity: null,
  buffer: [],
  cursor: -1,
  playing: false,
  runFinal: false,
  speedIdx: 1,
  lastAdvance: 0,
  frames: 0,
  lastT: 0,
  params: null,
  presenting: false,
  presentTimer: null,
};

const PILLS = {
  grover: ['prep', 'oráculo', 'difusor', 'medida'],
  teleport: ['prep |ψ⟩', 'Bell', 'medida', 'corrige'],
  shor: ['H⊗ⁿ', 'mod-exp', 'QFT⁻¹'],
  dj: ['H⊗ⁿ · |−⟩', 'oráculo', 'H⊗ⁿ · medida'],
  bv: ['H⊗ⁿ · |−⟩', 'oráculo a·x', 'H⊗ⁿ · medida'],
  qft: ['peine', 'QFT', 'picos'],
};
const LEGEND = {
  grover: [
    { color: '#ffb829', label: 'objetivo' },
    { color: '#8052ff', label: 'estados' },
  ],
  teleport: [
    { color: '#2ee6b0', label: 'vector de Bloch' },
    { color: '#8052ff', label: 'entrelazamiento' },
  ],
  shor: [
    { color: '#ffb829', label: 'picos s/r' },
    { color: '#8052ff', label: 'conteo' },
  ],
  dj: [
    { color: '#ffb829', label: '|0…0⟩ (constante)' },
    { color: '#8052ff', label: 'entradas' },
  ],
  bv: [
    { color: '#ffb829', label: 'cadena a' },
    { color: '#8052ff', label: 'entradas' },
  ],
  qft: [
    { color: '#ffb829', label: 'picos' },
    { color: '#8052ff', label: 'registro' },
  ],
};

function frameDuration() {
  return 900 / SPEEDS[state.speedIdx];
}

function topAmplitudes(data, size, nbits, k = 6) {
  const idx = Array.from({ length: size }, (_, i) => i);
  idx.sort((a, b) => data[b * 3 + 2] - data[a * 3 + 2]);
  return idx.slice(0, k).map((i) => ({
    label: i.toString(2).padStart(nbits, '0'),
    re: data[i * 3].toFixed(3),
    im: data[i * 3 + 1].toFixed(3),
    prob: data[i * 3 + 2],
    hl: i === state.target,
  }));
}

function fadeStage() {
  viewport.style.opacity = '0.25';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      viewport.style.opacity = '1';
    })
  );
}

function configureFor(algo, params) {
  state.algo = algo;
  state.params = params;
  state.buffer = [];
  state.cursor = -1;
  state.playing = false;
  state.runFinal = false;
  state.frames = 0;
  state.fidelity = null;
  state.series = [];
  chart.clear();
  ui.setStateTable([]);
  ui.setStatus({ frames: 0, dt: '—' });
  ui.setLegend(LEGEND[algo]);
  ui.showPlayback(false);
  ui.showAnalysis(algo !== 'teleport');
  fadeStage();
  if (algo === 'grover') {
    viz.setMode('bars');
    viz.initBars(1 << params.nQubits);
    viz.highlightTarget(params.targetState);
    viz.reset();
    state.target = params.targetState;
    ui.setAnalysisTitle('Convergencia · P(objetivo)');
    ui.setStatus({ qubits: params.nQubits, dim: 1 << params.nQubits });
    ui.setMetrics([
      { k: 'Iteración', v: '—' },
      { k: 'P(objetivo)', v: '—', accent: true },
      { k: 'Prob. máx', v: '—' },
      { k: 'Qubits', v: params.nQubits },
    ]);
  } else if (algo === 'teleport') {
    viz.setMode('bloch');
    viz.initBloch(3, ['q0 |ψ⟩', 'q1 ancilla', 'q2 destino']);
    state.target = -1;
    state.theta = params.theta;
    state.phi = params.phi;
    ui.setAnalysisTitle('Esferas de Bloch');
    ui.setStatus({ qubits: 3, dim: 8 });
    ui.setMetrics([
      { k: 'Paso', v: '—' },
      { k: 'Fidelidad', v: '—', accent: true },
      { k: 'θ', v: ((params.theta * 180) / Math.PI).toFixed(0) + '°' },
      { k: 'φ', v: ((params.phi * 180) / Math.PI).toFixed(0) + '°' },
    ]);
  } else if (algo === 'shor') {
    viz.setMode('bars');
    viz.highlightTarget(-1);
    viz.setPeaks([]);
    state.target = -1;
    ui.setAnalysisTitle('Registro de conteo · s/r');
    ui.setStatus({ qubits: '—', dim: '—' });
    ui.setMetrics([
      { k: 'N', v: params.N },
      { k: 'a', v: params.a },
      { k: 'Orden r', v: '—', accent: true },
      { k: 'Factores', v: '—', accent: true, small: true },
    ]);
  } else if (algo === 'dj') {
    viz.setMode('bars');
    viz.initBars(1 << params.nQubits);
    viz.highlightTarget(-1);
    viz.setPeaks([]);
    state.target = -1;
    ui.setAnalysisTitle('Registro de entrada · medición');
    ui.setStatus({ qubits: params.nQubits, dim: 1 << params.nQubits });
    ui.setMetrics([
      { k: 'Qubits', v: params.nQubits },
      { k: 'Oráculo', v: params.balanced ? 'balanceada' : 'constante' },
      { k: 'Veredicto', v: '—', accent: true },
      { k: 'Consultas', v: 1 },
    ]);
  } else if (algo === 'bv') {
    viz.setMode('bars');
    viz.initBars(1 << params.nQubits);
    viz.highlightTarget(params.hidden);
    viz.setPeaks([]);
    state.target = params.hidden;
    ui.setAnalysisTitle('Registro de entrada · medición');
    ui.setStatus({ qubits: params.nQubits, dim: 1 << params.nQubits });
    ui.setMetrics([
      { k: 'Qubits', v: params.nQubits },
      { k: 'a oculta', v: params.hidden.toString(2).padStart(params.nQubits, '0'), small: true },
      { k: 'Recuperada', v: '—', accent: true, small: true },
      { k: 'Consultas', v: 1 },
    ]);
  } else {
    // qft
    viz.setMode('bars');
    viz.initBars(1 << params.nQubits);
    viz.highlightTarget(-1);
    viz.setPeaks([]);
    state.target = -1;
    ui.setAnalysisTitle('Espectro · registro');
    ui.setStatus({ qubits: params.nQubits, dim: 1 << params.nQubits });
    ui.setMetrics([
      { k: 'Qubits', v: params.nQubits },
      { k: 'Periodo m', v: params.periodExp },
      { k: 'Picos', v: 1 << params.periodExp, accent: true },
      { k: 'Espaciado', v: 1 << (params.nQubits - params.periodExp) },
    ]);
  }
  ui.setHud(
    algo,
    PILLS[algo].map((p) => ({ label: p, on: false }))
  );
  ui.setCircuit(algo, params);
}

function resetRun() {
  chart.clear();
  viz.reset();
  ui.setStateTable([]);
  state.buffer = [];
  state.cursor = -1;
  state.playing = false;
  state.runFinal = false;
  ui.showPlayback(false);
}

async function runAlgorithm(algo, params) {
  configureFor(algo, params);
  state.playing = true;
  state.lastAdvance = performance.now();
  ui.showPlayback(true);
  ui.setPlayback({ playing: true, cursor: -1, total: 0, speed: SPEEDS[state.speedIdx] });
  try {
    if (algo === 'grover') {
      ui.log(
        `RUN_GROVER n=${params.nQubits} target=${params.targetState} iters=${params.iterations}`,
        'cmd'
      );
      await window.quantumAPI.runGrover(params);
    } else if (algo === 'teleport') {
      ui.log(
        `RUN_TELEPORTATION θ=${((params.theta * 180) / Math.PI).toFixed(0)}° φ=${((params.phi * 180) / Math.PI).toFixed(0)}°`,
        'cmd'
      );
      const ack = await window.quantumAPI.runTeleportation(params);
      state.fidelity = ack.fidelity;
      ui.log(`teleportación completa · fidelidad ${ack.fidelity.toFixed(4)}`, 'ok');
    } else if (algo === 'shor') {
      ui.log(`RUN_SHOR N=${params.N} a=${params.a}`, 'cmd');
      const ack = await window.quantumAPI.runShor(params);
      state.shorAck = ack;
      ui.log(
        ack.success
          ? `factores hallados: ${(ack.factors || []).join(' · ')} (r=${ack.order})`
          : 'sin factorización',
        ack.success ? 'ok' : 'warn'
      );
    } else if (algo === 'dj') {
      ui.log(`RUN_DJ n=${params.nQubits} ${params.balanced ? 'balanceada' : 'constante'}`, 'cmd');
      const ack = await window.quantumAPI.runDeutschJozsa(params);
      state.djAck = ack;
      ui.log(
        `veredicto: función ${ack.is_constant ? 'CONSTANTE' : 'BALANCEADA'} (1 consulta)`,
        'ok'
      );
    } else if (algo === 'bv') {
      ui.log(`RUN_BV n=${params.nQubits} a=${params.hidden}`, 'cmd');
      const ack = await window.quantumAPI.runBernsteinVazirani(params);
      state.bvAck = ack;
      const rec = (ack.recovered >>> 0).toString(2).padStart(params.nQubits, '0');
      ui.log(
        `cadena recuperada: ${rec} ${ack.recovered === params.hidden ? '✓' : '✗'}`,
        ack.recovered === params.hidden ? 'ok' : 'warn'
      );
    } else {
      ui.log(`RUN_QFT n=${params.nQubits} m=${params.periodExp}`, 'cmd');
      await window.quantumAPI.runQFT(params);
      ui.log(`QFT aplicada · ${1 << params.periodExp} picos espaciados`, 'ok');
    }
  } catch (e) {
    ui.log('error: ' + e.message, 'err');
    console.error(e);
  }
}

// ---------------- reproducción ----------------
function setCursor(idx, forward) {
  idx = Math.max(0, Math.min(idx, state.buffer.length - 1));
  const advanced = idx !== state.cursor;
  state.cursor = idx;
  showFrame(idx, forward && advanced);
  ui.setPlayback({ cursor: idx });
}

function stepBy(d) {
  pause();
  if (state.buffer.length) setCursor(state.cursor + d, d > 0);
}
function pause() {
  state.playing = false;
  ui.setPlayback({ playing: false });
}

function togglePlay() {
  if (!state.buffer.length) {
    runAlgorithm(ui.algo, ui.getParams());
    return;
  }
  if (state.cursor >= state.buffer.length - 1 && state.runFinal) setCursor(0, false); // reiniciar
  state.playing = !state.playing;
  state.lastAdvance = performance.now();
  ui.setPlayback({ playing: state.playing });
}

function cycleSpeed() {
  state.speedIdx = (state.speedIdx + 1) % SPEEDS.length;
  ui.setPlayback({ speed: SPEEDS[state.speedIdx] });
}

function showFrame(idx, forward) {
  const frame = state.buffer[idx];
  if (!frame) return;
  const nbits = Math.round(Math.log2(frame.stateSize));
  viz.updateFromFrame(frame);

  if (state.algo === 'grover') {
    const series = state.buffer
      .slice(0, idx + 1)
      .map((f) => ({ x: f.iteration, y: f.data[state.target * 3 + 2] }));
    const pT = frame.data[state.target * 3 + 2];
    let maxProb = 0;
    for (let i = 0; i < frame.stateSize; i++) maxProb = Math.max(maxProb, frame.data[i * 3 + 2]);
    ui.setMetrics([
      { k: 'Iteración', v: frame.iteration },
      { k: 'P(objetivo)', v: (pT * 100).toFixed(1) + '%', accent: true },
      { k: 'Prob. máx', v: (maxProb * 100).toFixed(1) + '%' },
      { k: 'Qubits', v: nbits },
    ]);
    ui.setStateTable(topAmplitudes(frame.data, frame.stateSize, nbits));
    chart.line(series);
    updatePills(frame.iteration);
    if (forward) viz.pulse();
  } else if (state.algo === 'teleport') {
    ui.setMetrics([
      { k: 'Paso', v: `${frame.iteration} / 3` },
      { k: 'Fidelidad', v: state.fidelity != null ? state.fidelity.toFixed(4) : '—', accent: true },
      { k: 'θ', v: ((state.theta * 180) / Math.PI).toFixed(0) + '°' },
      { k: 'φ', v: ((state.phi * 180) / Math.PI).toFixed(0) + '°' },
    ]);
    ui.setStateTable(topAmplitudes(frame.data, frame.stateSize, nbits));
    updatePills(frame.iteration);
  } else {
    // Algoritmos de barras marginales (shor / dj / bv / qft).
    ui.setStatus({ qubits: nbits, dim: frame.stateSize });
    if (frame.isFinal) {
      const probs = [];
      for (let i = 0; i < frame.stateSize; i++) probs.push(frame.data[i * 3 + 2]);
      const maxV = Math.max(...probs);
      const hl = probs.map((p, i) => (p > maxV * 0.5 ? i : -1)).filter((i) => i >= 0);
      chart.bars(probs, { highlight: hl });
      viz.setPeaks(hl);
      ui.setStateTable(
        topAmplitudes(frame.data, frame.stateSize, nbits).filter((r) => r.prob > 1e-4)
      );
      setMarginalMetrics(nbits, hl);
      updatePills(2);
    } else {
      viz.setPeaks([]);
      chart.clear();
      updatePills(0);
    }
  }
}

// Métricas del panel para los algoritmos de barras marginales, en su frame final.
function setMarginalMetrics(nbits, peaks) {
  const p = state.params;
  if (state.algo === 'shor') {
    const ack = state.shorAck || {};
    ui.setMetrics([
      { k: 'N', v: p.N },
      { k: 'a', v: p.a },
      { k: 'Orden r', v: ack.order ?? '—', accent: true },
      { k: 'Factores', v: (ack.factors || []).join(' · ') || '—', accent: true, small: true },
    ]);
  } else if (state.algo === 'dj') {
    const ack = state.djAck || {};
    ui.setMetrics([
      { k: 'Qubits', v: p.nQubits },
      { k: 'Oráculo', v: p.balanced ? 'balanceada' : 'constante' },
      {
        k: 'Veredicto',
        v: ack.is_constant ? 'CONSTANTE' : 'BALANCEADA',
        accent: true,
        small: true,
      },
      { k: 'Consultas', v: 1 },
    ]);
  } else if (state.algo === 'bv') {
    const ack = state.bvAck || {};
    const rec =
      ack.recovered != null ? (ack.recovered >>> 0).toString(2).padStart(nbits, '0') : '—';
    ui.setMetrics([
      { k: 'Qubits', v: p.nQubits },
      { k: 'a oculta', v: p.hidden.toString(2).padStart(nbits, '0'), small: true },
      { k: 'Recuperada', v: rec, accent: true, small: true },
      { k: 'Consultas', v: 1 },
    ]);
  } else {
    // qft
    ui.setMetrics([
      { k: 'Qubits', v: p.nQubits },
      { k: 'Periodo m', v: p.periodExp },
      { k: 'Picos medidos', v: peaks.length, accent: true },
      { k: 'Espaciado', v: 1 << (p.nQubits - p.periodExp) },
    ]);
  }
}

function updatePills(step) {
  ui.setHud(
    state.algo,
    PILLS[state.algo].map((p, i) => ({ label: p, on: i <= step }))
  );
  ui.highlightCircuitStep(step);
}

// bucle de reproducción
(function playbackLoop() {
  requestAnimationFrame(playbackLoop);
  if (!state.playing || state.buffer.length === 0) return;
  const now = performance.now();
  if (state.cursor < state.buffer.length - 1) {
    if (now - state.lastAdvance >= frameDuration()) {
      state.lastAdvance = now;
      setCursor(state.cursor + 1, true);
    }
  } else if (state.runFinal) {
    state.playing = false;
    ui.setPlayback({ playing: false });
  }
})();

window.quantumAPI.onStateUpdate((frame) => {
  state.buffer.push(frame);
  if (frame.isFinal) state.runFinal = true;
  state.frames++;
  const now = performance.now();
  const dt = state.lastT ? (now - state.lastT).toFixed(0) + ' ms' : '—';
  state.lastT = now;
  ui.setStatus({ frames: state.buffer.length, dt });
  ui.setPlayback({ total: state.buffer.length, cursor: state.cursor });
  if (state.cursor < 0) {
    state.lastAdvance = now;
    setCursor(0, true);
  }
});

window.quantumAPI.onEngineStatus((s) => {
  ui.setEngine(!!s.connected);
  if (state.engineUp !== !!s.connected) {
    state.engineUp = !!s.connected;
    ui.log(
      s.connected
        ? 'motor conectado'
        : s.fatal
          ? 'motor caído (sin reconexión)'
          : 'motor desconectado',
      s.connected ? 'ok' : s.fatal ? 'err' : 'warn'
    );
  }
});

// Mensajes de supervisión del proceso (reintentos, reinicios).
window.quantumAPI.onEngineLog(({ msg, level }) => ui.log(msg, level || ''));

// atajos de teclado
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    stepBy(1);
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    stepBy(-1);
  } else if (e.key === 'r' || e.key === 'R') {
    setCursor(0, false);
  } else if (e.key === 'Escape' && state.presenting) {
    stopPresent();
  }
});

// ---------------- modo presentación ----------------
const PRESENT_ORDER = ['grover', 'teleport', 'shor', 'dj', 'bv', 'qft'];
const PRESENT_NAMES = {
  grover: 'Grover · búsqueda cuántica',
  teleport: 'Teletransportación · fidelidad 1.000',
  shor: 'Shor · factorización',
  dj: 'Deutsch-Jozsa · constante vs balanceada',
  bv: 'Bernstein-Vazirani · cadena oculta',
  qft: 'QFT · transformada de Fourier',
};
const PRESENT_DWELL = 7000; // ms por algoritmo

function presentDefaults(algo) {
  switch (algo) {
    case 'grover':
      return { nQubits: 3, targetState: 5, iterations: 0 };
    case 'teleport':
      return { theta: Math.PI / 3, phi: Math.PI / 4 };
    case 'shor':
      return { N: 15, a: 7 };
    case 'dj':
      return { nQubits: 3, balanced: true };
    case 'bv':
      return { nQubits: 4, hidden: 11 };
    default:
      return { nQubits: 4, periodExp: 2 }; // qft
  }
}

function togglePresent() {
  if (state.presenting) stopPresent();
  else startPresent();
}

function startPresent() {
  state.presenting = true;
  ui.setPresenting(true);
  if (document.documentElement.requestFullscreen)
    document.documentElement.requestFullscreen().catch(() => {});
  // Reflow del lienzo tras cambiar el layout.
  setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
  presentStep(0);
}

function stopPresent() {
  state.presenting = false;
  clearTimeout(state.presentTimer);
  ui.setPresenting(false);
  if (document.fullscreenElement && document.exitFullscreen)
    document.exitFullscreen().catch(() => {});
  setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
  ui.focusAlgo(state.algo); // sincroniza el rail con lo último mostrado
}

function presentStep(i) {
  if (!state.presenting) return;
  const algo = PRESENT_ORDER[i % PRESENT_ORDER.length];
  ui.setPresentName(PRESENT_NAMES[algo]);
  runAlgorithm(algo, presentDefaults(algo));
  state.presentTimer = setTimeout(() => presentStep(i + 1), PRESENT_DWELL);
}

// Si el usuario sale de pantalla completa por otros medios, cerramos el modo.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && state.presenting) stopPresent();
});

// Estado inicial.
configureFor('grover', ui.getParams());
ui.log('interfaz inicializada · Espacio: play/pausa · →/←: paso', '');
