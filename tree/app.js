// DAPHNE app: the state, the playback clock, touch, the HUD, the bottom sheet (THE SEARCH / TOP RULES), the rule cards and
// the top-10 sheet. Data and layout: core.js; everything drawn on the canvas: paint.js.
//
// URL: #root=<root id> opens a root, #top opens the top 10, #rules opens the TOP RULES tab. ?at=<ms> freezes the playback
// clock (screenshots).
import * as C from './core.js?v=d3';
import { paint, ancestry, bestPath, GROW_MS, IGNITE_MS, LENS_MS } from './paint.js?v=d4';
import { startGlow } from './glow.js?v=d3';
import { startTree3d, SEASON_NAMES } from './tree3d.js?v=d6';
import { createBranchUI } from './branchui.js?v=d2';
import * as G from './gate.js?v=g2';           // JOB 47: the owner's adoption checks, R beside $, the losing run against the max loss

const O = window.OLYMPUS || null;   // the OLYMPUS kit (../olympus/olympus.js): one 3D quality for every app, the veil, themes

const ZOOM_MIN = 0.6, ZOOM_MAX = 7;
const JARVIS_ORIGIN = (/^https?:/.test(location.protocol) ? location.origin : 'https://demetrades2000-coder.github.io');   // Jarvis is on the same origin as the app; the old address only when opened from a file

const $ = (id) => document.getElementById(id);
const app = $('app'), canvas = $('stage'), ctx = canvas.getContext('2d', { alpha: false });
const query = new URLSearchParams(location.search);
const frozenAt = query.has('at') ? Number(query.get('at')) : null;
const reduced = O ? O.reduced() : matchMedia('(prefers-reduced-motion: reduce)').matches;
const SIDE_PANEL = matchMedia('(orientation: landscape) and (max-height: 520px)');   // as in tree.css

const S = {
  model: null, rootId: null, root: null, tree: null, layouts: new Map(),
  lens: 'train', lensPrev: 'train', lensAt: 0, t0: 0, view: { s: 1, x: 0, y: 0 }, geo: null, w: 0, h: 0, dpr: 1,
  // 2: full (dpr up to 2), 1: light (1.5), 0: lightest (1). The owner's OLYMPUS choice wins; else the phone decides
  quality: O && O.chosen() ? (O.fx() === 'off' ? 0 : O.lite() ? 1 : 2) : O && O.lite() ? 1 : (devicePixelRatio >= 2 && (navigator.hardwareConcurrency || 4) >= 4) ? 2 : 1,
  frameMs: 16, slowSince: 0, selected: null, hudAt: -1, lit: -1, tab: 'search',
  maxScore: 1, maxOos: 1, maxN: 1, minN: 60, positiveLeaves: [], leafCount: 0, theme: null,
  topSort: 'rank', topHold: false,
  season: 'auto', hold: null,       // the season of the tree (auto = by the search and the lens); hold = a scrubbed time in ms (null = playing)
};

// ------------------------------------------------------------------------------------------------ data
async function loadDoc() {
  for (const name of ['tree.json', 'demo.json']) {
    try {
      const res = await fetch(name, { cache: 'no-cache' });
      if (res.ok) return await res.json();
    } catch (e) { /* try the next source */ }
  }
  throw new Error('no tree.json and no demo.json next to this page');
}

/** Show a root's tree and play its search from the start (already grown when the phone asks for reduced motion). */
function selectRoot(id) {
  const m = S.model;
  if (!m.trees[id]) id = m.featured[0];
  S.rootId = id;
  S.root = m.byId[id];
  if (!S.layouts.has(id)) S.layouts.set(id, C.layoutTree(m.trees[id]));
  S.tree = S.layouts.get(id);
  S.selected = null;
  hideCard();
  const nodes = S.tree.nodes;
  S.minN = m.meta.min_n || 60;
  S.maxN = Math.max(...nodes.map((n) => n.n), S.minN + 1);
  S.maxScore = Math.max(1e-6, ...nodes.map((n) => n.score || 0));
  S.maxOos = Math.max(1e-6, ...nodes.map((n) => Math.abs(n.oos || 0)));
  const N = Math.max(1, nodes.length - 1);
  nodes.forEach((n, k) => {
    const f = k / N;
    n.appear = GROW_MS * (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2) * 0.96;   // ease in-out
    n.width = 0.45 + 1.35 * Math.log1p(n.n / S.minN) / Math.log1p(S.maxN / S.minN);
    n.path = null;
  });
  S.positiveLeaves = nodes.filter((n) => !n.kids.length && (n.score || 0) > 0);
  S.view = { s: 1, x: 0, y: 0 };
  S.lit = -1; S.hudAt = -1;
  S.t0 = performance.now() - (reduced ? GROW_MS + IGNITE_MS : 0);
  S.hold = null; syncPlay();
  document.querySelectorAll('.seed').forEach((b) => b.setAttribute('aria-current', String(b.dataset.root === id)));
  document.querySelectorAll('#rules li').forEach((li) => li.classList.toggle('cur', li.dataset.root === id));
  const seed = document.querySelector(`.seed[data-root="${CSS.escape(id)}"]`);
  if (seed) seed.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
  try { history.replaceState(null, '', location.search + '#root=' + encodeURIComponent(id)); } catch (e) { /* sandboxed frame */ }
  renderStatic();
  buildBest();
  resize();
}

