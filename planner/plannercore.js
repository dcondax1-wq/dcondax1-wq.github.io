// PLANNER v2 core (pure: no DOM, no storage, no network). 2026-11-10, AGORA look. Every function works on plain data so node can test it (tests/test_planner_page.py).
//
// STORAGE (this phone only, always in try / catch in planner.js):
//   planner.agora.v2        the whole plan (this file's state, v 2). Written on every change, never in the DEMO.
//   planner.agora.v1        the plan of the last Planner (v 1). NEVER changed or deleted: it is read once and migrated into v2.
//   planner.v1              the very first Planner's plan (events / tasks / projects). Read-only, migrated once, never touched.
//   planner.agora.v2.backup the v2 plan before an Import; planner.agora.v2.bad: a v2 text that could not be read (kept aside).
//   planner.today.v1        small summary for Jarvis: { v, day, events:[{title,start,end,allDay}], tasks:[{title,due,done}], projects:[{name,open,late}], updated }.
//   planner.sessions.v1     FOR EPILOGUE AND LYCEUM (read-only for them): { v:1, updated, days: { 'YYYY-MM-DD': { pre: { done, total }, post: { rating, mood, lesson, rule, done, total } } } }.
//                           rating is one of plan | hesitated | interfered and mood one of calm | fomo | revenge | bored | tired: the SAME words as the Journal (journal.v1) and Epilogue / Lyceum,
//                           so a day's review can sit next to a trade's rating. Last 90 days only. Rewritten from the plan on every save.
//   planner.focus.v1        the running focus timer { phase, endsAt, mins, task, round } so a reload keeps it.
//   planner.inbox.v1        { ids } the iPhone inbox items ("Add to my day", ../day/inbox.json on the PC's own link) already added to the plan, so each is added once.
// READ ONLY from other apps: argo.goals.v1 (Argo's goals: { id, name, type, target }), ../pythia/events.json, ../home.json (the bots' state line and the accounts' drawdown),
// ../day/day.json + ../day/inbox.json (your calendars and the iPhone inbox, made by the PC: tools/calendar_sync.py, engine/day_inbox.py; read through ../olympus/day.js). Nothing is ever written to them.
//
// STATE v2: { v:2, events, projects, tasks, goals, notes, habits, habitLog, checklist, checks, postlist, postChecks, post, focus, prefs, from, updated }
// Days are 'YYYY-MM-DD' in NEW YORK time (the bots' clock); times 'HH:MM' are New York wall-clock times. Repeats follow the wall clock, so a 09:00 event stays at 09:00 through the clock change.

export const STORE_KEY = 'planner.agora.v2';
export const OLD_KEY = 'planner.agora.v1';
export const LEGACY_KEY = 'planner.v1';
export const SESSIONS_KEY = 'planner.sessions.v1';
export const TODAY_KEY = 'planner.today.v1';
export const FOCUS_KEY = 'planner.focus.v1';
export const ARGO_KEY = 'argo.goals.v1';
export const MAX = { text: 200, note: 4000, tasks: 1500, events: 800, notes: 800, projects: 40, goals: 24, habits: 24, checklist: 24, tags: 8 };
export const CATS = [
  { id: 'trading', label: 'Trading', color: '#c8a24a' },
  { id: 'work', label: 'Work', color: '#4b7a99' },
  { id: 'money', label: 'Money', color: '#9c6b3c' },
  { id: 'health', label: 'Health', color: '#7f8a52' },
  { id: 'life', label: 'Life', color: '#c96a4a' },
  { id: 'study', label: 'Study', color: '#e0b060' },
  { id: 'other', label: 'Other', color: '#9a8f7d' },
];
export const REPEATS = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekdays', 'Every weekday'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']];
export const REMINDS = [[0, 'No reminder'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']];
export const PRIOS = [[0, 'None'], [1, 'Low'], [2, 'Medium'], [3, 'High']];
export const LANES = [['today', 'Today'], ['next', 'Next'], ['someday', 'Someday']];
export const RATINGS = [['plan', 'Followed the plan'], ['hesitated', 'Hesitated'], ['interfered', 'Interfered']];
export const MOODS = [['calm', 'Calm'], ['fomo', 'FOMO'], ['revenge', 'Revenge'], ['bored', 'Bored'], ['tired', 'Tired']];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = (n) => String(n).padStart(2, '0');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const clipNote = (s) => String(s == null ? '' : s).replace(/\r/g, '').slice(0, MAX.note);
const clipMulti = (s, n) => String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, n);
export const slotOk = (s) => typeof s === 'string' && HM_RE.test(s);
const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };

// ------------------------------------------------------------------------------------------------ days (no time zones)
export function validDay(s) {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export function dow(day) { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
export function weekStart(day) { const w = dow(day); return addDays(day, w === 0 ? -6 : 1 - w); }
export function weekDays(day) { const s = weekStart(day); return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(s, i)); }
export function isWeekend(day) { const w = dow(day); return w === 0 || w === 6; }
export function dayLabel(day) { const [, m, d] = day.split('-').map(Number); return `${WD[dow(day)]} ${d} ${MON[m - 1]}`; }
export function dayLong(day) { const [y, m, d] = day.split('-').map(Number); return `${WDL[dow(day)]} ${d} ${MONL[m - 1]} ${y}`; }
export function shortDay(day) { return WD[dow(day)]; }
export function dayNum(day) { return Number(day.slice(8)); }
export function monthKey(day) { return day.slice(0, 7); }
export function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return `${MONL[m - 1]} ${y}`; }
export function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number), t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; }
export function daysInMonth(ym) { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function hmMins(s) { return Number(s.slice(0, 2)) * 60 + Number(s.slice(3)); }
export function minsHm(n) { const m = ((Math.round(n) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
export function timeWord(hm) { if (!slotOk(hm)) return ''; const h = Number(hm.slice(0, 2)), m = hm.slice(3); return `${h % 12 === 0 ? 12 : h % 12}${m === '00' ? '' : ':' + m} ${h < 12 ? 'am' : 'pm'}`; }

// ------------------------------------------------------------------------------------------------ New York time, by the US rule (no Intl, so it is the same everywhere)
function nthSunday(y, m0, n) { const dw = new Date(Date.UTC(y, m0, 1)).getUTCDay(); return 1 + ((7 - dw) % 7) + (n - 1) * 7; }
/** [start, end) of daylight time in the UTC milliseconds of year y: 2nd Sunday of March 02:00 EST to 1st Sunday of November 02:00 EDT */
export function dstRange(y) { return [Date.UTC(y, 2, nthSunday(y, 2, 2), 7), Date.UTC(y, 10, nthSunday(y, 10, 1), 6)]; }
export function etOffsetMin(ms) { const y = new Date(ms).getUTCFullYear(), r = dstRange(y); return ms >= r[0] && ms < r[1] ? -240 : -300; }
export function etParts(date) {
  const ms = date.getTime(), t = new Date(ms + etOffsetMin(ms) * 60000);
  const day = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, h = t.getUTCHours(), m = t.getUTCMinutes();
  return { day, hh: h, mm: m, mins: h * 60 + m, hhmm: `${pad(h)}:${pad(m)}`, offset: etOffsetMin(ms) };
}
/** the real moment (UTC ms) of a New York wall-clock time. 01:30 on the day the clocks go back is the first one (EDT); 02:30 on the day they go forward does not exist and lands at 03:30 EDT */
export function etEpoch(day, hhmm) {
  const [y, m, d] = day.split('-').map(Number), h = slotOk(hhmm) ? Number(hhmm.slice(0, 2)) : 0, mi = slotOk(hhmm) ? Number(hhmm.slice(3)) : 0;
  const wall = Date.UTC(y, m - 1, d, h, mi), edt = wall + 240 * 60000, est = wall + 300 * 60000;
  if (etOffsetMin(edt) === -240) return edt;
  return est;
}
/** how many hours the New York day has (23 on the clock-forward day, 25 on the clock-back day) */
export function dayHours(day) { return (etEpoch(addDays(day, 1), '00:00') - etEpoch(day, '00:00')) / 3600000; }
export function duration(mins) {
  if (mins == null || !Number.isFinite(mins) || mins < 0) return '';
  const m = Math.round(mins);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} day${m >= 2880 ? 's' : ''} ${Math.floor((m % 1440) / 60)} h`;
}

// ------------------------------------------------------------------------------------------------ the trading day (Kairos' windows, New York minutes)
export const WINDOWS = [
  { id: 'asia', label: 'Asia slot', from: '18:00', to: '02:00', who: 'paper copy only', tone: 'info', note: 'LIT\'s Asia slot, simulated; never a real order' },
  { id: 'london', label: 'London entries', from: '02:00', to: '08:00', who: 'LIT', tone: 'ok', note: 'LIT looks for a sweep; most trades come here' },
  { id: 'nyam', label: 'New York morning', from: '08:00', to: '12:00', who: 'LIT, BLITZ paper from 11:00', tone: 'ok', note: 'LIT can still enter' },
  { id: 'nypm', label: 'New York afternoon', from: '12:00', to: '15:30', who: 'LIT, BLITZ paper', tone: 'ok', note: 'entries stop at 15:30' },
  { id: 'winddown', label: 'No new trades', from: '15:30', to: '15:55', who: 'LIT closes open trades', tone: 'warn', note: 'last entry was 15:30; open trades are closed at 15:55' },
  { id: 'flat', label: 'Flat time', from: '15:55', to: '16:10', who: 'everything closed', tone: 'warn', note: 'MFFU needs you flat by 16:10' },
  { id: 'break', label: 'CME break', from: '17:00', to: '18:00', who: 'no prices', tone: 'off', note: 'the exchange pauses; nothing trades' },
];
// the four marks the first Planner showed (kept so the Jarvis summary and old habits keep working)
export const MARKS = [
  { id: 'entries', at: '02:00', label: 'Entries open', note: 'The bot may take one trade a day' },
  { id: 'last', at: '15:30', label: 'Last entry', note: 'No new trade after this' },
  { id: 'flat', at: '15:55', label: 'Bot flat', note: 'Everything is closed by the bot' },
  { id: 'mffu', at: '16:10', label: 'MFFU flat by', note: 'The prop firm needs you flat by now' },
];
/** the windows to draw for a day: none at the weekend, no Asia slot on Saturday morning / Sunday daytime; Friday has no break line */
export function sessionBlocks(day) {
  if (!validDay(day) || isWeekend(day)) return [];
  return WINDOWS.filter((w) => !(w.id === 'break' && dow(day) === 5)).map((w) => ({ ...w }));
}
export function sessionState(date) {
  const et = etParts(date), w = dow(et.day), t = et.mins;
  const E = hmMins('02:00'), L = hmMins('15:30'), F = hmMins('15:55'), M = hmMins('16:10');
  const base = { day: et.day, hhmm: et.hhmm, mins: t, weekend: w === 0 || w === 6, entries: false };
  if (base.weekend) return { ...base, id: 'closed', label: 'Weekend', next: null, nextText: 'The bot does not trade at the weekend. Plan the week.', pct: 0 };
  const pct = Math.max(0, Math.min(100, Math.round(((t - E) / (F - E)) * 100)));
  if (t < E) return { ...base, id: 'prep', label: 'Pre-session', next: 'Entries open', nextText: `Entries open at 02:00 ET, in ${duration(E - t)}.`, pct: 0 };
  if (t < L) return { ...base, id: 'entries', label: 'Entries open', entries: true, next: 'Last entry', nextText: `Last entry at 15:30 ET, in ${duration(L - t)}.`, pct };
  if (t < F) return { ...base, id: 'winddown', label: 'Wind-down', next: 'Bot flat', nextText: `No new trades. The bot is flat at 15:55 ET, in ${duration(F - t)}.`, pct };
  if (t < M) return { ...base, id: 'flat', label: 'Flat now', next: 'MFFU flat', nextText: `Check you are flat. MFFU needs it by 16:10 ET, in ${duration(M - t)}.`, pct: 100 };
  return { ...base, id: 'done', label: 'Day over', next: null, nextText: 'Trading is over for today. Review the day and plan tomorrow.', pct: 100 };
}

// ------------------------------------------------------------------------------------------------ market events (Pythia's events.json, read only) with a fixture fallback
const KINDS = ['fomo', 'fomc', 'cpi', 'nfp', 'ppi', 'retail', 'claims', 'opex', 'quad', 'holiday', 'early', 'roll', 'other'];
const IMPACTS = ['low', 'med', 'high'];
const strc = (v, n) => (typeof v === 'string' ? v.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : '');
/** Pythia's file -> { updated, events:[{date,time,kind,title,impact,closed}], weekly:[{kind,title,dow,time,impact,skip}] } or null */
export function normMarket(j) {
  if (!isObj(j) || !Array.isArray(j.events)) return null;
  const events = [];
  for (const e of j.events) {
    if (!isObj(e) || !validDay(e.date)) continue;
    const title = strc(e.title, 120); if (!title) continue;
    events.push({ date: e.date, time: slotOk(e.time) ? e.time : '', kind: KINDS.includes(e.kind) ? e.kind : 'other', title, impact: IMPACTS.includes(e.impact) ? e.impact : 'low', closed: e.closed === true });
  }
  const weekly = [];
  for (const w of Array.isArray(j.weekly) ? j.weekly : []) {
    if (!isObj(w) || !Number.isInteger(w.dow) || w.dow < 0 || w.dow > 6 || !strc(w.title, 120)) continue;
    weekly.push({ kind: KINDS.includes(w.kind) ? w.kind : 'other', title: strc(w.title, 120), dow: w.dow, time: slotOk(w.time) ? w.time : '', impact: IMPACTS.includes(w.impact) ? w.impact : 'low', skip: (Array.isArray(w.skip) ? w.skip : []).filter(validDay) });
  }
  return { updated: validDay(j.updated) ? j.updated : '', events, weekly };
}
/** the demo's market events: fixture.market = [{ off, time, title, impact, kind }] (days from today) */
export function marketFromFixture(fx, today) {
  const events = [];
  for (const e of isObj(fx) && Array.isArray(fx.market) ? fx.market : []) if (isObj(e) && Number.isInteger(e.off) && strc(e.title, 120)) events.push({ date: addDays(today, e.off), time: slotOk(e.time) ? e.time : '', kind: KINDS.includes(e.kind) ? e.kind : 'other', title: strc(e.title, 120), impact: IMPACTS.includes(e.impact) ? e.impact : 'low', closed: false });
  return { updated: today, events, weekly: [] };
}
export function marketOn(n, day) {
  if (!n || !validDay(day)) return [];
  const out = n.events.filter((e) => e.date === day).map((e) => ({ ...e }));
  for (const w of n.weekly) if (dow(day) === w.dow && !w.skip.includes(day) && !out.some((e) => e.kind === w.kind)) out.push({ date: day, time: w.time, kind: w.kind, title: w.title, impact: w.impact, closed: false, weekly: true });
  return out.sort((a, b) => (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0);
}
const RANK = { closed: 4, high: 3, med: 2, low: 1, calm: 0 };
export function marketRisk(evs) { let best = 'calm'; for (const e of evs) { const r = e.closed ? 'closed' : e.impact; if (RANK[r] > RANK[best]) best = r; } return best; }
export const RISKWORD = { closed: 'Market closed', high: 'Red day', med: 'Amber day', low: 'Light day', calm: 'Calm day' };
/** the next `days` days of market events from `start`: [{ day, events, risk }] (days with nothing are left out) */
export function marketAhead(n, start, days) {
  const out = [];
  for (let i = 0; i < (days || 14); i++) { const d = addDays(start, i), ev = marketOn(n, d); if (ev.length) out.push({ day: d, events: ev, risk: marketRisk(ev) }); }
  return out;
}

// ------------------------------------------------------------------------------------------------ the bots' status and drawdown left (home.json, read only)
const PLANS = { zlarior: { name: 'Zlarior (MFFU 50K)', mll: 2000 }, atlas: { name: 'ATLAS (25K)', mll: 1000 }, blitz: { name: 'BLITZ (25K)', mll: 1000 } };
const ORDER = ['zlarior', 'atlas', 'blitz'];
function acctKey(a) {
  if (!isObj(a)) return null;
  const s = [a.id, a.name, a.strategy, a.plan, a.source, a.bot, a.label].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/blitz|acct_c/.test(s)) return 'blitz';
  if (/atlas|acctb|acct_b/.test(s)) return 'atlas';
  if (/zlarior|mffu50k|50k|\blit\b/.test(s)) return 'zlarior';
  return null;
}
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
/** { real, bot, accounts:[{ key, name, room, mll, text }] }: from home.json when it has accounts, else the fixture's example (real false) */
export function botsView(home, fxBots) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [], found = {};
  for (const a of list) { const k = acctKey(a); if (k && !found[k] && !a.error) found[k] = a; }
  const real = Object.keys(found).length > 0;
  const src = real ? found : {};
  const fxA = isObj(fxBots) && Array.isArray(fxBots.accounts) ? fxBots.accounts : [];
  const accounts = [];
  for (const k of ORDER) {
    let room = null, mll = PLANS[k].mll;
    if (real) {
      const a = src[k]; if (!a) continue;
      const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {};
      mll = num(ev.mll) || num(a.mll) || mll;
      const r = num(ev.room) != null ? num(ev.room) : num(a.room);
      room = r == null ? null : Math.max(0, Math.min(mll, r));
    } else {
      const f = fxA.find((x) => isObj(x) && x.key === k); if (!f) continue;
      mll = num(f.mll) || mll; room = num(f.room);
    }
    accounts.push({ key: k, name: PLANS[k].name, room, mll, text: room == null ? `${PLANS[k].name}: drawdown left not published yet` : `${PLANS[k].name}: drawdown left ${money(room)} of ${money(mll)} max loss` });
  }
  const live = real && isObj(home.live) && typeof home.live.model_state === 'string' ? home.live.model_state.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  const bot = live || (real ? '' : strc(isObj(fxBots) ? fxBots.line : '', 140));
  return { real, bot, accounts };
}

// ------------------------------------------------------------------------------------------------ state
export function defaultChecklist() {
  return [
    'Look at the news calendar for red-folder events',
    'Mark the levels: the 18:00 open and the VIX band',
    'Check the drawdown left on the account',
    'Check the bot is on and its feed is fresh',
    'Decide the one rule for today',
    'I am present: no live order without me',
  ].map((text, i) => ({ id: 'c' + (i + 1), text }));
}
export function defaultPostlist() {
  return [
    'Every stop sat where the plan said',
    'I took only the bot\'s trade, nothing extra',
    'I wrote the day in the Journal',
    'I know the one thing to do better tomorrow',
  ].map((text, i) => ({ id: 'q' + (i + 1), text }));
}
export function defaultHabits() { return ['Journal the day', 'Review the trades', 'Move: walk or train'].map((name, i) => ({ id: 'h' + (i + 1), name, perWeek: 7 })); }
export function blankState() {
  return { v: 2, events: [], projects: [], tasks: [], goals: [], notes: [], habits: defaultHabits(), habitLog: {}, checklist: defaultChecklist(), checks: {}, postlist: defaultPostlist(), postChecks: {}, post: {}, focus: {}, prefs: { windows: true, market: true, notify: false }, from: '', updated: 0 };
}
function idMaker() {
  const used = new Set();
  return (id, pre) => {
    let s = clip(id, 40).replace(/[^\w-]/g, '');
    if (!s || used.has(pre + ':' + s)) { let n = used.size + 1; while (used.has(pre + ':' + pre + n)) n++; s = pre + n; }
    used.add(pre + ':' + s); return s;
  };
}
const pickCat = (c) => (CATS.some((x) => x.id === c) ? c : 'other');
const cleanTags = (t) => {
  const out = [], src = Array.isArray(t) ? t : typeof t === 'string' ? t.split(/[\s,]+/) : [];
  for (const x of src) { const s = clip(x, 24).toLowerCase().replace(/^#+/, '').replace(/[^\p{L}\p{N}_-]/gu, ''); if (s && !out.includes(s) && out.length < MAX.tags) out.push(s); }
  return out;
};
const cleanFlags = (src, ids, dst) => {
  if (!isObj(src)) return;
  for (const d of Object.keys(src)) {
    if (!validDay(d) || !isObj(src[d])) continue;
    const o = {}; for (const k of Object.keys(src[d])) if (ids.has(k) && src[d][k] === true) o[k] = true;
    if (Object.keys(o).length) dst[d] = o;
  }
};

/** junk-proof copy of a v2 plan: anything that is not the right shape is dropped, never thrown on */
export function normalise(raw) {
  if (!isObj(raw)) return null;
  const out = { v: 2, events: [], projects: [], tasks: [], goals: [], notes: [], habits: [], habitLog: {}, checklist: [], checks: {}, postlist: [], postChecks: {}, post: {}, focus: {}, prefs: { windows: true, market: true, notify: false }, from: clip(raw.from, 40), updated: Number.isFinite(raw.updated) ? raw.updated : 0 };
  const uid = idMaker();
  for (const p of Array.isArray(raw.projects) ? raw.projects : []) if (isObj(p) && clip(p.name, 60) && out.projects.length < MAX.projects) out.projects.push({ id: uid(p.id, 'p'), name: clip(p.name, 60), cat: pickCat(p.cat), done: p.done === true });
  const pids = new Set(out.projects.map((p) => p.id));
  for (const g of Array.isArray(raw.goals) ? raw.goals : []) {
    if (!isObj(g) || !clip(g.name, 80) || out.goals.length >= MAX.goals) continue;
    out.goals.push({ id: uid(g.id, 'g'), name: clip(g.name, 80), due: validDay(g.due) ? g.due : '', argo: /^[\w-]{1,24}$/.test(String(g.argo || '')) ? String(g.argo) : '', pct: Math.max(0, Math.min(100, Math.round(num(g.pct) || 0))), note: clip(g.note, 200) });
  }
  const gids = new Set(out.goals.map((g) => g.id));
  for (const e of Array.isArray(raw.events) ? raw.events : []) {
    if (!isObj(e) || !clip(e.title, MAX.text) || !validDay(e.day) || out.events.length >= MAX.events) continue;
    const start = slotOk(e.start) ? e.start : '', end = start && slotOk(e.end) && e.end > start ? e.end : '';
    out.events.push({ id: uid(e.id, 'e'), title: clip(e.title, MAX.text), day: e.day, start, end, cat: pickCat(e.cat), repeat: REPEATS.some((r) => r[0] === e.repeat) ? e.repeat : 'none', until: validDay(e.until) && e.until >= e.day ? e.until : '',
      ex: (Array.isArray(e.ex) ? e.ex : []).filter(validDay).slice(0, 400), remind: REMINDS.some((r) => r[0] === e.remind) ? e.remind : 0, note: clipMulti(e.note, 400) });
  }
  const tasks = [];
  for (const t of Array.isArray(raw.tasks) ? raw.tasks : []) {
    if (!isObj(t) || !clip(t.text, MAX.text) || tasks.length >= MAX.tasks) continue;
    tasks.push({ id: uid(t.id, 't'), text: clip(t.text, MAX.text), day: validDay(t.day) ? t.day : '', slot: slotOk(t.slot) ? t.slot : '', done: t.done === true, prio: [0, 1, 2, 3].includes(t.prio) ? t.prio : 0,
      lane: LANES.some((l) => l[0] === t.lane) ? t.lane : 'next', project: pids.has(t.project) ? t.project : '', parent: typeof t.parent === 'string' ? t.parent : '', goal: gids.has(t.goal) ? t.goal : '', note: clipMulti(t.note, 400) });
  }
  const topIds = new Set(tasks.filter((t) => !t.parent).map((t) => t.id));
  for (const t of tasks) { if (t.parent && (!topIds.has(t.parent) || t.parent === t.id)) t.parent = ''; if (t.parent) { const p = tasks.find((x) => x.id === t.parent); t.project = p ? p.project : ''; t.goal = p ? p.goal : ''; } }
  out.tasks = tasks;
  for (const n of Array.isArray(raw.notes) ? raw.notes : []) {
    if (!isObj(n) || out.notes.length >= MAX.notes) continue;
    const text = clipNote(n.text), title = clip(n.title, 80); if (!text.trim() && !title) continue;
    out.notes.push({ id: uid(n.id, 'n'), title, text, tags: cleanTags(n.tags), day: validDay(n.day) ? n.day : '', pin: n.pin === true, at: Number.isFinite(n.at) ? n.at : 0 });
  }
  for (const c of Array.isArray(raw.checklist) ? raw.checklist : []) if (isObj(c) && clip(c.text, MAX.text) && out.checklist.length < MAX.checklist) out.checklist.push({ id: uid(c.id, 'c'), text: clip(c.text, MAX.text) });
  for (const c of Array.isArray(raw.postlist) ? raw.postlist : []) if (isObj(c) && clip(c.text, MAX.text) && out.postlist.length < MAX.checklist) out.postlist.push({ id: uid(c.id, 'q'), text: clip(c.text, MAX.text) });
  for (const h of Array.isArray(raw.habits) ? raw.habits : []) if (isObj(h) && clip(h.name, 80) && out.habits.length < MAX.habits) out.habits.push({ id: uid(h.id, 'h'), name: clip(h.name, 80), perWeek: [1, 2, 3, 4, 5, 6, 7].includes(h.perWeek) ? h.perWeek : 7 });
  cleanFlags(raw.checks, new Set(out.checklist.map((c) => c.id)), out.checks);
  cleanFlags(raw.postChecks, new Set(out.postlist.map((c) => c.id)), out.postChecks);
  cleanFlags(raw.habitLog, new Set(out.habits.map((h) => h.id)), out.habitLog);
  if (isObj(raw.post)) for (const d of Object.keys(raw.post)) {
    const p = raw.post[d]; if (!validDay(d) || !isObj(p)) continue;
    const o = { rating: RATINGS.some((r) => r[0] === p.rating) ? p.rating : '', mood: MOODS.some((m) => m[0] === p.mood) ? p.mood : '', lesson: clip(p.lesson, 300), rule: clip(p.rule, 200), at: Number.isFinite(p.at) ? p.at : 0 };
    if (o.rating || o.mood || o.lesson || o.rule) out.post[d] = o;
  }
  if (isObj(raw.focus)) for (const d of Object.keys(raw.focus)) { const f = raw.focus[d]; if (validDay(d) && isObj(f) && num(f.n) > 0) out.focus[d] = { n: Math.min(99, Math.round(num(f.n))), min: Math.min(2000, Math.round(num(f.min) || 0)) }; }
  if (isObj(raw.prefs)) out.prefs = { windows: raw.prefs.windows !== false, market: raw.prefs.market !== false, notify: raw.prefs.notify === true };
  return out;
}
export function newId(pre, list) { const used = new Set(list.map((x) => x.id)); let n = list.length + 1; while (used.has(pre + n)) n++; return pre + n; }

// ------------------------------------------------------------------------------------------------ migrations (nothing is ever lost: old keys stay where they are)
export function detect(raw) {
  if (!isObj(raw)) return null;
  if (raw.v === 2) return 'v2';
  const legacyTask = Array.isArray(raw.tasks) && raw.tasks.some((t) => isObj(t) && !('day' in t) && (t.date || t.title || t.due));
  if (Array.isArray(raw.events) || legacyTask) return 'legacy';
  if ('checklist' in raw || 'habits' in raw || 'tasks' in raw || 'notes' in raw || 'habitLog' in raw || 'checks' in raw) return 'agora1';
  return null;
}
/** the plan of planner.agora.v1 -> v2: tasks keep their day and time (lane today), day notes become notes tagged 'daily' on their day; checklist, ticks, habits and their log are kept as they were */
export function migrateAgora1(raw) {
  if (!isObj(raw)) return null;
  const st = blankState();
  st.from = 'agora.v1'; st.updated = Number.isFinite(raw.updated) ? raw.updated : 0;
  st.checklist = []; st.habits = [];
  const v1 = normaliseV1(raw);
  st.checklist = v1.checklist; st.checks = v1.checks; st.habits = v1.habits.map((h) => ({ ...h, perWeek: 7 })); st.habitLog = v1.habitLog;
  st.tasks = v1.tasks.map((t) => ({ id: t.id, text: t.text, day: t.day, slot: t.slot, done: t.done, prio: 0, lane: 'today', project: '', parent: '', goal: '', note: '' }));
  const days = Object.keys(v1.notes).sort();
  st.notes = days.map((d, i) => ({ id: 'n' + (i + 1), title: '', text: v1.notes[d], tags: ['daily'], day: d, pin: false, at: 0 }));
  if (!st.checklist.length) st.checklist = defaultChecklist();
  if (!st.habits.length) st.habits = defaultHabits();
  return normalise(st);
}
// the v1 shape reader (its own cleaner, kept here so the migration never depends on the new rules)
function normaliseV1(raw) {
  const out = { checklist: [], checks: {}, tasks: [], habits: [], habitLog: {}, notes: {} };
  const used = { c: new Set(), h: new Set(), t: new Set() };
  const uniq = (id, pre) => {
    let s = clip(id, 40).replace(/[^\w-]/g, ''); const set = used[pre];
    if (!s || set.has(s)) { let n = set.size + 1; while (set.has(pre + n)) n++; s = pre + n; }
    set.add(s); return s;
  };
  for (const c of Array.isArray(raw.checklist) ? raw.checklist : []) if (isObj(c) && clip(c.text, MAX.text) && out.checklist.length < MAX.checklist) out.checklist.push({ id: uniq(c.id, 'c'), text: clip(c.text, MAX.text) });
  for (const h of Array.isArray(raw.habits) ? raw.habits : []) if (isObj(h) && clip(h.name, 80) && out.habits.length < MAX.habits) out.habits.push({ id: uniq(h.id, 'h'), name: clip(h.name, 80) });
  for (const t of Array.isArray(raw.tasks) ? raw.tasks : []) if (isObj(t) && clip(t.text, MAX.text) && validDay(t.day) && out.tasks.length < MAX.tasks) out.tasks.push({ id: uniq(t.id, 't'), text: clip(t.text, MAX.text), day: t.day, done: t.done === true, slot: slotOk(t.slot) ? t.slot : '' });
  const cid = new Set(out.checklist.map((c) => c.id)), hid = new Set(out.habits.map((h) => h.id));
  cleanFlags(raw.checks, cid, out.checks); cleanFlags(raw.habitLog, hid, out.habitLog);
  if (isObj(raw.notes)) for (const d of Object.keys(raw.notes)) if (validDay(d) && typeof raw.notes[d] === 'string' && raw.notes[d].trim() && Object.keys(out.notes).length < MAX.notes) out.notes[d] = raw.notes[d].slice(0, MAX.note);
  return out;
}
const legacyPrio = (p) => { if (p === 'high' || p === 'urgent' || p === 3 || p === '3') return 3; if (p === 'med' || p === 'medium' || p === 2 || p === '2') return 2; if (p === 'low' || p === 1 || p === '1') return 1; return 0; };
const dayOfAny = (x) => { const s = String(x || ''); const m = s.match(/^(\d{4}-\d{2}-\d{2})/); return m && validDay(m[1]) ? m[1] : ''; };
const timeOfAny = (x) => { const s = String(x || ''); const m = s.match(/(?:^|T|\s)([01]?\d|2[0-3]):([0-5]\d)/); return m ? `${pad(Number(m[1]))}:${m[2]}` : ''; };
/** the first Planner's plan (planner.v1: events with date / start / end / repeat, tasks with date / title / done / priority, projects) -> v2 */
export function migrateLegacy(raw) {
  if (!isObj(raw)) return null;
  const src = isObj(raw.data) ? raw.data : raw, st = blankState();
  st.from = 'planner.v1';
  const projects = [];
  for (const p of Array.isArray(src.projects) ? src.projects : []) if (isObj(p) && clip(p.name || p.title, 60)) projects.push({ id: clip(p.id, 40) || 'p' + (projects.length + 1), name: clip(p.name || p.title, 60), cat: pickCat(p.cat || p.category), done: p.done === true || p.status === 'done' });
  st.projects = projects;
  for (const e of Array.isArray(src.events) ? src.events : []) {
    if (!isObj(e)) continue;
    const day = dayOfAny(e.date || e.day || e.start), title = clip(e.title || e.name || e.text, MAX.text); if (!day || !title) continue;
    const start = e.allDay === true ? '' : timeOfAny(e.start || e.time), end = timeOfAny(e.end);
    const cat = pickCat(String(e.cat || e.category || e.type || '').toLowerCase());
    st.events.push({ id: clip(e.id, 40) || 'e' + (st.events.length + 1), title, day, start, end, cat, repeat: e.repeat, until: dayOfAny(e.until), ex: Array.isArray(e.ex) ? e.ex : [], remind: Number(e.remind || e.reminder) || 0, note: clip(e.note || e.notes, 400) });
  }
  const pnames = new Map(projects.map((p) => [p.id, p.id])), byName = new Map(projects.map((p) => [p.name.toLowerCase(), p.id]));
  for (const t of Array.isArray(src.tasks) ? src.tasks : []) {
    if (!isObj(t)) continue;
    const text = clip(t.text || t.title || t.name, MAX.text); if (!text) continue;
    const pj = pnames.has(t.project) ? t.project : byName.get(String(t.project || '').toLowerCase()) || '';
    st.tasks.push({ id: clip(t.id, 40) || 't' + (st.tasks.length + 1), text, day: dayOfAny(t.day || t.date || t.due), slot: timeOfAny(t.slot || t.time), done: t.done === true || t.status === 'done', prio: legacyPrio(t.prio !== undefined ? t.prio : t.priority), lane: 'next', project: pj, parent: typeof t.parent === 'string' ? t.parent : '', goal: '', note: clip(t.note || t.notes, 400) });
  }
  for (const t of st.tasks) if (t.day) t.lane = 'today';
  return normalise(st);
}
/** merge b into a (both v2): events, tasks, projects, notes, goals, habits and logs of b are added; ids that clash are renamed */
export function mergeStates(a, b) {
  if (!a) return b; if (!b) return a;
  const out = JSON.parse(JSON.stringify(a)), remap = {};
  const take = (list, pre, key) => { for (const x of b[key]) { let id = x.id; const used = new Set(out[key].map((y) => y.id)); if (used.has(id)) { id = newId(pre, out[key]); remap[key + ':' + x.id] = id; } out[key].push({ ...x, id }); } };
  const hasP = new Set(out.projects.map((p) => p.name.toLowerCase()));
  for (const p of b.projects) { if (hasP.has(p.name.toLowerCase())) { remap['project:' + p.id] = out.projects.find((q) => q.name.toLowerCase() === p.name.toLowerCase()).id; continue; } let id = p.id; if (out.projects.some((q) => q.id === id)) { id = newId('p', out.projects); remap['project:' + p.id] = id; } out.projects.push({ ...p, id }); }
  take(b.events, 'e', 'events');
  for (const t of b.tasks) { let id = t.id; if (out.tasks.some((y) => y.id === id)) { id = newId('t', out.tasks); remap['task:' + t.id] = id; } out.tasks.push({ ...t, id, project: remap['project:' + t.project] || t.project }); }
  for (const t of out.tasks) if (t.parent && remap['task:' + t.parent] && b.tasks.some((x) => x.id === t.parent)) t.parent = remap['task:' + t.parent];
  take(b.notes, 'n', 'notes'); take(b.goals, 'g', 'goals');
  out.from = [a.from, b.from].filter(Boolean).join('+');
  return normalise(out);
}
/** what to start with, from the three places a plan may live: { state, from: [...] } or null (nothing saved: show the demo). Each argument is the stored TEXT or null. */
export function loadAll(textV2, textV1, textLegacy) {
  const parse = (t) => { if (t == null) return null; try { return JSON.parse(t); } catch (_) { return undefined; } };
  const r2 = parse(textV2);
  if (r2 === undefined) return { state: null, bad: true, from: [] };
  if (r2 != null) { const s = normalise(r2); if (s) return { state: s, from: ['v2'] }; return { state: null, bad: true, from: [] }; }
  const r1 = parse(textV1), rl = parse(textLegacy);
  let st = null; const from = [];
  if (isObj(r1)) { const k = detect(r1); const s = k === 'legacy' ? migrateLegacy(r1) : migrateAgora1(r1); if (s) { st = s; from.push(k === 'legacy' ? 'planner.v1' : 'agora.v1'); } }
  if (isObj(rl)) { const s = migrateLegacy(rl); if (s && (s.events.length || s.tasks.length || s.projects.length)) { st = st ? mergeStates(st, s) : s; from.push('planner.v1'); } }
  return { state: st, from };
}
export function migrateAny(raw) {
  const k = detect(raw);
  if (k === 'v2') return normalise(raw);
  if (k === 'agora1') return migrateAgora1(raw);
  if (k === 'legacy') return migrateLegacy(raw);
  return null;
}

// ------------------------------------------------------------------------------------------------ recurrence
/** does the event (or its repeats) fall on `day`? Pure day arithmetic, so it follows the wall clock through the clock change. A monthly or yearly repeat on the 29th to 31st lands on the last day of a shorter month. */
export function occursOn(ev, day) {
  if (!ev || !validDay(ev.day) || !validDay(day) || day < ev.day) return false;
  if (Array.isArray(ev.ex) && ev.ex.includes(day)) return false;
  if (day === ev.day) return true;
  if (!ev.repeat || ev.repeat === 'none' || (ev.until && day > ev.until)) return false;
  const n = daysBetween(ev.day, day), w = dow(day);
  switch (ev.repeat) {
    case 'daily': return true;
    case 'weekdays': return w >= 1 && w <= 5;
    case 'weekly': return n % 7 === 0;
    case 'biweekly': return n % 14 === 0;
    case 'monthly': { const dd = Number(ev.day.slice(8)); return Number(day.slice(8)) === Math.min(dd, daysInMonth(monthKey(day))); }
    case 'yearly': { if (ev.day.slice(5, 7) !== day.slice(5, 7)) return false; const dd = Number(ev.day.slice(8)); return Number(day.slice(8)) === Math.min(dd, daysInMonth(monthKey(day))); }
    default: return false;
  }
}
const byStart = (a, b) => (a.start || '') < (b.start || '') ? -1 : (a.start || '') > (b.start || '') ? 1 : a.title.localeCompare(b.title);
/** every occurrence from..to (inclusive): [{ id, title, day, start, end, allDay, cat, repeat, remind, ms }] (ms = the real moment it starts, DST-correct) */
export function expand(events, from, to) {
  const out = [];
  for (const e of events || []) {
    if (e.day > to) continue;
    if (e.repeat === 'none' || !e.repeat) { if (e.day >= from && !(e.ex || []).includes(e.day)) out.push(occ(e, e.day)); continue; }
    const last = e.until && e.until < to ? e.until : to;
    for (let d = e.day > from ? e.day : from; d <= last; d = addDays(d, 1)) if (occursOn(e, d)) out.push(occ(e, d));
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.allDay ? 0 : 1) - (b.allDay ? 0 : 1) || byStart(a, b)));
}
function occ(e, day) { return { id: e.id, title: e.title, day, start: e.start, end: e.end, allDay: !e.start, cat: e.cat, repeat: e.repeat, remind: e.remind, note: e.note, ms: etEpoch(day, e.start || '00:00') }; }
export function eventsOnDay(st, day) { return expand(st.events, day, day); }

// ------------------------------------------------------------------------------------------------ reminders (in-app badges)
/** events with a reminder that are due now or started in the last 15 minutes: [{ id, title, day, start, mins (until start, negative once started), state: 'soon' | 'now' }] */
export function reminders(st, nowMs) {
  const t = etParts(new Date(nowMs)), out = [];
  for (const o of expand(st.events, addDays(t.day, -1), addDays(t.day, 2))) {
    if (!o.remind || o.allDay) continue;
    const mins = Math.round((o.ms - nowMs) / 60000);
    if (mins <= o.remind && mins >= -15) out.push({ id: o.id, title: o.title, day: o.day, start: o.start, mins, state: mins <= 0 ? 'now' : 'soon' });
  }
  return out.sort((a, b) => a.mins - b.mins);
}
export function nextEvents(st, nowMs, max) {
  const t = etParts(new Date(nowMs)), out = [];
  for (const o of expand(st.events, t.day, addDays(t.day, 14))) { if (o.allDay) continue; if (o.ms >= nowMs - 15 * 60000) out.push({ ...o, mins: Math.round((o.ms - nowMs) / 60000) }); }
  return out.slice(0, max || 3);
}

// ------------------------------------------------------------------------------------------------ the natural-phrase parser
const DOWS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const DOW_RE = '(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';
const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
const MON_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
/** the next `w` (0 = Sunday) on or after `day` */
export function nextDow(day, w) { return addDays(day, (w - dow(day) + 7) % 7); }
function to24(h, m, ap, ref) {
  let hh = Number(h); const mm = Number(m || 0);
  if (mm > 59 || hh > 24) return null;
  if (ap) { if (hh < 1 || hh > 12) return null; hh = hh % 12 + (ap === 'pm' ? 12 : 0); }
  else if (ref === 'bare' && hh >= 1 && hh <= 6) hh += 12;
  if (hh > 23) return null;
  return `${pad(hh)}:${pad(mm)}`;
}
/**
 * "Fri 9am journal review" -> an event on the next Friday at 09:00 titled "journal review".
 * Understood (any order, case does not matter): a day (today, tomorrow, tmrw, Fri, next Fri = that day of NEXT week, in 3 days, in 2 weeks, next week = next Monday, this weekend = Saturday,
 * 2026-12-04, 12/4, Dec 4, 4 Dec), a time (9am, 9:30pm, 14:00, at 9 = 9, at 3 = 3 pm, noon, midnight, 9-10am, 9am to 10:30am, for 45 min, for 2h), a repeat (every day, every weekday,
 * every Sunday, every 2 weeks, every month, "... weekly" / "... daily" at the end), a priority (!, !!, !!!, !high, p1, urgent), a project (#name), a category (@work), a reminder (remind 15m),
 * a lane (someday, later, asap). A time or a repeat makes it an event, otherwise it is a task. 'task:' or 'event:' at the start forces it. Nothing is guessed silently: the result lists what was understood in `found`.
 * opts: { kind: 'auto' | 'task' | 'event', projects: [{ id, name }], defaultLane: 'today' | 'next' | 'someday' }
 */
export function parseQuick(input, today, opts) {
  const o = opts || {}, found = [];
  let s = ' ' + clip(input, MAX.text + 40) + ' ';
  const res = { text: '', kind: 'task', day: '', start: '', end: '', repeat: 'none', prio: 0, lane: LANES.some((l) => l[0] === o.defaultLane) ? o.defaultLane : 'next', project: '', projectName: '', cat: '', remind: 0, found };
  let forced = o.kind === 'task' || o.kind === 'event' ? o.kind : '';
  // take(re, fn): cut the first match out of the text and call fn(match); fn may return false to refuse it (the text is then left alone)
  const take = (re, fn) => { const m = s.match(re); if (!m) return false; if (fn(m) === false) return false; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); return true; };
  take(/^\s*(task|todo|event|appt|meeting)\s*[:-]\s+/i, (m) => { forced = /event|appt|meeting/i.test(m[1]) ? 'event' : 'task'; });
  take(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, (m) => { const nm = m[1].toLowerCase(), p = (o.projects || []).find((x) => x.name.toLowerCase().replace(/\s+/g, '') === nm || x.name.toLowerCase().replace(/\s+/g, '').startsWith(nm)); if (p) { res.project = p.id; found.push('project ' + p.name); } else { res.projectName = m[1]; found.push('new project ' + m[1]); } });
  take(new RegExp('\\s@(' + CATS.map((c) => c.id).join('|') + ')(?=\\s)', 'i'), (m) => { const c = CATS.find((x) => x.id === m[1].toLowerCase()); res.cat = c.id; found.push('category ' + c.label); });
  // priority
  if (take(/\s!{3}(?=\s)/, () => { res.prio = 3; }) || take(/\s!{2}(?=\s)/, () => { res.prio = 2; }) || take(/\s!(?=\s)/, () => { res.prio = 1; })) found.push('priority ' + PRIOS[res.prio][1].toLowerCase());
  else if (take(/\s!(high|urgent|med|medium|low)\b/i, (m) => { res.prio = /high|urgent/i.test(m[1]) ? 3 : /low/i.test(m[1]) ? 1 : 2; }) || take(/\sp([123])(?=\s)/i, (m) => { res.prio = 4 - Number(m[1]); }) || take(/\s(?:urgent|high priority)\b/i, () => { res.prio = 3; })) found.push('priority ' + PRIOS[res.prio][1].toLowerCase());
  // reminder
  take(/\sremind(?:\s+me)?(?:\s+in)?\s+(\d{1,3})\s*(m|min|mins|minutes?|h|hr|hrs|hours?)(?:\s+before)?\b/i, (m) => { const v = Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1); res.remind = REMINDS.reduce((best, r) => (r[0] && Math.abs(r[0] - v) < Math.abs(best - v) ? r[0] : best), 5); found.push('reminder ' + res.remind + ' min'); });
  // duration
  let dur = 0;
  take(/\sfor\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?)\b/i, (m) => { dur = Math.round(Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1)); found.push('lasts ' + duration(dur)); });
  // repeats
  let repDow = null;
  const REPW = { day: 'daily', weekday: 'weekdays', week: 'weekly', month: 'monthly', year: 'yearly', daily: 'daily', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly', fortnightly: 'biweekly', biweekly: 'biweekly' };
  if (take(new RegExp('\\severy\\s+(' + DOW_RE + ')\\b', 'i'), (m) => { res.repeat = 'weekly'; repDow = DOWS[m[1].toLowerCase()]; })) found.push('every ' + WDL[repDow]);
  else if (take(/\severy\s+(?:other|2nd|second)\s+(?:week|wk)\b/i, () => { res.repeat = 'biweekly'; }) || take(/\severy\s+2\s+weeks\b/i, () => { res.repeat = 'biweekly'; }) ||
    take(/\severy\s+(day|weekday|week|month|year)\b/i, (m) => { res.repeat = REPW[m[1].toLowerCase()]; }) || take(/\sweekdays\s*$/i, () => { res.repeat = 'weekdays'; }) ||
    take(/\s(daily|weekly|monthly|yearly|fortnightly|biweekly)\s*$/i, (m) => { res.repeat = REPW[m[1].toLowerCase()]; })) found.push(REPEATS.find((r) => r[0] === res.repeat)[1].toLowerCase());
  // time range, then a single time
  take(/\s(?:from\s+|at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s|$)/i, (m) => {
    if (!(m[3] || m[6] || m[2] || m[5])) return false;
    const a2 = m[6] ? m[6].toLowerCase() : '';
    let a1 = m[3] ? m[3].toLowerCase() : '';
    if (!a1 && a2) a1 = a2 === 'pm' && Number(m[1]) > Number(m[4]) && Number(m[1]) < 12 ? 'am' : a2;
    const A = to24(m[1], m[2], a1 || undefined, 'none'), B = to24(m[4], m[5], a2 || undefined, 'none');
    if (!A || !B || B <= A) return false;
    res.start = A; res.end = B; found.push('from ' + timeWord(A) + ' to ' + timeWord(B));
  });
  if (!res.start) {
    take(/\s(?:at\s+)?noon\b/i, () => { res.start = '12:00'; }) || take(/\s(?:at\s+)?midnight\b/i, () => { res.start = '00:00'; }) ||
      take(/\s(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?(?=\s|$)/i, (m) => { const v = to24(m[1], m[2], m[3] ? m[3].toLowerCase() : undefined, 'none'); if (!v) return false; res.start = v; }) ||
      take(/\s(?:at\s+)?(\d{1,2})\s*(am|pm)(?=\s|$)/i, (m) => { const v = to24(m[1], 0, m[2].toLowerCase()); if (!v) return false; res.start = v; }) ||
      take(/\sat\s+(\d{1,2})(?=\s|$)/i, (m) => { const v = to24(m[1], 0, undefined, 'bare'); if (!v) return false; res.start = v; });
    if (res.start) found.push('at ' + timeWord(res.start));
  }
  if (res.start && !res.end && dur) { const e = hmMins(res.start) + dur; if (e < 1440) res.end = minsHm(e); }
  // lane words
  if (take(/\s(someday|eventually|one day)\b/i, () => { res.lane = 'someday'; })) found.push('someday');
  else if (take(/\sasap\b/i, () => { res.lane = 'today'; res.prio = Math.max(res.prio, 3); })) found.push('today, high priority');
  // dates
  const t0 = validDay(today) ? today : '2026-01-05';
  const setDay = (d, label) => { res.day = d; found.push(label || dayLabel(d)); };
  const datePick = (mon, dd, yr) => {
    const mn = typeof mon === 'number' ? mon : MONTHS[String(mon).toLowerCase().replace('.', '')], d = Number(dd);
    if (!mn || d < 1 || d > 31) return false;
    let y = yr ? Number(yr) : Number(t0.slice(0, 4)), c = `${y}-${pad(mn)}-${pad(d)}`;
    if (!validDay(c)) return false;
    if (!yr && c < t0) { y += 1; c = `${y}-${pad(mn)}-${pad(d)}`; if (!validDay(c)) return false; }
    setDay(c); return true;
  };
  const ok = (v) => (v === false ? false : undefined);
  void (take(/\s(?:day after tomorrow|overmorrow)\b/i, () => setDay(addDays(t0, 2))) ||
    take(/\s(?:tomorrow|tmrw|tmr)\b/i, () => setDay(addDays(t0, 1))) ||
    take(/\s(?:today|tonight|this evening)\b/i, (m) => { setDay(t0); if (/tonight|evening/i.test(m[0]) && !res.start) { res.start = '19:00'; found.push('at 7 pm'); } }) ||
    take(/\s(\d{4})-(\d{2})-(\d{2})(?=\s|$)/, (m) => { const d = `${m[1]}-${m[2]}-${m[3]}`; if (!validDay(d)) return false; setDay(d); }) ||
    take(/\sin\s+(\d{1,3})\s*(days?|d|weeks?|wks?|months?)\b/i, (m) => { const n = Number(m[1]), u = m[2].toLowerCase(); if (u[0] === 'm') { const ym = addMonths(monthKey(t0), n), dd = Math.min(Number(t0.slice(8)), daysInMonth(ym)); setDay(`${ym}-${pad(dd)}`); } else setDay(addDays(t0, u[0] === 'w' ? n * 7 : n)); }) ||
    take(/\snext\s+week\b/i, () => setDay(addDays(weekStart(t0), 7), 'next week: Monday')) ||
    take(/\snext\s+month\b/i, () => setDay(addMonths(monthKey(t0), 1) + '-01', 'next month: the 1st')) ||
    take(/\s(?:this\s+)?weekend\b/i, () => setDay(nextDow(t0, 6))) ||
    take(new RegExp('\\snext\\s+(' + DOW_RE + ')\\b', 'i'), (m) => { const w = DOWS[m[1].toLowerCase()]; setDay(addDays(addDays(weekStart(t0), 7), (w + 6) % 7), 'next ' + WDL[w]); }) ||
    take(new RegExp('\\s(?:on\\s+|this\\s+)?(' + DOW_RE + ')\\b', 'i'), (m) => { const w = DOWS[m[1].toLowerCase()]; setDay(nextDow(t0, w), WDL[w]); }) ||
    take(new RegExp('\\s(?:on\\s+)?(' + MON_RE + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s|$)', 'i'), (m) => ok(datePick(m[1], m[2], m[3]))) ||
    take(new RegExp('\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + MON_RE + ')\\b\\.?(?:,?\\s+(\\d{4}))?(?=\\s|$)', 'i'), (m) => ok(datePick(m[2], m[1], m[3]))) ||
    take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)/, (m) => ok(datePick(Number(m[1]), m[2], m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null))) ||
    take(/\s(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)(?=\s|$)/i, (m) => { const d = Number(m[1]); if (d < 1 || d > 31) return false; let ym = monthKey(t0); for (let i = 0; i < 13; i++, ym = addMonths(ym, 1)) { const c = `${ym}-${pad(d)}`; if (d <= daysInMonth(ym) && c >= t0) { setDay(c); return; } } return false; }));
  if (repDow != null && !res.day) res.day = nextDow(t0, repDow);
  if (res.repeat !== 'none' && !res.day) res.day = t0;
  // the title: what is left, without dangling connectors
  let title = clip(s, MAX.text).replace(/^(?:on|at|by|due|for|from|to|and|the)\s+/i, '').replace(/\s+(?:on|at|by|due|for|from|to|and|the)$/i, '').trim();
  title = title.replace(/^[-:,]+\s*|\s*[-:,]+$/g, '').trim();
  res.text = title;
  res.kind = forced || (res.start || res.repeat !== 'none' ? 'event' : 'task');
  if (res.kind === 'task') { res.end = ''; res.repeat = 'none'; if (!res.day && (res.lane === 'today' || res.start)) res.day = t0; } else if (!res.day) res.day = t0;
  return res;
}
/** one plain sentence of what a parse will create, for the preview line */
export function describeQuick(r) {
  if (!r || !r.text) return '';
  const when = (r.day ? dayLabel(r.day) : r.kind === 'task' ? 'no due day' : '') + (r.start ? ' at ' + timeWord(r.start) + (r.end ? ' to ' + timeWord(r.end) : '') : '');
  const rep = r.repeat !== 'none' ? ', ' + REPEATS.find((x) => x[0] === r.repeat)[1].toLowerCase() : '';
  const pr = r.prio ? ', ' + PRIOS[r.prio][1].toLowerCase() + ' priority' : '';
  return `${r.kind === 'event' ? 'Event' : 'Task'}: ${r.text}${when ? ' (' + when.trim() + ')' : ''}${rep}${pr}${r.kind === 'task' && r.lane !== 'next' ? ', ' + r.lane : ''}`;
}

// ------------------------------------------------------------------------------------------------ changes (they change the state you pass in and return what they made)
export function addEvent(st, o) {
  if (!o || !clip(o.title || o.text, MAX.text) || !validDay(o.day) || st.events.length >= MAX.events) return null;
  const start = slotOk(o.start) ? o.start : '';
  const e = { id: newId('e', st.events), title: clip(o.title || o.text, MAX.text), day: o.day, start, end: start && slotOk(o.end) && o.end > start ? o.end : '', cat: pickCat(o.cat), repeat: REPEATS.some((r) => r[0] === o.repeat) ? o.repeat : 'none', until: validDay(o.until) && o.until >= o.day ? o.until : '', ex: [], remind: REMINDS.some((r) => r[0] === o.remind) ? o.remind : 0, note: clipMulti(o.note, 400) };
  st.events.push(e); return e;
}
export function updateEvent(st, id, patch) {
  const i = st.events.findIndex((e) => e.id === id); if (i < 0) return null;
  const merged = normalise({ ...st, events: [{ ...st.events[i], ...patch, id }] });
  if (!merged || !merged.events.length) return null;
  const e = merged.events[0]; e.ex = patch.ex ? e.ex : st.events[i].ex; st.events[i] = e; return e;
}
export function removeEvent(st, id) { const n = st.events.length; st.events = st.events.filter((e) => e.id !== id); return st.events.length < n; }
/** drop ONE day of a repeating event (an exception); a one-off event is deleted */
export function skipOccurrence(st, id, day) {
  const e = st.events.find((x) => x.id === id); if (!e || !validDay(day)) return false;
  if (e.repeat === 'none') return removeEvent(st, id);
  if (day === e.day) { let nx = addDays(day, 1); for (let i = 0; i < 800 && !(occursOn({ ...e, ex: e.ex }, nx) && !e.ex.includes(nx)); i++) nx = addDays(nx, 1); if (e.until && nx > e.until) return removeEvent(st, id); e.day = nx; e.ex = e.ex.filter((d) => d >= nx); return true; }
  if (!e.ex.includes(day)) e.ex.push(day); return true;
}
export function addTask(st, input, day, opts) {
  const q = typeof input === 'string' ? parseQuick(input, day, { ...opts, kind: 'task' }) : input;
  if (!q || !q.text || st.tasks.length >= MAX.tasks) return null;
  const parent = opts && opts.parent && st.tasks.some((t) => t.id === opts.parent && !t.parent) ? st.tasks.find((t) => t.id === opts.parent) : null;
  const t = { id: newId('t', st.tasks), text: clip(q.text, MAX.text), day: validDay(q.day) ? q.day : '', slot: slotOk(q.start || q.slot) ? (q.start || q.slot) : '', done: false, prio: [0, 1, 2, 3].includes(q.prio) ? q.prio : 0,
    lane: LANES.some((l) => l[0] === q.lane) ? q.lane : 'next', project: parent ? parent.project : st.projects.some((p) => p.id === q.project) ? q.project : '', parent: parent ? parent.id : '', goal: parent ? parent.goal : (q.goal && st.goals.some((g) => g.id === q.goal) ? q.goal : ''), note: clipMulti(q.note, 400) };
  st.tasks.push(t); return t;
}
export function updateTask(st, id, patch) {
  const i = st.tasks.findIndex((t) => t.id === id); if (i < 0) return null;
  const merged = normalise({ ...st, tasks: st.tasks.map((t, j) => (j === i ? { ...t, ...patch, id } : t)) });
  if (!merged) return null;
  const t = merged.tasks.find((x) => x.id === id); if (!t) return null;
  st.tasks[i] = t;
  for (const sub of st.tasks) if (sub.parent === id) { sub.project = t.project; sub.goal = t.goal; }
  return t;
}
export function toggleTask(st, id) { const t = st.tasks.find((x) => x.id === id); if (t) t.done = !t.done; return t || null; }
export function removeTask(st, id) { const n = st.tasks.length; st.tasks = st.tasks.filter((x) => x.id !== id && x.parent !== id); return st.tasks.length < n; }
export function moveTask(st, id, day) { const t = st.tasks.find((x) => x.id === id); if (t && validDay(day)) t.day = day; return t || null; }
/** a lane only says when you plan to work on a task: its due day is never changed (a task due today or earlier is always in Today) */
export function setLane(st, id, lane) { const t = st.tasks.find((x) => x.id === id); if (t && LANES.some((l) => l[0] === lane)) t.lane = lane; return t || null; }
export function addProject(st, name, cat) { const n = clip(name, 60); if (!n || st.projects.length >= MAX.projects) return null; const ex = st.projects.find((p) => p.name.toLowerCase() === n.toLowerCase()); if (ex) return ex; const p = { id: newId('p', st.projects), name: n, cat: pickCat(cat), done: false }; st.projects.push(p); return p; }
export function removeProject(st, id) { const n = st.projects.length; st.projects = st.projects.filter((p) => p.id !== id); for (const t of st.tasks) if (t.project === id) t.project = ''; return st.projects.length < n; }
export function addGoal(st, name, argo) { const n = clip(name, 80); if (!n || st.goals.length >= MAX.goals) return null; const g = { id: newId('g', st.goals), name: n, due: '', argo: /^[\w-]{1,24}$/.test(String(argo || '')) ? String(argo) : '', pct: 0, note: '' }; st.goals.push(g); return g; }
export function removeGoal(st, id) { const n = st.goals.length; st.goals = st.goals.filter((g) => g.id !== id); for (const t of st.tasks) if (t.goal === id) t.goal = ''; return st.goals.length < n; }
export function updateGoal(st, id, patch) { const g = st.goals.find((x) => x.id === id); if (!g) return null; const m = normalise({ ...st, goals: [{ ...g, ...patch, id }] }); if (!m || !m.goals.length) return null; Object.assign(g, m.goals[0]); return g; }
function flip(log, day, id) {
  const o = log[day] || (log[day] = {});
  if (o[id]) delete o[id]; else o[id] = true;
  const on = !!o[id];
  if (!Object.keys(o).length) delete log[day];
  return on;
}
export function toggleCheck(st, day, id) { return st.checklist.some((c) => c.id === id) && validDay(day) ? flip(st.checks, day, id) : null; }
export function togglePost(st, day, id) { return st.postlist.some((c) => c.id === id) && validDay(day) ? flip(st.postChecks, day, id) : null; }
export function toggleHabit(st, day, id) { return st.habits.some((h) => h.id === id) && validDay(day) ? flip(st.habitLog, day, id) : null; }
export function setReview(st, day, patch) {
  if (!validDay(day)) return null;
  const cur = st.post[day] || { rating: '', mood: '', lesson: '', rule: '', at: 0 };
  const m = normalise({ ...st, post: { [day]: { ...cur, ...patch } } });
  if (!m) return null;
  if (m.post[day]) st.post[day] = m.post[day]; else delete st.post[day];
  return st.post[day] || null;
}
export function addNote(st, o) {
  const text = clipNote(o && o.text), title = clip(o && o.title, 80);
  if ((!text.trim() && !title) || st.notes.length >= MAX.notes) return null;
  const n = { id: newId('n', st.notes), title, text, tags: cleanTags(o.tags), day: validDay(o.day) ? o.day : '', pin: !!o.pin, at: Number.isFinite(o.at) ? o.at : 0 };
  st.notes.push(n); return n;
}
export function updateNote(st, id, patch) { const n = st.notes.find((x) => x.id === id); if (!n) return null; const m = normalise({ ...st, notes: [{ ...n, ...patch, id }] }); if (!m || !m.notes.length) return null; Object.assign(n, m.notes[0]); return n; }
export function removeNote(st, id) { const k = st.notes.length; st.notes = st.notes.filter((n) => n.id !== id); return st.notes.length < k; }
/** the note of a day (what the first Planner's Notes tab edited): one note per day, tagged 'daily' */
export function dayNote(st, day) { return st.notes.find((n) => n.day === day && n.tags.includes('daily')) || null; }
export function setDayNote(st, day, text) {
  if (!validDay(day)) return null;
  const cur = dayNote(st, day), s = clipNote(text);
  if (cur) { if (s.trim()) cur.text = s; else st.notes = st.notes.filter((n) => n !== cur); return cur; }
  return s.trim() ? addNote(st, { text: s, tags: ['daily'], day }) : null;
}
export function allTags(st) { const m = new Map(); for (const n of st.notes) for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); }
export function addChecklist(st, text, key) { const k = key === 'postlist' ? 'postlist' : 'checklist', t = clip(text, MAX.text); if (!t || st[k].length >= MAX.checklist) return null; const c = { id: newId(k === 'postlist' ? 'q' : 'c', st[k]), text: t }; st[k].push(c); return c; }
export function removeChecklist(st, id, key) {
  const k = key === 'postlist' ? 'postlist' : 'checklist', log = k === 'postlist' ? st.postChecks : st.checks, n = st[k].length;
  st[k] = st[k].filter((c) => c.id !== id);
  for (const d of Object.keys(log)) { delete log[d][id]; if (!Object.keys(log[d]).length) delete log[d]; }
  return st[k].length < n;
}
export function addHabit(st, name, perWeek) { const t = clip(name, 80); if (!t || st.habits.length >= MAX.habits) return null; const h = { id: newId('h', st.habits), name: t, perWeek: [1, 2, 3, 4, 5, 6, 7].includes(perWeek) ? perWeek : 7 }; st.habits.push(h); return h; }
export function removeHabit(st, id) {
  const n = st.habits.length; st.habits = st.habits.filter((h) => h.id !== id);
  for (const d of Object.keys(st.habitLog)) { delete st.habitLog[d][id]; if (!Object.keys(st.habitLog[d]).length) delete st.habitLog[d]; }
  return st.habits.length < n;
}
export function logFocus(st, day, mins) { if (!validDay(day) || !(mins > 0)) return; const f = st.focus[day] || (st.focus[day] = { n: 0, min: 0 }); f.n += 1; f.min += Math.round(mins); }

// ------------------------------------------------------------------------------------------------ task views
export function laneOf(t, today) {
  if (t.done) return 'done';
  if (t.day) return t.day <= today ? 'today' : t.lane === 'someday' ? 'someday' : 'next';
  return t.lane === 'someday' || t.lane === 'today' || t.lane === 'next' ? t.lane : 'next';
}
const PRIO_WORD = ['', 'Low', 'Medium', 'High'];
export const prioWord = (p) => PRIO_WORD[p] || '';
const byTask = (a, b) => (b.prio - a.prio) || (a.day || '9999').localeCompare(b.day || '9999') || (a.slot || '99:99').localeCompare(b.slot || '99:99') || a.id.localeCompare(b.id, 'en', { numeric: true });
/** the lanes of top-level tasks with their steps: { today, next, someday, done } each an array of { ...task, subs, subsDone, late } */
export function lanes(st, today, filter) {
  const f = filter || {}, out = { today: [], next: [], someday: [], done: [] };
  const subsOf = new Map();
  for (const t of st.tasks) if (t.parent) { (subsOf.get(t.parent) || subsOf.set(t.parent, []).get(t.parent)).push(t); }
  for (const t of st.tasks) {
    if (t.parent) continue;
    if (f.project && t.project !== f.project) continue;
    if (f.goal && t.goal !== f.goal) continue;
    const subs = (subsOf.get(t.id) || []).slice().sort(byTask), view = { ...t, subs, subsDone: subs.filter((s) => s.done).length, late: !t.done && !!t.day && t.day < today };
    out[laneOf(t, today)].push(view);
  }
  for (const k of ['today', 'next', 'someday']) out[k].sort(byTask);
  out.done.sort((a, b) => (b.day || '').localeCompare(a.day || '') || a.id.localeCompare(b.id, 'en', { numeric: true }));
  return out;
}
export function projectStats(st, id, today) {
  const ts = st.tasks.filter((t) => t.project === id && !t.parent), open = ts.filter((t) => !t.done), late = open.filter((t) => t.day && t.day < today);
  const nextDue = open.filter((t) => t.day).map((t) => t.day).sort()[0] || '';
  return { total: ts.length, done: ts.length - open.length, open: open.length, late: late.length, nextDue, pct: ts.length ? Math.round(((ts.length - open.length) / ts.length) * 100) : 0 };
}
export function goalProgress(st, g) {
  const ts = st.tasks.filter((t) => t.goal === g.id && !t.parent), done = ts.filter((t) => t.done).length;
  return ts.length ? { from: 'tasks', done, total: ts.length, pct: Math.round((done / ts.length) * 100) } : { from: 'manual', done: 0, total: 0, pct: g.pct };
}
/** Argo's goals as stored in argo.goals.v1 (read only): [{ id, name, type, target, text }] ; null when there is nothing usable */
export function argoGoals(raw) {
  const arr = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.goals) ? raw.goals : null;
  if (!arr) return null;
  const out = [];
  for (const g of arr) {
    if (!isObj(g) || !/^[\w-]{1,24}$/.test(String(g.id || '')) || !strc(g.name, 40) || !(num(g.target) > 0)) continue;
    const t = Math.round(num(g.target)), type = String(g.type);
    out.push({ id: String(g.id), name: strc(g.name, 40), type, target: t, text: type === 'paid' ? money(t) + ' paid out' : type === 'month' ? money(t) + ' a month' : type === 'payouts' ? t + ' payout' + (t === 1 ? '' : 's') : type === 'funded' ? t + ' funded account' + (t === 1 ? '' : 's') : String(t) });
  }
  return out.length ? out.slice(0, 12) : null;
}
export const ARGO_STARTERS = [
  { id: 'g1', name: 'First payout', type: 'payouts', target: 1 }, { id: 'g2', name: '$1,000 paid out', type: 'paid', target: 1000 }, { id: 'g3', name: '$5,000 paid out', type: 'paid', target: 5000 },
  { id: 'g4', name: 'Fund 3 accounts', type: 'funded', target: 3 }, { id: 'g5', name: '$10,000 a month', type: 'month', target: 10000 },
];

// ------------------------------------------------------------------------------------------------ day, week, month views
export function streak(st, hid, day) {
  const has = (d) => !!(st.habitLog[d] && st.habitLog[d][hid]);
  let d = has(day) ? day : addDays(day, -1), n = 0;
  while (has(d) && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}
export function bestStreak(st, hid) {
  const days = Object.keys(st.habitLog).filter((d) => st.habitLog[d][hid]).sort();
  let best = 0, run = 0, prev = '';
  for (const d of days) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; if (run > best) best = run; prev = d; }
  return best;
}
export function habitWeek(st, hid, day) { return weekDays(day).map((d) => ({ day: d, done: !!(st.habitLog[d] && st.habitLog[d][hid]) })); }
/** the weekly heatmap: the last `weeks` weeks (oldest first), per habit the days done in each week (0 to 7) and its level 0 to 4 against the habit's goal per week */
export function heatmap(st, today, weeks) {
  const n = weeks || 12, ws = weekStart(today), mondays = [];
  for (let i = n - 1; i >= 0; i--) mondays.push(addDays(ws, -7 * i));
  const rows = st.habits.map((h) => ({
    id: h.id, name: h.name, perWeek: h.perWeek,
    cells: mondays.map((m) => { let c = 0; for (let i = 0; i < 7; i++) if (st.habitLog[addDays(m, i)] && st.habitLog[addDays(m, i)][h.id]) c++; const ratio = c / h.perWeek; return { week: m, n: c, level: c === 0 ? 0 : ratio >= 1 ? 4 : ratio >= 0.75 ? 3 : ratio >= 0.5 ? 2 : 1 }; }),
  }));
  return { weeks: mondays, rows };
}
export function dayView(st, day) {
  const tasks = st.tasks.filter((t) => !t.parent && t.day === day).sort((a, b) => (a.done - b.done) || (a.slot || '99:99').localeCompare(b.slot || '99:99') || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const ck = st.checks[day] || {}, hl = st.habitLog[day] || {}, pk = st.postChecks[day] || {};
  const check = st.checklist.map((c) => ({ id: c.id, text: c.text, done: ck[c.id] === true }));
  const post = st.postlist.map((c) => ({ id: c.id, text: c.text, done: pk[c.id] === true }));
  const habits = st.habits.map((h) => ({ id: h.id, name: h.name, done: hl[h.id] === true, streak: streak(st, h.id, day) }));
  const note = dayNote(st, day);
  return { day, tasks, tasksDone: tasks.filter((t) => t.done).length, check, checkDone: check.filter((c) => c.done).length, post, postDone: post.filter((c) => c.done).length, habits, habitsDone: habits.filter((h) => h.done).length, note: note ? note.text : '', review: st.post[day] || null };
}
export function dayScore(st, day) {
  const v = dayView(st, day), total = v.tasks.length + v.check.length + v.habits.length;
  return total ? Math.round(((v.tasksDone + v.checkDone + v.habitsDone) / total) * 100) : null;
}
/** everything timed or all-day on a day, in order: your events and your tasks with a time: [{ kind, id, title, start, end, allDay, cat, done, repeat }] */
export function agenda(st, day) {
  const items = expand(st.events, day, day).map((o) => ({ kind: 'event', id: o.id, title: o.title, start: o.start, end: o.end, allDay: o.allDay, cat: o.cat, repeat: o.repeat, remind: o.remind, done: false }));
  for (const t of st.tasks) if (!t.parent && t.day === day && t.slot) items.push({ kind: 'task', id: t.id, title: t.text, start: t.slot, end: '', allDay: false, cat: '', repeat: 'none', remind: 0, done: t.done });
  return items.sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title));
}
/** the month grid, six weeks Monday to Sunday: [[{ day, inMonth, today, cats:[...up to 3], n, tasks, risk }]] */
export function monthGrid(st, ym, today, market) {
  const first = `${ym}-01`, start = weekStart(first), cells = [];
  const evs = expand(st.events, start, addDays(start, 41)), by = new Map();
  for (const e of evs) (by.get(e.day) || by.set(e.day, []).get(e.day)).push(e);
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i), list = by.get(d) || [], cats = [];
      for (const e of list) if (!cats.includes(e.cat) && cats.length < 3) cats.push(e.cat);
      row.push({ day: d, inMonth: monthKey(d) === ym, today: d === today, cats, n: list.length, tasks: st.tasks.filter((t) => !t.parent && t.day === d && !t.done).length, risk: market ? marketRisk(marketOn(market, d)) : 'calm' });
    }
    cells.push(row);
  }
  return cells;
}
export function weekView(st, day, today) {
  return weekDays(day).map((d) => {
    const v = dayView(st, d);
    return { day: d, label: shortDay(d), num: dayNum(d), weekend: isWeekend(d), today: d === today, selected: d === day, events: expand(st.events, d, d).length, tasks: v.tasks.length, tasksDone: v.tasksDone, check: v.check.length, checkDone: v.checkDone, habits: v.habits.length, habitsDone: v.habitsDone, hasNote: !!v.note, score: dayScore(st, d) };
  });
}
export function counts(st) { return { tasks: st.tasks.length, events: st.events.length, projects: st.projects.length, habits: st.habits.length, notes: st.notes.length, goals: st.goals.length, checklist: st.checklist.length }; }

// ------------------------------------------------------------------------------------------------ the day's template summaries for Epilogue / Lyceum (planner.sessions.v1)
export function sessionsExport(st, today, nowMs) {
  const days = {}, keep = (d) => d >= addDays(today, -90) && d <= today;
  const all = new Set([...Object.keys(st.checks), ...Object.keys(st.post), ...Object.keys(st.postChecks)]);
  for (const d of [...all].sort()) {
    if (!keep(d)) continue;
    const o = {}, pre = st.checks[d] ? Object.keys(st.checks[d]).filter((k) => st.checklist.some((c) => c.id === k)).length : 0, pc = st.postChecks[d] ? Object.keys(st.postChecks[d]).filter((k) => st.postlist.some((c) => c.id === k)).length : 0;
    if (pre) o.pre = { done: pre, total: st.checklist.length };
    const r = st.post[d];
    if (r || pc) o.post = { rating: r ? r.rating : '', mood: r ? r.mood : '', lesson: r ? r.lesson : '', rule: r ? r.rule : '', done: pc, total: st.postlist.length };
    if (o.pre || o.post) days[d] = o;
  }
  return { v: 1, updated: nowMs || 0, days };
}
// the small summary other OLYMPUS pages may read ('planner.today.v1')
export function todaySummary(st, day, nowMs) {
  const v = dayView(st, day), open = st.tasks.filter((t) => !t.parent && !t.done && t.day && t.day < day);
  const events = (isWeekend(day) ? [] : MARKS.map((w) => ({ title: w.label, start: w.at, end: '', allDay: false })))
    .concat(agenda(st, day).filter((a) => a.kind === 'event').map((a) => ({ title: a.title, start: a.start, end: a.end, allDay: a.allDay })));
  const tasks = v.tasks.map((t) => ({ title: t.text, due: t.day, done: t.done })).concat(open.map((t) => ({ title: t.text, due: t.day, done: false })));
  const projects = st.projects.filter((p) => !p.done).slice(0, 12).map((p) => { const s = projectStats(st, p.id, day); return { name: p.name, open: s.open, late: s.late }; });
  return { v: 1, day, events: events.slice(0, 40), tasks: tasks.slice(0, 60), projects, updated: nowMs || 0 };
}

// ------------------------------------------------------------------------------------------------ the focus timer (25 / 5, a long break of 15 after four)
export const FOCUS = { work: 25, short: 5, long: 15, every: 4 };
export function focusStart(nowMs, phase, round, taskId) {
  const mins = phase === 'work' ? FOCUS.work : phase === 'long' ? FOCUS.long : FOCUS.short;
  return { phase, mins, endsAt: nowMs + mins * 60000, round: round || 1, task: taskId || '', paused: 0 };
}
export function focusLeft(f, nowMs) { if (!f) return 0; const left = f.paused ? f.paused : f.endsAt - nowMs; return Math.max(0, Math.ceil(left / 1000)); }
export function focusPause(f, nowMs) { if (!f || f.paused) return f; return { ...f, paused: Math.max(1, f.endsAt - nowMs) }; }
export function focusResume(f, nowMs) { if (!f || !f.paused) return f; return { ...f, endsAt: nowMs + f.paused, paused: 0 }; }
/** what comes after a finished phase: work -> a short break (a long one after every fourth round), a break -> the next round of work */
export function focusNext(f, nowMs) {
  if (!f) return focusStart(nowMs, 'work', 1);
  if (f.phase === 'work') return focusStart(nowMs, f.round % FOCUS.every === 0 ? 'long' : 'short', f.round, f.task);
  return focusStart(nowMs, 'work', f.phase === 'long' ? 1 : f.round + 1, f.task);
}
export function clockText(sec) { const s = Math.max(0, Math.floor(sec)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }
export function cleanFocus(raw) {
  if (!isObj(raw) || !['work', 'short', 'long'].includes(raw.phase) || !Number.isFinite(raw.endsAt)) return null;
  return { phase: raw.phase, mins: Math.max(1, Math.min(90, Math.round(num(raw.mins) || 25))), endsAt: raw.endsAt, round: Math.max(1, Math.min(99, Math.round(num(raw.round) || 1))), task: typeof raw.task === 'string' ? raw.task.slice(0, 40) : '', paused: Math.max(0, Math.min(5400000, num(raw.paused) || 0)) };
}

// ------------------------------------------------------------------------------------------------ search across everything
/** full-text search: every word must appear (any case, any order); #tag limits to notes with that tag. Returns [{ kind, id, title, sub, day, score }] best first (max 60) */
export function search(st, query, opts) {
  const q = clip(query, 120).toLowerCase(); if (!q) return [];
  const tags = [...q.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]);
  const words = q.replace(/#[\p{L}\p{N}_-]+/gu, ' ').split(/\s+/).filter((w) => w && w !== '#');
  if (!words.length && !tags.length) return [];
  const proj = new Map(st.projects.map((p) => [p.id, p.name])), out = [];
  const add = (kind, id, title, sub, day, hay, tagList) => {
    const h = (title + ' ' + sub + ' ' + hay).toLowerCase(), t = title.toLowerCase();
    if (tags.length && !tags.every((x) => (tagList || []).includes(x))) return;
    if (!words.every((w) => h.includes(w))) return;
    let score = 1; for (const w of words) { if (t === w) score += 6; else if (t.startsWith(w)) score += 4; else if (t.includes(w)) score += 3; else score += 1; }
    out.push({ kind, id, title, sub, day: day || '', score });
  };
  for (const t of st.tasks) add('task', t.id, t.text, (t.done ? 'Done task' : 'Task') + (t.day ? ' · ' + dayLabel(t.day) : '') + (t.project ? ' · ' + proj.get(t.project) : ''), t.day, t.note + ' ' + (proj.get(t.project) || '') + ' ' + prioWord(t.prio), []);
  for (const e of st.events) add('event', e.id, e.title, 'Event · ' + dayLabel(e.day) + (e.start ? ' ' + e.start : ''), e.day, e.note + ' ' + e.cat, []);
  for (const n of st.notes) add('note', n.id, n.title || (n.text.split('\n')[0] || '').slice(0, 60), 'Note' + (n.day ? ' · ' + dayLabel(n.day) : '') + (n.tags.length ? ' · #' + n.tags.join(' #') : ''), n.day, n.text + ' ' + n.tags.join(' '), n.tags);
  for (const p of st.projects) add('project', p.id, p.name, 'Project', '', '', []);
  for (const g of st.goals) add('goal', g.id, g.name, 'Goal' + (g.due ? ' · by ' + dayLabel(g.due) : ''), g.due, g.note, []);
  for (const h of st.habits) add('habit', h.id, h.name, 'Habit', '', '', []);
  for (const c of st.checklist) add('checklist', c.id, c.text, 'Pre-session checklist', '', '', []);
  for (const c of st.postlist) add('checklist', c.id, c.text, 'Post-session review', '', '', []);
  for (const d of Object.keys(st.post)) { const r = st.post[d]; add('review', d, r.lesson || r.rule || 'Session review', 'Session review · ' + dayLabel(d), d, r.lesson + ' ' + r.rule + ' ' + r.rating + ' ' + r.mood, []); }
  return out.sort((a, b) => b.score - a.score || (b.day || '').localeCompare(a.day || '')).slice(0, (opts && opts.max) || 60);
}

// ------------------------------------------------------------------------------------------------ export / import
export function exportText(st, nowMs) { return JSON.stringify({ app: 'planner', v: 2, exported: new Date(nowMs || 0).toISOString(), data: st }, null, 2); }
export function exportName(day) { return `planner-${day}.json`; }
export function icsName(day) { return `planner-${day}.ics`; }
export function parseImport(text) {
  let raw;
  try { raw = JSON.parse(String(text || '').replace(/^﻿/, '')); } catch (_) { return { ok: false, error: 'That is not a Planner file (it is not valid JSON).' }; }
  const data = isObj(raw) && isObj(raw.data) && raw.app === 'planner' ? raw.data : raw;
  const st = migrateAny(data);
  if (!st) return { ok: false, error: 'That file has no Planner plan in it.' };
  if (!st.checklist.length) st.checklist = defaultChecklist();
  if (!st.postlist.length) st.postlist = defaultPostlist();
  return { ok: true, state: st, counts: counts(st), from: detect(data) };
}

// ------------------------------------------------------------------------------------------------ .ics (calendar file for any calendar app)
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  let out = '', cur = '', n = 0;
  for (const ch of line) { const b = ch.length > 1 ? 4 : ch.charCodeAt(0) > 0x7ff ? 3 : ch.charCodeAt(0) > 0x7f ? 2 : 1; if (n + b > 74) { out += cur + '\r\n '; cur = ''; n = 1; } cur += ch; n += b; }
  return out + cur;
}
const ymd8 = (d) => d.replace(/-/g, '');
const hms6 = (hm) => hm.replace(':', '') + '00';
export function utcStamp(ms) { const t = new Date(ms); return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}Z`; }
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:America/New_York', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE'];
/** the events (with their repeats, exceptions and reminders) as an iCalendar text. Timed events carry TZID=America/New_York with the clock-change rules, so a 09:00 repeat stays 09:00. */
export function toICS(st, nowMs) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OLYMPUS//Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Planner', 'X-WR-TIMEZONE:America/New_York', ...VTZ];
  const stamp = utcStamp(nowMs || 0), RR = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
  for (const e of st.events) {
    L.push('BEGIN:VEVENT', `UID:${e.id}-${ymd8(e.day)}@planner.olympus`, `DTSTAMP:${stamp}`);
    if (e.start) {
      L.push(`DTSTART;TZID=America/New_York:${ymd8(e.day)}T${hms6(e.start)}`);
      L.push(`DTEND;TZID=America/New_York:${ymd8(e.day)}T${hms6(e.end || minsHm(Math.min(1439, hmMins(e.start) + 60)))}`);
    } else { L.push(`DTSTART;VALUE=DATE:${ymd8(e.day)}`, `DTEND;VALUE=DATE:${ymd8(addDays(e.day, 1))}`); }
    if (e.repeat !== 'none' && RR[e.repeat]) L.push('RRULE:' + RR[e.repeat] + (e.until ? ';UNTIL=' + (e.start ? utcStamp(etEpoch(e.until, '23:59')) : ymd8(e.until)) : ''));
    if (e.ex.length) L.push(e.start ? `EXDATE;TZID=America/New_York:${e.ex.map((d) => ymd8(d) + 'T' + hms6(e.start)).join(',')}` : `EXDATE;VALUE=DATE:${e.ex.map(ymd8).join(',')}`);
    L.push(`SUMMARY:${icsEsc(e.title)}`);
    if (e.note) L.push(`DESCRIPTION:${icsEsc(e.note)}`);
    L.push(`CATEGORIES:${icsEsc(CATS.find((c) => c.id === e.cat).label)}`);
    if (e.remind) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, `TRIGGER:-PT${e.remind}M`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

// ------------------------------------------------------------------------------------------------ demo
// fixture = { checklist, checkedToday, events:[{ title, off, start, end, cat, repeat, remind }], projects:[{ name, cat }], tasks:[{ text, off, done, slot, prio, lane, project, steps:[{ text, done }] }],
//   habits:[{ name, hits:[days back] }], goals:[{ name, argo, pct }], notes:[{ off, text, title, tags }], review:{ off, rating, mood, lesson, rule }, market:[...], bots:{ line, accounts } }
export function buildDemo(fx, today) {
  if (!isObj(fx) || !validDay(today)) return blankState();
  const st = blankState();
  st.from = 'demo'; st.checklist = []; st.habits = []; st.projects = [];
  (Array.isArray(fx.checklist) ? fx.checklist : []).forEach((t, i) => { if (typeof t === 'string' && t.trim()) st.checklist.push({ id: 'c' + (i + 1), text: clip(t, MAX.text) }); });
  if (!st.checklist.length) st.checklist = defaultChecklist();
  (Array.isArray(fx.checkedToday) ? fx.checkedToday : []).forEach((i) => { const c = st.checklist[i]; if (c) (st.checks[today] || (st.checks[today] = {}))[c.id] = true; });
  (Array.isArray(fx.projects) ? fx.projects : []).forEach((p) => { if (isObj(p) && typeof p.name === 'string') addProject(st, p.name, p.cat); });
  (Array.isArray(fx.goals) ? fx.goals : []).forEach((g) => { if (isObj(g) && typeof g.name === 'string') { const x = addGoal(st, g.name, g.argo); if (x) x.pct = Math.max(0, Math.min(100, Math.round(num(g.pct) || 0))); } });
  (Array.isArray(fx.events) ? fx.events : []).forEach((e) => { if (isObj(e) && typeof e.title === 'string' && Number.isInteger(e.off)) addEvent(st, { ...e, day: addDays(today, e.off) }); });
  (Array.isArray(fx.tasks) ? fx.tasks : []).forEach((t) => {
    if (!isObj(t) || typeof t.text !== 'string') return;
    const pj = st.projects.find((p) => p.name === t.project), g = st.goals.find((x) => x.name === t.goal);
    const x = addTask(st, { text: t.text, day: Number.isInteger(t.off) ? addDays(today, t.off) : '', start: t.slot, prio: t.prio, lane: t.lane, project: pj ? pj.id : '', goal: g ? g.id : '' }, today);
    if (!x) return; x.done = t.done === true;
    for (const s of Array.isArray(t.steps) ? t.steps : []) if (isObj(s) && typeof s.text === 'string') { const y = addTask(st, { text: s.text, day: '', lane: x.lane }, today, { parent: x.id }); if (y) y.done = s.done === true; }
  });
  (Array.isArray(fx.habits) ? fx.habits : []).forEach((h) => {
    if (!isObj(h) || typeof h.name !== 'string') return;
    const x = addHabit(st, h.name, h.perWeek); if (!x) return;
    for (const o of Array.isArray(h.hits) ? h.hits : []) if (Number.isInteger(o)) { const d = addDays(today, -Math.abs(o)); (st.habitLog[d] || (st.habitLog[d] = {}))[x.id] = true; }
  });
  if (!st.habits.length) st.habits = defaultHabits();
  (Array.isArray(fx.notes) ? fx.notes : []).forEach((n) => { if (isObj(n) && typeof n.text === 'string' && Number.isInteger(n.off)) addNote(st, { title: n.title, text: n.text, tags: n.tags || ['daily'], day: addDays(today, n.off) }); });
  if (isObj(fx.review) && Number.isInteger(fx.review.off)) setReview(st, addDays(today, fx.review.off), fx.review);
  return st;
}
