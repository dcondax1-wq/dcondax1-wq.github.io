// AGENCY · OFFERS page (day-web-offers 2026-11-20). The maths is offerscore.js; this file only draws and saves.
// Saved: localStorage 'agency.offers.v1' (this phone), download / load a copy as JSON. Text goes in by textContent only.
import * as C from './offerscore.js?v=2';

const KEY = 'agency.offers.v1';
const $ = (id) => document.getElementById(id);
const S = { data: C.normData({}), state: C.emptyState(), names: [], tab: 'pk', mem: null, saved: true };

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function clear(e) { while (e && e.firstChild) e.removeChild(e.firstChild); return e; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function plusDays(iso, n) { const p = iso.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2] + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function nice(iso) { if (!iso) return ''; const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
const M = C.money;
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

function load() { try { const raw = localStorage.getItem(KEY); if (raw) return C.normState(JSON.parse(raw)); } catch (_) { if (S.mem) return C.normState(S.mem); } return C.emptyState(); }
function save() {
  S.mem = S.state;
  try { localStorage.setItem(KEY, JSON.stringify(S.state)); S.saved = true; } catch (_) { S.saved = false; }
  // the Agency HQ tile reads this (HUB team): paying clients, MRR, proposals sent, the next step
  try { localStorage.setItem('agency.offers.summary', JSON.stringify(C.summary(S.state, today(), Date.now() / 1000))); } catch (_) { /* private mode */ }
}
function sent() { S.state.sent = (S.state.sent || 0) + 1; save(); }
function status(extra) {
  const L = C.ledger(S.state, today());
  const bits = [`${L.active} monthly client${L.active === 1 ? '' : 's'}, ${M(L.mrr)} a month`];
  if (L.overdue.length) bits.push(`${L.overdue.length} late`);
  if (L.open_invoices.length) bits.push(`${M(L.open_total)} in open invoices`);
  if (!S.saved) bits.push('not saved: this browser blocks storage, download a copy');
  $('status').textContent = (extra ? extra + ' ' : '') + bits.join(' · ') + '.';
}

// ------------------------------------------------------------------------------------------------ top card
function drawTop() {
  const L = C.ledger(S.state, today());
  $('mrrNum').textContent = M(L.mrr);
  $('mrrPill').textContent = `${M(L.mrr)} a month`;
  $('moMrr').textContent = `${M(L.mrr)} a month`;
  const next = C.GOALS.find((g) => g > L.mrr);
  $('mrrSub').textContent = !L.active ? 'No paying clients yet. Add one in Money when they sign.'
    : next ? `${L.active} client${L.active === 1 ? '' : 's'} paying every month. ${M(next - L.mrr)} more a month to reach ${M(next)}.` : `${L.active} clients: past ${M(5000)} a month.`;
  const pct = Math.min(100, Math.round((L.mrr / 5000) * 100));
  $('goalBar').style.setProperty('--p', pct + '%');
  $('goalBar').setAttribute('aria-label', `Progress to $5,000 a month: ${pct} %`);
}

// ------------------------------------------------------------------------------------------------ packages
function perHour(m) { return m.per_hour === Infinity ? 'no hours' : `${M(m.per_hour)}/h`; }
function drawPackages() {
  const box = clear($('pkgs')), hr = S.state.hourly;
  for (const p of S.data.packages) {
    const m = C.margin(p, hr), mm = C.monthlyMargin(p, hr);
    const c = h('article', 'ag-card card pkg'); c.setAttribute('aria-labelledby', 'pk-' + p.id);
    if (p.badge) c.classList.add('picked');
    const top = h('div', 'row'); const t = h('h2', '', p.name); t.id = 'pk-' + p.id; top.appendChild(t);
    if (p.badge) top.appendChild(h('span', 'pill gold', p.badge));
    top.appendChild(h('span', 'pill', `${p.days} day${p.days === 1 ? '' : 's'}`)); c.appendChild(top);
    const pr = h('p', 'price'); if (p.from) pr.appendChild(h('span', '', 'from ')); pr.appendChild(h('b', 'ag-num', M(p.price))); pr.appendChild(h('span', '', ' to set up')); c.appendChild(pr);
    if (p.monthly) c.appendChild(h('p', 'monthly', `then ${M(p.monthly)} a month (${p.monthly_label.toLowerCase()})`));
    c.appendChild(h('p', 'pitch', p.pitch));
    const ul = h('ul', 'inc'); for (const i of p.includes) ul.appendChild(h('li', '', i)); c.appendChild(ul);
    const k = h('dl', 'kv mine');
    const add = (dt, dd, cls) => { const w = h('div', cls || ''); w.appendChild(h('dt', '', dt)); w.appendChild(h('dd', '', dd)); k.appendChild(w); };
    add('Your time', `about ${p.hours} h = ${M(m.time_cost)} at ${M(hr)}/h`);
    add('You keep', `${M(m.profit)} after ${M(m.hard)} hard costs = ${perHour(m)}, ${m.ok ? 'at or above' : 'below'} your target`, m.ok ? 'ok' : 'bad');
    if (p.monthly) add('Each month', `${M(mm.profit)} for about ${mm.hours} h = ${perHour(mm)}, ${mm.ok ? 'at or above' : 'below'} target`, mm.ok ? 'ok' : 'bad');
    c.appendChild(k);
    const b = h('button', 'ag-btn', `Make a ${p.name} proposal`); b.type = 'button'; b.addEventListener('click', () => { pick.package = p.id; drawForm(); drawProposal(); setTab('pr', true); });
    c.appendChild(b);
    box.appendChild(c);
  }
  const ex = clear($('extras'));
  for (const x of S.data.extras) { const li = h('li'); li.appendChild(h('span', '', x.name + (x.per ? ` (per ${x.per})` : ''))); const m = C.margin(x, hr); li.appendChild(h('b', '', `${M(x.price)}${x.monthly ? ' + ' + M(x.monthly) + '/mo' : ''} · ${perHour(m)}`)); ex.appendChild(li); }
  $('srcNote').textContent = (/^placeholder/i.test(S.data.source) ? '' : S.data.placeholder ? 'Placeholder prices: ' : 'Prices: ') + S.data.source + (S.data.as_of && !S.data.source.includes(S.data.as_of) ? ` (${S.data.as_of})` : '');
}

// ------------------------------------------------------------------------------------------------ proposal
const pick = { package: '', extras: [], rush: false, discount: 0, biz: '', from: '' };
function drawForm() {
  const seg = clear($('prPkg'));
  for (const p of S.data.packages) {
    const l = h('label', 'opt'); const r = document.createElement('input'); r.type = 'radio'; r.name = 'pkg'; r.value = p.id; r.checked = p.id === (pick.package || S.data.packages[0].id);
    r.addEventListener('change', () => { pick.package = p.id; drawProposal(); });
    l.appendChild(r); l.appendChild(h('span', '', `${p.name} · ${M(p.price)} + ${M(p.monthly)}/mo${p.badge ? ' · ' + p.badge : ''}`)); seg.appendChild(l);
  }
  const ex = clear($('prExtras'));
  for (const x of S.data.extras) {
    const l = h('label', 'chk'); const c = document.createElement('input'); c.type = 'checkbox'; c.value = x.id; c.checked = pick.extras.includes(x.id);
    c.addEventListener('change', () => { pick.extras = c.checked ? pick.extras.concat(x.id) : pick.extras.filter((i) => i !== x.id); drawProposal(); });
    l.appendChild(c); l.appendChild(h('span', '', `${x.name} · ${M(x.price)}${x.monthly ? ' + ' + M(x.monthly) + '/mo' : ''}`)); ex.appendChild(l);
  }
  $('prFrom').value = S.state.agency || '';
}
function currentQuote() { return C.quote(S.data, { package: pick.package || (S.data.packages[0] || {}).id, extras: pick.extras, rush: pick.rush, discount: pick.discount }, S.state.hourly); }
function drawProposal() {
  const q = currentQuote(); if (!q) return;
  const biz = $('prBiz').value.trim() || 'Your business', from = S.state.agency || 'Your web designer';
  $('shFrom').textContent = `From ${from}`;
  $('shTitle').textContent = `Website proposal for ${biz}`;
  $('shPitch').textContent = `${q.package.name}: ${q.package.pitch}`;
  const tb = clear($('shLines'));
  for (const l of q.lines) { const tr = h('tr'); tr.appendChild(h('td', '', l.name + (l.monthly ? ` (then ${M(l.monthly)} a month)` : ''))); tr.appendChild(h('td', 'n ag-num', M(l.price))); tb.appendChild(tr); }
  $('shTotal').textContent = M(q.setup);
  $('shPay').textContent = `${M(q.deposit)} deposit to start, ${M(q.balance)} when the site goes live.`;
  $('shMonthly').textContent = q.monthly ? `Every month after launch: ${M(q.monthly)} (${q.monthly_label.toLowerCase()}${q.monthly_extras.length ? ' + ' + q.monthly_extras.map((x) => x.name.toLowerCase()).join(' + ') : ''}). ` + C.minTerm(q.package) : '';
  $('shDays').textContent = `Ready in about ${q.days} working day${q.days === 1 ? '' : 's'} after the deposit and the photos, logo and words.`;
  const ul = clear($('shInc')); for (const i of q.package.includes) ul.appendChild(h('li', '', i));
  $('shDate').textContent = nice(today());
  $('prMargin').textContent = `About ${q.hours} h of your time. You keep ${M(q.profit)} = ${q.per_hour === Infinity ? 'no hours' : M(q.per_hour) + '/h'} (`
    + `${q.ok ? 'at or above' : 'BELOW'} your ${M(S.state.hourly)}/h target). First year with the monthly plan: ${M(q.first_year)}.`;
  $('prMargin').className = q.ok ? 'ok' : 'bad';
}
function printWith(node, title) {
  const p = clear($('print')); p.appendChild(node); p.setAttribute('aria-hidden', 'false');
  const old = document.title; document.title = title;
  const done = () => { document.title = old; p.setAttribute('aria-hidden', 'true'); clear(p); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch (_) { toast('Printing is not available here.'); done(); }
}
function proposalPrint() {
  const q = currentQuote(); if (!q) return;
  const biz = $('prBiz').value.trim() || 'Your business';
  printWith($('sheet').cloneNode(true), `Proposal ${biz} ${today()}`); sent();
}
async function proposalShare() {
  const q = currentQuote(); if (!q) return;
  const text = C.proposalText(q, S.state.agency, $('prBiz').value.trim(), nice(today()));
  try { if (navigator.share) { await navigator.share({ title: 'Website proposal', text }); sent(); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); sent(); toast('Copied: paste it in a message or email.'); } catch (_) { toast('Could not copy on this browser.'); }
}
function depositInvoice() {
  const q = currentQuote(); if (!q) return;
  const biz = $('prBiz').value.trim(); if (!biz) { toast('Type the business name first.'); $('prBiz').focus(); return; }
  S.state.invoices.push({ id: C.newId('i'), client: biz, what: `${q.package.name} website: ${Math.round(S.data.deposit * 100)} % deposit`, amount: q.deposit, due: plusDays(today(), 7), paid: '', made: today() });
  save(); drawMoney(); drawTop(); status(); setTab('mo', true); toast(`Invoice for ${M(q.deposit)} added.`);
}

// ------------------------------------------------------------------------------------------------ terms
function drawTerms() {
  const ul = clear($('terms')); let n = 0;
  for (const t of S.data.terms) {
    const li = h('li'); const l = h('label', 'chk'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!S.state.terms[t.id]; if (c.checked) n += 1;
    c.addEventListener('change', () => { S.state.terms[t.id] = c.checked; save(); drawTerms(); });
    const w = h('span'); w.appendChild(h('b', '', t.title)); w.appendChild(h('span', 'tx', t.text)); l.appendChild(c); l.appendChild(w); li.appendChild(l); ul.appendChild(li);
  }
  $('termsCount').textContent = `${n} of ${S.data.terms.length} agreed. Not legal advice.`;
}

// ------------------------------------------------------------------------------------------------ money
function rowBtn(label, fn, cls) { const b = h('button', 'ag-btn sm' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; }
function drawMoney() {
  const L = C.ledger(S.state, today()), ul = clear($('clients'));
  if (!S.state.clients.length) ul.appendChild(h('li', 'empty', 'No monthly clients yet. When someone signs a care plan or retainer, add them below.'));
  const stopped = S.state.clients.filter((c) => !c.active);
  for (const r of L.rows.concat(stopped.map((c) => ({ ...c, due: '', late: 0 })))) {
    const li = h('li', 'row' + (r.late ? ' late' : '') + (r.active ? '' : ' off'));
    const t = h('div', 'txt'); t.appendChild(h('b', '', r.name));
    const pk = S.data.packages.find((p) => p.id === r.package);
    t.appendChild(h('span', '', `${M(r.monthly)} a month${pk ? ' · ' + pk.name : ''} · ` + (!r.active ? 'stopped' : r.late ? `LATE ${r.late} day${r.late === 1 ? '' : 's'} (due ${nice(r.due)})` : `next due ${nice(r.due)}`)));
    li.appendChild(t);
    const a = h('div', 'btns');
    if (r.active) a.appendChild(rowBtn('Paid', () => { const c = S.state.clients.find((x) => x.id === r.id); c.paid = C.nextDue(c); save(); drawAllMoney(); toast(`${r.name}: paid for ${nice(c.paid)}.`); }, 'primary'));
    a.appendChild(rowBtn(r.active ? 'Stop' : 'Restart', () => { const c = S.state.clients.find((x) => x.id === r.id); c.active = !c.active; save(); drawAllMoney(); }));
    a.appendChild(rowBtn('Delete', () => { if (!confirm(`Delete ${r.name}?`)) return; S.state.clients = S.state.clients.filter((x) => x.id !== r.id); save(); drawAllMoney(); }, 'quiet'));
    a.querySelectorAll('button').forEach((b) => b.setAttribute('aria-label', `${b.textContent}: ${r.name}`));
    li.appendChild(a); ul.appendChild(li);
  }
  const iv = clear($('invoices'));
  const inv = S.state.invoices.slice().sort((a, b) => (!!a.paid - !!b.paid) || (a.due < b.due ? -1 : 1));
  if (!inv.length) iv.appendChild(h('li', 'empty', 'No invoices yet. Make the deposit invoice from a proposal, or add one below.'));
  for (const i of inv.slice(0, 60)) {
    const late = !i.paid && i.due && C.daysBetween(i.due, today()) > 0 ? C.daysBetween(i.due, today()) : 0;
    const li = h('li', 'row' + (late ? ' late' : '') + (i.paid ? ' off' : ''));
    const t = h('div', 'txt'); t.appendChild(h('b', '', `${i.client}: ${M(i.amount)}`));
    t.appendChild(h('span', '', `${i.what || 'Website work'} · ` + (i.paid ? `paid ${nice(i.paid)}` : late ? `LATE ${late} day${late === 1 ? '' : 's'}` : `due ${nice(i.due)}`)));
    li.appendChild(t);
    const a = h('div', 'btns');
    if (!i.paid) a.appendChild(rowBtn('Paid', () => { i.paid = today(); save(); drawAllMoney(); toast(`${i.client}: ${M(i.amount)} paid.`); }, 'primary'));
    a.appendChild(rowBtn('PDF', () => printWith(invoiceNode(i), `Invoice ${i.client} ${i.made || today()}`)));
    a.appendChild(rowBtn('Delete', () => { if (!confirm(`Delete the ${M(i.amount)} invoice for ${i.client}?`)) return; S.state.invoices = S.state.invoices.filter((x) => x.id !== i.id); save(); drawAllMoney(); }, 'quiet'));
    a.querySelectorAll('button').forEach((b) => b.setAttribute('aria-label', `${b.textContent}: ${i.client} ${M(i.amount)}`));
    li.appendChild(a); iv.appendChild(li);
  }
  $('moOpen').textContent = `${M(L.open_total)} open`;
}
function invoiceNode(i) {
  const a = h('article', 'sheet');
  a.appendChild(h('p', 'sh-from', `From ${S.state.agency || 'Your web designer'}`));
  a.appendChild(h('h2', '', `Invoice for ${i.client}`));
  a.appendChild(h('p', '', `Date ${nice(i.made || today())} · Due ${nice(i.due)}`));
  const tb = h('table', 'lines'), tr = h('tr'); tr.appendChild(h('td', '', i.what || 'Website work')); tr.appendChild(h('td', 'n', M(i.amount))); tb.appendChild(tr);
  const tf = h('tr'); tf.appendChild(h('th', '', 'Total due')); tf.appendChild(h('td', 'n', M(i.amount))); tb.appendChild(tf); a.appendChild(tb);
  a.appendChild(h('p', 'sh-foot', i.paid ? `Paid ${nice(i.paid)}. Thank you.` : 'Due in full by the date above. Thank you for your business.'));
  return a;
}
function drawAllMoney() { drawMoney(); drawTop(); drawGoals(); status(); }

// ------------------------------------------------------------------------------------------------ goals
function drawGoals() {
  const L = C.ledger(S.state, today()), G = C.goals(S.data, S.state.hourly, L.mrr), box = clear($('goals'));
  $('glNote').textContent = `Counted in what clients pay you. You bring in ${M(L.mrr)} a month now. Builds are one-off: they pay this month, not every month. Your hourly target is ${M(S.state.hourly)}.`;
  for (const g of G) {
    const c = h('section', 'goal' + (g.reached ? ' done' : '')); c.setAttribute('aria-label', `${M(g.goal)} a month`);
    c.appendChild(h('h3', '', `${M(g.goal)} a month` + (g.reached ? ': reached' : `: ${M(g.gap)} to go`)));
    if (!g.reached) {
      const t = h('table', 'gt'); const th = h('tr'); ['Plan', 'Monthly clients', 'or builds a month'].forEach((x) => { const e = h('th', '', x); e.scope = 'col'; th.appendChild(e); });
      const thead = h('thead'); thead.appendChild(th); t.appendChild(thead); const tb = h('tbody');
      for (const p of g.per) { const tr = h('tr'); const n = h('th', '', p.name); n.scope = 'row'; tr.appendChild(n); tr.appendChild(h('td', 'n', p.clients == null ? '-' : `${p.clients} at ${M(p.monthly)}`)); tr.appendChild(h('td', 'n', p.builds_a_month == null ? '-' : `${p.builds_a_month} (${p.build_hours} h)`)); tb.appendChild(tr); }
      t.appendChild(tb); c.appendChild(t);
    }
    box.appendChild(c);
  }
}

// ------------------------------------------------------------------------------------------------ tabs + wiring
function setTab(id, focus) {
  S.tab = id;
  for (const b of document.querySelectorAll('#tabs [role=tab]')) { const on = b.dataset.tab === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== 'p-' + id;
  try { history.replaceState(null, '', '#' + id); } catch (_) { /* file: */ }
}
function wire() {
  const tabs = Array.from(document.querySelectorAll('#tabs [role=tab]'));
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
    b.addEventListener('keydown', (e) => { const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!k) return; e.preventDefault(); setTab(tabs[(i + k + tabs.length) % tabs.length].dataset.tab, true); });
  });
  $('hourly').addEventListener('change', () => { const v = Math.round(+$('hourly').value); if (v >= 5 && v <= 1000) { S.state.hourly = v; save(); drawPackages(); drawProposal(); drawGoals(); } else $('hourly').value = S.state.hourly; });
  $('prBiz').addEventListener('input', drawProposal);
  $('prFrom').addEventListener('change', () => { S.state.agency = $('prFrom').value.trim().slice(0, 60); save(); drawProposal(); });
  $('prRush').addEventListener('change', () => { pick.rush = $('prRush').checked; drawProposal(); });
  $('prDisc').addEventListener('input', () => { pick.discount = Math.max(0, +$('prDisc').value || 0); drawProposal(); });
  $('prForm').addEventListener('submit', (e) => e.preventDefault());
  $('prPrint').addEventListener('click', proposalPrint);
  $('prShare').addEventListener('click', proposalShare);
  $('prInvoice').addEventListener('click', depositInvoice);
  $('clStart').value = today(); $('invDue').value = plusDays(today(), 14);
  $('clPkg').addEventListener('change', () => { const p = S.data.packages.find((x) => x.id === $('clPkg').value); if (p) $('clMonthly').value = p.monthly; });
  $('clForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = { id: C.newId('c'), name: $('clName').value.trim(), package: $('clPkg').value, monthly: Math.round(+$('clMonthly').value || 0), start: $('clStart').value, paid: '', active: true };
    if (!c.name || !c.start) return;
    S.state.clients.push(c); S.state = C.normState(S.state); save(); $('clForm').reset(); $('clStart').value = today(); $('clPkg').dispatchEvent(new Event('change'));
    $('addClientBox').open = false; drawAllMoney(); toast(`${c.name} added: ${M(c.monthly)} a month.`);
  });
  $('invForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const i = { id: C.newId('i'), client: $('invClient').value.trim(), what: $('invWhat').value.trim(), amount: Math.round(+$('invAmount').value || 0), due: $('invDue').value, paid: '', made: today() };
    if (!i.client || !(i.amount > 0)) return;
    S.state.invoices.push(i); S.state = C.normState(S.state); save(); $('invForm').reset(); $('invDue').value = plusDays(today(), 14);
    $('addInvBox').open = false; drawAllMoney(); toast(`Invoice for ${M(i.amount)} added.`);
  });
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.state, null, 1)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `agency-offers-${today()}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  $('importFile').addEventListener('change', async () => {
    const f = $('importFile').files[0]; if (!f) return;
    try { const st = C.normState(JSON.parse(await f.text())); if (!confirm(`Load ${st.clients.length} clients and ${st.invoices.length} invoices? This replaces what is on this phone.`)) return; S.state = st; save(); drawEverything(); toast('Loaded.'); }
    catch (_) { toast('That file is not an Offers copy.'); }
    $('importFile').value = '';
  });
}
function drawEverything() {
  $('hourly').value = S.state.hourly;
  const sel = clear($('clPkg')); for (const p of S.data.packages) { const o = h('option', '', `${p.name} (${M(p.monthly)})`); o.value = p.id; sel.appendChild(o); }
  $('clMonthly').value = (S.data.packages[0] || {}).monthly || '';
  drawTop(); drawPackages(); drawForm(); drawProposal(); drawTerms(); drawMoney(); drawGoals(); status(); save();
}

async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function start() {
  S.state = load();
  wire();
  try { S.data = C.normData(await getJSON('offers.json')); } catch (_) { $('status').textContent = 'The price list (offers.json) did not load. Reload the page to try again.'; }
  const lift = () => { try { const O = window.OLYMPUS; if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ } };
  if (!S.data.packages.length) { S.data = C.normData({}); lift(); return; }
  pick.package = S.data.packages[0].id;
  drawEverything();
  lift();
  const tab = (location.hash || '').slice(1); if (['pk', 'pr', 'tm', 'mo', 'gl'].includes(tab)) setTab(tab);
  for (const u of ['../leads.json', '../fixture.json']) {
    try { const d = await getJSON(u); const names = (d.leads || []).map((l) => String(l.name || '').slice(0, 80)).filter(Boolean); if (names.length) { S.names = names; break; } } catch (_) { /* next */ }
  }
  const dl = clear($('bizList')); for (const n of S.names.slice(0, 200)) { const o = document.createElement('option'); o.value = n; dl.appendChild(o); }
}
start();