// ------------------------------------------------------------------------------------------------ geometry
/** Canvas size (dpr capped by the quality level) and the fan's geometry between the top bar and the bottom sheet.
 *  Layout is read here only (on resize, a root, a tab), never in the frame loop. */
function resize() {
  const cap = S.quality >= 2 ? 2 : S.quality === 1 ? 1.5 : 1;
  S.dpr = Math.min(devicePixelRatio || 1, cap);
  O?.mode(S.quality < 2);
  S.w = canvas.clientWidth; S.h = canvas.clientHeight;
  canvas.width = Math.round(S.w * S.dpr); canvas.height = Math.round(S.h * S.dpr);
  const side = SIDE_PANEL.matches;
  const seeds = $('seeds').getBoundingClientRect();
  const top = document.querySelector('.hud-top').getBoundingClientRect();
  $('foot').style.bottom = `${Math.round(S.h - seeds.top)}px`;
  $('foot').style.top = side ? `${Math.round(top.bottom)}px` : '';
  const foot = $('foot').getBoundingClientRect();
  const left = side ? foot.right - 30 : 0;
  const baseY = (side ? seeds.top : foot.top + 18) - 8;
  const ceiling = top.bottom + 4;
  const cx = (left + S.w) / 2, halfW = (S.w - left) / 2 - 10, spread = 1.2;
  S.geo = { cx, baseY, spread, ry: Math.max(80, baseY - ceiling), rx: Math.max(60, halfW / Math.sin(spread)) };
  document.querySelectorAll('.tools').forEach((el) => { el.style.top = `${Math.round(top.bottom - 4)}px`; });
}

// ------------------------------------------------------------------------------------------------ HUD
function set(id, html) { const el = $(id); if (el.innerHTML !== html) el.innerHTML = html; }

function updateHud(t) {
  const bucket = Math.min(40, Math.floor(t / 150));
  if (bucket === S.hudAt) return;
  S.hudAt = bucket;
  const st = S.root.tree, f = Math.min(1, t / GROW_MS);
  const best = f >= 1 ? st.best : Math.max(0, ...S.tree.nodes.filter((n) => n.appear <= t).map((n) => n.score || 0));
  set('topo', `Searched <b>${C.int(Math.round(st.nodes * f))}</b> branches · cut <b>${f >= 1 ? st.cut_pct : Math.round(st.cut_pct * f)}%</b> as dead ends` +
    ` · best score <b>${best.toFixed(1)}</b> of a possible <b>${st.bound.toFixed(1)}</b>`);
}

function renderStatic() {
  const m = S.model, r = S.root, meta = m.meta, best = r.best;
  const idx = m.roots.findIndex((x) => x.id === r.id) + 1;
  $('demo').hidden = !m.demo;
  set('rule', `<b>The rule:</b> ${esc(r.text.charAt(0) + r.text.slice(1).toLowerCase())}`);
  set('crit', `Scored on mean excess, trained up to ${meta.train_end} · root ${idx} of ${m.roots.length} · depth ${meta.depth} · at least ${meta.min_n} trades`);
  const tr = best.train || {}, te = best.test || {}, y = best.y2026 || {};
  const cell = (name, v, f = C.usd) => `${name} <span class="${C.sign(v)}">${f(v)}</span>`;
  set('money', `<span class="mhead">One micro, per trade</span> ` + [cell('train', tr.mean), cell('unseen', te.mean), cell('2026', y.mean)].join(' · ') + `<span class="mbig">${cell('Per month on unseen data', te.mo_1, C.money)} · ${cell('at bot size', te.mo_bot, C.money)}</span>`);
  const path = bestPath(S).slice(1);
  $('nsteps').textContent = path.length;
  document.querySelector('.sheet-tabs [data-tab="search"]').textContent = `The search · ${path.length} step${path.length === 1 ? '' : 's'}`;
  const conds = m.conds;
  $('steps').innerHTML = path.length ? path.map((n) => `<li><span class="c">${esc(conds[n.cond] ? conds[n.cond][3] : '?')}</span>` +
    `<span class="v">${(n.score || 0).toFixed(2)}</span></li>`).join('')
    : '<li class="empty"><span class="c">no condition beats the plain root</span></li>';
  S.lit = -1;
  const st = r.tree, scale = Math.max(st.bound, 1e-6);
  const bar = (name, v, color) => `<div class="bar"><span>${name}</span><i style="--w:${Math.max(0, Math.min(100, 100 * v / scale)).toFixed(1)}%;--c:${color}"></i><span>${v.toFixed(2)}</span></div>`;
  $('bars').innerHTML = bar('Gap', st.bound - st.best, 'var(--amber)') + bar('Bound', st.bound, 'rgba(155, 171, 99,.45)') + bar('Best', st.best, 'var(--green)');
  $('roots').innerHTML = m.roots.map((x) => `<i class="${x.tree.open ? 'open' : ''}${x.id === r.id ? ' cur' : ''}" title="${esc(x.key)} ${C.variant(x)}"></i>`).join('');
  const complete = m.roots.filter((x) => !x.tree.open).length;
  $('rootsLegend').textContent = `${complete} searched to the end · ${m.roots.length - complete} still open · ${C.int(meta.nodes)} branches in all`;
  renderVerdict();
}

