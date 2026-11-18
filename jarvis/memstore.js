// Jarvis memory store (2026-11-10, JARVIS BRAIN): what the owner tells Jarvis to remember ("remember that I trade best before
// 10", "I prefer short answers"), kept on this phone only, searchable, exportable and importable. One ES module, no imports, no DOM.
//
//   import { createMemStore, MEM_KEY } from './memstore.js';
//   const mem = createMemStore({ storage?, now? });          now() -> ms (tests)
//   mem.remember(text, { kind? })  -> { ok, item, replaced? } | { ok: false, reason }     kind: 'fact' | 'pref' | 'note'
//   mem.search(query, n?)          -> [{ item, score }]     fuzzy: words, stems, small typos; best first
//   mem.list() / mem.get(id) / mem.count()
//   mem.forget(idOrQuery)          -> { ok, removed: [items] }
//   mem.clear()                    -> n removed
//   mem.exportJson()               -> string      the Settings-compatible file (below)
//   mem.importJson(text, { mode: 'merge' | 'replace' }) -> { ok, added, skipped, reason? }
//   mem.prefs()                    -> { name?, style? ... } the preferences, as key -> text (the nudges and the brain read them)
//
// Storage key (this phone only): `jarvis.memory.v1` = { v: 1, items: [{ id, t, u, kind, text, tags: [word] }] }. It starts with
// `jarvis.`, so Settings > Storage lists it under Jarvis and its Export / Import (settings/settingscore.js `olympus-data`) carries
// it with every other key; mem.exportJson() is the same envelope for this key alone ({ v: 1, kind: 'olympus-data', t, keys: {
// 'jarvis.memory.v1': '<the text above>' }, kept: [] }), so either file imports with either button. Passwords, API keys, tokens and
// card numbers are refused and never kept. iPhone Safari 16: plain ES2020.

import { norm, tokens, fuzzyEq } from './router.js';

