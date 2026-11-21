// AGENCY · OUTREACH core (day-a11y 2026-11-20, the Website Factory's outreach + close kit). Pure: no DOM, no network (node-tested,
// tests/test_web_outreach.py). The page is outreach.js; the words are scripts.json; the leads are ../leads/leads.json.
//
//   ME_DEFAULTS                     the owner's own details as [placeholders]: they are typed on the phone, never in the repo
//   STATUSES                        the status buttons, written to the SAME key as the Leads page ('agency.leads.status.v1' = { id: { s, t } })
//   fill(text, vars)                {key} -> vars[key]; a missing value becomes its [placeholder], never 'undefined'
//   demoFor(lead, sites, base)      the lead's own built site (sites map or lead.demo_url), else the closest niche demo
//   varsFor(lead, me, ctx)          every {key} the scripts use for one lead
//   plan(lead, mark, touches, today)   the next step: { step: 'first' | 'bump' | 'last' | 'wait' | 'done', due, day, label }
//   todays(leads, marks, touches, today, n)   today's list: follow-ups that are due first, then the best untouched leads (heat, phone, score)
//   priceLine(offers)               "Starter site $1,500 + $79 a month, or no upfront: $149 a month for 12 months."
//   normState(raw)                  { v, me: {...}, touches: { id: [{ d, k }] } } with junk dropped
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const str = (x, n) => (typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f<>]/g, ' ').trim().slice(0, n || 200) : '');
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const ME_DEFAULTS = { your_name: '[Your name]', your_business: '[Business name]', your_phone: '[your phone]', your_email: '[your email]',
  postal_address: '[postal address: required in every email]' };
export const STATUSES = [['called', 'Called'], ['voicemail', 'Left voicemail'], ['emailed', 'Emailed'], ['interested', 'Interested'], ['no', 'Not interested'], ['won', 'Won']];
export const NO_UPFRONT = { monthly: 149, months: 12 };
// the niche demos that exist today (../demos/<id>/): the lead's own built site wins when the factory has one
const NICHE_DEMO = { food: 'restaurant', auto: 'detailer', roofing: 'roofer', trades: 'roofer', home: 'roofer', realestate: 'estate', outdoor: 'shed' };

export function fill(text, vars) {
  return String(text || '').replace(/\{([a-z_]+)\}/g, (m, k) => {
    const v = vars && vars[k];
    if (v != null && String(v).trim() !== '') return String(v);
    if (vars && Object.prototype.hasOwnProperty.call(vars, k) && v === '' && !ME_DEFAULTS[k]) return '';   // a known, deliberately empty part (no minimum term)
    return ME_DEFAULTS[k] || `[${k.replace(/_/g, ' ')}]`;
  });
}

