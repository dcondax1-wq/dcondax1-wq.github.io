// ARGUS core (ES module, no DOM, no network): every health light of the system, from what the published site already shows.
//   analyze({ now, home, cronos, cards, offline }) -> { eyes[], fix[], verdict, counts, hasData }
//     now     unix seconds
//     home    ../home.json (or ../data.json): { built, live: { last_run, pc }, board: { data_t, lit, atlas, health: { items } } }
//     cronos  ../cronos/status.json: { tasks: { name: { ok, last_ok_t, last_run_t, error } } }
//     cards   { app: the app's jarvis.json or null }
//   An eye = { id, group, label, level: 'ok' | 'warn' | 'bad' | 'idle', value, detail, fix, w }. 'idle' = grey: not needed right
//   now (market closed, nothing set up) or no data. Only warn and bad count against the verdict.
// Plain words only. Read only: nothing here talks to a bot, a broker or an order.

export const LEVELS = ['ok', 'warn', 'bad', 'idle'];
export const APPS = [
  ['datacity', 'Data City'], ['mind', 'Mind'], ['tree', 'Daphne'], ['oracle', 'Oracle'], ['odeon', 'Odeon'], ['fates', 'Fates'],
  ['hermes', 'Hermes'], ['prometheus', 'Prometheus'], ['tyche', 'Tyche'], ['pantheon', 'Pantheon'], ['arena', 'Arena'], ['ares', 'Ares'], ['plutus', 'Plutus'],
];
// the CRONOS jobs and how stale their data may get, in weekday hours (tools/cronos/registry.py: NIGHTLY_MAX_H, WEEKLY_MAX_H)
export const CRONOS_JOBS = { datacity: 36, fates: 36, odeon: 36, pantheon: 36, tree: 5 * 24 + 36, prometheus: 5 * 24 + 36 };
export const INACTIVITY_DAYS = 7;       // MFFU can close an eval after 7 calendar days with no trade
export const CLOUD_OK_S = 35 * 60, CLOUD_BAD_S = 2 * 3600;       // the cloud monitor runs every 15 min
export const PUBLISH_OK_S = 40 * 60, PUBLISH_BAD_S = 3 * 3600;
export const DEFAULT_APP_LIMIT_S = 7 * 86400;                      // an app card that states no stale_after (CRONOS does not refresh it) may be a week old

const ET = 'America/New_York';
const FMT = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (isObj(x) ? x : {});
const num = (v) => (v == null || v === '' || typeof v === 'boolean' ? null : Number.isFinite(+v) ? +v : null);

