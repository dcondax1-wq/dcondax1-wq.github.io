// ORACLE data: where the bot's world comes from, and one shape for it (the World the scene and the HUD draw). Read-only.
//   live.json  the PC's minute-by-minute file (engine/live_publish.py) on the branch `live` of this site's repo: GitHub's API
//              first (fresh within ~60 s), raw.githubusercontent.com when the API's hourly limit runs out. The same two
//              addresses and the same rate-limit rule as tools/web_public/live.js.
//   home.json  the site's own small file (tools/build_web_dashboard.py; ../data.json when it is missing): the cloud's copy of
//              the board (engine/live_board.py) and the last 5m bars, for when live.json is old or absent.
// normalize(doc) reads a live.json-shaped doc: the Bot Brain's phone cut (pc.brain, engine/brain.compact) first, the board
// (board.map / board.lit / board.atlas) for what the Brain does not carry, Mind's regime (pc.mind.regime) for the weather.

export const STAGES = [
  ['levels', 'Levels'], ['sweep', 'Sweep'], ['inducement', 'Inducement'], ['displacement', 'Displacement'],
  ['cisd5', '5m CISD'], ['limit', 'Limit armed'], ['cisd1m', '1m CISD'], ['entry', 'Entry'], ['trade', 'In trade'], ['done', 'Done'],
];
const USD_PT = 2;                       // MNQ: $2 a point a micro
export const FRESH_S = 20 * 60;                // older than this: LAST SEEN (live.js's own rule)
const FUTURE_S = 5 * 60;                 // tolerate small clock skew; a farther-ahead source is not current data

const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

function endpoints(loc = location) {
  const host = loc.hostname, seg = loc.pathname.split('/').filter(Boolean)[0];
  const owner = /\.github\.io$/.test(host) ? host.split('.')[0] : 'demetrades2000-coder';
  const repo = /\.github\.io$/.test(host) && seg && !/\./.test(seg) && seg !== 'oracle' ? seg : 'nq-dashboard';
  return {
    api: `https://api.github.com/repos/${owner}/${repo}/contents/live.json?ref=live`,
    raw: `https://raw.githubusercontent.com/${owner}/${repo}/live/live.json`,
  };
}

async function get(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.r = r; throw e; }
  return r;
}

/** live.json: {j, src, every} or throws. `gate` keeps the API pause between calls ({apiUntil}). */
export async function fetchLive(gate, urls = endpoints()) {
  let r = null, src = 'api', every = 45;
  if (Date.now() >= (gate.apiUntil || 0)) {
    try {
      r = await get(urls.api, { cache: 'no-cache', headers: { Accept: 'application/vnd.github.raw+json' } });
      const hdr = (k) => { const v = r.headers.get(k); return v == null || v === '' ? NaN : +v; };   // unreadable = unknown, never 0
      const rem = hdr('x-ratelimit-remaining'), reset = hdr('x-ratelimit-reset');
      if (Number.isFinite(rem)) { every = rem > 30 ? 30 : 60; if (rem <= 2) gate.apiUntil = reset > 0 ? reset * 1000 : Date.now() + 15 * 60e3; }
    } catch (e) {
      r = null;
      const reset = e.r ? +e.r.headers.get('x-ratelimit-reset') : NaN;
      if (e.status === 404) gate.apiUntil = Date.now() + 10 * 60e3;            // no live branch yet
      else gate.apiUntil = reset > 0 ? reset * 1000 : Date.now() + 15 * 60e3;   // 403 / 429 / no answer
    }
  }
  if (!r) { src = 'raw'; every = 60; r = await get(urls.raw + '?t=' + Date.now(), { cache: 'no-store' }); }
  let j = await r.json();
  if (j && j.encoding === 'base64' && typeof j.content === 'string') {         // the API ignored the raw Accept header
    const bin = atob(j.content.replace(/\s/g, ''));
    j = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  }
  if (!j || j.kind !== 'le-live' || !Number.isFinite(+j.t)) throw new Error('not a live.json');
  return { j, src, every };
}

