// CALLER PORTAL page (day-a11y 2026-11-21). The rules live in portalcore.js; this file only draws and saves (this phone only).
import * as P from './portalcore.js?v=4';

const $ = (id) => document.getElementById(id);
const UNLOCK = 'agency.portal.unlock';
let conf = null, list = [], st = P.emptyState(), filter = 'today', page = 25, price = null, book = null;   // book = price.json (the proposal's numbers, from the price book)   // page: rows drawn (25 more per tap: 4,500 rows never at once)

function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode: works for this visit */ } }
function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function save() { store(P.KEY, JSON.stringify(st)); }
async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }
async function sha256(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------------------------------- lock
async function boot() {
  st = P.loadState(read(P.KEY));
  try { conf = await getJSON('portal.json'); } catch (e) { conf = null; }
  const h = conf && conf.pass && conf.pass.sha256;
  if (!h) { $('lockMsg').textContent = 'Not set up yet. The agency sets the passphrase on its PC (python -m agency.portal pass).'; $('lockForm').querySelector('button').disabled = true; return; }
  if (st.caller) $('who').value = st.caller;
  if (read(UNLOCK) === h && st.caller) return open();
  $('lockForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const who = $('who').value.trim(), phrase = $('phrase').value;
    if (who.length < 2) { $('lockMsg').textContent = 'Type your name.'; return; }
    let got = '';
    try { got = await sha256(conf.pass.salt + ':' + phrase); } catch (e) { $('lockMsg').textContent = 'This browser cannot check the passphrase here (open the page over https).'; return; }
    if (got !== h) { $('lockMsg').textContent = 'That passphrase is not right.'; $('phrase').select(); return; }
    st.caller = who.slice(0, 40); save(); store(UNLOCK, h); $('phrase').value = '';
    open();
  });
}

async function open() {
  $('lock').hidden = true; $('main').hidden = false;
  $('hello').textContent = 'Signed in as ' + st.caller + (conf.agency ? ' · ' + conf.agency : '');
  $('identify').textContent = '"' + P.identify(st.caller, conf.agency) + '"';
  try { book = await getJSON('price.json'); } catch (e) { book = null; }
  try { const j = await getJSON('calllist.json'); list = Array.isArray(j.leads) ? j.leads : []; price = j.price || null; } catch (e) { list = []; $('status').textContent = 'Could not load the list. Pull down to try again.'; }
  wire(); render();
  setInterval(render, 60000);
}

// ---------------------------------------------------------------------------------------------------- draw
function render() {
  const now = Date.now(), w = P.windowAt(now, conf);
  const pill = $('window');
  pill.className = 'pill ' + (w.open ? 'go' : 'wait');
  pill.textContent = w.open ? 'Open: you can call now (until ' + P.hhmm((conf.hours || [540, 1020])[1]) + ' their time)' : w.why + ': calls open ' + w.next;
  const d0 = Date.now() - (P.partsIn(now, conf.tz).min * 60000);
  const t = P.tally(st, conf, d0), all = P.tally(st, conf, 0);
  $('sCalls').textContent = t.calls; $('sInt').textContent = all.interested; $('sBooked').textContent = all.booked; $('sWon').textContent = all.won; $('sMoney').textContent = money(all.maybe);
  const leadsAll = P.allLeads(list, st), rows = P.sortForNow(leadsAll, st, now, conf), n = { today: 0, go: 0, need: 0, redesign: 0, wait: 0, done: 0 };
  for (const r of rows) { r.tab = P.tabOf(r.L, r.s); n[r.tab]++; }
  const today = P.todayList(leadsAll, st, now, conf, 60); n.today = today.length;
  const T = P.dayTally(st, now, conf, price);
  $('eDials').textContent = T.dials; $('eConn').textContent = T.connects; $('eBooked').textContent = T.booked; $('ePipe').textContent = money(T.pipeline);
  $('eText').textContent = T.text;
  for (const k of Object.keys(n)) $('n' + k[0].toUpperCase() + k.slice(1)).textContent = '(' + n[k] + ')';
  const ol = $('list'); ol.textContent = '';
  let shown = filter === 'today' ? today : rows.filter((r) => r.tab === filter);
  if (filter === 'redesign') shown = shown.sort((a, b) => (b.s.ok - a.s.ok) || ((b.L.score || 0) - (a.L.score || 0)));   // callable first, the most dated site first
  $('status').textContent = shown.length ? (filter === 'today' ? shown.length + ' to call now: follow-ups due first, then the best hour for each kind of business' : shown.length + ' businesses') : ({ today: w.open ? 'Nobody to call this hour. Try "Need a number" or "Redesign".' : 'Calls are closed now: ' + w.why.toLowerCase() + '. Today fills up when they open.', go: w.open ? 'Nobody to call right now. Check "Need a number": find a few on Google Maps.' : 'Calls are closed now: ' + w.why.toLowerCase() + '.', need: 'Every business has a number.', redesign: 'No business with a site on the list.', wait: 'Nobody waiting.', done: 'Nothing done yet.' })[filter];
  for (const r of shown.slice(0, page)) ol.appendChild(row(r.L, r.s, r.best));
  const more = $('moreRows'); more.hidden = shown.length <= page; more.textContent = 'Show ' + Math.min(25, shown.length - page) + ' more (' + (shown.length - page) + ' left)';
  mailLink();
}

