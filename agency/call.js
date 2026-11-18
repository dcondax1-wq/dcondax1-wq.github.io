// CALL COPILOT page (ES module, team B2, 2026-11-14): Call mode of the OLYMPUS Agency app. Reads ./callrules.json, ./callscript.json and ./call_fixture.json (DEMO).
// The owner's list, outcomes, opt-outs and settings live only in localStorage['agency.calls.v1'] on this phone (export: JSON / CSV); nothing is sent anywhere.
// A human places every call: the Call button is a tel: link the owner taps (locked outside the legal window, for Do Not Call and opted-out numbers);
// emails and texts open the phone's own Mail / Messages (mailto: / sms:). Text only through textContent. window.CALLS is the test hook.
// Team B1's Agency app: its published CRM data (./leads.json, when it exists) and its leads saved on this phone (callcore SHARED_KEYS) are offered with one
// button ('Load the Agency app's leads'), never merged on their own.
// ?demo=1 = the example list; ?now=<ISO> = pretend it is that time (tests); ?lead=<id> opens that call screen.
import * as C from './callcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, String(attrs[k])); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { rules: null, script: null, fixture: null, st: null, demo: false, forced: false, filter: 'now', cur: null, tab: 'script', obj: null, ready: false, fixedNow: null, t0: 0, myTz: 'America/New_York', armed: 0, saveOk: true };
S.now = () => (S.fixedNow != null ? S.fixedNow + Math.round(performance.now() - S.t0) : Date.now());

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function cue(name) { try { if (O && O.cue) O.cue(name); } catch (_) { /* sound is optional */ } }

// ---------------------------------------------------------------------------------------------------- storage (this phone only)
function readSaved() { try { return localStorage.getItem(C.KEY); } catch (_) { return null; } }
function save() {
  if (S.demo) return;
  try { localStorage.setItem(C.KEY, JSON.stringify(S.st)); S.saveOk = true; } catch (_) { S.saveOk = false; say('This phone did not let the page save (private browsing?). Export your data to keep it.'); }
}
// B1's CRM on this phone: its 'Do not contact' and 'Won' stages lock the same leads here (read-only; the copilot never writes B1's data)
function crmSync() {
  if (S.demo) return 0;
  let text = null;
  try { text = localStorage.getItem(C.CRM_KEY); } catch (_) { text = null; }
  const n = text ? C.applyCrm(S.st, C.crmStages(text)) : 0;
  if (n) save();
  return n;
}
function demoState() {
  const st = C.emptyState(), fx = S.fixture || {}, now = S.now();
  const r = C.normLeads(fx.leads || [], S.rules);
  const raw = {};
  for (const x of fx.leads || []) raw[x.id] = x;
  for (const L of r.leads) { const x = raw[L.id] || {}; if (x.callbackIn) L.callbackAt = now + x.callbackIn * 60000; }
  st.leads = r.leads;
  const log = (fx.log || []).map((e) => { const o = { t: now - (e.ago || 0) * 60000, id: e.id, k: e.k }; if (e.o) o.o = e.o; if (e.key) o.key = e.key; if (e.dial) o.dial = true; return o; }).sort((a, b) => a.t - b.t);
  // an outcome marked dial: true joins the Call tap just before it (its time), the same as a real tap does
  log.forEach((o, i) => { if (o.dial === true) { o.dial = 0; for (let j = i - 1; j >= 0; j--) if (log[j].id === o.id && log[j].k === 'dial') { o.dial = log[j].t; break; } if (!o.dial) delete o.dial; } });
  st.log = log;
  st.optouts = (fx.optouts || []).map(C.normPhone).filter((p) => p);
  st.settings = Object.assign(C.defaultSettings(), fx.settings || {});
  return st;
}

// ---------------------------------------------------------------------------------------------------- words
const tradeLabel = (L) => (S.rules.trades[L.trade] || S.rules.trades.other).label;
function place(L) { return [L.city, L.state].filter((x) => x).join(', '); }
function myWhen(ms) { return C.whenWords(ms, S.myTz, S.now()); }
function statusOf(q) {
  if (q.block) return { cls: q.block.lock ? 'bad' : 'warn', pill: q.block.lock ? 'Locked' : q.block.code === 'today' ? 'Called today' : q.block.code === 'rest' ? 'Resting' : q.block.code === 'cap' ? 'Limit' : q.block.code === 'client' ? 'Client' : 'Check', text: q.block.text };
  if (q.cb && q.win && q.win.legal) return { cls: 'ok', pill: 'Callback now', text: 'They asked you to call back about now.' };
  if (!q.win || q.win.code === 'nozone') return { cls: 'warn', pill: 'No state', text: 'Add the state: the time zone is unknown.' };
  if (q.win.code === 'best') return { cls: 'ok', pill: 'Good now', text: q.win.text };
  if (q.win.code === 'ok') return { cls: 'warn', pill: 'Legal now', text: 'Legal now, not their best time' + (q.win.next ? '; best ' + C.whenWords(q.win.next.start, q.win.zones[0], S.now()) + ' their time' : '') + '.' };
  return { cls: 'info', pill: q.win.next ? 'Opens ' + myWhen(q.win.next.start) : 'Closed', text: q.win.text };
}

