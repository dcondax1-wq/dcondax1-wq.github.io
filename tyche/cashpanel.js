// TYCHE cash panel (2026-11-04): the sixth view, money first. Four sections over cash.js (the numbers): Break-even, At risk, Pace, Hours, and a
// Copy button that puts one plain sentence about the money on the clipboard. DOM through textContent / the SVG DOM only (the feed's words are
// never parsed as HTML). Every section has something to show even for a paused bot or a new feed (a plain sentence, never blank).
import { breakEven, atRisk, pace, hours, moneyLine, usd } from './cash.js';

const NS = () => (document.querySelector('svg') || document.documentElement).namespaceURI;     // taken from the page's own <svg>: no URL string in the source (the page's static rules)
const FX = () => window.OLYMPUS_FX || null;
const SECTIONS = [['even', 'Break-even'], ['risk', 'At risk'], ['pace', 'Pace'], ['hours', 'Hours']];
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, parent) { const e = document.createElementNS(NS(), tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
const sign = (v) => (v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'flat');

export class CashPanel {
  constructor(root, { reduced = false, now = () => Date.now() / 1000 } = {}) {
    this.root = root; this.reduced = reduced; this.now = now; this.m = null; this.sec = 'even';
    this.seg = root.querySelector('#c-seg'); this.body = root.querySelector('#c-body'); this.copy = root.querySelector('#c-copy'); this.rest = root.querySelector('#c-rest');
    this.seg.replaceChildren(...SECTIONS.map(([k, n]) => { const b = el('button', '', n); b.type = 'button'; b.dataset.c = k; b.setAttribute('aria-pressed', String(k === this.sec)); b.addEventListener('click', () => this.go(k)); return b; }));
    this.copy.addEventListener('click', () => this.copyLine());
  }
  setModel(m) { this.m = m; this.draw(); }
  go(k) { this.sec = k; this.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === k))); this.draw(); }
  async copyLine() {
    const line = moneyLine(this.m);
    let ok = false;
    try { await navigator.clipboard.writeText(line); ok = true; } catch (_) { try { const t = document.createElement('textarea'); t.value = line; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (__) { ok = false; } }
    this.copy.textContent = ok ? 'Copied' : 'Copy failed';
    this.copy.dataset.line = line;
    try { const f = FX(); if (ok && f && f.sparkleBurst && !this.reduced) f.sparkleBurst(this.copy, {}); } catch (_) { /* optional */ }
    setTimeout(() => { this.copy.textContent = 'Copy my money line'; }, 2200);
  }
  draw() {
    const m = this.m;
    this.body.replaceChildren(); this.body.dataset.sec = this.sec;
    const resting = !!m && (m.running === false || (m.open && !m.open.length));
    this.rest.hidden = !resting;
    this.rest.textContent = !resting ? '' : m.running === false ? 'The bot is paused: nothing is at risk and nothing settles. The history below stays as it was; bets, the settle clock and the risk numbers come back when it resumes.' : 'No bet is open right now. The risk numbers fill in when the next one opens.';
    if (!m) { this.body.append(el('p', 'small', 'Waiting for the bot\'s numbers.')); return; }
    this[this.sec](m);
  }

  // ---- Break-even
  even(m) {
    const b = breakEven(m);
    if (!b.ok) { this.body.append(el('p', 'small', b.line)); return; }
    const hero = el('div', 'cx-hero ' + (b.good ? 'up' : 'down'));
    hero.append(el('b', '', b.edge >= 0 ? '+' + b.edge.toFixed(1) + ' pts' : b.edge.toFixed(1) + ' pts'), el('span', '', b.good ? 'above break-even' : 'below break-even'));
    this.body.append(hero, el('p', 'small cx-line', b.line));
    // the meter: the needed win rate (tick) and yours (bar) on a 80%..100% (or wider) scale
    const lo = Math.max(0, Math.floor((Math.min(b.wr, b.need) - 0.06) * 20) / 20), hi = 1, X = (v) => 6 + ((v - lo) / (hi - lo)) * 308;
    const s = sv('svg', { class: 'cx-meter', viewBox: '0 0 320 54', role: 'img', 'aria-label': `Your win rate ${(b.wr * 100).toFixed(1)}% against the ${(b.need * 100).toFixed(1)}% you need` });
    sv('rect', { x: 6, y: 20, width: 308, height: 10, rx: 5, class: 'cx-track' }, s);
    sv('rect', { x: 6, y: 20, width: Math.max(2, X(b.wr) - 6), height: 10, rx: 5, class: 'cx-bar ' + (b.good ? 'up' : 'down') }, s);
    sv('line', { x1: X(b.need), x2: X(b.need), y1: 12, y2: 38, class: 'cx-need' }, s);
    const t1 = sv('text', { x: Math.min(300, Math.max(20, X(b.need))), y: 9, 'text-anchor': 'middle', class: 'cx-t' }, s); t1.textContent = 'need ' + (b.need * 100).toFixed(1) + '%';
    const t2 = sv('text', { x: Math.min(300, Math.max(20, X(b.wr))), y: 51, 'text-anchor': 'middle', class: 'cx-t me' }, s); t2.textContent = 'you ' + (b.wr * 100).toFixed(1) + '%';
    this.body.append(s);
    const d = el('p', 'duo cxd');
    const cell = (l, v, c) => { const sp = el('span'); sp.append(el('i', 'lbl', l), el('b', c || '', v)); return sp; };
    d.append(cell('Bets', b.n.toLocaleString('en-US')), cell('Return', b.roi == null ? '–' : (b.roi >= 0 ? '+' : '') + (b.roi * 100).toFixed(1) + '%', sign(b.roi || 0)), cell('Fees + slips', b.drag ? usd(b.drag) : '–', 'down'));
    this.body.append(d, el('p', 'small', b.why));
  }

  // ---- At risk
  risk(m) {
    const r = atRisk(m, this.now());
    if (!r.ok) { this.body.append(el('p', 'small', r.line)); return; }
    const hero = el('div', 'cx-hero ' + (r.level === 'ok' ? 'up' : 'down')); hero.append(el('b', '', usd(r.cost)), el('span', '', r.share != null ? Math.round(r.share * 100) + '% of your balance on the table' : 'on the table'));
    this.body.append(hero, el('p', 'small cx-line', r.line));
    if (r.level !== 'ok') this.body.append(el('p', 'cx-warn', r.level === 'bad' ? 'More than half the balance is on the table: one bad round hurts.' : 'A quarter of the balance is on the table: keep an eye on it.'));
    const ul = el('ul', 'cx-ladder');
    r.bands.forEach((b) => { const li = el('li'); li.append(el('span', '', b.label), el('b', '', usd(b.cost)), el('small', '', `${b.n} bet${b.n === 1 ? '' : 's'} · pays ${usd(b.back)} if they win`)); ul.append(li); });
    this.body.append(el('p', 'small', 'When the money comes back:'), ul);
    if (r.big) this.body.append(el('p', 'small', `Biggest bet: ${r.big.title} (${usd(r.big.cost)}${r.big.share != null ? ', ' + Math.round(r.big.share * 100) + '% of what is open' : ''}).`));
  }

  // ---- Pace
  pace(m) {
    const p = pace(m);
    if (!p.ok) { this.body.append(el('p', 'small', p.line)); return; }
    const hero = el('div', 'cx-hero ' + p.tone); hero.append(el('b', '', usd(p.today, true)), el('span', '', p.avg == null ? 'today' : 'today · usual day ' + usd(p.avg, true)));
    this.body.append(hero, el('p', 'small cx-line', p.line));
    const W = 320, H = 70, bars = p.bars, mx = Math.max(1, ...bars.map((d) => Math.abs(d[1]))), bw = (W - 8) / bars.length, s = sv('svg', { class: 'cx-bars', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Daily P&L, the last ${bars.length} days` });
    sv('line', { x1: 0, x2: W, y1: H / 2, y2: H / 2, class: 'cx-mid' }, s);
    bars.forEach((d, i) => { const h = Math.max(1.5, (Math.abs(d[1]) / mx) * (H / 2 - 3)); sv('rect', { x: 4 + i * bw + 1, y: d[1] >= 0 ? H / 2 - h : H / 2, width: Math.max(2, bw - 3), height: h, rx: 1.5, class: 'cx-b ' + (d[1] >= 0 ? 'up' : 'down') }, s).append(Object.assign(sv('title'), { textContent: d[0] + ': ' + usd(d[1], true) })); });
    this.body.append(s);
    const d = el('p', 'duo cxd'), cell = (l, v, c) => { const sp = el('span'); sp.append(el('i', 'lbl', l), el('b', c || '', v)); return sp; };
    d.append(cell('Week', p.week == null ? '–' : usd(p.week, true), sign(p.week || 0)), cell('Green days', Math.round(p.greenPct * 100) + '%', p.greenPct >= 0.5 ? 'up' : 'down'), cell('Best day', usd(p.best.v, true), 'up'), cell('Worst day', usd(p.worst.v, true), 'down'));
    this.body.append(d);
  }

  // ---- Hours
  hours(m) {
    const h = hours(m);
    if (!h.ok) { this.body.append(el('p', 'small', h.line)); return; }
    this.body.append(el('p', 'small cx-line', h.line));
    const W = 320, H = 76, mx = Math.max(1, ...h.hours.map((x) => Math.abs(x.pnl))), bw = (W - 8) / 24, s = sv('svg', { class: 'cx-bars', viewBox: `0 0 ${W} ${H + 12}`, role: 'img', 'aria-label': 'Profit and loss by New York hour of the day' });
    sv('line', { x1: 0, x2: W, y1: H / 2, y2: H / 2, class: 'cx-mid' }, s);
    h.hours.forEach((x, i) => { if (!x.n) return; const k = Math.max(1.5, (Math.abs(x.pnl) / mx) * (H / 2 - 3)); sv('rect', { x: 4 + i * bw + 1, y: x.pnl >= 0 ? H / 2 - k : H / 2, width: Math.max(2, bw - 2), height: k, rx: 1.5, class: 'cx-b ' + (x.pnl >= 0 ? 'up' : 'down') + (x.n < 3 ? ' thin' : '') }, s); });
    [0, 6, 12, 18].forEach((hr) => { const t = sv('text', { x: 4 + hr * bw + bw / 2, y: H + 10, 'text-anchor': 'middle', class: 'cx-t' }, s); t.textContent = h.lab(hr).replace(' ', ''); });
    this.body.append(s, el('p', 'small', `From the last ${h.n} settled bets (New York time). Hours with fewer than 3 bets are faint: too few to trust.`));
  }
}
