// ORACLE sheet (2026-11-04): the Prophecy sheet, four tabs over the World (index.html #oracle). DOM only; every text goes in with
// textContent. render(w, stats) is cheap and only rewrites the open tab (and the two chips in the bottom sheet, when they change).
//   Prophecy  what the bot needs next + probability bars per open level (prophecy.js)
//   Heat      how hot the three nearest levels were over the last prices (insights.heatHistory), as sparklines
//   Alerts    one timeline: the Brain's log and what is hot now (insights.alertsOf)
//   Day       the kind of day, the sweep counter, a button into today's replay
import { prophecyRows } from './prophecy.js';
import { sweepCount, dayTypeOf, heatHistory, alertsOf } from './insights.js';
import { waitingOf } from './heat.js';
import { litWindow } from './time.js';
import { kindOf, hex } from './glow.js';

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const pct = (v) => (v == null ? '–' : Math.round(v) + '%');
const R = (v) => (v == null ? '–' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + 'R');

/** a heat history as a row of little columns (no SVG): one column per price, as tall as the heat */
function spark(series, color) {
  const box = el('div', 'sp');
  box.setAttribute('aria-hidden', 'true');
  box.style.color = color;
  series.forEach((v) => {
    const c = el('i');
    c.style.height = Math.max(3, Math.round(v * 100)) + '%';
    c.style.opacity = String(0.35 + 0.65 * v);
    box.append(c);
  });
  return box;
}

export class OracleSheet {
  constructor(onToday) {
    this.root = $('oracle');
    this.btn = $('oracle-btn');
    this.tab = 'prophecy';
    this.world = null;
    this.stats = null;
    this.onToday = onToday;
    this.btn.addEventListener('click', () => this.open(this.root.hidden));
    $('oracle-close').addEventListener('click', () => this.open(false));
    this.root.querySelectorAll('[role="tab"]').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.tab)));
    $('day-replay').addEventListener('click', () => { this.open(false); this.onToday(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) this.open(false); });
  }

  open(on) {
    this.root.hidden = !on;
    this.btn.setAttribute('aria-expanded', String(!!on));
    if (on) this.paint();
  }

  show(tab) {
    this.tab = tab;
    this.root.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.root.querySelectorAll('[role="tabpanel"]').forEach((p) => { p.hidden = p.dataset.tab !== tab; });
    this.paint();
  }

  /** a new World (and the stats file, or null) */
  render(w, stats) {
    this.world = w;
    this.stats = stats;
    this.chips(w);
    if (!this.root.hidden) this.paint();
  }

  /** the day type and the sweep counter, as two chips on their own row under the weather (rewritten only when they change: no layout churn) */
  chips(w) {
    const box = $('wx2');
    if (!box || !w) return;
    const d = dayTypeOf(w), s = sweepCount(w), key = `${d.id}|${d.label}|${s.taken}|${s.highs}|${s.open}`;
    if (key === this.chipKey) return;
    this.chipKey = key;
    const a = el('span', 'chip day', d.label), b = el('span', 'chip sweeps', `Sweeps ${s.taken}`);
    a.dataset.day = d.id;
    a.title = d.why;
    b.title = `${s.highs} highs, ${s.lows} lows swept · ${s.open} still open`;
    box.replaceChildren(a, b);
  }

  paint() {
    const w = this.world;
    if (!w || this.root.hidden) return;
    ({ prophecy: () => this.paintProphecy(w), heat: () => this.paintHeat(w), alerts: () => this.paintAlerts(w), day: () => this.paintDay(w) })[this.tab]();
  }

  paintProphecy(w) {
    const wt = waitingOf(w, litWindow(w.t || Date.now() / 1000, w.src !== 'demo' ? w.windows : null));
    $('pr-next').textContent = wt ? wt.next : '';
    const rows = prophecyRows(w, this.stats);
    const list = $('pr-list');
    list.replaceChildren(...rows.map((r) => {
      const li = el('li', 'pr' + (r.low ? ' low' : ''));
      li.dataset.fam = r.fam || '';
      li.dataset.odds = String(r.odds);
      const dot = el('i');
      dot.style.background = hex(kindOf(r.kind).color);
      const head = el('div', 'pr-h');
      head.append(dot, el('span', 'pr-name', r.label), el('span', 'pr-d', `${r.dist > 0 ? '↑' : '↓'} ${Math.abs(r.dist).toFixed(1)} pts`), el('b', 'pr-odds', pct(r.odds)));
      const bar = el('div', 'pr-bar');
      const fill = el('i');
      fill.style.width = Math.max(2, Math.min(100, r.odds)) + '%';
      bar.append(fill);
      const meta = el('div', 'pr-m');
      meta.append(r.known
        ? el('span', null, `Led to ${r.n} trades (${Math.round(r.share * 100)}%) · won ${pct(r.win)}${r.avg_r != null ? ' · avg ' + R(r.avg_r) : ''}${r.low ? ' · few' : ''}`)
        : el('span', null, 'No trade history for this level yet: ranked by distance only'));
      li.append(head, bar, meta);
      return li;
    }));
    $('pr-empty').hidden = rows.length > 0;
    $('pr-src').textContent = this.stats ? `From ${this.stats.all.n} replayed LIT trades (${this.stats.days[0]} to ${this.stats.days[1]}): ${this.stats.all.win_pct}% won overall, ${this.stats.all.win26}% in 2026.` : 'Trade history not loaded: bars show distance only.';
  }

  paintHeat(w) {
    const rows = heatHistory(w);
    $('ht-list').replaceChildren(...rows.map((r) => {
      const li = el('li', 'ht');
      const k = hex(kindOf(r.kind).color);
      const t = el('div', 'ht-t');
      t.append(el('span', 'ht-name', r.label), el('b', null, `${Math.round(r.now * 100)}%`));
      li.append(t, spark(r.series, k), el('span', 'ht-m', `peak ${Math.round(r.peak * 100)}% over the last ${r.series.length} prices`));
      return li;
    }));
    $('ht-empty').hidden = rows.length > 0;
  }

  paintAlerts(w) {
    const rows = alertsOf(w);
    $('al-list').replaceChildren(...rows.map((r) => {
      const li = el('li', 'al t-' + r.tone);
      li.append(el('time', null, r.hm || ''), el('span', null, r.text));
      return li;
    }));
    $('al-empty').hidden = rows.length > 0;
  }

  paintDay(w) {
    const d = dayTypeOf(w), s = sweepCount(w);
    $('day-type').textContent = d.label;
    $('day-type').dataset.day = d.id;
    $('day-why').textContent = d.why;
    $('sw-n').textContent = String(s.taken);
    $('sw-detail').textContent = `${s.highs} highs · ${s.lows} lows · ${s.open} still open`;
    $('day-replay').hidden = !this.canReplay;
  }

  setCanReplay(on) { this.canReplay = !!on; if (!this.root.hidden && this.tab === 'day') this.paintDay(this.world); }
}