/** The site's own copy as a live.json-shaped doc (home.json, else data.json), or null. */
export async function fetchSite(base = '../') {
  for (const name of ['home.json', 'data.json']) {
    try {
      const r = await fetch(base + name + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) continue;
      const s = await r.json();
      const bd = obj(s.board);
      if (!bd.map && !bd.lit) continue;
      const live = obj(s.live);
      return {
        kind: 'le-live', site: true, t: num(bd.data_t) || num(bd.t) || 0, price: num(live.price) ?? num(obj(bd.map).price),
        pc: { brain: obj(live.pc).brain, mind: obj(live.pc).mind }, board: bd,
        bars: arr(live.bars).map((b) => [num(b[0]), num(b[4])]).filter((b) => b[0] && b[1]),
        ohlc: arr(live.bars).map((b) => [num(b[0]), num(b[1]), num(b[2]), num(b[3]), num(b[4])]).filter((b) => b.every((x) => x != null)),
      };
    } catch (_) { /* the next file */ }
  }
  return null;
}

function levelRows(brain, map, price) {
  const src = arr(map.levels).length ? arr(map.levels) : arr(brain.levels);
  const seen = new Set(), out = [];
  for (const r of src) {
    const p = num(r && r.price);
    if (p == null || r.kind === 'open' || r.kind === 'target') continue;
    const label = String(r.label || r.kind || 'level').slice(0, 40), id = label + '|' + p;
    if (seen.has(id)) continue;
    seen.add(id);
    const d = price == null ? null : Math.round((p - price) * 100) / 100;
    const takenHm = r.taken_hm || (typeof r.note === 'string' && (r.note.match(/taken (\d\d:\d\d)/) || [])[1]) || null;
    out.push({ id, label, price: p, kind: String(r.kind || 'level'), taken: !!r.taken, takenHm,
      dist: d, usd: d == null ? null : Math.round(Math.abs(d) * USD_PT) });
  }
  return out.sort((a, b) => b.price - a.price);
}

function stageOf(brain, lit) {
  const st = obj(brain.stage).key ? obj(brain.stage) : obj(lit.stage);
  const src = arr(brain.stages).length ? arr(brain.stages) : arr(lit.stages);
  const states = new Map(src.filter((s) => Array.isArray(s)).map((s) => [s[0], s[1]]));
  const n = STAGES.findIndex(([k]) => k === st.key) + 1;
  const stages = STAGES.map(([key, label], i) => ({ key, label,
    state: states.get(key) || (st.key === 'closed' || !n ? 'todo' : i + 1 < n ? 'done' : i + 1 === n ? 'now' : 'todo') }));
  return {
    stage: { key: st.key || null, label: st.label || (STAGES[n - 1] || [])[1] || (st.key === 'closed' ? 'Market closed' : '–'),
      n: n || null, of: STAGES.length, dir: num(st.dir), waiting: String(st.waiting || lit.waiting || '').slice(0, 320) },
    stages,
  };
}

function positionOf(lit, brain, price) {
  // the PC account's position (board.lit) over the Brain's trade block (it knows the first stop, so 1R)
  const p = obj(lit.position).entry != null ? { ...obj(brain.trade), ...obj(lit.position) } : obj(brain.trade);
  const entry = num(p.entry);
  if (entry == null) return null;
  const dir = num(p.dir) || (String(p.side).toUpperCase() === 'SHORT' ? -1 : 1), qty = num(p.qty) || 0;
  const stop = num(p.stop), target = num(p.target), px = price ?? num(p.price);
  const risk = num(p.risk_pts) || (num(p.be_trigger) != null ? Math.abs(num(p.be_trigger) - entry) : null)
    || (stop == null ? null : Math.abs(entry - (num(p.stop0) ?? stop))) || null;
  const usd = num(p.unrealized_usd) ?? num(p.usd_now) ?? (px == null ? null : Math.round(dir * (px - entry) * USD_PT * qty));
  const r = num(p.unrealized_r) ?? num(p.r_now) ?? (risk && px != null ? Math.round((dir * (px - entry) / risk) * 100) / 100 : null);
  return { side: dir > 0 ? 'LONG' : 'SHORT', dir, qty, entry, stop, target, be: !!(p.be === true || obj(p.be).done), usd, r,
    entry_t: num(p.entry_t) };
}

