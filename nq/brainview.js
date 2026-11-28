// STRATEGY BRAIN view (day-brains 2026-11-27): the live brain of one strategy, mountable anywhere.
//   import { mount } from './brainview.js?v=1';  const h = mount(el, { s: 'lit' | 'atlas' | 'blitz' | 'poseidon', getState, compact });
//   h.update(state?) redraws now; h.setStrategy(s); h.destroy() (timers + listeners off, el emptied).
// Contract (agreed with the chart helper for nq/strat.html #brainMount, 2026-11-27): touches only el's children, loads its own CSS (brainview.css
// from import.meta.url), fluid (min 320 px), no position:fixed. Data: with opts.getState() -> { lite, home, bars } that is the ONLY source (no
// window.NQ_HOME, no global listener, no fetch of its own; the host calls update() after each refresh). Without getState: window.NQ_HOME + 'nq-home',
// else the PC's post itself via window.PC_FEED.fetchLatest (the host page loads ../pc_feed.js). Redraws every 60 s. textContent / createElement only.
import { brain, STRATS } from './brainviewcore.js?v=1';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
let cssIn = false;
function css() {
  if (cssIn || document.querySelector('link[data-brainview]')) { cssIn = true; return; }
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./brainview.css?v=1', import.meta.url).href; l.setAttribute('data-brainview', ''); document.head.appendChild(l); cssIn = true;
}
const STATE_WORD = { pass: 'passed', fail: 'failed', now: 'now', wait: 'waiting', off: 'off' };

function section(box, title, sub) { const s = el('section', 'bv-sec'); const h = el('h4', 'bv-h', title); if (sub) h.appendChild(el('span', 'bv-hs', sub)); s.appendChild(h); box.appendChild(s); return s; }

