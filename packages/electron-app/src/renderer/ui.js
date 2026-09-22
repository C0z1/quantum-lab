// ui.js — construye el shell empresarial (nav de algoritmos, panel de parámetros,
// telemetría, tabla de amplitudes, consola de eventos, status bar, HUD) y expone
// una API para que scene.js lo alimente. No toca Three.js ni el IPC.

const ICONS = {
  grover:
    '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></svg>',
  teleport:
    '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M8.5 12h7" stroke-dasharray="2 2"/></svg>',
  shor: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9m5 10V5m5 14v-7m5 7V8"/></svg>',
};

const ALGOS = {
  grover: { name: 'Grover', desc: 'Búsqueda cuántica', hudSub: 'amplificación de amplitud' },
  teleport: {
    name: 'Teletransportación',
    desc: 'Transferencia de estado',
    hudSub: 'medición diferida',
  },
  shor: { name: 'Shor', desc: 'Factorización', hudSub: 'estimación de fase (QPE)' },
};

export class UIController {
  constructor({ onRun, onReset, onTab, onPlay, onStep, onSeek, onRestart, onSpeed }) {
    this.onRun = onRun;
    this.onReset = onReset;
    this.onTab = onTab;
    this.pb = { onPlay, onStep, onSeek, onRestart, onSpeed };
    this.algo = 'grover';
    this.$ = (id) => document.getElementById(id);
    this._buildLeft();
    this._buildRight();
    this._buildStatus();
    this._buildPlayback();
    this._buildParams('grover');
    this.chartCanvas = this.$('chart');
    this.setHud('grover');
  }

