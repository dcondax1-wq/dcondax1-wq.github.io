// PHEME core (ES module, no DOM, no network): the word on the street. Scheduled releases for today and the next two weeks, each with a plain "why it matters for NQ" and what the bots do, and a history card per kind of release
// ("the last 8 CPI days: how far NQ travelled, in points and in dollars for one MNQ micro, n shown"). The numbers come from stats.json, built offline by tools/pheme_build.py from the repo's saved calendar and the 5m NQ file.
// HISTORY ONLY: no prediction, no forecast, no trade signal; a range is how far the price travelled, not a profit or a loss. Pure, so the tests call it in node.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
export const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 120);
const YMD = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TRACKED = ['cpi', 'nfp', 'ppi', 'fomc'];
export const SHORT = { cpi: 'CPI', nfp: 'Jobs', ppi: 'PPI', fomc: 'FOMC' };
export const KINDS = ['cpi', 'nfp', 'ppi', 'fomc', 'claims', 'minutes', 'pce', 'gdp', 'ism', 'jolts', 'adp', 'other'];
export const USD_PER_POINT = 2;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const RULES = { entryFrom: '2:00 AM', entryTo: '3:30 PM', flat: '3:55 PM' };
export const MIN_N = 8;

// ------------------------------------------------------------------------------------------------ money and dates
export const usd = (x) => { const v = num(x); return v == null ? '$0' : (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US'); };
export const pts = (x) => { const v = num(x); return v == null ? 'n/a' : (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 }); };
export const perMicro = (p) => { const v = num(p); return v == null ? null : Math.round(v * USD_PER_POINT); };
const ms = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
export const ymdOf = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
export const addDays = (ymd, n) => ymdOf(ms(ymd) + n * 86400000);
export const dowOf = (ymd) => (new Date(ms(ymd)).getUTCDay() + 6) % 7;
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
export const dayWord = (ymd) => `${WEEKDAYS[dowOf(ymd)]} ${MONTHS[+ymd.slice(5, 7) - 1].slice(0, 3)} ${+ymd.slice(8, 10)}`;
export const dayLong = (ymd) => `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dowOf(ymd)]}, ${MONTHS[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
/** the New York calendar day of an epoch second */
export function etDay(tSec) {
  const t = num(tSec); if (!t) return null;
  try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; } catch (_) { return ymdOf(t * 1000); }
}
export const hmWord = (hm) => { if (!HM.test(hm || '')) return ''; const h = +hm.slice(0, 2), m = hm.slice(3); return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'} ET`; };

// ------------------------------------------------------------------------------------------------ plain words
export const WHY = {
  cpi: 'Consumer prices. Inflation steers what the Fed does with interest rates, and NQ is full of growth stocks that react to rates, so a surprise can move it within minutes.',
  nfp: 'The monthly jobs count. It shows how hot or cool the economy is, so it changes bets on interest rates. Usually one of the biggest scheduled moves of the month.',
  ppi: 'Prices paid by producers: a smaller cousin of CPI. It can nudge rate bets, usually less than CPI does.',
  fomc: 'The Fed\'s interest-rate decision (2:00 PM ET) and its press conference (2:30 PM ET). Rate news hits growth stocks directly, and the move often carries on after the press conference.',
  claims: 'The weekly count of new unemployment claims: a small, regular read on the job market.',
  minutes: 'Notes from the last Fed meeting. They can shift rate bets, though the decision itself is already known.',
  pce: 'The Fed\'s favourite inflation gauge, so it matters for rate bets.',
  gdp: 'How fast the economy grew: the big-picture growth number.',
  ism: 'A survey of purchasing managers: an early read on how business is doing.',
  jolts: 'Job openings: shows how tight the job market is.',
  adp: 'A private payrolls count, a preview of the official jobs report.',
  other: 'A scheduled release. Its usual effect on NQ is smaller.',
};
const FRAME = `LIT has no news pause of its own: it trades by its normal rules (entries ${RULES.entryFrom} to ${RULES.entryTo} ET, flat at ${RULES.flat} ET, one trade a day, the stop beyond the sweep and size following the stop). The old shadow engine does pause new entries from 15 minutes before to 30 minutes after big releases; LIT does not.`;
export function botWords(e) { return e && e.kind === 'fomc' ? FRAME + ' On Fed days the shadow engine also stops after 1:00 PM ET.' : FRAME; }
export const IMPACT_WORD = { high: 'High', med: 'Medium', low: 'Low' };
export const IMPACT_CLS = { high: 'bad', med: 'warn', low: 'ok' };
export const LABEL = 'History, not a forecast: how far NQ travelled on past release days. A range is not a profit or a loss, and the next one can be bigger or smaller.';

