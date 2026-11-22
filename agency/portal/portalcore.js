// CALLER PORTAL core (day-a11y 2026-11-21): the pure part of portal/index.html. No document, no storage, no network: the page hands in
// the list (calllist.json), the public facts (portal.json), the saved state and the clock. Plan + law: research/writeups/cold-calling-plan-2026-11-20.md
// A real person dials by hand. The rules here are STRICTER than the law: weekdays 9:00-17:00 in the business's time zone, no federal holiday,
// 1 call + 1 follow-up per business, never twice in a day, 'no' / 'do not call' = never again (every channel, once the log reaches the PC).
// Self-contained on purpose: the page must work on the neutral public host with no Olympus file next to it.

export const VERSION = 'p4';
export const KEY = 'agency.portal.v1';
export const DIALS = ['called', 'voicemail', 'interested', 'booked', 'no', 'dnc', 'won'];
export const OUTCOMES = [
  { k: 'called', label: 'Talked' }, { k: 'voicemail', label: 'Voicemail' }, { k: 'interested', label: 'Interested' },
  { k: 'booked', label: 'Booked a call' }, { k: 'no', label: 'No' }, { k: 'dnc', label: 'Do not call' }, { k: 'won', label: 'Won' }];
// log lines that are not calls: an email sent, a proposal sent, the proposal's follow-up email sent
export const NOTES = ['emailed', 'proposal', 'fu_email'];
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
export function emptyState() { return { v: 1, app: 'agency-portal', caller: '', log: [], added: [], phones: {}, dnc: [], dncCheck: {} }; }
export function loadState(text) {
  let j = null;
  try { j = JSON.parse(text || 'null'); } catch (e) { j = null; }
  const s = emptyState();
  if (!j || typeof j !== 'object') return s;
  s.caller = str(j.caller).slice(0, 40);
  s.log = Array.isArray(j.log) ? j.log.filter((e) => e && typeof e === 'object' && typeof e.t === 'number' && str(e.id) && (DIALS.indexOf(e.k) >= 0 || NOTES.indexOf(e.k) >= 0)) : [];
  s.added = Array.isArray(j.added) ? j.added.filter((a) => a && str(a.id) && str(a.name)) : [];
  s.phones = j.phones && typeof j.phones === 'object' ? j.phones : {};
  s.dnc = Array.isArray(j.dnc) ? j.dnc.filter((x) => typeof x === 'string' && x.trim()) : [];
  s.dncCheck = {};
  if (j.dncCheck && typeof j.dncCheck === 'object') for (const k of Object.keys(j.dncCheck)) if (DNC_STATES.indexOf(j.dncCheck[k]) >= 0) s.dncCheck[k] = j.dncCheck[k];
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
  if (dncOf(lead, st) === 'listed') return { ok: false, tone: 'done', why: 'On the National Do Not Call list: never call' };
  if (fin) return { ok: false, tone: 'done', why: FINAL[fin.k] };
  const ps = proposalStep(lead, st, nowMs, conf);
  if (ps) return ps;
  if (dials.length >= 2) return { ok: false, tone: 'done', why: 'Done: 1 call + 1 follow-up' };
  if (!phoneOf(lead, st)) return { ok: false, tone: 'need', why: 'Find the number first' };
  const today = partsIn(nowMs, tz).date;
  if (dials.some((e) => partsIn(e.t, tz).date === today)) { const f0 = followUpDay(dials[dials.length - 1], tz); return { ok: false, tone: 'wait', why: 'Called today: the follow-up comes back ' + dayWords(f0, today) }; }
  const fu = dials.length ? followUpDay(dials[dials.length - 1], tz) : '';
  if (fu && today < fu) return { ok: false, tone: 'wait', why: 'Follow-up ' + dayWords(fu, today) + ' (' + (FOLLOW[dials[dials.length - 1].k] || [1])[1] + ')' };
  const w = windowAt(nowMs, conf);
  if (!w.open) return { ok: false, tone: 'wait', why: w.why + ': calls open ' + w.next };
  return { ok: true, tone: 'go', why: dials.length ? 'Follow-up due (last call)' : 'First call', due: !!dials.length };
}