export const MEM_KEY = 'jarvis.memory.v1';
export const MAX_ITEMS = 400;
export const MAX_TEXT = 400;
const SECRET_RX = /\b(password|passcode|pass code|pin code|pin is|api key|secret key|private key|seed phrase|recovery phrase|ssn|social security)\b|\b(gsk_|sk-|sk_live|AIza|github_pat_|ghp_|xox[bp]-)[A-Za-z0-9_-]{6,}|\b(?:\d[ -]?){13,19}\b/i;
export const hasSecret = (s) => SECRET_RX.test(String(s || ''));
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const STOP = new Set(['that', 'this', 'with', 'about', 'what', 'when', 'have', 'from', 'your', 'they', 'them', 'then', 'than', 'there', 'would', 'could', 'should', 'into', 'just', 'like', 'also', 'were', 'been', 'being', 'will', 'does', 'said', 'told', 'say']);
const stem = (t) => { let x = t; if (x.length > 4) x = x.replace(/(ing|ed|es|s)$/, ''); return x.length > 3 ? x.replace(/e$/, '') : x; };
const keywords = (s) => tokens(s).filter((t) => t.length >= 3 && !STOP.has(t));
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
const PREF_RX = /\b(i prefer|i like|i love|i hate|i don't like|i do not like|i always|i never|call me|my name is|from now on|please always|please never|i want (?:you )?to|keep (?:it|answers) |short answers|long answers|no emojis)\b/i;

export function createMemStore(opts) {
  const o = isObj(opts) ? opts : {};
  const nowMs = () => { const n = typeof o.now === 'function' ? o.now() : Date.now(); return n instanceof Date ? n.getTime() : Number(n) || Date.now(); };
  const store = () => { if (o.storage) return o.storage; try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
  let D = null;
  const uid = () => 'm' + nowMs().toString(36) + Math.random().toString(36).slice(2, 6);
  function cleanItem(x) {
    if (!isObj(x)) return null;
    const text = clean(x.text);
    if (!text || hasSecret(text)) return null;
    const kind = ['fact', 'pref', 'note'].includes(x.kind) ? x.kind : 'fact';
    const t = Number.isFinite(x.t) ? x.t : nowMs();
    return { id: clean(x.id).slice(0, 24).replace(/[^\w-]/g, '') || uid(), t, u: Number.isFinite(x.u) ? x.u : t, kind, text, tags: keywords(text).slice(0, 8) };
  }
  function normalise(raw) {
    const items = [], seen = new Set();
    for (const x of Array.isArray(raw && raw.items) ? raw.items : []) { const it = cleanItem(x); if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); } }
    return { v: 1, items: items.slice(-MAX_ITEMS) };
  }
  function load() {
    if (D) return D;
    let raw = null;
    try { const st = store(); raw = st ? JSON.parse(st.getItem(MEM_KEY) || 'null') : null; } catch (_) { raw = null; }
    D = normalise(raw);
    return D;
  }
  function save() { try { const st = store(); if (st) st.setItem(MEM_KEY, JSON.stringify(D)); return true; } catch (_) { return false; } }

  function score(it, qk, qtoks) {
    if (!qk.length) return 0;
    let s = 0;
    const words = tokens(it.text);
    for (const w of qk) { if (words.some((x) => x === w)) s += 1; else if (words.some((x) => stem(x) === stem(w) || fuzzyEq(w, x) || fuzzyEq(x, w))) s += 0.7; }
    const joined = norm(it.text);
    if (qtoks.length > 1 && joined.indexOf(qtoks.join(' ')) >= 0) s += 1;
    return s / qk.length;
  }
  function search(query, n) {
    const d = load(), qk = keywords(query), qt = tokens(query);
    return d.items.map((item) => ({ item, score: score(item, qk, qt) })).filter((r) => r.score >= 0.5).sort((a, b) => (b.score - a.score) || (b.item.u - a.item.u)).slice(0, n || 5);
  }
  function remember(text, opt) {
    const t = clean(text).replace(/^(that|to)\s+/i, '');
    if (!t) return { ok: false, reason: 'empty' };
    if (hasSecret(t)) return { ok: false, reason: 'secret' };
    const d = load(), kind = (opt && opt.kind) || (PREF_RX.test(t) ? 'pref' : 'fact');
    const dup = d.items.find((x) => norm(x.text) === norm(t));
    if (dup) { dup.u = nowMs(); save(); return { ok: true, item: dup, replaced: true }; }
    // the same subject said again replaces the older line ("I prefer short answers" then "I prefer long answers")
    const subj = /^(i prefer|my [a-z ]{2,30}? is|i (?:usually |always )?(?:trade|like|want)\b[a-z ]{0,14})/i.exec(t);
    let old = null;
    if (subj) old = d.items.find((x) => x.kind === kind && norm(x.text).startsWith(norm(subj[1]).slice(0, 18)) && norm(x.text) !== norm(t));
    const it = cleanItem({ id: old ? old.id : uid(), t: old ? old.t : nowMs(), u: nowMs(), kind, text: t });
    if (!it) return { ok: false, reason: 'secret' };
    if (old) d.items[d.items.indexOf(old)] = it; else { d.items.push(it); if (d.items.length > MAX_ITEMS) d.items.shift(); }
    save();
    return { ok: true, item: it, replaced: !!old, previous: old ? old.text : undefined };
  }
  function forget(q) {
    const d = load();
    const byId = d.items.find((x) => x.id === q);
    let hit = byId ? [byId] : [];
    if (!hit.length) { const r = search(q, 3); hit = r.length && r[0].score >= 0.75 ? r.filter((x) => x.score >= r[0].score - 0.01).map((x) => x.item) : []; }
    if (!hit.length) return { ok: false, removed: [] };
    d.items = d.items.filter((x) => !hit.includes(x));
    save();
    return { ok: true, removed: hit };
  }
  function exportJson() {
    const d = load();
    const inner = JSON.stringify({ v: 1, items: d.items });
    return JSON.stringify({ v: 1, kind: 'olympus-data', t: Math.round(nowMs() / 1000), keys: { [MEM_KEY]: inner }, kept: [] }, null, 1);
  }
  function importJson(text, opt) {
    let j;
    try { j = JSON.parse(String(text || '')); } catch (_) { return { ok: false, added: 0, skipped: 0, reason: 'That is not a JSON file.' }; }
    let inner = null;
    if (isObj(j) && j.kind === 'olympus-data' && isObj(j.keys) && typeof j.keys[MEM_KEY] === 'string') { try { inner = JSON.parse(j.keys[MEM_KEY]); } catch (_) { inner = null; } }
    else if (isObj(j) && Array.isArray(j.items)) inner = j;
    else if (Array.isArray(j)) inner = { items: j.map((x) => (typeof x === 'string' ? { text: x } : x)) };
    if (!inner) return { ok: false, added: 0, skipped: 0, reason: 'No Jarvis memory in this file.' };
    const incoming = Array.isArray(inner.items) ? inner.items.slice(0, MAX_ITEMS * 2) : [];
    const d = load();
    let added = 0, skipped = 0;
    if (opt && opt.mode === 'replace') d.items = [];
    for (const x of incoming) {
      const it = cleanItem(isObj(x) ? { ...x, id: '' } : { text: x });
      if (!it) { skipped++; continue; }
      if (d.items.some((y) => norm(y.text) === norm(it.text))) { skipped++; continue; }
      d.items.push(it); added++;
    }
    d.items = d.items.slice(-MAX_ITEMS);
    save();
    return { ok: true, added, skipped };
  }
  function prefs() {
    const out = {};
    for (const it of load().items) if (it.kind === 'pref') {
      const m = /^(?:call me|my name is)\s+(.{1,30})$/i.exec(it.text); if (m) out.name = m[1];
      if (/\b(short|brief|quick) answers?\b|\bkeep (?:it|answers) short\b/i.test(it.text)) out.style = 'short';
      if (/\b(long|detailed|chatty) answers?\b/i.test(it.text)) out.style = 'chatty';
    }
    return out;
  }
  return {
    remember, search, forget, exportJson, importJson, prefs,
    list: () => load().items.slice().reverse(), get: (id) => load().items.find((x) => x.id === id) || null, count: () => load().items.length,
    clear: () => { const n = load().items.length; D = { v: 1, items: [] }; save(); return n; }, reload: () => { D = null; return load().items.length; },
  };
}
export default createMemStore;
