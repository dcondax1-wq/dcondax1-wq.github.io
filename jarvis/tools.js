// Jarvis's tools (owner 2026-11-03: "it needs to have an answer to everything ... add to the Obsidian, write notes down, do a
// ton of stuff"). One ES module, no imports, no DOM. Two jobs:
//   1. the tool schema the smart model may call (function calling on Groq, Gemini, OpenRouter and Anthropic), run here on the
//      phone; writes to Obsidian are never run by the model: they become a confirmation ("Save this to ...? Say yes or no.")
//      that memory.js writes only after "yes" (append-only / new-file only, as every vault write);
//   2. the same tools without any key (local(): weather, time zones, units, definitions, Wikipedia), so Jarvis is useful
//      before smart mode is set up.
//
//   import { createTools } from './tools.js';
//   const tools = createTools({ fetch?, storage?, geo?, now? });   geo() -> Promise<{ lat, lon }> (asks for location permission)
//   createBrain({ ..., tools });
//   tools.defs                                   [{ name, description, parameters, write? }]
//   tools.schema(provider)                       the defs in that provider's wire format ('openai' | 'gemini' | 'anthropic')
//   tools.run(name, args, env) -> Promise<{ result, text?, speak?, pending?, open?, route?, intent }>
//   tools.local(raw, q, env, { late }) -> Promise<reply | null>     the no-key answers (late: the "who is / what is" lookups)
//   env (from the brain): { facts() -> compact facts, assistant, memory, navigate(name) -> reply | null, lastIntent }
//
// Network: only the free, key-less, CORS-friendly hosts in HOSTS (checked 2026-11-03); any other address is refused, and no
// key or token is ever sent (the smart keys stay in brain.js, the GitHub token in obsidian.js). "Web search" is DuckDuckGo's
// instant answers plus Wikipedia's search: there is no free key-less full web search a browser can call, and Jarvis says so.
// iPhone Safari 16: plain ES2020, no regex lookbehind.

export const HOSTS = ['https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com', 'https://en.wikipedia.org', 'https://api.dictionaryapi.dev', 'https://api.duckduckgo.com'];
const STORE_KEY = 'jarvis.tools';          // { last: {name, lat, lon, tz} } the last weather place (this phone only)
const TIMEOUT_MS = 6000;
const FOLLOW_MS = 10 * 60e3;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, n) => (typeof x === 'string' ? x : x == null ? '' : String(x)).replace(/\s+/g, ' ').trim().slice(0, n || 600);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const titleCase = (s) => str(s, 80).replace(/\b([a-z])/g, (m) => m.toUpperCase());
const round = (v, d) => { const k = Math.pow(10, d || 0); return Math.round(v * k) / k; };
const fmt = (v) => { const a = Math.abs(v), d = a >= 100 ? 0 : a >= 10 ? 1 : 2; return round(v, d).toLocaleString('en-US', { maximumFractionDigits: d }); };
// the first n sentences of a text (for the spoken line)
const sentences = (s, n) => { const m = String(s || '').match(/[^.!?]+[.!?]+(\s|$)/g); return m ? m.slice(0, n).join('').trim() : str(s, 300); };