// ---------------------------------------------------------------------------------------------------- tomorrow's dialing session (2026-11-22)
// when the follow-up comes back after each outcome, in weekdays (never a weekend or a holiday): a voicemail in 2, "talked, not now" in 5,
// "interested" in 2 (they had the email); the rest end the business (no / do not call / won) or need no call (booked: the meeting is set)
export const FOLLOW = { voicemail: [2, 'after a voicemail'], called: [5, 'after a talk'], interested: [2, 'after the email'] };
export function addWorkdays(ds, n) {
  let [y, m, d] = ds.split('-').map(Number), left = n;
  while (left > 0) {
    const t = new Date(Date.UTC(y, m - 1, d + 1)); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
    const wd = t.getUTCDay(), iso = t.toISOString().slice(0, 10);
    if (wd !== 0 && wd !== 6 && !holidays(y)[iso]) left--;
  }
  return y + '-' + pad2(m) + '-' + pad2(d);
}
export function followUpDay(e, tz) { const f = FOLLOW[e && e.k]; return f ? addWorkdays(partsIn(e.t, tz).date, f[0]) : '9999-12-31'; }
function dayWords(ds, today) {
  if (ds === '9999-12-31') return 'never (no follow-up for that outcome)';
  if (ds === addWorkdays(today, 1) && ds === new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)) return 'tomorrow';
  const t = new Date(ds + 'T12:00:00Z'); return 'on ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getUTCDay()] + ' ' + MON[t.getUTCMonth()] + ' ' + t.getUTCDate();
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// the best hours to reach each kind of business (owner's lead 2026-11-22), clipped to the portal's own calling hours (conf.hours, 9-5 their time)
export const BEST = { food: [[840, 960]], trades: [[420, 540], [960, 1080]], home: [[420, 540], [960, 1080]], retail: [[600, 720]],
  health: [[600, 720], [840, 960]], beauty: [[600, 720]], auto: [[540, 660], [840, 960]], fitness: [[600, 720], [840, 960]], pets: [[600, 720]], other: [[600, 720], [840, 960]] };
export function bestWindows(lead, conf) {
  const hrs = (conf && conf.hours) || [540, 1020], w = BEST[str(lead && lead.niche)] || BEST.other;
  return w.map(([a, b]) => [Math.max(a, hrs[0]), Math.min(b, hrs[1])]).filter(([a, b]) => b > a);
}
export function inBest(lead, nowMs, conf) { const q = partsIn(nowMs, (conf && conf.tz) || 'America/New_York'); return bestWindows(lead, conf).some(([a, b]) => q.min >= a && q.min < b); }
export function bestWords(lead, conf) { const w = bestWindows(lead, conf); return w.length ? w.map(([a, b]) => hhmm(a) + '-' + hhmm(b)).join(', ') : 'any time in calling hours'; }
// TODAY: the first n callable leads for this hour: follow-ups due today first, then the ones in their best window now, then the rest (the list's order)
export function todayList(leads, st, nowMs, conf, n) {
  const rows = [];
  for (const L of leads) { const s = statusOf(L, st, nowMs, conf); if (s.ok || s.mail) rows.push({ L, s, best: inBest(L, nowMs, conf), i: rows.length }); }   // a due proposal email is today's work too
  rows.sort((a, b) => (b.s.due ? 1 : 0) - (a.s.due ? 1 : 0) || (b.best ? 1 : 0) - (a.best ? 1 : 0) || a.i - b.i);
  return rows.slice(0, n || 60);
}

