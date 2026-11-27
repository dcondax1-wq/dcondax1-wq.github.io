// THE BRAIN page (brain/index.html; day-brain-app 2026-11-24). The model is braincore.js (pure, node-tested); this file fetches, draws the
// rooms, runs the thinking ticker, flies the 3D brain (brain-scene.js) and the region's live chart (chart3d.js).
// Reads the site's JSON + the PC's public status post (../pc_feed.js) and chart post (nq/nqbars.js), like the War Room. Until a PC post
// arrives it shows the bundled fixture.json, always labelled SAMPLE. Deep links: brain/#lit #atlas #blitz #of #learn #risk.
// Text only through textContent / createElement. Storage: none. Read only: GET requests; nothing is sent, armed or placed.
// ?at=<ISO> pins the clock, ?lite=2d forces the flat brain, ?lite=1 the low tier, ?fx=hq pins hq (tests and screenshots). window.BRAIN = the test hook.
import * as B from './braincore.js?v=b6';
import * as NB from '../nq/nqbars.js?v=b2';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const AT = (() => { const v = q.get('at'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t / 1000 : null; })();
const T0 = Date.now() / 1000;
const nowS = () => (AT ? AT + (Date.now() / 1000 - T0) : Date.now() / 1000);
const REDUCE = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
const S = { site: {}, lite: null, bars: null, fixture: null, model: null, sel: null, scene: null, chart: null, chartFor: null, seen: {}, first: true, typing: 0, tags: {} };

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
async function getJSON(u, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 9000) : 0;
  try { const r = await fetch(u, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
async function getText(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.text() : null; } catch (_) { return null; } }

/* ---------------- data ---------------- */
async function loadSite() {
  const names = { pillarsData: '../pillars/pillars-data.json', home: '../home.json', biz: '../business/accounts.json', payday: '../business/payday.json', file: '../odeon/trades.json',
    brief: '../nq/brief.json', feedCfg: '../status_feed.json', learn: 'learn.json', fixture: 'fixture.json' };
  const got = await Promise.all(Object.values(names).map((u) => getJSON(u)));
  Object.keys(names).forEach((k, i) => { S.site[k] = got[i]; });
  S.fixture = S.site.fixture;
  const h = S.site.home;
  S.site.hidden = h && (Array.isArray(h.hidden_bots) ? h.hidden_bots : h.board && Array.isArray(h.board.hidden_bots) ? h.board.hidden_bots : null) || ['blitz'];
}
async function pollCore() {
  const F = window.PC_FEED; if (!F || !F.fetchLatest) return false;
  try {
    const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]);
    if (lite) { S.lite = lite; return true; }
  } catch (_) { /* keep the last */ }
  return false;
}
async function pollBars() {
  for (const u of NB.feedUrls(S.site.feedCfg)) {
    const t = await getText(u);
    const post = t ? await NB.parseVerified(t, S.site.feedCfg, nowS()) : null;
    if (post) { S.bars = post; return true; }
  }
  return false;
}
function model() {
  const sample = !S.lite && !!S.fixture;
  const src = { ...S.site, feed: window.PC_FEED, coach: window.PAYOUT_COACH || null, lite: sample ? S.fixture.lite : S.lite, bars: sample ? S.fixture.bars : S.bars, sample };
  return B.build(src, sample ? S.fixture.now + (Date.now() / 1000 - T0) : nowS());
}