// ------------------------------------------------------------------------------------------------ the file
function cleanSum(s) { return isObj(s) ? { n: Math.max(0, Math.round(num(s.n) || 0)), avg: num(s.avg), median: num(s.median) } : { n: 0, avg: null, median: null }; }
function cleanKind(k, key) {
  if (!isObj(k)) return null;
  const rows = (Array.isArray(k.rows) ? k.rows : []).filter(isObj).map((r) => ({ date: YMD.test(String(r.date)) ? r.date : '', time: HM.test(String(r.time)) ? r.time : '', day: num(r.day_range), win: num(r.window_range) })).filter((r) => r.date && r.day != null && r.win != null).slice(0, 12);
  const all = isObj(k.all) ? k.all : {}, last = isObj(k.last) ? k.last : {};
  return { key, label: str(k.label, 60) || key.toUpperCase(), time: HM.test(String(k.time)) ? k.time : '', listed: Math.round(num(k.n_listed) || 0), withData: Math.round(num(k.n_with_data) || 0),
    all: { day: cleanSum(all.day), win: cleanSum(all.window) }, last: { day: cleanSum(last.day), win: cleanSum(last.window) }, rows };
}
/** stats.json (tools/pheme_build.py) -> a view, or null when it is not a stats file */
export function normStats(j) {
  if (!isObj(j) || !isObj(j.kinds) || !isObj(j.baseline)) return null;
  const kinds = {}; for (const k of TRACKED) { const c = cleanKind(j.kinds[k], k); if (c) kinds[k] = c; }
  if (!Object.keys(kinds).length) return null;
  const b = j.baseline, events = (Array.isArray(j.events) ? j.events : []).filter(isObj).filter((e) => YMD.test(String(e.date)) && str(e.title, 80)).map((e) => ({ date: e.date, time: HM.test(String(e.time)) ? e.time : '', title: str(e.title, 80), kind: KINDS.includes(e.kind) ? e.kind : 'other', impact: ['high', 'med', 'low'].includes(e.impact) ? e.impact : 'low', source: str(e.source, 40) }))
    .sort((a, c) => (a.date + a.time < c.date + c.time ? -1 : 1)).slice(0, 400);
  const bw = isObj(b.window) ? b.window : {};
  return { demo: j.demo === true, built: YMD.test(String(j.built)) ? j.built : '', lastBar: YMD.test(String(j.last_bar_day)) ? j.last_bar_day : '', calLast: YMD.test(String(j.calendar_last_date)) ? j.calendar_last_date : '', kinds, events,
    base: { days: Math.round(num(b.days) || 0), day: cleanSum(b.day), win: Object.fromEntries(Object.keys(bw).filter((t) => HM.test(t)).map((t) => [t, cleanSum(bw[t])])) }, label: str(j.label, 200) || LABEL };
}
/** the stats to show: the built file, else the labelled demo */
export function chooseData(real, fixture) {
  const r = normStats(real); if (r) return { src: r.demo ? 'demo' : 'file', v: r, demo: r.demo };
  const f = normStats(fixture); return f ? { src: 'demo', v: { ...f, demo: true }, demo: true } : null;
}

// ------------------------------------------------------------------------------------------------ the schedule
/** events on one day */
export const eventsOn = (v, ymd) => v.events.filter((e) => e.date === ymd);
/** [{ ymd, word, events }] for `days` days from `from` (only days with at least one event when `onlyBusy`) */
export function schedule(v, from, days, onlyBusy) {
  const out = []; for (let i = 0; i < (days || 14); i++) { const ymd = addDays(from, i), ev = eventsOn(v, ymd); if (!onlyBusy || ev.length) out.push({ ymd, word: dayWord(ymd), events: ev }); } return out;
}
export function coverage(v, today) {
  const age = v.built ? daysBetween(v.built, today) : null;
  return { age, stale: age != null && age > 21, calEnds: v.calLast, barsEnd: v.lastBar,
    word: `Built ${v.built || 'on an unknown date'}${age != null && age >= 0 ? ` (${age} day${age === 1 ? '' : 's'} ago)` : ''}. The saved calendar runs to ${v.calLast ? dayWord(v.calLast) + ' ' + v.calLast.slice(0, 4) : 'an unknown date'}; the price history in the numbers ends ${v.lastBar ? dayWord(v.lastBar) + ' ' + v.lastBar.slice(0, 4) : 'on an unknown date'}.` };
}

