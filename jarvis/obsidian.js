// Jarvis x Obsidian (owner 2026-11-02: "everything connected to my Obsidian"): the owner's vault, read and appended to from
// the phone. One ES module, no imports, no DOM (tests/test_jarvis_obsidian.py drives it in node with a mocked GitHub API).
//
// How it connects (free, phone-first): the Obsidian Git plugin syncs the vault to a PRIVATE GitHub repo; Jarvis reads that
// repo with a fine-grained token (Contents: read and write, that one repo only) the owner pastes once. The token lives only in
// this phone's localStorage ('jarvis.vault') and is sent only to https://api.github.com (gh() refuses any other address). The
// notes are cached only on this phone (IndexedDB, else memory). Nothing personal is in this file or on the public site.
// Without GitHub: importNote() keeps pasted / shared notes on the phone, and confirmed writes wait in an outbox that is sent
// once the vault is connected.
//
//   import { createVault } from './obsidian.js';
//   const vault = createVault({ fetch?, storage?, kv?, now? });
//   vault.connect({ repo: 'owner/obsidian-vault', token, branch? }) -> Promise<status>   (checks the repo, indexes, seeds Me.md)
//   vault.disconnect()            wipes the token, the index, pasted notes, the outbox and the cached profile from this phone
//   vault.status()                { connected, repo, branch, notes, local, outbox, at, state, error }
//   vault.sync({ force })         incremental: the tree SHA first, then only the notes whose blob SHA changed
//   vault.search(q, n)            BM25 over titles, headings, tags and text -> [{ path, title, score, snippet }]
//   vault.daily(ymd) / tasks() / recent(days, ymd) / goals() / links(name) / me()
//   vault.write(kind, text, ymd, { title }?)  append-only: 'note' | 'task' | 'remember' | 'me' | 'log' | 'daily' (today's daily
//                                 note) | 'append' (a named note) | 'create' (OLYMPUS/Notes/<title>.md, appended if it exists)
//                                 -> { ok, paths, local? }
//   vault.resolve(kind, title)    -> Promise<{ path, exists, title }> where that write would land (said in the confirmation)
//   vault.read(title)             -> Promise<{ title, path, text } | null> one note as plain words
//   vault.importNote(title, text) a pasted note, kept and indexed on this phone only
// Every method is total: junk in, an answer out; network errors become a state, never an exception to the caller (except
// connect(), which rejects with a plain message the shell shows).

export const API = 'https://api.github.com';
export const CFG_KEY = 'jarvis.vault';                 // { repo, token, branch } (this phone only)
const OUTBOX_KEY = 'jarvis.vault.outbox';               // confirmed writes waiting for a connection
const LOCAL_KEY = 'jarvis.vault.local';                 // pasted / shared notes (no GitHub)
const IDX_KEY = 'vault.index.v1';                       // the index in kv
export const LEARNED_KEY = 'jarvis.vault.learned';      // what Jarvis saved or learned: [{ t (unix s), text, note (path) | null }]
export const PATHS = { inbox: 'OLYMPUS/Inbox', memory: 'OLYMPUS/Jarvis/Memory.md', me: 'OLYMPUS/Jarvis/Me.md', logs: 'OLYMPUS/Logs', notes: 'OLYMPUS/Notes' };
export const KINDS = ['note', 'task', 'remember', 'me', 'log', 'daily', 'append', 'create'];
const BLOCK_KINDS = ['append', 'create'];
const MAX_NOTES = 2000, MAX_FETCH = 400, MAX_BYTES = 300000, TEXT_CUT = 12000, CONC = 6;
const REPO_RX = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

// the starter profile (generic, nothing private): seeded once into OLYMPUS/Jarvis/Me.md, then the owner's own file
export const ME_TEMPLATE = `# Me (how Jarvis should think)

Jarvis reads this note to prioritize and phrase answers the way I would. Edit it freely; Jarvis only ever appends.

## How I work
- Money first: say the dollars at risk and the dollars made, then the rest.
- Results, not talk: short answers, the one action first.
- Tables when reporting: what was done, the numbers, what is next.
- I hate repeating manual steps: automate it or fold it into one tap.
- Quality bar: insane level. If it does not work, say so plainly.

## Trading rules (never break)
- The stop sits beyond the sweep extreme (the protected high / low), never a fixed distance.
- Size follows the stop: a wider stop means fewer micros.
- One clear target, no greed.
- 2-4 trades a week.
- Pass evals within 2 weeks; never more than 3.
- Paper and Sim by default: I arm live myself.

## What I am building: OLYMPUS
- The NQ trading bots (Zlarior on the MFFU 50K, ATLAS, BLITZ).
- The Kalshi bot.
- Ascend (self-improvement).
- The Planner.
- Jarvis, the home of it all.

## Preferences Jarvis learned
`;