// the National Do Not Call list per number: 'unknown' (not checked: the default), 'clear' (checked, not on it), 'listed' (never call). The PC's
// scrub (python -m agency.portal build with the owner's free DNC download) sets lead.dnc; a caller who checks by hand sets it on the phone
export const DNC_STATES = ['unknown', 'clear', 'listed'];
export function dncOf(lead, st) { const h = st && st.dncCheck && st.dncCheck[lead && lead.id]; return DNC_STATES.indexOf(h) >= 0 ? h : DNC_STATES.indexOf(lead && lead.dnc) >= 0 ? lead.dnc : 'unknown'; }
export function setDnc(st, lead, v) { if (DNC_STATES.indexOf(v) < 0) throw new Error('unknown DNC state'); st.dncCheck = st.dncCheck || {}; st.dncCheck[lead.id] = v; return v; }

// what to leave on a voicemail, and the ONE line to text, per lane. Texts only when the business asked you to text (no cold texts: TCPA);
// a human types it on their own phone; there is never a texting link here
const VM = {
  no_site: '{me} with {ag} here, for {n}. We built you a free website draft, nothing owed. I\'ll email the link, or call me back at {ph}. Thanks!',
  site_down: '{me} with {ag} here, for {n}. Your website didn\'t load for me today, so we built you a fresh draft, free to look at. Call me back at {ph}. Thanks!',
  redesign: '{me} with {ag} here, for {n}. I\'d like to send you a free 2-minute check of your website. Call me back at {ph}, or I\'ll try you again. Thanks!' };
const TX = {
  no_site: 'Hi, it\'s {me} with {ag}: here\'s the free website we built for {n}: {link}. Reply STOP to opt out.',
  site_down: 'Hi, it\'s {me} with {ag}: here\'s the fresh site we built for {n} (yours didn\'t load): {link}. Reply STOP to opt out.',
  redesign: 'Hi, it\'s {me} with {ag}: as promised, your free website check for {n} is in your email. Reply STOP to opt out.' };
export function scripts(lead, caller, conf) {
  const v = { me: str(caller) || '<your name>', ag: str(conf && conf.agency) || '<agency>', n: str(lead && lead.name) || 'your business',
    ph: str(conf && conf.agency_number) || '<the agency number>', link: siteUrl(lead, conf) || '<the link>' };
  const f = (t) => t.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  return { voicemail: f(VM[laneOf(lead)]), text: f(TX[laneOf(lead)]) };
}

// the end-of-day tally: dials, connects (a person answered), shows booked, and the pipeline at the price book (each interested / booked
// business = the Starter setup; the monthly shown apart). price = {name, setup, monthly} from agency/pricebook.json (the list's header)
export function dayTally(st, nowMs, conf, price) {
  const tz = (conf && conf.tz) || 'America/New_York', today = partsIn(nowMs, tz).date, c = { dials: 0, connects: 0, booked: 0, interested: 0, won: 0, voicemail: 0 };
  const open = {};
  for (const e of st.log) {
    if (partsIn(e.t, tz).date !== today) continue;
    if (DIALS.indexOf(e.k) >= 0) c.dials++;
    if (['called', 'interested', 'booked', 'no', 'won', 'dnc'].indexOf(e.k) >= 0) c.connects++;
    if (e.k === 'voicemail') c.voicemail++;
    if (e.k === 'booked') c.booked++;
    if (e.k === 'interested') c.interested++;
    if (e.k === 'won') c.won++;
    if (e.k === 'interested' || e.k === 'booked') open[e.id] = 1;
  }
  const p = price && price.setup > 0 ? price : { name: 'Starter site', setup: 1500, monthly: 79 };
  c.pipelineN = Object.keys(open).length; c.pipeline = c.pipelineN * p.setup; c.monthly = c.pipelineN * (p.monthly || 0); c.price = p;
  c.text = 'Today: ' + c.dials + ' dials, ' + c.connects + ' connects, ' + c.booked + ' booked, ' + c.pipelineN + ' in the pipeline ($' + c.pipeline.toLocaleString('en-US') +
    (c.monthly ? ' + $' + c.monthly.toLocaleString('en-US') + '/mo' : '') + ' at ' + p.name + ' prices).';
  return c;
}

