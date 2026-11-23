// ERGASTERION core (pure, node-tested): the AI agent factory where you can see, first person, what every worker is doing, then what was learned from it.
// Inputs (every one optional): home (home.json: accounts), money (money/index.json: streams), kalshi (the public kalshi.json feed), cron (cronos/status.json: tasks),
// forge (prometheus/forge.json), heph (hephaestus/data.json), queue (queue.json built by tools/ergasterion_build.py: queue, writeups, rejected, learnings, lessons, changed,
// events, pipeline, gaps, mind, git, money_runs).
// Output: one station per real worker (status lamp, what it is doing, what it SAYS, its crates = last outputs, what it learned, health), a dated event stream for the day replay,
// the research pipeline (Idea -> Testing -> Verdict), the Learning board (strength = independent files that agree, what changed our mind) and a ranked "what next" plan.
// Honest by rule: a missing file says "no file yet" (stale), a fixture says "sample", nothing is invented. Nothing here trades or sends anything.

export const H = 3600000, D = 24 * H;
export const OLD_H = 36;                 // a nightly worker is stale after this many hours (weekends are quiet, so not shorter)
export const WEEK_D = 7;
export const BOUNDS = { x: 12.4, z: 9.4 };
export const STATION_R = 1.45;           // how close the walker may come to a station centre
export const WALL_T = 0.5;               // how close the walker may come to the middle of an inner wall
export const EYE = 1.6;
export const START = { x: 6.5, z: 9.0, yaw: 0 };      // the front door, in the Library, looking north at the door to the Trading hall

// four halls around a cross of inner walls (x = 0 and z = 0); each inner wall has one door
export const HALLS = [
  { id: 'money', name: 'Money hall', x0: -13, x1: 0, z0: -10, z1: 0, tone: '#c8a24a' },
  { id: 'trading', name: 'Trading hall', x0: 0, x1: 13, z0: -10, z1: 0, tone: '#9c6b3c' },
  { id: 'research', name: 'Research hall', x0: -13, x1: 0, z0: 0, z1: 10, tone: '#7f8a52' },
  { id: 'library', name: 'Library', x0: 0, x1: 13, z0: 0, z1: 10, tone: '#4b7a99' },
];
/** axis 'x': the wall is the plane x = at and the door is centred on z = c; axis 'z': the wall is z = at, the door is centred on x = c */
export const DOORS = [
  { id: 'money-trading', axis: 'x', at: 0, c: -5, half: 1.2, a: 'money', b: 'trading' },
  { id: 'research-library', axis: 'x', at: 0, c: 5, half: 1.2, a: 'research', b: 'library' },
  { id: 'money-research', axis: 'z', at: 0, c: -6.5, half: 1.2, a: 'money', b: 'research' },
  { id: 'trading-library', axis: 'z', at: 0, c: 6.5, half: 1.2, a: 'trading', b: 'library' },
];
/** the job a figure is seen doing: wheel = turning a scanner wheel, scribe = writing at a desk, oracle = reading the tripod, smith = hammering at the anvil, scales = weighing risk against reward */
/** THE BUILDERS' CAMP: a desert caravan camp outside the front door (south of the factory), one tent per build agent. You walk out through the front door (x = 6.5, z = 10). */
export const CAMP = { id: 'camp', name: "Builders' camp", x0: -3.5, x1: 16.5, z0: 10.6, z1: 23, door: { x: 6.5, half: 0.9, z0: 9.4, z1: 10.6 }, fire: { x: 6.5, z: 13.3 }, enter: { x: 6.5, z: 11.0, yaw: Math.PI }, tone: '#c9a66b' };
/** ten tent spots: a near row of 4 and a far row of 6, every worker in front of its tent facing the door you come from */
export const CAMP_SPOTS = [[0.5, 15.8], [4.5, 15.8], [8.5, 15.8], [12.5, 15.8], [-1.5, 20.4], [1.7, 20.4], [4.9, 20.4], [8.1, 20.4], [11.3, 20.4], [14.5, 20.4]].map((a, i) => ({ i, x: a[0], z: a[1], job: i % 2 ? 'scribe' : 'smith' }));
export const BUILD_WORD = { working: 'Working', quiet: 'Quiet', done: 'Done', job: 'Job only' };
export const BUILD_HELP = { working: 'a commit in the last 15 minutes', quiet: 'no commit for a while', done: 'merged into the release', job: 'job only, no live activity' };
export const WORK_MIN = 15;
export const JOB_WORD = { wheel: 'turning the search wheel', scribe: 'writing it down', oracle: 'reading the tripod', smith: 'hammering at the anvil', scales: 'weighing risk against reward' };

export const STATIONS = [
  { id: 'chrysos', who: 'Chrysanthe', name: 'Chrysos', role: 'Prop-firm eval and payout planner', group: 'Money machines', hall: 'money', job: 'scribe', x: -10.5, z: -7.5 },
  { id: 'mercury', who: 'Hermolaos', name: 'Mercury', role: 'Deal finder (prop-firm sales and codes)', group: 'Money machines', hall: 'money', job: 'wheel', x: -6.5, z: -7.5 },
  { id: 'sibyl', who: 'Manto', name: 'Sibyl', role: 'Prediction-market pick finder', group: 'Money machines', hall: 'money', job: 'oracle', x: -2.5, z: -7.5 },
  { id: 'oikos', who: 'Pheidon', name: 'Oikos', role: 'Household savings finder', group: 'Money machines', hall: 'money', job: 'wheel', x: -9.6, z: -3 },
  { id: 'arbiter', who: 'Dikaios', name: 'Arbiter', role: 'Price-gap checker', group: 'Money machines', hall: 'money', job: 'scales', x: -3.4, z: -3 },
  { id: 'lit', who: 'Phoibos', name: 'Zlarior (LIT)', role: 'The live NQ strategy, paper account', group: 'NQ bots', hall: 'trading', job: 'scales', x: 3, z: -7.5 },
  { id: 'atlas', who: 'Telamon', name: 'ATLAS', role: 'Second NQ strategy, 25K account', group: 'NQ bots', hall: 'trading', job: 'scales', x: 7, z: -7.5 },
  { id: 'blitz', who: 'Asterope', name: 'BLITZ', role: 'Third NQ strategy, 25K account', group: 'NQ bots', hall: 'trading', job: 'scales', x: 10.8, z: -7.5 },
  { id: 'mind', who: 'Metis', name: 'Mind', role: 'Nightly self-research and game plans', group: 'Thinkers', hall: 'research', job: 'oracle', x: -10.5, z: 2.8 },
  { id: 'kalshi', who: 'Eutychos', name: 'Kalshi bot', role: 'Prediction-market trading bot (paper)', group: 'Thinkers', hall: 'trading', job: 'oracle', x: 10, z: -3 },
  { id: 'prometheus', who: 'Pyrrhos', name: 'Prometheus', role: 'Breeds LIT settings, checks them on later months', group: 'Jobs', hall: 'research', job: 'smith', x: -2.9, z: 2.6 },
  { id: 'hephaestus', who: 'Chalkeus', name: 'Hephaestus', role: 'Stored results of every LIT setting that was run', group: 'Jobs', hall: 'research', job: 'smith', x: -10.5, z: 6.8 },
  { id: 'cronos', who: 'Horaios', name: 'Cronos', role: 'The night clock: refreshes every research app', group: 'Jobs', hall: 'research', job: 'wheel', x: -6.5, z: 5.2 },
  { id: 'queue', who: 'Kalamos', name: 'The queue', role: 'ChatGPT / Claude task queue (handoff/QUEUE.md)', group: 'People and agents', hall: 'library', job: 'scribe', x: 4.3, z: 3.8 },
  { id: 'dev', who: 'Epistates', name: 'Dev agents', role: 'The coding agents of this project (branches, commits, write-ups)', group: 'People and agents', hall: 'library', job: 'scribe', x: 8.7, z: 3.8 },
];
export const IDS = STATIONS.map((s) => s.id);
export const STATUS_WORD = { working: 'Working', idle: 'Idle', stale: 'Stale', failed: 'Failed', sample: 'Sample data' };
export const STATUS_HELP = { working: 'ran recently', idle: 'quiet, nothing wrong', stale: 'old or missing data', failed: 'its last run failed', sample: 'demo numbers, not real' };
export const STATUS_RANK = { failed: 0, stale: 1, sample: 2, idle: 3, working: 4 };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
export function clean(t, n) { const s = String(t == null ? '' : t).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
export function money(v) { const n = num(v); if (n == null) return '$?'; return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
export function moneyS(v) { const n = num(v); if (n == null) return '$?'; return (n > 0 ? '+' : '') + money(n); }
/** ISO text, 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM', epoch seconds or milliseconds -> ms (or null) */
export function toMs(v) {
  if (typeof v === 'number' && isFinite(v) && v > 0) return v > 1e11 ? v : v * 1000;
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) ? v.replace(' ', 'T') + ':00Z' : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00Z' : v);
  return isFinite(t) ? t : null;
}
export const dayOf = (ms) => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));
export function ageH(ms, now) { return ms == null || !isFinite(now) ? null : Math.max(0, (now - ms) / H); }
export function agoText(ms, now) {
  const a = ageH(ms, now);
  if (a == null) return 'no time on record';
  if (a < 1) return Math.max(1, Math.round(a * 60)) + ' min ago';
  if (a < 36) return Math.round(a) + ' h ago';
  return Math.round(a / 24) + ' days ago';
}

