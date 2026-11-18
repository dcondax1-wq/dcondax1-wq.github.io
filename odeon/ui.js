// ODEON UI: the reels gallery (3D poster cards, best $ first), the transport (play, speed, scrub with event ticks), the
// stats card.
// DOM only; no three.js. Every text goes in with textContent (no HTML from the data).
import { fmtUsd, fmtR, fmtPx, dayLabel, hhmm, heldLabel, exitLabel, outcomeOf, spark } from './data.js';
import { applyFilters, statsOf, histogram, hourOf, setupOf, monthOf, runStats } from './library.js';

export const SPEEDS = [1, 2, 5, 10, 20, 60];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** The poster's art: the trade's tape as a glowing line, the entry marked (an SVG, built once per card). */
function posterArt(tr) {
  const v = spark(tr, 48);
  const lo = Math.min(...v), hi = Math.max(...v), W = 160, H = 64;
  const y = (p) => H - 6 - ((p - lo) / Math.max(1e-6, hi - lo)) * (H - 14);
  const pts = v.map((p, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${y(p).toFixed(1)}`);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `0,${H} ${pts.join(' ')} ${W},${H}`);
  area.setAttribute('class', 'p-area');
  const pl = document.createElementNS(ns, 'polyline');
  pl.setAttribute('points', pts.join(' '));
  pl.setAttribute('class', 'p-line');
  const B = tr.B, ix = Math.max(0, Math.min(v.length - 1, Math.round(((tr.entry.t - B.t[0]) / Math.max(1, B.t[B.n - 1] - B.t[0])) * (v.length - 1))));
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', ((ix / (v.length - 1)) * W).toFixed(1));
  dot.setAttribute('cy', y(tr.entry.px).toFixed(1));
  dot.setAttribute('r', '3');
  dot.setAttribute('class', 'p-entry');
  svg.append(area, pl, dot);
  return svg;
}

/** The reels in the order the gallery shows them: 'usd' = the best $ first (the owner's default), 'new' = newest first. */
export function sortReels(trades, by) {
  const T = trades.slice();
  if (by === 'usd') T.sort((a, b) => b.usd - a.usd || b.entry.t - a.entry.t);
  else T.sort((a, b) => b.entry.t - a.entry.t);
  return T;
}

const SRC = { backtest: 'replay', paper: 'paper', real: 'real', pc: 'pc bars' };

/** The reels gallery: one 3D poster card per trade (sorted by $ or by date), filters, tap to play */
export class Reels {
  constructor(root, onPick) {
    this.root = root;
    this.list = root.querySelector('#reelList');
    this.sum = root.querySelector('#reelSum');
    this.note = root.querySelector('#reelNote');
    this.onPick = onPick;
    this.filter = 'all';
    this.sort = 'usd';
    this.trades = [];
    this.more = { setup: 'all', hour: 'all', month: 'all', r: null };   // the library's second row: setup, session, month, R bin
    this.compare = false;                                              // compare mode: tap two reels to put them side by side
    this.picks = [];
    this.shown = [];
    this.stats = root.querySelector('#reelStats');
    this.hero = root.querySelector('#reelHero');
    this.hist = root.querySelector('#reelHist');
    this.moreBox = root.querySelector('#reelMore');
    const group = (sel, key) => root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => {
      this[key] = b.dataset[key === 'filter' ? 'f' : 's'];
      root.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      this.render();
    }));
    group('.chip[data-f]', 'filter');
    group('.chip[data-s]', 'sort');
  }

  set(trades, demo) {
    this.trades = trades;
    this.demo = demo;
    this.buildMore();
    this.render();
  }

  /** the library's chips for what this file holds: the ATLAS setups, the four sessions, the months (a group appears only with 2+ choices) */
  buildMore() {
    if (!this.moreBox) return;
    const uniq = (f, order) => { const v = [...new Set(this.trades.map(f))]; return order ? order.filter((x) => v.includes(x)) : v.sort(); };
    const groups = [['setup', 'Setup', uniq(setupOf)], ['hour', 'Session', uniq(hourOf, ['Asia', 'London', 'NY AM', 'NY PM'])],
      ['month', 'Month', uniq(monthOf).reverse()]];
    this.moreBox.replaceChildren(...groups.filter(([, , v]) => v.length > 1).map(([key, label, vals]) => {
      const row = el('div', 'chips mini');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', label);
      row.append(el('span', 'chip-k', label));
      for (const v of ['all', ...vals]) {
        const b = el('button', 'chip sm', v === 'all' ? 'All' : key === 'month' ? v.slice(2).replace('-', '/') : v);
        b.type = 'button';
        b.dataset.g = key;
        b.dataset.v = v;
        b.setAttribute('aria-pressed', String(this.more[key] === v));
        b.addEventListener('click', () => {
          this.more[key] = v;
          row.querySelectorAll('.chip.sm').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          this.render();
        });
        row.append(b);
      }
      return row;
    }));
  }

  /** the R-multiple histogram of what the other filters leave: tap a bar to keep only that R range, tap it again to release */
  drawHist(trades) {
    if (!this.hist) return;
    const bins = histogram(trades), top = Math.max(1, ...bins.map((b) => b.n));
    this.hist.replaceChildren(...bins.map((b) => {
      const on = this.more.r && this.more.r[0] === b.lo && this.more.r[1] === b.hi;
      const col = el('button', 'hb t-' + b.tone);
      col.type = 'button';
      col.dataset.i = String(b.i);
      col.setAttribute('aria-pressed', String(!!on));
      col.setAttribute('aria-label', `${b.label}: ${b.n} trade${b.n === 1 ? '' : 's'}, ${fmtUsd(b.net)}`);
      const bar = el('i');
      bar.style.height = Math.max(b.n ? 6 : 2, (b.n / top) * 100) + '%';
      col.append(el('b', null, b.n ? String(b.n) : ''), bar, el('span', null, b.label.replace(' to ', '/').replace(' +', '+')));
      col.addEventListener('click', () => {
        this.more.r = on ? null : [b.lo, b.hi];
        this.render();
      });
      return col;
    }));
  }

  /** the reels the gallery shows right now, in order (the play-all queue) */
  current() { return this.shown.slice(); }

  /** compare mode: reels are picked instead of played; the second pick calls onCompare(a, b) */
  setCompare(on) {
    this.compare = !!on;
    this.picks = [];
    this.root.classList.toggle('comparing', this.compare);
    this.list.querySelectorAll('.reel').forEach((b) => b.removeAttribute('data-pick'));
  }

  /** a line above the posters (e.g. the trade Oracle asked for has no film yet); '' hides it */
  say(text) {
    this.note.textContent = text || '';
    this.note.hidden = !text;
  }

  render() {
    const base = { f: this.filter, setup: this.more.setup, hour: this.more.hour, month: this.more.month };
    this.drawHist(applyFilters(this.trades, base));
    const T = sortReels(applyFilters(this.trades, { ...base, r: this.more.r }), this.sort);
    this.shown = T;
    this.list.textContent = '';
    if (this.stats) {
      const st = statsOf(T);
      const bestT = T.length ? T.reduce((x, y) => (y.r > x.r ? y : x)) : null, worstT = T.length ? T.reduce((x, y) => (y.r < x.r ? y : x)) : null;
      this.stats.textContent = T.length ? `${st.winPct}% won · avg ${fmtR(st.avgR)} · best ${fmtR(st.bestR)}${bestT ? ' (' + fmtUsd(bestT.usd) + ')' : ''} · worst ${fmtR(st.worstR)}${worstT ? ' (' + fmtUsd(worstT.usd) + ')' : ''}` + (isFinite(st.pf) ? ` · PF ${st.pf.toFixed(2)}` : '') : 'No trade matches these filters';
    }
    const net = T.reduce((a, t) => a + t.usd, 0);
    if (this.hero) {                                                   // the money first: the net, what it is per month, what the wins and losses add up to
      this.hero.textContent = '';
      const mo = new Set(T.map((t) => String(t.day || '').slice(0, 7)).filter(Boolean)).size, w = T.filter((t) => t.usd > 0).reduce((x, t) => x + t.usd, 0), l = T.filter((t) => t.usd < 0).reduce((x, t) => x + t.usd, 0);
      if (T.length) {
        const big = el('b', 'rh-net' + (net < 0 ? ' neg' : ''), fmtUsd(net));
        this.hero.append(big, el('span', 'rh-sub', `net from ${T.length} trade${T.length === 1 ? '' : 's'}` + (mo ? ` · about ${fmtUsd(net / mo)} a month` : '')),
          el('span', 'rh-split', `Winners ${fmtUsd(w)} · losers ${fmtUsd(l)}`));
      }
      this.hero.hidden = !T.length;
    }
    const days = this.trades.map((t) => t.day).sort();
    this.sum.textContent = this.demo ? 'Demo reel (no trades file yet)'
      : `${T.length} reels · ${dayLabel(days[0] || '')} → ${dayLabel(days[days.length - 1] || '')} · net ${fmtUsd(net)}`;
    T.forEach((t, k) => {
      const o = outcomeOf(t);
      const li = el('li');
      const b = el('button', 'reel o-' + o);
      b.type = 'button';
      b.dataset.id = t.id;
      b.style.setProperty('--i', String(Math.min(k, 18)));
      if (t.id === this.active) b.setAttribute('aria-current', 'true');
      b.setAttribute('aria-label', `${t.bot === 'ATLAS' ? 'ATLAS ' + t.strat : 'LIT'} ${t.side.toLowerCase()} ${dayLabel(t.day)}: ${fmtUsd(t.usd)}, ${fmtR(t.r)}`);
      const poster = el('span', 'poster');
      poster.append(posterArt(t), el('span', 'p-rank', this.sort === 'usd' ? '#' + (k + 1) : dayLabel(t.day).split(' ').slice(1).join(' ')),
        el('b', 'p-usd', fmtUsd(t.usd)), el('span', 'p-r', fmtR(t.r)));
      const top = el('span', 'r-top');
      top.append(el('span', 'r-bot b-' + t.bot.toLowerCase(), t.bot === 'ATLAS' ? 'ATLAS · ' + t.strat : 'LIT'),
        el('span', 'r-src s-' + t.src, SRC[t.src] || t.src));
      const info = el('span', 'r-info');
      info.append(el('span', 'r-date', `${dayLabel(t.day)} · ${hhmm(t.entry.t, t.off)} ET`),
        el('span', 'r-side ' + (t.side === 'LONG' ? 'long' : 'short'), `${t.side} · ${t.qty} micro${t.qty === 1 ? '' : 's'} · ${exitLabel(t.exit.kind).toLowerCase()}`));
      b.append(poster, top, info);
      b.addEventListener('click', () => {
        if (!this.compare) return this.onPick(t.id);
        const at = this.picks.indexOf(t.id);
        if (at >= 0) this.picks.splice(at, 1); else this.picks.push(t.id);
        this.picks = this.picks.slice(-2);
        this.list.querySelectorAll('.reel').forEach((x) => { const k = this.picks.indexOf(x.dataset.id); if (k < 0) x.removeAttribute('data-pick'); else x.dataset.pick = 'AB'[k]; });
        if (this.picks.length === 2 && this.onCompare) this.onCompare(this.trades.find((x) => x.id === this.picks[0]), this.trades.find((x) => x.id === this.picks[1]));
      });
      li.append(b);
      this.list.append(li);
    });
  }

  mark(id) {
    this.active = id;
    this.list.querySelectorAll('.reel').forEach((b) => (b.dataset.id === id ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
  }
}

/** play / pause, speed, the scrubber (with the caption rows as ticks) and the clock */
export class Transport {
  constructor(root, h) {
    this.root = root;
    this.h = h; // { toggle(), speed(x), seek(T), restart() }
    this.play = root.querySelector('#play');
    this.speedBtn = root.querySelector('#speed');
    this.scrub = root.querySelector('#scrub');
    this.ticks = root.querySelector('#ticks');
    this.clock = document.getElementById('clock');
    this.left = document.getElementById('tLeft');
    this.play.addEventListener('click', () => h.toggle());
    this.speedBtn.addEventListener('click', () => {
      const i = SPEEDS.indexOf(this.speed);
      h.speed(SPEEDS[(i + 1) % SPEEDS.length]);
    });
    root.querySelector('#restart').addEventListener('click', () => h.restart());
    const seek = () => h.seek(this.t0 + (Number(this.scrub.value) / 1000) * (this.t1 - this.t0));
    this.scrub.addEventListener('input', seek);
    this.scrub.addEventListener('change', seek);
  }

  load(tr) {
    this.tr = tr;
    this.t0 = tr.tStart;
    this.t1 = tr.tEnd;
    this.ticks.textContent = '';
    const keep = { sweep: 1, entry: 1, exit: 1, be: 1, cisd5: 1 };
    for (const e of tr.events) {
      if (!keep[e.k]) continue;
      const b = el('button', 'tick k-' + e.k + (e.outcome ? ' o-' + e.outcome : ''));
      b.type = 'button';
      b.style.left = (((e.t - this.t0) / (this.t1 - this.t0)) * 100).toFixed(2) + '%';
      b.setAttribute('aria-label', `Jump to ${e.k} at ${hhmm(e.t, tr.off)} ET`);
      b.addEventListener('click', () => this.h.seek(e.t - (e.k === 'exit' ? 20 * tr.B.s : 3 * tr.B.s)));
      this.ticks.append(b);
    }
  }

  setSpeed(x) {
    this.speed = x;
    this.speedBtn.textContent = x + 'x';
    this.speedBtn.setAttribute('aria-label', `Speed ${x}x (1x = one minute of market per second)`);
  }

  setPlaying(on, ended) {
    this.play.dataset.state = ended ? 'ended' : on ? 'playing' : 'paused';
    this.play.setAttribute('aria-label', ended ? 'Replay' : on ? 'Pause' : 'Play');
  }

  sync(T, pnl) {
    const tr = this.tr;
    if (!tr) return;
    if (document.activeElement !== this.scrub) this.scrub.value = String(Math.round(((T - this.t0) / (this.t1 - this.t0)) * 1000));
    this.clock.textContent = hhmm(T, tr.off) + ' ET';
    this.left.textContent = pnl.live ? `${fmtUsd(pnl.usd)} · ${fmtR(pnl.r)}` : T < tr.entry.t ? 'waiting for the setup' : 'closed';
    this.left.dataset.sign = pnl.live ? (pnl.usd >= 0 ? 'up' : 'down') : '';
  }
}

/** the card after the trade: $, R, MFE / MAE, time in trade, the backtest twin */
export function fillStats(card, tr) {
  const o = outcomeOf(tr);
  card.dataset.outcome = o;
  const set = (id, v) => { const x = card.querySelector('#' + id); if (x) x.textContent = v; };
  set('stKind', exitLabel(tr.exit.kind));
  set('statUsd', fmtUsd(tr.usd));
  set('statR', fmtR(tr.r));
  set('stTitle', `${tr.bot === 'ATLAS' ? 'ATLAS · ' + tr.strat : 'LIT'} ${tr.side.toLowerCase()} · ${dayLabel(tr.day)}`);
  set('stMfe', `${fmtR(tr.mfe_r || 0)} · ${fmtUsd(tr.mfe_usd || 0, false)}`);
  set('stMae', `${fmtR(-(tr.mae_r || 0))} · ${fmtUsd(-(tr.mae_usd || 0))}`);
  set('stHeld', heldLabel(tr.held_min));
  set('stPrices', `${fmtPx(tr.entry.px)} → ${fmtPx(tr.exit.px)}`);
  set('stTimes', `${hhmm(tr.entry.t, tr.off)} → ${hhmm(tr.exit.t, tr.off)} ET`);
  set('stSize', `${tr.qty} micro${tr.qty === 1 ? '' : 's'} · risk ${fmtUsd(tr.risk_usd, false)} (${tr.risk_pts.toFixed(2)} pts)`);
  let twin;
  if (tr.twin) {
    const tw = tr.twin;
    twin = `${tw.src === 'paper' ? 'Paper (cloud) twin' : 'Backtest twin'}: ${tw.r != null ? fmtR(tw.r) : '—'}`
      + (tw.usd != null ? `, ${fmtUsd(tw.usd)}` : '') + (tw.exit ? ` (${exitLabel(tw.exit).toLowerCase()})` : '');
  } else if (tr.src === 'backtest') {
    twin = 'This reel is the backtest itself (live settings, costs in).';
  } else {
    twin = 'No backtest twin for this trade.';
  }
  // what it left on the table (money first): the best it showed against what was kept
  const best = tr.mfe_usd || 0, kept = tr.usd;
  set('stLeft', best > 0 && kept >= 0 && best - kept > 1 ? `At its best it was up ${fmtUsd(best, false)}; you kept ${fmtUsd(kept)} (${Math.round((100 * kept) / best)}%).`
    : best > 0 && kept < 0 ? `It was up ${fmtUsd(best, false)} at one point and finished ${fmtUsd(kept)}.` : kept > 0 ? 'Held to the end: it kept what it made.' : '');
  set('stTwin', twin);
}

/** The trade's numbers on the stage while it plays: R now, MFE, MAE, minutes held (updated a few times a second, text only) */
export class StageStats {
  constructor(root) {
    this.root = root;
    this.cells = {};
    for (const [k, label] of [['r', 'R now'], ['mfe', 'MFE'], ['mae', 'MAE'], ['held', 'Held']]) {
      const c = el('span', 'os-c');
      const v = el('b', null, '–');
      c.append(el('i', null, label), v);
      this.cells[k] = v;
      root.append(c);
    }
    this.at = 0;
  }

  /** wall = seconds of the frame loop (rate limit), forced = at once (a seek, a new reel) */
  set(tr, T, wall, forced) {
    if (!forced && wall - this.at < 0.25) return;
    this.at = wall;
    const s = runStats(tr, T);
    this.root.hidden = !s.started;
    if (!s.started) return;
    const c = this.cells;
    c.r.textContent = fmtR(s.r);
    c.mfe.textContent = fmtR(s.mfeR);
    c.mae.textContent = fmtR(-s.maeR);
    c.held.textContent = heldLabel(s.heldMin);
    this.root.dataset.sign = s.r > 0 ? 'up' : s.r < 0 ? 'down' : '';
    this.root.dataset.live = String(!!s.live);
  }
}
