// OLYMPUS SETTINGS, the pure part (tools/web_public/settings/settingscore.js, 2026-11-04): which phone keys belong to which app,
// which are secrets (NEVER shown, exported, imported or cleared), the export / import of the rest, the status of Jarvis's own settings
// and the six cards of the first-run tour. No DOM: it runs in node (tests/test_settings_page.py) and on the phone (settings.js).
// A "storage" is anything with getItem / setItem / removeItem / key(i) / length (localStorage).

// the keys that hold a secret: Jarvis's brain keys (Groq, Gemini, OpenRouter, Anthropic) and the GitHub token for the Obsidian vault.
export const SECRET_KEYS = ['jarvis.smart', 'jarvis.vault'];
// anything else that is named like a secret is treated as one too (a future key never leaks by accident)
export const SECRET_RX = /(token|secret|password|passwd|apikey|api[_-]?key|credential|bearer)/i;
export const isSecret = (k) => SECRET_KEYS.indexOf(String(k)) >= 0 || SECRET_RX.test(String(k));

export const APP_NAMES = {
  olympus: 'Olympus (look, sounds, tour)', oly: 'Olympus (look, sounds, tour)', jfx: 'Olympus (look, sounds, tour)', jarvis: 'Jarvis', mind: 'Mind', arena: 'Arena', forum: 'Forum', labyrinth: 'Labyrinth',
  kalshi: 'Kalshi', zenith: 'Zenith', argus: 'Argus', pantheon: 'Pantheon', hermes: 'Hermes', tyche: 'Tyche', fates: 'Fates', odeon: 'Odeon', oracle: 'Oracle',
  prometheus: 'Prometheus', datacity: 'Data City', tree: 'Daphne', plutus: 'Plutus', athena: 'Athena', ares: 'Ares', cities: 'Cities', bridge: 'Bridge', nemesis: 'Nemesis', settings: 'Settings',
};
APP_NAMES.kalshicity = 'Kalshi City'; APP_NAMES.ledger = 'Ledger'; APP_NAMES.cronos = 'Cronos'; APP_NAMES.themes = 'Olympus (look, sounds, tour)';
/** what an app keeps on the phone, in plain words (what the owner sees under the app's name in the storage list) */
export const APP_ABOUT = {
  olympus: 'Your look, text size, sound, quality and tour choices', jarvis: 'Your voice, mode, alerts and chat choices (keys are never listed)', mind: 'Your notes and what you last looked at',
  arena: 'Your saved choices in the Arena', forum: 'Your forum choices and drafts', labyrinth: 'Where you were in the maze', kalshi: 'Your view choices for the Kalshi bot', kalshicity: 'Your sound choice and the dollars you last saw, so the city can show what grew',
  zenith: 'Your tab and view choices', argus: 'Your health-check view choices', pantheon: 'Your view choices', hermes: 'Your week view choices', tyche: 'Your view choices', fates: 'Your view choices', odeon: 'Your replay choices',
  oracle: 'Your view choices', prometheus: 'Your view choices', datacity: 'Your camera and view choices', tree: 'Your view choices', plutus: 'Your view choices', athena: 'Your view choices', ares: 'Your view choices',
  cities: 'Your city choices', bridge: 'Your connection choices', nemesis: 'Your view choices', settings: 'Your last tab', ledger: 'Every entry you typed: your money record lives only here, so export it before you clear it',
};
export const aboutOf = (id) => APP_ABOUT[id] || 'Choices this app saved on this phone';
const MERGE = { oly: 'olympus', jfx: 'olympus' };            // 'jfx', 'oly.intro', 'olympus.theme' ... are one group
export function groupOf(key) {
  const k = String(key), m = /^[A-Za-z0-9]+/.exec(k), p = (m ? m[0] : 'other').toLowerCase();
  const id = MERGE[p] || p;
  return { id, name: APP_NAMES[id] || (id.charAt(0).toUpperCase() + id.slice(1)) };
}

export function listKeys(st) {
  const out = [];
  try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k != null) out.push(k); } } catch (_) { /* no storage */ }
  return out.sort();
}
const sizeOf = (st, k) => { try { return (k.length + String(st.getItem(k) == null ? '' : st.getItem(k)).length) * 2; } catch (_) { return 0; } };   // UTF-16 bytes