// ------------------------------------------------------------------------------------------------ helpers
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, n) => (typeof x === 'string' ? x : x == null ? '' : String(x)).slice(0, n || 100000);
function b64encode(s) {
  const b = new TextEncoder().encode(String(s));
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(s) {
  const bin = atob(String(s || '').replace(/\s+/g, ''));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}
export function ymdOf(ms) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  catch (_) { return new Date(ms).toISOString().slice(0, 10); }
}
function hmOf(ms) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)); }
  catch (_) { return new Date(ms).toISOString().slice(11, 16); }
}
// one line of the owner's words, safe to append to Markdown: no line breaks, no leading list / heading marks
export const cleanLine = (s) => str(s, 1000).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[#>\-*+\s]+/, '').slice(0, 600);
// a block of the owner's (or the model's) Markdown for a note body: no frontmatter fence, at most 8,000 characters
export const cleanBlock = (s) => str(s, 9000).replace(/\r/g, '').replace(/^\s*---\s*$/gm, '—').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
// a note title safe as a file name: no path parts, no Obsidian link marks
export const cleanTitle = (s) => cleanLine(s).replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\.+$/, '').replace(/\s+/g, ' ').trim().slice(0, 80);
// a path Jarvis may append to: a Markdown note, never a hidden / system folder or a path that climbs out
export const safePath = (p) => typeof p === 'string' && /\.md$/i.test(p) && !/(^|\/)\.\.?(\/|$)/.test(p) && !/(^|\/)\.(obsidian|git|trash)(\/|$)/.test(p) && !/^\//.test(p) && p.length < 300;

