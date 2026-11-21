// CALLER PORTAL core (day-a11y 2026-11-21): the pure part of portal/index.html. No document, no storage, no network: the page hands in
// the list (calllist.json), the public facts (portal.json), the saved state and the clock. Plan + law: research/writeups/cold-calling-plan-2026-11-20.md
// A real person dials by hand. The rules here are STRICTER than the law: weekdays 9:00-17:00 in the business's time zone, no federal holiday,
// 1 call + 1 follow-up per business, never twice in a day, 'no' / 'do not call' = never again (every channel, once the log reaches the PC).
// Self-contained on purpose: the page must work on the neutral public host with no Olympus file next to it.

export const VERSION = 'p1';
export const KEY = 'agency.portal.v1';
export const DIALS = ['called', 'voicemail', 'interested', 'booked', 'no', 'dnc', 'won'];
export const OUTCOMES = [
  { k: 'called', label: 'Talked' }, { k: 'voicemail', label: 'Voicemail' }, { k: 'interested', label: 'Interested' },
  { k: 'booked', label: 'Booked a call' }, { k: 'no', label: 'No' }, { k: 'dnc', label: 'Do not call' }, { k: 'won', label: 'Won' }];
export const FINAL = { no: 'Said no: never again', dnc: 'Do not call: never again', won: 'Won: Claude takes it from here' };
export const NICHES = ['trades', 'health', 'beauty', 'auto', 'food', 'fitness', 'retail', 'pets', 'home', 'other'];
const DOW3 = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const str = (v) => (v == null ? '' : String(v)).trim();
const pad2 = (n) => (n < 10 ? '0' : '') + n;

