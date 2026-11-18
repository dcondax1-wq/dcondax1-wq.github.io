// ARENA ledger (ES module): the progress kept on this phone. localStorage 'arena.v1' = { v, events: [event], seen, since }.
// Events are only ever added (one per id): the site keeps 30 days of uptime, the phone keeps what it has seen for good.
// seen = { xp, level, rank_i, earned: [labour ids] } of the last visit, so a level-up plays once.
// The demo never touches the real ledger: it keeps its seen marker in 'arena.demo.seen' and its events in memory.
//   openLedger({ demo }) -> { events(), add(evs) -> new count, seen(), setSeen(s), since(), exportDoc(extra) }
const KEY = 'arena.v1', DEMO_SEEN = 'arena.demo.seen', MAX = 6000;

const read = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export function openLedger({ demo = false } = {}) {
  const raw = demo ? null : read(KEY);
  const doc = isObj(raw) && Array.isArray(raw.events) ? raw : { v: 1, events: [], seen: null, since: Math.floor(Date.now() / 1000) };
  const ids = new Set(doc.events.map((e) => e && e.id));
  let seen = demo ? read(DEMO_SEEN) : doc.seen;
  const save = () => { if (!demo) write(KEY, doc); };
  return {
    demo,
    events: () => doc.events.slice(),
    add(evs) {
      let n = 0;
      for (const e of Array.isArray(evs) ? evs : []) {
        if (!isObj(e) || typeof e.id !== 'string' || ids.has(e.id)) continue;
        ids.add(e.id);
        doc.events.push({ id: e.id, day: e.day, kind: e.kind, src: e.src, ...(e.t ? { t: e.t } : {}), ...(e.note ? { note: String(e.note).slice(0, 160) } : {}) });
        n++;
      }
      if (doc.events.length > MAX) doc.events.splice(0, doc.events.length - MAX);
      if (n) save();
      return n;
    },
    seen: () => (isObj(seen) ? seen : null),
    setSeen(s) { seen = s; if (demo) write(DEMO_SEEN, s); else { doc.seen = s; save(); } },
    since: () => doc.since,
    /** the export: every event with its source, and the score it gives (a JSON file the owner keeps) */
    exportDoc(extra = {}) {
      return { kind: 'olympus-arena-export', v: 1, exported: new Date().toISOString(), demo, since: doc.since, ...extra, events: doc.events.slice() };
    },
  };
}
