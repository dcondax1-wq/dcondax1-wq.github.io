// LABYRINTH page (ES module): loads the site's LIT trades and the live eval, runs the what-if (labcore.js), draws the maze
// (scene.js) and the words (this file). Text only through textContent (no data ever becomes HTML). window.LAB is the test hook.
import { parseTrades, rulesFrom, DEFAULT_RULES, walk, sim, sweep, sweetSpot, ghosts, march, plain, usd, MAZES, scalePool, hazard, ruin, bestSize, frames } from './labcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const MULTS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const KEY = 'labyrinth.v1';
const S = { pool: [], base: [], liveR: null, maze: 'b50', haz: [], best: null, ruin: null, walking: false, R: { ...DEFAULT_RULES }, demo: true, mult: 1, cap: 0, hor: 15, rows: [], cur: null, sweet: null, run: null, scene: null, ready: false, error: null, view: '', counts: {}, key: '' };

const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
const pct = (x) => `${Math.round(x * 100)}%`;
const mx = (m) => `${(+m).toFixed(2)}x`;
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const kids = (el, ...c) => { el.replaceChildren(...c.flat().filter(Boolean)); return el; };
const store = {
  read() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } },
  write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};

async function getJSON(url, ms = 6000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}

// ------------------------------------------------------------------------------------------------ the maths
function compute() {
  const { pool, R, mult, cap, hor } = S;
  const key = `${cap}|${hor}|${pool.length}`;
  if (key !== S.key) {                                                   // the sweep only changes with the cap, the horizon or the data
    S.rows = sweep(pool, cap, R, MULTS, { len: hor, n: 400, seed: 7 });
    S.sweet = sweetSpot(S.rows, 0.3);
    S.key = key;
  }
  S.cur = sim(pool, mult, cap, R, { len: hor, n: 600, seed: 7 });
  S.run = walk(march(pool, R, hor), mult, cap, R);
  S.ghosts = ghosts(pool, mult, cap, R, 24, hor, 11);
  S.haz = hazard(pool, mult, cap, R, { len: hor, n: 400, seed: 7 });
  S.best = bestSize(S.rows, R, hor, 0.3);
  S.ruin = ruin(S.cur.bust);
}