function base(s) { return { id: s.id, who: s.who || '', name: s.name, role: s.role, group: s.group, hall: s.hall, job: s.job, x: s.x, z: s.z, say: '', crates: [], status: 'stale', doing: '', last: null, outputs: [], learned: [], health: '', n: null, items: 0, demo: false, missing: false, src: '' }; }
const out = (t, text) => ({ t: t == null ? null : t, text: clean(text, 150) });

function learnedFrom(queue, id, extra) {
  const L = [];
  for (const l of (isObj(queue) && Array.isArray(queue.learnings) ? queue.learnings : [])) {
    if (isObj(l) && l.who === id && l.text) L.push({ d: String(l.d || '').slice(0, 10), text: clean(l.text, 170), src: clean(l.src || 'research/writeups', 90) });
  }
  return (extra || []).concat(L);
}

function money1(id, inp, now, w) {
  const m = isObj(inp.money) ? inp.money : null, s = m && Array.isArray(m.streams) ? m.streams.find((x) => isObj(x) && x.id === id) : null;
  w.src = 'money/' + id + '.json';
  if (!s) { w.missing = true; w.doing = 'No file from this machine yet.'; w.health = 'money/' + id + '.json is not published (run tools/bat/RUN_MONEY.bat on the PC).'; return; }
  const last = toMs(s.asof) != null ? toMs(s.asof) : (num(s.age_min) != null ? now - s.age_min * 60000 : null), age = ageH(last, now), items = Array.isArray(s.items) ? s.items.filter(isObj) : [];
  w.last = last; w.items = items.length; w.n = items.length;
  w.status = s.status === 'sample' ? 'sample' : (s.status === 'error' || s.status === 'failed') ? 'failed' : s.status === 'stale' || (age != null && age > OLD_H) ? 'stale' : age != null && age <= 6 ? 'working' : 'idle';
  w.demo = s.status === 'sample';
  w.doing = clean(s.headline, 200) || (items.length ? 'Weighing ' + items.length + ' pick' + (items.length === 1 ? '' : 's') + '.' : 'Looked, found nothing worth a card.');
  w.outputs = items.slice(0, 5).map((i) => out(last, clean(i.title, 90) + (num(i.usd) != null ? ' (about ' + money(i.usd) + ', an estimate)' : '')));
  w.learned = learnedFrom(inp.queue, id, (Array.isArray(s.notes) ? s.notes : []).slice(0, 3).map((t) => ({ d: dayOf(last), text: clean(t, 170), src: w.src })));
  w.health = (w.demo ? 'Sample data, not a real find. ' : '') + 'Updated ' + agoText(last, now) + '.';
}

const BOT_RE = { lit: /zlarior|\blit\b|mffu50k/i, atlas: /atlas|acctb/i, blitz: /blitz|acct_c/i };
function bot1(id, inp, now, w) {
  const home = isObj(inp.home) ? inp.home : null, accts = home && Array.isArray(home.accounts) ? home.accounts.filter(isObj) : [];
  const a = accts.find((x) => BOT_RE[id].test(String(x.name || '') + ' ' + String(x.id || '')));
  w.src = 'home.json';
  w.learned = learnedFrom(inp.queue, id, []);
  if (!a) { w.missing = true; w.doing = 'No account for this bot in home.json yet.'; w.health = 'home.json has no ' + w.name + ' account.'; return; }
  const ev = isObj(a.eval) ? a.eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, conn = isObj(a.conn) ? a.conn : {}, last = home.t != null ? toMs(home.t) : null;
  w.last = last;
  w.status = conn.connected === false ? 'stale' : a.paused || ev.paused ? 'idle' : 'working';
  const dd = num(ev.room) != null && num(ev.mll) != null ? 'Drawdown left ' + money(ev.room) + ' of ' + money(ev.mll) + ' max loss.' : '';
  w.doing = 'Paper account: ' + (num(pnl.today) != null ? moneyS(pnl.today) + ' today. ' : 'no P&L yet today. ') + dd;
  w.outputs = [out(last, 'Today ' + (num(pnl.today) != null ? moneyS(pnl.today) : 'no P&L yet'))].concat(dd ? [out(last, dd)] : []);
  w.items = num(pnl.today) != null && pnl.today !== 0 ? 1 : 0;
  w.health = conn.connected === false ? 'Not connected right now.' : 'Connected. ' + (a.paused ? 'Paused.' : 'Paper only: it never places a real order.');
}

function mind1(inp, now, w) {
  const q = isObj(inp.queue) ? inp.queue : null, m = q && isObj(q.mind) ? q.mind : null, t = m && m.t ? toMs(m.t) : null;
  w.src = m && m.source ? m.source : 'research/mind/';
  w.last = t; w.n = m ? m.tested : null;
  const obs = m && Array.isArray(m.observations) ? m.observations.filter(isObj) : [];
  w.items = obs.length;
  if (!m) { w.missing = true; w.doing = 'No research file yet.'; w.health = 'queue.json has no Mind block.'; return; }
  const age = ageH(t, now);
  w.status = age != null && age <= 48 ? 'working' : 'stale';
  w.demo = !!inp.demo;
  w.doing = 'Nightly self-research: ' + (num(m.tested) || 0) + ' ideas tested, ' + obs.length + ' notes about recent trades. It only suggests; it never changes a rule.';
  w.outputs = obs.slice(0, 5).map((o) => out(t, o.text));
  w.learned = learnedFrom(inp.queue, 'mind', [{ d: '', text: 'Similar-setup memory is context only: it is not predictive out of sample.', src: 'docs/CLAUDE_REFERENCE.md (Mind)' }]);
  w.health = 'Last research ' + agoText(t, now) + (age != null && age > 48 ? ' (the nightly run is overdue or only the seed is here).' : '.');
}

function kalshi1(inp, now, w) {
  const k = isObj(inp.kalshi) ? inp.kalshi : null;
  w.src = 'kalshi.json';
  w.learned = learnedFrom(inp.queue, 'kalshi', []);
  if (!k) { w.missing = true; w.doing = 'No Kalshi feed reachable.'; w.health = 'The public kalshi.json feed was not read.'; return; }
  const last = k.t != null ? toMs(k.t) : null, age = ageH(last, now), tr = Array.isArray(k.last_trades) ? k.last_trades : Array.isArray(k.trades) ? k.trades : [];
  w.last = last; w.n = num(k.settled_n) != null ? k.settled_n : num(k.n_settled) != null ? k.n_settled : null;
  w.status = k.running === false ? 'failed' : age != null && age > OLD_H ? 'stale' : k.running ? 'working' : 'idle';
  w.demo = !!inp.demo;
  w.doing = (k.running === false ? 'Not running. ' : k.running ? 'Running (paper). ' : '') + (num(k.today_pnl) != null ? 'Today ' + moneyS(k.today_pnl) + '.' : 'No P&L today.');
  w.outputs = tr.filter(isObj).slice(0, 5).map((x) => out(toMs(x.t != null ? x.t : x.ts), clean(x.title || x.ticker || x.market || 'trade', 70) + (num(x.pnl) != null ? ' ' + moneyS(x.pnl) : '')));
  if (!w.outputs.length && num(k.today_pnl) != null) w.outputs = [out(last, 'Today ' + moneyS(k.today_pnl))];
  w.items = tr.length;
  w.health = k.running === false ? 'Not running: check the Oracle VM.' : 'Feed updated ' + agoText(last, now) + '.';
}

function prom1(inp, now, w) {
  const f = isObj(inp.forge) ? inp.forge : null, ct = cronTask(inp, 'prometheus');
  w.src = 'prometheus/forge.json';
  w.learned = learnedFrom(inp.queue, 'prometheus', []);
  if (!f) { w.missing = true; w.doing = 'No forge file yet.'; w.health = 'prometheus/forge.json is not published.'; return; }
  const last = toMs(f.built), age = ageH(last, now), v = isObj(f.verdict) ? f.verdict : {}, hn = isObj(f.honesty) ? f.honesty : {};
  w.last = last; w.demo = f.demo === true;
  w.status = w.demo ? 'sample' : ct && ct.ok === false ? 'failed' : age != null && age > 8 * 24 ? 'stale' : 'idle';
  w.doing = 'Breeds LIT settings: ' + (f.gens_n || '?') + ' generations of ' + (f.pop || '?') + ' candidates, fitted on Jan-Jun 2026 only, then checked on Jul-Oct. ' + (v.real_margin === false ? 'No real margin over live.' : v.real_margin ? 'A candidate holds a margin.' : '');
  if (num(v.h1_gain_pm) != null) w.outputs.push(out(last, 'Best candidate: ' + moneyS(v.h1_gain_pm) + '/month on the fit half, ' + moneyS(v.h2_gain_pm) + '/month on the check half.'));
  if (num(hn.genomes_checked) != null) w.outputs.push(out(last, num(hn.beat_live_both) + ' of ' + hn.genomes_checked + ' candidates beat live on both halves.'));
  if (num(v.survive_pct) != null) w.outputs.push(out(last, 'Share of the fit-half gain that survived the check half: ' + v.survive_pct + '%.'));
  w.items = w.outputs.length;
  if (num(hn.genomes_checked) != null) w.learned.unshift({ d: dayOf(last), text: 'Only ' + num(hn.beat_live_both) + ' of ' + hn.genomes_checked + ' bred candidates beat live LIT on both halves' + (v.real_margin === false ? '; no real margin, nothing to switch.' : '.'), src: w.src });
  w.health = (ct && ct.ok === false ? 'Last run failed. ' : '') + 'Built ' + agoText(last, now) + ' (weekly job).';
}