// the honest verdict, on top: does the whole search beat chance, and does this root's best rule hold out of sample
function renderVerdict() {
  const m = S.model, r = S.root, h = m.honesty, real = h.real || {}, plc = (h.placebo || []).map((p) => p.hold_pct);
  const held = r.best.holds, chance = C.beatsChance(h), te = r.best.test || {};
  $('verdict').className = 'verdict ' + (chance ? 'ok' : 'no');
  set('verdict', `<b class="vt">${chance ? 'Beats chance' : 'Chance level'}</b>` +
    `<span class="hr">Holds up ${real.hold_pct}% of the time on new data (${real.hold}/${real.best_rules} best rules)` +
    (plc.length ? ` · random rules ${plc.map((p) => p + '%').join(' / ')}` : '') + `</span>` +
    `<span>This root: <b class="${held ? 'pos' : 'neg'}">${held ? 'holds' : 'fails'}</b> · ` +
    (te.n ? `unseen ${C.usd(te.mean)} a trade on ${te.n} trades` : 'no test trades') + `</span>`);
}

function lightSteps(lit) {
  document.querySelectorAll('#steps li').forEach((li, i) => li.classList.toggle('lit', i < lit));
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ------------------------------------------------------------------------------------------------ the bottom sheet: THE SEARCH / TOP RULES
function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.sheet-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
  resize();
}
/** BEST: the best branch in plain words, from the top rule of the whole search and from the root on screen. */
function buildBest() {
  const m = S.model, r = S.root, top = m.top[0], cut = r.tree.cut_pct;
  const words = (steps) => (steps && steps.length ? steps.map((x) => esc(x)).join(' <i>and</i> ') : 'no extra condition: the plain level trade');
  const line = (rule, root, head) => {
    const te = rule.test || {}, y = rule.y2026 || {}, holds = rule.holds;
    return `<h3>${head}</h3><p class="big"><b>${esc(rule.key)}</b> ${root && root.target_r ? C.variant(root) : ''} · <b class="${holds ? 'pos' : 'neg'}">${holds ? 'holds out of sample' : 'fails out of sample'}</b></p>`
      + `<p>Take the level trade, but only when ${words(rule.steps)}.</p>`
      + `<div class="stats"><div><b class="${C.sign(te.mean)}">${C.usd(te.mean)}</b><small>Unseen, per trade</small></div>`
      + `<div><b class="${C.sign(te.mo_bot)}">${C.money(te.mo_bot)}</b><small>Bot, per month</small></div><div><b>${C.int(te.n || 0)}</b><small>Unseen trades</small></div></div>`
      + (y.mean !== undefined ? `<p>2026 alone: <b class="${C.sign(y.mean)}">${C.usd(y.mean)}</b> a trade.</p>` : '') + G.gateHtml(rule, m.meta);
  };
  const here = { key: r.key, steps: bestPath(S).slice(1).map((n) => (m.conds[n.cond] ? m.conds[n.cond][3] : '?')), test: r.best.test, y2026: r.best.y2026, holds: r.best.holds };
  const held = m.top.filter((x) => x.holds).length;
  $('best').innerHTML = (top ? line(top, m.byId[top.root], 'Best branch of the whole search') : '')
    + (top && top.root === r.id ? '' : line(here, r, 'Best branch of this tree'))
    + `<p>${held} of the top ${m.top.length} rules hold out of sample. This tree cut ${cut}% of its branches as dead ends (they fade).</p>`
    + (top && top.root !== r.id ? `<button type="button" class="go" id="bestGo">Grow the best tree</button>` : '');
  const go = $('bestGo');
  if (go) go.addEventListener('click', () => selectRoot(top.root));
}
function buildRules() {
  const m = S.model;
  $('rules').innerHTML = m.top.map((r, i) => {
    const te = r.test || {}, root = m.byId[r.root] || {}, tb = G.atBot(te, +m.meta.bot_risk_usd || 282);
    return `<li data-root="${esc(r.root)}" class="${r.root === S.rootId ? 'cur' : ''}"><span class="rk">#${i + 1}</span>` +
      `<span class="nm"><b>${esc(r.key)}</b> ${root.target_r ? C.variant(root) : ''}<small>${esc(r.steps.join(' · '))}</small><small class="gn ${G.gate(r, m.meta).verdict}">${esc(G.noteText(r, m.meta))}</small></span>` +
      `<span class="mo ${C.sign(tb ? tb.usd : te.mean)}">${tb ? G.fmtUsd(tb.usd) : C.usd(te.mean)}<small>${tb ? G.fmtR(tb.r) + ' TEST/TR' : 'TEST/TR'}</small></span>` +
      `<span class="tag ${r.holds ? 'ok' : 'no'}">${r.holds ? 'Holds' : 'Fails'}</span></li>`;
  }).join('');
  const held = m.top.filter((r) => r.holds).length;
  $('rulesNote').textContent = `${held} of the top ${m.top.length} hold out of sample. Tap one to grow its tree. Dollars a trade at bot size (1R = $${+m.meta.bot_risk_usd || 282}), after costs.`;
}