// ---------------------------------------------------------------------------------------------------- the page
function renderHero(Q) {
  const now = S.now(), st = S.st, T = C.targetsOf(st, S.rules);
  const callable = Q.filter((q) => q.rank <= 2);
  const nextQ = Q.filter((q) => q.rank === 3 && q.win && q.win.next).sort((a, b) => a.nextT - b.nextT)[0];
  $('nowLine').textContent = callable.length ? callable.length + (callable.length === 1 ? ' business is' : ' businesses are') + ' OK to call right now' + (callable.filter((q) => q.rank <= 1).length ? ' (' + callable.filter((q) => q.rank <= 1).length + ' at their best time).' : '.')
    : nextQ ? 'Nobody to call right now. Next good time: ' + myWhen(nextQ.win.next.start) + ' your time (' + nextQ.lead.name + ').' : st.leads.length ? 'Nobody to call right now.' : 'No businesses yet: import your leads below.';
  const pill = $('nowPill'); pill.textContent = callable.length ? 'Call now' : 'Wait'; pill.className = 'pill ' + (callable.length ? 'ok' : 'info');
  const d = C.funnel(st.log, C.dayStart(now, S.myTz), now + 1), w = C.funnel(st.log, C.weekStart(now, S.myTz), now + 1);
  const g = $('goals'); clear(g);
  for (const [k, v, t] of [['Dials today', d.dials, T.dials], ['Conversations', d.conversations, T.conversations], ['Demos today', d.demos, T.demos], ['Closes this week', w.closes, T.closesPerWeek]]) {
    const e = h('div', 'tile' + (t && v >= t ? ' done' : '')); e.appendChild(h('small', '', k)); e.appendChild(h('b', '', v + ' / ' + (t || 0)));
    const bar = h('i'); const fillEl = h('span'); fillEl.style.width = Math.min(100, t ? Math.round((v / t) * 100) : 0) + '%'; bar.appendChild(fillEl); e.appendChild(bar); g.appendChild(e);
  }
  const svg = $('funnel'); clear(svg);
  const rows = [['Dials', w.dials, ''], ['Conversations', w.conversations, w.rates.talk + '%'], ['Interested', w.interested, w.rates.interest + '%'], ['Demos', w.demos, w.rates.demo + '%'], ['Closes', w.closes, w.rates.close + '%']];
  const max = Math.max(1, w.dials);
  rows.forEach(([label, n, pct], i) => {
    const y = 6 + i * 30, bw = Math.max(4, Math.round((n / max) * 150));
    svg.appendChild(sv('text', { x: 0, y: y + 15 }, label));
    svg.appendChild(sv('rect', { x: 108, y: y + 2, width: 150, height: 18, rx: 6, fill: '#2a241c' }));
    svg.appendChild(sv('rect', { x: 108, y: y + 2, width: bw, height: 18, rx: 6, fill: i === 0 ? '#9c6b3c' : i === 4 ? '#7f8a52' : '#c8a24a', class: 'bar' }));
    svg.appendChild(sv('text', { x: 266, y: y + 16, class: 'n' }, String(n)));
    if (pct) svg.appendChild(sv('text', { x: 292, y: y + 16 }, pct));
  });
  svg.setAttribute('aria-label', 'This week: ' + rows.map((r) => r[1] + ' ' + r[0].toLowerCase()).join(', '));
  const n = (x, one, many) => x + ' ' + (x === 1 ? one : many);
  $('funnelNote').textContent = 'This week: ' + n(w.dials, 'dial', 'dials') + ', ' + n(w.conversations, 'conversation', 'conversations') + ' (' + w.rates.talk + '% of dials), ' + w.interested + ' interested, ' + n(w.demos, 'demo', 'demos') + ', ' + n(w.closes, 'close', 'closes') + '. Voicemails ' + w.voicemails + ', no answer ' + w.noanswer + '.';
  $('startBtn').disabled = !callable.length;
  $('startBtn').textContent = callable.length ? 'Start calling: ' + callable[0].lead.name : 'Nobody to call right now';
}

