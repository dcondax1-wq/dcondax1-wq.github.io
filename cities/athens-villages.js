// ATHENS VILLAGES: one registry that says, for every Olympus app, which published file feeds its village and how a row of that file becomes a house.
// Pure (no DOM, no three.js): Node tests import it. READ ONLY: it only reads JSON, it never trades or places an order.
// A source is tried in order: the live published file first, then the app's own example file (marked "example"), then nothing ("no data today").
// A village row is { label, say, tone, v, size }: tone good / bad / warn / info / plain (colours the house), v the number behind it, size 0..1 (the house height).
import { APPS } from './athens-plan.js';

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MAX_ROWS = 40, MIN_HOUSES = 6;
export const usd = (v) => (v < 0 ? '-' : v > 0 ? '+' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
const cut = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export function dayInfo(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s || '')); if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return { key: m[0], dow: d.getUTCDay(), label: `${DOW[d.getUTCDay()]} ${+m[3]} ${MON[+m[2] - 1]}`, ms: d.getTime() };
}
const sizes = (rows) => { const mx = Math.max(1e-9, ...rows.map((r) => Math.abs(r.v || 0))); rows.forEach((r) => { r.size = Math.min(1, Math.abs(r.v || 0) / mx); }); return rows; };
const tone = (v) => (v > 0 ? 'good' : v < 0 ? 'bad' : 'plain');

