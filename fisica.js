// fisica.js — o Mestre interage com as letras e os detalhes do site.
//  • Letras dos títulos, selos ("75% OFF") e ícones viram corpos com mola: reagem quando ele passa, pula,
//    é arremessado ou faz um emote (onda de choque, spray, fogo, glitch, apontar para a oferta).
//  • Tudo tem intervalo mínimo entre efeitos e volta sozinho ao lugar, para não cansar.
//  • Desligado automaticamente com "reduzir movimento" no sistema.
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const TEXT_SEL = 'h1 span, h2 span, .mm-neon, .mm-glitch';
const OBJ_SEL = '.mm-chip, .mm-step-ic, .mm-card svg, .mm-tt svg';
const MOVING = new Set([1, 4, 6, 9, 10, 11, 13]); // andar, rastejar, pular, escalar, descer, teto, arrastar

export function iniciarFisica(sh) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const style = document.createElement('style');
  style.textContent = `
.mm-fxl{display:inline-block}
.mm-fx-spray{color:#FF3B45;text-shadow:0 0 14px rgba(255,36,23,.95),0 0 2px #fff;transition:color 1.2s,text-shadow 1.2s}
.mm-fx-fire{color:#FF8A1E;text-shadow:0 0 12px #ff5a00,0 -4px 10px #ffb347;animation:mmFxFire .18s steps(2) infinite}
@keyframes mmFxFire{50%{filter:brightness(1.4)}}
.mm-fx-glitch{color:#fff;text-shadow:-3px 0 #00e5ff,3px 0 #E50914}
.mm-fx-ring{position:fixed;z-index:17;pointer-events:none;border-radius:50%;border:2px solid rgba(255,59,69,.75);box-shadow:0 0 24px rgba(229,9,20,.55),inset 0 0 24px rgba(229,9,20,.25);will-change:transform,opacity}
.mm-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`;
  document.head.appendChild(style);

  const groups = [];            // { el, bodies:[...], vis }
  const bodyOf = new WeakMap();
  const active = new Set();
  const waves = [];
  const timers = new Set();
  let raf = 0, last = 0, lastReact = 0, destroyed = false;
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  const newBody = (el) => { const b = { el, x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, k: 55, c: 6.2, cd: 0 }; bodyOf.set(el, b); return b; };
  const wake = (b) => { if (!active.has(b)) { active.add(b); b.el.style.willChange = 'transform'; } if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const paused = () => document.hidden || !!document.querySelector('dialog[open]');

  // ---------------------------------------------------------------- letras e objetos
  const io = new IntersectionObserver((en) => {
    for (const e of en) { const g = e.target.__fxg; if (g) g.vis = e.isIntersecting; }
  }, { rootMargin: '120px' });

  function splitText(el) {
    const txt = el.textContent;
    el.textContent = '';
    const sr = document.createElement('span'); sr.className = 'mm-sr'; sr.textContent = txt; el.appendChild(sr);
    const bodies = [];
    el.setAttribute('data-fxsplit', '1');
    txt.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(' ')); return; }
      const w = document.createElement('span');
      w.style.cssText = 'display:inline-block;white-space:nowrap';
      w.setAttribute('aria-hidden', 'true');
      for (const ch of part) {
        const l = document.createElement('span'); l.className = 'mm-fxl'; l.textContent = ch;
        w.appendChild(l); bodies.push(newBody(l));
      }
      el.appendChild(w);
    });
    return bodies;
  }

  function register(el, bodies) {
    const g = { el, bodies, vis: false };
    el.__fxg = g; groups.push(g); io.observe(el);
  }

  function scan() {
    document.querySelectorAll(TEXT_SEL).forEach((el) => {
      if (el.__fxg || el.__fxwait === 'skip' || el.classList.contains('mm-sr') || el.classList.contains('mm-fxl') || el.hasAttribute('aria-hidden') || el.closest('dialog,.mm-tick,.mm-snd-txt,[data-fxsplit]')) return;
      if (el.childNodes.length !== 1 || el.firstChild.nodeType !== 3 || el.textContent.trim().length < 2) { el.__fxwait = 'skip'; return; }
      if (el.hasAttribute('data-hyper')) {
        // espera o efeito de "decodificar" terminar antes de dividir em letras
        if (!el._mmDone) return;
        if (!el.__fxwait) { el.__fxwait = performance.now(); return; }
        if (performance.now() - el.__fxwait < 1100) return;
      }
      register(el, splitText(el));
    });
    document.querySelectorAll(OBJ_SEL).forEach((el) => { if (!el.__fxg) register(el, [newBody(el)]); });
  }
  scan();
  const scanTimer = setInterval(scan, 1500);

  // ---------------------------------------------------------------- simulação
  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (!paused()) { stepWaves(dt); integrate(dt); }
    if (active.size || waves.length) raf = requestAnimationFrame(frame);
  }

  function integrate(dt) {
    for (const b of active) {
      b.cd -= dt;
      b.vx += (-b.k * b.x - b.c * b.vx) * dt;
      b.vy += (-b.k * b.y - b.c * b.vy) * dt;
      b.vr += (-b.k * 1.4 * b.r - b.c * 0.9 * b.vr) * dt;
      b.x = clamp(b.x + b.vx * dt, -220, 220);
      b.y = clamp(b.y + b.vy * dt, -220, 220);
      b.r = clamp(b.r + b.vr * dt, -1.2, 1.2);
      if (Math.abs(b.x) < 0.15 && Math.abs(b.y) < 0.15 && Math.abs(b.r) < 0.002 &&
          Math.abs(b.vx) < 2 && Math.abs(b.vy) < 2 && Math.abs(b.vr) < 0.05) {
        b.x = b.y = b.r = b.vx = b.vy = b.vr = 0;
        b.el.style.transform = ''; b.el.style.willChange = ''; active.delete(b);
      } else {
        b.el.style.transform = `translate3d(${b.x.toFixed(2)}px,${b.y.toFixed(2)}px,0) rotate(${b.r.toFixed(3)}rad)`;
      }
    }
  }

  const center = (b) => {
    const r = b.el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - b.x, y: r.top + r.height / 2 - b.y, w: r.width, h: r.height };
  };

  // Onda de choque: um anel que se expande e empurra cada corpo quando a frente passa por ele.
  function wave(x, y, power, maxR = 700, speed = 950) {
    if (paused()) return;
    waves.push({ x, y, t: 0, power, maxR, speed, hit: new WeakSet() });
    const d = maxR * 2;
    const ring = document.createElement('div');
    ring.className = 'mm-fx-ring';
    ring.style.cssText += `left:${x - maxR}px;top:${y - maxR}px;width:${d}px;height:${d}px`;
    document.body.appendChild(ring);
    const a = ring.animate([{ transform: 'scale(0.03)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }],
      { duration: (maxR / speed) * 1000, easing: 'linear' });
    a.onfinish = () => ring.remove();
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function stepWaves(dt) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; w.t += dt;
      const R = w.speed * w.t;
      if (R > w.maxR + 80) { waves.splice(i, 1); continue; }
      for (const g of groups) {
        if (!g.vis) continue;
        const gr = g.el.getBoundingClientRect();
        const nx = clamp(w.x, gr.left, gr.right), ny = clamp(w.y, gr.top, gr.bottom);
        const dmin = Math.hypot(nx - w.x, ny - w.y);
        if (dmin > R) continue;                    // a frente ainda não chegou
        const dmax = Math.max(Math.hypot(gr.left - w.x, gr.top - w.y), Math.hypot(gr.right - w.x, gr.top - w.y),
          Math.hypot(gr.left - w.x, gr.bottom - w.y), Math.hypot(gr.right - w.x, gr.bottom - w.y));
        if (dmax < R - 120) continue;              // a frente já passou
        for (const b of g.bodies) {
          if (w.hit.has(b)) continue;
          const c = center(b);
          const d = Math.hypot(c.x - w.x, c.y - w.y) || 1;
          if (d > R) continue;
          w.hit.add(b);
          const f = w.power * Math.max(0.15, 1 - d / w.maxR);
          b.vx += ((c.x - w.x) / d) * f * 0.8;
          b.vy += ((c.y - w.y) / d) * f * 0.5 - f * 0.95;
          b.vr += rnd(-1, 1) * (f / 120);
          wake(b);
        }
      }
    }
  }

  // Empurrão: o corpo do personagem esbarra nas letras enquanto anda, escala, pula ou é arrastado.
  function proximity() {
    if (destroyed || paused() || !MOVING.has(sh.state)) return;
    const m = sh.rect(); if (!m || !sh.model.visible) return;
    const mx = (m.left + m.right) / 2, hw = sh.ppm * 0.32;
    const zone = { l: mx - hw, r: mx + hw, t: m.top + sh.ppm * 0.2, b: m.bottom - sh.ppm * 0.1 };
    for (const g of groups) {
      if (!g.vis) continue;
      const gr = g.el.getBoundingClientRect();
      if (gr.right < zone.l || gr.left > zone.r || gr.bottom < zone.t || gr.top > zone.b) continue;
      for (const b of g.bodies) {
        if (b.cd > 0) continue;
        const c = center(b);
        if (c.x < zone.l || c.x > zone.r || c.y < zone.t || c.y > zone.b) continue;
        const dir = c.x < mx ? -1 : 1;
        b.vx += dir * rnd(170, 270); b.vy -= rnd(130, 240); b.vr += dir * rnd(2.5, 6);
        b.cd = 0.6; wake(b);
      }
    }
  }
  const proxTimer = setInterval(proximity, 70);

  // ---------------------------------------------------------------- reações aos movimentos
  const here = () => {
    const m = sh.rect(); if (!m) return null;
    return { x: (m.left + m.right) / 2, y: (m.top + m.bottom) / 2 - sh.ppm * 0.1 };
  };
  function nearestText(minLetters = 3) {
    const p = here(); if (!p) return null;
    let best = null, bd = Infinity;
    for (const g of groups) {
      if (!g.vis || g.bodies.length < minLetters || g.bodies[0].el.className !== 'mm-fxl') continue;
      const r = g.el.getBoundingClientRect();
      if (r.bottom < 90 || r.top > innerHeight) continue;
      const d = Math.hypot((r.left + r.right) / 2 - p.x, (r.top + r.bottom) / 2 - p.y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  function paint(g, cls, ms, stagger = 35) {
    g.bodies.forEach((b, i) => {
      later(() => { b.el.classList.add(cls); }, i * stagger);
      later(() => { b.el.classList.remove(cls); }, i * stagger + ms);
    });
  }
  function jiggle(g, power = 260, stagger = 35) {
    g.bodies.forEach((b, i) => later(() => { b.vy -= power * rnd(0.8, 1.1); b.vr += rnd(-2.5, 2.5); wake(b); }, i * stagger));
  }
  function glitch(g) {
    g.bodies.forEach((b) => {
      let n = 0;
      const tick = () => {
        b.el.classList.toggle('mm-fx-glitch', Math.random() < 0.5);
        if (++n < 7) later(tick, rnd(50, 110)); else b.el.classList.remove('mm-fx-glitch');
      };
      later(tick, rnd(0, 200));
    });
  }
  function pulseOffer() {
    let best = null, bd = Infinity;
    const p = here(); if (!p) return;
    document.querySelectorAll('[data-mm-offer]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 90 || r.top > innerHeight - 20 || !r.width) return;
      const d = Math.hypot((r.left + r.right) / 2 - p.x, (r.top + r.bottom) / 2 - p.y);
      if (d < bd) { bd = d; best = el; }
    });
    if (best && best.animate) {
      best.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.045) rotate(-0.6deg)' },
        { transform: 'scale(0.99) rotate(0.4deg)' }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-out' });
    }
  }

  function anim(n) {
    if (destroyed || paused()) return;
    const now = performance.now();
    const p = here(); if (!p) return;
    const ready = (gap) => { if (now - lastReact < gap) return false; lastReact = now; return true; };
    switch (n) {
      case 'Emote_Angry': if (ready(7000)) later(() => wave(p.x, p.y, 950), 700); break;
      case 'Emote_Scared': if (ready(7000)) later(() => wave(p.x, p.y, 700, 620), 250); break;
      case 'Emote_Steam': if (ready(7000)) later(() => wave(p.x, p.y, 480, 560), 500); break;
      case 'Emote_Celebrate': case 'Emote_Dab': case 'Emote_Peace':
        if (ready(7000)) later(() => wave(p.x, p.y, 420, 520), 600); break;
      case 'Land':
        if (sh.vel && sh.vel.y > 1100 && ready(4000)) wave(p.x, p.y, 520, 560);
        break;
      case 'Emote_Graffiti': { if (!ready(7000)) break; const g = nearestText(); if (g) { paint(g, 'mm-fx-spray', 1700); jiggle(g, 90, 45); } break; }
      case 'Emote_Fire': { if (!ready(7000)) break; const g = nearestText(); if (g) { paint(g, 'mm-fx-fire', 2200, 55); jiggle(g, 150, 55); } break; }
      case 'Emote_Glitch': { if (!ready(7000)) break; const g = nearestText(); if (g) glitch(g); break; }
      case 'Emote_Point': if (ready(5000)) later(pulseOffer, 450); break;
      case 'Emote_Crown': { if (!ready(7000)) break; const g = nearestText(); if (g) jiggle(g, 200, 60); break; }
    }
  }


  // Poleiro: quando ele senta num título, selo, ícone ou cartão, o que está embaixo reage ao pouso e aos pés balançando.
  const groupsIn = (el) => groups.filter((g) => g.el === el || el.contains(g.el));
  function stomp(el, power = 210) {
    const m = sh.rect(); if (!m || paused() || destroyed) return;
    const x = (m.left + m.right) / 2, reach = sh.ppm * 1.0;
    for (const g of groupsIn(el)) {
      for (const b of g.bodies) {
        const d = Math.abs(center(b).x - x);
        if (d > reach) continue;
        later(() => { b.vy -= power * (1 - d / (reach * 1.15)) * rnd(0.8, 1.1); b.vr += rnd(-2, 2); wake(b); }, d * 0.7);
      }
    }
  }
  function perch(el) {
    const m = sh.rect(); if (!m || paused() || destroyed) return;
    const r = el.getBoundingClientRect();
    wave((m.left + m.right) / 2, r.top + 6, 620, 300, 800);
    stomp(el, 330);
  }
  // ---------------------------------------------------------------- o visitante também pode cutucar
  const onDown = (e) => {
    const t = e.target && e.target.closest && e.target.closest('.mm-fxl, .mm-chip, .mm-step-ic');
    const b = t && bodyOf.get(t);
    if (!b || b.cd > 0) return;
    b.vy -= rnd(320, 420); b.vx += rnd(-80, 80); b.vr += rnd(-4, 4); b.cd = 0.3; wake(b);
  };
  addEventListener('pointerdown', onDown, { passive: true });

  return {
    anim, wave, perch, stomp,
    destroy() {
      destroyed = true;
      clearInterval(scanTimer); clearInterval(proxTimer); cancelAnimationFrame(raf);
      timers.forEach(clearTimeout); io.disconnect();
      removeEventListener('pointerdown', onDown);
      active.forEach((b) => { b.el.style.transform = ''; });
    },
  };
}
