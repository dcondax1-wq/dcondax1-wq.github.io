/* STRATEGY HEALTH card on the Trading page (day-site5 2026-11-26). Model: healthcore.js (pure). Reads trading/bands.json + trading/trades.json
   (the same file the page reads; the browser cache serves it). Per bot: a plain word (normal / cold streak / outside the band / too few trades),
   the backtest band as a bar (worst-5% .. best-5%, the middle half shaded) with the live average as a marker, and why. createElement /
   textContent only. Read only. */
(function () {
  'use strict';
  const H = window.STRAT_HEALTH;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  async function get(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  function bandBar(b) {
    const box = el('div', 'hb-bar'); box.setAttribute('role', 'img');
    if (!b.band) { box.classList.add('none'); box.setAttribute('aria-label', 'no band yet'); return box; }
    const lo = Math.min(b.band.p5, b.avg ?? b.band.p5) - 0.15, hi = Math.max(b.band.p95, b.avg ?? b.band.p95) + 0.15, x = (v) => ((v - lo) / (hi - lo)) * 100 + '%';
    const full = el('i', 'full'); full.style.left = x(b.band.p5); full.style.right = 'calc(100% - ' + x(b.band.p95) + ')'; box.append(full);
    if (b.band.p25 !== null && b.band.p75 !== null) { const mid = el('i', 'mid'); mid.style.left = x(b.band.p25); mid.style.right = 'calc(100% - ' + x(b.band.p75) + ')'; box.append(mid); }
    else if (b.band.p50 !== null) { const md = el('i', 'med'); md.style.left = x(b.band.p50); box.append(md); }
    const zero = el('i', 'zero'); zero.style.left = x(0); box.append(zero);
    if (b.avg !== null) { const m = el('i', 'live ' + b.level); m.style.left = x(b.avg); box.append(m); }
    box.setAttribute('aria-label', `backtest band ${H.fmtR(b.band.p5)} to ${H.fmtR(b.band.p95)}, live ${H.fmtR(b.avg)}`);
    const sc = el('div', 'hb-sc'); sc.append(el('span', null, H.fmtR(b.band.p5)), el('span', null, b.band.p25 !== null ? 'middle half ' + H.fmtR(b.band.p25) + ' to ' + H.fmtR(b.band.p75) : 'median ' + H.fmtR(b.band.p50)), el('span', null, H.fmtR(b.band.p95)));
    const w = el('div'); w.append(box, sc); return w;
  }
  async function draw() {
    const card = document.getElementById('healthCard'); if (!card || !H) return;
    const [bands, file] = await Promise.all([get('bands.json'), get('trades.json')]);
    const M = H.health(bands, file), list = document.getElementById('healthList'); list.replaceChildren();
    for (const b of M.bots) {
      const row = el('div', 'hb ' + b.level); row.dataset.bot = b.id; row.dataset.word = b.word;
      const top = el('div', 'hb-top'); top.append(el('b', null, b.name), el('span', 'hb-w ' + b.level, b.word.toUpperCase())); row.append(top);
      row.append(el('p', 'hb-line', b.line), bandBar(b), el('p', 'hb-why', b.why));
      if (b.ref) row.append(el('p', 'hb-ref', `In a ${b.ref.span}-like market the band was ${H.fmtR(b.ref.p5)} to ${H.fmtR(b.ref.p95)} (median ${H.fmtR(b.ref.p50)}).`));
      list.append(row);
    }
    const s = document.getElementById('healthSrc');
    s.textContent = (M.sample ? 'SAMPLE · ' : '') + (M.provisional ? 'Band: PROVISIONAL, from the 2026 backtest trades in this page\'s file (the health study has not landed). ' : 'Band: the health study (' + M.src + (M.made ? ', ' + M.made : '') + '), every ' + (M.window || 10) + '-trade stretch of the 2026 backtest. ')
      + 'Live = the PC\'s real MFFU trades. Words: normal = inside the band; cold streak = its weak part or a long losing run; outside the band = beyond the backtest\'s 5% tails. Research only: nothing here stops or changes a bot.';
    card.dataset.ready = '1';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', draw); else draw();
})();
