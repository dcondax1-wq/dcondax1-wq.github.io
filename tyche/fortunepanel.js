// TYCHE fortune panel (2026-11-04): the fifth view. Five small sections over fortune.js: the strategy leaderboard, the streak coins, today's
// fortune card, two bankrolls side by side and the session replay. DOM through textContent only (the feed's words are never parsed as HTML).
// The OLYMPUS effects library (../olympus/fx-*.js) adds the sparks and counters when the page has it; without it every section draws the same.
import { leaderboard, streakCoins, fortune, compareBankrolls, replayFrames, usdF } from './fortune.js';

const FX = () => window.OLYMPUS_FX || null;
const SECTIONS = [['board', 'Board'], ['streak', 'Streak'], ['fortune', 'Fortune'], ['compare', 'Compare'], ['replay', 'Replay']];
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const pctF = (x) => (x == null ? '–' : Math.round(x * 100) + '%');
const sign = (v) => (v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'flat');

export class FortunePanel {
  constructor(root, { reduced = false } = {}) {
    this.root = root; this.reduced = reduced; this.m = null; this.sec = 'board'; this.timer = 0; this.fx = []; this.at = 0;
    this.seg = root.querySelector('#f-seg'); this.body = root.querySelector('#f-body'); this.cmp = root.querySelector('#f-cmp');     // the comparison's <svg> lives in the page (its namespace comes from it)
    this.seg.replaceChildren(...SECTIONS.map(([k, n]) => { const b = el('button', '', n); b.type = 'button'; b.dataset.f = k; b.setAttribute('aria-pressed', String(k === this.sec)); b.addEventListener('click', () => this.go(k)); return b; }));
  }
  setModel(m) { this.m = m; this.draw(); }
  go(k) { this.sec = k; this.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === k))); this.draw(); }
  clear() {
    clearInterval(this.timer); this.timer = 0;
    this.fx.forEach((h) => h && h.stop && h.stop()); this.fx = [];
    if (this.cmp && this.cmp.parentNode === this.body) { this.cmp.setAttribute('hidden', ''); this.root.append(this.cmp); }
    this.body.replaceChildren();
  }
  draw() {
    this.clear();
    const m = this.m;
    this.body.dataset.sec = this.sec;
    if (!m) { this.body.append(el('p', 'small', 'Waiting for the bot\'s numbers.')); return; }
    if (!(m.settled && m.settled.length)) { this.body.append(el('p', 'small', 'No settled bets yet: the leaderboard, streak, fortune, comparison and replay fill in as bets settle.')); return; }
    this[this.sec](m);
  }

  board(m) {
    const b = leaderboard(m);
    this.body.append(el('p', 'small', `Who earns the money (by ${b.by}), ${b.total} settled bets.`));
    const list = el('ol', 'lboard');
    const top = Math.max(1, ...b.rows.map((r) => Math.abs(r.pnl)));
    b.rows.forEach((r, i) => {
      const li = el('li', 'lrow'); li.dataset.name = r.name;
      li.append(el('span', 'rk', i + 1), el('span', 'nm', r.name), el('b', sign(r.pnl), usdF(r.pnl, true)));
      const bar = el('i', 'bar ' + sign(r.pnl)); bar.style.width = (Math.abs(r.pnl) / top * 100).toFixed(1) + '%';
      li.append(bar, el('small', '', `${r.wins}W ${r.losses}L · ${pctF(r.winRate)} won`));
      list.append(li);
    });
    this.body.append(list);
  }

  streak(m) {
    const s = streakCoins(m);
    this.body.append(el('p', 'small', s.cur.kind ? `${s.cur.n} ${s.cur.kind === 'win' ? 'win' : 'loss'}${s.cur.n === 1 ? '' : s.cur.kind === 'win' ? 's' : 'es'} in a row now · best run ${s.best}` : `No run right now · best run ${s.best}`));
    const row = el('div', 'coins'); row.setAttribute('role', 'img'); row.setAttribute('aria-label', `The last ${s.coins.length} settled bets: ${s.coins.filter((c) => c.win).length} won`);
    s.coins.forEach((c, i) => { const d = el('span', 'coin ' + (c.win ? 'win' : 'loss')); d.title = `${c.title} ${usdF(c.pnl, true)}`; d.style.setProperty('--i', i); row.append(d); });
    this.body.append(row);
    const f = FX();
    if (f && f.sparkleBurst && s.cur.kind === 'win' && s.cur.n >= 3 && !this.reduced) { const last = row.lastElementChild; if (last) f.sparkleBurst(last, { count: 20, colors: ['#c8a24a', '#f3ece0', '#f3ece0'] }); }
  }

  fortune(m) {
    const f = fortune(m), card = el('div', 'fcard ' + f.tone);
    card.append(el('b', 'fh', f.headline), ...f.lines.map((t) => el('p', 'fl', t)), el('small', 'fn', f.note));
    this.body.append(card);
    const fx = FX();
    if (fx && fx.gradientBorder) this.fx.push(fx.gradientBorder(card, { colors: ['#c8a24a', '#9bab63', '#6f9bb8'], width: 1.5, seconds: 6 }));
  }

  compare(m) {
    const c = compareBankrolls(m, 0.5), all = c.a.concat(c.b).map((x) => x.bal), lo = Math.min(...all), hi = Math.max(...all), r = hi - lo || 1;
    const W = 320, H = 86, P = 4, X = (i) => P + (i / Math.max(1, c.n)) * (W - 2 * P), Y = (v) => P + (1 - (v - lo) / r) * (H - 2 * P);
    const svg = this.cmp, ns = svg.namespaceURI;
    svg.replaceChildren(); svg.removeAttribute('hidden');     // an <svg> has no .hidden property: the attribute it is
    [[c.a, '#c8a24a'], [c.b, '#9bab63']].forEach(([f, col]) => { const p = document.createElementNS(ns, 'polyline'); p.setAttribute('points', f.map((x) => `${X(x.i).toFixed(1)},${Y(x.bal).toFixed(1)}`).join(' ')); p.setAttribute('fill', 'none'); p.setAttribute('stroke', col); p.setAttribute('stroke-width', '2'); svg.append(p); });
    this.body.append(svg);
    const duo = el('p', 'duo');
    const cell = (lbl, v, cls) => { const s = el('span'); s.append(el('i', 'lbl', lbl), el('b', cls, v)); return s; };
    duo.append(cell('As it was', `${usdF(c.endA)} · deepest drop ${usdF(c.ddA)}`, 'gold'), cell('Half stake', `${usdF(c.endB)} · deepest drop ${usdF(c.ddB)}`, 'mint'));
    this.body.append(duo, el('p', 'small', `The same ${c.n} settled bets, one at the real stake (gold) and one at half (mint). A what-if on past bets, not a promise.`));
  }

  replay(m) {
    const fr = replayFrames(m), n = fr.length - 1;
    const info = el('p', 'rinfo'), bal = el('b', 'rbal'), go = el('button', 'rplay', this.reduced ? 'Step' : 'Play'), rng = el('input'); go.type = 'button';
    rng.type = 'range'; rng.min = 0; rng.max = n; rng.step = 1; rng.value = this.at = Math.min(this.at, n); rng.setAttribute('aria-label', 'Replay position, bet by bet');
    const show = (i, burst) => {
      this.at = i; const f = fr[i]; rng.value = i;
      info.textContent = i === 0 ? `Start of the record · ${n} settled bets` : `Bet ${i} of ${n}: ${f.title} ${usdF(f.pnl, true)}`; info.dataset.sign = i ? sign(f.pnl) : 'flat';
      bal.textContent = usdF(f.bal);
      const fx = FX();
      if (burst && fx && fx.sparkleBurst && f.win && !this.reduced) fx.sparkleBurst(bal, { count: 12, colors: ['#c8a24a', '#f3ece0'] });
    };
    rng.addEventListener('input', () => show(+rng.value, false));
    go.addEventListener('click', () => {
      if (this.reduced) { show(Math.min(n, this.at + 1), false); return; }
      if (this.timer) { clearInterval(this.timer); this.timer = 0; go.textContent = 'Play'; return; }
      if (this.at >= n) show(0, false);
      go.textContent = 'Pause';
      this.timer = setInterval(() => { if (document.hidden) return; if (this.at >= n) { clearInterval(this.timer); this.timer = 0; go.textContent = 'Play'; return; } show(this.at + 1, true); }, 520);
    });
    const row = el('div', 'rrow'); row.append(go, rng);
    this.body.append(bal, info, row);
    show(this.at, false);
  }
}
