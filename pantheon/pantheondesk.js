// PANTHEON desk (2026-11-04): the "so what for my day" layer over pantheon.json, in plain words. Read-only context: nothing here changes a strategy or
// places anything. Pure functions (no DOM, no clock of their own: `now` comes in) plus one small DOM builder.
//   eventRisk(d, now)    the macro events still ahead, each flagged inside / outside the bots' trading window (02:00-15:30 ET), with a countdown
//   watchlist(d, watch, lastLeans)   the gods this phone follows, their lean now, and who changed their mind since the last visit
//   edgeMeter(d)         how much the Council's reading has mattered for NQ: the correlation against the noise band the sample size allows
//   freshness(d, now)    how old each source's newest reading is against what it should be, and the build age
//   deskLine(d, now, watch) one plain sentence for the clipboard or Jarvis
//   renderDesk(root, d, o)   the four sections + Copy into a card
import { esc, VERDICT } from './pantheoncore.js';

export const WINDOW = [2 * 60, 15 * 60 + 30];          // the bots' entry window, minutes of the New York day (CLAUDE.md: entries 02:00-15:30)
export const WATCH_KEY = 'pantheon.watch', LEANS_KEY = 'pantheon.leans';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** the New York wall clock of an instant: { ymd, min } */
export function etClock(ms) {
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { ymd: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, y: +p.year };
  } catch (_) { const d = new Date(ms); return { ymd: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), y: d.getUTCFullYear() }; }
}
const addDay = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** 'Wed Nov 04 08:15' / 'Wed Nov 04, 08:15 ET' -> { ymd, min } in the year of `y` (the calendar is a rolling year) */
export function parseWhen(s, y) {
  const m = /([A-Z][a-z]{2})\s+([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})/.exec(String(s || ''));
  if (!m || MON[m[2]] == null) return null;
  return { ymd: `${y}-${String(MON[m[2]] + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`, min: +m[4] * 60 + +m[5], wd: m[1] };
}
const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const left = (mins) => (mins < 60 ? `${Math.max(1, Math.round(mins))} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`);

export function eventRisk(d, now) {
  const ath = (d.gods || []).find((g) => g.key === 'athena'), up = ath && ath.extra && Array.isArray(ath.extra.upcoming) ? ath.extra.upcoming : [];
  const c = etClock(now), out = [];
  for (const e of up) {
    const w = parseWhen(e.when, c.y); if (!w) continue;
    const dayDiff = Math.round((Date.parse(w.ymd + 'T12:00:00Z') - Date.parse(c.ymd + 'T12:00:00Z')) / 864e5);
    const mins = dayDiff * 1440 + (w.min - c.min);
    if (mins < -30) continue;                                                      // already over
    const inside = w.min >= WINDOW[0] && w.min <= WINDOW[1];
    out.push({ event: String(e.event || '').slice(0, 80), ymd: w.ymd, time: hm(w.min), when: `${w.wd || ''} ${hm(w.min)} ET`.trim(), mins, inside, today: dayDiff === 0, tomorrow: dayDiff === 1, left: mins <= 0 ? 'now' : left(mins) });
  }
  out.sort((a, b) => a.mins - b.mins);
  const today = out.filter((x) => x.today), todayIn = today.filter((x) => x.inside);
  const line = !out.length ? 'No macro events are listed ahead.' : todayIn.length ? `${todayIn.length} event${todayIn.length === 1 ? '' : 's'} today inside the trading window: ${todayIn.map((x) => `${x.event} at ${x.time}`).join(', ')}. Expect a wider range; the LIT bot's news rules apply.`
    : today.length ? `${today.length} event${today.length === 1 ? '' : 's'} today, outside the 02:00-15:30 trading window.` : `Nothing today. Next: ${out[0].event}, ${out[0].tomorrow ? 'tomorrow' : out[0].when}, in ${out[0].left}.`;
  return { events: out.slice(0, 6), today, todayIn, line, level: todayIn.length ? 'warn' : 'ok' };
}

export function watchlist(d, watch, lastLeans) {
  const keys = new Set(Array.isArray(watch) ? watch : []), last = lastLeans && typeof lastLeans === 'object' ? lastLeans : {};
  const rows = (d.gods || []).map((g) => ({ key: g.key, name: g.name, title: g.title, color: g.color, lean: g.lean || 'neutral', vote: fin(g.vote) ? g.vote : null, reading: g.reading && g.reading.text || '', followed: keys.has(g.key),
    flipped: keys.has(g.key) && last[g.key] != null && last[g.key] !== (g.lean || 'neutral'), was: last[g.key] || null }));
  const f = rows.filter((r) => r.followed);
  return { rows, followed: f, flips: f.filter((r) => r.flipped),
    line: !f.length ? 'You follow no gods yet: tap Follow on the ones you care about.' : f.some((r) => r.flipped) ? 'Changed their mind: ' + f.filter((r) => r.flipped).map((r) => `${r.name} ${r.was} to ${r.lean}`).join(', ') + '.' : 'Following: ' + f.map((r) => `${r.name} ${r.lean}`).join(', ') + '. No change since your last visit.' };
}
/** MONEY: what a normal day costs. The VIX (ARES) is the market's own one-day move guess: VIX / sqrt(252) per cent of the NQ level, one standard day.
 *  `level` is the NQ price (typed by the owner; the default is the last close in the repo data). Event days run wider by ATHENA's 2026 ratio. */
