// The market clock and the weather of the Data City (pure: no three.js, no DOM).
//   etClock(date)      -> { mins (ET clock), dow (0 Sun), mod (minutes since 18:00 ET), label }
//   sunOf(clock)       -> { elev (-1..1), azim, day (0..1), dusk (0..1), session, open }
//     The regular session (09:30-16:00 ET) is a long golden hour (a low sun), dawn before it, dusk after the close, night
//     for Asia and London; the weekend (Friday 17:00 -> Sunday 18:00 ET, market closed) is deep night.
//   weatherOf(vix)     -> { sky, rain (0..1), haze (0..1), storm }: clear under 15, haze 15-20, rain 20-25, a storm at 25+
const SESSIONS = [[0, 'Asia'], [480, 'London'], [780, 'NY pre-open'], [930, 'NY AM'], [1050, 'NY lunch'], [1170, 'NY PM'], [1320, 'closed']];
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let fmt = null;

export function etClock(date = new Date()) {
  try {
    fmt ||= new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
    const mins = (+p.hour % 24) * 60 + +p.minute;
    return { mins, dow: DOW[p.weekday] ?? 1, mod: (mins - 1080 + 1440) % 1440, label: `${String(+p.hour % 24).padStart(2, '0')}:${p.minute} ET` };
  } catch (e) {
    const m = date.getUTCHours() * 60 + date.getUTCMinutes() - 300;                     // EST fallback
    const mins = (m + 1440) % 1440;
    return { mins, dow: date.getUTCDay(), mod: (mins - 1080 + 1440) % 1440, label: '' };
  }
}

/** Is the futures market open at this ET clock (Sunday 18:00 -> Friday 17:00, a break 17:00-18:00 each day)? */
export function marketOpen({ mins, dow }) {
  if (dow === 6) return false;
  if (dow === 5 && mins >= 1020) return false;
  if (dow === 0 && mins < 1080) return false;
  return !(mins >= 1020 && mins < 1080);
}

export function sunOf(clock) {
  const m = clock.mod, open = marketOpen(clock);
  let elev;
  if (!open && (clock.dow === 6 || clock.dow === 0 || (clock.dow === 5 && clock.mins >= 1020))) elev = -0.55;   // the weekend
  // revamp 2026-11-20 (LOOK.md): the regular session 09:30-16:00 ET is a long golden blue hour (a low sun), the rest of the
  // futures day is night (Asia, London), with a dawn before the open and a dusk after the close; the weekend is deep night
  else if (m < 690) elev = NIGHT;                                                      // 18:00-05:30 ET: Asia and London under the stars
  else if (m < 930) elev = NIGHT + (RTH0 - NIGHT) * smooth(690, 930, m);              // 05:30-09:30: the dawn
  else if (m <= 1320) elev = RTH0 + RTH1 * Math.sin(Math.PI * ((m - 930) / 390));     // the session: a low golden sun
  else elev = RTH0 + (NIGHT - RTH0) * smooth(1320, 1390, m);                          // 16:00-17:10: the dusk, then night
  const azim = Math.PI * Math.min(1, m / 1320);
  const day = smooth(-0.06, 0.32, elev), dusk = Math.max(0, 1 - Math.abs(elev) / 0.28);
  const session = [...SESSIONS].reverse().find(([s]) => m >= s)?.[1] || 'Asia';
  return { elev, azim, day, dusk, session: open ? session : 'market closed', open };
}

const NIGHT = -0.35, RTH0 = 0.14, RTH1 = 0.07;
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export function weatherOf(vix) {
  const v = Number.isFinite(+vix) ? +vix : 16;
  if (v < 15) return { sky: 'clear', rain: 0, haze: 0.05, storm: false, vix: v };
  if (v < 20) return { sky: 'haze', rain: 0, haze: 0.35, storm: false, vix: v };
  if (v < 25) return { sky: 'rain', rain: 0.55, haze: 0.55, storm: false, vix: v };
  return { sky: 'storm', rain: Math.min(1, 0.8 + (v - 25) / 40), haze: 0.75, storm: true, vix: v };
}
