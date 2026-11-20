// Jarvis business answers (day-jarvis 2026-11-20, owner: "Jarvis that actually knows the business"). One small ES module, no imports at
// load (the chart feed's nqbars.js is imported only when an open-trade question needs it). It answers the owner's eight daily questions
// from the real feeds, dollars first, with the source and its age on one short line:
//   accounts  "How are my accounts?"            the PC report (data.js getFacts().live: board cards lit / atlas + the extra accounts)
//   intrade   "Is ATLAS in a trade?"            the board cards' position + the chart feed's open trades (nq/nqbars.js, ntfy "-bars")
//   room      "How much room does Zlarior have?" the PC report: drawdown left of the max loss, and the daily limit left
//   payout    "When is my first payout?"        business/payday.json (1,000 simulated runs per market kind: estimates, never a promise)
//   bots      "What did the bots do today / this week?"  the PC report's trades + each card's today / week P&L
//   news      "What's on the news today?"       nq/news_week.json (high impact) + pythia/events.json (every US release)
//   steps     "What should I do today?"         hub/steps.json (the owner's to-do list, Done ticks from hub/steps.html) + business/decisions.json
//   kalshi    "How's Kalshi?"                   the PC report's K8 card (kalshi_live) / paper tests + kalshi.json (its k8 block) when published
// Read only: it never sends orders, arms, sizes or changes anything. Offline: every file it fetched is kept on this phone
// (localStorage 'jarvis.biz.<name>', slimmed) and used with its age when the network is gone. A missing number is said to be missing.
//   match(text)            -> intent id | null
//   ask(text, deps)        -> Promise<reply | null>    reply = { text, speak, intent: 'biz_<id>', src, offline? }
//   answer(id, deps)       -> Promise<reply>
//   CHIPS                  -> [{ id, label, q }] the quick action chips
//   deps = { facts: () => getFacts(), refreshLive?: () => Promise, refreshKalshi?: () => Promise, kalshiView?: () => obj, now?: () => Date, fetch?, storage? }
// Plain ES2020 (Safari 15+), no lookbehind. tests/test_jarvis_biz.mjs runs it in node.

