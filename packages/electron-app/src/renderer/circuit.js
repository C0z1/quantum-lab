// circuit.js — esquemas de circuito pedagógicos por algoritmo, renderizados en
// SVG. Cada columna lleva un `step` que se alinea con las "pills" de la HUD, de
// modo que la reproducción resalta la columna correspondiente. No pretende ser
// un renderizador exacto para n arbitrario: muestra un esquema representativo
// (registros de entrada acotados + ancilla/trabajo) con tooltips en cada puerta.

const CAP = 4; // máximo de wires de entrada dibujados (los demás se resumen)

// Descripciones para tooltips pedagógicos (data-tip).
export const GATE_TIPS = {
  H: 'Hadamard — crea superposición: |0⟩ → (|0⟩+|1⟩)/√2.',
  X: 'Puerta X (NOT) — invierte el qubit: |0⟩ ↔ |1⟩.',
  Z: 'Puerta Z — fase condicional: |1⟩ → −|1⟩.',
  minus: 'Prepara la ancilla en |−⟩ = (|0⟩−|1⟩)/√2 para el phase kickback.',
  cnot: 'CNOT — invierte el objetivo si el control es |1⟩; crea entrelazamiento.',
  oracle: 'Oráculo Uf — codifica la función; con la ancilla en |−⟩ marca la fase (kickback).',
  diffuser: 'Difusor 2|ψ⟩⟨ψ|−I — refleja sobre la media y amplifica la amplitud marcada.',
  psi: 'Prepara el estado desconocido |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩.',
  bell: 'Par de Bell — H + CNOT entrelazan los dos qubits.',
  modexp: 'Exponenciación modular controlada: |y⟩ → |a^x·y mod N⟩. Corazón de Shor.',
  qft: 'Transformada de Fourier Cuántica — revela periodicidad como picos de frecuencia.',
  iqft: 'QFT inversa — traduce la fase acumulada en el registro de conteo a bits.',
  measure: 'Medición — colapsa el registro a un valor clásico con probabilidad |α|².',
};

// ---- Modelos de circuito -------------------------------------------------

function grover(params) {
  const n = Math.min(params.nQubits || 3, CAP);
  const wires = Array.from({ length: n }, (_, i) => ({ label: `q${i}` }));
  const all = wires.map((_, i) => i);
  return {
    wires,
    note: params.nQubits > CAP ? `n=${params.nQubits} (se muestran ${CAP})` : `n=${params.nQubits}`,
    cols: [
      { step: 0, ops: all.map((w) => ({ t: 'box', wire: w, text: 'H', tip: 'H' })) },
      { step: 1, ops: [{ t: 'box', wire: 0, span: n, text: 'Uf', tip: 'oracle' }] },
      { step: 2, ops: [{ t: 'box', wire: 0, span: n, text: 'Difusor', tip: 'diffuser' }] },
      { step: 2, repeat: '×k', ops: [] },
      { step: 3, ops: all.map((w) => ({ t: 'measure', wire: w })) },
    ],
  };
}

function teleport() {
  const wires = [{ label: 'q0 |ψ⟩' }, { label: 'q1' }, { label: 'q2' }];
  return {
    wires,
    note: 'fidelidad 1.000',
    cols: [
      { step: 0, ops: [{ t: 'box', wire: 0, text: 'ψ', tip: 'psi' }] },
      { step: 1, ops: [{ t: 'box', wire: 1, text: 'H', tip: 'H' }] },
      { step: 1, ops: [{ t: 'cnot', ctrl: 1, tgt: 2, tip: 'bell' }] },
      { step: 1, ops: [{ t: 'cnot', ctrl: 0, tgt: 1, tip: 'cnot' }] },
      { step: 1, ops: [{ t: 'box', wire: 0, text: 'H', tip: 'H' }] },
      {
        step: 2,
        ops: [
          { t: 'measure', wire: 0 },
          { t: 'measure', wire: 1 },
        ],
      },
      {
        step: 3,
        ops: [
          { t: 'box', wire: 2, text: 'X', tip: 'X' },
          { t: 'box', wire: 2, text: 'Z', tip: 'Z' },
        ],
      },
    ],
  };
}

function shor() {
  // 2 wires de conteo + 1 "registro de trabajo" resumido.
  const wires = [{ label: 'c0' }, { label: 'c1' }, { label: 'work /' }];
  return {
    wires,
    note: 'QPE de order-finding',
    cols: [
      {
        step: 0,
        ops: [
          { t: 'box', wire: 0, text: 'H', tip: 'H' },
          { t: 'box', wire: 1, text: 'H', tip: 'H' },
        ],
      },
      { step: 1, ops: [{ t: 'box', wire: 2, text: 'aˣ mod N', tip: 'modexp' }] },
      { step: 1, ops: [{ t: 'cnot', ctrl: 0, tgt: 2, tip: 'modexp' }] },
      { step: 1, ops: [{ t: 'cnot', ctrl: 1, tgt: 2, tip: 'modexp' }] },
      { step: 2, ops: [{ t: 'box', wire: 0, span: 2, text: 'QFT†', tip: 'iqft' }] },
      {
        step: 2,
        ops: [
          { t: 'measure', wire: 0 },
          { t: 'measure', wire: 1 },
        ],
      },
    ],
  };
}

