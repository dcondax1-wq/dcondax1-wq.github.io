// Jarvis apps (owner 2026-11-01: "I'm getting ChatGPT to make an Ascend dashboard we will eventually add"): Jarvis as an
// app platform. Any dashboard plugs in with one link and can show a live card on the Jarvis screen.
//
//   listApps({hidden})       the dashboards for the bar, by group (GROUPS): the OLYMPUS built-ins (BUILT_INS: Zenith, Oracle,
//                            Odeon, Fates, Data City, Daphne, Prometheus, Planner, Mind, Kalshi, Tyche, Hermes), Ascend once enabled (LIFE), then the ones the owner
//                            added with + (MORE), in the order added. Fresh copies; Jarvis's own screen is the shell's.
//   missing(app)             a built-in whose folder is not on the site yet (its jarvis.json answered 404): not opened
//   getApp(id)               one of them (the hidden Ascend slot too), or null
//   addApp({name, url, statusUrl?, icon?})  -> {ok: true, app, existed?} | {ok: false, field, error (plain words)}
//                            no name: one is made from the link (and replaced by the name in its jarvis.json);
//                            the name "Ascend" (or a link ending in /ascend/) fills the Ascend slot; a link on Jarvis's
//                            own origin outside our pages is added with warn: SAME_SITE_WARN (it could read Jarvis's keys)
//   removeApp(id) -> bool    an added app or Ascend; the built-ins stay
//   ascendSlot() / enableAscend(url) / findAscend()   the pre-registered, hidden Ascend entry: findAscend() is the
//                            one-tap "Add Ascend" from its known link (ASCEND_URL); nothing is guessed
//   appStatus(app) -> Promise<card|null>   the app's live card from its jarvis.json (the Jarvis status contract, 5 s
//                            timeout); a failure returns the last good card (cached: true) or null, never throws
//   cachedStatus(app)        the last good card at once (for the first paint), or null
//   statusError(app)         why the last status fetch failed ('' when it did not)
//   validateStatus(json)     the contract check: {ok: true, card} | {ok: false, error}
//   renderCard(card, document) -> HTMLElement   the card as a tappable <button data-app> (escaped: text only, accessible)
//   listen(window, onCard)   cards an app posts while it is open inside Jarvis (apps without a server); returns stop()
//
// The status contract (docs/JARVIS_APPS.md): <app url>jarvis.json, or the app's statusUrl, at most 8 KB, plain text only:
//   {v: 1, name, status: {level: 'ok'|'warn'|'bad'|'off', label}, kpis: [{label, value, delta?}] (<= 3),
//    lines: [text] (<= 3), t: unix seconds, open?: a route inside the app, theme?: "#rrggbb" (its top colour)}
// A card is stale (shown grey, "not updated for ...") once t is more than 30 minutes old.
//
// Storage (this phone only). `jarvis.apps` {v: 1, apps, ascend, seen} is the registry. The older keys are never deleted and
// are read on every load: `jarvis.extra` [{id, name, url}] (the + sheet) and `jarvis.links` {id: url} (links pasted on a
// card) are imported once each (their fingerprints go in `seen`), so nothing an older Jarvis saved is lost; adds and
// removals are mirrored into `jarvis.extra` so an older copy of Jarvis shows the same list. `jarvis.cards` keeps each
// app's last good card. Ids are stable (kept from the old keys, else "x-<name>" made unique); names are capped at 24.
// Plain ES2020 for iPhone Safari 16, no imports, no DOM use outside renderCard. Test: python -X utf8 -m tests.test_jarvis_apps
//
// In the Jarvis page: const A = await import('./apps.js');
//   bar and cards from A.listApps() (the page adds its own Jarvis entry); for an app that is not built in:
//   A.cachedStatus(app) for the first paint, then A.appStatus(app).then((c) => c && box.replaceChildren(A.renderCard(c, document)));
//   A.listen(window, () => refresh the cards); the + sheet: A.addApp({name, url}) -> r.ok ? open r.app.id : show r.error,
//   "Add Ascend" (while !A.ascendSlot().enabled): A.findAscend() -> r.ok ? open 'ascend' : name "Ascend" + ask for the link;
//   removing: always A.removeApp(id), never by editing jarvis.extra / jarvis.links (the registry keeps what it imported).

