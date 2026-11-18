// HELLAS data: the owner's published files turned into poleis (city-states). Pure maths except loadSources(): a test runs it in Node.
// Every polis is a real group of real rows, so the header count is honest:
//   Archive      one polis per strategy family + write-up cluster of runs (big clusters split by verdict, then by build day)
//   Data City    one polis per district + trigger family of tested combos
//   Kalshi       one polis per strategy / market / price band / hour / side of the bot's settled bets, one per suggestion verdict
//   Money        one polis per money machine          Accounts  one polis per account          Apps  one polis per app district
// A house is one row (one run, one combo, one fact, one deal, one app). A missing file falls back to hellas-fixture.json and its
// poleis are marked "example". READ ONLY: nothing here trades, places an order or changes a file.
import { hash32 } from './util.js';
import { allApps, DISTRICT_NAME } from './athens-villages.js';
import { greekName } from './people-talk.js';

export const MAX_POLIS = 120, MIN_CLUSTER = 3, MIN_DC = 6;
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const usd = (v, d = 0) => (v == null ? 'no figure' : (v < 0 ? '-' : v > 0 ? '+' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
const plural = (n, w) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayName = (s) => { const m = /^(\d\d)-(\d\d)-(\d\d)$/.exec(String(s || '')); return m ? `${+m[3]} ${MONTHS[+m[2] - 1] || ''} 20${m[1]}` : 'undated'; };
const clip = (s, n) => { s = String(s || '').replace(/…$/, '').trim(); if (s.length <= n) return s; const c = s.slice(0, n), k = c.lastIndexOf(' '); return (k > n * .55 ? c.slice(0, k) : c).replace(/[\s,;:(\-]+$/, '') + '…'; };

export const SOURCES = [
  { key: 'archive', name: 'Archive', unit: 'run', app: '../archive/', open: 'Open in Archive' },
  { key: 'datacity', name: 'Data City', unit: 'combo', app: '../datacity/', open: 'Open in Data City' },
  { key: 'kalshi', name: 'Kalshi edges', unit: 'fact', app: '../kalshicity/', open: 'Open in Kalshi City' },
  { key: 'suggest', name: 'Kalshi suggestions', unit: 'suggestion', app: '../kalshicity/', open: 'Open in Kalshi City' },
  { key: 'money', name: 'Money machines', unit: 'deal', app: '../hera/', open: 'Open the money plan' },
  { key: 'accounts', name: 'Accounts', unit: 'fact', app: '../demeter/', open: 'Open account health' },
  { key: 'apps', name: 'Olympus apps', unit: 'app', app: '../', open: 'Open Olympus' },
];
const SRC = Object.fromEntries(SOURCES.map((s) => [s.key, s]));

// ------------------------------------------------------------------ Archive
const VERDICT = ['adopted', 'rejected', 'open'], V_TONE = { adopted: 'good', rejected: 'bad', open: 'warn' }, V_WORD = { adopted: 'Adopted', rejected: 'Rejected', open: 'Still open' };
const FAM_REGION = { 'LIT research': 'peloponnese', 'LIT headquarters': 'attica', filters: 'macedonia', risk: 'thessaly', 'other tests': 'boeotia', baseline: 'boeotia', management: 'epirus',
  sessions: 'thrace', timing: 'thrace', ATLAS: 'euboea', targets: 'ionian', stops: 'ionian', bias: 'ionian', winrate: 'ionian' };
const FAM_DESERT = { 'LIT research': 'egypt', 'LIT headquarters': 'egypt', ATLAS: 'egypt', baseline: 'egypt', filters: 'libya', management: 'libya', stops: 'libya', targets: 'libya', bias: 'libya', winrate: 'libya',
  risk: 'persia', 'other tests': 'persia', sessions: 'persia', timing: 'persia' };
const humanSlug = (s) => String(s).replace(/^\d{4}-\d\d-\d\d-/, '').replace(/[-_]+/g, ' ').replace(/\blit\b/gi, 'LIT').replace(/\bhq\b/gi, 'HQ').replace(/\b1m\b/g, '1-minute').trim();

function runRow(r, ci, verdicts) {
  const v = verdicts[r[ci.verdict]] || 'open', m = Array.isArray(r[ci.m26]) ? r[ci.m26] : null, o = Array.isArray(r[ci.mold]) ? r[ci.mold] : null;
  return { id: String(r[ci.id]), title: String(r[ci.title] || r[ci.id]), tone: V_TONE[v] || 'plain', verdict: v, size: clamp01(Math.abs(m ? m[3] || 0 : 0) / 45000), net: m ? num(m[3]) : null, perMonth: m ? num(m[4]) : null,
    district: V_WORD[v] + ' quarter', village: 'Built ' + dayName(r[ci.built]), status: String(r[ci.status] || ''), built: String(r[ci.built] || ''), note: String(r[ci.note] || ''), m, o };
}
/** every run of the Archive -> poleis. runs = the index's own rows followed by the shard rows. */
export function archivePoleis(index, runs) {
  const cols = arr(index && index.cols), ci = Object.fromEntries(cols.map((c, i) => [c, i])), verdicts = arr(index && index.verdicts).length ? index.verdicts : VERDICT;
  if (ci.id == null || ci.family == null) return [];
  const title = new Map(arr(index.writeups).map((w) => [w.slug, w.title]));
  const fam = new Map();
  for (const r of runs) { if (!Array.isArray(r)) continue; const f = String(r[ci.family] || 'other tests'), w = String(r[ci.writeup] || ''); const m = fam.get(f) || fam.set(f, new Map()).get(f); (m.get(w) || m.set(w, []).get(w)).push(r); }
  const out = [];
  const push = (family, key, label, rows, slug) => {
    const R = rows.map((r) => runRow(r, ci, verdicts)), n = R.length, ad = R.filter((x) => x.verdict === 'adopted').length, rej = R.filter((x) => x.verdict === 'rejected').length;
    const best = R.filter((x) => x.net != null).sort((a, b) => b.net - a.net)[0];
    out.push({ id: 'archive:' + key, src: 'archive', family, label, unit: 'run', rows: R, size: n, gold: ad > 0, good: ad, bad: rej, open: n - ad - rej, ruin: rej === n, region: rej === n ? FAM_DESERT[family] || 'egypt' : FAM_REGION[family] || 'boeotia', slug: slug || '',
      keywords: `${family} archive strategy test run ${slug || ''}`,
      say: `${plural(n, 'run')} of the ${family} family: ${ad} adopted, ${rej} rejected, ${n - ad - rej} still open.${best ? ` Best 2026 result here: ${usd(best.net)} after costs (${usd(best.perMonth)} per month).` : ''}` });
  };
  // the desert of what did not work: when a cluster has enough rejected runs AND enough living ones, the rejected ones become their own ghost town
  const rejIdx = verdicts.indexOf('rejected');
  const split = (family, key, label, rows, slug) => {
    const rj = rows.filter((r) => r[ci.verdict] === rejIdx), lv = rows.filter((r) => r[ci.verdict] !== rejIdx);
    if (rj.length >= MIN_CLUSTER && lv.length >= MIN_CLUSTER) { push(family, key, label, lv, slug); push(family, key + '|ruin', label + ' (rejected)', rj, slug); } else push(family, key, label, rows, slug);
  };
  for (const [family, byW] of fam) {
    const small = [];
    for (const [w, rows] of byW) {
      if (!w || rows.length < MIN_CLUSTER) { small.push(...rows); continue; }
      const base = clip(String(title.get(w) || humanSlug(w)).replace(/\s*\(.*$/, ''), 46) || humanSlug(w);
      if (rows.length <= MAX_POLIS) { split(family, `${family}|${w}`, base, rows, w); continue; }
      // a big cluster: one polis per verdict, and per build day when a verdict is still too big
      for (let vi = 0; vi < verdicts.length; vi++) {
        const part = rows.filter((r) => r[ci.verdict] === vi); if (!part.length) continue;
        if (part.length <= MAX_POLIS) { push(family, `${family}|${w}|${verdicts[vi]}`, `${base} (${verdicts[vi]})`, part, w); continue; }
        const days = new Map(); for (const r of part) { const d = String(r[ci.built] || ''); (days.get(d) || days.set(d, []).get(d)).push(r); }
        for (const [d, list] of [...days].sort((a, b) => (a[0] < b[0] ? -1 : 1))) for (let k = 0; k < list.length; k += MAX_POLIS)
          push(family, `${family}|${w}|${verdicts[vi]}|${d}|${k}`, `${base} (${verdicts[vi]}, ${dayName(d).replace(/ 20\d\d$/, '')}${k ? ', part ' + (k / MAX_POLIS + 1) : ''})`, list.slice(k, k + MAX_POLIS), w);
      }
    }
    for (let k = 0; k < small.length; k += MAX_POLIS) split(family, `${family}|~small|${k}`, `${family}: smaller tests${k ? ' ' + (k / MAX_POLIS + 1) : ''}`, small.slice(k, k + MAX_POLIS), '');
  }
  return out;
}

// ------------------------------------------------------------------ Data City
const DC_REGION = { times: 'ionia', week: 'ionia', seasons: 'ionia', volatility: 'aeolis', gaps: 'aeolis', orange: 'caria', while: 'caria', esnq: 'caria', confluences: 'caria', strategies: 'caria', discoveries: 'caria', harbor: 'caria' };
const TRIG = { fvg: 'fair value gap', ifvg: 'inverted fair value gap', disp: 'displacement', cisd: 'CISD', slot: 'time slot', vwap: 'VWAP', sweep: 'sweep', break: 'break', gap: 'gap', news: 'news' };
const SIDE = { bull: 'bullish', bear: 'bearish', long: 'long', short: 'short', up: 'above', dn: 'below' };
export function triggerName(t) {
  const p = String(t).split('_'), head = TRIG[p[0]] || p[0], rest = p.slice(1).map((x) => SIDE[x] || x.toUpperCase());
  return rest.length && SIDE[p[1]] ? (p[0] === 'vwap' || p[0] === 'slot' ? `${head} ${rest.join(' ')}` : `${rest[0]} ${head}${rest.length > 1 ? ' ' + rest.slice(1).join(' ') : ''}`) : [head, ...rest].join(' ');
}
const CLS_TONE = { gold: 'good', green: 'good', amber: 'warn', grey: 'plain' }, CLS_SAY = { gold: 'holds everywhere and passes the false-discovery test', green: 'holds in both periods', amber: 'holds in one period only', grey: 'noise: no steady result' };
function comboRow(b) {
  const e = num(b.e), tpw = num(b.tpw), pm = e != null && tpw != null ? Math.round(e * tpw * 4.33) : null, cls = String(b.cls || 'grey');
  return { id: String(b.id), title: String(b.lab || b.id), tone: CLS_TONE[cls] || 'plain', verdict: cls, size: clamp01(Math.abs(e || 0) / 40), net: e, perMonth: pm,
    district: ({ rising: 'Rising quarter', steady: 'Steady quarter', decaying: 'Fading quarter' })[b.tr] || 'Old quarter', village: ({ gold: 'Gold houses', green: 'Holds in both periods', amber: 'Holds in one period', grey: 'Noise' })[cls] || 'Unrated',
    n: num(b.n), w: num(b.w), tpw, e26: num(b.e26), n26: num(b.n26), eo: num(b.eo), no: num(b.no), fdr: !!b.fdr, tr: String(b.tr || '') };
}
export function datacityPoleis(city) {
  const B = arr(city && city.buildings), sec = new Map(arr(city && city.sections).map((s) => [s.key, s]));
  const by = new Map();
  for (const b of B) { if (!isObj(b) || !b.id) continue; const d = String(b.d || 'other'), t = String(b.id).replace(/^S:/, '').split('|')[0]; const m = by.get(d) || by.set(d, new Map()).get(d); (m.get(t) || m.set(t, []).get(t)).push(b); }
  const out = [];
  const title = (d) => { const s = sec.get(d); return s && s.name ? s.name[0] + s.name.slice(1).toLowerCase() : d[0].toUpperCase() + d.slice(1); };
  const push = (d, key, label, list) => {
    const R = list.map(comboRow), n = R.length, good = R.filter((r) => r.tone === 'good').length, bad = R.filter((r) => r.verdict === 'grey').length, gold = R.some((r) => r.verdict === 'gold' || r.fdr);
    const best = R.filter((r) => r.net != null).sort((a, b) => b.net - a.net)[0];
    for (let k = 0; k < R.length; k += MAX_POLIS) out.push({ id: `datacity:${d}|${key}${k ? '|' + k : ''}`, src: 'datacity', family: title(d), label: label + (k ? ' ' + (k / MAX_POLIS + 1) : ''), unit: 'combo', rows: R.slice(k, k + MAX_POLIS), size: Math.min(MAX_POLIS, n - k),
      gold, good, bad, open: n - good - bad, region: DC_REGION[d] || 'caria', keywords: `data city combo ${d} ${key} ${label}`,
      say: `${plural(n, 'tested combo')} in ${title(d)}: ${good} hold in both periods, ${bad} are noise.${best ? ` Best here: ${usd(best.net, 1)} per trade per micro after costs.` : ''}` });
  };
  for (const [d, byT] of by) {
    const rest = [];
    for (const [t, list] of byT) { if (list.length < MIN_DC) rest.push(...list); else push(d, t, `${title(d)}: ${triggerName(t)}`, list); }
    if (rest.length) push(d, '~rest', `${title(d)}: other triggers`, rest);
  }
  return out;
}

// ------------------------------------------------------------------ Kalshi
const K_KIND = { strategy: 'strategy', market: 'market', band: 'price band', hour: 'hour', side: 'side' }, K_REGION = { strategy: 'crete', market: 'crete', band: 'cyclades', hour: 'cyclades', side: 'cyclades' };
const ADVICE = { do_more: ['good', 'Do more (suggestion)'], keep: ['good', 'Keep'], watch: ['warn', 'Watch'], stop: ['bad', 'Stop (suggestion)'], pause: ['warn', 'Pause (suggestion)'], collect: ['plain', 'Too few bets to judge'] };
const bandAlias = (s) => String(s).replace(/(\d+)\s*to\s*(\d+)\s*cents?/gi, '$1-$2c $1c $2c').replace(/(\d+)-(\d+)c/g, '$1-$2c $1c $2c');
function factRow(id, title, pnl, n, tone, district, village, extra = {}) { return { id, title, tone, verdict: extra.verdict || '', size: clamp01(Math.abs(pnl || 0) / 120), net: num(pnl), perMonth: null, district, village, n: num(n), ...extra }; }
export function kalshiPoleis(edges, sugg) {
  const E = arr(edges && edges.edges).filter((e) => isObj(e) && e.label), out = [], combos = E.filter((e) => e.kind === 'combo');
  for (const e of E) {
    if (!K_KIND[e.kind]) continue;
    const [tone, word] = ADVICE[e.advice] || ['plain', String(e.advice || 'No advice')], rows = [];
    const wr = num(e.w) != null ? `${Math.round(e.w * 1000) / 10}% won` : '';
    rows.push(factRow(e.id + '#all', `All settled bets: ${plural(e.n || 0, 'bet')}, ${wr}, ${usd(num(e.pnl), 2)} in total`, e.pnl, e.n, tone, 'All time', word, { verdict: word, ev: num(e.ev), wr: num(e.w), status: String(e.status || ''), small: !!e.small }));
    for (const [k, name] of [['d7', 'Last 7 days'], ['d30', 'Last 30 days'], ['led', 'Since the ledger began']]) { const w = isObj(e.win) && isObj(e.win[k]) ? e.win[k] : null; if (w && w.n > 0) rows.push(factRow(`${e.id}#${k}`, `${name}: ${plural(w.n, 'bet')}, ${usd(num(w.pnl), 2)}`, w.pnl, w.n, w.pnl > 0 ? 'good' : w.pnl < 0 ? 'bad' : 'plain', 'Recent', name, { verdict: name })); }
    for (const c of combos) if (String(c.label).split(' · ').includes(e.label)) { const [ct, cw] = ADVICE[c.advice] || ['plain', '']; rows.push(factRow(c.id, `Together with ${String(c.label).split(' · ').filter((x) => x !== e.label).join(' and ')}: ${plural(c.n || 0, 'bet')}, ${usd(num(c.pnl), 2)}`, c.pnl, c.n, c.pnl > 0 ? 'good' : c.pnl < 0 ? 'bad' : ct, 'Combinations', cw || 'Pairs', { verdict: cw })); }
    out.push({ id: 'kalshi:' + e.id, src: 'kalshi', family: 'Kalshi ' + K_KIND[e.kind], label: `Kalshi ${K_KIND[e.kind]}: ${e.label}`, unit: 'fact', rows, size: rows.length, weight: num(e.n) || 0, gold: e.advice === 'keep' || e.advice === 'do_more',
      good: e.pnl > 0 ? 1 : 0, bad: e.pnl < 0 ? 1 : 0, open: e.pnl ? 0 : 1, region: K_REGION[e.kind], keywords: bandAlias(`kalshi bet ${e.kind} ${e.label}`),
      say: `${plural(e.n || 0, 'settled bet')} ${e.kind === 'band' || e.kind === 'side' || e.kind === 'hour' ? e.label : 'on ' + e.label}: ${wr ? wr + ', ' : ''}${usd(num(e.pnl), 2)} in total. ${word}.${e.small ? ' Small sample: not proven.' : ''}` });
  }
  const S = arr(sugg && sugg.items).filter((i) => isObj(i) && i.kind), byV = new Map();
  for (const i of S) { const v = String(i.verdict || 'watch'); (byV.get(v) || byV.set(v, []).get(v)).push(i); }
  for (const [v, list] of byV) {
    const tone = ({ keep: 'good', stop: 'bad', pause: 'warn', watch: 'warn' })[v] || 'plain';
    const rows = list.map((i, k) => factRow(`suggest:${v}:${k}`, String(i.kind), i.net_usd, i.n, tone, v[0].toUpperCase() + v.slice(1), i.net_usd > 0 ? 'Made money' : 'Lost money', { verdict: v, rule: String(i.rule || ''), roi: num(i.roi_pct) }));
    const net = list.reduce((s, i) => s + (num(i.net_usd) || 0), 0);
    out.push({ id: 'suggest:' + v, src: 'suggest', family: 'Kalshi suggestions', label: `Kalshi suggestions: ${v}`, unit: 'suggestion', rows, size: rows.length, gold: v === 'keep', good: v === 'keep' ? rows.length : 0, bad: v === 'stop' ? rows.length : 0, open: v === 'keep' || v === 'stop' ? 0 : rows.length,
      region: 'cyclades', keywords: bandAlias(`kalshi suggestion ${v} ${list.map((i) => i.kind).join(' ')}`), say: `${plural(rows.length, 'suggestion')} to ${v}, from the bot's own settled bets: ${usd(net, 2)} in total. Suggestions only: nothing here places a bet.` });
  }
  return out;
}

// ------------------------------------------------------------------ money machines, accounts, apps
export function moneyPoleis(money) {
  return arr(money && money.streams).filter((s) => isObj(s) && s.id).map((s) => {
    const items = arr(s.items).filter(isObj), rows = [factRow(`${s.id}#status`, `Status: ${s.status === 'ok' ? 'fresh' : s.status === 'stale' ? 'old data' : String(s.status || 'unknown')}${num(s.age_min) != null ? `, read ${s.age_min < 90 ? Math.round(s.age_min) + ' minutes' : Math.round(s.age_min / 60) + ' hours'} ago` : ''}`, null, null, s.status === 'ok' ? 'info' : 'warn', 'Watchtower', 'Status', { verdict: String(s.status || '') })];
    items.forEach((i, k) => rows.push(factRow(`${s.id}#${k}`, String(i.title || 'A find'), num(i.usd), null, i.risk === 'high' ? 'bad' : i.risk === 'med' ? 'warn' : 'good', 'Market', `${i.risk === 'high' ? 'High' : i.risk === 'med' ? 'Medium' : 'Low'} risk`, { verdict: 'paper idea', detail: String(i.detail || ''), est: true })));
    const name = String(s.name || s.id);
    return { id: 'money:' + s.id, src: 'money', family: 'Money machine', label: `Money machine: ${name}`, unit: 'deal', rows, size: rows.length, gold: items.length > 0, good: items.length, bad: 0, open: 1, region: 'dodecanese', keywords: `money machine ${name} ${s.id} deal paper`,
      say: `${name}: ${items.length ? plural(items.length, 'paper idea') + ' today' : 'no ideas today'}. Estimates only, paper only: nothing is bought or sold.` };
  });
}
export function accountPoleis(home) {
  return arr(home && home.accounts).filter((a) => isObj(a) && !a.error).map((a, i) => {
    const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, id = String(a.id || 'acct' + i), name = String(a.name || id).slice(0, 30), rows = [];
    const room = num(ev.room), mll = num(ev.mll), today = num(pnl.today), pos = isObj(a.position) && Object.keys(a.position).length ? a.position : null, conn = isObj(a.conn) ? a.conn.connected : null;
    if (room != null) rows.push(factRow(id + '#room', `Drawdown left ${usd(room).replace('+', '')}${mll != null ? ` of ${usd(mll).replace('+', '')} max loss` : ''}`, room, null, mll && room / mll < .35 ? 'bad' : mll && room / mll < .6 ? 'warn' : 'good', 'Treasury', 'Drawdown'));
    if (num(ev.dll) != null) rows.push(factRow(id + '#dll', `Daily loss used ${usd(num(ev.dll_used) || 0).replace('+', '')} of ${usd(ev.dll).replace('+', '')}`, -(num(ev.dll_used) || 0), null, (num(ev.dll_used) || 0) > ev.dll * .5 ? 'warn' : 'good', 'Treasury', 'Daily loss'));
    rows.push(factRow(id + '#today', `Today ${today == null ? 'no figure yet' : usd(today)}`, today, null, today > 0 ? 'good' : today < 0 ? 'bad' : 'plain', 'Agora', 'Today'));
    rows.push(factRow(id + '#pos', pos ? `Open position: ${String(pos.side || '').toLowerCase() || 'open'}${pos.qty ? ' ' + pos.qty + ' micros' : ''}` : 'No open position', null, null, pos ? 'info' : 'plain', 'Agora', 'Position'));
    if (typeof conn === 'boolean') rows.push(factRow(id + '#conn', conn ? 'Connected' : 'Not connected', null, null, conn ? 'good' : 'warn', 'Watchtower', 'Connection'));
    return { id: 'accounts:' + id, src: 'accounts', family: 'Account', label: `Account: ${name}`, unit: 'fact', rows, size: rows.length, gold: today > 0, good: rows.filter((r) => r.tone === 'good').length, bad: rows.filter((r) => r.tone === 'bad').length, open: 0, region: 'attica',
      keywords: `account eval prop ${name} ${id}`, say: `${name}: ${room != null ? `drawdown left ${usd(room).replace('+', '')}${mll != null ? ` of ${usd(mll).replace('+', '')} max loss` : ''}, ` : ''}today ${today == null ? 'no figure yet' : usd(today)}.` };
  });
}
export function appPoleis() {
  const apps = allApps(), out = [];
  out.push({ id: 'apps:athens', src: 'apps', family: 'Capital', label: 'the capital: every Olympus app as a village', unit: 'village', rows: [], size: 60, gold: true, good: 1, bad: 0, open: 0, region: 'attica', capital: true, fixedName: 'Athens',
    keywords: 'athens capital apps olympus metropolis', say: `Athens is the capital: the hand-built city of ${apps.length} app villages. Enter it to walk its streets.` });
  for (const g of Object.keys(DISTRICT_NAME)) {
    const list = apps.filter((a) => a.group === g); if (!list.length) continue;
    const rows = list.map((a) => ({ id: 'app:' + a.id, title: `${a.name}: ${a.blurb}`, tone: a.temple ? 'info' : 'plain', verdict: a.temple ? 'temple' : 'hamlet', size: a.temple ? .6 : .25, net: null, perMonth: null, district: a.temple ? 'Temple quarter' : 'Outer quarter', village: a.name[0] < 'I' ? 'A to H' : a.name[0] < 'P' ? 'I to O' : 'P to Z', app: a.id, name: a.name }));
    out.push({ id: 'apps:' + g, src: 'apps', family: 'App district', label: `the ${DISTRICT_NAME[g]} apps`, unit: 'app', rows, size: rows.length, gold: false, good: rows.length, bad: 0, open: 0, region: 'attica', keywords: `apps ${g} ${DISTRICT_NAME[g]} ${list.map((a) => a.name).join(' ')}`,
      say: `${plural(rows.length, 'app')} of the ${DISTRICT_NAME[g]} district of Athens. Each house opens its app.` });
  }
  return out;
}

// ------------------------------------------------------------------ the world's list
/**
 * inp: { archive: { index, runs }, datacity, edges, suggestions, money, home } (any of them null) + fixture (the same shape, example data).
 * Returns { poleis, sources, counts, header }: poleis sorted by id (stable), each marked example when it came from the fixture.
 */
export function buildPoleis(inp = {}, fixture = {}) {
  const F = isObj(fixture) ? fixture : {}, parts = [], sources = [];
  const use = (key, real, fx, make) => {
    let list = real != null ? make(real) : [], example = false;
    if (!list.length && fx != null) { list = make(fx); example = true; }
    for (const p of list) { p.example = example; parts.push(p); }
    const k = SRC[key]; sources.push({ key, name: k.name, cities: list.length, houses: list.reduce((s, p) => s + p.rows.length, 0), example, ok: list.length > 0 });
  };
  const A = (a) => (isObj(a) && isObj(a.index) ? archivePoleis(a.index, arr(a.runs)) : []);
  use('archive', inp.archive, F.archive, A);
  use('datacity', inp.datacity, F.datacity, datacityPoleis);
  const kal = (keep) => (j) => kalshiPoleis(keep === 'kalshi' ? j : null, keep === 'suggest' ? j : null);
  use('kalshi', inp.edges, F.edges, kal('kalshi'));
  use('suggest', inp.suggestions, F.suggestions, kal('suggest'));
  use('money', inp.money, F.money, moneyPoleis);
  use('accounts', inp.home, F.home, accountPoleis);
  use('apps', {}, null, appPoleis);
  const seen = new Set(), poleis = [];
  for (const p of parts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) { if (seen.has(p.id)) continue; seen.add(p.id); p.share = p.size ? (p.good || 0) / Math.max(1, (p.good || 0) + (p.bad || 0) + (p.open || 0) * .5) : 0; poleis.push(p); }
  const live = sources.filter((s) => s.ok), houses = poleis.reduce((s, p) => s + p.rows.length, 0), example = poleis.filter((p) => p.example).length;
  setActivity(poleis);
  const st = (k) => poleis.filter((p) => p.activity.state === k).length;
  const counts = { cities: poleis.length, houses, sources: live.length, example, gold: poleis.filter((p) => p.gold).length, working: st('working'), quiet: st('quiet'), ruins: st('ruin'),
    rejectedRuns: poleis.filter((p) => p.src === 'archive').reduce((s, p) => s + p.bad, 0), desertRuns: poleis.filter((p) => p.ruin).reduce((s, p) => s + p.rows.length, 0), ghostTowns: poleis.filter((p) => p.ruin).length };
  const events = worldEvents(poleis, { datacity: isObj(inp.datacity) ? inp.datacity.built : null, kalshi: isObj(inp.edges) ? inp.edges.day : null });
  const builders = buildersOf(inp.builders, poleis);
  return { poleis, sources, counts, header: headerLine(counts), events, builders, buildersLabel: builders.length ? String((inp.builders && inp.builders.label) || 'Snapshot at build time') : '', buildersAsof: builders.length ? String((inp.builders && inp.builders.asof) || '') : '' };
}
const dayNum = (s) => { const m = /^(\d\d)-(\d\d)-(\d\d)$/.exec(String(s || '')); return m ? Date.UTC(2000 + +m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
const shortDay = (s) => dayName(s).replace(/ 20\d\d$/, '');
export const STATE_WORD = { working: 'At work', quiet: 'Quiet', ruin: 'Ruins' };
/**
 * what every city is working on, from its own rows: 'working' (something recent or alive), 'quiet', 'ruin' (everything rejected / dead).
 * Archive: recent = a run built in the last 7 days of the Archive (its newest build day is "today"). Sets p.activity = { state, doing, last }.
 */
export function setActivity(poleis) {
  let now = 0; for (const p of poleis) if (p.src === 'archive') for (const r of p.rows) { const d = dayNum(r.built); if (d > now) now = d; }
  for (const p of poleis) {
    let state = 'quiet', verb = 'holds', last = '', n = `${plural(p.rows.length, p.unit)}`;
    if (p.src === 'archive') {
      let lr = null, ld = -1; for (const r of p.rows) { const d = dayNum(r.built) || 0; if (d > ld) { ld = d; lr = r; } }
      const recent = now - ld <= 7; state = p.ruin ? 'ruin' : recent ? 'working' : 'quiet'; verb = p.ruin ? 'ruins of' : recent ? 'testing' : 'tested';
      if (lr) { last = `last: ${lr.verdict === 'open' ? 'still open' : lr.verdict}${lr.m && lr.m[2] != null ? ', PF ' + lr.m[2] : ''} (${shortDay(lr.built)})`; p.lastDay = ld; p.lastRow = lr; }
    } else if (p.src === 'datacity') {
      const rising = p.rows.filter((r) => r.tr === 'rising').length, noise = p.rows.filter((r) => r.verdict === 'grey').length;
      state = noise === p.rows.length ? 'ruin' : rising >= Math.max(2, p.rows.length * .4) ? 'working' : 'quiet'; verb = state === 'ruin' ? 'only noise in' : state === 'working' ? 'watching' : 'mapped'; last = `${rising} rising, ${noise} noise`;
    } else if (p.src === 'kalshi') {
      const r0 = p.rows[0] || {}, d7 = p.rows.find((r) => /#d7$/.test(r.id));
      state = r0.status === 'DEAD' ? 'ruin' : d7 || r0.status === 'HOLDING' || r0.status === 'GROWING' ? 'working' : 'quiet'; verb = state === 'ruin' ? 'stopped' : state === 'working' ? 'betting' : 'collecting'; n = plural(p.weight || 0, 'bet');
      last = `${r0.verdict || 'no advice'}, ${usd(r0.net, 2)} in total`;
    } else if (p.src === 'suggest') { state = /: stop$/.test(p.label) ? 'ruin' : /: keep$/.test(p.label) ? 'working' : 'quiet'; verb = 'weighing'; last = usd(p.rows.reduce((s, r) => s + (r.net || 0), 0), 2) + ' in total'; }
    else if (p.src === 'money') { state = p.rows.length > 1 ? 'working' : 'quiet'; verb = state === 'working' ? 'scouting' : 'resting'; last = p.rows.length > 1 ? `latest: ${clip(p.rows[1].title, 40)}` : 'no ideas today'; }
    else if (p.src === 'accounts') { const pos = p.rows.find((r) => /#pos$/.test(r.id)), td = p.rows.find((r) => /#today$/.test(r.id)); state = pos && pos.tone === 'info' ? 'working' : 'quiet'; verb = state === 'working' ? 'in a trade' : 'flat'; last = td ? td.title.toLowerCase() : ''; }
    else { state = p.capital ? 'working' : 'quiet'; verb = p.capital ? 'the capital' : 'home of'; last = p.capital ? 'builders at work' : ''; }
    const what = p.label.replace(/^(Kalshi [a-z ]+|Money machine|Account): /, '').replace(/ \(rejected.*\)$/, '');
    p.activity = { state, verb, last, doing: p.capital ? `the capital · ${last}` : `${verb} ${what} · ${n}${last ? ' · ' + last : ''}` };
  }
  return now;
}
/** the latest things that happened in the world, newest first (at most n): the newest Archive runs (two per city at most) and the newest file of each other source */
export function worldEvents(poleis, extra = {}, n = 12) {
  const ev = [];
  for (const p of poleis) if (p.src === 'archive') { const top = p.rows.filter((r) => dayNum(r.built)).sort((a, b) => dayNum(b.built) - dayNum(a.built)).slice(0, 2);
    for (const r of top) ev.push({ day: dayNum(r.built), when: shortDay(r.built), polis: p.id, tone: r.tone, text: `${clip(r.title, 64)}: ${r.verdict === 'open' ? 'still open' : r.verdict}${r.net != null ? `, ${usd(r.net)} (${usd(r.perMonth)} a month)` : ''}` }); }
  ev.sort((a, b) => b.day - a.day || (a.polis < b.polis ? -1 : a.polis > b.polis ? 1 : 0) || (a.text < b.text ? -1 : 1));
  const out = ev.slice(0, Math.max(0, n - 2));
  const dc = poleis.filter((p) => p.src === 'datacity'), k = poleis.filter((p) => p.src === 'kalshi').sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
  if (dc.length) out.push({ day: 0, when: extra.datacity ? String(extra.datacity).slice(5, 10) : 'latest', polis: dc[0].id, tone: 'info', text: `Data City rebuilt: ${plural(dc.reduce((s, p) => s + p.rows.length, 0), 'tested combo')} in ${dc.length} cities` });
  if (k) out.push({ day: 0, when: extra.kalshi ? String(extra.kalshi).slice(5, 10) : 'latest', polis: k.id, tone: k.rows[0].tone, text: `Kalshi ${k.label.replace(/^Kalshi [a-z ]+: /, '')}: ${k.rows[0].title}` });
  return out.slice(0, n);
}
/** the build agents (a snapshot file) -> a caravan: each builder travels to the city it is building. target = a polis id, or null for a new site. */
export function buildersOf(json, poleis) {
  const apps = allApps(), big = (f) => poleis.filter(f).sort((a, b) => (b.weight || b.size) - (a.weight || a.size))[0];
  return arr(json && json.agents).filter((a) => isObj(a) && a.name).slice(0, 16).map((a, i) => {
    const name = String(a.name).slice(0, 30), area = String(a.area || ''), low = name.toLowerCase(), app = apps.find((x) => low.split(/\s+/).some((w) => w.length > 3 && (x.id === w || x.name.toLowerCase() === w)));
    let target = null, site = 'a new building site outside Athens';
    if (area === 'jarvis') { target = 'apps:athens'; site = 'the Jarvis temple in Athens'; }
    else if (/kalshi/.test(low)) { const k = big((p) => p.src === 'kalshi'); if (k) { target = k.id; site = '{city}, the biggest Kalshi city'; } }
    else if (area === 'trading') { const k = big((p) => p.src === 'archive' && p.family === 'LIT headquarters' && !p.ruin); if (k) { target = k.id; site = '{city}, the LIT headquarters'; } }
    else if (area === 'cities') { target = 'apps:athens'; site = 'Hellas itself, from the walls of Athens'; }
    else if (app) { target = 'apps:' + app.group; site = `the ${app.name} house in ${DISTRICT_NAME[app.group] || 'Athens'}`; }
    else if (area === 'design' || area === 'quality') { target = 'apps:athens'; site = 'every street of Athens'; }
    const short = String(a.branch || '').replace(/^worktree-agent-/, ''), slug = low.replace(/[^a-z0-9]+/g, '-');
    return { i, name, job: String(a.job || '').slice(0, 120), area, target, site, newSite: !target, pid: 'builder:' + (short || slug), alt: short ? ['builder:' + short.slice(0, 8), 'builder:' + short.slice(0, 7), 'builder:worktree-agent-' + short, 'builder:' + slug] : [] };
  });
}
// ------------------------------------------------------------------ the people you can talk to (docs/PERSONA_API.md; the own-chat answers)
const NO_ORDERS = 'I cannot place orders: paper and suggestions only.';
function sixAnswers(p, rows, scope) {
  const A = p.activity || { state: 'quiet', doing: p.label, last: '' }, n = rows.length, unit = p.unit, isRun = p.src === 'archive';
  const withNet = rows.filter((r) => r.net != null), best = withNet.slice().sort((a, b) => b.net - a.net)[0], good = rows.filter((r) => r.tone === 'good'), bad = rows.filter((r) => r.tone === 'bad'), open = rows.filter((r) => r.tone === 'warn');
  const money = (r) => (r.net == null ? 'no money figure' : isRun ? `${usd(r.net)} after costs in 2026 (${usd(r.perMonth)} per month)` : p.src === 'datacity' ? `${usd(r.net, 1)} per trade per micro after costs` : `${usd(r.net, 2)} in total`);
  const lr = isRun ? rows.slice().sort((a, b) => (dayNum(b.built) || 0) - (dayNum(a.built) || 0))[0] : rows[0];
  const why = (r) => (r && r.note ? ` The note says: ${clip(r.note, 150).replace(/[\s,;:(]+$/, '').replace(/([^.…!?])$/, '$1…')}` : '');
  const ruin = A.state === 'ruin';
  return [
    [`What is ${scope} working on?`, ruin ? `Nothing any more. These are the ruins of ${p.label.replace(/ \(rejected.*\)$/, '')}: ${plural(n, unit)}, every one rejected.` : A.state === 'working' ? `We are at work: ${A.doing}.` : `It is quiet here: ${A.doing}.`],
    ['What was the last result?', lr ? `${clip(lr.title, 90)}: ${lr.verdict ? (V_WORD[lr.verdict] || lr.verdict) + ', ' : ''}${money(lr)}${isRun && lr.m ? `, profit factor ${lr.m[2]}, built ${dayName(lr.built)}` : ''}. History, not a forecast.` : 'There is no result here yet.'],
    ['What did you learn?', good.length ? `${plural(good.length, unit)} of ${n} ${isRun ? 'were adopted' : 'came out good'}. The best: ${clip((best || good[0]).title, 80)}, ${money(best || good[0])}.` : best ? `Nothing was adopted here. The best number was ${clip(best.title, 80)}: ${money(best)}, but it did not pass the checks.` : 'Nothing I can put a number on.'],
    ['What failed here?', bad.length ? `${plural(bad.length, unit)} of ${n} ${isRun ? 'were rejected' : 'lost money or were stopped'}. ${isRun ? 'A run is rejected when it does not beat the live baseline in 2026 AND in 2021-25, or trades too rarely. ' : ''}Example: ${clip(bad[0].title, 80)}, ${money(bad[0])}.${why(bad[0])}` : 'Nothing failed in the rows I keep.'],
    ['What next?', ruin ? 'Nothing: this idea is closed. Do not test it again without a new idea.' : open.length ? `${plural(open.length, unit)} still ${open.length === 1 ? 'waits' : 'wait'} for a verdict. ${NO_ORDERS}` : `Nothing is planned here. ${NO_ORDERS}`],
    ['How many houses, and why?', `${plural(n, 'house')}: one for every ${unit}. ${isRun ? 'The districts are the verdicts (adopted, open, rejected) and the villages are the build days.' : 'The districts and villages group rows that belong together.'}${p.example ? ' These are example rows: the real file was not found.' : ''}`],
  ];
}
/** the keeper stands at the gate of a polis and speaks for the whole city */
/** why a ruined city fell, in plain words, from its own rows only (how many failed, the clearest failure with its money, its note) */
export function whyFell(p) {
  const rows = p.rows || [], n = rows.length, bad = rows.filter((r) => r.tone === 'bad'), isRun = p.src === 'archive', withNet = bad.filter((r) => r.net != null).sort((a, b) => a.net - b.net), worst = withNet[0] || bad[0];
  if (!n) return 'I keep nothing but stones: no rows were left here.';
  const money = (r) => (r.net == null ? '' : isRun ? ` (${usd(r.net)} after costs in 2026)` : ` (${usd(r.net, 2)})`), note = worst && worst.note ? ` The note says: ${clip(worst.note, 140).replace(/[\s,;:(]+$/, '')}.` : '';
  const rule = isRun ? ' A run is only kept when it beats the live strategy in 2026 AND in 2021-25 and still trades 2 to 4 times a week.' : '';
  return `${plural(bad.length || n, p.unit || 'row')} of ${n} ${isRun ? 'were rejected' : 'did not work'}.${rule}${worst ? ` The clearest case: ${clip(worst.title, 80)}${/\$/.test(worst.title) ? '' : money(worst)}.` : ''}${note} So the idea was closed; it stays here so nobody builds it again without a new idea.`;
}
/** a big number in this polis (a run adopted in the last 2 days): the crowd gathers at the agora and cheers when you arrive. From the rows only; example rows never count. */
export function bigNews(p, now = Date.now()) {
  if (!p || p.example || p.src !== 'archive') return null; const today = Math.floor(now / 864e5);
  const fresh = (p.rows || []).filter((r) => r.verdict === 'adopted' && dayNum(r.built) != null && today - dayNum(r.built) <= 2 && today - dayNum(r.built) >= 0);
  return fresh.length ? { n: fresh.length, text: `${plural(fresh.length, 'new run')} adopted here: ${clip(fresh[0].title, 70)}` } : null;
}
/** the opener's real fact (scene direction 2026-11-11): the last result of this place, in a whole sentence with its money, from the same rows as the answers */
function lastNews(qa) { const a = qa && qa[1] ? String(qa[1][1]) : ''; return !a || /^There is no result/.test(a) ? 'It is quiet here today; nothing new on file.' : 'The last result here: ' + a.replace(/ History, not a forecast\.$/, '').replace(/: no money figure\./, '.') + ' That is history, not a forecast.'; }
export function keeperPerson(p) {
  const name = greekName('keeper:' + p.id), ruin = p.activity && p.activity.state === 'ruin', qa = sixAnswers(p, p.rows, 'this city');
  return { id: 'keeper:' + p.id, alt: [], kind: 'keeper', name: `${name}, keeper of ${p.name || p.label}`, short: name, title: `${ruin ? 'Keeper of the ruins' : 'Keeper of the gate'} · ${p.label}`, polis: p.id, mood: ruin ? 'sad' : 'calm',
    hello: ruin ? `I am ${name}. I keep the ruins of ${p.name || p.label}. ${whyFell(p)}` : `Welcome! I am ${name}, keeper of ${p.name || p.label}. ${lastNews(qa)} Ask me what we do here.`, qa: ruin ? [['Why did it fall?', whyFell(p)]].concat(qa.slice(0, 5)) : qa };
}
/** a townsperson speaks for the village block it walks around */
export function townsPerson(p, village, rows, k = 0) {
  const name = greekName(`towns:${p.id}:${village.idx}:${k}`);
  const qa = sixAnswers(p, rows, 'this village');
  return { id: `towns:${p.id}:${village.idx}`, alt: [], kind: 'villager', name: `${name} of ${village.name}`, short: name, title: `Lives in ${village.name}, ${p.name}`, polis: p.id, hello: `Hello! I am ${name}, from the ${village.name} street of ${p.name}. ${lastNews(qa)} Ask me about my street.`, qa };
}
/** a builder of the caravan: only the snapshot is known, and it says so */
export function builderPerson(b, world) {
  const snap = `${world.buildersLabel || 'Snapshot at build time'}${world.buildersAsof ? ' (' + world.buildersAsof.slice(0, 16).replace('T', ' ') + ' UTC)' : ''}`, unknown = `I am a snapshot taken when this page was built, so I cannot tell you that. Ergasterion shows the workers live.`;
  return { id: b.pid, alt: b.alt || [], kind: 'builder', name: b.name, short: b.name, title: `Builder · on the road to ${b.site}`, builder: b.i, hello: `I am the ${b.name} builder. Ask me what I am building.`, fine: snap, qa: [
    ['What are you working on?', `${b.job}.`], ['Where are you going?', `To ${b.site}${b.newSite ? ': it is not built yet, so I carry the first stones' : ''}.`], ['What was the last result?', unknown], ['What did you learn?', unknown],
    ['What next?', `I finish this job and report to the lead. ${NO_ORDERS}`], ['How many builders are there, and why?', `${world.builders.length} builders were at work when this page was built: one for each job the owner asked for that night.`]] };
}
export const headerLine = (c) => `${plural(c.cities, 'city').replace('citys', 'cities')}, ${plural(c.houses, 'house')}, from ${plural(c.sources, 'data source')}${c.example ? `; ${plural(c.example, 'city').replace('citys', 'cities')} on example data` : ''}`;

/** the plain-words card of one house: [title, lines[], link] */
export function houseCard(polis, row) {
  const S = SRC[polis.src] || SRC.archive, lines = [];
  if (polis.src === 'archive') {
    const m = row.m, o = row.o;
    lines.push(['What was tested', row.title]);
    lines.push(['2026 result', m ? `${usd(m[3])} after costs, ${usd(m[4])} per month. ${m[0]} trades, ${m[1]} a week, profit factor ${m[2]}.` : 'No 2026 figures stored for this run.']);
    if (o) lines.push(['2021 to 2025', `${usd(o[3])} after costs, ${usd(o[4])} per month. ${o[0]} trades, profit factor ${o[2]}.`]);
    if (m && (m[5] || m[6])) lines.push(['Eval speed', `Passed within 10 sessions ${m[5]}% of the time, failed ${m[6]}%.`]);
    lines.push(['Verdict', `${V_WORD[row.verdict] || row.verdict}${row.status && row.status !== row.verdict ? ` (${row.status.replace('-', ' ')})` : ''}, built ${dayName(row.built)}.`]);
    if (row.note) lines.push(['Note', row.note]);
    lines.push(['', 'History, not a forecast. 1 micro unless the note says otherwise.']);
  } else if (polis.src === 'datacity') {
    lines.push(['What was tested', row.title]);
    lines.push(['Result', `${usd(row.net, 1)} per trade per micro after costs${row.perMonth != null ? `, about ${usd(row.perMonth)} per month per micro (estimate: ${row.tpw} trades a week)` : ''}. ${row.n != null ? row.n + ' trades' : ''}${row.w != null ? `, ${row.w}% won` : ''}.`]);
    if (row.e26 != null) lines.push(['2026 alone', `${usd(row.e26, 1)} per trade per micro over ${row.n26} trades.`]);
    if (row.eo != null) lines.push(['2021 to 2025', `${usd(row.eo, 1)} per trade per micro over ${row.no} trades.`]);
    lines.push(['Verdict', `${row.verdict[0].toUpperCase() + row.verdict.slice(1)}: ${CLS_SAY[row.verdict] || 'unrated'}. Trend: ${row.tr || 'unknown'}.`]);
    lines.push(['', 'A tested idea, not a trade signal. History, not a forecast.']);
  } else if (polis.src === 'kalshi' || polis.src === 'suggest') {
    lines.push(['What it is', row.title]);
    lines.push(['Money', `${usd(row.net, 2)} in total${row.n != null ? ` over ${plural(row.n, 'settled bet')}` : ''}${row.roi != null ? `, ${row.roi}% return on the stakes` : ''}. No per-month figure: the sample is too short.`]);
    if (row.rule) lines.push(['Suggested rule', row.rule]);
    if (row.verdict) lines.push(['Verdict', row.verdict + (row.small ? ' (small sample: not proven)' : '')]);
    lines.push(['', 'Suggestions only: nothing here places or changes a bet.']);
  } else if (polis.src === 'money') {
    lines.push(['What it is', row.title]); if (row.detail) lines.push(['Detail', row.detail]);
    if (row.net != null) lines.push(['Money', `${usd(row.net)} (estimate, one time, not per month).`]);
    lines.push(['', 'Paper only: an idea to look at, nothing is bought or sold.']);
  } else if (polis.src === 'accounts') {
    lines.push(['Fact', row.title]); lines.push(['', polis.example ? 'Example numbers, not your account.' : 'Read from the published account file. Read only.']);
  } else { lines.push(['App', row.title]); lines.push(['', 'One of the Olympus apps: a village of Athens.']); }
  if (polis.example && polis.src !== 'accounts') lines.push(['', 'Example data: the real file was not found.']);
  const link = polis.src === 'apps' && row.app ? { href: `../${row.app}/`, text: `Open ${row.name}` } : { href: S.app, text: S.open };
  return { title: row.title, lines, link, tone: row.tone };
}

/** search: "find VWAP", "find Kalshi 90c" -> poleis, best first. Every word must be found in the polis (its name, label, family, rows). */
export function searchPoleis(world, query, limit = 8) {
  const words = String(query || '').toLowerCase().replace(/^\s*(find|show|go to|fly to)\s+/, '').split(/[^a-z0-9$%.+-]+/).filter((w) => w.length > 1 || /\d/.test(w));
  if (!words.length) return [];
  const out = [];
  for (const p of world.poleis) {
    if (!p._hay) { p._head = bandAlias(`${p.name} ${p.label} ${p.family} ${p.regionName || ''}`).toLowerCase(); p._hay = `${p.keywords || ''} ${p.rows.slice(0, 200).map((r) => r.title).join(' ')}`.toLowerCase(); }
    let score = 0, all = true;
    for (const w of words) { const a = p._head.includes(w), b = !a && p._hay.includes(w); if (a) score += 4; else if (b) score += 1; else { all = false; break; } }
    if (all) out.push([score + Math.min(1, p.size / 400) + words.filter((w) => /^\d+c$/.test(w) && p._head.includes(' ' + w.slice(0, -1) + '-')).length, p]);
  }
  return out.sort((a, b) => b[0] - a[0] || (a[1].id < b[1].id ? -1 : 1)).slice(0, limit).map((e) => e[1]);
}

// ------------------------------------------------------------------ loading (the only part that reads files)
async function getJSON(url, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { cache: 'no-cache', signal: ctl ? ctl.signal : undefined }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { if (t) clearTimeout(t); }
}
export const FILES = { archive: '../archive/index.json', datacity: '../datacity/city.json', edges: '../kalshicity/edges.json', suggestions: '../kalshicity/suggestions.json', money: '../money/index.json', home: '../home.json', fixture: './hellas-fixture.json', builders: './hellas-builders.json' };
/** read every source (each one optional). demo = true skips the real files: example data only. onStep(text) tells the loading line. */
export async function loadSources(base, { demo = false, onStep = () => {} } = {}) {
  const u = (p) => new URL(p, base).href, get = (k, ms = 9000) => (demo ? Promise.resolve(null) : getJSON(u(FILES[k]), ms));
  onStep('Reading the Archive, Data City and Kalshi');
  const archive = (async () => {
    const index = await get('archive', 15000); if (!isObj(index) || !Array.isArray(index.runs)) return null;
    const shards = await Promise.all(arr(index.shards).map((s) => getJSON(u('../archive/' + String(s).replace(/[^\w.-]/g, '')), 15000)));
    return { index, runs: index.runs.concat(...shards.map((s) => arr(s && s.runs))), missing: shards.filter((s) => !s).length };
  })();
  const slim = (c) => (isObj(c) && Array.isArray(c.buildings) ? { sections: c.sections, built: c.built, buildings: c.buildings.map((b) => ({ id: b.id, d: b.d, lab: b.lab, cls: b.cls, fdr: b.fdr, e: b.e, w: b.w, n: b.n, tpw: b.tpw, tr: b.tr, e26: b.e26, n26: b.n26, eo: b.eo, no: b.no })) } : null);
  const [a, dc, edges, suggestions, money, home, fixture, builders] = await Promise.all([archive, get('datacity', 25000).then(slim), get('edges'), get('suggestions'), get('money', 6000), get('home', 6000), getJSON(u(FILES.fixture), 9000), getJSON(u(FILES.builders), 6000)]);
  return { inp: { builders: isObj(builders) ? builders : null, archive: a, datacity: dc, edges: isObj(edges) && Array.isArray(edges.edges) && edges.edges.length ? edges : null, suggestions: isObj(suggestions) && Array.isArray(suggestions.items) && suggestions.items.length ? suggestions : null,
    money: isObj(money) && Array.isArray(money.streams) && money.streams.length ? money : null, home: isObj(home) && Array.isArray(home.accounts) && home.accounts.length ? home : null }, fixture: isObj(fixture) ? fixture : {} };
}
export { hash32 };