// ---------------------------------------------------------------------------------------------------- CLOSE THE SALE (2026-11-22)
// after "Interested": a one-page proposal the same day (printable + a copy-text email), then ONE follow-up call on workday 2 and ONE
// follow-up email on workday 5, then stop (a business that answers, says no or signs leaves the sequence). Numbers from price.json
// (python -m agency.proposal, made from agency/pricebook.json).
export const PROPOSAL_STEPS = [[2, 'call'], [5, 'email']];
export function lastProposal(st, id) { let p = null; for (const e of st.log) if (e.id === id && e.k === 'proposal') p = e; return p; }
export function proposalStep(lead, st, nowMs, conf) {
  const p = lastProposal(st, lead.id); if (!p) return null;
  const tz = (conf && conf.tz) || 'America/New_York', after = st.log.filter((e) => e.id === lead.id && e.t > p.t);
  if (after.some((e) => e.k === 'booked' || e.k === 'interested')) return { ok: false, tone: 'wait', why: 'Proposal: they answered (see the notes)', track: 'proposal' };
  const pd = partsIn(p.t, tz).date, today = partsIn(nowMs, tz).date, callDay = addWorkdays(pd, PROPOSAL_STEPS[0][0]), mailDay = addWorkdays(pd, PROPOSAL_STEPS[1][0]);
  const called = after.some((e) => DIALS.indexOf(e.k) >= 0), mailed = after.some((e) => e.k === 'fu_email');
  if (!called) {
    if (today < callDay) return { ok: false, tone: 'wait', why: 'Proposal sent: follow-up call ' + dayWords(callDay, today), track: 'proposal' };
    const w = windowAt(nowMs, conf);
    return w.open ? { ok: true, tone: 'go', why: 'Proposal: follow-up call due', due: true, track: 'proposal' }
      : { ok: false, tone: 'wait', why: 'Proposal call: calls open ' + w.next, track: 'proposal' };
  }
  if (!mailed) {
    if (today < mailDay) return { ok: false, tone: 'wait', why: 'Proposal: follow-up email ' + dayWords(mailDay, today), track: 'proposal' };
    return { ok: false, tone: 'go', why: 'Proposal: send the follow-up email (the last step)', due: true, mail: true, track: 'proposal' };
  }
  return { ok: false, tone: 'done', why: 'Proposal: a call and an email, no answer: stop here', track: 'proposal' };
}
const usd0 = (n) => '$' + Number(n || 0).toLocaleString('en-US');
// the one-page proposal for a lead: {subject, email (copy text), sections (for proposal.html)}; price = price.json
export function proposalFor(lead, caller, conf, price, nowMs) {
  const P = price || {}, k = P.package || {}, nu = P.no_upfront || {}, care = P.care || {};
  const redesign = laneOf(lead) === 'redesign', link = redesign ? theirSite(lead) : siteUrl(lead, conf);
  const name = str(lead.name) || 'your business', who = str(caller) + ', ' + str(conf && conf.agency);
  const valid = new Date(nowMs + (P.valid_days || 14) * 86400000).toISOString().slice(0, 10);
  const sec = [
    ['What you get', [k.name + ': up to ' + k.pages + ' pages, works on every phone, tap-to-call, a contact form, your own domain in your name, your Google profile linked.',
      redesign ? 'We rebuild your current site (' + (link || 'your site') + ') faster and phone-friendly; your domain stays yours.' : 'Start from the draft we already built for you: ' + (link || '[the link]')]],
    ['The price', [usd0(k.setup) + ' once + ' + usd0(k.monthly) + '/month care plan (hosting, backups, small edits up to ' + care.edit_minutes + ' minutes a month; a ' +
      care.term_months + '-month term, then month to month)', 'Or ' + usd0(nu.monthly) + '/month for ' + nu.months + ' months with nothing upfront, care included.',
      (P.tax_pct ? 'Maryland sales tax (' + P.tax_pct + '%) is added to the setup fee where it applies, on its own invoice line.' : '')].filter(Boolean)],
    ['Timeline: live in ' + k.days + ' days', ['Day 0: your deposit and your content.', 'Days 1-3: we build it.', 'Days 4-5: you look; ' + P.revision_rounds + ' rounds of changes included.',
      'Days 6-' + k.days + ': the balance is paid, your site goes live on your domain.']],
    ['What we need from you', ['Your logo (any file) and 5-10 photos of your work or place.', 'Your services, prices if you show them, and your hours.',
      'Your domain login, or we register one in your name.', 'Access to your Google Business Profile (or we help you claim it).']],
    ['To start', ['A ' + usd0(P.deposit) + ' deposit (' + P.deposit_pct + '%) by the secure payment link we email you: card or bank. The other ' + usd0(P.balance) + ' on launch day.',
      'Reply "I agree" to the agreement we send with it. Prices hold until ' + valid + '.']]];
  const email = ['Hi ' + name + ' team,', '', 'Thanks for your time today. Here is the one-page proposal we talked about.', '']
    .concat(...sec.map(([h, l]) => [h.toUpperCase()].concat(l.map((x) => '- ' + x), ['']))).concat(
      ['Any question, just reply.', '', who, str(conf && conf.postal), str(conf && conf.agency_number) ? 'Call ' + str(conf.agency_number) + ': our AI assistant answers.' : '', '',
        'Not interested? Reply "no thanks" and we won\'t contact you again.']).filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
  return { subject: 'Your website proposal, ' + name, email, sections: sec, valid, link, name, who };
}
export function proposalFollowUp(lead, caller, conf) {
  const name = str(lead.name) || 'your business';
  return { subject: 'Re: Your website proposal, ' + name,
    email: ['Hi ' + name + ' team,', '', 'Just checking you got the website proposal I sent a few days ago. Happy to answer any question, or to change anything in it.',
      'If now is not the right time, no problem: this is my last note.', '', str(caller) + ', ' + str(conf && conf.agency), str(conf && conf.postal), '',
      'Not interested? Reply "no thanks" and we won\'t contact you again.'].join('\n') };
}