export const KEY = 'jarvis.apps';
export const CARDS_KEY = 'jarvis.cards';
export const LEGACY_EXTRA = 'jarvis.extra';
export const LEGACY_LINKS = 'jarvis.links';
export const NAME_MAX = 24;
export const URL_MAX = 2048;
export const TIMEOUT_MS = 5000;
export const STALE_AFTER_S = 30 * 60;
export const LEVELS = Object.freeze(['ok', 'warn', 'bad', 'off']);
export const LIMITS = Object.freeze({ bytes: 8192, name: 40, label: 48, kpis: 3, kpiLabel: 20, kpiValue: 24, kpiDelta: 16, lines: 3, line: 120, open: 300, futureS: 600 });
export const ASCEND_ID = 'ascend';
export const ASCEND_NAME = 'Ascend';
// Ascend's link once the owner sends it (owner: "send it and it is built in"): then "Add Ascend" adds it with one tap.
// Always another site, never under demetrades2000-coder.github.io (see SAME_SITE_WARN). Empty: "Add Ascend" asks for the link.
export const ASCEND_URL = '';
// ------------------------------------------------------------------ OLYMPUS: every built-in app, one row each (2026-11-03)
// Adding an app to OLYMPUS is one row in BUILT_INS, nothing else: its folder on the dashboard site (../<id>/) holds its
// index.html and its jarvis.json (the status contract below: its live card, its `theme` = its top colour). The bar, the
// orb's switcher and ring, the OLYMPUS grid on the Jarvis screen, the same-site check and the reserved ids all read this list.
// A row whose folder is not on the site yet (its jarvis.json answers 404) never breaks anything: missing(app) is true, the
// shell shows "not on the site yet" and does not open it.
//   app(id, name, group, accent, sub, more?)   group: a GROUPS id; accent: its glow colour on the Jarvis screen;
//   more: {url (default ../<id>/), icon, glyph, live (default true: its card from its jarvis.json; false: the shell draws it)}
// The switcher shows JARVIS first, then the groups in GROUPS order, each in this list's order; apps added with + go in MORE.
export const GROUPS = Object.freeze([
  Object.freeze({ id: 'trading', name: 'TRADING' }), Object.freeze({ id: 'life', name: 'LIFE' }),
  Object.freeze({ id: 'money', name: 'MONEY' }), Object.freeze({ id: 'more', name: 'MORE' }),
]);
const app = (id, name, group, accent, sub, more) => Object.freeze(Object.assign({ id, name, group, accent, sub, url: '../' + id + '/', live: true }, more));
export const BUILT_INS = Object.freeze([
  app('zenith', 'Zenith', 'trading', '#9c6b3c', 'NQ bots \u00b7 Zlarior \u00b7 ATLAS', { url: '../', icon: '../icons/icon-192.png?v=p111030', live: false }),
  app('oracle', 'Oracle', 'trading', '#7fb0a3', 'The market radar, live', { glyph: '\u0398' }),
  app('odeon', 'Odeon', 'trading', '#d77a7a', 'Every trade, replayed in 3D', { glyph: '\u039e' }),
  app('fates', 'Fates', 'trading', '#ffcf5a', 'Pass odds for each eval', { glyph: '\u03a6' }),
  app('datacity', 'Data City', 'trading', '#5f8ea6', 'Every combo tested, as a city', { glyph: '\u0394' }),
  app('observatory', 'Observatory', 'trading', '#a9bfd0', 'Data health and research evidence', { glyph: '\u25c9' }),
  app('tree', 'Daphne', 'trading', '#6b9068', 'The strategy tree search', { glyph: '\u03a8' }),
  app('prometheus', 'Prometheus', 'trading', '#ff7a1a', 'The Forge: strategies tested', { glyph: '\u03a0' }),
  app('pantheon', 'Pantheon', 'trading', '#f2d68a', 'The data gods: rates, liquidity, fear', { glyph: '\u03a3' }),
  app('ares', 'Ares', 'trading', '#c8402e', 'The war room: GO, WAIT or HALT', { glyph: '\u039b' }),
  app('forum', 'Forum', 'trading', '#8f9f3c', 'Morning briefing at the real NY hour', { glyph: '\u0393' }),
  app('labyrinth', 'Labyrinth', 'trading', '#a8765a', 'The risk maze: size your eval', { glyph: '\u039e' }),
  app('argus', 'Argus', 'trading', '#3f8a8a', 'The hundred eyes: what to fix', { glyph: '\u0391' }),
  app('nemesis', 'Nemesis', 'trading', '#b55c66', 'The fallen trades: what went wrong', { glyph: '\u039d' }),
  app('chronos', 'Chronos', 'trading', '#d4a574', 'Time and the session clock', { glyph: '\u03a7' }),
  app('hephaestus', 'Hephaestus', 'trading', '#c7773f', 'The forge: tune the dials', { glyph: '\u2692' }),
  app('cities', 'Cities', 'trading', '#b88a50', 'A world of city islands', { glyph: '\u25C8' }),
  app('kalshicity', 'Kalshi City', 'money', '#b5a642', "The Kalshi bot's edges as a night city", { glyph: 'K' }),
  app('journal', 'Mnemosyne', 'trading', '#e08a6b', 'A 10-second trade journal: what your habits cost, in dollars', { glyph: '\u039C' }),
  app('ledger', 'Ledger', 'money', '#c2b280', 'Your real money: fees, payouts, net profit', { glyph: 'L' }),
  app('inbox', 'Inbox', 'life', '#9aa3a8', 'Everything that needs a look, in one place', { glyph: '\u2709' }),
  app('settings', 'Settings', 'life', '#a39883', 'Look, voice, storage and the tour', { glyph: '\u2699' }),
  app('bridge', 'Bridge', 'trading', '#8c7a5a', 'Link ChatGPT: 3 steps, live job status', { glyph: '\u0392' }),
  app('planner', 'Planner', 'life', '#7fa7c2', 'Day and week plan: session windows, tasks, habits, notes', { glyph: '\u03a0' }),
  app('mind', 'Mind', 'life', '#d9b8a8', 'Your vault as a living 3D brain', { glyph: '\u03a9' }),
  app('arena', 'Arena', 'life', '#ffb547', 'Olympian ranks: XP for discipline', { glyph: '\u0391' }),
  app('hestia', 'Hestia', 'trading', '#c8a24a', 'Today at home: what to do right now', { glyph: '\u0397' }),
  app('demeter', 'Demeter', 'trading', '#9aa564', 'Account health: drawdown dials, payout rules', { glyph: '\u0394' }),
  app('apollo', 'Apollo', 'trading', '#e0b060', 'Your weekly review and the one rule for next week', { glyph: '\u0391' }),
  app('hera', 'Hera', 'money', '#c96a4a', 'The 12-month money plan, payouts, what to buy next', { glyph: '\u03a9' }),
  app('dionysus', 'Dionysus', 'money', '#b77a8a', 'The Kalshi desk: guard, what-if, scan. Suggestions only', { glyph: '\u03a3' }),
  app('delphi', 'Delphi', 'trading', '#e0b060', "The oracle's briefing: plan, target, go / no-go", { glyph: '\u03a6' }),
  app('pnyx', 'Pnyx', 'money', '#c8a24a', 'Prop-firm rules and risk calculator: stop to micros', { glyph: '\u03a0' }),
  app('mint', 'Mint', 'money', '#c8a24a', 'The money machine: five streams, one honest estimate', { glyph: 'M' }),
  app('mintcity', 'Mint City', 'money', '#c8a24a', 'The five money machines as a marble city', { glyph: 'MC' }),
  app('mercury', 'Mercury', 'money', '#c8a24a', 'Deal watcher: sales, codes, free resets, rule changes', { glyph: '\u263f' }),
  app('chrysos', 'Chrysos', 'money', '#c8a24a', 'Prop-firm fleet planner: fees against payouts, break-even (estimate)', { glyph: 'X' }),
  app('sibyl', 'Sibyl', 'money', '#c8a24a', 'Prediction-market edges after fees: paper picks, ruin odds, what could go wrong', { glyph: '\u03a3' }),
  app('oikos', 'Oikos', 'money', '#c8a24a', 'The household: where money leaks, tax set-aside, buckets, reinvest or withdraw', { glyph: 'O' }),
  app('arbiter', 'Arbiter', 'money', '#c8a24a', 'Paper-only spreads and funding: net yearly return after costs', { glyph: '\u039e' }),
  app('stoa', 'Stoa', 'trading', '#c8a24a', 'The colonnade: what needs you right now', { glyph: '\u03a3' }),
  app('aegis', 'Aegis', 'trading', '#c8a24a', 'Risk guard: drawdown left, a full-stop what-if, when to stop for the day', { glyph: 'A' }),
  app('lyceum', 'Lyceum', 'life', '#c8a24a', 'The school: daily rules quiz, ranks, habits costing money', { glyph: '\u03a3' }),
  app('nike', 'Nike', 'life', '#c8a24a', 'The trophy hall: milestones and wins from real numbers', { glyph: '\u039d' }),
  app('kronos', 'Kronos', 'money', '#c8a24a', 'The calendar of money: daily P&L, best weekday and hour, a bad week', { glyph: 'K' }),
  app('moirai', 'Moirai', 'trading', '#c8a24a', 'The three fates: pass, bust and time of an eval, simulated', { glyph: 'M' }),
  app('epilogue', 'Epilogue', 'life', '#c8a24a', 'Your week in 60 seconds: the Sunday review', { glyph: '\u03a9' }),
  app('argo', 'Argo', 'money', '#4b7a99', 'The voyage: your money goals as islands, honest ETA ranges', { glyph: '\u0391' }),
  app('kratos', 'Kratos', 'trading', '#c8a24a', 'Discipline score 0-100 per day: plan, stop, size, hours, flat', { glyph: 'K' }),
  app('pythia', 'Pythia', 'trading', '#e0b060', 'The risk calendar: the next 14 days, and what the bots do around each event', { glyph: '\u03a8' }),
  app('gallery', 'Agora Gallery', 'life', '#c8a24a', 'Every 3D shape of the Agora on a turning pedestal', { glyph: '\u0393' }),
  app('kairos', 'Kairos', 'trading', '#c8a24a', "The right moment: the bots' day on a 24-hour ring, what they do now", { glyph: 'K' }),
  app('compass', 'Compass', 'trading', '#c8a24a', 'The next best action: at most five things for today, with why', { glyph: 'C' }),
  app('pheme', 'Pheme', 'trading', '#c8a24a', "The word on the street: releases, and NQ's past moves on them", { glyph: '\u039e' }),
  app('harmonia', 'Harmonia', 'money', '#c8a24a', 'The balance: what leans on the NQ bots, and what is left', { glyph: 'H' }),
  app('helios', 'Helios', 'trading', '#c8a24a', 'The morning briefing: today, drawdown, deals, plan', { glyph: 'S' }),
  app('ergasterion', 'Ergasterion', 'trading', '#c8a24a', 'The workshop: every AI worker, what it does and learns', { glyph: 'E' }),
  app('archive', 'Archive', 'trading', '#c8a24a', 'The library of everything we ever tested, searchable', { glyph: 'B' }),
  app('pinakes', 'Pinakes', 'trading', '#c8a24a', 'The catalogue: browse and query every table OLYMPUS keeps', { glyph: '\u039a' }),
  app('colosseum', 'Colosseum', 'trading', '#c8a24a', 'Where strategies fight: seven rounds on real stored numbers', { glyph: 'C' }),
  app('nq', 'NQ', 'trading', '#c8a24a', 'The NQ bots, right now: status, drawdown left, last trades', { glyph: '\u039d' }),
  app('symposium', 'Symposium', 'life', '#d9b25a', 'Meet everyone who works for you, and talk to them', { glyph: '\u03a3' }),
  app('herald', 'Herald', 'life', '#c8a24a', 'The daily paper: who built what, the day, the verdicts, all sourced', { glyph: '\u0397' }),
  app('polis', 'Polis', 'life', '#e0b060', 'The city of OLYMPUS: every app a building under the real New York sky', { glyph: '\u03a0\u03bb' }),
  app('agency', 'Agency', 'money', '#d08c4a', 'Website agency: leads, demo sites, calls and the $ pipeline', { glyph: '\u0395' }),
  app('business', 'Business', 'money', '#c8a24a', 'Every money model: next step, what is missing, $ estimate', { glyph: 'B' }),
  app('trading', 'Trading', 'trading', '#c8a24a', 'Every trade: today, calendar, stats, payout rules', { glyph: 'T' }),
  app('board', 'Board', 'trading', '#c8a24a', 'What the bot, you and Claude know: accounts, events, notes', { glyph: '\u25a4' }),
  app('clio', 'Clio', 'trading', '#d8c9a8', 'The research library: every study in plain words', { glyph: '\u039a' }),
  app('atlas', 'Atlas', 'life', '#efc979', 'A fast map of every Olympus dashboard', { glyph: '\u25c8' }),
  app('athena', 'Athena', 'life', '#7f8a52', 'The library: strategy, rules, quiz', { glyph: '\ud83e\udd89' }),
  app('kalshi', 'Kalshi', 'money', '#8fa07a', 'Kalshi bot \u00b7 from your PC', { glyph: 'K', live: false }),
  app('tyche', 'Tyche', 'money', '#cf8f7a', 'The Kalshi bets as a 3D fortune wheel', { glyph: '\u03a4' }),
  app('hermes', 'Hermes', 'money', '#f7c948', 'OLYMPUS Wrapped: your money', { glyph: '\u0397' }),
  app('plutus', 'Plutus', 'money', '#a9b84f', 'The money plan: accounts and payouts', { glyph: '\u03a1' }),
]);
const GROUP_IDS = GROUPS.map((g) => g.id);
const groupRank = (g) => { const i = GROUP_IDS.indexOf(g); return i < 0 ? GROUP_IDS.length - 1 : i; };     // unknown: MORE
/** Any list of apps ({id, group}) in sections, as the switcher and the Jarvis screen show them: Jarvis ('home') first on its
 *  own (group null), then each of GROUPS in order with its apps in list order; an unknown group counts as MORE; no empty ones. */
