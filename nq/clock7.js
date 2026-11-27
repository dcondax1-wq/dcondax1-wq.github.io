// MFFU 7-DAY CLOCK (day-nqops 2026-11-21): one row per account: last fill, MFFU's last day, keep-alive on / off. The same rules as
// engine/clock7.py: the PC's "k7" block when its post carries one, else built here from the post's "mf" rows (start day "sd", last
// traded day "lt") + pc.keepalive. MFFU closes an account with no filled trade in 7 calendar days (engine/keepalive.py); an account
// with no fill counts from the day before its start. Pure: no DOM, no network. Jarvis reads window.NQ_K7 (set by nq.js).
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const day = (x) => { const s = String(x || '').slice(0, 10); return DAY_RX.test(s) ? s : null; };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
export const LIMIT = 7, WARN_LEFT = 3, BAD_LEFT = 1;
export const FIRM_LIMIT = { lucid: 30 };      // Lucid: a trade netting >= $1 every 30 calendar days (research/lit/lucid_rules.json)
export const limitFor = (id) => { const a = String(id || '').toLowerCase(); for (const k in FIRM_LIMIT) if (a.startsWith(k)) return FIRM_LIMIT[k]; return LIMIT; };
const LANE_ID = { lit: 'mffu50k_eval', atlas: 'atlas', rapid: 'rapid' };
export const kaId = (k) => LANE_ID[k] || (String(k).startsWith('x:') ? String(k).slice(2) : String(k));

let DAY_FMT = null;
/** the CME trading day of a time (18:00 ET starts the next day) */
export function tradingDay(nowS) {
  const p = (DAY_FMT || (DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }))).format(new Date((nowS + 6 * 3600) * 1000));   // night-nq-speed: one formatter, not one per call
  return p;
}

/** weekdays (CME sessions by trading day) from today to MFFU's last day, both counted */
export function sessionsLeft(today, hard) {
  let n = 0;
  for (let d = today, i = 0; d <= hard && i < 30; d = addDays(d, 1), i++) { const w = new Date(d + 'T12:00:00Z').getUTCDay(); if (w >= 1 && w <= 5) n++; }
  return n;
}

export function row(id, nm, lastFill, start, today, on) {
  const lf = day(lastFill), sd = day(start);
  const base = lf || (sd ? addDays(sd, -1) : null);
  if (!base) return null;
  const lim = limitFor(id), hard = addDays(base, lim), left = diff(hard, today), ses = sessionsLeft(today, hard);
  return { id: String(id), nm: String(nm || id).slice(0, 40), lf, base: lf ? 'fill' : 'start', dl: addDays(base, lim - 1), hard, left, ses, on, lim,
    lvl: left <= BAD_LEFT || ses <= 1 ? 'bad' : left <= WARN_LEFT || ses <= 2 ? 'warn' : 'ok' };
}

/** the rows of a PC post (lite), soonest deadline first; [] when nothing is known */
export function rows(lite, nowS) {
  const L = isObj(lite) ? lite : {}, today = tradingDay(nowS);
  if (isObj(L.k7) && arr(L.k7.a).length) {
    // the PC's own block: "left" is re-counted for today (the post may be from yesterday)
    return arr(L.k7.a).filter((r) => isObj(r) && day(r.hard)).map((r) => {
      const x = row(r.id, r.nm, addDays(r.hard, -limitFor(r.id)), null, today, r.on === undefined ? null : r.on);
      return { ...x, lf: day(r.lf), base: r.base === 'start' ? 'start' : 'fill' };
    }).sort((a, b) => a.left - b.left || a.id.localeCompare(b.id));
  }
  const ka = isObj(L.pc) && isObj(L.pc.keepalive) ? L.pc.keepalive : null;
  const kaLast = {}, onMap = {};
  if (ka) { for (const [k, v] of Object.entries(isObj(ka.last) ? ka.last : {})) if (day(v)) kaLast[kaId(k)] = day(v); for (const [k, v] of Object.entries(isObj(ka.on) ? ka.on : {})) onMap[kaId(k)] = !!v; }
  const out = [];
  for (const a of arr(isObj(L.mf) ? L.mf.a : null)) {
    if (!isObj(a) || !a.id || a.id === 'blitz') continue;
    const f = [day(a.lt), kaLast[a.id]].filter(Boolean).sort().pop() || null;
    const r = row(a.id, a.nm, f, a.sd, today, ka ? !!onMap[a.id] : null);
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.left - b.left || a.id.localeCompare(b.id));
}

const wd = (s) => { const d = new Date(s + 'T12:00:00Z'); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${s.slice(5).replace('-', '/')}`; };
/** plain words for one row */
export function words(r) {
  const when = r.left === 0 ? 'today' : r.left < 0 ? `${-r.left} day${r.left === -1 ? '' : 's'} late` : `in ${r.left} day${r.left === 1 ? '' : 's'}`;
  return { last: r.lf ? `Last fill ${wd(r.lf)}` : 'No fill yet', hard: `${r.lim === FIRM_LIMIT.lucid ? 'Lucid' : 'MFFU'} last day ${wd(r.hard)} (${when}${r.ses != null && r.left >= 0 ? `, ${r.ses} session${r.ses === 1 ? '' : 's'} left` : ''})`,
    ka: r.on === true ? 'Keep-alive ON' : r.on === false ? 'Keep-alive OFF' : 'Keep-alive: not reported',
    act: r.lvl === 'bad' ? 'Needs one filled trade by then: let the bot trade, or 1 MNQ by hand while every account is flat.' : r.lvl === 'warn' ? 'Getting close: a trade this week resets it.' : 'Fine.' };
}

/** the field Jarvis reads: [{id, name, last_fill, mffu_last_day, days_left, keepalive, level}] */
export function jarvis(list) {
  return arr(list).map((r) => ({ id: r.id, name: r.nm, last_fill: r.lf, mffu_last_day: r.hard, days_left: r.left, sessions_left: r.ses, keepalive: r.on, level: r.lvl }));
}
