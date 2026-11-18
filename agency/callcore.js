// CALL COPILOT core (team B2, 2026-11-14): the pure part of the cold-call copilot (call.html). No document, no window, no storage, no network:
// the page hands in the rules (callrules.json), the script (callscript.json), the saved state and the clock. The PC twin is agency/calls/core.py
// (tests/test_cold_calls.py checks that both give the same answers). The law behind every limit: docs/COLD_CALLING_RULES.md (not legal advice).
// A human always places the call: this file only says WHEN a call is allowed, WHAT to say, and keeps the record.

export const VERSION = 'c1';
export const KEY = 'agency.calls.v1';
export const DAY = 86400000;
const HOUR = 3600000;
const DOW = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DOW3 = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON3 = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const CALL_KINDS = ['noanswer', 'voicemail', 'callback', 'interested', 'notinterested', 'dnc'];
export const TALK_KINDS = ['callback', 'interested', 'notinterested', 'dnc'];
export const OUTCOMES = [
  { k: 'noanswer', label: 'No answer' }, { k: 'voicemail', label: 'Voicemail' }, { k: 'callback', label: 'Callback time' },
  { k: 'interested', label: 'Interested' }, { k: 'notinterested', label: 'Not interested' }, { k: 'dnc', label: 'Do not call' }];