export function byGroup(list) {
  const all = (Array.isArray(list) ? list : []).filter((a) => isObj(a) && a.id);
  const home = all.filter((a) => a.id === 'home'), rest = all.filter((a) => a.id !== 'home');
  const out = GROUPS.map((g, i) => ({ group: g, apps: rest.filter((a) => groupRank(a.group) === i) })).filter((s) => s.apps.length);
  return home.length ? [{ group: null, apps: home }].concat(out) : out;
}

// Every page on Jarvis's origin (demetrades2000-coder.github.io) can read what Jarvis and the Planner keep in localStorage
// (AI keys, the Planner's sync token). Ours there: the dashboard site's root page (Zenith), jarvis/ and every built-in's
// folder; a link anywhere else on that origin is still added, with this warning in the result and on the app.
export const SAME_SITE_WARN = "same-site apps can read Jarvis's saved keys";
const OWN_FOLDERS = ['jarvis/'].concat(BUILT_INS.map((b) => b.url.replace(/^\.\.\//, '')).filter(Boolean));
const RESERVED = new Set(['home', 'jarvis', ASCEND_ID].concat(BUILT_INS.map((b) => b.id)));
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const CTRL_G = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const HTML_RE = /<[a-z!?/]|&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;
const LEVEL_WORD = { ok: 'OK', warn: 'Warning', bad: 'Problem', off: 'Off' };

// ------------------------------------------------------------------ storage (a session copy when the phone refuses to save)
const mem = new Map();
const memFirst = new Set();               // keys whose last save failed: read from the session copy until a save works
function ls() { try { return globalThis.localStorage || null; } catch (_) { return null; } }
function readRaw(k) {
  const s = memFirst.has(k) ? null : ls();
  if (s) { try { return s.getItem(k); } catch (_) { /* unreadable here: the session copy */ } }
  return mem.has(k) ? mem.get(k) : null;
}
function read(k) {
  const raw = readRaw(k);
  if (raw == null) return undefined;
  try { return JSON.parse(raw); } catch (_) { return undefined; }
}
function write(k, v, sessionOnly) {
  const raw = JSON.stringify(v);
  mem.set(k, raw);
  const s = sessionOnly ? null : ls();
  if (s) { try { s.setItem(k, raw); memFirst.delete(k); return true; } catch (_) { /* full or private: kept for this session */ } }
  memFirst.add(k);
  return false;
}
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const absent = (x) => x === undefined || x === null;

// ------------------------------------------------------------------ links and names
function here() { try { return String(globalThis.location.href); } catch (_) { return undefined; } }
/** An absolute http(s) link, or '' (relative links are read against `base`, else this page). No user:password@. */
export function cleanUrl(u, base) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  if (!s || s.length > URL_MAX || CTRL_RE.test(s)) return '';
  let x;
  try { x = new URL(s, base || here()); } catch (_) { return ''; }
  if ((x.protocol !== 'https:' && x.protocol !== 'http:') || x.username || x.password) return '';
  return x.href.length > URL_MAX ? '' : x.href;
}
// what the owner pastes: "name.github.io/ascend/" without https:// is fine too
function userUrl(u) {
  let s = typeof u === 'string' ? u.trim() : '';
  const host = s.split(/[/?#]/)[0];
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,24}(?::\d+)?$/i.test(host) && !/\.(?:html?|php|json|js|css|png|jpe?g|svg|webmanifest)$/i.test(host)) s = 'https://' + s;
  return cleanUrl(s);
}
/** A name as Jarvis shows it: plain text, one line, at most NAME_MAX characters. */
export function cleanName(s) {
  const t = (typeof s === 'string' || typeof s === 'number' ? String(s) : '').replace(CTRL_G, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, NAME_MAX).join('').trim();
}
function titleCase(s) {
  const t = cleanName(String(s || '').replace(/[-_.+]+/g, ' '));
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}
function nameFromUrl(u) {
  try {
    const x = new URL(u);
    const seg = x.pathname.split('/').filter(Boolean).filter((p) => !/\.[a-z0-9]{2,5}$/i.test(p)).pop();
    if (seg) { let p = seg; try { p = decodeURIComponent(seg); } catch (_) { /* keep it encoded */ } const n = titleCase(p); if (n) return n; }
    const label = x.hostname.split('.').filter((p) => p && p !== 'www')[0];
    return titleCase(label || x.hostname);
  } catch (_) { return ''; }
}
function slug(name) {
  let s = String(name || '');
  try { s = s.normalize('NFKD'); } catch (_) { /* older engine: as it is */ }
  s = s.toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/g, '');
  return s || 'app';
}
function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10000; i++) if (!taken.has(base + '-' + i)) return base + '-' + i;
  return base + '-' + Date.now().toString(36);
}
// ids in use: the reserved ones and the registry's, plus (for new ids) every id an older Jarvis saved
function takenIds(st, withLegacy) {
  const t = new Set(RESERVED);
  for (const a of st.apps) t.add(a.id);
  if (withLegacy) {
    const ex = read(LEGACY_EXTRA);
    if (Array.isArray(ex)) for (const e of ex) if (e && typeof e.id === 'string') t.add(e.id);
  }
  return t;
}
const hostOf = (u) => { try { return new URL(u).host; } catch (_) { return ''; } };
const originOf = (u) => { try { return new URL(u).origin; } catch (_) { return ''; } };
/** True for a link on Jarvis's own origin outside our own pages (Zenith's root page, planner/, kalshi/, jarvis/): such a
 *  page shares Jarvis's localStorage and could read its saved keys. */