function djbv(params, oracleText, oracleTip) {
  const n = Math.min(params.nQubits || 3, CAP);
  const wires = Array.from({ length: n }, (_, i) => ({ label: `q${i}` }));
  wires.push({ label: 'anc' });
  const anc = n;
  const inputs = Array.from({ length: n }, (_, i) => i);
  return {
    wires,
    note: params.nQubits > CAP ? `n=${params.nQubits} (se muestran ${CAP})` : `n=${params.nQubits}`,
    cols: [
      {
        step: 0,
        ops: [
          { t: 'box', wire: anc, text: 'X', tip: 'X' },
          { t: 'box', wire: anc, text: 'H', tip: 'minus' },
        ],
      },
      { step: 0, ops: inputs.map((w) => ({ t: 'box', wire: w, text: 'H', tip: 'H' })) },
      { step: 1, ops: [{ t: 'box', wire: 0, span: n + 1, text: oracleText, tip: oracleTip }] },
      { step: 2, ops: inputs.map((w) => ({ t: 'box', wire: w, text: 'H', tip: 'H' })) },
      { step: 2, ops: inputs.map((w) => ({ t: 'measure', wire: w })) },
    ],
  };
}

function qft(params) {
  const n = Math.min(params.nQubits || 4, CAP + 1);
  const m = Math.max(0, Math.min(params.periodExp ?? 2, n));
  const wires = Array.from({ length: n }, (_, i) => ({ label: `q${i}` }));
  const comb = [];
  for (let q = m; q < n; q++) comb.push({ t: 'box', wire: q, text: 'H', tip: 'H' });
  return {
    wires,
    note: `peine 2^${m} → picos`,
    cols: [
      { step: 0, ops: comb.length ? comb : [{ t: 'box', wire: 0, text: '·', tip: 'H' }] },
      { step: 1, ops: [{ t: 'box', wire: 0, span: n, text: 'QFT', tip: 'qft' }] },
      { step: 2, ops: wires.map((_, w) => ({ t: 'measure', wire: w })) },
    ],
  };
}

export function buildCircuit(algo, params) {
  switch (algo) {
    case 'grover':
      return grover(params);
    case 'teleport':
      return teleport();
    case 'shor':
      return shor();
    case 'dj':
      return djbv(params, 'Uf', 'oracle');
    case 'bv':
      return djbv(params, 'a·x', 'oracle');
    case 'qft':
      return qft(params);
    default:
      return { wires: [], cols: [], note: '' };
  }
}

// ---- Render SVG ----------------------------------------------------------

const COLW = 62; // ancho por columna
const ROWH = 34; // alto por wire
const PADX = 58; // margen izq. para etiquetas
const PADY = 18;

export function renderCircuitSVG(model) {
  const { wires, cols } = model;
  if (!wires.length) return '';
  const W = PADX + cols.length * COLW + 20;
  const H = PADY * 2 + wires.length * ROWH;
  const yOf = (w) => PADY + w * ROWH + ROWH / 2;
  const xOf = (c) => PADX + c * COLW + COLW / 2;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="circ-svg">`;

  // Wires + etiquetas.
  wires.forEach((wire, i) => {
    const y = yOf(i);
    s += `<text x="8" y="${y + 4}" class="circ-wlabel">${wire.label}</text>`;
    s += `<line x1="${PADX - 8}" y1="${y}" x2="${W - 12}" y2="${y}" class="circ-wire"/>`;
  });

  // Columnas (fondo resaltable) + operaciones.
  cols.forEach((col, ci) => {
    const cx = xOf(ci);
    const x0 = PADX + ci * COLW + 4;
    s += `<rect x="${x0}" y="${PADY - 6}" width="${COLW - 8}" height="${H - 2 * PADY + 12}" rx="8" class="circ-col" data-step="${col.step}"></rect>`;
    if (col.repeat) {
      s += `<text x="${cx}" y="${PADY + 2}" class="circ-repeat">${col.repeat}</text>`;
    }
    (col.ops || []).forEach((op) => {
      if (op.t === 'box') {
        const y0 = yOf(op.wire);
        const span = op.span || 1;
        const h = span > 1 ? (span - 1) * ROWH + 24 : 24;
        const yTop = y0 - 12;
        const tip = op.tip ? ` data-tip="${op.tip}"` : '';
        s += `<g class="circ-gate"${tip}><rect x="${cx - 20}" y="${yTop}" width="40" height="${h}" rx="7" class="circ-box"/><text x="${cx}" y="${yTop + h / 2 + 4}" class="circ-gtext">${op.text}</text></g>`;
      } else if (op.t === 'cnot') {
        const yc = yOf(op.ctrl);
        const yt = yOf(op.tgt);
        const tip = op.tip ? ` data-tip="${op.tip}"` : '';
        s += `<g class="circ-gate"${tip}><line x1="${cx}" y1="${yc}" x2="${cx}" y2="${yt}" class="circ-link"/><circle cx="${cx}" cy="${yc}" r="4.5" class="circ-ctrl"/><circle cx="${cx}" cy="${yt}" r="9" class="circ-xor"/><line x1="${cx - 9}" y1="${yt}" x2="${cx + 9}" y2="${yt}" class="circ-plus"/><line x1="${cx}" y1="${yt - 9}" x2="${cx}" y2="${yt + 9}" class="circ-plus"/></g>`;
      } else if (op.t === 'measure') {
        const y0 = yOf(op.wire);
        s += `<g class="circ-gate" data-tip="measure"><rect x="${cx - 13}" y="${y0 - 11}" width="26" height="22" rx="5" class="circ-mbox"/><path d="M ${cx - 7} ${y0 + 4} A 7 7 0 0 1 ${cx + 7} ${y0 + 4}" class="circ-marc"/><line x1="${cx}" y1="${y0 + 4}" x2="${cx + 5}" y2="${y0 - 5}" class="circ-mneedle"/></g>`;
      }
    });
  });

  s += '</svg>';
  return s;
}
