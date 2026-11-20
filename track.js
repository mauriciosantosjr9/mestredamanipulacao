/* track.js — rastreamento leve e anônimo do site (sem cookies, sem IP, sem dados pessoais).
   Registra: origem do tráfego, visita, rolagem, tempo, cliques nos botões de compra e ida ao checkout da Kiwify. */
(function () {
  'use strict';
  var C = window.MM_CONFIG || {};
  if (!C.supabaseUrl || !C.supabaseKey) return;
  try { if (localStorage.getItem('mm-owner') === '1') return; } catch (e) { /* ignora */ }   // visitas do dono não contam
  if (navigator.webdriver) return;
  var host = location.hostname;
  if ((host === 'localhost' || host === '127.0.0.1' || host === '') && !C.trackLocalhost) return;
  var ua = navigator.userAgent || '';
  if (/bot|crawl|spider|headless|lighthouse|preview|facebookexternalhit/i.test(ua)) return;

  function rid() {
    try { return Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(9)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    catch (e) { return String(Math.random()).slice(2, 16) + String(Date.now()); }
  }
  function store(area, key, make) {
    try { var v = area.getItem(key); if (!v) { v = make(); area.setItem(key, v); } return v; } catch (e) { return make(); }
  }
  var vid = store(window.localStorage, 'mm-vid', rid);      // visitante (anônimo, fica no aparelho)
  var sid = store(window.sessionStorage, 'mm-sid', rid);    // sessão

  var ALIAS = { tt: 'tiktok', tiktok: 'tiktok', ig: 'instagram', insta: 'instagram', instagram: 'instagram',
    kwai: 'kwai', kawai: 'kwai', kw: 'kwai', shorts: 'shorts', yt_shorts: 'shorts', youtubeshorts: 'shorts',
    yt: 'youtube', youtube: 'youtube', fb: 'facebook', facebook: 'facebook', wa: 'whatsapp', whatsapp: 'whatsapp',
    tg: 'telegram', telegram: 'telegram', google: 'google' };
  function fromHost(h) {
    if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
    if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
    if (/(^|\.)(kwai\.com|kw\.ai|kwai-video\.com|kwaicdn\.com)$/.test(h)) return 'kwai';
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
    if (/(^|\.)google\./.test(h)) return 'google';
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h)) return 'facebook';
    if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(h)) return 'whatsapp';
    if (/(^|\.)t\.me$/.test(h) || /(^|\.)telegram\./.test(h)) return 'telegram';
    return h;
  }
  function fromUA() {
    if (/musical_ly|TikTok|Bytedance/i.test(ua)) return 'tiktok';
    if (/Instagram/i.test(ua)) return 'instagram';
    if (/Kwai/i.test(ua)) return 'kwai';
    if (/FBAN|FBAV/i.test(ua)) return 'facebook';
    return '';
  }
  function detect() {
    var q = new URLSearchParams(location.search);
    var us = (q.get('utm_source') || q.get('src') || q.get('ref') || '').toLowerCase().trim().slice(0, 40);
    var rh = '';
    try { if (document.referrer) rh = new URL(document.referrer).hostname.replace(/^www\./, ''); } catch (e) { /* ignora */ }
    if (rh === location.hostname) rh = '';
    var src = us ? (ALIAS[us] || us) : (rh ? fromHost(rh) : (fromUA() || 'direto'));
    return { source: src, medium: (q.get('utm_medium') || (us ? '' : (rh ? 'referral' : ''))).slice(0, 40),
      campaign: (q.get('utm_campaign') || '').slice(0, 60), referrer: rh.slice(0, 80) };
  }
  var origin = (function () {
    try { var s = sessionStorage.getItem('mm-origin'); if (s) return JSON.parse(s); } catch (e) { /* ignora */ }
    var o = detect(); try { sessionStorage.setItem('mm-origin', JSON.stringify(o)); } catch (e) { /* ignora */ }
    return o;
  })();

  var device = /iPad|Tablet/i.test(ua) ? 'tablet' : (/Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop');
  var browser = /Instagram/i.test(ua) ? 'Instagram' : /musical_ly|TikTok|Bytedance/i.test(ua) ? 'TikTok' : /Kwai/i.test(ua) ? 'Kwai'
    : /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Outro';
  var os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Outro';
  var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignora */ }

  function send(type, label, value) {
    var body = JSON.stringify({ sid: sid, vid: vid, type: type, label: label || null, value: value == null ? null : value,
      source: origin.source, medium: origin.medium || null, campaign: origin.campaign || null, referrer: origin.referrer || null,
      device: device, browser: browser, os: os, screen: screen.width + 'x' + screen.height,
      lang: (navigator.language || '').slice(0, 12), tz: tz.slice(0, 40), path: location.pathname.slice(0, 120) });
    try {
      fetch(C.supabaseUrl.replace(/\/$/, '') + '/rest/v1/events', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: C.supabaseKey, Authorization: 'Bearer ' + C.supabaseKey, Prefer: 'return=minimal' },
        body: body
      }).catch(function () {});
    } catch (e) { /* ignora */ }
  }

  // visita
  var isNew = false;
  try { if (!sessionStorage.getItem('mm-pv')) { sessionStorage.setItem('mm-pv', '1'); isNew = true; } } catch (e) { isNew = true; }
  if (isNew) send('pageview');

  // rolagem (25 / 50 / 75 / 95 %)
  var marks = [25, 50, 75, 95], done = {}, maxScroll = 0, ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var h = document.documentElement.scrollHeight - innerHeight;
      var p = h > 0 ? Math.round(((window.scrollY || 0) / h) * 100) : 0;
      if (p > maxScroll) maxScroll = p;
      marks.forEach(function (m) { if (p >= m && !done[m]) { done[m] = 1; send('scroll', null, m); } });
    });
  }
  addEventListener('scroll', onScroll, { passive: true });

  // engajamento e saída
  var t0 = Date.now(), engaged = {};
  [15, 60].forEach(function (s) { setTimeout(function () { if (!engaged[s]) { engaged[s] = 1; send('engaged', null, s); } }, s * 1000); });
  var left = false;
  function leave() { if (left) return; left = true; send('leave', null, Math.round((Date.now() - t0) / 1000)); setTimeout(function () { left = false; }, 4000); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); });
  addEventListener('pagehide', leave);

  // cliques nos botões de compra / checkout
  function labelOf(a) {
    if (a.closest('dialog')) return 'dialogo';
    if (a.closest('.mm-sbar')) return 'barra_fixa';
    if (a.closest('.mm-hdr')) return 'cabecalho';
    if (a.id === 'oferta') return 'hero';
    if (a.closest('#faq')) return 'faq';
    if (a.closest('#ebook')) return 'card_oferta';
    return 'cta_final';
  }
  function tag(a) {   // repassa a origem para a Kiwify (aparece nas vendas dela também)
    try {
      var u = new URL(a.href);
      u.searchParams.set('utm_source', origin.source);
      if (origin.medium) u.searchParams.set('utm_medium', origin.medium);
      if (origin.campaign) u.searchParams.set('utm_campaign', origin.campaign);
      u.searchParams.set('src', origin.source);
      a.href = u.toString();
    } catch (e) { /* ignora */ }
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="kiwify.com"]');
    if (!a) return;
    var label = labelOf(a);
    tag(a);
    send(label === 'dialogo' ? 'checkout_click' : 'cta_click', label);
  }, true);
})();