export function sameSiteRisk(u) {
  const me = here();
  let x, root;
  try { x = new URL(String(u || ''), me); root = new URL('../', me); } catch (_) { return false; }
  if (x.origin !== root.origin) return false;
  const p = x.pathname, r = root.pathname;
  if (p === r || p === r + 'index.html') return false;
  return !OWN_FOLDERS.some((f) => p === r + f.slice(0, -1) || p.indexOf(r + f) === 0);
}
const firstChar = (s) => (Array.from(String(s || '').trim())[0] || '?').toUpperCase();

// ------------------------------------------------------------------ the registry
function storedLinks(a, out, base) {
  const su = typeof a.statusUrl === 'string' && a.statusUrl ? cleanUrl(a.statusUrl, base) : '';
  if (su) out.statusUrl = su;
  const ic = typeof a.icon === 'string' && a.icon ? cleanUrl(a.icon, base) : '';
  if (ic) out.icon = ic;
  if (typeof a.legacy === 'string' && a.legacy.length < 5000) out.legacy = a.legacy;
  return out;
}
function storedApp(a) {
  if (!isObj(a)) return null;
  const id = typeof a.id === 'string' && ID_RE.test(a.id) && !RESERVED.has(a.id) ? a.id : '';
  const url = cleanUrl(a.url), name = cleanName(a.name);
  if (!id || !url || !name) return null;
  const out = storedLinks(a, { id, name, url, at: +a.at || 0 }, url);
  if (a.autoName === true) out.autoName = true;
  return out;
}
function storedSlot(s) {
  if (!isObj(s)) return null;
  const url = cleanUrl(s.url);
  return url ? storedLinks(s, { url, at: +s.at || 0 }, url) : null;
}
let newerKey = false;     // the registry was saved by a newer Jarvis: it is read, never overwritten (changes stay in this session)
function load() {
  const raw = read(KEY);
  const st = { apps: [], ascend: null, seen: [] };
  if (isObj(raw)) {
    if (typeof raw.v === 'number' && raw.v > 1) newerKey = true;
    const ids = new Set();
    for (const a of Array.isArray(raw.apps) ? raw.apps : []) { const c = storedApp(a); if (c && !ids.has(c.id)) { ids.add(c.id); st.apps.push(c); } }
    st.ascend = storedSlot(raw.ascend);
    st.seen = Array.isArray(raw.seen) ? raw.seen.filter((f) => typeof f === 'string' && f.length < 5000) : [];
  }
  if (importLegacy(st)) save(st);
  return st;
}
function save(st) { return write(KEY, { v: 1, apps: st.apps, ascend: st.ascend, seen: st.seen }, newerKey); }

// What an older Jarvis saved: each entry once (new ones an older copy adds later too); an entry that cannot be shown
// (no name, not a web link) is left in its key as it is. Ids are kept unless taken; "Ascend" fills the Ascend slot.
function importLegacy(st) {
  const ex = read(LEGACY_EXTRA), ln = read(LEGACY_LINKS);
  const seen = new Set(st.seen), live = new Set();
  let changed = false;
  const take = (fp, name, url, legacyId, ascendLike) => {
    live.add(fp);
    if (seen.has(fp)) return;
    seen.add(fp); changed = true;
    if (ascendLike && (!st.ascend || st.ascend.url === url)) { if (!st.ascend) st.ascend = { url, at: Date.now(), legacy: fp }; return; }
    const id = legacyId && ID_RE.test(legacyId) && !takenIds(st, false).has(legacyId) ? legacyId : uniqueId('x-' + slug(name), takenIds(st, true));
    st.apps.push({ id, name, url, at: Date.now(), legacy: fp });
  };
  if (Array.isArray(ex)) {
    for (const e of ex) {
      if (!isObj(e)) continue;
      const url = cleanUrl(e.url), name = cleanName(e.name);
      if (!url || !name) continue;
      const lid = typeof e.id === 'string' ? e.id : '';
      take(JSON.stringify(['e', lid, url]), name, url, lid, lid === ASCEND_ID || name.toLowerCase() === ASCEND_NAME.toLowerCase());
    }
  }
  if (isObj(ln)) {
    for (const k of Object.keys(ln)) {
      const url = cleanUrl(ln[k]);
      if (!url) continue;
      const b = BUILT_INS.find((x) => x.id === k);
      if (b && cleanUrl(b.url) === url) continue;               // the built-in's own link: nothing to keep
      take(JSON.stringify(['l', k, url]), k === ASCEND_ID ? ASCEND_NAME : b ? b.name + ' link' : titleCase(k) || 'App', url, '', k === ASCEND_ID);
    }
  }
  // fingerprints of entries no longer in the old keys are dropped: an older Jarvis adding one again is imported again
  const keep = Array.from(seen).filter((f) => live.has(f));
  if (keep.length !== st.seen.length) changed = true;
  st.seen = keep;
  return changed;
}
// adds and removals also go to jarvis.extra, as an older Jarvis writes it, so a saved older copy shows the same list
function mirrorAdd(st, id, name, url) {
  const raw = readRaw(LEGACY_EXTRA);
  let list = [];
  if (raw != null) { try { list = JSON.parse(raw); } catch (_) { return ''; } if (!Array.isArray(list)) return ''; }
  list.push({ id, name, url });
  write(LEGACY_EXTRA, list);
  const fp = JSON.stringify(['e', id, url]);
  st.seen.push(fp);
  return fp;
}
function mirrorRemove(fp) {
  let f = null;
  try { f = JSON.parse(fp || 'null'); } catch (_) { return; }
  if (!Array.isArray(f) || f.length !== 3) return;
  const kind = f[0], id = f[1], url = f[2];
  if (kind === 'e') {
    const ex = read(LEGACY_EXTRA);
    if (!Array.isArray(ex)) return;
    const out = ex.filter((e) => !(isObj(e) && (typeof e.id === 'string' ? e.id : '') === id && cleanUrl(e.url) === url));
    if (out.length !== ex.length) write(LEGACY_EXTRA, out);
  } else if (kind === 'l') {
    const ln = read(LEGACY_LINKS);
    if (!isObj(ln) || !own(ln, id) || cleanUrl(ln[id]) !== url) return;
    delete ln[id];
    write(LEGACY_LINKS, ln);
  }
}

