// FORUM desk (2026-11-04): four more tablets on the desk beside the avenue (the bots, Kalshi, today's calendar, the to-dos), the oath ritual
// effects and the streak shrine, drawn with the OLYMPUS effects library (../olympus/fx-*.js). The words come from forumcore.js (desk());
// this file only draws them. Text only through textContent. Without the library, or on LITE / off / reduced motion, the
// desk and the shrine are drawn the same and the ritual is simply quiet. The Planner is read from this phone's own storage, read-only.

const FX = () => window.OLYMPUS_FX || null;
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const TONE = { calm: '#aeb86e', watch: '#e0b060', storm: '#c96a4a', info: '#4b7a99' };

/** the Planner's tasks / events on this phone (read-only); null when there is none */
export function readPlanner() {
  for (const k of ['planner.v1', 'planner.hosted.v1']) {
    try { const v = JSON.parse(localStorage.getItem(k) || 'null'); if (v && typeof v === 'object') return v; } catch (_) { /* next */ }
  }
  return null;
}

/** draw the desk tablets into the container (replaces what is there) */
export function renderDesk(box, tablets) {
  box.replaceChildren();
  const head = h('p', 'dhead', 'On the desk'); box.append(head);
  const grid = h('div', 'dgrid');
  for (const t of tablets) {
    const c = h('div', 'dtab'); c.dataset.id = t.id; c.style.setProperty('--dtone', TONE[t.tone] || TONE.info); c.setAttribute('data-oly-fx', 'shimmer');
    const top = h('div', 'dtop'); top.append(h('span', 'dglyph', t.glyph), h('b', '', t.title));
    c.append(top, h('span', 'dstat', t.stat), h('span', 'dline', t.line));
    grid.append(c);
  }
  box.append(grid);
}

/** the shrine: seven candles, one lit per market day of the streak; returns the count lit */
export function renderShrine(box, cur, best) {
  const lit = Math.max(0, Math.min(7, cur));
  if (box.children.length !== 7) { box.replaceChildren(); for (let i = 0; i < 7; i++) { const c = h('i', 'candle'); c.append(h('s', 'flame')); box.append(c); } }
  [...box.children].forEach((c, i) => c.classList.toggle('lit', i < lit));
  box.setAttribute('aria-label', `Streak shrine: ${cur} market day${cur === 1 ? '' : 's'} in a row, best ${best}. ${lit} of 7 candles lit.`);
  return lit;
}

/** the oath's little effects: a tick sparkles, the seal throws confetti and lights the forum (shock ring + falling laurel on the 3D scene) */
let sceneFx = [];
export function ritual(kind, el, scene) {
  const fx = FX();
  if (!fx || !el) return false;
  try {
    if (kind === 'pledge') { fx.sparkleBurst(el, { count: 14 }); return true; }
    if (kind === 'candle') { fx.sparkleBurst(el, { count: 20, colors: ['#e0b060', '#e0b060', '#f3ece0'] }); return true; }
    if (kind === 'seal') {
      fx.confetti(el, { count: 150, colors: ['#aeb86e', '#e0b060', '#e0b060', '#f3ece0', '#aeb86e'] });
      if (scene && scene.fxTarget && !scene.lite()) sceneRitual(fx, scene.fxTarget());
      return true;
    }
  } catch (_) { /* the ritual is never needed */ }
  return false;
}
async function sceneRitual(fx, target) {
  try {
    await Promise.all(['fx-weather.js', 'fx-surface.js'].map((f) => import('../olympus/' + f + '?v=f1')));
    sceneFx.forEach((x) => x && x.stop && x.stop()); sceneFx = [];
    sceneFx.push(fx.shockwave(target, { position: [0, 0.2, 2], radius: 11, color: '#e0b060', seconds: 1.8 }), fx.laurelFall(target, { center: [0, 7, 2], box: [14, 10, 10], count: 90 }));
    setTimeout(() => { sceneFx.forEach((x) => x && x.stop && x.stop()); sceneFx = []; }, 6500);
  } catch (_) { /* no 3D effects here */ }
}
