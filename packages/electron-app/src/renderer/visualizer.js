import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

// Textura de partícula suave (glow radial) compartida.
function softParticleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
const PARTICLE_TEX = softParticleTexture();

// QuantumVisualizer — motor de visualización espectacular con dos modos:
//  'bars'  : columnas de energía de probabilidad (Grover, Shor)
//  'bloch' : esferas de Bloch con canal de entrelazamiento (Teletransportación)
export class QuantumVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.012);

    // Paleta alineada al lenguaje "Dala": iris (primario), ámbar y teal.
    this.C = { iris: 0x8052ff, saffron: 0xffb829, teal: 0x2ee6b0 };

    this.camera = new THREE.PerspectiveCamera(
      52,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      400
    );
    this.camera.position.set(0, 8, 20);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.autoRotate = true; // cámara viva en reposo
    this.controls.autoRotateSpeed = 0.55;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.7,
      0.5,
      0.8
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.clock = new THREE.Clock();
    this.mode = 'bars';

    this.barsGroup = new THREE.Group();
    this.blochGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.scene.add(this.barsGroup, this.blochGroup, this.fxGroup);

    this.bars = [];
    this.targetProbs = [];
    this.stateSize = 0;
    this.targetIndex = -1;
    this.beams = [];
    this.rings = [];
    this.bursts = [];
    this.blochQubits = [];
    this.channels = [];
    this.nBloch = 0;
    this._burstDone = false;

    this._addLights();
    this._addStarfield();
    this._addFloor();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._startRenderLoop();
  }

  _addLights() {
    this.scene.add(new THREE.AmbientLight(0x8a7bd0, 0.38));
    const key = new THREE.DirectionalLight(0xe6dcff, 0.65);
    key.position.set(6, 16, 8);
    this.scene.add(key);
    const p1 = new THREE.PointLight(this.C.iris, 1.2, 80);
    p1.position.set(-16, 7, -6);
    this.scene.add(p1);
    const p2 = new THREE.PointLight(this.C.saffron, 0.7, 80);
    p2.position.set(16, 6, 8);
    this.scene.add(p2);
  }

  _addStarfield() {
    const N = 2400;
    const pos = new Float32Array(N * 3),
      col = new Float32Array(N * 3);
    const palette = [
      new THREE.Color(this.C.iris),
      new THREE.Color(this.C.saffron),
      new THREE.Color(this.C.teal),
      new THREE.Color(0xffffff),
    ];
    for (let i = 0; i < N; i++) {
      const r = 40 + Math.random() * 120,
        th = Math.random() * Math.PI * 2,
        ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = (Math.random() - 0.35) * 120;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 1.7,
        map: PARTICLE_TEX,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(this.stars);
  }

  _addFloor() {
    try {
      this.mirror = new Reflector(new THREE.PlaneGeometry(220, 220), {
        clipBias: 0.003,
        textureWidth: 1024,
        textureHeight: 1024,
        color: 0x0a1526,
      });
      this.mirror.rotation.x = -Math.PI / 2;
      this.mirror.position.y = -0.02;
      this.scene.add(this.mirror);
    } catch (e) {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(220, 220),
        new THREE.MeshStandardMaterial({ color: 0x070c16, metalness: 0.6, roughness: 0.25 })
      );
      floor.rotation.x = -Math.PI / 2;
      this.scene.add(floor);
    }
    this.grid = new THREE.GridHelper(120, 60, 0x2a2442, 0x141220);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.grid.position.y = 0.01;
    this.scene.add(this.grid);
  }

  setMode(mode) {
    this.mode = mode;
    this.barsGroup.visible = mode === 'bars';
    this.blochGroup.visible = mode === 'bloch';
  }

  // ---- Ajustes en vivo (panel de configuración) ----
  setBloom(strength) {
    // 0 = sin resplandor; el máximo del slider (1.6) es un bloom intenso.
    if (this.bloom) this.bloom.strength = Math.max(0, strength);
  }

  setParticles(on) {
    // Campo de estrellas de fondo; los FX puntuales (ráfagas) se saltan aparte.
    this._particlesOn = on;
    if (this.stars) this.stars.visible = !!on;
  }

  setAutoRotate(on) {
    if (this.controls) this.controls.autoRotate = !!on;
  }

  // ------------------------------------------------------------------ BARRAS
  initBars(stateSize) {
    this._clearGroup(this.barsGroup);
    this._clearBeams();
    this.bars = [];
    this.targetProbs = new Array(stateSize).fill(0);
    this.stateSize = stateSize;

    const spacing = stateSize > 32 ? Math.max(0.22, 62 / stateSize) : 1.25;
    const totalWidth = (stateSize - 1) * spacing;
    const showLabels = stateSize <= 16;
    const bw = spacing * (stateSize > 32 ? 0.85 : 0.62);
    for (let i = 0; i < stateSize; i++) {
      const geo = new THREE.BoxGeometry(bw, 1, 0.85);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0a0a12,
        emissive: new THREE.Color(0x2a1e55),
        emissiveIntensity: 1.1,
        metalness: 0.5,
        roughness: 0.3,
      });
      const bar = new THREE.Mesh(geo, mat);
      bar.position.set(-totalWidth / 2 + i * spacing, 0.5, 0);
      this.barsGroup.add(bar);
      this.bars.push(bar);
      if (showLabels) {
        const label = this._label(
          '|' + i.toString(2).padStart(Math.log2(stateSize), '0') + '⟩',
          '#8a8a95'
        );
        label.position.set(bar.position.x, -0.7, 0);
        this.barsGroup.add(label);
      }
    }
    this.totalWidth = totalWidth;
    const camZ = Math.min(64, Math.max(15, totalWidth * 0.9));
    this.camera.position.set(0, 8, camZ);
    this.controls.target.set(0, 3.6, 0);
    this.controls.update();
  }

  highlightTarget(index) {
    this.targetIndex = index;
    if (this.mode === 'bars') this._setBeams(index >= 0 ? [index] : [], this.C.saffron);
  }

  setPeaks(indices) {
    this._setBeams(indices || [], this.C.iris);
  }

  _setBeams(indices, color) {
    this._clearBeams();
    for (const i of indices) {
      if (i < 0 || i >= this.bars.length) continue;
      this.beams.push(this._makeBeam(this.bars[i].position.x, color));
    }
  }

  _makeBeam(x, color) {
    const group = new THREE.Group();
    group.position.x = x;
    this.barsGroup.add(group);
    // Haz de luz vertical (delgado y definido).
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.16, 1, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    group.add(cyl);
    // Anillo giratorio en la base.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.035, 8, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    // Partículas ascendentes.
    const NP = 22;
    const pos = new Float32Array(NP * 3);
    const spd = new Float32Array(NP);
    for (let i = 0; i < NP; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.35;
      pos[i * 3 + 1] = Math.random() * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
      spd[i] = 1.5 + Math.random() * 2.5;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        color,
        size: 0.2,
        map: PARTICLE_TEX,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(pts);
    return { group, cyl, ring, pts, spd, NP, height: 1 };
  }

  updateBarsFromFrame(frame) {
    if (!frame || !frame.data) return;
    if (frame.stateSize !== this.stateSize) this.initBars(frame.stateSize);
    for (let i = 0; i < frame.stateSize; i++) this.targetProbs[i] = frame.data[i * 3 + 2];
  }

  pulse(originX = 0) {
    this._spawnRing(originX, this.targetIndex >= 0 ? this.C.saffron : this.C.iris);
  }

  _tickBars(dt, t) {
    const nStates = this.stateSize || 1;
    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i];
      const prob = this.targetProbs[i] || 0;
      const targetH = Math.max(0.02, prob * 9);
      bar.scale.y += (targetH - bar.scale.y) * 0.13;
      bar.position.y = bar.scale.y / 2;
      const rel = Math.min(1, prob * nStates);
      const hue = 0.72 - 0.05 * rel; // iris/violeta
      const pulse = 1 + 0.18 * Math.sin(t * 3 + i * 0.4);
      if (i === this.targetIndex) {
        bar.material.emissive.setHSL(0.11, 0.95, 0.5); // saffron
        bar.material.emissiveIntensity = (1.0 + 0.5 * rel) * pulse;
      } else {
        bar.material.emissive.setHSL(hue, 0.8, 0.32 + 0.16 * rel);
        bar.material.emissiveIntensity = (0.4 + 0.9 * rel) * pulse;
      }
    }
    // Haces: siguen la altura de su barra.
    for (const b of this.beams) {
      const bx = b.group.position.x;
      // barra más cercana a bx
      let bar = null,
        best = 1e9;
      for (const bb of this.bars) {
        const d = Math.abs(bb.position.x - bx);
        if (d < best) {
          best = d;
          bar = bb;
        }
      }
      const H = Math.max(0.6, (bar ? bar.scale.y : 1) + 1.6);
      b.cyl.scale.y = H;
      b.cyl.position.y = H / 2;
      b.ring.rotation.z += dt * 1.6;
      b.ring.scale.setScalar(1 + 0.12 * Math.sin(t * 4));
      const p = b.pts.geometry.attributes.position;
      for (let i = 0; i < b.NP; i++) {
        let y = p.array[i * 3 + 1] + b.spd[i] * dt;
        if (y > H) y = 0;
        p.array[i * 3 + 1] = y;
      }
      p.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ BLOCH
  initBloch(nQubits, labels) {
    this._clearGroup(this.blochGroup);
    this.blochQubits = [];
    this.channels = [];
    this.nBloch = nQubits;
    this._burstDone = false;
    const R = 1.7,
      spacing = 5.2,
      totalW = (nQubits - 1) * spacing;
    const centers = [];
    for (let q = 0; q < nQubits; q++) {
      const root = new THREE.Group();
      root.position.set(-totalW / 2 + q * spacing, R + 0.6, 0);
      centers.push(root.position.clone());
      // esfera wireframe con glow
      root.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(R, 30, 20),
          new THREE.MeshBasicMaterial({
            color: 0x2b4a7a,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
          })
        )
      );
      root.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(R * 0.99, 32, 24),
          new THREE.MeshBasicMaterial({ color: 0x0a1830, transparent: true, opacity: 0.25 })
        )
      );
      // ecuador brillante
      const eq = new THREE.Mesh(
        new THREE.TorusGeometry(R, 0.02, 8, 60),
        new THREE.MeshBasicMaterial({
          color: this.C.iris,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
        })
      );
      eq.rotation.x = Math.PI / 2;
      root.add(eq);
      root.add(this._axis(new THREE.Vector3(0, 1, 0), R * 1.15, 0x8fa6cc));
      // flecha de estado (cono brillante)
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(),
        R,
        this.C.teal,
        0.42,
        0.26
      );
      arrow.line.material = new THREE.LineBasicMaterial({ color: this.C.teal });
      arrow.cone.material = new THREE.MeshBasicMaterial({ color: 0xbfffe6 });
      root.add(arrow);
      const label = this._label(labels?.[q] ?? 'q' + q, '#9fb4d8');
      label.position.set(0, -R - 0.7, 0);
      root.add(label);
      this.blochGroup.add(root);
      this.blochQubits.push({
        root,
        arrow,
        R,
        currentDir: new THREE.Vector3(0, 1, 0),
        targetDir: new THREE.Vector3(0, 1, 0),
        targetLen: 1,
      });
    }
    // Canales de entrelazamiento (partículas fluyendo) entre qubits adyacentes.
    for (let q = 0; q < nQubits - 1; q++)
      this.channels.push(this._makeChannel(centers[q], centers[q + 1]));
    this.blochCenters = centers;
    this.camera.position.set(0, 1.5, Math.max(11, totalW * 1.15 + 7));
    this.controls.target.set(0, R + 0.6, 0);
    this.controls.update();
  }

  _makeChannel(a, b) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 1.6;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    // tubo tenue
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, 0.03, 8, false),
      new THREE.MeshBasicMaterial({
        color: this.C.iris,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.blochGroup.add(tube);
    const NP = 46;
    const pos = new Float32Array(NP * 3);
    const u = new Float32Array(NP);
    for (let i = 0; i < NP; i++) u[i] = Math.random();
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        color: 0xb79bff,
        size: 0.3,
        map: PARTICLE_TEX,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.blochGroup.add(pts);
    return { curve, pts, u, NP };
  }

  updateBlochFromFrame(frame) {
    if (!frame || !frame.data) return;
    const n = Math.round(Math.log2(frame.stateSize));
    if (n !== this.nBloch) return;
    for (let q = 0; q < n; q++) {
      const b = computeBloch(frame.data, frame.stateSize, q);
      const v = new THREE.Vector3(b.x, b.z, b.y);
      const len = Math.min(1, v.length());
      const bq = this.blochQubits[q];
      bq.targetDir.copy(v.lengthSq() > 1e-9 ? v.clone().normalize() : new THREE.Vector3(0, 1, 0));
      bq.targetLen = len;
    }
    if (frame.isFinal && !this._burstDone && this.blochCenters) {
      this._burstDone = true;
      this._spawnBurst(this.blochCenters[this.blochCenters.length - 1], this.C.saffron);
    }
  }

  _tickBloch(dt, t) {
    for (const bq of this.blochQubits) {
      bq.currentDir.lerp(bq.targetDir, 0.1);
      const dir = bq.currentDir.clone().normalize();
      bq.arrow.setDirection(dir);
      bq.arrow.setLength(Math.max(0.05, bq.targetLen * bq.R), 0.4, 0.24);
      bq.root.children[2].rotation.z += dt * 0.4; // ecuador gira
    }
    for (const ch of this.channels) {
      const p = ch.pts.geometry.attributes.position;
      for (let i = 0; i < ch.NP; i++) {
        ch.u[i] += dt * 0.35;
        if (ch.u[i] > 1) ch.u[i] -= 1;
        const pt = ch.curve.getPoint(ch.u[i]);
        p.array[i * 3] = pt.x;
        p.array[i * 3 + 1] = pt.y;
        p.array[i * 3 + 2] = pt.z;
      }
      p.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ FX
  _spawnRing(x, color) {
    if (this._particlesOn === false) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.9, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, 0);
    this.fxGroup.add(mesh);
    this.rings.push({ mesh, age: 0, life: 1.3 });
  }

  _spawnBurst(center, color) {
    if (this._particlesOn === false) return;
    const NP = 140;
    const pos = new Float32Array(NP * 3);
    const vel = [];
    for (let i = 0; i < NP; i++) {
      pos[i * 3] = center.x;
      pos[i * 3 + 1] = center.y;
      pos[i * 3 + 2] = center.z;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2 + Math.random() * 4);
      vel.push(dir);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color,
        size: 0.42,
        map: PARTICLE_TEX,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.fxGroup.add(pts);
    this.bursts.push({ pts, vel, NP, age: 0, life: 1.4, center });
  }

  _animateFX(dt, t) {
    if (this.stars) this.stars.rotation.y += dt * 0.012;
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const r = this.rings[k];
      r.age += dt;
      const s = 1 + r.age * 6;
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = Math.max(0, 0.65 * (1 - r.age / r.life));
      if (r.age > r.life) {
        this.fxGroup.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(k, 1);
      }
    }
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k];
      b.age += dt;
      const p = b.pts.geometry.attributes.position;
      for (let i = 0; i < b.NP; i++) {
        p.array[i * 3] += b.vel[i].x * dt;
        p.array[i * 3 + 1] += b.vel[i].y * dt;
        p.array[i * 3 + 2] += b.vel[i].z * dt;
        b.vel[i].multiplyScalar(0.94);
      }
      p.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.age / b.life);
      if (b.age > b.life) {
        this.fxGroup.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(k, 1);
      }
    }
  }

  // ------------------------------------------------------------------ util
  _axis(dir, R, color) {
    const g = new THREE.BufferGeometry().setFromPoints([
      dir.clone().multiplyScalar(-R),
      dir.clone().multiplyScalar(R),
    ]);
    return new THREE.Line(
      g,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })
    );
  }

  _label(text, color) {
    const c = document.createElement('canvas');
    c.width = 170;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 85, 40);
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      })
    );
    spr.scale.set(1.9, 0.72, 1);
    return spr;
  }

  _clearBeams() {
    for (const b of this.beams) {
      this.barsGroup.remove(b.group);
      b.group.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
    }
    this.beams = [];
  }

  _clearGroup(group) {
    while (group.children.length) {
      const c = group.children[0];
      group.remove(c);
      c.traverse?.((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          o.material.map?.dispose?.();
          o.material.dispose?.();
        }
      });
    }
  }

  updateFromFrame(frame) {
    if (this.mode === 'bars') this.updateBarsFromFrame(frame);
    else this.updateBlochFromFrame(frame);
  }

  _startRenderLoop() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;
      if (this.mode === 'bars') this._tickBars(dt, t);
      else this._tickBloch(dt, t);
      this._animateFX(dt, t);
      this.controls.update();
      this.composer.render();
    };
    loop();
  }

  _onResize() {
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  reset() {
    for (const b of this.bars) {
      b.scale.y = 0.02;
      b.position.y = 0.01;
    }
    this.targetProbs = new Array(this.stateSize).fill(0);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}

export function computeBloch(data, stateSize, q) {
  const stride = 1 << q;
  let r00 = 0,
    r11 = 0,
    r01re = 0,
    r01im = 0;
  for (let i = 0; i < stateSize; i++) {
    if (i & stride) continue;
    const j = i | stride;
    const are = data[i * 3],
      aim = data[i * 3 + 1];
    const bre = data[j * 3],
      bim = data[j * 3 + 1];
    r00 += are * are + aim * aim;
    r11 += bre * bre + bim * bim;
    r01re += are * bre + aim * bim;
    r01im += aim * bre - are * bim;
  }
  return { x: 2 * r01re, y: -2 * r01im, z: r00 - r11 };
}