// ------------------------------------------------------------------------------------------------ the tool schema
const S = (props, req) => ({ type: 'object', properties: props, required: req || [] });
const P = (type, description, extra) => ({ type, description, ...(extra || {}) });
export const DEFS = [
  { name: 'obsidian_append_note', write: true, description: 'Append text to one of his Obsidian notes: his Jarvis inbox (default), today\'s daily note, or a named note (e.g. "Gym"). Append only. He is asked to confirm before anything is written.',
    parameters: S({ text: P('string', 'What to add, in his words (Markdown is fine).'), target: P('string', 'inbox, daily or note', { enum: ['inbox', 'daily', 'note'] }), title: P('string', 'The note\'s title when target is note.') }, ['text']) },
  { name: 'obsidian_create_note', write: true, description: 'Create a new note OLYMPUS/Notes/<title>.md in his Obsidian vault (if it exists, the text is appended). He is asked to confirm first.',
    parameters: S({ title: P('string', 'A short title, e.g. "Gym plan".'), text: P('string', 'The note\'s content (Markdown is fine).') }, ['title', 'text']) },
  { name: 'obsidian_search', description: 'Search his Obsidian notes (titles, headings, tags, text). Returns the best matches with snippets.', parameters: S({ query: P('string', 'What to look for.') }, ['query']) },
  { name: 'obsidian_read', description: 'Read one of his Obsidian notes by title.', parameters: S({ title: P('string', 'The note title.') }, ['title']) },
  { name: 'add_task', description: 'Add an item to his Jarvis to-do list on the phone.', parameters: S({ text: P('string', 'The task.') }, ['text']) },
  { name: 'list_tasks', description: 'His open to-dos (the Jarvis list) and the next reminders.', parameters: S({}) },
  { name: 'set_reminder', description: 'Set a reminder on his phone. "when" in plain words: "at 5pm", "in 20 minutes", "tomorrow at 9am", "on friday".', parameters: S({ text: P('string', 'What to remind him of.'), when: P('string', 'When, in plain words.') }, ['text', 'when']) },
  { name: 'remember_fact', description: 'Keep a lasting fact he told you (a birthday, a name, a preference). Never passwords, keys or card numbers.', parameters: S({ fact: P('string', 'The fact, in his words ("my mom\'s birthday is March 3").') }, ['fact']) },
  { name: 'recall', description: 'What he told you before about a topic (facts kept on the phone).', parameters: S({ topic: P('string', 'The topic.') }, ['topic']) },
  { name: 'get_bots_status', description: 'His trading bots right now (Zlarior, ATLAS, BLITZ): status, stage, room, eval progress, what needs him.', parameters: S({}) },
  { name: 'get_money', description: 'His money right now: each account\'s balance and P&L today / this week, Kalshi.', parameters: S({}) },
  { name: 'open_app', description: 'Open one of his dashboards on the phone (home, zenith, planner, kalshi, or a page like "atlas trades").', parameters: S({ app: P('string', 'The app or page.') }, ['app']) },
  { name: 'get_weather', description: 'The weather now and the forecast (Fahrenheit, mph). Uses his last place or his phone location when no place is given.', parameters: S({ place: P('string', 'A city, e.g. "Boston".'), day: P('string', 'today, tomorrow, a weekday, or week.') }) },
  { name: 'wiki_summary', description: 'A short Wikipedia summary of a person, place, thing or idea.', parameters: S({ topic: P('string', 'The topic.') }, ['topic']) },
  { name: 'web_search', description: 'Quick facts from DuckDuckGo instant answers and Wikipedia search (not a full web search: no news or prices).', parameters: S({ query: P('string', 'The question.') }, ['query']) },
  { name: 'calc', description: 'Exact maths and unit conversions ("15% of 2300", "(2+3)*4", "5 km in miles", "70 f to c").', parameters: S({ expression: P('string', 'The expression.') }, ['expression']) },
  { name: 'define', description: 'A dictionary definition of an English word.', parameters: S({ word: P('string', 'The word.') }, ['word']) },
  { name: 'time_in', description: 'The local time in a city or time zone.', parameters: S({ place: P('string', 'A city or zone, e.g. "Tokyo".') }, ['place']) },
];
const WRITES = new Set(DEFS.filter((d) => d.write).map((d) => d.name));
// Gemini wants its own (OpenAPI) type names
const geminiSchema = (s) => {
  if (!isObj(s)) return s;
  const o = {};
  for (const k of Object.keys(s)) {
    if (k === 'type') o.type = String(s.type).toUpperCase();
    else if (k === 'properties') { o.properties = {}; for (const p of Object.keys(s.properties)) o.properties[p] = geminiSchema(s.properties[p]); }
    else o[k] = s[k];
  }
  return o;
};
export function toolSchema(provider) {
  if (provider === 'gemini') return [{ functionDeclarations: DEFS.map((d) => ({ name: d.name, description: d.description, parameters: geminiSchema(d.parameters) })) }];
  if (provider === 'anthropic') return DEFS.map((d) => ({ name: d.name, description: d.description, input_schema: d.parameters }));
  return DEFS.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.parameters } }));
}