// ------------------------------------------------------------------------------------------------ seeds
function buildSeeds() {
  const m = S.model;
  $('seeds').innerHTML = m.featured.map((id) => {
    const r = m.byId[id], te = r.best.test || {};
    return `<button type="button" class="seed" data-root="${esc(id)}" aria-current="false" aria-label="${esc(r.key)} ${C.variant(r)}">` +
      `<canvas width="128" height="60"></canvas><b>${esc(r.key)}</b><small>${C.variant(r)}<span class="${C.sign(te.mean)}">${C.usd(te.mean)}</span></small></button>`;
  }).join('');
  document.querySelectorAll('.seed').forEach((b) => {
    drawSeed(b.querySelector('canvas'), b.dataset.root);
    b.addEventListener('click', () => selectRoot(b.dataset.root));
  });
}

function drawSeed(cv, id) {
  if (!S.layouts.has(id)) S.layouts.set(id, C.layoutTree(S.model.trees[id]));
  const L = S.layouts.get(id), g = cv.getContext('2d');
  const geo = { cx: cv.width / 2, baseY: cv.height - 3, spread: 1.2, ry: cv.height - 8, rx: (cv.width / 2 - 4) / Math.sin(1.2) };
  g.fillStyle = '#17130f'; g.fillRect(0, 0, cv.width, cv.height);
  g.globalCompositeOperation = 'lighter';
  for (const n of L.nodes) {
    const p = L.byId.get(n.parent);
    if (!p) continue;
    const [x1, y1] = C.place(p, geo), [x2, y2] = C.place(n, geo);
    g.lineWidth = Math.max(0.5, 1.6 - 0.25 * n.depth);
    g.strokeStyle = n.best ? 'rgba(243, 236, 224,.9)' : n.status === C.CUT ? 'rgba(127, 138, 82,.25)' : 'rgba(155, 171, 99,.32)';
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(x1, (y1 + y2) / 2, x2, y2); g.stroke();
  }
}

// ------------------------------------------------------------------------------------------------ cards
function showNode(n) {
  const m = S.model, r = S.root, sess = m.meta.sessions || {};
  S.selected = n;
  const path = ancestry(S, n).slice(1);
  const chips = `<span class="chip root">${esc(r.key)} ${C.variant(r)}</span>` + path.map((p) => `<span class="chip">${esc(m.conds[p.cond][3])}</span>`).join('');
  const words = esc(r.text) + (path.length ? ', only when ' + path.map((p) => esc(m.conds[p.cond][4])).join('; ') : '') + '.';
  const tr = C.nodeMoney(r, n, 'train', sess), te = C.nodeMoney(r, n, 'test', sess);
  const row = (name, x) => `<tr><td>${name}</td><td>${C.int(x.n)}</td><td class="${C.sign(x.mean)}">${C.usd(x.mean)}</td>` +
    `<td class="${C.sign(x.excess)}">${n.depth ? C.usd(x.excess) : '—'}</td><td class="${C.sign(x.mo)}">${C.money(x.mo)}</td></tr>`;
  const isBest = n.best && n === S.tree.bestPath[S.tree.bestPath.length - 1];
  const bot = isBest ? `<tr><td>BOT SIZE $/MO</td><td colspan="4" class="${C.sign(r.best.test.mo_bot)}">TRAIN ${C.money(r.best.train.mo_bot)} · TEST ${C.money(r.best.test.mo_bot)} · 2026 ${C.money((r.best.y2026 || {}).mo_bot)}</td></tr>` : '';
  const verdict = n.depth ? C.holds(r, n, m.meta.min_test_n || 10, sess) : null;
  const tag = !n.depth ? '<span class="tag na">THE PLAIN ROOT</span>'
    : verdict === null ? '<span class="tag na">TOO FEW TEST TRADES</span>'
    : verdict ? '<span class="tag ok">HOLDS OUT OF SAMPLE</span>' : '<span class="tag no">FAILS OUT OF SAMPLE</span>';
  $('cardBody').innerHTML = `<h3 id="cardTitle">NODE ${n.id} · DEPTH ${n.depth} · ${C.STATUS_WORDS[n.status]}${isBest ? ' · BEST' : ''}</h3>` +
    `<div class="chips">${chips}</div><p class="words">${words}</p>` +
    `<table class="nums"><thead><tr><th></th><th>TRADES</th><th>$/TRADE/µ</th><th>VS ROOT</th><th>$/MO 1µ</th></tr></thead><tbody>` +
    row(`TRAIN ≤ ${m.meta.train_end.slice(0, 4)}`, tr) + row('TEST 2025-26', te) + bot + '</tbody></table>' +
    `<p class="note">SCORE ${(n.score || 0).toFixed(2)} · BOUND ${(n.bound || 0).toFixed(2)} (nothing below this branch can score more)</p>${tag}`;
  $('card').hidden = false;
}

