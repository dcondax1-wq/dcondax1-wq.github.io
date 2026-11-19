// Jarvis home, the data (2026-11-10): ONE small adapter between the AGORA home cards (home-cards.js) and everything the home shows.
// It reads what Jarvis already has (window.__jarvis.facts() = data.js getFacts(), bots.js snapshot) and the published JSON of three apps
// (Mint ../money/index.json, Kairos' windows, Pythia ../pythia/events.json); when the 'Jarvis brain' API exists (window.JARVIS_API, see
// docs/JARVIS_API.md) its nudges / ask are used first. Every part is total: a missing source never throws, it gives plain words instead,
// and ?demo=1 (or no source at all) fills each part from FAKE so the home is never blank. Read only: nothing here trades, arms or sends.
//
//   buildHome({ facts, snap, api, money, events, kairos, now, demo, favs, recent, apps, zeus }) -> model (zeus: the ZEUS card is on the page = no NQ bots tile) (pure; runs in node, tests.test_jarvis_home_agora)
//   loadHome({ demo, api, win, quick, districtOf })  -> Promise<model>   fetches what it needs (timeouts 5 s; quick = no network), then buildHome
//   model = { demo, online, asof, today: { items: [{ id, text, tone, app?, say? }], more }, bots: [{ id, name, size, level, pnl, room, mll, text, app }],
//             money: { low, base, high, live, text, note }, day: { now: {label, text, until, entries}, next: { title, when, impact } | null },
//             asks: [string], favs: [{ id, name, glyph }], recent: [{ id, name, glyph }] }
//   v2 (2026-11-11, the first screen): model.state = { kind: 'demo'|'offline'|'waiting'|'stale'|'live', text, age } in plain words,
//             model.hero = { text, tone, app?, say?, more } (ONE sentence: what matters now), model.tiles = [bots, money, today] (the three tiles),
//             model.needs = { market, research, money, command, life } ('' | 'warn' | 'bad': which district doorway glows)
// Plain ES2020, no imports (the optional kairoscore.js is imported dynamically), iPhone Safari 16.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 200);
export const usd = (v, sign) => { const x = num(v); if (x == null) return null; const a = Math.abs(Math.round(x)); return (x < 0 && a ? '−' : sign && x > 0 && a ? '+' : '') + '$' + a.toLocaleString('en-US'); };

export const ASKS = ['What should I do today?', 'How are my bots?', 'How much drawdown is left?', "What's next on the market?"];
export const FAV_KEYS = ['oly.launcher.fav', 'jarvis.orb.fav'];
export const REC_KEY = 'jarvis.orb.recent';

// ------------------------------------------------------------------------------------------------ the fake provider (demo and offline)
export const FAKE = {
  facts: { system: { verdict: 'HEADS UP', level: 'warn', todo: '', todos: [{ id: 'atlas', level: 'warn', todo: 'ATLAS is close to its floor: $1,240 of room left', short: 'ATLAS near its floor', app: 'zenith' },
    { id: 'planner', level: 'warn', todo: 'Planner: 2 tasks are due today', short: '2 tasks due', app: 'planner' }] } },
  bots: [
    { id: 'lit', name: 'Zlarior', size: '50K', level: 'ok', pnl: 412, room: 1840, mll: 2000, text: 'Waiting for the London window', app: 'zenith' },
    { id: 'atlas', name: 'ATLAS', size: '25K', level: 'warn', pnl: -96, room: 1240, mll: 1500, text: 'Close to its floor: it sizes down by itself', app: 'zenith' },
  ],
  money: { low: -42, base: 1495, high: 2547, live: false, text: 'Example numbers until your money machines publish their own.', note: 'An estimate, not income.' },
  day: { now: { label: 'London entries', text: 'LIT looks for a sweep; most trades come here.', until: 'New York morning in 2 h 10 min', entries: true }, next: { title: 'Example: inflation report', when: 'Tue 8:30 AM ET', impact: 'high' } },
};

