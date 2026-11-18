// ARGO page (ES module): the voyage. Goals as islands on a 2D SVG sea map, a marble trireme (2D canvas, no WebGL) sailing toward the next one, progress from published numbers only, honest ETA ranges.
// Reads ../home.json, ../ledger/rules.json and fixture.json (DEMO, used only when home.json is missing). The goals are the owner's own: localStorage 'argo.goals.v1' (this browser), export / import as JSON.
// Sends nothing, trades nothing. Text only through textContent. window.ARGO is the test hook. ?demo=1 forces the demo; ?pick=<n> opens island n (1 = first).
import * as C from './argocore.js';
import * as X from './argoscene.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const KEY = 'argo.goals.v1';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
function sv(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k])); if (parent) parent.appendChild(e); return e; }
const S = { goals: [], F: null, today: '', demo: false, pick: 0, ready: false, t: 0.6, raf: 0, last: 0, mem: null, quality: 'high', frac: 0 };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const lite = () => { try { return !!(O && O.lite && O.lite()); } catch (_) { return false; } };
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
function loadGoals() { try { const raw = localStorage.getItem(KEY); if (raw) { const g = C.normGoals(JSON.parse(raw)); if (g.length) return g; } } catch (_) { if (S.mem) return C.normGoals(S.mem); } return C.normGoals(C.DEFAULT_GOALS); }
function saveGoals() { S.mem = S.goals; try { localStorage.setItem(KEY, JSON.stringify(S.goals)); } catch (_) { /* the memory copy keeps it for this visit */ } }