// a built-in with a live card gets its folder's jarvis.json (read against this page, like its link)
function builtinView(b) {
  return Object.assign({}, b, { glyph: b.glyph || firstChar(b.name), statusUrl: b.live ? defaultStatusUrl(cleanUrl(b.url)) : '', builtin: true, extra: false, removable: false });
}
const warned = (v) => { if (sameSiteRisk(v.url)) v.warn = SAME_SITE_WARN; return v; };
function slotView(s) {
  return warned({ id: ASCEND_ID, name: ASCEND_NAME, sub: hostOf(s.url), url: s.url, icon: s.icon || '', glyph: 'A', statusUrl: s.statusUrl || defaultStatusUrl(s.url),
    group: 'life', builtin: false, extra: true, removable: true, slot: true, enabled: true });
}
function addedView(a) {
  const v = { id: a.id, name: a.name, sub: hostOf(a.url), url: a.url, icon: a.icon || '', glyph: firstChar(a.name), statusUrl: a.statusUrl || defaultStatusUrl(a.url),
    group: 'more', builtin: false, extra: true, removable: true };
  if (a.autoName) v.autoName = true;
  return warned(v);
}
// an add's result carries the app's warning (a link on Jarvis's own site outside our pages)
const added = (app, existed) => { const r = { ok: true, app }; if (existed) r.existed = true; if (app.warn) r.warn = app.warn; return r; };
/** The dashboards in switch order: by group (GROUPS: trading, life, money, then the ones added with +), each group in
 *  BUILT_INS order, Ascend in LIFE once enabled. {hidden: true} also lists the Ascend slot while it is not enabled. */
export function listApps(opts) {
  const st = load();
  const out = BUILT_INS.map(builtinView);
  const own = new Set(out.map((b) => cleanUrl(b.url)));
  if (st.ascend) out.push(slotView(st.ascend));
  else if (opts && opts.hidden) out.push({ id: ASCEND_ID, name: ASCEND_NAME, sub: 'Paste its link once to add it', url: '', icon: '', glyph: 'A', statusUrl: '',
    group: 'life', builtin: false, extra: true, removable: false, slot: true, enabled: false, hidden: true });
  for (const a of st.apps) if (!own.has(a.url)) out.push(addedView(a));    // one added by hand before it was built in: once
  return out.map((a, i) => [groupRank(a.group), i, a]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]);
}
export function getApp(id) { return listApps({ hidden: true }).find((a) => a.id === id) || null; }

const fail = (field, error) => ({ ok: false, field, error });
function extraLinks(o, url) {
  const r = { ok: true, statusUrl: '', icon: '' };
  if (!absent(o.statusUrl) && o.statusUrl !== '') { r.statusUrl = cleanUrl(String(o.statusUrl), url); if (!r.statusUrl) return fail('statusUrl', 'The status link must start with https://'); }
  if (!absent(o.icon) && o.icon !== '') { r.icon = cleanUrl(String(o.icon), url); if (!r.icon) return fail('icon', 'The icon link must start with https://'); }
  return r;
}
/** Add a dashboard: {name, url, statusUrl?, icon?}. The same link twice returns the one already there (existed: true). */
export function addApp(input) {
  const o = isObj(input) ? input : {};
  const url = userUrl(o.url);
  if (!url) return fail('url', 'Paste a full link that starts with https://');
  let name = cleanName(o.name), autoName = false;
  if (!name) { name = nameFromUrl(url); autoName = true; }
  if (!name) return fail('name', 'Give it a name.');
  const more = extraLinks(o, url);
  if (!more.ok) return more;
  if (name.toLowerCase() === ASCEND_NAME.toLowerCase()) return enableAscend(url, more);
  const st = load();
  const b = BUILT_INS.find((x) => cleanUrl(x.url) === url);
  if (b) return added(builtinView(b), true);
  if (st.ascend && st.ascend.url === url) return added(slotView(st.ascend), true);
  const dup = st.apps.find((a) => a.url === url);
  if (dup) return added(addedView(dup), true);
  const id = uniqueId('x-' + slug(name), takenIds(st, true));
  const app = { id, name, url, at: Date.now() };
  if (more.statusUrl) app.statusUrl = more.statusUrl;
  if (more.icon) app.icon = more.icon;
  if (autoName) app.autoName = true;
  app.legacy = mirrorAdd(st, id, name, url);
  st.apps.push(app);
  save(st);
  return added(addedView(app));
}
/** Remove an added dashboard or hide Ascend again (its card goes too). The built-ins cannot be removed: false. */
export function removeApp(id) {
  const k = isObj(id) ? id.id : id;
  if (typeof k !== 'string' || !k) return false;
  const st = load();
  if (k === ASCEND_ID) {
    if (!st.ascend) return false;
    mirrorRemove(st.ascend.legacy);
    st.ascend = null;
  } else {
    const i = st.apps.findIndex((a) => a.id === k);
    if (i < 0) return false;
    mirrorRemove(st.apps[i].legacy);
    st.apps.splice(i, 1);
  }
  save(st);
  dropCard(k);
  lastErr.delete(k);
  return true;
}

// ------------------------------------------------------------------ the Ascend slot
export function ascendSlot() {
  const st = load();
  return { id: ASCEND_ID, name: ASCEND_NAME, enabled: !!st.ascend, url: st.ascend ? st.ascend.url : '', known: userUrl(ASCEND_URL) };
}
/** Show Ascend in Jarvis with this link (a new link replaces the old one). */
export function enableAscend(url, more) {
  const u = userUrl(url);
  if (!u) return fail('url', 'Paste your Ascend link (it starts with https://)');
  const ex = extraLinks(isObj(more) ? more : {}, u);
  if (!ex.ok) return ex;
  const st = load();
  const prev = st.ascend;
  if (prev && prev.url === u && !ex.statusUrl && !ex.icon) return added(slotView(prev), true);
  const s = { url: u, at: Date.now() };
  if (ex.statusUrl) s.statusUrl = ex.statusUrl;
  if (ex.icon) s.icon = ex.icon;
  if (prev) mirrorRemove(prev.legacy);
  s.legacy = mirrorAdd(st, uniqueId('x-ascend', takenIds(st, true)), ASCEND_NAME, u);
  st.ascend = s;
  save(st);
  if (prev) dropCard(ASCEND_ID);
  return added(slotView(s));
}
/** The one-tap "Add Ascend": adds Ascend from its known link (ASCEND_URL; opts.url in tests). Nothing is guessed: with no
 *  known link, or one on Jarvis's own site, it returns {ok: false, field: 'url', error} and the shell asks for the link. */
export async function findAscend(opts) {
  const o = opts || {};
  const u = userUrl(typeof o.url === 'string' ? o.url : ASCEND_URL);
  if (!u) return fail('url', 'Paste your Ascend link.');
  if (sameSiteRisk(u)) return Object.assign(fail('url', 'Ascend has to be on its own site. Paste its link.'), { warn: SAME_SITE_WARN });
  return enableAscend(u);
}

// ------------------------------------------------------------------ the status contract
const bad = (error) => ({ ok: false, error });
function utf8(s) { try { return new TextEncoder().encode(s).length; } catch (_) { return s.length * 3; } }
function txt(v, field, max) {
  if (typeof v !== 'string') return { error: field + ' must be text' };
  const s = v.trim();
  if (!s) return { error: field + ' is empty' };
  if (CTRL_RE.test(s)) return { error: field + ' has control characters' };
  if (HTML_RE.test(s)) return { error: field + ' has HTML: send plain text only' };
  if (Array.from(s).length > max) return { error: field + ' is longer than ' + max + ' characters' };
  return { value: s };
}
const fmtNum = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
function val(v, field, max, signed) {
  let s;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { error: field + ' must be a real number' };
    s = (signed && v > 0 ? '+' : '') + fmtNum(v);
    if (Array.from(s).length > max) return { error: field + ' is longer than ' + max + ' characters' };
  } else if (typeof v === 'string') {
    const t = txt(v, field, max);
    if (t.error) return t;
    s = t.value;
  } else return { error: field + ' must be text or a number' };
  const r = { value: s };
  if (signed) r.trend = typeof v === 'number' ? (v > 0 ? 'up' : v < 0 ? 'down' : 'flat') : /^[+\u25b2\u2191]/.test(s) ? 'up' : /^[-\u2212\u2013\u25bc\u2193]/.test(s) ? 'down' : 'flat';
  return r;
}
/** Check a status JSON (text or parsed) against the contract. opts: {now (ms), base (the app's link, for `open`)}.
 *  -> {ok: true, card} with only the contract's fields, values as display text; or {ok: false, error} naming the field. */
