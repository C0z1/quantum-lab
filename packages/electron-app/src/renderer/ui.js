// ui.js — construye el shell empresarial (nav de algoritmos, panel de parámetros,
// telemetría, tabla de amplitudes, consola de eventos, status bar, HUD) y expone
// una API para que scene.js lo alimente. No toca Three.js ni el IPC.
import { buildCircuit, renderCircuitSVG, GATE_TIPS } from './circuit.js';

// Glosario para tooltips pedagógicos (pills de la HUD y términos).
const GLOSSARY = {
  ...GATE_TIPS,
  prep: 'Preparación: se lleva el registro a la superposición inicial con Hadamard.',
  oráculo: 'Oráculo: marca (con fase) los estados que cumplen la condición buscada.',
  difusor: 'Difusor: refleja las amplitudes sobre su media, amplificando lo marcado.',
  medida: 'Medida: colapsa el estado a un resultado clásico con probabilidad |α|².',
  'H⊗ⁿ': 'H sobre cada qubit: superposición uniforme de los 2ⁿ estados.',
  'mod-exp': 'Exponenciación modular controlada: codifica el orden r en la fase.',
  'QFT⁻¹': 'QFT inversa: convierte la fase periódica en picos del registro de conteo.',
  QFT: 'Transformada de Fourier Cuántica: revela periodicidad como frecuencias.',
  peine: 'Peine: superposición uniforme espaciada 2^m en posición.',
  picos: 'Picos: tras la QFT, la energía se concentra en frecuencias equiespaciadas.',
  Bell: 'Par de Bell: dos qubits máximamente entrelazados vía H + CNOT.',
  corrige: 'Correcciones X/Z condicionadas a la medida restauran |ψ⟩ en el destino.',
  'prep |ψ⟩': 'Se prepara el estado desconocido |ψ⟩ que será teletransportado.',
};

const ICONS = {
  grover:
    '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></svg>',
  teleport:
    '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M8.5 12h7" stroke-dasharray="2 2"/></svg>',
  shor: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9m5 10V5m5 14v-7m5 7V8"/></svg>',
  dj: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h6l1.5-5 3 14 1.5-7h4"/></svg>',
  bv: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h4v10H4zM10 7h4v10h-4zM16 7h4v10h-4z" stroke-dasharray="2 2"/><path d="M6 4v3M18 4v3"/></svg>',
  qft: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6"/></svg>',
};

const ALGOS = {
  grover: { name: 'Grover', desc: 'Búsqueda cuántica', hudSub: 'amplificación de amplitud' },
  teleport: {
    name: 'Teletransportación',
    desc: 'Transferencia de estado',
    hudSub: 'medición diferida',
  },
  shor: { name: 'Shor', desc: 'Factorización', hudSub: 'estimación de fase (QPE)' },
  dj: {
    name: 'Deutsch-Jozsa',
    desc: 'Constante vs balanceada',
    hudSub: 'phase kickback · 1 consulta',
  },
  bv: { name: 'Bernstein-Vazirani', desc: 'Cadena oculta', hudSub: 'recupera a en 1 consulta' },
  qft: { name: 'QFT', desc: 'Transformada de Fourier', hudSub: 'peine → picos espaciados' },
};

