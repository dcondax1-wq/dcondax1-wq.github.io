// CALLER PORTAL page (day-a11y 2026-11-21). The rules live in portalcore.js; this file only draws and saves (this phone only).
import * as P from './portalcore.js?v=1';

const $ = (id) => document.getElementById(id);
const UNLOCK = 'agency.portal.unlock';
let conf = null, list = [], st = P.emptyState(), filter = 'go';

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
  try { const j = await getJSON('calllist.json'); list = Array.isArray(j.leads) ? j.leads : []; } catch (e) { list = []; $('status').textContent = 'Could not load the list. Pull down to try again.'; }
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
  const rows = P.sortForNow(P.allLeads(list, st), st, now, conf), n = { go: 0, need: 0, wait: 0, done: 0 };
  for (const r of rows) n[r.s.tone]++;
  for (const k of Object.keys(n)) $('n' + k[0].toUpperCase() + k.slice(1)).textContent = '(' + n[k] + ')';
  const ol = $('list'); ol.textContent = '';
  const shown = rows.filter((r) => r.s.tone === filter);
  $('status').textContent = shown.length ? shown.length + ' businesses' : ({ go: w.open ? 'Nobody to call right now. Check "Need a number": find a few on Google Maps.' : 'Calls are closed now: ' + w.why.toLowerCase() + '.', need: 'Every business has a number.', wait: 'Nobody waiting.', done: 'Nothing done yet.' })[filter];
  for (const r of shown) ol.appendChild(row(r.L, r.s));
  mailLink();
}

function row(L, s) {
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
  const site = li.querySelector('.site'), url = P.siteUrl(L, conf);
  if (url) site.href = url; else site.remove();
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

function announce(t) { $('status').textContent = t; }

// ---------------------------------------------------------------------------------------------------- the rest of the page
function wire() {
  for (const b of document.querySelectorAll('.tabs button')) {
    b.addEventListener('click', () => {
      filter = b.dataset.f;
      for (const x of document.querySelectorAll('.tabs button')) x.setAttribute('aria-pressed', String(x === b));
      render();
    });
  }
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