function heph1(inp, now, w) {
  const f = isObj(inp.heph) ? inp.heph : null;
  w.src = 'hephaestus/data.json';
  w.learned = learnedFrom(inp.queue, 'hephaestus', []);
  if (!f) { w.missing = true; w.doing = 'No results file yet.'; w.health = 'hephaestus/data.json is not published.'; return; }
  const last = toMs(f.built), age = ageH(last, now), dials = Array.isArray(f.dials) ? f.dials.filter(isObj) : [];
  w.last = last; w.demo = f.demo === true;
  w.status = w.demo ? 'sample' : age != null && age > 30 * 24 ? 'stale' : 'idle';
  w.doing = 'Keeps the stored 2026 results of every LIT setting that was really run, Jan-Jun against Jul-Oct. It never runs the strategy and changes nothing.';
  w.outputs = dials.slice(0, 5).map((d) => out(last, 'Dial: ' + clean(d.label, 60) + ' (' + (Array.isArray(d.options) ? d.options.length : 0) + ' settings stored)'));
  w.items = dials.length; w.n = dials.length;
  w.health = 'Results stored ' + agoText(last, now) + '. Read-only.';
}

function cronTask(inp, name) { const c = isObj(inp.cron) && isObj(inp.cron.tasks) ? inp.cron.tasks : null; return c && isObj(c[name]) ? c[name] : null; }
function cron1(inp, now, w) {
  const c = isObj(inp.cron) && isObj(inp.cron.tasks) ? inp.cron.tasks : null;
  w.src = 'cronos/status.json';
  w.learned = learnedFrom(inp.queue, 'cronos', []);
  if (!c) { w.missing = true; w.doing = 'No job log yet.'; w.health = 'cronos/status.json is not published (it is built by the nightly jobs).'; return; }
  const rows = Object.keys(c).filter((k) => isObj(c[k])).map((k) => ({ k, e: c[k], t: toMs(c[k].last_run_t) })).sort((a, b) => (b.t || 0) - (a.t || 0));
  const failed = rows.filter((r) => r.e.ok === false), old = rows.filter((r) => r.e.ok !== false && r.t != null && ageH(r.t, now) > (r.e.cadence === 'weekly' ? 8 * 24 : 80));
  w.last = rows.length && rows[0].t; w.items = rows.length; w.n = rows.length;
  w.status = failed.length ? 'failed' : old.length ? 'stale' : rows.length ? 'working' : 'idle';
  w.demo = !!inp.demo;
  w.doing = rows.length + ' scheduled jobs: ' + (rows.length - failed.length - old.length) + ' fine' + (old.length ? ', ' + old.length + ' overdue' : '') + (failed.length ? ', ' + failed.length + ' failed' : '') + '.';
  w.outputs = rows.slice(0, 5).map((r) => out(r.t, r.k + ': ' + (r.e.ok === false ? 'FAILED ' + clean(r.e.error, 70) : 'ok') + (r.e.note && r.e.ok !== false ? ' (' + clean(r.e.note, 60) + ')' : '')));
  w.health = clean(failed.length ? 'Failed: ' + failed.map((r) => r.k).join(', ') + '.' : old.length ? 'Overdue: ' + old.map((r) => r.k).join(', ') + '.' : 'Every job ran on time.', 200);
}

function queue1(inp, now, w) {
  const q = isObj(inp.queue) && isObj(inp.queue.queue) ? inp.queue.queue : null;
  w.src = 'handoff/QUEUE.md';
  if (!q) { w.missing = true; w.doing = 'No queue file yet.'; w.health = 'queue.json is not published (python tools/ergasterion_build.py).'; return; }
  const tasks = Array.isArray(q.tasks) ? q.tasks.filter(isObj) : [], last = toMs(inp.queue.asof);
  w.last = last; w.items = num(q.open) || 0; w.n = num(q.total);
  w.status = (num(q.open) || 0) > 0 ? 'working' : 'idle';
  w.demo = !!inp.demo;
  w.doing = (num(q.open) || 0) + ' open task' + (q.open === 1 ? '' : 's') + ', ' + (num(q.done) || 0) + ' done. ' + (tasks[0] ? 'Next: ' + clean(tasks[0].id, 40) + '.' : '');
  w.outputs = tasks.slice(0, 5).map((t) => out(last, clean(t.id, 30) + ': ' + clean(t.text, 100)));
  w.learned = [];
  w.health = 'Task list as of ' + (dayOf(last) || 'an unknown day') + '. Done tasks are ticked in the file by whoever did them.';
}

function dev1(inp, now, w) {
  const q = isObj(inp.queue) ? inp.queue : null, g = q && isObj(q.git) ? q.git : null, wu = q && isObj(q.writeups) ? q.writeups : null, commits = g && Array.isArray(g.commits) ? g.commits.filter(isObj) : [];
  w.src = commits.length ? 'git log' : 'research/writeups';
  w.demo = !!inp.demo;
  if (!q) { w.missing = true; w.doing = 'No project index yet.'; w.health = 'queue.json is not published.'; return; }
  const bs = g && Array.isArray(g.branches) ? g.branches.filter(isObj) : [];
  if (commits.length) {
    w.last = toMs(commits[0].t); w.outputs = commits.slice(0, 5).map((c) => out(toMs(c.t), c.s));
    w.doing = 'Latest commit: ' + clean(commits[0].s, 100) + (bs.length ? ' (' + bs.length + ' agent / task branches)' : '');
    w.status = ageH(w.last, now) <= 24 ? 'working' : 'idle';
    w.health = 'Git history read at build time; ' + commits.length + ' recent commits.';
  } else {
    const l = wu && Array.isArray(wu.latest) ? wu.latest.filter(isObj) : [];
    w.last = l.length ? toMs(l[0].date) : null; w.outputs = l.slice(0, 5).map((x) => out(toMs(x.date), 'Write-up: ' + clean(x.title, 90)));
    w.doing = l.length ? 'No git history at build time. The latest write-up: ' + clean(l[0].title, 90) : 'Nothing indexed yet.';
    w.status = l.length ? 'idle' : 'stale';
    w.health = 'Git history was not available when the site was built; showing write-ups only.';
  }
  w.items = w.outputs.length; w.n = wu && num(wu.count);
  const rej = (Array.isArray(q.rejected) ? q.rejected : []).filter(isObj).slice(0, 3).map((r) => ({ d: String(r.date || '').slice(0, 10), text: 'Tested and rejected: ' + clean(r.title, 110), src: clean(r.file, 90) }));
  w.learned = learnedFrom(q, 'dev', []).concat(rej);
}