// Guion pedagógico en lenguaje llano: para cada algoritmo, un "gancho" que
// impacta a alguien sin base técnica, una intro y los pasos con qué pasa y
// qué mirar en la animación. scene.js decide qué paso está activo.
const NARRATION = {
  grover: {
    hook: 'Encuentra 1 opción entre muchas en unos pocos intentos — donde un buscador normal tendría que probarlas casi todas.',
    intro:
      'Es como buscar un nombre en una guía desordenada. En vez de mirar página por página, Grover pone TODAS las opciones a la vez y, con unos “empujones”, hace que la correcta destaque sola.',
    steps: [
      {
        t: 'Superposición',
        what: 'Todas las opciones existen al mismo tiempo, con la misma probabilidad. Aún no se sabe cuál es la buena.',
        watch: 'Todas las barras están igual de altas: nadie destaca todavía.',
      },
      {
        t: 'Marcar y amplificar',
        what: 'El oráculo señala en secreto la opción correcta y el difusor la agranda un poco más que el resto. Se repite para acentuar la diferencia.',
        watch: 'Una barra sube mientras las demás bajan: la respuesta va emergiendo.',
      },
      {
        t: 'Medida',
        what: 'Al medir, casi siempre sale la opción correcta. Eso es la “amplificación de amplitud”.',
        watch: 'La barra dorada domina la escena: esa es la solución.',
      },
    ],
  },
  teleport: {
    hook: 'Envía el estado exacto de una partícula a otra distante — sin mover materia y destruyendo el original.',
    intro:
      'Teletransportar aquí no es mover cosas, sino copiar la “orientación” exacta de una partícula a otra lejana usando entrelazamiento y dos bits de información normal.',
    steps: [
      {
        t: 'Preparar |ψ⟩',
        what: 'Se prepara el estado misterioso que queremos enviar: una flecha con una dirección concreta.',
        watch: 'Fíjate en hacia dónde apunta la PRIMERA esfera: eso es lo que viajará.',
      },
      {
        t: 'Par entrelazado',
        what: 'Creamos dos partículas entrelazadas: actúan como una sola aunque estén separadas.',
        watch: 'Las esferas 2 y 3 quedan ligadas entre sí.',
      },
      {
        t: 'Medida',
        what: 'Medimos y eso “dispara” la teletransportación: el estado original se colapsa y desaparece.',
        watch: 'La flecha original se pierde en la primera esfera.',
      },
      {
        t: 'Corrección',
        what: 'Con dos bits clásicos, el destino aplica un ajuste y reconstruye |ψ⟩ idéntico. Fidelidad 1.000.',
        watch: 'La ÚLTIMA esfera termina apuntando igual que apuntaba la primera. ✨',
      },
    ],
  },
  shor: {
    hook: 'Rompe el candado matemático de casi toda la seguridad de internet: factoriza números enormes rápido.',
    intro:
      'La seguridad online confía en que factorizar números gigantes es lentísimo. Shor busca un “ritmo” oculto (un periodo) con ondas cuánticas y de ahí saca los factores.',
    steps: [
      {
        t: 'Superponer',
        what: 'Ponemos el registro en superposición para probar muchísimos exponentes a la vez.',
        watch: 'Registro llano: todas las posibilidades activas por igual.',
      },
      {
        t: 'Exponenciación modular',
        what: 'Calculamos a^x mod N. Esto esconde un patrón que se repite con un periodo r.',
        watch: 'Empieza a aparecer una estructura que se repite.',
      },
      {
        t: 'Revelar el periodo',
        what: 'La transformada de Fourier convierte ese ritmo oculto en picos nítidos; de r salen los factores.',
        watch: 'Picos equiespaciados: su separación da el periodo r → los factores. ✨',
      },
    ],
  },
  dj: {
    hook: '¿La moneda es normal o está trucada? Lo resuelve con UNA sola pregunta, no muchas tiradas.',
    intro:
      'Una función puede ser “constante” (siempre igual) o “balanceada” (mitad y mitad). Lo clásico necesita muchas pruebas; Deutsch-Jozsa lo decide con una sola consulta.',
    steps: [
      {
        t: 'Preparar',
        what: 'Todas las entradas se ponen en superposición, con un truco de fase que las hace sensibles a la función.',
        watch: 'Todo entra en superposición a la vez.',
      },
      {
        t: 'Una sola consulta',
        what: 'La función responde una única vez, pero afecta a todas las entradas por “phase kickback”.',
        watch: 'La firma de la función queda impresa en las fases.',
      },
      {
        t: 'Leer el veredicto',
        what: 'Al deshacer la superposición, el resultado dice constante o balanceada de un golpe.',
        watch: 'Todo en |0…0⟩ = constante; cualquier otra cosa = balanceada. ✨',
      },
    ],
  },
  bv: {
    hook: 'Adivina una contraseña binaria entera con UNA pregunta, no bit por bit.',
    intro:
      'Hay una cadena secreta de bits. Un método normal la saca preguntando bit a bit (n preguntas). Bernstein-Vazirani la extrae completa en una sola consulta.',
    steps: [
      {
        t: 'Preparar',
        what: 'Superponemos todas las entradas posibles a la vez.',
        watch: 'Todas las entradas activas por igual.',
      },
      {
        t: 'Una sola consulta',
        what: 'El oráculo mezcla la cadena secreta “a” dentro de las fases del estado.',
        watch: 'La cadena secreta queda codificada, invisible, en las fases.',
      },
      {
        t: 'Leer la cadena',
        what: 'Al medir, sale directamente la cadena secreta completa.',
        watch: 'El pico marca exactamente la cadena oculta. ✨',
      },
    ],
  },
  qft: {
    hook: 'La “lente” que convierte un ritmo repetido en frecuencias visibles: el corazón de Shor.',
    intro:
      'La Transformada de Fourier Cuántica reorganiza la información: toma un patrón que se repite y lo muestra como frecuencias limpias.',
    steps: [
      {
        t: 'Patrón regular',
        what: 'Partimos de un “peine”: un patrón uniforme que se repite cada 2^m posiciones.',
        watch: 'Dientes uniformes y bien espaciados.',
      },
      {
        t: 'Transformar',
        what: 'Aplicamos la QFT: reorganiza toda la información del patrón en frecuencias.',
        watch: 'El patrón se reordena por completo.',
      },
      {
        t: 'Frecuencias',
        what: 'El resultado son pocos picos limpios cuya separación revela la periodicidad.',
        watch: 'Pocos picos equiespaciados = la frecuencia oculta. ✨',
      },
    ],
  },
};

