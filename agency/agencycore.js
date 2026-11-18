// AGENCY core (ES module, no DOM, no network, no storage): the website-agency pipeline. Leads come from the published leads.json
// (built by `python -m agency.run`, OpenStreetMap data); the owner's own work on them (stage, notes, call-back day, price, demo link,
// calls) is a separate state object the page keeps in this browser and can export / import as JSON or CSV. Pure, so
// tests/test_agency.py runs it in node. Nothing here sends a message or places a call: tel: / mailto: links open the phone's own apps.

export const STAGES = [
  { id: 'new', label: 'New lead', p: 0.05, open: true },
  { id: 'demo', label: 'Demo built', p: 0.1, open: true },
  { id: 'contacted', label: 'Contacted', p: 0.2, open: true },
  { id: 'callback', label: 'Call back', p: 0.35, open: true },
  { id: 'won', label: 'Won', p: 1, open: false },
  { id: 'lost', label: 'Lost', p: 0, open: false },
  { id: 'dnc', label: 'Do not contact', p: 0, open: false },
];
export const STAGE = Object.fromEntries(STAGES.map((s) => [s.id, s]));
export const DEFAULT_PACKAGES = [
  { id: 'starter', name: 'Starter', setup: 499, monthly: 49 },
  { id: 'growth', name: 'Growth', setup: 999, monthly: 79 },
  { id: 'pro', name: 'Pro', setup: 1999, monthly: 129 },
];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n) : '');
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
export function weekStart(ymd) { const [y, m, d] = ymd.split('-').map(Number), wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; return addDays(ymd, -wd); }

// ---- links: only what is safe to put in an href ----
export function safeUrl(u) { const s = str(u, 400); return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : ''; }
export function telHref(e164) { const s = str(e164, 20); return /^\+\d{8,15}$/.test(s) ? 'tel:' + s : ''; }
export function mailHref(to, subject, body) {
  const t = str(to, 120);
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(t)) return '';
  return 'mailto:' + t + '?subject=' + encodeURIComponent(str(subject, 200)) + '&body=' + encodeURIComponent(str(body, 1800));
}

// ---- the published data ----
export function normPackages(list) {
  const out = (Array.isArray(list) ? list : []).filter(isObj).map((p) => ({ id: str(p.id, 20), name: str(p.name, 30), setup: num(p.setup), monthly: num(p.monthly), pitch: str(p.pitch, 300) }))
    .filter((p) => ID.test(p.id) && p.name && p.setup != null && p.setup >= 0 && p.monthly != null && p.monthly >= 0);
  return out.length ? out : DEFAULT_PACKAGES.map((p) => ({ ...p, pitch: '' }));
}
export function cleanLead(l) {
  if (!isObj(l) || !ID.test(String(l.id || '')) || !str(l.name, 120)) return null;
  const score = num(l.score);
  return {
    id: String(l.id), name: str(l.name, 120), trade: str(l.trade_label || l.trade, 40), category: str(l.category, 30), score: score == null ? 0 : Math.max(0, Math.min(100, Math.round(score))),
    tier: ['A', 'B', 'C'].includes(l.tier) ? l.tier : 'C', why: str(l.why, 240), reasons: (Array.isArray(l.reasons) ? l.reasons : []).map((r) => str(r, 200)).filter(Boolean).slice(0, 5),
    phone: str(l.phone, 30), tel: telHref(l.phone_e164), address: str(l.address_line, 160), city: str(l.city, 60), website: safeUrl(l.website), site_status: str(l.site_status, 12),
    email: str(l.email, 120), map: safeUrl(l.map_url), osm: safeUrl(l.osm_url), demo_url: safeUrl(l.demo_url), demo_built: l.demo_built === true,
    package: str(l.package, 20), opener: str(l.opener, 700), voicemail: str(l.voicemail, 500), subject: str(l.subject, 200), email_body: str(l.email_body, 2500),
    hours: str(l.hours, 160), distance_km: num(l.distance_km),
  };
}
export function normData(d) {
  if (!isObj(d) || !Array.isArray(d.leads)) return null;
  const seen = new Set(), leads = [];
  for (const raw of d.leads) { const l = cleanLead(raw); if (l && !seen.has(l.id)) { seen.add(l.id); leads.push(l); } }
  if (!leads.length) return null;
  const m = isObj(d.meta) ? d.meta : {}, a = isObj(d.agency) ? d.agency : {};
  return {
    demo: d.demo === true, sample: d.sample === true, note: str(d.note, 300), made: str(d.made, 25), city: str(m.city || d.city, 80), attribution: str(d.attribution || m.attribution, 160),
    agency: { name: str(a.name, 60) || 'your agency', ready: a.ready === true }, goal: num(d.goal) || 5000, packages: normPackages(d.packages),
    plan: isObj(d.plan) ? d.plan : null, coverage: isObj(m.coverage) ? m.coverage : null, leads,
  };
}

