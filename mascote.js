// SHADOW Shimeji para sites — usa three.js (carregado por importmap) e o arquivo SHADOW.glb.
// Uso:  import { start } from './shadow-shimeji.js';  start();
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LEDGE = 0.33; // altura do "banquinho" em Sit_Swing (metros)
const LOOPS = new Set(['Idle', 'Walk', 'Walk_Ceiling', 'Sit_Phone', 'Sad', 'Sit_Stretch', 'Sit_Swing',
  'Sleep', 'Crawl', 'Fall', 'Climb', 'Peek_R', 'Peek_L']);
// Glitch e Sumir ficam de fora do sorteio: fazem o personagem piscar/desaparecer e parecem um defeito.
const EMOTES = ['Emote_InLove', 'Emote_Heart', 'Emote_Celebrate', 'Emote_Angry', 'Emote_Steam',
  'Emote_Peace', 'Emote_Dab', 'Emote_Graffiti', 'Emote_Fire', 'Emote_Point', 'Emote_Scared',
  'Emote_Crown'];
const S = { IDLE: 0, WALK: 1, ACT: 2, SLEEP: 3, CRAWL: 4, TRIP: 5, JUMP: 6, FALL: 7, LAND: 8, CLIMB: 9,
  DESCEND: 10, CEILING: 11, PEEK: 12, DRAG: 13, VANISH: 14, APPEAR: 15 };
const GROUND_STATES = new Set([S.IDLE, S.WALK, S.ACT, S.SLEEP, S.CRAWL, S.TRIP, S.LAND, S.APPEAR, S.VANISH]);

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
};

export class Shimeji {
  constructor(opts = {}) {
    this.opts = Object.assign({
      model: new URL('./SHADOW.glb', import.meta.url).href,
      height: 440,            // altura do personagem em pixels (a janela do desenho)
      perches: [],            // seletores CSS de elementos onde ele pode sentar (ex.: ['header', '.card'])
      floorOffset: 0,         // sobe o "chão" (px), útil com rodapé fixo
      zIndex: 2147483000,
      menu: true,
      walkSpeed: 105, crawlSpeed: 45, climbSpeed: 70, gravity: 2200,
      outlineWidth: 0.008,
      respectReducedMotion: true,
    }, opts);
    const o = this.opts;
    this.H = Math.round(o.height);
    this.W = Math.round(this.H * 340 / 440);
    this.camSize = 1.9; this.camY = 0.8;
    this.ppm = this.H / this.camSize;
    this.state = S.IDLE; this.t = 0; this.dur = 3; this.dir = 1;
    this.anchor = { x: innerWidth / 2, y: innerHeight };
    this.mode = 'ground';
    this.vel = { x: 0, y: 0 };
    this.cur = ''; this.curAction = null; this.actions = {};
    this.facing = 0; this.sleepPhase = 0; this.tripAt = -1;
    this.jumpFrom = { x: 0, y: 0 }; this.jumpTo = { x: 0, y: 0 }; this.jumpH = 0; this.jumpTime = 1.5;
    this.pendingPerch = null; this.perchEl = null;
    this.drag = { dx: 0, dy: 0, sx: 0, sy: 0, t0: 0, moved: false, timer: 0 };
    this.ptr = { x: -999, y: -999 };
    this.hitRect = null;
    this.neon = []; this.glitch = { on: true, vis: true, jit: { x: 0, y: 0 }, timer: 0 };
    this.reduced = o.respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.running = false;
  }

  // Limites vindos do site (cabeçalho, barra de preço, botão "topo"), atualizados a cada quadro.
  get floor() { return this._bd ? this._bd.floor : innerHeight - this.opts.floorOffset; }
  get ceil() { return this._bd ? this._bd.top : 0; }
  get left() { return 0; }
  get right() { return this._bd ? this._bd.right : innerWidth; }
  get mid() { return (this.left + this.right) / 2; }
  get bodyH() { return 1.35 * this.ppm; }