// ------------------------------------------------------------------------------------------------ units (no network)
const UNITS = {
  length: { m: 1, meter: 1, meters: 1, metre: 1, metres: 1, km: 1000, kilometer: 1000, kilometers: 1000, kilometre: 1000, kilometres: 1000, cm: 0.01, centimeter: 0.01, centimeters: 0.01,
    mm: 0.001, millimeter: 0.001, millimeters: 0.001, mi: 1609.344, mile: 1609.344, miles: 1609.344, ft: 0.3048, foot: 0.3048, feet: 0.3048, in: 0.0254, inch: 0.0254, inches: 0.0254,
    yd: 0.9144, yard: 0.9144, yards: 0.9144 },
  mass: { kg: 1, kgs: 1, kilo: 1, kilos: 1, kilogram: 1, kilograms: 1, g: 0.001, gram: 0.001, grams: 0.001, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237,
    oz: 0.028349523, ounce: 0.028349523, ounces: 0.028349523, st: 6.35029318, stone: 6.35029318 },
  volume: { l: 1, liter: 1, liters: 1, litre: 1, litres: 1, ml: 0.001, milliliter: 0.001, milliliters: 0.001, gal: 3.785411784, gallon: 3.785411784, gallons: 3.785411784,
    cup: 0.2365882365, cups: 0.2365882365, 'fl oz': 0.0295735296, qt: 0.946352946, quart: 0.946352946, quarts: 0.946352946 },
  speed: { mph: 0.44704, 'km/h': 0.2777778, kmh: 0.2777778, kph: 0.2777778, 'm/s': 1, knots: 0.514444, knot: 0.514444 },
  time: { s: 1, sec: 1, secs: 1, second: 1, seconds: 1, min: 60, mins: 60, minute: 60, minutes: 60, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, day: 86400, days: 86400, week: 604800, weeks: 604800 },
};
const TEMP = { c: 'C', celsius: 'C', '°c': 'C', f: 'F', fahrenheit: 'F', '°f': 'F', k: 'K', kelvin: 'K' };
const UNIT_NAME = { m: 'm', km: 'km', cm: 'cm', mm: 'mm', mi: 'miles', ft: 'ft', in: 'in', yd: 'yards', kg: 'kg', g: 'g', lb: 'lb', oz: 'oz', st: 'stone', l: 'liters', ml: 'ml', gal: 'gallons', qt: 'quarts' };
function unitOf(w) {
  const u = String(w || '').toLowerCase().replace(/\.$/, '').trim();
  if (TEMP[u] || TEMP[u.replace(/^degrees? /, '')]) return { kind: 'temp', u: TEMP[u] || TEMP[u.replace(/^degrees? /, '')] };
  for (const k of Object.keys(UNITS)) if (UNITS[k][u] != null) return { kind: k, u, f: UNITS[k][u] };
  return null;
}
const toC = (v, u) => (u === 'C' ? v : u === 'F' ? ((v - 32) * 5) / 9 : v - 273.15);
const fromC = (v, u) => (u === 'C' ? v : u === 'F' ? (v * 9) / 5 + 32 : v + 273.15);
const UNIT_W = "(°?[a-z]+(?:/[a-z]+)?(?: oz)?|degrees? [a-z]+)";
export function parseUnits(raw) {
  const t = String(raw || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[?!.]+$/, '').replace(/^(?:hey jarvis,?\s*)?(?:convert|what's|whats|what is|how much is)\s+/, '').trim();
  let m = new RegExp(`^(-?[\\d,]*\\.?\\d+)\\s*${UNIT_W}\\s+(?:in|to|into|as)\\s+${UNIT_W}$`).exec(t), v, a, b;
  if (m) { v = +m[1].replace(/,/g, ''); a = unitOf(m[2]); b = unitOf(m[3]); }
  else {
    m = new RegExp(`^how many ${UNIT_W} (?:is|are|in|make)\\s+(-?[\\d,]*\\.?\\d+)\\s*${UNIT_W}$`).exec(t);
    if (m) { v = +m[2].replace(/,/g, ''); a = unitOf(m[3]); b = unitOf(m[1]); }
  }
  if (!m || !a || !b || a.kind !== b.kind || !Number.isFinite(v)) return null;
  const out = a.kind === 'temp' ? fromC(toC(v, a.u), b.u) : (v * a.f) / b.f;
  const nm = (x) => (x.kind === 'temp' ? '°' + x.u : ' ' + (UNIT_NAME[x.u] || x.u));
  return { text: `${fmt(v)}${nm(a)} is ${fmt(out)}${nm(b)}.`, value: out };
}

// ------------------------------------------------------------------------------------------------ time zones (no network first)
const ZONES = { 'new york': 'America/New_York', nyc: 'America/New_York', boston: 'America/New_York', miami: 'America/New_York', atlanta: 'America/New_York', toronto: 'America/Toronto',
  chicago: 'America/Chicago', dallas: 'America/Chicago', houston: 'America/Chicago', austin: 'America/Chicago', denver: 'America/Denver', phoenix: 'America/Phoenix',
  'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', vegas: 'America/Los_Angeles', 'las vegas': 'America/Los_Angeles',
  vancouver: 'America/Vancouver', honolulu: 'Pacific/Honolulu', hawaii: 'Pacific/Honolulu', anchorage: 'America/Anchorage', 'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires', london: 'Europe/London', uk: 'Europe/London', dublin: 'Europe/Dublin', lisbon: 'Europe/Lisbon', paris: 'Europe/Paris', berlin: 'Europe/Berlin',
  madrid: 'Europe/Madrid', rome: 'Europe/Rome', amsterdam: 'Europe/Amsterdam', zurich: 'Europe/Zurich', stockholm: 'Europe/Stockholm', athens: 'Europe/Athens', istanbul: 'Europe/Istanbul',
  moscow: 'Europe/Moscow', dubai: 'Asia/Dubai', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', india: 'Asia/Kolkata', singapore: 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong',
  shanghai: 'Asia/Shanghai', beijing: 'Asia/Shanghai', china: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', seoul: 'Asia/Seoul', sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne',
  auckland: 'Pacific/Auckland', cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', johannesburg: 'Africa/Johannesburg', nairobi: 'Africa/Nairobi', utc: 'UTC', gmt: 'UTC',
  eastern: 'America/New_York', est: 'America/New_York', edt: 'America/New_York', et: 'America/New_York', central: 'America/Chicago', cst: 'America/Chicago', mountain: 'America/Denver',
  pacific: 'America/Los_Angeles', pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles', cet: 'Europe/Paris' };
export function zoneFor(place) { const k = str(place, 60).toLowerCase().replace(/^the /, '').replace(/[?.!]+$/, '').replace(/ time( zone)?$/, '').trim(); return ZONES[k] || null; }
function clockIn(zone, ms) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(ms));
    const g = (t) => (f.find((p) => p.type === t) || {}).value || '';
    return { time: `${g('hour')}:${g('minute')} ${g('dayPeriod')}`.trim(), day: g('weekday') };
  } catch (_) { return null; }
}
function offsetMin(zone, ms) {      // minutes ahead of UTC in that zone
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(ms));
    const g = (t) => +((f.find((p) => p.type === t) || {}).value || 0);
    return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - Math.floor(ms / 60000) * 60000) / 60000);
  } catch (_) { return 0; }
}