// ------------------------------------------------------------------------------------------------ pure builders
export function nudgesFrom(facts, api) {
  const out = [];
  try {
    const n = api && typeof api.nudges === 'function' ? api.nudges() : null;
    for (const x of arr(n && n.then ? null : n)) if (isObj(x) && str(x.text)) out.push({ id: str(x.id, 40) || 'api' + out.length, text: str(x.text, 160), tone: /^(bad|warn|ok|info)$/.test(x.tone) ? x.tone : 'info', app: str(x.app, 40), say: str(x.say, 120) });
  } catch (_) { /* the API is optional */ }
  const sys = facts && isObj(facts.system) ? facts.system : null;
  for (const t of arr(sys && sys.todos)) if (isObj(t) && str(t.todo)) out.push({ id: str(t.id, 40), text: str(t.todo, 160), tone: t.level === 'bad' ? 'bad' : 'warn', app: str(t.app, 40) });
  const p = facts && isObj(facts.planner) ? facts.planner : null;
  const tasks = arr(p && p.tasks).filter(isObj);
  if (tasks.length) out.push({ id: 'tasks', text: `${tasks.length} ${tasks.length === 1 ? 'task is' : 'tasks are'} due today: ${str(tasks[0].title, 50)}${tasks.length > 1 ? ' and more' : ''}`, tone: 'info', app: 'planner' });
  const seen = new Set(), uniq = out.filter((x) => !seen.has(x.text) && seen.add(x.text));
  uniq.sort((a, b) => (a.tone === 'bad' ? 0 : a.tone === 'warn' ? 1 : 2) - (b.tone === 'bad' ? 0 : b.tone === 'warn' ? 1 : 2));
  return { items: uniq.slice(0, 3), more: Math.max(0, uniq.length - 3), all: uniq.slice(0, 12) };
}

export function botsFrom(snap, facts) {
  const bots = snap && snap.ok && isObj(snap.bots) ? snap.bots : null;
  if (!bots) return [];
  const rows = facts && facts.system ? arr(facts.system.rows) : [];
  const out = [];
  for (const key of ['lit', 'atlas']) {
    const b = bots[key]; if (!isObj(b)) continue;
    const row = rows.find((r) => r && (r.id === key)) || {};
    const rf = num(b.room_frac);
    const level = b.over ? '' : row.level === 'bad' || (rf != null && rf < 0.25) ? 'bad' : row.level === 'warn' || (rf != null && rf < 0.5) ? 'warn' : num(b.room) != null ? 'ok' : '';
    out.push({ id: key, name: key === 'lit' ? 'Zlarior' : 'ATLAS', size: str(b.size, 8), level, pnl: num(b.today_pnl), room: num(b.room), mll: num(b.mll),
      text: str(b.waiting, 80) || str(b.status, 40) || str(row.text, 80), app: 'zenith' });
  }
  // the PC's other real accounts (data.js extraAccounts, night-feedsA: Zlarior 25K #2), after the bot cards
  for (const x of arr(facts && isObj(facts.live) ? facts.live.extra : null).filter(isObj)) {
    const rf = num(x.room_frac), name = str(x.name, 30) || 'Account', size = str(x.size, 8);
    out.push({ id: str(x.id, 30), name, size: size && name.includes(size) ? '' : size, level: rf != null && rf < 0.25 ? 'bad' : rf != null && rf < 0.5 ? 'warn' : num(x.room) != null ? 'ok' : '',
      pnl: num(x.today_pnl), room: num(x.room), mll: num(x.mll),
      text: x.stage === 'funded' ? 'Funded' : num(x.to_target) != null ? `Eval · ${usd(x.to_target)} to pass` : 'Eval', app: 'zenith' });
  }
  return out;
}

