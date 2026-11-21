// WEB LEADS page (day-web-leads 2026-11-20): reads ./leads.json (tools/web_leads.py, OpenStreetMap), shows a phone list to work through.
// The owner's marks live in localStorage only; "Call with script" hands the business to ../call.html. Text only via textContent.
const $ = (id) => document.getElementById(id);
const MARK_KEY = 'agency.leads.status.v1';
const HANDOFF_KEY = 'agency.calls.handoff.v1';
const SUM_KEY = 'agency.leads.summary';   // the Agency HQ tile (hub team): {n, label, next, t, pipe {leads, called}}
const PAGE = 25;
const S = { j: null, marks: {}, shown: PAGE, ready: false };
// the pipeline (lead 2026-11-20 Website Factory): new (no entry) -> demo ready -> contacted -> replied -> call booked -> won / lost; old marks carry over
export const STAGES = [['demo', 'Demo ready'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['booked', 'Call booked'], ['won', 'Won'], ['lost', 'Lost']];
// the SAME key as agency/outreach/ (day-a11y): {id: {s, t}}. Their values are kept as written; shown here as a stage:
// called -> Contacted, interested -> Replied, no -> Lost, voicemail / emailed -> Contacted, won -> Won, anything unknown -> Contacted.
const OLD = { called: 'contacted', interested: 'replied', no: 'lost', voicemail: 'contacted', emailed: 'contacted' };
export function stageOf(raw) { return !raw ? '' : STAGES.some(([k]) => k === raw) ? raw : OLD[raw] || 'contacted'; }
export function migrate(m) {                 // keeps every entry with a text status (never rewrites another app's value)
  const out = {};
  for (const [id, v] of Object.entries(m && typeof m === 'object' ? m : {})) {
    if (v && typeof v === 'object' && typeof v.s === 'string' && v.s) out[id] = Object.assign({}, v, { s: v.s.slice(0, 20), t: Number.isFinite(v.t) ? v.t : 0 });
  }
  return out;
}
const stageName = (k) => (STAGES.find(([x]) => x === stageOf(k)) || [k, 'New'])[1];
const rawLabel = (raw) => (raw && !STAGES.some(([k]) => k === raw) ? ({ called: 'called', interested: 'interested', no: 'not interested', voicemail: 'voicemail left', emailed: 'emailed' }[raw] || raw) : '');
// the export (CSV, one row per business with its stage): quotes doubled, a formula-looking cell starts with ' (spreadsheet safety)
export function toCsv(leads, marks) {
  const q = (v) => { let t = String(v == null ? '' : v); if (/^[=+\-@]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const head = ['name', 'town', 'kind', 'phone', 'email', 'address', 'mailable', 'heat', 'score', 'offer', 'stage', 'stage_date', 'osm'];
  const rows = leads.map((L) => { const m = marks[L.id] || {}; return [L.name, L.town, L.nicheName, L.phone, L.email, L.address, L.mailable ? 'yes' : 'no', L.heat, L.score, L.offer, m.s ? stageName(m.s) + (rawLabel(m.s) ? ' (' + rawLabel(m.s) + ')' : '') : 'New',
    m.t ? new Date(m.t).toISOString().slice(0, 10) : '', L.osm].map(q).join(','); });
  return [head.join(',')].concat(rows).join('\n');
}

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
function say(t) { $('status').textContent = t; }
function readMarks() { try { return migrate(JSON.parse(localStorage.getItem(MARK_KEY) || '{}')); } catch (_) { return {}; } }
function saveMarks() { try { localStorage.setItem(MARK_KEY, JSON.stringify(S.marks)); } catch (_) { /* private mode: marks last this visit */ } }

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(tm); }
}
export function valid(j) { return !!(j && typeof j === 'object' && j.kind === 'web_leads' && Array.isArray(j.leads)); }
export function cleanLead(x) {
  if (!x || typeof x !== 'object' || typeof x.name !== 'string' || !x.name.trim()) return null;
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  return { id: s(x.id, 40) || 'n-' + x.name.slice(0, 30), name: s(x.name, 80), niche: s(x.niche, 20), nicheName: s(x.niche_name, 40) || s(x.niche, 20),
    town: s(x.town, 40), city: s(x.city, 60), phone: s(x.phone, 20), address: s(x.address, 120), hours: s(x.hours, 80), heat: ['hot', 'warm', 'cold'].includes(x.heat) ? x.heat : 'cold',
    score: Number.isFinite(x.score) ? x.score : 0, why: Array.isArray(x.why) ? x.why.filter((w) => typeof w === 'string').slice(0, 5) : [], offer: s(x.offer, 140),
    trade: s(x.trade, 20), category: s(x.category, 40), email: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x.email || '') ? x.email.slice(0, 80) : '',
    mailable: x.mailable === true, nearest: x.addr_src === 'nearest', osm: /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(x.osm || '') ? x.osm : '' };
}
// the filters (pure): opts = {town, niche, heat ('', 'hot', 'warm'), status ('', 'todo' = new, or a stage), phone (bool)}
export function pick(leads, marks, o) {
  return leads.filter((L) => {
    const m = stageOf((marks[L.id] || {}).s || '');
    if (o.town && L.town !== o.town) return false;
    if (o.niche && L.niche !== o.niche) return false;
    if (o.heat === 'hot' && L.heat !== 'hot') return false;
    if (o.heat === 'warm' && L.heat === 'cold') return false;
    if (o.phone && !L.phone) return false;
    if (o.mail && !L.mailable) return false;
    if (o.status === 'todo') return !m;
    if (o.status) return m === o.status;
    return true;
  });
}
// the call app's import format (agency/callcore.js normLead): a business line in Maryland, its trade picks the script
export function handoff(L) {
  return JSON.stringify({ leads: [{ id: L.id, name: L.name, phone: L.phone, city: L.city || L.town, state: 'MD', trade: L.trade, category: L.category,
    address: L.address, notes: 'From OpenStreetMap: no website on the map. Best offer: ' + L.offer }] });
}