export class UIController {
  constructor(cb) {
    this.onRun = cb.onRun;
    this.onReset = cb.onReset;
    this.onTab = cb.onTab;
    this.pb = {
      onPlay: cb.onPlay,
      onStep: cb.onStep,
      onSeek: cb.onSeek,
      onRestart: cb.onRestart,
      onSpeed: cb.onSpeed,
    };
    // Ajustes y presentación (opcionales).
    this.settings = {
      onBloom: cb.onBloom || (() => {}),
      onDefaultSpeed: cb.onDefaultSpeed || (() => {}),
      onParticles: cb.onParticles || (() => {}),
      onAutoRotate: cb.onAutoRotate || (() => {}),
      onLite: cb.onLite || (() => {}),
      onTeach: cb.onTeach || (() => {}),
      onCapture: cb.onCapture || (() => {}),
      onExport: cb.onExport || (() => {}),
    };
    this.onPresentToggle = cb.onPresentToggle || (() => {});
    this.onView = cb.onView || (() => {});
    this.algo = 'grover';
    this.view = '3d';
    this.$ = (id) => document.getElementById(id);
    this._buildLeft();
    this._buildInspector();
    this._buildStatus();
    this._buildPlayback();
    this._buildParams('grover');
    this._buildSegmented();
    this._buildConsoleDrawer();
    this._buildTooltips();
    this._buildSettings();
    this.chartCanvas = this.$('chart');
    this.setHud('grover');
    this.setGuide('grover');
  }