function hideCard() { $('card').hidden = true; S.selected = null; }

function showTop() {
  const m = S.model, h = m.honesty.real || {};
  $('topSub').textContent = `${C.int(h.nodes)} nodes searched on ${h.roots} roots. ${h.hold} of ${h.best_rules} best rules hold out of sample` +
    ((m.honesty.placebo || []).length ? `; with shuffled conditions ${(m.honesty.placebo || []).map((p) => p.hold_pct + '%').join(' / ')} do.` : '.') +
    ` $ per trade per micro after $1.90 costs; bot size = $${m.meta.bot_risk_usd} risk a trade.`;
  buildTopBar();
  buildTopList();
  $('top').hidden = false;
}
const SORTS = [['rank', 'RANK'], ['mo2026', '2026 $/MO'], ['motest', 'TEST $/MO'], ['tpw', 'TRADES/WK']];
function buildTopBar() {
  const bar = $('topBar'); if (!bar) return;
  bar.innerHTML = SORTS.map(([k, name]) => `<button type="button" data-sort="${k}" aria-pressed="${S.topSort === k}">${name}</button>`).join('')
    + `<button type="button" data-hold aria-pressed="${S.topHold}">ONLY HOLDS</button>`;
}
function buildTopList() {
  const m = S.model, rk = +m.meta.bot_risk_usd || 282;
  const cols = [['train', `TRAIN ≤${m.meta.train_end.slice(0, 4)}`], ['test', 'TEST 25-26'], ['y2026', '2026']];
  const list = G.sortRules(m.top, S.topSort, S.topHold, m.meta);
  $('toplist').innerHTML = list.length ? list.map(({ r, i }) => {
    const rows = cols.map(([k, name]) => {
      const x = r[k] || {};
      return `<tr><td>${name}</td><td>${C.int(x.n || 0)}</td><td class="${C.sign(x.mean)}">${C.usd(x.mean)}</td><td>${x.win ?? '—'}${x.win !== undefined ? '%' : ''}</td>` +
        `<td>${x.tpw ?? '—'}</td><td class="${C.sign(x.mo_bot)}">${C.money(x.mo_bot)}${x.mo_bot !== undefined && x.mo_bot !== null ? `<small class="rr">${G.fmtR(x.mo_bot / rk)}</small>` : ''}</td></tr>`;
    }).join('');
    const root = m.byId[r.root] || {};
    return `<li data-root="${esc(r.root)}"><div class="hd"><span class="rk">#${i + 1}</span><b>${esc(r.key)}</b><small>${root.target_r ? C.variant(root) : ''}</small>` +
      `<span class="tag ${r.holds ? 'ok' : 'no'}">${r.holds ? 'Holds' : 'Fails'}</span></div>` +
      `<div class="chips">${r.steps.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` +
      `<table class="nums"><thead><tr><th></th><th>N</th><th>$/TR/µ</th><th>WIN</th><th>TR/WK</th><th>BOT $/MO · R</th></tr></thead><tbody>${rows}</tbody></table>${G.gateHtml(r, m.meta)}</li>`;
  }).join('') : `<li class="none">NO RULE HOLDS OUT OF SAMPLE IN THIS SEARCH. TURN OFF ONLY HOLDS TO SEE ALL ${m.top.length}.</li>`;
}

function hideTop() { $('top').hidden = true; }