// ---- the owner's own state (this browser) ----
export function emptyState() { return { v: 1, leads: {}, log: [] }; }
function cleanEntry(e) {
  if (!isObj(e)) return null;
  const o = {};
  if (STAGE[e.stage]) o.stage = e.stage;
  if (YMD.test(String(e.callback || ''))) o.callback = e.callback;
  if (YMD.test(String(e.won || ''))) o.won = e.won;
  if (YMD.test(String(e.last_call || ''))) o.last_call = e.last_call;
  const calls = num(e.calls); if (calls != null && calls >= 0) o.calls = Math.min(999, Math.round(calls));
  const price = num(e.price); if (price != null && price >= 0 && price < 1e6) o.price = Math.round(price);
  const monthly = num(e.monthly); if (monthly != null && monthly >= 0 && monthly < 1e5) o.monthly = Math.round(monthly);
  if (ID.test(String(e.package || ''))) o.package = String(e.package);
  const demo = safeUrl(e.demo_url); if (demo) o.demo_url = demo;
  const notes = str(e.notes, 2000); if (notes) o.notes = notes;
  return o;
}
export function normState(raw) {
  const s = emptyState();
  if (!isObj(raw)) return s;
  const src = isObj(raw.state) && raw.kind === 'agency-crm' ? raw.state : raw;
  if (isObj(src.leads)) for (const [id, e] of Object.entries(src.leads)) { if (!ID.test(id)) continue; const c = cleanEntry(e); if (c && Object.keys(c).length) s.leads[id] = c; }
  if (Array.isArray(src.log)) s.log = src.log.filter((x) => isObj(x) && ID.test(String(x.id || '')) && STAGE[x.stage] && YMD.test(String(x.d || ''))).map((x) => ({ id: String(x.id), stage: x.stage, d: x.d })).slice(-500);
  return s;
}
export function entry(state, id) { return (state.leads && state.leads[id]) || {}; }
export function stageOf(lead, state) { const e = entry(state, lead.id); return e.stage || (lead.demo_built ? 'demo' : 'new'); }

/** A new state with one lead changed. patch keys: stage, notes, callback, price, monthly, package, demo_url. Calls / won day / the log follow the stage. */
export function update(state, id, patch, today) {
  const s = normState(state), prev = { ...(s.leads[id] || {}) }, next = { ...prev };
  for (const k of ['notes', 'callback', 'price', 'monthly', 'package', 'demo_url']) if (k in patch) { if (patch[k] === '' || patch[k] == null) delete next[k]; else next[k] = patch[k]; }
  if (patch.stage && STAGE[patch.stage] && patch.stage !== prev.stage) {
    next.stage = patch.stage;
    if (patch.stage === 'contacted' || patch.stage === 'callback') { next.calls = (prev.calls || 0) + 1; next.last_call = today; }
    if (patch.stage === 'won') next.won = today;
    if (patch.stage !== 'won') delete next.won;
    if (patch.stage !== 'callback') delete next.callback;
    s.log.push({ id, stage: patch.stage, d: today });
  }
  if (patch.called) { next.calls = (prev.calls || 0) + 1; next.last_call = today; if (!next.stage || next.stage === 'new' || next.stage === 'demo') { next.stage = 'contacted'; s.log.push({ id, stage: 'contacted', d: today }); } }
  const c = cleanEntry(next);
  if (c && Object.keys(c).length) s.leads[id] = c; else delete s.leads[id];
  s.log = s.log.slice(-500);
  return s;
}

// ---- money ----
export function pkgFor(lead, state, packages) {
  const e = entry(state, lead.id), id = e.package || lead.package || 'starter';
  return packages.find((p) => p.id === id) || packages[0];
}
export function value(lead, state, packages) {
  const e = entry(state, lead.id), p = pkgFor(lead, state, packages);
  const setup = e.price != null ? e.price : p.setup, monthly = e.monthly != null ? e.monthly : p.monthly;
  return { package: p.id, package_name: p.name, setup, monthly, first_year: setup + 12 * monthly };
}
export function views(data, state) {
  return data.leads.map((l) => { const e = entry(state, l.id); return { ...l, stage: stageOf(l, state), notes: e.notes || '', callback: e.callback || '', calls: e.calls || 0, last_call: e.last_call || '',
    won: e.won || '', demo_url: e.demo_url || l.demo_url, has_demo: l.demo_built || !!e.demo_url, value: value(l, state, data.packages) }; });
}
export function pipeline(vs, today, goal) {
  const month = today.slice(0, 7), wk = weekStart(today), by = Object.fromEntries(STAGES.map((s) => [s.id, 0]));
  let open = 0, weighted = 0, wonSetup = 0, wonMonth = 0, mrr = 0, won = 0, callsWeek = 0;
  for (const v of vs) {
    by[v.stage] += 1;
    const st = STAGE[v.stage];
    if (st.open) { open += v.value.first_year; weighted += v.value.first_year * st.p; }
    if (v.stage === 'won') { won += 1; mrr += v.value.monthly; if (v.won && v.won.slice(0, 7) === month) wonSetup += v.value.setup; }
    if (v.last_call && v.last_call >= wk) callsWeek += 1;
  }
  wonMonth = wonSetup + mrr;
  const g = num(goal) || 5000;
  return { by, open: Math.round(open), weighted: Math.round(weighted), won, won_setup_month: Math.round(wonSetup), mrr: Math.round(mrr), month_total: Math.round(wonMonth),
    goal: g, goal_frac: Math.max(0, Math.min(1, wonMonth / g)), calls_week: callsWeek, active: vs.filter((v) => STAGE[v.stage].open).length };
}