function atlasOf(atlas) {
  const ms = arr(obj(atlas).members).filter((m) => m && m.key);
  if (!ms.length) return null;
  return {
    members: ms.slice(0, 6).map((m) => ({ key: String(m.key), short: String(m.short || m.key).slice(0, 8),
      stage: String(m.stage || 'off'), open: !!obj(m.window).open })),
  };
}

/** The Brain's narration (pc.brain.log, newest first on the PC; the demo's rows carry t): the event log, oldest first. */
function logOf(brain) {
  return arr(brain.log).filter((r) => r && r.hm && r.text).map((r) => ({ t: num(r.t), hm: String(r.hm).slice(0, 5),
    kind: String(r.kind || 'note'), text: String(r.text).slice(0, 240) }))
    .sort((a, b) => (a.t != null && b.t != null ? a.t - b.t : sessionMin(a.hm) - sessionMin(b.hm)));
}
/** Minutes since the 18:00 ET session open ('00:10' comes after '23:50': the futures day starts the evening before). */
const sessionMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return ((h * 60 + m) - 1080 + 1440) % 1440; };

/** prophecy.json (tools/oracle_prophecy_stats.py: how often each level family started a LIT trade); null when missing (never throws) */
export async function loadProphecy(url = 'prophecy.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.kind === 'oracle-prophecy' && j.families && typeof j.families === 'object' ? j : null;
  } catch (_) { return null; }
}

/** A live.json-shaped doc -> the World, or null when it has no market in it. */
export function normalize(doc, now = Date.now() / 1000) {
  if (!doc || typeof doc !== 'object') return null;
  const pc = obj(doc.pc), brain = obj(pc.brain), board = obj(doc.board), map = obj(board.map), lit = obj(board.lit);
  const price = num(doc.price) ?? num(brain.price) ?? num(map.price);
  const levels = levelRows(brain, map, price);
  if (price == null && !levels.length) return null;
  const vx = obj(map.vix).open18 != null ? obj(map.vix) : obj(obj(brain.guards).vix);
  const reg = obj(obj(pc.mind).regime);
  const t = num(doc.t) || 0;
  // A future-dated publisher must not outrank a valid source or stay "live" until its clock catches up.
  // Historical/sample replay documents are intentionally exempt: their time is the replay clock.
  if (!doc.demo && t > now + FUTURE_S) return null;
  const position = positionOf(lit, brain, price);
  const booked = num(lit.today_pnl) ?? num(doc.day_pnl) ?? num(brain.day_pnl);    // booked today (the open trade apart)
  return {
    t, age_s: doc.demo ? 0 : Math.max(0, Math.round(now - t)), src: doc.demo ? 'demo' : doc.site ? 'site' : 'live',
    price, atr: num(brain.atr) ?? num(map.atr),
    levels,
    vix: vx.open18 != null || vx.up != null ? { vix: num(vx.vix), vxn: num(vx.vxn), move: num(vx.move), open18: num(vx.open18),
      up: num(vx.up), dn: num(vx.dn) } : null,
    ...stageOf(brain, lit),
    windows: arr(lit.windows).length ? arr(lit.windows) : null,
    position, pnlToday: booked,
    pnlNow: booked == null && !position ? null : (booked || 0) + ((position && position.usd) || 0),   // booked + the open trade
    atlas: atlasOf(board.atlas),
    regime: reg.trend || reg.vol ? { trend: String(reg.trend || 'range'), vol: String(reg.vol || 'normal'), label: String(reg.label || '') } : null,
    bars: arr(doc.bars),
    ohlc: arr(doc.ohlc),
    log: logOf(brain),
  };
}

/** Levels taken between two Worlds (the lightning strikes). */
export function newSweeps(prev, next) {
  if (!prev || !next) return [];
  const was = new Map(prev.levels.map((l) => [l.id, l.taken]));
  return next.levels.filter((l) => l.taken && was.get(l.id) === false);
}