function renderPlan() {
  const ul = $('plan'); clear(ul);
  const now = S.now(), P = C.callPlan(S.st, now, S.rules, S.myTz);
  if (!P.length) { ul.appendChild(h('li', '', 'No call windows left today. Tomorrow\'s plan appears here in the morning.')); return; }
  for (const p of P) {
    const li = h('li', p.start <= now ? 'now' : '');
    li.appendChild(h('b', '', p.mine)); li.appendChild(h('span', '', p.n + ' ' + p.label));
    li.appendChild(h('small', '', (p.start <= now ? 'Now. ' : '') + 'Their time ' + p.theirs + ' (' + p.zone.split('/').pop().replace(/_/g, ' ') + '). ' + (S.rules.trades[p.trade] || S.rules.trades.other).why));
    ul.appendChild(li);
  }
}

function leadButton(q, onTap, extra) {
  const L = q.lead, s = statusOf(q), b = h('button', 'lead' + (s.cls === 'ok' ? ' best' : '') + (q.block && q.block.lock ? ' locked' : ''));
  b.type = 'button'; b.dataset.lead = L.id;
  b.appendChild(h('b', '', L.name)); b.appendChild(h('span', 'pill ' + s.cls, s.pill));
  b.appendChild(h('small', '', [tradeLabel(L), place(L), extra || s.text].filter((x) => x).join(' · ')));
  b.addEventListener('click', onTap);
  return b;
}
function visible(Q) {
  if (S.filter === 'now') return Q.filter((q) => q.rank <= 2);
  if (S.filter === 'locked') return Q.filter((q) => q.block);
  return Q.filter((q) => !(q.block && q.block.lock));
}
function renderQueue(Q) {
  const ul = $('leads'); clear(ul);
  const V = visible(Q);
  for (const b of $('filters').querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.f === S.filter ? 'true' : 'false');
  $('qCount').textContent = V.length + ' of ' + S.st.leads.length;
  if (!V.length) ul.appendChild(h('li', 'note', S.filter === 'now' ? 'Nobody is in a good window right now. Tap All to see when each one opens.' : S.filter === 'locked' ? 'No locked businesses.' : 'No businesses yet: import your leads below.'));
  for (const q of V.slice(0, 200)) { const li = h('li'); li.appendChild(leadButton(q, () => openCall(q.lead.id, 'script'))); ul.appendChild(li); }
}
function renderFollow(Q) {
  const ul = $('follow'); clear(ul);
  // follow-ups = leads already in the plan (called at least once) whose next step is due, and the interested ones; never-called leads are the queue's job
  const due = Q.filter((q) => !q.block && q.plan && q.plan.next && (q.plan.next.kind === 'demo' || (q.plan.next.now && C.attemptTimes(S.st.log, q.lead.id).length > 0)));
  if (!due.length) { ul.appendChild(h('li', 'note', 'Nothing due today.')); return; }
  for (const q of due.slice(0, 60)) { const li = h('li'); li.appendChild(leadButton(q, () => openCall(q.lead.id, 'next'), (q.plan.next.overdue ? 'Late: ' : 'Due: ') + q.plan.next.label)); ul.appendChild(li); }
}
function renderStatic() {
  const ol = $('rules5'); clear(ol);
  for (const l of S.rules.rules5 || []) ol.appendChild(h('li', '', l));
  const s = S.st.settings, T = C.targetsOf(S.st, S.rules);
  const set = (id, v) => { const e = $(id); if (document.activeElement !== e) e.value = v == null ? '' : String(v); };
  set('setMe', s.me); set('setBiz', s.biz); set('setCity', s.city); set('setPhone', s.phone); set('setEmail', s.email); set('setAddress', s.address); set('setPrice', s.price); set('setState', s.defaultState);
  set('tDials', T.dials); set('tConv', T.conversations); set('tDemos', T.demos); set('tCloses', T.closesPerWeek);
  let shared = (S.crm || []).length;
  for (const k of C.SHARED_KEYS) { try { const v = localStorage.getItem(k); if (v) shared += C.sharedLeads(v, S.rules).length; } catch (_) { /* no storage */ } }
  $('fromApp').hidden = !shared;
  $('fromApp').textContent = 'Load the Agency app\'s leads (' + shared + ')';
  $('dataNote').textContent = S.demo ? 'Showing the example list (fictional numbers). Import your leads to start: they stay on this phone.'
    : S.st.leads.length + ' businesses, ' + S.st.log.length + ' saved taps, ' + S.st.optouts.length + ' numbers on your do-not-call list (kept forever).' + (S.saveOk ? '' : ' Not saved: export to keep.');
}
function render() {
  $('demo').hidden = !S.demo; $('demoNote').hidden = !S.demo;
  try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  const Q = C.queue(S.st, S.now(), S.rules);
  S.Q = Q;
  renderHero(Q); renderPlan(); renderQueue(Q); renderFollow(Q); renderStatic();
  if (!$('call').hidden) renderCall();
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

// ---------------------------------------------------------------------------------------------------- the call screen
function openCall(id, tab) {
  if (!C.findLead(S.st, id)) return;
  S.cur = id; S.tab = tab || 'script'; S.obj = null; S.armed = 0;
  $('cbBox').hidden = true; $('intBox').hidden = true; $('cNote').value = '';
  $('call').hidden = false; document.body.classList.add('sheet-open');
  renderCall();
  $('callPanel').scrollTop = 0;
  try { $('cName').focus({ preventScroll: true }); } catch (_) { $('cName').focus(); }
  cue('open');
}
function closeCall() { $('call').hidden = true; document.body.classList.remove('sheet-open'); S.cur = null; render(); }
function curLead() { return S.cur ? C.findLead(S.st, S.cur) : null; }

function renderCall() {
  const L = curLead();
  if (!L) { closeCall(); return; }
  const now = S.now(), R = S.rules, st = S.st;
  const b = C.blockOf(L, st, now, R), w = C.windowStatus(L, now, R, st.settings), sc = C.scriptFor(L, st.settings, R, S.script, now);
  $('cName').textContent = L.name;
  $('cSub').textContent = [tradeLabel(L), place(L), C.prettyPhone(L.phone), L.contact ? 'ask for ' + L.contact : 'ask for the owner'].filter((x) => x).join(' · ');
  const win = $('cWin');
  win.textContent = b ? b.text : w.text;
  win.className = 'win ' + (b ? (b.lock ? 'bad' : 'warn') : w.code === 'best' ? 'ok' : w.code === 'ok' ? 'warn' : 'bad');
  $('cFinder').hidden = !L.finder; $('cFinder').textContent = L.finder ? 'Lead finder: ' + L.finder : '';
  const demo = C.safeUrl(L.demo), dl = $('cDemo');
  if (demo) { dl.setAttribute('href', demo); dl.textContent = 'Open their preview site (' + demo.replace(/^https?:\/\//i, '').slice(0, 40) + ')'; dl.hidden = false; } else { dl.removeAttribute('href'); dl.hidden = true; }
  $('cLaw').textContent = C.stateWords(w.state, R) + (w.allParty ? ' All-party recording state: if you record, say so first (this app never records).' : '') + (w.how === 'split' ? ' Two time zones in this state: add the city or time zone for exact hours.' : '');
  const can = !b && (w.code === 'best' || w.code === 'ok');
  const conf = can && C.needsConfirm(L, now, R);
  $('cConfirm').hidden = !conf;
  const dial = $('cDial'), locked = $('cLocked');
  if (can && !conf) {
    const href = C.telHref(L.phone);
    dial.hidden = false; locked.hidden = true;
    if (href) { dial.setAttribute('href', href); dial.textContent = 'Call ' + C.prettyPhone(L.phone); }
    else { dial.removeAttribute('href'); dial.textContent = 'Call ' + C.prettyPhone(L.phone) + ' (example: no real call)'; }
  } else {
    dial.hidden = true; dial.removeAttribute('href'); locked.hidden = false;
    locked.textContent = b ? (b.lock ? 'Locked: do not call' : 'Not now: ' + (b.code === 'today' ? 'called today' : b.code === 'rest' ? 'resting' : b.code === 'cap' ? '24-hour limit' : b.code === 'client' ? 'already a client' : 'no number'))
      : conf ? 'Answer the Do Not Call question first' : w.code === 'nozone' ? 'Add their state first' : 'Outside their legal hours';
  }
  for (const t of document.querySelectorAll('.tabs [role=tab]')) { const on = t.dataset.tab === S.tab; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; }
  $('pScript').hidden = S.tab !== 'script'; $('pObj').hidden = S.tab !== 'obj'; $('pVm').hidden = S.tab !== 'vm'; $('pNext').hidden = S.tab !== 'next';
  $('sOpener').textContent = sc.opener; $('sWhy').textContent = sc.why; $('sClose').textContent = sc.close; $('sConsent').textContent = sc.consent; $('sBook').textContent = sc.book;
  const qs = $('sQs'); clear(qs); for (const x of sc.questions) qs.appendChild(h('li', '', x));
  const chips = $('objChips'); clear(chips);
  for (const o of sc.objections) {
    const c = h('button', 'btn', o.title); c.type = 'button'; c.dataset.obj = o.key; c.setAttribute('aria-pressed', S.obj === o.key ? 'true' : 'false');
    c.addEventListener('click', () => { S.obj = o.key; renderCall(); }); chips.appendChild(c);
  }
  const ans = $('objAnswer'); clear(ans);
  const o = sc.objections.find((x) => x.key === S.obj);
  if (o) { ans.appendChild(h('h3', '', o.title)); for (const l of o.lines) ans.appendChild(h('p', '', l)); } else ans.appendChild(h('p', 'note', 'Tap what they said: the answer shows here in big words.'));
  $('vm1').textContent = sc.vm1; $('vm2').textContent = sc.vm2; $('vmRule').textContent = sc.vmRule;
  renderNext(L, b, now);
  renderOutcomes(L, b);
}

function renderNext(L, b, now) {
  const R = S.rules, st = S.st, plan = C.cadence(L, st, now, R);
  $('nPlan').textContent = plan.stop === 'plan done' ? 'The 7-day plan is done: rest this lead.' : plan.stop ? 'No follow-ups: ' + ({ dnc: 'they asked not to be contacted', won: 'already a client', lost: 'marked lost', notinterested: 'not interested (rest 180 days)' }[plan.stop] || plan.stop) + '.'
    : plan.next ? (plan.next.kind === 'demo' ? plan.next.label : 'Next: day ' + plan.next.day + ', ' + plan.next.label) : '';
  const ul = $('nSteps'); clear(ul);
  const tz = (C.zonesOf(L, R, st.settings).zones[0]) || S.myTz;
  for (const s of plan.steps) {
    const li = h('li', s.done ? 'done' : plan.next && plan.next.day === s.day ? 'due' : '');
    li.appendChild(h('b', '', (s.done ? 'Done' : 'Day ' + s.day) + ' · ' + C.dateWords(s.due + 12 * 3600000, tz))); li.appendChild(h('span', '', s.label)); ul.appendChild(li);
  }
  const em = $('nEmails'); clear(em); let why = '';
  for (const key of Object.keys(S.script.emails)) {
    const e = C.emailFor(L, key, st.settings, R, S.script, now), sent = st.log.some((x) => x.id === L.id && x.k === 'email' && x.key === key);
    const label = 'Email ' + key.slice(1) + (sent ? ' (sent)' : '');
    if (e.ok && !(b && b.lock)) { const a = h('a', 'btn', label); a.setAttribute('href', e.href); a.dataset.email = key; a.addEventListener('click', () => { tap('email', { key }); }); em.appendChild(a); }
    else { const x = h('button', 'btn', label); x.type = 'button'; x.disabled = true; em.appendChild(x); why = why || e.why || 'Locked.'; }
  }
  $('nEmailWhy').textContent = why;
  const tx = $('nTexts'); clear(tx); let twhy = '';
  for (const key of Object.keys(S.script.texts)) {
    const t = C.textFor(L, key, st.settings, R, S.script, now);
    if (t.ok) { const a = h('a', 'btn', 'Text ' + key.slice(1)); a.setAttribute('href', t.href); a.dataset.text = key; a.addEventListener('click', () => { tap('text', { key }); }); tx.appendChild(a); }
    else { const x = h('button', 'btn', 'Text ' + key.slice(1)); x.type = 'button'; x.disabled = true; tx.appendChild(x); twhy = twhy || t.why; }
  }
  $('nTextWhy').textContent = twhy;
  const cb = $('consentBtn'), has = !!(L.consentText && L.consentText.on);
  cb.textContent = has ? 'They said I can text (' + L.consentText.on + '): tap if they said stop' : 'They said I can text';
  cb.setAttribute('aria-pressed', has ? 'true' : 'false'); cb.disabled = !!(b && b.lock);
  $('emailStop').disabled = !!(b && b.lock) || !!L.emailOptOut;
  $('emailStop').textContent = L.emailOptOut ? 'No more emails (saved)' : 'They asked: no more emails';
}

function renderOutcomes(L, b) {
  const box = $('outs'); clear(box);
  const lock = !!(b && b.lock);
  for (const o of C.OUTCOMES) {
    const armed = o.k === 'dnc' && S.armed && Date.now() - S.armed < 5000;
    const x = h('button', 'btn' + (o.k === 'dnc' ? ' dncb' : '') + (o.k === 'interested' ? ' good' : '') + (armed ? ' armed' : ''), armed ? 'Tap again: never call ' + L.name : o.label);
    x.type = 'button'; x.dataset.out = o.k; x.disabled = lock;
    x.addEventListener('click', () => outcome(o.k)); box.appendChild(x);
  }
  const more = $('moreOuts'); clear(more);
  const st = L.stage;
  more.hidden = !(st === 'interested' || st === 'demo');
  if (!more.hidden) {
    for (const [k, label] of [['demo', st === 'demo' ? 'Move the demo' : 'Demo booked'], ['won', 'Won: a client'], ['lost', 'Lost']]) {
      const x = h('button', 'btn' + (k === 'won' ? ' good' : ''), label); x.type = 'button'; x.dataset.out = k; x.disabled = lock;
      x.addEventListener('click', () => outcome(k)); more.appendChild(x);
    }
  }
}

function tap(kind, extra) {
  const L = curLead(); if (!L) return null;
  const note = $('cNote').value.trim();
  const e = C.applyOutcome(S.st, L.id, kind, S.now(), Object.assign({}, extra || {}, note ? { note } : {}));
  if (note) $('cNote').value = '';
  save();
  return e;
}
const SAID = { noanswer: 'No answer', voicemail: 'Voicemail', callback: 'Callback', interested: 'Interested', notinterested: 'Not interested', dnc: 'Do not call', demo: 'Demo booked', won: 'Won', lost: 'Lost' };
function outcome(kind) {
  const L = curLead(); if (!L) return;
  $('cbBox').hidden = true; $('intBox').hidden = true;
  if (kind === 'callback' || kind === 'demo') { openPicker(kind); return; }
  if (kind === 'interested') { $('intBox').hidden = false; $('intEmail').value = L.email || ''; $('intText').setAttribute('aria-pressed', L.consentText && L.consentText.on ? 'true' : 'false'); $('intEmail').focus(); return; }
  if (kind === 'dnc') {
    if (!(S.armed && Date.now() - S.armed < 5000)) { S.armed = Date.now(); renderCall(); say('Tap Do not call again to confirm: ' + L.name + ' will never be called, texted or emailed again.'); return; }
    S.armed = 0;
  }
  tap(kind);
  cue(kind === 'dnc' ? 'warning' : 'tap');
  afterSave(L, kind);
}
function afterSave(L, kind) {
  const now = S.now(), plan = C.cadence(L, S.st, now, S.rules);
  const next = kind === 'dnc' ? 'Removed for good.' : plan.next ? (plan.next.kind === 'demo' ? plan.next.label : 'Next: day ' + plan.next.day + ' (' + C.dateWords(plan.next.due + 12 * 3600000, C.zonesOf(L, S.rules, S.st.settings).zones[0] || S.myTz) + '): ' + plan.next.label) : '';
  say('Saved: ' + (SAID[kind] || kind) + ' for ' + L.name + '. ' + next);
  render();
}
function openPicker(kind) {
  const L = curLead(), now = S.now(), Z = C.zonesOf(L, S.rules, S.st.settings), tz = Z.zones[0] || S.myTz;
  S.pick = kind;
  $('cbHint').textContent = kind === 'demo' ? 'When is the demo? Their time.' : 'When did they ask you to call back? Their time.';
  const today = C.partsIn(now, tz).date;
  const chips = $('cbChips'); clear(chips);
  const opts = [['In 2 hours', now + 2 * 3600000], ['Tomorrow 10:00 am', C.zonedToUtc(C.addDays(today, 1), 600, tz)], ['Tomorrow 2:00 pm', C.zonedToUtc(C.addDays(today, 1), 840, tz)], ['In 2 days, 10:00 am', C.zonedToUtc(C.addDays(today, 2), 600, tz)]];
  for (const [label, t] of opts) { const c = h('button', 'btn', label); c.type = 'button'; c.addEventListener('click', () => savePick(t)); chips.appendChild(c); }
  const q = C.partsIn(now + 2 * 3600000, tz);
  $('cbDate').value = q.date; $('cbTime').value = (q.hh < 10 ? '0' : '') + q.hh + ':' + (q.mm < 10 ? '0' : '') + q.mm;
  $('cbBox').hidden = false;
}
function savePick(t) {
  const L = curLead(); if (!L) return;
  const Z = C.zonesOf(L, S.rules, S.st.settings);
  if (Z.zones.length) {
    // a callback must still fall inside their legal hours (the prospect asking does not change the state's law)
    const legal = C.windowStatus(Object.assign({}, L, { trade: L.trade }), t, S.rules, S.st.settings);
    if (!legal.legal) { say('That time is outside their legal hours (' + legal.text.replace(/^Not now: /, '') + ') Pick another time.'); return; }
  }
  tap(S.pick, { at: t });
  $('cbBox').hidden = true;
  cue('success');
  afterSave(L, S.pick);
}
function pickFromInputs() {
  const L = curLead(); if (!L) return;
  const tz = C.zonesOf(L, S.rules, S.st.settings).zones[0] || S.myTz, d = $('cbDate').value, tm = $('cbTime').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}/.test(tm)) { say('Pick a day and a time first.'); return; }
  savePick(C.zonedToUtc(d, +tm.slice(0, 2) * 60 + +tm.slice(3, 5), tz));
}
function step(dir) {
  const ids = visible(S.Q || []).map((q) => q.lead.id);
  if (!ids.length) { closeCall(); return; }
  const i = ids.indexOf(S.cur);
  const j = i < 0 ? 0 : (i + dir + ids.length) % ids.length;
  if (ids[j] === S.cur && i >= 0) { say('That was the last business for now.'); return; }
  openCall(ids[j], 'script');
}

// ---------------------------------------------------------------------------------------------------- import / export
function doImport(text, label) {
  const imp = C.parseImport(text, S.rules);
  if (imp.kind === 'bad') { say(imp.why); return; }
  if (!imp.leads.length && !(imp.log || []).length && !(imp.optouts || []).length) { say('Nothing to import: no business with a name or a US phone number was found.'); return; }
  if (S.demo) { const saved = readSaved(); const keep = saved ? C.loadState(saved) : C.emptyState(); S.st = keep; S.demo = false; }
  if (imp.settings && !S.st.settings.me) S.st.settings = C.loadState(JSON.stringify({ settings: imp.settings })).settings;
  const r = C.mergeImport(S.st, imp);
  crmSync();
  save(); render();
  say('Imported from ' + label + ': ' + r.added + ' new ' + (r.added === 1 ? 'business' : 'businesses') + ', ' + r.updated + ' already in your list' + (imp.dupes ? ', ' + imp.dupes + ' duplicates merged' : '') + (r.optouts ? ', ' + r.optouts + ' do-not-call numbers added' : '') + '.');
  cue('success');
}
function download(name, text, type) {
  $('box').value = text;
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (_) { /* the text is in the box: copy it */ }
}
function stamp() { return C.partsIn(S.now(), S.myTz).date; }

function bind() {
  for (const b of $('filters').querySelectorAll('button')) b.addEventListener('click', () => { S.filter = b.dataset.f; render(); });
  $('startBtn').addEventListener('click', () => { const q = (S.Q || []).filter((x) => x.rank <= 2)[0]; if (q) { S.filter = 'now'; openCall(q.lead.id, 'script'); } });
  $('cClose').addEventListener('click', closeCall);
  $('callScrim').addEventListener('click', closeCall);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('call').hidden) closeCall(); });
  for (const t of document.querySelectorAll('.tabs [role=tab]')) t.addEventListener('click', () => { S.tab = t.dataset.tab; renderCall(); });
  $('cDial').addEventListener('click', (e) => {
    const L = curLead(); if (!L) return;
    if (!$('cDial').getAttribute('href')) e.preventDefault();
    C.logDial(S.st, L.id, S.now()); save();
    say(C.telHref(L.phone) ? 'Calling ' + L.name + '. After the call, tap what happened.' : 'Example number: no real call. Tap what happened to try the buttons.');
    setTimeout(() => { if (!$('call').hidden) renderCall(); }, 400);
  });
  $('cConfYes').addEventListener('click', () => { const L = curLead(); if (!L) return; tap('confirm'); say('Saved: ' + L.name + ' is a business line. You can call now.'); renderCall(); });
  $('cConfNo').addEventListener('click', () => { say('Skipped. Check the number on the National Do Not Call list first.'); step(1); });
  $('cNextLead').addEventListener('click', () => step(1));
  $('cPrev').addEventListener('click', () => step(-1));
  $('cbSave').addEventListener('click', pickFromInputs);
  $('cbCancel').addEventListener('click', () => { $('cbBox').hidden = true; });
  $('intSave').addEventListener('click', () => {
    const L = curLead(); if (!L) return;
    const em = $('intEmail').value.trim();
    if (em && !C.validEmail(em)) { say('That email does not look right: check it, or leave it empty.'); return; }
    tap('interested', { email: em, text: $('intText').getAttribute('aria-pressed') === 'true' });
    $('intBox').hidden = true; cue('success'); afterSave(L, 'interested');
  });
  $('intCancel').addEventListener('click', () => { $('intBox').hidden = true; });
  $('intText').addEventListener('click', () => { const b = $('intText'); b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); });
  $('consentBtn').addEventListener('click', () => { const L = curLead(); if (!L) return; const has = !!(L.consentText && L.consentText.on); tap(has ? 'noconsent' : 'consent'); say(has ? 'Text consent removed: no more texts to ' + L.name + '.' : 'Saved: ' + L.name + ' said you can text. Every text ends with "Reply STOP to opt out".'); renderCall(); });
  $('emailStop').addEventListener('click', () => { const L = curLead(); if (!L) return; tap('emailstop'); say('Saved: no more emails to ' + L.name + '.'); renderCall(); });
  $('importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { say('That file is over 5 MB: split it.'); return; }
    const rd = new FileReader(); rd.onload = () => { doImport(String(rd.result || ''), f.name); e.target.value = ''; }; rd.onerror = () => say('The file could not be read.'); rd.readAsText(f);
  });
  $('importBox').addEventListener('click', () => doImport($('box').value, 'the box'));
  $('fromApp').addEventListener('click', () => {
    let leads = (S.crm || []).slice();
    for (const k of C.SHARED_KEYS) { try { const v = localStorage.getItem(k); if (v) leads = leads.concat(C.sharedLeads(v, S.rules)); } catch (_) { /* no storage */ } }
    doImport(JSON.stringify(leads), 'the Agency app');
  });
  $('exportJson').addEventListener('click', () => { download('call-copilot-' + stamp() + '.json', C.exportJSON(S.st, S.now()), 'application/json'); say('Exported as JSON (also in the box). It holds business phones and your notes: keep it private.'); });
  $('exportCsv').addEventListener('click', () => { download('call-list-' + stamp() + '.csv', C.toCSV(S.st, S.now(), S.rules), 'text/csv'); say('Exported as CSV (also in the box).'); });
  let wipeArmed = 0;
  $('wipe').addEventListener('click', () => {
    if (!(wipeArmed && Date.now() - wipeArmed < 5000)) { wipeArmed = Date.now(); $('wipe').textContent = 'Tap again to erase everything'; say('Tap Erase again to delete every business, tap and setting on this phone. Export first if you want a copy.'); return; }
    wipeArmed = 0; $('wipe').textContent = 'Erase everything';
    try { localStorage.removeItem(C.KEY); } catch (_) { /* nothing saved */ }
    S.st = demoState(); S.demo = true; render(); say('Erased. Showing the example list again.');
  });
  $('saveSet').addEventListener('click', () => {
    if (S.demo) { const saved = readSaved(); S.st = saved ? C.loadState(saved) : C.emptyState(); S.demo = false; }
    const s = S.st.settings, v = (id) => $(id).value.trim();
    s.me = v('setMe'); s.biz = v('setBiz'); s.city = v('setCity'); s.phone = v('setPhone'); s.email = v('setEmail'); s.address = v('setAddress'); s.price = v('setPrice');
    s.defaultState = C.stateCode(v('setState'), S.rules) || '';
    const n = (id, d) => { const x = Math.round(+$(id).value); return Number.isFinite(x) && x >= 0 ? Math.min(500, x) : d; };
    const T = C.targetsOf(S.st, S.rules);
    s.targets = { dials: n('tDials', T.dials), conversations: n('tConv', T.conversations), demos: n('tDemos', T.demos), closesPerWeek: n('tCloses', T.closesPerWeek) };
    save(); render(); say('Saved on this phone.' + (s.address ? '' : ' Add your postal address before sending emails.'));
  });
}