export const NQ_LEVEL = 29400;
export function dayMove(d, level, evToday) {
  const ares = (d.gods || []).find((g) => g.key === 'ares'), vix = ares && ares.ok && ares.reading && fin(ares.reading.value) ? ares.reading.value : null;
  const L = fin(level) && level > 1000 ? level : NQ_LEVEL;
  const ath = (d.gods || []).find((g) => g.key === 'athena'), per = ath && ath.stats && Array.isArray(ath.stats.periods) ? ath.stats.periods.find((p) => p.period === '2026') : null;
  const ratio = per && fin(per.ratio) ? per.ratio : 1.3;
  if (vix == null) return { vix: null, level: L, pts: null, mnq: null, nq: null, ratio, line: 'No VIX reading in this build, so no dollar estimate for a normal day yet.' };
  const pct = vix / Math.sqrt(252), pts = L * pct / 100, mnq = pts * 2, nq = pts * 20;
  const r = (x) => Math.round(x);
  return { vix, level: L, pct, pts, mnq, nq, ratio, wide: pts * 2, evPts: pts * ratio,
    line: `A normal day (VIX ${vix}) moves NQ about ${r(pts)} points: ${r(mnq).toLocaleString('en-US')} dollars per micro, ${r(nq).toLocaleString('en-US')} dollars per full NQ.` + (evToday ? ` An event day runs about ${ratio.toFixed(1)}x wider: ${r(pts * ratio)} points, ${r(mnq * ratio).toLocaleString('en-US')} dollars per micro.` : '') };
}

export const leansOf = (d) => Object.fromEntries((d.gods || []).map((g) => [g.key, g.lean || 'neutral']));

export function edgeMeter(d) {
  const ps = d.council && d.council.stats && Array.isArray(d.council.stats.periods) ? d.council.stats.periods : [];
  const rows = ps.filter((p) => fin(p.corr) && fin(p.n) && p.n > 3).map((p) => {
    const band = 1.96 / Math.sqrt(p.n), hitBand = fin(p.chance) ? 1.96 * Math.sqrt(0.25 / Math.max(1, p.calls || p.n)) * 100 : null;
    return { period: p.period, n: p.n, corr: p.corr, band, inside: Math.abs(p.corr) <= band, hit: p.hit, chance: p.chance, calls: p.calls, hitBand, hitInside: hitBand != null && fin(p.hit) ? Math.abs(p.hit - p.chance) <= hitBand : null,
      avgOn: p.avg_on, avgOff: p.avg_off, nOn: p.n_on, nOff: p.n_off };
  });
  const all = rows.length > 0 && rows.every((r) => r.inside);
  return { rows, noise: all, line: !rows.length ? 'No history of the Council against NQ yet.' : all ? 'The Council has not beaten a coin toss on NQ: every reading is inside the noise the sample size allows. Use it as context, never as a reason to trade.'
    : 'At least one period stands out of the noise, but a hint from past data is not a signal: it never changes the bots.' };
}

export function freshness(d, now) {
  const built = d.t ? now / 1000 - d.t : null;
  const rows = (d.gods || []).map((g) => {
    const days = g.asof ? Math.max(0, Math.round((Date.parse(etClock(now).ymd + 'T12:00:00Z') - Date.parse(String(g.asof).slice(0, 10) + 'T12:00:00Z')) / 864e5)) : null, lag = fin(g.lag_days) ? g.lag_days : 1;
    const level = !g.ok ? 'bad' : days == null ? 'warn' : days > lag + 3 ? 'bad' : days > lag + 1 ? 'warn' : 'ok';
    return { key: g.key, name: g.name, color: g.color, days, lag, level, asof: g.asof || '' };
  });
  const bad = rows.filter((r) => r.level !== 'ok'), errs = (d.sources || []).filter((s) => s && s.error).length;
  return { rows, built, builtLabel: built == null ? '' : built < 5400 ? 'under 2 hours ago' : built < 172800 ? `${Math.round(built / 3600)} hours ago` : `${Math.round(built / 86400)} days ago`, errors: errs,
    line: !bad.length ? 'Every source is as fresh as it can be (markets publish with a delay of a day or more).' : `${bad.length} source${bad.length === 1 ? ' is' : 's are'} older than usual: ${bad.slice(0, 3).map((r) => r.name).join(', ')}.` };
}