/** the speech bubble: the worker's latest finding in plain words (its newest dated lesson, else what it is doing); a failure or a missing file is said first */
export function sayOf(w) {
  if (w.status === 'failed') return clean('My last run failed. ' + (w.health || '').replace(/^Example data\. /, ''), 110);
  if (w.missing) return 'No file from me yet, so I have nothing to show.';
  const dated = (w.learned || []).filter((l) => l && l.text && l.d).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  const t = dated.length ? dated[0].text : w.doing || (w.learned && w.learned[0] && w.learned[0].text) || '';
  return clean((w.status === 'stale' ? 'Old news: ' : '') + (t || 'Nothing to report yet.'), 110);
}
/** a crate's label: the first few words of an output, short enough to read on a small box */
export function crateTag(text) {
  let raw = String(text || '');
  for (let i = 0; i < 3; i++) raw = raw.replace(/^(Example|Commit|Dial|Write-up|Today|Best candidate|Done)[:\s]+/i, '');
  const t = clean(raw.split(/[:(;]|, | - /)[0], 40), words = t.split(' ');
  let out = '';
  for (const w of words) { if ((out + ' ' + w).trim().length > 16) break; out = (out + ' ' + w).trim(); }
  return out || t.slice(0, 16) || 'output';
}

export function buildWorkers(inp0, now) {
  const inp = isObj(inp0) ? inp0 : {};
  const W = STATIONS.map((s) => {
    const w = base(s);
    try {
      if (['chrysos', 'mercury', 'sibyl', 'oikos', 'arbiter'].includes(s.id)) money1(s.id, inp, now, w);
      else if (BOT_RE[s.id]) bot1(s.id, inp, now, w);
      else if (s.id === 'mind') mind1(inp, now, w);
      else if (s.id === 'kalshi') kalshi1(inp, now, w);
      else if (s.id === 'prometheus') prom1(inp, now, w);
      else if (s.id === 'hephaestus') heph1(inp, now, w);
      else if (s.id === 'cronos') cron1(inp, now, w);
      else if (s.id === 'queue') queue1(inp, now, w);
      else if (s.id === 'dev') dev1(inp, now, w);
    } catch (_) { w.status = 'failed'; w.doing = 'Could not read its file.'; }
    if (w.status === 'stale' && w.missing) w.health = w.health || 'No file yet.';
    if (inp.demo) { w.demo = true; w.health = 'Example data. ' + w.health; }
    w.outputs = w.outputs.slice(0, 5);
    w.learned = w.learned.slice(0, 8);
    w.say = sayOf(w);
    w.crates = w.outputs.map((o, i) => ({ i, tag: crateTag(o.text), text: o.text, t: o.t }));
    return w;
  });
  return W;
}

/** newest first, plain words: every dated output of every worker */
export function events(workers, now, limit) {
  const E = [];
  for (const w of workers) for (const o of w.outputs) if (o.t != null && o.t <= now + H) E.push({ t: o.t, who: w.id, name: w.name, text: o.text });
  for (const w of workers) if (w.last != null && w.last <= now + H && !E.some((e) => e.who === w.id && e.t === w.last)) E.push({ t: w.last, who: w.id, name: w.name, text: w.status === 'failed' ? 'its last run failed' : 'last ran (' + STATUS_WORD[w.status].toLowerCase() + ')' });
  E.sort((a, b) => b.t - a.t);
  return E.slice(0, limit || 30);
}

/** the Learning board: up to 12 dated lessons, the week first, at most 3 per worker in the first pass */
export function lessons(workers, now, limit) {
  const n = limit || 12, seen = new Set(), all = [];
  for (const w of workers) for (const l of w.learned) {
    const key = l.text.toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    const ms = toMs(l.d);
    all.push({ who: w.id, name: w.name, d: l.d || '', ms, text: l.text, src: l.src, week: ms != null && now - ms <= WEEK_D * D && ms <= now + D, sample: w.status === 'sample' });
  }
  all.sort((a, b) => (b.ms == null ? -1 : b.ms) - (a.ms == null ? -1 : a.ms) || (a.who < b.who ? -1 : 1));
  const pick = [], per = {};
  for (const pass of [3, 99]) {
    for (const l of all) { if (pick.length >= n) break; if (pick.includes(l) || (per[l.who] || 0) >= pass) continue; if (l.ms == null && pass === 3 && pick.length < n - 2) continue; pick.push(l); per[l.who] = (per[l.who] || 0) + 1; }
  }
  pick.sort((a, b) => (b.ms == null ? -1 : b.ms) - (a.ms == null ? -1 : a.ms));
  return pick;
}

/** ranked "what next": research suggestions from data gaps, small samples, stale feeds, open runs and the queue. Each has a why, what it is worth in plain words (ev) and a first step.
 *  No dollar value is invented: `ev` says how much a fix can change what we know, and what it costs. */
export function suggestions(workers, queueBlock, now) {
  const S = [], qb = isObj(queueBlock) ? queueBlock : {}, q = isObj(qb.queue) ? qb.queue : null;
  for (const w of workers) {
    const money = ['chrysos', 'mercury', 'sibyl', 'oikos', 'arbiter'].includes(w.id);
    if (w.status === 'failed') S.push({ w: 100, kind: 'failed', who: w.id, title: w.name + ' failed its last run', why: w.health || w.doing, ev: 'High: a broken worker finds nothing, and everything that reads its file goes stale with it. Cheap to fix.', next: w.id === 'kalshi' ? 'Check the Oracle VM and restart the bot there.' : 'Open its log, fix the cause, run it once by hand.' });
    else if (w.missing) S.push({ w: 80, kind: 'gap', who: w.id, title: w.name + ' has no file here', why: w.health, ev: 'High: without its file this station is blind, so nothing it could find is seen.', next: money ? 'Run tools/bat/RUN_MONEY.bat on the PC, then publish the site.' : w.id === 'cronos' ? 'Run python -m tools.cronos once, or wait for the nightly job.' : 'Rebuild the site so its file is published.' });
    else if (w.status === 'sample') S.push({ w: 70, kind: 'sample', who: w.id, title: w.name + ' is in demo mode', why: 'Its numbers are a sample, so nothing it shows is a real finding.', ev: 'Medium: real data turns a demo into findings; one run is enough.', next: money ? 'Run tools/bat/RUN_MONEY.bat so ' + w.name + ' reads real public data.' : 'Connect its real feed; until then treat everything as an example.' });
    else if (w.status === 'stale') S.push({ w: 60, kind: 'stale', who: w.id, title: w.name + ' is stale', why: w.health, ev: 'Medium: old numbers can point the wrong way; a refresh costs minutes.', next: 'Refresh it (' + (money ? 'tools/bat/RUN_MONEY.bat' : w.id === 'mind' ? 'wait for the nightly research, or python -X utf8 tools/mind_build.py' : 'the next site build') + ') and look again.' });
    if (w.n != null && w.n < 30 && ['kalshi'].includes(w.id) && w.status !== 'sample') S.push({ w: 50, kind: 'sample-size', who: w.id, title: w.name + ' has only ' + w.n + ' settled trades', why: 'Too few to call any edge real.', ev: 'High for its cost: waiting is free, and it stops us acting on luck.', next: 'Keep it running on paper; test nothing new until there are 30 or more.' });
  }
  const gaps = (Array.isArray(qb.gaps) ? qb.gaps : []).filter((g) => isObj(g) && g.name && g.last);
  if (gaps.length) {
    const worst = gaps[0], same = gaps.filter((g) => g.last === worst.last).length;
    S.push({ w: 56, kind: 'data', who: 'hephaestus', title: gaps.length + ' data set' + (gaps.length === 1 ? ' ends' : 's end') + ' weeks before the newest research', why: clean(worst.name, 40) + ' stops on ' + clean(worst.last, 10) + ' (' + (num(worst.days) || '?') + ' days behind)' + (gaps.length > 1 ? '; ' + (gaps.length - same > 0 ? 'the others stop later' : 'the others stop the same day') : '') + '.',
      ev: 'Medium: every backtest stops where its data stops, so the newest weeks are untested. A fresh export is one manual step.', next: 'Export the newest bars from TradingView into data/ (futures data only), then rerun the live replay.' });
  }
  const pipe = isObj(qb.pipeline) ? qb.pipeline : null, fams = pipe && Array.isArray(pipe.families) ? pipe.families.filter((f) => isObj(f) && num(f.open) > 0).slice().sort((a, b) => b.open - a.open) : [];
  if (fams.length) S.push({ w: 45, kind: 'open-runs', who: 'dev', title: clean(fams[0].name, 30) + ' has ' + fams[0].open + ' runs with no verdict', why: 'They were run and stored, but nobody wrote adopted or rejected on them' + (fams.length > 1 ? ' (next: ' + clean(fams[1].name, 30) + ', ' + fams[1].open + ')' : '') + '.',
    ev: 'Medium: the work is already done; a verdict costs one read and stops the same idea being run twice.', next: 'Open the Archive on ' + clean(fams[0].name, 30) + ', sort by date, and mark the oldest open runs.' });
  const ch = (Array.isArray(qb.changed) ? qb.changed : []).filter((c) => isObj(c) && c.text);
  if (ch.length) S.push({ w: 42, kind: 'flip', who: clean(ch[0].who || 'dev', 12), title: 'A belief changed: check what else leaned on it', why: clean(ch[0].text, 170), ev: 'High when a live rule rests on the old belief, otherwise small: reading is cheap.', next: 'Read ' + clean(ch[0].src || 'the write-up', 80) + ' and list any rule or setting that assumed the old belief.' });
  const mind = isObj(qb.mind) ? qb.mind : null, small = mind && Array.isArray(mind.observations) ? mind.observations.filter((o) => isObj(o) && / of (the|its) last (\d+)/.test(String(o.text)) && Number(/ of (?:the|its) last (\d+)/.exec(String(o.text))[1]) < 30) : [];
  if (small.length) S.push({ w: 38, kind: 'sample-size', who: 'mind', title: 'The Mind has ' + small.length + ' note' + (small.length === 1 ? '' : 's') + ' built on fewer than 30 trades', why: clean(small[0].text, 150), ev: 'Small today, bigger later: a pattern in 20 trades is a question, not an answer.', next: 'Leave the rules alone; look again when each note rests on 30 or more trades.' });
  if (q && (num(q.open) || 0) > 0) { const t = Array.isArray(q.tasks) && q.tasks[0]; S.push({ w: 40, kind: 'queue', who: 'queue', title: 'The queue has ' + q.open + ' open tasks', why: 'Nobody has ticked them yet.', ev: 'Depends on the task: the top of the list was put there first for a reason.', next: t ? 'Start with ' + clean(t.id, 40) + '.' : 'Open handoff/QUEUE.md.' }); }
  const miss = S.filter((x) => x.kind === 'gap');
  if (miss.length > 2) {                      // many stations with no file is ONE finding (the site has no worker files), not eight rows
    const names = miss.map((x) => nameOf(x.who));
    for (const m of miss) S.splice(S.indexOf(m), 1);
    S.push({ w: 80, kind: 'gap', who: miss[0].who, title: miss.length + ' workers have no file here', why: clean(names.join(', '), 150) + ': their files are not published on this site.', ev: 'High: without their files these stations are blind, so nothing they could find is seen.', next: 'Run tools/bat/RUN_MONEY.bat and the site build on the PC, then publish; the stations fill in by themselves.' });
  }
  S.sort((a, b) => b.w - a.w || (a.who < b.who ? -1 : 1));
  const top = S.slice(0, 8);
  if (!top.length) top.push({ w: 0, kind: 'none', who: '', title: 'Nothing is waiting', why: 'Every worker has fresh, real data.', ev: 'Nothing to gain right now.', next: 'Pick the next idea from the "Tested and rejected" list only if you have a new reason.' });
  top.forEach((x, i) => { x.rank = i + 1; });
  return top;
}

export function headline(workers) {
  const c = { working: 0, idle: 0, stale: 0, failed: 0, sample: 0 };
  for (const w of workers) c[w.status]++;
  const bad = c.failed + c.stale, n = workers.length;
  const level = c.failed ? 'bad' : bad || c.sample ? 'warn' : 'ok';
  const parts = [];
  if (c.working) parts.push(c.working + ' working');
  if (c.idle) parts.push(c.idle + ' idle');
  if (c.sample) parts.push(c.sample + ' showing sample data');
  if (c.stale) parts.push(c.stale + ' stale');
  if (c.failed) parts.push(c.failed + ' failed');
  const title = c.failed ? c.failed + ' worker' + (c.failed === 1 ? '' : 's') + ' failed' : bad ? bad + ' of ' + n + ' workers need a look' : c.sample ? 'Showing sample data' : 'All ' + n + ' workers are fine';
  return { level, title, line: parts.join(', ') + '.', counts: c, n };
}

/** the fixture's relative times (age_h, ago_h, d_ago) -> real ones from now, so the demo is always "recent" */
export function resolveDemo(fx, now) {
  const f = JSON.parse(JSON.stringify(isObj(fx) ? fx : {}));
  const day = (n) => dayOf(now - n * D);
  if (isObj(f.home) && f.home.t_ago_h != null) f.home.t = Math.round((now - f.home.t_ago_h * H) / 1000);
  if (isObj(f.kalshi) && f.kalshi.t_ago_h != null) f.kalshi.t = Math.round((now - f.kalshi.t_ago_h * H) / 1000);
  if (isObj(f.money)) for (const s of f.money.streams || []) if (num(s.age_min) != null) s.asof = new Date(now - s.age_min * 60000).toISOString();
  if (isObj(f.cron)) for (const k in f.cron.tasks || {}) if (num(f.cron.tasks[k].ago_h) != null) f.cron.tasks[k].last_run_t = Math.round((now - f.cron.tasks[k].ago_h * H) / 1000);
  if (isObj(f.forge) && num(f.forge.built_ago_d) != null) f.forge.built = day(f.forge.built_ago_d) + ' 02:00';
  if (isObj(f.heph) && num(f.heph.built_ago_d) != null) f.heph.built = day(f.heph.built_ago_d) + ' 02:00';
  if (isObj(f.queue)) {
    const q = f.queue;
    if (num(q.asof_ago_d) != null) q.asof = day(q.asof_ago_d);
    for (const l of q.learnings || []) if (num(l.d_ago) != null) l.d = day(l.d_ago);
    for (const r of q.rejected || []) if (num(r.d_ago) != null) r.date = day(r.d_ago);
    if (isObj(q.mind) && num(q.mind.ago_h) != null) q.mind.t = Math.round((now - q.mind.ago_h * H) / 1000);
    if (isObj(q.git)) for (const c of q.git.commits || []) if (num(c.ago_h) != null) c.t = Math.round((now - c.ago_h * H) / 1000);
    if (isObj(q.writeups)) for (const x of q.writeups.latest || []) if (num(x.d_ago) != null) x.date = day(x.d_ago);
    for (const e of (q.events || []).concat(q.money_runs || [])) if (num(e.ago_h) != null) e.t = Math.round((now - e.ago_h * H) / 1000);
    for (const l of q.lessons || []) { if (num(l.d_ago) != null) l.d = day(l.d_ago); for (const sc of l.sources || []) if (num(sc.d_ago) != null) sc.d = day(sc.d_ago); }
    for (const c of q.changed || []) if (num(c.d_ago) != null) c.d = day(c.d_ago);
    if (isObj(q.pipeline)) for (const m of q.pipeline.moves || []) if (num(m.d_ago) != null) m.d = day(m.d_ago);
    for (const g of q.gaps || []) if (num(g.d_ago) != null) g.last = day(g.d_ago);
  }
  f.demo = true;
  return f;
}

/** true when at least one real worker file arrived (queue.json ships with the site, so it alone does not make the page real) */
export function haveReal(inp) { return isObj(inp) && ['home', 'money', 'kalshi', 'cron', 'forge', 'heph'].some((k) => isObj(inp[k])); }

// ------------------------------------------------------------------ walking the floor (pure, so it is tested)
export function hallOf(p) { if (!p) return HALLS[3]; const x = p && isFinite(p.x) ? p.x : 0, z = p && isFinite(p.z) ? p.z : 0; if (z > 9.7) return CAMP; return HALLS.find((h) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1) || HALLS[3]; }
const inDoor = (axis, c) => DOORS.some((d) => d.axis === axis && Math.abs(c - d.c) <= d.half - 0.3);
/** keep a point inside the factory, out of the inner walls (except through a door) and out of every station's circle */
export function resolveCollision(x, z, stations, r) {
  const R = r == null ? STATION_R : r;
  if (z > BOUNDS.z) {                                   // south of the factory: the front doorway, then the camp
    const d = CAMP.door;
    if (z < d.z1) { if (Math.abs(x - d.x) > d.half) { if (z < (d.z0 + d.z1) / 2) z = BOUNDS.z; else z = d.z1; } }
    if (z >= d.z1) { x = Math.max(CAMP.x0 + 0.6, Math.min(CAMP.x1 - 0.6, x)); z = Math.min(CAMP.z1 - 0.6, z); }
  }
  if (z <= BOUNDS.z) { x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, x)); z = Math.max(-BOUNDS.z, z); }
  const nearX = Math.abs(x) < WALL_T && !inDoor('x', z), nearZ = Math.abs(z) < WALL_T && !inDoor('z', x);
  if (nearX) x = x >= 0 ? WALL_T : -WALL_T;
  if (nearZ) z = z >= 0 ? WALL_T : -WALL_T;
  for (const s of stations || []) {
    const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
    if (d < R) { const k = d < 1e-6 ? 1 : R / d; x = s.x + (d < 1e-6 ? R : dx * k); z = s.z + (d < 1e-6 ? 0 : dz * k); }
  }
  return { x, z };
}
/** move: { fwd, side } in -1..1 (joystick); yaw 0 looks toward -z; dt seconds */
export function walk(p, yaw, move, dt, stations, speed) {
  const sp = (speed || 3.4) * Math.min(dt, 0.1), f = Math.max(-1, Math.min(1, move.fwd || 0)), s = Math.max(-1, Math.min(1, move.side || 0));
  const nx = p.x + (-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp, nz = p.z + (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp;
  return resolveCollision(nx, nz, stations);
}
/** smooth controls: move `v` toward `target` so that it gets about 63% of the way in 1 / rate seconds (frame-rate independent); reduced motion passes rate 0 = jump */
export function ease(v, target, dt, rate) { return !rate || rate <= 0 ? target : v + (target - v) * (1 - Math.exp(-rate * Math.max(0, Math.min(dt, 0.25)))); }
export function nearest(p, stations, maxD) {
  let best = null, bd = maxD == null ? 3.2 : maxD;
  for (const s of stations) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
/** the camera for 'follow worker X': behind and above the figure, looking at it */
export function followCam(s, t, reduced) {
  const a = reduced ? 0 : t * 0.35, fx = s.x + Math.sin(a) * 0.5, fz = s.z + Math.cos(a) * 0.5;
  return { x: fx, z: fz + 3.2, y: 2.2, look: { x: fx, y: 1.25, z: fz } };
}
export const TOUR_S = 80;                 // one calm lap of the four halls
/** the calm overview flythrough for people who do not want to walk: a slow oval above the four halls, always looking down at the floor ahead. Reduced motion: one still view of everything. */
export function tourCam(t, reduced) {
  if (reduced) return { x: 0, y: 21, z: 15, look: { x: 0, y: 0, z: 0.5 }, hall: null };
  const a = Math.PI / 4 + 0.5 - (t / TOUR_S) * Math.PI * 2, b = a - 0.8;
  const x = Math.cos(a) * 10.4, z = Math.sin(a) * 8.2, lx = Math.cos(b) * 5.2, lz = Math.sin(b) * 4.0;
  return { x, y: 9.2, z, look: { x: lx, y: 0.6, z: lz }, hall: hallOf({ x: lx, z: lz }).id };
}

// ------------------------------------------------------------------ the builders' camp (builders.json: handoff/agents_now.json joined with git by the builder)
/** one row per build agent: its tent spot, status (working = a commit in the last 15 minutes, quiet, done = merged, job = the file alone: no live activity), its commits with times,
 *  the scroll lines above its tent, how many commits today (its stack of crates), folders, what it shipped. Nothing is invented: no git means status 'job'. */
export function builders(doc, now, demo) {
  const d = isObj(doc) ? doc : {}, rows = (Array.isArray(d.agents) ? d.agents : []).filter((a) => isObj(a) && a.name).slice(0, CAMP_SPOTS.length);
  const day0 = isFinite(now) ? now - (now % D) : 0;
  return rows.map((a, i) => {
    const sp = CAMP_SPOTS[i], cm = (Array.isArray(a.commits) ? a.commits : []).filter((c) => isObj(c) && c.s && toMs(c.t) != null).slice(0, 8).map((c) => ({ t: toMs(c.t), text: clean(c.s, 120) }));
    const ship = (Array.isArray(a.shipped) ? a.shipped : []).filter((c) => isObj(c) && c.s).slice(0, 8).map((c) => ({ t: toMs(c.t), text: clean(c.s, 120) }));
    const last = toMs(a.last_t), live = a.live === true && last != null, mins = live && isFinite(now) ? Math.max(0, Math.round((now - last) / 60000)) : null;
    const status = !live ? 'job' : a.merged === true ? 'done' : mins != null && mins <= WORK_MIN ? 'working' : 'quiet';
    const today = cm.filter((c) => c.t >= day0 && c.t <= now + H).length;
    const scroll = cm.length ? cm.map((c) => c.text) : ship.length ? ship.map((c) => 'Shipped: ' + c.text) : ['No commits to show: ' + BUILD_HELP.job + '.'];
    return { id: 'camp' + (i + 1), i, name: clean(a.name, 40), job: clean(a.job, 140), area: clean(a.area, 20), branch: clean(a.branch, 60), x: sp.x, z: sp.z, figJob: sp.job, status, live, mins, last: live ? last : null,
      ahead: Math.max(0, Math.round(num(a.ahead) || 0)), files: Math.max(0, Math.round(num(a.files) || 0)), folders: (Array.isArray(a.folders) ? a.folders : []).filter((f) => isObj(f) && f.name).slice(0, 4).map((f) => ({ name: clean(f.name, 50), n: Math.max(0, Math.round(num(f.n) || 0)) })),
      commits: cm, shipped: ship, shippedN: Math.max(0, Math.round(num(a.shipped_n) || 0)), today, crates: Math.min(6, today), scroll, sample: !!demo,
      line: status === 'job' ? 'Job only, no live activity.' : status === 'done' ? 'Done: its work is merged into the release.' : (status === 'working' ? 'Working: ' : 'Quiet: ') + 'last commit ' + agoText(last, now) + '.' };
  });
}
/** the 'All hands' overview: counts by status, one plain sentence, the agents ordered working first */
export function allHands(rows, doc, demo) {
  const c = { working: 0, quiet: 0, done: 0, job: 0 }, R = Array.isArray(rows) ? rows : [];
  for (const r of R) c[r.status]++;
  const order = { working: 0, quiet: 1, done: 2, job: 3 }, list = R.slice().sort((a, b) => order[a.status] - order[b.status] || (b.last || 0) - (a.last || 0) || a.i - b.i);
  const parts = []; if (c.working) parts.push(c.working + ' working now'); if (c.quiet) parts.push(c.quiet + ' quiet'); if (c.done) parts.push(c.done + ' done'); if (c.job) parts.push(c.job + ' with a job line only');
  const git = isObj(doc) && doc.source === 'git';
  return { n: R.length, counts: c, list, commits: R.reduce((s2, r) => s2 + r.ahead, 0), today: R.reduce((s2, r) => s2 + r.today, 0),
    line: !R.length ? 'No build agents are listed yet (handoff/agents_now.json).' : R.length + ' build agent' + (R.length === 1 ? '' : 's') + ': ' + parts.join(', ') + '.' + (demo ? ' Example agents, not the real ones.' : ''),
    note: !R.length ? '' : demo ? 'Sample camp.' : git ? 'Read from git when the site was built: "working" means a commit in the 15 minutes before now, so an old build shows everyone quiet.' : 'Git was not available when the site was built: these are the job lines only, no live activity.' };
}
/** the fixture's builders (ago_min) -> real times */
export function resolveBuilders(doc, now) {
  const f = JSON.parse(JSON.stringify(isObj(doc) ? doc : {}));
  for (const a of Array.isArray(f.agents) ? f.agents : []) { if (!isObj(a)) continue; for (const c of (a.commits || []).concat(a.shipped || [])) if (num(c.ago_min) != null) c.t = Math.round((now - c.ago_min * 60000) / 1000); if (num(a.last_ago_min) != null) a.last_t = Math.round((now - a.last_ago_min * 60000) / 1000); }
  return f;
}

// ------------------------------------------------------------------ people: every worker and every builder is an individual you can talk to (docs/PERSONA_API.md)
const SCANNERS = ['chrysos', 'mercury', 'sibyl', 'oikos', 'arbiter'], BOTS = ['lit', 'atlas', 'blitz', 'kalshi'];
/** the shared person id of a station worker: scanner:chrysos, bot:lit, mind, job:<id> for the jobs, the queue and the dev agents (the roster's own people) */
const JOBS = ['prometheus', 'hephaestus', 'cronos', 'queue', 'dev'];
export function personId(id) { return SCANNERS.includes(id) ? 'scanner:' + id : BOTS.includes(id) ? 'bot:' + id : id === 'mind' ? 'mind' : JOBS.includes(id) ? 'job:' + id : 'villager:' + clean(id, 20); }
/** the name a person is shown with: their own Greek name (the roster's, e.g. Kalamos), never a machine word like "The" or "Dev" */
export function displayName(w) { return w ? (w.who || String(w.name || '').split(' (')[0]) : ''; }
/** builder:<branch-short>: the branch without its 'worktree-agent-' prefix (the whole short name first, its first 8 characters as a second spelling the kit may use) */
export function builderIds(branch) { const b = clean(branch, 60).replace(/^worktree-agent-/, '').replace(/[^A-Za-z0-9._-]/g, ''); return b ? ['builder:' + b, 'builder:' + b.slice(0, 8)].filter((x, i, a2) => a2.indexOf(x) === i) : []; }
/** everyone: { key ('w:<id>' | 'b:<id>'), pid, pids, name, title, status, word, place (hall id), x, z, line (its one-liner for the stand-up) } */
export function people(workers, buildersRows) {
  const P = [];
  for (const w of Array.isArray(workers) ? workers : []) P.push({ look: Math.max(0, IDS.indexOf(w.id)), key: 'w:' + w.id, pid: personId(w.id), pids: [personId(w.id)], name: displayName(w), title: w.role, station: w.name, status: w.status, word: STATUS_WORD[w.status], place: w.hall, x: w.x, z: w.z - 0.12, kind: 'worker',
    line: clean(w.status === 'failed' ? 'Blocked: ' + w.say : w.missing ? 'Nothing to report: no file from me yet.' : w.say, 140) });
  for (const b of Array.isArray(buildersRows) ? buildersRows : []) { const ids = builderIds(b.branch); P.push({ look: STATIONS.length + b.i, key: 'b:' + b.id, pid: ids[0] || 'builder:' + b.id, pids: ids.length ? ids : ['builder:' + b.id], name: b.name, title: b.job, status: b.status, word: BUILD_WORD[b.status], place: 'camp', x: b.x, z: b.z - 1.9, kind: 'builder',
    line: clean(b.status === 'job' ? 'My job: ' + b.job + '. No live activity to report.' : b.commits.length ? (b.status === 'working' ? 'Just now: ' : 'Last: ') + b.commits[0].text : b.shipped.length ? 'Shipped: ' + b.shipped[0].text : 'My job: ' + b.job, 140) }); }
  return P;
}
export function peopleHere(P, place) { return (Array.isArray(P) ? P : []).filter((x) => x.place === place); }
/** the person you may talk to in first person: the nearest one within 3 m (null when nobody is that close) */
export function talkTarget(pos, P, maxD) { let best = null, bd = maxD == null ? 3 : maxD; for (const x of Array.isArray(P) ? P : []) { const d = Math.hypot(pos.x - x.x, pos.z - x.z); if (d <= bd) { bd = d; best = x; } } return best; }
const SKIN = ['#f1c9a5', '#e0ac7e', '#c68f5e', '#a56b43', '#f5d6b8', '#8a5a3c'], HAIR = ['#3a2a1c', '#6b4423', '#1f1a17', '#a0703a', '#c9b28a', '#7a2e1e', '#55524d'], OUTFIT = ['#c8a24a', '#7f8a52', '#c96a4a', '#4b7a99', '#e9dfc8', '#9c6b3c'];
/** a seeded look so everyone is recognisably different: skin tone, hair colour, tunic in the AGORA colours. i = the station index, or 15 + the tent index for a builder */
export function lookOf(i) { const n = Math.max(0, Math.round(num(i) || 0)); return { skin: SKIN[(n * 5 + 1) % SKIN.length], hair: HAIR[(n * 3 + 2) % HAIR.length], outfit: OUTFIT[(n * 7 + Math.floor(n / 6)) % OUTFIT.length] }; }
export const QUESTIONS = [['doing', 'What are you doing?'], ['last', 'What was your last result?'], ['learned', 'What did you learn?'], ['stuck', 'Are you stuck?'], ['next', 'What is next?'], ['sure', 'How sure are you?']];
/** the built-in chat (used when the shared people kit is not loaded): six questions, each answered ONLY from this worker's own row. { text, sources } */
export function answer(row, qid, now, plan) {
  if (!isObj(row)) return { text: 'I have nothing on record.', sources: [] };
  const builder = Array.isArray(row.commits), src = [];
  let t = '';
  if (builder) {
    const c0 = row.commits[0];
    if (qid === 'doing') t = 'My job: ' + row.job + '. ' + row.line;
    else if (qid === 'last') t = c0 ? 'My last commit, ' + agoText(c0.t, now) + ': ' + c0.text : row.shipped.length ? 'My last merged work: ' + row.shipped[0].text : 'I have no commit to show: ' + BUILD_HELP.job + '.';
    else if (qid === 'learned') t = row.shipped.length ? 'I build rather than research. What I shipped so far: ' + row.shipped.slice(0, 3).map((x) => x.text).join('; ') + '.' : 'I build rather than research, and nothing of mine is merged into the release yet. The lessons are on the Learning board.';
    else if (qid === 'stuck') t = row.status === 'job' ? 'I cannot tell you: there is no live activity for my branch, only my job line.' : row.status === 'done' ? 'No: my work is merged into the release.' : row.status === 'working' ? 'No: I committed ' + agoText(row.last, now) + '.' : 'Maybe: my last commit was ' + agoText(row.last, now) + '. Ask the lead if that is too long.';
    else if (qid === 'next') t = row.status === 'done' ? 'Nothing more on this job: it is merged. The lead hands out the next one.' : 'The next step of my job (' + row.job + '). I only know my job line and my commits; the lead holds the plan.';
    else t = row.sample ? 'Not at all: I am an example builder, not a real one.' : !row.live ? 'I can only vouch for my job line: git was not readable for my branch.' : 'As sure as git: ' + row.ahead + ' commit' + (row.ahead === 1 ? '' : 's') + ' and ' + row.files + ' file' + (row.files === 1 ? '' : 's') + ' on my branch when the site was built. Whether it is good is for the tests and the lead to say.';
    if (row.live) src.push('builders.json (git at build time)'); else src.push('handoff/agents_now.json');
  } else {
    const c0 = (row.crates || [])[0], l0 = (row.learned || []).filter((l) => l && l.text)[0], bad = row.status === 'failed' || row.status === 'stale' || row.missing;
    if (qid === 'doing') t = row.doing || 'Nothing is recorded for me right now.';
    else if (qid === 'last') t = c0 ? 'My last output' + (c0.t != null ? ', ' + agoText(c0.t, now) : '') + ': ' + c0.text : 'My conveyor is empty: no output on record yet.';
    else if (qid === 'learned') { t = l0 ? l0.text + (l0.d ? ' (' + l0.d + ')' : '') : 'Nothing learned and written down yet.'; if (l0 && l0.src) src.push(l0.src); }
    else if (qid === 'stuck') t = row.status === 'failed' ? 'Yes. ' + (row.health || 'My last run failed.') : row.missing ? 'Yes: ' + (row.health || 'my file is not published.') : row.status === 'stale' ? 'Sort of: my data is old. ' + (row.health || '') : 'No. ' + (row.health || '');
    else if (qid === 'next') { const s2 = (Array.isArray(plan) ? plan : []).find((x) => x.who === row.id); t = s2 ? s2.title + '. First step: ' + s2.next : bad ? 'Getting fresh data: ' + (row.health || 'my file needs a refresh.') : 'Nothing is queued for me. I keep doing my job: ' + String(row.role || '').toLowerCase() + '.'; }
    else t = row.demo ? 'Not at all: these are example numbers, not real ones.' : row.status === 'sample' ? 'Not at all: I am showing sample data.' : row.missing ? 'I cannot be: I have no file to read.' : row.status === 'stale' ? 'Not very: my numbers are old (' + agoText(row.last, now) + ').' : row.n != null && row.n < 30 && row.id === 'kalshi' ? 'Not very: only ' + row.n + ' settled trades, too few to call anything real.' : 'As sure as my file, updated ' + agoText(row.last, now) + '. I only report what it says: paper and suggestions only, I cannot place orders.';
    if (row.src) src.push(row.src);
  }
  return { text: clean(t, 420), sources: src.filter((x, i, a2) => x && a2.indexOf(x) === i).map((x) => clean(x, 90)) };
}

// ------------------------------------------------------------------ the day replay (one dated stream across every worker)
const nameOf = (id) => { const s = STATIONS.find((x) => x.id === id); return s ? s.name : id; };
/** everything that has a time, oldest first: the builder's stream (research runs, write-ups, the Mind, done tasks), git commits, the money machines' own run times,
 *  every night job of Cronos and each worker's own dated outputs. { t (ms), who, name, text, ok, kind, src, sample } */
export function stream(inp0, workers, now) {
  const inp = isObj(inp0) ? inp0 : {}, q = isObj(inp.queue) ? inp.queue : {}, E = [], seen = new Set(), demo = !!inp.demo;
  const add = (t, who, text, ok, kind, src, sample) => {
    const ms = toMs(t), id = IDS.includes(who) ? who : 'dev', txt = clean(text, 150);
    if (ms == null || !txt || (isFinite(now) && ms > now + H)) return;
    const key = id + '|' + Math.round(ms / 60000) + '|' + txt.toLowerCase();
    if (seen.has(key)) return; seen.add(key);
    E.push({ t: ms, who: id, name: nameOf(id), text: txt, ok: ok !== false, kind: clean(kind || 'run', 12), src: clean(src || '', 90), sample: !!sample || demo });
  };
  for (const e of Array.isArray(q.events) ? q.events : []) if (isObj(e)) add(e.t, e.who, e.text, e.ok, e.kind, e.src, false);
  for (const e of Array.isArray(q.money_runs) ? q.money_runs : []) if (isObj(e)) add(e.t, e.who, e.text, e.ok, 'money', e.src, e.sample);
  for (const c of isObj(q.git) && Array.isArray(q.git.commits) ? q.git.commits : []) if (isObj(c)) add(c.t, 'dev', 'Commit: ' + clean(c.s, 120), true, 'commit', 'git log', false);
  const tasks = isObj(inp.cron) && isObj(inp.cron.tasks) ? inp.cron.tasks : {};
  for (const k of Object.keys(tasks)) { const e = tasks[k]; if (isObj(e)) add(e.last_run_t, 'cronos', clean(k, 30) + ': ' + (e.ok === false ? 'FAILED ' + clean(e.error || '', 70) : 'ran fine'), e.ok !== false, 'job', 'cronos/status.json', false); }
  for (const w of Array.isArray(workers) ? workers : []) {
    if (w.id === 'cronos' || w.id === 'dev') continue;                       // their rows are above, one by one
    if (w.last != null) add(w.last, w.id, w.status === 'failed' ? 'FAILED: ' + (w.health || 'its last run failed') : clean(w.doing, 140) || 'ran', w.status !== 'failed', 'run', w.src, w.status === 'sample');
  }
  E.sort((a, b) => a.t - b.t || (a.who < b.who ? -1 : a.who > b.who ? 1 : 0));
  return E;
}
export const RANGES = { '24h': { ms: D, label: 'Last 24 hours' }, '7d': { ms: 7 * D, label: 'Last 7 days' } };
/** the replay span. It ends now; when nothing at all happened in it, it honestly moves back to end on the newest event and says so (shifted). */
export function replayWindow(E, now, range) {
  const span = (RANGES[range] || RANGES['24h']).ms, all = Array.isArray(E) ? E : [];
  let t1 = now, shifted = false, ev = all.filter((e) => e.t > t1 - span && e.t <= t1);
  if (!ev.length && all.length) { t1 = all[all.length - 1].t; shifted = true; ev = all.filter((e) => e.t > t1 - span && e.t <= t1); }
  const fails = ev.filter((e) => !e.ok);
  return { range: RANGES[range] ? range : '24h', t0: t1 - span, t1, span, events: ev, shifted, fails: fails.length, workers: new Set(ev.map((e) => e.who)).size,
    note: !all.length ? 'No dated events at all yet.' : shifted ? 'Nothing ran in the ' + (RANGES[range] || RANGES['24h']).label.toLowerCase() + '. Showing the same span ending at the newest event, ' + dayOf(t1) + '.' : ev.length + ' event' + (ev.length === 1 ? '' : 's') + ' from ' + new Set(ev.map((e) => e.who)).size + ' workers' + (fails.length ? ', ' + fails.length + ' failed' : ', none failed') + '.' };
}
/** the state of the factory at the cursor (0..1 through the span): what just happened, who is busy, how much is done */
export function replayAt(win, f) {
  const k = Math.max(0, Math.min(1, isFinite(f) ? f : 1)), t = win.t0 + win.span * k, past = win.events.filter((e) => e.t <= t), slice = win.span / 24;
  const active = [...new Set(past.filter((e) => e.t > t - slice).map((e) => e.who))], counts = {};
  for (const e of past) counts[e.who] = (counts[e.who] || 0) + 1;
  return { t, f: k, done: past.length, total: win.events.length, recent: past.slice(-6).reverse(), active, failing: [...new Set(past.filter((e) => !e.ok && e.t > t - slice).map((e) => e.who))], counts };
}
/** 'jump to last failure': the newest failed event at or before the cursor in the span, else the newest failure of the span; null when nothing failed */
export function lastFailure(win, f) {
  const t = win.t0 + win.span * (isFinite(f) ? Math.max(0, Math.min(1, f)) : 1), bad = win.events.filter((e) => !e.ok);
  if (!bad.length) return null;
  const before = bad.filter((e) => e.t < t - 1), e = before.length ? before[before.length - 1] : bad[bad.length - 1];
  return { e, f: Math.max(0, Math.min(1, (e.t - win.t0) / win.span)) };
}
/** the next event after the cursor (reduced motion plays event by event) */
export function nextEvent(win, f) { const t = win.t0 + win.span * f, e = win.events.find((x) => x.t > t + 1); return e ? Math.min(1, (e.t - win.t0) / win.span) : 1; }
/** lane strip: one row per worker that did something, each event a tick at 0..1 */
export function lanes(win) {
  const rows = [];
  for (const s of STATIONS) { const ev = win.events.filter((e) => e.who === s.id); if (ev.length) rows.push({ id: s.id, name: s.name, ticks: ev.map((e) => ({ f: (e.t - win.t0) / win.span, ok: e.ok })) }); }
  return rows;
}
export function clockText(ms, span) {
  if (ms == null || !isFinite(ms)) return '';
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0'), day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return day + ' ' + dayOf(ms).slice(5) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' UTC';
}

// ------------------------------------------------------------------ the research pipeline wall: Idea -> Testing -> Verdict
/** from queue.pipeline (the builder reads the Archive's index): four lanes with counts, the families, the newest 20 moves, and a link into the Archive for each */
export function pipeline(queueBlock, demo) {
  const p = isObj(queueBlock) && isObj(queueBlock.pipeline) ? queueBlock.pipeline : null, c = p && isObj(p.counts) ? p.counts : {};
  const n = (v) => Math.max(0, Math.round(num(v) || 0));
  const link = (find) => '../archive/' + (find ? '?find=' + encodeURIComponent(find) : '');
  const lanesL = [
    { id: 'ideas', label: 'Idea', n: n(c.ideas), help: 'every run that was stored: each began as an idea', href: link('') },
    { id: 'testing', label: 'Testing', n: n(c.testing), help: 'run, but no verdict written yet (open)', href: link('open') },
    { id: 'adopted', label: 'Adopted', n: n(c.adopted), help: 'held up and was adopted or is a candidate', href: link('adopt') },
    { id: 'rejected', label: 'Rejected', n: n(c.rejected), help: 'tested and rejected', href: link('rejected') },
  ];
  const fams = (p && Array.isArray(p.families) ? p.families : []).filter((f) => isObj(f) && f.name).map((f) => {
    const runs = Math.max(1, n(f.runs));
    return { name: clean(f.name, 40), runs: n(f.runs), adopted: n(f.adopted), rejected: n(f.rejected), open: n(f.open), pa: n(f.adopted) / runs, pr: n(f.rejected) / runs, po: n(f.open) / runs, href: link(clean(f.name, 40)) };
  });
  const moves = (p && Array.isArray(p.moves) ? p.moves : []).filter((m) => isObj(m) && m.id).slice(0, 20).map((m) => ({ id: clean(m.id, 50), title: clean(m.title || m.id, 110), family: clean(m.family, 40), d: clean(m.d, 10),
    verdict: ['adopted', 'rejected', 'open'].includes(m.verdict) ? m.verdict : 'open', href: link(clean(m.id, 50)) }));
  const total = lanesL[0].n, decided = lanesL[2].n + lanesL[3].n;
  return { ok: !!p && total > 0, sample: !!demo, lanes: lanesL, families: fams, moves, built: p ? clean(p.built, 10) : '', src: p ? clean(p.src, 40) : '',
    line: !p || !total ? 'No pipeline counts are published yet.' : total.toLocaleString('en-US') + ' ideas were tested and stored. ' + decided.toLocaleString('en-US') + ' have a verdict: ' + lanesL[2].n.toLocaleString('en-US') + ' adopted, ' + lanesL[3].n.toLocaleString('en-US') + ' rejected. ' + lanesL[1].n.toLocaleString('en-US') + ' are still open.' };
}

// ------------------------------------------------------------------ the learning board (the builder's distilled lessons + each worker's own notes)
export const CATS = ['NQ strategy', 'Kalshi', 'money', 'process', 'app'];
const CAT_OF = { kalshi: 'Kalshi', sibyl: 'Kalshi', chrysos: 'money', mercury: 'money', oikos: 'money', arbiter: 'money', lit: 'NQ strategy', atlas: 'NQ strategy', blitz: 'NQ strategy', prometheus: 'NQ strategy', hephaestus: 'NQ strategy', mind: 'NQ strategy' };
/** { all, week (top lessons of the last 7 days, strongest first), top (strongest overall), changed (what changed our mind), cats (counts), note } */
export function board(queueBlock, workers, now, demo) {
  const q = isObj(queueBlock) ? queueBlock : {}, all = [], seen = new Set();
  const push = (l) => { const key = l.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); if (!l.text || seen.has(key)) return; seen.add(key); all.push(l); };
  for (const l of Array.isArray(q.lessons) ? q.lessons : []) {
    if (!isObj(l) || !l.text) continue;
    const src = (Array.isArray(l.sources) ? l.sources : []).filter((x) => isObj(x) && x.src).map((x) => ({ src: clean(x.src, 90), d: clean(x.d, 10) })), ms = toMs(String(l.d || ''));
    if (!src.length) continue;                                                // no lesson without its source
    push({ text: clean(l.text, 240), cat: CATS.includes(l.cat) ? l.cat : 'process', who: IDS.includes(l.who) ? l.who : 'dev', name: nameOf(IDS.includes(l.who) ? l.who : 'dev'), d: clean(l.d, 10), ms,
      strength: Math.max(1, Math.round(num(l.strength) || src.length)), sources: src.slice(0, 5), week: ms != null && now - ms <= WEEK_D * D && ms <= now + D, sample: !!demo });
  }
  for (const w of Array.isArray(workers) ? workers : []) for (const l of w.learned || []) {       // a worker's own notes (a money machine's caveats, the forge's count): one source each
    if (!l || !l.text || !l.src || /^(research\/writeups|docs\/)/.test(l.src) && Array.isArray(q.lessons) && q.lessons.length) continue;
    const ms = toMs(l.d);
    push({ text: l.text, cat: CAT_OF[w.id] || 'process', who: w.id, name: w.name, d: l.d || '', ms, strength: 1, sources: [{ src: l.src, d: l.d || '' }], week: ms != null && now - ms <= WEEK_D * D && ms <= now + D, sample: !!demo || w.status === 'sample' });
  }
  const byStrength = (a, b) => b.strength - a.strength || (b.ms == null ? -1 : b.ms) - (a.ms == null ? -1 : a.ms) || (a.text < b.text ? -1 : 1);
  const week = all.filter((l) => l.week).sort(byStrength).slice(0, 8), top = all.slice().sort(byStrength).slice(0, 8);
  const changed = (Array.isArray(q.changed) ? q.changed : []).filter((c) => isObj(c) && c.text && c.src).slice(0, 8).map((c) => ({ text: clean(c.text, 300), was: clean(c.was, 160), d: clean(c.d, 10), cat: CATS.includes(c.cat) ? c.cat : 'process', who: IDS.includes(c.who) ? c.who : 'dev', src: clean(c.src, 90), sample: !!demo }));
  const cats = {}; for (const c of CATS) cats[c] = all.filter((l) => l.cat === c).length;
  const newest = all.reduce((m, l) => (l.ms != null && (m == null || l.ms > m) ? l.ms : m), null);
  return { all, week, top, changed, cats, newest,
    note: !all.length ? 'No lessons are written down yet.' : (week.length ? week.length + ' lesson' + (week.length === 1 ? '' : 's') + ' from the last 7 days, the strongest first.' : 'No new lesson in the last 7 days; the newest is from ' + (dayOf(newest) || 'an undated note') + '.') + ' Strength counts the independent files that agree.' + (demo ? ' Example lessons.' : '') };
}
export function strengthWord(n) { return n >= 4 ? n + ' files agree' : n === 3 ? '3 files agree' : n === 2 ? '2 files agree' : '1 file so far'; }

export function jarvisCard(workers, queueBlock, now, demo) {
  const hd = headline(workers), q = isObj(queueBlock) && isObj(queueBlock.queue) ? queueBlock.queue : {};
  const need = hd.counts.failed + hd.counts.stale;
  return { v: 1, name: 'Ergasterion', status: { level: demo ? 'off' : hd.level === 'bad' ? 'bad' : need || hd.counts.sample ? 'warn' : 'ok', label: demo ? 'Demo data' : need ? need + ' need a look' : 'All fine' },
    kpis: [{ label: 'Working', value: String(hd.counts.working) }, { label: 'Need a look', value: String(need) }, { label: 'Open tasks', value: String(num(q.open) || 0) }],
    lines: [clean(hd.title + '. ' + hd.line, 118)].concat(isObj(queueBlock) && Array.isArray(queueBlock.lessons) && isObj(queueBlock.lessons[0]) ? [clean('Newest lesson: ' + queueBlock.lessons[0].text, 118)] : []), t: Math.round(now / 1000), open: '#', theme: '#14110e', stale_after: 86400 };
}