// ---- the ship (canvas) ----
function fitScene() {
  const cv = $('scene'), dpr = S.quality === 'low' ? 1 : Math.min(2, window.devicePixelRatio || 1), ctx = cv.getContext('2d');
  if (!ctx) return; cv.width = Math.round(340 * dpr); cv.height = Math.round(200 * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function paintScene() { const ctx = $('scene').getContext('2d'); if (ctx) X.draw(ctx, 340, 200, S.t, S.frac, S.quality); }
function loop(now) {
  if (!reduced() && !lite() && !document.hidden && now - S.last > 33) { S.t += Math.min(0.08, (now - S.last) / 1000); S.last = now; paintScene(); }
  S.raf = requestAnimationFrame(loop);
}

// ---- the map (SVG) ----
function paintMap() {
  const box = $('map'); clear(box);
  const lay = C.layout(S.goals.length), svg = sv('svg', { viewBox: `0 0 ${lay.W} ${lay.H}`, role: 'group', 'aria-label': 'Sea map of your goals' }, box);
  for (let i = 0; i < 7; i++) { const y = 30 + i * 62, p = sv('path', { d: `M${10 + (i % 2) * 20} ${y} q20 -8 40 0 t40 0 t40 0`, fill: 'none', stroke: '#3a6078', 'stroke-width': 1.4, opacity: 0.5 }, svg); p.setAttribute('stroke-linecap', 'round'); }
  const route = [lay.harbour, ...lay.pts].map((p) => `${p.x},${p.y}`).join(' ');
  sv('polyline', { points: route, fill: 'none', stroke: '#e0b060', 'stroke-width': 2, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round', opacity: 0.75 }, svg);
  sv('rect', { x: lay.harbour.x - 22, y: lay.harbour.y - 6, width: 44, height: 12, rx: 3, fill: '#9c6b3c' }, svg);
  const ht = sv('text', { x: lay.harbour.x, y: lay.harbour.y + 22, 'text-anchor': 'middle' }, svg); ht.textContent = 'Harbour';
  S.goals.forEach((g, i) => {
    const p = lay.pts[i], pr = C.progress(g, S.F), isNext = !pr.done && S.goals.findIndex((x) => !C.progress(x, S.F).done) === i;
    const a = sv('g', { class: 'isle', role: 'button', tabindex: 0, 'data-i': i, 'aria-label': `${g.name}: ${pr.done ? 'reached' : C.pct(pr.frac) + ' of the way'}`, 'aria-pressed': i === S.pick ? 'true' : 'false' }, svg);
    sv('circle', { class: 'ring', cx: p.x, cy: p.y, r: 34, fill: i === S.pick ? 'rgba(200,162,74,.18)' : 'rgba(0,0,0,0)', stroke: isNext || i === S.pick ? '#c8a24a' : 'rgba(0,0,0,0)', 'stroke-width': 2 }, a);
    sv('ellipse', { cx: p.x, cy: p.y + 8, rx: 24, ry: 8, fill: '#13222c' }, a);
    sv('path', { d: `M${p.x - 22} ${p.y + 6} Q${p.x - 10} ${p.y - 18} ${p.x} ${p.y - 14} Q${p.x + 12} ${p.y - 20} ${p.x + 22} ${p.y + 6} Z`, fill: pr.done ? '#7f8a52' : '#8a7f6a', stroke: pr.done ? '#5a6338' : '#5e5444', 'stroke-width': 1.2 }, a);
    if (pr.done) { sv('line', { x1: p.x, y1: p.y - 14, x2: p.x, y2: p.y - 34, stroke: '#f3ece0', 'stroke-width': 1.6 }, a); sv('path', { d: `M${p.x} ${p.y - 34} l14 4 l-14 5 z`, fill: '#c8a24a' }, a); }
    else sv('path', { d: `M${p.x - 5} ${p.y - 8} h10 v6 h-10 z`, fill: '#cfc4b2', opacity: 0.7 }, a);
    const tx = sv('text', { x: p.x, y: p.y + 30, 'text-anchor': 'middle' }, a); tx.textContent = g.name.length > 22 ? g.name.slice(0, 21) + '…' : g.name;
    a.addEventListener('click', () => { S.pick = i; render(); }); a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.pick = i; render(); } });
  });
  const ship = C.shipAt(S.goals, S.F, lay);
  const sg = sv('g', { id: 'shipMark', 'aria-hidden': 'true' }, svg); sg.dataset.x = String(ship.x); sg.dataset.y = String(ship.y);
  sv('path', { d: `M${ship.x - 12} ${ship.y} h24 c-2 6 -6 9 -12 9 s-10 -3 -12 -9z`, fill: '#f3ece0', stroke: '#9c6b3c', 'stroke-width': 1.2 }, sg);
  sv('line', { x1: ship.x, y1: ship.y, x2: ship.x, y2: ship.y - 16, stroke: '#9c6b3c', 'stroke-width': 1.6 }, sg); sv('path', { d: `M${ship.x} ${ship.y - 15} l9 4 l-9 6 z`, fill: '#c96a4a' }, sg);
}

// ---- the page ----
function etaShort(g) {
  const pr = C.progress(g, S.F); if (pr.done) return 'Reached';
  const e = C.eta(g, S.F, S.today);
  return e.kind === 'range' && e.base ? `base about ${e.base}` : e.kind === 'range' ? 'no date at your slowest pace' : 'no date yet';
}
function renderHero() {
  const sum = C.summary(S.goals, S.F), g = sum.next >= 0 ? S.goals[sum.next] : null;
  $('count').textContent = `${sum.done} of ${sum.total}`; $('count').className = 'pill ' + (sum.done ? 'ok' : 'info');
  if (!g) { $('nextName').textContent = S.goals.length ? 'Every island reached' : 'No goals yet'; $('nextPct').textContent = S.goals.length ? '100%' : '0%'; $('nextBar').firstElementChild.style.width = S.goals.length ? '100%' : '0%'; $('nextEta').textContent = sum.text; S.frac = 1; return; }
  const pr = C.progress(g, S.F), e = C.eta(g, S.F, S.today); S.frac = pr.frac;
  $('nextName').textContent = g.name; $('nextPct').textContent = C.pct(pr.frac);
  $('nextBar').firstElementChild.style.width = Math.round(pr.frac * 100) + '%'; $('nextBar').setAttribute('aria-label', `${C.pct(pr.frac)} of the way to ${g.name}`);
  $('nextEta').textContent = `${C.valueText(g, pr.value)} of ${C.goalText(g)}. ${e.kind === 'range' ? (e.base ? `Base ETA about ${e.base}, from your last ${e.n} full months. Not a promise.` : e.text) : e.text}`;
}
function renderIsle() {
  const g = S.goals[S.pick], card = $('isle'); card.hidden = !g; if (!g) return;
  const pr = C.progress(g, S.F), e = C.eta(g, S.F, S.today);
  $('selName').textContent = g.name; const pill = $('selPill'); pill.textContent = pr.done ? 'Reached' : 'Not yet'; pill.className = 'pill ' + (pr.done ? 'ok' : 'info');
  $('selBar').firstElementChild.style.width = Math.round(pr.frac * 100) + '%'; $('selBar').className = 'ag-bar ' + (pr.done ? 'green' : 'amber'); $('selBar').setAttribute('aria-label', `${C.pct(pr.frac)} of the way`);
  $('selNums').textContent = `${C.valueText(g, pr.value)} of ${C.goalText(g)} (${C.pct(pr.frac)}). From published numbers.`;
  $('selTakes').textContent = C.takes(g, S.F); $('selEta').textContent = e.text;
  const rg = $('selRange');
  if (e.kind === 'range') {
    const unit = g.type === 'payouts' ? (m) => `${m.count} payout${m.count === 1 ? '' : 's'}` : (m) => C.money(m.usd);
    rg.textContent = `n = ${e.n} full months: ${S.F.months.map((m) => `${C.monthText(m.ym)} ${unit(m)}`).join(', ')}.`;
  } else rg.textContent = S.F.n ? `n = ${S.F.n} full month${S.F.n === 1 ? '' : 's'} of payouts published.` : 'n = 0 full months of payouts published.';
  const ol = $('selActs'); clear(ol); for (const a of C.actions(g, S.F)) ol.appendChild(h('li', '', a));
}
function renderLadder() {
  const box = $('ladder'); clear(box);
  S.goals.forEach((g, i) => {
    const pr = C.progress(g, S.F), b = h('button', 'step' + (pr.done ? ' done' : '')); b.type = 'button'; b.dataset.i = String(i); b.setAttribute('aria-pressed', i === S.pick ? 'true' : 'false');
    b.setAttribute('aria-label', `${g.name}: ${pr.done ? 'reached' : C.pct(pr.frac) + ' of the way, ' + etaShort(g)}`);
    b.appendChild(h('span', 't', `${i + 1}. ${g.name}`)); b.appendChild(h('span', 'n', pr.done ? 'Reached' : C.pct(pr.frac)));
    b.appendChild(h('span', 'm', `${C.valueText(g, pr.value)} of ${C.goalText(g)} · ${etaShort(g)}`));
    b.addEventListener('click', () => { S.pick = i; render(); }); box.appendChild(b);
  });
  if (!S.goals.length) box.appendChild(h('p', 'note', 'No goals yet. Add one below, or go back to the starter goals.'));
}
function renderEdit() {
  const box = $('goalsEdit'); clear(box);
  S.goals.forEach((g, i) => {
    const r = h('div', 'edrow');
    const n = h('label', 'fld'); n.appendChild(h('span', '', `${C.TYPES[g.type].label}`)); const ni = h('input'); ni.type = 'text'; ni.maxLength = 40; ni.value = g.name; ni.setAttribute('aria-label', `Name of goal ${i + 1}`); n.appendChild(ni);
    const t = h('label', 'fld'); t.appendChild(h('span', '', 'Target')); const ti = h('input'); ti.type = 'number'; ti.inputMode = 'decimal'; ti.min = '1'; ti.step = '1'; ti.value = String(g.target); ti.setAttribute('aria-label', `Target of goal ${i + 1}`); t.appendChild(ti);
    const d = h('button', 'btn del', '×'); d.type = 'button'; d.setAttribute('aria-label', `Delete the goal ${g.name}`);
    const apply = () => { const c = C.cleanGoal({ ...g, name: ni.value, target: ti.value }, i); if (!c) { $('editMsg').textContent = 'A goal needs a name and a target above zero.'; ni.value = g.name; ti.value = String(g.target); return; } if (S.goals[i] && S.goals[i].name === c.name && S.goals[i].target === c.target) return; S.goals[i] = c; saveGoals(); $('editMsg').textContent = 'Saved in this browser.'; setTimeout(render, 0); };
    ni.addEventListener('change', apply); ti.addEventListener('change', apply);
    d.addEventListener('click', () => { S.goals.splice(i, 1); S.pick = Math.min(S.pick, Math.max(0, S.goals.length - 1)); saveGoals(); $('editMsg').textContent = 'Goal deleted.'; render(); });
    r.appendChild(n); r.appendChild(t); r.appendChild(d); box.appendChild(r);
  });
}
function render() {
  S.pick = Math.min(S.pick, Math.max(0, S.goals.length - 1));
  $('demo').hidden = !S.demo; $('lite').hidden = !lite();
  renderHero(); paintMap(); renderIsle(); renderLadder(); renderEdit();
  const sum = C.summary(S.goals, S.F), g = sum.next >= 0 ? S.goals[sum.next] : null;
  $('sceneCap').textContent = g ? `Sailing toward ${g.name}: ${C.pct(S.frac)} of the way. The island grows as you get closer.` : 'Every island is reached. The sea is open.';
  $('scene').setAttribute('aria-label', g ? `A marble trireme sailing toward ${g.name}, ${C.pct(S.frac)} of the way` : 'A marble trireme at sea');
  paintScene();
  say(`${sum.text} ${S.goals[S.pick] ? 'Island open: ' + S.goals[S.pick].name + '.' : ''}`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

function bindEdit() {
  const sel = $('addType'); for (const k of Object.keys(C.TYPES)) { const o = h('option', '', C.TYPES[k].label); o.value = k; sel.appendChild(o); }
  $('addBtn').addEventListener('click', () => {
    if (S.goals.length >= C.MAX_GOALS) { $('editMsg').textContent = `At most ${C.MAX_GOALS} goals. Delete one first.`; return; }
    const c = C.cleanGoal({ id: C.nextId(S.goals), name: $('addName').value, type: $('addType').value, target: $('addTarget').value }, S.goals.length);
    if (!c) { $('editMsg').textContent = 'A goal needs a name and a target above zero.'; return; }
    S.goals.push(c); S.pick = S.goals.length - 1; saveGoals(); $('addName').value = ''; $('addTarget').value = ''; $('editMsg').textContent = `Added: ${c.name}.`; render();
  });
  $('resetBtn').addEventListener('click', () => { S.goals = C.normGoals(C.DEFAULT_GOALS); S.pick = 0; saveGoals(); $('editMsg').textContent = 'Back to the five starter goals.'; render(); });
  $('exportBtn').addEventListener('click', () => {
    const txt = C.exportJson(S.goals); $('ioText').value = txt;
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(() => {}); } catch (_) { /* the text is in the box */ }
    $('ioMsg').textContent = `Exported ${S.goals.length} goal${S.goals.length === 1 ? '' : 's'}. Copy the text to keep it.`;
  });
  $('importBtn').addEventListener('click', () => {
    const r = C.parseImport($('ioText').value);
    if (!r.ok) { $('ioMsg').textContent = r.error; return; }
    S.goals = r.goals; S.pick = 0; saveGoals(); $('ioMsg').textContent = `Imported ${r.goals.length} goal${r.goals.length === 1 ? '' : 's'}${r.dropped ? `; ${r.dropped} could not be read and were skipped` : ''}.`; render();
  });
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1';
  S.quality = lite() || reduced() ? 'low' : 'high'; S.today = new Date().toISOString().slice(0, 10);
  const [fx, home, rules] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../home.json'), forced ? null : getJSON('../ledger/rules.json')]);
  let H = C.normHome(home);
  if (H.has) S.demo = false; else { S.demo = true; H = C.normHome(C.demoHome(fx, S.today)); }
  S.F = C.facts(H, S.demo ? null : rules, S.today);
  S.goals = loadGoals();
  const pk = parseInt(q.get('pick'), 10); if (Number.isFinite(pk) && pk >= 1 && pk <= S.goals.length) S.pick = pk - 1; else { const n = S.goals.findIndex((g) => !C.progress(g, S.F).done); S.pick = n < 0 ? 0 : n; }
  const dn = $('demoNote'); dn.hidden = !S.demo; if (S.demo) dn.textContent = (fx && fx.note) || 'EXAMPLE numbers, not real.';
  bindEdit(); fitScene(); render();
  S.raf = requestAnimationFrame(loop);
}
window.ARGO = { S, C, X, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Argo could not start'); } catch (_) { /* nothing */ } });