export const FILES = {
  payday: '../business/payday.json', steps: '../hub/steps.json', decisions: '../business/decisions.json', news: '../nq/news_week.json',
  events: '../pythia/events.json', status: '../status_feed.json',
};
export const CHIPS = [
  { id: 'accounts', label: 'My accounts', q: 'How are my accounts?' },
  { id: 'intrade', label: 'In a trade?', q: 'Is ATLAS in a trade?' },
  { id: 'room', label: 'Room left', q: 'How much room does Zlarior have?' },
  { id: 'payout', label: 'First payout', q: 'When is my first payout?' },
  { id: 'bots', label: 'Bots today', q: 'What did the bots do today?' },
  { id: 'news', label: 'News today', q: "What's on the news today?" },
  { id: 'steps', label: 'My to-do', q: 'What should I do today?' },
  { id: 'kalshi', label: 'Kalshi', q: "How's Kalshi?" },
];
const FETCH_MS = 6000, PREFIX = 'jarvis.biz.';
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => { const x = typeof v === 'string' && v.trim() !== '' ? +v : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const txt = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 200);
export function usd(x, sign) {
  const v = num(x); if (v == null) return '$?';
  const a = Math.abs(Math.round(v)), s = v < 0 && a !== 0 ? '-' : sign && a !== 0 ? '+' : '';
  return s + '$' + String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function usd2(x) { const v = num(x); if (v == null) return '$?'; if (Math.abs(v) >= 100) return usd(v, true); const a = Math.abs(v).toFixed(2).replace(/\.00$/, ''); return (v < 0 ? '-' : v > 0 ? '+' : '') + '$' + a; }
export function whenText(tS, nowD) {
  try {
    const d = new Date(tS * 1000), et = etNow(d), today = etNow(nowD).ymd;
    const hm = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(d);
    return `${dayText(et.ymd, today)} ${hm} ET`;
  } catch (_) { return ''; }
}
const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + 's'}`;
export function ageWords(sec) {
  const s = Math.max(0, Math.round(num(sec) || 0));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 48 * 3600) { const h = Math.round(s / 3600); return `${h} h ago`; }
  return `${Math.round(s / 86400)} days ago`;
}
// the ET calendar: today's date, the weekday, the minute of the day
export function etNow(d) {
  const p = {};
  try { for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d)) p[x.type] = x.value; }
  catch (_) { return { ymd: d.toISOString().slice(0, 10), dow: d.getUTCDay(), mod: d.getUTCHours() * 60 + d.getUTCMinutes() }; }
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { ymd: `${p.year}-${p.month}-${p.day}`, dow, mod: (+p.hour % 24) * 60 + +p.minute };
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayText(ymd, todayYmd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); if (!m) return '';
  if (ymd === todayYmd) return 'today';
  const a = Date.UTC(+m[1], +m[2] - 1, +m[3]), t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(todayYmd || ''));
  if (t) { const b = Date.UTC(+t[1], +t[2] - 1, +t[3]), dd = Math.round((a - b) / 864e5); if (dd === 1) return 'tomorrow'; if (dd === -1) return 'yesterday'; }
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(a).getUTCDay()];
  return `${dow} ${MON[+m[2] - 1]} ${+m[3]}${t && m[1] !== t[1] ? ' ' + m[1] : ''}`;
}
const weekStart = (ymd, dow) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd); if (!m) return ymd; const back = (dow + 6) % 7; return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - back * 864e5).toISOString().slice(0, 10); };

// ------------------------------------------------------------------------------------------------ intents
const RX = [
  ['intrade', /\b(in a trade|in trade|any trades? open|open (trade|position)s?|positions?|holding|in the market right now|trade on now)\b/],
  ['room', /\b(zlarior|atlas|lit)\b.*\b(room|drawdown|cushion|buffer|lose)\b|\b(room|drawdown|cushion|buffer)\b.*\b(zlarior|atlas|lit|all (my )?accounts|each account|left)\b/],
  ['payout', /\b(pay ?outs?|pay ?day|get paid|paid out|withdraw(al)?|cash out|first check)\b/],
  ['news', /\b(news|economic calendar|econ(omic)? (data|news|calendar)|cpi|fomc|nfp|payrolls|data (today|release)|big releases?|market movers?)\b/],
  ['steps', /\b(what should i do|what do i (need to )?do|my (to-?do|steps)|to-?do list|my list|anything for me|need(s)? me|waiting on me)\b/],
  ['kalshi', /\b(kalshi|k8)\b/],
  ['bots', /\b((what|how) (did|have) (the )?(bots?|zlarior|atlas)|recap|bots? (do|did|today|this week)|trades? (today|this week)|today'?s trades|this week'?s trades)\b/],
  ['accounts', /\b(accounts?|balances?|how am i doing|money status|how (are|is) (zlarior|atlas|my evals?))\b/],
];
export function match(text) {
  const q = ' ' + String(text || '').toLowerCase().replace(/[’']/g, "'").replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (/\b(open|show|go to|launch)\s+(the\s+)?(kalshi|planner|zenith|nq|app)\b/.test(q) && !/\bin a trade\b/.test(q)) return null;   // app switching stays the shell's
  if (/\b(hide|show|mask|unhide|blur)\b/.test(q)) return null;                          // the brain's hide / show my balance switch
  if (/\bblitz\b/.test(q)) return null;                                    // BLITZ is hidden: the old brain keeps its rule
  if (/\b(why|explain|strategy|rules?|game ?plan|how does|backtest|chart)\b/.test(q) && !/\bin a trade\b/.test(q)) return null;   // the brain keeps the deeper answers
  for (const [id, rx] of RX) if (rx.test(q)) return id;
  return null;
}

// ------------------------------------------------------------------------------------------------ the files: fetched, slimmed, kept for offline
function store(deps) { return deps && deps.storage !== undefined ? deps.storage : (typeof localStorage !== 'undefined' ? localStorage : null); }
function keep(deps, name, j) { const s = store(deps); if (!s) return; try { s.setItem(PREFIX + name, JSON.stringify({ at: Date.now(), j })); } catch (_) { /* full / private */ } }
function kept(deps, name) { const s = store(deps); if (!s) return null; try { const o = JSON.parse(s.getItem(PREFIX + name) || 'null'); return isObj(o) && o.j ? o : null; } catch (_) { return null; } }
const SLIM = {
  payday: (j) => ({ date: j.date, what: txt(j.what, 160), markets: j.markets, rows: j.rows }),
  steps: (j) => ({ updated: j.updated, items: arr(j.items).slice(0, 12).map((i) => ({ id: i.id, n: i.n, title: txt(i.title, 90), what: txt(i.what, 200), where: txt(i.where, 20), optional: !!i.optional, copy: txt(i.copy, 60) })) }),
  decisions: (j) => ({ updated: j.updated, items: arr(j.items).filter((i) => isObj(i) && i.status === 'open').slice(0, 12).map((i) => ({ id: i.id, question: txt(i.question, 160), recommend: txt(i.recommend, 10), usd_month: num(i.usd_month) })) }),
  news: (j) => ({ built: j.built, events: arr(j.events).slice(0, 30) }),
  events: (j) => ({ updated: j.updated, events: arr(j.events).filter((e) => isObj(e) && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')).slice(-120).map((e) => ({ date: e.date, time: txt(e.time, 8), title: txt(e.title, 80), impact: txt(e.impact, 6) })) }),
};
const mem = {};
export async function getFile(name, deps) {
  const now = Date.now(), m = mem[name];
  if (m && now - m.at < 5 * 60e3) return m;                                // one fetch per 5 minutes is plenty for these files
  const f = (deps && deps.fetch) || (typeof fetch === 'function' ? fetch : null);
  let j = null;
  if (f) {
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null, tm = setTimeout(() => ctl && ctl.abort(), FETCH_MS);
      const r = await f(FILES[name] + '?t=' + Math.floor(now / 300e3), { cache: 'no-cache', signal: ctl ? ctl.signal : undefined });
      clearTimeout(tm);
      if (r && r.ok) j = await r.json();
    } catch (_) { j = null; }
  }
  if (isObj(j)) { const s = SLIM[name] ? SLIM[name](j) : j; const o = { at: now, j: s, live: true }; mem[name] = o; keep(deps, name, s); return o; }
  const k = kept(deps, name);
  return k ? { at: k.at, j: k.j, live: false } : null;
}
function srcLine(what, file, now) {
  if (!file) return `Source: ${what}: not loaded and no saved copy on this phone.`;
  const age = (now - file.at) / 1000;
  return file.live ? `Source: ${what}.` : `Source: ${what}, saved copy from ${ageWords(age)} (offline).`;
}
function liveOf(deps) { try { const F = deps.facts ? deps.facts() : null; return F && F.live ? F.live : null; } catch (_) { return null; } }
function liveSrc(L, nowMs) {
  if (!L) return 'Source: no PC report on this phone yet.';
  const t = num(L.t), age = t ? nowMs / 1000 - t : null;
  return `Source: PC report${age != null ? ', ' + ageWords(age) : ''}${L.cached ? ' (saved copy, offline)' : ''}${age != null && age > 3 * 3600 ? '. Old: the PC may be off.' : '.'}`;
}
async function freshLive(deps) {
  let L = liveOf(deps);
  if ((!L || L.cached) && deps.refreshLive) { try { await Promise.race([deps.refreshLive(), new Promise((ok) => setTimeout(ok, 8000))]); } catch (_) { /* offline */ } L = liveOf(deps) || L; }
  return L;
}
// every real account on the PC report, in one shape: Zlarior 50K (lit), ATLAS (atlas), then the extras (Zlarior 25K #2 ...). BLITZ never.
export function accountsOf(L) {
  if (!L) return [];
  const out = [], card = (c, key, name) => {
    if (!isObj(c) || c.error || num(c.balance) == null) return;
    const stage = /funded/i.test(`${c.status || ''} ${c.plan || ''} ${c.stage || ''}`) ? 'funded' : 'eval';
    out.push({ key, name, plan: txt(c.plan, 40), stage, balance: num(c.balance), room: num(c.room), mll: num(c.mll), toTarget: stage === 'eval' ? num(c.to_target) : null,
      today: num(c.today_pnl), week: num(c.week_pnl), dll: num(c.dll), dllUsed: num(c.dll_used), position: isObj(c.position) ? c.position : null,
      window: isObj(c.window) ? c.window : null, waiting: txt(c.waiting, 120), trades: num(c.trades_today), status: txt(c.status, 20) });
  };
  const size = (c, d) => { const m = /(\d+)\s*k\b/i.exec(String((c && c.plan) || '')); return m ? m[1] + 'K' : d; };
  card(L.lit, 'lit', `Zlarior ${size(L.lit, '50K')}`);
  card(L.atlas, 'atlas', `ATLAS ${size(L.atlas, '25K')}`);
  for (const e of arr(L.extra)) card({ ...e, plan: e.plan || e.size }, e.key || e.id, txt(e.name, 40) || e.id);
  const hid = (() => { try { return !globalThis.OLY_HIDDEN || globalThis.OLY_HIDDEN.has('blitz'); } catch (_) { return true; } })();
  if (!hid) card(L.blitz, 'blitz', 'BLITZ 25K');                     // hidden on the owner's phone (dashboard_view.json); shown where it is on
  return out;
}

// ------------------------------------------------------------------------------------------------ the answers
const A = {};
A.accounts = async (deps, nowD) => {
  const L = await freshLive(deps), list = accountsOf(L);
  if (!list.length) return { text: 'I have no account numbers from the PC yet. When the PC is on it reports every 15 minutes.', src: liveSrc(L, +nowD) };
  const tot = list.reduce((s, a) => s + (a.today || 0), 0), funded = list.filter((a) => a.stage === 'funded').length;
  const head = `${plural(list.length, 'account')} (${funded} funded, ${list.length - funded} in eval). Today ${usd(tot, true)} in total.`;
  const rows = list.map((a) => `${a.name}: ${usd(a.balance)}, today ${usd(a.today || 0, true)}, ${usd(a.room)} room left${a.toTarget != null ? `, ${usd(a.toTarget)} to pass` : ', funded'}.`);
  return { text: [head, ...rows].join('\n'), src: liveSrc(L, +nowD) };
};
async function chartOpen(deps) {                                   // the chart feed's open trades (the PC's "-bars" ntfy post), or null
  try {
    const st = await getFile('status', deps); if (!st || !isObj(st.j)) return null;
    const B = await import('../nq/nqbars.js?v=b1');
    const f = (deps && deps.fetch) || fetch;
    for (const u of B.feedUrls(st.j)) {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null, tm = setTimeout(() => ctl && ctl.abort(), FETCH_MS);
      let t = ''; try { const r = await f(u, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }); t = r && r.ok ? await r.text() : ''; } catch (_) { t = ''; }
      clearTimeout(tm);
      const post = B.parse(t);
      if (post) return { t: num(post.t) || num(post.rt), open: arr(post.open) };
    }
  } catch (_) { /* no chart feed: the board's positions alone */ }
  return null;
}
const sideOf = (p) => { const s = String(p.side || '').toLowerCase(); return s.startsWith('s') || num(p.side) === -1 || num(p.s) === -1 ? 'short' : 'long'; };
A.intrade = async (deps, nowD, text) => {
  const L = await freshLive(deps), list = accountsOf(L), q = String(text || '').toLowerCase();
  const want = /\batlas\b/.test(q) ? 'atlas' : /\bzlarior|lit\b/.test(q) ? 'zlarior' : 'all';
  const pick = (a) => want === 'all' || (want === 'atlas' ? /atlas/i.test(a.name) : /zlarior/i.test(a.name));
  const chart = await Promise.race([chartOpen(deps), new Promise((ok) => setTimeout(() => ok(null), 7000))]);
  const ck = { lit: 'z50k', atlas: 'atlas25f', b25k_2: 'z25k2' };
  const rows = [];
  for (const a of list.filter(pick)) {
    const p = a.position || (chart ? chart.open.find((r) => r && r.k === ck[a.key]) : null);
    if (p) {
      const e = num(p.entry != null ? p.entry : p.e), sl = num(p.stop != null ? p.stop : p.sl), tp = num(p.target != null ? p.target : p.tp), q2 = num(p.qty != null ? p.qty : p.q);
      const sd = sideOf(p) === 'short' ? -1 : 1, px = num(L.price), tr = arr(L.trades).find((t) => t && t.open && (t.acct === a.key || (a.key === 'lit' && t.acct === 'lit')));
      const ur = num(p.unrealized_r) != null ? num(p.unrealized_r) : tr ? num(tr.r) : null;
      const openUsd = px != null && e != null && q2 ? (px - e) * sd * q2 * 2 : null;        // MNQ micros: $2 a point
      const locked = sl != null && e != null && (sd > 0 ? sl >= e : sl <= e);
      const f = (x) => x.toLocaleString('en-US', { maximumFractionDigits: 2 });
      rows.push(`${a.name}: YES, ${sideOf(p)}${q2 ? ' ' + plural(q2, 'micro') : ''}${e != null ? ' from ' + f(e) : ''}${openUsd != null ? `, about ${usd(openUsd, true)} open right now` : ''}${ur != null ? ` (${ur >= 0 ? '+' : ''}${ur.toFixed(1)}R)` : ''}.`
        + `${sl != null ? ` Stop ${f(sl)}${locked ? ' (past the entry: this trade can no longer lose)' : ''}` : ''}${tp != null ? `, target ${f(tp)}` : ''}${sl != null || tp != null ? '.' : ''}`);
    } else rows.push(`${a.name}: no, flat.${a.waiting ? ' ' + a.waiting : a.window && a.window.text ? ' ' + txt(a.window.text, 80)[0].toUpperCase() + txt(a.window.text, 80).slice(1) + '.' : ''}`);
  }
  if (!rows.length) return { text: want === 'atlas' ? 'I have no ATLAS card from the PC yet.' : 'I have no account cards from the PC yet.', src: liveSrc(L, +nowD) };
  const n = rows.filter((r) => /: YES/.test(r)).length;
  const head = want === 'all' ? (n ? `${plural(n, 'account')} in a trade right now.` : 'No open trades right now.') : '';
  const src = liveSrc(L, +nowD) + (chart && chart.t ? ` Chart feed ${ageWords(+nowD / 1000 - chart.t)}.` : '');
  return { text: [head, ...rows].filter(Boolean).join('\n'), src };
};
A.room = async (deps, nowD, text) => {
  const L = await freshLive(deps), list = accountsOf(L), q = String(text || '').toLowerCase();
  const want = /\batlas\b/.test(q) ? /atlas/i : /\bzlarior|lit\b/.test(q) ? /zlarior/i : null;
  const sel = want ? list.filter((a) => want.test(a.name)) : list;
  if (!sel.length) return { text: 'I have no room numbers from the PC yet.', src: liveSrc(L, +nowD) };
  const rows = sel.map((a) => {
    const dllLeft = a.dll != null ? Math.max(0, a.dll - (a.dllUsed || 0)) : null, pct = a.room != null && a.mll ? Math.round((a.room / a.mll) * 100) : null;
    const warn = pct != null && pct < 25 ? ' Tight: under a quarter left.' : '';
    return `${a.name}: ${usd(a.room)} of ${usd(a.mll)} drawdown left${pct != null ? ` (${pct}%)` : ''}${dllLeft != null ? `; today it can still lose ${usd(dllLeft)} before the daily limit` : ''}.${warn}`;
  });
  return { text: rows.join('\n'), src: liveSrc(L, +nowD) };
};
const PAY_KEYS = [['A25', 'ATLAS 25K (funded)'], ['Z50', 'Zlarior 50K'], ['N25', 'Zlarior 25K #2'], ['R25', 'Rapid EOD 25K']];
A.payout = async (deps, nowD) => {
  const f = await getFile('payday', deps), et = etNow(nowD);
  const rows = f && isObj(f.j) && isObj(f.j.rows) ? f.j.rows : null, H2 = rows && isObj(rows.H2) ? rows.H2.accounts : null;
  if (!H2) return { text: 'I cannot read the payout plan (business/payday.json) right now.', src: srcLine('business/payday.json', f, +nowD) };
  const list = PAY_KEYS.map(([k, nm]) => [k, nm, H2[k]]).filter((x) => isObj(x[2]) && x[2].first_pay_med).sort((a, b) => String(a[2].first_pay_med).localeCompare(String(b[2].first_pay_med)));
  if (!list.length) return { text: 'The payout plan has no dates yet.', src: srcLine('business/payday.json', f, +nowD) };
  const [, n0, r0] = list[0];
  const head = `First payout most likely ${n0}: about ${usd(r0.first_pay_usd)} around ${dayText(r0.first_pay_med, et.ymd)} (could be as early as ${dayText(r0.first_pay_p10, et.ymd)}; ${Math.round(num(r0.p_by_dec31) || 0)}% chance by Dec 31).`;
  const more = list.slice(1).map(([, nm, r]) => `${nm}: about ${usd(r.first_pay_usd)} around ${dayText(r.first_pay_med, et.ymd)}.`);
  return { text: [head, ...more, 'Estimates from 1,000 simulated runs of a Jul-Oct-like market, not a promise.'].join('\n'), src: srcLine(`business/payday.json (${txt(f.j.date, 10) || 'no date'})`, f, +nowD) };
};
A.bots = async (deps, nowD, text) => {
  const L = await freshLive(deps), list = accountsOf(L), et = etNow(nowD), q = String(text || '').toLowerCase();
  if (!L) return { text: 'I have no report from the PC yet, so I cannot say what the bots did.', src: liveSrc(L, +nowD) };
  const week = /\bweek\b/.test(q), from = week ? weekStart(et.ymd, et.dow) : et.ymd;
  const tr = arr(L.trades).filter((t) => t && String(t.day || '') >= from && t.acct !== 'blitz');
  const done = tr.filter((t) => !t.open), open = tr.filter((t) => t.open), sum = done.filter((t) => t.src !== 'paper').reduce((s, t) => s + (num(t.usd) || 0), 0);
  const per = list.map((a) => (week ? (a.week != null ? `${a.name} ${usd(a.week, true)}` : '') : a.today != null ? `${a.name} ${usd(a.today, true)}` : '')).filter(Boolean);
  const lines = [];
  if (done.length || open.length) lines.push(`${week ? 'This week' : 'Today'}: ${plural(done.length, 'closed trade')}${done.length ? ` for ${usd(sum, true)}${done.some((t) => t.src === 'paper') ? ' real money' : ''}` : ''}${open.length ? `, ${open.length} still open` : ''}.`);
  else lines.push(`${week ? 'This week' : 'Today'}: no trades yet. Quiet days are normal; the plan is 2 to 4 trades a week.`);
  const who = (t) => (t.acct === 'atlas' ? 'ATLAS' : /25k/i.test(String(t.acct)) ? 'Zlarior 25K #2' : 'Zlarior') + (t.member ? ' ' + txt(t.member, 12) : '');
  const why = { STOP: 'stop', TARGET: 'target', BE: 'break-even', EOD: 'flat at the close', TIME: 'time exit' };
  for (const t of open.slice(-2)) lines.push(`${who(t)} ${String(t.side || '').toLowerCase()} ${dayText(t.day, et.ymd)}: still open${num(t.r) != null ? ` (${num(t.r) >= 0 ? '+' : ''}${num(t.r).toFixed(1)}R)` : ''}.`);
  for (const t of done.slice(-4)) lines.push(`${who(t)} ${String(t.side || '').toLowerCase()} ${dayText(t.day, et.ymd)}: ${num(t.usd) != null ? usd(t.usd, true) : (num(t.r) != null ? num(t.r).toFixed(1) + 'R' : '?')}${t.exit ? ' (' + (why[String(t.exit).toUpperCase()] || String(t.exit).toLowerCase()) + ')' : ''}${t.src === 'paper' ? ', paper' : ''}.`);
  if (per.length) lines.push(`P&L ${week ? 'this week' : 'today'}: ${per.join(', ')}.`);
  const vd = isObj(L.verdict) && L.verdict.label ? txt(L.verdict.label, 80) : '';
  if (vd) lines.push(`Bots now: ${vd}.`);
  return { text: lines.join('\n'), src: liveSrc(L, +nowD) };
};
A.news = async (deps, nowD) => {
  const et = etNow(nowD), [nw, ev] = await Promise.all([getFile('news', deps), getFile('events', deps)]);
  const hi = arr(nw && nw.j && nw.j.events), all = arr(ev && ev.j && ev.j.events);
  if (!hi.length && !all.length) return { text: 'I cannot read the news calendar right now.', src: srcLine('nq/news_week.json', nw, +nowD) };
  const seen = new Set(), today = [];
  for (const e of [...hi.map((x) => ({ ...x, impact: 'high' })), ...all]) { if (e.date !== et.ymd) continue; const k = `${e.time}|${String(e.title).toLowerCase().slice(0, 12)}`; if (seen.has(k)) continue; seen.add(k); today.push(e); }
  today.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const big = today.filter((e) => e.impact === 'high');
  const lines = [];
  if (today.length) {
    lines.push(big.length ? `Today ${plural(big.length, 'big release')}: ${big.map((e) => `${e.title} at ${e.time} ET`).join(', ')}. Expect fast moves around ${big.length === 1 ? 'it' : 'them'}.` : `Nothing big today. ${plural(today.length, 'small release')}: ${today.slice(0, 4).map((e) => `${e.title} ${e.time}`).join(', ')}.`);
  } else lines.push(et.dow === 0 || et.dow === 6 ? 'No news today: it is the weekend.' : 'No US data on the calendar today.');
  const next = hi.filter((e) => String(e.date) > et.ymd).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  if (next) lines.push(`Next big one: ${next.title}, ${dayText(next.date, et.ymd)} at ${next.time} ET.`);
  const which = nw ? nw : ev;
  return { text: lines.join('\n'), src: srcLine(`nq/news_week.json + pythia/events.json`, which, +nowD) };
};
A.steps = async (deps, nowD) => {
  const [sf, df] = await Promise.all([getFile('steps', deps), getFile('decisions', deps)]);
  let done = {}; try { const s = store(deps); done = JSON.parse((s && s.getItem('oly-steps-done-v1')) || '{}') || {}; } catch (_) { done = {}; }
  const items = arr(sf && sf.j && sf.j.items).filter((i) => !done[i.id]), must = items.filter((i) => !i.optional);
  const dec = arr(df && df.j && df.j.items);
  if (!sf && !df) return { text: 'I cannot read your to-do list (hub/steps.json) right now.', src: srcLine('hub/steps.json', sf, +nowD) };
  const lines = [];
  if (must.length) {
    lines.push(`${plural(must.length, 'thing')} waiting on you. First: ${must[0].title} (${must[0].where || 'phone'}).`);
    if (must[0].what) lines.push(must[0].what);
    for (const i of must.slice(1, 3)) lines.push(`Then: ${i.title} (${i.where || 'phone'}).`);
  } else lines.push('Nothing on your to-do list. Keep the PC and NinjaTrader on, 02:00 to 15:30 ET.');
  if (dec.length) lines.push(`${plural(dec.length, 'yes/no question')} on the Decide card (Board page).`);
  return { text: lines.join('\n'), src: srcLine(`hub/steps.json${sf && sf.j && sf.j.updated ? ' (' + sf.j.updated + ')' : ''}`, sf, +nowD) };
};
A.kalshi = async (deps, nowD) => {
  const L = await freshLive(deps), lines = [];
  if (deps.refreshKalshi) { try { await Promise.race([deps.refreshKalshi(), new Promise((ok) => setTimeout(ok, 5000))]); } catch (_) { /* offline */ } }
  let kj = null; try { kj = deps.kalshiView ? deps.kalshiView() : null; } catch (_) { kj = null; }
  // the PC report's K8 card (kalshi_live: st paper | live | paused | stopped | idle, with its k8 block); data.js's klive drops 'paper', so the raw post
  let kr = L && isObj(L.raw) && isObj(L.raw.kalshi_live) ? L.raw.kalshi_live : null;
  if (kr) keep(deps, 'k8card', kr); else { const k = kept(deps, 'k8card'); kr = k ? { ...k.j, savedAt: k.at } : null; }
  const kl = L && isObj(L.klive) ? L.klive : null, kp = L && isObj(L.kpaper) ? L.kpaper : null;
  const k8 = kr && isObj(kr.k8) ? kr.k8 : isObj(kj) && isObj(kj.k8) ? kj.k8 : null;
  const mode = kr ? (kr.st === 'paper' || (k8 && k8.m === 'P') ? 'paper' : kr.st) : kl ? kl.st : '';
  if (k8) {
    const td = arr(k8.td), wr = arr(k8.wr), nx = num(k8.nx);
    lines.push(mode === 'paper' ? 'Kalshi K8 is on PAPER: practice bets, no real money.' : mode === 'live' ? 'Kalshi K8 is LIVE with real money.' : `Kalshi K8 is ${mode || 'on'}.`);
    if (td.length >= 3) lines.push(`Today: ${plural(num(td[0]) || 0, 'bet')}, ${num(td[1]) || 0} won, ${usd2(td[2])}.`);
    if (wr.length >= 2) lines.push(`So far: ${plural(num(wr[0]) || 0, 'bet')}, ${Math.round(num(wr[1]) || 0)}% won${k8.l ? ` (last: ${txt(k8.l, 12)})` : ''}.`);
    if (num(k8.b) != null) lines.push(`Bankroll ${usd(k8.b)}, ${usd2(k8.s).replace('+', '')} a bet${nx ? `; next window ${whenText(nx, nowD)}` : ''}.`);
  } else if (kl) {
    const st = { live: 'LIVE', paused: 'paused', stopped: 'stopped', idle: 'on, waiting for its window' }[kl.st] || kl.st;
    lines.push(`K8 is ${st}${kl.net != null ? `: ${usd(kl.net, true)} so far` : ''}${kl.fills != null ? `, ${plural(kl.fills, 'fill')}` : ''}${kl.cap != null ? `, cap ${usd(kl.cap)}` : ''}${kl.stop != null ? `, stops at ${usd(-Math.abs(kl.stop))}` : ''}.${kl.why ? ' ' + kl.why + '.' : ''}`);
  }
  if (!k8 && !kl) return null;                                       // no K8 card: the brain answers from kalshi.json (balance, positions) or says it is not connected
  const ksrc = !L && kr && kr.savedAt ? `Source: K8 card, saved copy from ${ageWords((+nowD - kr.savedAt) / 1000)} (offline).` : liveSrc(L, +nowD).replace('PC report', 'PC report (K8 card)');
  return { text: lines.join('\n'), src: ksrc };
};

export async function answer(id, deps = {}, text = '') {
  const nowD = deps.now ? deps.now() : new Date(), fn = A[id];
  if (!fn) return null;
  let r;
  try { r = await fn(deps, nowD, text); } catch (e) { r = { text: 'I could not read that just now. Try again in a moment.', src: 'Source: error reading the feeds.' }; }
  if (!r) return null;                                               // not this module's question after all: the brain answers
  const text2 = `${r.text}\n${r.src}`;
  return { text: text2, speak: r.text, intent: 'biz_' + id, src: r.src, offline: /offline/.test(r.src || '') };
}
export async function ask(text, deps = {}) { const id = match(text); return id ? answer(id, deps, text) : null; }