// ------------------------------------------------------------------------------------------------ the weather words (WMO codes)
const WMO = [[0, 'clear'], [1, 'mostly clear'], [2, 'partly cloudy'], [3, 'cloudy'], [45, 'foggy'], [48, 'foggy'], [51, 'light drizzle'], [53, 'drizzle'], [55, 'heavy drizzle'],
  [56, 'freezing drizzle'], [57, 'freezing drizzle'], [61, 'light rain'], [63, 'rain'], [65, 'heavy rain'], [66, 'freezing rain'], [67, 'freezing rain'], [71, 'light snow'], [73, 'snow'],
  [75, 'heavy snow'], [77, 'snow grains'], [80, 'rain showers'], [81, 'rain showers'], [82, 'heavy showers'], [85, 'snow showers'], [86, 'heavy snow showers'], [95, 'thunderstorms'],
  [96, 'thunderstorms with hail'], [99, 'thunderstorms with hail']];
const sky = (c) => { const x = WMO.find((w) => w[0] === +c); return x ? x[1] : 'mixed'; };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ------------------------------------------------------------------------------------------------ what he says (no key)
const WEATHER_RX = /\b(weather|forecast|temperature|temp outside|rain(ing|y)?|snow(ing|y)?|umbrella|jacket|humid(ity)?|windy|sunny|how (hot|cold|warm) is it|degrees outside|storm(s|y)?)\b/;
const NOT_WEATHER_RX = /\b(kalshi|market|markets|contracts?|positions?|bots?)\b/;
const WEATHER_PLACE_RX = /\b(?:in|for|at|around)\s+([a-z][a-z .'-]{1,40}?)(?:\s+(?:today|tomorrow|tonight|this week|next week|this weekend|on \w+day|right now|now))?$/;
const DAY_RX = /\b(today|tonight|tomorrow|this week|the week|next week|this weekend|the weekend|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/;
const TIME_IN_RX = /^(?:what(?:'s| is)? )?(?:the )?(?:time|clock|local time)(?: is it| now| right now)? in (.{2,40})$|^what time is it in (.{2,40})$|^time in (.{2,40})$/;
const DEFINE_RX = /^(?:define|definition of|meaning of|what's the meaning of|what is the meaning of|what does the word) ([a-z][a-z' -]{1,40}?)(?: mean)?$|^what does ([a-z][a-z'-]{1,30}) mean$/;
const LOOKUP_RX = /^(?:look up|search for|search|google|wiki|wikipedia|tell me about|about|who's|who is|who was|who are|who were|what's|what is|what was|what are|what were|where is|where's|explain)\s+(.{2,80})$/;
// "who / what is X" that the brain or the assistant own: never a lookup
const NOT_LOOKUP_RX = /\b(my|me|i|your|you|this|that|it|today|tomorrow|now|up|wrong|new|next|the time|the date|the plan|the room|the target|the balance|the market|the status|on|going on|happening|left|due)\b|^(my|the) /;
const FOLLOW_DAY_RX = /^(?:and|ok and|okay and|so|what about|how about|and what about|and how about)\s+(today|tonight|tomorrow|this week|the week|next week|this weekend|the weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$|^(?:and )?(tomorrow|tonight)$/;
const FOLLOW_PLACE_RX = /^(?:and|what about|how about|and what about|and how about)\s+(?:in\s+)?([a-z][a-z .'-]{1,40})$/;
// what follows "no, ..." / "what about ..." that is not a place (thanks, the bots, a pronoun ...)
const NOT_PLACE_RX = /^(?:the )?(?:thanks?|thank you|thx|worries|problem|need|nothing|never ?mind|stop|cancel|that'?s (?:all|it|fine)|it'?s fine|i'?m good|good|ok|okay|bots?|zlarior|atlas|blitz|kalshi|planner|plan|market|markets|p&l|room|balance|target|money|it|that|this|them|him|her|me|you|us|my .+|your .+)$/;
const CORRECT_RX = /^(?:no|nah|nope|not that|wrong)[, ]+(?:i meant |i mean |i said |in |the )?([a-z][a-z .'-]{1,60})$|^i meant (?:in )?([a-z][a-z .'-]{1,60})$/;

export function createTools(opts) {
  const o = isObj(opts) ? opts : {};
  const store = () => { if (o.storage) return o.storage; try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
  const nowMs = () => { try { const t = typeof o.now === 'function' ? o.now() : Date.now(); return t instanceof Date ? t.getTime() : +t || Date.now(); } catch (_) { return Date.now(); } };
  const lget = () => { try { const st = store(); const v = st ? JSON.parse(st.getItem(STORE_KEY) || '{}') : {}; return isObj(v) ? v : {}; } catch (_) { return {}; } };
  const lset = (v) => { try { const st = store(); if (st) st.setItem(STORE_KEY, JSON.stringify(v)); } catch (_) { /* not kept */ } };
  let ctx = null;            // the last tool answer, for follow-ups: { kind: 'weather' | 'wiki' | 'time', place, day, topic, t }

  // the only network call: a GET to one of HOSTS, no credentials, a 6 s limit
  async function get(url) {
    let origin = '';
    try { origin = new URL(url).origin; } catch (_) { origin = ''; }
    if (!HOSTS.includes(origin)) throw new Error('refused');
    const f = typeof o.fetch === 'function' ? o.fetch : typeof fetch === 'function' ? fetch : null;
    if (!f) throw new Error('offline');
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ac ? setTimeout(() => ac.abort(), TIMEOUT_MS) : 0;
    try {
      const r = await f(url, { method: 'GET', credentials: 'omit', signal: ac ? ac.signal : undefined, headers: { Accept: 'application/json' } });
      if (!r || !r.ok) { const e = new Error('HTTP ' + (r ? r.status : 0)); e.status = r ? r.status : 0; throw e; }
      return await r.json();
    } finally { if (t) clearTimeout(t); }
  }
  const enc = encodeURIComponent;

  // ---------------------------------------------------------------------------------------------- weather (open-meteo, free, no key)
  async function geocode(name) {
    const j = await get(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(str(name, 60))}&count=1&language=en&format=json`);
    const g = arr(j && j.results)[0];
    if (!isObj(g) || !Number.isFinite(+g.latitude)) return null;
    const label = [g.name, g.country_code === 'US' ? g.admin1 : g.country].filter(Boolean).join(', ');
    return { name: str(g.name, 60), label: str(label, 80), lat: +g.latitude, lon: +g.longitude, tz: str(g.timezone, 60) };
  }
  async function placeFor(place, env) {
    if (str(place)) { const g = await geocode(place); if (!g) return { error: `I couldn't find a place called ${titleCase(place)}.` }; return { loc: g }; }
    const kept = lget().last;
    if (isObj(kept) && Number.isFinite(+kept.lat)) return { loc: kept };
    const home = env && env.assistant && typeof env.assistant.home === 'function' ? str(env.assistant.home(), 60) : '';
    if (home) { const g = await geocode(home); if (g) return { loc: g }; }
    if (typeof o.geo === 'function') {
      try { const p = await o.geo(); if (isObj(p) && Number.isFinite(+p.lat)) return { loc: { name: 'your location', label: 'your location', lat: +p.lat, lon: +p.lon, tz: '' } }; } catch (_) { /* no permission */ }
    }
    return { error: 'Which city? Say "weather in Boston" and I\'ll remember it.' };
  }
  function dayIndex(day, days, tz) {
    const d = str(day, 20).toLowerCase();
    if (!d || d === 'today' || d === 'tonight' || d === 'now') return 0;
    if (d === 'tomorrow') return 1;
    const wd = WEEKDAYS.indexOf(d);
    if (wd >= 0) {
      for (let i = 0; i < days.length; i++) { const x = new Date(days[i] + 'T12:00:00Z').getUTCDay(); if (x === wd) return i; }
      return -1;
    }
    return /week/.test(d) ? 'week' : 0;
  }
  async function weather(place, day, env) {
    const pl = await placeFor(place, env);
    if (pl.error) return { text: pl.error, intent: 'tool_weather', result: { error: pl.error } };
    const L = pl.loc;
    const j = await get(`https://api.open-meteo.com/v1/forecast?latitude=${round(L.lat, 4)}&longitude=${round(L.lon, 4)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7');
    const c = isObj(j && j.current) ? j.current : {}, D = isObj(j && j.daily) ? j.daily : {};
    const days = arr(D.time), hi = arr(D.temperature_2m_max), lo = arr(D.temperature_2m_min), rain = arr(D.precipitation_probability_max), code = arr(D.weather_code);
    if (L.name !== 'your location') { const v = lget(); v.last = { name: L.name, label: L.label, lat: L.lat, lon: L.lon, tz: L.tz || str(j && j.timezone, 60) }; lset(v); }
    const nm = L.name === 'your location' ? 'Where you are' : L.name;
    const dayLine = (i, label) => (days[i] == null ? null : `${label}: ${sky(code[i])}, ${Math.round(lo[i])}-${Math.round(hi[i])}°F${rain[i] != null ? `, ${Math.round(rain[i])}% chance of rain` : ''}.`);
    const di = dayIndex(day, days);
    ctx = { kind: 'weather', place: L.name === 'your location' ? '' : L.name, day: str(day, 20), t: nowMs() };
    const result = { place: L.label, now: c.temperature_2m != null ? { temp_f: c.temperature_2m, feels_f: c.apparent_temperature, sky: sky(c.weather_code), wind_mph: c.wind_speed_10m } : null,
      days: days.slice(0, 7).map((d, i) => ({ date: d, sky: sky(code[i]), low_f: lo[i], high_f: hi[i], rain_pct: rain[i] })) };
    if (di === -1) return { text: `I only have the next 7 days for ${nm}.`, intent: 'tool_weather', result };
    if (di === 'week') {
      const ws = days.slice(0, 7).map((d, i) => `${cap(WEEKDAYS[new Date(d + 'T12:00:00Z').getUTCDay()]).slice(0, 3)} ${sky(code[i])} ${Math.round(lo[i])}-${Math.round(hi[i])}°F`);
      const wet = days.map((d, i) => [d, rain[i]]).filter((x) => x[1] >= 50).map((x) => cap(WEEKDAYS[new Date(x[0] + 'T12:00:00Z').getUTCDay()]));
      return { text: `${nm}, the next 7 days: ${ws.join(' · ')}.`, speak: `${nm} this week: ${sky(code[0])} today, ${Math.round(lo[0])} to ${Math.round(hi[0])} degrees${wet.length ? `; rain likely on ${wet.slice(0, 3).join(', ')}` : ', no big rain'}.`, intent: 'tool_weather', result };
    }
    if (di === 0 && c.temperature_2m != null) {
      const t = `${nm} right now: ${Math.round(c.temperature_2m)}°F${c.apparent_temperature != null && Math.abs(c.apparent_temperature - c.temperature_2m) >= 3 ? ` (feels like ${Math.round(c.apparent_temperature)}°F)` : ''}, ${sky(c.weather_code)}, wind ${Math.round(c.wind_speed_10m || 0)} mph.`;
      return { text: [t, dayLine(0, 'Today')].filter(Boolean).join('\n'), speak: `${nm}: ${Math.round(c.temperature_2m)} degrees and ${sky(c.weather_code)}. Today ${Math.round(lo[0])} to ${Math.round(hi[0])}${rain[0] >= 30 ? `, ${Math.round(rain[0])} percent chance of rain` : ''}.`, intent: 'tool_weather', result };
    }
    const label = di === 1 ? 'Tomorrow' : cap(WEEKDAYS[new Date(days[di] + 'T12:00:00Z').getUTCDay()]);
    return { text: `${nm} ${dayLine(di, label.toLowerCase())}`, speak: `${nm} ${label.toLowerCase()}: ${sky(code[di])}, ${Math.round(lo[di])} to ${Math.round(hi[di])} degrees${rain[di] >= 30 ? `, ${Math.round(rain[di])} percent chance of rain` : ''}.`, intent: 'tool_weather', result };
  }

  // ---------------------------------------------------------------------------------------------- Wikipedia, the dictionary, DuckDuckGo
  async function wikiSummary(topic) {
    const tp = str(topic, 100).replace(/[?.!]+$/, '');
    if (!tp) return null;
    const sum = async (title) => {
      try { return await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(title.replace(/ /g, '_'))}?redirect=true`); } catch (e) { if (e && e.status === 404) return null; throw e; }
    };
    let j = await sum(titleCase(tp));
    if (!isObj(j) || j.type === 'disambiguation' || !str(j.extract)) {
      const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(tp)}&srlimit=1&format=json&origin=*`);
      const hit = arr(s && s.query && s.query.search)[0];
      j = hit && hit.title ? await sum(hit.title) : null;
    }
    if (!isObj(j) || !str(j.extract)) return null;
    return { title: str(j.title, 120), description: str(j.description, 160), extract: str(j.extract, 1200) };
  }
  async function wiki(topic) {
    const w = await wikiSummary(topic);
    ctx = { kind: 'wiki', topic: str(topic, 80), t: nowMs() };
    if (!w) return { text: `Wikipedia has nothing on "${str(topic, 80)}".`, intent: 'tool_wiki', result: { found: false } };
    const short = sentences(w.extract, 3);
    return { text: `${short} (Wikipedia: ${w.title})`, speak: sentences(w.extract, 2), intent: 'tool_wiki', result: w };
  }
  async function define(word) {
    const wd = str(word, 40).toLowerCase().replace(/[^a-z' -]/g, '').trim();
    if (!wd) return { text: 'Define which word?', intent: 'tool_define', result: { found: false } };
    let j = null;
    try { j = await get(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc(wd)}`); } catch (e) { if (!(e && e.status === 404)) throw e; }
    const e0 = arr(j)[0], ms = isObj(e0) ? arr(e0.meanings) : [];
    if (!ms.length) { const w = await wikiSummary(wd).catch(() => null); return w ? { text: `${sentences(w.extract, 2)} (Wikipedia: ${w.title})`, speak: sentences(w.extract, 1), intent: 'tool_define', result: w } : { text: `No dictionary entry for "${wd}".`, intent: 'tool_define', result: { found: false } }; }
    const defs = ms.slice(0, 2).map((m) => { const d = arr(m.definitions)[0] || {}; return { pos: str(m.partOfSpeech, 20), def: str(d.definition, 300), ex: str(d.example, 200) }; }).filter((d) => d.def);
    const first = defs[0];
    return { text: [`${cap(wd)} (${first.pos}): ${first.def}`, first.ex ? `Example: "${first.ex}"` : '', defs[1] ? `As a ${defs[1].pos}: ${defs[1].def}` : ''].filter(Boolean).join('\n'),
      speak: `${cap(wd)}, ${first.pos}: ${first.def}`, intent: 'tool_define', result: { word: wd, definitions: defs } };
  }
  async function search(query) {
    const q = str(query, 160);
    let j = null;
    try { j = await get(`https://api.duckduckgo.com/?q=${enc(q)}&format=json&no_html=1&skip_disambig=1&t=jarvis`); } catch (_) { j = null; }
    const ans = isObj(j) ? str(j.Answer, 400) || str(j.AbstractText, 900) || str(j.Definition, 400) : '';
    if (ans) return { text: `${sentences(ans, 3)}${j.AbstractSource ? ` (${str(j.AbstractSource, 40)})` : ''}`, speak: sentences(ans, 2), intent: 'tool_search', result: { answer: ans, source: str(j.AbstractSource, 40) || 'DuckDuckGo' } };
    const w = await wikiSummary(q).catch(() => null);
    if (w) return { text: `${sentences(w.extract, 3)} (Wikipedia: ${w.title})`, speak: sentences(w.extract, 2), intent: 'tool_search', result: w };
    return { text: 'No quick answer for that, and I have no full web search (there is no free one a phone page can call).', intent: 'tool_search', result: { found: false, note: 'no instant answer; full web search is not available' } };
  }
  async function timeIn(place) {
    const p = str(place, 60).replace(/[?.!]+$/, '');
    let zone = zoneFor(p), name = titleCase(p);
    if (!zone) { const g = await geocode(p).catch(() => null); if (g && g.tz) { zone = g.tz; name = g.name; } }
    if (!zone) return { text: `I don't know the time zone of ${name}.`, intent: 'tool_time', result: { found: false } };
    const now = nowMs(), c = clockIn(zone, now), here = clockIn('America/New_York', now);
    if (!c) return { text: `I couldn't read the clock for ${name}.`, intent: 'tool_time', result: { found: false } };
    const diff = (offsetMin(zone, now) - offsetMin('America/New_York', now)) / 60;
    const rel = !diff ? 'same as New York' : `${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'hour' : 'hours'} ${diff > 0 ? 'ahead of' : 'behind'} New York`;
    ctx = { kind: 'time', place: p, t: now };
    return { text: `It's ${c.time} in ${name}${c.day !== (here && here.day) ? ` (${c.day})` : ''}, ${rel}.`, intent: 'tool_time', result: { place: name, zone, time: c.time, day: c.day, hours_vs_new_york: diff } };
  }

  // ---------------------------------------------------------------------------------------------- run one tool (the model's call)
  const asText = (r) => (isObj(r) ? str(r.text, 1500) : '');
  async function run(name, args, env) {
    const a = isObj(args) ? args : {}, E = isObj(env) ? env : {}, A = E.assistant, M = E.memory;
    try {
      switch (name) {
        case 'obsidian_append_note':
        case 'obsidian_create_note': {
          const kind = name === 'obsidian_create_note' ? 'create' : a.target === 'daily' ? 'daily' : a.target === 'note' || str(a.title) ? 'append' : 'note';
          const text = String(a.text == null ? '' : a.text).slice(0, 8000).trim(), title = str(a.title, 80);
          if (!text) return { result: { error: 'nothing to save' } };
          if ((kind === 'create' || kind === 'append') && !title) return { result: { error: 'a title is needed' } };
          if (M && typeof M.confirmWrite === 'function') {
            const c = await M.confirmWrite({ kind, title, text });
            if (isObj(c) && c.text) return { pending: true, text: c.text, speak: c.speak, intent: 'memory_confirm', result: { status: 'waiting for his yes' } };
          }
          if (A && typeof A.addNote === 'function') { const r = A.addNote(text, title); return { text: asText(r), result: { saved: 'on the phone only (Obsidian is not set up)' } }; }
          return { result: { error: 'Obsidian is not available here' } };
        }
        case 'obsidian_search': {
          const v = M && M.vault;
          if (!v || typeof v.search !== 'function') return { result: { error: 'Obsidian is not connected' } };
          const hits = await v.search(str(a.query, 120), 5);
          return { result: { matches: arr(hits).slice(0, 5).map((h) => ({ title: h.title, path: h.path, snippet: str(h.snippet, 300) })) } };
        }
        case 'obsidian_read': {
          const v = M && M.vault;
          if (!v || typeof v.read !== 'function') return { result: { error: 'Obsidian is not connected' } };
          const n = await v.read(str(a.title, 120));
          return { result: n ? { title: n.title, path: n.path, text: str(n.text, 4000) } : { error: `no note called ${str(a.title, 80)}` } };
        }
        case 'add_task': { if (!A || typeof A.addTodo !== 'function') return { result: { error: 'no to-do list here' } }; const r = A.addTodo(str(a.text, 200)); return { text: asText(r), result: { done: asText(r) } }; }
        case 'list_tasks': { if (!A) return { result: { error: 'no to-do list here' } }; return { result: { todos: safe(() => A.todos(), []).slice(0, 20), reminders: safe(() => A.upcoming(), []).slice(0, 10).map((r) => ({ text: r.text, at: new Date(r.at).toISOString() })) } }; }
        case 'set_reminder': { if (!A || typeof A.addReminder !== 'function') return { result: { error: 'reminders are not available here' } }; const r = A.addReminder(str(a.text, 200), str(a.when, 60)); return { text: asText(r), result: { done: asText(r) } }; }
        case 'remember_fact': { if (!A || typeof A.learn !== 'function') return { result: { error: 'memory is not available here' } }; const ok = A.learn(str(a.fact, 300)); return { result: ok ? { kept: str(a.fact, 300) } : { error: 'not kept (empty or a secret)' } }; }
        case 'recall': { if (!A || typeof A.recallText !== 'function') return { result: { error: 'memory is not available here' } }; return { result: { found: A.recallText(str(a.topic, 80)) } }; }
        case 'get_bots_status': { const f = safe(() => E.facts(), null); return { result: f ? { bots: f.bots, priorities: f.priorities, market: f.market, next_window: f.next_window } : { error: 'no live data' } }; }
        case 'get_money': {
          const f = safe(() => E.facts(), null);
          if (!f) return { result: { error: 'no live data' } };
          const pick = (c) => (isObj(c) ? { name: c.name, balance: c.balance, today_pnl: c.today_pnl, week_pnl: c.week_pnl, profit: c.profit, room: c.room, to_target: c.to_target } : null);
          const b = isObj(f.bots) ? f.bots : {};
          return { result: { zlarior: pick(b.zlarior), atlas: pick(b.atlas), blitz: pick(b.blitz), kalshi: isObj(f.kalshi) ? { balance: f.kalshi.balance, today_pnl: f.kalshi.today_pnl, week_pnl: f.kalshi.week_pnl, total_pnl: f.kalshi.total_pnl } : f.kalshi } };
        }
        case 'open_app': {
          const r = typeof E.navigate === 'function' ? safe(() => E.navigate(str(a.app, 60)), null) : null;
          return r && r.open ? { open: r.open, route: r.route, result: { opened: r.open + (r.route ? ' ' + r.route : '') } } : { result: { error: `no app called ${str(a.app, 60)}` } };
        }
        case 'get_weather': { const r = await weather(str(a.place, 60), str(a.day, 20), E); return { result: r.result || { error: r.text }, text: r.text }; }
        case 'wiki_summary': { const r = await wiki(str(a.topic, 100)); return { result: r.result, text: r.text }; }
        case 'web_search': { const r = await search(str(a.query, 160)); return { result: r.result, text: r.text }; }
        case 'calc': {
          const ex = str(a.expression, 200), u = parseUnits(ex);
          if (u) return { result: { answer: u.text } };
          const m = A && typeof A.math === 'function' ? A.math(ex) : null;
          return { result: m ? { answer: m.text } : { error: 'not an expression I can work out' } };
        }
        case 'define': { const r = await define(str(a.word, 40)); return { result: r.result, text: r.text }; }
        case 'time_in': { const r = await timeIn(str(a.place, 60)); return { result: r.result, text: r.text }; }
        default: return { result: { error: `no tool called ${str(name, 40)}` } };
      }
    } catch (e) { return { result: { error: e && e.name === 'AbortError' ? 'timed out' : 'could not reach the service' } }; }
  }
  const safe = (f, d) => { try { return f(); } catch (_) { return d; } };

  // ---------------------------------------------------------------------------------------------- the local answers (no key needed)
  const wrap = async (p) => { try { return await p; } catch (e) { return { text: e && e.name === 'AbortError' ? 'That lookup timed out. Try again in a moment.' : 'I could not reach that service just now (no signal?).', intent: 'tool_error' }; } };
  const placeIn = (q) => { const m = WEATHER_PLACE_RX.exec(q); const p = m ? m[1].replace(/\b(the|today|tomorrow|tonight|weekend|week|now)\b/g, ' ').replace(/\s+/g, ' ').trim() : ''; return p && !/^(general|here|my area|town|the area)$/.test(p) ? p : ''; };
  async function local(raw, q, env, opt) {
    const t = str(q || raw, 300).toLowerCase().replace(/[?!.]+$/, '').trim();
    if (!t) return null;
    const E = isObj(env) ? env : {}, late = !!(opt && opt.late);
    const fresh = ctx && nowMs() - ctx.t < FOLLOW_MS && /^tool_/.test(str(E.lastIntent, 30));
    // follow-ups and corrections on the last tool answer: "and tomorrow?", "what about Miami", "no, I meant Boston"
    if (fresh) {
      const fd = FOLLOW_DAY_RX.exec(t);
      if (fd && ctx.kind === 'weather') return wrap(weather(ctx.place, fd[1] || fd[2], E));
      const cr = CORRECT_RX.exec(t), fp = FOLLOW_PLACE_RX.exec(t), np = cr ? cr[1] || cr[2] : fp ? fp[1] : '';
      if (np && !NOT_PLACE_RX.test(np)) {
        if (ctx.kind === 'weather') return wrap(weather(np.replace(/\b(today|tomorrow|tonight)\b/g, '').trim(), (DAY_RX.exec(np) || [])[1] || ctx.day, E));
        if (ctx.kind === 'time') return wrap(timeIn(np));
        if (ctx.kind === 'wiki' && cr) return wrap(wiki(np));
      }
    }
    if (!late) {
      const u = parseUnits(t);
      if (u) return { text: u.text, speak: u.text, intent: 'tool_units' };
      const ti = TIME_IN_RX.exec(t);
      if (ti) return wrap(timeIn(ti[1] || ti[2] || ti[3]));
      if (WEATHER_RX.test(t) && !NOT_WEATHER_RX.test(t)) { const d = DAY_RX.exec(t); return wrap(weather(placeIn(t), d ? d[1] : '', E)); }
      const df = DEFINE_RX.exec(t);
      if (df) return wrap(define(df[1] || df[2]));
      const lk = /^(?:look up|search for|search|google|wiki|wikipedia)\s+(.{2,80})$/.exec(t);
      if (lk && !/\b(my notes|notes|vault|obsidian|my files)\b/.test(lk[1])) return wrap(search(lk[1]));
      return null;
    }
    // late: after the brain's own answers found nothing ("who is ...", "what is ...", "tell me about ...")
    const m = LOOKUP_RX.exec(t);
    if (!m) return null;
    const topic = m[1].replace(/^(a|an|the) /, '').trim();
    if (!topic || NOT_LOOKUP_RX.test(' ' + topic + ' ') || topic.split(' ').length > 8) return null;
    return wrap(wiki(topic));
  }

  return { defs: DEFS, schema: toolSchema, isWrite: (n) => WRITES.has(n), run, local, weather: (p, d, e) => weather(p, d, e), wiki, define, search, timeIn, get context() { return ctx; } };
}
export default createTools;