export function money(n) { const v = Math.round(+n || 0); return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US'); }

export function demoFor(lead, sites, base) {
  // the PUBLIC base only (portal.json public_base, a neutral host): never this page's own address, which can be the owner's private dashboards
  const b = /^https:\/\/[^\s"'<>]{4,}$/.test(String(base || '')) ? String(base).replace(/\/+$/, '') : '';   // checked on the PC (agency/public.py)
  const own = (isObj(sites) && sites[lead && lead.id]) || (lead && lead.demo_url);
  if (!b && !(own && String(own).startsWith('https://'))) return { url: '[the site link: set public_base first]', own: !!own };
  if (own && /^f\/[a-z2-9]{8}\/$/.test(own)) return { url: b + '/' + own, own: true };   // the neutral host: <base>/f/<id>/
  if (own && /^(https:\/\/|\.\.\/|\/)/.test(own)) return { url: own.startsWith('https://') ? own : b + '/agency/' + own.replace(/^(\.\.\/)+/, '').replace(/^\/?agency\//, ''), own: true };
  const d = NICHE_DEMO[(lead && lead.niche) || ''] || '';
  return { url: b + '/agency/demos/' + (d ? d + '/' : ''), own: false };
}

function nicheWords(L) {
  const c = String((L && (L.category || L.trade)) || '').replace(/_/g, ' ').trim();
  if (c && c !== 'yes') return c === 'fast food' ? 'food' : c;
  return String((L && L.niche_name) || 'a local business').toLowerCase();
}

export function priceLine(offers) {
  const P = (isObj(offers) && Array.isArray(offers.packages) ? offers.packages : []);
  const s = P.find((p) => p && p.id === 'starter') || { price: 1500, monthly: 79 };
  return `Starter site ${money(s.price)} + ${money(s.monthly)} a month for hosting and small edits, or no upfront: ${money(NO_UPFRONT.monthly)} a month for ${NO_UPFRONT.months} months.`;
}

export function varsFor(lead, me, ctx) {
  const L = lead || {}, M = Object.assign({}, isObj(me) ? me : {}), c = ctx || {};
  const demo = demoFor(L, c.sites, c.base);
  return Object.assign({}, M, {
    business: str(L.name, 80) || 'your business', town: str(L.town || L.city, 60) || 'your town', niche: nicheWords(L),
    demo: demo.url, demo_short: demo.url.replace(/^https?:\/\//, ''), demo_own: demo.own, offer_line: priceLine(c.offers),
  });
}

// ------------------------------------------------------------------------------------------------ dates (plain YYYY-MM-DD)
export function addDays(iso, n) {
  if (!ISO.test(iso || '')) return '';
  const p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

/** the follow-up rhythm: day 0 (first email or call), day 3 (short follow-up), day 7 (last note), then stop */
export function plan(lead, mark, touches, today) {
  const s = (mark && mark.s) || '';
  if (s === 'no') return { step: 'done', due: '', label: 'Not interested: never contact again' };
  if (s === 'won') return { step: 'done', due: '', label: 'Won: run the delivery checklist' };
  const T = (Array.isArray(touches) ? touches : []).filter((t) => t && ISO.test(t.d)).sort((a, b) => (a.d < b.d ? -1 : 1));
  if (s === 'interested') return { step: 'close', due: today, label: 'Interested: send the agreement and the deposit invoice' };
  if (!T.length) return { step: 'first', due: today, day: 0, label: 'Day 0: first email or call' };
  const d0 = T[0].d, done = new Set(T.map((t) => t.k));
  if (!done.has('bump')) { const due = addDays(d0, 3); return { step: due <= today ? 'bump' : 'wait', due, day: 3, label: due <= today ? 'Day 3: short follow-up is due' : `Day 3 follow-up on ${due}` }; }
  if (!done.has('last')) { const due = addDays(d0, 7); return { step: due <= today ? 'last' : 'wait', due, day: 7, label: due <= today ? 'Day 7: last note is due' : `Day 7 last note on ${due}` }; }
  return { step: 'done', due: '', label: 'Done: 3 touches, no answer. Leave them be.' };
}

const HEAT = { hot: 0, warm: 1, cold: 2 };
/** today's list: anything due (close / follow-ups) first, oldest due first; then untouched leads, hot first, a phone first, the best score */
export function todays(leads, marks, touches, today, n = 20) {
  const M = isObj(marks) ? marks : {}, T = isObj(touches) ? touches : {};
  const rows = (Array.isArray(leads) ? leads : []).filter((L) => L && L.id && L.name).map((L) => ({ L, p: plan(L, M[L.id], T[L.id], today) }));
  const due = rows.filter((r) => ['close', 'bump', 'last'].includes(r.p.step)).sort((a, b) => (a.p.step === 'close' ? -1 : 0) - (b.p.step === 'close' ? -1 : 0) || (a.p.due < b.p.due ? -1 : 1));
  const fresh = rows.filter((r) => r.p.step === 'first').sort((a, b) => (HEAT[a.L.heat] ?? 3) - (HEAT[b.L.heat] ?? 3) || (!!b.L.phone - !!a.L.phone) || ((+b.L.score || 0) - (+a.L.score || 0)) || String(a.L.name).localeCompare(String(b.L.name)));
  return due.concat(fresh).slice(0, n);
}

export function emptyState() { return { v: 1, me: {}, touches: {}, checks: {} }; }
export function normState(raw) {
  const s = isObj(raw) ? raw : {}, o = emptyState();
  if (isObj(s.me)) for (const k of Object.keys(ME_DEFAULTS)) { const v = str(s.me[k], 160); if (v) o.me[k] = v; }
  if (isObj(s.touches)) for (const id of Object.keys(s.touches).slice(0, 2000)) {
    const list = (Array.isArray(s.touches[id]) ? s.touches[id] : []).filter((t) => isObj(t) && ISO.test(t.d) && /^(first|bump|last|call|vm)$/.test(t.k)).slice(0, 20).map((t) => ({ d: t.d, k: t.k }));
    if (list.length && /^[\w:.-]{1,80}$/.test(id)) o.touches[id] = list;
  }
  if (isObj(s.checks)) for (const k of Object.keys(s.checks).slice(0, 200)) if (/^[\w:.-]{1,80}$/.test(k) && s.checks[k] === true) o.checks[k] = true;
  return o;
}

/** the step a tap on Called / Left voicemail / Emailed records: the one the plan says is next (first / bump / last) */
export function emailStep(p) { return p && (p.step === 'bump' || p.step === 'last') ? p.step : p && p.step === 'wait' ? (p.day === 7 ? 'last' : 'bump') : 'first'; }

// ------------------------------------------------------------------------------------------------ the PC's email autopilot (counts only)
/** the PC report's "am" card (agency/autopilot/card.py: t, m, n, c, f, r, i, s, q) -> the page's names; numbers only, anything else dropped */
export function parseCard(am) {
  if (!isObj(am) || !(+am.t > 0)) return null;
  const n = (k) => Math.max(0, Math.round(+am[k] || 0));
  return { t: +am.t, mode: ['off', 'dry', 'live'].includes(am.m) ? am.m : 'off', new: n('n'), cap: n('c') || 20, followup: n('f'), replies_today: n('r'),
    interested: n('i'), suppressed: n('s'), queue: n('q') };
}
// inbound only (lead 2026-11-20/21): the AI assistant answers calls, it never rings anyone; voice only (no texts), and only while the PC runs it
export function callLine(agencyNumber) { const n = String(agencyNumber == null ? '' : agencyNumber).trim(); return n ? 'Questions? Call ' + n + ': our AI assistant answers.' : ''; }