// ------------------------------------------------------------------------------------------------ the lens: TRAIN / TEST
// a wavefront climbs the tree from the root (paint.js lensOf), the screen flashes the lens's colour and a stamp says what
// the out-of-sample test did to this root's best rule
function setLens(lens) {
  if (lens === S.lens) return;
  S.lensPrev = S.lens; S.lens = lens; S.lensAt = reduced ? performance.now() - LENS_MS * 2 : performance.now();
  document.querySelectorAll('.lens button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.lens === lens)));
  app.dataset.lens = lens;
  const fx = $('lensFx'), held = S.root && S.root.best.holds;
  $('lensT').textContent = lens === 'test' ? 'OUT OF SAMPLE · 2025-26' : 'IN SAMPLE · TRAIN ≤ ' + String(S.model.meta.train_end).slice(0, 4);
  $('lensS').textContent = lens === 'test' ? (held ? 'THIS ROOT\'S BEST RULE HOLDS' : 'THIS ROOT\'S BEST RULE FAILS') : 'WHAT THE SEARCH SAW';
  $('lensS').className = lens === 'test' ? (held ? 'pos' : 'neg') : '';
  fx.className = 'lens-fx ' + lens;
  fx.style.opacity = reduced ? '1' : '0';
  fx.hidden = false;
  S.fxAt = performance.now();                                        // loop() fades it in and out (opacity only: no layout)
  clearTimeout(setLens.timer);
  setLens.timer = setTimeout(() => { fx.hidden = true; S.fxAt = 0; }, FX_MS);
}
const FX_MS = 1700;
function stepFx(now) {
  if (!S.fxAt || reduced) return;
  const f = (now - S.fxAt) / FX_MS, fx = $('lensFx');
  if (f >= 1) { fx.hidden = true; S.fxAt = 0; return; }
  const o = f < 0.14 ? f / 0.14 : f < 0.7 ? 1 : Math.max(0, 1 - (f - 0.7) / 0.3);
  fx.style.opacity = o.toFixed(3);
  fx.style.transform = `scale(${(f < 0.14 ? 1.12 - 0.12 * f / 0.14 : 1 - 0.02 * Math.max(0, f - 0.7) / 0.3).toFixed(4)})`;
}

// ------------------------------------------------------------------------------------------------ OLYMPUS themes
// applyTheme(tokens): the OLYMPUS theme tokens ({bg, glass, line, text, dim, accent, mix, harmony, ...}) or CSS variable
// names ('--x': value). bg blends into DAPHNE's own phosphor dark by `mix`, the accent into its green by `harmony` (0 in the
// default theme: nothing changes; missing: as given); the canvas takes the background on its next frame. With the kit's
// themes (olympus.js theme / onTheme) the kit paints the CSS tokens itself: the canvas then reads the kit's --bg.
const OWN = { bg: '#17130f', accent: '#c8a24a' };
const THEME_VARS = { text: '--text', dim: '--dim', glass: '--panel', panel: '--panel', line: '--line' };
// '#rrggbb' a -> b by t (0 = a untouched); anything else: b when t > 0 (the OLYMPUS themes' own mix rule, kept local)
function mixHex(a, b, t) {
  const p = (h) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)) : null);
  const A = p(a), B = p(b);
  if (!(t > 0)) return a;
  if (!A || !B) return b;
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * Math.min(1, t)).toString(16).padStart(2, '0')).join('');
}
export function applyTheme(tok) {
  if (!tok || typeof tok !== 'object') return;
  const root = document.documentElement.style, mix = typeof tok.mix === 'number' ? tok.mix : 1, har = typeof tok.harmony === 'number' ? tok.harmony : 1;
  const bg = tok.bg ? mixHex(OWN.bg, tok.bg, mix) : tok['--bg'] || null, acc = tok.accent ? mixHex(OWN.accent, tok.accent, har) : null;
  if (bg && mix > 0) { root.setProperty('--bg', bg); S.bg = bg; }
  if (acc && har > 0) root.setProperty('--green', acc);
  for (const [k, v] of Object.entries(tok)) {
    if (typeof v !== 'string') continue;
    if (k.startsWith('--')) root.setProperty(k, v); else if (THEME_VARS[k] && mix > 0) root.setProperty(THEME_VARS[k], v);
  }
  S.theme = tok;
}
window.applyTheme = applyTheme;
function hookTheme() {
  if (!O) return;
  const fromKit = () => { const v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if (v) S.bg = v; };
  try {
    if (typeof O.themeScene === 'function') { fromKit(); S.themeHook = 'kit'; if (typeof O.onTheme === 'function') O.onTheme(fromKit); return; }
    if (typeof O.theme === 'function') { applyTheme(O.theme()); S.themeHook = 'theme'; }
    if (typeof O.onTheme === 'function') O.onTheme(applyTheme);
  } catch (e) { /* a kit without themes */ }
}

// ------------------------------------------------------------------------------------------------ touch: pan, pinch, tap
const pointers = new Map();
let gesture = null, lastTap = 0;

function toWorld(sx, sy) { const v = S.view; return [(sx - v.x) / v.s, (sy - v.y) / v.s]; }

