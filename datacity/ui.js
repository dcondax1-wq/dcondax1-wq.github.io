// The Data City's HUD: ONE top bar (name, market clock, chips, the sky / weather / quality / read switches) and ONE bottom
// sheet whose view changes (Top, Today, Watch, Find, Read, a building / strategy / LIT / ship / district card), the
// tour's caption, toasts. Every data string goes in as text (el()), never as HTML.
import { $, el, money, pct, num, signed, cssColor, CLASS_TEXT } from './util.js';
import { FAMILIES, IDEA_FAMILIES } from './kinds.js';
import { THEMES, themeOf } from './agora.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const NS = 'http://www.w3.org/2000/svg';
const SPAN_COLS = [['trades', (o) => o.n ?? '–'], ['/wk', (o) => num(o.tpw, 2)], ['win', (o) => pct(o.win)], ['PF', (o) => num(o.pf, 2)],
                   ['net', (o) => money(o.net)], ['$/mo', (o) => money(o.per_month)], ['2wk pass/fail', (o) => `${num(o.p10, 0)}/${num(o.f10, 0)}%`]];

// ------------------------------------------------------------------------------------------------ the sheet
let view = null;
export const sheet = {
  /** Show a view: title + a body builder (the body is rebuilt each time unless keep is true and it is already open). */
  open(name, title, build) {
    const s = $('#sheet'), body = $('#sheetBody');
    if (view && view !== name) sheet.onLeave?.(view, name);
    $('#sheetTitle').textContent = title;
    if (build) { body.replaceChildren(); build(body); body.scrollTop = 0; }
    s.dataset.view = name;
    if (name !== 'now') s.classList.remove('peek');   // olympus2: only the first Market-now peek is small
    s.classList.add('on');
    view = name;
    document.querySelectorAll('#dock [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  },
  close() {
    $('#sheet').classList.remove('on');
    if (view) sheet.onLeave?.(view, null);
    view = null;
    document.querySelectorAll('#dock [data-tab]').forEach((b) => b.classList.remove('on'));
    sheet.onClose?.();
  },
  get view() { return view; },
  isOpen(name) { return view === name; },
};

export function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), 2600);
}

export function caption(text, i, n, tag) {
  const c = $('#caption');
  if (!text) { c.classList.remove('on'); return; }
  c.replaceChildren(el('small', null, tag || `${i + 1} / ${n}`), el('span', null, text));
  c.classList.remove('on');
  void c.offsetWidth;                                     // restart the fade (once per shot, never per frame)
  c.classList.add('on');
}

// ------------------------------------------------------------------------------------------------ pieces
export const badge = (cls, text) => el('span', 'badge b-' + cls, text);

export function tile(grid, label, value) {
  const d = el('div');
  d.append(el('small', null, label), el('b', null, value));
  grid.appendChild(d);
}

export function spanTable(rows, cols) {
  const t = el('table'), head = el('tr');
  head.appendChild(el('th', null, ''));
  for (const [name] of cols) head.appendChild(el('th', null, name));
  t.appendChild(head);
  for (const [name, o] of rows) {
    const tr = el('tr');
    tr.appendChild(el('td', null, name));
    for (const [, f] of cols) tr.appendChild(el('td', null, f(o || {})));
    t.appendChild(tr);
  }
  const wrap = el('div', 'tablewrap');
  wrap.appendChild(t);
  return wrap;
}