// ---------------------------------------------------------------------------------------------------- small helpers
const str = (v) => (v == null ? '' : String(v)).trim();
const pad2 = (n) => (n < 10 ? '0' : '') + n;
export const ymd = (y, m, d) => y + '-' + pad2(m) + '-' + pad2(d);
function ymdOf(t) { const x = new Date(t); return ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); }
function splitDate(ds) { const p = String(ds).split('-'); return [+p[0], +p[1], +p[2]]; }
export function addDays(ds, n) { const [y, m, d] = splitDate(ds); return ymdOf(Date.UTC(y, m - 1, d) + n * DAY); }
export function isoWd(ds) { const [y, m, d] = splitDate(ds); return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; }
export function clock(min) { const h = Math.floor(min / 60) % 24, m = min % 60, h12 = h % 12 === 0 ? 12 : h % 12; return h12 + ':' + pad2(m) + (h < 12 ? ' am' : ' pm'); }
export function span(a, b) { return clock(a) + '-' + clock(b); }
export function validEmail(e) { return /^[^\s@?&#<>"',;:()]+@[^\s@?&#<>"',;:()]+\.[A-Za-z]{2,}$/.test(str(e)); }
function fold(s) { return ' ' + String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']+/g, ' ').trim() + ' '; }
function truthy(v) { if (v === true || v === 1) return true; const s = str(v).toLowerCase(); return ['1', 'true', 'yes', 'y', 'on', 'x'].indexOf(s) >= 0; }

// ---------------------------------------------------------------------------------------------------- phones (US / NANP only)
export function normPhone(raw) {
  let s = str(raw);
  if (!s) return '';
  s = s.replace(/\s*(?:ext\.?|extension|x|#)\s*\d{1,6}\s*$/i, '');
  const plus = s.charAt(0) === '+';
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  else if (plus) return '';
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return '';
  return '+1' + d;
}
export function prettyPhone(e164) { const d = str(e164).replace(/^\+1/, ''); return /^\d{10}$/.test(d) ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : str(e164); }
export function areaCode(e164) { const d = str(e164).replace(/^\+1/, ''); return d.length === 10 ? d.slice(0, 3) : ''; }
/** 555-0100 to 555-0199 are the fictional numbers (the DEMO leads): never dialed. */
export function isFictional(e164) { return /^\+1\d{3}55501\d\d$/.test(str(e164)); }
export function telHref(e164) { return e164 && !isFictional(e164) ? 'tel:' + e164 : ''; }
/** A web address from the data (their demo site) only when it is plain http(s): never javascript:, data: or anything else. */
export function safeUrl(u) { const s = str(u); return /^https?:\/\/[^\s"'<>\\]+$/i.test(s) && s.length <= 300 ? s : ''; }

// ---------------------------------------------------------------------------------------------------- states, cities, time zones
export function stateCode(v, rules) {
  const s = str(v);
  if (!s) return '';
  const up = s.toUpperCase().replace(/\./g, '');
  if (up.length === 2 && rules.states[up]) return up;
  const low = s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  for (const k in rules.states) if (rules.states[k].name.toLowerCase() === low) return k;
  if (low === 'washington dc' || low === 'd c') return 'DC';
  return '';
}
const DTF = {};
function dtf(tz) {
  if (!DTF[tz]) DTF[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  return DTF[tz];
}
export function validTz(tz) { if (!tz || typeof tz !== 'string' || tz.indexOf('/') < 0) return false; try { dtf(tz); return true; } catch (e) { return false; } }
const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
/** The wall clock in a time zone: {y, m, d, wd (1 = Monday ... 7 = Sunday), min (minutes after midnight), date 'YYYY-MM-DD'}. */
export function partsIn(ms, tz) {
  const p = {};
  for (const x of dtf(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  let hh = +p.hour; if (hh === 24) hh = 0;
  const y = +p.year, m = +p.month, d = +p.day, mm = +p.minute, ss = +p.second;
  return { y, m, d, hh, mm, ss, wd: WD[p.weekday], min: hh * 60 + mm, date: ymd(y, m, d) };
}
function offsetMin(ms, tz) { const q = partsIn(ms, tz); return Math.round((Date.UTC(q.y, q.m - 1, q.d, q.hh, q.mm, q.ss) - Math.floor(ms / 1000) * 1000) / 60000); }
/** A local date + minutes after midnight in a zone -> the UTC instant (ms). */
export function zonedToUtc(ds, min, tz) {
  const [y, m, d] = splitDate(ds);
  const guess = Date.UTC(y, m - 1, d) + min * 60000;
  const off = offsetMin(guess, tz);
  let t = guess - off * 60000;
  const off2 = offsetMin(t, tz);
  if (off2 !== off) t = guess - off2 * 60000;
  return t;
}
/** Which zone(s) a lead is in: its own tz, else its city in a split state, else every zone of its state (then only the hours legal in all of them). */
export function zonesOf(lead, rules, settings) {
  if (lead && validTz(lead.tz)) return { zones: [lead.tz], how: 'lead', state: stateCode(lead.state, rules) };
  let code = stateCode(lead && lead.state, rules), how = 'state';
  if (!code && settings && stateCode(settings.defaultState, rules)) { code = stateCode(settings.defaultState, rules); how = 'default'; }
  const st = rules.states[code];
  if (!st) return { zones: [], how: 'none', state: '' };
  const city = str(lead && lead.city).toLowerCase();
  const cm = rules.cities && rules.cities[code];
  if (city && cm && cm[city]) return { zones: [cm[city]], how: 'city', state: code };
  return { zones: st.tz.slice(), how: st.tz.length > 1 ? 'split' : how, state: code };
}

// ---------------------------------------------------------------------------------------------------- holidays (federal + observed + the day after Thanksgiving)
const HOL = {};
function nthWd(y, m, wd, n) {
  if (n > 0) { const f = isoWd(ymd(y, m, 1)); return ymd(y, m, 1 + ((wd - f + 7) % 7) + (n - 1) * 7); }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(), lw = isoWd(ymd(y, m, last));
  return ymd(y, m, last - ((lw - wd + 7) % 7));
}
export function holidays(y, policy) {
  const key = y + (policy && policy.dayAfterThanksgiving === false ? 'n' : 'y');
  if (HOL[key]) return HOL[key];
  const out = {};
  for (const [m, d, n] of [[1, 1, "New Year's Day"], [6, 19, 'Juneteenth'], [7, 4, 'Independence Day'], [11, 11, 'Veterans Day'], [12, 25, 'Christmas Day']]) {
    const ds = ymd(y, m, d), w = isoWd(ds);
    out[ds] = n;
    if (w === 6) out[addDays(ds, -1)] = n + ' (observed)';
    if (w === 7) out[addDays(ds, 1)] = n + ' (observed)';
  }
  out[nthWd(y, 1, 1, 3)] = 'Martin Luther King Jr. Day';
  out[nthWd(y, 2, 1, 3)] = "Washington's Birthday";
  out[nthWd(y, 5, 1, -1)] = 'Memorial Day';
  out[nthWd(y, 9, 1, 1)] = 'Labor Day';
  out[nthWd(y, 10, 1, 2)] = 'Columbus Day';
  const tg = nthWd(y, 11, 4, 4);
  out[tg] = 'Thanksgiving';
  if (!policy || policy.dayAfterThanksgiving !== false) out[addDays(tg, 1)] = 'Day after Thanksgiving';
  HOL[key] = out;
  return out;
}
export function holidayName(ds, policy) { const y = +String(ds).slice(0, 4); return holidays(y, policy)[ds] || holidays(y + 1, policy)[ds] || ''; }

// ---------------------------------------------------------------------------------------------------- the legal window of one local day
/** {win: [start, end] minutes, why: ''} or {win: null, why: 'Sunday: no calls'}: federal 8-9 + the state's own window + the copilot's no-Sunday / no-holiday rule. */
export function dayWindow(st, wd, ds, rules) {
  const P = rules.policy, fed = P.fed || [480, 1260];
  if (P.noSunday && wd === 7) return { win: null, why: 'Sunday: no calls' };
  if (P.federalHolidays) { const h = holidayName(ds, P); if (h) return { win: null, why: h + ': no calls' }; }
  let w = st && st.win ? st.win : fed;
  if (st && wd === 6 && Object.prototype.hasOwnProperty.call(st, 'sat')) w = st.sat;
  if (st && wd === 7 && Object.prototype.hasOwnProperty.call(st, 'sun')) w = st.sun;
  if (!w) return { win: null, why: (wd === 7 ? 'Sunday' : 'Saturday') + ': no sales calls in ' + (st ? st.name : 'this state') };
  const s = Math.max(w[0], fed[0]), e = Math.min(w[1], fed[1]);
  return s < e ? { win: [s, e], why: '' } : { win: null, why: 'no legal hours that day' };
}
function legalIn(ms, zones, st, rules) {
  for (const z of zones) {
    const q = partsIn(ms, z), dw = dayWindow(st, q.wd, q.date, rules);
    if (!dw.win) return { ok: false, why: dw.why };
    if (q.min < dw.win[0] || q.min >= dw.win[1]) return { ok: false, why: 'their legal hours are ' + span(dw.win[0], dw.win[1]) + (zones.length > 1 ? ' (' + st.name + ' has two time zones and the city is not known: only hours legal in both count)' : '') };
  }
  return { ok: true, why: '' };
}
/** The legal window of a lead's state as plain words ("8:00 am-8:00 pm, no Sundays or holidays"). */
export function stateWords(code, rules) {
  const st = rules.states[code], P = rules.policy, fed = P.fed || [480, 1260];
  if (!st) return 'Federal: ' + span(fed[0], fed[1]) + ' their time';
  const w = st.win || fed;
  let t = st.name + ': ' + span(Math.max(w[0], fed[0]), Math.min(w[1], fed[1]));
  if (st.sat) t += ', Saturday ' + span(st.sat[0], st.sat[1]);
  if (Object.prototype.hasOwnProperty.call(st, 'sun') && st.sun) t += ', Sunday ' + span(st.sun[0], st.sun[1]);
  if (st.max24) t += ', at most ' + st.max24 + ' calls in 24 hours';
  return t + '. The copilot adds: no Sundays, no holidays, one call a day.';
}

// ---------------------------------------------------------------------------------------------------- trades
const KEYS = new WeakMap();
function tradeKeys(rules) {
  let k = KEYS.get(rules);
  if (!k) { k = []; for (const id in rules.trades) for (const raw of rules.trades[id].keys || []) { const f = fold(raw).trim(); if (f) k.push([id, f]); } KEYS.set(rules, k); }
  return k;
}
/** The trade id of a lead: its own trade when valid, else the longest keyword found in its category, then in its name; 'other' when nothing matches. */
export function tradeOf(lead, rules) {
  const t = str(lead && lead.trade).toLowerCase();
  if (rules.trades[t]) return t;
  const keys = tradeKeys(rules);
  for (const txt of [lead && lead.trade, lead && lead.category, lead && lead.name]) {
    if (!txt) continue;
    const f = fold(Array.isArray(txt) ? txt.join(' ') : txt);
    let best = null, bl = 0;
    for (const [id, k] of keys) {
      const hit = k.length <= 3 ? f.indexOf(' ' + k + ' ') >= 0 : f.indexOf(' ' + k) >= 0;
      if (hit && k.length > bl) { best = id; bl = k.length; }
    }
    if (best) return best;
  }
  return 'other';
}
export function tradeInfo(lead, rules) { return rules.trades[lead && lead.trade] || rules.trades.other; }

// ---------------------------------------------------------------------------------------------------- call windows
/** The next good window for this lead (the trade's window, inside the legal window of every zone), from now: {start, end, date, wd} in UTC ms, or null. */
export function nextWindow(lead, nowMs, rules, settings, Zin) {
  const Z = Zin || zonesOf(lead, rules, settings);
  if (!Z.zones.length) return null;
  const st = rules.states[Z.state] || null, T = tradeInfo(lead, rules), z0 = Z.zones[0];
  const today = partsIn(nowMs, z0).date, n = rules.policy.searchDays || 14;
  for (let i = 0; i < n; i++) {
    const ds = addDays(today, i), wd = isoWd(ds);
    if (T.days.indexOf(wd) < 0) continue;
    const dw = dayWindow(st, wd, ds, rules);
    if (!dw.win) continue;
    let lo = -Infinity, hi = Infinity;
    for (const z of Z.zones) { lo = Math.max(lo, zonedToUtc(ds, dw.win[0], z)); hi = Math.min(hi, zonedToUtc(ds, dw.win[1], z)); }
    if (!(lo < hi)) continue;
    for (const w of T.win) {
      let s = Math.max(lo, zonedToUtc(ds, w[0], z0));
      const e = Math.min(hi, zonedToUtc(ds, w[1], z0));
      if (e <= nowMs) continue;
      if (s < nowMs) s = nowMs;
      if (e - s >= 10 * 60000) return { start: s, end: e, date: ds, wd };
    }
  }
  return null;
}
/** Is now a good time to call this lead? code: 'best' (good window) | 'ok' (legal, not ideal) | 'closed' (outside the legal hours) | 'nozone' (no state). */
export function windowStatus(lead, nowMs, rules, settings) {
  const Z = zonesOf(lead, rules, settings), T = tradeInfo(lead, rules);
  if (!Z.zones.length) return { code: 'nozone', text: 'Add the state: their time zone is unknown, so the copilot cannot check the hours.', legal: false, zones: [], next: null, local: '' };
  const st = rules.states[Z.state] || null, z0 = Z.zones[0], q = partsIn(nowMs, z0);
  const L = legalIn(nowMs, Z.zones, st, rules);
  const inTrade = T.days.indexOf(q.wd) >= 0 && T.win.some((w) => q.min >= w[0] && q.min < w[1]);
  const next = nextWindow(lead, nowMs, rules, settings, Z);
  const local = DOW3[q.wd] + ' ' + clock(q.min);
  const base = { zones: Z.zones, how: Z.how, state: Z.state, local, legal: L.ok, next, allParty: !!(st && st.allParty) };
  const nextWords = next ? ' Best: ' + whenWords(next.start, z0, nowMs) + ' their time.' : '';
  if (L.ok && inTrade) return Object.assign(base, { code: 'best', text: 'Good time to call: ' + local + ' their time.' });
  if (L.ok) return Object.assign(base, { code: 'ok', text: 'Legal now (' + local + ' their time), not the best time for ' + T.plural + ' (avoid ' + T.avoid + ').' + nextWords });
  return Object.assign(base, { code: 'closed', text: 'Not now: ' + L.why + '.' + (next ? ' Next good time: ' + whenWords(next.start, z0, nowMs) + ' their time.' : '') });
}
/** "today 2:00 pm" / "tomorrow 9:30 am" / "Tue Nov 17, 2:00 pm" in a zone. */
export function whenWords(ms, tz, nowMs) {
  const q = partsIn(ms, tz), n = partsIn(nowMs == null ? ms : nowMs, tz);
  if (q.date === n.date) return 'today ' + clock(q.min);
  if (q.date === addDays(n.date, 1)) return 'tomorrow ' + clock(q.min);
  return DOW3[q.wd] + ' ' + MON3[q.m] + ' ' + q.d + ', ' + clock(q.min);
}
export function dateWords(ms, tz) { const q = partsIn(ms, tz); return DOW3[q.wd] + ' ' + MON3[q.m] + ' ' + q.d; }

// ---------------------------------------------------------------------------------------------------- leads in (from team B1's lead finder, a CSV, or by hand)
function pick(o, names) { for (const n of names) { const v = o[n]; if (v != null && (Array.isArray(v) ? v.length : str(v) !== '')) return Array.isArray(v) ? v.join(' ') : v; } return ''; }
function dncWord(v) {
  if (v === true) return 'listed';
  const s = str(v).toLowerCase();
  if (['listed', 'dnc', 'yes', 'y', 'true', '1', 'on', 'blocked', 'registered'].indexOf(s) >= 0) return 'listed';
  if (['clear', 'clean', 'no', 'n', 'false', '0', 'ok', 'checked', 'not listed', 'scrubbed'].indexOf(s) >= 0) return 'clear';
  return 'unchecked';
}
function lineWord(v) {
  const s = str(v).toLowerCase();
  if (/mobile|cell|wireless/.test(s)) return 'mobile';
  if (/business|landline|fixed|office/.test(s)) return 'business';
  if (/voip/.test(s)) return 'voip';
  return 'unknown';
}
// team B1's package price for this lead (setup + monthly, dollars) -> one phrase for the script; '' when there is none
function money0(v) { const n = Math.round(+v); return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function priceOf(setup, monthly) {
  const a = +setup > 0 ? '$' + money0(setup) : '', b = +monthly > 0 ? '$' + money0(monthly) + ' a month' : '';
  return a && b ? a + ' to set up, then ' + b : a || b;
}
// team B1's lead finder grades the current site (site_status): none / bad / fair -> the reason the script gives on the call
function siteIssue(v) {
  const s = str(v).toLowerCase();
  if (s === 'none') return 'you do not have a website yet, so people who search on their phone find a competitor first';
  if (s === 'bad' || s === 'fair') return 'your current site has a few problems that cost you customers on a phone';
  return '';
}
function dateOnly(v) { const s = str(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }
function slug(s) { return fold(s).trim().replace(/ /g, '-').slice(0, 40); }
/** One lead from any shape B1 (or a CSV) gives: flat fields, an address object, OSM tags; unknown fields are ignored. null when there is no name and no phone. */
export function normLead(raw, rules, i) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = Object.assign({}, raw.tags && typeof raw.tags === 'object' ? raw.tags : {}, raw.address && typeof raw.address === 'object' ? raw.address : {}, raw);
  const name = str(pick(src, ['name', 'business', 'business_name', 'businessName', 'company', 'title']));
  const phoneRaw = str(pick(src, ['phone_e164', 'phone', 'phone_number', 'phoneNumber', 'tel', 'telephone', 'formatted_phone_number', 'international_phone_number', 'contact:phone', 'mobile']));
  const phone = normPhone(phoneRaw);
  if (!name && !phone) return null;
  let state = stateCode(pick(src, ['state', 'state_code', 'region', 'province', 'addr:state', 'administrative_area_level_1']), rules);
  let city = str(pick(src, ['city', 'town', 'locality', 'addr:city', 'municipality']));
  const full = str(typeof raw.address === 'string' ? raw.address : pick(src, ['formatted_address', 'full_address', 'address_line', 'addressLine', 'vicinity']));
  if ((!state || !city) && full) {
    const m = /,\s*([^,]+?),\s*([A-Za-z]{2})\s+\d{5}(?:-\d{4})?\b/.exec(full) || /,\s*([^,]+?),\s*([A-Za-z]{2})\s*(?:,|$)/.exec(full);
    if (m) { if (!state) state = stateCode(m[2], rules); if (!city) city = str(m[1]); }
  }
  const tz = str(pick(src, ['tz', 'timezone', 'time_zone']));
  const consentOn = pick(src, ['text_consent', 'textConsent', 'sms_consent', 'consent_text']);
  const ct = raw.consentText && typeof raw.consentText === 'object' && raw.consentText.on ? { on: dateOnly(raw.consentText.on) || str(raw.consentText.on).slice(0, 10), how: str(raw.consentText.how).slice(0, 120) || 'imported' }
    : truthy(consentOn) ? { on: dateOnly(pick(src, ['text_consent_on', 'consent_on'])) || '', how: str(pick(src, ['text_consent_how', 'consent_how'])).slice(0, 120) || 'imported' } : null;
  const email = str(pick(src, ['email', 'e-mail', 'contact:email', 'mail']));
  const lead = {
    id: str(pick(src, ['id', 'lead_id', 'leadId', 'place_id', 'osm_id'])) || (phone ? 'p' + phone.slice(2) : 'n-' + slug(name + ' ' + city) + '-' + (i || 0)),
    name: name || prettyPhone(phone), phone, phoneRaw, contact: str(pick(src, ['contact', 'contact_name', 'contactName', 'owner', 'owner_name', 'manager'])).slice(0, 80),
    email: validEmail(email) ? email : '', website: str(pick(src, ['website', 'url', 'site', 'web', 'contact:website'])).slice(0, 300),
    demo: str(pick(src, ['demo', 'demo_url', 'demoUrl', 'demo_site', 'preview', 'preview_url', 'previewUrl', 'mockup'])).slice(0, 300),
    city: city.slice(0, 80), state, zip: str(pick(src, ['zip', 'postcode', 'postal_code', 'zipcode', 'addr:postcode'])).slice(0, 10), tz: validTz(tz) ? tz : '',
    category: str(pick(src, ['category', 'category_label', 'categories', 'type', 'types', 'industry', 'kind', 'amenity', 'shop', 'craft', 'office', 'healthcare', 'leisure'])).slice(0, 120),
    trade: '', dnc: dncWord(pick(src, ['dnc', 'scrub', 'dnc_status', 'dncStatus'])), dncChecked: dateOnly(pick(src, ['dncChecked', 'dnc_checked', 'scrubbed_on', 'scrubbedOn'])),
    lineType: lineWord(pick(src, ['lineType', 'line_type', 'phone_type', 'phoneType'])), lineConfirmed: dateOnly(pick(src, ['lineConfirmed', 'line_confirmed'])),
    consentText: ct, optout: truthy(pick(src, ['optout', 'opt_out', 'do_not_call', 'doNotCall'])), emailOptOut: truthy(pick(src, ['emailOptOut', 'email_optout', 'unsubscribed'])),
    issue: str(pick(src, ['issue', 'site_issue', 'siteIssue', 'pitch_issue', 'problem'])).slice(0, 200) || siteIssue(pick(src, ['site_status', 'siteStatus'])), source: str(pick(src, ['source', 'found_on', 'via'])).slice(0, 60),
    finder: str(pick(src, ['finder', 'why'])).slice(0, 220),
    price: str(raw.price) || priceOf(pick(src, ['setup', 'setup_price']), pick(src, ['monthly', 'monthly_price'])),
    notes: str(pick(src, ['notes', 'note'])).slice(0, 500), stage: str(raw.stage) || 'new', callbackAt: +raw.callbackAt || 0, demoAt: +raw.demoAt || 0,
  };
  lead.trade = tradeOf({ trade: pick(src, ['trade']), category: lead.category, name: lead.name }, rules);
  return lead;
}
/** Many leads: normalized, the same phone number only once (later copies fill empty fields). */
export function normLeads(list, rules) {
  const out = [], byPhone = {};
  let dupes = 0, skipped = 0;
  (Array.isArray(list) ? list : []).forEach((raw, i) => {
    const L = normLead(raw, rules, i);
    if (!L) { skipped++; return; }
    if (L.phone && byPhone[L.phone]) { fillEmpty(byPhone[L.phone], L); dupes++; return; }
    if (L.phone) byPhone[L.phone] = L;
    out.push(L);
  });
  return { leads: out, dupes, skipped };
}
function fillEmpty(a, b) {
  for (const k in b) if ((a[k] === '' || a[k] == null) && b[k] !== '' && b[k] != null) a[k] = b[k];
  if (b.dnc === 'listed') a.dnc = 'listed';
  if (b.optout) a.optout = true;
  return a;
}

// ---------------------------------------------------------------------------------------------------- Do Not Call, opt-outs and limits
/** 'listed' | 'clear' | 'expired' (checked more than 31 days ago) | 'unchecked'. */
export function dncState(lead, nowMs, rules) {
  if (lead.dnc === 'listed') return 'listed';
  if (lead.dnc !== 'clear') return 'unchecked';
  const t = Date.parse(str(lead.dncChecked) + 'T12:00:00Z');
  return isFinite(t) && nowMs - t <= (rules.policy.dncMaxAgeDays || 31) * DAY ? 'clear' : 'expired';
}
/** Not checked against the registry (or too long ago) and not confirmed as a business line: the call screen asks once before the first dial. */
export function needsConfirm(lead, nowMs, rules) { return dncState(lead, nowMs, rules) !== 'clear' && !lead.lineConfirmed; }
export function attemptTimes(log, id) {
  const out = [];
  for (const e of log || []) if (e.id === id && (e.k === 'dial' || (CALL_KINDS.indexOf(e.k) >= 0 && !e.dial && !e.same))) out.push(e.t);
  return out.sort((a, b) => a - b);
}
function lastOf(log, id, k) { let x = null; for (const e of log || []) if (e.id === id && e.k === k && (!x || e.t > x.t)) x = e; return x; }
export function callbackDue(lead, nowMs) { return lead.stage === 'callback' && lead.callbackAt > 0 && nowMs >= lead.callbackAt - 15 * 60000 && nowMs <= lead.callbackAt + 2 * DAY; }
/** Why this lead must not be called now, or null. Opt-outs, the registry and "not interested" (180 days) lock it; the one-call-a-day rule waits a day. */
export function blockOf(lead, st, nowMs, rules) {
  if (!lead.phone) return { code: 'nophone', text: 'No valid US phone number.' };
  const opt = (st && st.optouts) || [];
  if (lead.optout || lead.stage === 'dnc' || opt.indexOf(lead.phone) >= 0) return { code: 'optout', text: 'Asked not to be called: never call, text or email again.', lock: true };
  if (lead.dnc === 'listed') return { code: 'dnc', text: 'On the National Do Not Call list: do not call (the number may be personal).', lock: true };
  if (lead.stage === 'won') return { code: 'client', text: 'Already a client: no cold calls.' };
  const log = (st && st.log) || [];
  const Z = zonesOf(lead, rules, st && st.settings), tz = Z.zones[0] || 'America/New_York', sr = rules.states[Z.state];
  if (lead.stage === 'notinterested') {
    const ni = lastOf(log, lead.id, 'notinterested'), until = (ni ? ni.t : 0) + (rules.policy.restDays || 180) * DAY;
    if (nowMs < until) return { code: 'rest', text: 'Said not interested: rest until ' + dateWords(until, tz) + '.', until };
  }
  const tries = attemptTimes(log, lead.id);
  const cap = Math.min(rules.policy.cap24h || 3, (sr && sr.max24) || 99);
  if (tries.filter((t) => nowMs - t < DAY && t <= nowMs).length >= cap) return { code: 'cap', text: cap + ' calls in 24 hours: the legal limit. Wait a day.' };
  const today = partsIn(nowMs, tz).date;
  if (tries.filter((t) => partsIn(t, tz).date === today).length >= (rules.policy.maxPerDay || 1) && !callbackDue(lead, nowMs)) return { code: 'today', text: 'Called today already: one call a day. Try tomorrow.' };
  return null;
}

// ---------------------------------------------------------------------------------------------------- the script, filled from the lead
export function fill(tpl, v, script) {
  const F = (script && script.fallback) || {};
  return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, (m, k) => {
    const x = v && v[k] != null ? str(v[k]) : '';
    return x || (F[k] != null ? String(F[k]) : '');
  }).replace(/[ \t]{2,}/g, ' ').replace(/ ([,.?!:])/g, '$1');
}
const TITLES = ['dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'prof'];
/** How to greet a contact: the first name, or the title and last name ("Dr. Anita Patel" -> "Dr. Patel"). */
export function first(s) { const p = str(s).split(/\s+/).filter((x) => x); if (!p.length) return ''; return p.length > 1 && TITLES.indexOf(p[0].toLowerCase().replace(/\.$/, '')) >= 0 ? p[0] + ' ' + p[p.length - 1] : p[0]; }
/** The weekday of this lead's next good window after today ("Tuesday"), or 'tomorrow'. */
export function nextDayName(lead, nowMs, rules, settings) {
  const Z = zonesOf(lead, rules, settings);
  if (!Z.zones.length) return 'tomorrow';
  const z0 = Z.zones[0], today = partsIn(nowMs, z0).date, from = zonedToUtc(addDays(today, 1), 0, z0);
  const nx = nextWindow(lead, from, rules, settings, Z);
  if (!nx) return 'next week';
  return nx.date === addDays(today, 1) ? 'tomorrow' : DOW[nx.wd];
}
export function varsFor(lead, settings, rules, script, nowMs) {
  const S = settings || {}, T = tradeInfo(lead, rules), myPhone = normPhone(S.phone);
  return {
    me: first(S.me) ? str(S.me) : '', myBiz: S.biz, myCity: S.city || lead.city, myPhone: myPhone ? prettyPhone(myPhone) : str(S.phone), myEmail: S.email, myAddress: S.address, mySite: S.site,
    biz: lead.name, contact: lead.contact, contactName: first(lead.contact), contactOrOwner: lead.contact,
    contactAsk: lead.contact ? 'is this ' + first(lead.contact) + '?' : 'could I speak with the owner, please?',
    city: lead.city, plural: T.plural, word: T.word, ask: T.ask, goal: T.goal, hook: T.hook, issue: lead.issue || T.issue, source: lead.source,
    day: nextDayName(lead, nowMs, rules, S), demoOrOffer: lead.demo, price: lead.price || S.price,
    priceLine: str(lead.price) ? 'For ' + lead.name + ' it is ' + str(lead.price) + '. One new customer a month usually covers it.'
      : str(S.price) ? 'My sites for ' + T.plural + ' start at ' + str(S.price) + ', and one new customer a month usually covers it.' : '',
  };
}
export function scriptFor(lead, settings, rules, script, nowMs) {
  const v = varsFor(lead, settings, rules, script, nowMs), f = (t) => fill(t, v, script);
  return {
    opener: f(script.opener), why: f(script.why), questions: script.questions.map(f), close: f(script.close), consent: f(script.consent), book: f(script.book),
    objections: script.objections.map((o) => ({ key: o.key, title: o.title, lines: o.lines.map(f).filter((x) => x) })),
    vm1: f(script.voicemail.vm1), vm2: f(script.voicemail.vm2), vmRule: script.voicemail.rule, vars: v,
  };
}
/** A follow-up email (CAN-SPAM: your name, honest subject, your postal address, an opt-out line). It never sends: href opens your own mail app. */
export function emailFor(lead, key, settings, rules, script, nowMs) {
  const E = script.emails[key];
  if (!E) return { ok: false, why: 'No such email.' };
  if (lead.optout || lead.stage === 'dnc' || lead.emailOptOut) return { ok: false, why: 'They opted out: no emails.' };
  if (!validEmail(lead.email)) return { ok: false, why: 'No email address for this lead yet: ask for it on the call.' };
  if (!str(settings && settings.address)) return { ok: false, why: 'Add your postal address in Settings first: the law (CAN-SPAM) needs it in every sales email.' };
  if (!str(settings && settings.me)) return { ok: false, why: 'Add your name in Settings first: a sales email must say who sends it.' };
  const v = varsFor(lead, settings, rules, script, nowMs), subject = fill(E.subject, v, script), body = fill(E.body, v, script) + fill(script.emailFooter, v, script);
  return { ok: true, subject, body, href: 'mailto:' + lead.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body) };
}
/** A text, only after they said yes on the call (logged). It never sends: href opens your Messages app. */
export function textFor(lead, key, settings, rules, script, nowMs) {
  const t = script.texts[key];
  if (!t) return { ok: false, why: 'No such text.' };
  if (!lead.phone) return { ok: false, why: 'No phone number.' };
  if (lead.optout || lead.stage === 'dnc') return { ok: false, why: 'They opted out: no texts.' };
  if (!lead.consentText || !lead.consentText.on) return { ok: false, why: 'Texts only after they said yes: tap "They said I can text" during the call.' };
  const body = fill(t, varsFor(lead, settings, rules, script, nowMs), script) + script.textFooter;
  return { ok: true, body, href: 'sms:' + lead.phone + '?&body=' + encodeURIComponent(body) };
}

// ---------------------------------------------------------------------------------------------------- outcomes, the record, the follow-up plan
export function emptyState() { return { v: 1, app: 'agency-calls', leads: [], log: [], optouts: [], settings: defaultSettings() }; }
export function defaultSettings() { return { me: '', biz: '', city: '', phone: '', email: '', address: '', site: '', price: '', defaultState: '', myTz: '', targets: null }; }
export function utcDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
export function findLead(st, id) { for (const L of st.leads) if (L.id === id) return L; return null; }
/** Tapping Call: one attempt (the outcome tapped after it joins this attempt). */
export function logDial(st, id, nowMs) { const e = { t: nowMs, id, k: 'dial' }; st.log.push(e); return e; }
/** One-tap outcome. kind: noanswer | voicemail | callback (extra.at) | interested (extra.email, extra.text) | notinterested | dnc; and demo (extra.at) | won | lost | email | text | consent | confirm | note. */
export function applyOutcome(st, id, kind, nowMs, extra) {
  const L = findLead(st, id), x = extra || {};
  if (!L) return null;
  const e = { t: nowMs, id, k: kind };
  if (CALL_KINDS.indexOf(kind) >= 0) {
    // the outcome joins the latest Call tap for this lead in the last 3 hours (a second tap, e.g. No answer then Voicemail, is the same call)
    for (let i = st.log.length - 1; i >= 0; i--) { const d = st.log[i]; if (d.id === id && d.k === 'dial' && nowMs - d.t < 3 * HOUR && nowMs >= d.t) { d.o = kind; e.dial = d.t; break; } }
    // no Call tap (dialed from the phone's own recents): taps within 10 minutes of the last outcome are still that one call
    if (!e.dial) for (let i = st.log.length - 1; i >= 0; i--) { const d = st.log[i]; if (d.id === id && CALL_KINDS.indexOf(d.k) >= 0 && !d.dial && nowMs - d.t < 10 * 60000 && nowMs >= d.t) { e.same = d.same || d.t; break; } }
  }
  if (x.note) { e.note = str(x.note).slice(0, 300); L.notes = (L.notes ? L.notes + ' | ' : '') + e.note; }
  if (kind === 'callback') { e.at = +x.at || 0; L.callbackAt = e.at; L.stage = 'callback'; }
  else if (kind === 'interested') { L.stage = 'interested'; }
  else if (kind === 'notinterested') { L.stage = 'notinterested'; }
  else if (kind === 'dnc') { L.stage = 'dnc'; L.optout = true; L.emailOptOut = true; L.consentText = null; if (L.phone && st.optouts.indexOf(L.phone) < 0) st.optouts.push(L.phone); }
  else if (kind === 'demo') { e.at = +x.at || 0; L.demoAt = e.at; L.stage = 'demo'; }
  else if (kind === 'won') L.stage = 'won';
  else if (kind === 'lost') L.stage = 'lost';
  else if (kind === 'email' || kind === 'text') e.key = str(x.key).slice(0, 8);
  else if (kind === 'consent') { L.consentText = { on: utcDate(nowMs), how: str(x.how).slice(0, 120) || 'said yes on the call' }; }
  else if (kind === 'noconsent') { L.consentText = null; }
  else if (kind === 'confirm') { L.lineConfirmed = utcDate(nowMs); L.lineType = 'business'; }
  else if (kind === 'emailstop') { L.emailOptOut = true; }
  else if ((kind === 'noanswer' || kind === 'voicemail') && (L.stage === 'new' || !L.stage)) L.stage = 'calling';
  if (kind === 'interested' && x.email && validEmail(x.email)) L.email = str(x.email);
  if (kind === 'interested' && x.text) L.consentText = { on: utcDate(nowMs), how: 'said yes on the call' };
  st.log.push(e);
  return e;
}
/** The 7-day plan (rules.cadence) from the first call, in the lead's local dates. next = the first step not done yet (due when its date has come). */
export function cadence(lead, st, nowMs, rules) {
  const stage = lead.stage || 'new';
  if (['dnc', 'won', 'lost', 'notinterested'].indexOf(stage) >= 0) return { steps: [], next: null, stop: stage };
  if (stage === 'interested' || stage === 'demo') return { steps: [], next: { kind: 'demo', label: stage === 'demo' ? 'Demo booked: show the preview, then mark Won or Lost.' : 'Interested: book a 10-minute demo of the preview.', due: nowMs, overdue: false }, stop: null };
  const Z = zonesOf(lead, rules, st.settings), tz = Z.zones[0] || 'America/New_York';
  const tries = attemptTimes(st.log, lead.id);
  const d1 = partsIn(tries.length ? tries[0] : nowMs, tz).date, today = partsIn(nowMs, tz).date;
  const sent = (k, key) => (st.log || []).some((e) => e.id === lead.id && e.k === k && e.key === key);
  let ti = 0;
  const steps = rules.cadence.map((s) => {
    const date = addDays(d1, s.day - 1), from = zonedToUtc(date, 0, tz);
    let done = false;
    if (s.kind === 'call') { while (ti < tries.length && tries[ti] < from) ti++; if (ti < tries.length) { done = true; ti++; } }
    else if (s.kind === 'email') done = sent('email', s.email);
    else done = sent('text', s.text) || sent('email', s.email);
    return { day: s.day, kind: s.kind, label: s.label, vm: s.vm || '', email: s.email || '', text: s.text || '', date, due: from, done };
  });
  const nx = steps.filter((s) => !s.done)[0] || null;
  if (nx) { nx.overdue = nx.date < today; nx.now = nx.date <= today; }
  return { steps, next: nx, stop: nx ? null : 'plan done' };
}
/** The funnel between two instants: dials (attempts: a Call tap, or an outcome logged without one) -> conversations (attempts where they talked) -> interested -> demos -> closes. */
export function funnel(log, fromMs, toMs) {
  const n = { dials: 0, conversations: 0, interested: 0, demos: 0, closes: 0, voicemails: 0, noanswer: 0, callbacks: 0, notinterested: 0, dnc: 0, emails: 0, texts: 0 };
  const att = {}, talk = {};
  for (const e of log || []) {
    if (e.t < fromMs || e.t >= toMs) continue;
    if (e.k === 'dial') att['d' + e.id + '|' + e.t] = 1;
    if (CALL_KINDS.indexOf(e.k) >= 0 && !e.dial && !e.same) att['o' + e.id + '|' + e.t] = 1;
    if (TALK_KINDS.indexOf(e.k) >= 0) talk[e.dial ? 'd' + e.id + '|' + e.dial : 'o' + e.id + '|' + (e.same || e.t)] = 1;
    if (e.k === 'interested') n.interested++;
    if (e.k === 'demo') n.demos++;
    if (e.k === 'won') n.closes++;
    if (e.k === 'voicemail') n.voicemails++;
    if (e.k === 'noanswer') n.noanswer++;
    if (e.k === 'callback') n.callbacks++;
    if (e.k === 'notinterested') n.notinterested++;
    if (e.k === 'dnc') n.dnc++;
    if (e.k === 'email') n.emails++;
    if (e.k === 'text') n.texts++;
  }
  n.dials = Object.keys(att).length;
  n.conversations = Object.keys(talk).length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  n.rates = { talk: pct(n.conversations, n.dials), interest: pct(n.interested, n.conversations), demo: pct(n.demos, n.interested), close: pct(n.closes, n.demos) };
  return n;
}
export function dayStart(nowMs, tz) { return zonedToUtc(partsIn(nowMs, tz).date, 0, tz); }
export function weekStart(nowMs, tz) { const q = partsIn(nowMs, tz); return zonedToUtc(addDays(q.date, 1 - q.wd), 0, tz); }
export function targetsOf(st, rules) { return Object.assign({}, rules.targets, (st.settings && st.settings.targets) || {}); }
/** Every lead with its lock, its window, its DNC state, its callback and its plan; best first (callbacks due, good now, legal now, later, locked). */
export function queue(st, nowMs, rules) {
  const out = [];
  for (const L of st.leads) {
    const block = blockOf(L, st, nowMs, rules);
    const win = block && block.lock ? null : windowStatus(L, nowMs, rules, st.settings);
    const cb = callbackDue(L, nowMs);
    const plan = block && block.lock ? null : cadence(L, st, nowMs, rules);
    const rank = block ? (block.lock ? 9 : 6) : !win || win.code === 'nozone' ? 5 : cb && win.legal ? 0 : win.code === 'best' ? 1 : win.code === 'ok' ? 2 : 3;
    out.push({ lead: L, block, win, cb, plan, dnc: dncState(L, nowMs, rules), confirm: needsConfirm(L, nowMs, rules), rank, nextT: win && win.next ? win.next.start : Infinity });
  }
  out.sort((a, b) => a.rank - b.rank || a.nextT - b.nextT || String(a.lead.name).localeCompare(String(b.lead.name)));
  return out;
}
/** Today's call blocks in YOUR time zone: each trade's good window for its leads that can be called today. */
export function callPlan(st, nowMs, rules, myTz) {
  const groups = {};
  for (const L of st.leads) {
    if (blockOf(L, st, nowMs, rules)) continue;   // locked, resting, or already called today: not in today's plan
    const Z = zonesOf(L, rules, st.settings);
    if (!Z.zones.length) continue;
    const key = L.trade + '|' + Z.zones.join(',');
    if (!groups[key]) groups[key] = { trade: L.trade, zones: Z.zones, state: Z.state, n: 0, lead: L };
    groups[key].n++;
  }
  const out = [], my = validTz(myTz) ? myTz : 'America/New_York', end = dayStart(nowMs, my) + DAY;
  for (const k in groups) {
    const g = groups[k], T = rules.trades[g.trade] || rules.trades.other;
    let t = nowMs;
    for (let i = 0; i < 4; i++) {
      const w = nextWindow(g.lead, t, rules, st.settings, { zones: g.zones, how: 'plan', state: g.state });
      if (!w || w.start >= end) break;
      out.push({ trade: g.trade, label: g.n === 1 ? T.one || T.plural : T.plural, n: g.n, start: w.start, end: w.end, theirs: span(partsIn(w.start, g.zones[0]).min, partsIn(w.end, g.zones[0]).min), mine: span(partsIn(w.start, my).min, partsIn(w.end, my).min), zone: g.zones[0] });
      t = w.end + 60000;
    }
  }
  return out.sort((a, b) => a.start - b.start || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------------------------------- import / export (JSON and CSV; nothing leaves the phone unless you share the file)
export function parseCSV(text) {
  const s = String(text == null ? '' : text).replace(/^﻿/, '');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (q) { if (c === '"') { if (s.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s.charAt(i + 1) === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = (r[i] || '').trim(); }); return o; });
}
function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; }
export function toCSV(st, nowMs, rules) {
  const cols = ['name', 'phone', 'contact', 'email', 'city', 'state', 'trade', 'stage', 'dnc', 'line_confirmed', 'text_consent', 'optout', 'last_outcome', 'last_call', 'callback_at', 'demo', 'website', 'notes'];
  const lines = [cols.join(',')];
  for (const L of st.leads) {
    let last = null;
    for (const e of st.log) if (e.id === L.id && CALL_KINDS.indexOf(e.k) >= 0 && (!last || e.t > last.t)) last = e;
    const v = [L.name, prettyPhone(L.phone), L.contact, L.email, L.city, L.state, L.trade, L.stage, dncState(L, nowMs, rules), L.lineConfirmed, L.consentText ? L.consentText.on : '', L.optout ? 'yes' : '',
      last ? last.k : '', last ? new Date(last.t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '', L.callbackAt ? new Date(L.callbackAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '', L.demo, L.website, L.notes];
    lines.push(v.map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}
export function exportJSON(st, nowMs) { return JSON.stringify({ v: 1, app: 'agency-calls', exported: new Date(nowMs).toISOString(), leads: st.leads, log: st.log, optouts: st.optouts, settings: st.settings }, null, 1); }
// Saved state from the phone's saved text (the page reads it): never throws; junk -> an empty state.
export function loadState(text) {
  const st = emptyState();
  let o = null;
  try { o = JSON.parse(text); } catch (e) { return st; }
  if (!o || typeof o !== 'object') return st;
  if (Array.isArray(o.leads)) st.leads = o.leads.filter((L) => L && typeof L === 'object' && typeof L.id === 'string').slice(0, 5000);
  if (Array.isArray(o.log)) st.log = o.log.filter((e) => e && typeof e === 'object' && typeof e.t === 'number' && typeof e.id === 'string' && typeof e.k === 'string').slice(-20000);
  if (Array.isArray(o.optouts)) st.optouts = o.optouts.map(normPhone).filter((p) => p);
  if (o.settings && typeof o.settings === 'object') { const d = defaultSettings(); for (const k in d) if (o.settings[k] != null) d[k] = k === 'targets' ? o.settings[k] : str(o.settings[k]).slice(0, 300); st.settings = d; }
  return st;
}
/** Anything pasted or picked: the copilot's own export, a call list from the PC (agency/calls/build.py), a JSON list of leads, or a CSV. */
export function parseImport(text, rules) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return { kind: 'empty', leads: [], log: [], optouts: [] };
  if (s.charAt(0) === '{' || s.charAt(0) === '[') {
    let o = null;
    try { o = JSON.parse(s); } catch (e) { return { kind: 'bad', leads: [], log: [], optouts: [], why: 'That is not valid JSON.' }; }
    if (Array.isArray(o)) { const r = normLeads(o, rules); return { kind: 'leads', leads: r.leads, dupes: r.dupes, skipped: r.skipped, log: [], optouts: [] }; }
    const list = Array.isArray(o.leads) ? o.leads : Array.isArray(o.items) ? o.items : Array.isArray(o.rows) ? o.rows : [];
    const r = normLeads(list, rules);
    const own = o.app === 'agency-calls';
    const log = own && Array.isArray(o.log) ? o.log.filter((e) => e && typeof e.t === 'number' && typeof e.id === 'string' && typeof e.k === 'string') : [];
    const optouts = Array.isArray(o.optouts) ? o.optouts.map(normPhone).filter((p) => p) : [];
    return { kind: own ? (o.kind === 'call_list' ? 'call_list' : 'backup') : 'leads', leads: r.leads, dupes: r.dupes, skipped: r.skipped, log, optouts, settings: own && o.settings ? o.settings : null };
  }
  const r = normLeads(parseCSV(s), rules);
  return { kind: 'csv', leads: r.leads, dupes: r.dupes, skipped: r.skipped, log: [], optouts: [] };
}
/** Merge an import into the saved state: new leads are added, known ones (same phone) only get their empty fields filled; opt-outs and the registry flag always win. */
export function mergeImport(st, imp) {
  const byPhone = {}, byId = {}, idMap = {};
  for (const L of st.leads) { if (L.phone) byPhone[L.phone] = L; byId[L.id] = L; }
  let added = 0, updated = 0, n = 0;
  for (const L of imp.leads || []) {
    const old = (L.phone && byPhone[L.phone]) || byId[L.id];
    if (old) { idMap[L.id] = old.id; fillEmpty(old, L); updated++; continue; }
    let id = L.id;
    while (byId[id]) id = L.id + '-' + (++n);
    idMap[L.id] = id; L.id = id;
    st.leads.push(L); byId[id] = L; if (L.phone) byPhone[L.phone] = L; added++;
  }
  const seen = {};
  for (const e of st.log) seen[e.t + '|' + e.id + '|' + e.k] = 1;
  let events = 0;
  for (const e0 of imp.log || []) {
    const e = Object.assign({}, e0, { id: idMap[e0.id] || e0.id }), k = e.t + '|' + e.id + '|' + e.k;
    if (!seen[k] && byId[e.id]) { st.log.push(e); seen[k] = 1; events++; }
  }
  st.log.sort((a, b) => a.t - b.t);
  let opt = 0;
  for (const p of imp.optouts || []) if (st.optouts.indexOf(p) < 0) { st.optouts.push(p); opt++; }
  for (const L of st.leads) if (L.phone && st.optouts.indexOf(L.phone) >= 0) { L.optout = true; }
  return { added, updated, events, optouts: opt };
}
// Leads another OLYMPUS page on this phone left for the copilot (team B1's agency app): the saved text under one of SHARED_KEYS (the page reads it).
export const SHARED_KEYS = ['agency.leads.v1', 'agency.crm.v1', 'agency.v1'];
export const CRM_KEY = 'agency.crm.v1';
/** Team B1's CRM work saved on this phone ({leads: {id: {stage}}}): the stages the copilot must honour, read-only. 'dnc' = Do not contact, 'won' = a client. */
export function crmStages(text) {
  let o = null;
  try { o = JSON.parse(text); } catch (e) { return {}; }
  const out = {}, L = o && typeof o === 'object' && o.leads && typeof o.leads === 'object' && !Array.isArray(o.leads) ? o.leads : {};
  for (const id in L) { const s = L[id] && L[id].stage; if (s === 'dnc' || s === 'won') out[id] = s; }
  return out;
}
/** Apply B1's stages to the copilot's list: Do not contact = opted out for good; won = a client (no cold calls). Returns how many leads changed. */
export function applyCrm(st, stages) {
  let n = 0;
  for (const L of st.leads) {
    const s = stages[L.id];
    if (s === 'dnc' && !(L.optout && L.stage === 'dnc')) { L.optout = true; L.emailOptOut = true; L.consentText = null; L.stage = 'dnc'; if (L.phone && st.optouts.indexOf(L.phone) < 0) st.optouts.push(L.phone); n++; }
    else if (s === 'won' && L.stage !== 'won' && L.stage !== 'dnc') { L.stage = 'won'; n++; }
  }
  return n;
}
export function sharedLeads(text, rules) {
  let o = null;
  try { o = JSON.parse(text); } catch (e) { return []; }
  const list = Array.isArray(o) ? o : o && typeof o === 'object' ? (Array.isArray(o.leads) ? o.leads : Array.isArray(o.items) ? o.items : []) : [];
  return normLeads(list, rules).leads;
}
