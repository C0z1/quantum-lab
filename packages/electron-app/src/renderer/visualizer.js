import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

// Post-proceso final: viñeta + grano de película sutil (cinematográfico).
const VignetteGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.15 },
    uGrain: { value: 0.05 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      // grading: +contraste suave, +saturación y tinte iris en las sombras
      float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = (col.rgb - 0.5) * 1.06 + 0.5;
      col.rgb = mix(vec3(lum), col.rgb, 1.1);
      col.rgb += vec3(0.028, 0.0, 0.055) * (1.0 - lum);
      // viñeta radial
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.92, 0.32, length(d) * uVignette);
      col.rgb *= mix(0.68, 1.0, vig);
      // grano temporal
      float g = (rand(vUv + fract(uTime)) - 0.5) * uGrain;
      col.rgb += g;
      gl_FragColor = col;
    }`,
};

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
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Cap del pixel ratio: en pantallas HiDPI, DPR=2 cuadruplica el coste de
    // fragmentos. 1.5 se ve nítido y sube mucho los FPS.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this._lite = false;

    this.scene = new THREE.Scene();
    // Fondo espacio-profundo tintado (coherente con el chrome), no negro plano;
    // la niebla índigo da profundidad y funde el horizonte con la nebulosa.
    this.scene.background = new THREE.Color(0x05060e);
    this.scene.fog = new THREE.FogExp2(0x070816, 0.013);

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
      1.15,
      0.6,
      0.72
    );
    this._bloomBase = 1.15;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // Viñeta + grano al final (en espacio sRGB, tras OutputPass).
    this.grainPass = new ShaderPass(VignetteGrainShader);
    this.composer.addPass(this.grainPass);

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

    this._rippleCenters = [];
    this._intro = null;

    this._addLights();
    this._addNebula();
    this._addStarfield();
    this._addDust();
    this._addFloor();
    this._addFloorRipple();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._startRenderLoop();
  }

  _addLights() {
    this.scene.add(new THREE.AmbientLight(0x8a7bd0, 0.36));
    const key = new THREE.DirectionalLight(0xe6dcff, 0.68);
    key.position.set(6, 16, 8);
    this.scene.add(key);
    const p1 = new THREE.PointLight(this.C.iris, 1.25, 80);
    p1.position.set(-16, 7, -6);
    this.scene.add(p1);
    const p2 = new THREE.PointLight(this.C.saffron, 0.7, 80);
    p2.position.set(16, 6, 8);
    this.scene.add(p2);
    // Realce teal desde abajo/atrás: separa las columnas del fondo con un halo
    // frío (lenguaje "medición") y da lectura volumétrica. Barato: 1 PointLight.
    const rim = new THREE.PointLight(this.C.teal, 0.55, 70);
    rim.position.set(0, 2.5, -14);
    this.scene.add(rim);
  }

  _addNebula() {
    // Fondo tipo nebulosa: esfera envolvente con nubes procedurales suaves en
    // iris/teal, aditiva y muy sutil, para dar profundidad sin robar foco.
    const geo = new THREE.SphereGeometry(180, 32, 24);
    this.nebulaMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uIris: { value: new THREE.Color(this.C.iris) },
        uTeal: { value: new THREE.Color(this.C.teal) },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vPos;
        uniform float uTime; uniform vec3 uIris, uTeal;
        // ruido de valor + fbm
        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                         mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                         mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<3;i++){ s+=a*noise(p); p*=2.02; a*=0.5;} return s; }
        void main(){
          vec3 dir = normalize(vPos);
          float n = fbm(dir*2.2 + vec3(0.0, uTime*0.02, uTime*0.015));
          n = smoothstep(0.45, 1.0, n);
          float band = pow(max(0.0, 1.0 - abs(dir.y)*1.3), 2.0); // más denso cerca del horizonte
          vec3 col = mix(uIris, uTeal, fbm(dir*1.3 - uTime*0.01));
          float a = n * band * 0.16;
          gl_FragColor = vec4(col * a * 2.2, a);
        }`,
    });
    this.nebula = new THREE.Mesh(geo, this.nebulaMat);
    this.scene.add(this.nebula);
  }

  _addStarfield() {
    const N = 3400;
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

  _addDust() {
    // Polvo cuántico: partículas cercanas que flotan y dan profundidad y vida a
    // la escena (barato: un solo Points aditivo que gira lento).
    const N = 700;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const palette = [
      new THREE.Color(this.C.iris),
      new THREE.Color(this.C.teal),
      new THREE.Color(0xbfaaff),
      new THREE.Color(0xffffff),
    ];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = Math.random() * 34 - 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      const c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dust = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.13,
        map: PARTICLE_TEX,
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scene.add(this.dust);
  }

  _addFloor() {
    try {
      this.mirror = new Reflector(new THREE.PlaneGeometry(220, 220), {
        clipBias: 0.003,
        textureWidth: 512,
        textureHeight: 512,
        color: 0x0a1526,
      });
      this.mirror.rotation.x = -Math.PI / 2;
      this.mirror.position.y = -0.02;
      this.scene.add(this.mirror);
    } catch {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(220, 220),
        new THREE.MeshStandardMaterial({ color: 0x070c16, metalness: 0.6, roughness: 0.25 })
      );
      floor.rotation.x = -Math.PI / 2;
      this.scene.add(floor);
    }
    this.grid = new THREE.GridHelper(120, 60, 0x3a2f6b, 0x161334);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.45;
    this.grid.position.y = 0.01;
    this.scene.add(this.grid);
  }

  // Ondas de interferencia en el suelo: anillos concéntricos que emanan de las
  // columnas activas (objetivo/picos) — refuerzan la metáfora cuántica y se
  // reflejan en el espejo. Un solo plano con shader; barato.
  _addFloorRipple() {
    const centers = [];
    for (let i = 0; i < 6; i++) centers.push(new THREE.Vector2(9999, 9999));
    this.rippleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCenters: { value: centers },
        uCount: { value: 0 },
        uColor: { value: new THREE.Color(this.C.iris) },
        uColor2: { value: new THREE.Color(this.C.teal) },
      },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vP;
        uniform float uTime; uniform vec2 uCenters[6]; uniform int uCount;
        uniform vec3 uColor, uColor2;
        void main(){
          float a = 0.0;
          for(int i=0;i<6;i++){
            if(i>=uCount) break;
            float d = distance(vP, uCenters[i]);
            float w = sin(d*0.85 - uTime*2.3) * 0.5 + 0.5;
            w = pow(w, 3.0);
            float fall = smoothstep(28.0, 0.0, d);
            a += w * fall;
          }
          a = clamp(a, 0.0, 1.0) * 0.5;
          vec3 col = mix(uColor, uColor2, 0.4);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.ripple = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), this.rippleMat);
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.y = 0.03;
    this.scene.add(this.ripple);
  }

  // Cascarón de Fresnel reutilizable (halo en el borde) para las esferas.
  _fresnelShell(R, color, strength) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uStr: { value: strength } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uStr;
        void main(){ float f = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 2.5); gl_FragColor = vec4(uColor, f * uStr); }`,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), mat);
  }

  // Dolly cinematográfico: encuadra la escena al preparar cada algoritmo.
  _playIntro(toPos, toTarget) {
    const fromPos = toPos.clone().multiplyScalar(1.35);
    fromPos.y = toPos.y + 6;
    this._introAuto = this.controls.autoRotate;
    this.controls.autoRotate = false;
    this._intro = {
      t: 0,
      dur: 1.25,
      fromPos,
      toPos: toPos.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: toTarget.clone(),
    };
    this.camera.position.copy(fromPos);
    this.controls.target.copy(toTarget);
  }

  setMode(mode) {
    this.mode = mode;
    this.barsGroup.visible = mode === 'bars';
    this.blochGroup.visible = mode === 'bloch';
    if (this.ripple) this.ripple.visible = mode === 'bars' && !this._lite;
  }

  // ---- Ajustes en vivo (panel de configuración) ----
  setBloom(strength) {
    // 0 = sin resplandor; el máximo del slider es un bloom intenso.
    this._bloomBase = Math.max(0, strength);
    if (this.bloom && !this._lite) this.bloom.strength = this._bloomBase;
  }

  // Modo alto rendimiento: apaga los efectos caros (reflejo, nebulosa, polvo,
  // grano) y baja el bloom, para equipos con GPU modesta.
  setLiteMode(on) {
    this._lite = !!on;
    if (this.nebula) this.nebula.visible = !on;
    if (this.mirror) this.mirror.visible = !on;
    if (this.dust) this.dust.visible = !on;
    if (this.grainPass) this.grainPass.enabled = !on;
    if (this.ripple) this.ripple.visible = !on && this.mode === 'bars';
    if (this.bloom) this.bloom.strength = on ? Math.min(this._bloomBase, 0.6) : this._bloomBase;
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
    this._revealed = false;

    const spacing = stateSize > 32 ? Math.max(0.22, 62 / stateSize) : 1.25;
    const totalWidth = (stateSize - 1) * spacing;
    const showLabels = stateSize <= 16;
    const bw = spacing * (stateSize > 32 ? 0.85 : 0.62);
    for (let i = 0; i < stateSize; i++) {
      // Columna hexagonal ligeramente cónica: cristal de energía, no un cubo.
      // Una cara plana mira a la cámara y sus 6 aristas captan el Fresnel.
      const geo = new THREE.CylinderGeometry(bw * 0.46, bw * 0.54, 1, 6);
      const mat = this._barMaterial();
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
    // Envolvente de amplitud: curva luminosa que traza las probabilidades como
    // la "función de onda" sobre las columnas. Elemento firma de la escena.
    const wpos = new Float32Array(stateSize * 3);
    const wcol = new Float32Array(stateSize * 3);
    for (let i = 0; i < stateSize; i++) {
      wpos[i * 3] = this.bars[i].position.x;
      wpos[i * 3 + 1] = 0.05;
      wpos[i * 3 + 2] = 0.55;
    }
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
    this.wave = new THREE.Line(
      wgeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.barsGroup.add(this.wave);

    this.totalWidth = totalWidth;
    const camZ = Math.min(64, Math.max(15, totalWidth * 0.9));
    this._playIntro(new THREE.Vector3(0, 8, camZ), new THREE.Vector3(0, 3.6, 0));
  }

  // Material de columna con borde de Fresnel: los cantos captan un halo frío,
  // dando lectura de "cristal de energía". El programa se compila una sola vez
  // (three cachea por código), aunque haya cientos de barras.
  _barMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x07070d,
      emissive: new THREE.Color(0x2a1e55),
      emissiveIntensity: 1.1,
      metalness: 0.72,
      roughness: 0.16,
    });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float qFres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
         totalEmissiveRadiance += vec3(0.30, 0.42, 0.85) * qFres * 1.15;`
      );
    };
    return mat;
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
    const centers = [];
    for (const i of indices) {
      if (i < 0 || i >= this.bars.length) continue;
      this.beams.push(this._makeBeam(this.bars[i].position.x, color));
      if (centers.length < 6) centers.push(this.bars[i].position.x);
    }
    this._rippleCenters = centers;
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

  // Onda expansiva de revelación: cuando la solución emerge, un choque en el
  // suelo (dos anillos escalonados) marca el momento "¡ahí está!".
  _spawnShockwave(x, color) {
    if (this._particlesOn === false) return;
    for (let k = 0; k < 2; k++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.72, 64),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.04, 0);
      this.fxGroup.add(mesh);
      this.rings.push({ mesh, age: -k * 0.18, life: 1.8, big: true });
    }
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
      const pulse = 1 + 0.16 * Math.sin(t * 3 + i * 0.4);
      if (i === this.targetIndex) {
        // Solución = ámbar intenso.
        bar.material.emissive.setHSL(0.11, 0.95, 0.52);
        bar.material.emissiveIntensity = (1.6 + 0.9 * rel) * pulse;
      } else {
        // Amplitud = de índigo apagado (baja prob) a violeta eléctrico (alta).
        const hue = 0.7 - 0.04 * rel;
        bar.material.emissive.setHSL(hue, 0.9, 0.26 + 0.28 * rel);
        bar.material.emissiveIntensity = (0.45 + 1.7 * rel) * pulse;
      }
    }
    // Envolvente de amplitud: sigue la cima de cada columna y brilla más (hacia
    // blanco) donde la probabilidad es alta — la función de onda tomando forma.
    if (this.wave) {
      if (!this._waveCol) this._waveCol = new THREE.Color();
      const wp = this.wave.geometry.attributes.position;
      const wc = this.wave.geometry.attributes.color;
      for (let i = 0; i < this.bars.length; i++) {
        const h = this.bars[i].scale.y;
        wp.array[i * 3 + 1] = h + 0.12;
        const rel = Math.min(1, (this.targetProbs[i] || 0) * nStates);
        const hue = i === this.targetIndex ? 0.11 : 0.7 - 0.05 * rel;
        this._waveCol.setHSL(hue, 0.9, 0.45 + 0.45 * rel);
        wc.array[i * 3] = this._waveCol.r;
        wc.array[i * 3 + 1] = this._waveCol.g;
        wc.array[i * 3 + 2] = this._waveCol.b;
      }
      wp.needsUpdate = true;
      wc.needsUpdate = true;
    }

    // Momento de revelación: cuando la solución supera el umbral, un choque.
    if (this.targetIndex >= 0 && !this._revealed && this.bars[this.targetIndex]) {
      const tp = (this.targetProbs[this.targetIndex] || 0) * nStates;
      if (tp > 0.85) {
        this._revealed = true;
        this._spawnShockwave(this.bars[this.targetIndex].position.x, this.C.saffron);
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
            color: 0x4a458f,
            wireframe: true,
            transparent: true,
            opacity: 0.28,
          })
        )
      );
      root.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(R * 0.99, 32, 24),
          new THREE.MeshBasicMaterial({ color: 0x0b1024, transparent: true, opacity: 0.28 })
        )
      );
      // Halo de Fresnel: la esfera capta luz en el borde (como los cristales).
      root.add(this._fresnelShell(R * 1.02, this.C.iris, 0.85));
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
      // Meridianos: dos círculos máximos que pasan por los polos → esfera de
      // Bloch como instrumento real, no una bola de alambre.
      for (let m = 0; m < 2; m++) {
        const mer = new THREE.Mesh(
          new THREE.TorusGeometry(R, 0.014, 6, 60),
          new THREE.MeshBasicMaterial({
            color: 0x6a5fae,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
          })
        );
        mer.rotation.y = (m * Math.PI) / 2; // 0° y 90°, pasan por |0⟩/|1⟩
        root.add(mer);
      }
      // Polos = estados base. Arriba |0⟩, abajo |1⟩ (pedagógico + instrumento).
      const p0 = this._label('|0⟩', '#cfe0ff');
      p0.position.set(0, R + 0.4, 0);
      p0.scale.set(1.0, 0.4, 1);
      root.add(p0);
      const p1 = this._label('|1⟩', '#cfe0ff');
      p1.position.set(0, -R - 0.36, 0);
      p1.scale.set(1.0, 0.4, 1);
      root.add(p1);
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
      // Estela del vector: la punta deja un rastro que se desvanece al moverse.
      const TN = 28;
      const tpos = new Float32Array(TN * 3);
      const tgeo = new THREE.BufferGeometry();
      tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
      const trail = new THREE.Line(
        tgeo,
        new THREE.LineBasicMaterial({
          color: this.C.teal,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      root.add(trail);
      this.blochGroup.add(root);
      this.blochQubits.push({
        root,
        arrow,
        R,
        currentDir: new THREE.Vector3(0, 1, 0),
        targetDir: new THREE.Vector3(0, 1, 0),
        targetLen: 1,
        trailPos: tpos,
        TN,
      });
    }
    // Canales de entrelazamiento (partículas fluyendo) entre qubits adyacentes.
    for (let q = 0; q < nQubits - 1; q++)
      this.channels.push(this._makeChannel(centers[q], centers[q + 1]));
    this.blochCenters = centers;
    this._playIntro(
      new THREE.Vector3(0, 1.5, Math.max(11, totalW * 1.15 + 7)),
      new THREE.Vector3(0, R + 0.6, 0)
    );
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
      const dest = this.blochCenters[this.blochCenters.length - 1];
      this._spawnBurst(dest, this.C.saffron);
      // Pulso de corrección: onda expansiva bajo la esfera destino.
      this._spawnShockwave(dest.x, this.C.teal);
    }
  }

  _tickBloch(dt, _t) {
    for (const bq of this.blochQubits) {
      bq.currentDir.lerp(bq.targetDir, 0.1);
      const dir = bq.currentDir.clone().normalize();
      bq.arrow.setDirection(dir);
      const len = Math.max(0.05, bq.targetLen * bq.R);
      bq.arrow.setLength(len, 0.4, 0.24);
      bq.root.children[3].rotation.z += dt * 0.4; // ecuador (tras añadir el fresnel)
      // Estela: desplaza el historial y coloca la punta actual al frente.
      if (bq.trailPos) {
        const tp = bq.trailPos;
        for (let i = bq.TN - 1; i > 0; i--) {
          tp[i * 3] = tp[(i - 1) * 3];
          tp[i * 3 + 1] = tp[(i - 1) * 3 + 1];
          tp[i * 3 + 2] = tp[(i - 1) * 3 + 2];
        }
        tp[0] = dir.x * len;
        tp[1] = dir.y * len;
        tp[2] = dir.z * len;
        const attr = bq.root.children[bq.root.children.length - 1].geometry.attributes.position;
        attr.needsUpdate = true;
      }
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
    if (this.dust && this.dust.visible) {
      this.dust.rotation.y -= dt * 0.03;
      this.dust.position.y = Math.sin(t * 0.3) * 0.6;
    }
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const r = this.rings[k];
      r.age += dt;
      if (r.age < 0) {
        r.mesh.material.opacity = 0;
        continue;
      }
      const grow = r.big ? 18 : 6;
      const s = 1 + r.age * grow;
      r.mesh.scale.set(s, s, s);
      const base = r.big ? 0.85 : 0.65;
      r.mesh.material.opacity = Math.max(0, base * (1 - r.age / r.life));
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

  _tickIntro(dt) {
    if (!this._intro) return;
    const iv = this._intro;
    iv.t += dt;
    const k = Math.min(1, iv.t / iv.dur);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    this.camera.position.lerpVectors(iv.fromPos, iv.toPos, e);
    this.controls.target.lerpVectors(iv.fromTarget, iv.toTarget, e);
    if (k >= 1) {
      this.controls.autoRotate = this._introAuto;
      this._intro = null;
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
      this._tickIntro(dt);
      if (this.nebulaMat) this.nebulaMat.uniforms.uTime.value = t;
      if (this.grainPass) this.grainPass.uniforms.uTime.value = t;
      if (this.rippleMat && this.ripple.visible) {
        this.rippleMat.uniforms.uTime.value = t;
        const cs = this.rippleMat.uniforms.uCenters.value;
        const n = Math.min(6, this._rippleCenters.length);
        for (let i = 0; i < n; i++) cs[i].set(this._rippleCenters[i], 0);
        for (let i = n; i < 6; i++) cs[i].set(9999, 9999);
        this.rippleMat.uniforms.uCount.value = n;
      }
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

  // Captura el fotograma actual del lienzo como PNG (dataURL). Se renderiza y
  // se lee en el mismo turno para no depender de preserveDrawingBuffer.
  snapshot() {
    this.composer.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  reset() {
    for (const b of this.bars) {
      b.scale.y = 0.02;
      b.position.y = 0.01;
    }
    this.targetProbs = new Array(this.stateSize).fill(0);
    this._revealed = false;
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