function row(L, s, best) {
  const li = $('rowT').content.firstElementChild.cloneNode(true);
  li.classList.add(s.tone); li.dataset.id = L.id;
  li.querySelector('.name').textContent = L.name;
  li.querySelector('.code').textContent = L.code || (L.added ? 'new' : '');
  li.querySelector('.meta').textContent = [L.kind || L.niche, L.town].filter(Boolean).join(' · ') + (P.entriesOf(st, L.id).length ? ' · ' + P.entriesOf(st, L.id).map((e) => e.k).join(', ') : '');
  li.querySelector('.why').textContent = s.why;
  const ph = P.phoneOf(L, st), call = li.querySelector('.call');
  if (ph && s.tone !== 'done') {
    call.textContent = 'Call ' + P.prettyPhone(ph);
    if (s.ok) call.href = P.telHref(ph); else { call.removeAttribute('href'); call.setAttribute('aria-disabled', 'true'); call.setAttribute('role', 'link'); }
    call.addEventListener('click', () => { if (s.ok) showOutcomes(li, L); });
  } else call.remove();
  const lane = P.laneOf(L), lb = li.querySelector('.lane');
  lb.textContent = P.LANES[lane] + (lane === 'redesign' && L.score ? ' · ' + L.score + '/11' : ''); lb.classList.add(lane);
  li.querySelector('.opener').textContent = P.opener(L);
  if (lane === 'redesign' && Array.isArray(L.why) && L.why.length) { const c = li.querySelector('.checks'); c.textContent = 'Their site: ' + L.why.join(', '); c.hidden = false; }
  if (lane === 'site_down' && L.proof) { const c = li.querySelector('.checks'); c.textContent = String(L.proof).slice(0, 200); c.hidden = false; }   // what failed + when (tools/site_down_proof.py)
  const site = li.querySelector('.site'), url = lane === 'redesign' ? P.theirSite(L) : P.siteUrl(L, conf);
  if (url) { site.href = url; if (lane === 'redesign') site.textContent = 'Their current site'; } else site.remove();
  const maps = li.querySelector('.maps');
  if (s.tone === 'need') { maps.href = P.mapsUrl(L); phoneForm(li, L); } else maps.remove();
  if (s.ok) showOutcomes(li, L, true);
  const es = P.entriesOf(st, L.id), last = es[es.length - 1];
  if (last && Date.now() - last.t < 15 * 60000) {
    const u = document.createElement('button');
    u.type = 'button'; u.className = 'btn ghost'; u.textContent = 'Undo "' + last.k + '"';
    u.addEventListener('click', () => { P.undoLast(st, L.id); save(); render(); announce(L.name + ': undone.'); });
    li.querySelector('.acts').appendChild(u);
  }
  const talked = P.entriesOf(st, L.id).some((e) => ['called', 'interested', 'booked', 'won'].indexOf(e.k) >= 0);
  if (talked && url) mailForm(li, L);
  const keen = P.entriesOf(st, L.id).some((e) => e.k === 'interested' || e.k === 'booked');
  if (keen && book && s.tone !== 'done' && !s.mail) proposalPanel(li, L);
  if (s.mail) followUpPanel(li, L);
  // the best hour for this kind of business, the scripts, the Do Not Call field
  const bw = document.createElement('span'); bw.className = 'best'; bw.textContent = best ? 'Best hour now' : 'Best: ' + P.bestWords(L, conf);
  if (best || s.ok) li.querySelector('.why').appendChild(bw);
  const sc = P.scripts(L, st.caller, conf);
  li.querySelector('.vm').textContent = sc.voicemail; li.querySelector('.tx').textContent = sc.text;
  li.querySelector('.copyVm').addEventListener('click', () => copy(sc.voicemail, li));
  li.querySelector('.copyTx').addEventListener('click', () => copy(sc.text, li));
  const sel = li.querySelector('.dncSel'); sel.value = P.dncOf(L, st);
  sel.addEventListener('change', () => { P.setDnc(st, L, sel.value); save(); render(); announce(L.name + ': Do Not Call list = ' + sel.options[sel.selectedIndex].text + '.'); });
  return li;
}