  _buildPlayback() {
    const el = this.$('playback');
    el.innerHTML = `
      <button class="pb-btn" id="pb_restart" title="Reiniciar (R)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 5v14M18 5L8 12l10 7z"/></svg>
      </button>
      <button class="pb-btn play" id="pb_play" title="Reproducir / Pausar (Espacio)">
        <svg id="pb_play_icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button class="pb-btn" id="pb_step" title="Paso adelante (→)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 5l10 7-10 7zM18 5v14"/></svg>
      </button>
      <div class="pb-track" id="pb_track"></div>
      <span class="pb-count" id="pb_count">0 / 0</span>
      <button class="pb-speed" id="pb_speed" title="Velocidad">1×</button>`;
    this.$('pb_restart').addEventListener('click', () => this.pb.onRestart());
    this.$('pb_play').addEventListener('click', () => this.pb.onPlay());
    this.$('pb_step').addEventListener('click', () => this.pb.onStep());
    this.$('pb_speed').addEventListener('click', () => this.pb.onSpeed());
    this.$('pb_track').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const total = this._pbTotal || 1;
      const idx = Math.min(
        total - 1,
        Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * total))
      );
      this.pb.onSeek(idx);
    });
    this.showPlayback(false);
  }

  showPlayback(show) {
    this.$('playback').style.display = show ? 'flex' : 'none';
  }

  setPlayback({ playing, cursor, total, speed }) {
    if (total !== undefined) {
      this._pbTotal = total;
      const track = this.$('pb_track');
      track.innerHTML = Array.from(
        { length: total },
        (_, i) => `<i class="seg ${i <= cursor ? 'on' : ''} ${i === cursor ? 'cur' : ''}"></i>`
      ).join('');
    } else if (cursor !== undefined) {
      this.$('pb_track')
        .querySelectorAll('.seg')
        .forEach((s, i) => {
          s.classList.toggle('on', i <= cursor);
          s.classList.toggle('cur', i === cursor);
        });
    }
    if (cursor !== undefined && this._pbTotal != null)
      this.$('pb_count').textContent = `${Math.max(0, cursor + 1)} / ${this._pbTotal}`;
    if (playing !== undefined) {
      const ic = this.$('pb_play_icon');
      ic.innerHTML = playing
        ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
        : '<path d="M8 5v14l11-7z"/>';
    }
    if (speed !== undefined) this.$('pb_speed').textContent = speed + '×';
  }

  // ---------------- LEFT RAIL ----------------
  _buildLeft() {
    const nav = Object.entries(ALGOS)
      .map(
        ([k, a]) => `
      <button class="item ${k === 'grover' ? 'active' : ''}" data-algo="${k}">
        ${ICONS[k]}
        <span class="txt"><span class="t">${a.name}</span><span class="d">${a.desc}</span></span>
      </button>`
      )
      .join('');

    this.$('railLeft').innerHTML = `
      <div class="card">
        <div class="card-h">Algoritmo</div>
        <div class="card-b"><div class="nav">${nav}</div></div>
      </div>
      <div class="card">
        <div class="card-h">Parámetros</div>
        <div class="card-b">
          <div id="params"></div>
          <div class="actions" style="margin-top:16px">
            <button class="btn primary" id="run">
              <svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Ejecutar
            </button>
            <button class="btn" id="reset">
              <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 10a8 8 0 0 0-14-3M4 14a8 8 0 0 0 14 3"/></svg> Reset
            </button>
          </div>
        </div>
      </div>`;

    this.$('railLeft')
      .querySelectorAll('.nav .item')
      .forEach((b) => b.addEventListener('click', () => this._selectTab(b.dataset.algo)));
    this.$('run').addEventListener('click', () => this.onRun(this.algo, this.getParams()));
    this.$('reset').addEventListener('click', () => this.onReset());
  }

  _buildParams(algo) {
    const P = this.$('params');
    if (algo === 'grover') {
      P.innerHTML = `
        <div class="field"><label>Qubits <b id="g_nqV">3</b></label><input id="g_nq" type="range" min="1" max="8" value="3"></div>
        <div class="field"><label>Estado objetivo <b id="g_tgtV">5</b></label><input id="g_tgt" type="range" min="0" max="7" value="5"></div>
        <div class="field"><label>Iteraciones (0=óptimo) <b id="g_itV">2</b></label><input id="g_it" type="range" min="0" max="30" value="2"></div>`;
      const sync = () => {
        const n = +this.$('g_nq').value,
          maxS = (1 << n) - 1;
        this.$('g_tgt').max = String(maxS);
        if (+this.$('g_tgt').value > maxS) this.$('g_tgt').value = String(maxS);
        this.$('g_nqV').textContent = n;
        this.$('g_tgtV').textContent = this.$('g_tgt').value;
        this.$('g_itV').textContent = this.$('g_it').value;
      };
      ['g_nq', 'g_tgt', 'g_it'].forEach((id) => this.$(id).addEventListener('input', sync));
      sync();
    } else if (algo === 'teleport') {
      P.innerHTML = `
        <p class="hintbox">Prepara |ψ⟩ en el qubit fuente y lo transfiere al destino mediante entrelazamiento. Fidelidad esperada: 1.000.</p>
        <div class="field"><label>θ colatitud <b id="t_thV">60°</b></label><input id="t_th" type="range" min="0" max="180" value="60"></div>
        <div class="field"><label>φ azimut <b id="t_phV">45°</b></label><input id="t_ph" type="range" min="0" max="360" value="45"></div>`;
      const sync = () => {
        this.$('t_thV').textContent = this.$('t_th').value + '°';
        this.$('t_phV').textContent = this.$('t_ph').value + '°';
      };
      ['t_th', 't_ph'].forEach((id) => this.$(id).addEventListener('input', sync));
      sync();
    } else {
      P.innerHTML = `
        <p class="hintbox">Factorización por order-finding cuántico (QPE + QFT⁻¹).</p>
        <div class="field"><label>N a factorizar</label>
          <select id="s_N">
            <option value="15">15 = 3 · 5</option>
            <option value="21">21 = 3 · 7</option>
            <option value="33">33 = 3 · 11</option>
            <option value="35">35 = 5 · 7</option>
          </select></div>
        <div class="field"><label>Base a <b id="s_aV">7</b></label><input id="s_a" type="range" min="2" max="14" value="7"></div>`;
      const sync = () => {
        const N = +this.$('s_N').value;
        this.$('s_a').max = String(N - 1);
        if (+this.$('s_a').value >= N) this.$('s_a').value = String(N - 1);
        this.$('s_aV').textContent = this.$('s_a').value;
      };
      ['s_N', 's_a'].forEach((id) => this.$(id).addEventListener('input', sync));
      sync();
    }
  }

  // ---------------- RIGHT RAIL ----------------
  _buildRight() {
    this.$('railRight').innerHTML = `
      <div class="card">
        <div class="card-h">Telemetría</div>
        <div class="card-b"><div class="metrics" id="metrics"></div></div>
      </div>
      <div class="card" id="analysisCard">
        <div class="card-h"><span id="analysisTitle">Análisis</span></div>
        <div class="card-b"><div class="chartbox"><canvas id="chart"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-h">Vector de estado</div>
        <div class="card-b" style="padding:8px 12px"><table class="table" id="stateTable"><tbody></tbody></table></div>
      </div>
      <div class="card">
        <div class="card-h">Consola</div>
        <div class="console" id="console"></div>
      </div>`;
  }

  _buildStatus() {
    this.$('statusbar').innerHTML = `
      <span class="s"><b>cmd</b> ipc:///tmp/quantum-lab-cmd</span>
      <span class="s"><b>stream</b> ipc:///tmp/quantum-lab-stream</span>
      <span class="spacer"></span>
      <span class="s"><b>qubits</b> <span id="sb_q">—</span></span>
      <span class="s"><b>dim</b> <span id="sb_dim">—</span></span>
      <span class="s"><b>frames</b> <span id="sb_frames">0</span></span>
      <span class="s"><b>Δt</b> <span id="sb_dt">—</span></span>`;
  }

  // ---------------- interacción ----------------
  _selectTab(algo) {
    if (algo === this.algo) return;
    this.algo = algo;
    this.$('railLeft')
      .querySelectorAll('.nav .item')
      .forEach((b) => b.classList.toggle('active', b.dataset.algo === algo));
    this._buildParams(algo);
    this.setHud(algo);
    this.onTab(algo, this.getParams());
  }

  getParams() {
    if (this.algo === 'grover')
      return {
        nQubits: +this.$('g_nq').value,
        targetState: +this.$('g_tgt').value,
        iterations: +this.$('g_it').value,
      };
    if (this.algo === 'teleport')
      return {
        theta: (+this.$('t_th').value * Math.PI) / 180,
        phi: (+this.$('t_ph').value * Math.PI) / 180,
      };
    return { N: +this.$('s_N').value, a: +this.$('s_a').value };
  }

  // ---------------- API para scene.js ----------------
  setEngine(connected, latency) {
    const led = this.$('engineLed'),
      txt = this.$('engineText');
    led.className = 'led ' + (connected ? 'on' : 'err');
    txt.textContent = connected
      ? latency != null
        ? `motor online · ${latency} ms`
        : 'motor online'
      : 'sin conexión';
  }

  setMetrics(tiles) {
    this.$('metrics').innerHTML = tiles
      .map(
        (t) =>
          `<div class="metric"><div class="k">${t.k}</div><div class="v ${t.accent ? 'accent' : ''} ${t.small ? 'small' : ''}">${t.v}</div></div>`
      )
      .join('');
  }

  setStateTable(rows) {
    const body = this.$('stateTable').querySelector('tbody');
    if (!rows || !rows.length) {
      body.innerHTML = '';
      return;
    }
    const head = `<tr><th>estado</th><th>Re</th><th>Im</th><th>P</th><th>&nbsp;</th></tr>`;
    body.innerHTML =
      head +
      rows
        .map(
          (r) => `
      <tr class="${r.hl ? 'hl' : ''}">
        <td>|${r.label}⟩</td><td>${r.re}</td><td>${r.im}</td><td>${(r.prob * 100).toFixed(1)}%</td>
        <td><div class="pbar"><i style="width:${Math.max(1, r.prob * 100).toFixed(1)}%"></i></div></td>
      </tr>`
        )
        .join('');
  }

  setAnalysisTitle(t) {
    this.$('analysisTitle').textContent = t;
  }
  showAnalysis(show) {
    this.$('analysisCard').style.display = show ? '' : 'none';
  }

  setStatus({ qubits, dim, frames, dt } = {}) {
    if (qubits !== undefined) this.$('sb_q').textContent = qubits;
    if (dim !== undefined) this.$('sb_dim').textContent = dim;
    if (frames !== undefined) this.$('sb_frames').textContent = frames;
    if (dt !== undefined) this.$('sb_dt').textContent = dt;
  }

  setHud(algo, pills) {
    const a = ALGOS[algo];
    this.$('hudTitle').textContent = a.name;
    this.$('hudSub').textContent = a.hudSub;
    if (pills)
      this.$('hudPills').innerHTML = pills
        .map((p) => `<span class="pill ${p.on ? 'on' : ''}">${p.label}</span>`)
        .join('');
    else this.$('hudPills').innerHTML = '';
  }

  setLegend(items) {
    this.$('legend').innerHTML = (items || [])
      .map((i) => `<span><i style="background:${i.color}"></i>${i.label}</span>`)
      .join('');
  }

  log(msg, type = '') {
    const c = this.$('console');
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const div = document.createElement('div');
    div.className = 'line ' + type;
    div.innerHTML = `<span class="ts">${ts}</span><span class="msg">${msg}</span>`;
    c.appendChild(div);
    while (c.children.length > 100) c.removeChild(c.firstChild);
    c.scrollTop = c.scrollHeight;
  }
}