export function et(t) {
  const p = {}; for (const x of FMT.formatToParts(new Date(t * 1000))) p[x.type] = x.value;
  const h = +p.hour % 24, m = +p.minute;
  return { wd: p.weekday, h, m, min: h * 60 + m };
}
/** CME NQ: Sunday 18:00 to Friday 17:00 New York time, a break 17:00-18:00 every evening */
export function marketOpen(t) {
  const p = et(t);
  if (p.wd === 'Sat') return false;
  if (p.wd === 'Sun') return p.min >= 1080;
  if (p.wd === 'Fri') return p.min < 1020;
  return p.min < 1020 || p.min >= 1080;
}
/** hours between two times that fall on Mon-Fri in New York (a weekend does not age a nightly job); fifteen-minute steps */
export function bizHours(a, b) {
  if (!(a > 0) || !(b > a)) return 0;
  if (b - a > 400 * 86400) return (b - a) / 3600 * 5 / 7;
  let n = 0;
  for (let t = a; t < b; t += 900) if (et(t).wd !== 'Sat' && et(t).wd !== 'Sun') n += Math.min(900, b - t);
  return n / 3600;
}
export function ageText(s) {
  s = Math.max(0, Math.round(s));
  if (s < 90) return `${s} sec`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1).replace(/\.0$/, '')} hours`;
  return `${Math.round(s / 86400)} days`;
}
export const usd = (v) => (Number.isFinite(v) ? (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US') : '-');
const eye = (id, group, label, level, value, detail = '', fix = '', w = 10) => ({ id, group, label, level, value, detail, fix, w });
const lvOf = (it) => (!it ? 'idle' : it.ok === false ? 'bad' : it.warn ? 'warn' : it.ok ? 'ok' : 'idle');

// ------------------------------------------------------------------------------------------------ the lights
function pcEye(B, now, open) {
  const hbT = num(B.data_t);
  const hb = hbT != null ? now - hbT : null;
  if (!isObj(B) || !Object.keys(B).length) return eye('pc', 'pc', 'PC bot', 'warn', 'no report', 'The dashboard has no check-in from the PC yet.', 'Turn the Surface PC on and open the bot window.', 70);
  if (B.running === false) return eye('pc', 'pc', 'PC bot', 'bad', 'stopped', 'The PC is on but the bot is stopped.', 'On the PC open the Start page and press Start trading.', 95);
  if (hb == null) return eye('pc', 'pc', 'PC bot', 'warn', 'no report', 'No check-in time from the PC.', 'Turn the Surface PC on and open the bot window.', 70);
  if (hb < 15 * 60) return eye('pc', 'pc', 'PC bot', 'ok', 'checking in', `Last check-in ${ageText(hb)} ago.`, '', 70);
  if (!open) return eye('pc', 'pc', 'PC bot', 'idle', 'quiet', `No check-in for ${ageText(hb)}. Fine while the market is closed.`, '', 70);
  return eye('pc', 'pc', 'PC bot', hb > 30 * 60 ? 'bad' : 'warn', `silent ${ageText(hb)}`, `No check-in from the PC for ${ageText(hb)}.`,
    'Check the Surface PC is on, awake and online, with the bot window open.', 85);
}

function botEye(id, label, A, pcLevel, B, now, open, isLit) {
  const w = 95;
  if (!isObj(A) || A.error || !Object.keys(A).length) return eye(id, 'bots', label, 'idle', 'no data', `${label} has not reported yet.`, '', w);
  const status = String(A.status || '');
  if (/not set up/i.test(status)) return eye(id, 'bots', label, 'idle', 'not set up', `${label} has no account set up yet.`, '', w);
  if (/passed/i.test(status)) return eye(id, 'bots', label, 'ok', 'eval passed', 'The eval is passed. No new trades on it.', '', w);
  if (/failed|lost/i.test(status)) return eye(id, 'bots', label, 'bad', 'eval ended', 'The eval ended.', 'Start a new account, then tell Claude.', w);
  const blocks = arr(A.blocks);
  if (blocks.length) return eye(id, 'bots', label, 'bad', 'blocked', String(obj(blocks[0]).text || 'A guard is blocking new entries.'),
    String(obj(blocks[0]).fix || 'Open the dashboard Status page for the fix.'), w);
  if (B.running === false) return eye(id, 'bots', label, 'bad', 'stopped', `${label} is stopped.`, 'On the PC open the Start page and press Start trading.', w);
  if (pcLevel === 'bad') return eye(id, 'bots', label, 'bad', 'not running', `${label} cannot run: the PC is silent.`, 'Check the Surface PC is on, awake and online.', w);
  const armed = isLit ? obj(obj(obj(B.pcHealth).account)).armed : undefined;
  if (pcLevel === 'idle' && !open) return eye(id, 'bots', label, 'idle', 'resting', `${label} is waiting for the market to open.`, '', w);
  if (pcLevel === 'warn') return eye(id, 'bots', label, 'warn', 'unsure', 'The PC is quiet, so I cannot confirm the bot is running.', 'Check the Surface PC is on and online.', w);
  if (armed === false) return eye(id, 'bots', label, 'warn', 'running, not armed', `${label} is running but not armed, so it will not send orders.`,
    'If you want it trading, arm it on the PC Start page. Otherwise leave it.', w);
  return eye(id, 'bots', label, 'ok', armed === true ? 'running, armed' : 'running', `${label} is running${armed === true ? ' and armed' : ''}.`, '', w);
}

function feedEyes(B, now, open) {
  const items = {}; for (const it of arr(obj(B.health).items)) if (it && it.key) items[it.key] = it;
  const out = [];
  const feed = items.age_1m_s || items.age_5m_s;
  if (!open) out.push(eye('feed', 'feed', 'Price feed', 'idle', 'market closed', 'The market is closed, so no new prices are expected.', '', 75));
  else if (!feed) out.push(eye('feed', 'feed', 'Price feed', 'idle', 'no data', 'The dashboard has no price-feed reading.', '', 75));
  else out.push(eye('feed', 'feed', 'Price feed', lvOf(feed), feed.ok === false ? `stale ${feed.value || ''}`.trim() : 'fresh', String(feed.detail || ''),
    feed.ok === false ? 'On the PC open NinjaTrader, right-click the MNQ chart and choose Reload NinjaScript.' : '', 75));
  const nt = items.nt;
  if (!nt) out.push(eye('nt', 'feed', 'NinjaTrader', 'idle', 'not used', 'No NinjaTrader reading (the bot may be on paper).', '', 80));
  else if (!open && nt.ok === false) out.push(eye('nt', 'feed', 'NinjaTrader', 'idle', 'not connected', 'NinjaTrader is not connected, which is fine while the market is closed.', '', 80));
  else out.push(eye('nt', 'feed', 'NinjaTrader', lvOf(nt), nt.ok === false ? 'disconnected' : 'connected', String(nt.detail || ''),
    nt.ok === false ? 'On the PC open NinjaTrader, then Control Center, Connections, and connect your login.' : '', 80));
  return out;
}

function pipeEyes(home, cronos, now, cards) {
  const out = [], live = obj(home.live);
  const lr = num(live.last_run);
  if (lr == null) out.push(eye('cloud', 'pipes', 'Cloud monitor', 'idle', 'no data', 'No cloud monitor run time on the dashboard.', '', 60));
  else {
    const a = now - lr, lv = a <= CLOUD_OK_S ? 'ok' : a <= CLOUD_BAD_S ? 'warn' : 'bad';
    out.push(eye('cloud', 'pipes', 'Cloud monitor', lv, lv === 'ok' ? 'ran ' + ageText(a) + ' ago' : 'late ' + ageText(a),
      `The cloud monitor last ran ${ageText(a)} ago. It should run every 15 minutes.`,
      lv === 'ok' ? '' : 'Ask Claude to check the cloud monitor on GitHub Actions.', 60));
  }
  const bt = home.built ? Date.parse(home.built) / 1000 : null;
  if (!Number.isFinite(bt)) out.push(eye('publish', 'pipes', 'Dashboard', 'idle', 'no data', 'No publish time on the dashboard.', '', 50));
  else {
    const a = now - bt, lv = a <= PUBLISH_OK_S ? 'ok' : a <= PUBLISH_BAD_S ? 'warn' : 'bad';
    out.push(eye('publish', 'pipes', 'Dashboard', lv, lv === 'ok' ? 'published ' + ageText(a) + ' ago' : 'old ' + ageText(a),
      `The dashboard was last published ${ageText(a)} ago.`, lv === 'ok' ? '' : 'Ask Claude to check why the dashboard stopped publishing.', 50));
  }
  const tasks = obj(obj(cronos).tasks);
  if (!isObj(cronos) || !Object.keys(tasks).length) {
    // cronos/status.json is not published on the site: the cards CRONOS stamps (card.cronos.state) say the same thing
    const st = Object.entries(obj(cards)).filter(([, c]) => isObj(c) && isObj(c.cronos) && c.cronos.state);
    const late = st.filter(([, c]) => c.cronos.state !== 'fresh').map(([id]) => id);
    if (!st.length) out.push(eye('cronos', 'pipes', 'CRONOS nightly', 'idle', 'not published yet', 'Not published yet: the nightly CRONOS status file is not on the site, and no app card carries its stamp.', '', 40));
    else if (late.length) out.push(eye('cronos', 'pipes', 'CRONOS nightly', 'warn', `${late[0]} late`, `Not refreshed on time: ${late.join(', ')}.`, 'Ask Claude to check the CRONOS nightly workflow.', 40));
    else out.push(eye('cronos', 'pipes', 'CRONOS nightly', 'ok', 'refreshed', `All ${st.length} nightly cards say fresh (newest check ${ageText(now - Math.max(...st.map(([, c]) => num(c.cronos.checked_t) || 0)))} ago).`, '', 40));
  }
  else {
    let worst = null;
    for (const [name, max] of Object.entries(CRONOS_JOBS)) {
      const e = obj(tasks[name]);
      const ok = num(e.last_ok_t);
      let lv = 'ok', why = '';
      if (!ok) { lv = 'warn'; why = `${name} has never finished.`; }
      else {
        const h = bizHours(ok, now);
        if (h > 2 * max) { lv = 'bad'; why = `${name} is ${ageText(h * 3600)} behind.`; } else if (h > max) { lv = 'warn'; why = `${name} is ${ageText(h * 3600)} behind.`; }
        else if (e.ok === false && e.error && num(e.last_run_t) > ok) { lv = 'warn'; why = `${name} failed its last run.`; }
        else why = `${name} refreshed ${ageText(now - ok)} ago.`;
        e._h = h;
      }
      const rank = { ok: 0, warn: 1, bad: 2 }[lv];
      if (!worst || rank > worst.rank || (rank === worst.rank && (e._h || 0) > worst.h)) worst = { rank, lv, why, name, h: e._h || 0, ok };
    }
    out.push(eye('cronos', 'pipes', 'CRONOS nightly', worst.lv, worst.lv === 'ok' ? 'refreshed' : `${worst.name} late`,
      worst.lv === 'ok' ? 'Every nightly job is within its time.' : worst.why, worst.lv === 'ok' ? '' : 'Ask Claude to check the CRONOS nightly workflow.', 40));
  }
  return out;
}

function appEyes(cards, now) {
  return APPS.map(([id, name]) => {
    const c = cards ? cards[id] : null;
    if (!isObj(c)) return eye('app_' + id, 'apps', name, 'idle', 'no card', `${name} has no status card to read.`, '', 10);
    const cr = obj(c.cronos);
    let lv = 'ok', value = 'fresh', detail = '';
    if (cr.state) {
      if (cr.state === 'fresh') { lv = 'ok'; detail = `${name}'s data is current.`; }
      else if (cr.state === 'nodata') { lv = 'warn'; value = 'no data'; detail = `${name} has no data yet.`; }
      else { lv = 'warn'; value = cr.state === 'failed' ? 'refresh failed' : 'stale'; detail = `${name}'s data is out of date.`; }
    } else {
      const t = num(c.t), lim = num(c.stale_after) || DEFAULT_APP_LIMIT_S;
      if (t == null) { lv = 'warn'; value = 'no time'; detail = `${name}'s card has no time.`; } else {
        const a = now - t;
        if (a > 4 * lim && a > 86400) { lv = 'bad'; value = 'very old'; } else if (a > lim) { lv = 'warn'; value = 'old'; }
        detail = lv === 'ok' ? `${name}'s card is ${ageText(a)} old.` : `${name}'s data is ${ageText(a)} old.`;
      }
    }
    return eye('app_' + id, 'apps', name, lv, value, detail, lv === 'ok' ? '' : `Ask Claude to refresh ${name}.`, 10);
  });
}