export function logOutcome(st, lead, k, nowMs) {
  if (DIALS.indexOf(k) < 0 && NOTES.indexOf(k) < 0) throw new Error('unknown outcome');
  const e = { t: nowMs, id: lead.id, k, caller: st.caller, name: str(lead.name).slice(0, 80), code: str(lead.code) };
  st.log.push(e);
  if (k === 'dnc' || k === 'no') { if (st.dnc.indexOf(lead.id) < 0) st.dnc.push(lead.id); }
  return e;
}
export function undoLast(st, id) { for (let i = st.log.length - 1; i >= 0; i--) if (st.log[i].id === id) { const e = st.log.splice(i, 1)[0]; if ((e.k === 'dnc' || e.k === 'no') && !st.log.some((x) => x.id === id && (x.k === 'dnc' || x.k === 'no'))) st.dnc = st.dnc.filter((x) => x !== id); return e; } return null; }

// ---------------------------------------------------------------------------------------------------- the words + the links
export function identify(caller, agency) { return 'Hi, it\'s ' + (str(caller) || '<your name>') + ' with ' + (str(agency) || '<agency>') + '. We build websites for local businesses.'; }
// the lane from the Overture check (python -m agency.portal build): no_site = we built a concept site; site_down = theirs did not load on the check
// date; redesign = they have a working site (offer a free check, never "we built you a site")
export const LANES = { no_site: 'No website', site_down: 'Site down', redesign: 'Has a site' };
export function laneOf(lead) { const l = str(lead && lead.lane); return LANES[l] ? l : 'no_site'; }
const OPEN = { no_site: 'I noticed {n} doesn\'t have a website, so we built you one. It\'s free to look at. Can I email you the link?',
  site_down: 'I tried your website and it didn\'t load for me, so we built you a fresh one. It\'s free to look at. Can I email you the link?',
  redesign: 'I looked at your website. We help local businesses get a faster, mobile-friendly site that brings more calls. Can I email you a free 2-minute check of yours?' };
