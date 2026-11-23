// OLYMPUS DAY (team X2 "connect the day", 2026-11-14): your day from your own calendars, for the Planner, Jarvis's copilot cards and the
// morning briefing. The PC makes the file (tools/calendar_sync.py -> data/day/day.json every 15 minutes) and ONLY the PC's own private link
// serves it (/site/day/day.json, docs/LIVE_DASHBOARD.md + docs/CONNECT_DAY.md); on the public site it is missing and every function here
// says so ("connect your calendars on the PC") instead of guessing. The phone inbox (iOS Shortcut "Add to my day", POST /inbox/day on the
// PC) is the small file /site/day/inbox.json.
// Pure ES module: no DOM, no network, no storage. The pages fetch the files and hand them here. Safari 16: no lookbehind, no .at().
//
//   norm(j) -> D | null                         the day file, checked (kind 'olympus-day')
//   today(D, now) -> view                       { state: ok | old | missing | noday, day, text, notes, tone, work, free, checkAt, events, week, age, calendars }
//   copilotRow(D, now, slot) -> row | null      a line for Jarvis's 01:45 / 10:45 plan and 16:05 summary cards: { text, tone, say }
//   briefLine(D, now) -> { label, text, speak } | null   the morning briefing's Work line (+ weather and headlines when the PC has them)
//   weatherLine(D, now) / headlines(D, now)     the internet feeds the PC fetched (api.weather.gov, the official RSS feeds)
//   inboxItems(j) -> [{ id, kind, text, due, t }]          what you sent from the iPhone (newest last)

export const FILE = '../day/day.json';
export const INBOX_FILE = '../day/inbox.json';
export const OLD_MIN = 90;                 // the PC syncs every 15 minutes: older than 1 h 30 = say how old
export const GONE_H = 36;                  // older than this: too old to trust for today
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 160);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const HM = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TONES = ['ok', 'warn', 'info', 'bad'];
const nowOf = (n) => { const v = n instanceof Date ? n.getTime() : Number(n); return Number.isFinite(v) && v > 0 ? v : Date.now(); };

