// ORACLE HUD: the top bar (where the data comes from, price, P&L today, the stage) and the bottom sheet (the replay
// scrubber, the open position with its Odeon link, the next LIT window and the weather, today's nearest levels with their
// distance in points and $ per MNQ). Text only through textContent (nothing from the feed is ever parsed as HTML).
import { litWindow, fmtDur, hm, dayLabel, sessionAt, killzoneAt, etParts } from './time.js';
import { kindOf, hex } from './glow.js';
import { filmLink } from './events.js';
import { heatOf, waitingOf, glossOf } from './heat.js';

const $ = (id) => document.getElementById(id);
const px = (p) => (p == null ? '–' : p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export function usd(v, sign = false) {
  if (v == null || !Number.isFinite(v)) return '–';
  const r = Math.round(Math.abs(v)), s = '$' + r.toLocaleString('en-US');
  return r === 0 ? '$0' : v < 0 ? '−' + s : sign ? '+' + s : s;
}
const nowT0 = () => Date.now() / 1000;
const pts = (d) => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(2);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class Hud {
  constructor() {
    this.world = null;
    this.levelsOpen = false;                       // calm by default: the ladder already names the nearest levels
    $('lv-toggle').addEventListener('click', () => {
      this.levelsOpen = !this.levelsOpen;
      $('levels').classList.toggle('closed', !this.levelsOpen);
      $('lv-toggle').setAttribute('aria-expanded', String(this.levelsOpen));
    });
  }

  /** The source chip: LIVE · 14 s / LAST SEEN 09:41 / SITE · 12 min / DEMO · replay. */
  mode(mode, w, extra = {}) {
    const m = $('mode');
    m.dataset.mode = mode;
    const txt = mode === 'live' ? `LIVE · ${w.age_s < 90 ? w.age_s + ' s' : Math.round(w.age_s / 60) + ' min'}`
      : mode === 'site' ? `CLOUD · ${Math.round(w.age_s / 60)} min`
      : mode === 'stale' ? `LAST SEEN ${dayLabel(w.t)} ${hm(w.t)}`
      : mode === 'demo' ? 'DEMO' : 'CONNECTING';
    m.querySelector('span').textContent = txt;
    $('replay').hidden = !(mode === 'stale' || (mode === 'demo' && extra.canLeave));
    $('replay').textContent = mode === 'demo' ? 'Back to live' : 'Replay a day';
    $('demo-bar').hidden = mode !== 'demo';
    $('demo-tag').textContent = `REPLAY · ${extra.day || ''}`;
  }

  render(w) {
    this.world = w;
    $('price').textContent = px(w.price);
    const p = $('pnl');
    p.textContent = usd(w.pnlNow, true);
    p.dataset.sign = w.pnlNow > 0 ? 'up' : w.pnlNow < 0 ? 'down' : 'flat';
    $('pnl-note').textContent = w.position ? `incl. open ${usd(w.position.usd, true)}` : '';
    // the stage
    $('stage-n').textContent = w.stage.n ? `${w.stage.n}/${w.stage.of}` : '–';
    $('stage-label').textContent = w.stage.label + (w.stage.dir ? (w.stage.dir > 0 ? ' · long' : ' · short') : '');
    $('waiting').textContent = w.stage.waiting || '';
    const gloss = glossOf(w.stage);
    $('stage-gloss').textContent = gloss;
    $('stage').title = gloss;                       // the same sentence as a tooltip on the whole headline
    this.renderWait(w, this.nowT ?? nowT0());
    // the weather
    const wx = $('wx');
    wx.replaceChildren(
      ...[w.vix && w.vix.vix != null ? `VIX ${w.vix.vix.toFixed(1)}` : null, w.atr != null ? `ATR ${w.atr.toFixed(1)}` : null,
        w.regime ? (w.regime.trend === 'up' ? 'Trend ↑' : w.regime.trend === 'down' ? 'Trend ↓' : 'Range') : null,
        w.regime && w.regime.vol !== 'normal' ? (w.regime.vol === 'high' ? 'High vol' : 'Quiet') : null]
        .filter(Boolean).map((t) => el('span', 'chip', t)));
    this.renderLevels(w);
    this.renderPosition(w);
  }

  /** The ribbon of the ten stages and the one thing the bot needs next (heat.js waitingOf). Rewritten only when it changes. */
  renderWait(w, nowT) {
    const box = $('wait');
    if (!box || !w) return;
    const r = waitingOf(w, litWindow(nowT, w.src !== 'demo' ? w.windows : null));
    const key = r.pips.map((p) => p.state[0]).join('') + '|' + r.next + '|' + r.detail + '|' + r.tone;
    if (key === this.waitKey) return;
    this.waitKey = key;
    box.dataset.tone = r.tone;
    const pips = box.querySelector('.pips');
    if (pips.children.length !== r.pips.length) pips.replaceChildren(...r.pips.map(() => el('li')));
    r.pips.forEach((p, i) => { const li = pips.children[i]; li.dataset.state = p.state; li.title = p.label; li.setAttribute('aria-label', `${p.label}: ${p.state}`); });
    box.querySelector('.nx').textContent = r.next;
    box.querySelector('.dt').textContent = r.detail;
  }

  renderLevels(w) {
    const up = w.levels.filter((l) => !l.taken && l.dist != null && l.dist > 0).sort((a, b) => a.dist - b.dist).slice(0, 3).reverse();
    const dn = w.levels.filter((l) => !l.taken && l.dist != null && l.dist < 0).sort((a, b) => b.dist - a.dist).slice(0, 3);
    const row = (l, far) => {
      const li = el('li', far ? 'lv far' : 'lv');
      li.dataset.id = l.id;
      li.dataset.dist = String(l.dist);
      li.dataset.usd = String(l.usd);
      const h = heatOf(l.dist, w.atr);
      li.dataset.heat = h.toFixed(2);
      li.style.setProperty('--heat', h.toFixed(2));
      const dot = el('i');
      dot.style.background = hex(kindOf(l.kind).color);
      li.append(dot, el('span', 'lv-name', l.label), el('span', 'lv-px', px(l.price)), el('span', 'lv-d', pts(l.dist)), el('span', 'lv-usd', usd(l.usd)));
      return li;
    };
    const now = el('li', 'lv now');
    now.append(el('i'), el('span', 'lv-name', 'Price'), el('span', 'lv-px', px(w.price)), el('span', 'lv-d', 'pts'), el('span', 'lv-usd', '/ MNQ'));
    const taken = w.levels.filter((l) => l.taken).length;
    $('lv-list').replaceChildren(...up.map((l, i) => row(l, i === 0 && up.length === 3)), now, ...dn.map((l, i) => row(l, i === 2)));
    $('lv-meta').textContent = `${w.levels.length - taken} open · ${taken} swept`;
  }

  renderPosition(w) {
    const p = w.position, box = $('pos');
    box.hidden = !p;
    if (!p) return;
    box.dataset.side = p.side.toLowerCase();
    const film = $('pos-film');
    film.hidden = !p.entry_t;
    if (p.entry_t) {
      const e = etParts(p.entry_t);
      film.href = filmLink(`${e.y}-${String(e.mo).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`, hm(p.entry_t), p.side);
    }
    $('pos-side').textContent = `${p.side} ${p.qty} @ ${px(p.entry)}`;
    $('pos-levels').textContent = `stop ${p.be ? 'BE ' : ''}${px(p.stop)} · tgt ${px(p.target)}`;
    const pm = $('pos-money');                                         // the money at stake, plain: if stopped / at target (MNQ $2 a point a micro)
    if (pm) {
      const q = p.qty || 0, up = (x, y) => (x == null || y == null || !q ? null : Math.round(Math.abs(x - y) * 2 * q));
      const lose = up(p.entry, p.stop), win = up(p.entry, p.target);
      pm.textContent = q && (lose != null || win != null) ? `${q} micro${q === 1 ? '' : 's'}` + (p.be ? ', stop at break-even' : lose != null ? ` · if stopped about -$${lose.toLocaleString('en-US')}` : '') + (win != null ? ` · at target about +$${win.toLocaleString('en-US')}` : '') : '';
    }
    const v = $('pos-pnl');
    v.textContent = usd(p.usd, true);
    $('pos-r').textContent = p.r == null ? '' : `${p.r >= 0 ? '+' : '−'}${Math.abs(p.r).toFixed(2)}R`;
    v.dataset.sign = (p.usd || 0) >= 0 ? 'up' : 'down';
  }

  /** Every second: the LIT window countdown and the session (they move even when the data does not). */
  tick(nowT) {
    const w = this.world, lw = litWindow(nowT, w && w.src !== 'demo' ? w.windows : null), s = sessionAt(nowT);
    const box = $('window');
    box.dataset.open = String(lw.open);
    $('win-text').textContent = lw.open_t == null ? 'No LIT window in the next days'
      : lw.open ? `LIT window open · closes in ${fmtDur(lw.in_s)}` : `Next LIT window in ${fmtDur(lw.in_s)} · ${dayLabel(lw.open_t)} ${hm(lw.open_t)} ET`;
    this.nowT = nowT;
    if (w) this.renderWait(w, nowT);
    $('session').textContent = `${s.label}${killzoneAt(nowT) ? ' killzone' : ''} · ${hm(nowT)} ET`;
  }

  /** The replay's clock and scrubber (left alone while the owner drags it). */
  demoProgress(t, span, dragging) {
    const txt = `${hm(t)} ET`;
    if ($('demo-time').textContent !== txt) $('demo-time').textContent = txt;
    if (!dragging) $('scrub').value = String(Math.round(Math.max(0, Math.min(1, (t - span.from) / Math.max(1, span.to - span.from))) * 1000));
  }

  playing(on) {
    const b = $('demo-play');
    b.dataset.playing = String(on);
    b.setAttribute('aria-label', on ? 'Pause the replay' : 'Play the replay');
  }

  /** The part of the screen the HUD leaves free (CSS px); the scene centres itself there (it may run a little under the glass). */
  freeRect() {
    const W = innerWidth, H = innerHeight, t = $('top').getBoundingClientRect(), d = $('dock').getBoundingClientRect();
    if (W > H && H <= 500) return { x0: t.right * 0.75, y0: 0, x1: d.left + (W - d.left) * 0.25, y1: H, ly0: 8, ly1: H - 8 };
    return { x0: 0, y0: t.bottom - 28, x1: W, y1: d.top + 16, ly0: t.bottom - 4, ly1: d.top - 6 };
  }

  quality(q) {
    const b = $('quality');
    b.textContent = q === 'high' ? 'HD' : 'LITE';
    b.setAttribute('aria-pressed', String(q === 'high'));
  }

  noGL() { $('nogl').hidden = false; }
}