export function svg(w, h, label) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`);
  s.setAttribute('class', 'spark');
  s.setAttribute('preserveAspectRatio', 'none');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', label);
  return s;
}

export function node(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/** A line sparkline (cumulative $, R by run); null when there is nothing to draw. */
export function sparkline(values, label = 'history', h = 56) {
  if (!values || values.length < 2) return null;
  const w = 300, lo = Math.min(0, ...values), hi = Math.max(0, ...values), range = (hi - lo) || 1;
  const y = (v) => h - 4 - ((v - lo) / range) * (h - 8);
  const s = svg(w, h, `${label}, ending ${values[values.length - 1]}`);
  s.style.height = h + 'px';
  s.append(node('line', { x1: 0, x2: w, y1: y(0), y2: y(0), stroke: 'rgba(255,255,255,.18)', 'stroke-dasharray': '3 3' }),
           node('polyline', { points: values.map((v, i) => `${(i / (values.length - 1)) * w},${y(v)}`).join(' '), fill: 'none',
                              stroke: values[values.length - 1] >= 0 ? (NEON ? '#39e59a' : '#9bab62') : (NEON ? '#ff6b7f' : '#d1904e'), 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
  return s;
}

/** Bars round a zero line: [[label, value]] (per year, or 2021-25 vs 2026). */
export function barline(pairs, label = 'per year', h = 56) {
  if (!pairs || !pairs.length) return null;
  const w = 300, top = Math.max(1, ...pairs.map(([, v]) => Math.abs(v || 0))), bw = w / pairs.length;
  const s = svg(w, h + 14, label);
  s.style.height = (h + 14) + 'px';
  s.appendChild(node('line', { x1: 0, x2: w, y1: h / 2, y2: h / 2, stroke: 'rgba(255,255,255,.18)' }));
  pairs.forEach(([k, v], i) => {
    const bh = (Math.abs(v || 0) / top) * (h / 2 - 3);
    s.appendChild(node('rect', { x: i * bw + bw * 0.2, width: bw * 0.6, y: v >= 0 ? h / 2 - bh : h / 2, height: Math.max(1, bh), rx: 2,
                                 fill: v >= 0 ? (NEON ? '#39e59a' : '#9bab62') : (NEON ? '#ff6b7f' : '#d1904e') }));
    const t = node('text', { x: i * bw + bw / 2, y: h + 11, 'text-anchor': 'middle', fill: '#aeb3c6', 'font-size': 10 });
    t.textContent = k;
    s.appendChild(t);
  });
  return s;
}

export function listRow(ul, key, color, title, sub, right, onClick, extra) {
  const li = el('li'), k = el('span', 'k', key), t = el('span', 't');
  k.style.background = color;
  t.appendChild(el('div', null, title));
  if (sub) t.appendChild(el('small', null, sub));
  li.append(k, t);
  if (extra) li.appendChild(extra);
  if (right !== undefined) li.appendChild(el('span', 'm ' + (String(right).startsWith('-') ? 'neg' : 'pos'), right));
  li.addEventListener('click', onClick);
  ul.appendChild(li);
  return li;
}

export function tags(row, list) { for (const [cls, text] of list) row.appendChild(badge(cls, text)); }

// ------------------------------------------------------------------------------------------------ cards
/** A combination (district building or discovery monument). ctx: { label, district, watched, onWatch, monument } */
export function showBuilding(b, ctx) {
  sheet.open('card', ctx.label, (body) => {
    const row = el('div', 'tags');
    const t = [[b.cls || 'grey', CLASS_TEXT[b.cls] || b.cls]];
    if (b.fdr) t.push(['fdr', 'passes FDR']);
    if (b.tr === 'rising' || b.tr === 'decaying') t.push([b.tr, b.tr]);
    if (b.td === 2) t.push(['today', 'fired last session']);
    else if (b.td === 1) t.push(['armed', 'armed last session']);
    if (ctx.monument) t.push(['fdr', 'discovery']);
    if (ctx.district) t.push(['thin', ctx.district]);
    tags(row, t);
    body.appendChild(row);
    const big = el('div', 'big');
    big.append(el('span', 'v ' + ((b.e || 0) >= 0 ? 'pos' : 'neg'), money(b.e)), el('span', 'u', 'per trade per MNQ micro, after $2.90 costs'));
    body.appendChild(big);
    const g = el('div', 'grid4');
    tile(g, 'win rate', pct(b.w)); tile(g, b.h2 !== undefined ? 'hit 2R' : 'trades', b.h2 !== undefined ? pct(b.h2) : String(b.n ?? '–'));
    tile(g, 'trades/week', num(b.tpw, 2)); tile(g, 'R/trade', signed(b.r));
    body.appendChild(g);
    if (b.h1 !== undefined) {
      const g2 = el('div', 'grid4');
      tile(g2, 'hit 1R', pct(b.h1)); tile(g2, 'hit 3R', pct(b.h3)); tile(g2, '30-min pts', num(b.f30, 1)); tile(g2, '60-min pts', num(b.f60, 1));
      body.appendChild(g2);
    }
    body.appendChild(spanTable([['2026', { e: b.e26, w: b.w26, n: b.n26, t: b.tpw26 }], ['2021-25', { e: b.eo, w: b.wo, n: b.no, t: b.tpwo }]],
      [['$/trade', (o) => money(o.e)], ['win', (o) => pct(o.w)], ['trades', (o) => o.n ?? '–'], ['/week', (o) => num(o.t, 2)]]));
    history(body, b);
    body.appendChild(el('div', 'note', b.text || `${b.stop ? `Median stop ${num(b.stop, 1)} pts · ` : ''}${b.n} trades · one trade a day at most.`));
    const act = el('div', 'actions');
    const w = el('button', 'pill' + (ctx.watched ? ' on' : ''), ctx.watched ? '★ Watching' : '☆ Watch');
    w.addEventListener('click', () => { const on = ctx.onWatch(); w.className = 'pill' + (on ? ' on' : ''); w.textContent = on ? '★ Watching' : '☆ Watch'; });
    act.appendChild(w);
    if (ctx.onCompare) {
      const c = el('button', 'pill' + (ctx.comparing ? ' on' : ''), ctx.comparing ? '⚖ Pick a second idea' : '⚖ Compare');
      c.id = 'cmpB';
      c.addEventListener('click', () => { const on = ctx.onCompare(); c.className = 'pill' + (on ? ' on' : ''); c.textContent = on ? '⚖ Pick a second idea' : '⚖ Compare'; });
      act.appendChild(c);
    }
    body.appendChild(act);
    body.appendChild(el('div', 'note', 'Paper only: the data city proposes, it never changes the bot.'));
  });
}

/** The history sparklines: quarter by quarter, every year, run by run, or (a compact building) 2021-25 vs 2026. */
function history(body, b) {
  const sp = sparkline(b.sp, 'cumulative $ per micro, quarter by quarter');
  if (sp) body.append(el('div', 'note', 'Cumulative $ per micro, quarter by quarter'), sp);
  if (b.yrs) {
    const bars = barline(Object.entries(b.yrs).map(([y, v]) => [y, v[1]]), '$ per trade, per year');
    if (bars) body.append(el('div', 'note', '$ per trade, per year (trades): ' + Object.entries(b.yrs).map(([y, v]) => `${y} ${v[0]}`).join(' · ')), bars);
  } else if (b.e26 !== undefined) {
    const bars = barline([['2021-25', b.eo], ['2026', b.e26]], '$ per trade: 2021-25 vs 2026');
    if (bars) body.append(el('div', 'note', '$ per trade: 2021-25 vs 2026'), bars);
  }
  if (b.hist && b.hist.length > 1) {
    const h = sparkline(b.hist.map((x) => x[1]), 'R per trade, run by run', 40);
    if (h) body.append(el('div', 'note', `R per trade, nightly run by run (${b.hist.length} runs)`), h);
  }
  if (b.plugin && b.sp) { const p = sparkline(b.sp, 'history'); if (p) body.append(p); }
}

export function showPlugin(b, sec, ctx) {
  sheet.open('card', b.lab, (body) => {
    const row = el('div', 'tags');
    tags(row, [[['gold', 'green', 'amber', 'grey'].includes(b.cls) ? b.cls : 'thin', sec?.name || b.d]]);
    body.appendChild(row);
    const big = el('div', 'big');
    big.append(el('span', 'v', num(b.value, 2)), el('span', 'u', b.unit || ''));
    body.appendChild(big);
    if (b.sp) { const s = sparkline(b.sp, 'history'); if (s) body.appendChild(s); }
    if (b.note) body.appendChild(el('div', 'note', b.note));
    const act = el('div', 'actions');
    const w = el('button', 'pill' + (ctx.watched ? ' on' : ''), ctx.watched ? '★ Watching' : '☆ Watch');
    w.addEventListener('click', () => { const on = ctx.onWatch(); w.className = 'pill' + (on ? ' on' : ''); w.textContent = on ? '★ Watching' : '☆ Watch'; });
    act.appendChild(w);
    body.append(act, el('div', 'note', `From the ${sec?.name || 'plug-in'} district (a data source plugged into the city). Paper only.`));
  });
}

export function showStrategy(s) {
  sheet.open('card', s.lab, (body) => {
    tags(body.appendChild(el('div', 'tags')), [['fdr', 'sized strategy']]);
    body.appendChild(el('div', 'note', '$500 at risk a trade, size follows the stop (1-40 micros), costs in, MFFU Builder 50K evals started every session.'));
    body.appendChild(spanTable([['2026', s.spans?.['2026']], ['2021-25', s.spans?.['2021-25']]], SPAN_COLS));
    if (s.oos_2025_26) {
      const o = s.oos_2025_26;
      body.appendChild(el('div', 'note', `Picked on 2021-24 only. 2025-26 (never seen): ${o.n} trades, ${signed(o.r, 3)} R a trade, ${money(o.net)} after costs.`));
    }
    if (s.member_text) {
      const ul = el('ul', 'list');
      for (const t of s.member_text) ul.appendChild(el('li', null, t));
      body.appendChild(ul);
    }
    body.appendChild(el('div', 'note', 'Paper only: never routed to an account.'));
  });
}

export function showLit(lit) {
  sheet.open('card', lit ? lit.title : 'LIT (Zlarior)', (body) => {
    tags(body.appendChild(el('div', 'tags')), [['fdr', 'live strategy']]);
    if (lit) {
      const rows = [['2026', lit.spans['2026']], ['2026 H2 (check)', lit.spans['2026 H2']], ['2021-25', lit.spans['2021-25']]].filter((r) => r[1]);
      body.append(spanTable(rows, SPAN_COLS), el('div', 'note', lit.note));
    } else body.appendChild(el('div', 'note', 'Run lit_live was not found.'));
  });
}

export function showShip(t) {
  sheet.open('card', `LIT trade · ${t.day}`, (body) => {
    tags(body.appendChild(el('div', 'tags')), [[t.pnl >= 0 ? 'green' : 'grey', t.pnl >= 0 ? 'won' : 'lost'], ['thin', t.dir > 0 ? 'long' : 'short']]);
    const big = el('div', 'big');
    big.append(el('span', 'v ' + (t.pnl >= 0 ? 'pos' : 'neg'), money(t.pnl)), el('span', 'u', `${signed(t.R)} R · exit ${t.exit || '–'}`));
    body.append(big, el('div', 'note', 'One ship of the Harbor: run lit_live, the live settings replayed with costs. Paper replay, not broker fills.'));
  });
}

/** A landmark's card: info = { name, kind, blurb, tiles: [[label, value]], lines: [text], go: { label, fn } } */
export function showLandmark(info) {
  sheet.open('card', info.name, (body) => {
    tags(body.appendChild(el('div', 'tags')), [['fdr', info.kind || 'landmark']]);
    if (info.blurb) body.appendChild(el('div', 'note', info.blurb));
    if (info.tiles?.length) { const g = el('div', 'grid4'); for (const [k, v] of info.tiles) tile(g, k, v); body.appendChild(g); }
    for (const l of info.lines || []) body.appendChild(el('div', 'note', l));
    if (info.go) { const a = el('div', 'actions'), b = el('button', 'pill', info.go.label); b.addEventListener('click', info.go.fn); a.appendChild(b); body.appendChild(a); }
  });
}

export function showDistrict(d, onTop) {
  sheet.open('district', d.name, (body) => {
    if (d.blurb) body.appendChild(el('div', 'note', d.blurb));
    const g = el('div', 'grid4');
    tile(g, 'buildings', (d.n || 0).toLocaleString());
    if (d.tried !== undefined) tile(g, 'tried', (d.tried || 0).toLocaleString());
    if (d.fdr !== undefined) tile(g, 'pass FDR', String(d.fdr ?? 0));
    if (d.gold !== undefined) tile(g, 'gold', String(d.gold ?? 0));
    body.appendChild(g);
    if (onTop) onTop(body);
  });
}

// ------------------------------------------------------------------------------------------------ the top bar
export function hud(model, demo) {
  const g = model.guard || {}, c = $('#chips');
  c.replaceChildren();
  const chip = (...parts) => {
    const s = el('span', 'chip');
    for (const [bold, text] of parts) s.appendChild(bold ? el('b', null, text) : document.createTextNode(text));
    c.appendChild(s);
    return s;
  };
  if (demo) c.appendChild(el('span', 'chip demo', 'DEMO CITY'));
  chip([1, (g.tried || 0).toLocaleString()], [0, ' tried']);
  chip([1, model.buildings.length.toLocaleString()], [0, ' buildings']);
  chip([1, String(g.fdr_pos ?? 0)], [0, ` pass FDR · placebo ${g.placebo_fdr ?? 0}`]);
  chip([0, 'data to '], [1, model.last_day || '–']);
  const leg = el('span', 'chip legend');
  for (const [cls, t] of [['gold', 'holds'], ['green', 'both'], ['amber', 'one'], ['grey', 'noise']]) {
    const i = el('i'); i.style.background = cssColor(cls);
    leg.append(i, document.createTextNode(t + ' '));
  }
  c.appendChild(leg);
}

// ------------------------------------------------------------------------------------------------ views
export function viewTop(body, model, open) {
  const ul = el('ul', 'list'), top = model.city.top10 || [];
  body.appendChild(el('div', 'note', 'Ranked by the weaker of 2026 and 2021-25. Gold = also positive in every year with 8+ trades and passes the noise guard.'));
  top.forEach((t, i) => listRow(ul, i + 1, cssColor(t.cls), t.lab, `${pct(t.w)} win · ${num(t.tpw, 2)}/wk${t.tr !== 'steady' ? ' · ' + t.tr : ''}`,
                                money(t.e), () => open(t.id)));
  if (!top.length) ul.appendChild(el('li', null, 'Nothing holds in both periods yet.'));
  body.appendChild(ul);
}

export function viewToday(body, model, open, layer) {
  const t = model.today;
  const sw = el('button', 'pill' + (layer.on ? ' on' : ''), layer.on ? '● Today layer on' : '○ Today layer off');
  sw.addEventListener('click', () => { const on = layer.toggle(); sw.className = 'pill' + (on ? ' on' : ''); sw.textContent = on ? '● Today layer on' : '○ Today layer off'; });
  body.appendChild(el('div', 'actions')).appendChild(sw);
  if (t) {
    body.appendChild(el('div', 'note', `Last session ${t.day}: ${(t.fired || 0).toLocaleString()} buildings fired (trigger and states true), ${(t.armed || 0).toLocaleString()} armed (day-level states true). ${t.note || ''}`));
    const st = el('div', 'tags');
    for (const v of Object.values(t.states || {})) st.appendChild(badge('thin', v));
    body.appendChild(st);
  }
  body.appendChild(el('h3', null, 'Discoveries'));
  const ul = el('ul', 'list');
  (model.discoveries || []).forEach((d, i) => listRow(ul, d.new ? 'N' : i + 1, cssColor(d.cls), d.text, d.tr !== 'steady' ? d.tr : '', undefined, () => open(d.id)));
  body.appendChild(ul);
  if ((model.city.today || []).length) {
    const fired = el('ul', 'list');
    model.city.today.forEach((x) => listRow(fired, '•', (NEON ? '#3fd8ff' : '#d39556'), x.lab, `entered ${x.at} ET · ${signed(x.R)} R`, money(x.pnl), () => open(x.id)));
    body.append(el('h3', null, `Top setups that fired on ${model.last_day}`), fired);
  }
}

export function viewWatch(body, list, open, remove) {
  body.appendChild(el('div', 'note', 'Pinned buildings (kept on this device). Tap ☆ Watch on any card to add one.'));
  const ul = el('ul', 'list');
  for (const { b, label } of list) {
    const spark = b.sp ? sparkline(b.sp.slice(-12), 'recent quarters', 22) : barline([['', b.eo], ['', b.e26]], 'then vs 2026', 18);
    if (spark) spark.classList.add('mini');
    const x = el('button', 'xs', '×');
    x.setAttribute('aria-label', 'Remove from the watchlist');
    x.addEventListener('click', (e) => { e.stopPropagation(); remove(b.id); });
    const li = listRow(ul, '★', cssColor(b.cls), label, `${pct(b.w)} win · ${num(b.tpw, 2)}/wk · ${b.n ?? '–'} trades`, money(b.e), () => open(b.id), spark);
    li.appendChild(x);
  }
  if (!list.length) ul.appendChild(el('li', null, 'Nothing pinned yet.'));
  body.appendChild(ul);
}

export function viewRead(body, model) {
  const g = model.guard || {};
  const p = (t) => body.appendChild(el('div', 'note', t));
  p('Every building is one combination: a time, a confluence (sweep, FVG, IFVG, CISD, displacement, VWAP, gap fill, news) and up to two "while" states. Each is a mini-backtest on CME NQ1! 5m bars: one trade a day, entry at the next bar, stop 1 tick beyond the structure, target 2R or the close after 2 hours, $1.90 commission + 2 ticks slippage per micro.');
  p('Height = $ per trade per micro. Gold = positive in 2026, in 2021-25 and in every year with 8+ trades AND passes the Benjamini-Hochberg false-discovery guard. Green = positive in both periods. Amber = one period only. Grey = noise or a loser. Lit windows = sample size. A pulsing roof = rising lately.');
  p(`Honesty: ${(g.tried || 0).toLocaleString()} combinations tried, ${(g.tested || 0).toLocaleString()} with 30+ trades, ${g.fdr_pos ?? '–'} pass the FDR guard (a shuffled-sign placebo passes ${g.placebo_fdr ?? '–'}). Picked on 2021-24 only, ${g.holdout?.picked_2021_24 ?? '–'} combinations; ${g.holdout?.pct_positive ?? '–'}% stayed positive in 2025-26. Most of the city is noise, and the city says so.`);
  p('The sky follows the futures clock (sunrise at the 18:00 ET Asia open, noon at the NY open, sunset at the 16:00 close, night in the break and the weekend). The weather is the VIX (CBOE close): clear under 15, haze to 20, rain to 25, a storm above.');
  p('Landmarks (Greek-futuristic, decor with the numbers on their cards): the Temple of the Gold on its acropolis (the gold buildings), the Forum round the plaza (the honesty guard), the Pharos lighthouse (LIT\'s trades), the Gate of Poseidon (its lantern is the VIX) and a gate at the start of every district. Light arcs are data streams: districts into LIT\'s tower, LIT into the Harbor; they run faster when the VIX is high and slow down when the futures market is closed. The towers beyond the districts are scenery. The cameras (ORBIT, SKIM, DRONE, GRAND) fly through it all; a drag takes the camera back.');
  p('Districts: ' + model.sections.map((s) => s.name).join(' · ') + '. The Harbor holds LIT\'s trades as ships. The middle tower is LIT (Zlarior), the live strategy. Paper only: nothing here changes the bot.');
  body.appendChild(el('h3', null, 'Building types: the idea family'));
  p('The shape of a building says which kind of idea it is. Height is still the money.');
  const ft = el('ul', 'list');
  for (const f of FAMILIES.filter((x) => IDEA_FAMILIES.includes(x))) {
    const li = el('li'), t = el('span', 't');
    t.appendChild(el('div', null, `${f.name}: ${f.look}`));
    t.appendChild(el('small', null, f.blurb));
    li.appendChild(t);
    ft.appendChild(li);
  }
  body.appendChild(ft);
  body.appendChild(el('h3', null, 'Windows tell the data'));
  p('Warm gold-white windows, mostly lit, steady: the idea makes money in 2021-25 AND in 2026 (gold ones also breathe: every year holds). Cool blue, half lit: one period only. A few dim pink windows that flicker: it holds in neither. The rest is how many trades stand behind it.');
  p('Moving things are decor, not data: the monorail loops the districts, flying taxis and cars follow the market\'s mood, cargo ships sail the Harbor (the moored ones are LIT\'s trades), the river reflects the sky and the city\'s glow, the signs are the district names, and fireworks mean a gold idea.');
  const lift = model.city.lift || [];
  if (!lift.length) return;
  body.appendChild(el('h3', null, 'What the city learned about confluences'));
  p('What one "while" state adds to the same trigger and window, in R per trade after costs (median over every base with 30+ trades). "Both" = share of bases where it helps in 2026 AND in 2021-25.');
  const top = Math.max(...lift.map((x) => Math.abs(x.med_r))) || 1, ul = el('ul', 'lift');
  for (const x of lift) {
    const li = el('li'), bar = el('span', 'lb'), fill = el('i', x.med_r >= 0 ? 'up' : 'dn');
    fill.style.width = `${Math.round((50 * Math.abs(x.med_r)) / top)}%`;
    bar.appendChild(fill);
    li.append(el('span', 'ln', x.lab), bar, el('span', 'lv ' + (x.med_r >= 0 ? 'pos' : 'neg'), `${signed(x.med_r)}R`), el('span', 'lp', `both ${Math.round(x.both_pct)}%`));
    ul.appendChild(li);
  }
  body.appendChild(ul);
}

/** The search view (built once, so the query survives switching views). Plain words ('NY afternoon', 'london short', 'sweep rising') plus
 *  filters: family, holds in both periods / in every year, $ per trade, trades a week. extra: { fly(), next(), reset() } */
export function viewFind(body, sections, onInput, extra = {}) {
  const q = el('input');
  Object.assign(q, { type: 'search', id: 'q', placeholder: "Try: sweep, NY afternoon, london short, rising", autocomplete: 'off' });
  q.setAttribute('enterkeyhint', 'search');
  const seg = el('div', 'seg'), dseg = el('div', 'seg'), fseg = el('div', 'seg'), hseg = el('div', 'seg');
  seg.id = 'seg'; dseg.id = 'dseg'; fseg.id = 'fseg'; hseg.id = 'hseg';
  const state = { cls: 'all', d: 'all', family: 'all', hold: 'any', minE: 0, minTpw: 0 };
  const mk = (box, key, pairs, first) => pairs.forEach(([k, t]) => {
    const b = el('button', k === first ? 'on' : '', t);
    b.dataset.v = k;
    b.addEventListener('click', () => { state[key] = k; box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onInput(q.value, state); });
    box.appendChild(b);
  });
  mk(seg, 'cls', [['all', 'All'], ['gold', 'Gold'], ['green', 'Both periods'], ['amber', 'One period'], ['grey', 'Noise']], 'all');
  mk(hseg, 'hold', [['any', 'Any'], ['both', 'Holds in 2021-25 and 2026'], ['gold', 'Holds in every year']], 'any');
  mk(fseg, 'family', [['all', 'Every family'], ...IDEA_FAMILIES.map((f) => [f.key, f.name])], 'all');
  mk(dseg, 'd', [['all', 'Every district'], ...sections.map((s) => [s.key, s.name])], 'all');
  q.addEventListener('input', () => onInput(q.value, state));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); q.blur(); extra.fly?.(); } });
  const slider = (label, key, max, step, fmt) => {
    const row = el('label', 'rng'), out = el('b', null, fmt(0)), r = el('input');
    Object.assign(r, { type: 'range', min: '0', max: String(max), step: String(step), value: '0' });
    r.setAttribute('aria-label', label);
    r.addEventListener('input', () => { state[key] = +r.value; out.textContent = fmt(+r.value); onInput(q.value, state); });
    row.append(el('span', null, label + ' '), out, r);
    row.reset = () => { r.value = '0'; out.textContent = fmt(0); };
    return row;
  };
  const sE = slider('At least $ per trade', 'minE', 60, 1, (v) => (v ? `+$${v}` : 'any')), sT = slider('At least trades a week', 'minTpw', 4, 0.1, (v) => (v ? v.toFixed(1) : 'any'));
  const act = el('div', 'actions');
  const fly = el('button', 'pill', 'Fly there'), nxt = el('button', 'pill', 'Next match ▶'), rst = el('button', 'pill', 'Reset');
  fly.id = 'flyB'; nxt.id = 'nextB'; rst.id = 'resetB';
  fly.addEventListener('click', () => extra.fly?.());
  nxt.addEventListener('click', () => extra.next?.());
  rst.addEventListener('click', () => {
    Object.assign(state, { cls: 'all', d: 'all', family: 'all', hold: 'any', minE: 0, minTpw: 0 }); q.value = '';
    for (const [box, first] of [[seg, 'all'], [dseg, 'all'], [fseg, 'all'], [hseg, 'any']]) box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === first));
    sE.reset(); sT.reset(); onInput('', state); extra.reset?.();
  });
  const dst = el('button', 'pill', 'Districts');
  dst.id = 'districtsB';
  dst.addEventListener('click', () => extra.districts?.());
  act.append(fly, nxt, rst, dst);
  body.append(q, act, el('div', 'note', 'Plain words work: a time (morning, afternoon, london, asia), a side (long, short), a kind (sweep, fvg, break), a mood (wild, quiet, rising).'),
              seg, hseg, fseg, dseg, sE, sT, Object.assign(el('ul', 'list'), { id: 'findList' }));
  return { q, state };
}

/** The search list (the 30 best matches); open(it) beams onto the building. */
export function fillFound(hits, label, open, total) {
  const ul = $('#findList');
  if (!ul) return;
  ul.replaceChildren();
  if (total > 0) ul.appendChild(el('li', 'count', `${total.toLocaleString()} buildings match`));
  for (const it of hits.slice(0, 30)) {
    listRow(ul, '', cssColor(it.b.cls), label(it.b), `${pct(it.b.w)} win · ${num(it.b.tpw, 2)}/wk · ${it.b.n ?? '–'} trades`, money(it.b.e), () => open(it));
  }
  if (!hits.length) ul.appendChild(el('li', null, 'No building matches.'));
}

// ------------------------------------------------------------------------------------------------ the district index (v4, AGORA)
/** The index of every district, filed by theme (hour, setup, weekday, month, mood) with a search box and a legend; tap a row to fly there.
 *  districts: layout districts ({ key, name, blurb, css }); sections: the model's sections (their buildings give the counts). */
export function viewDistricts(body, districts, sections, open) {
  const q = el('input');
  Object.assign(q, { type: 'search', id: 'dq', placeholder: 'Find a district: week, hour, month, gap...', autocomplete: 'off' });
  q.setAttribute('enterkeyhint', 'search');
  const legend = el('div', 'note legend-key');
  for (const [cls, t] of [['gold', 'gold: holds in every year'], ['green', 'olive: holds in both periods'], ['amber', 'bronze: one period'], ['grey', 'stone: noise']]) {
    const i = el('i');
    Object.assign(i.style, { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', margin: '0 4px 0 8px', background: cssColor(cls) });
    legend.append(i, document.createTextNode(t));
  }
  const bySec = new Map(sections.map((s) => [s.key, s]));
  const ul = el('ul', 'list');
  ul.id = 'districtList';
  const fill = (text) => {
    const w = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
    ul.replaceChildren();
    let shown = 0;
    for (const th of [...THEMES, { key: 'other', name: 'Other', blurb: 'Added districts' }]) {
      const rows = districts.filter((d) => d.key !== 'harbor' && themeOf(d.key).key === th.key
        && w.every((x) => `${d.name} ${d.blurb || ''} ${th.name}`.toLowerCase().includes(x)));
      if (!rows.length) continue;
      ul.appendChild(el('li', 'count', th.name + (th.blurb ? ' · ' + th.blurb : '')));
      for (const d of rows) {
        const items = bySec.get(d.key)?.items || [];
        const gold = items.filter((b) => b.cls === 'gold').length, both = items.filter((b) => b.cls === 'green').length;
        listRow(ul, '', d.css || '#c8a24a', d.name, `${items.length.toLocaleString()} buildings · ${gold} hold in every year · ${both} in both periods`, undefined, () => open(d));
        shown++;
      }
    }
    if (!shown) ul.appendChild(el('li', null, 'No district matches.'));
  };
  q.addEventListener('input', () => fill(q.value));
  fill('');
  body.append(q, legend, ul);
  return { q, fill };
}