// ------------------------------------------------------------------------------------------------ the history card
/** the history of one kind, in plain sentences, every figure with its n. History only. */
export function history(v, key) {
  const k = v.kinds[key]; if (!k) return null;
  const L = k.last, A = k.all, ord = v.base.day, ordW = v.base.win[k.time] || { n: 0, avg: null, median: null };
  const lines = [];
  if (!L.day.n) { lines.push(`No past ${SHORT[key]} day with price data in the saved history (listed: ${k.listed}). No numbers are shown.`); return { key, k, lines, tiles: [], thin: true, ratio: null, ratioW: null }; }
  const dollars = perMicro(L.day.avg), dollarsW = perMicro(L.win.avg);
  lines.push(`Last ${L.day.n} ${SHORT[key]} days (n=${L.day.n}): between 8 AM and 4 PM ET the price travelled ${pts(L.day.avg)} points on average (median ${pts(L.day.median)}), about ${usd(dollars)} for one MNQ micro.`);
  lines.push(`In the 30 minutes from the release at ${hmWord(k.time)} it travelled ${pts(L.win.avg)} points on average (n=${L.win.n}), about ${usd(dollarsW)} for one micro.`);
  if (ord.n) lines.push(`On an ordinary weekday with no big release (n=${ord.n} days) the same stretch was ${pts(ord.avg)} points, and the same 30 minutes ${ordW.n ? pts(ordW.avg) : 'n/a'} points (n=${ordW.n}).`);
  if (A.day.n > L.day.n) lines.push(`Over all ${A.day.n} ${SHORT[key]} days in the history the day averaged ${pts(A.day.avg)} points (median ${pts(A.day.median)}).`);
  if (L.day.n < MIN_N) lines.push(`Only ${L.day.n} day${L.day.n === 1 ? '' : 's'}: too few to say much.`);
  const ratio = ord.avg ? Math.round(L.day.avg / ord.avg * 100) / 100 : null, ratioW = ordW.avg ? Math.round(L.win.avg / ordW.avg * 100) / 100 : null;
  const tiles = [{ k: `Day, last ${L.day.n}`, v: `${pts(L.day.avg)} pts`, n: `${usd(dollars)} per micro`, cls: '' }, { k: 'First 30 minutes', v: `${pts(L.win.avg)} pts`, n: `${usd(dollarsW)} per micro`, cls: '' }, { k: 'Ordinary day', v: ord.n ? `${pts(ord.avg)} pts` : 'n/a', n: ord.n ? `${usd(perMicro(ord.avg))} per micro · n=${ord.n}` : 'no data', cls: '' }];
  return { key, k, lines, tiles, thin: L.day.n < MIN_N, ratio, ratioW };
}
/** the rack's bars, oldest first: the day range of each of the last rows, and the ordinary-day yardstick */
export function rackBars(v, key) { const k = v.kinds[key]; if (!k) return { values: [], typical: v.base.day.avg || 0 }; return { values: k.rows.slice().reverse().map((r) => r.day), typical: v.base.day.avg || 0 }; }
export function rowWords(r) { return `${dayWord(r.date)} ${r.date.slice(0, 4)}: day ${pts(r.day)} pts (${usd(perMicro(r.day))}), first 30 minutes ${pts(r.win)} pts (${usd(perMicro(r.win))})`; }

export function headline(v, today) {
  const t = eventsOn(v, today);
  if (!t.length) { const n = v.events.find((e) => e.date > today); return `No scheduled release today.${n ? ` Next: ${n.title}, ${dayWord(n.date)}${n.time ? ' ' + hmWord(n.time) : ''}.` : ' Nothing later in the saved calendar.'}`; }
  const h = t.filter((e) => e.impact === 'high');
  return `${t.length} scheduled release${t.length === 1 ? '' : 's'} today${h.length ? `, ${h.length} of them high impact (${h.map((e) => (SHORT[e.kind] || e.title)).join(', ')})` : ''}. History below, no forecast.`;
}
export function jarvisCard(v, today) {
  const t = eventsOn(v, today), c = coverage(v, today), top = t.find((e) => e.impact === 'high') || t[0];
  const lvl = v.demo ? 'off' : c.stale ? 'warn' : t.some((e) => e.impact === 'high') ? 'warn' : 'ok';
  return { v: 1, name: 'Pheme', status: { level: lvl, label: str(v.demo ? 'Demo data' : c.stale ? 'Old numbers' : t.length ? t.length + ' release' + (t.length === 1 ? '' : 's') + ' today' : 'Quiet today', 48) },
    kpis: [{ label: 'Today', value: String(t.length) }, { label: 'High', value: String(t.filter((e) => e.impact === 'high').length) }, { label: 'Built', value: v.built ? v.built.slice(5) : 'n/a' }],
    lines: [str(top ? `${top.title}${top.time ? ', ' + hmWord(top.time) : ''}` : 'No scheduled release today.', 118), str('History only, never a forecast.', 118)], t: 1793394000, theme: '#14110e' };
}
