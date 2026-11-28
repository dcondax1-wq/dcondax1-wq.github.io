// THE FOUR PILLARS page (pillars/index.html). Rules live in pillarscore.js (pure, node-tested); this file fetches and draws.
// Reads pillars-data.json (tools/build_pillars.py), ../home.json, ../business/accounts.json, ../business/payday.json, ../odeon/trades.json
// and the PC's public status post (../pc_feed.js). Text only through textContent / createElement. Sends nothing, stores nothing but the
// last opened pillar (localStorage, per viewer). ?at=<ISO time> pins the clock (tests and screenshots only).
import * as PF from './pillarsfeed.js?v=p9';
import * as P from './pillarscore.js?v=p7';

const $ = (id) => document.getElementById(id);
const S = { data: null, home: null, biz: null, payday: null, file: null, lite: null, sel: 'lit', model: [], scene: null };
const AT = (() => { try { const v = new URLSearchParams(location.search).get('at'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t / 1000 : null; } catch (_) { return null; } })();
const T0 = Date.now() / 1000;
const nowS = () => (AT ? AT + (Date.now() / 1000 - T0) : Date.now() / 1000);
const IDS = ['lit', 'atlas', 'blitz', 'of'];

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
/** the same account cards the Accounts screen draws (nq/acctcore.js), then the four pillars on top (pillarsfeed.js) */
export function model() {
  return PF.modelFrom({ data: S.data, home: S.home, biz: S.biz, payday: S.payday, file: S.file, lite: S.lite, nowS: nowS(), feed: window.PC_FEED, coach: window.PAYOUT_COACH || null });
}

/* ---------------- drawing ---------------- */
const fmtN = (v, d) => (v == null || !Number.isFinite(+v) ? '-' : (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
function drawTabs() {
  const box = $('ptabs'); box.replaceChildren();
  for (const m of S.model) box.append(el('button', { type: 'button', role: 'tab', class: 'ptab', 'data-p': m.id, style: `--c:${m.color}`, 'aria-selected': String(S.sel === m.id), onclick: () => select(m.id, 'tab') },
    el('b', { text: m.name }), el('small', {}, el('span', { class: 'lvl ' + m.level }), document.createTextNode(m.statusWord))));
}
function spansTable(m) {
  const tb = el('table', { class: 'spans', id: 'spans' }), hr = el('tr');
  ['Span', '/wk', 'Win', 'PF', '$/mo'].forEach((x) => hr.append(el('th', { text: x }))); tb.append(el('thead', {}, hr));
  const body = el('tbody');
  const row = (s, cls) => { const tr = el('tr', { class: cls || '' }); [s.k, fmtN(s.tpw, 1), s.win == null ? '-' : fmtN(s.win, 0) + '%', fmtN(s.pf, 2), P.usd(s.usd_mo, false)]
    .forEach((x, i) => tr.append(el('td', { class: i === 4 ? ((s.usd_mo || 0) > 0 ? 'pos' : (s.usd_mo || 0) < 0 ? 'neg' : '') : '', text: x }))); body.append(tr); };
  m.spans.forEach((s) => row(s)); if (m.recent) row({ ...m.recent, k: m.recent.k + ' (live settings)' }, 'recent');
  tb.append(body); return tb;
}
function drawPanel() {
  const m = S.model.find((x) => x.id === S.sel) || S.model[0]; if (!m) return;
  const box = $('panel'); box.replaceChildren(); box.style.setProperty('--c', m.color); box.dataset.p = m.id;
  box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');   // a soft fade-up between pillars
  box.append(el('div', { class: 'phead' }, el('h2', { text: m.name }), el('div', { class: 'alias', text: m.alias }),
    el('span', { class: 'badge ' + m.level, id: 'pStatus', text: m.statusWord }), el('p', { text: m.status })));
  // day-pillars4 (owner: "more data, more organized"): one clear way into this pillar's numbers, its Brain room, its trades / research
  box.append(el('nav', { class: 'pgo', id: 'pGo', 'aria-label': `${m.name}: go deeper` },
    el('a', { class: 'big', href: `data.html#${m.id}`, id: 'pData' }, el('b', { text: `${m.name} data` }), el('small', { text: m.id === 'of' ? 'tick days, looks, designs, every verdict' : 'trades $, week / month, win rate, PF, next setup, verdicts' })),
    el('a', { href: `../brain/#${m.id}` }, el('b', { text: 'Brain room' }), el('small', { text: 'chart + thinking' })),
    el('a', { href: m.id === 'of' ? '../cities/hub.html' : '../trading/' }, el('b', { text: m.id === 'of' ? 'Research' : 'Trades' }), el('small', { text: m.id === 'of' ? 'every test' : 'every trade' }))));
  const fd = document.getElementById('footData'); if (fd) fd.href = `data.html#${m.id}`;
  // accounts
  const acc = el('section', { class: 'sec', id: 'pAccounts' }, el('h3', { text: 'Accounts' }), el('div', { class: 'muted', text: m.accountsText }));
  for (const a of m.accounts) {
    acc.append(el('div', { class: 'acct' }, el('span', { class: 'nm', text: `${a.name} · ${a.stage}` }),
      el('span', { class: 'td ' + (a.todayLvl || ''), text: a.todayText ? `today ${a.todayText}` : '' }),
      el('span', {}, el('span', { class: 'arm ' + a.state, text: a.stateWord })),
      a.clock ? el('span', { class: 'ck ' + a.clock.lvl, text: `7-day clock: ${a.clock.text}` }) : null));
  }
  if (!m.accounts.length && m.accountsNote.length) for (const t of m.accountsNote) acc.append(el('div', { class: 'acct' }, el('span', { class: 'nm', text: t }), el('span'), el('span', { class: 'ck', text: `as of the research ${m.researchDate}` })));
  if (m.id !== 'of') acc.append(el('p', { class: 'muted', id: 'pLast', text: m.last ? `Last trade: ${m.last.text}` : (m.id === 'blitz' ? 'Last trade: none (switched OFF)' : 'Last trade: none in the PC post or the ledger yet') }));
  box.append(acc);
  // order flow: the tick count + the 3 designs waiting for it
  if (m.id === 'of') {
    const t = m.tick || {}, sec = el('section', { class: 'sec', id: 'pTicks' }, el('h3', { text: 'Ticks recorded' }));
    sec.append(el('div', { class: 'bar', role: 'img', 'aria-label': t.has ? `${t.d} of ${t.of} tick days` : 'tick count not reported yet' }, el('i', { style: `width:${Math.round((t.frac || 0) * 100)}%` })));
    sec.append(el('div', { class: t.has ? '' : 'muted', text: t.text }));
    if (t.ageText) sec.append(el('div', { class: 'muted', text: t.ageText }));
    sec.append(el('h3', { text: 'Pre-registered designs, waiting for the ticks', style: 'margin-top:12px' }));
    for (const d of m.designs) sec.append(el('div', { class: 'design', 'data-d': d.id }, el('span', { class: 'w', text: 'waiting' }), el('b', { text: d.id }), document.createTextNode(d.text), el('span', { class: 'g', text: d.gate }),
      d.prior ? el('span', { class: 'g', text: `Prior: ${d.prior}` }) : null));
    const R = m.readiness;
    if (R) sec.append(el('div', { class: 'muted', id: 'pReady', style: 'margin-top:8px', text: `First result: ${R.first_run_with_backfill || '?'} with the backfill; ${R.first_run_forward_only || '?'} forward only (${R.days_needed || 60} tick days).` }));
    box.append(sec);
  }
  // edge + numbers
  const edge = el('section', { class: 'sec', id: 'pEdge' }, el('h3', { text: 'Edge' }), el('div', { text: m.edge }));
  if (m.spans.length || m.recent) edge.append(spansTable(m));
  else edge.append(el('p', { class: 'muted', text: m.spansNote || 'No numbers of its own yet: the tick designs have not run. The bar proxies tested so far are below.' }));
  if (m.id === 'of' && m.tests.length) {
    const d = el('details', { class: 'tests' }, el('summary', { text: `${m.tests.length} bar / LVN proxy tests (all rejected)` }));
    for (const x of m.tests) {
      const s = x.spans.map((q) => `${q.k}: ${q.pf != null ? 'PF ' + fmtN(q.pf, 2) : ''}${q.usd_mo != null ? ' ' + P.usd(q.usd_mo, false) + '/mo' : ''}${q.net_vs_lit != null ? P.usd(q.net_vs_lit) + ' vs LIT' : ''}`).join(' · ');
      d.append(el('div', { class: 'trow' }, el('span', { class: 'v', text: x.verdict }), el('b', { text: x.name }), el('div', { class: 'muted', text: `${x.stage} · ${s}` })));
    }
    edge.append(d);
  }
  if (m.basis) edge.append(el('p', { class: 'src', text: `Basis: ${m.basis}` }));
  edge.append(el('p', { class: 'src', text: `Source: ${m.src}` }));
  box.append(edge);
  // thinking
  const th = el('section', { class: 'sec', id: 'pChain' }, el('h3', { text: 'How it thinks' }));
  if (m.chain.lobes) { const lb = el('div', { class: 'lobes' }); m.chain.lobes.forEach((l) => lb.append(el('div', {}, el('b', { text: l.name }), document.createTextNode(l.state === 'unknown' ? 'waiting' : l.state)))); th.append(lb); }
  const ol = el('ol', { class: 'chain' });
  m.chain.steps.forEach((s, i) => ol.append(el('li', { class: s.state, 'data-step': s.key }, el('span', { class: 'dot', text: s.state === 'done' ? '✓' : String(i + 1) }), el('b', { text: s.label }), el('p', { text: s.help }))));
  th.append(ol); box.append(th);
  // today
  const td = el('section', { class: 'sec', id: 'pToday' }, el('h3', { text: 'Today' }));
  if (m.today.length) { const strip = el('div', { class: 'today' }); m.today.forEach((r) => strip.append(el('div', { class: 'tchip', style: `--c:${r.color}` }, el('span', { class: 'tt', text: r.hm }), el('b', { text: r.name }), el('span', { class: 'tx', text: r.text })))); td.append(strip); requestAnimationFrame(() => { strip.scrollLeft = strip.scrollWidth; }); }
  else td.append(el('div', { class: 'muted', text: m.todayEmpty }));
  box.append(td);
  // what the market taught us (research/learn/insights.json; a SAMPLE fixture until it lands)
  const lt = el('section', { class: 'sec lessons', id: 'pLessons' }, el('h3', { text: 'What the market taught us' }));
  if (m.lessonsSample) lt.append(el('div', { class: 'sample', id: 'pLessonsSample', text: 'SAMPLE: the market-learning file (research/learn/insights.json) has not landed yet. These lines are placeholders, not findings.' }));
  if (m.lessons.length) { const ul = el('ul', { class: 'list' }); m.lessons.forEach((x) => ul.append(el('li', {}, x.d ? el('span', { class: 'ld', text: x.d + ' · ' }) : null, document.createTextNode(x.text)))); lt.append(ul); }
  else lt.append(el('div', { class: 'muted', text: 'Waiting: the market-learning job has no lesson for this pillar yet.' }));
  lt.append(el('p', { class: 'src', text: `Source: ${m.lessonsSrc || 'research/learn/insights.json'}` }));
  box.append(lt);
  if (m.risks.length) { const r = el('section', { class: 'sec', id: 'pRisks' }, el('h3', { text: 'Risks' })); const ul = el('ul', { class: 'list' }); m.risks.forEach((t) => ul.append(el('li', { text: t }))); r.append(ul); box.append(r); }
  const nx = el('section', { class: 'sec', id: 'pNext' }, el('h3', { text: "What's next" })), ol2 = el('ol', { class: 'list next' }); m.next.forEach((t) => ol2.append(el('li', { text: t }))); nx.append(ol2); box.append(nx);
}
function pcPill() {
  const p = $('pcPill'), F = window.PC_FEED, lite = S.lite, rt = lite ? +((lite.reporter && lite.reporter.t) || lite.t) || 0 : 0, age = rt ? nowS() - rt : null;
  if (age === null) { p.textContent = 'PC: waiting'; p.className = 'pill'; return; }
  p.textContent = `PC ${PF.ago(age)}`; p.className = 'pill ' + (age < PF.PC_FRESH_S ? 'ok' : 'warn'); void F;
}
function select(id, how) {
  if (!IDS.includes(id)) return;
  S.sel = id; drawTabs(); drawPanel(); if (S.scene) S.scene.select(id, how === 'scene');   // a tap on a column: the camera glides to it (a tab only lights it)
  if (how === 'scene') { const b = $('panel'); b.classList.remove('rise'); void b.offsetWidth; b.classList.add('rise'); }   // ... and its panel slides up
  try { history.replaceState(null, '', '#' + id); localStorage.setItem('olyPillar', id); } catch (_) { /* fine */ }
}
function fills() {
  const o = {}; for (const m of S.model) o[m.id] = m.id === 'of' ? Math.max(.06, (m.tick && m.tick.frac) || 0) : m.state === 'off' ? .32 : 1; return o;
}
function render() {
  S.model = model(); drawTabs(); drawPanel(); pcPill();
  if (S.scene) S.scene.setFill(fills());
  drawFlat();
}
function drawFlat() {
  const f = $('flat'); if (f.hidden) return; f.replaceChildren(); const fl = fills();
  for (const m of S.model) f.append(el('div', { class: 'col' + (m.state === 'off' ? ' dim' : ''), style: `--c:${m.color}`, 'data-p': m.id, role: 'button', tabindex: 0, 'aria-label': `${m.name}: ${m.statusWord}`, onclick: () => select(m.id) },
    el('i', { style: `height:${Math.round(fl[m.id] * 100)}%` }), el('b', { text: m.name })));
}

async function startScene() {
  const flat = () => { $('flat').hidden = false; drawFlat(); document.documentElement.dataset.mode = '2d'; };
  if (/[?&]lite=2d/.test(location.search)) return flat();
  try {
    const Sc = await import('./pillars-scene.js?v=c2');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, low = Sc.isLowPower(window), fl = fills();
    const cols = S.model.map((m) => ({ id: m.id, name: m.name, color: m.color, fill: fl[m.id], dim: m.state === 'off' }));
    const stage = $('stage');
    // the names: glass plates on the steps under each column (status word under the name)
    const tips = cols.map((c) => { const m = S.model.find((x) => x.id === c.id); const d = el('div', { class: 'tip', style: `--c:${c.color}`, 'data-tip': c.id }, el('b', { text: c.name }), el('small', { text: m ? m.statusWord.split(' · ')[0] : '' })); stage.append(d); return [c.id, d]; });
    const onFrame = (proj) => { for (const [id, d] of tips) { const p = proj(id, 'label'); if (!p) continue; d.hidden = p.y > stage.clientHeight - 14 || p.x < 0 || p.x > stage.clientWidth; d.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`; d.classList.toggle('on', S.sel === id); } };
    S.scene = await Sc.create($('c'), cols, { reduce, low, onPick: (id) => id && select(id, 'scene'), onLost: flat, onFrame });
    if (!S.scene) return flat();
    S.scene.select(S.sel, false);
    document.documentElement.dataset.mode = low ? '3d-low' : '3d';
    window.__pillars = { stats: () => S.scene.stats(), project: (id) => S.scene.project(id), select, model: () => S.model };
  } catch (_) { flat(); }
}

async function boot() {
  const h = (location.hash || '').slice(1);
  let saved = null; try { saved = localStorage.getItem('olyPillar'); } catch (_) { /* private */ }
  S.sel = IDS.includes(h) ? h : IDS.includes(saved) ? saved : 'lit';
  const [data, home, biz, payday, file] = await Promise.all([getJSON('pillars-data.json'), getJSON('../home.json'), getJSON('../business/accounts.json'), getJSON('../business/payday.json'), getJSON('../odeon/trades.json')]);
  Object.assign(S, { data, home, biz, payday, file });
  if (!data) { $('panel').replaceChildren(el('p', { class: 'muted', text: 'The pillars data did not load. Pull to refresh.' })); return; }
  $('said').textContent = `"${data.said}" · owner, ${data.said_when}`;
  $('srcs').textContent = 'Numbers: ' + Object.values(data.sources || {}).join(' · ') + '. Live: the PC\'s 15-minute post. Read only.';
  render();
  startScene();
  setTimeout(() => { import('./nightfx.js?v=h1').then((m) => m.mount()).catch(() => {}); import('./livefx.js?v=h1').then((m) => m.watch(document.getElementById('panel'))).catch(() => {}); }, 300);
  try {
    const F = window.PC_FEED;
    if (F && F.fetchLatest) {
      const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]);
      if (lite) { S.lite = lite; render(); }
    }
  } catch (_) { /* the site's copy stays */ }
  document.documentElement.dataset.ready = '1';
  window.__pillarsModel = () => S.model;
}
boot();