/* ---------------- the brain (3D, or the flat fallback) ---------------- */
function drawTags(M) {
  const box = $('tags');
  for (const r of M.regions) {
    let t = S.tags[r.id];
    if (!t) { t = el('button', { type: 'button', class: 'tag', 'data-r': r.id, 'aria-label': `Open ${r.name}`, onclick: () => go(r.id) }, el('span'), el('small')); S.tags[r.id] = t; box.append(t); }
    t.style.setProperty('--c', r.color); t.firstChild.textContent = r.name; t.lastChild.textContent = String(r.status).split(' · ')[0];
    t.classList.toggle('on', S.sel === r.id); t.classList.toggle('dim', !!S.sel && S.sel !== r.id);
  }
}
function placeTags() {
  if (!S.scene) return;
  const pos = [];
  for (const [id, t] of Object.entries(S.tags)) { const p = S.scene.project(id); if (p) pos.push({ id, t, x: Math.max(50, Math.min(innerWidth - 50, p.x)), y: Math.max(26, p.y), vis: p.vis }); }
  pos.sort((a, b) => a.y - b.y);
  for (let i = 0; i < pos.length; i++) for (let j = 0; j < i; j++) {     // keep the tags apart: a tag that lands on another slides down
    const a = pos[j], b = pos[i]; if (Math.abs(a.x - b.x) < 96 && b.y - a.y < 46) b.y = a.y + 46;
  }
  for (const p of pos) { p.t.style.left = `${p.x}px`; p.t.style.top = `${p.y}px`; p.t.style.visibility = p.vis ? 'visible' : 'hidden'; }
}
function drawFlat(M) {
  const f = $('flat'); f.replaceChildren();
  for (const r of M.regions) f.append(el('button', { type: 'button', 'data-r': r.id, style: `--c:${r.color};--p:${M.pulse[r.id]}`, 'aria-pressed': String(S.sel === r.id), onclick: () => go(r.id) },
    document.createTextNode(r.name), el('small', { text: r.status })));
}
async function startScene() {
  const mode2d = q.get('lite') === '2d';
  if (!mode2d) {
    try {
      const mod = await import('./brain-scene.js?v=b3');
      const low = mod.isLowPower(window);
      S.scene = await mod.create($('c'), B.REGIONS, { onPick: (id) => go(id), reduce: REDUCE, low, onFrame: placeTags });
    } catch (_) { S.scene = null; }
  }
  if (S.scene) {
    document.documentElement.dataset.mode = '3d-' + S.scene.stats().tier;
    $('flat').hidden = true; S.scene.setPulse(S.model.pulse); S.scene.fly(S.sel);
  } else {
    document.documentElement.dataset.mode = '2d'; $('c').hidden = true; $('tags').hidden = true; $('flat').hidden = false; drawFlat(S.model);
  }
  if (S.sel) drawRoom(S.model, true);      // the chart can go 3D now
}

/* ---------------- the dock ---------------- */
function drawDock(M) {
  const d = $('dock'); d.replaceChildren();
  for (const r of M.regions) {
    const pct = r.next ? r.next.pct || 0 : Math.round((M.pulse[r.id] || 0) * 100);
    d.append(el('button', { type: 'button', class: 'reg', 'data-r': r.id, style: `--c:${r.color};--pct:${pct}%`, 'aria-pressed': String(S.sel === r.id), onclick: () => go(S.sel === r.id ? null : r.id) },
      el('b', { text: r.name }), el('small', { text: r.next && (r.id === 'lit' || r.id === 'atlas') ? `${r.next.word} · ${pct}%` : r.status }), el('i')));
  }
}

