// ONE PILLAR'S DATA page (pillars/data.html#lit|atlas|blitz|of; day-pillars4 2026-11-25). The model is datacore.js (pure, node-tested); the next
// setup / steps / thinking / learning come from the Brain's own model (brain/braincore.js) so the two pages never disagree.
// Reads the site's JSON + the PC's public status post (../pc_feed.js). Until a PC post arrives, the LIVE parts (status, next setup, thinking)
// show the Brain's bundled fixture, labelled SAMPLE; money, trades and research are always the real files. createElement / textContent only.
// Read only: GET requests; nothing is sent, armed or placed. ?at=<ISO> pins the clock (tests). window.PILLAR_DATA = the test hook.
import * as DC from './datacore.js?v=d2';
import * as B from '../brain/braincore.js?v=b3';
import * as PF from './pillarsfeed.js?v=p4';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const AT = (() => { const v = q.get('at'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t / 1000 : null; })();
const T0 = Date.now() / 1000;
const nowS = () => (AT ? AT + (Date.now() / 1000 - T0) : Date.now() / 1000);
const S = { site: {}, lite: null, id: 'lit', model: null };
const NAMES = { lit: 'LIT', atlas: 'ATLAS', blitz: 'BLITZ', of: 'ORDER FLOW' };

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
const fmt = (v, d) => (v == null || !Number.isFinite(+v) ? '-' : (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const lvl = (v) => (v == null ? '' : v > 0 ? 'ok' : v < 0 ? 'bad' : '');
const sec = (title, id, ...kids) => el('section', { class: 'sec', id }, el('h3', { text: title }), ...kids);

/* ---------------- data ---------------- */
async function loadSite() {
  const names = { pillarsData: 'pillars-data.json', home: '../home.json', biz: '../business/accounts.json', payday: '../business/payday.json', file: '../odeon/trades.json',
    trades: '../trading/trades.json', brief: '../nq/brief.json', learn: '../brain/learn.json', fixture: '../brain/fixture.json' };
  const got = await Promise.all(Object.values(names).map((u) => getJSON(u)));
  Object.keys(names).forEach((k, i) => { S.site[k] = got[i]; });
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
function model() {
  const sample = !S.lite && !!S.site.fixture;
  const t = sample ? S.site.fixture.now + (Date.now() / 1000 - T0) : nowS();
  const lite = sample ? S.site.fixture.lite : S.lite;
  const brain = B.build({ ...S.site, feed: window.PC_FEED, coach: window.PAYOUT_COACH || null, lite, bars: null, sample }, t);
  // the pillar words, accounts, tick count + lessons: the same model the Pillars page draws (pillarsfeed)
  let pillars = [];
  try { pillars = PF.modelFrom({ data: S.site.pillarsData, home: S.site.home || {}, biz: S.site.biz, payday: S.site.payday, file: S.site.file, lite, nowS: t, feed: window.PC_FEED, coach: window.PAYOUT_COACH || null }); } catch (_) { pillars = []; }
  // money is always the real files + the real post (never the SAMPLE trades); the clock is the real one
  const D = DC.build(S.id, { nowS: nowS(), data: S.site.pillarsData, trades: S.site.trades, lite: S.lite, region: B.region(brain, S.id), pillars, pc: brain.pc, sample });
  return { D, brain, sample, all: pillars };
}

/* ---------------- drawing ---------------- */
function drawTabs(all) {
  const box = $('dtabs'); box.replaceChildren();
  for (const id of DC.IDS) {
    const p = all.find((x) => x.id === id) || { name: NAMES[id], color: '#9d59ee', statusWord: '' };
    box.append(el('a', { class: 'ptab', role: 'tab', href: '#' + id, 'data-p': id, style: `--c:${p.color}`, 'aria-selected': String(S.id === id) },
      el('b', { text: p.name }), el('small', { text: String(p.statusWord || '').split(' · ')[0] })));
  }
}
function headCard(D) {
  const accts = el('div');
  for (const a of D.live.accounts) accts.append(el('div', { class: 'acct' }, el('span', { class: 'nm', text: `${a.name} · ${a.stage}` }), el('span', { class: 'td num ' + a.lvl, text: a.today === '-' ? '-' : `today ${a.today}` }),
    el('span', { class: 'muted', text: a.state }), a.clock ? el('span', { class: 'ck', text: `7-day clock: ${a.clock}` }) : null));
  return el('section', { class: 'dhead', id: 'dHead' }, el('h2', { text: D.name }), el('div', { class: 'al', text: D.alias }),
    el('span', { class: 'badge ' + D.level, id: 'dStatus', text: D.statusWord }), el('p', { text: D.status }),
    D.live.accounts.length ? accts : el('p', { class: 'muted', text: D.live.accountsText || 'No account on this pillar.' }));
}
function moneyCard(D) {
  const s = D.stats, box = sec('Money · real trades', 'dMoney');
  if (!['lit', 'atlas'].includes(D.id)) { box.append(el('p', { class: 'muted', text: D.tradesNote })); return box; }
  const k = (label, val, cls, sub, id) => el('div', { class: 'kpi', id }, el('small', { text: label }), el('b', { class: cls, text: val }), el('span', { text: sub }));
  box.append(el('div', { class: 'kpis' },
    k('This week', DC.usd(s.week), lvl(s.week), `${s.weekN} trade${s.weekN === 1 ? '' : 's'} since Mon ${String(s.weekFrom || '').slice(5)}`, 'kWeek'),
    k('This month', DC.usd(s.month), lvl(s.month), `${s.monthN} trade${s.monthN === 1 ? '' : 's'} in ${s.monthOf || '-'}`, 'kMonth'),
    k('Win rate', s.win === null ? '-' : `${fmt(s.win, 0)}%`, 'gold', `${s.n} real trade${s.n === 1 ? '' : 's'} closed`, 'kWin'),
    k('Profit factor', s.pfWord, s.pf !== null && s.pf >= 1 ? 'ok' : s.pf !== null ? 'bad' : 'gold', `all-time ${DC.usd(s.total)}${s.avgR !== null ? ` · avg ${s.avgR > 0 ? '+' : ''}${s.avgR.toFixed(2)}R` : ''}`, 'kPf')));
  if (s.curve.length >= 2) box.append(spark(s.curve));
  if (s.open) box.append(el('p', { class: 'wait', id: 'dOpen' }, el('b', { text: 'OPEN NOW: ' }), document.createTextNode(`${s.open.side} since ${s.open.hm} ET${s.open.usd !== null ? ` · ${DC.usd(s.open.usd)}` : ''}`)));
  box.append(el('p', { class: 'src', text: `Real MFFU trades only (trading/trades.json + the PC's newest).${s.thin ? ` Only ${s.n} so far: too few to judge the edge; the backtest numbers are under Research.` : ''}${s.paperN ? ` ${s.paperN} paper twin trade${s.paperN === 1 ? '' : 's'} not counted.` : ''}` }));
  return box;
}
/** the real $ path, trade by trade: an SVG line (gold above $0, the area tinted), first and last day under it */
function spark(curve) {
  const NS = 'http://www.w3.org/2000/svg', W = 340, H = 64, pad = 4;
  const vs = [0, ...curve.map((p) => p.v)], lo = Math.min(...vs), hi = Math.max(...vs), span = Math.max(1, hi - lo);
  const x = (i) => pad + (i / curve.length) * (W - pad * 2), y = (v) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  const pts = [[x(0), y(0)], ...curve.map((p, i) => [x(i + 1), y(p.v)])];
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'spark'); svg.setAttribute('role', 'img');
  const last = curve[curve.length - 1].v; svg.setAttribute('aria-label', `Real $ path over ${curve.length} trades: ${DC.usd(last)}`);
  const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); svg.append(e); return e; };
  mk('line', { x1: pad, x2: W - pad, y1: y(0), y2: y(0), class: 'z' });
  mk('path', { d: `M${pts.map((p) => p.join(',')).join(' L')} L${pts[pts.length - 1][0]},${y(0)} Z`, class: 'a ' + (last >= 0 ? 'up' : 'dn') });
  mk('path', { d: `M${pts.map((p) => p.join(',')).join(' L')}`, class: 'l ' + (last >= 0 ? 'up' : 'dn') });
  const e = pts[pts.length - 1]; mk('circle', { cx: e[0], cy: e[1], r: 3.5, class: 'd ' + (last >= 0 ? 'up' : 'dn') });
  return el('div', { class: 'sparkbox', id: 'dSpark' }, svg, el('div', { class: 'sx' }, el('span', { text: curve[0].day.slice(5) }), el('b', { class: lvl(last), text: `${DC.usd(last)} over ${curve.length} real trades` }), el('span', { text: curve[curve.length - 1].day.slice(5) })));
}
function tradesCard(D) {
  if (!['lit', 'atlas'].includes(D.id)) return null;
  const box = sec(`Last ${Math.min(10, D.trades.length) || 10} trades`, 'dTrades');
  if (!D.trades.length) { box.append(el('p', { class: 'muted', text: D.tradesNote })); return box; }
  const t = el('table', { class: 'trades', id: 'dTradeTable' }), hr = el('tr');
  [['Day', ''], ['Side', ''], ['Account', ''], ['R', 'n'], ['$', 'n']].forEach(([x, c]) => hr.append(el('th', { class: c, text: x }))); t.append(el('thead', {}, hr));
  const body = el('tbody');
  for (const r of D.trades) {
    body.append(el('tr', { 'data-src': r.src }, el('td', { text: `${r.day.slice(5)} ${r.hm}` }),
      el('td', {}, document.createTextNode(r.side), r.open ? el('span', { class: 'tg open', text: 'open' }) : r.src === 'paper' ? el('span', { class: 'tg', text: 'paper' }) : r.how ? el('span', { class: 'tg', text: r.how.toLowerCase() }) : null),
      el('td', { text: r.src === 'paper' ? 'paper twin' : r.acct || '-' }), el('td', { class: 'n', text: r.r === null ? '-' : `${r.r > 0 ? '+' : ''}${r.r.toFixed(2)}` }), el('td', { class: 'n ' + lvl(r.usd), text: DC.usd(r.usd) })));
  }
  t.append(body); box.append(t);
  box.append(el('a', { class: 'go', href: '../trading/', text: 'Every trade, with charts ›' }));
  return box;
}
function nextCard(D, sample) {
  const n = D.next; if (!n) return null;
  const box = sec(D.id === 'of' ? 'Progress' : D.id === 'blitz' ? 'Next step' : 'Next setup', 'dNext');
  if (sample) box.append(el('div', { class: 'fage warn' }, el('i'), document.createTextNode('SAMPLE: no PC post reached this page yet')));
  else if (n.feed && ['lit', 'atlas'].includes(D.id)) box.append(el('div', { class: 'fage ' + n.feed.level, id: 'dFeedAge' }, el('i'), document.createTextNode(n.feed.age === null ? 'No brain feed from the PC yet'
    : `${n.feed.what === 'brain feed' ? 'Brain feed' : 'Step report'} ${B.ago(n.feed.age)}${n.feed.hm ? ` · ${n.feed.hm} ET` : ''}${n.feed.level === 'bad' ? ' · OLD' : n.feed.level === 'warn' ? ' · late' : ''}`)));
  box.append(el('p', { class: 'setup', id: 'dSetup', text: n.setup || 'Nothing forming' }));
  const steps = n.steps || n.chain;
  if (steps && steps.length) { const ul = el('ul', { class: 'steps', id: 'dSteps' }); for (const s of steps) ul.append(el('li', { class: s.state, text: s.label })); box.append(ul); }
  else if (n.stepsText) box.append(el('p', { class: 'muted', text: `Step ${n.stepsText}` }));
  if (n.waiting) box.append(el('p', { class: 'wait' }, el('b', { text: 'Waiting for: ' }), document.createTextNode(n.waiting)));
  if (n.window) box.append(el('p', { class: 'muted', text: `Window: ${n.window}${n.dist !== null ? ` · ${B.pts(n.dist)} pts ${n.distFrom}` : ''}` }));
  if (['lit', 'atlas'].includes(D.id)) {
    const p3 = el('div', { class: 'px3' });
    [['l', n.inTrade ? 'Entry' : 'Limit', n.limit], ['s', 'Stop', n.stop], ['t', 'Target', n.target]].forEach(([c, k, v]) => p3.append(el('div', { class: c }, el('small', { text: k }), el('b', { text: v == null ? 'not set' : B.px(v) }))));
    box.append(p3);
  }
  box.append(el('a', { class: 'go', href: `../brain/#${D.id}`, text: `Open ${D.name}'s Brain room: live chart + thinking ›` }));
  return box;
}
function flowCard(D) {
  const f = D.flow; if (!f) return null;
  const box = sec('Order flow · ticks collected', 'dFlow');
  box.append(el('div', { class: 'kpis' },
    el('div', { class: 'kpi' }, el('small', { text: 'Tick days (PC)' }), el('b', { class: 'gold', id: 'kDays', text: f.days === null ? '-' : `${f.days} / ${f.of}` }), el('span', { text: f.days === null ? 'not reported yet' : `${Math.round(f.frac * 100)}% of the study's days` })),
    el('div', { class: 'kpi' }, el('small', { text: 'Looks used' }), el('b', { class: 'gold', id: 'kLooks', text: `${f.looksUsed} / ${f.looks}` }), el('span', { text: 'pre-registered: no change after a look' }))));
  box.append(el('div', { class: 'bar', role: 'img', 'aria-label': f.days === null ? 'tick count not reported yet' : `${f.days} of ${f.of} tick days` }, el('i', { style: `width:${Math.round((f.frac || 0) * 100)}%` })));
  const lk = el('div', { class: 'looks', 'aria-hidden': 'true' }); for (let i = 0; i < (f.looks || 2); i++) lk.append(el('i', { class: i < f.looksUsed ? 'on' : '' })); box.append(lk);
  box.append(el('p', { class: 'muted', text: f.text || 'Waiting for the PC\'s tick count.' }));
  if (f.battery) box.append(el('p', { class: 'muted', text: `Battery: ${f.battery.state || '-'} (${f.battery.need || '?'} days needed; run ${f.battery.made || '-'}). On disk for the study: ${f.onDisk ?? '-'} tick days, mode ${f.mode || '-'}.` }));
  for (const d of f.designs) box.append(el('div', { class: 'design' }, el('span', { class: 'w', text: 'waiting' }), el('b', { text: d.id }), document.createTextNode(d.text), el('span', { class: 'g', text: d.gate })));
  if (f.proxy) box.append(el('p', { class: 'src', text: `Bar proxies so far: ${f.proxy}` }));
  box.append(el('p', { class: 'src', text: `Source: the PC's tick line + ${f.src}` }));
  return box;
}
function learnCard(D) {
  const L = D.learned, box = sec('What it learned', 'dLearn');
  const ul = el('ul', { class: 'lrn', id: 'dLessons' });
  const seen = new Set();
  for (const x of L.week) { if (seen.has(x.text)) continue; seen.add(x.text); ul.append(el('li', {}, el('em', { text: x.status || 'new' }), document.createTextNode(x.text))); }
  for (const x of L.lessons) if (!L.week.some((w) => w.text === x.text)) ul.append(el('li', {}, el('em', { text: x.d ? x.d.slice(5) : 'lesson' }), document.createTextNode(x.text)));
  if (!ul.children.length) ul.append(el('li', { class: 'muted', text: 'The market-learning job has no lesson for this pillar yet.' }));
  box.append(ul);
  if (L.testing.length) { box.append(el('h3', { text: 'Testing next', style: 'margin-top:10px' })); const t = el('ul', { class: 'lrn' }); for (const x of L.testing) t.append(el('li', {}, el('em', { text: 'next' }), document.createTextNode(x))); box.append(t); }
  box.append(el('p', { class: 'src', text: `Confidence: ${L.confWord}. Source: research/learn (${L.src || 'brain/learn.json'})${L.journalLanded ? '' : ', weekly lessons'}. Research only: nothing here changes a live rule.` }));
  return box;
}
function researchCard(D) {
  const box = sec('Research · verdicts', 'dResearch');
  if (D.spans.length || D.recent) {
    const tb = el('table', { class: 'spans' }), hr = el('tr'); ['Backtest', '/wk', 'Win', 'PF', '$/mo'].forEach((x) => hr.append(el('th', { text: x }))); tb.append(el('thead', {}, hr));
    const body = el('tbody');
    const row = (s, cls) => { const tr = el('tr', { class: cls || '' }); [s.k, fmt(s.tpw, 1), s.win == null ? '-' : fmt(s.win, 0) + '%', fmt(s.pf, 2), DC.usd(s.usd_mo, false)].forEach((x, i) => tr.append(el('td', { class: i === 4 ? lvl(s.usd_mo) === 'ok' ? 'pos' : lvl(s.usd_mo) === 'bad' ? 'neg' : '' : '', text: x }))); body.append(tr); };
    D.spans.forEach((s) => row(s)); if (D.recent) row({ ...D.recent, k: D.recent.k }, 'recent');
    tb.append(body); box.append(tb);
  }
  if (D.edge) box.append(el('p', { class: 'muted', text: D.edge }));
  const R = D.rejected;
  box.append(el('h3', { text: `Tested and rejected: ${R.n}`, style: 'margin-top:12px', id: 'dRejN' }));
  const first = R.rows.slice(0, 3), rest = R.rows.slice(3);
  const row = (x) => el('div', { class: 'rj' }, el('b', {}, el('span', { class: 'v', text: 'REJECTED' }), document.createTextNode(x.title)), el('p', {}, el('span', { class: 'd', text: x.d }), document.createTextNode(x.text)));
  if (!R.rows.length) box.append(el('p', { class: 'muted', text: 'Nothing filed under this pillar yet.' }));
  first.forEach((x) => box.append(row(x)));
  if (rest.length) { const d = el('details', { class: 'more' }, el('summary', { text: `${rest.length} more (newest ${R.rows.length} of ${R.n})` })); rest.forEach((x) => d.append(row(x))); box.append(d); }
  box.append(el('p', { class: 'src', text: `Source: ${R.src} (filed by the pillar it names first; ${R.shared} more apply to every pillar).` }));
  const M = D.mill;
  if (M) {
    box.append(el('h3', { text: 'Idea mill · every pillar', style: 'margin-top:12px' }));
    box.append(el('div', { class: 'mill', id: 'dMill' }, el('div', {}, el('b', { text: fmt(M.ideas, 0) }), el('small', { text: 'ideas made' })), el('div', {}, el('b', { text: fmt(M.scored, 0) }), el('small', { text: 'scored' })),
      el('div', { class: M.passed ? '' : 'zero' }, el('b', { text: fmt(M.passed, 0) }), el('small', { text: 'passed every gate' }))));
    box.append(el('p', { class: 'muted', text: `${fmt(M.raw, 0)} looked good by luck-level odds (about ${fmt(M.luck, 0)} expected by chance); ${M.families} families, best ${M.best}. Data to ${M.dataEnd}, run ${M.made} UTC.` }));
  }
  if (D.risks.length) { box.append(el('h3', { text: 'Risks', style: 'margin-top:12px' })); const ul = el('ul', { class: 'list' }); D.risks.forEach((t) => ul.append(el('li', { text: t }))); box.append(ul); }
  if (D.nextSteps.length) { box.append(el('h3', { text: "What's next", style: 'margin-top:12px' })); const ol = el('ol', { class: 'list next' }); D.nextSteps.forEach((t) => ol.append(el('li', { text: t }))); box.append(ol); }
  box.append(el('a', { class: 'go', href: '../cities/hub.html', text: 'Every test in the Research Hub ›' }));
  return box;
}
function render() {
  const { D, sample, all, brain } = model(); S.model = D;
  document.documentElement.style.setProperty('--c', D.color);
  document.title = `${D.name} · Pillar Data`;
  $('ttl').textContent = `${D.name} · Data`; $('crN').textContent = D.name; $('back').href = `./#${D.id}`; $('crP').href = `./#${D.id}`;
  $('back').setAttribute('aria-label', `Back to the Four Pillars (${D.name})`);
  const pill = $('pcPill'); pill.textContent = sample ? 'SAMPLE' : brain.pc.text; pill.className = 'pill ' + (sample ? '' : brain.pc.level === 'ok' ? 'ok' : 'warn');
  const sm = $('sample'); sm.hidden = !sample;
  if (sample) sm.textContent = 'SAMPLE: the PC\'s report has not reached this page yet, so status, next setup and thinking show a recorded-style morning. Money, trades and research are the real files.';
  drawTabs(all);
  const box = $('data'); box.replaceChildren(); box.dataset.p = D.id;
  for (const c of [headCard(D), D.id === 'of' ? null : moneyCard(D), D.id === 'of' ? flowCard(D) : nextCard(D, sample), tradesCard(D), D.id === 'of' ? nextCard(D, sample) : null, learnCard(D), researchCard(D)]) if (c) box.append(c);
  const f = $('dfoot'); f.replaceChildren(el('a', { href: `./#${D.id}`, text: '‹ Pillars' }), el('a', { href: `../brain/#${D.id}`, text: 'Brain room ›' }), el('a', { href: '../trading/', text: 'Trades ›' }),
    el('a', { href: '../cities/hub.html', text: 'Research ›' }), el('a', { href: '../nq/accounts.html', text: 'Accounts ›' }));
  document.documentElement.dataset.ready = '1';
}
function route() { const h = location.hash.slice(1); S.id = DC.IDS.includes(h) ? h : 'lit'; if (S.site.pillarsData) { render(); scrollTo(0, 0); } }
addEventListener('hashchange', route);
window.PILLAR_DATA = { model: () => S.model, ready: () => document.documentElement.dataset.ready === '1' };

(async function main() {
  const h = location.hash.slice(1); S.id = DC.IDS.includes(h) ? h : 'lit';
  await loadSite();
  if (!S.site.pillarsData) { $('data').replaceChildren(el('p', { class: 'muted', text: 'The pillars data did not load. Pull to refresh.' })); return; }
  render();
  if (await pollCore()) render();
  setInterval(async () => { if (document.visibilityState !== 'hidden' && await pollCore()) render(); }, 90000);
})();