export function validateStatus(input, opts) {
  const o = opts || {};
  const nowS = (Number.isFinite(o.now) ? o.now : Date.now()) / 1000;
  let j = input;
  if (typeof input === 'string') {
    if (utf8(input) > LIMITS.bytes) return bad('too big: jarvis.json must be 8 KB or less');
    try { j = JSON.parse(input); } catch (_) { return bad('not valid JSON'); }
  } else {
    let s;
    try { s = JSON.stringify(input); } catch (_) { return bad('not valid JSON'); }
    if (typeof s !== 'string') return bad('not a JSON object');
    if (utf8(s) > LIMITS.bytes) return bad('too big: jarvis.json must be 8 KB or less');
  }
  if (!isObj(j)) return bad('not a JSON object');
  if (j.v !== 1) return bad('v must be 1');
  const name = txt(j.name, 'name', LIMITS.name);
  if (name.error) return bad(name.error);
  if (!isObj(j.status)) return bad('status is missing');
  if (LEVELS.indexOf(j.status.level) < 0) return bad('status.level must be "ok", "warn", "bad" or "off"');
  const label = txt(j.status.label, 'status.label', LIMITS.label);
  if (label.error) return bad(label.error);
  if (typeof j.t !== 'number' || !Number.isFinite(j.t)) return bad('t is missing: unix seconds when the file was written');
  if (j.t <= 0 || j.t > 1e11) return bad('t must be unix seconds (not milliseconds)');
  if (j.t > nowS + LIMITS.futureS) return bad('t is in the future');
  const kpis = [];
  if (!absent(j.kpis)) {
    if (!Array.isArray(j.kpis)) return bad('kpis must be a list');
    if (j.kpis.length > LIMITS.kpis) return bad('kpis: at most ' + LIMITS.kpis);
    for (let i = 0; i < j.kpis.length; i++) {
      const k = j.kpis[i], f = 'kpis[' + i + ']';
      if (!isObj(k)) return bad(f + ' must be {label, value, delta?}');
      const l = txt(k.label, f + '.label', LIMITS.kpiLabel);
      if (l.error) return bad(l.error);
      const v = val(k.value, f + '.value', LIMITS.kpiValue, false);
      if (v.error) return bad(v.error);
      const out = { label: l.value, value: v.value };
      if (!absent(k.delta)) {
        const d = val(k.delta, f + '.delta', LIMITS.kpiDelta, true);
        if (d.error) return bad(d.error);
        out.delta = d.value; out.trend = d.trend;
      }
      kpis.push(out);
    }
  }
  const lines = [];
  if (!absent(j.lines)) {
    if (!Array.isArray(j.lines)) return bad('lines must be a list of text');
    if (j.lines.length > LIMITS.lines) return bad('lines: at most ' + LIMITS.lines);
    for (let i = 0; i < j.lines.length; i++) {
      const l = txt(j.lines[i], 'lines[' + i + ']', LIMITS.line);
      if (l.error) return bad(l.error);
      lines.push(l.value);
    }
  }
  const card = { v: 1, name: name.value, status: { level: j.status.level, label: label.value }, kpis, lines, t: j.t };
  // theme (optional, 2026-11-02): the app's own colour, "#rrggbb", shown behind the iPhone's status bar while it is open
  // (Jarvis cannot read another site's page, so the app says it here)
  // stale_after (optional, 2026-11-03): how long the card stays current, in seconds (60 s to 14 days; default 30 min).
  // Apps refreshed nightly / weekly (CRONOS) say so, so Jarvis does not grey them between site publishes.
  if (!absent(j.stale_after)) {
    if (typeof j.stale_after !== 'number' || !Number.isFinite(j.stale_after) || j.stale_after < 60 || j.stale_after > 14 * 86400) return bad('stale_after must be seconds, 60 to 1209600');
    card.stale_after = Math.round(j.stale_after);
  }
  if (!absent(j.theme) && j.theme !== '') {
    if (typeof j.theme !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(j.theme.trim())) return bad('theme must be a colour like "#0b0b0d"');
    card.theme = j.theme.trim().toLowerCase();
  }
  if (!absent(j.open) && j.open !== '') {
    if (typeof j.open !== 'string' || !j.open.trim() || j.open.length > LIMITS.open || CTRL_RE.test(j.open)) return bad('open must be a short route inside the app, like "#today"');
    const route = j.open.trim();
    const base = typeof o.base === 'string' ? cleanUrl(o.base) : '';
    if (base) {
      const u = cleanUrl(route, base);
      if (!u || originOf(u) !== originOf(base)) return bad('open must stay inside the app (same site)');
      card.openUrl = u;
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(route) || /^[/\\]{2}/.test(route)) return bad('open must be a route inside the app, like "#today"');
    card.open = route;
  }
  return { ok: true, card };
}

// ------------------------------------------------------------------ fetching cards (5 s, 8 KB, last good card kept)
/** The status link: the app's statusUrl, else jarvis.json in the app's folder (a live built-in's too); '' for Zenith, the
 *  Planner and Kalshi (the shell draws their cards). */