// ------------------------------------------------------------------------------------------------ New York time
export function etDay(ms) {
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { day: `${p.year}-${p.month}-${p.day}`, mod: (Number(p.hour) % 24) * 60 + Number(p.minute) };
  } catch (_) {
    const y = new Date(ms).getUTCFullYear(), nth = (m0, n) => { const dw = new Date(Date.UTC(y, m0, 1)).getUTCDay(); return 1 + ((7 - dw) % 7) + (n - 1) * 7; };
    const dst = ms >= Date.UTC(y, 2, nth(2, 2), 7) && ms < Date.UTC(y, 10, nth(10, 1), 6), t = new Date(ms + (dst ? -240 : -300) * 60000);
    return { day: t.toISOString().slice(0, 10), mod: t.getUTCHours() * 60 + t.getUTCMinutes() };
  }
}
const mins = (hm) => (HM.test(hm || '') ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) : null);
/** '17:00' -> '5 pm', '12:30' -> '12:30', '09:30' -> '9:30 am' */
export function said(hm) {
  const m = mins(hm); if (m == null) return '';
  if (m === 0 || m === 1440) return 'midnight';
  if (m === 720) return 'noon';
  const h = Math.floor(m / 60) % 24, mi = m % 60, base = `${h % 12 || 12}${mi ? ':' + String(mi).padStart(2, '0') : ''}`;
  return h === 12 ? base : `${base} ${h < 12 ? 'am' : 'pm'}`;
}
export function ageText(min) {
  if (min == null) return '';
  if (min < 2) return 'just now';
  if (min < 90) return `${Math.round(min)} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

// ------------------------------------------------------------------------------------------------ the file
function cleanDay(d) {
  if (!isObj(d)) return null;
  const span = (x) => (isObj(x) && HM.test(x.start || '') && HM.test(x.end || '') ? { start: x.start, end: x.end, mins: num(x.mins) } : null);
  return {
    closed: d.closed === true, text: str(d.text, 220), notes: arr(d.notes).map((n) => str(n, 220)).filter(Boolean).slice(0, 5), tone: TONES.includes(d.tone) ? d.tone : 'info',
    work: arr(d.work).map(span).filter(Boolean).slice(0, 6), free: arr(d.free).map(span).filter(Boolean).slice(0, 12), checkAt: HM.test(d.check_at || '') ? d.check_at : '',
    workMins: num(d.work_mins) || 0, overlap: num(d.overlap_mins) || 0, allDay: arr(d.all_day).map((t) => str(t, 80)).filter(Boolean).slice(0, 6),
  };
}
export function norm(j) {
  if (!isObj(j) || j.kind !== 'olympus-day' || !isObj(j.days)) return null;
  const days = {};
  for (const k of Object.keys(j.days).slice(0, 60)) if (DAY.test(k)) { const c = cleanDay(j.days[k]); if (c) days[k] = c; }
  const events = arr(j.events).filter(isObj).filter((e) => DAY.test(e.day || '')).slice(0, 400).map((e) => ({
    day: e.day, endDay: DAY.test(e.end_day || '') ? e.end_day : e.day, start: HM.test(e.start || '') ? e.start : '', end: HM.test(e.end || '') ? e.end : '', allDay: e.all_day === true, title: str(e.title, 80) || 'Busy',
    cal: str(e.cal, 40), work: e.work === true, busy: e.busy !== false, id: str(e.id, 24),
  }));
  const w = isObj(j.week) ? j.week : {};
  return {
    t: num(j.t), today: DAY.test(j.today || '') ? j.today : '', days, events, connected: j.connected !== false,
    calendars: arr(j.calendars).filter(isObj).slice(0, 12).map((c) => ({ name: str(c.name, 40), ok: c.ok === true, cached: c.cached === true, work: c.work === true, error: str(c.error, 120), events: num(c.events) })),
    week: { line: str(w.line, 400), hours: num(w.work_hours), pay: num(w.pay_week), covers: num(w.covers_pct) },
    weather: isObj(j.weather) ? j.weather : null, headlines: isObj(j.headlines) ? j.headlines : null, demo: j.demo === true, _n: 1,
  };
}

// ------------------------------------------------------------------------------------------------ today
export function today(Din, nowIn) {
  const now = nowOf(nowIn), D = isObj(Din) && Din._n === 1 ? Din : norm(Din), et = etDay(now);
  if (!D) return { state: 'missing', day: et.day, text: 'Connect your calendars once on the PC (tools/bat/CONNECT_DAY.bat): your shifts then show here.', notes: [], tone: 'info', work: [], free: [], checkAt: '', events: [], week: '', age: '', calendars: [] };
  const ageMin = D.t ? Math.max(0, (now - D.t * 1000) / 60000) : null;
  const d = D.days[et.day];
  const events = eventsOn(D, et.day);
  const base = { day: et.day, age: ageText(ageMin), ageMin, calendars: D.calendars, week: D.week.line, events, demo: D.demo };
  if (ageMin != null && ageMin > GONE_H * 60) return { ...base, state: 'old', text: `Your calendars were last read ${ageText(ageMin)}: the PC may be off.`, notes: [], tone: 'warn', work: [], free: [], checkAt: '' };
  if (!d) return { ...base, state: 'noday', text: 'Today is not in your calendar file yet (the PC reads it every 15 minutes).', notes: [], tone: 'info', work: [], free: [], checkAt: '' };
  const late = ageMin != null && ageMin > OLD_MIN;
  return { ...base, state: late ? 'late' : 'ok', text: d.text, notes: d.notes, tone: d.tone, work: d.work, free: d.free, checkAt: d.checkAt, closed: d.closed, allDay: d.allDay,
    workMins: d.workMins, overlap: d.overlap, note: late ? `From your calendars ${ageText(ageMin)}.` : '' };
}
export function eventsOn(Din, day) {
  const D = isObj(Din) && Din._n === 1 ? Din : norm(Din); if (!D) return [];
  return D.events.filter((e) => e.day === day || (e.allDay && e.day <= day && day <= e.endDay)).sort((a, b) => (a.allDay === b.allDay ? (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) : a.allDay ? -1 : 1));
}
const spanTxt = (w) => w.map((x) => `${said(x.start)}-${said(x.end)}`).join(', ');

// ------------------------------------------------------------------------------------------------ Jarvis: the copilot card lines and the morning briefing
export function copilotRow(Din, nowIn, slot) {
  const v = today(Din, nowIn);
  if (v.state === 'missing') return null;                                    // not connected (the public site): the card stays as it was
  if (v.state === 'old' || v.state === 'noday') return { text: `Work: ${v.text}`, tone: 'off', say: "What's my day?" };
  const tone = v.tone === 'warn' ? 'warn' : 'info';
  if (slot === '16:05') {
    const h = v.workMins ? `${Math.round(v.workMins / 6) / 10} h at work today` : 'no work today';
    return { text: `Work: ${h}. ${v.week || ''}`.replace(/\s+/g, ' ').trim(), tone: 'info', say: 'Hours worked vs trading' };
  }
  if (slot === '10:45' && v.work.length && v.checkAt && v.checkAt >= '10:45') {
    const end = v.work[v.work.length - 1].end;
    return { text: `Work: at work until ${said(end)}; check at ${said(v.checkAt)}. The bot trades alone till then.`, tone, say: "What's my day?" };
  }
  return { text: `Work: ${v.text}${v.note ? ' ' + v.note : ''}`, tone, say: "What's my day?" };
}
export function weatherLine(Din, nowIn) {
  const D = isObj(Din) && Din._n === 1 ? Din : norm(Din); if (!D || !isObj(D.weather)) return '';
  const w = D.weather, p = arr(w.periods).filter(isObj)[0];
  if (!p) return '';
  const age = num(w.t) ? (nowOf(nowIn) - w.t * 1000) / 3600000 : null;
  if (age != null && age > 12) return '';
  const alert = arr(w.alerts).filter(isObj)[0];
  const t = num(p.temp), rain = num(p.rain);
  return `${str(w.place, 40) ? str(w.place, 40) + ': ' : ''}${str(p.name, 24) || 'Today'} ${t != null ? t + '°' + (str(p.unit, 2) || 'F') + ', ' : ''}${str(p.short, 80).toLowerCase()}${rain != null && rain >= 20 ? `, ${rain}% rain` : ''}.${alert ? ' Alert: ' + str(alert.event, 60) + '.' : ''}`;
}
export function headlines(Din, nowIn, max) {
  const D = isObj(Din) && Din._n === 1 ? Din : norm(Din); if (!D || !isObj(D.headlines)) return [];
  const now = nowOf(nowIn);
  return arr(D.headlines.items).filter(isObj).filter((h) => !num(h.t) || now - h.t * 1000 < 3 * 86400000).slice(0, max || 3).map((h) => ({ title: str(h.title, 140), source: str(h.source, 40), tags: arr(h.tags).map((x) => str(x, 12)).slice(0, 3) }));
}
export function briefLine(Din, nowIn) {
  const v = today(Din, nowIn);
  if (v.state === 'missing') return null;
  const lines = [];
  lines.push({ k: 'work', label: 'Work', text: v.text + (v.notes && v.notes[0] ? ' ' + v.notes[0] : ''), speak: v.text });
  const w = weatherLine(Din, nowIn);
  if (w) lines.push({ k: 'weather', label: 'Weather', text: w, speak: w.replace(/°F/g, ' degrees').replace(/°C/g, ' degrees') });
  const hl = headlines(Din, nowIn, 2);
  if (hl.length) lines.push({ k: 'news', label: 'Headlines', text: hl.map((h) => h.title + (h.source ? ` (${h.source})` : '')).join('; ') + '.', speak: 'Headlines: ' + hl.map((h) => h.title).join('. ') + '.' });
  return lines;
}

// ------------------------------------------------------------------------------------------------ the phone inbox (iOS Shortcut "Add to my day")
export function inboxItems(j) {
  if (!isObj(j) || j.kind !== 'olympus-inbox') return [];
  return arr(j.items).filter(isObj).slice(-50).map((x) => ({ id: str(x.id, 32), kind: x.type === 'note' ? 'note' : 'task', text: str(x.text, 200), due: DAY.test(x.due || '') ? x.due : '', t: num(x.t) || 0 }))
    .filter((x) => x.id && x.text);
}

// ------------------------------------------------------------------------------------------------ example (?demo=1 only, always labelled)
export function demo(nowIn) {
  const d = etDay(nowOf(nowIn)).day;
  return { v: 1, kind: 'olympus-day', demo: true, t: Math.floor(nowOf(nowIn) / 1000), today: d, connected: true,
    calendars: [{ name: 'Work (example)', ok: true, work: true, events: 5 }],
    days: { [d]: { text: 'You work 9-5 today: the bot trades alone; check at lunch 12:30.', notes: ['At work you miss the 10:45 midday plan: read it at lunch 12:30; the 16:05 day summary: read it after work (5 pm).'], tone: 'warn',
      work: [{ start: '09:00', end: '17:00', mins: 480 }], free: [{ start: '07:00', end: '09:00', mins: 120 }, { start: '17:00', end: '23:00', mins: 360 }], check_at: '12:30', work_mins: 480, overlap_mins: 390 } },
    events: [{ day: d, start: '09:00', end: '17:00', title: 'Shift (example)', cal: 'Work (example)', work: true, busy: true, id: 'demo1' }],
    week: { line: 'Example: this week 32 h at work, about $592 pay. Trading: $0 cash this week. To quit: the paycheck is about $2,565 a month.', work_hours: 32 } };
}