  // ------------------------------------------------------------ montagem
  async start() {
    const o = this.opts;
    const canvas = this.canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'fixed', left: '0', top: '0', width: this.W + 'px', height: this.H + 'px',
      pointerEvents: 'none', zIndex: String(o.zIndex), touchAction: 'none', willChange: 'transform',
      userSelect: 'none', webkitUserSelect: 'none',
    });
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(this.W, this.H, false);
    r.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    const hw = this.W / 2 / this.ppm;
    this.camera = new THREE.OrthographicCamera(-hw, hw, this.camSize / 2, -this.camSize / 2, 0.1, 20);
    this.camera.position.set(0, this.camY, 5);
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-2, 3, 3.5);
    this.scene.add(key, new THREE.AmbientLight(0x3a0a0a, 3.0));

    this.pivot = new THREE.Group();
    this.pivot.position.set(0, this.camY, 0);
    this.scene.add(this.pivot);

    const gltf = await new GLTFLoader().loadAsync(o.model);
    this.model = gltf.scene;
    this.model.position.set(0, -this.camY, 0);
    this.pivot.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this._style();
    this.model.traverse((n) => { if (n.isSkinnedMesh && !this.skeleton) this.skeleton = n.skeleton; });

    this._bind();
    this._buildMenu();
    this.last = performance.now();
    this.running = true;
    this._idle();
    this._place();
    this._raf = (n) => this._frame(n);
    requestAnimationFrame(this._raf);
    return this;
  }

  destroy() {
    this.running = false;
    this.canvas?.remove();
    this.menuEl?.remove();
    for (const [t, f, c] of this._listeners || []) window.removeEventListener(t, f, c);
    this.renderer?.dispose();
    delete window.__shadowShimeji;
  }

  // ------------------------------------------------------------ visual de ilustração
  _style() {
    const steps = new Uint8Array(32);
    for (let i = 0; i < 32; i++) steps[i] = i < 21 ? 90 : i < 28 ? 205 : 255;
    const gradient = new THREE.DataTexture(steps, 32, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
    const ow = this.opts.outlineWidth;

    const unlit = (hex, extra = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(hex) }, extra));
    const toon = (hex, rim) => {
      const m = new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: gradient, side: THREE.DoubleSide });
      if (rim > 0) {
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
            float fres = 1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0);
            float sideF = clamp(abs(normalize(vNormal).x) * 1.6 - 0.35, 0.0, 1.0);
            float rimV = smoothstep(0.72, 0.76, fres) * sideF;
            outgoingLight += vec3(1.0, 0.03, 0.02) * rimV * ${rim.toFixed(2)};
            #include <opaque_fragment>`);
        };
      }
      return m;
    };
    // polygonOffset evita briga de profundidade (z-fighting) entre o contorno e o corpo, que aparecia como piscada
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    outlineMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>',
        `#include <skinning_vertex>\n transformed += normalize(objectNormal) * ${ow.toFixed(4)};`);
    };

    const meshes = [];
    this.model.traverse((n) => { if (n.isMesh) meshes.push(n); });
    // Texturas pintadas do corpo (modelo "volumes"): mantém o mapa original, com sombreamento em degraus
    // e um pouco de emissão para o vermelho/rosto continuarem legíveis no escuro.
    const textured = (src) => new THREE.MeshToonMaterial({
      map: src.map, gradientMap: gradient, side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffffff), emissiveMap: src.map, emissiveIntensity: 0.55,
    });
    const styleOne = (src) => {
      const name = src?.name || '';
      if (name.startsWith('M_Char_') && src.map) return { mat: textured(src), noOutline: false };
      if (name.startsWith('M_Neon')) { const m = unlit('#ff2417'); this.neon.push(m); return { mat: m, fx: true }; }
      if (name === 'M_FX_Neon' || name === 'M_Phone_Screen') return { mat: unlit('#ff2417'), fx: true };
      if (name === 'M_FX_Fire') return { mat: unlit('#ff7a14'), fx: true };
      if (name === 'M_FX_Mist') return { mat: unlit('#ff1a12', { transparent: true, opacity: 0.75, depthWrite: false }), fx: true };
      if (name === 'M_FX_Smoke') return { mat: unlit('#5b5760', { transparent: true, opacity: 0.75, depthWrite: false }), fx: true };
      let col = '#17171a', rim = 0.75, noOutline = false;
      switch (name) {
        case 'M_Shoe_Sole': col = '#e6e4df'; break;
        case 'M_Shoe_Laces': col = '#cc0a0a'; break;
        case 'M_Metal': col = '#c0c0c8'; noOutline = true; break;
        case 'M_Spray_Can': col = '#c00c0c'; break;
        case 'M_Phone_Body': col = '#0c0c0f'; rim = 0; break;
        case 'M_Mask': col = '#0a0a0c'; rim = 0; noOutline = true; break;
        case 'M_Hood_Inner': col = '#000000'; rim = 0; noOutline = true; break;
      }
      return { mat: toon(col, rim), noOutline };
    };
    for (const m of meshes) {
      m.frustumCulled = false;
      const isArr = Array.isArray(m.material);
      const res = (isArr ? m.material : [m.material]).map(styleOne);
      m.material = isArr ? res.map((r) => r.mat) : res[0].mat;
      if (res.every((r) => r.fx)) continue;
      const noOutline = res.some((r) => r.noOutline);
      if (m.isSkinnedMesh && !noOutline) {
        const o = new THREE.SkinnedMesh(m.geometry, outlineMat);
        o.bind(m.skeleton, m.bindMatrix);
        o.position.copy(m.position); o.quaternion.copy(m.quaternion); o.scale.copy(m.scale);
        o.frustumCulled = false;
        m.parent.add(o);
      }
    }
  }

  // ------------------------------------------------------------ menu e entrada
  _buildMenu() {
    if (!this.opts.menu) return;
    const el = this.menuEl = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', display: 'none', zIndex: String(this.opts.zIndex + 1), background: '#0b0b0d',
      border: '1px solid #ff2417', borderRadius: '8px', padding: '4px', font: '14px system-ui, sans-serif',
      boxShadow: '0 0 14px rgba(255,36,23,.45)', minWidth: '170px',
    });
    const items = [
      ['Emote aleatório', () => this._emote()],
      ['Pose do desenho', () => this._act('Pose_Reference', 3.5)],
      ['Celular', () => this._act('Sit_Phone', rnd(8, 14))],
      ['Dormir', () => this._sleep()],
      ['Pular', () => this._jumpAcross()],
      ['Escalar', () => { this._walk(); this.dir = this.anchor.x > this.mid ? 1 : -1; this.forceEdge = true; }],
      ['Sumir', () => this._vanish()],
      ['Esconder SHADOW', () => this.destroy()],
    ];
    for (const [label, fn] of items) {
      const b = document.createElement('div');
      b.textContent = label;
      Object.assign(b.style, { padding: '7px 12px', color: '#ffd9d6', cursor: 'pointer', borderRadius: '5px' });
      b.onmouseenter = () => { b.style.background = '#2a0807'; };
      b.onmouseleave = () => { b.style.background = 'transparent'; };
      b.onclick = () => { this._hideMenu(); this._toGroundMode(); this.perchEl = null; fn(); };
      el.appendChild(b);
    }
    document.body.appendChild(el);
  }
  _showMenu(x, y) {
    if (!this.menuEl) return;
    this.menuEl.style.display = 'block';
    const w = this.menuEl.offsetWidth, h = this.menuEl.offsetHeight;
    this.menuEl.style.left = clamp(x, 4, innerWidth - w - 4) + 'px';
    this.menuEl.style.top = clamp(y, 4, innerHeight - h - 4) + 'px';
  }
  _hideMenu() { if (this.menuEl) this.menuEl.style.display = 'none'; }

  _bind() {
    this._listeners = [];
    const on = (t, f, c) => { window.addEventListener(t, f, c); this._listeners.push([t, f, c]); };
    on('pointermove', (e) => this._onMove(e));
    on('pointerdown', (e) => this._onDown(e), true);
    on('pointerup', (e) => this._onUp(e), true);
    on('pointercancel', (e) => this._onUp(e), true);
    on('touchstart', (e) => {
      const t = e.touches[0];
      if (t && this._hit(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });
    on('mousedown', (e) => { if (this._hit(e.clientX, e.clientY)) e.preventDefault(); }, true);
    on('contextmenu', (e) => {
      if (this.menuEl && this._hit(e.clientX, e.clientY)) { e.preventDefault(); this._showMenu(e.clientX, e.clientY); }
    });
    on('click', (e) => {
      if (this.menuEl && !this.menuEl.contains(e.target)) this._hideMenu();
      if (this.suppressClick) { e.stopPropagation(); e.preventDefault(); this.suppressClick = false; }
    }, true);
    on('keydown', (e) => { if (e.key === 'Escape') this._hideMenu(); });
  }

  _hit(x, y) {
    const r = this.hitRect;
    if (!(!!r && this.model.visible && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)) return false;
    if (this.state === S.DRAG) return true;
    // Botões, links, barra de preço, cabeçalho e diálogos têm prioridade: o mascote nunca "rouba" o clique.
    const el = document.elementFromPoint(x, y);
    if (el && el !== this.canvas && el.closest('a, button, input, dialog, header, .mm-sbar, .mm-totop, .mm-bubble')) return false;
    return true;
  }
  /** Retângulo do personagem na tela (usado para posicionar a bolha de fala). */
  rect() {
    const r = this.hitRect;
    if (!r) return null;
    return { left: r.x0, right: r.x1, top: r.y0, bottom: r.y1, width: r.x1 - r.x0, height: r.y1 - r.y0 };
  }
  _onMove(e) {
    this.ptr.x = e.clientX; this.ptr.y = e.clientY;
    if (this.state === S.DRAG) {
      if (Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 6) { this.drag.moved = true; clearTimeout(this.drag.timer); }
      return;
    }
    if (e.pointerType === 'mouse') {
      const hit = this._hit(e.clientX, e.clientY);
      this.canvas.style.pointerEvents = hit ? 'auto' : 'none';
      this.canvas.style.cursor = hit ? 'grab' : 'default';
    }
  }
  _onDown(e) {
    if (e.button !== 0 || !this._hit(e.clientX, e.clientY) || this.state === S.DRAG) return;
    if (this.menuEl && this.menuEl.contains(e.target)) return;
    this._hideMenu();
    const d = this.drag;
    d.sx = e.clientX; d.sy = e.clientY; d.dx = e.clientX - this.anchor.x; d.dy = e.clientY - this.anchor.y;
    d.t0 = performance.now(); d.moved = false;
    this.ptr.x = e.clientX; this.ptr.y = e.clientY;
    this._toGroundMode(); this.perchEl = null; this.pendingPerch = null;
    this._enter(S.DRAG, 'Fall', 999);
    if (e.pointerType === 'touch') {
      d.timer = setTimeout(() => { if (!d.moved) { this._showMenu(d.sx, d.sy); this._fall(); } }, 650);
    }
  }
  _onUp() {
    if (this.state !== S.DRAG) return;
    const d = this.drag;
    clearTimeout(d.timer);
    if (d.moved) {
      this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 60); this._fall();
      if (this.opts.onThrow) this.opts.onThrow();
    } else {
      this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 60);
      if (this.opts.onClick) this.opts.onClick();
      if (this.anchor.y >= this.floor - 2) { this.anchor.y = this.floor; this._emote(); }
      else { this._fall(); this.pendingClickEmote = true; }
    }
  }

  // ------------------------------------------------------------ máquina de estados
  _play(name, blend = 0.25, speed = 1) {
    const a = this.actions[name];
    if (!a) return;
    const prev = this.curAction;
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    const loop = LOOPS.has(name);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    if (speed < 0) a.time = a.getClip().duration;
    if (prev && prev !== a) a.crossFadeFrom(prev, blend, false); else a.fadeIn(blend);
    a.play();
    this.curAction = a; this.cur = name;
  }
  _len(n) { return this.actions[n] ? this.actions[n].getClip().duration : 2; }
  _enter(s, n, d = -1, speed = 1) {
    this.state = s; this.t = 0;
    if (this.opts.onEnter) { try { this.opts.onEnter(n, s); } catch (e) { /* ignora */ } }
    this._play(n, 0.25, speed);
    this.dur = d > 0 ? d : this._len(n);
  }
  _toGroundMode() {
    if (this.mode === 'ceiling') this.anchor.y = Math.min(this.ceil + this.bodyH, this.floor);
    this.mode = 'ground';
  }
  _idle() { this._toGroundMode(); this.anchor.y = this.floor; this._enter(S.IDLE, 'Idle', rnd(2.5, 5)); }
  _walk() {
    this._enter(S.WALK, 'Walk', rnd(4, 10));
    if (Math.random() < 0.5) this.dir = -this.dir;
    this.tripAt = Math.random() < 0.12 ? rnd(1, this.dur - 0.5) : -1;
  }
  _act(n, d = -1) { this._enter(S.ACT, n, d); }
  _emote() {
    const e = EMOTES[Math.floor(Math.random() * EMOTES.length)];
    if (e === 'VANISH') this._vanish(); else this._act(e);
  }
  _sleep() { this.sleepPhase = 0; this._enter(S.SLEEP, 'Sleep_Lie'); }
  _vanish() { this._enter(S.VANISH, 'Vanish'); }
  _jumpAcross() {
    const m = 0.35 * this.ppm;
    this._jumpTo({ x: this.anchor.x < this.mid ? this.right - m : this.left + m, y: this.floor });
  }
  _jumpTo(p) {
    this.jumpFrom = { x: this.anchor.x, y: this.anchor.y }; this.jumpTo = p;
    const dx = p.x - this.anchor.x, dy = p.y - this.anchor.y;
    const dist = Math.hypot(dx, dy);
    this.jumpTime = clamp(dist / 650, 0.9, 2.6);
    this.jumpH = Math.min(innerHeight * 0.55, Math.abs(dx) * 0.45 + 120);
    if (dy < 0) this.jumpH = Math.max(this.jumpH, -dy + 80);
    this.dir = p.x > this.anchor.x ? 1 : -1;
    this._enter(S.JUMP, 'Jump', 0.3 + this.jumpTime);
  }
  _fall() { this._toGroundMode(); this.perchEl = null; this.vel.x = 0; this.vel.y = 0; this._enter(S.FALL, 'Fall', 999); }

  _pickPerch() {
    const sels = this.opts.perches;
    if (!sels || !sels.length) return null;
    let els = [];
    try { els = [...document.querySelectorAll(sels.join(','))]; } catch { return null; }
    els = els.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > this.W * 0.3 && r.top > this.ceil + this.ppm * 1.0 && r.top < this.floor - this.ppm * 0.4 &&
        r.right > 40 && r.left < this.right - 40 && getComputedStyle(e).visibility !== 'hidden';
    });
    return els.length ? els[Math.floor(Math.random() * els.length)] : null;
  }
  _goPerch() {
    const el = this._pickPerch();
    if (!el) { this._idle(); return; }
    const r = el.getBoundingClientRect();
    const x = rnd(Math.max(r.left, 60), Math.max(Math.min(r.right, this.right - 60), Math.max(r.left, 60) + 1));
    this.pendingPerch = el;
    this._jumpTo({ x, y: r.top + LEDGE * this.ppm });
  }

  _nextGround() {
    if (this.reduced) { this._idle(); return; }
    const opts = [
      [35, () => this._walk()],
      [8, () => this._act('Sit_Phone', rnd(8, 16))],
      [4, () => this._act('Sad', rnd(6, 10))],
      [7, () => this._act('Sit_Stretch', rnd(8, 14))],
      [5, () => this._sleep()],
      [5, () => this._enter(S.CRAWL, 'Crawl', rnd(4, 8))],
      [5, () => this._act('Shrug')],
      [3, () => this._act('Pose_Reference', 3.5)],
      [5, () => this._jumpAcross()],
      [8, () => this._idle()],
      [9, () => this._emote()],
    ];
    if (this.opts.perches.length) opts.push([20, () => this._goPerch()]); else opts.push([6, () => this._act('Sit_Swing', rnd(6, 12))]);
    const total = opts.reduce((a, o) => a + o[0], 0);
    let r = Math.random() * total;
    for (const o of opts) { r -= o[0]; if (r < 0) { o[1](); return; } }
  }
  _atEdge() {
    const r = Math.random(), right = this.dir > 0, pp = this.ppm;
    // Com o botão "voltar ao topo" visível, o lado direito é dele: o personagem só dá meia-volta ali.
    if (right && this._bd && this._bd.lane) { this.dir = -1; return; }
    if (r < 0.35 || this.forceEdge) {
      this.forceEdge = false;
      this.mode = right ? 'wall_r' : 'wall_l';
      this.anchor.x = right ? this.right - 0.18 * pp : this.left + 0.18 * pp;
      this._enter(S.CLIMB, 'Climb', rnd(3, 9));
    } else if (r < 0.6) {
      this.anchor.x = right ? this.right + 0.12 * pp : this.left - 0.12 * pp;
      this._enter(S.PEEK, right ? 'Peek_R' : 'Peek_L', rnd(3, 6));
      this.dir = -this.dir;
    } else if (r < 0.8) this._jumpAcross();
    else this.dir = -this.dir;
  }

  // ------------------------------------------------------------ atualização
  _frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this._raf);
    let dt = (now - this.last) / 1000; this.last = now;
    dt = clamp(dt, 0, 0.05);
    const host = this.opts.host;
    if (host) {
      if (host.paused && host.paused()) { this.canvas.style.visibility = 'hidden'; return; }
      this.canvas.style.visibility = 'visible';
      this._bd = host.bounds();
    }
    this._update(dt);
    this.mixer.update(dt);
    this._orient(dt);
    this._effects(dt);
    this._place();
    this.renderer.render(this.scene, this.camera);
    this._bounds();
  }

  _update(dt) {
    this.t += dt;
    const a = this.anchor, o = this.opts, m = 0.3 * this.ppm;
    if (this.mode === 'wall_r' && this.state !== S.DRAG) a.x = this.right - (this._bd && this._bd.lane ? 0.34 : 0.18) * this.ppm;
    if (this.mode === 'wall_l' && this.state !== S.DRAG) a.x = this.left + 0.18 * this.ppm;
    switch (this.state) {
      case S.IDLE: if (this.t > this.dur) { if (this.pendingClickEmote) { this.pendingClickEmote = false; this._emote(); } else this._nextGround(); } break;
      case S.WALK:
        a.x += this.dir * o.walkSpeed * dt;
        if ((this.dir > 0 && a.x > this.right - m) || (this.dir < 0 && a.x < this.left + m)) {
          a.x = clamp(a.x, this.left + m, this.right - m); this._atEdge();
        } else if (this.forceEdge) {
          // "Escalar" pelo menu: vai até a borda mais próxima
        } else if (this.tripAt > 0 && this.t > this.tripAt) this._enter(S.TRIP, 'Trip');
        else if (this.t > this.dur) { if (Math.random() < 0.6) this._emote(); else this._nextGround(); }
        break;
      case S.ACT:
        if (this.perchEl) {
          const r = this.perchEl.getBoundingClientRect();
          if (!this.perchEl.isConnected || r.top < this.ceil + this.ppm || r.top > this.floor - this.ppm * 0.3 || r.bottom < 0) { this._fall(); break; }
          a.y = r.top + LEDGE * this.ppm;
          a.x = clamp(a.x, r.left + 20, Math.max(r.right - 20, r.left + 21));
        }
        if (this.perchEl && this.opts.onPerchTick) {
          this._pt = (this._pt || 0) + dt;
          if (this._pt > 2.4) { this._pt = 0; try { this.opts.onPerchTick(this.perchEl); } catch (e) { /* ignora */ } }
        }
        if (this.t > this.dur) { if (this.perchEl) this._fall(); else this._idle(); }
        break;
      case S.SLEEP:
        if (this.t > this.dur) {
          this.sleepPhase++;
          if (this.sleepPhase === 1) this._enter(S.SLEEP, 'Sleep', rnd(8, 16));
          else if (this.sleepPhase === 2) this._enter(S.SLEEP, 'Sleep_Wake');
          else this._idle();
        }
        break;
      case S.CRAWL:
        a.x += this.dir * o.crawlSpeed * dt;
        if (a.x > this.right - m || a.x < this.left + m) { this.dir = -this.dir; a.x = clamp(a.x, this.left + m, this.right - m); }
        if (this.t > this.dur) this._idle();
        break;
      case S.TRIP:
        if (this.t < 0.6) a.x = clamp(a.x + this.dir * o.walkSpeed * (1 - this.t / 0.6) * dt, this.left + m, this.right - m);
        if (this.t > this.dur) this._idle();
        break;
      case S.JUMP:
        if (this.t > 0.3) {
          const u = clamp((this.t - 0.3) / this.jumpTime, 0, 1);
          a.x = this.jumpFrom.x + (this.jumpTo.x - this.jumpFrom.x) * u;
          a.y = this.jumpFrom.y + (this.jumpTo.y - this.jumpFrom.y) * u - 4 * this.jumpH * u * (1 - u);
          if (u >= 1) {
            a.x = this.jumpTo.x; a.y = this.jumpTo.y;
            if (this.pendingPerch) {
              this.perchEl = this.pendingPerch; this.pendingPerch = null; this._pt = 0; this._act('Sit_Swing', rnd(7, 13));
              if (this.opts.onPerch) { try { this.opts.onPerch(this.perchEl); } catch (e) { /* ignora */ } }
            }
            else this._enter(S.LAND, 'Land');
          }
        }
        break;
      case S.FALL:
        this.vel.y += o.gravity * dt; a.y += this.vel.y * dt;
        a.x = clamp(a.x, this.left + m, this.right - m);
        if (a.y >= this.floor) { a.y = this.floor; this._enter(S.LAND, 'Land'); }
        break;
      case S.LAND:
        if (this.t > this.dur) { if (this.pendingClickEmote) { this.pendingClickEmote = false; this._toGroundMode(); this._emote(); } else this._idle(); }
        break;
      case S.CLIMB:
        a.y -= o.climbSpeed * dt;
        if (a.y - this.bodyH <= this.ceil) {
          this.mode = 'ceiling'; a.y = this.ceil;
          this.dir = a.x > this.mid ? -1 : 1;
          a.x = clamp(a.x, this.left + m, this.right - m);
          this._enter(S.CEILING, 'Walk_Ceiling', rnd(4, 9));
        } else if (this.t > this.dur) this._enter(S.DESCEND, 'Climb', 999, -1);
        break;
      case S.DESCEND:
        a.y += o.climbSpeed * dt;
        if (a.y >= this.floor) this._idle();
        break;
      case S.CEILING:
        a.x += this.dir * o.walkSpeed * 0.8 * dt;
        if (a.x > this.right - m || a.x < this.left + m) { this.dir = -this.dir; a.x = clamp(a.x, this.left + m, this.right - m); }
        if (this.t > this.dur) this._fall();
        break;
      case S.PEEK:
        if (this.t > this.dur) { this._walk(); this.dir = a.x < this.mid ? 1 : -1; }
        break;
      case S.DRAG:
        a.x = this.ptr.x - this.drag.dx; a.y = this.ptr.y - this.drag.dy;
        break;
      case S.VANISH:
        if (this.t > this.dur) {
          a.x = rnd(this.left + m * 2, Math.max(this.right - m * 2, this.left + m * 2 + 1)); a.y = this.floor;
          this._enter(S.APPEAR, 'Appear');
        }
        break;
      case S.APPEAR: if (this.t > this.dur) this._idle(); break;
    }
    if ((this.state === S.CLIMB || this.state === S.DESCEND) && a.y > this.floor) a.y = this.floor;
    if (this.mode === 'ceiling') a.y = this.ceil;
    if (GROUND_STATES.has(this.state) && this.mode === 'ground' && !this.perchEl) {
      // desliza suavemente quando o chão muda (barra de preço entrando/saindo)
      const d = this.floor - a.y;
      a.y = Math.abs(d) < 0.5 ? this.floor : a.y + d * Math.min(1, dt * 12);
    }
  }

  _orient(dt) {
    let yaw = 0;
    switch (this.state) {
      case S.WALK: case S.CRAWL: case S.TRIP: case S.JUMP: yaw = this.dir * Math.PI * 0.375; break;
      case S.CEILING: yaw = -this.dir * Math.PI * 0.375; break;
      case S.CLIMB: case S.DESCEND: yaw = this.mode === 'wall_r' ? Math.PI / 2 : -Math.PI / 2; break;
    }
    this.facing = lerpAngle(this.facing, yaw, 1 - Math.exp(-10 * dt));
    this.model.rotation.y = this.facing;
    let roll = this.mode === 'ceiling' ? Math.PI : 0;
    if (this.state === S.DRAG) roll = Math.sin(performance.now() * 0.006) * 0.12;
    this.pivot.rotation.z = this.mode === 'ceiling' ? roll : THREE.MathUtils.lerp(this.pivot.rotation.z, roll, 1 - Math.exp(-8 * dt));
  }

  _effects(dt) {
    const p = 0.88 + 0.12 * Math.sin(performance.now() * 0.003);
    let on = true;
    this.glitch.jit = { x: 0, y: 0 };
    this.model.visible = true;
    if (this.cur === 'Shrug' && this.curAction) {
      const a = this.curAction.time;
      on = !((a > 0.75 && a < 0.88) || (a > 1.02 && a < 1.15));
    } else if (this.cur === 'Emote_Glitch') {
      const g = this.glitch;
      g.timer -= dt;
      if (g.timer <= 0) {
        g.timer = rnd(0.04, 0.12); g.on = Math.random() > 0.35; g.vis = Math.random() > 0.15;
        g.j = Math.random() < 0.4 ? { x: rnd(-7, 7), y: rnd(-3, 3) } : { x: 0, y: 0 };
      }
      on = g.on; this.glitch.jit = g.j || this.glitch.jit;   // só treme; nunca some
    }
    for (const m of this.neon) {
      if (on) m.color.setRGB(p, 0.13 * p, 0.09 * p, THREE.SRGBColorSpace); else m.color.setRGB(0.05, 0, 0, THREE.SRGBColorSpace);
    }
  }

  _origin() {
    const oy = this.mode === 'ceiling' ? this.H / 2 - this.camY * this.ppm : this.H / 2 + this.camY * this.ppm;
    return { x: this.W / 2, y: oy };
  }
  _place() {
    const o = this._origin(), a = this.anchor, j = this.glitch.jit || { x: 0, y: 0 };
    this.cx = a.x - o.x + (j.x || 0);
    this.cy = a.y - o.y + (j.y || 0);
    this.canvas.style.transform = `translate3d(${this.cx.toFixed(1)}px, ${this.cy.toFixed(1)}px, 0)`;
  }
  _bounds() {
    if (!this.skeleton) return;
    this.scene.updateMatrixWorld();
    const v = new THREE.Vector3();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const b of this.skeleton.bones) {
      b.getWorldPosition(v).project(this.camera);
      const px = (v.x * 0.5 + 0.5) * this.W, py = (1 - (v.y * 0.5 + 0.5)) * this.H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const m = 0.2 * this.ppm;
    this.hitRect = { x0: this.cx + x0 - m, x1: this.cx + x1 + m, y0: this.cy + y0 - m, y1: this.cy + y1 + m * 0.4 };
  }

  // ------------------------------------------------------------ API pública
  emote(name) {
    this._toGroundMode(); this.perchEl = null;
    if (!name) this._emote(); else if (name === 'Vanish') this._vanish(); else this._act(name);
  }
  play(name, seconds) { this._toGroundMode(); this._act(name, seconds); }
  get animations() { return Object.keys(this.actions); }
}

export async function start(options = {}) {
  if (window.__shadowShimeji) return window.__shadowShimeji;
  const s = new Shimeji(options);
  window.__shadowShimeji = s;
  try { await s.start(); } catch (e) { console.error('SHADOW: não consegui iniciar', e); delete window.__shadowShimeji; throw e; }
  return s;
}
