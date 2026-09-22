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
  onSeek: (i) => { pause(); setCursor(i, i > state.cursor); },
  onSpeed: () => cycleSpeed(),
});
const chart = new Chart2D(ui.chartCanvas);

const SPEEDS = [0.5, 1, 2, 4];
const state = {
  algo: 'grover', target: 5, theta: 0, phi: 0, fidelity: null,
  buffer: [], cursor: -1, playing: false, runFinal: false,
  speedIdx: 1, lastAdvance: 0, frames: 0, lastT: 0, params: null,
};

const PILLS = {
  grover: ['prep', 'oráculo', 'difusor', 'medida'],
  teleport: ['prep |ψ⟩', 'Bell', 'medida', 'corrige'],
  shor: ['H⊗ⁿ', 'mod-exp', 'QFT⁻¹'],
};
const LEGEND = {
  grover: [{ color: '#ffb829', label: 'objetivo' }, { color: '#8052ff', label: 'estados' }],
  teleport: [{ color: '#2ee6b0', label: 'vector de Bloch' }, { color: '#8052ff', label: 'entrelazamiento' }],
  shor: [{ color: '#ffb829', label: 'picos s/r' }, { color: '#8052ff', label: 'conteo' }],
};

function frameDuration() { return 900 / SPEEDS[state.speedIdx]; }

function topAmplitudes(data, size, nbits, k = 6) {
  const idx = Array.from({ length: size }, (_, i) => i);
  idx.sort((a, b) => data[b * 3 + 2] - data[a * 3 + 2]);
  return idx.slice(0, k).map((i) => ({
    label: i.toString(2).padStart(nbits, '0'),
    re: data[i * 3].toFixed(3), im: data[i * 3 + 1].toFixed(3),
    prob: data[i * 3 + 2], hl: i === state.target,
  }));
}

function fadeStage() {
  viewport.style.opacity = '0.25';
  requestAnimationFrame(() => requestAnimationFrame(() => { viewport.style.opacity = '1'; }));
}

function configureFor(algo, params) {
  state.algo = algo; state.params = params;
  state.buffer = []; state.cursor = -1; state.playing = false; state.runFinal = false;
  state.frames = 0; state.fidelity = null; state.series = [];
  chart.clear(); ui.setStateTable([]); ui.setStatus({ frames: 0, dt: '—' });
  ui.setLegend(LEGEND[algo]); ui.showPlayback(false);
  ui.showAnalysis(algo !== 'teleport');
  fadeStage();
  if (algo === 'grover') {
    viz.setMode('bars'); viz.initBars(1 << params.nQubits); viz.highlightTarget(params.targetState); viz.reset();
    state.target = params.targetState;
    ui.setAnalysisTitle('Convergencia · P(objetivo)');
    ui.setStatus({ qubits: params.nQubits, dim: 1 << params.nQubits });
    ui.setMetrics([{ k: 'Iteración', v: '—' }, { k: 'P(objetivo)', v: '—', accent: true },
      { k: 'Prob. máx', v: '—' }, { k: 'Qubits', v: params.nQubits }]);
  } else if (algo === 'teleport') {
    viz.setMode('bloch'); viz.initBloch(3, ['q0 |ψ⟩', 'q1 ancilla', 'q2 destino']);
    state.target = -1; state.theta = params.theta; state.phi = params.phi;
    ui.setAnalysisTitle('Esferas de Bloch');
    ui.setStatus({ qubits: 3, dim: 8 });
    ui.setMetrics([{ k: 'Paso', v: '—' }, { k: 'Fidelidad', v: '—', accent: true },
      { k: 'θ', v: (params.theta * 180 / Math.PI).toFixed(0) + '°' }, { k: 'φ', v: (params.phi * 180 / Math.PI).toFixed(0) + '°' }]);
  } else {
    viz.setMode('bars'); viz.highlightTarget(-1); viz.setPeaks([]); state.target = -1;
    ui.setAnalysisTitle('Registro de conteo · s/r');
    ui.setStatus({ qubits: '—', dim: '—' });
    ui.setMetrics([{ k: 'N', v: params.N }, { k: 'a', v: params.a },
      { k: 'Orden r', v: '—', accent: true }, { k: 'Factores', v: '—', accent: true, small: true }]);
  }
  ui.setHud(algo, PILLS[algo].map((p) => ({ label: p, on: false })));
}

function resetRun() {
  chart.clear(); viz.reset(); ui.setStateTable([]);
  state.buffer = []; state.cursor = -1; state.playing = false; state.runFinal = false;
  ui.showPlayback(false);
}

async function runAlgorithm(algo, params) {
  configureFor(algo, params);
  state.playing = true; state.lastAdvance = performance.now();
  ui.showPlayback(true);
  ui.setPlayback({ playing: true, cursor: -1, total: 0, speed: SPEEDS[state.speedIdx] });
  try {
    if (algo === 'grover') {
      ui.log(`RUN_GROVER n=${params.nQubits} target=${params.targetState} iters=${params.iterations}`, 'cmd');
      await window.quantumAPI.runGrover(params);
    } else if (algo === 'teleport') {
      ui.log(`RUN_TELEPORTATION θ=${(params.theta * 180 / Math.PI).toFixed(0)}° φ=${(params.phi * 180 / Math.PI).toFixed(0)}°`, 'cmd');
      const ack = await window.quantumAPI.runTeleportation(params);
      state.fidelity = ack.fidelity;
      ui.log(`teleportación completa · fidelidad ${ack.fidelity.toFixed(4)}`, 'ok');
    } else {
      ui.log(`RUN_SHOR N=${params.N} a=${params.a}`, 'cmd');
      const ack = await window.quantumAPI.runShor(params);
      state.shorAck = ack;
      ui.log(ack.success ? `factores hallados: ${(ack.factors || []).join(' · ')} (r=${ack.order})` : 'sin factorización', ack.success ? 'ok' : 'warn');
    }
  } catch (e) { ui.log('error: ' + e.message, 'err'); console.error(e); }
}