function draw(root, m, compact) {
  clear(root);
  root.className = 'bv' + (compact ? ' compact' : '');
  root.dataset.s = m.s;
  const hd = el('div', 'bv-head');
  const t = el('div', 'bv-title'); t.appendChild(el('b', 'bv-name', m.name)); if (m.mode) t.appendChild(el('span', 'bv-pill ' + (m.mode === 'PAPER' ? 'paper' : 'live'), m.mode));
  if (m.on !== null && m.on !== undefined) t.appendChild(el('span', 'bv-pill ' + (m.on && m.armed ? 'ok' : 'warn'), m.on ? (m.armed ? 'ON · ARMED' : 'ON · NOT ARMED') : 'OFF'));
  hd.appendChild(t);
  if (m.summary) hd.appendChild(el('span', 'bv-sum', m.summary));
  root.appendChild(hd);
  if (m.what && !compact) root.appendChild(el('p', 'bv-what', m.what));
  if (m.stage) root.appendChild(el('p', 'bv-stage', m.stage));
  for (const n of m.notes || []) root.appendChild(el('p', 'bv-note', n));
  // the decision pipeline: one node a gate, lit by its state, the number vs the rule
  if (m.flow && m.flow.length) {
    const s = section(root, 'Decision pipeline', 'each gate: the rule, and the number it saw');
    const ol = el('ol', 'bv-flow'); ol.setAttribute('aria-label', `${m.name} decision pipeline`);
    let lobe = null;
    for (const f of m.flow) {
      if (f.lobe && f.lobe !== lobe) { lobe = f.lobe; ol.appendChild(el('li', 'bv-lobe', f.lobe)); }
      const li = el('li', 'bv-node st-' + f.state); li.setAttribute('aria-label', `${f.label}: ${STATE_WORD[f.state] || f.state}${f.value ? ', ' + f.value : ''}${f.rule ? ', rule ' + f.rule : ''}`);
      li.appendChild(el('i', 'bv-dot', f.state === 'pass' ? '✓' : f.state === 'fail' ? '✗' : f.state === 'now' ? '●' : ''));
      const b = el('div', 'bv-nb'); const top = el('div', 'bv-nt'); top.appendChild(el('b', '', f.lobe ? f.label.replace(f.lobe + ' · ', '') : f.label)); if (f.value) top.appendChild(el('span', 'bv-val ag-num', f.value)); b.appendChild(top);
      if (f.rule) b.appendChild(el('span', 'bv-rule', f.rule)); if (f.from) b.appendChild(el('span', 'bv-from', f.from));
      li.appendChild(b); ol.appendChild(li);
    }
    s.appendChild(ol);
  }
  // what would trigger a trade now
  if (m.now && (m.now.line || (m.now.detail || []).length)) {
    const s = section(root, 'What would trigger a trade now'); s.classList.add('bv-now');
    if (m.now.line) s.appendChild(el('p', 'bv-nowl', m.now.line));
    for (const d of m.now.detail || []) s.appendChild(el('p', 'bv-nowd', d));
  }
  if (m.risk && m.risk.length) {
    const s = section(root, 'Risk and size', 'the next trade'); const g = el('div', 'bv-tiles');
    for (const r of m.risk) { const x = el('div', 'bv-tile'); x.appendChild(el('span', 'bv-tk', r.k)); x.appendChild(el('b', 'ag-num', r.v)); if (r.sub) x.appendChild(el('small', '', r.sub)); g.appendChild(x); }
    s.appendChild(g);
  }
  if (m.levels && m.levels.length) {
    const s = section(root, 'Levels it watches', 'and how far'); const ul = el('ul', 'bv-lv');
    for (const l of m.levels) { const li = el('li', l.side); li.appendChild(el('span', 'bv-lvn', l.name)); li.appendChild(el('b', 'ag-num', l.px === null ? '-' : l.px.toLocaleString('en-US', { minimumFractionDigits: 2 }))); if (l.text) li.appendChild(el('small', '', l.text)); ul.appendChild(li); }
    s.appendChild(ul);
  }
  const sk = m.skipped || [];
  if (sk.length || m.skippedN) {
    const s = section(root, 'Skipped today', m.skippedN || ''); const ul = el('ul', 'bv-sk');
    for (const x of sk) { const li = el('li'); li.appendChild(el('b', 'ag-num', x.hm || '--:--')); li.appendChild(el('span', '', `${x.side ? x.side + ' ' : ''}${x.why}`)); ul.appendChild(li); }
    if (!sk.length) ul.appendChild(el('li', 'bv-none', 'Nothing skipped yet today.'));
    s.appendChild(ul);
  }
  // every thought today (the PC's stream; the full day log reaches the site with the day's data after the close: story.html)
  const th = m.thoughts || [];
  const wrap = compact ? el('details', 'bv-sec bv-thd') : null;
  const s = wrap || section(root, 'Thoughts today', `${th.length} from the PC's stream`);
  if (wrap) { const sm = el('summary', 'bv-h', `Thoughts today (${th.length})`); wrap.appendChild(sm); root.appendChild(wrap); }
  const ol = el('ol', 'bv-th');
  for (const x of th) { const li = el('li', 'tone-' + x.tone); if (x.hm) li.appendChild(el('b', 'ag-num', x.hm)); li.appendChild(el('span', '', x.text)); ol.appendChild(li); }
  if (!th.length) ol.appendChild(el('li', 'bv-none', 'No thought lines in this post.'));
  s.appendChild(ol);
  s.appendChild(el('p', 'bv-note', 'The PC sends its newest lines every 15 minutes; the whole day\'s log arrives with the day\'s data after the close (see the Story page).'));
  if (m.health && m.health.length) {
    const h = section(root, 'Health'); const row = el('div', 'bv-health');
    for (const x of m.health) { const c = el('span', 'bv-chip lv-' + x.lv); c.appendChild(el('small', '', x.k)); c.appendChild(el('b', '', x.v)); row.appendChild(c); }
    h.appendChild(row);
  }
}

async function postItself() {
  try {
    const F = window.PC_FEED;
    if (!F || !F.fetchLatest) return null;
    return await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 12000))]);
  } catch (_) { return null; }
}

export function mount(host, opts) {
  const O = opts || {};
  let s = String(O.s || 'lit'), own = null, timer = 0, alive = true;
  css();
  const root = el('div', 'bv'); clear(host); host.appendChild(root);
  const HOSTED = typeof O.getState === 'function';   // the host owns the data (nq/strat.html): getState is the ONLY source, nothing global
  const state = () => {
    if (HOSTED) { try { const x = O.getState(); return x && (x.lite || x.home) ? x : null; } catch (_) { return null; } }
    if (window.NQ_HOME && (window.NQ_HOME.lite || window.NQ_HOME.home)) return window.NQ_HOME;
    return own ? { lite: own } : null;
  };
  const update = (st) => { if (!alive) return; const src = st || state() || {}; draw(root, brain(s, src, Date.now() / 1000), !!O.compact); };
  const onHome = () => update();
  if (!HOSTED) addEventListener('nq-home', onHome);
  update();
  if (!HOSTED && !state()) postItself().then((p) => { own = p; update(); });
  timer = setInterval(() => { if (!HOSTED && !state() && !own) postItself().then((p) => { own = p; update(); }); else update(); }, 60000);
  return {
    update,
    setStrategy(x) { s = String(x || 'lit'); update(); },
    destroy() { alive = false; clearInterval(timer); removeEventListener('nq-home', onHome); clear(host); },
  };
}
export { STRATS };
