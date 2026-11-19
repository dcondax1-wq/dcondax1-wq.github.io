// ORACLE time: the New York clock the bot lives on. Pure functions (unix seconds in, plain values out), no DOM.
//   etParts(t)            -> {y, mo, d, wd (0 = Sunday), h, mi, s, mod}: the ET wall clock (mod = minutes into the day)
//   etToUnix(y, mo, d, h, mi) -> unix seconds of that ET wall time (DST handled)
//   sessionAt(t)          -> the session block (Asia / London / NY / closed) for the clock ring and the HUD
//   litWindow(t, wins)    -> {open, open_t, close_t, in_s}: the LIT entry window (02:00-15:30 ET, weekdays). `wins` are the
//                            PC's own windows (live.json board.lit.windows: holidays and early closes already applied)
//   fmtDur(s), hm(t), dayLabel(t)  -> short texts for the HUD

const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
  weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric',
});
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const LIT_WINDOW = [120, 930];            // 02:00-15:30 ET (engine/live_board.py LIT_WINDOW)
// The clock ring's blocks (ET minutes; Asia wraps past midnight) and their killzones (the lit-up parts).
export const SESSIONS = [
  { key: 'asia', label: 'ASIA', from: 1080, to: 120, kz: [1200, 1440], color: 0xebc262 },
  { key: 'london', label: 'LONDON', from: 120, to: 480, kz: [120, 300], color: 0xebbf59 },
  { key: 'ny', label: 'NEW YORK', from: 480, to: 960, kz: [510, 660], kz2: [810, 960], color: 0xeba741 },
  { key: 'closed', label: 'CLOSED', from: 960, to: 1080, color: 0x524b3a },
];

export function etParts(t) {
  const o = {};
  for (const p of FMT.formatToParts(new Date(t * 1000))) o[p.type] = p.value;
  const h = +o.hour % 24, mi = +o.minute, s = +o.second;
  return { y: +o.year, mo: +o.month, d: +o.day, wd: WD[o.weekday], h, mi, s, mod: h * 60 + mi + s / 60 };
}

export function etToUnix(y, mo, d, h, mi) {
  const wall = Date.UTC(y, mo - 1, d, h, mi) / 1000;
  let t = wall + 5 * 3600;                         // EST guess, then correct by what the ET clock reads there
  for (let k = 0; k < 2; k++) {
    const p = etParts(t);
    t += wall - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) / 1000;
  }
  return Math.round(t);
}

const inSpan = (m, a, b) => (a <= b ? m >= a && m < b : m >= a || m < b);

export function sessionAt(t) {
  const p = etParts(t);
  if (p.wd === 6 || (p.wd === 5 && p.mod >= 1020) || (p.wd === 0 && p.mod < 1080)) return SESSIONS[3];   // weekend
  return SESSIONS.find((s) => inSpan(p.mod, s.from, s.to)) || SESSIONS[3];
}

export function killzoneAt(t) {
  const s = sessionAt(t), m = etParts(t).mod;
  return !!((s.kz && inSpan(m, s.kz[0], s.kz[1])) || (s.kz2 && inSpan(m, s.kz2[0], s.kz2[1])));
}

/** The LIT window now or next: the PC's list when it has one still ahead, else weekdays 02:00-15:30 ET. */
export function litWindow(t, wins) {
  let w = (Array.isArray(wins) ? wins : []).find((x) => x && +x.close_t > t && +x.open_t > 0);
  if (!w) {
    for (let i = 0; i < 8 && !w; i++) {
      const p = etParts(t + i * 86400);
      if (p.wd === 0 || p.wd === 6) continue;
      const o = etToUnix(p.y, p.mo, p.d, 2, 0), c = etToUnix(p.y, p.mo, p.d, 15, 30);
      if (c > t) w = { open_t: o, close_t: c };
    }
  }
  if (!w) return { open: false, open_t: null, close_t: null, in_s: null };
  const open = +w.open_t <= t;
  return { open, open_t: +w.open_t, close_t: +w.close_t, in_s: Math.max(0, Math.round((open ? +w.close_t : +w.open_t) - t)) };
}

export function fmtDur(s) {
  if (s == null || !Number.isFinite(s)) return '–';
  s = Math.max(0, Math.round(s));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

export const hm = (t) => { const p = etParts(t); return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`; };
// a day more than 6 days away gets its date too ("Oct 16"), so an old LAST SEEN never reads as this week (night-feedsB)
export const dayLabel = (t) => {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][etParts(t).wd];
  if (Math.abs(Date.now() / 1000 - t) <= 6 * 86400) return wd;
  try { return new Date(t * 1000).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }); } catch (e) { return wd; }
};