/** days since the last trade: the board's own count, else the last real trade of that account, else the eval's start (calendar days, New York) */
function quietDays(a, key, B, now) {
  const q = num(a.quiet_days);
  if (q != null) return q;
  const days = arr(obj(B.real).trades).filter((t) => t && t.acct === key && typeof t.day === 'string').map((t) => t.day).sort();
  const ref = days.length ? days[days.length - 1] : (typeof a.eval_start === 'string' ? a.eval_start : null);
  if (!ref || !/^\d{4}-\d\d-\d\d/.test(ref)) return null;
  const nd = new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date(now * 1000));
  return Math.max(0, Math.round((Date.parse(nd) - Date.parse(ref.slice(0, 10))) / 86400000));
}

function ruleEyes(B, now) {
  const out = [];
  for (const [key, label, A] of [['lit', 'Zlarior 50K', B.lit], ['atlas', 'ATLAS 25K', B.atlas]]) {
    const a = obj(A), over = /passed|failed|lost|not set up/i.test(String(a.status || ''));
    const q = quietDays(a, key, B, now);
    if (!Object.keys(a).length || a.error || over || q == null) {
      out.push(eye('quiet_' + key, 'rules', `${label} inactivity`, 'idle', over ? 'n/a' : 'no data', over ? 'The clock does not run on an account that is over or not set up.' : 'No last-trade date yet.', '', 90));
    } else {
      const left = Math.max(0, INACTIVITY_DAYS - q), lv = q >= 6 ? 'bad' : q >= 4 ? 'warn' : 'ok';
      out.push(eye('quiet_' + key, 'rules', `${label} inactivity`, lv, `day ${q} of ${INACTIVITY_DAYS}`,
        `No trade on ${label} for ${q} day${q === 1 ? '' : 's'}. MFFU can close an eval after ${INACTIVITY_DAYS}: ${left} day${left === 1 ? '' : 's'} left.`,
        lv === 'ok' ? '' : `Place 1 MNQ by hand on ${label} today so the clock restarts.`, 90));
    }
    const room = num(a.room), mll = num(a.mll);
    if (!Object.keys(a).length || a.error || over || room == null || !mll) {
      out.push(eye('room_' + key, 'rules', `${label} drawdown`, 'idle', over ? 'n/a' : 'no data', over ? 'The account is over or not set up.' : 'No balance yet.', '', 100));
    } else {
      const f = Math.max(0, Math.min(1, room / mll)), lv = f < 0.25 ? 'bad' : f < 0.5 ? 'warn' : 'ok';
      out.push(eye('room_' + key, 'rules', `${label} drawdown`, lv, `${usd(room)} left`, `${usd(room)} left before the max-loss floor${num(a.floor) != null ? ' at ' + usd(+a.floor) : ''} (of ${usd(mll)}).`,
        lv === 'ok' ? '' : lv === 'bad' ? `Stop trading ${label} for now and protect what is left. Tell Claude.` : `Keep ${label} risk small until it grows back.`, 100));
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the fix buttons
// A light's one-line step is e.fix. Where there is something to run on the PC (the double-click files in the bot folder) or
// something to ask Claude, e.cmd = { kind: 'pc' | 'chat', text } and the page offers a Copy button. Nothing is ever run from here.
export const PC_FILES = { start: 'START_BOT.bat', health: 'HEALTH_CHECK.bat', update: 'UPDATE.bat', stop: 'STOP_BOT.bat', clean: 'tools/bat/CLEAN_PC.bat' };
const pcCmd = (text) => ({ kind: 'pc', text });
const chatCmd = (text) => ({ kind: 'chat', text });
export function cmdFor(e) {
  const id = e.id;
  if (id === 'pc') return pcCmd(PC_FILES.start);
  if (id === 'bot_lit' || id === 'bot_atlas') {
    if (e.value === 'stopped' || e.value === 'not running') return pcCmd(PC_FILES.start);
    if (e.value === 'blocked' || e.value === 'unsure') return pcCmd(PC_FILES.health);
    if (e.value === 'eval ended') return chatCmd(`${e.label}: the eval ended. Help me set up the next account.`);
    return null;                                    // running, not armed: arming is the owner's own decision, never a command here
  }
  if (id === 'feed' || id === 'nt') return pcCmd(PC_FILES.health);
  if (id === 'cloud' || id === 'publish' || id === 'cronos') return chatCmd(`Argus says ${e.label} is ${e.value}. Check why on GitHub Actions and fix it.`);
  if (id.startsWith('app_')) return chatCmd(`Argus says ${e.label} is ${e.value}. Refresh it.`);
  if (id.startsWith('room_')) return chatCmd(`${e.label}: ${e.value}. What should I do?`);
  return null;                                      // the inactivity clock: a manual 1 MNQ trade, nothing to copy
}

// ------------------------------------------------------------------------------------------------ since yesterday (14 days)
export const HIST_DAYS = 14;
const dayOf = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date(t * 1000));
const dayShift = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const WORSE = { ok: 0, warn: 1, bad: 2 };
/** hist = { days: { 'YYYY-MM-DD': 'ok' | 'warn' | 'bad' }, open: { lightId: { label, since } }, reds: [{ id, label, from, to }] }; returns a new hist.
 *  Only a live reading counts (verdict ok / warn / bad); "no data" and offline copies never write. */
export function histUpdate(hist, R, now) {
  const h = { days: { ...obj(obj(hist).days) }, open: { ...obj(obj(hist).open) }, reds: arr(obj(hist).reds).slice() };
  const lv = R && R.verdict && R.verdict.level;
  if (!R || !R.hasData || !(lv in WORSE)) return h;
  const d = dayOf(now);
  if (!(d in h.days) || WORSE[lv] > WORSE[h.days[d]]) h.days[d] = lv;
  const red = new Set(R.eyes.filter((e) => e.level === 'bad').map((e) => e.id));
  for (const e of R.eyes) if (red.has(e.id) && !h.open[e.id]) h.open[e.id] = { label: e.label, since: Math.floor(now) };
  for (const id of Object.keys(h.open)) if (!red.has(id)) { h.reds.push({ id, label: h.open[id].label, from: h.open[id].since, to: Math.floor(now) }); delete h.open[id]; }
  const keepFrom = dayShift(d, -(HIST_DAYS - 1));
  for (const k of Object.keys(h.days)) if (k < keepFrom) delete h.days[k];
  h.reds = h.reds.filter((r) => dayOf(r.to) >= keepFrom).slice(-40);
  return h;
}
/** the strip (oldest to newest, 14 squares, 'idle' = a day I did not see), the streak and the red incidents, in plain words */
export function histSummary(hist, now) {
  const h = obj(hist), days = obj(h.days), today = dayOf(now), strip = [];
  for (let i = HIST_DAYS - 1; i >= 0; i--) { const d = dayShift(today, -i); strip.push({ day: d, level: days[d] || 'idle' }); }
  let streak = 0;
  for (let i = strip.length - 1; i >= 0; i--) { const s = strip[i]; if (s.level === 'idle') { if (s.day === today) continue; continue; } if (s.level === 'ok') streak++; else break; }
  const seen = strip.filter((s) => s.level !== 'idle').length;
  const line = !seen ? 'No history yet. I start counting the first time I see the dashboard.'
    : streak === 0 ? (days[today] && days[today] !== 'ok' ? 'Not clear today.' : 'No clear day in a row yet.')
      : `${streak} clear day${streak === 1 ? '' : 's'} in a row (days I saw).`;
  const reds = [];
  for (const r of arr(h.reds)) reds.push({ id: r.id, label: r.label, from: r.from, to: r.to, secs: Math.max(0, r.to - r.from), open: false });
  for (const [id, o] of Object.entries(obj(h.open))) reds.push({ id, label: o.label, from: o.since, to: null, secs: Math.max(0, Math.floor(now) - o.since), open: true });
  reds.sort((a, b) => b.from - a.from);
  return { strip, streak, seen, line, reds };
}

// ------------------------------------------------------------------------------------------------ everything
export function analyze(inp) {
  const now = num(inp && inp.now) || Date.now() / 1000;
  const home = obj(inp && inp.home);
  const hasData = Object.keys(home).length > 0;
  const open = marketOpen(now);
  const pcLive = obj(obj(home.live).pc), B0 = { ...obj(home.board) };
  if (B0.running === undefined || B0.running === null) B0.running = pcLive.running ?? obj(pcLive.health).running;
  const B = { ...B0, pcHealth: obj(pcLive.health) };
  let eyes = [];
  if (!hasData) {
    eyes = [eye('pc', 'pc', 'PC bot', 'idle', 'no data', 'No dashboard data yet.', '', 70)];
    eyes.push(...appEyes(inp && inp.cards, now));
  } else {
    const pc = pcEye(B0, now, open);
    eyes.push(botEye('bot_lit', 'Zlarior 50K', B0.lit, pc.level, B, now, open, true), botEye('bot_atlas', 'ATLAS 25K', B0.atlas, pc.level, B, now, open, false), pc,
      ...feedEyes(B0, now, open), ...pipeEyes(home, inp && inp.cronos, now, inp && inp.cards), ...ruleEyes(B0, now), ...appEyes(inp && inp.cards, now));
  }
  for (const e of eyes) { e.cmd = e.level === 'warn' || e.level === 'bad' ? cmdFor(e) : null; e.step = e.fix || e.detail; }
  const rank = { bad: 2, warn: 1, ok: 0, idle: 0 };
  const fix = eyes.filter((e) => e.level === 'warn' || e.level === 'bad').sort((a, b) => rank[b.level] - rank[a.level] || b.w - a.w || a.label.localeCompare(b.label));
  const counts = { ok: 0, warn: 0, bad: 0, idle: 0 };
  for (const e of eyes) counts[e.level]++;
  const level = !hasData ? 'idle' : counts.bad ? 'bad' : counts.warn ? 'warn' : 'ok';
  const word = !hasData ? 'No data yet' : level === 'ok' ? 'All clear' : 'Look at this';
  const line = !hasData ? 'I cannot see the dashboard yet. Open this on Wi-Fi once and I will remember it.'
    : level === 'ok' ? `Every light that matters is green${counts.idle ? ` (${counts.idle} resting)` : ''}.`
      : `${counts.bad ? counts.bad + ' red' : ''}${counts.bad && counts.warn ? ' and ' : ''}${counts.warn ? counts.warn + ' amber' : ''}. First: ${fix[0].label}, ${fix[0].value}.`;
  return { eyes, fix, counts, verdict: { level, word, line }, hasData, open, now };
}

/** the Jarvis card for what the page sees now (the page posts it to Jarvis; the static jarvis.json is the default) */
export function cardOf(R, now) {
  const v = R.verdict, c = R.counts, top = R.fix[0];
  // red or amber: the card leads with the problem (status bad / warn, the first light in the label) so Jarvis shows it first;
  // stale_after 1800 (the Jarvis default) so a red card that nobody refreshes greys out instead of standing there for days
  const label = v.level === 'bad' || v.level === 'warn' ? `${c.bad || c.warn} ${c.bad ? 'red' : 'amber'}: ${top.label}`.slice(0, 48) : v.word;
  return { v: 1, name: 'Argus', status: { level: v.level === 'idle' ? 'off' : v.level, label },
    kpis: [{ label: 'Red', value: String(c.bad) }, { label: 'Amber', value: String(c.warn) }, { label: 'Green', value: String(c.ok) }],
    lines: R.fix.slice(0, 3).map((e) => `${e.label}: ${e.step || e.detail}`.slice(0, 118)).concat(R.fix.length ? [] : ['Every light that matters is green.']),
    t: Math.floor(now), open: '#fix', theme: '#13100d', stale_after: 1800 };
}

// ---------------------------------------------------------------------------------------------- JOB 4+5 follow-up (2026-11-04): money view
// demoData (a recorded healthy day relative to "now", for the empty state's "See it with demo data"), readiness (can the bot trade today:
// the gates in plain words with a countdown to the 02:00 ET entry window), moneyLines (the two evals' drawdown left "$X of $max loss", the
// inactivity clock, the pace), blindCost (what the red lights of the last 14 days cost in entry-window hours and trades at risk).
// Read only: nothing here talks to a bot, a broker or an order.

/** a recorded healthy day with one amber (ATLAS has been quiet for 4 days); every time is relative to `now` so the lights read as live */
export function demoData(now) {
  const t = Math.floor(now);
  const home = {
    built: new Date((t - 600) * 1000).toISOString(),
    live: { last_run: t - 300, pc: { running: true, health: { running: true, account: { armed: true } } } },
    board: {
      data_t: t - 60, running: true,
      lit: { status: 'open', blocks: [], quiet_days: 1, room: 1805, mll: 2000, floor: 48100, balance: 49905, session: 5, sessions: 10, to_target: 3095 },
      atlas: { status: 'open', blocks: [], quiet_days: 4, room: 640, mll: 1000, floor: 24000, balance: 24640, session: 5, sessions: 10, to_target: 860 },
      health: { items: [
        { key: 'age_1m_s', label: 'Feed 1m', value: '50 s', ok: true, warn: false, detail: 'ninjatrader bars, 50 s old' },
        { key: 'nt', label: 'NinjaTrader', value: 'connected', ok: true, warn: false, detail: 'Sim101 connected' }] },
    },
  };
  const tasks = {};
  for (const k of Object.keys(CRONOS_JOBS)) tasks[k] = { ok: true, last_ok_t: t - 6 * 3600, last_run_t: t - 6 * 3600 };
  const cards = {};
  for (const [id, name] of APPS) cards[id] = { v: 1, name, status: { level: 'ok', label: 'ok' }, t: t - 7200, stale_after: 7 * 86400 };
  return { home, cronos: { tasks }, cards, hist: { days: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [dayOf(t - i * 86400), i === 3 ? 'warn' : 'ok'])), open: {}, reds: [{ id: 'pc', label: 'PC bot', from: t - 9 * 86400 + 3600, to: t - 9 * 86400 + 3 * 3600 }] } };
}

