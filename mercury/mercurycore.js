// MERCURY core (pure, no DOM, no network): turns the scanner's mercury.json into what the page shows. Node-tested by tests/test_mercury_page.py.
// The data contract is in tools/money/mercury.py (items: title, detail, usd, score, risk, kind, expires, code, new, affects_me, url).

export const DAY = 86400000;

/** $ with cents only when they matter: money(27.54) -> "$27.54", money(73) -> "$73" */
export function money(v) {
  if (v == null || !Number.isFinite(Number(v))) return 'n/a';
  const n = Math.abs(Number(v)), s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return (Number(v) < 0 ? '-$' : '$') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** whole days from the day of `now` to the day of `expires` (YYYY-MM-DD, compared as UTC dates); null when unknown or malformed */
export function daysLeft(expires, now) {
  if (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return null;
  const e = Date.parse(expires + 'T00:00:00Z'), n = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(e) || !Number.isFinite(n.getTime())) return null;
  const t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  return Math.round((e - t) / DAY);
}

export function whenText(days) {
  if (days == null) return 'No end date on the page';
  if (days < 0) return 'Over';
  if (days === 0) return 'Ends today';
  if (days === 1) return 'Ends tomorrow';
  return 'Ends in ' + days + ' days';
}

export const RISK_WORD = { low: 'Low risk', med: 'Medium risk', high: 'High risk' };
export const KIND_WORD = { deal: 'Sale', reset: 'Free reset', rule: 'Rule change' };

/** age of the scan in hours (null when asof is missing / bad) */
export function ageHours(asof, now) {
  const a = Date.parse(asof), n = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(a) && Number.isFinite(n) ? Math.max(0, (n - a) / 3600000) : null;
}

export function ageText(h) {
  if (h == null) return 'Check time unknown';
  if (h < 1) return 'Checked a few minutes ago';
  if (h < 36) return 'Checked ' + Math.round(h) + ' hour' + (Math.round(h) === 1 ? '' : 's') + ' ago';
  return 'Checked ' + Math.round(h / 24) + ' days ago';
}

const str = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n || 400);
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** a clean copy of one scanner row; anything odd is dropped or made safe (the page only ever shows these fields) */
export function normItem(r) {
  if (!r || typeof r !== 'object') return null;
  const kind = ['deal', 'reset', 'rule'].includes(r.kind) ? r.kind : 'deal', risk = ['low', 'med', 'high'].includes(r.risk) ? r.risk : 'med';
  const title = str(r.title, 120);
  if (!title) return null;
  const sc = num(r.score), url = typeof r.url === 'string' && /^https:\/\/[^\s]+$/.test(r.url) ? r.url : null;
  return { id: str(r.id, 60) || title, kind, title, detail: str(r.detail, 600), usd: num(r.usd), score: sc == null ? 0 : Math.max(0, Math.min(100, Math.round(sc))), risk,
    firm: str(r.firm, 60), page: str(r.page, 30), expires: /^\d{4}-\d{2}-\d{2}$/.test(r.expires || '') ? r.expires : null, code: /^[A-Za-z0-9]{3,20}$/.test(r.code || '') ? r.code : null,
    pct: num(r.pct), isNew: !!r.new, affects: !!r.affects_me, url };
}

/** the page model: { ok, status, headline, asof, pick, deals, soon, rulesMine, rulesOther, pages, notes, tags } */
export function buildModel(doc, now) {
  now = now instanceof Date ? now : new Date(now || Date.now());
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.items)) return { ok: false };
  const items = doc.items.map(normItem).filter(Boolean);
  const live = items.filter((i) => { const d = daysLeft(i.expires, now); return d == null || d >= 0; });
  const withDays = live.map((i) => ({ ...i, days: daysLeft(i.expires, now) }));
  const deals = withDays.filter((i) => i.kind !== 'rule').sort((a, b) => b.score - a.score || (b.usd || 0) - (a.usd || 0));
  const soon = withDays.filter((i) => i.kind !== 'rule' && i.days != null && i.days <= 7).sort((a, b) => a.days - b.days || b.score - a.score);
  const rulesMine = withDays.filter((i) => i.kind === 'rule' && i.affects).sort((a, b) => b.score - a.score);
  const rulesOther = withDays.filter((i) => i.kind === 'rule' && !i.affects);
  const p = doc.pick && typeof doc.pick === 'object' ? doc.pick : null;
  const pick = p ? { buy: !!p.buy, title: str(p.title, 160), why: str(p.why, 500), usd: num(p.usd), buyBy: /^\d{4}-\d{2}-\d{2}$/.test(p.buy_by || '') ? p.buy_by : null } : { buy: false, title: 'Nothing worth buying now', why: 'No deal scores high enough. Waiting costs nothing.', usd: null, buyBy: null };
  const h = doc.headline && typeof doc.headline === 'object' ? doc.headline : {};
  const st = ['ok', 'stale', 'sample'].includes(doc.status) ? doc.status : 'stale';
  const pages = Array.isArray(doc.pages) ? doc.pages.filter((x) => x && typeof x === 'object').map((x) => ({ firm: str(x.firm, 60), ok: !!x.ok, owner: !!x.owner })) : [];
  const tags = deals.slice(0, 8).map((i) => ({ label: i.kind === 'deal' && i.pct ? i.pct + '% OFF' : i.kind === 'reset' ? 'RESET' : 'SALE', kind: i.kind, score: i.score })).concat(rulesMine.slice(0, 2).map(() => ({ label: 'RULE', kind: 'rule', score: 50 })));
  return { ok: true, status: st, headline: str(h.text, 240) || 'No summary yet.', asof: str(doc.asof, 40), ageH: ageHours(doc.asof, now), pick, deals, soon, rulesMine, rulesOther, pages,
    notes: Array.isArray(doc.notes) ? doc.notes.map((n) => str(n, 300)).filter(Boolean).slice(0, 12) : [], tags, best: deals.length ? deals[0] : null };
}

/** one plain line for the status strip */
export function statusLine(m) {
  if (!m.ok) return 'No deal list yet.';
  const n = m.deals.length, r = m.rulesMine.length;
  return (n ? n + ' deal' + (n === 1 ? '' : 's') + ' found' : 'No deals found') + (r ? ', ' + r + ' rule change' + (r === 1 ? '' : 's') + ' to read' : '') + '. ' + ageText(m.ageH) + '.';
}