export function statusUrlOf(app) {
  const a = typeof app === 'string' ? getApp(app) : app;
  if (!isObj(a)) return '';
  const base = cleanUrl(typeof a.url === 'string' ? a.url : '');
  if (typeof a.statusUrl === 'string' && a.statusUrl) return cleanUrl(a.statusUrl, base || undefined);
  const b = BUILT_INS.find((x) => x.id === a.id);
  if (a.builtin || b) return b && b.live ? builtinView(b).statusUrl : '';       // Zenith, the Planner, Kalshi: their own cards
  return defaultStatusUrl(base);
}
// the app's folder: no ?query or #route, no file name (".../ascend/index.html" and ".../ascend" are ".../ascend/")
function folderOf(u) {
  const x = new URL(u);
  x.search = ''; x.hash = '';
  if (!x.pathname.endsWith('/')) {
    const last = x.pathname.split('/').pop();
    x.pathname = /\.[a-z0-9]{1,8}$/i.test(last) ? x.pathname.slice(0, x.pathname.length - last.length) : x.pathname + '/';
  }
  return x.href;
}
function defaultStatusUrl(url) {
  const u = cleanUrl(String(url || ''));
  return u ? new URL('jarvis.json', folderOf(u)).href : '';
}
// a minute-wide cache buster (GitHub Pages' CDN keeps files up to 10 minutes); a link with its own ?query is left as it is
const bust = (u) => (u && u.indexOf('?') < 0 ? u + '?jt=' + Math.floor(Date.now() / 60000) : u);
const fetchFn = (o) => (o && typeof o.fetch === 'function' ? o.fetch : typeof fetch === 'function' ? fetch : null);
const waitMs = (o) => (o && Number.isFinite(o.timeoutMs) && o.timeoutMs > 0 ? o.timeoutMs : TIMEOUT_MS);
const nowMs = (o) => (o && Number.isFinite(o.now) ? o.now : Date.now());
function timed(run, o) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = 0;
  const limit = new Promise((_, no) => {
    timer = setTimeout(() => { if (ctl) { try { ctl.abort(); } catch (_) { /* gone */ } } no(new Error('timeout')); }, waitMs(o));
  });
  return Promise.race([run(ctl ? ctl.signal : undefined), limit]).finally(() => clearTimeout(timer));
}
function getText(url, o) {
  const f = fetchFn(o);
  if (!f) return Promise.reject(new Error('no fetch'));
  return timed(async (signal) => {
    const r = await f(url, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
    if (!r || !r.ok) throw new Error('http ' + (r ? r.status : 'error'));
    const len = Number(r.headers && r.headers.get ? r.headers.get('content-length') : NaN);
    if (len > LIMITS.bytes) throw new Error('too big: over 8 KB');
    if (r.body && typeof r.body.getReader === 'function' && typeof TextDecoder === 'function') {
      const rd = r.body.getReader(), dec = new TextDecoder('utf-8');
      let n = 0, out = '';
      for (;;) {
        const step = await rd.read();
        if (step.done) break;
        n += step.value.byteLength;
        if (n > LIMITS.bytes) { try { rd.cancel().catch(() => null); } catch (_) { /* stopped */ } throw new Error('too big: over 8 KB'); }
        out += dec.decode(step.value, { stream: true });
      }
      return out + dec.decode();
    }
    const t = await r.text();
    if (utf8(t) > LIMITS.bytes) throw new Error('too big: over 8 KB');
    return t;
  }, o);
}

const inflight = new Map();
const lastErr = new Map();
function finish(card, a, at, cached) {
  const nowS = at / 1000;
  return Object.assign({}, card, { app: a.id, appName: a.name || card.name, sub: a.sub || hostOf(a.url), url: a.url || '', icon: a.icon || '', glyph: a.glyph || firstChar(a.name || card.name),
    age: Math.max(0, Math.round(nowS - card.t)), stale: nowS - card.t > (card.stale_after || STALE_AFTER_S), cached });
}
function cards() { const m = read(CARDS_KEY); return isObj(m) ? m : {}; }
function storedCard(a, url) {
  const m = cards();
  if (!own(m, a.id) || !isObj(m[a.id]) || m[a.id].url !== url) return null;
  const r = validateStatus(m[a.id].card, { base: a.url, now: Date.now() + 864e5 * 365 });   // what was kept is checked again
  return r.ok ? r.card : null;
}
// keep the newest good card per app (a pushed card is not replaced by an older static file), only for apps still here
function remember(a, url, card) {
  const m = cards();
  const old = own(m, a.id) && isObj(m[a.id]) && m[a.id].url === url && isObj(m[a.id].card) ? m[a.id].card : null;
  if (old && Number(old.t) > card.t) return false;
  if (old && JSON.stringify(old) === JSON.stringify(card)) return true;      // the same card again (an app posting often)
  const ids = new Set(listApps().map((x) => x.id));
  if (!ids.has(a.id)) return true;                    // not (or no longer) in the list, e.g. removed while it was fetched
  m[a.id] = { url, at: Date.now(), card };
  for (const k of Object.keys(m)) if (!ids.has(k)) delete m[k];
  write(CARDS_KEY, m);
  return true;
}
function dropCard(id) { const m = cards(); if (own(m, id)) { delete m[id]; write(CARDS_KEY, m); } }
function appOf(app) {
  const a = typeof app === 'string' ? getApp(app) : app;
  return isObj(a) && typeof a.id === 'string' && ID_RE.test(a.id) ? a : null;
}
/** The last good card, at once (cached: true, stale when its t is over 30 minutes old), or null. */
export function cachedStatus(app, opts) {
  const a = appOf(app), url = a ? statusUrlOf(a) : '';
  if (!url) return null;
  const c = storedCard(a, url);
  return c ? finish(c, a, nowMs(opts), true) : null;
}
export function statusError(app) { const id = isObj(app) ? app.id : app; return lastErr.get(id) || ''; }
/** True when a built-in's folder is not on the site (yet): its jarvis.json answered 404 and no good card was ever seen.
 *  The shell shows it as "not on the site yet" and does not open it (a 404 page inside Jarvis would be a white screen). */
export function missing(app) {
  const a = appOf(app);
  return !!a && !!a.builtin && lastErr.get(a.id) === 'http 404' && !cachedStatus(a);
}
// a name made from the link gives way to the app's own name the first time its card arrives
function adoptName(a, card) {
  if (!a.autoName) return;
  const st = load(), x = st.apps.find((y) => y.id === a.id), n = cleanName(card.name);
  if (!x || !x.autoName || !n) return;
  x.name = n;
  delete x.autoName;
  save(st);
}
// Mnemosyne keeps a newer card of its own on this phone ('journal.card.v1', same site, like the Inbox's): "you interfered on 3 of your last 9 trades". Checked like any card.
function ownCard(a, card) {
  try { const c = read('journal.card.v1'), r = isObj(c) ? validateStatus(c, { base: a.url }) : null; return r && r.ok && r.card.t >= card.t ? r.card : card; } catch (_) { return card; }
}
/** The app's live card: fetches its status link (opts: timeoutMs, fetch, now). Never throws. On any failure (timeout,
 *  no answer, not allowed by CORS, over 8 KB, not the contract) it returns the last good card (cached: true) or null. */
export function appStatus(app, opts) {
  const a = appOf(app), url = a ? statusUrlOf(a) : '';
  if (!url) return Promise.resolve(null);
  const k = a.id + ' ' + url;
  if (inflight.has(k)) return inflight.get(k);
  const p = (async () => {
    let err = '';
    try {
      const r = validateStatus(await getText(bust(url), opts), { now: nowMs(opts), base: a.url });
      if (r.ok) {
        lastErr.delete(a.id);
        if (a.id === 'journal') r.card = ownCard(a, r.card);
        if (remember(a, url, r.card)) { adoptName(a, r.card); return finish(r.card, a, nowMs(opts), false); }
        return cachedStatus(a, opts);                         // a newer card was pushed meanwhile
      }
      err = r.error;
    } catch (e) { err = (e && e.message) || 'failed'; }
    lastErr.set(a.id, err);
    return cachedStatus(a, opts);
  })().catch(() => null).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

// ------------------------------------------------------------------ cards an app posts while it is open inside Jarvis
// For an app without a server: window.parent.postMessage({jarvis: 1, href: location.href, card: {...the contract...}},
// '<Jarvis's site>'). The sender is matched to an added app by its address (read from the frame on the same site, else
// the href it sends, which must be on the site that sent it); the card is checked like jarvis.json.
/** Take one message event. -> the card (kept as the app's last good card) or null. */
export function acceptMessage(e) {
  const data = e && e.data;
  if (!isObj(data) || data.jarvis !== 1 || !isObj(data.card)) return null;
  const origin = String((e && e.origin) || '');
  let href = '';
  try { href = String((e.source && e.source.location && e.source.location.href) || ''); } catch (_) { href = ''; }   // another site: not readable
  if (!href && typeof data.href === 'string') href = data.href;
  if (href && originOf(href) !== origin) return null;
  const apps = listApps().filter((x) => !x.builtin && x.url && originOf(x.url) === origin);
  const page = href.split(/[?#]/)[0] + '/';
  let a = null;
  if (href) for (const x of apps) if (page.indexOf(folderOf(x.url)) === 0 && (!a || folderOf(x.url).length > folderOf(a.url).length)) a = x;
  if (!a && !href && apps.length === 1) a = apps[0];
  if (!a) return null;
  const r = validateStatus(data.card, { base: a.url });
  if (!r.ok) { lastErr.set(a.id, r.error); return null; }
  remember(a, statusUrlOf(a), r.card);
  return cachedStatus(a);
}
/** Listen for posted cards on `target` (the Jarvis window); onCard(card) after each good one. Returns stop(). */
export function listen(target, onCard) {
  const t = target || (typeof window !== 'undefined' ? window : null);
  if (!t || typeof t.addEventListener !== 'function') return () => {};
  const fromFrame = (src) => {                   // only a page in one of Jarvis's own frames may post a card (security review)
    try { const fs = (t.document || document).querySelectorAll('iframe'); for (let i = 0; i < fs.length; i++) if (fs[i].contentWindow === src) return true; } catch (_) { /* no DOM */ }
    return false;
  };
  const h = (e) => { if (!e || !fromFrame(e.source)) return; const c = acceptMessage(e); if (c && typeof onCard === 'function') { try { onCard(c); } catch (_) { /* the shell's problem */ } } };
  t.addEventListener('message', h);
  return () => t.removeEventListener('message', h);
}

// ------------------------------------------------------------------ the card on the Jarvis screen
export const CARD_CSS = [
  '.jx-card { text-align: left; }',
  '.jx-card .kv.jx-n1 { grid-template-columns: minmax(0, 1fr); }',
  '.jx-card .kv.jx-n2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
  '.jx-card .jx-delta { display: block; margin-top: 1px; font-style: normal; font-size: 11.5px; color: var(--mut, #9a8f7d); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  '.jx-card .jx-delta.up { color: var(--ok, #7f8a52); }',
  '.jx-card .jx-delta.down { color: var(--bad, #c96a4a); }',
  '.jx-card .list li span { white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }',
  '.jx-card.jx-stale { opacity: .82; }',
  '.jx-card.jx-stale .pill { color: var(--warn, #e0b060); }',
].join('\n');
function addCss(d) {
  try {
    if (d.getElementById('jx-apps-css')) return;
    const s = d.createElement('style');
    s.id = 'jx-apps-css';
    s.textContent = CARD_CSS;
    (d.head || d.documentElement).appendChild(s);
  } catch (_) { /* the card works unstyled */ }
}
const clip = (v, max) => Array.from((typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(CTRL_G, ' ').trim()).slice(0, max).join('');
function el(d, tag, cls, text) {
  const x = d.createElement(tag);
  if (cls) x.className = cls;
  if (text != null && text !== '') x.textContent = text;
  return x;
}
const ago = (s) => (s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago');
const span = (s) => (s < 3600 ? Math.max(1, Math.round(s / 60)) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d');
function glyph(d, ch) {
  const NS = 'http://www.w3.org/2000/svg', s = d.createElementNS(NS, 'svg');
  const attrs = (x, o) => { for (const k of Object.keys(o)) x.setAttribute(k, o[k]); return x; };
  attrs(s, { class: 'glyph', viewBox: '0 0 40 40', width: '40', height: '40', 'aria-hidden': 'true', focusable: 'false' });
  const t = attrs(d.createElementNS(NS, 'text'), { x: '20', y: '26.5', 'text-anchor': 'middle', 'font-family': '-apple-system, system-ui, sans-serif', 'font-size': '18', 'font-weight': '700', fill: '#c4c5ca' });
  t.textContent = firstChar(ch);
  s.append(attrs(d.createElementNS(NS, 'rect'), { width: '40', height: '40', rx: '10', fill: '#1d1d21' }), t, attrs(d.createElementNS(NS, 'circle'), { cx: '30.5', cy: '10', r: '2.6', fill: '#fff' }));
  return s;
}
/** The card as an element: a <button data-app="id"> (data-open = the card's route, when it has one) when the card belongs
 *  to an app, else an <article>. Every text goes in as text (never HTML); the aria-label reads the whole card. */
export function renderCard(card, doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.createElement !== 'function') throw new TypeError('renderCard(card, document) needs a document');
  addCss(d);
  const c = isObj(card) ? card : {};
  const st = isObj(c.status) ? c.status : {};
  const level = LEVELS.indexOf(st.level) >= 0 ? st.level : 'off';
  const id = typeof c.app === 'string' && ID_RE.test(c.app) ? c.app : '';
  const name = clip(c.name || c.appName, LIMITS.name) || 'App';
  const label = clip(st.label, LIMITS.label) || LEVEL_WORD[level];
  const t = Number(c.t);
  const age = Number.isFinite(c.age) ? Math.max(0, c.age) : Number.isFinite(t) && t > 0 ? Math.max(0, Date.now() / 1000 - t) : null;
  const stale = c.stale === true || (age != null && age > (Number(c.stale_after) > 0 ? Number(c.stale_after) : STALE_AFTER_S));
  const root = el(d, id ? 'button' : 'article', 'card jx-card jx-' + level + (stale ? ' jx-stale' : ''));
  if (id) {
    root.type = 'button';
    root.setAttribute('data-app', id);
    const open = typeof c.openUrl === 'string' ? cleanUrl(c.openUrl) : '';
    if (open) root.setAttribute('data-open', open);
  }
  root.setAttribute('data-level', level);

  const head = el(d, 'div', 'card-h');
  const iconUrl = typeof c.icon === 'string' && c.icon ? cleanUrl(c.icon) : '';
  const fallback = c.glyph || c.appName || name;
  if (iconUrl) {
    const img = d.createElement('img');
    img.alt = ''; img.width = 40; img.height = 40; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { if (img.parentNode) img.parentNode.replaceChild(glyph(d, fallback), img); });
    img.src = iconUrl;
    head.appendChild(img);
  } else head.appendChild(glyph(d, fallback));
  const titles = el(d, 'div');
  titles.appendChild(el(d, 'b', '', name));
  const sub = clip(c.sub, 80);
  if (sub) titles.appendChild(el(d, 'small', '', sub));
  head.appendChild(titles);
  if (id) { const go = el(d, 'span', 'go', '\u203a'); go.setAttribute('aria-hidden', 'true'); head.appendChild(go); }
  root.appendChild(head);

  const when = age == null ? '' : ago(age);
  root.appendChild(el(d, 'span', stale || level === 'off' ? 'pill' : 'pill ' + level,
    stale ? label + ' \u00b7 not updated for ' + span(age) : label + (when ? ' \u00b7 ' + when : '')));
  const kpis = (Array.isArray(c.kpis) ? c.kpis : []).filter(isObj).slice(0, LIMITS.kpis);
  if (kpis.length) {
    const kv = el(d, 'div', 'kv jx-n' + kpis.length);
    for (const k of kpis) {
      const cell = el(d, 'div');
      cell.append(el(d, 'span', '', clip(k.label, LIMITS.kpiLabel)), el(d, 'strong', '', clip(k.value, LIMITS.kpiValue)));
      const delta = clip(k.delta, LIMITS.kpiDelta);
      if (delta) cell.appendChild(el(d, 'em', 'jx-delta ' + (k.trend === 'up' || k.trend === 'down' ? k.trend : 'flat'), delta));
      kv.appendChild(cell);
    }
    root.appendChild(kv);
  }
  const lines = (Array.isArray(c.lines) ? c.lines : []).map((l) => clip(l, LIMITS.line)).filter(Boolean).slice(0, LIMITS.lines);
  if (lines.length) {
    const ul = el(d, 'ul', 'list');
    for (const l of lines) { const li = el(d, 'li'); li.appendChild(el(d, 'span', '', l)); ul.appendChild(li); }
    root.appendChild(ul);
  }
  const say = [name + '.', stale ? 'Not updated for ' + span(age) + '. Last status ' + LEVEL_WORD[level] + ': ' + label + '.'
    : LEVEL_WORD[level] + ': ' + label + (when ? ', updated ' + when : '') + '.'];
  for (const k of kpis) { const delta = clip(k.delta, LIMITS.kpiDelta); say.push(clip(k.label, LIMITS.kpiLabel) + ' ' + clip(k.value, LIMITS.kpiValue) + (delta ? ' (' + delta + ')' : '') + '.'); }
  for (const l of lines) say.push(/[.!?]$/.test(l) ? l : l + '.');
  if (id) say.push('Opens ' + (clip(c.appName, LIMITS.name) || name) + '.');
  root.setAttribute('aria-label', say.join(' '));
  return root;
}
