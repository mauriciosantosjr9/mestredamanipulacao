/* admin.js — painel privado do Mestre da Manipulação.
   Login (Supabase Auth) + leitura dos eventos protegida por RLS: só o dono do e-mail configurado consegue ler. */
(function () {
  'use strict';
  const C = window.MM_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  const pctS = (a, b) => pct(a, b).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

  const SRC = {
    tiktok: ['TikTok', '#25F4EE'], instagram: ['Instagram', '#E1306C'], kwai: ['Kwai', '#FF7A00'],
    shorts: ['YouTube Shorts', '#FF2A2A'], youtube: ['YouTube', '#C4302B'], google: ['Google', '#4285F4'],
    facebook: ['Facebook', '#1877F2'], whatsapp: ['WhatsApp', '#25D366'], telegram: ['Telegram', '#229ED9'],
    direto: ['Direto / sem origem', '#9CA3AF']
  };
  const EXTRA = ['#B388FF', '#FFD54F', '#80CBC4', '#F48FB1', '#A1887F', '#90CAF9'];
  const srcLabel = (k) => (SRC[k] ? SRC[k][0] : (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Desconhecido'));
  const srcColor = (k, i) => (SRC[k] ? SRC[k][1] : EXTRA[(i || 0) % EXTRA.length]);
  const BTN = { hero: 'Botão principal (topo)', card_oferta: 'Card da oferta', cabecalho: 'Cabeçalho', barra_fixa: 'Barra fixa (celular)',
    faq: 'Garantia / FAQ', cta_final: 'Chamada final', dialogo: 'Pagamento (diálogo)' };
  const DEV = { mobile: ['Celular', '#E50914'], desktop: ['Computador', '#B388FF'], tablet: ['Tablet', '#FFD54F'] };

  const state = { sb: null, demo: false, period: '7', metric: 'sessions', src: null, events: [], sessions: [], prev: [], all: [], maxId: 0, since: 0, page: 0, timer: 0, loading: false, first: true };
  const PAGE = 20;

  // ------------------------------------------------------------------ telas
  function show(id) { ['setup', 'login', 'app'].forEach((x) => { $('#' + x).hidden = x !== id; }); }

  async function boot() {
    state.demo = new URLSearchParams(location.search).get('demo') === '1';
    if (state.demo) { show('app'); $('#demoBanner').hidden = false; wire(); initAssistant(); load(); state.timer = setInterval(poll, 12000); return; }
    if (!C.supabaseUrl || !C.supabaseKey || !window.supabase) { show('setup'); return; }
    state.sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await state.sb.auth.getSession();
    if (data && data.session) enter(); else show('login');
    state.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { clearInterval(state.timer); show('login'); } });
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = $('#loginBtn'), er = $('#loginErr'); er.hidden = true; b.disabled = true; b.textContent = 'Entrando…';
      const { error } = await state.sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#senha').value });
      b.disabled = false; b.textContent = 'Entrar';
      if (error) { er.textContent = 'E-mail ou senha incorretos.'; er.hidden = false; return; }
      $('#senha').value = ''; enter();
    });
  }

  function enter() {
    try { localStorage.setItem('mm-owner', '1'); } catch (e) { /* ignora */ }   // suas visitas não entram nas estatísticas
    show('app'); wire(); initAssistant(); load();
    clearInterval(state.timer);
    state.timer = setInterval(poll, 15000);   // novos eventos a cada 15 s (só o que chegou depois)
  }

  function initAssistant() {
    if (!window.MestreAI) return;
    window.MestreAI.init({
      state, demo: state.demo,
      h: { esc, fmt, pct, pctS, srcLabel, srcColor, BTN, DEV, SRC: Object.keys(SRC) },
      act: {
        setPeriod: (p) => { const b = $('#period button[data-p="' + p + '"]'); if (b) b.click(); },
        setSrc: (k) => setSrc(k), exportCsv, refresh: () => load(),
        focus: (sel) => { const el = $(sel); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); },
        link: async (k) => { const u = new URL('./', location.href).href + '?utm_source=' + k + '&utm_medium=bio'; try { await navigator.clipboard.writeText(u); return true; } catch (e) { return false; } }
      }
    });
  }

  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    $('#period').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.period = b.dataset.p; $$('#period button').forEach((x) => x.classList.toggle('on', x === b)); load(); });
    $('#metric').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.metric = b.dataset.m; $$('#metric button').forEach((x) => x.classList.toggle('on', x === b)); drawSources(); });
    $('#refresh').addEventListener('click', () => load());
    $('#logout').addEventListener('click', async () => { if (state.demo) { location.href = 'admin.html'; return; } try { localStorage.removeItem('mm-owner'); } catch (e) { /* ignora */ } await state.sb.auth.signOut(); });
    $('#csv').addEventListener('click', exportCsv);
    $('#q').addEventListener('input', () => { state.page = 0; drawTable(); });
    $('#onlyAct').addEventListener('change', () => { state.page = 0; drawTable(); });
    $('#prev').addEventListener('click', () => { if (state.page > 0) { state.page--; drawTable(); } });
    $('#next').addEventListener('click', () => { state.page++; drawTable(); });
    $('#filterBar').addEventListener('click', (e) => { if (e.target.closest('button')) { setSrc(null); } });
  }

  // ------------------------------------------------------------------ dados
  function sinceDate() {
    const n = new Date();
    if (state.period === 'today') return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (state.period === 'all') return new Date(2020, 0, 1);
    return new Date(Date.now() - Number(state.period) * 864e5);
  }

  // Busca o período escolhido + o período anterior do mesmo tamanho (para o assistente comparar tendências).
  async function fetchEvents(from) {
    if (state.demo) return demoEvents(from);
    const since = from.toISOString(), out = [];
    for (let p = 0; p < 40; p++) {
      const { data, error } = await state.sb.from('events').select('*').gte('created_at', since).order('created_at', { ascending: false }).range(p * 1000, p * 1000 + 999);
      if (error) throw error;
      out.push.apply(out, data);
      if (data.length < 1000) break;
    }
    return out;
  }

  function recompute() {
    state.all = buildSessions(state.events);
    state.sessions = state.all.filter((s) => s.t0 >= state.since);
    state.prev = state.period === 'all' ? [] : state.all.filter((s) => s.t0 < state.since);
    state.maxId = state.events.reduce((m, e) => Math.max(m, Number(e.id) || 0), state.maxId);
  }

  async function load(silent) {
    if (state.loading) return; state.loading = true;
    if (!silent) skeleton();
    try {
      const since = sinceDate(); state.since = since.getTime();
      const from = state.period === 'all' ? since : new Date(since.getTime() - (Date.now() - since.getTime()));
      state.events = await fetchEvents(from);
      recompute();
      render(!silent);
    } catch (err) {
      $('#kpis').innerHTML = '<div class="card span2"><h2>Não foi possível carregar</h2><p class="muted">' + esc(err && err.message ? err.message : err) + '</p><p class="muted">Confira se o <code>supabase-setup.sql</code> foi executado com o seu e-mail e se você entrou com esse mesmo e-mail.</p></div>';
    }
    state.loading = false;
  }

  // Atualização incremental: busca só os eventos novos (id maior que o último visto) e avisa o assistente.
  async function poll() {
    if (state.loading || document.hidden) return;
    let fresh = [];
    try {
      if (state.demo) fresh = demoNew();
      else {
        const { data, error } = await state.sb.from('events').select('*').gt('id', state.maxId).order('id', { ascending: true }).limit(1000);
        if (error) throw error; fresh = data || [];
      }
    } catch (e) { return; }
    if (!fresh.length) { updateLive(); return; }
    state.events = fresh.concat(state.events);
    recompute(); render(false);
    if (window.MestreAI) window.MestreAI.onNewEvents(fresh);
  }

  function buildSessions(events) {
    const S = new Map();
    for (const e of events) {
      const t = Date.parse(e.created_at);
      let s = S.get(e.sid);
      if (!s) { s = { sid: e.sid, vid: e.vid, t0: t, t1: t, source: e.source || 'direto', medium: e.medium, campaign: e.campaign, device: e.device, browser: e.browser, os: e.os, tz: e.tz, scroll: 0, cta: 0, checkout: 0, labels: {}, dur: 0, pv: 0 }; S.set(e.sid, s); }
      if (t < s.t0) s.t0 = t; if (t > s.t1) s.t1 = t;
      if (e.type === 'pageview') s.pv++;
      else if (e.type === 'scroll') s.scroll = Math.max(s.scroll, Number(e.value) || 0);
      else if (e.type === 'cta_click') { s.cta++; s.labels[e.label] = (s.labels[e.label] || 0) + 1; }
      else if (e.type === 'checkout_click') { s.checkout++; s.labels[e.label || 'dialogo'] = (s.labels[e.label || 'dialogo'] || 0) + 1; }
      else if (e.type === 'leave' || e.type === 'engaged') s.dur = Math.max(s.dur, Number(e.value) || 0);
    }
    return Array.from(S.values()).sort((a, b) => b.t1 - a.t1);
  }

  const view = () => (state.src ? state.sessions.filter((s) => s.source === state.src) : state.sessions);

  // ------------------------------------------------------------------ desenho
  function skeleton() { $('#kpis').innerHTML = '<div class="kpi"><div class="skel" style="height:60px"></div></div>'.repeat(5); }

  function updateLive() { $('#liveN').textContent = state.all.filter((s) => Date.now() - s.t1 < 5 * 60e3).length; }

  function render(animate) {
    const v = view();
    updateLive();
    const fb = $('#filterBar');
    fb.hidden = !state.src;
    if (state.src) fb.innerHTML = '<span>Filtrando por <b>' + esc(srcLabel(state.src)) + '</b></span><button class="btn ghost" type="button">Limpar filtro ✕</button>';

    const uniq = new Set(v.map((s) => s.vid || s.sid)).size;
    const cta = v.filter((s) => s.cta > 0).length, ck = v.filter((s) => s.checkout > 0).length;
    const avgScroll = v.length ? Math.round(v.reduce((a, s) => a + s.scroll, 0) / v.length) : 0;
    const kp = [
      ['Visitantes únicos', uniq, '', ''], ['Visitas (sessões)', v.length, '', ''],
      ['Clicaram em comprar', cta, pctS(cta, v.length) + ' das visitas', 'red'],
      ['Foram ao checkout', ck, pctS(ck, v.length) + ' das visitas', 'green'],
      ['Rolagem média', avgScroll, 'da página', '']
    ];
    $('#kpis').innerHTML = kp.map((k, i) => '<div class="kpi ' + k[3] + '" style="animation-delay:' + i * 60 + 'ms"><small>' + k[0] + '</small><b data-to="' + k[1] + '">0</b><em>' + esc(k[2] || ' ') + '</em></div>').join('');
    $$('#kpis b').forEach((b, i) => count(b, kp[i][1], i === 4 ? '%' : ''));

    drawSources(); drawLine(); drawFunnel(); drawButtons(); drawDevices(); drawLinks(); drawHours(); drawWeek(); drawTable();
    if (window.MestreAI) window.MestreAI.update(state.first); state.first = false;
  }

  // --- melhores horários e dias da semana ------------------------------------------
  function bars(box, labels, a, b, bestIdx, unit) {
    const max = Math.max(1, Math.max.apply(null, a));
    box.innerHTML = '<div class="bars-v">' + a.map((val, i) => '<div class="bv' + (i === bestIdx && val ? ' best' : '') + '" data-i="' + i + '"><div class="bcol"><i class="b1" style="height:' + (val / max) * 100 + '%"></i><i class="b2" style="height:' + (b[i] / max) * 100 + '%"></i></div><span>' + labels[i] + '</span></div>').join('') + '</div>';
    $$('.bv', box).forEach((el) => {
      const i = +el.dataset.i;
      el.addEventListener('mousemove', (e) => tip(e, '<b>' + esc(labels[i]) + (unit || '') + '</b><br>Visitas: <b>' + a[i] + '</b><br>Foram ao checkout: <b>' + b[i] + '</b>'));
      el.addEventListener('mouseleave', () => tip(null));
    });
  }
  function drawHours() {
    const v = view(), a = Array(24).fill(0), b = Array(24).fill(0);
    v.forEach((s) => { const h = new Date(s.t0).getHours(); a[h]++; if (s.checkout) b[h]++; });
    let best = -1, bv = 0; a.forEach((x, i) => { if (x > bv) { bv = x; best = i; } });
    bars($('#hoursChart'), a.map((_, i) => String(i).padStart(2, '0')), a, b, best, 'h');
    $('#hoursBest').textContent = best >= 0 ? 'Pico: ' + String(best).padStart(2, '0') + 'h–' + String((best + 1) % 24).padStart(2, '0') + 'h (' + bv + ' visitas)' : 'Sem dados ainda';
  }
  function drawWeek() {
    const v = view(), a = Array(7).fill(0), b = Array(7).fill(0), names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    v.forEach((s) => { const d = new Date(s.t0).getDay(); a[d]++; if (s.checkout) b[d]++; });
    let best = -1, bv = 0; a.forEach((x, i) => { if (x > bv) { bv = x; best = i; } });
    bars($('#weekChart'), names, a, b, best, '');
    $('#weekBest').textContent = best >= 0 ? 'Melhor dia: ' + names[best] + ' (' + bv + ' visitas)' : 'Sem dados ainda';
  }

  function count(el, to, suf) {
    const t0 = performance.now(), D = 900;
    (function step(t) { const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(Math.round(to * e)) + (suf || ''); if (p < 1) requestAnimationFrame(step); })(t0);
  }

  // --- pizza -------------------------------------------------------------
  function donut(box, legend, items, centerLabel, onPick, selected) {
    const total = items.reduce((a, i) => a + i.value, 0);
    const R = 74, CIRC = 2 * Math.PI * R;
    if (!total) {
      box.innerHTML = '<svg class="donut" viewBox="0 0 200 200"><circle cx="100" cy="100" r="74" fill="none" stroke="#1c1c1c" stroke-width="26" stroke-dasharray="4 6"/><text class="dnum" x="100" y="108">0</text></svg>';
      legend.innerHTML = '<li class="empty">Sem dados neste período ainda.</li>'; return;
    }
    let acc = 0;
    const slices = items.map((it) => { const len = (it.value / total) * CIRC; const s = { it, len, off: acc }; acc += len; return s; });
    box.innerHTML = '<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="Gráfico de pizza">' +
      '<circle cx="100" cy="100" r="74" fill="none" stroke="#151515" stroke-width="26"/>' +
      slices.map((s, i) => '<circle class="slice" data-i="' + i + '" cx="100" cy="100" r="74" stroke="' + s.it.color + '" stroke-dasharray="0 ' + CIRC + '" stroke-dashoffset="' + (-s.off) + '" transform="rotate(-90 100 100)"/>').join('') +
      '<text class="dnum" x="100" y="104">' + fmt(total) + '</text><text class="dlbl" x="100" y="124">' + esc(centerLabel) + '</text></svg>';
    const gap = slices.length > 1 ? 2.5 : 0;
    requestAnimationFrame(() => requestAnimationFrame(() => { $$('.slice', box).forEach((c, i) => { c.setAttribute('stroke-dasharray', Math.max(0.5, slices[i].len - gap) + ' ' + CIRC); }); }));
    legend.innerHTML = items.map((it, i) => '<li data-i="' + i + '" class="' + (selected === it.key ? 'sel' : '') + '"><i style="background:' + it.color + '"></i><span class="n">' + esc(it.label) + '</span><span class="v">' + fmt(it.value) + '</span><span class="p">' + pctS(it.value, total) + '</span></li>').join('');
    const num = $('.dnum', box), lbl = $('.dlbl', box);
    const hot = (i) => {
      $$('.slice', box).forEach((c, j) => c.classList.toggle('hot', j === i));
      $$('li', legend).forEach((l, j) => l.classList.toggle('hot', j === i));
      $('.donut', box).classList.toggle('dim', i >= 0);
      if (i >= 0) { num.textContent = pctS(items[i].value, total); lbl.textContent = items[i].label.slice(0, 18); }
      else { num.textContent = fmt(total); lbl.textContent = centerLabel; }
    };
    $$('.slice', box).forEach((c) => { c.addEventListener('mouseenter', () => hot(+c.dataset.i)); c.addEventListener('mouseleave', () => hot(-1)); c.addEventListener('click', () => onPick && onPick(items[+c.dataset.i])); });
    $$('li', legend).forEach((l) => { l.addEventListener('mouseenter', () => hot(+l.dataset.i)); l.addEventListener('mouseleave', () => hot(-1)); l.addEventListener('click', () => onPick && onPick(items[+l.dataset.i])); });
  }

  function groupBy(list, keyFn) { const m = {}; list.forEach((s) => { const k = keyFn(s); m[k] = (m[k] || 0) + 1; }); return m; }

  function drawSources() {
    const base = state.sessions;   // a pizza sempre mostra todas as fontes (o filtro só marca a fatia)
    const pick = state.metric === 'cta' ? base.filter((s) => s.cta > 0) : state.metric === 'checkout' ? base.filter((s) => s.checkout > 0) : base;
    const g = groupBy(pick, (s) => s.source || 'direto');
    const items = Object.keys(g).sort((a, b) => g[b] - g[a]).map((k, i) => ({ key: k, label: srcLabel(k), value: g[k], color: srcColor(k, i) }));
    donut($('#donutSrc'), $('#legendSrc'), items, state.metric === 'sessions' ? 'visitas' : state.metric === 'cta' ? 'cliques' : 'checkouts', (it) => setSrc(state.src === it.key ? null : it.key), state.src);
  }

  function setSrc(k) { state.src = k; state.page = 0; render(false); }

  // --- linhas por dia ------------------------------------------------------
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function drawLine() {
    const box = $('#lineChart'), v = view();
    if (!v.length) { box.innerHTML = '<div class="empty">Sem dados neste período ainda.</div>'; return; }
    const first = Math.min.apply(null, v.map((s) => s.t0)), start = new Date(first); start.setHours(0, 0, 0, 0);
    const days = []; for (let t = start.getTime(); t <= Date.now() + 36e5; t += 864e5) days.push(dayKey(t));
    const uniqDays = Array.from(new Set(days));
    const idx = {}; uniqDays.forEach((d, i) => { idx[d] = i; });
    const a = uniqDays.map(() => 0), b = uniqDays.map(() => 0), c = uniqDays.map(() => 0);
    v.forEach((s) => { const i = idx[dayKey(s.t0)]; if (i == null) return; a[i]++; if (s.cta) b[i]++; if (s.checkout) c[i]++; });
    const W = 800, H = 250, P = { l: 36, r: 12, t: 14, b: 26 };
    const max = Math.max(4, Math.max.apply(null, a)), n = uniqDays.length;
    const X = (i) => P.l + (n === 1 ? (W - P.l - P.r) / 2 : (i / (n - 1)) * (W - P.l - P.r));
    const Y = (val) => P.t + (1 - val / max) * (H - P.t - P.b);
    const path = (arr) => arr.map((val, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(val).toFixed(1)).join(' ');
    const ticks = 4;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Evolução por dia">';
    for (let i = 0; i <= ticks; i++) { const val = Math.round((max / ticks) * i), y = Y(val); svg += '<line class="gridl" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/><text class="axis" x="' + (P.l - 8) + '" y="' + (y + 3) + '" text-anchor="end">' + val + '</text>'; }
    const step = Math.max(1, Math.ceil(n / 7));
    uniqDays.forEach((d, i) => { if (i % step === 0) svg += '<text class="axis" x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + d.slice(8) + '/' + d.slice(5, 7) + '</text>'; });
    svg += '<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E50914" stop-opacity=".35"/><stop offset="1" stop-color="#E50914" stop-opacity="0"/></linearGradient></defs>';
    if (n > 1) svg += '<path d="' + path(a) + ' L' + X(n - 1) + ' ' + (H - P.b) + ' L' + X(0) + ' ' + (H - P.b) + ' Z" fill="url(#ga)"/>';
    const L = 2400;
    [[a, '#E50914'], [b, '#ffffff'], [c, '#2ECC71']].forEach((s) => { if (n > 1) svg += '<path class="ln" style="--L:' + L + '" d="' + path(s[0]) + '" stroke="' + s[1] + '"/>'; else svg += '<circle cx="' + X(0) + '" cy="' + Y(s[0][0]) + '" r="5" fill="' + s[1] + '"/>'; });
    svg += '<line class="cursor" id="cur" y1="' + P.t + '" y2="' + (H - P.b) + '" x1="0" x2="0" opacity="0"/></svg>';
    box.innerHTML = svg;
    const el = $('svg', box), cur = $('#cur', box);
    box.onmousemove = (e) => {
      const r = el.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
      let i = Math.round(((x - P.l) / (W - P.l - P.r)) * (n - 1)); i = Math.max(0, Math.min(n - 1, i)); if (n === 1) i = 0;
      cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('opacity', 1);
      tip(e, '<b>' + uniqDays[i].slice(8) + '/' + uniqDays[i].slice(5, 7) + '</b><br>Visitas: <b>' + a[i] + '</b><br>Cliques em comprar: <b>' + b[i] + '</b><br>Checkout: <b>' + c[i] + '</b>');
    };
    box.onmouseleave = () => { cur.setAttribute('opacity', 0); tip(null); };
  }

  function tip(e, html) {
    const t = $('#tip');
    if (!e) { t.hidden = true; return; }
    t.innerHTML = html; t.hidden = false;
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.min(innerWidth - w - 8, e.clientX + 16) + 'px';
    t.style.top = Math.max(8, Math.min(innerHeight - h - 8, e.clientY - h / 2)) + 'px';
  }

  // --- funil / botões / dispositivos ------------------------------------------
  function drawFunnel() {
    const v = view(), n = v.length;
    const steps = [['Visitaram o site', n, ''], ['Rolaram 50% ou mais', v.filter((s) => s.scroll >= 50).length, ''], ['Clicaram em comprar', v.filter((s) => s.cta > 0).length, ''], ['Foram ao checkout (Kiwify)', v.filter((s) => s.checkout > 0).length, 'g']];
    $('#funnel').innerHTML = steps.map((s, i) => '<div class="fr"><div class="t"><span>' + s[0] + '</span><b>' + fmt(s[1]) + '</b></div><div class="track"><div class="fill ' + s[2] + '" data-w="' + pct(s[1], n) + '"></div></div><small>' + (i ? pctS(s[1], steps[i - 1][1]) + ' da etapa anterior · ' : '') + pctS(s[1], n) + ' do total</small></div>').join('');
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#funnel .fill').forEach((f) => { f.style.width = f.dataset.w + '%'; })));
  }

  function drawButtons() {
    const cnt = {}, ck = {};
    view().forEach((s) => Object.keys(s.labels).forEach((l) => { if (l === 'dialogo') ck[l] = (ck[l] || 0) + s.labels[l]; else cnt[l] = (cnt[l] || 0) + s.labels[l]; }));
    const rows = Object.keys(cnt).map((k) => [BTN[k] || k, cnt[k]]).concat(ck.dialogo ? [[BTN.dialogo, ck.dialogo]] : []).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    $('#buttons').innerHTML = rows.length ? rows.map((r) => '<div class="fr"><div class="t"><span>' + esc(r[0]) + '</span><b>' + fmt(r[1]) + '</b></div><div class="track"><div class="fill" data-w="' + pct(r[1], max) + '"></div></div></div>').join('') : '<div class="empty">Nenhum clique registrado ainda.</div>';
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#buttons .fill').forEach((f) => { f.style.width = f.dataset.w + '%'; })));
  }

  function drawDevices() {
    const g = groupBy(view(), (s) => s.device || 'desktop');
    const items = Object.keys(g).sort((a, b) => g[b] - g[a]).map((k, i) => ({ key: k, label: DEV[k] ? DEV[k][0] : k, value: g[k], color: DEV[k] ? DEV[k][1] : EXTRA[i % EXTRA.length] }));
    donut($('#donutDev'), $('#legendDev'), items, 'visitas', null, null);
  }

  function drawLinks() {
    const base = new URL('./', location.href).href;
    const rows = [['tiktok', 'bio'], ['instagram', 'bio'], ['kwai', 'bio'], ['shorts', 'descricao']];
    $('#links').innerHTML = rows.map((r) => { const u = base + '?utm_source=' + r[0] + '&utm_medium=' + r[1]; return '<div class="lk"><i style="background:' + srcColor(r[0]) + '"></i><span>' + esc(srcLabel(r[0])) + '</span><code title="' + esc(u) + '">' + esc(u) + '</code><button class="btn ghost" type="button" data-u="' + esc(u) + '">Copiar</button></div>'; }).join('');
    $$('#links button').forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.u); b.textContent = 'Copiado ✓'; setTimeout(() => { b.textContent = 'Copiar'; }, 1500); } catch (e) { prompt('Copie o link:', b.dataset.u); } }));
  }

  // --- tabela -----------------------------------------------------------------------
  function rows() {
    const q = ($('#q').value || '').toLowerCase().trim(), act = $('#onlyAct').value;
    return view().filter((s) => {
      if (act === 'checkout' && !s.checkout) return false;
      if (act === 'cta' && !(s.cta && !s.checkout)) return false;
      if (act === 'none' && (s.cta || s.checkout)) return false;
      if (!q) return true;
      return [srcLabel(s.source), s.source, s.campaign, s.medium, s.device, s.browser, s.os].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  const when = (t) => { const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const dur = (s) => (s >= 60 ? Math.floor(s / 60) + 'min ' + (s % 60) + 's' : s ? s + 's' : '—');
  function drawTable() {
    const r = rows(), pages = Math.max(1, Math.ceil(r.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    const slice = r.slice(state.page * PAGE, state.page * PAGE + PAGE);
    $('#tbl tbody').innerHTML = slice.length ? slice.map((s, i) => {
      const act = s.checkout ? '<span class="badge b-ck">Foi ao checkout</span>' : s.cta ? '<span class="badge b-cta">Clicou em comprar</span>' : '<span class="badge b-no">Só visitou</span>';
      return '<tr><td>' + when(s.t0) + '</td><td><span class="pill"><i style="background:' + srcColor(s.source, i) + '"></i>' + esc(srcLabel(s.source)) + '</span></td><td>' + esc(s.campaign || s.medium || '—') +
        '</td><td>' + esc((DEV[s.device] ? DEV[s.device][0] : s.device || '—') + ' · ' + (s.browser || '') + (s.os ? ' / ' + s.os : '')) + '</td><td><span class="mini"><b style="width:' + Math.min(100, s.scroll) + '%"></b></span>' + (s.scroll || 0) + '%</td><td>' + dur(s.dur) + '</td><td>' + act + '</td></tr>';
    }).join('') : '<tr><td colspan="7" class="empty">Nenhum acesso encontrado.</td></tr>';
    $('#pageInfo').textContent = 'Página ' + (state.page + 1) + ' de ' + pages + ' · ' + fmt(r.length) + ' acessos';
    $('#prev').disabled = state.page === 0; $('#next').disabled = state.page >= pages - 1;
  }

  function exportCsv() {
    const head = ['inicio', 'fonte', 'meio', 'campanha', 'aparelho', 'navegador', 'sistema', 'rolagem_%', 'tempo_s', 'cliques_comprar', 'cliques_checkout'];
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [head.join(',')].concat(rows().map((s) => [new Date(s.t0).toISOString(), s.source, s.medium, s.campaign, s.device, s.browser, s.os, s.scroll, s.dur, s.cta, s.checkout].map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'acessos-' + dayKey(Date.now()) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------------------------ demonstração (dados fictícios)
  let demoId = 0;
  function demoEvents(from) {
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const srcs = [['tiktok', 46], ['instagram', 24], ['kwai', 12], ['shorts', 9], ['direto', 6], ['google', 3]];
    const devs = ['mobile', 'mobile', 'mobile', 'desktop', 'tablet'], brs = ['Chrome', 'Safari', 'TikTok', 'Instagram', 'Edge'], oss = ['Android', 'iOS', 'Windows'];
    const hours = [1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 5, 6, 7, 6, 6, 7, 8, 9, 12, 16, 18, 16, 10, 4];   // pico à noite
    const hourSum = hours.reduce((a, b) => a + b, 0);
    const days = Math.max(1, Math.round((Date.now() - from.getTime()) / 864e5)), out = [];
    const N = Math.round(days * (16 + rnd() * 8) + 40);
    for (let i = 0; i < N; i++) {
      let r = rnd() * 100, src = 'direto'; for (const s of srcs) { if ((r -= s[1]) < 0) { src = s[0]; break; } }
      let hr = rnd() * hourSum, h = 0; for (; h < 23; h++) { if ((hr -= hours[h]) < 0) break; }
      const day = new Date(Date.now() - Math.floor(Math.pow(rnd(), 1.15) * days) * 864e5); day.setHours(h, Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
      let t = day.getTime(); if (t > Date.now() - 6e4) t = Date.now() - 6e4 - rnd() * 36e5;
      demoOne(out, rnd, 'demo' + i, 'v' + (i % 170), src, devs, brs, oss, t, src === 'tiktok' ? 0.22 : src === 'kwai' ? 0.5 : 0.36);
    }
    return out;
  }
  function demoOne(out, rnd, sid, vid, src, devs, brs, oss, t, ctaRate) {
    const base = { sid, vid, source: src, medium: src === 'direto' ? '' : 'bio', campaign: rnd() > 0.7 ? 'lancamento' : '', device: devs[Math.floor(rnd() * devs.length)], browser: brs[Math.floor(rnd() * brs.length)], os: oss[Math.floor(rnd() * oss.length)] };
    const ev = (type, label, value, dt) => out.push(Object.assign({ id: ++demoId, created_at: new Date(t + (dt || 0) * 1000).toISOString(), type, label: label || null, value: value == null ? null : value }, base));
    ev('pageview'); [25, 50, 75, 95].filter((m) => rnd() < 1 - m / 130).forEach((m, k) => ev('scroll', null, m, 6 + k * 9));
    if (rnd() < ctaRate) { ev('cta_click', ['hero', 'card_oferta', 'barra_fixa', 'cabecalho', 'cta_final'][Math.floor(rnd() * 5)], null, 40); if (rnd() < 0.5) ev('checkout_click', 'dialogo', null, 48); }
    ev('leave', null, Math.round(8 + rnd() * 120), 90);
  }
  // demonstração "ao vivo": de vez em quando chega uma visita nova (para ver os alertas do assistente)
  function demoNew() {
    if (Math.random() > 0.7) return [];
    const out = [], srcs = ['tiktok', 'tiktok', 'instagram', 'kwai', 'shorts'];
    const src = srcs[Math.floor(Math.random() * srcs.length)];
    demoOne(out, Math.random, 'live' + Date.now(), 'lv' + Date.now(), src, ['mobile'], ['TikTok', 'Instagram'], ['Android', 'iOS'], Date.now(), 0.9);
    return out.map((e) => Object.assign(e, { created_at: new Date().toISOString() }));
  }
  boot();
})();