function showOutcomes(li, L, quiet) {
  const fs = li.querySelector('.outcomes'), grid = fs.querySelector('.grid');
  if (!grid.children.length) {
    for (const o of P.OUTCOMES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn' + (o.k === 'no' || o.k === 'dnc' ? ' bad' : ''); b.textContent = o.label;
      b.addEventListener('click', () => {
        P.logOutcome(st, L, o.k, Date.now()); save();
        const keep = li.dataset.id; render();
        const again = document.querySelector('li[data-id="' + CSS.escape(keep) + '"]');
        announce(L.name + ': ' + o.label.toLowerCase() + ' saved.' + (P.FINAL[o.k] ? ' Never called again.' : ''));
        if (again) again.querySelector('.msg').textContent = 'Saved.';
      });
      grid.appendChild(b);
    }
  }
  fs.hidden = false;
  if (!quiet) fs.querySelector('button').focus();
}

function phoneForm(li, L) {
  const f = li.querySelector('.phoneForm'); f.hidden = false;
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = P.normPhone(f.querySelector('.foundPhone').value);
    if (!d) { li.querySelector('.msg').textContent = 'Type a 10-digit US number.'; return; }
    st.phones[L.id] = d; save(); render(); announce(L.name + ': number saved.');
  });
}

function mailForm(li, L) {
  const f = li.querySelector('.mailForm'); f.hidden = false;
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const to = f.querySelector('.theirEmail').value.trim(), m = P.emailFor(L, st.caller, conf), msg = li.querySelector('.msg');
    if (!P.validEmail(to)) { msg.textContent = 'Type their email address.'; return; }
    if (!m.ready) { msg.textContent = 'Not ready: the agency still has to finish its email settings. Read them the link instead.'; return; }
    window.open(P.gmailUrl(conf, to, m.subject, m.body), '_blank', 'noopener');
    P.logOutcome(st, L, 'emailed', Date.now()); save();
    msg.textContent = 'The agency Gmail opened with the email ready. Check it and press Send.';
  });
}

