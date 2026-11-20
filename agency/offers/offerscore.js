// AGENCY · OFFERS core (day-web-offers 2026-11-20): the pure money maths of the website business, no DOM, no network (node-tested:
// tests/test_web_offers.py). The page is offers.js; the package / extra prices are offers.json (placeholders until the research team's
// RESEARCH.md lands: `source` says which). Everything the owner types (his hourly target, clients, invoices, proposals) stays in this browser.
//
//   normData(raw)                     offers.json -> { packages, extras, terms, source, as_of } (bad rows dropped, never throws)
//   margin(item, hourly)              { price, hours, time_cost, hard, profit, per_hour, ok }   ok = per_hour >= the owner's hourly target
//   monthlyMargin(pkg, hourly)        the same for the monthly upkeep (care plan / retainer)
//   quote(data, pick, hourly)         a proposal's numbers: { lines, setup, monthly, first_year, deposit, balance, days, hours, profit, per_hour }
//   proposalText(q, who, biz, today)  the one-page proposal as plain text (share sheet / copy), no markup
//   addMonths(iso, n) / nextDue(client, today)   the retainer's next due day (same day of month, clamped to the month's end)
//   ledger(state, today)              { mrr, active, due: [...], overdue: [...], paid_month, open_invoices, open_total }
//   goals(data, hourly, mrrNow)       for $1,000 / $3,000 / $5,000 a month (what clients pay): how many monthly clients, or builds a month
//   normState(raw) / emptyState()     the phone's saved state { v, hourly, agency, clients, invoices, terms } (junk dropped)
//   money(n)                          '$1,234' (whole dollars, a real minus sign for negatives)

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : (typeof x === 'string' && x.trim() !== '' && isFinite(+x) ? +x : null));
const str = (x, n) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n || 200) : '');
const ID = /^[a-z0-9][a-z0-9_-]{0,30}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const GOALS = [1000, 3000, 5000];
export const DEFAULT_HOURLY = 60;

export function money(n) {
  const v = Math.round(num(n) || 0), s = Math.abs(v).toLocaleString('en-US');
  return (v < 0 ? '−$' : '$') + s;
}

function normItem(p, kind) {
  if (!isObj(p)) return null;
  const o = { id: str(p.id, 30), name: str(p.name, 40), price: num(p.price), hours: num(p.hours), hard: num(p.hard) || 0, pitch: str(p.pitch, 300),
    includes: (Array.isArray(p.includes) ? p.includes : []).map((x) => str(x, 140)).filter(Boolean).slice(0, 12) };
  if (!ID.test(o.id) || !o.name || o.price == null || o.price < 0 || o.hours == null || o.hours < 0) return null;
  o.monthly = Math.max(0, num(p.monthly) || 0);
  o.monthly_hours = Math.max(0, num(p.monthly_hours) || 0);
  o.monthly_hard = Math.max(0, num(p.monthly_hard) || 0);
  if (kind === 'package') {
    o.days = Math.max(1, Math.round(num(p.days) || 7));
    o.monthly_label = str(p.monthly_label, 40) || 'Care plan';
    o.badge = str(p.badge, 24);
    o.from = p.from === true;
    o.min_months = Math.max(0, Math.round(num(p.min_months) || 0));
  } else {
    o.days = Math.max(0, Math.round(num(p.days) || 0));
    o.per = str(p.per, 20);
  }
  return o;
}

export function normData(raw) {
  const d = isObj(raw) ? raw : {};
  const packages = (Array.isArray(d.packages) ? d.packages : []).map((p) => normItem(p, 'package')).filter(Boolean).slice(0, 6);
  const extras = (Array.isArray(d.extras) ? d.extras : []).map((p) => normItem(p, 'extra')).filter(Boolean).slice(0, 20);
  const terms = (Array.isArray(d.terms) ? d.terms : []).filter(isObj).map((t) => ({ id: str(t.id, 30), title: str(t.title, 80), text: str(t.text, 400) }))
    .filter((t) => ID.test(t.id) && t.title && t.text).slice(0, 20);
  return { packages, extras, terms, source: str(d.source, 200) || 'placeholder', placeholder: d.placeholder !== false, as_of: ISO.test(d.as_of || '') ? d.as_of : '',
    deposit: Math.min(1, Math.max(0, num(d.deposit) == null ? 0.5 : num(d.deposit))) };
}

/** what one job earns against the owner's own time: per_hour = (price - hard costs) / hours */
export function margin(item, hourly) {
  const h = Math.max(1, num(hourly) || DEFAULT_HOURLY), price = Math.max(0, num(item && item.price) || 0), hours = Math.max(0, num(item && item.hours) || 0);
  const hard = Math.max(0, num(item && item.hard) || 0), profit = price - hard, time_cost = Math.round(hours * h);
  const per_hour = hours > 0 ? Math.round(profit / hours) : (profit > 0 ? Infinity : 0);
  return { price: Math.round(price), hours, time_cost, hard: Math.round(hard), profit: Math.round(profit), per_hour, over_target: Math.round(profit - time_cost), ok: per_hour >= h };
}