/** "Drawdown left $X of $max loss": the owner's wording, with both numbers, never one without the other when the max is known. */
export function drawdownLine(b) {
  if (!b || num(b.room) == null) return 'No drawdown number yet';
  const r = usd(b.room), m = num(b.mll) != null && b.mll > 0 ? usd(b.mll) : null;
  return m ? `Drawdown left ${r} of ${m} max loss` : `Drawdown left ${r}`;
}

export function moneyFrom(j) {
  const t = isObj(j) && isObj(j.total) ? j.total : null;
  if (!t || num(t.base) == null) return null;
  const sample = !!(j && (j.mode === 'sample' || (isObj(j.counts) && j.counts.ok === 0 && j.counts.stale === 0) || /example/i.test(str(j.note, 200))));
  return { low: num(t.low), base: num(t.base), high: num(t.high), live: !sample, text: sample ? 'Example numbers until your money machines publish their own.' : 'From your money machines, paper only.', note: 'An estimate, not income.' };
}

let ETF = null;          // one formatter, made once (night-fitperf 2026-11-19)
const ETP = (ms) => {
  try {
    const p = {}; for (const x of (ETF || (ETF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }))).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd: p.weekday };
  } catch (_) { const d = new Date(ms); return { ymd: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16), wd: '' }; }
};
const ampm = (hm) => { const [h, m] = String(hm).split(':').map(Number); return Number.isFinite(h) ? `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` : ''; };
/** The next market-moving event (Pythia's events.json) at or after `nowMs`, New York time, or null. Nothing is guessed: no file, no event. */
export function nextEvent(events, nowMs) {
  const list = isObj(events) && isObj(events.events) ? arr(events.events.events) : isObj(events) ? arr(events.events) : [];
  const now = ETP(nowMs), key = now.ymd + ' ' + now.hm;
  const up = list.filter((e) => isObj(e) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) && str(e.title)).map((e) => ({ e, k: e.date + ' ' + (/^\d{2}:\d{2}$/.test(String(e.time)) ? e.time : '23:59') }))
    .filter((x) => x.k >= key).sort((a, b) => (a.k < b.k ? -1 : 1));
  if (!up.length) return null;
  const e = up[0].e, d = new Date(e.date + 'T12:00:00Z'), wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const today = e.date === now.ymd;
  return { title: str(e.title, 60), when: `${today ? 'Today' : wd + ' ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate()}${/^\d{2}:\d{2}$/.test(String(e.time)) ? ' ' + ampm(e.time) + ' ET' : ''}`, impact: /^(high|med|low)$/.test(e.impact) ? e.impact : '' };
}

export function appsLookup(apps) {
  const m = new Map();
  for (const a of arr(apps)) if (isObj(a) && typeof a.id === 'string') m.set(a.id, { id: a.id, name: str(a.name, 24) || a.id, glyph: str(a.glyph, 2) || str(a.name || a.id, 1).toUpperCase() });
  return m;
}
const pickIds = (list, lookup, n) => arr(list).filter((id) => typeof id === 'string' && lookup.has(id)).slice(0, n).map((id) => lookup.get(id));