/* ---------------- the room ---------------- */
const sec = (title, id, ...kids) => el('section', { class: 'card', id }, el('h3', { text: title }), ...kids);
function nextCard(r) {
  const n = r.next; if (!n) return null;
  const box = sec('Next trade', 'rNext');
  if (n.feed && (r.id === 'lit' || r.id === 'atlas')) box.append(el('div', { class: 'fage ' + n.feed.level, id: 'rFeedAge', role: 'status' }, el('i'),
    document.createTextNode(n.feed.age === null ? 'No brain feed from the PC yet' : `${n.feed.what === 'brain feed' ? 'Brain feed' : 'Step report'} ${B.ago(n.feed.age)}${n.feed.hm ? ` · ${n.feed.hm} ET` : ''}${n.feed.level === 'bad' ? ' · OLD: this is where the bot was then' : n.feed.level === 'warn' ? ' · late (it comes every ~30 min)' : ''}`)));
  box.append(el('p', { class: 'setup', text: n.setup || 'Nothing forming' }));
  box.append(el('div', { class: 'meter', role: 'img', 'aria-label': `${n.pct || 0}% of the way to a trade` }, el('i', { style: `width:${n.pct || 0}%` })),
    el('div', { class: 'mrow' }, el('span', {}, el('b', { text: n.word || '' })), el('span', { class: 'num', text: `${n.pct || 0}% of the way` })));
  const chain = el('ul', { class: 'chain', id: 'rChain' });
  if (n.steps) for (const s of n.steps) chain.append(el('li', { class: s.state, text: s.label }));
  else if (n.stepsText) chain.append(el('li', { class: 'now', text: `step ${n.stepsText}` }));
  else if (r.chain.length === 1) for (const s of r.chain[0].steps) chain.append(el('li', { class: s.state, 'data-step': s.n, title: s.help, text: s.label }));
  box.append(chain);
  if (!n.steps && r.chain.length > 1) for (const L of r.chain) {
    const ul = el('ul', { class: 'chain' }); for (const s of L.steps) ul.append(el('li', { class: s.state, title: s.help, text: s.label }));
    box.append(el('div', { class: 'lobe', 'data-lobe': L.id }, el('b', { text: `${L.name}: ${L.state === 'unknown' ? 'waiting' : L.state}` }), ul, el('div', { class: 'muted', text: L.needs })));
  }
  if (n.waiting) box.append(el('p', { class: 'wait', id: 'rWait' }, el('b', { text: 'Waiting for: ' }), document.createTextNode(n.waiting)));
  const facts = el('div', { class: 'facts' });
  facts.append(el('div', {}, el('span', { text: 'How close' }), el('b', { class: 'num', id: 'rDist', text: n.dist !== null && n.dist !== undefined ? `${B.pts(n.dist)} pts ${n.distFrom}` : 'not sent' })));
  facts.append(el('div', {}, el('span', { text: 'Window' }), el('b', { text: n.window || '-' })));
  box.append(facts);
  if (r.id === 'lit' || r.id === 'atlas') {
    const p3 = el('div', { class: 'px3', id: 'rPx' });
    [['l', n.inTrade ? 'Entry' : 'Limit', n.limit], ['s', 'Stop', n.stop], ['t', 'Target', n.target]].forEach(([c, k, v]) => p3.append(el('div', { class: c }, el('small', { text: k }), el('b', { class: 'num', text: v == null ? 'not set' : B.px(v) }))));
    box.append(p3);
    const rr = n.rr !== null && n.rr !== undefined ? `${n.rr.toFixed(1)}R` : '';
    box.append(el('p', { class: 'src', text: `${n.from === 'bf' ? 'From the PC\'s brain feed (its own next-trade line)' : n.from === 'pc' ? 'From the PC\'s own next-trade line' : 'Read from the PC\'s steps and words (no brain feed line)'}${rr ? ` · target ${rr}` : ''}${n.inTrade ? ' · IN A TRADE' : ''}` }));
  }
  if (r.designs && r.designs.length) { const ul = el('ul', { class: 'lrn' }); for (const d of r.designs) ul.append(el('li', {}, el('em', { text: 'waiting' }), document.createTextNode(`${d.id}: ${d.text}`))); box.append(ul); }
  return box;
}
function chartCard(r) {
  if (!r.chart) return null;
  const box = sec('Live 3D chart', 'rChart');
  if (r.chart.state === 'none') { box.append(el('p', { class: 'muted', text: r.chart.text })); return box; }
  const wrap = el('div', { class: 'chart', id: 'rChartBox' }, el('div', { class: 'lbls' })); box.append(wrap);
  const kinds = [...new Set(r.chart.levels.map((l) => l.kind))].filter((k) => k !== 'leg');
  const NAMES = { sweep: 'swept level', entry: 'limit / entry', stop: 'stop', target: 'target', fvg: 'FVG', fib: 'fib (OTE)', level: 'liquidity', cisd: 'CISD line' };
  const lg = el('div', { class: 'legend' }); for (const k of kinds) lg.append(el('span', { style: `--k:${(window.__KC || {})[k] || '#7a4bc0'}`, 'data-k': k, text: NAMES[k] || k }));
  box.append(lg, el('p', { class: 'src', text: r.chart.text + (r.chart.off ? ` ${r.chart.off} more level${r.chart.off === 1 ? '' : 's'} off the chart.` : '') }));
  return box;
}
async function mountChart(r) {
  const wrap = $('rChartBox'); if (!wrap) { if (S.chart) { S.chart.dispose(); S.chart = null; } return; }
  const mod = await import('./chart3d.js?v=b1');
  window.__KC = mod.KIND_COLOR;
  for (const s of document.querySelectorAll('.legend span')) s.style.setProperty('--k', mod.KIND_COLOR[s.dataset.k] || '#7a4bc0');
  if (S.chart) S.chart.dispose();
  S.chart = mod.mount(wrap, S.scene ? S.scene.THREE : null, r.chart); S.chartFor = r.id;
  wrap.dataset.mode = S.chart.mode;
  const L = wrap.querySelector('.lbls');
  const place = () => {
    const rows = S.chart.labels().filter((x) => Number.isFinite(x.y)).sort((a, b) => a.y - b.y); let lastY = -99;
    L.replaceChildren(...rows.map((x) => { const y = Math.max(lastY + 15, x.y); lastY = y; return el('span', { class: 'lbl', style: `top:${y}px;color:${x.color}`, text: x.text }); }));
  };
  place(); if (S.chart.mode === '3d') { let n = 0; S.chart.onFrame = () => { if (++n % 20 === 1) place(); }; }
}
function thinkCard(r) {
  const box = sec('Thinking', 'rThink'), ul = el('ul', { class: 'stream', id: 'rStream' });
  if (!r.think.length) ul.append(el('li', {}, el('time', { text: '' }), el('span', { class: 'muted', text: r.id === 'blitz' ? 'Switched OFF: BLITZ is not thinking today.' : 'No thinking lines from the PC yet.' })));
  const seen = S.seen[r.id] || new Set();
  r.think.forEach((x, i) => { const li = el('li', { class: `k-${x.kind || 'log'}${!seen.has(x.text) && !S.first ? ' new' : ''}` }, el('time', { text: x.hm || '' }), el('span', { text: x.text, 'data-full': x.text })); ul.append(li); if (i === 0) li.dataset.top = '1'; });
  box.append(ul, el('p', { class: 'src', text: r.thinkFrom === 'think' ? 'The PC\'s reasoning lines (newest first)' : r.thinkFrom === 'log' ? 'The PC\'s thought log + the day\'s story (the PC\'s fuller reasoning lines are not in its report yet)' : r.id === 'learn' ? 'What the learner found this week' : 'Derived from the PC\'s numbers' }));
  return box;
}
function typeTop() {                                   // type the newest line of the open room, once per new line
  const li = document.querySelector('#rStream li[data-top] span'); if (!li || REDUCE) return;
  const full = li.dataset.full || li.textContent; if (S.typedFor === full) return; S.typedFor = full;   // data-full = the whole line (a re-entry mid-typing used to take the half-typed text)
  let i = 0; const caret = el('i', { class: 'caret' }); clearInterval(S.typing);
  S.typing = setInterval(() => { i += 2; li.textContent = full.slice(0, i); li.append(caret); if (i >= full.length) { clearInterval(S.typing); li.textContent = full; } }, 18);
}
function learnCard(r) {
  const L = r.learn, box = sec(r.id === 'learn' ? 'What the market taught us' : 'Learning', 'rLearn');
  const v = L.confidence === null ? null : Math.round(L.confidence * 100);
  box.append(el('div', { class: 'conf' }, el('div', { class: 'ring' + (v === null ? ' none' : ''), id: 'rConf', style: `--v:${v || 0}`, role: 'img', 'aria-label': v === null ? 'confidence not scored yet' : `confidence ${v}%`, text: v === null ? 'not scored yet' : `${v}%` }),
    el('div', {}, el('b', { text: `Confidence: ${L.confWord}` }), el('div', { class: 'muted', text: `${L.lessonsN !== null ? `${L.lessonsN} lesson${L.lessonsN === 1 ? '' : 's'} · ` : ''}last learned ${L.last || '-'}` }))));
  if (r.current) box.append(el('p', { class: 'wait' }, el('b', { text: 'Market now: ' }), document.createTextNode(`${r.current.regime || '?'} week · ${r.current.band || '?'}${r.current.vix !== null ? ` (VIX ${r.current.vix.toFixed(1)})` : ''} · prior day ${r.current.prior || '?'}`)));
  if (L.read && !r.current) box.append(el('p', { class: 'wait' }, el('b', { text: 'Read: ' }), document.createTextNode(L.read)));
  box.append(el('h3', { text: 'Learned this week', style: 'margin-top:12px' }));
  const wk = el('ul', { class: 'lrn', id: 'rWeek' });
  if (!L.week.length) wk.append(el('li', { class: 'muted', text: 'Nothing new this week.' }));
  for (const x of L.week) wk.append(el('li', {}, el('em', { class: x.status, text: x.status }), document.createTextNode(x.text), x.usd !== null && x.usd !== undefined ? el('b', { text: ` ${B.usd(x.usd, true)}` }) : null));
  box.append(wk, el('h3', { text: 'Testing next', style: 'margin-top:12px' }));
  const tn = el('ul', { class: 'lrn', id: 'rTesting' });
  if (!L.testing.length) tn.append(el('li', { class: 'muted', text: 'Nothing registered to test yet.' }));
  for (const t of L.testing) tn.append(el('li', {}, el('em', { text: 'next' }), document.createTextNode(t)));
  box.append(tn, el('a', { class: 'more', id: 'rLearnedLink', href: `learned.html#${r.id}`, text: 'Everything the bots learned, and how close each idea is to graduating \u203a' }));
  box.append(el('p', { class: 'src', text: `Source: ${L.src}${L.journalLanded ? '' : ' (the learning journal has not landed: weekly lessons only)'} · research only, nothing changes a live rule` }));
  return box;
}
function moneyCard(r, M) {
  const m = r.money, box = sec(r.id === 'risk' ? 'Today $ · every account' : 'Today $', 'rMoney');
  const day = r.id === 'risk' ? m.day : m.day;
  if (day !== null && day !== undefined) box.append(el('div', { class: 'big num ' + (day > 0 ? 'ok' : day < 0 ? 'bad' : ''), text: B.usd(day, true) }), el('div', { class: 'muted', text: r.id === 'risk' ? 'today, the live bots together' : `today on ${r.name}'s main account` }));
  if (r.id !== 'risk' && m.room !== null) box.append(el('div', { class: 'facts' }, el('div', {}, el('span', { text: 'Room left today' }), el('b', { class: 'num', text: `${B.usd(m.room)}${m.mll ? ` of ${B.usd(m.mll)}` : ''}` }))));
  if (r.id === 'risk') for (const x of m.rooms) {
    const f = x.room !== null && x.mll ? Math.max(0, Math.min(1, x.room / x.mll)) : null;
    box.append(el('div', { class: 'acct' }, el('span', { text: `${x.bot} room` }), el('span', { class: 'td num', text: `${B.usd(x.room)}${x.mll ? ` / ${B.usd(x.mll)}` : ''}` }),
      f !== null ? el('div', { class: 'meter', style: 'grid-column:1/-1;margin:4px 0 0' }, el('i', { style: `width:${Math.round(f * 100)}%` })) : null));
  }
  for (const a of m.accounts) box.append(el('div', { class: 'acct' }, el('span', { text: `${a.name} · ${a.stage}` }), el('span', { class: 'td num ' + a.lvl, text: a.today }),
    el('small', { text: [r.id === 'risk' ? a.bot : '', a.state, a.clock ? `7-day clock ${a.clock}` : ''].filter(Boolean).join(' · ') })));
  if (!m.accounts.length && (day === null || day === undefined)) box.append(el('p', { class: 'muted', text: r.id === 'of' ? 'No account: order flow is research only.' : r.id === 'learn' ? 'The learner trades nothing.' : 'No numbers from the PC yet.' }));
  if (M.sample && (m.accounts.length || (day !== null && day !== undefined))) box.append(el('p', { class: 'src', text: 'SAMPLE numbers, not your accounts.' }));
  return box;
}
function overview(M) {
  const box = sec('Coming up soon', 'rSoon'), ul = el('ul', { class: 'soon' });
  const rows = M.regions.filter((r) => r.next).sort((a, b) => (b.next.pct || 0) - (a.next.pct || 0));
  for (const r of rows) {
    const li = el('li', { style: `--c:${r.color}`, 'data-r': r.id });
    li.append(el('b', { text: r.name }), el('span', { class: 'w num', text: `${r.next.word} · ${r.next.pct || 0}%` }), el('small', { text: `${r.next.setup || ''}${r.next.waiting ? ' — ' + r.next.waiting : ''}` }));
    li.addEventListener('click', () => go(r.id)); li.style.cursor = 'pointer'; ul.append(li);
  }
  box.append(ul, el('p', { class: 'src', text: M.next ? `Next window: ${M.next.who} at ${M.next.at} ET${M.next.day !== 'today' ? ` (${M.next.day})` : ''}.` : '' }));
  const all = el('section', { class: 'card', id: 'rAll', style: '--c:#9d59ee' }, el('h3', { text: 'Every region' }));
  for (const r of M.regions) all.append(el('button', { type: 'button', class: 'go', style: `--c:${r.color};border-color:${r.color}55;margin-right:6px`, onclick: () => go(r.id), text: `${r.name} ›` }));
  return [box, all];
}
function drawRoom(M, keepChart) {
  const box = $('room'), r = B.region(M, S.sel);
  if (!keepChart || !r) { box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap'); }
  box.replaceChildren(); box.dataset.r = r ? r.id : '';
  if (!r) { box.style.setProperty('--c', '#9d59ee'); box.append(...overview(M)); if (S.chart) { S.chart.dispose(); S.chart = null; } return; }
  box.style.setProperty('--c', r.color);
  box.append(el('div', { class: 'rhead' }, el('div', {}, el('h2', { text: r.name }), el('div', { class: 'al', text: `${r.alias} · ${r.blurb}` })),
    el('button', { type: 'button', class: 'x', onclick: () => go(null), text: 'Whole brain' })));
  if (['lit', 'atlas', 'blitz', 'of'].includes(r.id)) box.append(el('a', { class: 'dlink', id: 'rData', href: `../pillars/data.html#${r.id}`, text: `${r.name} data: trades $, win rate, PF, verdicts ›` }));
  box.append(el('p', {}, el('span', { class: 'badge ' + r.level, id: 'rStatus', text: r.status }), document.createTextNode(' '), el('span', { class: 'muted', text: r.statusText })));
  for (const c of [nextCard(r), chartCard(r), thinkCard(r), learnCard(r), moneyCard(r, M)]) if (c) box.append(c);
  mountChart(r);
  setTimeout(typeTop, 250);
}

/* ---------------- render + routing ---------------- */
function noteThink(M) {
  for (const r of M.regions) {
    const was = S.seen[r.id], now = new Set(r.think.map((x) => x.text));
    if (was && S.scene) { let n = 0; for (const t of now) if (!was.has(t)) n++; if (n) S.scene.fire(r.id, n); }
    S.seen[r.id] = now;
  }
}
function render() {
  const M = model(); S.model = M;
  const pill = $('pcPill'); pill.dataset.level = M.sample ? 'none' : M.pc.level; pill.textContent = M.sample ? 'SAMPLE' : M.pc.text;
  const sm = $('sample'); sm.hidden = !M.sample;
  if (M.sample) sm.textContent = `SAMPLE: a recorded-style morning (${S.fixture.at}), not live. Your PC's report has not reached this page yet; the real numbers replace this as soon as it does.`;
  $('headline').textContent = M.headline;
  $('sub').textContent = M.price !== null ? `NQ ${B.px(M.price)} · ${M.sample ? 'sample' : M.pc.text}` : 'every bot, thinking';
  drawTags(M); drawDock(M);
  if (!$('flat').hidden) drawFlat(M);
  if (S.scene) S.scene.setPulse(M.pulse);
  drawRoom(M, true);
  noteThink(M);
  $('srcs').textContent = `Reads: the PC's status + chart posts, pillars-data.json, nq/brief.json, brain/learn.json (${(S.site.learn && S.site.learn.sources || []).join(', ') || 'not loaded'}). Read only.`;
  if (S.first) { S.first = false; document.documentElement.dataset.ready = '1'; document.dispatchEvent(new Event('brain-ready')); }
}
function go(id) {
  const want = B.IDS.includes(id) ? id : null;
  if (location.hash.slice(1) !== (want || '')) history.replaceState(null, '', want ? '#' + want : location.pathname + location.search);
  select(want);
}
function crumbs(id) {                                   // Home › Pillars › <pillar> Brain: back goes to the pillar you came from
  const pil = ['lit', 'atlas', 'blitz', 'of'].includes(id), r = id ? B.REGIONS.find((x) => x.id === id) : null;
  const back = $('back'), crP = $('crP'), crN = $('crN'); if (!back || !crP || !crN) return;
  back.href = pil ? `../pillars/#${id}` : '../pillars/'; crP.href = back.href;
  crN.textContent = r ? `${r.name} Brain` : 'Brain';
}
function select(id) {
  S.sel = id; crumbs(id); if (S.scene) S.scene.fly(id);
  if (S.model) { drawTags(S.model); drawDock(S.model); if (!$('flat').hidden) drawFlat(S.model); drawRoom(S.model, false); }
  if (id) setTimeout(() => { const r = $('room'); if (r && r.getBoundingClientRect().top > innerHeight * 0.8) r.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' }); }, 50);
}
addEventListener('hashchange', () => select(B.IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null));

window.BRAIN = { ready: () => document.documentElement.dataset.ready === '1', model: () => S.model, stats: () => (S.scene ? S.scene.stats() : null), project: (id) => (S.scene ? S.scene.project(id) : null),
  select: go, chartMode: () => (S.chart ? S.chart.mode : null) };

(async function main() {
  S.sel = B.IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null; crumbs(S.sel);
  await loadSite();
  render();
  requestAnimationFrame(() => setTimeout(startScene, 30));
  const first = await Promise.all([pollCore(), pollBars()]);
  if (first.some(Boolean)) render();
  let lastBars = Date.now();
  setInterval(async () => {
    if (document.visibilityState === 'hidden') return;
    const a = await pollCore(); let b = false;
    if (Date.now() - lastBars > 120000) { lastBars = Date.now(); b = await pollBars(); }
    if (a || b) render();
  }, 60000);
})();