// ------------------------------------------------------------------ row makers
const tradesOf = (j) => (isObj(j) && Array.isArray(j.trades) ? j.trades.filter(isObj) : Array.isArray(j) ? j.filter(isObj) : []);
export function dayRows(j, n = 14) {
  const by = new Map();
  for (const t of tradesOf(j)) { const d = dayInfo(t.day); const u = num(t.usd); if (!d || u == null) continue; const o = by.get(d.key) || { d, usd: 0, r: 0, n: 0, hasR: false }; o.usd += u; o.n++; if (num(t.r) != null) { o.r += t.r; o.hasR = true; } by.set(d.key, o); }
  return sizes([...by.values()].sort((a, b) => b.d.ms - a.d.ms).slice(0, n).map((o) => ({ label: o.d.label, say: `${o.d.label}: ${usd(o.usd)}${o.hasR ? ` (${o.r > 0 ? '+' : ''}${Math.round(o.r * 100) / 100} R)` : ''} from ${o.n} trade${o.n === 1 ? '' : 's'}.`, tone: tone(o.usd), v: o.usd, money: true })));
}
export function tradeRows(j, n = 20, losersOnly = false) {
  const rows = tradesOf(j).filter((t) => num(t.usd) != null && (!losersOnly || t.usd < 0)).sort((a, b) => String(b.day || '').localeCompare(String(a.day || ''))).slice(0, n);
  return sizes(rows.map((t) => { const d = dayInfo(t.day); return { label: `${d ? d.label : 'Trade'} ${t.side ? String(t.side).toLowerCase() : ''}`.trim(), say: `${d ? d.label : 'A trade'}${t.side ? ' ' + String(t.side).toLowerCase() : ''}: ${usd(t.usd)}${num(t.r) != null ? ` (${t.r > 0 ? '+' : ''}${t.r} R)` : ''}${t.strat || t.bot ? ' on ' + (t.strat || t.bot) : ''}.`, tone: tone(t.usd), v: t.usd, money: true }; }));
}
export function accountRows(j) {
  const list = isObj(j) ? (Array.isArray(j.accounts) ? j.accounts : isObj(j.home) && Array.isArray(j.home.accounts) ? j.home.accounts : []) : [];
  return sizes(list.filter((a) => isObj(a) && !a.error).slice(0, MAX_ROWS).map((a, i) => {
    const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : a, today = num(isObj(a.pnl) ? a.pnl.today : null) ?? num(a.today) ?? num(ev.today), room = num(ev.room), mll = num(ev.mll);
    const low = room != null && mll ? room / mll < .3 : false, name = cut(a.name || a.id || a.key || 'Account ' + (i + 1), 24);
    return { label: name, say: `${name}${a.stage ? ' (' + a.stage + ')' : ''}: ${today != null ? 'today ' + usd(today) : 'no P&L today'}${room != null ? `, $${Math.round(room).toLocaleString('en-US')} of room left` : ''}.`, tone: low ? 'warn' : today > 0 ? 'good' : today < 0 ? 'bad' : 'plain', v: today || 0, money: today != null };
  }));
}
/** generic: any array of objects -> rows (title / name / label, a plain detail, a $ if there is one) */
export function autoRows(j, n = MAX_ROWS) {
  if (!isObj(j)) return [];
  const prefer = ['items', 'accounts', 'trades', 'events', 'streams', 'entries', 'edges', 'buildings', 'learned', 'todo', 'dials', 'shapes', 'writeups', 'gods', 'checklist', 'tasks', 'calendar'];
  let arr = null; for (const k of [...prefer, ...Object.keys(j)]) { if (Array.isArray(j[k]) && j[k].some(isObj)) { arr = j[k]; break; } }
  if (!arr) { const nested = Object.values(j).find((v) => isObj(v) && Object.values(v).some((x) => Array.isArray(x) && x.some(isObj))); if (nested) return autoRows(nested, n); return []; }
  return sizes(arr.filter(isObj).slice(0, n).map((o, i) => {
    const label = cut(o.title || o.name || o.label || o.id || o.key || o.kind || o.day || o.date || 'Item ' + (i + 1), 26);
    const u = num(o.usd) ?? num(o.pnl) ?? num(o.amount) ?? num(o.profit) ?? num(o.usd_month);
    const detail = cut(o.detail || o.say || o.text || o.why || o.blurb || o.note || o.role || o.headline || '', 150);
    return { label, say: `${label}${u != null ? ': ' + usd(u) : ''}${detail ? '. ' + detail : '.'}`, tone: u == null ? 'info' : tone(u), v: u == null ? 1 : u, money: u != null };
  }));
}
function eventRows(j, now) {
  const evs = isObj(j) ? (Array.isArray(j.events) ? j.events : isObj(j.events) && Array.isArray(j.events.events) ? j.events.events : []) : [];
  const anchor = dayInfo(isObj(j) && j.today) || dayInfo(new Date(now).toISOString()), lo = anchor.ms, hi = lo + 14 * 86400000;
  return sizes(evs.filter((e) => isObj(e)).map((e) => ({ e, d: dayInfo(e.date) })).filter((x) => x.d && x.d.ms >= lo && x.d.ms <= hi).sort((a, b) => a.d.ms - b.d.ms || String(a.e.time).localeCompare(String(b.e.time))).slice(0, MAX_ROWS)
    .map(({ e, d }) => ({ label: cut(e.title || 'Event', 26), say: `${d.label}${e.time ? ' at ' + e.time : ''}: ${cut(e.title, 60)}${e.impact ? ' (' + e.impact + ' impact)' : ''}.`, tone: e.impact === 'high' ? 'bad' : e.impact === 'med' || e.impact === 'medium' ? 'warn' : 'info', v: e.impact === 'high' ? 3 : e.impact === 'low' ? 1 : 2 })));
}
function quizRows(j) {
  const days = isObj(j) && isObj(j.progress) && isObj(j.progress.days) ? Object.keys(j.progress.days) : [];
  const keys = days.length ? days : [...new Set(tradesOf(j).map((t) => t.day).filter(Boolean))];
  return sizes(keys.map(dayInfo).filter(Boolean).sort((a, b) => b.ms - a.ms).slice(0, 14).map((d) => ({ label: d.label, say: `${d.label}: a day of the rules quiz${days.length ? ' you played' : ' to play, built from that day\'s trades'}.`, tone: days.length ? 'good' : 'info', v: 1 })));
}
function trophyRows(j) {
  const rows = [], acc = isObj(j) && Array.isArray(j.accounts) ? j.accounts : [], pay = isObj(j) && Array.isArray(j.payouts) ? j.payouts : [], tr = tradesOf(j);
  for (const p of pay.filter(isObj)) rows.push({ label: 'Payout ' + usd(p.usd || 0), say: `A payout of ${usd(p.usd || 0)} reached the account${p.off != null ? ' about ' + Math.abs(p.off) + ' days ago' : ''}.`, tone: 'good', v: p.usd || 0 });
  for (const a of acc.filter(isObj)) rows.push({ label: cut(a.name || 'Account', 22), say: `${cut(a.name || 'An account', 30)} (${a.kind || 'eval'})${num(a.passed_off) != null ? ': passed ' + a.passed_off + ' days ago' : ''}.`, tone: 'good', v: 1 });
  const wins = tr.filter((t) => num(t.usd) > 0).length; if (tr.length) rows.push({ label: `${wins} winning trades`, say: `${wins} of ${tr.length} trades in the file were winners.`, tone: wins * 2 >= tr.length ? 'good' : 'info', v: wins });
  if (isObj(j.kalshi) && num(j.kalshi.total) != null) rows.push({ label: `${j.kalshi.total} Kalshi bets`, say: `${j.kalshi.total} paper bets logged so far.`, tone: 'info', v: 1 });
  return sizes(rows.slice(0, MAX_ROWS));
}
function edgeRows(j) {
  const e = isObj(j) ? (Array.isArray(j.edges) ? j.edges : isObj(j.edges) && Array.isArray(j.edges.edges) ? j.edges.edges : isObj(j.kalshi) ? [] : []) : [];
  return sizes(e.filter(isObj).slice(0, MAX_ROWS).map((x) => { const p = num(x.pnl) ?? 0, label = cut(x.label || x.id || 'Edge', 24);
    return { label, say: `${label}: ${x.status || (x.sig ? 'significant' : 'not proven')}, ${usd(p)} after ${x.n || 0} bets (paper).`, tone: x.status === 'DEAD' || x.status === 'DECAYING' ? 'warn' : tone(p), v: p, money: true }; }));
}
function sibylRows(j) {
  const items = isObj(j) && Array.isArray(j.items) ? j.items : [], bets = isObj(j) && isObj(j.own) && Array.isArray(j.own.bets) ? j.own.bets : [];
  const a = items.filter(isObj).map((i) => ({ label: cut(i.title, 24), say: `${cut(i.title, 24)}: ${i.risk ? i.risk + ' risk. ' : ''}${cut(i.detail, 110)}`, tone: i.risk === 'high' ? 'bad' : i.risk === 'med' ? 'warn' : 'good', v: num(i.usd) ?? 1 }));
  const b = bets.filter(isObj).map((x) => ({ label: cut(`${x.day || ''} ${x.title || ''}`, 24), say: `${x.day}: ${x.title} paper pick, ${x.status || 'open'}${num(x.pnl_usd) != null ? ', ' + usd(x.pnl_usd) + (num(x.r) != null ? ` (${x.r > 0 ? '+' : ''}${x.r} R)` : '') : ''}.`, tone: x.status === 'won' ? 'good' : x.status === 'lost' ? 'bad' : 'info', v: num(x.pnl_usd) ?? 1, money: num(x.pnl_usd) != null }));
  return sizes([...a, ...b].slice(0, MAX_ROWS));
}
function mercuryRows(j) {
  const items = isObj(j) && Array.isArray(j.items) ? j.items : [];
  return sizes(items.filter(isObj).slice(0, MAX_ROWS).map((i) => ({ label: cut(i.title || i.firm, 26), say: `${cut(i.title || i.firm, 50)}${i.expires ? ', ends ' + i.expires : ''}. ${cut(i.detail || i.text, 100)}`, tone: i.kind === 'deal' ? 'good' : i.kind === 'rule' ? 'warn' : 'info', v: num(i.pct) ?? 1 })));
}
function dataRows(j) {
  const rows = [], d = isObj(j) && isObj(j.summary) && isObj(j.summary.data) ? j.summary.data : {};
  for (const [k, v] of Object.entries(d)) if (typeof v !== 'object') rows.push({ label: cut(k.replace(/_/g, ' '), 22), say: `Dataset fact, ${k.replace(/_/g, ' ')}: ${cut(v, 110)}.`, tone: 'info', v: 1 });
  for (const t of (isObj(j) && Array.isArray(j.top10) ? j.top10 : []).filter(isObj).slice(0, 12)) rows.push({ label: cut(t.lab || t.id, 24), say: `Top finding: ${cut(t.lab || t.id, 100)}.`, tone: num(t.e) > 0 ? 'good' : 'info', v: num(t.e) ?? 1 });
  return sizes(rows.slice(0, MAX_ROWS));
}