async function boot() {
  const q = new URLSearchParams(location.search);
  S.forced = q.get('demo') === '1';
  const nq = q.get('now');
  if (nq && Number.isFinite(Date.parse(nq))) { S.fixedNow = Date.parse(nq); S.t0 = performance.now(); }
  const [rules, script, fx, crm] = await Promise.all([getJSON('./callrules.json'), getJSON('./callscript.json'), getJSON('./call_fixture.json'), getJSON('./leads.json', 4000)]);
  if (!rules || !script) { say('The call rules did not load, so no call can be checked. Reload the page when you are online.'); try { if (O && O.fail) O.fail('Call copilot could not start'); } catch (_) { /* nothing */ } return; }
  S.rules = rules; S.script = script; S.fixture = fx || { leads: [] };
  // B1's published CRM data, unless it is its sample / demo file (real businesses from a sample city: not for practice calls)
  S.crm = crm && typeof crm === 'object' && !crm.demo && !crm.sample ? C.sharedLeads(JSON.stringify(crm), rules) : [];
  const saved = S.forced ? null : readSaved();
  const st = saved ? C.loadState(saved) : null;
  if (st && st.leads.length) { S.st = st; S.demo = false; } else { S.st = demoState(); S.demo = true; }
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { tz = ''; }
  S.myTz = C.validTz(S.st.settings.myTz) ? S.st.settings.myTz : C.validTz(tz) ? tz : 'America/New_York';
  crmSync();
  bind(); render();
  const id = q.get('lead');
  if (id && C.findLead(S.st, id)) openCall(id, q.get('tab') || 'script');
  if (!S.cur) say(S.demo ? 'Example list: tap a business to see its call screen.' : 'Your list: ' + S.st.leads.length + ' businesses. Calls are locked outside each one\'s legal hours.');
  setInterval(() => { if ($('call').hidden) render(); }, 60000);
  S.ready = true;
}
window.CALLS = { S, C, ready: () => S.ready, render, open: openCall, close: closeCall, get state() { return S.st; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Call copilot could not start'); } catch (_) { /* nothing */ } });