export function opener(lead) { return str(lead && lead.opener) || OPEN[laneOf(lead)].replace('{n}', str(lead && lead.name) || 'your business'); }
export function pitch(lead, caller, agency) { return identify(caller, agency) + ' ' + opener(lead); }
export function theirSite(lead) { const u = str(lead && lead.url); return laneOf(lead) === 'redesign' && /^https?:\/\/[^\s"'<>]{3,}$/.test(u) && u.length <= 200 ? u : ''; }
// which tab a row is under: the redesign lane has its own tab (sorted by how dated the site is); the rest by status
export function tabOf(lead, s) { return laneOf(lead) === 'redesign' && s.tone !== 'done' ? 'redesign' : s.tone; }
// the banned-address check runs on the PC (agency/public.py) before public_base is written: no private name ships in this file
export function publicBase(conf) { const b = str(conf && conf.public_base).replace(/\/+$/, ''); return /^https:\/\/[^\s"'<>]{4,}$/.test(b) ? b : ''; }
export function siteUrl(lead, conf) {
  const b = publicBase(conf), p = str(lead.site);
  return b && /^f\/[a-z2-9]{8}\/$/.test(p) ? b + '/' + p : '';   // the neutral host serves the sites at <base>/f/<id>/
}
export function mapsUrl(lead) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([lead.name, lead.town, lead.state].map(str).filter(Boolean).join(' ')); }
export function emailFor(lead, caller, conf) {
  const pr = (conf && conf.prices) || {};
  const sign = [str(caller) + ', ' + str(conf && conf.agency), str(conf && conf.postal), '', 'Not interested? Reply "no thanks" and we won\'t contact you again.'];
  const base = validEmail(conf && conf.agency_email) && str(conf && conf.postal).length >= 8 && str(conf && conf.agency) && str(caller);
  if (laneOf(lead) === 'redesign') {    // they have a site: a free check of it, no "we built you one"
    const why = Array.isArray(lead.why) ? lead.why.filter((x) => typeof x === 'string').slice(0, 3) : [];
    const body = ['Hi ' + str(lead.name) + ' team,', '', 'Thanks for talking with me today. As promised, a free quick check of your website (' + theirSite(lead) + '):',
      why.length ? why.map((x) => '- ' + x).join('\n') : '- I\'ll send the details: speed on a phone, how it looks on mobile, and how Google shows it.', '',
      'If you\'d like it faster and easier to use on a phone, we can redo it this week: ' + (pr.starter || '') + (pr.monthly ? ', or ' + pr.monthly : '') + '.',
      'Just reply to this email with any question.', ''].concat(sign).join('\n');
    return { subject: 'A free check of the ' + str(lead.name) + ' website', body, ready: !!(base && theirSite(lead)) };
  }
  const url = siteUrl(lead, conf);
  const subject = 'The website we built for ' + str(lead.name);
  const body = ['Hi ' + str(lead.name) + ' team,', '',
    'Thanks for talking with me today. Here is the website we built for you, free to look at:', url || '[the link]', '',
    'If you like it, it can be yours this week with your photos and your own domain: ' + (pr.starter || '') + (pr.monthly ? ', or ' + pr.monthly : '') + '.',
    'Just reply to this email with any question.', '',
  ].concat(sign).join('\n');
  return { subject, body, ready: !!(url && base) };
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
