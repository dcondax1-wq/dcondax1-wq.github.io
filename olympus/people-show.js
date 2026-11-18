// PEOPLE OF OLYMPUS, what a person shows (2026-11-11): the WORK CARD ("show me your work") and the SPEECH BUBBLE over a figure in a 3D scene.
// Honest by construction: a work card is built only from that person's facts (people-core.js buildFacts). Every number on it is a piece of text that
// is already in the facts (tests/test_people.py checks each card with the same grounding check as the answers); a chart bar is drawn from a number
// read back out of that same text. Each card names its source file. Paper only: nothing here can place an order.
//
// Pure (node-tested):
//   workCard(person, facts, what?) -> { id, name, kind, title, verdict: { text, tone } | null, lines: [{ label, text }], chart: { title, bars: [{ label, v, text }] } | null,
//                                       list: [{ text, day }], sources, label, sample }
//   cardText(card)                 every string on the card (the grounding check reads this)
//   wantsWork(text) / wantsWalk(text)   "what are you working on / show me / how did it go"   ·   "walk with me / lead me there"
//   sentences(text)                the bubble shows one sentence at a time
// DOM:
//   renderCard(card, { portrait, mini, onOpen }) -> <section class="pp-card">      bubble({ name, text, container, onTap }) -> { el, words(k, n), place(x, y, front), remove() }
// Text only through textContent / createElementNS. Safari 16 safe.
import { arr, isObj, clean, num, dayOf, toMs } from './people-core.js';

