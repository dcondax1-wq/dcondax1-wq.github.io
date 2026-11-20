// AGENCY page (ES module): the website-agency CRM. Leads -> demo built -> contacted -> call back -> won / lost, with the dollars.
// Reads ./leads.json (published by `python -m agency.run`) and ./fixture.json (DEMO, only when leads.json is missing or broken).
// The owner's work (stage, notes, call-back day, price, demo link, calls) is localStorage 'agency.crm.v1' in this browser, with export / import / CSV.
// Sends nothing: Call is a tel: link and Email opens the phone's Mail app with the text ready; the owner presses send. Text only through textContent.
// window.AGENCY is the test hook. ?demo=1 forces the demo; ?lead=<id> opens that lead.
import * as C from './agencycore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const KEY = 'agency.crm.v1';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { data: null, state: C.emptyState(), demo: false, ready: false, today: '', pick: '', filter: { stage: 'all', q: '', trade: 'all', sort: 'score' }, mem: null, saved: true };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
const lite = () => { try { return !!(O && O.lite && O.lite()); } catch (_) { return false; } };
function say(t) { $('status').textContent = t; }
function cue(kind) { try { if (O && O.cue) O.cue(kind); } catch (_) { /* silent */ } }
function localDay() { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
function loadState() { try { const raw = localStorage.getItem(KEY); if (raw) return C.normState(JSON.parse(raw)); } catch (_) { if (S.mem) return C.normState(S.mem); } return C.emptyState(); }
function saveState() { S.mem = S.state; try { localStorage.setItem(KEY, JSON.stringify(S.state)); S.saved = true; } catch (_) { S.saved = false; } }
function copy(text, msgEl, what) {
  const done = () => { msgEl.textContent = `${what} copied. Paste it where you need it.`; cue('success'); };
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, () => { msgEl.textContent = 'Copy is blocked here: press and hold the text to copy it.'; }); return; } } catch (_) { /* below */ }
  msgEl.textContent = 'Copy is blocked here: press and hold the text to copy it.';
}
function download(name, text, type) {
  try { const url = URL.createObjectURL(new Blob([text], { type })), a = h('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return true; } catch (_) { return false; }
}
const vs = () => C.views(S.data, S.state);
function change(id, patch, msg) { S.state = C.update(S.state, id, patch, S.today); saveState(); if (msg) $('detMsg').textContent = msg + (S.saved ? '' : ' (this browser would not save it: export to keep it)'); render(); }

// ---- the pieces ----
function leadRow(v, compact) {
  const row = h('div', 'lrow' + (v.id === S.pick ? ' on' : ''));
  const open = h('button', 'leadbtn'); open.type = 'button'; open.dataset.id = v.id; open.setAttribute('aria-pressed', v.id === S.pick ? 'true' : 'false');
  open.setAttribute('aria-label', `${v.name}, ${v.trade}, score ${v.score}, ${C.STAGE[v.stage].label}: open the lead`);
  const top = h('span', 'lt'); top.appendChild(h('span', 'tier t' + v.tier, v.tier)); top.appendChild(h('b', '', v.name)); open.appendChild(top);
  open.appendChild(h('span', 'lm', `${v.trade} · ${C.STAGE[v.stage].label} · ${C.money(v.value.first_year)} first year${v.stage === 'callback' && v.callback ? ' · call back ' + v.callback : ''}`));
  if (!compact || v.why) open.appendChild(h('span', 'lw', v.why));
  open.addEventListener('click', () => { S.pick = v.id; render(); cue('tap'); const d = $('detail'); if (d && d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  row.appendChild(open);
  if (v.tel && v.stage !== 'dnc') { const call = h('a', 'btn primary call', 'Call'); call.href = v.tel; call.setAttribute('aria-label', `Call ${v.name} at ${v.phone}`); call.addEventListener('click', () => { change(v.id, { called: true }); }); row.appendChild(call); }
  return row;
}
function renderHero(p) {
  $('heroNum').textContent = C.money(p.month_total);
  $('heroSub').textContent = C.heroLine(p);
  $('goalPill').textContent = `${Math.round(p.goal_frac * 100)}% of ${C.money(p.goal)}`; $('goalPill').className = 'pill ' + (p.goal_frac >= 1 ? 'ok' : 'info');
  $('goalBar').firstElementChild.style.width = Math.round(p.goal_frac * 100) + '%'; $('goalBar').setAttribute('aria-label', `${Math.round(p.goal_frac * 100)}% of the ${C.money(p.goal)} a month goal`);
  $('tOpen').textContent = C.money(p.open); $('tWeighted').textContent = C.money(p.weighted); $('tMrr').textContent = C.money(p.mrr); $('tCalls').textContent = String(p.calls_week);
}
function renderToday(all) {
  const list = C.callToday(all, S.today, 5), box = $('today'); clear(box);
  $('todayCount').textContent = String(list.length);
  for (const v of list) box.appendChild(leadRow(v, true));
  if (!list.length) box.appendChild(h('p', 'note', 'Nobody to call right now. New leads come with the next run of the website machine.'));
}
function renderStages(p) {
  const box = $('stages'); clear(box);
  const items = [{ id: 'all', label: 'All', n: S.data.leads.length }, ...C.STAGES.map((s) => ({ id: s.id, label: s.label, n: p.by[s.id] }))];
  for (const it of items) {
    const b = h('button', 'chip', `${it.label} ${it.n}`); b.type = 'button'; b.dataset.stage = it.id; b.setAttribute('aria-pressed', S.filter.stage === it.id ? 'true' : 'false');
    b.addEventListener('click', () => { S.filter.stage = it.id; render(); }); box.appendChild(b);
  }
}
function renderList(all) {
  const box = $('list'); clear(box);
  const list = C.filterSort(all, S.filter);
  for (const v of list) box.appendChild(leadRow(v, false));
  if (!list.length) box.appendChild(h('p', 'note', 'No lead matches. Clear the search or pick All.'));
}
function renderDetail(all) {
  const v = all.find((x) => x.id === S.pick), card = $('detail'); card.hidden = !v; if (!v) return;
  $('detName').textContent = v.name; $('detTier').textContent = `Score ${v.score} · ${v.tier}`; $('detTier').className = 'pill ' + (v.tier === 'A' ? 'ok' : v.tier === 'B' ? 'warn' : 'info');
  $('detMeta').textContent = [v.trade, v.address, v.phone, v.hours].filter(Boolean).join(' · ');
  $('detWhy').textContent = v.why;
  const ul = $('detReasons'); clear(ul); for (const r of v.reasons) ul.appendChild(h('li', '', r));
  const acts = $('detActions'); clear(acts);
  const link = (label, href, cls) => { if (!href) return; const a = h('a', 'btn' + (cls ? ' ' + cls : ''), label); a.href = href; if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } acts.appendChild(a); return a; };
  if (v.tel && v.stage !== 'dnc') { const a = link('Call ' + v.phone, v.tel, 'primary'); a.addEventListener('click', () => change(v.id, { called: true }, 'Marked as called today.')); }
  if (v.has_demo) link('Demo site', v.demo_url);
  link('Their site now', v.website); link('Map', v.map); link('Map data', v.osm);
  const st = $('detStages'); clear(st);
  for (const s of C.STAGES) {
    const b = h('button', 'chip', s.label); b.type = 'button'; b.setAttribute('aria-pressed', v.stage === s.id ? 'true' : 'false');
    b.addEventListener('click', () => { change(v.id, { stage: s.id }, `${v.name}: ${s.label}.`); cue(s.id === 'won' ? 'success' : 'tap'); }); st.appendChild(b);
  }
  const cb = $('detCallback'); cb.value = v.callback; cb.onchange = () => change(v.id, cb.value ? { callback: cb.value, stage: 'callback' } : { callback: '' }, cb.value ? `Call back on ${cb.value}.` : 'Call-back day cleared.');
  const pk = $('detPackage'); clear(pk);
  for (const p of S.data.packages) { const o = h('option', '', `${p.name}: ${C.money(p.setup)} + ${C.money(p.monthly)}/mo`); o.value = p.id; pk.appendChild(o); }
  pk.value = v.value.package; pk.onchange = () => change(v.id, { package: pk.value, price: '', monthly: '' }, 'Package changed.');
  const pr = $('detPrice'), mo = $('detMonthly'); pr.value = String(v.value.setup); mo.value = String(v.value.monthly);
  const money = (el, key) => { el.onchange = () => { const n = C.num(el.value); if (n == null || n < 0) { $('detMsg').textContent = 'A price is a number of dollars, 0 or more.'; el.value = String(v.value[key === 'price' ? 'setup' : 'monthly']); return; } change(v.id, { [key]: Math.round(n) }, 'Price saved.'); }; };
  money(pr, 'price'); money(mo, 'monthly');
  const dm = $('detDemo'); dm.value = v.demo_url; dm.onchange = () => { const u = C.safeUrl(dm.value.trim()); if (dm.value.trim() && !u) { $('detMsg').textContent = 'A demo link must be a secure (https) web address.'; return; } change(v.id, { demo_url: u }, u ? 'Demo link saved: the opener and email use it.' : 'Demo link cleared.'); };
  const nt = $('detNotes'); nt.value = v.notes; nt.onchange = () => change(v.id, { notes: nt.value }, 'Notes saved in this browser.');
  $('detValue').textContent = `${v.value.package_name}: ${C.money(v.value.setup)} to start + ${C.money(v.value.monthly)} a month = ${C.money(v.value.first_year)} in the first year. ${v.calls ? `Called ${v.calls} time${v.calls === 1 ? '' : 's'}, last ${v.last_call}.` : 'Not called yet.'}`;
  const swap = (t) => (t || '').split(S.data.leads.find((x) => x.id === v.id).demo_url || '\u0000').join(v.demo_url);
  $('detOpenerText').textContent = swap(v.opener); $('detVoicemail').textContent = v.voicemail ? 'Voicemail: ' + swap(v.voicemail) : '';
  $('copyOpener').onclick = () => copy(swap(v.opener), $('detMsg'), 'The opener');
  const ready = S.data.agency.ready && !S.demo;
  $('detReady').textContent = ready ? `To: ${v.email || 'their email (ask on the phone)'}` : 'Not ready to send: put your real name, agency, email and postal address in agency/config.json on the PC and run the machine again (US law, CAN-SPAM).';
  $('detSubject').textContent = 'Subject: ' + v.subject;
  $('detEmailText').textContent = swap(v.email_body);
  $('copyEmail').onclick = () => copy(swap(v.email_body), $('detMsg'), 'The email');
  const mb = $('mailBtn'), href = ready ? C.mailHref(v.email, v.subject, swap(v.email_body).replace(/^To:.*\n|^From:.*\n|^Subject:.*\n/gm, '').trim()) : '';
  mb.hidden = !href; if (href) mb.href = href;
  if (v.stage === 'dnc') $('detMsg').textContent = 'Do not contact: they asked not to be called or emailed. Keep it that way.';
}
function renderPlan() {
  const p = S.data.plan, rows = C.planRows(p), tb = $('planTable').tBodies[0]; clear(tb);
  $('planH').textContent = `The plan to ${C.money(S.data.goal)} a month`;
  for (const r of rows) {
    const tr = h('tr', r.months && r.months <= 12 && p && p.pace && p.pace.new_per_month === r.n ? 'pace' : '');
    tr.appendChild(h('th', '', `${r.n}`)); tr.cells[0].scope = 'row';
    tr.appendChild(h('td', '', C.money(r.m6))); tr.appendChild(h('td', '', C.money(r.m12))); tr.appendChild(h('td', '', r.months ? `${r.months}` : 'over 5 years'));
    tb.appendChild(tr);
  }
  if (p && p.pace) {
    $('planLead').textContent = `${p.pace.new_per_month} new clients a month reaches ${C.money(S.data.goal)} a month in about ${p.pace.months_to_goal} months: about ${p.pace.dials} calls a month (${p.pace.dials_per_day} a working day, ${p.pace.hours_per_week} hours a week).`;
    $('planNote').textContent = `Average sale ${C.money(p.avg_setup)} to start + ${C.money(p.avg_monthly)} a month; care plans lose ${Math.round((p.churn || 0) * 100)}% a month. The call rates are estimates: replace them with your own after two weeks. Care plans alone would need ${p.care_clients_for_goal_alone} clients.`;
  } else { $('planLead').textContent = 'The plan appears after the next run of the website machine.'; $('planNote').textContent = ''; }
}
function render() {
  const all = vs(), p = C.pipeline(all, S.today, S.data.goal);
  $('demo').hidden = !S.demo; $('sample').hidden = !(S.data.sample && !S.demo); $('lite').hidden = !lite();
  renderHero(p); renderToday(all); renderStages(p);
  const tr = $('trade'), keep = S.filter.trade; clear(tr); const ao = h('option', '', 'All trades'); ao.value = 'all'; tr.appendChild(ao);
  for (const t of C.trades(all)) { const o = h('option', '', t); o.value = t; tr.appendChild(o); }
  tr.value = C.trades(all).includes(keep) ? keep : 'all';
  renderList(all); renderDetail(all); renderPlan();
  say(C.statusLine(S.data, p) + (S.demo ? ' Demo leads: run the website machine for your own.' : ''));
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

function bind() {
  $('q').addEventListener('input', () => { S.filter.q = $('q').value; renderList(vs()); });
  $('trade').addEventListener('change', () => { S.filter.trade = $('trade').value; renderList(vs()); });
  $('sort').addEventListener('change', () => { S.filter.sort = $('sort').value; renderList(vs()); });
  $('csvBtn').addEventListener('click', () => { const ok = download(`agency-leads-${S.today}.csv`, C.toCSV(vs()), 'text/csv'); $('ioMsg').textContent = ok ? `CSV with ${S.data.leads.length} leads downloaded.` : 'This browser blocked the download: use Export and copy the text.'; });
  $('exportBtn').addEventListener('click', () => {
    const txt = C.exportJson(S.state, S.today); $('ioText').value = txt; $('io').open = true;
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(() => {}); } catch (_) { /* the text is in the box */ }
    const n = Object.keys(S.state.leads).length;
    $('ioMsg').textContent = `Exported your notes on ${n} lead${n === 1 ? '' : 's'}. Copy the text (or save it in Files) to keep it.`;
  });
  $('importBtn').addEventListener('click', () => {
    const r = C.parseImport($('ioText').value);
    if (!r.ok) { $('ioMsg').textContent = r.error; return; }
    S.state = r.state; saveState(); $('ioMsg').textContent = `Imported your notes on ${r.count} lead${r.count === 1 ? '' : 's'}.`; render();
  });
  $('clearBtn').addEventListener('click', () => {
    if (!window.confirm('Remove every stage, note and price you added on this phone? Export first if you want a copy.')) return;
    S.state = C.emptyState(); saveState(); $('ioMsg').textContent = 'Started over: every lead is back to its first stage.'; render();
  });
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1';
  S.today = localDay();
  // my_leads.json = the owner's own batch (written on his PC, gitignored: never on the public github.io site, so not asked there = no 404); leads.json = the committed sample city; fixture.json = DEMO
  const [fx, mine, sample] = await Promise.all([getJSON('./fixture.json'), forced || /github\.io$/.test(location.hostname) ? null : getJSON('./my_leads.json'), forced ? null : getJSON('./leads.json')]);
  let D = C.normData(mine) || C.normData(sample);
  if (D && !D.demo) S.demo = false; else { S.demo = true; D = C.normData(fx); }
  if (!D) { say('No leads yet: run the website machine on the PC (RUN_AGENCY.bat).'); S.ready = true; return; }
  S.data = D;
  S.state = loadState();
  const want = q.get('lead'); S.pick = want && D.leads.some((l) => l.id === want) ? want : '';
  const sn = $('sampleNote'); sn.hidden = !(D.sample || S.demo);
  if (S.demo) sn.textContent = (fx && fx.note) || 'EXAMPLE leads, not real.';
  else if (D.sample) sn.textContent = `These are real ${D.city} businesses from the demo run, not your city yet: put your city in agency/config.json and run RUN_AGENCY.bat.`;
  bind(); render();
}
window.AGENCY = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); S.ready = true; try { if (O && O.fail) O.fail('Agency could not start'); } catch (_) { /* nothing */ } });