// ---------------------------------------------------------------------------------------------------- close the sale
function theirEmail(li) { const v = (li.querySelector('.theirEmail') || {}).value || ''; return v.trim(); }
function logOnce(L, k) { const es = P.entriesOf(st, L.id), last = es[es.length - 1]; if (!(last && last.k === k && Date.now() - last.t < 600000)) { P.logOutcome(st, L, k, Date.now()); save(); } }
function proposalPanel(li, L) {
  const box = li.querySelector('.proposal'); box.hidden = false;
  if (P.theirSite(L) || P.siteUrl(L, conf)) li.querySelector('.mailForm').hidden = false;   // their email, for "Email it"
  const prop = () => P.proposalFor(L, st.caller, conf, book, Date.now());
  box.querySelector('.openProp').addEventListener('click', () => {
    try { localStorage.setItem('agency.portal.proposal', JSON.stringify({ lead: L, caller: st.caller, conf: { agency: conf.agency, agency_email: conf.agency_email, postal: conf.postal,
      agency_number: conf.agency_number, public_base: conf.public_base, tz: conf.tz }, price: book, t: Date.now() })); } catch (e) { /* private mode: the copy email still works */ }
    window.open('proposal.html', '_blank', 'noopener'); logOnce(L, 'proposal'); announce(L.name + ': proposal opened (print or save it as PDF).');
  });
  box.querySelector('.copyProp').addEventListener('click', () => { copy(prop().email, li); logOnce(L, 'proposal'); });
  box.querySelector('.gmailProp').addEventListener('click', () => {
    const to = theirEmail(li), m = li.querySelector('.msg');
    if (!P.validEmail(to)) { m.textContent = 'Type their email address first (in the box below).'; return; }
    if (!P.validEmail(conf.agency_email)) { m.textContent = 'The agency email is not set yet: copy the email instead.'; return; }
    const x = prop(); window.open(P.gmailUrl(conf, to, x.subject, x.email), '_blank', 'noopener'); logOnce(L, 'proposal');
    m.textContent = 'The agency Gmail opened with the proposal. Check it and press Send.';
  });
}
function followUpPanel(li, L) {
  const box = li.querySelector('.fuMail'), f = P.proposalFollowUp(L, st.caller, conf); box.hidden = false;
  li.querySelector('.mailForm').hidden = false;   // their email, for "Email it"
  box.querySelector('.copyFu').addEventListener('click', () => copy(f.email, li));
  box.querySelector('.gmailFu').addEventListener('click', () => {
    const to = theirEmail(li), m = li.querySelector('.msg');
    if (!P.validEmail(to) || !P.validEmail(conf.agency_email)) { m.textContent = 'Copy the email and send it from the agency inbox.'; return; }
    window.open(P.gmailUrl(conf, to, f.subject, f.email), '_blank', 'noopener');
  });
  box.querySelector('.sentFu').addEventListener('click', () => { P.logOutcome(st, L, 'fu_email', Date.now()); save(); render(); announce(L.name + ': follow-up email logged. That was the last step.'); });
}
function copy(text, li) {
  const done = () => { const m = li.querySelector('.msg'); if (m) m.textContent = 'Copied.'; };
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, done); return; } } catch (e) { /* older phone */ }
  const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); done();
}
function announce(t) { $('status').textContent = t; }

// ---------------------------------------------------------------------------------------------------- the rest of the page
function wire() {
  for (const b of document.querySelectorAll('.tabs button')) {
    b.addEventListener('click', () => {
      filter = b.dataset.f; page = 25;
      for (const x of document.querySelectorAll('.tabs button')) x.setAttribute('aria-pressed', String(x === b));
      render();
    });
  }
  $('eCopy').addEventListener('click', () => { const T = P.dayTally(st, Date.now(), conf, price); copy(T.text, { querySelector: () => $('eText') }); });
  $('moreRows').addEventListener('click', () => { page += 25; render(); });
  $('signout').addEventListener('click', () => { store(UNLOCK, null); location.reload(); });
  $('addForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const r = P.addBusiness(st, { name: $('aName').value, phone: $('aPhone').value, town: $('aTown').value, niche: $('aNiche').value }, Date.now());
    if (r.error) { $('addMsg').textContent = r.error; return; }
    save(); $('addForm').reset();
    $('addMsg').textContent = r.lead.name + ' added. Its free site gets built once your log reaches the agency.';
    render();
  });
  $('saveLog').addEventListener('click', () => {
    const doc = P.exportDoc(st, Date.now()), day = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }));
    a.download = 'portal-log-' + st.caller.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 20) + '-' + day + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  mailLink();
}

function mailLink() {
  const t = P.tally(st, conf, 0), ml = $('mailLog');
  if (!ml) return;
  if (P.validEmail(conf.agency_email)) {
    ml.href = 'mailto:' + conf.agency_email + '?subject=' + encodeURIComponent('Caller log: ' + st.caller) +
      '&body=' + encodeURIComponent('My log file is attached.\n\nCalls: ' + t.calls + ', interested: ' + t.interested + ', booked: ' + t.booked + ', won: ' + t.won + '\n\n' + st.caller);
  } else { ml.remove(); }
}

boot();