/** { total: { keys, bytes, kept }, groups: [{ id, name, keys: [name], count, bytes, kept: [name] }] }, biggest first; secrets are only NAMED in kept, never read */
export function summarize(st) {
  const map = new Map();
  let keys = 0, bytes = 0, kept = 0;
  for (const k of listKeys(st)) {
    const g = groupOf(k);
    let e = map.get(g.id);
    if (!e) { e = { id: g.id, name: g.name, keys: [], count: 0, bytes: 0, kept: [] }; map.set(g.id, e); }
    if (isSecret(k)) { e.kept.push(k); kept++; continue; }          // not even its size is read
    const b = sizeOf(st, k);
    e.keys.push(k); e.count++; e.bytes += b; keys++; bytes += b;
  }
  const groups = Array.from(map.values()).sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  return { total: { keys, bytes, kept }, groups };
}

/** clear one app's saved data: every key of the group except the secrets -> { removed: [names], kept: [names] } */
export function clearApp(st, id) {
  const removed = [], kept = [];
  for (const k of listKeys(st)) {
    if (groupOf(k).id !== id) continue;
    if (isSecret(k)) { kept.push(k); continue; }
    try { st.removeItem(k); removed.push(k); } catch (_) { /* not removable */ }
  }
  return { removed, kept };
}

/** clear everything this site saved on the phone except the secrets (the keys stay) -> { removed: [names], kept: [names] } */
export function clearAll(st) {
  const removed = [], kept = [];
  for (const k of listKeys(st)) {
    if (isSecret(k)) { kept.push(k); continue; }
    try { st.removeItem(k); removed.push(k); } catch (_) { /* not removable */ }
  }
  return { removed, kept };
}

/** the JSON the Export button saves: every non-secret key as text. { v, kind, t, keys: { name: text }, kept: [secret names left out] } */
export function buildExport(st, now) {
  const keys = {}, kept = [];
  for (const k of listKeys(st)) {
    if (isSecret(k)) { kept.push(k); continue; }
    let v = null;
    try { v = st.getItem(k); } catch (_) { v = null; }
    if (typeof v === 'string') keys[k] = v;
  }
  return { v: 1, kind: 'olympus-data', t: Math.round((now == null ? Date.now() : now) / 1000), keys, kept };
}
const NAME_RX = /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/, MAX_VALUE = 400000, MAX_KEYS = 600;
/** check an export file BEFORE writing: { ok, reason?, count, skipped: [{ key, why }], accept: [name] } */
export function checkImport(obj) {
  if (!obj || typeof obj !== 'object' || obj.kind !== 'olympus-data' || !obj.keys || typeof obj.keys !== 'object' || Array.isArray(obj.keys)) {
    return { ok: false, reason: 'This is not an Olympus export file.', count: 0, skipped: [], accept: [] };
  }
  const names = Object.keys(obj.keys), skipped = [], accept = [];
  if (names.length > MAX_KEYS) return { ok: false, reason: 'This file has too many entries.', count: 0, skipped: [], accept: [] };
  for (const k of names) {
    const v = obj.keys[k];
    if (isSecret(k)) skipped.push({ key: k, why: 'secret: never imported' });
    else if (!NAME_RX.test(k)) skipped.push({ key: k, why: 'odd name' });
    else if (typeof v !== 'string' || v.length > MAX_VALUE) skipped.push({ key: k, why: 'not text, or too big' });
    else accept.push(k);
  }
  return { ok: true, count: accept.length, skipped, accept };
}
export function applyImport(st, obj) {
  const c = checkImport(obj), written = [];
  if (!c.ok) return Object.assign({ written }, c);
  for (const k of c.accept) { try { st.setItem(k, obj.keys[k]); written.push(k); } catch (_) { c.skipped.push({ key: k, why: 'storage full' }); } }
  return Object.assign(c, { written });
}