const GATES = [['pc', 'The PC bot is running'], ['feed', 'Fresh prices (NinjaTrader bars)'], ['nt', 'NinjaTrader is connected'], ['cloud', 'The cloud monitor is running'], ['bot_lit', 'Zlarior can take a trade'], ['bot_atlas', 'ATLAS can take a trade']];
/** can the bot trade today: each gate green / not, the blockers in order, the countdown to the entry window (02:00-15:30 ET) */
export function readiness(R, now) {
  const by = (id) => R.eyes.find((e) => e.id === id) || R.eyes.find((e) => e.id.startsWith(id));
  const gates = GATES.map(([id, label]) => {
    const e = by(id) || (id === 'feed' ? R.eyes.find((x) => x.group === 'feed') : null);
    return { id, label, level: e ? e.level : 'idle', value: e ? e.value : 'no reading', step: e ? (e.step || e.fix || '') : '', ok: !!e && (e.level === 'ok' || e.level === 'idle') && e.level !== 'bad' && e.level !== 'warn' };
  });
  const blockers = gates.filter((g) => g.level === 'bad' || g.level === 'warn');
  const p = et(now), hd = p.h + p.m / 60, wk = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(p.wd), mins = wk ? (hd < 2 ? (2 - hd) * 60 : hd < 15.5 ? 0 : (p.wd === 'Fri' ? null : (24 - hd + 2) * 60)) : null;
  const ready = R.hasData && !blockers.some((g) => g.level === 'bad');
  const when = mins == null ? 'The market is closed: the bot waits for the next open.' : mins === 0 ? 'The entry window is open now (until 15:30 ET).' : `The entry window opens at 02:00 ET, in ${ageText(mins * 60)}.`;
  return { ready, gates, blockers, mins, when, plain: !R.hasData ? 'No data yet: I cannot say whether the bot can trade.' : ready ? (blockers.length ? `The bot can trade, but ${blockers.length} light${blockers.length === 1 ? ' needs' : 's need'} a look.` : 'Every gate is green: the bot can trade.') : `The bot cannot trade right now: ${blockers.filter((g) => g.level === 'bad')[0].label.toLowerCase()} is red.` };
}

