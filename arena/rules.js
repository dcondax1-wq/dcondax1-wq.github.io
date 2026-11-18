// ARENA rules engine (ES module, no imports, no DOM, no clock): the same events in, the same ranks out.
// The rules themselves are data (rules.json); tools/arena/score.py is the Python twin (tests/test_arena.py checks they agree).
//
//   score(events, R, today)   -> { xp, level, into, level_xp, rank, next, streaks, labours, counts, bySrc, log }
//   pickQuests(day, ctx, R)   -> the day's 3 quests (fewer when nothing is linked on a weekend)
//   verifyQuest(q, facts)     -> { done, why }  from facts the page gathered (sources.js)
//   etDay(date) / addDays(day, n) / weekday(day)   New York calendar helpers
//
// An event: { id (unique), day 'YYYY-MM-DD' (New York), kind (a key of R.xp), src, t? (unix s, order inside a day), note? }.
// XP per event comes only from R.xp[kind].xp, capped per kind per day. No event carries $, size or R into the score.

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------------------------------------------ the calendar
export function etDay(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (k) => (p.find((x) => x.type === k) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function etHour(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d);
  const g = (k) => +((p.find((x) => x.type === k) || {}).value || 0);
  return (g('hour') % 24) + g('minute') / 60;
}
const utc = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
export function addDays(day, n) { return new Date(utc(day) + n * 864e5).toISOString().slice(0, 10); }
export function weekday(day) { return new Date(utc(day)).getUTCDay(); }          // 0 Sunday .. 6 Saturday
export const dayNumber = (day) => Math.round(utc(day) / 864e5);
export const isMarketDay = (day) => { const w = weekday(day); return w >= 1 && w <= 5; };

// ------------------------------------------------------------------------------------------------ events
/** Valid events only (known kind, a real day), one per id, in order: day, then t, then id. */
export function cleanEvents(events, R) {
  const seen = new Set(), out = [];
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || seen.has(e.id)) continue;
    if (!DAY_RX.test(String(e.day)) || !R.xp[e.kind]) continue;
    seen.add(e.id);
    out.push({ id: e.id, day: e.day, kind: e.kind, src: String(e.src || R.xp[e.kind].src), t: Number.isFinite(+e.t) ? +e.t : 0,
      note: typeof e.note === 'string' ? e.note.slice(0, 160) : '' });
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((a, b) => cmp(a.day, b.day) || a.t - b.t || cmp(a.id, b.id));
}

function stepStreak(s, def, e) {
  if (def.type === 'seq') {
    if (def.kinds.includes(e.kind)) { s.cur += 1; s.best = Math.max(s.best, s.cur); s.last = e.day; }
    else if (def.breaks.includes(e.kind)) { s.cur = 0; s.last = e.day; }
    return;
  }
  if (!def.kinds.includes(e.kind) || s.last === e.day) return;          // daily: one per calendar day
  s.cur = s.last && addDays(s.last, 1) === e.day ? s.cur + 1 : 1;
  s.last = e.day;
  s.best = Math.max(s.best, s.cur);
}

function rankOf(xp, R) {
  let i = 0;
  R.ranks.forEach((r, j) => { if (xp >= r.xp) i = j; });
  return i;
}

function labourValue(l, counts, st, xp, R) {
  const m = l.metric || {};
  if (m.count) return counts[m.count] || 0;
  if (m.best) return (st[m.best] || {}).best || 0;
  if (m.rank) { const r = R.ranks.find((x) => x.id === m.rank); return r && xp >= r.xp ? 1 : 0; }
  return 0;
}

// ------------------------------------------------------------------------------------------------ the score
export function score(events, R, today) {
  const evs = cleanEvents(events, R);
  const used = new Map(), counts = {}, bySrc = {}, st = {}, log = [];
  const labours = R.labours.map((l) => ({ id: l.id, n: l.n, name: l.name, task: l.task, goal: l.goal, value: 0, earned: false, day: null }));
  for (const s of R.streaks) st[s.id] = { cur: 0, best: 0, last: null };
  let xp = 0, xpToday = 0;
  for (const e of evs) {
    const rule = R.xp[e.kind], key = e.kind + '|' + e.day, n = used.get(key) || 0;
    used.set(key, n + 1);
    const got = n < rule.cap_day ? rule.xp : 0;
    xp += got;
    if (e.day === today) xpToday += got;
    bySrc[e.src] = (bySrc[e.src] || 0) + got;
    counts[e.kind] = (counts[e.kind] || 0) + 1;
    for (const def of R.streaks) stepStreak(st[def.id], def, e);
    for (const l of labours) {
      if (l.earned) continue;
      const def = R.labours.find((x) => x.id === l.id);
      if (labourValue(def, counts, st, xp, R) >= l.goal) { l.earned = true; l.day = e.day; }
    }
    log.push({ id: e.id, day: e.day, kind: e.kind, src: e.src, xp: got, capped: got === 0 && rule.xp > 0, label: rule.label, note: e.note });
  }
  for (const l of labours) l.value = Math.min(l.goal, labourValue(R.labours.find((x) => x.id === l.id), counts, st, xp, R));
  const streaks = {};
  for (const def of R.streaks) {
    const s = st[def.id];
    // a daily streak stays alive through today (today is not over); a missed day before today ends it
    const alive = def.type === 'seq' || (s.last && (s.last === today || addDays(s.last, 1) === today));
    streaks[def.id] = { id: def.id, name: def.name, unit: def.unit, cur: alive ? s.cur : 0, best: s.best, last: s.last };
  }
  const ri = rankOf(xp, R), lx = R.level_xp;
  const next = R.ranks[ri + 1] ? { ...R.ranks[ri + 1], need: R.ranks[ri + 1].xp - xp } : null;
  return { xp, xpToday, level: 1 + Math.floor(xp / lx), into: xp % lx, level_xp: lx, rank: { ...R.ranks[ri], i: ri }, next,
    streaks, labours, earned: labours.filter((l) => l.earned).length, counts, bySrc, log: log.slice(-60).reverse(), n: evs.length };
}

