// PYTHIA core (ES module, no DOM, no network): the risk calendar. The next 14 days of market-moving events for NQ from the bundled, hand-maintained events.json (dated only when the date is a rule or published;
// each marked "verify" when not certain; releases with no known date sit in `undated`, never guessed), each with what the bots do around it in plain words, a risk colour and a countdown in New York (ET) time.
// New York time is computed from the US daylight-saving RULE (second Sunday of March 02:00, first Sunday of November 02:00), not from the device clock, so the dial and the countdown agree on every phone.
// Pure, so the tests call it in node. Nothing here places or changes an order.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
export const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 160);
const YMD = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const IMPACTS = ['high', 'med', 'low'];
export const KINDS = ['fomc', 'cpi', 'nfp', 'ppi', 'retail', 'claims', 'opex', 'quad', 'holiday', 'early', 'roll', 'other'];
export const DAYS = 14;
/** the bots' rules this page talks about (engine/lit.py, live_model.json "lit"); a test keeps these words and numbers in one place */
export const RULES = { entryFrom: '02:00', entryTo: '15:30', flat: '15:55', tradesPerDay: 1 };

// ------------------------------------------------------------------------------------------------ dates (strings only)
const ms = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
export const ymdOf = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
export const addDays = (ymd, n) => ymdOf(ms(ymd) + n * 86400000);
export const dowOf = (ymd) => (new Date(ms(ymd)).getUTCDay() + 6) % 7;                 // 0 = Monday
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
export const dayWord = (ymd) => `${WEEKDAYS[dowOf(ymd)]} ${MONTHS[+ymd.slice(5, 7) - 1].slice(0, 3)} ${+ymd.slice(8, 10)}`;
export const dayLong = (ymd) => `${WEEKDAYS_LONG[dowOf(ymd)]}, ${MONTHS[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
/** the n-th (1-based) given weekday (0 = Monday) of a month */
export function nthWeekday(y, m, dow, n) { const first = `${y}-${String(m).padStart(2, '0')}-01`; return addDays(first, ((dow - dowOf(first) + 7) % 7) + (n - 1) * 7); }
export const thirdFriday = (y, m) => nthWeekday(y, m, 4, 3);
export const firstFriday = (y, m) => nthWeekday(y, m, 4, 1);
/** the quarterly NQ expiry (third Friday of Mar / Jun / Sep / Dec) and the day the owner's bot rolls: 8 days before (docs/ROLL_DEC_2026.md) */
export const nqExpiry = (y, m) => thirdFriday(y, m);
export const nqRoll = (y, m) => addDays(nqExpiry(y, m), -8);

// ------------------------------------------------------------------------------------------------ New York time from the DST rule
const dstStartUtc = (y) => ms(nthWeekday(y, 3, 6, 2)) + 7 * 3600000;                  // 02:00 EST = 07:00 UTC on the second Sunday of March
const dstEndUtc = (y) => ms(nthWeekday(y, 11, 6, 1)) + 6 * 3600000;                   // 02:00 EDT = 06:00 UTC on the first Sunday of November
/** the New York offset from UTC, in hours (-4 in daylight time, -5 otherwise), at an instant (epoch seconds) */
export function etOffset(tSec) { const t = tSec * 1000, y = new Date(t).getUTCFullYear(); return t >= dstStartUtc(y) && t < dstEndUtc(y) ? -4 : -5; }
/** an instant -> New York { ymd, h, m, hm, dow, offset } */
export function etParts(tSec) {
  const o = etOffset(tSec), d = new Date((tSec + o * 3600) * 1000), ymd = ymdOf(d.getTime()), h = d.getUTCHours(), m = d.getUTCMinutes();
  return { ymd, h, m, hm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, dow: dowOf(ymd), offset: o };
}
/** a New York clock time on a day -> an instant (epoch seconds). On the November fall-back day 01:00-02:00 happens twice: the first (daylight) one is taken. */
export function etToEpoch(ymd, hm) {
  const [h, m] = HM.test(hm || '') ? hm.split(':').map(Number) : [0, 0], local = (ms(ymd) + (h * 60 + m) * 60000) / 1000;
  const guess = local + 4 * 3600;                                                      // as if daylight time
  return etOffset(guess) === -4 ? guess : local + 5 * 3600;
}
export const hmWord = (hm) => { if (!HM.test(hm || '')) return ''; const h = +hm.slice(0, 2), m = hm.slice(3); return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'} ET`; };
/** "in 2 days 4 hours" / "in 35 minutes" / "now" / "3 hours ago" between two instants */
export function countdown(nowSec, tSec) {
  const d = Math.round(tSec - nowSec), a = Math.abs(d), days = Math.floor(a / 86400), hrs = Math.floor((a % 86400) / 3600), min = Math.floor((a % 3600) / 60);
  const body = days >= 1 ? `${days} day${days === 1 ? '' : 's'}${hrs ? ` ${hrs} hour${hrs === 1 ? '' : 's'}` : ''}` : hrs >= 1 ? `${hrs} hour${hrs === 1 ? '' : 's'}${min ? ` ${min} min` : ''}` : `${min} min`;
  return { sec: d, past: d < 0, word: a < 60 ? 'now' : d < 0 ? `${body} ago` : `in ${body}` };
}