// ------------------------------------------------------------------------------------------------ v2: the first screen in plain words
export const WORDS = {
  waiting: 'The bots have not reported yet: your accounts are not affected',
  offline: 'You are offline: these are the last saved numbers',
  demo: 'Example numbers (demo). Nothing here is real.',
  calm: 'Nothing needs you right now.',
};
/** "6 min", "2 h 10 min", "3 days": an age in plain words (seconds in). */
export function ageText(sec) {
  const s = num(sec); if (s == null || s < 0) return '';
  const m = Math.round(s / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return r && h < 6 ? `${h} h ${r} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}
export const STALE_S = 20 * 60;       // a bot report older than this is said to be old, with its age
export const SILENT_S = 6 * 3600;     // older than this (2026-11-18): the day it last reported and the one fix, STOP BOT then START BOT
export const RESTART = 'STOP BOT, then START BOT';
/** "today 3:40 PM", "yesterday 9:05 AM", "Nov 7": when the PC last reported, New York time */
export function whenText(sec, nowMs) {
  const t = num(sec); if (t == null || t <= 0) return '';
  const a = ETP(t * 1000), b = ETP(num(nowMs) != null ? +nowMs : Date.now()), y = ETP((num(nowMs) != null ? +nowMs : Date.now()) - 864e5);
  if (a.ymd === b.ymd) return 'today ' + ampm(a.hm);
  if (a.ymd === y.ymd) return 'yesterday ' + ampm(a.hm);
  const [yy, mm, dd] = a.ymd.split('-').map(Number);
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mm - 1] + ' ' + dd + (yy !== +b.ymd.slice(0, 4) ? ', ' + yy : '');
}
/** What the numbers on the screen are: demo, the phone offline, no bot report yet, an old report (with its age), or live. Never blank, never alarming. */
export function stateFrom(o) {
  o = o || {};
  const facts = isObj(o.facts) ? o.facts : null, now = num(o.now) != null ? +o.now : Date.now();
  if (o.demo) return { kind: 'demo', text: WORDS.demo, age: null };
  const live = facts && isObj(facts.live) ? facts.live : null, t = live && num(live.t) != null && +live.t > 0 ? +live.t : null;
  const age = t != null ? Math.max(0, now / 1000 - t) : null;
  // the PC's own last report (home.json through olympus/truth.js: the PC report or the PC feed) when the live feed has none, or an older one
  const pcT = num(o.pcT) != null && +o.pcT > 0 ? +o.pcT : null;
  const silent = (sec, at) => ({ kind: 'stale', text: `PC silent since ${whenText(at, now)}: ${RESTART}`, age: sec, since: whenText(at, now), fix: true });
  if (o.online === false) return { kind: 'offline', text: WORDS.offline + (age != null ? ` (the bots reported ${ageText(age)} ago)` : ''), age };
  if (!live) {
    const pa = pcT != null ? Math.max(0, now / 1000 - pcT) : null;
    if (pa != null && pa > SILENT_S) return silent(pa, pcT);
    if (pa != null && pa > STALE_S) return { kind: 'stale', text: `The last bot report is ${ageText(pa)} old: your accounts are not affected`, age: pa };
    // a fresh PC report without the live feed's account cards (2026-11-18, night-zcard): the PC IS reporting (the ZEUS card has its accounts), never "not reported yet"
    if (pa != null) return { kind: 'live', text: `PC reported ${ageText(pa)} ago`, age: pa, pcOnly: true };
    return { kind: 'waiting', text: WORDS.waiting, age: null };
  }
  if (age != null && age > SILENT_S) return silent(age, t);
  if (age != null && age > STALE_S) return { kind: 'stale', text: `The last bot report is ${ageText(age)} old: your accounts are not affected`, age };
  return { kind: 'live', text: age != null ? `Bots reported ${ageText(age)} ago` : 'Bots reporting', age };
}
const APP_DISTRICT = { zenith: 'market', oracle: 'market', kairos: 'market', pythia: 'market', odeon: 'market', mint: 'money', kalshi: 'money', ledger: 'money', sibyl: 'money', planner: 'life', journal: 'life', compass: 'life', settings: 'command', bridge: 'command', argus: 'command' };
/** Which of the five district doorways should glow: the worst tone of the things that need the owner, by the district of the app they open. */
export function needsFrom(items, districtOf) {
  const out = { market: '', research: '', money: '', command: '', life: '' };
  for (const x of arr(items)) {
    if (!isObj(x) || !(x.tone === 'bad' || x.tone === 'warn')) continue;
    let d = '';
    try { d = typeof districtOf === 'function' && x.app ? districtOf({ id: x.app }) : ''; } catch (_) { d = ''; }
    if (!d || !(d in out) || (d === 'command' && APP_DISTRICT[x.app] && APP_DISTRICT[x.app] !== 'command')) d = APP_DISTRICT[x.app] || (x.app ? d || 'command' : 'command');
    if (!(d in out)) d = 'command';
    if (x.tone === 'bad' || !out[d]) out[d] = x.tone;
  }
  return out;
}
/** The tightest account first: the one with the least drawdown left as a share of its max loss. */
export function tightest(bots) {
  const list = arr(bots).filter((b) => isObj(b) && num(b.room) != null);
  if (!list.length) return null;
  const frac = (b) => (num(b.mll) != null && b.mll > 0 ? b.room / b.mll : 9);
  return list.slice().sort((a, b) => frac(a) - frac(b) || a.room - b.room)[0];
}
/** The three tiles of the first screen, in order: NQ bots (drawdown left), Money (the Mint estimate with its range), Today (the window now / the next event). */
export function tilesFrom(m) {
  const st = m.state || { kind: 'live' }, t = tightest(m.bots), n = arr(m.bots).length;
  // the ZEUS card sits above the tiles (2026-11-18, night-zcard: ../olympus/zeus_core.js, every real account with its $): no second NQ bots tile
  // under it that could say something else ("The bots have not reported yet" while the PC reports); Money + Today side by side
  const bots = t ? { id: 'bots', app: t.app || 'zenith', kicker: 'NQ bots', tone: t.level || '', lead: 'Drawdown left', big: usd(t.room), tail: num(t.mll) != null && t.mll > 0 ? `of ${usd(t.mll)} max loss` : '',
    sub: `${t.name}${t.size ? ' ' + t.size : ''}${n > 1 ? `, the tighter of ${n}` : ''}${t.pnl != null ? ` · ${usd(t.pnl, true)} today` : ''}`, frac: num(t.mll) != null && t.mll > 0 ? Math.max(0, Math.min(1, t.room / t.mll)) : null, aria: `NQ bots. ${t.name}: ${drawdownLine(t)}` }
    : { id: 'bots', app: 'zenith', kicker: 'NQ bots', tone: '', lead: '', big: '', tail: '', frac: null,
      text: st.kind === 'offline' ? 'You are offline' : st.fix ? `No report since ${st.since}` : st.pcOnly ? st.text : 'The bots have not reported yet',
      sub: st.kind === 'offline' ? 'The bots keep running on the PC on their own.' : st.fix ? 'On the PC, tap STOP BOT, then START BOT.' : st.pcOnly ? 'Each account: the ZEUS card above.' : 'Your accounts are not affected.',
      aria: 'NQ bots. ' + (st.fix ? st.text : WORDS.waiting), tone: st.fix ? 'warn' : '' };
  const k = m.money;
  // not live = Mint's bundled sample streams (mint/fixture.json: "EXAMPLE numbers, not real"), not a backtest of your bots: said so, plainly
  const money = k ? { id: 'money', app: 'mint', kicker: 'Money', tone: '', lead: '', big: usd(k.base), tail: k.live ? 'a month, estimate' : 'a month, sample', frac: null,
    sub: `Range ${usd(k.low)} to ${usd(k.high)}${k.live ? '' : ' · sample, not real'}`,
    aria: `Money. Mint ${k.live ? 'estimate' : 'sample, not your money:'} ${usd(k.base)} a month, range ${usd(k.low)} to ${usd(k.high)}. An estimate, not income.` }
    : { id: 'money', app: 'mint', kicker: 'Money', tone: '', lead: '', big: '', tail: '', frac: null, text: 'No estimate yet', sub: 'Waiting for the money machines to publish.', aria: 'Money. No estimate yet.' };
  const w = m.day && m.day.now, e = m.day && m.day.next;
  const today = w ? { id: 'today', app: 'kairos', kicker: 'Today', tone: w.entries ? 'ok' : '', text: w.label, sub: [w.until, e ? `Next: ${e.title}, ${e.when}` : ''].filter(Boolean).join(' · ') || w.text, aria: `Today. ${w.label}. ${w.until || ''}${e ? ` Next: ${e.title}, ${e.when}` : ''}` }
    : e ? { id: 'today', app: 'pythia', kicker: 'Today', tone: e.impact === 'high' ? 'warn' : '', text: `Next: ${e.title}`, sub: `${e.when}${e.impact ? ' · ' + e.impact + ' impact' : ''}`, aria: `Today. Next: ${e.title}, ${e.when}` }
      : { id: 'today', app: 'planner', kicker: 'Today', tone: '', text: 'Nothing on the calendar I can read', sub: 'Open the Planner for your day.', aria: 'Today. Nothing on the calendar I can read.' };
  return m.zeus ? [money, today] : [bots, money, today];
}
/** a paper-test nudge (nudges.js 'paper_*': the cloud paper ledger, not a real account) */
export const isPaper = (x) => isObj(x) && /^paper[_:]/.test(String(x.id || ''));
/** ONE sentence for the hero: the first thing that needs the owner, else the state in plain words, else calm. */
export function heroFrom(m) {
  const items = m.today ? arr(m.today.items) : [], st = m.state || { kind: 'live' };
  const real = items.filter((x) => !isPaper(x)), it = real[0];       // a paper test (the cloud ledger) never takes the one sentence: it waits in "+N more"
  const all = items.length + (m.today ? num(m.today.more) || 0 : 0);
  // a silent PC (no report for 6 h+) is the one sentence unless something is red: the day it last reported and the fix
  if (it && !(st.fix && it.tone !== 'bad')) return { text: it.text, tone: it.tone || 'info', app: it.app || '', say: it.say || '', more: all - 1 };
  if (st.fix) return { text: st.text + '.', tone: 'warn', app: 'zenith', say: '', more: all };
  if (st.kind === 'waiting' || st.kind === 'offline' || st.kind === 'stale') return { text: st.text + '.', tone: 'info', app: '', say: 'How are my bots?', more: all };
  return { text: WORDS.calm, tone: 'ok', app: '', say: 'What should I do today?', more: all };
}

export function buildHome(o) {
  o = o || {};
  const now = num(o.now) != null ? +o.now : Date.now(), demo = !!o.demo, facts = isObj(o.facts) ? o.facts : null;
  const online = o.online !== false;
  const lookup = appsLookup(o.apps);
  const m = { demo, online, zeus: !!o.zeus && !demo, asof: now, today: { items: [], more: 0 }, bots: [], money: null, day: { now: null, next: null }, asks: ASKS.slice(), favs: [], recent: [] };
  // today: what needs you
  try { m.today = nudgesFrom(demo ? FAKE.facts : facts, demo ? null : o.api); } catch (_) { /* stays empty */ }
  // bots
  try { m.bots = demo ? FAKE.bots.slice() : botsFrom(o.snap, facts); } catch (_) { m.bots = []; }
  // money
  try { m.money = demo ? FAKE.money : moneyFrom(o.money) || (o.sampleMoney ? moneyFrom(o.sampleMoney) : null); } catch (_) { m.money = null; }
  // the market day
  try {
    const k = o.kairos;
    const nowS = k && isObj(k.now) ? k.now : null;
    m.day.now = demo ? FAKE.day.now : nowS ? { label: str(nowS.label, 40), text: str(nowS.text, 140), until: str(nowS.until, 60), entries: !!nowS.entries } : null;
    m.day.next = demo ? FAKE.day.next : nextEvent(o.events, now);
  } catch (_) { /* stays empty */ }
  // favourites and recent
  const favIds = arr(o.favs).length ? o.favs : [];
  m.favs = pickIds(favIds, lookup, 8);
  m.recent = pickIds(arr(o.recent).filter((id) => favIds.indexOf(id) < 0), lookup, 4);
  // v2: the first screen
  try { m.state = stateFrom({ demo, online, facts, now, pcT: o.pcT }); } catch (_) { m.state = { kind: 'waiting', text: WORDS.waiting, age: null }; }
  try { m.needs = needsFrom(m.today.all || m.today.items, o.districtOf); } catch (_) { m.needs = { market: '', research: '', money: '', command: '', life: '' }; }
  try { m.tiles = tilesFrom(m); } catch (_) { m.tiles = []; }
  try { m.hero = heroFrom(m); } catch (_) { m.hero = { text: WORDS.calm, tone: 'ok', app: '', say: '', more: 0 }; }
  return m;
}

// ------------------------------------------------------------------------------------------------ the browser part
const lsRead = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(v) ? v : null; } catch (_) { return null; } };
async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => { try { if (ac) ac.abort(); } catch (_) { /* fine */ } }, ms || 5000);
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(t); }
}
let kcore = null;
async function kairosNow(now) {
  try { kcore = kcore || (await import('../kairos/kairoscore.js')); return { now: kcore.nowState(new Date(now)) }; } catch (_) { return null; }
}
let cache = null;
/** Fetch what the home needs. The slow sources (Mint, Pythia) are cached for 5 minutes; everything else is read fresh from Jarvis. */
export async function loadHome(opts) {
  opts = opts || {};
  const win = opts.win || window, demo = !!opts.demo, now = Date.now();
  let facts = null, snap = null, apps = [];
  try { facts = win.__jarvis && typeof win.__jarvis.facts === 'function' ? win.__jarvis.facts() : null; } catch (_) { facts = null; }
  try { apps = facts && Array.isArray(facts.apps) ? facts.apps : []; } catch (_) { apps = []; }
  if (!apps.length && Array.isArray(win.OLYMPUS_APPS_LIST)) apps = win.OLYMPUS_APPS_LIST;
  if (!demo && facts && facts.live) { try { const B = await import('./bots.js'); snap = B.snapshot(facts.live, now); } catch (_) { snap = null; } }
  const quick = !!opts.quick;                 // quick: what Jarvis already has, no network (the first paint); the published files follow
  if (!quick && (!cache || now - cache.t > 5 * 60e3)) {
    const [money, sample, events, home] = demo ? [null, null, null, null] : await Promise.all([getJSON('../money/index.json'), getJSON('../mint/fixture.json'), getJSON('../pythia/events.json'), getJSON('../home.json')]);
    let pcT = null;
    if (isObj(home)) {
      try { const T = await import('../olympus/truth.js'); const h = T.canonHome(await T.withPcFeed(home), now / 1000); pcT = num(h && h.truth && h.truth.ages && h.truth.ages.pc && h.truth.ages.pc.t); } catch (_) { pcT = null; }
    }
    cache = { t: now, money, sample, events, pcT };
  }
  const c = cache || { money: null, sample: null, events: null, pcT: null };
  const kairos = await kairosNow(now);
  let favs = null; for (const k of FAV_KEYS) { favs = lsRead(k); if (favs && favs.length) break; }
  let zeus = false; try { zeus = !!(win.document && win.document.querySelector('#zeusCard .zeus-card')); } catch (_) { zeus = false; }
  // the ZEUS card's PC age (the PC's ntfy status, ../olympus/zeus_core.js) when it is newer: the hero never says "not reported" under a card that says it did
  let pcT = c.pcT;
  try { const z = win.ZEUS_CORE && win.ZEUS_CORE.last, a = z && z.pc ? num(z.pc.age_s) : null; if (!demo && a != null && (pcT == null || now / 1000 - a > pcT)) pcT = now / 1000 - a; } catch (_) { /* optional */ }
  const home = buildHome({ demo, zeus, facts, snap, districtOf: opts.districtOf, api: win.JARVIS_API || null, money: c.money, sampleMoney: c.sample, events: c.events, kairos, now, apps, pcT,
    favs: favs || [], recent: lsRead(REC_KEY) || [], online: win.navigator ? win.navigator.onLine !== false : true });
  return home;
}
export const _resetCache = () => { cache = null; };