// ------------------------------------------------------------------------------------------------ Jarvis's own settings (read / write the keys Jarvis reads)
const jget = (st, k, d) => { try { const v = JSON.parse(st.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
const hhmm = (s, d) => { const m = /^(\d{1,2}):(\d\d)$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? String(m[1]).padStart(2, '0') + ':' + m[2] : d; };
export const ALERTS_KEY = 'jarvis.alerts.v1', ENGINE_KEY = 'jarvis.voiceEngine', MODE_KEY = 'jarvis.mode', SPEAK_KEY = 'jarvis.speak';
export const ENGINE_MODES = [['auto', 'Auto', 'Natural cloud voice for short replies, this phone\'s voice for long ones'], ['cloud', 'Natural cloud', 'Gemini or Groq, with your free key'],
  ['device', 'On this phone', 'The built-in on-device voice (a one-time download)'], ['phone', 'Phone voice', 'The voice iOS gives every app']];
export const MODES = [['auto', 'Auto'], ['trading', 'Trading'], ['research', 'Research'], ['business', 'Business'], ['life', 'Life']];

export function alertsGet(st) {
  const c = jget(st, ALERTS_KEY, {});
  return { speak: c.speak !== false, brief: c.brief !== false, quiet: c.quiet !== false, from: hhmm(c.from, '22:00'), to: hhmm(c.to, '07:00') };
}
export function alertsSet(st, patch) {
  const c = Object.assign(alertsGet(st), patch || {});
  const out = { speak: !!c.speak, brief: !!c.brief, quiet: !!c.quiet, from: hhmm(c.from, '22:00'), to: hhmm(c.to, '07:00') };
  try { st.setItem(ALERTS_KEY, JSON.stringify(out)); } catch (_) { /* not kept */ }
  return out;
}
export const speakOn = (st) => { try { return st.getItem(SPEAK_KEY) !== 'off'; } catch (_) { return true; } };
export function speakSet(st, on) { try { st.setItem(SPEAK_KEY, on ? 'on' : 'off'); } catch (_) { /* not kept */ } return speakOn(st); }
export function engineGet(st) { const c = jget(st, ENGINE_KEY, {}); return ENGINE_MODES.some((m) => m[0] === c.mode) ? c.mode : 'auto'; }
export function engineSet(st, mode) {
  if (!ENGINE_MODES.some((m) => m[0] === mode)) return engineGet(st);
  const c = jget(st, ENGINE_KEY, {});
  try { st.setItem(ENGINE_KEY, JSON.stringify(Object.assign({}, c, { mode }))); } catch (_) { /* not kept */ }
  return engineGet(st);
}
export function modeGet(st) { try { const v = st.getItem(MODE_KEY); return MODES.some((m) => m[0] === v) ? v : 'auto'; } catch (_) { return 'auto'; } }
export function modeSet(st, id) { if (MODES.some((m) => m[0] === id)) { try { st.setItem(MODE_KEY, id); } catch (_) { /* not kept */ } } return modeGet(st); }
const PROV = { groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter', anthropic: 'Anthropic' };
/** the brain key's STATUS only: which providers have a key saved (yes / no), never a character of a key */
export function brainStatus(st) {
  const c = jget(st, 'jarvis.smart', null), saved = [];
  const keys = c && c.keys && typeof c.keys === 'object' ? c.keys : {};
  for (const p of Object.keys(PROV)) if (typeof keys[p] === 'string' && keys[p].trim()) saved.push(PROV[p]);
  return { saved: saved.length > 0, providers: saved, on: !!(c && c.on) };
}
/** Obsidian: connected or not (the repo name is shown, the token never is) */
export function vaultStatus(st) {
  const c = jget(st, 'jarvis.vault', null);
  const repo = c && typeof c.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(c.repo) ? c.repo : '';
  return { connected: !!(repo && typeof c.token === 'string' && c.token), repo };
}

// ------------------------------------------------------------------------------------------------ Olympus' own settings
export const KEYS = { fx: 'jfx', theme: 'olympus.theme', grain: 'olympus.grain', intro: 'oly.intro', sfx: 'olympus.sfx', trans: 'olympus.transitions',
  haptics: 'olympus.haptics', ambient: 'olympus.ambient', saver: 'olympus.saver', tour: 'olympus.tour.done' };
// The Quality picker (perf v2, 2026-11-14): Auto / Battery / High / Ultra 4K (+ Still), all in the ONE 3D-quality key 'jfx' (Auto = no key);
// the render-scale governor (olympus/render-scale.js) does the sharpness: Ultra 4K draws at the screen's full resolution, Auto climbs toward it
// while every frame stays smooth, High holds 2x, Battery 1.5x; a scene that cannot keep up gets a slightly lower resolution, never a slideshow.
export const FX_LEVELS = [['low', 'Battery', 'Lighter: fewer effects, 1.5x pixels, easiest on the battery'], ['high', 'High', 'The full look at up to 2x pixels'],
  ['ultra', 'Ultra 4K', 'Everything, at your screen\'s full resolution (3x on an iPhone, 4K on a PC)'], ['off', 'Still', 'Nothing moves']];
/** the quality levels explained: [id, name, what you see, what it costs, who it is for] */
export const FX_EXPLAIN = [
  ['low', 'Battery (LITE)', 'The same scenes with fewer effects: no glow pass, fewer particles and cars, a thinner skyline, drawn at 1.5x pixels', 'Light on the battery; stays smooth on older phones', 'Old phones, a long day away from a charger, hot days'],
  ['high', 'High', 'The full look: glow, reflections and effects, drawn at up to 2x pixels', 'Normal battery use for a 3D app', 'The usual choice'],
  ['ultra', 'Ultra 4K', 'Glow and bloom, reflections, rain, the most particles, drawn at your screen\'s full resolution: 3x on an iPhone, true 4K on a 4K screen', 'Uses the most battery and warms the phone; if a scene cannot keep up, Olympus lowers its resolution a little instead of stuttering', 'A PC with a 4K screen, or a new iPhone plugged in'],
  ['off', 'Still', 'Nothing moves: every scene is drawn once and redrawn only when you touch it', 'Almost no battery use', 'Motion sickness, or when you only want to read the numbers'],
];
/** why the phone is on the level it is on now, in one plain sentence. flags: { saver, reduced, chosen (the saved level or null), level (the level in use) } */
export function fxWhy(flags) {
  const f = flags || {}, d = FX_EXPLAIN.find((l) => l[0] === f.level) || FX_EXPLAIN[1], name = d[1];
  if (f.saver) return 'You are on ' + name + ' because Battery saver is on. Turn it off to get your old choice back.';
  if (f.reduced && f.level !== 'ultra' && f.level !== 'high') return 'You are on ' + name + ' because your phone asks for less motion, and Olympus follows it.';
  if (f.chosen) return 'You are on ' + name + ' because you chose it. Pick Auto and Olympus decides for you.';
  return 'You are on ' + name + ' because Auto picked it. Auto sharpens each scene up to your screen\'s full resolution while it stays smooth; a phone that draws 3D slowly is held to LITE so the apps stay smooth.';
}
export const fxGet = (st) => { try { const v = st.getItem(KEYS.fx); return FX_LEVELS.some((l) => l[0] === v) ? v : null; } catch (_) { return null; } };
/** the Sound switch (OLYMPUS.sound): 'auto' (the stored key 's' absent: on, silent in LITE / reduced motion / saver), 'on' (true) or 'off' (false) */
export const SOUND_MODES = [['auto', 'Auto', 'On, but silent in LITE, reduced motion and battery saver'], ['on', 'On', 'Always, even in LITE'], ['off', 'Off', 'No beds and no UI cues']];
export const soundGet = (st) => { const o = jget(st, KEYS.sfx, {}); return o && o.s === true ? 'on' : o && o.s === false ? 'off' : 'auto'; };
export function soundSet(st, mode) {
  const o = Object.assign({}, jget(st, KEYS.sfx, {}));
  if (mode === 'on') o.s = true; else if (mode === 'off') o.s = false; else delete o.s;
  try { st.setItem(KEYS.sfx, JSON.stringify(o)); } catch (_) { /* private mode */ }
  return soundGet(st);
}

/** battery saver = LITE quality + no intro films + sounds muted; the old values are kept in 'olympus.saver' and come back when it goes off */
export function saverOn(st) { return !!jget(st, KEYS.saver, null); }
export function saverSet(st, on) {
  if (on && !saverOn(st)) {
    const sfx = jget(st, KEYS.sfx, {});
    st.setItem(KEYS.saver, JSON.stringify({ fx: fxGet(st), intro: st.getItem(KEYS.intro), m: sfx.m === true, v: typeof sfx.v === 'number' ? sfx.v : 0.35 }));
    st.setItem(KEYS.fx, 'low'); st.setItem(KEYS.intro, 'off'); st.setItem(KEYS.sfx, JSON.stringify(Object.assign({}, sfx, { m: true })));
  } else if (!on && saverOn(st)) {
    const o = jget(st, KEYS.saver, {}), sfx = jget(st, KEYS.sfx, {});
    if (o.fx) st.setItem(KEYS.fx, o.fx); else st.removeItem(KEYS.fx);
    if (o.intro) st.setItem(KEYS.intro, o.intro); else st.removeItem(KEYS.intro);
    st.setItem(KEYS.sfx, JSON.stringify(Object.assign({}, sfx, { m: o.m === true })));
    st.removeItem(KEYS.saver);
  }
  return saverOn(st);
}
export const flagOff = (st, k) => { try { return st.getItem(k) === 'off'; } catch (_) { return false; } };
export function flagSet(st, k, off) { try { if (off) st.setItem(k, 'off'); else st.removeItem(k); } catch (_) { /* not kept */ } return flagOff(st, k); }
export const tourDone = (st) => { try { return !!st.getItem(KEYS.tour); } catch (_) { return false; } };
export function tourSet(st, done) { try { if (done) st.setItem(KEYS.tour, JSON.stringify({ t: Math.round(Date.now() / 1000) })); else st.removeItem(KEYS.tour); } catch (_) { /* not kept */ } return tourDone(st); }

export function fmtBytes(n) {
  n = +n || 0;
  if (n < 1024) return Math.round(n) + ' B';
  if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
}

// ------------------------------------------------------------------------------------------------ the first-run tour: six cards
export const TOUR = [
  { id: 'what', glyph: 'seal', title: 'This is Olympus', text: 'One place for everything you watch: your trading bots, your Kalshi bot, the research, the 3D cities and Jarvis, your assistant. It lives on your phone, reads what your servers publish, and never places a trade by itself.' },
  { id: 'jarvis', glyph: 'orb', title: 'Meet Jarvis', text: 'Tap the glowing orb to talk or type. Pick a mode (Trading, Research, Business, Life) or leave it on Auto. Stuck? Tap "Think for me": Jarvis looks at your accounts, your plan and your to-do list and tells you the one thing to do next.' },
  { id: 'apps', glyph: 'apps', title: 'Start with three apps', text: 'Zenith is the main dashboard: balances, trades, the eval. Argus watches that every part of the system is alive. Kalshi shows your Kalshi bot: balance, open bets, why it wins or loses.',
    links: [['Zenith', '../'], ['Argus', '../argus/'], ['Kalshi', '../kalshi/']] },
  { id: 'cities', glyph: 'city', title: 'The cities', text: 'Your numbers as places you can fly through: Data City for your data, Kalshi City for the bot, and more. Drag to turn, tap a building to read it. They are for understanding, not for clicking buy.',
    links: [['Cities', '../cities/'], ['Data City', '../datacity/']] },
  { id: 'connect', glyph: 'link', title: 'Connect your AI, free', text: 'ChatGPT: open Bridge and follow its one paste. A free Jarvis voice: go to aistudio.google.com/apikey, tap Create API key, copy it, then open Jarvis, Smart mode, and paste it there. The key stays on this phone and is never shown again.',
    links: [['Bridge', '../bridge/'], ['Jarvis', '../jarvis/']] },
  { id: 'home', glyph: 'home', title: 'Put it on your Home Screen', text: 'On the iPhone: open this site in Safari, tap the Share button (the square with the arrow), scroll down and tap Add to Home Screen, then Add. It opens full screen like an app and works offline with the last numbers it saved.' },
];

// ------------------------------------------------------------------------------------------------ Data section (2026-11-10): the records every app keeps on THIS phone
// Names for the newer apps (a key's first word decides its group, see groupOf) and what each keeps, in plain words.
Object.assign(APP_NAMES, { journal: 'Journal', planner: 'Planner', lyceum: 'Lyceum', epilogue: 'Epilogue', argo: 'Argo', oikos: 'Oikos', compass: 'Compass', stoa: 'Stoa', mint: 'Mint',
  arbiter: 'Arbiter', moirai: 'Moirai', hera: 'Hera', pnyx: 'Pnyx', inbox: 'Inbox', chronos: 'Chronos', hephaestus: 'Hephaestus', atlas: 'Atlas', le: 'Zenith (dashboard)', daphne: 'Daphne',
  athens: 'Athens' });
Object.assign(APP_ABOUT, { journal: 'Your trade journal entries: only here, export them', planner: 'Your day plan, tasks, habits and notes', lyceum: 'Your daily quiz answers and streak',
  epilogue: 'Your end-of-day notes', argo: 'Your goals and their progress', oikos: 'Your household money entries', compass: 'Your compass choices and state', stoa: 'What you marked as done',
  mint: 'The history of the paper money streams', arbiter: 'Your paper tracker (never real orders)', moirai: 'Your choices', atlas: 'Your favourites, pinned rooms and recent rooms',
  hera: 'Your plan choices', pnyx: 'Your calculator choices', inbox: 'What you read', chronos: 'Your clock choices', hephaestus: 'Your dials' });
/** the keys that hold YOUR own records (they exist nowhere else): what they are, in plain words. A key that is not on the phone is listed as "not used yet". */
export const KNOWN_KEYS = [
  ['ledger.v1', 'Ledger', 'Your money record: every fee, payout and entry you typed'], ['journal.v1', 'Journal', 'Your trade journal'],
  ['planner.agora.v1', 'Planner', 'Your day plan, tasks and habits'], ['planner.v1', 'Planner', 'Your plan (older copy)'], ['lyceum.v1', 'Lyceum', 'Your quiz answers and streak'],
  ['epilogue.v1', 'Epilogue', 'Your end-of-day notes'], ['argo.goals.v1', 'Argo', 'Your goals'], ['oikos.v1', 'Oikos', 'Your household money entries'],
  ['compass.state.v1', 'Compass', 'Your compass state'], ['stoa.state.v1', 'Stoa', 'What you marked done'], ['mint.hist.v1', 'Mint', 'The paper money streams history'],
  ['arbiter.paper.v1', 'Arbiter', 'Your paper tracker'], ['moirai.v1', 'Moirai', 'Your choices'], ['jarvis.orb.fav', 'Jarvis switcher', 'Your favourite apps'],
  ['oly.launcher.fav', 'Launcher', 'Your favourite apps'], ['olympus.atlas.v1', 'Atlas', 'Your pinned and recent rooms'], ['olympus.welcome.v1', 'Welcome card', 'That you saw the welcome'],
];
/** { rows: [{ key, app, what, present, bytes }], present, bytes } for the known keys; a secret is never read */
export function recordsReport(st) {
  const rows = KNOWN_KEYS.map(([key, app, what]) => {
    let present = false, bytes = 0;
    if (!isSecret(key)) { try { present = st.getItem(key) != null; } catch (_) { present = false; } if (present) bytes = sizeOf(st, key); }
    return { key, app, what, present, bytes };
  });
  const on = rows.filter((r) => r.present);
  return { rows, present: on.length, bytes: on.reduce((t, r) => t + r.bytes, 0) };
}
/** the warning that matters most: the phone keeps these per web address */
export const ADDRESS_WARNING = {
  title: 'If the site address changes',
  text: 'Your phone saves all of this under the web address of the site. A new address (a new domain, or a new username in the link) is a new, empty place: your journal, ledger, plans, goals and favourites would NOT follow. Export all before any move, open the new address, then Import all. Your Home Screen icon is tied to the address too: add it again from the new one.',
};