function zoomAt(sx, sy, f) {
  const v = S.view, s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.s * f));
  const [wx, wy] = toWorld(sx, sy);
  v.x = sx - wx * s; v.y = sy - wy * s; v.s = s;
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
  gesture = { start: performance.now(), moved: 0, pinch: null };
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
  gesture.moved += Math.hypot(e.offsetX - prev[0], e.offsetY - prev[1]);
  const pts = [...pointers.values()];
  if (pts.length === 1 && is3d()) {
    glow.orbit(e.offsetX - prev[0], e.offsetY - prev[1]);
  } else if (pts.length === 1) {
    S.view.x += e.offsetX - prev[0]; S.view.y += e.offsetY - prev[1];
  } else if (pts.length >= 2) {
    const [a, b] = pts, d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (!gesture.pinch) gesture.pinch = { d, mx, my };
    if (is3d()) { glow.zoom(d / Math.max(1, gesture.pinch.d)); gesture.pinch = { d, mx, my }; return; }
    zoomAt(mx, my, d / Math.max(1, gesture.pinch.d));
    S.view.x += mx - gesture.pinch.mx; S.view.y += my - gesture.pinch.my;
    gesture.pinch = { d, mx, my };
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (!gesture || pointers.size) return;
  const quick = performance.now() - gesture.start < 350 && gesture.moved < 8 && !gesture.pinch;
  if (quick) {
    const now = performance.now();
    if (now - lastTap < 300) { S.view = { s: 1, x: 0, y: 0 }; lastTap = 0; } else { lastTap = now; tap(e.offsetX, e.offsetY); }
  }
  gesture = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (is3d()) { glow.zoom(Math.exp(-e.deltaY * 0.0015)); return; } zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

function tap(sx, sy) {
  if (is3d()) {
    const n3 = glow.pick(sx, sy, frozenAt !== null ? frozenAt : performance.now() - S.t0);
    if (n3) showNode(n3); else hideCard();
    return;
  }
  const [wx, wy] = toWorld(sx, sy);
  const t = frozenAt !== null ? frozenAt : performance.now() - S.t0;
  let best = null, bd = (24 / S.view.s) ** 2;
  for (const n of S.tree.nodes) {
    if (n.appear > t || n.x === undefined) continue;
    const d = ((n.x - wx) ** 2 + (n.y - wy) ** 2) * (n.best ? 0.35 : 1);     // the lit path wins close calls
    if (d < bd) { bd = d; best = n; }
  }
  if (best) showNode(best); else hideCard();
}

// ------------------------------------------------------------------------------------------------ controls + loop
document.querySelectorAll('.lens button').forEach((b) => b.addEventListener('click', () => setLens(b.dataset.lens)));
document.querySelectorAll('.sheet-tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('replay').addEventListener('click', () => selectRoot(S.rootId));
$('openTop').addEventListener('click', showTop);
$('topBar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !S.model) return;
  if (b.dataset.sort) S.topSort = b.dataset.sort; else if (b.hasAttribute('data-hold')) S.topHold = !S.topHold; else return;
  buildTopBar(); buildTopList(); $('toplist').scrollTop = 0;
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { hideCard(); hideTop(); }));
for (const id of ['toplist', 'rules']) {
  $(id).addEventListener('click', (e) => {
    const li = e.target.closest('li[data-root]');
    if (!li) return;
    hideTop();
    if (S.model.trees[li.dataset.root]) selectRoot(li.dataset.root);
  });
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideCard(); hideTop(); if (branchUI) branchUI.close(); } });
addEventListener('resize', () => { if (S.model) resize(); });
addEventListener('hashchange', route);

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'top') { showTop(); return; }
  if (h === 'rules') { setTab('rules'); return; }
  const id = h.startsWith('root=') ? h.slice(5) : null;
  if (id && id !== S.rootId && S.model.trees[id]) selectRoot(id);
}

function loop(now) {
  if (!(O ? O.hidden() : document.hidden)) {                    // hidden tab: no frame (the battery)
    const t0 = performance.now(), t = frozenAt !== null ? frozenAt : S.hold !== null ? S.hold : now - S.t0;
    syncScrub(t);
    const gap = Math.max(O && O.frameGap ? O.frameGap() : 0, S.quality < 2 ? 30 : 0);                     // LITE 30 fps; idle / battery saver / 3D Off: the kit's gap (docs/OLYMPUS_PERF.md)
    if (gap && frozenAt === null && now - lastFrame < gap - 3) { requestAnimationFrame(loop); return; }
    lastFrame = now;
    if (is3d()) glow.frame(now, t);                                       // the 3D laurel replaces the 2D drawing while it is on
    else {
      paint(ctx, S, { t, now: performance.now(), reduced, sway: S.quality >= 2 && !reduced && frozenAt === null, onLit: lightSteps });
      if (glow && glow.on) glow.frame(now);
    }
    updateHud(t);
    stepFx(performance.now());
    adapt(performance.now() - t0, now);
    if (O && O.state() === 'loading') O.ready();               // the first frame is drawn: the veil lifts
  }
  requestAnimationFrame(loop);
}

let glow = null;
let lastFrame = 0;
function is3d() { return !!(glow && glow.mode === '3d' && glow.on); }

function adapt(ms, now) {
  // a frame that takes more than ~22 ms of drawing on a weak phone steps the quality down (no leaves / taper, lower dpr)
  S.frameMs = S.frameMs * 0.92 + ms * 0.08;
  if (S.frameMs > 22 && S.quality > 0 && !(O && O.chosen())) {   // the automatic step down, unless the owner chose
    if (!S.slowSince) S.slowSince = now;
    if (now - S.slowSince > 1500) { S.quality--; S.slowSince = 0; S.frameMs = 12; resize(); }
  } else S.slowSince = 0;
}

async function postJarvis() {
  // inside Jarvis: hand it the card the engine wrote (jarvis.json, tools/strategytree/report.jarvis_card), stamped now
  if (window.parent === window) return;
  let card = { v: 1, name: 'DAPHNE', status: { level: 'off', label: 'Demo data' }, open: '#top', theme: '#14110e' };
  if (!S.model.demo) {
    try { const res = await fetch('jarvis.json', { cache: 'no-cache' }); if (res.ok) card = await res.json(); } catch (e) { /* keep the plain card */ }
  }
  card.t = Math.floor(Date.now() / 1000);
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card }, JARVIS_ORIGIN); } catch (e) { /* not in Jarvis */ }
}

