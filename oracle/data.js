// ORACLE data: where the bot's world comes from, and one shape for it (the World the scene and the HUD draw). Read-only.
//   the PC     the PC's own status post (../pc_feed.js window.PC_FEED: the ntfy topic named in ../status_feed.json, tools/pc_report.py,
//              every 15 min), the same feed Jarvis, the Gate, ZEUS and the NQ page read. Its brain glance (pc.glance: the levels it
//              watches, the stage, the last thought lines) stands in for the Bot Brain's phone cut when the post has no pc.brain.
//              (polish2 2026-11-19: Oracle polled the old live.json on the suspended GitHub account (its `live` branch) every
//              minute: a 404 each time. That address is gone from here.)
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

const PC_EVERY_S = 120;                   // the PC posts every 15 min; a look every 2 min catches a new post soon enough

/** the glance's Zlarior block (engine/brain_glance.lit: stage "Sweep (2/10)", wait, lv [[label, price, pts]], log [[hm, text]]) as the
 *  Bot Brain's phone cut normalize() reads (pc.brain: stage, levels, log); null without one */
function brainOfGlance(g, price) {
  const lit = arr(obj(g).bots).find((b) => b && b.id === 'lit');
  if (!lit) return null;
  const m = /^(.*?)\s*\((\d+)\/10\)\s*$/.exec(String(lit.stage || '')), n = m ? +m[2] : null;
  const stage = { key: n && STAGES[n - 1] ? STAGES[n - 1][0] : /closed/i.test(String(lit.stage || '')) ? 'closed' : null, label: (m ? m[1] : String(lit.stage || '')).slice(0, 50) || null, n, waiting: String(lit.wait || '').slice(0, 320) };
  const levels = arr(lit.lv).filter((r) => Array.isArray(r) && num(r[1]) != null)
    .map((r) => ({ label: String(r[0] || 'level').slice(0, 40), price: num(r[1]), kind: 'level', taken: false, dist: price == null ? null : Math.round((num(r[1]) - price) * 100) / 100 }));
  const log = arr(lit.log).filter((r) => Array.isArray(r) && r[0] && r[1]).map((r) => ({ hm: String(r[0]).slice(0, 5), kind: 'note', text: String(r[1]).slice(0, 240) }));
  return { stage, levels, log, price };
}

/** The PC's status post as a live.json-shaped doc: {j, src: 'pc', every} or throws (no feed script, no post). F = window.PC_FEED. */
export async function fetchLive(F = globalThis.PC_FEED) {
  if (!F || typeof F.fetchLatest !== 'function') throw new Error('no PC feed on this page');
  const lite = await F.fetchLatest({ feedUrl: '../status_feed.json' });
  if (!lite || lite.kind !== 'le-live' || !Number.isFinite(+lite.t) || +lite.t <= 0) throw new Error('no PC report');
  const pc = obj(lite.pc), price = num(lite.price);
  const brain = obj(pc.brain).stage || arr(obj(pc.brain).levels).length ? pc.brain : brainOfGlance(pc.glance, price);
  return { j: { ...lite, pc: { ...pc, brain: brain || undefined } }, src: 'pc', every: PC_EVERY_S };
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
      // the market picture is as old as its newest bar: the cloud's copy can carry a fresh run time over bars weeks old (its feed
      // stopped Oct 16), so the HUD says LAST SEEN with that bar's day, never a fresh time (night-feedsB 2026-11-18)
      const t0 = num(bd.data_t) || num(bd.t) || 0, lb = arr(live.bars).map((b) => num(b && b[0])).filter((x) => x).sort((a, b) => b - a)[0] || null;
      return {
        kind: 'le-live', site: true, t: lb && t0 && lb < t0 - 3600 ? lb : t0, price: num(live.price) ?? num(obj(bd.map).price),
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