export function monthlyMargin(pkg, hourly) {
  return margin({ price: pkg && pkg.monthly, hours: pkg && pkg.monthly_hours, hard: pkg && pkg.monthly_hard }, hourly);
}

/** pick = { package: id, extras: [id], rush: bool, discount: $ } */
export function quote(data, pick, hourly) {
  const D = data && data.packages ? data : normData(data);
  const p = D.packages.find((x) => x.id === (pick && pick.package)) || D.packages[0];
  if (!p) return null;
  const ex = (pick && Array.isArray(pick.extras) ? pick.extras : []).map((id) => D.extras.find((x) => x.id === id)).filter(Boolean);
  const lines = [{ id: p.id, name: p.name, price: p.price, hours: p.hours, hard: p.hard, kind: 'package' }]
    .concat(ex.map((x) => ({ id: x.id, name: x.name, price: x.price, hours: x.hours, hard: x.hard, kind: 'extra', monthly: x.monthly })));
  const monthly = p.monthly + ex.reduce((a, x) => a + x.monthly, 0);
  const mm = margin({ price: monthly, hours: p.monthly_hours + ex.reduce((a, x) => a + x.monthly_hours, 0), hard: p.monthly_hard + ex.reduce((a, x) => a + x.monthly_hard, 0) }, hourly);
  let setup = lines.reduce((a, l) => a + l.price, 0);
  const hours = lines.reduce((a, l) => a + l.hours, 0), hard = lines.reduce((a, l) => a + l.hard, 0);
  let days = p.days + ex.reduce((a, x) => a + x.days, 0);
  if (pick && pick.rush) { const fee = Math.round(setup * 0.25); lines.push({ id: 'rush', name: 'Rush: in half the time', price: fee, hours: 0, hard: 0, kind: 'extra' }); setup += fee; days = Math.max(1, Math.ceil(days / 2)); }
  const discount = Math.min(setup, Math.max(0, Math.round(num(pick && pick.discount) || 0)));
  if (discount) { lines.push({ id: 'discount', name: 'Discount', price: -discount, hours: 0, hard: 0, kind: 'discount' }); setup -= discount; }
  const m = margin({ price: setup, hours, hard }, hourly);
  const deposit = Math.round(setup * D.deposit);
  return { package: p, lines, setup: Math.round(setup), monthly: Math.round(monthly), monthly_label: p.monthly_label, first_year: Math.round(setup + 12 * monthly),
    deposit, balance: Math.round(setup - deposit), days, hours, profit: m.profit, per_hour: m.per_hour, ok: m.ok, monthly_margin: mm,
    monthly_extras: ex.filter((x) => x.monthly > 0).map((x) => ({ name: x.name, monthly: x.monthly })) };
}

export function minTerm(p) { return p && p.min_months ? `${p.min_months} months minimum, then stop any time with 30 days notice.` : 'Stop any time with 30 days notice.'; }

/** the proposal as plain text: what the client reads in a message or a printed page */
export function proposalText(q, who, biz, today) {
  if (!q) return '';
  const from = str(who, 60) || 'Your web designer', to = str(biz, 80) || 'Your business';
  const L = [`Website proposal for ${to}`, `From ${from} · ${today || ''}`.trim(), '',
    `Package: ${q.package.name}. ${q.package.pitch}`.trim(), ''];
  for (const l of q.lines) L.push(`${l.name}: ${money(l.price)}` + (l.monthly ? ` + ${money(l.monthly)} a month` : ''));
  L.push('', `Total to build: ${money(q.setup)}. ${money(q.deposit)} deposit to start, ${money(q.balance)} when the site goes live.`);
  if (q.monthly > 0) L.push(`${q.monthly_label}: ${money(q.monthly)} a month after launch (hosting, updates, small edits). `
    + minTerm(q.package));
  L.push(`Ready in about ${q.days} working day${q.days === 1 ? '' : 's'} after the deposit and your photos / logo / words.`);
  L.push('', 'Included:');
  for (const i of q.package.includes) L.push(`- ${i}`);
  L.push('', 'This proposal is good for 14 days.');
  return L.join('\n');
}

// ------------------------------------------------------------------------------------------------ dates (UTC-free: plain YYYY-MM-DD maths)
function parts(iso) { const m = ISO.exec(iso || '') ? iso.split('-').map(Number) : null; return m; }
function pad(n) { return String(n).padStart(2, '0'); }
function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }   // days in month m (1-12)
export function addMonths(iso, n, day) {
  const p = parts(iso); if (!p) return '';
  let y = p[0], m = p[1] + n; while (m > 12) { m -= 12; y += 1; } while (m < 1) { m += 12; y -= 1; }
  return `${y}-${pad(m)}-${pad(Math.min(day || p[2], dim(y, m)))}`;
}
export function daysBetween(a, b) {
  const p = parts(a), q = parts(b); if (!p || !q) return null;
  return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000);
}
/** a retainer is billed on its start day each month; next due = the first billing day after the last paid one (or the start day) */
export function nextDue(c) {
  if (!c || !parts(c.start)) return '';
  const day = parts(c.start)[2];
  if (!parts(c.paid)) return c.start;
  let d = c.start, k = 0;
  while (d <= c.paid && k < 600) { k += 1; d = addMonths(c.start, k, day); }
  return d;
}