// ------------------------------------------------------------------------------------------------ timeline, seasons, branches
const SPAN = GROW_MS + IGNITE_MS;
let scrubAt = 0;
function syncScrub(t) {                                         // the slider follows the clock while it plays (about 10 times a second)
  const now = performance.now();
  if (S.hold !== null || now - scrubAt < 100) return;
  scrubAt = now;
  $('scrub').value = String(Math.round(Math.min(1, t / SPAN) * 1000));
}
function syncPlay() {
  const playing = S.hold === null;
  $('play').setAttribute('aria-pressed', String(playing));
  $('play').setAttribute('aria-label', playing ? 'Pause the growth' : 'Play the growth');
  $('playIcon').setAttribute('d', playing ? 'M5 3v10M11 3v10' : 'M5 3l8 5-8 5z');
}
function nowT() { return S.hold !== null ? S.hold : performance.now() - S.t0; }
$('play').addEventListener('click', () => {
  if (S.hold === null) S.hold = Math.min(SPAN, Math.max(0, nowT()));
  else { S.t0 = performance.now() - (S.hold >= SPAN ? 0 : S.hold); S.hold = null; }
  syncPlay();
});
$('scrub').addEventListener('input', () => { S.hold = (Number($('scrub').value) / 1000) * SPAN; S.hudAt = -1; syncPlay(); });
const SEASON_WORDS = { auto: 'AUTO', spring: 'SPRING', summer: 'SUMMER', autumn: 'AUTUMN', winter: 'WINTER' };
$('season').addEventListener('click', () => {
  S.season = SEASON_NAMES[(SEASON_NAMES.indexOf(S.season) + 1) % SEASON_NAMES.length];
  $('seasonT').textContent = SEASON_WORDS[S.season]; $('season').setAttribute('aria-label', 'Season: ' + S.season);
  app.dataset.season = S.season;
});
function toastD(text) { const t = $('toastD'); t.textContent = text; t.hidden = false; clearTimeout(toastD.timer); toastD.timer = setTimeout(() => { t.hidden = true; }, 2200); }
let branchUI = null;
$('openBranches').addEventListener('click', () => { if (branchUI) { hideCard(); hideTop(); branchUI.open(); } });

// ------------------------------------------------------------------------------------------------ new tests arriving
const POLL_MS = 180000;
/** When the search is re-run (tree.json changes), the new nodes grow in: the model is swapped and the tree grows again. */
async function checkNewTests() {
  if (O ? O.hidden() : document.hidden) return;
  try {
    const head = await fetch('tree.json', { method: 'HEAD', cache: 'no-cache' });
    const sig = head.ok ? (head.headers.get('etag') || head.headers.get('last-modified') || head.headers.get('content-length')) : null;
    if (!sig || sig === S.sig) { if (sig) S.sig = sig; return; }
    const first = S.sig == null;
    S.sig = sig;
    if (first) return;                                         // the first look only records what is on screen
    const res = await fetch('tree.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const next = C.readDoc(await res.json()), more = (next.meta.nodes || 0) - (S.model.meta.nodes || 0);
    if (!next.featured.length || more <= 0) return;
    S.model = next;
    branchUI = createBranchUI({ model: next, open: (id) => selectRoot(id), toast: toastD });
    buildSeeds(); buildRules();
    selectRoot(next.trees[S.rootId] ? S.rootId : next.featured[0]);
    const t = document.createElement('div');
    t.className = 'toast-new'; t.setAttribute('role', 'status'); t.textContent = `+${C.int(more)} NEW TESTS · THE BRANCHES GROW`;
    document.body.append(t); setTimeout(() => t.remove(), 5000);
  } catch (e) { /* offline: keep what is on screen */ }
}

async function main() {
  try {
    S.model = C.readDoc(await loadDoc());
    if (!S.model.featured.length) throw new Error('tree.json has no featured trees');
  } catch (e) {
    app.dataset.state = 'error';
    $('loading').textContent = 'NO SEARCH DATA · ' + String(e.message || e).toUpperCase();
    O?.fail('no search data (' + String(e.message || e) + ')');
    return;
  }
  app.dataset.state = 'ready';
  branchUI = createBranchUI({ model: S.model, open: (id) => selectRoot(id), toast: toastD });
  buildSeeds();
  buildRules();
  hookTheme();
  const h = decodeURIComponent(location.hash.slice(1));
  selectRoot(h.startsWith('root=') ? h.slice(5) : S.model.featured[0]);
  if (h === 'top') showTop();
  if (h === 'rules') setTab('rules');
  postJarvis();
  const gl = $('gl'), onState = (on) => { app.dataset.gl = on ? 'on' : 'off'; };
  // the 3D laurel tree first; without the render core / WebGL2 the 2D tree with the glow overlay; without that, the plain 2D tree
  startTree3d(gl, S, { onState }).then((g) => g || startGlow(canvas, gl, { onState })).then((g) => { glow = g; }).catch(() => { glow = null; });
  if (!S.model.demo && frozenAt === null) setInterval(checkNewTests, POLL_MS);
  window.__daphne = { ready: true, state: S, setLens, setTab, get branches() { return branchUI; }, get glow() { return glow ? { on: glow.on, passes: glow.passes, quality: glow.quality(), mode: glow.mode || 'glow', stats: glow.stats ? glow.stats() : null, season: glow.season || null, fx: glow.fx || [] } : null; }, checkNewTests };
  requestAnimationFrame(loop);
}

main();
