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
// team JARVIS (2026-11-20, "the 40 questions the owner actually asks"; tests/test_jarvis_biz.mjs has 60+ of his phrasings):
//   pc        "Is the PC OK?"                   the PC post's own state (pc, reporter: server / NinjaTrader / problems), the self-check line (sh)
//   decide    "What do you recommend?"          business/decisions.json: open yes/no questions with the advice and $ a month; the parked ones
//   payoutnow "Can I ask for a payout?"         the ZEUS card's payout coach (pc_feed.js payoutLines + business/payoutcoach.js) + the 30% tax pot
//   taxes     "How much for taxes?"             30% of a payout (business/taxes.js default) + the next IRS estimated-tax date; education only
//   review    "How did yesterday go?"           the PC's daily review (zl)
//   bots      today / this week / LAST week     every live trade per account (the PC's "at" list) + the board's paper ones (labelled, not in the $)
//   window, month ($ a month: dash.json plan, ESTIMATE + BACKTEST labels), pass (to pass + the estimated pass date), edge (the edge lights)
// Follow-ups ("and yesterday?", "why?", "open it") and anything about BLITZ, why / explain / strategy stay with the brain (its dialogue).
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
  events: '../pythia/events.json', status: '../status_feed.json', dash: '../business/dash.json', playbook: '../agency/expert/playbook.json',
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
  // the owner's money questions (lead QA 2026-11-21, tests/test_jarvis_money_answers.py): asked first, each from the PC's report with its age
  ['acctrules', /\b(how many (contracts|minis|micros)|max(imum)? (contracts|size|minis|micros)|contracts (can|may) i|(trade|trading) (the )?news|news (on|allowed)|consistency( rule)?|best day rule)\b/],
  ['inactive', /\b((7|seven)[- ]day( rule)?|inactiv\w*|trade (it |atlas |zlarior |them |the \w+ )?by|need to trade|keep (my )?accounts?|last (day|chance) to trade)\b/],
  ['lasttrade', /\b(last trade|last traded|(when|what) (was|did) (the |my )?(\w+ )?last trade)\b/],
  ['next', /\b(which account|what('s| is) next for|focus on|closest to (pass|a payout|payout)|trades next)\b/],
  ['monthpnl', /\b(this month|month so far|(how much|what) (did|have) (i|we) (make|made|earn|earned) (this|in) (the )?month)\b/],
  ['mode', /\b(armed|live or paper|paper or live|real money|(is|are) (zlarior|atlas|it|the bots?) (trading )?(live|on paper))\b/],
  // the website business (team web-expert 2026-11-20): agency/expert/playbook.json, the same file the Expert page reads
  ['web', /\b(3d (site|website|web)|immersive (site|website|web)|websites?|web ?design|web studio|agency|cold call(s|ing)?|my prospects?|local seo|seo|google business profile|gbp|care plan)\b|\bwhat (do|should) i say to an? \w+|\b(price|pricing|charge|quote) (a |for a |my )?(site|website|3d)\b|\bbest (niche|trade)s?\b|\bobjections?\b/],
  ['pc', /\b(when did the pc (last )?(report|check)|pc last report(ed)?|last report(ed)?|is zeus (running|on)|is (the|my) (pc|computer|bot|bots|ninjatrader|server|system) (ok|on|running|alive|up|working|fine|healthy)|(pc|computer|system) (ok|status|health)|(ninjatrader|nt) (ok|on|connected|running)|disk space|is the pc on)\b/],
  ['decide', /\b(decide|decision|decisions|yes ?\/? ?no questions?|what do you recommend|your recommendations?|what would you do)\b/],
  ['taxes', /\b(tax|taxes|irs|set aside|estimated payment)\b/],
  ['payoutnow', /\b(can i (ask|request|take|get) (for )?a payout|(how much|how far) (more )?(to|until|till|before) (a |my |the |the first )?payout|payout (now|today)|ready for a payout|when can (i|atlas) (ask|request|get paid|withdraw)|need for a payout)\b/],
  ['review', /^ *(how did yesterday go|yesterday'?s review|daily review|what happened yesterday|last night'?s review|review yesterday) *$/],
  ['window', /\b(when (do|does|will|can) (the )?(bots?|zlarior|atlas|lit) (trade|enter|start)|trading hours|entry window|is the window open|when is the next (trade|entry) window)\b/],
  ['month', /\b(how much (will|can|could|do) (i|we|the bots?) make|per month|a month from|monthly income|make a month)\b/],
  ['pass', /\b(how far (am i|are we|is \w+) (from|to) pass(ing)?|(profit )?target on|has (atlas|zlarior|the \w+) passed|how (far|much) (to|until|till|from) pass(ing)?|when (will|do|does|can) (i|we|it|zlarior|the 50k|the 25k)( \w+)? pass|(left|need) to pass|pass the eval)\b/],
  ['edge', /\b(edge (health|light|ok|check)|is (the )?edge|is (lit|zlarior|atlas|the strategy|the bot) still working|still (has|have) an edge)\b/],
  ['intrade', /\b(in a trade|in trade|any trades? open|open (trade|position)s?|positions?|holding|in the market right now|trade on now)\b/],
  ['room', /\b(how much room|room do i|lose today|can i lose|daily loss( limit)?|max(imum)? loss|floor|how close am i to)\b|\b(zlarior|atlas|lit)\b.*\b(room|drawdown|cushion|buffer|lose)\b|\b(room|drawdown|cushion|buffer)\b.*\b(zlarior|atlas|lit|all (my )?accounts|each account|left)\b/],
  ['payout', /\b(pay ?outs?|pay ?day|get paid|paid out|withdraw(al)?|cash out|first check)\b/],
  ['news', /\b(news|economic calendar|econ(omic)? (data|news|calendar)|cpi|fomc|nfp|payrolls|data (today|release)|big releases?|market movers?)\b/],
  ['steps', /\b(what should i do|what do i (need to )?do|my (to-?do|steps)|to-?do list|my list|anything for me|need(s)? me|waiting on me)\b/],
  ['kalshi', /\b(kalshi|k8)\b/],
  ['bots', /\b(p&l (today|this week)|pnl (today|this week)|(my )?p ?and ?l (today|this week)|(what|how) (did|have) (the )?(bots?|zlarior|atlas)|recap|bots? (do|did|today|this week|last week)|trades? (today|this week|last week)|today'?s trades|this week'?s trades|last week|how much did (i|we) make|am i (up|down)( today)?|what did (i|we) make)\b/],
  ['accounts', /\b(accounts?|balances?|how am i doing|money status|how (are|is) (zlarior|atlas|my evals?))\b/],
];
export function match(text) {
  const q = ' ' + String(text || '').toLowerCase().replace(/[’']/g, "'").replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (/\b(open|show|go to|launch)\s+(the\s+)?(kalshi|planner|zenith|nq|app)\b/.test(q) && !/\bin a trade\b/.test(q)) return null;   // app switching stays the shell's
  if (/\b(hide|show|mask|unhide|blur)\b/.test(q)) return null;                          // the brain's hide / show my balance switch
  if (/\bblitz\b/.test(q)) return null;                                    // BLITZ is hidden: the old brain keeps its rule
  if (/^ (and|what about|how about|why|compare|explain|next|back)\b|^ open (it|that|this|the (first|second|third|last|next)) /.test(q)) return null;    // a follow-up: the brain's dialogue has the context
  if (/\b(why|explain|strategy|rules?|game ?plan|how does|backtest|chart)\b/.test(q) && !/\b(in a trade|still working|(7|seven)[- ]day|consistency|contracts|news on|inactiv\w*|payout)\b/.test(q)) return null;   // the account-rule questions stay here (QA 2026-11-21)   // the brain keeps the deeper answers
  for (const [id, rx] of RX) if (rx.test(id === 'review' ? q.trim() : q)) return id;
  return null;
}

// ------------------------------------------------------------------------------------------------ the files: fetched, slimmed, kept for offline
function store(deps) { return deps && deps.storage !== undefined ? deps.storage : (typeof localStorage !== 'undefined' ? localStorage : null); }
function keep(deps, name, j) { const s = store(deps); if (!s) return; try { s.setItem(PREFIX + name, JSON.stringify({ at: Date.now(), j })); } catch (_) { /* full / private */ } }
function kept(deps, name) { const s = store(deps); if (!s) return null; try { const o = JSON.parse(s.getItem(PREFIX + name) || 'null'); return isObj(o) && o.j ? o : null; } catch (_) { return null; } }
const SLIM = {
  payday: (j) => ({ date: j.date, what: txt(j.what, 160), markets: j.markets, rows: j.rows }),
  steps: (j) => ({ updated: j.updated, items: arr(j.items).slice(0, 12).map((i) => ({ id: i.id, n: i.n, title: txt(i.title, 90), what: txt(i.what, 200), where: txt(i.where, 20), optional: !!i.optional, copy: txt(i.copy, 60) })) }),
  decisions: (j) => ({ updated: j.updated, items: arr(j.items).filter(isObj).slice(0, 24).map((i) => ({ id: i.id, status: txt(i.status, 10), question: txt(i.question, 160), recommend: txt(i.recommend, 10), why: txt(i.recommend_why, 160), usd_month: num(i.usd_month) })) }),
  dash: (j) => ({ built: j.built, edge: isObj(j.edge) ? { label: j.edge.label, light: j.edge.light, line: txt(j.edge.line, 160), data_to: j.edge.data_to, now: j.edge.now, atlas: j.edge.atlas } : null,
    plan: isObj(j.plan) ? { label: j.plan.label, what: txt(j.plan.what, 120), built: j.plan.built, now: arr(j.plan.now).slice(0, 6),
      h2: isObj(j.plan.by_market) && isObj(j.plan.by_market.H2) ? { accounts: arr(j.plan.by_market.H2.accounts).slice(0, 6).map((x) => ({ key: x.key, name: txt(x.name, 40), net_m: num(x.net_m), pass_date: x.pass_date || null, funded_med: x.funded_med || null })),
        fleet: arr(j.plan.by_market.H2.fleet).slice(0, 8).map((x) => ({ month: x.month, net_mean: num(x.net_mean) })) } : null } : null }),
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

// the PC's post (pc_feed.js fetchLatest: the core with its extras merged) as the live view data.js gives Jarvis, for a page without data.js
// (jarvis/ask.js, the Ask Jarvis button on every app). The same rules as data.js extraAccounts: a cloud / paper / BLITZ row is never an
// account, and a row with the Zlarior or ATLAS card's own balance + floor IS that card.
export function liveFromLite(j, cached) {
  if (!isObj(j)) return null;
  const b = isObj(j.board) ? j.board : {};
  const same = (c, e) => isObj(c) && num(c.balance) != null && num(c.balance) === num(e.balance) && num(c.floor) === num(e.floor);
  const extra = [];
  for (const a of arr(j.accounts)) {
    if (!isObj(a) || !a.id || a.error || !['eval', 'funded'].includes(String(a.kind))) continue;
    if (/^(lit|atlas|acct_?b|acct_?c|cloud_paper)$/i.test(a.id) || /cloud|blitz|scalp/i.test(`${a.id} ${a.name || ''} ${a.source || ''}`) || /^paper$/i.test(String(a.badge || ''))) continue;
    const e = isObj(a.eval) ? a.eval : isObj(a.funded) ? a.funded : null;
    if (!e || num(e.balance) == null || same(b.lit, e) || same(b.atlas, e)) continue;
    extra.push({ ...e, id: a.id, key: a.id, name: txt(a.name, 40).replace(/\bBuilder\s+/i, '').replace(/^MFFU\s+/i, ''), plan: txt(a.plan, 40), stage: a.kind === 'funded' ? 'funded' : 'eval',
      status: a.kind === 'funded' ? 'funded' : e.status, today_pnl: isObj(a.pnl) && num(a.pnl.today) != null ? num(a.pnl.today) : num(e.today) });
  }
  const trades = arr(b.trades).filter(isObj).slice(-12).map((x) => ({ acct: x.acct, side: x.side, qty: x.qty, exit: x.exit, usd: num(x.usd), r: num(x.r), day: x.day, open: !!x.open, t: num(x.exit_t) || num(x.entry_t),
    src: x.src === 'paper' ? 'paper' : undefined, member: typeof x.member === 'string' ? x.member.slice(0, 12) : undefined }));
  return { lit: b.lit || null, atlas: b.atlas || null, extra, trades, price: num(j.price), t: num(j.t), verdict: isObj(j.pc_verdict) ? j.pc_verdict : null, raw: cached ? null : j, cached: !!cached };
}

// a sim-FUNDED account the way MFFU shows it (owner 2026-11-20): the balance starts at $0 and IS the profit; the floor is -$1,000 (25K) /
// -$2,000 (50K); the earliest payout comes at buffer + the smallest payout, the goal (the biggest payout) at buffer + the biggest. Uses
// PC_FEED.mffuView(acct) when the page has it (the archive team's one rule for every app), else balance - start. Evals unchanged.
export const MFFU_FUNDED = { '25K': { start: 25000, mll: 1000, buffer: 1100, pay_min: 250, pay_max: 1000 }, '50K': { start: 50000, mll: 2000, buffer: 2100, pay_min: 500, pay_max: 2000 } };
export function fundedView(a, feed) {
  if (!isObj(a) || a.stage !== 'funded' || num(a.balance) == null) return null;
  const P = MFFU_FUNDED[/50\s*k/i.test(`${a.name || ''} ${a.plan || ''}`) ? '50K' : '25K'];
  let profit = null, mv = null;
  const F = feed || globalThis.PC_FEED;
  if (F && typeof F.mffuView === 'function') { try { mv = F.mffuView({ ...a, kind: 'funded' }); } catch (_) { mv = null; } }
  if (isObj(mv) && num(mv.profit) != null) profit = num(mv.profit); else if (isObj(mv) && num(mv.balance) != null) profit = num(mv.balance); else if (num(mv) != null) profit = num(mv);
  if (!isObj(mv)) mv = null;
  if (profit == null) profit = a.balance > P.start / 2 ? Math.round((a.balance - P.start) * 100) / 100 : a.balance;   // already MFFU's view
  // the floor trails up with the best balance: from the PC's room when it has one, else the plan's -$1,000 / -$2,000
  const floor = mv && num(mv.floor) != null ? num(mv.floor) : num(a.room) != null ? Math.round((profit - num(a.room)) * 100) / 100 : -P.mll;
  const at = (k, d) => (mv && isObj(mv[k]) && num(mv[k].at) != null ? num(mv[k].at) : d);
  const early = at('earliest', P.buffer + P.pay_min), goal = at('goal', P.buffer + P.pay_max);
  const earlyPay = mv && isObj(mv.earliest) && num(mv.earliest.ask) != null ? num(mv.earliest.ask) : P.pay_min;
  const goalPay = mv && isObj(mv.goal) && num(mv.goal.ask) != null ? num(mv.goal.ask) : P.pay_max;
  const toYou = mv && isObj(mv.goal) && num(mv.goal.toYou) != null ? num(mv.goal.toYou) : goalPay * 0.8;
  return { profit, floor, room: Math.round((profit - floor) * 100) / 100, early, earlyPay, goal, goalPay, toYou, toEarly: Math.max(0, early - profit), toGoal: Math.max(0, goal - profit) };
}
export function fundedLine(a, feed) {
  const v = fundedView(a, feed); if (!v) return '';
  const left = (n) => (n > 0 ? ` (${usd(n)} to go)` : ' (reached)');
  return `${a.name} funded: ${v.profit > 0 ? '+' : ''}${usd(v.profit)}, today ${usd(a.today || 0, true)}, floor ${v.floor < 0 ? '-' + usd(-v.floor) : usd(v.floor)} (${usd(v.room)} room left). Earliest payout at ${usd(v.early)}${left(v.toEarly)}; goal ${usd(v.goalPay)} at ${usd(v.goal)} (you get ${usd(v.toYou)}), ${v.toGoal > 0 ? `${usd(v.toGoal)} to go` : 'reached'}.`;
}

// ------------------------------------------------------------------------------------------------ the answers
const A = {};
A.accounts = async (deps, nowD) => {
  const L = await freshLive(deps), list = accountsOf(L);
  if (!list.length) return { text: 'I have no account numbers from the PC yet. When the PC is on it reports every 15 minutes.', src: liveSrc(L, +nowD) };
  const tot = list.reduce((s, a) => s + (a.today || 0), 0), funded = list.filter((a) => a.stage === 'funded').length;
  const head = `${plural(list.length, 'account')} (${funded} funded, ${list.length - funded} in eval). Today ${usd(tot, true)} in total.`;
  const rows = list.map((a) => (a.stage === 'funded' && fundedLine(a)) || `${a.name}: ${usd(a.balance)}, today ${usd(a.today || 0, true)}, ${usd(a.room)} room left${a.toTarget != null ? `, ${usd(a.toTarget)} to pass` : ', funded'}.`);
  return { text: [head, ...rows].join('\n'), src: liveSrc(L, +nowD) };
};
async function chartOpen(deps) {                                   // the chart feed's open trades (the PC's "-bars" ntfy post), or null
  try {
    const st = await getFile('status', deps); if (!st || !isObj(st.j)) return null;
    const B = await import('../nq/nqbars.js?v=b2');
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
      rows.push(`${a.name}: YES, ${sideOf(p)}${q2 ? ' ' + plural(q2, 'micro') : ''}${e != null ? ' from ' + f(e) : ''}${openUsd != null ? `, about ${usd(openUsd, true)} open ${num(L.t) && +nowD / 1000 - num(L.t) > 20 * 60 ? "at the PC's last report" : 'right now'}` : ''}${ur != null ? ` (${ur >= 0 ? '+' : ''}${ur.toFixed(1)}R)` : ''}.`
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
    if (a.stage === 'funded') {                                         // MFFU terms: the floor trails from -$1,000 (25K) and stops at +$100
      const v = fundedView(a);
      if (v) return `${a.name} funded: ${usd(v.room)} above its floor (the floor is ${v.floor < 0 ? '-' + usd(-v.floor) : usd(v.floor)} in MFFU terms, ${usd(v.profit)} now; it rises with new highs and stops at +$100)${dllLeft != null ? `; today it can still lose ${usd(dllLeft)} before the daily limit (a pause, never a fail)` : ''}.`;
    }
    return `${a.name}: ${usd(a.room)} of ${usd(a.mll)} drawdown left${pct != null ? ` (${pct}%)` : ''}${dllLeft != null ? `; today it can still lose ${usd(dllLeft)} before the daily limit (a pause, never a fail)` : ''}.${warn}`;
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
  const L = await freshLive(deps), fund = accountsOf(L).filter((x) => x.stage === 'funded'), now = [];
  for (const x of fund) {                                             // the live numbers first, in MFFU terms (QA 2026-11-21)
    const v = fundedView(x); if (!v) continue;
    now.push(fundedLine(x));
    now.push(v.toEarly > 0 ? `Eligible now? Not yet: ${usd(v.toEarly)} more to the earliest (${usd(v.earlyPay)} at +${usd(v.early)}), ${usd(v.toGoal)} more to the full ${usd(v.goalPay)} the plan waits for.`
      : v.toGoal > 0 ? `Eligible by the balance: yes for ${usd(v.earlyPay)}-${usd(Math.min(v.goalPay, Math.floor(v.profit - (v.early - v.earlyPay))))}; the plan waits for the full ${usd(v.goalPay)} (${usd(v.toGoal)} more).`
      : `Eligible by the balance: yes, the full ${usd(v.goalPay)}.`);
  }
  if (fund.length) now.push(`The rules: each payout ${usd(fund.some((x) => /50k/i.test(x.name)) ? 500 : 250)} min, ${usd(fund.some((x) => /50k/i.test(x.name)) ? 2000 : 1000)} max; 80% to you ($1,000 = $800, $560 after the 30% tax pot); 2 traded days a cycle, the best day <= 50% of the cycle's profit, 48 h after the first funded trade; 5 sim payouts, then MFFU moves you to live.`);
  return { text: [...now, ...(now.length ? ['Dates:'] : []), head, ...more, 'Estimates from 1,000 simulated runs of a Jul-Oct-like market, not a promise.'].join('\n'),
    src: (fund.length ? liveSrc(L, +nowD) + ' ' : '') + srcLine(`business/payday.json (${txt(f.j.date, 10) || 'no date'})`, f, +nowD) };
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
  const dec = arr(df && df.j && df.j.items).filter((i) => !i.status || i.status === 'open');
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


// ------------------------------------------------------------------------------------------------ more of the owner's questions (team JARVIS, 2026-11-20)
// what only the whole PC post knows (the PC's own state, its self-heal line, yesterday's review, every live trade per account): kept on
// this phone whenever it is seen, so an offline answer still has it (with its age)
function rawBits(L, deps) {
  const r = L && isObj(L.raw) ? L.raw : null;
  if (r) {
    const bits = { t: num(r.t), pc: isObj(r.pc) ? { running: r.pc.running, adapter: txt(r.pc.adapter, 20), silent: !!r.pc.silent, age_s: num(r.pc.age_s), every_s: num(r.pc.every_s), model_state: txt(r.pc.model_state, 120) } : null,
      reporter: isObj(r.reporter) ? { t: num(r.reporter.t), server: r.reporter.server, nt: r.reporter.nt, market_open: r.reporter.market_open, problems: arr(r.reporter.problems).slice(0, 4).map((x) => txt(typeof x === 'string' ? x : x && (x.text || x.what), 100)) } : null,
      verdict: isObj(r.pc_verdict) ? { label: txt(r.pc_verdict.label, 60), level: txt(r.pc_verdict.level, 10), code: txt(r.pc_verdict.code, 20) } : null,
      sh: isObj(r.sh) ? { ok: r.sh.ok, free: num(r.sh.free), line: txt(r.sh.line, 200), t: num(r.sh.t) } : null,
      zl: isObj(r.zl) ? { d: txt(r.zl.d, 10), s: txt(r.zl.s, 300), t: num(r.zl.t) } : null,
      at: isObj(r.at) ? { t: num(r.at.t), a: arr(r.at.a).slice(0, 6).map((x) => ({ id: txt(x && x.id, 30), tr: arr(x && x.tr).slice(-40) })) } : null };
    keep(deps, 'raw', bits);
    return { ...bits, live: true, seenAt: Date.now() };
  }
  const k = kept(deps, 'raw');
  return k ? { ...k.j, live: false, seenAt: k.at } : null;
}
const ACCT_NAME = (id) => (/^atlas/i.test(id) ? 'ATLAS 25K' : /b25k|25k/i.test(id) ? 'Zlarior 25K #2' : /50k|lit|zlarior/i.test(id) ? 'Zlarior 50K' : txt(id, 20));
// every live trade the PC reports (its "at" list: per account [entry_t, exit_t, side, qty, entry, stop, target, exit, usd, r]) + the board's paper ones
function allTrades(L, R) {
  const out = [], seen = new Set();
  if (R && isObj(R.at)) for (const a of arr(R.at.a)) for (const t of arr(a.tr)) {
    if (!Array.isArray(t) || num(t[0]) == null) continue;
    const key = a.id + ':' + t[0]; if (seen.has(key)) continue; seen.add(key);
    out.push({ who: ACCT_NAME(a.id), day: etNow(new Date(num(t[0]) * 1000)).ymd, side: num(t[2]) === -1 ? 'short' : 'long', usd: num(t[8]), r: num(t[9]), exit: t[7] || '', open: t[1] == null && t[7] == null, src: 'live' });
  }
  for (const t of arr(L && L.trades)) {
    if (!t || t.acct === 'blitz' || (out.length && t.src !== 'paper')) continue;            // the board's live ones are already in "at"
    out.push({ who: (t.acct === 'atlas' ? 'ATLAS 25K' : /25k/i.test(String(t.acct)) ? 'Zlarior 25K #2' : 'Zlarior 50K') + (t.member ? ' ' + txt(t.member, 12) : ''), day: t.day, side: String(t.side || '').toLowerCase(), usd: num(t.usd), r: num(t.r), exit: t.exit || '', open: !!t.open, src: t.src === 'paper' ? 'paper' : 'live' });
  }
  return out.sort((x, y) => String(x.day).localeCompare(String(y.day)));
}
const WHY = { STOP: 'stop', TARGET: 'target', BE: 'break-even', EOD: 'flat at the close', TIME: 'time exit' };
function tradeLine(t, today) {
  const res = t.open ? `still open${t.r != null ? ` (${t.r >= 0 ? '+' : ''}${t.r.toFixed(1)}R)` : ''}` : `${t.usd != null ? usd(t.usd, true) : t.r != null ? t.r.toFixed(1) + 'R' : '?'}${t.exit ? ' (' + (WHY[String(t.exit).toUpperCase()] || String(t.exit).toLowerCase()) + ')' : ''}`;
  return `${t.who} ${t.side} ${dayText(t.day, today)}: ${res}${t.src === 'paper' ? ', paper' : ''}.`;
}
A.bots = async (deps, nowD, text) => {
  const L = await freshLive(deps), list = accountsOf(L), et = etNow(nowD), q = String(text || '').toLowerCase(), R = rawBits(L, deps);
  if (!L && !R) return { text: 'I have no report from the PC yet, so I cannot say what the bots did.', src: liveSrc(L, +nowD) };
  const last = /\blast week\b/.test(q), week = last || /\bweek\b/.test(q);
  const ws = weekStart(et.ymd, et.dow), from = last ? new Date(Date.parse(ws + 'T12:00:00Z') - 7 * 864e5).toISOString().slice(0, 10) : week ? ws : et.ymd, to = last ? ws : '9999';
  const tr = allTrades(L, R).filter((t) => t.day >= from && t.day < to);
  const done = tr.filter((t) => !t.open), open = tr.filter((t) => t.open), real = done.filter((t) => t.src !== 'paper'), sum = real.reduce((a, t) => a + (t.usd || 0), 0);
  const label = last ? 'Last week' : week ? 'This week' : 'Today';
  const lines = [];
  if (done.length || open.length) lines.push(`${label}: ${plural(real.length, 'closed trade')}${real.length ? ` for ${usd(sum, true)}` : ''}${done.length > real.length ? ` (+ ${done.length - real.length} paper)` : ''}${open.length ? `, ${open.length} still open` : ''}.`);
  else lines.push(`${label}: no trades${last ? '' : ' yet'}. Quiet days are normal; the plan is 2 to 4 trades a week.`);
  for (const t of open.slice(-2)) lines.push(tradeLine(t, et.ymd));
  for (const t of done.slice(-5)) lines.push(tradeLine(t, et.ymd));
  if (!last) {
    const per = list.map((a) => (week ? (a.week != null ? `${a.name} ${usd(a.week, true)}` : '') : a.today != null ? `${a.name} ${usd(a.today, true)}` : '')).filter(Boolean);
    if (per.length) lines.push(`P&L ${week ? 'this week' : 'today'}: ${per.join(', ')}.`);
  }
  const vd = isObj(L && L.verdict) && L.verdict.label ? txt(L.verdict.label, 80) : R && R.verdict && R.verdict.label ? R.verdict.label : '';
  if (vd && !last) lines.push(`Bots now: ${vd}.`);
  return { text: lines.join('\n'), src: L ? liveSrc(L, +nowD) : `Source: PC report, saved copy from ${ageWords((+nowD - R.seenAt) / 1000)} (offline).` };
};
A.pc = async (deps, nowD) => {
  const L = await freshLive(deps), R = rawBits(L, deps), now = +nowD / 1000;
  const t = num(L && L.t) || (R && R.t), age = t ? now - t : null;
  if (!t) return { text: 'I have no report from the PC yet. When it is on it reports every 15 minutes.', src: liveSrc(L, +nowD) };
  const lines = [];
  const fresh = age <= 25 * 60, rep = R && R.reporter, pc = R && R.pc;
  if (!fresh) lines.push(`Not sure: the PC's last report is ${ageWords(age)}. It reports every 15 minutes while it is on, so it may be off, asleep or offline.`);
  else if (rep && rep.server === false) lines.push('The PC is on but the bot server is not answering. Restart the bot on the PC (START BOT).');
  else if (pc && pc.running === false) lines.push('The PC reported, but the bot is not running.');
  else lines.push(`Yes: the PC reported ${ageWords(age)} and the bot is running${rep && rep.nt === true ? ', NinjaTrader connected' : rep && rep.nt === false ? ', but NinjaTrader is NOT connected' : ''}.`);
  const vd = (isObj(L && L.verdict) && L.verdict.label) || (R && R.verdict && R.verdict.label);
  if (vd) lines.push(`Bot status: ${txt(vd, 60)}.`);
  if (pc && pc.model_state) lines.push(pc.model_state + '.');
  if (rep && rep.problems && rep.problems.filter(Boolean).length) lines.push(`Problems: ${rep.problems.filter(Boolean).join('; ')}.`);
  if (R && R.sh && R.sh.line) lines.push(R.sh.line.replace(/^Self-heal: /, 'Self-check: ') + '.');
  const ph = L && isObj(L.pc_health) ? L.pc_health : null;
  if (ph && (num(ph.cpu) != null || num(ph.ram) != null)) lines.push(`CPU ${num(ph.cpu) != null ? Math.round(ph.cpu) + '%' : '?'}, memory ${num(ph.ram) != null ? Math.round(ph.ram) + '%' : '?'}.`);
  return { text: lines.join('\n'), src: liveSrc(L || { t }, +nowD) };
};
A.decide = async (deps, nowD) => {
  const f = await getFile('decisions', deps);
  const items = arr(f && f.j && f.j.items);
  if (!items.length) return { text: 'I cannot read the Decide card (business/decisions.json) right now.', src: srcLine('business/decisions.json', f, +nowD) };
  const open = items.filter((i) => !i.status || i.status === 'open'), later = items.filter((i) => i.status === 'later');
  const lines = [];
  if (open.length) {
    lines.push(`${plural(open.length, 'yes/no question')} waiting for you on the Decide card (Board page).`);
    for (const i of open.slice(0, 3)) lines.push(`${i.question} My advice: ${String(i.recommend || '?').toUpperCase()}${i.usd_month != null ? ` (${usd(i.usd_month, true)} a month)` : ''}.${i.why ? ' ' + i.why : ''}`);
  } else {
    const n = (st) => items.filter((i) => i.status === st).length;
    lines.push(`Nothing waiting: all ${items.length} answered (${n('yes')} yes, ${n('no')} no${n('done') ? `, ${n('done')} done` : ''}${later.length ? `, ${later.length} later` : ''}).`);
  }
  for (const i of later.slice(0, 2)) lines.push(`Parked for later: ${i.question} My advice: ${String(i.recommend || '?').toUpperCase()}.`);
  return { text: lines.join('\n'), src: srcLine(`business/decisions.json${f && f.j && f.j.updated ? ' (' + f.j.updated + ')' : ''}`, f, +nowD) };
};
// the same payout coach as the ZEUS card (pc_feed.js payoutLines + business/payoutcoach.js), so Jarvis says the same "need $X more"
function loadScript(src, global) {
  if (globalThis[global]) return Promise.resolve(globalThis[global]);
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((ok) => { try { const s = document.createElement('script'); s.src = new URL(src, import.meta.url).href; s.async = true; s.onload = () => ok(globalThis[global] || null); s.onerror = () => ok(null); document.head.appendChild(s); } catch (_) { ok(null); } });
}
export const TAX_PCT = 30, SPLIT = 0.8;
A.payoutnow = async (deps, nowD) => {
  const L = await freshLive(deps);
  const raw = L && isObj(L.raw) ? L.raw : null;
  const [feed, coach] = await Promise.all([deps.feed ? deps.feed : loadScript('../pc_feed.js?v=n10', 'PC_FEED'), deps.coach ? deps.coach : loadScript('../business/payoutcoach.js', 'PAYOUT_COACH')]);
  const funded = accountsOf(L).filter((a) => a.stage === 'funded');
  if (!funded.length) return { text: 'No funded account on the PC report right now, so no payout to ask for yet. Say "first payout" for the dates.', src: liveSrc(L, +nowD) };
  const lines = [];
  let coached = false;
  if (raw && feed && coach && typeof feed.payoutLines === 'function') {
    try {
      const j = JSON.parse(JSON.stringify(raw)); feed.payoutLines(j.board, j.accounts, j, coach, etNow(nowD).ymd);
      for (const c of [j.board && j.board.atlas].concat(arr(j.board && j.board.accounts))) {
        if (!isObj(c) || !c.payout_text) continue;
        coached = true;
        const need = num(c.to_target);
        lines.push(`${c.name === 'ATLAS' ? 'ATLAS 25K' : txt(c.name, 30)}: ${txt(c.payout_text, 200)}`);
        if (need != null && need <= 0) lines.push('It can ask now: request it on the MFFU dashboard (Jarvis never does that for you).');
      }
    } catch (_) { coached = false; }
  }
  for (const a of funded) { const f = fundedLine(a, feed); if (f) lines.unshift(f); }
  if (!coached) lines.push('The payout coach needs the full PC report for the dates and the consistency rule; the ZEUS card on the Board has the line.');
  const gross = /50k/i.test(funded[0].name) ? 2000 : 1000, mine = gross * SPLIT, tax = Math.round(mine * TAX_PCT / 100);
  lines.push(`A full ${usd(gross)} payout is ${usd(mine)} to you (80%); set ${usd(tax)} aside for taxes (${TAX_PCT}%), ${usd(mine - tax)} is yours to spend.`);
  return { text: lines.join('\n'), src: liveSrc(L, +nowD) + ' Payout rules: business/payoutcoach.js (same as the ZEUS card).' };
};
// the next IRS estimated-tax date (Apr 15, Jun 15, Sep 15, Jan 15; a weekend moves it to Monday): education, not tax advice
export function nextTaxDate(ymd) {
  const y = +ymd.slice(0, 4), c = [[y, 0, 15], [y, 3, 15], [y, 5, 15], [y, 8, 15], [y + 1, 0, 15]];
  for (const [yy, m, d] of c) {
    const dt = new Date(Date.UTC(yy, m, d)); while ([0, 6].includes(dt.getUTCDay())) dt.setUTCDate(dt.getUTCDate() + 1);
    const iso = dt.toISOString().slice(0, 10); if (iso >= ymd) return iso;
  }
  return null;
}
A.taxes = async (deps, nowD, text) => {
  const et = etNow(nowD), m = /\$?\s*([\d,]{3,7})(?:\.\d+)?/.exec(String(text || '')), amt = m ? num(m[1].replace(/,/g, '')) : null;
  const lines = [];
  if (amt) lines.push(`On a ${usd(amt)} payout: put ${usd(Math.round(amt * TAX_PCT / 100))} in the tax pot (${TAX_PCT}%), ${usd(amt - Math.round(amt * TAX_PCT / 100))} is yours.`);
  else lines.push(`Set ${TAX_PCT}% of every payout aside for taxes: a $1,000 payout is $800 to you (80% split), $240 to the tax pot, $560 yours.`);
  const nx = nextTaxDate(et.ymd);
  if (nx) lines.push(`Next estimated-tax date: ${dayText(nx, et.ymd)}. The Taxes page (Money door) has the calculator and every date.`);
  lines.push('Education, not tax advice: check with a tax pro.');
  return { text: lines.join('\n'), src: 'Source: the Taxes page rule (business/taxes.js, 30% default) and the IRS quarterly dates.' };
};
A.review = async (deps, nowD) => {
  const L = await freshLive(deps), R = rawBits(L, deps), et = etNow(nowD);
  if (!R || !R.zl || !R.zl.s) return { text: 'I have no daily review from the PC yet (it writes one each evening).', src: liveSrc(L, +nowD) };
  return { text: `${dayText(R.zl.d, et.ymd).replace(/^./, (c) => c.toUpperCase())}'s review: ${R.zl.s.split(' · ').join('. ')}.`, src: `Source: the PC's daily review${R.zl.t ? ', ' + ageWords(+nowD / 1000 - R.zl.t) : ''}${R.live ? '' : ' (saved copy, offline)'}.` };
};
A.window = async (deps, nowD) => {
  const L = await freshLive(deps), list = accountsOf(L);
  const rows = list.filter((a) => a.window || a.waiting).map((a) => `${a.name}: ${a.window && a.window.text ? txt(a.window.text, 80) : ''}${a.window && a.window.text && a.waiting ? '. ' : ''}${a.waiting && !a.position ? a.waiting : ''}`.replace(/\.?$/, '.'));
  if (!rows.length) return { text: 'Zlarior (LIT) enters 02:00 to 15:30 ET and is flat by 15:55; ATLAS trades its members\' own hours. No live window line from the PC right now.', src: liveSrc(L, +nowD) };
  return { text: rows.join('\n'), src: liveSrc(L, +nowD) };
};
A.month = async (deps, nowD) => {
  const f = await getFile('dash', deps), d = f && f.j;
  const h2 = d && d.plan && d.plan.h2, lines = [];
  if (h2 && h2.accounts.length) {
    const plan = (x) => /next buy|plan|planned/i.test(x.name), have = h2.accounts.filter((x) => x.net_m != null && !plan(x)), later = h2.accounts.filter((x) => x.net_m != null && plan(x));
    const tot = have.reduce((a, x) => a + (x.net_m || 0), 0), mon = (m) => { const k = /^(\d{4})-(\d{2})$/.exec(String(m || '')); return k ? `${MON[+k[2] - 1]} ${k[1]}` : String(m || ''); };
    lines.push(`About ${usd(tot)} a month to you from the ${plural(have.length, 'account')} you have, once they pay out (estimate: the middle of 1,000 runs of a Jul-Oct-like market, after fees).`);
    lines.push(have.map((x) => `${x.name} ${usd(x.net_m)}`).join(', ') + '.' + (later.length ? ` Not bought yet: ${later.map((x) => `${x.name.replace(/\s*\(next buy\)/i, '')} would add ${usd(x.net_m)}`).join(', ')}.` : ''));
    const nx = h2.fleet.find((x) => x.net_mean != null && x.net_mean > 0);
    if (nx) lines.push(`First month in the plus: ${mon(nx.month)} (about ${usd(nx.net_mean)}).`);
  }
  if (d && d.edge && d.edge.now && num(d.edge.now.usd_month) != null) lines.push(`Zlarior's last 40 sessions replayed: ${usd(d.edge.now.usd_month)} a month (BACKTEST on real bars, costs in, not a promise).`);
  if (!lines.length) return { text: 'I cannot read the money plan (business/dash.json) right now.', src: srcLine('business/dash.json', f, +nowD) };
  return { text: lines.join('\n'), src: srcLine(`business/dash.json${d && d.built ? ', built ' + String(d.built).slice(0, 10) : ''}`, f, +nowD) };
};
A.pass = async (deps, nowD, text) => {
  const L = await freshLive(deps), q = String(text || '').toLowerCase(), et = etNow(nowD);
  const want = /\batlas\b/.test(q) ? /atlas/i : /\b25k\b|#2/.test(q) ? /25K #2/ : /\b50k\b|zlarior|lit\b/.test(q) ? /Zlarior/ : null;
  const evals = accountsOf(L).filter((a) => a.stage === 'eval' && (!want || want.test(a.name)));
  const f = await getFile('dash', deps), h2 = f && f.j && f.j.plan && f.j.plan.h2;
  const est = (nm) => { if (!h2) return null; const x = h2.accounts.find((y) => (/50K/.test(nm) && y.key === 'Z50') || (/25K #2/.test(nm) && y.key === 'N25')); return x && x.pass_date ? x.pass_date : null; };
  if (!evals.length) return { text: want && /atlas/i.test(String(want)) ? 'ATLAS already passed: it trades the funded 25K.' : 'No eval account on the PC report right now.', src: liveSrc(L, +nowD) };
  const rows = evals.map((a) => { const pd = est(a.name); return `${a.name}: ${usd(a.toTarget)} to pass (balance ${usd(a.balance)}, ${usd(a.room)} room)${pd ? `; most likely passes around ${dayText(pd, et.ymd)} (estimate)` : ''}.`; });
  return { text: rows.join('\n'), src: liveSrc(L, +nowD) + (h2 ? ' Dates: business/dash.json (1,000 simulated runs).' : '') };
};
// ------------------------------------------------------------------------------------------------ the money set (lead QA 2026-11-21)
// docs/ACCOUNT_RULES.md (source research/lit/mffu_rules.json, checked 2026-11-20): the rules Jarvis says out loud
const ACCT_OF = (who) => ['Zlarior 25K #2', 'Zlarior 50K', 'ATLAS 25K'].find((n) => String(who || '').startsWith(n)) || String(who || '');   // a trade's account (ATLAS ones carry their member)
const RULES_DATE = 'MFFU rules checked 2026-11-20 (docs/ACCOUNT_RULES.md).';
A.acctrules = async (deps, nowD, text) => {
  const q = String(text || '').toLowerCase(), lines = [];
  if (/contract|minis|micros|size/.test(q)) {
    if (!/50k/.test(q)) lines.push('Builder 25K (Zlarior 25K #2, ATLAS funded): max 2 minis / 20 micros.');
    if (!/25k/.test(q)) lines.push('Builder 50K (Zlarior): max 4 minis / 40 micros.');
    lines.push('Rapid EOD 25K: 2 minis / 20 micros (the plain Rapid 25K is 3 / 30: not ours).');
  }
  if (/news/.test(q)) lines.push('News: allowed on every Builder account (Zlarior evals and ATLAS funded are news-unrestricted). Only a Rapid sim-funded account must be flat 2 min before to 2 min after FOMC, minutes, jobs and CPI.');
  if (/consisten|best day/.test(q)) lines.push('Consistency: none in the Builder evals. Builder funded (ATLAS): for each payout the best day must be <= 50% of the cycle\'s profit (not a breach: trade more days). Rapid EOD eval: best day <= 30% of the profit; Rapid funded: none.');
  if (!lines.length) lines.push('Builder 25K: 2 minis / 20 micros, news allowed. Builder 50K: 4 minis / 40 micros. Funded payouts: best day <= 50% of the cycle.');
  return { text: lines.join('\n'), src: RULES_DATE };
};
// the last trade per account: the PC's report (its trades, newest by exit time), never the 25-day-old replay file
// the same trades as "this week" (allTrades: the ATLAS report's own list first, then the board's), closed and real, oldest first
function tradesOf(L, deps) { return allTrades(L, rawBits(L, deps)).filter((x) => isObj(x) && !x.open && x.src !== 'paper'); }
A.lasttrade = async (deps, nowD, text) => {
  const L = await freshLive(deps), q = String(text || '').toLowerCase(), et = etNow(nowD);
  const want = /\batlas\b/.test(q) ? /^ATLAS/ : /\b25k\b|#2/.test(q) ? /25K #2/ : /\bzlarior|lit\b/.test(q) ? /^Zlarior 50K/ : null;
  const tr = tradesOf(L, deps).filter((x) => !want || want.test(x.who));
  if (!tr.length) return { text: `No closed trade${want ? ' for that account' : ''} in the PC's report (it carries the recent trades only).`, src: liveSrc(L, +nowD) };
  const x = tr[tr.length - 1];
  return { text: `Last trade: ${x.who}, ${dayText(x.day, et.ymd)}: ${x.side}, ${x.usd != null ? usd(x.usd, true) : '?'}${x.r != null ? ` (${x.r > 0 ? '+' : ''}${x.r.toFixed(1)}R)` : ''}${x.exit ? `, ${String(WHY[String(x.exit).toUpperCase()] || x.exit).toLowerCase()}` : ''}.`, src: liveSrc(L, +nowD) };
};
// 7 calendar days without a trade = MFFU may close the account (sim profits forfeited): each account's last trade + 7 days
A.inactive = async (deps, nowD) => {
  const L = await freshLive(deps), et = etNow(nowD), list = accountsOf(L), tr = tradesOf(L, deps), lines = ['MFFU can close an account after 7 calendar days without a trade (sim profits are lost).'];
  const plus7 = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + 7 * 864e5).toISOString().slice(0, 10) : ''; };
  const left = (ymd) => { const a = Date.parse(ymd + 'T00:00:00Z'), b = Date.parse(et.ymd + 'T00:00:00Z'); return Math.round((a - b) / 864e5); };
  for (const a of list) {
    const mine = tr.filter((x) => ACCT_OF(x.who) === a.name), last = mine.length ? mine[mine.length - 1].day : (a.today ? et.ymd : null);
    if (!last) { lines.push(`${a.name}: no trade in the PC's report (it carries the last 12): check its last trade on MFFU, the deadline is 7 days after it.`); continue; }
    const due = plus7(last), d = left(due);
    lines.push(`${a.name}: last trade ${dayText(last, et.ymd)}; trade by ${dayText(due, et.ymd)}${d >= 0 ? ` (${plural(d, 'day')} left)` : ' (past: check MFFU now)'}.`);
  }
  return { text: lines.join('\n'), src: liveSrc(L, +nowD) };
};
// which account next: the closest to passing, the closest to a payout, the next entry window
A.next = async (deps, nowD) => {
  const L = await freshLive(deps), list = accountsOf(L), lines = [];
  if (!list.length) return { text: 'I have no account numbers from the PC yet.', src: liveSrc(L, +nowD) };
  const ev = list.filter((a) => a.stage === 'eval' && a.toTarget != null).sort((a, b) => a.toTarget - b.toTarget);
  if (ev.length) lines.push(`Closest to passing: ${ev[0].name} (${usd(ev[0].toTarget)} to go)${ev.length > 1 ? `; then ${ev.slice(1).map((a) => `${a.name} (${usd(a.toTarget)})`).join(', ')}` : ''}.`);
  for (const a of list.filter((x) => x.stage === 'funded')) { const v = fundedView(a); if (v) lines.push(`Closest to a payout: ${a.name}, ${usd(v.toEarly)} to the earliest (+${usd(v.early)}), ${usd(v.toGoal)} to the full ${usd(v.goalPay)}.`); }
  const ms = isObj(L && L.raw) ? txt(L.raw.model_state, 120) : '';
  if (ms) lines.push(`Next trade: ${ms.replace(/^LIT:\s*/i, 'Zlarior ')}.`);
  lines.push('The bots trade every account by themselves; nothing to do but keep the PC on.');
  return { text: lines.join('\n'), src: liveSrc(L, +nowD) };
};
// this month: the PC report's closed trades this calendar month (ET)
A.monthpnl = async (deps, nowD) => {
  const L = await freshLive(deps), et = etNow(nowD), m = et.ymd.slice(0, 7), tr = tradesOf(L, deps).filter((x) => String(x.day || '').startsWith(m));
  const mon = MON[+m.slice(5) - 1];
  if (!tr.length) return { text: `This month (${mon}): no closed trade in the PC's report (it carries the last 12 trades).`, src: liveSrc(L, +nowD) };
  const tot = tr.reduce((s2, x) => s2 + (num(x.usd) || 0), 0), by = {};
  for (const x of tr) { const k = ACCT_OF(x.who); by[k] = (by[k] || 0) + (num(x.usd) || 0); }
  return { text: `This month (${mon}): ${plural(tr.length, 'closed trade')}, ${usd(tot, true)} in all (${Object.entries(by).map(([k, v]) => `${k} ${usd(v, true)}`).join(', ')}). From the PC's report (its recent trades).`, src: liveSrc(L, +nowD) };
};
// live or paper / armed: each account's badge from the PC (Jarvis never arms anything)
A.mode = async (deps, nowD) => {
  const L = await freshLive(deps), list = accountsOf(L);
  if (!list.length) return { text: 'I have no account cards from the PC yet.', src: liveSrc(L, +nowD) };
  const card = (k) => (isObj(L) && isObj(L[k]) ? L[k] : arr(L && L.extra).find((e) => isObj(e) && (e.key === k || e.id === k)) || null), rows = [];
  for (const a of list) {
    const c = card(a.key), badge = txt((c && c.badge) || '', 12).toUpperCase();
    rows.push(`${a.name}: ${badge === 'LIVE' ? 'LIVE, armed: real orders through NinjaTrader' : badge === 'PAPER' ? 'paper (no real orders)' : badge ? badge.toLowerCase() : 'the report does not say'}.`);
  }
  rows.push('Only you arm or disarm a bot, on the PC; Jarvis never does.');
  return { text: rows.join('\n'), src: liveSrc(L, +nowD) };
};
A.edge = async (deps, nowD) => {
  const f = await getFile('dash', deps), e = f && f.j && f.j.edge;
  if (!e) return { text: 'I cannot read the edge check (business/dash.json) right now.', src: srcLine('business/dash.json', f, +nowD) };
  const lines = [];
  const say = { GREEN: 'looks like the tested strategy', AMBER: 'is weaker than tested: watch it', RED: 'is well below what was tested' };
  lines.push(`Zlarior (LIT): ${e.light}, its last 40 sessions ${say[e.light] || ''}${e.now && num(e.now.pf) != null ? ` (profit factor ${e.now.pf})` : ''}.`);
  if (isObj(e.atlas) && e.atlas.light) lines.push(`ATLAS: ${e.atlas.light}${num(e.atlas.pf_r40) != null ? ` (profit factor ${e.atlas.pf_r40} over its last 40 sessions, ${e.atlas.pf_r40_2026_h1} in 2026 H1)` : ''}.`);
  lines.push('A warning light only: the bots trade the same either way.');
  return { text: lines.join('\n'), src: srcLine(`business/dash.json (data to ${txt(e.data_to, 10) || '?'})`, f, +nowD) };
};


// ------------------------------------------------------------------------------------------------ the website business ('web', team web-expert 2026-11-20)
A.web = async (deps, nowD, text) => {
  const f = await getFile('playbook', deps), P = f && f.j;
  if (!P || !Array.isArray(P.cards)) return { text: 'I cannot read the website playbook (agency/expert/playbook.json) right now.', src: srcLine('agency/expert/playbook.json', f, +nowD) };
  let E = null; try { E = await import('../agency/expert/expertcore.js?v=1'); } catch (_) { E = null; }
  const src = srcLine(`the website playbook (agency/expert/playbook.json, ${txt(P.updated, 10)})`, f, +nowD) + ' Open Agency > Expert for all of it.';
  const q = String(text || '').toLowerCase(), hit = E ? E.find(q, P) : null, range = (o) => (E ? E.range(o) : '');
  const offerOf = (id) => arr(P.offers).find((o) => o.id === id);
  if (/\bbest (niche|trade)s?\b|\bwho (should|do) i (sell|target)\b/.test(q) || (hit && hit.item && hit.item.id === 'when3d')) {
    const sells = arr(P.niches).filter((n) => n.three_d === 'sells').map((n) => n.name), gim = arr(P.niches).filter((n) => n.three_d === 'gimmick').map((n) => n.name);
    const sc = offerOf('scan3d'), pv = offerOf('product3d'), im = offerOf('immersive');
    return { text: [`For 3D, the best trades are the ones where the customer buys a place or an object: ${sells.join(', ')}.`,
      sc && pv ? `Sell templated 3D: a phone-scan tour ${range(sc)}, a 3D product viewer ${range(pv)}.${im ? ` A custom 3D site (${range(im)}) only later, with a fixed scope.` : ''}` : '',
      `Skip 3D for ${gim.join(', ')}: speed, reviews and the Google listing win those calls.`].filter(Boolean).join('\n'), src };
  }
  if (hit && hit.kind === 'niche') {
    const n = hit.item, o = offerOf(n.offer);
    return { text: [`For a ${n.name.toLowerCase()}: lead with the ${o ? `${o.name} (${range(o)})` : 'Growth site'}.`, `Say: "${n.say}"`,
      `3D: ${n.three_d === 'sells' ? 'it sells here' : n.three_d === 'maybe' ? 'maybe, as an add-on' : 'skip it, a gimmick here'}. Hook: ${n.hook}`].join('\n'), src };
  }
  if (hit && hit.kind === 'card') {
    const c = hit.item;
    return { text: [`${c.title}.`, arr(c.say)[0] ? `Say: "${arr(c.say)[0]}"` : '', arr(c.do).slice(0, 2).join(' '), c.usd || ''].filter(Boolean).join('\n'), src };
  }
  const st = offerOf('starter'), gr = offerOf('growth'), im = offerOf('immersive'), ca = offerOf('care');
  return { text: [`The three offers: Starter ${range(st)}, Growth ${range(gr)}, 3D / immersive ${range(im)}; a care plan ${range(ca)} on every site.`,
    'Ask me "what do I say to a roofer", "how do I price a 3D site", "best niche for 3D", or diagnose a prospect in 5 taps on Agency > Expert.'].join('\n'), src };
};

export async function answer(id, deps = {}, text = '') {
  const nowD = deps.now ? deps.now() : new Date(), fn = A[id];
  if (!fn) return null;
  let r;
  try { r = await fn(deps, nowD, text); } catch (e) { if (deps && deps.debug) throw e; r = { text: 'I could not read that just now. Try again in a moment.', src: 'Source: error reading the feeds.' }; }
  if (!r) return null;                                               // not this module's question after all: the brain answers
  const text2 = `${r.text}\n${r.src}`;
  return { text: text2, speak: r.text, intent: 'biz_' + id, src: r.src, offline: /offline/.test(r.src || '') };
}
export async function ask(text, deps = {}) { const id = match(text); return id ? answer(id, deps, text) : null; }