export function deskLine(d, now, watch) {
  const c = d.council || {}, er = eventRisk(d, now), wl = watchlist(d, watch, null);
  const bits = [`Council ${c.label || '–'}${fin(c.gauge) ? ' ' + c.gauge + '/100' : ''}`];
  if (er.todayIn.length) bits.push(`${er.todayIn.length} event${er.todayIn.length === 1 ? '' : 's'} inside the trading window today (${er.todayIn[0].event} ${er.todayIn[0].when})`);
  else if (er.events[0]) bits.push(`next event ${er.events[0].event} ${er.events[0].when}`);
  if (wl.followed.length) bits.push('following ' + wl.followed.map((r) => `${r.name} ${r.lean}`).join(', '));
  return 'Pantheon: ' + bits.join(' · ') + ' · context, not a signal';
}

// ------------------------------------------------------------------------------------------------ the card
const H = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
let LAST = null;
export function renderDesk(root, d, o = {}) {
  const now = o.now ? o.now() : Date.now(), store = o.storage || null;
  const rd = (k) => { try { return JSON.parse(store.getItem(k) || 'null'); } catch (_) { return null; } };
  const wr = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch (_) { /* not kept */ } };
  let watch = rd(WATCH_KEY) || [];
  if (!LAST) { LAST = rd(LEANS_KEY) || {}; wr(LEANS_KEY, leansOf(d)); }          // this visit's leans are kept for the NEXT visit; flips are shown against the last one
  const last = LAST;
  root.replaceChildren();
  // ---- what a normal day costs (money first)
  const cap = (t) => H('h3', '', t), s0 = H('section', 'plus'), er0 = eventRisk(d, now);
  const lvKey = 'pantheon.level'; let lv = rd(lvKey); if (!fin(lv)) lv = NQ_LEVEL;
  const costBox = H('div', 'cost'), paintCost = () => {
    const m = dayMove(d, lv, er0.todayIn.length > 0); costBox.replaceChildren();
    costBox.append(H('p', 'dline ' + (er0.todayIn.length ? 'warn' : 'ok'), m.line));
    if (m.pts != null) {
      const t = H('table'); t.setAttribute('aria-label', 'Dollars for a normal day');
      t.innerHTML = '<thead><tr><th>Size</th><th>Normal day</th><th>Wide day (2x)</th></tr></thead>';
      const tb = H('tbody'); [['1 micro', 1], ['3 micros', 3], ['5 micros', 5], ['1 full NQ', 10]].forEach(([n, k]) => { const tr = H('tr'); tr.append(H('td', '', n), H('td', '', '±$' + Math.round(m.mnq * k).toLocaleString('en-US')), H('td', '', '±$' + Math.round(m.mnq * 2 * k).toLocaleString('en-US'))); tb.append(tr); });
      t.append(tb); costBox.append(t);
    }
  };
  const lvIn = H('input'); lvIn.type = 'number'; lvIn.inputMode = 'numeric'; lvIn.min = '1000'; lvIn.step = '50'; lvIn.value = String(lv); lvIn.id = 'dk-level'; lvIn.setAttribute('aria-label', 'NQ level');
  lvIn.addEventListener('change', () => { const v = parseFloat(lvIn.value); if (fin(v) && v > 1000) { lv = v; wr(lvKey, v); paintCost(); } });
  const lvRow = H('label', 'lvrow'); lvRow.append(H('span', '', 'NQ level'), lvIn);
  s0.append(cap('What a normal day costs'), costBox, lvRow, H('p', 'note', 'One typical day from the VIX, in dollars for the size you trade. Context for sizing, never a signal. Type today\'s NQ level to sharpen it.'));
  paintCost();
  // ---- event risk
  const er = eventRisk(d, now), s1 = H('section', 'plus');
  s1.append(cap('Event risk against your trading window'), H('p', 'dline ' + er.level, er.line));
  const ul = H('ul', 'evs');
  er.events.forEach((e) => { const li = H('li', e.inside ? 'in' : 'out'); li.append(H('b', '', e.event), H('span', '', `${e.today ? 'today' : e.tomorrow ? 'tomorrow' : e.when.split(' ')[0]} ${e.when.split(' ').slice(-2).join(' ')}`), H('small', '', `${e.inside ? 'inside' : 'outside'} 02:00-15:30 · ${e.left === 'now' ? 'now' : 'in ' + e.left}`)); ul.append(li); });
  if (!er.events.length) ul.append(H('li', 'out', 'No macro events listed ahead.'));
  s1.append(ul, H('p', 'note', 'Inside the window the market can move faster on the release; the bots already have news rules. This is context, never an order.'));
  // ---- my gods
  const wl = () => watchlist(d, watch, last), s2 = H('section', 'plus'), box = H('div', 'wl');
  const paint = () => {
    const w = wl(); box.replaceChildren(H('p', 'dline' + (w.flips.length ? ' warn' : ''), w.line));
    const g = H('ul', 'gl');
    w.rows.forEach((r) => {
      const li = H('li', r.followed ? 'on' : ''); li.style.setProperty('--c', r.color);
      const b = H('button', 'act fol', r.followed ? 'Following' : 'Follow'); b.type = 'button'; b.setAttribute('aria-pressed', String(r.followed)); b.setAttribute('aria-label', (r.followed ? 'Stop following ' : 'Follow ') + r.name); b.dataset.god = r.key;
      b.addEventListener('click', () => { watch = r.followed ? watch.filter((k) => k !== r.key) : watch.concat([r.key]); wr(WATCH_KEY, watch); paint(); });
      const t = H('span', 'gt'); t.append(H('b', '', r.name), H('small', '', `${r.lean}${r.vote != null ? ' ' + (r.vote >= 0 ? '+' : '') + r.vote.toFixed(2) : ''} · ${r.reading}`));
      li.append(t, b); g.append(li);
    });
    box.append(g);
  };
  s2.append(cap('My gods'), box); paint();
  // ---- edge meter
  const em = edgeMeter(d), s3 = H('section', 'plus');
  s3.append(cap('Has the Council mattered for NQ?'), H('p', 'dline ' + (em.noise ? 'ok' : 'warn'), em.line));
  em.rows.forEach((r) => {
    const sc = Math.max(0.12, r.band * 1.6, Math.abs(r.corr) * 1.2), X = (v) => 50 + (v / sc) * 46;
    const row = H('div', 'meter'); row.append(H('b', '', `${r.period}: ${r.n} market days compared`));
    const bar = H('div', 'mbar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `Correlation ${r.corr.toFixed(3)} against a noise band of plus or minus ${r.band.toFixed(3)}`);
    const nb = H('i', 'noise'); nb.style.left = X(-r.band) + '%'; nb.style.width = (X(r.band) - X(-r.band)) + '%';
    const dot = H('i', 'dot ' + (r.inside ? 'in' : 'out')); dot.style.left = X(r.corr) + '%'; bar.append(nb, dot);
    row.append(bar, H('small', '', `Correlation ${r.corr >= 0 ? '+' : ''}${r.corr.toFixed(3)} (noise band ±${r.band.toFixed(3)}): ${r.inside ? 'inside the noise' : 'outside the noise'}. Hit rate ${r.hit}% vs ${r.chance}% by chance.` +
      (fin(r.avgOn) && fin(r.avgOff) ? ` After risk-on days NQ moved ${r.avgOn >= 0 ? '+' : ''}${r.avgOn}% on average (${r.nOn} days), after risk-off ${r.avgOff >= 0 ? '+' : ''}${r.avgOff}% (${r.nOff}).` : '')));
    s3.append(row);
  });
  // ---- freshness
  const fr = freshness(d, now), s4 = H('section', 'plus');
  s4.append(cap('How fresh is the data?'), H('p', 'dline ' + (fr.rows.every((r) => r.level === 'ok') ? 'ok' : 'warn'), fr.line + (fr.builtLabel ? ` Built ${fr.builtLabel}.` : '')));
  const fl = H('ul', 'fr');
  fr.rows.forEach((r) => { const li = H('li', r.level); li.style.setProperty('--c', r.color); li.append(H('b', '', r.name), H('span', '', r.days == null ? 'no date' : r.days === 0 ? 'today' : r.days + ' d old'), H('small', '', `normal delay ${r.lag} d`)); fl.append(li); });
  s4.append(fl);
  // ---- copy
  const s5 = H('section', 'plus'), cp = H('button', 'act', 'Copy my desk line'); cp.type = 'button'; cp.id = 'dk-copy';
  const msg = H('p', 'note'); msg.id = 'dk-msg'; msg.setAttribute('role', 'status');
  cp.addEventListener('click', async () => { const line = deskLine(d, o.now ? o.now() : Date.now(), watch); msg.dataset.line = line; try { await navigator.clipboard.writeText(line); msg.textContent = 'Copied: ' + line; } catch (_) { msg.textContent = 'Could not copy here: ' + line; } });
  s5.append(cp, msg);
  root.append(s0, s1, s2, s3, s4, s5);
  return { watch: () => watch.slice() };
}