// ------------------------------------------------------------------ facts: one plain sentence from a village
export function bestWeekday(j) {
  const by = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const t of tradesOf(j)) { const d = dayInfo(t.day), u = num(t.usd); if (d && u != null) { by[d.dow] += u; cnt[d.dow]++; } }
  let best = -1; by.forEach((v, i) => { if (cnt[i] && (best < 0 || v > by[best])) best = i; });
  return best < 0 ? null : { day: DOW[best], usd: by[best] };
}
export function genericFact(name, rows, json) {
  if (!rows.length) return `${name}: no data today.`;
  const money = rows.filter((r) => r.money && (r.tone === 'good' || r.tone === 'bad'));
  if (money.length >= 2) { const b = money.reduce((p, q) => (q.v > p.v ? q : p)); const w = money.reduce((p, q) => (q.v < p.v ? q : p)); return `${name}: ${rows.length} houses. Best: ${b.label}${b.tone === 'good' ? ' (' + usd(b.v) + ')' : ''}${w.tone === 'bad' ? '. Toughest: ' + w.label + ' (' + usd(w.v) + ')' : ''}.`; }
  const w = rows.filter((r) => r.tone === 'warn' || r.tone === 'bad').length;
  return `${name}: ${rows.length} item${rows.length === 1 ? '' : 's'}${w ? ', ' + w + ' need a look' : ''}. First: ${rows[0].label}.`;
}