/** the two evals in money words (from the same lights as the rest of the page): "Drawdown left $X of $max loss", the inactivity clock, the pace */
export function moneyLines(R) {
  const out = [];
  for (const [key, label, mll0] of [['lit', 'Zlarior 50K', 2000], ['atlas', 'ATLAS 25K', 1000]]) {
    const room = R.eyes.find((e) => e.id === 'room_' + key), q = R.eyes.find((e) => e.id === 'quiet_' + key);
    const roomN = room && /\$/.test(room.value) ? +room.value.replace(/[^0-9.-]/g, '') : null;
    const m = room && room.detail ? /\(of \$([0-9,]+)\)/.exec(room.detail) : null, mll = m ? +m[1].replace(/,/g, '') : mll0;
    out.push({ key, label, has: roomN != null, room: roomN, mll, frac: roomN != null ? Math.max(0, Math.min(1, roomN / mll)) : null, level: room ? room.level : 'idle',
      ddText: roomN != null ? (roomN > mll ? `Drawdown left ${usd(roomN)} (floor locked, max loss ${usd(mll)})` : `Drawdown left ${usd(roomN)} of ${usd(mll)} max loss`) : 'Drawdown: no balance yet',
      quiet: q ? q.value : 'no data', quietLevel: q ? q.level : 'idle', quietText: q ? q.detail : '' });
  }
  return out;
}

/** what red lights cost: the red time of the last 14 days, how much of it fell in the 13.5 h entry window (an estimate: red time x 13.5/24),
 *  and the trades that may have been missed at the bot's 2-4 a week (0.6 a day) */
export function blindCost(H, now) {
  const S = histSummary(H, now), secs = S.reds.reduce((a, r) => a + r.secs, 0), hrs = secs / 3600, inWin = hrs * (13.5 / 24), missed = (inWin / 13.5) * 0.6;
  return { incidents: S.reds.length, hours: hrs, windowHours: inWin, missed, seen: S.seen,
    plain: !S.seen ? 'No history yet: I start counting the first time I see the dashboard.' : S.reds.length ? `${S.reds.length} red incident${S.reds.length === 1 ? '' : 's'} in 14 days, ${hrs.toFixed(1)} hours in all: roughly ${inWin.toFixed(1)} hours of the entry window, ${missed < 0.5 ? 'less than one trade' : 'about ' + missed.toFixed(1) + ' trades'} at risk of being missed (an estimate at 2-4 trades a week).` : 'No red hours in the last 14 days: the bot was never blind.' };
}
