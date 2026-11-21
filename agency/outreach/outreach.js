// AGENCY · OUTREACH page (day-a11y 2026-11-20). The logic is outreachcore.js; the words are scripts.json. Text only via textContent.
// Saved on this phone: the status marks in 'agency.leads.status.v1' (shared with the Leads page: { id: { s, t } }) and the owner's details,
// the touches (day 0 / 3 / 7) and the delivery ticks in 'agency.outreach.v1'. Nothing is sent: tel: / mailto: / the clipboard only.
import * as C from './outreachcore.js?v=1';

const KEY = 'agency.outreach.v1', MARK_KEY = 'agency.leads.status.v1', SUM_KEY = 'agency.outreach.summary';
const $ = (id) => document.getElementById(id);
const S = { st: C.emptyState(), marks: {}, leads: [], words: null, offers: null, sites: {}, base: '', tab: 'today', plan: 'starter', mem: {} };
const PLANS = [['starter', 'Starter site'], ['callengine', 'Call engine'], ['noupfront', 'No upfront ($149 / mo)']];

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function clear(e) { while (e && e.firstChild) e.removeChild(e.firstChild); return e; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function nice(iso) { if (!iso) return ''; const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
let toastT = 0;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return S.mem[k] || null; } }, set(k, v) { S.mem[k] = v; try { localStorage.setItem(k, v); return true; } catch (_) { return false; } } };
function load() {
  try { S.st = C.normState(JSON.parse(ls.get(KEY) || 'null')); } catch (_) { S.st = C.emptyState(); }
  try { const m = JSON.parse(ls.get(MARK_KEY) || '{}'); S.marks = m && typeof m === 'object' ? m : {}; } catch (_) { S.marks = {}; }
}
function save() {
  const ok = ls.set(KEY, JSON.stringify(S.st)) && ls.set(MARK_KEY, JSON.stringify(S.marks));
  if (!ok) toast('This browser blocks saving: your marks last this visit only.');
  summary();
}
function summary() {
  const rows = C.todays(S.leads, S.marks, S.st.touches, today(), 999), due = rows.filter((r) => r.p.step !== 'first').length;
  const won = Object.values(S.marks).filter((m) => m && m.s === 'won').length, yes = Object.values(S.marks).filter((m) => m && m.s === 'interested').length;
  ls.set(SUM_KEY, JSON.stringify({ n: rows.length, label: `${Math.min(20, rows.length)} to contact today`, next: due ? `${due} follow-up${due === 1 ? '' : 's'} due` : rows.length ? 'Start with the first one on the list' : '',
    t: Math.round(Date.now() / 1000), pipe: { due, interested: yes, won } }));
}
function meVars() { return S.st.me; }
function missingMe() { return ['your_name', 'your_business', 'your_phone', 'postal_address'].filter((k) => !S.st.me[k]); }

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied.`); return; } catch (_) { /* older browsers */ }
  const ta = h('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast(`${what} copied.`); } catch (_) { toast('Could not copy here: long-press to select the text.'); } ta.remove();
}

// ------------------------------------------------------------------------------------------------ today's 20
function wordsFor(L) {
  const W = S.words, v = C.varsFor(L, meVars(), { sites: S.sites, base: S.base, offers: S.offers }), p = C.plan(L, S.marks[L.id], S.st.touches[L.id], today());
  const step = C.emailStep(p), mail = W.email.find((e) => e.id === step) || W.email[0];
  let body = C.fill(mail.body, v);
  // the business's own concept site has the "Have our assistant call me" button (day-caller: the AI calls only those who asked, Maryland law)
  if (step === 'first' && v.demo_own && !body.includes(C.CALL_LINE)) body = body.replace('\n\nWould a 10-minute call', '\n\n' + C.CALL_LINE + '\n\nWould a 10-minute call');
  return { v, p, opener: C.fill(W.phone.opener, v), vm: C.fill(W.phone.voicemail, v), subject: C.fill(mail.subject, v), body, mailLabel: mail.label };
}
function btn(text, cls, fn, label) { const b = h('button', 'ag-btn ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', fn); if (label) b.setAttribute('aria-label', label); return b; }
function mark(L, s) {
  const cur = (S.marks[L.id] || {}).s, d = today();
  if (cur === s && !['called', 'voicemail', 'emailed'].includes(s)) delete S.marks[L.id];
  else {
    S.marks[L.id] = { s, t: Date.now() };
    if (['called', 'voicemail', 'emailed'].includes(s)) {
      const p = C.plan(L, cur ? { s: cur } : null, S.st.touches[L.id], d), list = S.st.touches[L.id] || (S.st.touches[L.id] = []);
      if (!list.some((t) => t.d === d)) list.push({ d, k: C.emailStep(p) });
    }
  }
  save(); drawToday();
  toast(s === 'no' ? `${L.name}: never contact again.` : s === 'won' ? `${L.name}: won! The close kit is ready.` : `${L.name}: ${C.STATUSES.find((x) => x[0] === s)[1].toLowerCase()}.`);
}
function card(L) {
  const w = wordsFor(L), li = h('li', 'lead ag-card card'), cur = (S.marks[L.id] || {}).s || '';
  const top = h('div', 'row'); top.appendChild(h('h3', '', L.name));
  const heat = h('span', 'pill ' + (L.heat || ''), (L.heat || '').toUpperCase() || 'LEAD'); heat.setAttribute('aria-label', `${L.heat || 'unrated'} lead`); top.appendChild(heat); li.appendChild(top);
  li.appendChild(h('p', 'meta', [w.v.niche, w.v.town, L.phone || 'no phone on the map: look it up first'].join(' · ')));
  li.appendChild(h('p', 'step ' + w.p.step, w.p.label));
  const demo = h('a', 'demo', w.v.demo_own ? 'Their site (built)' : 'Niche demo (their own site not built yet)'); demo.href = w.v.demo; demo.target = '_blank'; demo.rel = 'noopener';
  demo.setAttribute('aria-label', `Open the demo for ${L.name}`); li.appendChild(demo);
  const act = h('div', 'btns');
  if (L.phone) { const tel = h('a', 'ag-btn primary', 'Call'); tel.href = 'tel:' + L.phone.replace(/[^\d+]/g, ''); tel.setAttribute('aria-label', `Call ${L.name}, ${L.phone}`); act.appendChild(tel); }
  act.appendChild(btn('Copy opener', '', () => copy(w.opener, 'The 20-second opener'), `Copy the phone opener for ${L.name}`));
  act.appendChild(btn('Copy voicemail', '', () => copy(w.vm, 'The voicemail'), `Copy the voicemail script for ${L.name}`));
  act.appendChild(btn('Copy email', '', () => copy(`Subject: ${w.subject}\n\n${w.body}`, w.mailLabel), `Copy the ${w.mailLabel.toLowerCase()} for ${L.name}`));
  if (L.email) { const m = h('a', 'ag-btn', 'Email'); m.href = `mailto:${encodeURIComponent(L.email)}?subject=${encodeURIComponent(w.subject)}&body=${encodeURIComponent(w.body)}`; m.setAttribute('aria-label', `Email ${L.name}`); act.appendChild(m); }
  li.appendChild(act);
  const mk = h('div', 'marks'); mk.setAttribute('role', 'group'); mk.setAttribute('aria-label', `Status of ${L.name}`);
  for (const [k, t] of C.STATUSES) { const b = btn(t, 'mark ' + k, () => mark(L, k)); b.setAttribute('aria-pressed', String(cur === k)); mk.appendChild(b); }
  li.appendChild(mk);
  return li;
}
function drawToday() {
  const rows = C.todays(S.leads, S.marks, S.st.touches, today(), 20), ol = clear($('today'));
  for (const r of rows) ol.appendChild(card(r.L));
  if (!rows.length) ol.appendChild(h('li', 'note', S.leads.length ? 'Nobody to contact today: every lead is done, waiting for a follow-up day, or marked. New leads come from the Leads page.' : 'No leads yet: run the lead finder (Leads page).'));
  const all = C.todays(S.leads, S.marks, S.st.touches, today(), 9999), vals = Object.values(S.marks);
  const tiles = clear($('tiles'));
  for (const [k, n] of [['Due today', all.filter((r) => r.p.step !== 'first').length], ['Not yet contacted', all.filter((r) => r.p.step === 'first').length],
    ['Interested', vals.filter((m) => m && m.s === 'interested').length], ['Won', vals.filter((m) => m && m.s === 'won').length]]) {
    const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', '', n)); tiles.appendChild(t);
  }
  const miss = missingMe(); $('meWarn').hidden = !miss.length;
  $('status').textContent = `${rows.length} business${rows.length === 1 ? '' : 'es'} for today${miss.length ? '. Add your details (Me) so the messages carry your name and address.' : '.'}`;
}

// ------------------------------------------------------------------------------------------------ the words
function block(title, text, what) {
  const d = h('div', 'say'); d.appendChild(h('h3', '', title)); d.appendChild(h('p', 'txt', text));
  d.appendChild(btn('Copy', 'sm', () => copy(text, what || title), `Copy: ${title}`)); return d;
}
function drawWords() {
  const W = S.words, v = Object.assign({}, meVars(), { business: '[their business]', town: '[their town]', niche: '[what they do]', demo: '[their demo link]', demo_short: '[their demo link]', offer_line: C.priceLine(S.offers) });
  const r = clear($('rules')); for (const x of W.rules) r.appendChild(h('li', '', x));
  const ph = clear($('phoneWords'));
  ph.appendChild(block('20-second opener', C.fill(W.phone.opener, v))); ph.appendChild(block('Voicemail', C.fill(W.phone.voicemail, v))); ph.appendChild(block('When they say yes', C.fill(W.phone.after_yes, v)));
  const em = clear($('emailWords')); for (const e of W.email) em.appendChild(block(e.label, `Subject: ${C.fill(e.subject, v)}\n\n${C.fill(e.body, v)}`));
  const ob = clear($('objections'));
  for (const o of W.objections) { const d = h('details', 'obj'); d.appendChild(h('summary', '', o.q)); d.appendChild(h('p', '', o.a)); ob.appendChild(d); }
}

// ------------------------------------------------------------------------------------------------ the close kit
function planNums() {
  const P = (S.offers && S.offers.packages) || [], dep = (S.offers && S.offers.deposit) || 0.5;
  if (S.plan === 'noupfront') return { name: 'Starter site, no upfront', scope: ((P.find((p) => p.id === 'starter') || {}).includes || []).slice(0, 4).join('; '), setup: 0, deposit: 0, balance: 0,
    monthly: `${C.money(C.NO_UPFRONT.monthly)} a month for ${C.NO_UPFRONT.months} months (hosting and small edits included); after that the site is yours, and the care plan is $79 a month if you want it.`, min: ` after the first ${C.NO_UPFRONT.months} months`, days: 7 };
  const p = P.find((x) => x.id === S.plan) || P[0] || { name: 'Starter site', price: 1500, monthly: 79, days: 7, includes: [] };
  const deposit = Math.round(p.price * dep);
  return { name: p.name, scope: (p.includes || []).slice(0, 5).join('; '), setup: p.price, deposit, balance: p.price - deposit,
    monthly: `${C.money(p.monthly)} a month (${(p.monthly_label || 'care plan').toLowerCase()}: hosting, updates, small edits).`, min: p.min_months ? ` after the first ${p.min_months} months` : '', days: p.days || 7 };
}
function drawClose() {
  const W = S.words, n = planNums(), biz = $('cBiz').value.trim(), who = $('cName').value.trim();
  const v = Object.assign({}, meVars(), { client_business: biz || '[their business]', client_name: who || '[their name]', date: nice(today()) + ', ' + today().slice(0, 4),
    package: n.name, package_scope: n.scope, setup_price: C.money(n.setup), deposit: C.money(n.deposit), balance: C.money(n.balance), monthly_line: n.monthly, min_term: n.min, days: n.days });
  const A = clear($('agreement')), G = W.agreement;
  const t = h('h2', '', G.title); t.id = 'agH'; A.appendChild(t); A.appendChild(h('p', '', C.fill(G.intro, v)));
  const dl = h('dl', 'terms'); for (const [k, x] of G.items) { const w = h('div'); w.appendChild(h('dt', '', k)); w.appendChild(h('dd', '', C.fill(x, v))); dl.appendChild(w); } A.appendChild(dl);
  A.appendChild(h('p', 'sign', C.fill(G.sign, v))); A.appendChild(h('p', 'foot', G.foot));
  const I = clear($('invoice')), IV = W.invoice, ti = h('h2', '', `${IV.title}: ${v.client_business}`); ti.id = 'invH'; I.appendChild(ti);
  I.appendChild(h('p', 'from', `From ${C.fill('{your_business} · {your_name} · {your_phone} · {postal_address}', v)}`));
  I.appendChild(h('p', '', `Date ${v.date}`));
  const tb = h('table', 'lines'), row = (a, b, th) => { const tr = h('tr'); tr.appendChild(h(th ? 'th' : 'td', '', a)); tr.appendChild(h(th ? 'th' : 'td', 'n', b)); tb.appendChild(tr); };
  if (S.plan === 'noupfront') row(`${n.name}: first month`, C.money(C.NO_UPFRONT.monthly)); else row(`${n.name} website: ${Math.round(((S.offers && S.offers.deposit) || 0.5) * 100)} % deposit`, v.deposit);
  row('Total due', S.plan === 'noupfront' ? C.money(C.NO_UPFRONT.monthly) : v.deposit, true); I.appendChild(tb);
  I.appendChild(h('p', 'pay', IV.pay_line)); I.appendChild(h('p', 'foot', IV.terms));
  const ol = clear($('delivery'));
  W.delivery.forEach((d, i) => {
    const li = h('li'), l = h('label', 'chk'), c = document.createElement('input'); c.type = 'checkbox'; const k = 'd' + i; c.checked = !!S.st.checks[k];
    c.addEventListener('change', () => { if (c.checked) S.st.checks[k] = true; else delete S.st.checks[k]; save(); });
    const sp = h('span'); sp.appendChild(h('b', 'who ' + d.who, d.who === 'owner' ? 'You' : d.who === 'client' ? 'Client' : 'Claude')); sp.appendChild(h('span', '', ' ' + C.fill(d.step, v)));
    l.appendChild(c); l.appendChild(sp); li.appendChild(l); ol.appendChild(li);
  });
}
function printNode(node, title) {
  const p = clear($('print')); p.appendChild(node); const old = document.title; document.title = title;
  const done = () => { document.title = old; clear(p); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch (_) { done(); toast('Printing is not available here.'); }
}

// ------------------------------------------------------------------------------------------------ tabs, me, wiring
function setTab(id, focus) {
  S.tab = id;
  for (const b of document.querySelectorAll('#tabs [role=tab]')) { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== 'p-' + id;
  try { history.replaceState(null, '', '#' + id); } catch (_) { /* file: */ }
}
function wire() {
  const tabs = Array.from(document.querySelectorAll('#tabs [role=tab]'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
    b.addEventListener('keydown', (e) => { const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!k) return; e.preventDefault(); setTab(tabs[(i + k + tabs.length) % tabs.length].dataset.tab, true); });
  });
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.go, true)));
  $('meForm').addEventListener('submit', (e) => {
    e.preventDefault();
    for (const k of Object.keys(C.ME_DEFAULTS)) { const v = $(k).value.trim(); if (v) S.st.me[k] = v.slice(0, 160); else delete S.st.me[k]; }
    save(); drawAll(); toast('Saved on this phone.'); setTab('today', true);
  });
  $('closeForm').addEventListener('input', drawClose);
  $('closeForm').addEventListener('submit', (e) => e.preventDefault());
  $('printAg').addEventListener('click', () => printNode($('agreement').cloneNode(true), `Agreement ${$('cBiz').value.trim() || ''}`.trim()));
  $('printInv').addEventListener('click', () => printNode($('invoice').cloneNode(true), `Invoice ${$('cBiz').value.trim() || ''}`.trim()));
}
function drawAll() {
  if (!$('autoNums').firstChild) autoTiles(null);
  for (const k of Object.keys(C.ME_DEFAULTS)) $(k).value = S.st.me[k] || '';
  const seg = clear($('cPlan'));
  for (const [id, t] of PLANS) {
    const l = h('label', 'opt'), r = document.createElement('input'); r.type = 'radio'; r.name = 'plan'; r.value = id; r.checked = S.plan === id;
    r.addEventListener('change', () => { S.plan = id; drawClose(); }); l.appendChild(r); l.appendChild(h('span', '', t)); seg.appendChild(l);
  }
  drawToday(); drawWords(); drawClose();
}

// the PC's email autopilot: its tiny card "am" rides the PC report (pc_feed.js merges it into the lite live.json); no fetch of its own
async function drawAuto() {
  const box = $('auto'), F = window.PC_FEED;
  let a = null;
  try { const lite = F && F.fetchLatest ? await F.fetchLatest({ feedUrl: '../../status_feed.json' }) : null; a = C.parseCard(lite && lite.am); } catch (_) { a = null; }
  const st = $('autoState');
  if (!a) { st.textContent = 'Off, or the PC has not reported today. To turn it on: EMAIL_SETUP.bat on the PC (it stays off until you type SEND EMAILS).'; autoTiles(null); return; }
  const ago = Math.max(0, Math.round((Date.now() / 1000 - a.t) / 60));
  st.textContent = (a.mode === 'live' ? 'ON: emailing businesses' : a.mode === 'dry' ? 'DRY RUN: test emails to you only' : 'OFF') + ` · ${ago < 90 ? ago + ' min' : Math.round(ago / 60) + ' h'} ago`;
  autoTiles(a); box.dataset.mode = a.mode;
}
// the six tiles exist from the first paint ('-' until the PC's numbers arrive): nothing below moves
function autoTiles(a) {
  const t = clear($('autoNums'));
  for (const [k, v] of [['New today', a ? `${a.new} / ${a.cap}` : '-'], ['Follow-ups', a ? a.followup : '-'], ['Replies today', a ? a.replies_today : '-'],
    ['Interested', a ? a.interested : '-'], ['Never again', a ? a.suppressed : '-'], ['Waiting', a ? a.queue : '-']]) {
    const d = h('div', 'tile'); d.appendChild(h('small', '', k)); d.appendChild(h('b', '', v)); t.appendChild(d);
  }
}
async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } }
async function start() {
  load(); wire();
  S.base = new URL('../../', location.href).href;
  const [W, L, O, sites] = await Promise.all([getJSON('scripts.json'), getJSON('../leads/leads.json'), getJSON('../offers/offers.json'), getJSON('../sites/index.json')]);
  const lift = () => { try { const K = window.OLYMPUS; if (K && K.ready) K.ready(); } catch (_) { /* the veil lifts by itself */ } };
  if (!W || !Array.isArray(W.email)) { $('status').textContent = 'The scripts (scripts.json) did not load. Reload the page to try again.'; lift(); return; }
  S.words = W; S.offers = O; S.leads = (L && Array.isArray(L.leads) ? L.leads : []);
  // the factory's built sites: { sites: { <lead id>: "<url or path>" } } or { sites: [{ id, url }] }
  if (sites && sites.sites) S.sites = Array.isArray(sites.sites) ? Object.fromEntries(sites.sites.filter((x) => x && x.id && x.url).map((x) => [x.id, x.url])) : sites.sites;
  const dl = clear($('bizList')); for (const x of S.leads.slice(0, 300)) { const o = document.createElement('option'); o.value = x.name; dl.appendChild(o); }
  drawAll(); summary(); lift();
  drawAuto();
  const tab = (location.hash || '').slice(1); if (['today', 'words', 'close', 'me'].includes(tab)) setTab(tab);
}
start();