function opts() { return { town: $('fTown').value, niche: $('fNiche').value, heat: $('fHeat').value, status: $('fStatus').value, phone: $('fPhone').checked, mail: !!($('fMail') && $('fMail').checked) }; }

function card(L) {
  const li = h('li', 'lead ' + L.heat); li.dataset.id = L.id;
  const top = h('div', 'lt'); top.appendChild(h('b', 'ln', L.name)); top.appendChild(h('span', 'pill heat ' + L.heat, L.heat === 'hot' ? 'Hot' : L.heat === 'warm' ? 'Warm' : 'Cold')); li.appendChild(top);
  li.appendChild(h('p', 'lk', `${L.nicheName} · ${L.city || L.town}${L.address ? ' · ' + L.address.split(',')[0] : ''}`));
  if (L.address) li.appendChild(h('p', 'la2', (L.mailable ? 'Mailable: ' : 'Address: ') + L.address + (L.nearest ? ' (nearest address on the map: check it)' : '')));
  if (L.email) { const e = h('p', 'lk'); e.appendChild(h('span', '', 'Email on the map: ')); const a = h('a', '', L.email); a.href = 'mailto:' + L.email; e.appendChild(a); li.appendChild(e); }
  if (L.why.length) li.appendChild(h('p', 'lw', 'Why: ' + L.why.slice(0, 3).join('; ') + '.'));
  if (L.offer) li.appendChild(h('p', 'lo', 'Offer: ' + L.offer));
  if (L.hours) li.appendChild(h('p', 'lh', 'Hours on the map: ' + L.hours));
  const act = h('div', 'la');
  if (L.phone) {
    const call = h('button', 'btn primary', 'Call with script'); call.type = 'button'; call.dataset.act = 'call'; act.appendChild(call);
    const tel = h('a', 'btn', L.phone); tel.href = 'tel:' + L.phone.replace(/[^\d+]/g, ''); tel.setAttribute('aria-label', 'Dial ' + L.name + ' ' + L.phone); act.appendChild(tel);
  } else act.appendChild(h('span', 'note', 'No phone on the map: look it up first.'));
  if (L.osm) { const m = h('a', 'btn ghost', 'Map'); m.href = L.osm; m.target = '_blank'; m.rel = 'noopener'; m.setAttribute('aria-label', L.name + ' on OpenStreetMap'); act.appendChild(m); }
  li.appendChild(act);
  const mk = h('label', 'lm'); mk.appendChild(h('span', '', 'Stage'));
  const sel = h('select', 'stage'); sel.dataset.act = 'stage'; sel.setAttribute('aria-label', 'Stage of ' + L.name);
  const raw = (S.marks[L.id] || {}).s || '', cur = stageOf(raw);
  for (const [k, t] of [['', 'New']].concat(STAGES)) { const o = h('option', '', t); o.value = k; if (k === cur) o.selected = true; sel.appendChild(o); }
  mk.appendChild(sel); li.classList.toggle('st-' + (cur || 'new'), true);
  if (rawLabel(raw)) mk.appendChild(h('i', 'lr', 'outreach: ' + rawLabel(raw)));
  li.appendChild(mk);
  return li;
}

function render() {
  const leads = S.leads || [], o = opts(), v = pick(leads, S.marks, o), ul = $('list');
  clear(ul);
  for (const L of v.slice(0, S.shown)) ul.appendChild(card(L));
  if (!v.length) ul.appendChild(h('li', 'note', leads.length ? 'Nobody matches these filters.' : 'No businesses yet.'));
  $('listN').textContent = `(${v.length})`;
  $('more').hidden = v.length <= S.shown;
  const n = (k) => leads.filter((L) => stageOf((S.marks[L.id] || {}).s || '') === k).length, todo = leads.filter((L) => !(S.marks[L.id] || {}).s).length;
  try {
    if (S.j) {
      const called = leads.filter((L) => ['contacted', 'replied', 'booked', 'won', 'lost'].includes(stageOf((S.marks[L.id] || {}).s))).length, hot = leads.filter((L) => L.heat === 'hot' && L.phone && !(S.marks[L.id] || {}).s).length;
      const stages = {}; for (const [k] of STAGES) stages[k] = n(k);
      localStorage.setItem(SUM_KEY, JSON.stringify({ n: leads.length, label: `${leads.length} leads found`, next: hot ? `Call the ${hot} hot one${hot === 1 ? '' : 's'}` : todo ? `${todo} still new` : 'Run the finder for a new town',
        t: Math.round(Date.now() / 1000), pipe: { leads: leads.length, called, ...stages } }));
    }
  } catch (_) { /* private mode: the tile reads summary.json instead */ }
  const tiles = $('tiles'); clear(tiles);
  for (const [k, val] of [['New', todo], ['Demo ready', n('demo')], ['Contacted', n('contacted') + n('replied') + n('booked')], ['Won', n('won')]]) {
    const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', '', val)); tiles.appendChild(t);
  }
}