// ------------------------------------------------------------------------------------------------ the events file
function cleanEvent(e) {
  if (!isObj(e) || !YMD.test(String(e.date || ''))) return null;
  const title = str(e.title, 120); if (!title) return null;
  return { date: e.date, time: HM.test(String(e.time || '')) ? e.time : null, kind: KINDS.includes(e.kind) ? e.kind : 'other', title, impact: IMPACTS.includes(e.impact) ? e.impact : 'low', closed: e.closed === true, partial: e.partial === true,
    closeEt: HM.test(String(e.close_et || '')) ? e.close_et : null, verify: e.verify !== false, src: str(e.src, 140) };
}
/** events.json -> { updated, weekly, events, undated } or null when it is not an events file */
export function normEvents(j) {
  if (!isObj(j) || !Array.isArray(j.events)) return null;
  const events = j.events.map(cleanEvent).filter(Boolean);
  const weekly = (Array.isArray(j.weekly) ? j.weekly : []).filter(isObj).map((w) => ({ kind: KINDS.includes(w.kind) ? w.kind : 'other', title: str(w.title, 120), dow: num(w.dow), time: HM.test(String(w.time || '')) ? w.time : null, impact: IMPACTS.includes(w.impact) ? w.impact : 'low',
    verify: w.verify !== false, skip: (Array.isArray(w.skip) ? w.skip : []).filter((x) => YMD.test(String(x))), src: str(w.src, 140) })).filter((w) => w.title && w.dow != null && w.dow >= 0 && w.dow <= 6);
  const undated = (Array.isArray(j.undated) ? j.undated : []).filter(isObj).map((u) => ({ kind: KINDS.includes(u.kind) ? u.kind : 'other', title: str(u.title, 120), approx: str(u.approx, 80), impact: IMPACTS.includes(u.impact) ? u.impact : 'low', verify: true, confirm: str(u.confirm, 140), src: str(u.src, 140) })).filter((u) => u.title);
  return { updated: YMD.test(String(j.updated || '')) ? j.updated : '', events, weekly, undated };
}
/** every event on one day, weekly rules included, sorted by time (all-day first) */
export function eventsOn(n, ymd) {
  const out = n.events.filter((e) => e.date === ymd).map((e) => ({ ...e }));
  for (const w of n.weekly) if (dowOf(ymd) === w.dow && !w.skip.includes(ymd) && !out.some((e) => e.kind === w.kind)) out.push({ date: ymd, time: w.time, kind: w.kind, title: w.title, impact: w.impact, closed: false, closeEt: null, verify: w.verify, src: w.src, weekly: true });
  for (const e of out) e.epoch = e.time ? etToEpoch(ymd, e.time) : null;
  return out.sort((a, b) => (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0);
}
const RANK = { closed: 4, high: 3, med: 2, low: 1, calm: 0 };
/** one colour word for a day: closed / high / med / low / calm */
export function dayRisk(evs) {
  let best = 'calm'; for (const e of evs) { const r = e.closed ? 'closed' : e.impact; if (RANK[r] > RANK[best]) best = r; } return best;
}
export const RISKWORD = { closed: 'Market closed', high: 'Red day', med: 'Amber day', low: 'Light day', calm: 'Calm day' };
export const RISKCLS = { closed: 'info', high: 'bad', med: 'warn', low: 'ok', calm: '' };

/** the 14 days from `start`: [{ ymd, dow, word, events, risk }] */
export function calendar(n, start, days) { const out = []; for (let i = 0; i < (days || DAYS); i++) { const ymd = addDays(start, i), ev = n ? eventsOn(n, ymd) : []; out.push({ ymd, dow: dowOf(ymd), word: dayWord(ymd), events: ev, risk: dayRisk(ev) }); } return out; }
/** the next events at or after `nowSec`, soonest first (timed events only; all-day ones come at New York midnight) */
export function nextUp(cal, nowSec, max) {
  const out = []; for (const d of cal) for (const e of d.events) { const t = e.epoch != null ? e.epoch : etToEpoch(d.ymd, '00:00'); if (t >= nowSec - 1800) out.push({ ...e, day: d.ymd, at: t, cd: countdown(nowSec, t) }); }
  return out.sort((a, b) => a.at - b.at).slice(0, max || 6);
}

// ------------------------------------------------------------------------------------------------ what the bots do, in plain words
const R = RULES;
const FRAME = `LIT has no news pause of its own: it trades by its normal rules (entries ${hmWord(R.entryFrom).replace(' ET', '')} to ${hmWord(R.entryTo).replace(' ET', '')} ET, flat at ${hmWord(R.flat).replace(' ET', '')} ET, one trade a day, the stop beyond the sweep and size following the stop).`;
const WORDS = {
  fomc: (e) => e.time ? `The Fed speaks at ${hmWord(e.time)}, then a press conference. A trade can be open at that moment and the price can spike both ways. ${FRAME} Sitting the afternoon out is your call: the old shadow engine skips FOMC afternoons, LIT does not.` : `The meeting runs two days; the decision comes on day 2. ${FRAME} Day 1 is usually quieter.`,
  cpi: (e) => `A big inflation number at ${hmWord(e.time || '08:30')}. The first minutes can jump. ${FRAME} No change is made for you.`,
  nfp: (e) => `The jobs report at ${hmWord(e.time || '08:30')}, one of the biggest moves of the month. ${FRAME} No change is made for you.`,
  ppi: (e) => `A smaller inflation number at ${hmWord(e.time || '08:30')}. ${FRAME}`,
  retail: (e) => `Retail sales at ${hmWord(e.time || '08:30')}. ${FRAME}`,
  claims: (e) => `Weekly jobless claims at ${hmWord(e.time || '08:30')}: usually a small move. ${FRAME}`,
  opex: () => `Options expire today, so volume is heavier and price can get pinned near big levels into the close. ${FRAME}`,
  quad: () => `The December NQ contract expires and stock options and futures all expire together: very heavy volume. By now the bot has traded the March contract since the roll. ${FRAME}`,
  holiday: (e) => e.closed ? 'The market is closed: no signals and no trade. Nothing for the bot or for you to do.' : e.partial ? `The US stock market is closed and CME futures run on holiday hours (usually shorter: check the CME holiday calendar). LIT has no holiday-hours rule: be flat before the early close yourself. ${FRAME}` : 'Stocks trade as usual; only the bond market is closed, so rates trading is thin. ' + FRAME,
  early: (e) => `The market closes early, at ${hmWord(e.closeEt || e.time || '13:15')}: before the bot's ${hmWord(R.entryTo)} entry cut-off and its ${hmWord(R.flat)} flat time. LIT has no early-close rule, so be flat before the close yourself, and expect thin trading into it.`,
  roll: (e) => /switch the ninjatrader chart/i.test(e.title) ? 'Your step (3 steps in docs/ROLL_DEC_2026.md): after 4 PM ET, switch the chart to the next contract (named in the title), then run the roll check. The bot waits for the chart: until it is switched it takes no new entry.' : 'The bot moves its orders to the March contract at midnight by itself. The new contract trades hundreds of points away from the old one (about 300 points at the December roll); the chart must be on it or the bot sends no new entry (the roll guard).',
  other: () => FRAME,
};
export function botWords(e) { const f = WORDS[e.kind] || WORDS.other; return f(e); }
/** what the bot does on a day with no event */
export const CALM_WORDS = FRAME + ' Nothing special is scheduled.';
export function dayWords(d) { return d.events.length ? '' : CALM_WORDS; }

// ------------------------------------------------------------------------------------------------ the live brief (optional ../home.json)
/** home.json live.brief.news for today: [{ time, title, kind, blackout }] (only when the brief is for `today`) */
export function liveNews(home, today) {
  const b = isObj(home) && isObj(home.live) && isObj(home.live.brief) ? home.live.brief : null;
  if (!b || b.day !== today || !Array.isArray(b.news)) return null;
  return b.news.filter(isObj).slice(0, 8).map((x) => ({ time: HM.test(String(x.time || '')) ? x.time : '', title: str(x.title, 80), kind: str(x.kind, 30), blackout: str(x.blackout, 20) })).filter((x) => x.title);
}

// ------------------------------------------------------------------------------------------------ the data to show
/** the bundled events.json; the labelled demo (fixture) only when that file is missing or broken */
export function chooseData(events, fixture) {
  const e = normEvents(events); if (e && (e.events.length || e.weekly.length)) return { src: 'file', n: e, demo: false, today: null };
  const f = normEvents(isObj(fixture) ? fixture.events : null); return f ? { src: 'demo', n: f, demo: true, today: YMD.test(String(fixture.today)) ? fixture.today : null } : null;
}
/** how old the hand-kept list is, in words, against today */
export function staleWord(updated, today) {
  if (!YMD.test(updated || '')) return 'The list has no update date: check every date.';
  const d = daysBetween(updated, today); return d > 45 ? `The list was last updated ${d} days ago: dates past the end of it may be missing.` : `The list was updated ${updated}. Dates marked "check" need a look at the source.`;
}
export function lastDate(n) { const ds = n.events.map((e) => e.date).sort(); return ds.length ? ds[ds.length - 1] : ''; }

export function jarvisCard(cal, nowSec, demo) {
  const t = cal[0], risk = t ? t.risk : 'calm', up = nextUp(cal, nowSec, 1)[0];
  const lvl = demo ? 'off' : risk === 'high' ? 'bad' : risk === 'med' ? 'warn' : risk === 'closed' ? 'off' : 'ok';
  return { v: 1, name: 'Pythia', status: { level: lvl, label: str(demo ? 'Demo data' : RISKWORD[risk], 48) },
    kpis: [{ label: 'Today', value: RISKWORD[risk].replace(' day', '') }, { label: 'Events', value: String(cal.reduce((s, d) => s + d.events.length, 0)) }, { label: 'Next', value: up ? str(up.cd.word.replace('in ', ''), 20) : 'none' }],
    lines: [str(up ? `${up.title}, ${dayWord(up.day)}${up.time ? ' ' + hmWord(up.time) : ''}` : 'No event in the next 14 days.', 118), str('Times are New York (ET). Check dates marked "check".', 118)], t: 1793394000, theme: '#14110e' };
}
