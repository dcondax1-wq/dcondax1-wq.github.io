// PEOPLE OF OLYMPUS, the loaders: each person's own published files, read once and kept for a minute. Read only: GET of this site's JSON, nothing is sent.
//   const D = createData();  await D.roster();  await D.inputs(person)  -> { '<relative url>': json | null }   D.peek(person) (what is already in memory, no network)
// The roster's source paths are written as an app page sees them ('../home.json'); here they are resolved against the site root, so the kit works from any folder.
import { isObj, arr } from './people-core.js';
import { canonHome, withPcFeed } from './truth.js';

const ROOT = (() => { try { return new URL('../', import.meta.url).href; } catch (_) { return '../'; } })();
const TTL = 60000;
export const EXTRA = { builder: ['../ergasterion/builders.json', '../ergasterion/lessons.json', '../ergasterion/queue.json'], scanner: ['../ergasterion/queue.json'], bot: ['../ergasterion/queue.json'], mind: ['../ergasterion/queue.json'], champion: ['../archive/index.json'] };

export async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try {
    const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) });
    if (!r.ok) return null;
    const j = await r.json();
    return isObj(j) || Array.isArray(j) ? j : null;
  } catch (_) { return null; } finally { clearTimeout(timer); }
}
export const siteUrl = (rel) => ROOT + String(rel).replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');

export function createData(opts) {
  const o = opts || {}, get = o.getJSON || getJSON, cache = new Map();
  function one(rel) {
    const hit = cache.get(rel), now = Date.now();
    if (hit && (hit.done ? now - hit.t < TTL : true)) return hit.p;
    const e = { t: now, done: false, v: undefined, p: null };
    // home.json goes through the shared truth (olympus/truth.js): the bots' numbers are the same as on Home, NQ and Aegis (ATLAS and BLITZ
    // live in the board / second / live.pc blocks, which the people kit did not read before QA round 6)
    const fix = rel === '../home.json' ? (v) => (isObj(v) ? withPcFeed(v).then(canonHome) : v) : (v) => v;
    e.p = get(siteUrl(rel), o.timeout || 6000).then(async (v) => { v = await fix(v); e.v = v; e.done = true; e.t = Date.now(); return v; }, () => { e.v = null; e.done = true; return null; });
    cache.set(rel, e);
    return e.p;
  }
  const urlsOf = (p) => { const u = arr(p.sources).concat(EXTRA[p.kind] || []); return u.filter((x, i) => u.indexOf(x) === i); };
  return {
    roster: () => one('../olympus/people.json'),
    urlsOf,
    async inputs(person) { const urls = urlsOf(person), vals = await Promise.all(urls.map(one)), I = {}; urls.forEach((u, i) => { I[u] = vals[i]; }); return I; },
    peek(person) { const I = {}; for (const u of urlsOf(person)) { const h = cache.get(u); I[u] = h && h.done ? h.v : null; } return I; },
    clear() { cache.clear(); },
  };
}