// ---- lists ----
export function callToday(vs, today, n) {
  const due = vs.filter((v) => v.stage === 'callback' && v.callback && v.callback <= today).sort((a, b) => (a.callback < b.callback ? -1 : a.callback > b.callback ? 1 : b.score - a.score));
  const fresh = vs.filter((v) => (v.stage === 'new' || v.stage === 'demo') && v.tel).sort((a, b) => (b.demo_built - a.demo_built) || (b.score - a.score) || a.name.localeCompare(b.name));
  return [...due, ...fresh].slice(0, Math.max(1, n || 5));
}
export function filterSort(vs, f) {
  const q = str((f && f.q) || '', 60).toLowerCase(), stage = (f && f.stage) || 'all', trade = (f && f.trade) || 'all', sort = (f && f.sort) || 'score';
  let out = vs.filter((v) => (stage === 'all' || v.stage === stage) && (trade === 'all' || v.trade === trade) && (!q || (v.name + ' ' + v.trade + ' ' + v.address + ' ' + v.notes).toLowerCase().includes(q)));
  const cmp = { score: (a, b) => b.score - a.score || a.name.localeCompare(b.name), name: (a, b) => a.name.localeCompare(b.name), value: (a, b) => b.value.first_year - a.value.first_year || b.score - a.score,
    near: (a, b) => (a.distance_km == null ? 1e9 : a.distance_km) - (b.distance_km == null ? 1e9 : b.distance_km) }[sort] || ((a, b) => b.score - a.score);
  out = out.slice().sort(cmp);
  return out;
}
export function trades(vs) { return [...new Set(vs.map((v) => v.trade).filter(Boolean))].sort(); }

// ---- export / import ----
export function exportJson(state, today) { return JSON.stringify({ kind: 'agency-crm', v: 1, exported: today, state: normState(state) }, null, 1); }
export function parseImport(text) {
  if (!str(text, 10)) return { ok: false, error: 'Paste an export first (the text that starts with {"kind": "agency-crm").' };
  let raw;
  try { raw = JSON.parse(text); } catch (_) { return { ok: false, error: 'That is not valid JSON: nothing was changed.' }; }
  if (!isObj(raw) || (raw.kind && raw.kind !== 'agency-crm')) return { ok: false, error: 'That is not an Agency export: nothing was changed.' };
  const s = normState(raw), n = Object.keys(s.leads).length;
  if (!n) return { ok: false, error: 'No lead notes or stages in it: nothing was changed.' };
  return { ok: true, state: s, count: n };
}
const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) || /^[=+\-@]/.test(t) ? '"' + (/^[=+\-@]/.test(t) ? "'" : '') + t.replace(/"/g, '""') + '"' : t; };
export function toCSV(vs) {
  const head = ['name', 'trade', 'stage', 'score', 'tier', 'phone', 'address', 'current_site', 'why', 'package', 'setup', 'monthly', 'first_year', 'calls', 'last_call', 'call_back', 'won', 'demo_url', 'notes'];
  const rows = vs.map((v) => [v.name, v.trade, STAGE[v.stage].label, v.score, v.tier, v.phone, v.address, v.website, v.why, v.value.package_name, v.value.setup, v.value.monthly, v.value.first_year, v.calls, v.last_call, v.callback, v.won, v.demo_url, v.notes]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---- words ----
export function heroLine(p) {
  if (!p.won) return `No client yet. Open deals worth ${money(p.open)} in their first year (${money(p.weighted)} if they close at the usual rates).`;
  return `${p.won} client${p.won === 1 ? '' : 's'}: ${money(p.won_setup_month)} in setup fees this month + ${money(p.mrr)} a month in care plans. Open deals: ${money(p.open)}.`;
}
export function statusLine(data, p) {
  return `${data.leads.length} leads in ${data.city || 'your city'}: ${p.active} open, ${p.won} won, ${p.calls_week} called this week.`;
}
export function planRows(plan) {
  const rows = plan && Array.isArray(plan.rows) ? plan.rows : [];
  return rows.filter(isObj).map((r) => ({ n: num(r.new_per_month), m6: num(r.month_6), m12: num(r.month_12), months: num(r.months_to_goal) })).filter((r) => r.n != null).slice(0, 8);
}