// ------------------------------------------------------------------------------------------------ quests
/** ctx: { planner, habits, vault, kalshi } (what is linked on this phone) + tasksToday (open + done today). */
export function pickQuests(day, ctx, R) {
  const c = ctx || {};
  const has = { market: isMarketDay(day), planner: !!c.planner, habits: !!c.habits, vault: !!c.vault, kalshi: !!c.kalshi };
  const ok = (q) => (q.needs[0] === '!' ? !has[q.needs.slice(1)] : !!has[q.needs]);
  const pool = R.quests.filter(ok), lane = (x) => pool.filter((q) => q.lane === x);
  const life = lane('life'), k = life.length ? ((dayNumber(day) % life.length) + life.length) % life.length : 0;
  const n = Math.max(1, Math.min(3, Math.floor(+c.tasksToday || 0) || 1));
  return [...lane('trade'), ...life.slice(k), ...life.slice(0, k), ...lane('setup')].slice(0, 3)
    .map((q) => ({ id: q.id, title: q.title.replace('{n}', n), text: q.text.replace('{n}', n), src: q.src, lane: q.lane, n }));
}

/** facts: { day, hour (ET, decimal), beatToday, botDayToday, brokenToday, doneToday, habitToday, noteToday, tomorrowTasks,
 *  kalshiToday, planner, vault } -> { done, why }. Every "done" names what it was checked against. */
export function verifyQuest(q, f) {
  const x = f || {};
  switch (q.id) {
    case 'bots_watch': return x.beatToday || x.botDayToday ? { done: true, why: 'heartbeat seen today' } : { done: false, why: 'no fresh heartbeat today yet' };
    case 'hands_off':
      if ((+x.hour || 0) < 16) return { done: false, why: 'checked after the 15:55 flat' };
      if (x.brokenToday) return { done: false, why: 'a manual order or broken rule today' };
      return x.beatToday || x.botDayToday ? { done: true, why: 'no manual order today, bot ran' } : { done: false, why: 'the bot did not run today' };
    case 'clear_tasks': return { done: (+x.doneToday || 0) >= q.n, why: `${+x.doneToday || 0} of ${q.n} done today` };
    case 'habit': return { done: !!x.habitToday, why: x.habitToday ? 'habit logged today' : 'no habit logged today' };
    case 'daily_note': return { done: !!x.noteToday, why: x.noteToday ? 'daily note found' : 'no daily note for today' };
    case 'plan_tomorrow': return { done: (+x.tomorrowTasks || 0) > 0, why: `${+x.tomorrowTasks || 0} task(s) for tomorrow` };
    case 'kalshi_up': return { done: !!x.kalshiToday, why: x.kalshiToday ? 'feed running today' : 'no running feed today' };
    case 'link_planner': return { done: !!x.planner, why: x.planner ? 'Planner data on this phone' : 'no Planner data yet' };
    case 'link_vault': return { done: !!x.vault, why: x.vault ? 'vault cached on this phone' : 'vault not connected' };
    default: return { done: false, why: 'unknown quest' };
  }
}

/** The quest events for a day: one per verified quest + the sweep when all of them are done (3 quests). */
export function questEvents(day, quests, results) {
  const out = [];
  quests.forEach((q, i) => { if (results[i] && results[i].done) out.push({ id: `quest:${day}:${q.id}`, day, kind: 'quest', src: 'quest', note: `${q.title}: ${results[i].why}` }); });
  if (quests.length === 3 && out.length === 3) out.push({ id: `quest:${day}:sweep`, day, kind: 'quest_sweep', src: 'quest', note: 'All 3 quests' });
  return out;
}