// ------------------------------------------------------------------ the registry
const HOME = ['../home.json', './athens-fixture.json'], ODEON = ['../odeon/trades.json'];
const T = (id) => [...ODEON, `../${id}/fixture.json`, '../kronos/fixture.json'];
const own = (id, ...more) => [...more, `../${id}/fixture.json`];
const TRADES_DAYS = (j) => dayRows(j), TRADES_EACH = (j) => tradeRows(j);
// id -> { src: files in order (live first), map(json, now) -> rows, fact?(rows, json) }
export const SOURCES = {
  zenith: { src: T('odeon'), map: TRADES_DAYS }, odeon: { src: T('odeon'), map: TRADES_EACH }, journal: { src: T('journal'), map: TRADES_EACH },
  nemesis: { src: T('nemesis'), map: (j) => tradeRows(j, 20, true) }, chronos: { src: T('chronos'), map: TRADES_DAYS }, apollo: { src: T('apollo'), map: TRADES_DAYS },
  kronos: { src: T('kronos'), map: TRADES_DAYS, fact: (rows, j) => { const b = bestWeekday(j); return b ? `Kronos: best weekday so far: ${b.day} (${usd(b.usd)}).` : null; } },
  kratos: { src: T('kratos'), map: TRADES_DAYS }, kairos: { src: T('kairos'), map: TRADES_DAYS }, compass: { src: T('compass'), map: TRADES_DAYS },
  labyrinth: { src: T('labyrinth'), map: TRADES_DAYS }, epilogue: { src: T('epilogue'), map: TRADES_DAYS },
  lyceum: { src: T('lyceum'), map: quizRows }, nike: { src: T('nike'), map: trophyRows },
  hestia: { src: HOME, map: accountRows }, demeter: { src: own('demeter', ...HOME), map: accountRows }, pnyx: { src: own('pnyx', ...HOME), map: accountRows }, fates: { src: HOME, map: accountRows },
  ares: { src: HOME, map: accountRows }, aegis: { src: own('aegis', ...HOME), map: accountRows }, harmonia: { src: own('harmonia', ...HOME), map: accountRows }, moirai: { src: HOME, map: accountRows },
  plutus: { src: ['../plutus/roadmap.json', '../hera/fixture.json'], map: (j) => accountRows(j).concat(autoRows({ todo: j.todo }, 12)).slice(0, MAX_ROWS) },
  hera: { src: ['../plutus/roadmap.json', '../hera/fixture.json'], map: (j) => autoRows({ todo: j.todo || [] }).concat(accountRows(j)).slice(0, MAX_ROWS) },
  ledger: { src: ['../ledger/fixture.json'], map: (j) => autoRows({ entries: (j.entries || []).map((e) => ({ title: e.cat || e.kind, usd: e.kind === 'fee' ? -Math.abs(e.amount || 0) : e.amount, detail: e.note })) }) },
  mercury: { src: ['../money/mercury.json', '../mercury/fixture.json'], map: mercuryRows }, chrysos: { src: ['../money/chrysos.json', '../chrysos/fixture.json'], map: (j) => autoRows(j) },
  sibyl: { src: ['../money/sibyl.json', '../sibyl/fixture.json'], map: sibylRows }, pythia: { src: ['../pythia/events.json', '../pythia/fixture.json'], map: eventRows },
  kalshi: { src: ['../kalshicity/edges.json', '../dionysus/fixture.json'], map: edgeRows }, kalshicity: { src: ['../kalshicity/edges.json', '../dionysus/fixture.json'], map: edgeRows },
  dionysus: { src: ['../kalshicity/edges.json', '../dionysus/fixture.json'], map: edgeRows }, tyche: { src: ['../kalshicity/edges.json', '../dionysus/fixture.json'], map: edgeRows },
  hermes: { src: ['../hermes/wrapped.json', '../hermes/demo.json'], map: (j) => autoRows({ learned: (j.learned || []).map((x) => (isObj(x) ? x : { title: String(x) })) }) },
  inbox: { src: ['../alerts.json'], map: (j) => autoRows({ alerts: Array.isArray(j) ? j : j.alerts }) },
  cities: { src: [], map: () => [] }, mintcity: { src: ['../money/index.json', '../mint/fixture.json'], map: (j) => autoRows(j) },
  datacity: { src: ['../datacity/fixture.json'], map: dataRows }, mint: { src: ['../money/index.json', '../mint/fixture.json'], map: (j) => autoRows(j) },
};
// the 24 apps that have no temple of their own get a hamlet (a village with a small hall); [id, name, group, colour, one plain line]
export const ANNEX = [
  ['kronos', 'Kronos', 'money', '#c8a24a', 'The calendar of money: daily P&L'], ['sibyl', 'Sibyl', 'money', '#c8a24a', 'Prediction-market picks after fees (paper)'], ['chrysos', 'Chrysos', 'money', '#c8a24a', 'Prop-firm fleet planner'],
  ['mercury', 'Mercury', 'money', '#c8a24a', 'Deal watcher: sales, codes, resets'], ['mint', 'Mint', 'money', '#c8a24a', 'The money machine: five streams'], ['oikos', 'Oikos', 'money', '#c8a24a', 'The household: leaks and buckets'],
  ['arbiter', 'Arbiter', 'money', '#c8a24a', 'Paper spreads and funding'], ['argo', 'Argo', 'money', '#4b7a99', 'Money goals as islands'],
  ['pythia', 'Pythia', 'trading', '#e0b060', 'The risk calendar: next 14 days'], ['stoa', 'Stoa', 'trading', '#c8a24a', 'What needs you right now'], ['aegis', 'Aegis', 'trading', '#c8a24a', 'Risk guard'],
  ['kratos', 'Kratos', 'trading', '#c8a24a', 'Discipline score per day'], ['kairos', 'Kairos', 'trading', '#c8a24a', 'The bots\' day on a ring'], ['compass', 'Compass', 'trading', '#c8a24a', 'The next best action'],
  ['pheme', 'Pheme', 'trading', '#c8a24a', 'Releases and past NQ moves'], ['helios', 'Helios', 'trading', '#c8a24a', 'The morning briefing'], ['moirai', 'Moirai', 'trading', '#c8a24a', 'Eval pass odds, simulated'],
  ['lyceum', 'Lyceum', 'life', '#c8a24a', 'The school: rules quiz and habits'], ['nike', 'Nike', 'life', '#c8a24a', 'The trophy hall'], ['epilogue', 'Epilogue', 'life', '#c8a24a', 'Your week in 60 seconds'], ['gallery', 'Agora Gallery', 'life', '#c8a24a', 'Every 3D shape of the Agora'],
  ['mintcity', 'Mint City', 'money', '#c8a24a', 'The five money machines as a city'], ['harmonia', 'Harmonia', 'money', '#c8a24a', 'What leans on the NQ bots'],
];
export const DISTRICT_NAME = { trading: 'Agora', research: 'Acropolis', money: 'Harbour', life: 'Academy' };