  // ---------------- CONTROL SEGMENTADO (Vista 3D | Circuito) ----------------
  _buildSegmented() {
    const seg = this.$('segmented');
    if (!seg) return;
    seg
      .querySelectorAll('.seg')
      .forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.view)));
  }

  // Cambia entre la vista 3D y el circuito (mutuamente excluyentes). La lógica
  // de mostrar/ocultar y redimensionar el lienzo la ejecuta scene.js vía onView.
  setView(view) {
    if (view === this.view) return;
    this.view = view;
    const seg = this.$('segmented');
    if (seg)
      seg
        .querySelectorAll('.seg')
        .forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    const area = this.$('canvasArea');
    if (area) area.classList.toggle('circuit-active', view === 'circuit');
    const cv = this.$('circuitView');
    if (cv) cv.hidden = view !== 'circuit';
    const vp = this.$('viewport');
    if (vp) vp.style.visibility = view === 'circuit' ? 'hidden' : 'visible';
    this.onView(view);
  }

  // ---------------- CONSOLA (cajón inferior) ----------------
  _buildConsoleDrawer() {
    this._consoleOpen = false;
    const btn = this.$('btnConsole');
    const close = this.$('consoleClose');
    if (btn) btn.addEventListener('click', () => this.toggleConsole());
    if (close) close.addEventListener('click', () => this.setConsole(false));
    document.addEventListener('keydown', (e) => {
      if (
        e.key === 'Escape' &&
        this._consoleOpen &&
        !document.body.classList.contains('presenting')
      ) {
        this.setConsole(false);
      }
    });
  }

  setConsole(open) {
    this._consoleOpen = open;
    const shell = document.querySelector('.shell');
    if (shell) shell.classList.toggle('console-open', open);
    const btn = this.$('btnConsole');
    if (btn) btn.classList.toggle('active', open);
    if (open) {
      const c = this.$('console');
      if (c) c.scrollTop = c.scrollHeight;
    }
  }

  toggleConsole() {
    this.setConsole(!this._consoleOpen);
  }

  setCircuit(algo, params) {
    const host = this.$('circuit');
    if (!host) return;
    const model = buildCircuit(algo, params);
    host.innerHTML = renderCircuitSVG(model);
    const note = this.$('circuitNote');
    if (note) note.textContent = model.note || '';
    this._circuitStep = -1;
  }

  highlightCircuitStep(step) {
    const host = this.$('circuit');
    if (!host || step === this._circuitStep) return;
    this._circuitStep = step;
    host.querySelectorAll('.circ-col').forEach((c) => {
      c.classList.toggle('on', Number(c.dataset.step) === step);
    });
  }

  // ---------------- TOOLTIPS PEDAGÓGICOS ----------------
  _buildTooltips() {
    const tip = this.$('tooltip');
    if (!tip) return;
    const show = (key, x, y) => {
      const text = GLOSSARY[key];
      if (!text) return;
      tip.textContent = text;
      tip.hidden = false;
      const pad = 14;
      const w = tip.offsetWidth,
        h = tip.offsetHeight;
      let left = x + pad,
        top = y + pad;
      if (left + w > window.innerWidth - 8) left = x - w - pad;
      if (top + h > window.innerHeight - 8) top = y - h - pad;
      tip.style.left = Math.max(8, left) + 'px';
      tip.style.top = Math.max(8, top) + 'px';
    };
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip]');
      if (el) show(el.dataset.tip, e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => {
      if (tip.hidden) return;
      const el = e.target.closest('[data-tip]');
      if (!el) {
        tip.hidden = true;
        return;
      }
      show(el.dataset.tip, e.clientX, e.clientY);
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest('[data-tip]')) tip.hidden = true;
    });
  }

  // ---------------- PANEL DE AJUSTES ----------------
  _buildSettings() {
    const pop = this.$('settings');
    const btn = this.$('btnSettings');
    if (!pop || !btn) return;
    const SPEEDS = [0.5, 1, 2, 4];
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      btn.classList.toggle('active', !pop.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) {
        pop.hidden = true;
        btn.classList.remove('active');
      }
    });
    const bloom = this.$('set_bloom');
    bloom.addEventListener('input', () => {
      this.$('set_bloomV').textContent = (+bloom.value).toFixed(2);
      this.settings.onBloom(+bloom.value);
    });
    const speed = this.$('set_speed');
    speed.addEventListener('input', () => {
      const idx = +speed.value;
      this.$('set_speedV').textContent = SPEEDS[idx] + '×';
      this.settings.onDefaultSpeed(idx);
    });
    const parts = this.$('set_particles');
    parts.addEventListener('change', () => {
      this.settings.onParticles(parts.checked);
      this._saveSettings();
    });
    const rot = this.$('set_autorot');
    rot.addEventListener('change', () => {
      this.settings.onAutoRotate(rot.checked);
      this._saveSettings();
    });
    const lite = this.$('set_lite');
    if (lite)
      lite.addEventListener('change', () => {
        this.settings.onLite(lite.checked);
        this._saveSettings();
      });
    const teach = this.$('set_teach');
    if (teach)
      teach.addEventListener('change', () => {
        this.settings.onTeach(teach.checked);
        this._saveSettings();
      });
    // Persistir bloom/velocidad al soltar.
    bloom.addEventListener('change', () => this._saveSettings());
    speed.addEventListener('change', () => this._saveSettings());
    // Acciones: capturar imagen / exportar CSV.
    const cap = this.$('set_capture');
    if (cap) cap.addEventListener('click', () => this.settings.onCapture());
    const exp = this.$('set_export');
    if (exp) exp.addEventListener('click', () => this.settings.onExport());

    // Cargar ajustes guardados y aplicarlos en el siguiente tick: los callbacks
    // de scene.js referencian su estado, que aún no existe durante el constructor.
    setTimeout(() => this._loadSettings(), 0);
  }

  // Persistencia de preferencias (localStorage; tolerante a fallos).
  _saveSettings() {
    try {
      const s = {
        bloom: +this.$('set_bloom').value,
        speed: +this.$('set_speed').value,
        particles: this.$('set_particles').checked,
        autorot: this.$('set_autorot').checked,
        lite: this.$('set_lite').checked,
        teach: this.$('set_teach') ? this.$('set_teach').checked : false,
      };
      localStorage.setItem('ql.settings', JSON.stringify(s));
    } catch {
      /* almacenamiento no disponible: se ignora */
    }
  }

  _loadSettings() {
    let s;
    try {
      s = JSON.parse(localStorage.getItem('ql.settings') || 'null');
    } catch {
      s = null;
    }
    if (!s) return;
    const SPEEDS = [0.5, 1, 2, 4];
    const set = (id, v) => {
      const el = this.$(id);
      if (el) el.value = v;
    };
    const chk = (id, v) => {
      const el = this.$(id);
      if (el) el.checked = !!v;
    };
    if (s.bloom != null) {
      set('set_bloom', s.bloom);
      this.$('set_bloomV').textContent = (+s.bloom).toFixed(2);
      this.settings.onBloom(+s.bloom);
    }
    if (s.speed != null) {
      set('set_speed', s.speed);
      this.$('set_speedV').textContent = (SPEEDS[+s.speed] ?? 1) + '×';
      this.settings.onDefaultSpeed(+s.speed);
    }
    if (s.particles != null) {
      chk('set_particles', s.particles);
      this.settings.onParticles(!!s.particles);
    }
    if (s.autorot != null) {
      chk('set_autorot', s.autorot);
      this.settings.onAutoRotate(!!s.autorot);
    }
    if (s.lite != null) {
      chk('set_lite', s.lite);
      this.settings.onLite(!!s.lite);
    }
    if (s.teach != null) {
      chk('set_teach', s.teach);
      this.settings.onTeach(!!s.teach);
    }
  }

  setPresenting(on) {
    document.body.classList.toggle('presenting', on);
    this.$('presentOverlay').hidden = !on;
    const b = this.$('btnPresent');
    if (b) b.classList.toggle('active', on);
  }

  setPresentName(name) {
    const el = this.$('presentName');
    if (el) el.textContent = name;
  }

  // Sincroniza el rail izquierdo (nav + parámetros) con un algoritmo, sin
  // relanzar la configuración (se usa al salir del modo presentación).
  focusAlgo(algo) {
    this.algo = algo;
    this.$('railLeft')
      .querySelectorAll('.nav .item')
      .forEach((b) => b.classList.toggle('active', b.dataset.algo === algo));
    this._buildParams(algo);
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
    // Menú cuántico agrupado por familia conceptual.
    const GROUPS = [
      { label: 'Búsqueda y oráculos', items: ['grover', 'dj', 'bv'] },
      { label: 'Fourier y fase', items: ['qft', 'shor'] },
      { label: 'Entrelazamiento', items: ['teleport'] },
    ];
    const card = (k) => {
      const a = ALGOS[k];
      return `
      <button class="item ${k === 'grover' ? 'active' : ''}" data-algo="${k}">
        <span class="edge"></span>
        <span class="ic-wrap">${ICONS[k]}</span>
        <span class="txt"><span class="t">${a.name}</span><span class="d">${a.desc}</span></span>
        <svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
      </button>`;
    };
    const nav = GROUPS.map(
      (g) =>
        `<div class="nav-group"><span class="nav-glabel">${g.label}</span>${g.items.map(card).join('')}</div>`
    ).join('');

    this.$('railLeft').innerHTML = `
      <div class="card">
        <div class="card-h">Algoritmo cuántico</div>
        <div class="card-b"><div class="nav">${nav}</div></div>
      </div>`;

    this.$('railLeft')
      .querySelectorAll('.nav .item')
      .forEach((b) => b.addEventListener('click', () => this._selectTab(b.dataset.algo)));
    const present = this.$('btnPresent');
    if (present) present.addEventListener('click', () => this.onPresentToggle());
    const presentExit = this.$('presentExit');
    if (presentExit) presentExit.addEventListener('click', () => this.onPresentToggle());
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
    } else if (algo === 'shor') {
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
    } else if (algo === 'dj') {
      P.innerHTML = `
        <p class="hintbox">Decide si una función es <b>constante</b> o <b>balanceada</b> con una sola consulta al oráculo. El clásico necesitaría 2ⁿ⁻¹+1.</p>
        <div class="field"><label>Qubits de entrada <b id="dj_nV">3</b></label><input id="dj_nq" type="range" min="1" max="8" value="3"></div>
        <div class="field"><label>Tipo de oráculo</label>
          <select id="dj_bal">
            <option value="1">Balanceada (paridad)</option>
            <option value="0">Constante (f = 0)</option>
          </select></div>`;
      const sync = () => {
        this.$('dj_nV').textContent = this.$('dj_nq').value;
      };
      this.$('dj_nq').addEventListener('input', sync);
      sync();
    } else if (algo === 'bv') {
      P.innerHTML = `
        <p class="hintbox">Recupera la cadena oculta <b>a</b> (donde f(x)=a·x) en <b>una</b> consulta. El clásico necesita n consultas.</p>
        <div class="field"><label>Qubits <b id="bv_nV">4</b></label><input id="bv_nq" type="range" min="1" max="8" value="4"></div>
        <div class="field"><label>Cadena oculta a <b id="bv_hV">1011</b></label><input id="bv_h" type="range" min="0" max="15" value="11"></div>`;
      const sync = () => {
        const n = +this.$('bv_nq').value,
          maxH = (1 << n) - 1;
        this.$('bv_h').max = String(maxH);
        if (+this.$('bv_h').value > maxH) this.$('bv_h').value = String(maxH);
        this.$('bv_nV').textContent = n;
        this.$('bv_hV').textContent = (+this.$('bv_h').value).toString(2).padStart(n, '0');
      };
      ['bv_nq', 'bv_h'].forEach((id) => this.$(id).addEventListener('input', sync));
      sync();
    } else {
      // qft
      P.innerHTML = `
        <p class="hintbox">Un <b>peine</b> uniforme (periodo 2ᵐ en posición) se transforma en <b>picos</b> espaciados: la QFT revela frecuencias, base de Shor y la estimación de fase.</p>
        <div class="field"><label>Qubits <b id="q_nV">4</b></label><input id="q_nq" type="range" min="2" max="7" value="4"></div>
        <div class="field"><label>Exponente de periodo m <b id="q_mV">2</b></label><input id="q_m" type="range" min="0" max="4" value="2"></div>
        <p class="hintbox" style="opacity:.7">2ᵐ picos, espaciados 2ⁿ⁻ᵐ.</p>`;
      const sync = () => {
        const n = +this.$('q_nq').value;
        this.$('q_m').max = String(n);
        if (+this.$('q_m').value > n) this.$('q_m').value = String(n);
        this.$('q_nV').textContent = n;
        this.$('q_mV').textContent = this.$('q_m').value;
      };
      ['q_nq', 'q_m'].forEach((id) => this.$(id).addEventListener('input', sync));
      sync();
    }
  }

  // ---------------- INSPECTOR (rail derecho) ----------------
  _buildInspector() {
    this.$('railRight').innerHTML = `
      <div class="card" id="guideCard">
        <div class="card-h"><span>Guía</span><span class="guide-progress" id="guideProgress"></span></div>
        <div class="card-b">
          <div class="guide-hook" id="guideHook"></div>
          <div class="guide-intro" id="guideIntro"></div>
          <div class="guide-steps" id="guideSteps"></div>
        </div>
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
      </div>
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
      </div>`;
    this.$('run').addEventListener('click', () => this.onRun(this.algo, this.getParams()));
    this.$('reset').addEventListener('click', () => this.onReset());
  }

  _buildStatus() {
    this.$('statusbar').innerHTML = `
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
    if (this.algo === 'dj')
      return { nQubits: +this.$('dj_nq').value, balanced: this.$('dj_bal').value === '1' };
    if (this.algo === 'bv')
      return { nQubits: +this.$('bv_nq').value, hidden: +this.$('bv_h').value };
    if (this.algo === 'qft')
      return { nQubits: +this.$('q_nq').value, periodExp: +this.$('q_m').value };
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
    const set = (id, v) => {
      const el = this.$(id);
      if (el) el.textContent = v;
    };
    if (qubits !== undefined) set('sb_q', qubits);
    if (dim !== undefined) set('sb_dim', dim);
    if (frames !== undefined) set('sb_frames', frames);
    if (dt !== undefined) set('sb_dt', dt);
  }

  setHud(algo, pills) {
    const a = ALGOS[algo];
    this.$('hudTitle').textContent = a.name;
    this.$('hudSub').textContent = a.hudSub;
    if (pills)
      this.$('hudPills').innerHTML = pills
        .map(
          (p) => `<span class="pill ${p.on ? 'on' : ''}" data-tip="${p.label}">${p.label}</span>`
        )
        .join('');
    else this.$('hudPills').innerHTML = '';
  }

  setLegend(items) {
    this.$('legend').innerHTML = (items || [])
      .map((i) => `<span><i style="background:${i.color}"></i>${i.label}</span>`)
      .join('');
  }

  // ---------------- GUÍA PEDAGÓGICA ----------------
  // Carga el guion de un algoritmo en la tarjeta Guía y deja el subtítulo con
  // el "gancho" (antes de ejecutar). scene.js llama luego setGuidePhase().
  setGuide(algo) {
    const n = NARRATION[algo];
    if (!n) return;
    this._guide = n;
    this._guidePhase = -1;
    this.$('guideHook').textContent = n.hook;
    this.$('guideIntro').textContent = n.intro;
    this.$('guideSteps').innerHTML = n.steps
      .map(
        (s, i) => `
        <div class="guide-step" data-i="${i}">
          <div class="gs-h"><span class="gs-n">${i + 1}</span><span class="gs-t">${s.t}</span></div>
          <div class="gs-what">${s.what}</div>
          <div class="gs-watch">👁 ${s.watch}</div>
        </div>`
      )
      .join('');
    this.$('guideProgress').textContent = `0 / ${n.steps.length}`;
    // Subtítulo inicial: el gancho, para enganchar antes de correr.
    this._caption({ kicker: 'Antes de empezar', body: n.hook, watch: '' });
  }

  // Resalta el paso activo en la tarjeta y actualiza el subtítulo del lienzo.
  setGuidePhase(i) {
    if (!this._guide) return;
    const steps = this._guide.steps;
    if (i == null || i < 0) return;
    i = Math.min(i, steps.length - 1);
    if (i === this._guidePhase) return;
    this._guidePhase = i;
    const host = this.$('guideSteps');
    if (host)
      host.querySelectorAll('.guide-step').forEach((el) => {
        const idx = +el.dataset.i;
        el.classList.toggle('on', idx === i);
        el.classList.toggle('done', idx < i);
      });
    this.$('guideProgress').textContent = `${i + 1} / ${steps.length}`;
    const s = steps[i];
    this._caption({
      kicker: `Paso ${i + 1}/${steps.length} · ${s.t}`,
      body: s.what,
      watch: s.watch,
    });
  }

  _caption({ kicker, body, watch }) {
    const cap = this.$('caption');
    if (!cap) return;
    this.$('capKicker').textContent = kicker || '';
    this.$('capBody').textContent = body || '';
    const w = this.$('capWatch');
    if (watch) {
      w.textContent = '👁 ' + watch;
      w.hidden = false;
    } else {
      w.hidden = true;
    }
    cap.hidden = false;
    // Reinicia la animación de entrada para que cada cambio "aparezca".
    cap.classList.remove('in');
    void cap.offsetWidth;
    cap.classList.add('in');
  }

  showCaption(show) {
    const cap = this.$('caption');
    if (cap) cap.hidden = !show;
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