function fillSelect(sel, items) { for (const [v, t] of items) { const o = h('option', '', t); o.value = v; sel.appendChild(o); } }

function bind() {
  for (const id of ['fTown', 'fNiche', 'fHeat', 'fStatus', 'fPhone', 'fMail']) if ($(id)) $(id).addEventListener('change', () => { S.shown = PAGE; render(); });
  $('more').addEventListener('click', () => { S.shown += PAGE; render(); });
  $('list').addEventListener('change', (e) => {
    const sel = e.target.closest && e.target.closest('select[data-act="stage"]');
    if (!sel) return;
    const li = sel.closest('li.lead'), L = (S.leads || []).find((x) => x.id === (li && li.dataset.id));
    if (!L) return;
    if (sel.value) S.marks[L.id] = { s: sel.value, t: Date.now() }; else delete S.marks[L.id];
    saveMarks(); render();
    say(`${L.name}: ${sel.value ? stageName(sel.value) : 'back to New'}. Saved on this phone.`);
  });
  $('list').addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button[data-act="call"]');
    if (!b) return;
    const li = b.closest('li.lead'), L = (S.leads || []).find((x) => x.id === (li && li.dataset.id));
    if (!L) return;
    try { localStorage.setItem(HANDOFF_KEY, handoff(L)); } catch (_) { say('This phone does not allow saving, so the call app cannot take the business. Dial the number instead.'); return; }
    location.href = '../call.html?handoff=1&tab=script&lead=' + encodeURIComponent(L.id);
  });
  $('exportBtn').addEventListener('click', () => {
    const csv = toCsv(S.leads || [], S.marks);
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), a = h('a');
      a.href = url; a.download = 'website-leads-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (_) { /* no download on this browser: the box below has it */ }
    const box = $('exportBox'); box.hidden = false; box.value = csv;
    say(`Exported ${(S.leads || []).length} businesses with their stage (CSV). It is also in the box below to copy.`);
  });
}

async function boot() {
  S.marks = readMarks();
  bind();
  let j = await getJSON('./leads.json', 4000);
  if (valid(j) && Array.isArray(j.files) && j.files.length) {              // a big list: one file per town (tools/web_leads.py SPLIT_BYTES)
    const parts = await Promise.all(j.files.filter((f) => /^towns\/[a-z0-9-]+\.json$/.test(f)).map((f) => getJSON('./' + f, 6000)));
    j = Object.assign({}, j, { leads: parts.reduce((a, x) => a.concat(x && Array.isArray(x.leads) ? x.leads : []), []) });
  }
  if (!valid(j)) {
    S.leads = []; render();
    say((typeof navigator !== 'undefined' && navigator.onLine === false ? 'You are offline. ' : '') + 'No lead list on the site yet. On the PC: python tools/web_leads.py (free, OpenStreetMap), then it shows here.');
    $('srcNote').textContent = '';
    S.ready = true; return;
  }
  S.j = j; S.leads = j.leads.map(cleanLead).filter(Boolean);
  const towns = [...new Set(S.leads.map((L) => L.town).filter(Boolean))].sort(), niches = {};
  for (const L of S.leads) niches[L.niche] = L.nicheName;
  fillSelect($('fTown'), towns.map((t) => [t, t + ', MD']));
  fillSelect($('fNiche'), Object.keys(niches).sort().map((k) => [k, niches[k]]));
  const when = typeof j.fetched === 'string' ? j.fetched.slice(0, 10) : '';
  $('srcNote').textContent = `${j.demo ? 'EXAMPLE list (made-up businesses): run the finder for real ones. ' : ''}From OpenStreetMap${when ? ', fetched ' + when : ''}. ${(j.towns || []).map((t) => `${t.town}: ${t.leads} of ${t.businesses} businesses have no website${Number.isFinite(t.parts_ok) && Number.isFinite(t.parts) && t.parts_ok < t.parts ? ` (partial: ${t.parts_ok} of ${t.parts} kinds of business answered; run the finder again on the PC)` : ''}`).join('; ')}.`;
  render();
  say(`${S.leads.length} businesses with no website${towns.length ? ' in ' + towns.join(', ') : ''}. Tap Call with script, then set its stage.`);
  S.ready = true;
}
window.WEBLEADS = { S, pick, handoff, cleanLead, valid, migrate, stageOf, toCsv, STAGES, ready: () => S.ready };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); S.ready = true; });