const NS = 'http://www.w3.org/2000/svg';
const WORK = /\b(show (me|us)|show (your|the|ur) (work|numbers|results?|chart|card)|let me see|what (are|r) (you|u) working on|working on|how did (it|that|today|yesterday|the (day|night|session|run)) go|how('?s| is| was) (it|the work|work) going|your work|how (are|r) (you|u) doing)\b/i;
const WALK = /\b(walk with me|walk me|lead me|lead the way|take me (there|to (your|it|the))|show me where|go there together|follow you)\b/i;
export const wantsWork = (t) => WORK.test(String(t || ''));
export const wantsWalk = (t) => WALK.test(String(t || ''));
/** sentences, for the bubble (a number like 1.2 stays whole) */
export function sentences(text) {
  const t = String(text || ''), out = []; let cur = '';
  for (let i = 0; i < t.length; i++) { const ch = t.charAt(i); cur += ch; if ('.!?'.indexOf(ch) >= 0 && (i + 1 >= t.length || /\s/.test(t.charAt(i + 1)))) { out.push(cur.trim()); cur = ''; } }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

const MONEY = /([+-]?\$[\d,]+(?:\.\d+)?)/;
const moneyOf = (t) => { const m = MONEY.exec(String(t || '')); if (!m) return null; const v = parseFloat(m[1].replace(/[$,+]/g, '')); return isFinite(v) ? { v, text: m[1] } : null; };
const plainNum = (t) => { const s = String(t == null ? '' : t).trim(); return /^-?\d+(?:\.\d+)?$/.test(s) ? parseFloat(s) : null; };
const findNum = (f, re) => arr(f.numbers).find((n) => re.test(n.label));
const take = (f, res) => { const out = []; for (const re of res) { const n = findNum(f, re); if (n && out.indexOf(n) < 0) out.push(n); } return out.map((n) => ({ label: n.label, text: n.text })); };
function honest(f) { return f.sample ? 'Sample data, not real numbers.' : f.status === 'stale' && !f.missing ? 'My data is old.' : f.note === 'snapshot at build time' ? 'A snapshot from when the site was built.' : ''; }

/** the work card of one person, from their facts only */
export function workCard(person, facts, what) {
  const p = person || {}, f = isObj(facts) ? facts : { numbers: [], last: [], learned: [], sources: [] }, kind = p.kind || 'keeper', id = String(p.id || '');
  const card = { id, name: clean(p.name || id, 40), kind, title: 'My work', verdict: null, lines: [], chart: null, list: [], sources: arr(f.sources).slice(0, 3), label: honest(f), sample: !!f.sample, what: what || 'work', app: p.app || '' };
  const L = arr(f.last), dayText = (x) => (x && x.t != null ? dayOf(toMs(x.t)) : '');
  if (kind === 'champion') {
    const vm = /Verdict: ([a-z][a-z ]{1,24})/i.exec(String(f.doing || ''));
    card.title = 'My run in the Archive';
    card.verdict = vm ? { text: 'Verdict: ' + vm[1].trim(), tone: /reject/i.test(vm[1]) ? 'bad' : /adopt/i.test(vm[1]) ? 'good' : 'info' } : null;
    card.lines = take(f, [/^2026 net$/, /^2026 profit factor$/, /^2026 trades a week$/, /^Earlier years, net$/, /^Earlier years, profit factor$/, /^2026 evals passed within ten/, /^2026 evals failed within ten/]);
    const a = f.metrics && f.metrics.pf, b = f.metrics && f.metrics.pf_old;
    if (a && b && num(a.v) != null && num(b.v) != null) card.chart = { title: 'Profit factor', bars: [{ label: '2026', v: a.v, text: String(a.text) }, { label: 'Earlier years', v: b.v, text: String(b.text) }], base: 1 };
    else {
      const bars = [], n26 = f.metrics && f.metrics.net, old = findNum(f, /^Earlier years, net$/), mo = old ? moneyOf(old.text) : null;
      if (n26 && num(n26.v) != null) bars.push({ label: '2026', v: n26.v, text: String(n26.text) });
      if (mo) bars.push({ label: 'Earlier years', v: mo.v, text: mo.text });
      if (bars.length) card.chart = { title: 'Net after costs', bars, base: 0 };
    }
    card.list = L.slice(0, 2).map((x) => ({ text: x.text, day: '' }));
    if (f.failed) card.list.push({ text: f.failed, day: '' });
  } else if (kind === 'builder') {
    card.title = 'My last commits';
    card.lines = take(f, [/^Commits on my branch$/, /^Branch$/, /^Last commit$/, /^Files touched$/]);
    card.list = L.filter((x) => /^Commit: /.test(x.text)).slice(0, 5).map((x) => ({ text: x.text.replace(/^Commit: /, ''), day: dayText(x) }));
    if (!card.list.length) card.list = [{ text: short(f.note || f.doing || 'No commit of mine was published with the site.', 160), day: '' }];
  } else if (kind === 'scanner') {
    card.title = 'What I found';
    card.verdict = f.doing ? { text: short(f.doing, 140), tone: f.status === 'failed' ? 'bad' : 'info' } : null;
    card.lines = take(f, [/^Top pick$/, /^Estimate per month$/, /^Picks on the table$/, /^Its score$/, /^Updated$/]);
    const bars = [];
    for (const x of L.slice(0, 5)) { const m = /about (\$[\d,]+)/.exec(x.text); if (m) { const v = parseFloat(m[1].replace(/[$,]/g, '')); if (isFinite(v)) bars.push({ label: x.text.split(':')[0], v, text: m[1] + ' (an estimate)' }); } }
    if (bars.length) card.chart = { title: 'Estimates per pick', bars };
    card.list = L.slice(0, 4).map((x) => ({ text: x.text, day: '' }));
  } else if (id === 'bot:kalshi') {
    card.title = 'My Kalshi verdict';
    const v = arr(f.learned).find((x) => /settled paper bets my total is/.test(x.text));
    card.verdict = v ? { text: v.text, tone: /total is -/.test(v.text) ? 'bad' : 'good' } : { text: short(f.doing || 'No settled paper bets on file yet.', 140), tone: 'info' };
    card.lines = take(f, [/^Today$/, /^Settled paper bets$/, /^Paper balance$/, /^Updated$/]);
    const bars = [];
    for (const x of L.slice(0, 5)) { const m = /([+-]\$[\d.,]+)$/.exec(x.text); if (m) bars.push({ label: x.text.replace(m[0], '').trim(), v: parseFloat(m[1].replace(/[$,+]/g, '')), text: m[1] }); }
    if (bars.length) card.chart = { title: 'Last paper bets', bars, base: 0 };
    card.list = L.slice(0, 3).map((x) => ({ text: x.text, day: dayText(x) }));
  } else if (kind === 'bot') {
    card.title = 'My paper account';
    card.lines = take(f, [/^Today$/, /^This week$/, /^Drawdown$/, /^To the eval target$/, /^Updated$/]);
    const bars = [];
    for (const x of L) { const m = /^Trade on (\d{4}-\d\d-\d\d)[^:]*: (.+)$/.exec(x.text); const mo = m ? moneyOf(m[2]) : null; if (m && mo) bars.push({ label: m[1], v: mo.v, text: m[2] }); }
    if (bars.length) card.chart = { title: 'Last trades ($ and R)', bars: bars.slice(0, 5), base: 0 };
    card.list = L.slice(0, bars.length ? 1 : 3).map((x) => ({ text: x.text, day: '' }));
  } else {
    card.title = kind === 'mind' ? 'My research' : 'What I keep an eye on';
    card.lines = arr(f.numbers).slice(0, 4).map((n) => ({ label: n.label, text: n.text }));
    const bars = arr(f.numbers).map((n) => ({ label: n.label, v: plainNum(n.text), text: String(n.text) })).filter((b) => b.v != null);
    if (bars.length >= 2) card.chart = { title: 'In numbers', bars: bars.slice(0, 5), base: 0 };
    card.list = L.slice(0, 3).map((x) => ({ text: x.text, day: dayText(x) }));
  }
  if (f.blocked) card.list.push({ text: 'Blocked: ' + short(f.blocked, 150), day: '' });
  return card;
}
/** every string on a card, for the grounding check */
export function cardText(c) {
  const bits = [c.title, c.label, c.verdict ? c.verdict.text : ''];
  for (const l of c.lines) bits.push(l.label, l.text);
  if (c.chart) { bits.push(c.chart.title); for (const b of c.chart.bars) bits.push(b.label, b.text); }
  for (const x of c.list) bits.push(x.text, x.day);
  bits.push((c.sources || []).join(', '));
  return bits.filter(Boolean).join(' \n ');
}

// ------------------------------------------------------------------------------------------------ DOM
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
/** cut at a word, never inside a number */
function short(t, n) { const s = String(t == null ? '' : t); if (s.length <= n) return s; const i = s.lastIndexOf(' ', n - 1); return (i > 3 ? s.slice(0, i) : s.slice(0, n - 1)).replace(/[\s,;:(]+$/, '') + '…'; }
function sv(tag, at) { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; }
/** a small horizontal bar chart: each bar's value text is the fact's own text */
function columnsSvg(ch) {                                     // the mini card: columns, no text (the full card in the chat has the numbers)
  const bars = ch.bars, W = 190, H = 44, n = bars.length, gap = 6, bw = Math.min(30, (W - gap * (n + 1)) / n), base = ch.base != null ? ch.base : 0;
  const lo = Math.min(base, ...bars.map((b) => b.v)), hi = Math.max(base, ...bars.map((b) => b.v)), span = hi - lo || 1, y0 = 2 + ((hi - base) / span) * (H - 4);
  const s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', class: 'pp-chart', preserveAspectRatio: 'xMidYMid meet' });
  const t = sv('title', {}); t.textContent = ch.title + ': ' + bars.map((b) => b.label + ' ' + b.text).join(', '); s.appendChild(t);
  bars.forEach((b, i) => { const y1 = 2 + ((hi - b.v) / span) * (H - 4), x = gap + i * (bw + gap) + (W - n * (bw + gap) - gap) / 2; s.appendChild(sv('rect', { x, y: Math.min(y0, y1), width: bw, height: Math.max(2, Math.abs(y1 - y0)), rx: 3, fill: b.v < base ? '#c96a4a' : '#8fa05a' })); });
  s.appendChild(sv('line', { x1: 0, x2: W, y1: y0, y2: y0, stroke: '#6b5a40', 'stroke-width': 1 }));
  return s;
}
function chartSvg(ch, mini) {
  if (mini) return columnsSvg(ch);
  const bars = ch.bars, W = mini ? 190 : 300, rowH = mini ? 20 : 26, H = bars.length * rowH + 4, LW = mini ? 62 : 104, VW = mini ? 66 : 96, plot = W - LW - VW - 8;
  const vs = bars.map((b) => b.v), base = ch.base != null ? ch.base : 0, lo = Math.min(base, ...vs), hi = Math.max(base, ...vs), span = hi - lo || 1, x0 = LW + ((base - lo) / span) * plot;
  const s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', class: 'pp-chart', preserveAspectRatio: 'xMinYMin meet' });
  const t = sv('title', {}); t.textContent = ch.title + ': ' + bars.map((b) => b.label + ' ' + b.text).join(', '); s.appendChild(t);
  s.appendChild(sv('line', { x1: x0, x2: x0, y1: 0, y2: H, stroke: '#6b5a40', 'stroke-width': 1 }));
  bars.forEach((b, i) => {
    const y = i * rowH + 3, x1 = LW + ((b.v - lo) / span) * plot, left = Math.min(x0, x1), w = Math.max(2, Math.abs(x1 - x0));
    const lab = sv('text', { x: LW - 6, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'pp-chl' }); lab.textContent = short(b.label, mini ? 10 : 16); s.appendChild(lab);
    s.appendChild(sv('rect', { x: left, y: y + 4, width: w, height: rowH - 10, rx: 3, fill: b.v < base ? '#c96a4a' : '#8fa05a' }));
    const val = sv('text', { x: W - 2, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'pp-chv' }); val.textContent = short(b.text, mini ? 11 : 18); s.appendChild(val);
  });
  return s;
}
/** the card as an element (opts: portrait(size) -> SVG, mini, onOpen) */
export function renderCard(c, opts) {
  const o = opts || {}, el = h('section', 'pp-card' + (o.mini ? ' pp-mini' : '')); el.setAttribute('aria-label', c.title + ', from ' + c.name);
  const head = h('div', 'pp-chead');
  if (o.portrait && !o.mini) { const f = h('span', 'pp-cface'); f.appendChild(o.portrait(40)); head.appendChild(f); }
  const tt = h('div', 'pp-ctt'); tt.append(h('h3', 'pp-ctitle', c.title), h('p', 'pp-cwho', c.name)); head.appendChild(tt);
  el.appendChild(head);
  if (c.verdict) el.appendChild(h('p', 'pp-verdict pp-' + c.verdict.tone, c.verdict.text));
  if (c.chart) { const fig = h('figure', 'pp-cfig'); fig.appendChild(h('figcaption', 'pp-fcap', c.chart.title)); fig.appendChild(chartSvg(c.chart, o.mini)); el.appendChild(fig); }
  const lines = o.mini ? c.lines.slice(0, 2) : c.lines;
  if (lines.length) { const dl = h('dl', 'pp-clines'); for (const l of lines) { const row = h('div', 'pp-cl'); row.append(h('dt', '', l.label), h('dd', '', l.text)); dl.appendChild(row); } el.appendChild(dl); }
  if (!o.mini && c.list.length) { const ul = h('ul', 'pp-clist'); for (const x of c.list) { const li = h('li', '', x.text); if (x.day) li.appendChild(h('span', 'pp-cday', ' ' + x.day)); ul.appendChild(li); } el.appendChild(ul); }
  el.appendChild(h('p', 'pp-src', 'From: ' + (c.sources.length ? c.sources.join(', ') : 'no file') + (c.label ? '. ' + c.label : '')));
  if (!o.mini && o.onOpen && c.app) { const b = h('button', 'pp-btn pp-act', 'Open their work'); b.type = 'button'; b.addEventListener('click', o.onOpen); el.appendChild(b); }
  return el;
}

/** a speech bubble over a figure. container: the scene's positioned box (or none: fixed to the screen). words(k, n) reveals k of n spoken words. */
export function bubble(opts) {
  const o = opts || {}, el = h('button', 'pp-say'); el.type = 'button';
  el.setAttribute('aria-label', (o.name ? o.name + ' says: ' : '') + clean(o.text, 300) + '. Tap to open the conversation.');
  const who = h('span', 'pp-sayname', o.name || ''), body = h('span', 'pp-saytext'), shown = h('span', 'pp-sayon'), rest = h('span', 'pp-sayoff');
  body.append(shown, rest); el.append(who, body);
  el.setAttribute('aria-hidden', o.hidden ? 'true' : 'false');
  const S = sentences(o.text), W = S.map((s) => s.split(/\s+/)), total = W.reduce((n, w) => n + w.length, 0) || 1;
  let cur = -1, last = -2;
  function paint(sIdx, k) {
    if (sIdx === cur && k === last) return; cur = sIdx; last = k;
    const w = W[sIdx] || [];
    shown.textContent = w.slice(0, k).join(' '); rest.textContent = (k > 0 && k < w.length ? ' ' : '') + w.slice(k).join(' ');
  }
  /** k of n words said (n = the spoken word count; the display words follow in proportion) */
  function words(k, n) {
    const at = Math.max(0, Math.min(total, Math.round((k / Math.max(1, n || total)) * total)));
    let left = at, i = 0;
    while (i < W.length - 1 && left > W[i].length) { left -= W[i].length; i++; }
    paint(i, Math.min(W[i] ? W[i].length : 0, left));
  }
  paint(0, 0);
  if (o.onTap) el.addEventListener('click', o.onTap);
  const box = o.container || null;
  el.classList.add(box ? 'pp-in-scene' : 'pp-on-screen');
  (box || document.body).appendChild(el);
  function place(x, y, front) {
    if (front === false) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = '';
    const bw = el.offsetWidth || 220, bh = el.offsetHeight || 60, W0 = box ? box.clientWidth : innerWidth;
    const left = Math.max(8, Math.min(W0 - bw - 8, x - bw / 2)), top = Math.max(6, y - bh - 16);
    el.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    el.style.setProperty('--tail', Math.round(Math.max(18, Math.min(bw - 18, x - left))) + 'px');
  }
  function remove() { if (el.parentNode) el.parentNode.removeChild(el); }
  return { el, words, place, remove, full() { paint(W.length - 1, (W[W.length - 1] || []).length); } };
}