// ------------------------------------------------------------------------------------------------ the phone's state
export function emptyState() { return { v: 1, hourly: DEFAULT_HOURLY, agency: '', clients: [], invoices: [], terms: {}, sent: 0 }; }
let SEQ = 0;
export function newId(prefix) { SEQ += 1; return `${prefix}${Date.now().toString(36)}${SEQ.toString(36)}`; }
export function normState(raw) {
  const s = isObj(raw) ? raw : {}, o = emptyState();
  const h = num(s.hourly); if (h != null && h >= 5 && h <= 1000) o.hourly = Math.round(h);
  o.agency = str(s.agency, 60);
  const sent = num(s.sent); if (sent != null && sent >= 0) o.sent = Math.min(9999, Math.round(sent));
  o.clients = (Array.isArray(s.clients) ? s.clients : []).filter(isObj).map((c) => ({ id: str(c.id, 40), name: str(c.name, 80), package: str(c.package, 30),
    monthly: Math.max(0, Math.round(num(c.monthly) || 0)), start: parts(c.start) ? c.start : '', paid: parts(c.paid) ? c.paid : '', active: c.active !== false,
    note: str(c.note, 200) })).filter((c) => c.id && c.name && c.start).slice(0, 200);
  o.invoices = (Array.isArray(s.invoices) ? s.invoices : []).filter(isObj).map((i) => ({ id: str(i.id, 40), client: str(i.client, 80), what: str(i.what, 140),
    amount: Math.round(num(i.amount) || 0), due: parts(i.due) ? i.due : '', paid: parts(i.paid) ? i.paid : '', made: parts(i.made) ? i.made : '' }))
    .filter((i) => i.id && i.client && i.amount > 0).slice(0, 500);
  if (isObj(s.terms)) for (const k of Object.keys(s.terms).slice(0, 40)) if (ID.test(k)) o.terms[k] = !!s.terms[k];
  return o;
}

export function ledger(state, today) {
  const S = normState(state), month = (today || '').slice(0, 7);
  const act = S.clients.filter((c) => c.active);
  const mrr = act.reduce((a, c) => a + c.monthly, 0);
  const rows = act.map((c) => { const due = nextDue(c), late = due && today ? daysBetween(due, today) : null; return { ...c, due, late: late != null && late > 0 ? late : 0, soon: late != null && late <= 0 && late >= -7 }; })
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const openInv = S.invoices.filter((i) => !i.paid);
  const paidMonth = S.invoices.filter((i) => i.paid && i.paid.slice(0, 7) === month).reduce((a, i) => a + i.amount, 0)
    + S.clients.filter((c) => c.paid && c.paid.slice(0, 7) === month).reduce((a, c) => a + c.monthly, 0);
  return { mrr, active: act.length, rows, overdue: rows.filter((r) => r.late > 0), due_soon: rows.filter((r) => r.soon),
    open_invoices: openInv.map((i) => ({ ...i, late: i.due && today && daysBetween(i.due, today) > 0 ? daysBetween(i.due, today) : 0 })),
    open_total: openInv.reduce((a, i) => a + i.amount, 0), paid_month: paidMonth };
}

/** the Agency HQ's tile (localStorage 'agency.offers.summary', the HUB team's shape): { n, label, next, t, pipe: { proposal, paid }, mrr } */
export function summary(state, today, nowS) {
  const S = normState(state), L = ledger(S, today);
  const next = L.overdue.length ? `Chase ${L.overdue[0].name}: ${money(L.overdue[0].monthly)} is ${L.overdue[0].late} days late`
    : L.open_invoices.length ? `${money(L.open_total)} in open invoices` : S.sent ? '' : 'Send your first proposal';
  return { n: L.active, label: `${L.active} paying, ${money(L.mrr)}/mo`, next, t: Math.round(nowS || 0), pipe: { proposal: S.sent || 0, paid: L.active }, mrr: L.mrr };
}

/** clients needed per goal: monthly clients of each plan (what they pay a month), or builds a month (what one build costs them) */
export function goals(data, hourly, mrrNow) {
  const D = data && data.packages ? data : normData(data);
  const now = Math.max(0, num(mrrNow) || 0);
  return GOALS.map((g) => {
    const gap = Math.max(0, g - now);
    const per = D.packages.map((p) => {
      const mm = monthlyMargin(p, hourly), sm = margin(p, hourly);
      // counted in what the client PAYS (the same money as the monthly income on top); what you keep after hard costs is beside it
      const builds = p.price > 0 ? Math.ceil(gap / p.price) : null;
      return { id: p.id, name: p.name, monthly: p.monthly, monthly_profit: mm.profit, clients: p.monthly > 0 ? Math.ceil(gap / p.monthly) : null,
        builds_a_month: builds, build_hours: builds == null ? null : builds * p.hours, keep: sm.profit };
    });
    return { goal: g, now, gap, reached: gap === 0, per };
  });
}
