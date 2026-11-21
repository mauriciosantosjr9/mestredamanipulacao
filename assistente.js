/* assistente.js — "Mestre IA": o mascote como assistente do painel.
   Tudo roda no seu navegador (nenhum dado sai do painel): motor de análise em português que
   (1) monta o resumo do dia, (2) detecta oportunidades e problemas (Radar), (3) responde perguntas,
   (4) avisa ao vivo quando alguém clica em comprar / vai ao checkout, e (5) reage com animações. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const S = { api: null, h: null, open: false, tab: 'radar', msgs: [], feed: [], sh: null, mascotOn: true, notif: false, lastPv: 0, titleBase: document.title, bubT: 0, raf: 0 };
  try { S.mascotOn = localStorage.getItem('mm-ai-mascot') !== 'off'; } catch (e) { /* ignora */ }

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pct1 = (a, b) => (b ? (a / b) * 100 : 0);
  const pS = (a, b) => pct1(a, b).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const hh = (h) => String(h).padStart(2, '0') + 'h';
  const PERIOD = { today: 'hoje', 7: 'nos últimos 7 dias', 30: 'nos últimos 30 dias', all: 'no total' };
  const DOW = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  // ------------------------------------------------------------------ métricas
  function M(list) {
    const m = { n: list.length, uniq: new Set(list.map((s) => s.vid || s.sid)).size, cta: 0, ck: 0, scroll: 0, low: 0, dur: 0, durN: 0, src: {}, dev: {}, camp: {}, btn: {}, hour: Array(24).fill(0), hourCk: Array(24).fill(0), dow: Array(7).fill(0) };
    const add = (o, k, s) => { const x = o[k] || (o[k] = { n: 0, cta: 0, ck: 0 }); x.n++; if (s.cta) x.cta++; if (s.checkout) x.ck++; };
    list.forEach((s) => {
      if (s.cta) m.cta++; if (s.checkout) m.ck++; m.scroll += s.scroll; if (s.scroll < 25) m.low++;
      if (s.dur) { m.dur += s.dur; m.durN++; }
      add(m.src, s.source || 'direto', s); add(m.dev, s.device || 'desktop', s); if (s.campaign) add(m.camp, s.campaign, s);
      Object.keys(s.labels).forEach((l) => { m.btn[l] = (m.btn[l] || 0) + s.labels[l]; });
      const d = new Date(s.t0); m.hour[d.getHours()]++; if (s.checkout) m.hourCk[d.getHours()]++; m.dow[d.getDay()]++;
    });
    return m;
  }
  const cur = () => M(S.api.state.sessions);
  const prev = () => M(S.api.state.prev);
  const top = (o, key, min) => Object.keys(o).filter((k) => o[k].n >= (min || 1)).sort((a, b) => key(o[b]) - key(o[a]))[0];
  const peak = (arr) => { let b = -1, v = 0; arr.forEach((x, i) => { if (x > v) { v = x; b = i; } }); return b; };
  const L = (k) => S.h.srcLabel(k);

  // ------------------------------------------------------------------ radar (insights)
  function insights() {
    const st = S.api.state, c = cur(), p = prev(), out = [];
    const per = String(st.period);
    const add = (lvl, k, t, d, rec, act) => out.push({ lvl, k, t, d, rec, act });
    if (c.n < 15) {
      add('info', 'poucos', 'Ainda são poucos dados', 'Só ' + fmt(c.n) + ' visita(s) ' + PERIOD[per] + '. Com mais de 30 visitas os alertas ficam bem mais precisos.', 'Cole os links de cada rede (card "Links para cada rede") na bio e na descrição dos vídeos.', { l: 'Ver links', f: () => S.api.act.focus('#links') });
    }
    // tendência
    if (p.n >= 10 && per !== 'all') {
      const d = ((c.n - p.n) / p.n) * 100;
      if (d <= -30) add('bad', 'trend', 'Tráfego caiu ' + Math.abs(Math.round(d)) + '%', fmt(c.n) + ' visitas contra ' + fmt(p.n) + ' no período anterior.', 'Volte a postar com o link na bio e repita o formato do vídeo que mais trouxe gente.', { l: 'Ver evolução', f: () => S.api.act.focus('#lineChart') });
      else if (d >= 30) add('good', 'trend', 'Tráfego subiu ' + Math.round(d) + '%', fmt(c.n) + ' visitas contra ' + fmt(p.n) + ' no período anterior.', 'Aproveite o embalo: poste mais enquanto o algoritmo está a seu favor.', { l: 'Ver evolução', f: () => S.api.act.focus('#lineChart') });
    }
    // fonte campeã
    const best = top(c.src, (x) => x.n, 1);
    if (best && c.n >= 15) add('info', 'campea', L(best) + ' é sua maior fonte', pS(c.src[best].n, c.n) + ' das visitas (' + fmt(c.src[best].n) + ').', null, { l: 'Filtrar ' + L(best), f: () => S.api.act.setSrc(best) });
    // fonte com conversão alta / desperdício
    const bestConv = top(c.src, (x) => x.ck / x.n, 20);
    if (bestConv && c.src[bestConv].ck) add('good', 'conv', L(bestConv) + ' converte melhor', pS(c.src[bestConv].ck, c.src[bestConv].n) + ' dessas visitas foram ao checkout.', 'Priorize essa rede: é onde o seu público compra.', { l: 'Filtrar ' + L(bestConv), f: () => S.api.act.setSrc(bestConv) });
    Object.keys(c.src).forEach((k) => {
      const x = c.src[k];
      if (x.n >= 30 && x.ck === 0 && pct1(x.cta, x.n) < 6) add('warn', 'semconv-' + k, L(k) + ' traz visita, mas ninguém compra', fmt(x.n) + ' visitas, ' + fmt(x.cta) + ' clique(s) em comprar e 0 checkout.', 'Revise a chamada do vídeo/bio dessa rede: o público pode não ser o do e-book.', { l: 'Filtrar ' + L(k), f: () => S.api.act.setSrc(k) });
    });
    // origem não identificada
    if (c.n >= 20 && c.src.direto && pct1(c.src.direto.n, c.n) > 45) add('warn', 'direto', 'Muita visita sem origem identificada', pS(c.src.direto.n, c.n) + ' das visitas aparecem como "Direto".', 'Sempre divulgue com os links que têm ?utm_source (copie em "Links para cada rede").', { l: 'Copiar links', f: () => S.api.act.focus('#links') });
    // abandono
    if (c.n >= 20 && pct1(c.low, c.n) > 50) add('warn', 'abandono', 'Mais da metade sai antes de 25% da página', pS(c.low, c.n) + ' não rolam nem um quarto do site.', 'Melhore a primeira tela: título forte e botão de compra bem visível logo no topo.', { l: 'Ver funil', f: () => S.api.act.focus('#funnel') });
    // clique em comprar baixo / alto
    const ctaR = pct1(c.cta, c.n);
    if (c.n >= 30 && ctaR < 8) add('warn', 'ctabaixo', 'Poucos clicam em comprar (' + pS(c.cta, c.n) + ')', 'O comum para páginas de venda é acima de 8%.', 'Teste uma oferta/preço mais claro no topo ou um depoimento real perto do botão.', { l: 'Ver botões', f: () => S.api.act.focus('#buttons') });
    else if (c.n >= 30 && ctaR >= 20) add('good', 'ctaalto', 'Ótimo: ' + pS(c.cta, c.n) + ' clicam em comprar', 'Sua página está convencendo.', null, null);
    // gargalo do diálogo
    if (c.cta >= 15 && pct1(c.ck, c.cta) < 35) add('warn', 'dialogo', 'Muita gente abre o pedido e desiste', 'Só ' + pS(c.ck, c.cta) + ' de quem clicou em comprar foi ao pagamento.', 'Teste ir direto ao checkout (sem a janela "Seu pedido") ou reforçar a garantia ali.', { l: 'Ver funil', f: () => S.api.act.focus('#funnel') });
    // celular x desktop
    const dv = Object.keys(c.dev).filter((k) => c.dev[k].n >= 20);
    if (dv.length >= 2) {
      const a = dv.sort((x, y) => c.dev[y].ck / c.dev[y].n - c.dev[x].ck / c.dev[x].n)[0], b = dv[dv.length - 1];
      const ra = c.dev[a].ck / c.dev[a].n, rb = c.dev[b].ck / c.dev[b].n;
      if (rb === 0 && ra > 0 || (rb > 0 && ra / rb >= 2)) add('warn', 'device', 'Conversão desigual entre aparelhos', (S.h.DEV[a] ? S.h.DEV[a][0] : a) + ' converte ' + pS(c.dev[a].ck, c.dev[a].n) + ' e ' + (S.h.DEV[b] ? S.h.DEV[b][0] : b) + ' só ' + pS(c.dev[b].ck, c.dev[b].n) + '.', 'Teste a página em ' + (S.h.DEV[b] ? S.h.DEV[b][0].toLowerCase() : b) + ' e veja se algo atrapalha o botão.', { l: 'Ver aparelhos', f: () => S.api.act.focus('#donutDev') });
    }
    // horário e dia
    const bh = peak(c.hour);
    if (c.n >= 25 && bh >= 0 && c.hour[bh] >= 5) add('info', 'hora', 'Seu pico é às ' + hh(bh), fmt(c.hour[bh]) + ' visitas começam entre ' + hh(bh) + ' e ' + hh((bh + 1) % 24) + '.', 'Programe os posts para um pouco antes desse horário (' + hh((bh + 23) % 24) + ').', { l: 'Ver horários', f: () => S.api.act.focus('#hoursChart') });
    const bd = peak(c.dow);
    if (c.n >= 40 && per !== 'today' && bd >= 0) add('info', 'dia', 'Melhor dia: ' + DOW[bd], fmt(c.dow[bd]) + ' visitas nesse dia da semana.', null, { l: 'Ver dias', f: () => S.api.act.focus('#weekChart') });
    // botão campeão
    const bb = Object.keys(c.btn).sort((a, b) => c.btn[b] - c.btn[a])[0];
    if (bb && c.cta >= 10) add('info', 'botao', 'Botão que mais clica: ' + (S.h.BTN[bb] || bb), fmt(c.btn[bb]) + ' clique(s).', null, { l: 'Ver botões', f: () => S.api.act.focus('#buttons') });
    // tempo na página
    if (c.durN >= 20 && c.dur / c.durN < 12) add('warn', 'tempo', 'Tempo médio muito curto (' + Math.round(c.dur / c.durN) + 's)', 'As pessoas passam poucos segundos na página.', 'O primeiro impacto precisa prender: vídeo/imagem forte e promessa clara no topo.', null);
    // online agora
    const on = st.all.filter((s) => Date.now() - s.t1 < 5 * 60e3).length;
    if (on > 0) add('good', 'online', on + ' pessoa(s) no site agora', 'Visitas ativas nos últimos 5 minutos.', null, null);
    const order = { bad: 0, warn: 1, good: 2, info: 3 };
    return out.sort((a, b) => order[a.lvl] - order[b.lvl]);
  }

  function briefing() {
    const st = S.api.state, c = cur(), p = prev(), per = String(st.period), hr = new Date().getHours();
    const g = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
    let trend = '';
    if (p.n >= 5 && per !== 'all') { const d = Math.round(((c.n - p.n) / p.n) * 100); trend = d === 0 ? ' (igual ao período anterior)' : ' (' + (d > 0 ? '+' : '') + d + '% vs. período anterior)'; }
    let html = '<b>' + g + '!</b> ' + esc(PERIOD[per][0].toUpperCase() + PERIOD[per].slice(1)) + ': <b>' + fmt(c.n) + '</b> visita(s)' + esc(trend) + ', <b>' + fmt(c.cta) + '</b> clique(s) em comprar e <b>' + fmt(c.ck) + '</b> ida(s) ao checkout.';
    // projeção do dia pelo padrão de horários dos dias anteriores
    if (per === 'today') {
      const before = st.all.filter((s) => s.t0 < st.since), h = Array(24).fill(0); before.forEach((s) => { h[new Date(s.t0).getHours()]++; });
      const tot = h.reduce((a, b) => a + b, 0), now = new Date(), upto = h.slice(0, now.getHours()).reduce((a, b) => a + b, 0) + h[now.getHours()] * (now.getMinutes() / 60);
      if (tot >= 20 && upto / tot > 0.12 && c.n > 0) html += ' No ritmo atual, hoje fecha com cerca de <b>' + fmt(Math.round(c.n / (upto / tot))) + '</b> visitas.';
    }
    return html;
  }

  // ------------------------------------------------------------------ perguntas e respostas
  const HELP = ['Resumo de hoje', 'Melhor fonte', 'Melhor horário', 'Qual a conversão?', 'Onde estou perdendo gente?', 'Compare TikTok e Instagram', 'O que devo fazer agora?', 'Quantos online?'];
  function srcsIn(q) {
    const found = [], map = { tiktok: /tik ?tok/, instagram: /insta/, kwai: /kwai|kawai/, shorts: /shorts/, youtube: /youtube|yt\b/, google: /google/, facebook: /face/, whatsapp: /whats|zap/, telegram: /telegram/, direto: /direto/ };
    Object.keys(map).forEach((k) => { if (map[k].test(q)) found.push(k); });
    return found;
  }

  function answer(raw) {
    const q = norm(raw), st = S.api.state, c = cur(), per = String(st.period);
    const A = (html, mood, acts) => ({ html, mood: mood || 'point', acts: acts || [] });
    if (!c.n && !/ajuda|oi|ola|link/.test(q)) return A('Ainda não tenho visitas ' + esc(PERIOD[per]) + '. Cole os links de cada rede na bio e volte em alguns minutos que eu analiso.', 'bad', [{ l: 'Ver links', f: () => S.api.act.focus('#links') }]);

    const ps = q.match(/(hoje|7 dias|7d|semana|30 dias|mes|tudo|todo periodo|total)/);
    if (ps && /(mostrar|mostra|ver|mudar|muda|trocar|periodo|ultimos|ultimas|de volta)|^(hoje|tudo)$/.test(q)) {
      const k = /hoje/.test(ps[1]) ? 'today' : /7|semana/.test(ps[1]) ? '7' : /30|mes/.test(ps[1]) ? '30' : 'all';
      S.api.act.setPeriod(k); return A('Pronto, mudei o painel para <b>' + esc(PERIOD[k]) + '</b>. Os números já estão atualizando.', 'point');
    }
    if (/limpar filtro|tirar filtro|remover filtro|sem filtro/.test(q)) { S.api.act.setSrc(null); return A('Filtro removido. Vendo todas as fontes.', 'point'); }
    const wantsFilter = /filtr|so (o|a)? ?(tiktok|insta|kwai|shorts|google)|apenas|somente/.test(q);
    const srcs = srcsIn(q);
    if (wantsFilter && srcs.length === 1) { S.api.act.setSrc(srcs[0]); return A('Filtrando o painel por <b>' + esc(L(srcs[0])) + '</b>. Para voltar, diga "limpar filtro".', 'point'); }
    if (/(o que (eu )?(devo|faco|fazer)|sugest|dica|recomend|melhorar|conselho|prioridade)/.test(q)) {
      const recs = insights().filter((i) => i.rec).slice(0, 3);
      if (!recs.length) return A('Está tudo em ordem por enquanto. Continue postando com o link na bio e volte mais tarde.', 'good');
      return A('Minhas prioridades agora:<br>' + recs.map((r, i) => (i + 1) + '. <b>' + esc(r.t) + '</b><br><span class="muted">' + esc(r.rec) + '</span>').join('<br>'), 'point');
    }
    if (/exporta|csv|baixar|planilha/.test(q)) { S.api.act.exportCsv(); return A('Baixando a planilha CSV com os acessos filtrados agora.', 'point'); }
    if (/link/.test(q) && srcs.length === 1) { return A('Vou copiar o link do <b>' + esc(L(srcs[0])) + '</b>. Cole na bio dessa rede.', 'point', [{ l: 'Copiar link ' + L(srcs[0]), f: async () => { const ok = await S.api.act.link(srcs[0]); toast(ok ? 'Link copiado ✓' : 'Não consegui copiar'); } }]); }
    if (/link/.test(q)) return A('Os links de cada rede estão no card abaixo. Use um por rede para eu saber de onde vem cada visita.', 'point', [{ l: 'Ir para os links', f: () => S.api.act.focus('#links') }]);

    if (srcs.length >= 2 && /(compar|versus|vs| x |ou )/.test(' ' + q + ' ')) {
      const a = srcs[0], b = srcs[1], A1 = c.src[a], B1 = c.src[b];
      if (!A1 && !B1) return A('Não tenho visitas de ' + esc(L(a)) + ' nem de ' + esc(L(b)) + ' ' + esc(PERIOD[per]) + '.', 'bad');
      const line = (k, x) => '<b>' + esc(L(k)) + '</b>: ' + fmt(x ? x.n : 0) + ' visitas, ' + fmt(x ? x.cta : 0) + ' cliques em comprar, ' + fmt(x ? x.ck : 0) + ' checkout(s) (' + (x ? pS(x.ck, x.n) : '0%') + ' de conversão)';
      const ra = A1 ? A1.ck / A1.n : 0, rb = B1 ? B1.ck / B1.n : 0;
      const win = ra === rb ? 'Empate na conversão.' : '<b>' + esc(L(ra > rb ? a : b)) + '</b> converte melhor.';
      return A(line(a, A1) + '<br>' + line(b, B1) + '<br>' + win, ra === rb ? 'point' : 'good', [{ l: 'Filtrar ' + L(ra >= rb ? a : b), f: () => S.api.act.setSrc(ra >= rb ? a : b) }]);
    }
    if (/(melhor|principal|maior|campea|de onde|origem|fonte|rede)/.test(q) && !/hora|horario|dia da semana|botao/.test(q)) {
      const k = Object.keys(c.src).sort((a, b) => c.src[b].n - c.src[a].n);
      const lines = k.slice(0, 4).map((x, i) => (i + 1) + '. <b>' + esc(L(x)) + '</b> — ' + fmt(c.src[x].n) + ' visitas (' + pS(c.src[x].n, c.n) + '), ' + fmt(c.src[x].ck) + ' checkout(s)');
      const bc = top(c.src, (x) => x.ck / x.n, 10);
      return A('Suas fontes ' + esc(PERIOD[per]) + ':<br>' + lines.join('<br>') + (bc && c.src[bc].ck ? '<br><br>Quem <b>mais converte</b>: <b>' + esc(L(bc)) + '</b> (' + pS(c.src[bc].ck, c.src[bc].n) + ').' : ''), 'good', [{ l: 'Ver a pizza', f: () => S.api.act.focus('#donutSrc') }, { l: 'Filtrar ' + L(k[0]), f: () => S.api.act.setSrc(k[0]) }]);
    }
    if (/(hora|horario|quando|que horas|postar)/.test(q)) {
      const idx = c.hour.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter((x) => x[0] > 0);
      if (!idx.length) return A('Ainda não tenho visitas suficientes para falar de horários.', 'bad');
      return A('Seus melhores horários ' + esc(PERIOD[per]) + ':<br>' + idx.map((x, i) => (i + 1) + '. <b>' + hh(x[1]) + '–' + hh((x[1] + 1) % 24) + '</b> — ' + fmt(x[0]) + ' visitas').join('<br>') + '<br><br>Dica: poste cerca de 1h antes do primeiro horário.', 'good', [{ l: 'Ver gráfico de horários', f: () => S.api.act.focus('#hoursChart') }]);
    }
    if (/(dia da semana|melhor dia|qual dia|dias)/.test(q)) {
      const d = peak(c.dow); if (d < 0) return A('Ainda sem dados para comparar os dias.', 'bad');
      return A('Seu melhor dia é <b>' + DOW[d] + '</b> com ' + fmt(c.dow[d]) + ' visitas. ' + (per === 'today' ? 'Escolha 7 ou 30 dias para comparar bem.' : ''), 'good', [{ l: 'Ver dias da semana', f: () => S.api.act.focus('#weekChart') }]);
    }
    if (/(online|ao vivo|ativos|quantas? pessoas|quem esta)/.test(q) || /(no site|na pagina) agora/.test(q)) {
      const on = st.all.filter((s) => Date.now() - s.t1 < 5 * 60e3);
      return A('Agora há <b>' + on.length + '</b> pessoa(s) no site' + (on.length ? ' (' + Array.from(new Set(on.map((s) => L(s.source)))).slice(0, 3).map(esc).join(', ') + ')' : '') + '.', on.length ? 'good' : 'point');
    }
    if (/(onde|perdendo|funil|gargalo|abandon|desist|saem|sai )/.test(q)) {
      const n = c.n, sc50 = S.api.state.sessions.filter((s) => s.scroll >= 50).length, steps = [['visitaram', n], ['rolaram 50%+', sc50], ['clicaram em comprar', c.cta], ['foram ao checkout', c.ck]];
      let worst = 1, wv = 1; for (let i = 1; i < steps.length; i++) { const r = steps[i - 1][1] ? steps[i][1] / steps[i - 1][1] : 1; if (r < wv) { wv = r; worst = i; } }
      return A('Seu funil ' + esc(PERIOD[per]) + ':<br>' + steps.map((s) => fmt(s[1]) + ' ' + s[0]).join(' → ') + '<br><br>A maior perda é entre <b>' + steps[worst - 1][0] + '</b> e <b>' + steps[worst][0] + '</b> (só ' + Math.round(wv * 100) + '% seguem).', 'bad', [{ l: 'Ver o funil', f: () => S.api.act.focus('#funnel') }]);
    }
    if (/(conversao|converte|taxa|vend|checkout|compr)/.test(q)) {
      return A('<b>Conversão ' + esc(PERIOD[per]) + ':</b><br>• ' + pS(c.cta, c.n) + ' clicaram em comprar (' + fmt(c.cta) + ')<br>• ' + pS(c.ck, c.n) + ' foram ao checkout (' + fmt(c.ck) + ')<br>• ' + pS(c.ck, c.cta) + ' de quem clicou chegou ao pagamento<br><br><span class="muted">Vendas confirmadas ficam no painel da Kiwify.</span>', c.ck ? 'good' : 'point', [{ l: 'Ver botões', f: () => S.api.act.focus('#buttons') }]);
    }
    if (/(celular|mobile|desktop|computador|aparelho|dispositivo)/.test(q)) {
      const k = Object.keys(c.dev).sort((a, b) => c.dev[b].n - c.dev[a].n);
      return A('Aparelhos ' + esc(PERIOD[per]) + ':<br>' + k.map((x) => '<b>' + esc(S.h.DEV[x] ? S.h.DEV[x][0] : x) + '</b>: ' + fmt(c.dev[x].n) + ' (' + pS(c.dev[x].n, c.n) + '), conversão ' + pS(c.dev[x].ck, c.dev[x].n)).join('<br>'), 'point', [{ l: 'Ver gráfico', f: () => S.api.act.focus('#donutDev') }]);
    }
    if (/(botao|botoes|cta)/.test(q)) {
      const k = Object.keys(c.btn).sort((a, b) => c.btn[b] - c.btn[a]);
      if (!k.length) return A('Ainda não houve cliques nos botões.', 'bad');
      return A('Botões mais clicados:<br>' + k.slice(0, 4).map((x, i) => (i + 1) + '. <b>' + esc(S.h.BTN[x] || x) + '</b> — ' + fmt(c.btn[x])).join('<br>'), 'point', [{ l: 'Ver botões', f: () => S.api.act.focus('#buttons') }]);
    }
    if (/(campanha|campaign)/.test(q)) {
      const k = Object.keys(c.camp).sort((a, b) => c.camp[b].n - c.camp[a].n);
      return A(k.length ? 'Campanhas:<br>' + k.slice(0, 4).map((x) => '<b>' + esc(x) + '</b> — ' + fmt(c.camp[x].n) + ' visitas, ' + fmt(c.camp[x].ck) + ' checkout(s)').join('<br>') : 'Nenhuma visita com campanha (?utm_campaign=) ainda.', 'point');
    }
    if (/(resumo|hoje|briefing|como estou|como esta|novidade|geral)/.test(q)) {
      if (/hoje/.test(q) && String(st.period) !== 'today') { S.api.act.setPeriod('today'); setTimeout(() => { S.msgs.push({ html: briefing(), who: 'bot', acts: [{ l: 'Abrir o Radar', f: () => setTab('radar') }] }); renderMsgs(); react('good'); }, 1700); return A('Mudei o painel para <b>hoje</b>. Um instante…', 'point'); }
      return A(briefing(), 'good', [{ l: 'Abrir o Radar', f: () => setTab('radar') }]);
    }
    if (/(ajuda|help|o que voce faz|comandos|oi|ola|bom dia|boa tarde|boa noite)/.test(q)) return A('Eu analiso o seu painel e respondo em português. Pergunte, por exemplo: <i>"qual a melhor fonte?"</i>, <i>"melhor horário para postar"</i>, <i>"compare tiktok e instagram"</i>, <i>"onde estou perdendo gente?"</i>, <i>"mostrar 30 dias"</i> ou <i>"filtrar instagram"</i>.', 'point');
    return A('Não entendi bem essa. Tente uma destas:', 'point');
  }

  // ------------------------------------------------------------------ interface
  function build() {
    const btn = document.createElement('button');
    btn.className = 'btn ai-open'; btn.id = 'aiOpen'; btn.type = 'button';
    btn.innerHTML = '<span class="ai-dot" id="aiDot" hidden></span>✦ Mestre IA';
    const tools = $('.tools'); if (tools) tools.insertBefore(btn, tools.firstChild);
    const el = document.createElement('aside');
    el.id = 'ai'; el.className = 'ai'; el.hidden = true; el.setAttribute('aria-label', 'Assistente Mestre IA');
    el.innerHTML =
      '<header class="ai-h"><div class="ai-av"><svg width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="#fff" stroke-width="1.8"><path d="M2 20V3l5.5 9L13 3l5.5 9L24 3v17"/></svg></div>' +
      '<div class="ai-t"><b>Mestre IA</b><small>Analisa seus dados · tudo no seu navegador</small></div><button class="ai-x" id="aiClose" type="button" aria-label="Fechar">✕</button></header>' +
      '<div class="ai-tabs"><button data-t="radar" class="on" type="button">Radar <i id="aiBadge" hidden></i></button><button data-t="chat" type="button">Perguntar</button></div>' +
      '<div class="ai-body" id="aiRadar"></div><div class="ai-body" id="aiChat" hidden><div id="aiMsgs"></div></div>' +
      '<div class="ai-foot"><div class="ai-chips" id="aiChips"></div>' +
      '<form id="aiForm" class="ai-form" autocomplete="off"><input id="aiInput" type="text" placeholder="Pergunte algo sobre seus dados…" aria-label="Pergunta"><button class="btn primary" type="submit" aria-label="Enviar">➤</button></form>' +
      '<div class="ai-opts"><label><input type="checkbox" id="aiMascot"> Mascote livre na tela</label><label><input type="checkbox" id="aiNotif"> Avisar no navegador</label></div></div>';
    document.body.appendChild(el);
    const b = document.createElement('div'); b.id = 'aiBubble'; b.className = 'ai-bubble'; b.hidden = true; b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite'); document.body.appendChild(b);
    const t = document.createElement('div'); t.id = 'aiToast'; t.className = 'ai-toast'; t.hidden = true; document.body.appendChild(t);

    btn.addEventListener('click', () => (S.open ? closePanel() : openPanel()));
    $('#aiClose').addEventListener('click', closePanel);
    $$('.ai-tabs button', el).forEach((x) => x.addEventListener('click', () => setTab(x.dataset.t)));
    $('#aiChips').innerHTML = HELP.map((h) => '<button type="button" class="chip">' + esc(h) + '</button>').join('');
    $('#aiChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { setTab('chat'); ask(c.textContent); } });
    $('#aiForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#aiInput'), v = i.value.trim(); if (!v) return; i.value = ''; setTab('chat'); ask(v); });
    const mc = $('#aiMascot'); mc.checked = S.mascotOn; mc.addEventListener('change', () => { S.mascotOn = mc.checked; try { localStorage.setItem('mm-ai-mascot', mc.checked ? 'on' : 'off'); } catch (e) { /* ignora */ } if (mc.checked) startMascot(); else stopMascot(); });
    const nc = $('#aiNotif'); nc.addEventListener('change', async () => {
      if (!nc.checked) { S.notif = false; return; }
      if (!('Notification' in window)) { toast('Seu navegador não suporta avisos'); nc.checked = false; return; }
      const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      S.notif = r === 'granted'; nc.checked = S.notif; if (!S.notif) toast('Permissão negada no navegador');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.open) closePanel(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = S.titleBase; });
    addEventListener('resize', () => { if (S.open) return; });
  }

  function openPanel(tab) { S.open = true; $('#ai').hidden = false; $('#aiDot').hidden = true; setTab(tab || S.tab); hideBubble(); if (!S.msgs.length) greet(); }
  function closePanel() { S.open = false; $('#ai').hidden = true; }
  function setTab(t) {
    S.tab = t; $$('.ai-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    $('#aiRadar').hidden = t !== 'radar'; $('#aiChat').hidden = t !== 'chat';
    if (t === 'radar') { renderRadar(); $('#aiBadge').hidden = true; } else { const m = $('#aiChat'); m.scrollTop = m.scrollHeight; setTimeout(() => $('#aiInput').focus(), 50); }
  }

  function renderRadar() {
    const list = insights(), ico = { bad: '⚠', warn: '❗', good: '✓', info: 'ℹ' };
    const feed = S.feed.slice(0, 6);
    $('#aiRadar').innerHTML =
      '<div class="ai-brief">' + briefing() + '</div>' +
      (feed.length ? '<h4>Ao vivo</h4><ul class="ai-feed">' + feed.map((f) => '<li><i class="' + f.k + '"></i><span>' + esc(f.t) + '</span><time>' + esc(f.w) + '</time></li>').join('') + '</ul>' : '') +
      '<h4>Radar de insights</h4>' + (list.length ? list.slice(0, 9).map((i, n) => '<div class="ai-card ' + i.lvl + '"><div class="ai-ci">' + ico[i.lvl] + '</div><div class="ai-cb"><b>' + esc(i.t) + '</b><p>' + esc(i.d) + '</p>' + (i.rec ? '<p class="rec">💡 ' + esc(i.rec) + '</p>' : '') + (i.act ? '<button type="button" class="btn ghost sm" data-n="' + n + '">' + esc(i.act.l) + ' →</button>' : '') + '</div></div>').join('') : '<p class="muted">Sem alertas agora. Tudo certo! ✨</p>');
    $$('#aiRadar button[data-n]').forEach((b) => b.addEventListener('click', () => { const i = list[+b.dataset.n]; if (i && i.act) { if (innerWidth < 700) closePanel(); i.act.f(); react('point'); } }));
  }

  function bubbleMsg(html, who) { S.msgs.push({ html, who }); renderMsgs(); }
  function renderMsgs() {
    $('#aiMsgs').innerHTML = S.msgs.map((m, i) => '<div class="msg ' + m.who + '"><div class="mb">' + m.html + '</div>' + (m.acts ? '<div class="acts">' + m.acts.map((a, j) => '<button class="btn ghost sm" type="button" data-m="' + i + '" data-a="' + j + '">' + esc(a.l) + '</button>').join('') + '</div>' : '') + '</div>').join('') + (S.typing ? '<div class="msg bot"><div class="mb typing"><i></i><i></i><i></i></div></div>' : '');
    $$('#aiMsgs button[data-m]').forEach((b) => b.addEventListener('click', () => { const a = S.msgs[+b.dataset.m].acts[+b.dataset.a]; if (innerWidth < 700) closePanel(); a.f(); }));
    const c = $('#aiChat'); c.scrollTop = c.scrollHeight;
  }
  function greet() { bubbleMsg(briefing() + '<br><br>Pergunte o que quiser sobre os seus dados, ou veja o <b>Radar</b>.', 'bot'); }

  function ask(text) {
    bubbleMsg(esc(text), 'me'); S.typing = true; renderMsgs(); react('think');
    setTimeout(() => {
      S.typing = false; let r;
      try { r = answer(text); } catch (e) { r = { html: 'Tive um problema ao analisar isso. Tente de outro jeito.', mood: 'bad', acts: [] }; }
      const acts = r.acts.slice(); if (r.html.indexOf('Tente uma destas') >= 0) HELP.slice(0, 4).forEach((h) => acts.push({ l: h, f: () => ask(h) }));
      S.msgs.push({ html: r.html, who: 'bot', acts }); renderMsgs(); react(r.mood);
    }, 650);
  }

  function toast(t) { const e = $('#aiToast'); e.textContent = t; e.hidden = false; clearTimeout(S.toastT); S.toastT = setTimeout(() => { e.hidden = true; }, 2200); }

  // ------------------------------------------------------------------ mascote 3D
  function react(mood) {
    const sh = S.sh; if (!sh) return;
    try {
      if (mood === 'good') sh.emote('Emote_Celebrate'); else if (mood === 'love') sh.emote('Emote_InLove'); else if (mood === 'bad') sh.play('Sad', 5);
      else if (mood === 'think') sh.play('Sit_Phone', 1.7); else if (mood === 'point') sh.emote('Emote_Point'); else if (mood === 'wow') sh.emote('Emote_Crown');
    } catch (e) { /* ignora */ }
  }
  function bounds() {
    const vw = innerWidth, vh = innerHeight; let topY = 0;
    const h = $('.top'); if (h) { const r = h.getBoundingClientRect(); if (r.bottom > 0) topY = Math.round(r.bottom) + 4; }
    let floor = vh, right = vw, lane = false;
    if (S.open) { const p = $('#ai').getBoundingClientRect(); if (vw < 700) floor = Math.round(p.top) - 2; else { right = Math.round(p.left) - 8; lane = true; } }
    return { top: topY, floor, right, lane };
  }
  async function startMascot() {
    if (S.sh || !S.mascotOn || S.starting) return; S.starting = true;
    try {
      const m = await import('./mascote.js');
      if (!S.mascotOn) { S.starting = false; return; }
      S.sh = await m.start({
        model: new URL('./assets/MESTRE.glb', document.baseURI).href, height: innerWidth < 700 ? 130 : 170, zIndex: 18, menu: false,
        perches: ['.kpi', '.card'], host: { bounds, paused: () => S.open && innerWidth < 700 },
        onClick: () => { if (S.open) { react('good'); } else openPanel('radar'); }, onThrow: () => say('Ei! Cuidado com o Mestre 😅', 3200)
      });
      loopBubble();
    } catch (e) { try { console.warn('Mascote do painel indisponível:', e); } catch (e2) { /* ignora */ } }
    S.starting = false;
  }
  function stopMascot() { if (S.sh) { try { S.sh.destroy(); } catch (e) { /* ignora */ } S.sh = null; } hideBubble(); delete window.__shadowShimeji; }

  function say(html, ms) {
    if (!S.sh) { toast(String(html).replace(/<[^>]+>/g, ' ')); return; }
    const b = $('#aiBubble'); b.innerHTML = html; b.hidden = false; b.style.visibility = 'hidden';
    clearTimeout(S.bubT); S.bubT = setTimeout(hideBubble, ms || 6500); placeBubble();
  }
  function hideBubble() { const b = $('#aiBubble'); if (b) b.hidden = true; }
  function loopBubble() { cancelAnimationFrame(S.raf); const f = () => { S.raf = requestAnimationFrame(f); const b = $('#aiBubble'); if (b && !b.hidden) placeBubble(); }; S.raf = requestAnimationFrame(f); }
  function placeBubble() {
    const b = $('#aiBubble'), sh = S.sh;
    if (!b || b.hidden) return;
    const t = sh && sh.rect();
    if (!t || t.right < 0 || t.left > innerWidth) { b.style.visibility = 'hidden'; return; }
    const vw = innerWidth, vh = innerHeight, M = 10, G = 12, bw = b.offsetWidth, bh = b.offsetHeight, bd = bounds();
    const cl = (v, a, c) => Math.max(a, Math.min(c, v)), cx = (t.left + t.right) / 2, cy = (t.top + t.bottom) / 2;
    const cands = [
      { d: 'down', x: cl(cx - bw / 2, M, vw - M - bw), y: t.top - G - bh },
      { d: 'left', x: t.right + G, y: cl(cy - bh / 2, bd.top, vh - M - bh) },
      { d: 'right', x: t.left - G - bw, y: cl(cy - bh / 2, bd.top, vh - M - bh) },
      { d: 'up', x: cl(cx - bw / 2, M, vw - M - bw), y: t.bottom + G }];
    const ok = (c) => c.x >= M - 1 && c.x + bw <= vw - M + 1 && c.y >= bd.top - 1 && c.y + bh <= vh - M + 1;
    const hits = (c) => !(c.x + bw <= t.left || c.x >= t.right || c.y + bh <= t.top || c.y >= t.bottom);
    let pick = cands.find((c) => ok(c) && !hits(c)) || cands[0];
    b.style.left = Math.round(pick.x) + 'px'; b.style.top = Math.round(clampTop(pick.y, bd.top, vh - M - bh)) + 'px';
    b.dataset.arrow = pick.d;
    if (pick.d === 'down' || pick.d === 'up') b.style.setProperty('--ax', Math.round(cl(cx - pick.x - 7, 14, bw - 28)) + 'px'); else b.style.setProperty('--ay', Math.round(cl(cy - pick.y - 7, 12, bh - 26)) + 'px');
    b.style.visibility = 'visible';
  }
  const clampTop = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ eventos ao vivo
  const when = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  function notify(text) {
    if (document.hidden) {
      document.title = '🔥 ' + text + ' · Painel';
      if (S.notif && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Mestre IA', { body: text }); } catch (e) { /* ignora */ } }
    }
  }
  function onNewEvents(evs) {
    if (!S.api) return;
    const ck = evs.filter((e) => e.type === 'checkout_click'), cta = evs.filter((e) => e.type === 'cta_click'), pv = evs.filter((e) => e.type === 'pageview');
    pv.forEach((e) => S.feed.unshift({ k: 'pv', t: 'Nova visita · ' + L(e.source || 'direto'), w: when() }));
    cta.forEach((e) => S.feed.unshift({ k: 'cta', t: 'Clicou em comprar · ' + (S.h.BTN[e.label] || e.label || '') + ' · ' + L(e.source || 'direto'), w: when() }));
    ck.forEach((e) => S.feed.unshift({ k: 'ck', t: 'FOI AO CHECKOUT · ' + L(e.source || 'direto'), w: when() }));
    S.feed = S.feed.slice(0, 12);
    if (ck.length) {
      const src = L(ck[0].source || 'direto'), msg = '🔥 Alguém foi ao <b>checkout</b>' + (ck.length > 1 ? ' (' + ck.length + 'x)' : '') + ' vindo do <b>' + esc(src) + '</b>!';
      say(msg, 7500); react('love'); notify('Checkout vindo do ' + src + '!');
    } else if (cta.length) {
      const src = L(cta[0].source || 'direto'); say('💰 Clique em <b>comprar</b> agora (' + esc(src) + ').', 6000); react('good'); notify('Clique em comprar (' + src + ')');
    } else if (pv.length && Date.now() - S.lastPv > 45000) {
      S.lastPv = Date.now(); say('👀 +' + pv.length + ' visita(s) chegando agora.', 3500);
    }
    if (!S.open && (ck.length || cta.length)) { const d = $('#aiDot'); if (d) d.hidden = false; }
    if (S.open && S.tab === 'radar') renderRadar();
  }

  // ------------------------------------------------------------------ API pública
  function init(api) {
    if (S.api) return; S.api = api; S.h = api.h; S.demo = api.demo;
    build(); startMascot();
  }
  function update(first) {
    if (!S.api) return;
    const list = insights(), alerts = list.filter((i) => i.lvl === 'bad' || i.lvl === 'warn').length;
    const badge = $('#aiBadge'); if (badge) { badge.textContent = alerts; badge.hidden = !alerts || S.tab === 'radar' && S.open; }
    if (S.open && S.tab === 'radar') renderRadar();
    if (first && !S.open) {
      setTimeout(() => {
        const c = cur(); if (!S.api) return;
        const bad = list.find((i) => i.lvl === 'bad'), warn = list.find((i) => i.lvl === 'warn');
        const line = bad ? '⚠ ' + esc(bad.t) : warn ? '❗ ' + esc(warn.t) : c.ck ? '✨ ' + fmt(c.ck) + ' foram ao checkout ' + PERIOD[String(S.api.state.period)] + '!' : '👋 Estou de olho nos seus dados.';
        say(line + '<br><span class="muted">Clique em mim para o resumo.</span>', 8000);
        react(bad ? 'bad' : c.ck ? 'good' : 'point');
      }, 3800);
    }
  }
  window.MestreAI = { init, update, onNewEvents };
})();