export function validEmail(e) { return /^[^\s@?&#<>"',;:()]+@[^\s@?&#<>"',;:()]+\.[A-Za-z]{2,}$/.test(str(e)); }

// ---------------------------------------------------------------------------------------------------- phones
export function normPhone(raw) {
  let d = str(raw).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 && d[0] !== '0' && d[0] !== '1' ? d : '';
}
export function prettyPhone(d) { d = normPhone(d); return d ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : ''; }
export function telHref(d) { d = normPhone(d); return d ? 'tel:+1' + d : ''; }

// ---------------------------------------------------------------------------------------------------- time in the business's zone
const DTF = {};
function dtf(tz) {
  return DTF[tz] || (DTF[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }));
}
export function partsIn(ms, tz) {
  const o = {};
  for (const p of dtf(tz || 'America/New_York').formatToParts(new Date(ms))) o[p.type] = p.value;
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[o.weekday];
  return { date: o.year + '-' + o.month + '-' + o.day, y: +o.year, m: +o.month, d: +o.day, wd, min: (+o.hour % 24) * 60 + +o.minute };
}
function nth(y, m, wd, n) { // n-th weekday (1 = Mon) of month m; n = -1 = the last
  if (n > 0) { const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7 + 1; return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(), lwd = (new Date(Date.UTC(y, m - 1, last)).getUTCDay() + 6) % 7 + 1;
  return last - ((lwd - wd + 7) % 7);
}
function observed(y, m, d) { const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 + 1; const x = new Date(Date.UTC(y, m - 1, d + (wd === 6 ? -1 : wd === 7 ? 1 : 0))); return x.toISOString().slice(0, 10); }
export function holidays(y) {
  const h = {};
  const ymd = (m, d) => y + '-' + pad2(m) + '-' + pad2(d);
  h[observed(y, 1, 1)] = "New Year's Day"; h[ymd(1, nth(y, 1, 1, 3))] = 'Martin Luther King Jr. Day'; h[ymd(2, nth(y, 2, 1, 3))] = "Presidents' Day";
  h[ymd(5, nth(y, 5, 1, -1))] = 'Memorial Day'; h[observed(y, 6, 19)] = 'Juneteenth'; h[observed(y, 7, 4)] = 'Independence Day';
  h[ymd(9, nth(y, 9, 1, 1))] = 'Labor Day'; h[ymd(10, nth(y, 10, 1, 2))] = 'Columbus Day'; h[observed(y, 11, 11)] = 'Veterans Day';
  const tg = nth(y, 11, 4, 4); h[ymd(11, tg)] = 'Thanksgiving'; h[ymd(11, tg + 1)] = 'the day after Thanksgiving'; h[observed(y, 12, 25)] = 'Christmas';
  return h;
}
export function hhmm(min) { const h = Math.floor(min / 60), m = min % 60; return (h % 12 === 0 ? 12 : h % 12) + ':' + pad2(m) + (h < 12 ? ' am' : ' pm'); }

// open now in the business's zone? {open, why, next: words for when it opens}
export function windowAt(nowMs, conf) {
  const tz = (conf && conf.tz) || 'America/New_York', hrs = (conf && conf.hours) || [540, 1020];
  const q = partsIn(nowMs, tz), hol = holidays(q.y)[q.date];
  if (q.wd <= 5 && !hol && q.min >= hrs[0] && q.min < hrs[1]) return { open: true, why: '', closesIn: hrs[1] - q.min };
  for (let i = 0; i < 10; i++) {
    const t = nowMs + i * 86400000, p = partsIn(t, tz);
    if (p.wd > 5 || holidays(p.y)[p.date]) continue;
    if (i === 0 && q.min >= hrs[0]) continue;
    return { open: false, why: hol ? 'Holiday (' + hol + ')' : q.wd > 5 ? 'Weekend' : q.min < hrs[0] ? 'Too early' : 'After hours', next: (i === 0 ? 'today' : i === 1 ? 'tomorrow' : DOW3[p.wd]) + ' ' + hhmm(hrs[0]) };
  }
  return { open: false, why: 'Closed', next: '' };
}

// ---------------------------------------------------------------------------------------------------- the state + the rules per business
export function emptyState() { return { v: 1, app: 'agency-portal', caller: '', log: [], added: [], phones: {}, dnc: [] }; }
export function loadState(text) {
  let j = null;
  try { j = JSON.parse(text || 'null'); } catch (e) { j = null; }
  const s = emptyState();
  if (!j || typeof j !== 'object') return s;
  s.caller = str(j.caller).slice(0, 40);
  s.log = Array.isArray(j.log) ? j.log.filter((e) => e && typeof e === 'object' && typeof e.t === 'number' && str(e.id) && (DIALS.indexOf(e.k) >= 0 || e.k === 'emailed')) : [];
  s.added = Array.isArray(j.added) ? j.added.filter((a) => a && str(a.id) && str(a.name)) : [];
  s.phones = j.phones && typeof j.phones === 'object' ? j.phones : {};
  s.dnc = Array.isArray(j.dnc) ? j.dnc.filter((x) => typeof x === 'string' && x.trim()) : [];
  return s;
}
export function entriesOf(st, id) { return st.log.filter((e) => e.id === id); }
export function phoneOf(lead, st) { return normPhone(lead.phone) || normPhone((st.phones || {})[lead.id]); }

// {ok, tone: go | wait | done | need, why}
export function statusOf(lead, st, nowMs, conf) {
  const tz = (conf && conf.tz) || 'America/New_York';
  const es = entriesOf(st, lead.id), dials = es.filter((e) => DIALS.indexOf(e.k) >= 0);
  const fin = dials.find((e) => FINAL[e.k]);
  if (st.dnc.indexOf(lead.id) >= 0) return { ok: false, tone: 'done', why: FINAL.dnc };
  if (fin) return { ok: false, tone: 'done', why: FINAL[fin.k] };
  if (dials.length >= 2) return { ok: false, tone: 'done', why: 'Done: 1 call + 1 follow-up' };
  if (!phoneOf(lead, st)) return { ok: false, tone: 'need', why: 'Find the number first' };
  const today = partsIn(nowMs, tz).date;
  if (dials.some((e) => partsIn(e.t, tz).date === today)) return { ok: false, tone: 'wait', why: 'Called today: the follow-up is from tomorrow' };
  const w = windowAt(nowMs, conf);
  if (!w.open) return { ok: false, tone: 'wait', why: w.why + ': calls open ' + w.next };
  return { ok: true, tone: 'go', why: dials.length ? 'Follow-up (last call)' : 'First call' };
}

export function logOutcome(st, lead, k, nowMs) {
  if (DIALS.indexOf(k) < 0 && k !== 'emailed') throw new Error('unknown outcome');
  const e = { t: nowMs, id: lead.id, k, caller: st.caller, name: str(lead.name).slice(0, 80), code: str(lead.code) };
  st.log.push(e);
  if (k === 'dnc' || k === 'no') { if (st.dnc.indexOf(lead.id) < 0) st.dnc.push(lead.id); }
  return e;
}
export function undoLast(st, id) { for (let i = st.log.length - 1; i >= 0; i--) if (st.log[i].id === id) { const e = st.log.splice(i, 1)[0]; if ((e.k === 'dnc' || e.k === 'no') && !st.log.some((x) => x.id === id && (x.k === 'dnc' || x.k === 'no'))) st.dnc = st.dnc.filter((x) => x !== id); return e; } return null; }

// ---------------------------------------------------------------------------------------------------- the words + the links
export function identify(caller, agency) { return 'Hi, it\'s ' + (str(caller) || '<your name>') + ' with ' + (str(agency) || '<agency>') + '. We build websites for local businesses.'; }
export function pitch(lead, caller, agency) {
  return identify(caller, agency) + ' I noticed ' + (str(lead.name) || 'your business') + ' doesn\'t have a website, so we built you one. It\'s free to look at. Can I email you the link?';
}
// the banned-address check runs on the PC (agency/public.py) before public_base is written: no private name ships in this file
export function publicBase(conf) { const b = str(conf && conf.public_base).replace(/\/+$/, ''); return /^https:\/\/[^\s"'<>]{4,}$/.test(b) ? b : ''; }
export function siteUrl(lead, conf) {
  const b = publicBase(conf), p = str(lead.site);
  return b && /^f\/[a-z2-9]{8}\/$/.test(p) ? b + '/' + p : '';   // the neutral host serves the sites at <base>/f/<id>/
}
export function mapsUrl(lead) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([lead.name, lead.town, lead.state].map(str).filter(Boolean).join(' ')); }
export function emailFor(lead, caller, conf) {
  const url = siteUrl(lead, conf), pr = (conf && conf.prices) || {};
  const subject = 'The website we built for ' + str(lead.name);
  const body = ['Hi ' + str(lead.name) + ' team,', '',
    'Thanks for talking with me today. Here is the website we built for you, free to look at:', url || '[the link]', '',
    'If you like it, it can be yours this week with your photos and your own domain: ' + (pr.starter || '') + (pr.monthly ? ', or ' + pr.monthly : '') + '.',
    'Just reply to this email with any question.', '',
    str(caller) + ', ' + str(conf && conf.agency), str(conf && conf.postal), '',
    'Not interested? Reply "no thanks" and we won\'t contact you again.'].join('\n');
  return { subject, body, ready: !!(url && validEmail(conf && conf.agency_email) && str(conf && conf.postal).length >= 8 && str(conf && conf.agency) && str(caller)) };
}
export function gmailUrl(conf, to, subject, body) {
  return 'https://mail.google.com/mail/?view=cm&fs=1&authuser=' + encodeURIComponent(str(conf.agency_email)) + '&to=' + encodeURIComponent(str(to)) +
    '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}

// ---------------------------------------------------------------------------------------------------- the list, added businesses, the tally
export function allLeads(list, st) { return (Array.isArray(list) ? list : []).concat(st.added.map((a) => Object.assign({ site: '', code: '', added: true }, a))); }
export function sortForNow(leads, st, nowMs, conf) {
  const rank = { go: 0, need: 1, wait: 2, done: 3 };
  return leads.map((L) => ({ L, s: statusOf(L, st, nowMs, conf) })).sort((a, b) => rank[a.s.tone] - rank[b.s.tone]);
}
export function addBusiness(st, f, nowMs) {
  const name = str(f.name).slice(0, 80), phone = normPhone(f.phone), town = str(f.town).slice(0, 40), niche = NICHES.indexOf(f.niche) >= 0 ? f.niche : 'other';
  if (name.length < 2) return { error: 'Type the business name.' };
  if (!phone) return { error: 'Type a 10-digit US phone number.' };
  if (!town) return { error: 'Type the town.' };
  const dup = st.added.find((a) => normPhone(a.phone) === phone);
  if (dup) return { error: 'Already on your list: ' + dup.name };
  const a = { id: 'add-' + nowMs.toString(36), name, phone, town, state: str(f.state || 'MD').slice(0, 2).toUpperCase(), niche, by: st.caller, t: nowMs };
  st.added.push(a);
  return { lead: a };
}
export function tally(st, conf, fromMs) {
  const c = { calls: 0, talks: 0, interested: 0, booked: 0, won: 0, emailed: 0 };
  for (const e of st.log) {
    if (fromMs && e.t < fromMs) continue;
    if (DIALS.indexOf(e.k) >= 0) c.calls++;
    if (['called', 'interested', 'booked', 'no', 'won'].indexOf(e.k) >= 0) c.talks++;
    if (e.k === 'interested') c.interested++;
    if (e.k === 'booked') c.booked++;
    if (e.k === 'won') c.won++;
    if (e.k === 'emailed') c.emailed++;
  }
  const r = (conf && conf.commission) || { sale: 300, booked_show: 40 };
  c.maybe = c.won * (r.sale || 300) + c.booked * (r.booked_show || 40);
  return c;
}
export function exportDoc(st, nowMs) {
  return { v: 1, app: 'agency-portal', version: VERSION, caller: st.caller, exported: new Date(nowMs).toISOString(), log: st.log, added: st.added, phones: st.phones };
}