/** every app that can have a village: the 40 temples first, then the hamlets (an id already in the temples is not repeated) */
export function allApps() {
  const out = [], seen = new Set();
  for (const g of Object.keys(APPS)) for (const [id, name, colour, blurb] of APPS[g]) { if (!seen.has(id)) { seen.add(id); out.push({ id, name, group: g, colour, blurb, temple: true }); } }
  for (const [id, name, group, colour, blurb] of ANNEX) if (!seen.has(id)) { seen.add(id); out.push({ id, name, group, colour, blurb, temple: false }); }
  return out;
}
export const specFor = (id) => SOURCES[id] || { src: [`../${id}/fixture.json`], map: (j) => autoRows(j) };

/** pure: turn the files that loaded into a village record. files = { url: json|null }. status live | example | none */
export function villageData(app, files, now = Date.now()) {
  const spec = specFor(app.id);
  for (let i = 0; i < spec.src.length; i++) {
    const url = spec.src[i], j = files[url]; if (j == null) continue;
    let rows = []; try { rows = spec.map(j, now) || []; } catch (e) { rows = []; }
    if (!rows.length) continue;
    rows = rows.slice(0, MAX_ROWS);
    const demo = isObj(j) && (j.demo === true || (isObj(j.home) && j.demo === true)) || /fixture\.json$/.test(url) || /athens-fixture/.test(url);
    let fact = null; try { fact = spec.fact ? spec.fact(rows, j) : null; } catch (e) { fact = null; }
    return { rows, status: demo ? 'example' : 'live', source: url, fact: fact || genericFact(app.name, rows, j) };
  }
  return { rows: [], status: 'none', source: null, fact: `${app.name}: no data today.` };
}

/** all the files the registry may read, once each (for the loader) */
export function allUrls() { const u = new Set(); for (const a of allApps()) for (const s of specFor(a.id).src) u.add(s); return [...u]; }

/** browser loader: 8 at a time, 6 s each, a missing file is simply null; never throws */
export async function loadFiles(base, urls = allUrls(), fetcher = (typeof fetch === 'function' ? fetch : null)) {
  const out = {}, queue = [...urls];
  const getJ = async (u) => {
    if (!fetcher) return null;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 6000);
    try { const r = await fetcher(new URL(u, base).href, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { if (t) clearTimeout(t); }
  };
  await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) { const u = queue.shift(); out[u] = await getJ(u); } }));
  return out;
}