// ------------------------------------------------------------------------------------------------ parsing a note
const STOP = new Set('a an and are as at be but by for from has have i in is it its me my of on or our so that the this to was we what when where which who why will with you your about did do does not no yes up out how all any can just than then them they there these those were been into over very more most also if'.split(' '));
export function tokens(s) {
  const out = [];
  for (let w of String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)) {
    if (!w || w.length < 2 || STOP.has(w)) continue;
    if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
    else if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.push(w);
  }
  return out;
}
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  let lastKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      lastKey = kv[1].toLowerCase();
      let v = kv[2].trim();
      if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      else v = v.replace(/^["']|["']$/g, '');
      fm[lastKey] = v;
    } else if (lastKey && /^\s*-\s+/.test(line)) {
      const v = line.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '');
      fm[lastKey] = (Array.isArray(fm[lastKey]) ? fm[lastKey] : fm[lastKey] ? [fm[lastKey]] : []).concat(v);
    }
  }
  return { fm, body: text.slice(m[0].length) };
}
export function parseNote(path, text) {
  path = str(path, 400); text = str(text, MAX_BYTES);
  const { fm, body } = frontmatter(text);
  const file = path.split('/').pop().replace(/\.md$/i, '');
  const title = str(fm.title || file, 200);
  const tags = new Set(arr(Array.isArray(fm.tags) ? fm.tags : fm.tags ? String(fm.tags).split(/[ ,]+/) : []).map((t) => String(t).replace(/^#/, '').toLowerCase()).filter(Boolean));
  for (const m of body.matchAll(/(^|\s)#([A-Za-z][\w/-]{1,40})/g)) tags.add(m[2].toLowerCase());
  const links = [];
  for (const m of body.matchAll(/\[\[([^\]|#]{1,200})(#[^\]|]*)?(\|[^\]]*)?\]\]/g)) { const l = m[1].trim(); if (l && !links.includes(l)) links.push(l); }
  const headings = [], tasks = [];
  const lines = body.split(/\r?\n/);
  lines.forEach((ln, i) => {
    const h = /^(#{1,6})\s+(.+)$/.exec(ln);
    if (h) headings.push(h[2].trim().slice(0, 160));
    const t = /^\s*[-*+]\s+\[([ xX/-])\]\s+(.+)$/.exec(ln);
    if (t) tasks.push({ text: t[2].trim().slice(0, 300), done: t[1] !== ' ', line: i + 1 });
  });
  // a daily note: its file name (or frontmatter date in a daily folder) is a date
  const dm = /(^|[^0-9])(20\d\d)-(\d\d)-(\d\d)([^0-9]|$)/.exec(file);
  let daily = dm ? `${dm[2]}-${dm[3]}-${dm[4]}` : null;
  if (!daily && /(^|\/)(daily|journal|dailies|daily notes)\//i.test(path) && /^20\d\d-\d\d-\d\d/.test(str(fm.date, 10))) daily = str(fm.date, 10);
  if (path.startsWith(PATHS.inbox + '/')) daily = null;          // Jarvis's own inbox pages are not the owner's daily notes
  return { path, title, fm, tags: [...tags].slice(0, 40), links: links.slice(0, 80), headings: headings.slice(0, 60), tasks: tasks.slice(0, 200),
    daily, text: body.slice(0, TEXT_CUT), len: body.length, words: (body.match(/\S+/g) || []).length };
}
// Markdown -> plain words for a spoken / chat answer: no heading marks, task boxes, link brackets, emphasis or code fences
export function plainText(md) {
  return str(md).replace(/```[\s\S]*?```/g, ' ').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*[-*+]\s+\[[ xX/-]\]\s+/gm, '').replace(/^\s*[-*+]\s+/gm, '')
    .replace(/!?\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (m0, a, b, c) => c || a).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/(\*\*|__|`)/g, '');
}
function snippetOf(note, qt) {
  const body = plainText(note.text).replace(/\s+/g, ' ').trim();
  if (!body) return '';
  const low = body.toLowerCase();
  let best = -1;
  for (const t of qt) { const i = low.indexOf(t); if (i >= 0 && (best < 0 || i < best)) best = i; }
  const a = Math.max(0, best < 0 ? 0 : best - 80), z = Math.min(body.length, a + 240);
  return (a > 0 ? '…' : '') + body.slice(a, z).trim() + (z < body.length ? '…' : '');
}

// ------------------------------------------------------------------------------------------------ storage
// one store per page (the Mind page reads the same IndexedDB through graphSnapshot)
let sharedKV = null;
const defaultKV = () => sharedKV || (sharedKV = idbKV() || memKV());
function memKV() { const m = new Map(); return { async get(k) { return m.has(k) ? m.get(k) : null; }, async set(k, v) { m.set(k, v); }, async del(k) { m.delete(k); } }; }
function idbKV() {
  if (typeof indexedDB === 'undefined') return null;
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open('jarvis-vault', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }));
  const tx = (mode, fn) => db().then((d) => new Promise((ok, no) => { const t = d.transaction('kv', mode), s = t.objectStore('kv'), q = fn(s); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); }));
  return {
    async get(k) { try { const v = await tx('readonly', (s) => s.get(k)); return v == null ? null : v; } catch (_) { return null; } },
    async set(k, v) { try { await tx('readwrite', (s) => s.put(v, k)); } catch (_) { /* full or blocked: memory only */ } },
    async del(k) { try { await tx('readwrite', (s) => s.delete(k)); } catch (_) { /* nothing kept */ } },
  };
}

// ------------------------------------------------------------------------------------------------ the vault
export function createVault(opts) {
  const o = isObj(opts) ? opts : {};
  const doFetch = (...a) => (typeof o.fetch === 'function' ? o.fetch : fetch)(...a);
  const ls = () => { if (o.storage) return o.storage; try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
  const kv = o.kv || defaultKV();
  const nowMs = () => { try { const t = o.now ? o.now() : Date.now(); return t instanceof Date ? t.getTime() : +t || Date.now(); } catch (_) { return Date.now(); } };
  const lget = (k, d) => { try { const s = ls(); const v = s ? s.getItem(k) : null; return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const lset = (k, v) => { try { const s = ls(); if (s) { if (v == null) s.removeItem(k); else s.setItem(k, JSON.stringify(v)); } } catch (_) { /* private mode */ } };

  let cfg = (() => { const c = lget(CFG_KEY, null); return isObj(c) && REPO_RX.test(str(c.repo)) && str(c.token) ? { repo: c.repo, token: c.token, branch: str(c.branch, 100) || '' } : null; })();
  let IX = { sha: null, at: 0, notes: [] };
  let st = { state: cfg ? 'idle' : 'off', error: '' };
  let loaded = null, busy = null, rateUntil = 0, stats = null;
  const load = () => loaded || (loaded = kv.get(IDX_KEY).then((v) => { if (isObj(v) && Array.isArray(v.notes) && cfg && v.repo === cfg.repo) IX = { sha: v.sha || null, at: +v.at || 0, notes: v.notes }; stats = null; }).catch(() => null));

  // the only network call: GitHub's API with the token; any other address is refused
  async function gh(path, init) {
    if (!cfg) throw new Error('Obsidian is not connected');
    if (Date.now() < rateUntil) { const e = new Error('GitHub rate limit: try again later'); e.status = 429; throw e; }
    const url = API + path;
    let origin = '';
    try { origin = new URL(url).origin; } catch (_) { origin = ''; }
    if (origin !== API || !path.startsWith('/')) throw new Error('refused');     // the token goes to api.github.com only
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ac ? setTimeout(() => ac.abort(), 15000) : 0;
    try {
      const r = await doFetch(url, { ...(init || {}), signal: ac ? ac.signal : undefined, cache: 'no-cache',
        headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...((init && init.headers) || {}) } });
      if (r && (r.status === 403 || r.status === 429)) {
        const rem = r.headers && typeof r.headers.get === 'function' ? r.headers.get('x-ratelimit-remaining') : null;
        const reset = r.headers && typeof r.headers.get === 'function' ? +r.headers.get('x-ratelimit-reset') : 0;
        if (r.status === 429 || rem === '0') rateUntil = reset ? reset * 1000 : Date.now() + 15 * 60e3;
      }
      return r;
    } finally { if (t) clearTimeout(t); }
  }
  const errText = (r) => (r.status === 401 ? 'GitHub refused the token (expired or mistyped): make a new one and paste it again'
    : r.status === 403 ? 'the token cannot read this repo: give it Contents read and write on this repo'
      : r.status === 404 ? 'repo not found for this token (check the name, and that the token has access to it)' : `GitHub error ${r.status}`);

  async function connect(c) {
    const repo = str(c && c.repo, 220).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    const token = str(c && c.token, 400).trim();
    if (!REPO_RX.test(repo)) throw new Error('Type the repo as owner/name, e.g. demetrades2000-coder/obsidian-vault');
    if (!token || /\s/.test(token)) throw new Error('Paste the token (it starts with github_pat_)');
    const prev = cfg;
    cfg = { repo, token, branch: str(c && c.branch, 100).trim() };
    try {
      const r = await gh(`/repos/${repo}`);
      if (!r || !r.ok) throw new Error(errText(r || { status: 0 }));
      const j = await r.json();
      if (!cfg.branch) cfg.branch = str(j && j.default_branch, 100) || 'main';
    } catch (e) { cfg = prev; throw new Error(String((e && e.message) || e).replace(token, '***')); }
    lset(CFG_KEY, cfg);
    IX = { sha: null, at: 0, notes: [] }; loaded = Promise.resolve(); stats = null;
    st = { state: 'idle', error: '' };
    await sync({ force: true });
    if (!IX.notes.some((n) => n.path === PATHS.me)) await appendTo(PATHS.me, ME_TEMPLATE, true).catch(() => null);
    await flush();
    return status();
  }
  async function disconnect() {
    cfg = null; lset(CFG_KEY, null); lset(OUTBOX_KEY, null); lset(LOCAL_KEY, null); lset(LEARNED_KEY, null);
    IX = { sha: null, at: 0, notes: [] }; stats = null; loaded = Promise.resolve();
    await kv.del(IDX_KEY);
    st = { state: 'off', error: '' };
    notify();
    return status();
  }
  function status() {
    return { connected: !!cfg, repo: cfg ? cfg.repo : '', branch: cfg ? cfg.branch : '', notes: IX.notes.length, local: arr(lget(LOCAL_KEY, [])).length,
      outbox: arr(lget(OUTBOX_KEY, [])).length, at: IX.at, state: st.state, error: st.error };
  }

  // incremental: the branch's tree; unchanged tree SHA = nothing to do; else only the notes whose blob SHA changed
  async function sync(x) {
    if (!cfg) return status();
    if (busy) return busy;
    busy = (async () => {
      await load();
      st.state = 'syncing';
      try {
        const r = await gh(`/repos/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch || 'main')}?recursive=1`);
        if (!r || !r.ok) throw new Error(errText(r || { status: 0 }));
        const tree = await r.json();
        if (!(x && x.force) && tree.sha && tree.sha === IX.sha) { st = { state: 'ok', error: '' }; IX.at = nowMs(); return status(); }
        const blobs = arr(tree.tree).filter((b) => isObj(b) && b.type === 'blob' && /\.md$/i.test(str(b.path)) && !/(^|\/)\.(obsidian|trash|git)\//.test(str(b.path)) && !(+b.size > MAX_BYTES)).slice(0, MAX_NOTES);
        const old = new Map(IX.notes.map((n) => [n.path, n]));
        const keep = [], need = [];
        for (const b of blobs) { const n = old.get(b.path); if (n && n.sha === b.sha) keep.push(n); else need.push(b); }
        const got = [];
        let i = 0, partial = need.length > MAX_FETCH;
        const work = need.slice(0, MAX_FETCH);
        await Promise.all(Array.from({ length: Math.min(CONC, work.length) }, async () => {
          while (i < work.length) {
            const b = work[i++];
            try {
              const br = await gh(`/repos/${cfg.repo}/git/blobs/${b.sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
              if (!br || !br.ok) { partial = true; if (old.get(b.path)) got.push(old.get(b.path)); continue; }
              got.push({ ...parseNote(b.path, await br.text()), sha: b.sha, seen: Math.floor(nowMs() / 1000) });
            } catch (_) { partial = true; if (old.get(b.path)) got.push(old.get(b.path)); }
          }
        }));
        IX = { sha: partial ? null : tree.sha, at: nowMs(), notes: keep.concat(got) };
        stats = null;
        await kv.set(IDX_KEY, { repo: cfg.repo, sha: IX.sha, at: IX.at, notes: IX.notes });
        notify();
        st = { state: partial ? 'partial' : 'ok', error: partial ? 'some notes are still loading (GitHub limits): they arrive on the next sync' : '' };
      } catch (e) { st = { state: 'error', error: String((e && e.message) || e) }; }
      return status();
    })().finally(() => { busy = null; });
    return busy;
  }

  // ---------------------------------------------------------------------------------------------- reading
  async function all() { await load(); const loc = arr(lget(LOCAL_KEY, [])).filter(isObj).map((n) => ({ ...parseNote(n.path, n.text), local: true })); return IX.notes.concat(loc); }
  function buildStats(notes) {
    const docs = notes.map((n) => {
      const tf = new Map();
      const add = (s, w) => { for (const t of tokens(s)) tf.set(t, (tf.get(t) || 0) + w); };
      add(n.title, 3); add(n.headings.join(' '), 2); add(n.tags.join(' '), 2); add(n.text, 1);
      let len = 0; for (const v of tf.values()) len += v;
      return { n, tf, len, tt: new Set(tokens(n.title)), tg: new Set(tokens(n.tags.join(' ') + ' ' + n.headings.join(' '))), low: (n.title + ' ' + n.text).toLowerCase() };
    });
    const df = new Map();
    for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
    return { docs, df, avg, N: docs.length };
  }
  async function search(q, n) {
    const notes = await all();
    if (!stats || stats.N !== notes.length) stats = buildStats(notes);
    const qt = [...new Set(tokens(q))];
    if (!qt.length) return [];
    const k1 = 1.4, b = 0.75, out = [];
    // ranking beyond BM25 (2026-11-04): the words in the TITLE or a heading / tag count extra, a note that holds every word beats one that
    // holds a few, the exact phrase wins, a recent daily note edges ahead of an old one, and Jarvis's own inbox / log pages rank
    // below the notes the owner wrote himself
    const phrase = String(q || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const today = Date.parse(ymdOf(nowMs()) + 'T12:00:00Z');
    for (const d of stats.docs) {
      let s = 0, hit = 0, inTitle = 0, inTag = 0;
      for (const t of qt) {
        const f = d.tf.get(t);
        if (!f) continue;
        hit++; if (d.tt.has(t)) inTitle++; if (d.tg.has(t)) inTag++;
        const idf = Math.log(1 + (stats.N - stats.df.get(t) + 0.5) / (stats.df.get(t) + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / stats.avg));
      }
      if (s <= 0) continue;
      s *= 1 + 0.5 * (inTitle / qt.length) + 0.2 * (inTag / qt.length);
      s *= 0.55 + 0.45 * (hit / qt.length);
      if (qt.length > 1 && phrase.length > 4 && d.low.includes(phrase)) s *= 1.25;
      if (d.n.daily) { const age = (today - Date.parse(d.n.daily + 'T12:00:00Z')) / 864e5; if (age >= 0 && age < 30) s *= 1 + 0.12 * (1 - age / 30); }
      if (/^OLYMPUS\/(Inbox|Logs)\//.test(d.n.path)) s *= 0.8;
      out.push({ path: d.n.path, title: d.n.title, score: Math.round(s * 1000) / 1000, snippet: snippetOf(d.n, qt), local: !!d.n.local, terms: hit, daily: d.n.daily || null });
    }
    return out.sort((x, y) => y.score - x.score).slice(0, n || 5);
  }
  async function daily(ymd) { const day = str(ymd, 10) || ymdOf(nowMs()); return (await all()).find((x) => x.daily === day) || null; }
  async function tasks() {
    const notes = await all(), out = [];
    for (const x of notes.slice().sort((a, b) => String(b.daily || '').localeCompare(String(a.daily || '')))) for (const t of x.tasks) if (!t.done) out.push({ text: t.text, note: x.title, path: x.path });
    return out;
  }
  async function recent(days, ymd) {
    const end = str(ymd, 10) || ymdOf(nowMs()), start = ymdOf(Date.parse(end + 'T12:00:00Z') - Math.max(0, (days || 7) - 1) * 864e5);
    const notes = (await all()).filter((x) => x.daily && x.daily >= start && x.daily <= end).sort((a, b) => b.daily.localeCompare(a.daily));
    const inbox = (await all()).filter((x) => x.path.startsWith(PATHS.inbox + '/') && x.path.slice(-13, -3) >= start && x.path.slice(-13, -3) <= end);
    const tf = new Map();
    const skip = /^(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|today|week|daily|inbox|remember|jarvis|note|call)$/;
    for (const x of notes.concat(inbox)) {          // themes: the tags count three times, the words once (no dates, no filler)
      for (const t of x.tags) if (!skip.test(t)) tf.set(t, (tf.get(t) || 0) + 3);
      for (const t of tokens(x.text)) if (t.length > 3 && !/^\d+$/.test(t) && !skip.test(t)) tf.set(t, (tf.get(t) || 0) + 1);
    }
    const themes = [...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
    return { start, end, notes, inbox, themes };
  }
  async function goals() {
    const notes = await all();
    return notes.filter((x) => /\bgoals?\b/i.test(x.title) || x.tags.some((t) => /^goals?$/.test(t)) || x.headings.some((h) => /\bgoals?\b/i.test(h)))
      .sort((a, b) => (/\bgoals?\b/i.test(b.title) ? 1 : 0) - (/\bgoals?\b/i.test(a.title) ? 1 : 0)).slice(0, 5);
  }
  async function links(name) {
    const notes = await all(), want = str(name, 200).toLowerCase().trim();
    const n = notes.find((x) => x.title.toLowerCase() === want) || notes.find((x) => x.title.toLowerCase().includes(want));
    if (!n) return null;
    const back = notes.filter((x) => x !== n && x.links.some((l) => l.toLowerCase() === n.title.toLowerCase() || l.toLowerCase().endsWith('/' + n.title.toLowerCase()))).map((x) => x.title);
    return { title: n.title, path: n.path, out: n.links.slice(0, 20), back: back.slice(0, 20) };
  }
  async function me() {
    const n = (await all()).find((x) => x.path === PATHS.me);
    const extra = arr(lget(OUTBOX_KEY, [])).filter((w) => w && w.kind === 'me').map((w) => '- ' + w.text);
    return (n ? n.text : ME_TEMPLATE) + (extra.length ? '\n' + extra.join('\n') : '');
  }

  // ---------------------------------------------------------------------------------------------- writing (append only)
  async function appendTo(path, block, createOnly, header) {
    const p = `/repos/${cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await gh(p + `?ref=${encodeURIComponent(cfg.branch || 'main')}`);
      let old = '', sha;
      if (r.ok) { if (createOnly) return { ok: true, skipped: true }; const j = await r.json(); sha = j.sha; old = b64decode(j.content); }
      else if (r.status !== 404) throw new Error(errText(r));
      const text = old ? old + (old.endsWith('\n') ? '' : '\n') + block : (header && header !== block ? header : '') + block;
      if (old && !text.startsWith(old)) throw new Error('refused: not an append');
      const body = { message: `Jarvis: append to ${path}`, content: b64encode(text), branch: cfg.branch || 'main' };
      if (sha) body.sha = sha;
      const w = await gh(p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (w.ok) {
        const n = IX.notes.findIndex((x) => x.path === path), parsed = { ...parseNote(path, text), sha: null, seen: Math.floor(nowMs() / 1000) };
        if (n >= 0) IX.notes[n] = parsed; else IX.notes.push(parsed);
        IX.sha = null; stats = null;
        await kv.set(IDX_KEY, { repo: cfg.repo, sha: IX.sha, at: IX.at, notes: IX.notes });
        notify();
        return { ok: true };
      }
      if (w.status !== 409 && w.status !== 422) throw new Error(errText(w));
    }
    throw new Error('the note changed while saving: try again');
  }
  // where a named note lives: the owner's own note with that title (exact, then the closest), else a new OLYMPUS/Notes/<title>.md
  async function resolve(kind, title) {
    const t = cleanTitle(title), day = ymdOf(nowMs());
    if (kind === 'daily') {
      await load();
      const d = IX.notes.find((x) => x.daily === day && !x.path.startsWith('OLYMPUS/'));
      return d ? { path: d.path, exists: true, title: d.title } : { path: `${PATHS.inbox}/${day}.md`, exists: false, title: `Inbox ${day}` };
    }
    if (kind !== 'append' && kind !== 'create') return { path: kind === 'me' ? PATHS.me : kind === 'log' ? `${PATHS.logs}/${day}.md` : `${PATHS.inbox}/${day}.md`, exists: true, title: '' };
    if (!t) return null;
    const own = `${PATHS.notes}/${t}.md`, notes = await all(), low = t.toLowerCase();
    const exact = notes.find((x) => !x.local && x.title.toLowerCase() === low) || notes.find((x) => !x.local && x.path.toLowerCase() === own.toLowerCase());
    if (exact) return { path: exact.path, exists: true, title: exact.title };
    if (kind === 'append') {                       // "my gym note": the note whose title starts with or holds that word
      const near = notes.filter((x) => !x.local && !x.daily && (x.title.toLowerCase().startsWith(low) || x.title.toLowerCase().split(/\s+/).includes(low)))
        .sort((p, q) => p.title.length - q.title.length)[0];
      if (near) return { path: near.path, exists: true, title: near.title };
    }
    return { path: own, exists: false, title: t };
  }
  async function read(title) {
    const t = cleanTitle(title).toLowerCase();
    if (!t) return null;
    const notes = await all();
    const n = notes.find((x) => x.title.toLowerCase() === t) || notes.filter((x) => x.title.toLowerCase().includes(t)).sort((p, q) => p.title.length - q.title.length)[0];
    return n ? { title: n.title, path: n.path, text: plainText(n.text).replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000) } : null;
  }
  async function blocksFor(kind, text, ymd, title) {
    const day = str(ymd, 10) || ymdOf(nowMs()), at = hmOf(nowMs()), line = cleanLine(text), inbox = `${PATHS.inbox}/${day}.md`;
    const head = (t) => `# ${t}\n\n`;
    if (kind === 'task') return [[inbox, `- [ ] ${line}\n`, head(`Inbox ${day}`)]];
    if (kind === 'remember') return [[inbox, `- ${at} remember: ${line}\n`, head(`Inbox ${day}`)], [PATHS.memory, `- ${day}: ${line}\n`, head('Jarvis memory')]];
    if (kind === 'me') return [[PATHS.me, `- ${line} (${day})\n`, ME_TEMPLATE]];
    if (kind === 'log') return [[`${PATHS.logs}/${day}.md`, str(text, 8000).replace(/\r/g, '').trim() + '\n', head(`OLYMPUS log ${day}`)]];
    if (kind === 'daily') { const r = await resolve('daily'); return [[r.path, `- ${at} ${line}\n`, head(`Inbox ${day}`)]]; }
    if (kind === 'append' || kind === 'create') {
      const r = await resolve(kind, title), body = cleanBlock(text), multi = body.includes('\n');
      if (!r) throw new Error('the note needs a title');
      // a new note: its title, then the text; an existing one: the text appended (a dated line, or a dated section for a block)
      const block = r.exists ? (multi ? `\n## ${day} ${at}\n${body}\n` : `- ${body} (${day})\n`) : `${body}\n`;
      return [[r.path, block, `# ${r.title}\n\n`]];
    }
    return [[inbox, `- ${at} ${line}\n`, head(`Inbox ${day}`)]];
  }
  // kind: note | task | remember | me | log. Connected: one commit per file, plus a line in today's daily note when it exists.
  // Not connected: kept in the outbox on this phone and sent on connect.
  function learned(kind, text, path) {          // the Mind page's "learned" list (this phone only, the last 200)
    const l = arr(lget(LEARNED_KEY, [])).filter(isObj).slice(-199);
    l.push({ t: Math.floor(nowMs() / 1000), kind, text: kind === 'log' ? 'Wrote the OLYMPUS log' : cleanLine(text).slice(0, 300), note: path || null });
    lset(LEARNED_KEY, l);
  }
  async function write(kind, text, ymd, opt) {
    kind = KINDS.includes(kind) ? kind : 'note';
    const title = cleanTitle(isObj(opt) ? opt.title : '');
    if (!cleanLine(text)) return { ok: false, error: 'nothing to save' };
    if ((kind === 'append' || kind === 'create') && !title) return { ok: false, error: 'the note needs a title' };
    const day = str(ymd, 10) || ymdOf(nowMs());
    const r = await writeNow(kind, text, day, title);
    if (r.ok && !r.flushing) { learned(kind, text, (r.paths || [])[0] || null); notify(); }
    return r;
  }
  async function writeNow(kind, text, day, title) {
    if (!cfg) {
      const ob = arr(lget(OUTBOX_KEY, [])).slice(-199);
      ob.push({ kind, text: kind === 'log' ? str(text, 8000) : BLOCK_KINDS.includes(kind) ? cleanBlock(text) : cleanLine(text), day, t: nowMs(), title: title || undefined });
      lset(OUTBOX_KEY, ob);
      return { ok: true, local: true, paths: [] };
    }
    const paths = [];
    try {
      await load();
      for (const [path, block, header] of await blocksFor(kind, text, day, title)) {
        if (!safePath(path)) throw new Error('refused: not a note path');
        await appendTo(path, block, false, header);
        paths.push(path);
      }
      if (['note', 'task', 'remember'].includes(kind)) {
        const d = IX.notes.find((x) => x.daily === day && !x.path.startsWith('OLYMPUS/'));
        if (d) { await appendTo(d.path, `- ${hmOf(nowMs())} ${kind === 'task' ? '[ ] ' : ''}${cleanLine(text)} (via Jarvis)\n`); paths.push(d.path); }
      }
      return { ok: true, paths };
    } catch (e) { return { ok: false, error: String((e && e.message) || e), paths }; }
  }
  async function flush() {
    if (!cfg) return 0;
    const ob = arr(lget(OUTBOX_KEY, []));
    let sent = 0;
    const left = [];
    for (const w of ob) {
      if (!isObj(w)) continue;
      const r = await writeNow(KINDS.includes(w.kind) ? w.kind : 'note', w.text, w.day, cleanTitle(w.title));
      if (r.ok && !r.local) sent++; else left.push(w);
    }
    lset(OUTBOX_KEY, left.length ? left : null);
    return sent;
  }
  function importNote(title, text) {
    const t = cleanLine(title).replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 80) || 'Pasted note ' + ymdOf(nowMs());
    const body = str(text, 50000);
    if (!body.trim()) return { ok: false, error: 'nothing to import' };
    const loc = arr(lget(LOCAL_KEY, [])).filter((n) => isObj(n) && n.path !== `Pasted/${t}.md`).slice(-199);
    loc.push({ path: `Pasted/${t}.md`, text: body, t: nowMs() });
    lset(LOCAL_KEY, loc); stats = null;
    learned('import', 'Imported the note ' + t, `Pasted/${t}.md`); notify();
    return { ok: true, title: t };
  }
  return {
    connect, disconnect, status, sync, search, daily, tasks, recent, goals, links, me, write, flush, importNote, resolve, read,
    get connected() { return !!cfg; },
    hasNotes: async () => (await all()).length > 0,
  };
}

// ------------------------------------------------------------------------------------------------ for the Mind page (tools/web_public/mind/)
// onIndexChange(cb): cb() after each refresh / write / disconnect, in this page and in other pages of the site (BroadcastChannel
// and storage events). Returns an unsubscribe function. Never throws.
const listeners = new Set();
let chan = null;
try { chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel('jarvis-vault') : null; } catch (_) { chan = null; }
if (chan) { chan.onmessage = () => fire(); if (typeof chan.unref === 'function') chan.unref(); }     // node: never keeps the process alive
function fire() { for (const cb of [...listeners]) { try { cb(); } catch (_) { /* a listener's error stays its own */ } } }
function notify() { fire(); try { if (chan) chan.postMessage({ t: Date.now() }); } catch (_) { /* no channel */ } }
export function onIndexChange(cb) {
  try {
    if (typeof cb !== 'function') return () => {};
    listeners.add(cb);
    const onStore = (e) => { if (e && /^jarvis\.vault/.test(String(e.key || ''))) { try { cb(); } catch (_) { /* its own */ } } };
    try { if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', onStore); } catch (_) { /* no window */ }
    return () => { listeners.delete(cb); try { if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('storage', onStore); } catch (_) { /* no window */ } };
  } catch (_) { return () => {}; }
}
// graphSnapshot(): the vault as a graph, from this phone's cache only (no network, no token in it); null when not connected
// and nothing is cached. { v: 1, t, notes: [{ id, title, path, tags, links: [ids], mtime, words, kind }], learned: [{ t, text, note }] }
export async function graphSnapshot(opts) {
  try {
    const o = isObj(opts) ? opts : {};
    const st = o.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const lget = (k, d) => { try { const v = st ? st.getItem(k) : null; return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
    const c = lget(CFG_KEY, null), connected = isObj(c) && REPO_RX.test(str(c.repo));
    const ix = await (o.kv || defaultKV()).get(IDX_KEY);
    const cached = isObj(ix) && Array.isArray(ix.notes) && (!connected || ix.repo === c.repo) ? ix.notes : [];
    const local = arr(lget(LOCAL_KEY, [])).filter(isObj).map((n) => ({ ...parseNote(n.path, n.text), seen: Math.floor((+n.t || Date.now()) / 1000) }));
    const notes = cached.concat(local).filter((n) => isObj(n) && str(n.path));
    const learnedList = arr(lget(LEARNED_KEY, [])).filter(isObj);
    if (!connected && !notes.length && !learnedList.length) return null;
    const byName = new Map();
    for (const n of notes) { byName.set(str(n.title).toLowerCase(), n.path); byName.set(str(n.path).replace(/\.md$/i, '').toLowerCase(), n.path); byName.set(str(n.path).split('/').pop().replace(/\.md$/i, '').toLowerCase(), n.path); }
    const kind = (n) => (n.path === PATHS.me ? 'me' : n.path === PATHS.memory ? 'memory' : n.path.startsWith(PATHS.inbox + '/') ? 'inbox' : n.daily ? 'daily' : 'note');
    const mtime = (n) => (n.daily ? Math.floor(Date.parse(n.daily + 'T12:00:00Z') / 1000) : +n.seen || +(ix && ix.at) / 1000 || 0);
    return {
      v: 1, t: Math.floor(Date.now() / 1000),
      notes: notes.slice(0, MAX_NOTES).map((n) => ({ id: n.path, title: str(n.title, 200), path: n.path, tags: arr(n.tags).slice(0, 20),
        links: [...new Set(arr(n.links).map((l) => byName.get(String(l).toLowerCase()) || byName.get(String(l).split('/').pop().toLowerCase())).filter((x) => x && x !== n.path))],
        mtime: Math.floor(mtime(n)), words: +n.words || (str(n.text).match(/\S+/g) || []).length, kind: kind(n) })),
      learned: learnedList.slice(-200).map((x) => ({ t: +x.t || 0, text: str(x.text, 300), note: x.note && byName.has(String(x.note).replace(/\.md$/i, '').toLowerCase()) ? x.note : x.note || null })),
    };
  } catch (_) { return null; }
}
export default createVault;