// ---------------- reproducción ----------------
function setCursor(idx, forward) {
  idx = Math.max(0, Math.min(idx, state.buffer.length - 1));
  const advanced = idx !== state.cursor;
  state.cursor = idx;
  showFrame(idx, forward && advanced);
  ui.setPlayback({ cursor: idx });
}

function stepBy(d) { pause(); if (state.buffer.length) setCursor(state.cursor + d, d > 0); }
function pause() { state.playing = false; ui.setPlayback({ playing: false }); }

function togglePlay() {
  if (!state.buffer.length) { runAlgorithm(ui.algo, ui.getParams()); return; }
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
  const frame = state.buffer[idx]; if (!frame) return;
  const nbits = Math.round(Math.log2(frame.stateSize));
  viz.updateFromFrame(frame);

  if (state.algo === 'grover') {
    const series = state.buffer.slice(0, idx + 1).map((f) => ({ x: f.iteration, y: f.data[state.target * 3 + 2] }));
    const pT = frame.data[state.target * 3 + 2];
    let maxProb = 0; for (let i = 0; i < frame.stateSize; i++) maxProb = Math.max(maxProb, frame.data[i * 3 + 2]);
    ui.setMetrics([{ k: 'Iteración', v: frame.iteration }, { k: 'P(objetivo)', v: (pT * 100).toFixed(1) + '%', accent: true },
      { k: 'Prob. máx', v: (maxProb * 100).toFixed(1) + '%' }, { k: 'Qubits', v: nbits }]);
    ui.setStateTable(topAmplitudes(frame.data, frame.stateSize, nbits));
    chart.line(series);
    updatePills(frame.iteration);
    if (forward) viz.pulse();
  } else if (state.algo === 'teleport') {
    ui.setMetrics([{ k: 'Paso', v: `${frame.iteration} / 3` },
      { k: 'Fidelidad', v: state.fidelity != null ? state.fidelity.toFixed(4) : '—', accent: true },
      { k: 'θ', v: (state.theta * 180 / Math.PI).toFixed(0) + '°' },
      { k: 'φ', v: (state.phi * 180 / Math.PI).toFixed(0) + '°' }]);
    ui.setStateTable(topAmplitudes(frame.data, frame.stateSize, nbits));
    updatePills(frame.iteration);
  } else {
    ui.setStatus({ qubits: nbits, dim: frame.stateSize });
    if (frame.isFinal) {
      const probs = []; for (let i = 0; i < frame.stateSize; i++) probs.push(frame.data[i * 3 + 2]);
      const maxV = Math.max(...probs);
      const hl = probs.map((p, i) => (p > maxV * 0.5 ? i : -1)).filter((i) => i >= 0);
      chart.bars(probs, { highlight: hl });
      viz.setPeaks(hl);
      ui.setStateTable(topAmplitudes(frame.data, frame.stateSize, nbits).filter((r) => r.prob > 1e-4));
      const ack = state.shorAck || {};
      ui.setMetrics([{ k: 'N', v: state.params.N }, { k: 'a', v: state.params.a },
        { k: 'Orden r', v: ack.order ?? '—', accent: true },
        { k: 'Factores', v: (ack.factors || []).join(' · ') || '—', accent: true, small: true }]);
      updatePills(2);
    } else {
      viz.setPeaks([]); chart.clear(); updatePills(0);
    }
  }
}

function updatePills(step) {
  ui.setHud(state.algo, PILLS[state.algo].map((p, i) => ({ label: p, on: i <= step })));
}

// bucle de reproducción
(function playbackLoop() {
  requestAnimationFrame(playbackLoop);
  if (!state.playing || state.buffer.length === 0) return;
  const now = performance.now();
  if (state.cursor < state.buffer.length - 1) {
    if (now - state.lastAdvance >= frameDuration()) { state.lastAdvance = now; setCursor(state.cursor + 1, true); }
  } else if (state.runFinal) {
    state.playing = false; ui.setPlayback({ playing: false });
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
  if (state.cursor < 0) { state.lastAdvance = now; setCursor(0, true); }
});

window.quantumAPI.onEngineStatus((s) => {
  ui.setEngine(!!s.connected);
  if (state.engineUp !== !!s.connected) {
    state.engineUp = !!s.connected;
    ui.log(s.connected ? 'motor conectado' : 'motor desconectado', s.connected ? 'ok' : 'warn');
  }
});

// atajos de teclado
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); stepBy(1); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); stepBy(-1); }
  else if (e.key === 'r' || e.key === 'R') { setCursor(0, false); }
});

// Estado inicial.
configureFor('grover', ui.getParams());
ui.log('interfaz inicializada · Espacio: play/pausa · →/←: paso', '');