// ------------------------------------------------------------------------------------------------ the mazes (JOB 4+5)
const mazeList = () => {
  const l = MAZES.map((m) => ({ ...m, rules: m.id === 'b50' && S.liveR && S.liveR.balance == null ? S.liveR : m.rules }));
  if (S.liveR && S.liveR.balance != null) l.unshift({ id: 'live', name: 'Your live eval', short: 'Live', rules: S.liveR, scale: 1, blurb: 'Your running eval: its balance, floor and target as they are now.' });
  return l;
};
function applyMaze(id) {
  const l = mazeList(), m = l.find((x) => x.id === id) || l[0];
  S.maze = m.id; S.R = m.rules; S.pool = scalePool(S.base, m.scale); S.key = '';
  document.querySelectorAll('#mazes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.maze === m.id)));
}
function buildMazes() {
  const nav = $('mazes'); if (!nav) return;
  kids(nav, mazeList().map((m) => { const b = h('button', '', m.short); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.maze = m.id; b.title = m.blurb;
    b.append(h('small', '', m.id === 'live' ? 'running now' : usd(m.rules.start / 1000 * 1000).replace(/,000$/, 'K'))); b.addEventListener('click', () => set('maze', m.id)); return b; }));
  document.querySelectorAll('#mazes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.maze === S.maze)));
}

// ------------------------------------------------------------------------------------------------ the words

// the three money lines: drawdown left, the worst single trade at this size, and the eval fees expected for one pass (the owner's real prices)
const FEE = (R) => (R.start <= 25000 ? 63 : 91.8);
function renderMoney(c, R) {
  const floor = R.floor != null ? R.floor : R.start - R.mll, bal = R.balance != null ? R.balance : R.start, room = Math.max(0, bal - floor);
  $('mRoom').textContent = usd(room); $('mRoomOf').textContent = `of ${usd(R.mll)} max loss`;
  let worst = 0; for (const t of S.pool) worst = Math.min(worst, t.usd * Math.min(S.mult, S.cap > 0 ? S.cap / Math.max(1, t.risk) : Infinity));
  $('mWorst').textContent = S.pool.length ? usd(worst) : '-'; $('mWorstOf').textContent = S.pool.length ? 'one bad trade at this size' : '';
  const fee = FEE(R), tries = c && c.pass > 0.02 ? 1 / c.pass : null;
  $('mFee').textContent = tries ? usd(fee * tries) : '-';
  $('mFeeOf').textContent = tries ? `${usd(fee)} an eval, about ${tries < 1.5 ? '1' : Math.round(tries * 10) / 10} ${tries < 1.5 ? 'try' : 'tries'}` : 'too few passes to price';
}

function renderVerdict() {
  const c = S.cur, R = S.R;
  $('vText').textContent = S.pool.length ? plain(c, R, S.hor) : 'No trades to run yet.';
  $('oPass').textContent = pct(c.pass);
  $('oBust').textContent = pct(c.bust);
  $('oMed').textContent = c.medPass == null ? '-' : String(c.medPass);
  const live = $('live');
  if (R.balance != null) {
    const floor = R.floor != null ? R.floor : R.start - R.mll, toT = R.start + R.target - R.balance;
    live.textContent = `Your live eval now: balance ${usd(R.balance)}, floor ${usd(floor)}, room ${usd(R.balance - floor)}, ${usd(toT)} to the target${R.session ? `, session ${R.session}` : ''}.`;
    live.hidden = false;
  } else live.hidden = true;
  renderMoney(c, R);
  $('multV').textContent = mx(S.mult);
  $('mult').value = String(S.mult);
  document.querySelectorAll('#presets button').forEach((b) => {
    const m = b.dataset.m === 'sweet' ? S.sweet && S.sweet.m : +b.dataset.m;
    b.setAttribute('aria-pressed', String(m != null && Math.abs(m - S.mult) < 0.001));
  });
  $('sweetBtn').textContent = S.sweet ? `Sweet ${mx(S.sweet.m)}` : 'Sweet spot';
  const rz = S.ruin;
  if (rz) {
    const box = $('ruin'); box.dataset.level = rz.level;
    box.style.setProperty('--gp', String(Math.min(1, rz.p / 0.6)));         // the gauge is full at 60% floor hits
    $('ruinV').textContent = `${rz.pct}%`; $('ruinL').textContent = rz.label; $('ruinT').textContent = rz.text;
    $('ruinSvg').setAttribute('aria-label', `Risk of ruin ${rz.pct}%, ${rz.level}`);
  }
  if (S.best) {
    $('bestT').textContent = S.pool.length ? S.best.text : '';
    $('bestV').textContent = mx(S.best.m);
    $('bestUse').disabled = !S.pool.length;
    $('bestUse').setAttribute('aria-pressed', String(Math.abs(S.best.m - S.mult) < 0.001));
    $('bestUse').title = S.best.text;
  }
}

function svgEl(name, attrs) { const e = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); return e; }

function sizesView() {
  const W = 330, H = 132, L = 26, B = 18, T = 8, X = (m) => L + ((m - 0.25) / 1.75) * (W - L - 8), Y = (p) => H - B - p * (H - B - T);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Reach-the-target and hit-the-floor odds by size' });
  [0, 0.5, 1].forEach((p) => { svg.append(svgEl('line', { x1: L, x2: W - 8, y1: Y(p), y2: Y(p), stroke: 'rgba(243,236,224,.14)' })); const t = svgEl('text', { x: 2, y: Y(p) + 3 }); t.textContent = pct(p); svg.append(t); });
  S.rows.forEach((r) => { const t = svgEl('text', { x: X(r.m) - 8, y: H - 4 }); t.textContent = mx(r.m).replace('.00', ''); svg.append(t); });
  const line = (key, color) => svg.append(svgEl('polyline', { points: S.rows.map((r) => `${X(r.m).toFixed(1)},${Y(r[key]).toFixed(1)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
  line('pass', '#c8a24a'); line('bust', '#c96a4a');
  svg.append(svgEl('line', { x1: X(S.mult), x2: X(S.mult), y1: T, y2: H - B, stroke: '#f3ece0', 'stroke-dasharray': '3 3', opacity: 0.7 }));
  if (S.sweet) svg.append(svgEl('circle', { cx: X(S.sweet.m), cy: Y(S.sweet.pass), r: 4.5, fill: '#c8a24a', stroke: '#14110e' }));
  const tbl = h('table', 'tbl'), head = h('tr'); ['Size', 'Reach target', 'Hit floor', 'Median'].forEach((x) => head.append(h('th', '', x)));
  tbl.append(head);
  S.rows.forEach((r) => {
    const tr = h('tr', (Math.abs(r.m - S.mult) < 0.001 ? 'me ' : '') + (S.sweet && r.m === S.sweet.m ? 'sweet' : ''));
    tr.append(h('td', '', mx(r.m)), h('td', 'p', pct(r.pass)), h('td', 'b', pct(r.bust)), h('td', '', r.medPass == null ? '-' : `${r.medPass} tr`));
    tr.dataset.m = String(r.m);
    tbl.append(tr);
  });
  const sw = S.sweet, bs = S.best;
  return [h('p', 'strong', sw ? (sw.safe ? `Sweet spot ${mx(sw.m)}: ${pct(sw.pass)} reach the target, ${pct(sw.bust)} hit the floor (the most passes while busting at most 30%).`
    : `No size keeps the floor odds under 30% here; ${mx(sw.m)} is the best trade-off (${pct(sw.pass)} pass, ${pct(sw.bust)} bust).`) : 'No data.'),
  bs && bs.text ? h('p', '', bs.text + ' ' + bs.why) : null,
  S.ruin ? h('p', '', `Risk of ruin ${S.ruin.pct}% (${S.ruin.level}): ${S.ruin.text}`) : null,
  svg, h('p', '', 'Gold: runs that reach the target. Red: runs that hit the floor. The dashed line is your size. Past the sweet spot, more size adds floor hits faster than passes.'), tbl];
}

function dangerView() {
  const hz = S.haz.slice(1), top = hz.reduce((a, b) => (b.bust > a.bust ? b : a), { i: 0, bust: 0 }), rows = h('div', 'heatrows');
  hz.forEach((z) => { const bar = h('div', 'bar'), i = h('i'); i.style.width = `${Math.round((z.heat || 0) * 100)}%`; bar.append(i);
    rows.append(h('div', '', ''));
    rows.lastChild.append(h('span', 'n', `Trade ${z.i}`), bar, h('span', 'v', pct(z.bust))); });
  const dead = 1 - (hz.length ? hz[hz.length - 1].alive : 1);
  return [h('p', 'strong', top.bust > 0 ? `The danger zone is trade ${top.i}: ${pct(top.bust)} of all runs end at the floor right there. By trade ${S.hor} ${pct(dead)} of runs are over (floor or target).`
    : 'At this size no run reaches the floor inside the look-ahead: the corridor is clear.'),
    rows, h('p', '', 'The red strip on the maze floor is the same picture: the redder the block, the more runs end at the floor on that trade. Early trades are dangerous because there is no cushion yet: the drawdown left is only the max loss.'),
    h('p', '', `${S.R.name}, size ${mx(S.mult)}, ${S.pool.length} trades drawn at random 400 times.`)];
}

function marchView() {
  const w = S.run, R = S.R, ol = h('ol', 'march');
  w.steps.forEach((s, i) => {
    if (!i) { const li = h('li'); li.append(h('span', 'n', 'Start'), h('span', '', `Balance ${usd(s.bal)}`), h('span', 'room', `floor ${usd(s.floor)}`)); ol.append(li); return; }
    const li = h('li'), last = i === w.steps.length - 1;
    li.append(h('span', 'n', s.day.slice(5)), h('span', s.usd >= 0 ? 'up' : 'down', `${s.usd >= 0 ? '+' : '-'}${usd(Math.abs(s.usd))} -> ${usd(s.bal)}`), h('span', 'room', `room ${usd(s.bal - s.floor)}`));
    ol.append(li);
    if (last && w.outcome !== 'open') {
      const e = h('li', `end ${w.outcome}`);
      e.append(h('span', 'n', w.outcome === 'pass' ? 'PASS' : 'BUST'), h('b', '', w.outcome === 'pass' ? 'The target gate opens.' : 'The floor wall caught the runner.'), h('span', 'room', `trade ${w.at}`));
      ol.append(e);
    }
  });
  const nSrc = Object.entries(S.counts).map(([k, v]) => `${v} ${k}`).join(', ');
  return [h('p', 'strong', `The most recent ${w.steps.length - 1} trades, walked in order at ${mx(S.mult)} as one fresh ${R.name} eval: ${w.outcome === 'pass' ? 'it reaches the target' : w.outcome === 'bust' ? 'it hits the floor' : 'it is still open'}.`),
    ol, h('p', '', `Trades the site shows: ${nSrc || 'none'}. Backtest trades are what the bot would have done; the real ones are on the PC.`)];
}

function rulesView() {
  const R = S.R;
  return [h('p', 'strong', `The maze is the ${R.name} eval: start ${usd(R.start)}, target +${usd(R.target)}, max loss ${usd(R.mll)}.`),
    h('p', '', `The FLOOR wall is the trailing max loss: it sits ${usd(R.mll)} under your best balance and climbs with every new high, until it reaches start + ${usd(R.lock)}; then it stops climbing (locked).`),
    h('p', '', 'The TARGET gate is the profit target. Touch the floor first and the eval is over; reach the gate first and it is passed.'),
    h('p', '', `Size multiplies every trade's $ (1x is what the bot sized). The risk cap is a ceiling on the $ a single trade may risk: a wide stop gets fewer micros, which is how the bot already sizes.`),
    h('p', '', `The odds come from ${S.pool.length} LIT trades the site shows, drawn at random 600 times; each trade counts as a step (the peak is taken after the trade). ` +
      'It is a what-if, not a forecast: a small sample, the same trades reshuffled. It never places or changes an order.'),
    S.demo ? h('p', '', 'DEMO: the site data was not reachable, so this is a recorded copy of the trades.') : null];
}

const TITLES = { sizes: 'Sizes: pass and bust', danger: 'Danger zones', march: 'The march: the real order', rules: 'How the maze works' };
function openSheet(view) {
  S.view = view;
  $('sheetTitle').textContent = TITLES[view];
  kids($('sheetBody'), view === 'sizes' ? sizesView() : view === 'danger' ? dangerView() : view === 'march' ? marchView() : rulesView());
  $('sheet').hidden = false;
  document.querySelectorAll('#pills button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  history.replaceState(null, '', '#' + view);
}
function closeSheet() {
  S.view = ''; $('sheet').hidden = true;
  document.querySelectorAll('#pills button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  history.replaceState(null, '', location.pathname + location.search);
}

// ------------------------------------------------------------------------------------------------ update
let pending = 0;
function update() {
  compute();
  renderVerdict();
  if (S.scene) S.scene.setRun({ steps: S.run.steps, rules: S.R, ghosts: S.ghosts, horizon: S.hor, outcome: S.run.outcome, hazard: S.haz });
  if (S.view) openSheet(S.view);
  store.write({ mult: S.mult, cap: S.cap, hor: S.hor, maze: S.maze });
  postCard();
}
function schedule() { if (!pending) pending = requestAnimationFrame(() => { pending = 0; update(); }); }
function set(k, v) {
  if (k === 'mult') S.mult = Math.max(0.25, Math.min(2, Math.round(v * 20) / 20));
  else if (k === 'cap') S.cap = Math.max(0, +v || 0);
  else if (k === 'hor') S.hor = [8, 15, 30].includes(+v) ? +v : 15;
  else if (k === 'maze') { stopWalk(); applyMaze(String(v)); }
  $('cap').value = String(S.cap); $('hor').value = String(S.hor);
  schedule();
}

// ------------------------------------------------------------------------------------------------ Jarvis card
function card() {
  const c = S.cur, sw = S.sweet;
  return { v: 1, name: 'Labyrinth', status: { level: S.demo ? 'off' : 'ok', label: S.demo ? 'Demo data' : `Sweet spot ${mx(sw.m)}` },
    kpis: [{ label: 'Pass odds', value: pct(c.pass) }, { label: 'Bust odds', value: pct(c.bust) }, { label: 'Sweet spot', value: mx(sw.m) }],
    lines: [plain(c, S.R, S.hor).slice(0, 120), `At ${mx(S.mult)} size, cap ${S.cap ? usd(S.cap) : 'off'}, ${S.hor} trades ahead. A what-if, not a forecast.`.slice(0, 120)],
    t: Math.floor(Date.now() / 1000), open: '#sizes', theme: '#14110e', stale_after: 604800 };
}
function postCard() {
  if (S.demo || !O || !O.framed) return;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: card() }, (/^https?:/.test(location.protocol) ? location.origin : 'https://demetrades2000-coder.github.io')); } catch (_) { /* not inside Jarvis */ }
}

// ------------------------------------------------------------------------------------------------ start
async function startScene() {
  try {
    const { createMaze } = await import('./scene.js');
    S.scene = createMaze($('maze'), { O });
    $('lite').hidden = !S.scene.lite();
    S.scene.onQuality(() => { $('lite').hidden = !S.scene.lite(); });
  } catch (e) {
    S.error = 'scene: ' + ((e && e.message) || e);
    document.documentElement.dataset.noscene = '1';
    if (O) O.ready();
  }
}

// ------------------------------------------------------------------------------------------------ the walkthrough
let walkTimer = 0;
function walkNote(k, done) {
  const f = frames(S.run, S.R), fr = f[Math.min(k, f.length - 1)];
  const line = $('walkLine'); line.hidden = false;
  line.textContent = (fr.i ? `Trade ${fr.i} of ${f.length - 1} · ` : '') + fr.note;
  if (done) endWalk();
}
function endWalk() { S.walking = false; clearInterval(walkTimer); $('walkBtn').setAttribute('aria-pressed', 'false'); $('walkBtn').textContent = 'Walk it'; }
function stopWalk() { if (!S.walking) return; if (S.scene) S.scene.stopWalk(); endWalk(); $('walkLine').hidden = true; }
function startWalk() {
  if (S.walking) { stopWalk(); return; }
  S.walking = true; $('walkBtn').setAttribute('aria-pressed', 'true'); $('walkBtn').textContent = 'Stop';
  const n = S.run.steps.length;
  if (S.scene && S.scene.walk((k, done) => walkNote(k, done), Math.max(0.05, Math.min(0.2, 1.6 / n)))) return;
  let k = 0; walkNote(0, false);                                          // no scene (LITE / no WebGL): the same story as text, one trade at a time
  walkTimer = setInterval(() => { k++; walkNote(k, k >= n - 1); }, 700);
}

function wire() {
  $('walkBtn').addEventListener('click', startWalk);
  $('bestUse').addEventListener('click', () => { if (S.best) set('mult', S.best.m); });
  buildMazes();
  $('mult').addEventListener('input', (e) => set('mult', +e.target.value));
  $('cap').addEventListener('change', (e) => set('cap', +e.target.value));
  $('hor').addEventListener('change', (e) => set('hor', +e.target.value));
  document.querySelectorAll('#presets button').forEach((b) => b.addEventListener('click', () => set('mult', b.dataset.m === 'sweet' ? S.sweet.m : +b.dataset.m)));
  document.querySelectorAll('#pills button').forEach((b) => b.addEventListener('click', () => (S.view === b.dataset.view ? closeSheet() : openSheet(b.dataset.view))));
  $('close').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  const route = () => { const t = location.hash.slice(1); if (TITLES[t]) openSheet(t); };
  addEventListener('hashchange', route); route();
  const fit = () => { document.documentElement.style.setProperty('--dock-h', Math.ceil($('dock').getBoundingClientRect().height) + 'px'); const pl = $('pills'); if (pl) document.documentElement.style.setProperty('--hud-h', Math.ceil(pl.getBoundingClientRect().bottom + 6) + 'px'); };
  fit(); addEventListener('resize', fit);
  if (typeof ResizeObserver === 'function') { new ResizeObserver(fit).observe($('dock')); new ResizeObserver(fit).observe($('verdict')); }
}

async function main() {
  const scene = startScene();
  const [tr, home] = await Promise.all([getJSON('../odeon/trades.json'), getJSON('../home.json')]);
  let pool = parseTrades(tr), R = rulesFrom(home);
  S.demo = pool.length < 8;
  if (S.demo) {                                                          // the site data is not there: the recorded copy (DEMO)
    const fx = await getJSON('fixture.json');
    if (fx) { pool = parseTrades(fx); R = rulesFrom(fx.home); }
  }
  S.base = pool; S.liveR = R;
  { const sv0 = store.read(); const want = mazeList().some((m) => m.id === sv0.maze) ? sv0.maze : (R.balance != null ? 'live' : 'b50'); S.maze = want; applyMaze(want); }
  S.counts = pool.reduce((a, t) => { a[t.src] = (a[t.src] || 0) + 1; return a; }, {});
  const sv = store.read();
  if (sv.mult) S.mult = Math.max(0.25, Math.min(2, +sv.mult || 1));
  if (sv.cap >= 0) S.cap = +sv.cap || 0;
  if ([8, 15, 30].includes(+sv.hor)) S.hor = +sv.hor;
  $('demo').hidden = !S.demo;
  $('cap').value = String(S.cap); $('hor').value = String(S.hor);
  await scene;
  wire();
  update();
  S.ready = true;
  document.body.dataset.ready = '1';
}

window.LAB = {
  state: () => ({ ready: S.ready, demo: S.demo, mult: S.mult, cap: S.cap, hor: S.hor, n: S.pool.length, counts: S.counts, pass: S.cur && S.cur.pass, bust: S.cur && S.cur.bust, medPass: S.cur && S.cur.medPass,
    sweet: S.sweet, maze: S.maze, mazes: mazeList().map((m) => m.id), ruin: S.ruin, best: S.best, haz: S.haz && S.haz.map((z) => +z.heat.toFixed(3)), walking: S.walking, outcome: S.run && S.run.outcome, steps: S.run && S.run.steps.length, rules: S.R, view: S.view, scene: S.scene ? S.scene.stats() : null, error: S.error, rows: S.rows }),
  set: (k, v) => { set(k, v); update(); pending && cancelAnimationFrame(pending); pending = 0; return window.LAB.state(); },
  card, walk: startWalk, frames: () => frames(S.run, S.R),
};

main().catch((e) => { S.error = String((e && e.message) || e); if (O) O.fail(S.error); });
