// MINT core (pure maths and words, node-tested): the five money streams -> cards, one honest combined ESTIMATE with a range, "what to do today" (max 3),
// the pillar heights, the history line and the Jarvis card. No document / window / fetch here. Everything money is an ESTIMATE, never income.
export const IDS = ['chrysos', 'mercury', 'sibyl', 'oikos', 'arbiter'];
export const NAMES = { chrysos: 'Chrysos', mercury: 'Mercury', sibyl: 'Sibyl', oikos: 'Oikos', arbiter: 'Arbiter' };
export const ROLES = { chrysos: 'Prop-firm eval and payout planner', mercury: 'Prop-firm and tool deals', sibyl: 'Kalshi study: paper-worthy bets (paper)', oikos: 'Household money leaks from your Ledger', arbiter: 'Spread and funding ideas (paper)' };
export const STATUS = { ok: { label: 'Live', tone: 'ok' }, stale: { label: 'Old data', tone: 'warn' }, sample: { label: 'Example', tone: 'info' }, none: { label: 'No data', tone: '' } };
export const RANGE = { ok: [0.3, 1.5], stale: [0, 1.2], sample: [0, 2], none: [0, 0] };
export const STALE_MIN = 6 * 60;
export const HIST_KEEP = 60;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 240);

export function money(v) { if (!isNum(v)) return '-'; const r = Math.round(Math.abs(v)); return (v < 0 ? '-$' : '$') + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function perMonth(v) { return isNum(v) ? money(v) + ' a month' : 'no estimate'; }
export function rangeText(lo, hi) {
  if (!(isNum(lo) && isNum(hi))) return 'no range yet';
  return lo < 0 ? `a loss of ${money(-lo)} a month to ${money(hi)} a month` : `${money(lo)} to ${money(hi)} a month`;       // a negative low end is a LOSS in words, never "-$42 to ..."
}
/** the worst case in plain words: a negative low end is said as a loss */
export function worstText(lo) { return !isNum(lo) ? 'no worst case yet' : lo < 0 ? `Worst case: you could lose about ${money(-lo)} a month.` : `Worst case: about ${money(lo)} a month.`; }
/** the range bar in percent of the bar's width. The bar spans the smaller of the low end and 0 up to the larger of the high end and the estimate; zero is marked when the low end is a loss. */
export function rangeBar(lo, base, hi) {
  if (!isNum(lo) || !isNum(hi)) return { left: 0, width: 0, mark: 0, zero: null, neg: false };
  const b = isNum(base) ? base : (lo + hi) / 2, min = Math.min(lo, 0), max = Math.max(hi, b, 0.01), span = max - min || 1, pc = (v) => Math.max(0, Math.min(100, Math.round(((v - min) / span) * 100)));
  return { left: pc(lo), width: Math.max(1, pc(hi) - pc(lo)), mark: pc(b), zero: lo < 0 ? pc(0) : null, neg: lo < 0 };
}
export function ageText(min) {
  if (!isNum(min) || min < 0) return 'no date';
  if (min < 2) return 'just now';
  if (min < 90) return `${Math.round(min)} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

/** one stream (index row or a fixture row) -> a safe card; unknown or missing -> a "no data" card, never throws */
export function normStream(id, raw, nowMs) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const head = typeof r.headline === 'string' ? r.headline : txt(r.headline && r.headline.text);
  let status = ['ok', 'stale', 'sample'].includes(r.status) ? r.status : head ? 'stale' : 'none';
  let age = isNum(r.age_min) ? r.age_min : null;
  if (age == null && r.asof && isNum(nowMs)) { const t = Date.parse(r.asof); if (Number.isFinite(t)) age = Math.max(0, Math.round((nowMs - t) / 60000)); }
  if (status === 'ok' && age != null && age > STALE_MIN) status = 'stale';
  const um = r.usd_month && typeof r.usd_month === 'object' ? r.usd_month : { base: r.headline && r.headline.usd_month };
  const base = isNum(um.base) ? um.base : null, rg = RANGE[status] || RANGE.stale;
  const lo = isNum(um.low) ? um.low : base == null ? null : base * rg[0], hi = isNum(um.high) ? um.high : base == null ? null : base * rg[1];
  const items = (Array.isArray(r.items) ? r.items : []).filter((i) => i && txt(i.title)).slice(0, 3).map((i) => ({ title: txt(i.title, 90), detail: txt(i.detail, 260), usd: isNum(i.usd) ? i.usd : null, score: isNum(i.score) ? Math.max(0, Math.min(100, Math.round(i.score))) : 0, risk: ['low', 'med', 'high'].includes(i.risk) ? i.risk : 'med', expires: typeof i.expires === 'string' ? i.expires : '' }));
  return { id, name: NAMES[id] || txt(id), role: txt(r.role) || ROLES[id] || '', status, age, headline: head || 'No data yet for this stream.', low: lo, base, high: hi, items, notes: (Array.isArray(r.notes) ? r.notes : []).map((n) => txt(n, 200)).filter(Boolean).slice(0, 3), error: r.error ? txt(r.error, 120) : '' };
}

/** the index (or the fixture) -> the five streams in a fixed order, always five */
export function streamsFrom(idx, nowMs) {
  const rows = idx && Array.isArray(idx.streams) ? idx.streams : [];
  return IDS.map((id) => normStream(id, rows.find((s) => s && s.id === id), nowMs));
}

/** the combined ESTIMATE: sum of the streams' low / base / high (never one made-up number) */
export function combine(streams) {
  let lo = 0, base = 0, hi = 0, n = 0, real = 0, sample = 0, stale = 0;
  for (const s of streams) {
    if (s.base == null) continue;
    n++; lo += s.low; base += s.base; hi += s.high;
    if (s.status === 'ok') real += s.base;
  }
  for (const s of streams) { if (s.status === 'sample') sample++; if (s.status === 'stale') stale++; }
  const allSample = streams.length > 0 && sample === streams.length;
  const text = n === 0 ? 'No estimate yet: no stream has reported a number.' : lo < 0 ? `About ${money(base)} a month, but in the worst case you could lose about ${money(-lo)} a month. At best about ${money(hi)} a month.` : `About ${money(base)} a month, but it could be anywhere from ${money(lo)} to ${money(hi)}.`;
  const why = allSample ? 'These are example numbers, not real finds.' : sample ? `${sample} of 5 streams still show examples, not real finds.` : stale ? `${stale} stream${stale > 1 ? 's' : ''} have old data.` : 'Every stream is fresh.';
  return { low: lo, base, high: hi, n, real, sample, stale, allSample, text, why, tone: allSample ? 'info' : stale || sample ? 'warn' : 'ok' };
}

const RISK_W = { low: 1, med: 0.75, high: 0.5 };
/** what to do today: at most 3 things. Old data first (one line each), then the best items by score x risk weight (low risk first). */
export function todo(streams, max) {
  const cap = Math.min(3, max || 3), out = [];
  const stale = streams.filter((s) => s.status === 'stale');
  if (stale.length) out.push({ kind: 'refresh', stream: stale[0].id, title: `Refresh ${stale.map((s) => s.name).join(' and ')}`, why: `Data is ${ageText(stale[0].age)}. Double-click tools/bat/RUN_MONEY.bat on the PC, then reopen this page.`, usd: null, risk: 'low' });
  const pool = [];
  for (const s of streams) { for (const i of s.items) { const w = i.score * (RISK_W[i.risk] || 0.75) + Math.min(10, (i.usd || 0) / 10); if (i.score >= 40) pool.push({ w, kind: 'task', stream: s.id, title: i.title, why: i.detail, usd: i.usd, risk: i.risk, sample: s.status === 'sample' }); } }
  pool.sort((a, b) => b.w - a.w);
  for (const p of pool) { if (out.length >= cap) break; out.push(p); }
  if (!out.length) out.push({ kind: 'none', stream: null, title: 'Nothing to do today', why: 'No stream found a task worth your time. Quiet days are normal.', usd: null, risk: 'low' });
  return out.slice(0, cap);
}

/** pillar heights 0..1, linear in the base estimate (a stream with no number gets a thin stub so it is still visible) */
export function pillars(streams) {
  const top = Math.max(50, ...streams.map((s) => (s.base == null ? 0 : s.base)));
  return streams.map((s) => ({ id: s.id, name: s.name, usd: s.base, status: s.status, h: s.base == null ? 0.04 : Math.max(0.06, Math.min(1, s.base / top)) }));
}

/** history: append {t, base} (one point per 10 minutes at most, last 60) -> new array; junk in -> clean array out */
export function pushPoint(hist, t, base) {
  const h = (Array.isArray(hist) ? hist : []).filter((p) => p && isNum(p.t) && isNum(p.base)).slice(-HIST_KEEP);
  if (!isNum(t) || !isNum(base)) return h;
  if (h.length && t - h[h.length - 1].t < 600000) h[h.length - 1] = { t: h[h.length - 1].t, base };
  else h.push({ t, base });
  return h.slice(-HIST_KEEP);
}
/** points -> an SVG path in a w x h box; fewer than 2 points -> '' */
export function sparkPath(hist, w, h) {
  if (!Array.isArray(hist) || hist.length < 2) return '';
  const vals = hist.map((p) => p.base), lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  return hist.map((p, i) => `${i ? 'L' : 'M'}${(2 + (i / (hist.length - 1)) * (w - 4)).toFixed(1)} ${(h - 3 - ((p.base - lo) / span) * (h - 6)).toFixed(1)}`).join(' ');
}
export function histText(hist) {
  if (!Array.isArray(hist) || hist.length < 2) return 'The line starts after your second visit. It is saved on this phone only.';
  const a = hist[0].base, b = hist[hist.length - 1].base, d = b - a;
  return `${hist.length} visits saved on this phone: ${money(a)} then, ${money(b)} now (${d === 0 ? 'no change' : (d > 0 ? 'up ' : 'down ') + money(Math.abs(d))}). An estimate moving is not income moving.`;
}

export function jarvisCard(streams, nowMs) {
  const c = combine(streams), t = todo(streams, 3);
  return { v: 1, name: 'Mint', status: { level: c.allSample ? 'off' : c.tone === 'ok' ? 'ok' : 'warn', label: c.allSample ? 'Example numbers' : c.stale ? 'Old data' : 'Estimate' },
    kpis: [{ label: 'Estimate / month', value: money(c.base) }, { label: 'Range', value: c.low < 0 ? `${money(c.low)} to ${money(c.high)}` : `${money(c.low)}-${money(c.high)}` }, { label: 'Streams', value: String(streams.filter((s) => s.status === 'ok').length) + ' live' }],
    lines: t.slice(0, 2).map((x) => txt(x.title, 110)), t: Math.floor((isNum(nowMs) ? nowMs : 0) / 1000), open: '#', theme: '#14110e', stale_after: 21600 };
}
