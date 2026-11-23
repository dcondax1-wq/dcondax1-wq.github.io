// OIKOS household card, the pure part (2026-11-14, "connect the money"): ../money/household.json (tools/money_import.py on the PC: your own
// bank / card exports) -> what the card shows. No DOM, no fetch, no storage: node tests call view() directly (tests/test_money_import.py).
// The file reaches the phone only through the PC's private Tailscale link; on the public site it is missing and the card says how to connect.
// It never has account numbers; merchant names only when the owner turned privacy.publish_merchants on.

export const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const str = (v, n) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function usd(v, sign) {
  const x = num(v);
  if (x == null) return '-';
  const a = Math.abs(x), r = Math.round(a * 100) / 100;
  const body = a >= 100 || r === Math.round(r) ? '$' + Math.round(a).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '$' + r.toFixed(2);
  if (Math.round(a * 100) === 0) return '$0';
  return (x < 0 ? '-' : sign ? '+' : '') + body;
}
const EVERY = { week: 'a week', month: 'a month', quarter: 'a quarter', year: 'a year' };
export const STALE_DAYS = 40;
export const HOW = 'On the PC: put your bank\'s CSV / OFX export in the money inbox and run tools/bat/RUN_MONEY.bat (docs/CONNECT_MONEY.md). It reaches this phone only over your private link.';

/** view(doc) -> { state: off | empty | stale | ok, pill, pillCls, lines, kpis: [{label, value, cls}], cats: [{name, usd, frac}], subs: [{name, usd, every, next}],
 *  leaks: [{title, usd_month, detail}], notes } */
export function view(doc) {
  if (!isObj(doc) || doc.kind !== 'olympus-household') {
    return { state: 'off', pill: 'Not connected', pillCls: 'info', lines: [HOW], kpis: [], cats: [], subs: [], leaks: [], notes: [] };
  }
  const data = isObj(doc.data) ? doc.data : {};
  if (doc.status !== 'ok' || !num(data.rows)) {
    return { state: 'empty', pill: 'No data yet', pillCls: 'info', lines: ['Connected, but no bank rows have been imported yet. ' + HOW], kpis: [], cats: [], subs: [], leaks: [], notes: [] };
  }
  const tm = isObj(doc.this_month) ? doc.this_month : {}, run = isObj(doc.runway) ? doc.runway : {}, nw = isObj(doc.networth) ? doc.networth : {};
  const sub = isObj(doc.subscriptions) ? doc.subscriptions : {}, prop = isObj(doc.prop) ? doc.prop : {}, kal = isObj(doc.kalshi) ? doc.kalshi : {};
  const age = num(data.age_days), stale = age != null && age > STALE_DAYS;
  const kpis = [
    { label: `Out in ${str(tm.month, 7) || 'this month'}`, value: usd(tm.out) },
    { label: 'In', value: usd(tm.in) },
    { label: 'Net', value: usd(tm.net, true), cls: num(tm.net) != null && tm.net < 0 ? 'neg' : 'pos' },
    { label: 'Runway on savings', value: num(run.months) != null ? `${run.months.toFixed(1)} months` : 'add balances' },
    { label: 'Subscriptions and bills', value: num(sub.usd_month) != null ? `${usd(sub.usd_month)} a month` : '-' },
    { label: 'Net worth', value: num(nw.total) != null ? usd(nw.total) : 'add balances' },
  ];
  const catsRaw = (Array.isArray(tm.cats) ? tm.cats : []).filter((c) => isObj(c) && num(c.usd) != null && c.usd > 0 && isObj(doc.categories) && isObj(doc.categories[c.id]) && doc.categories[c.id].kind === 'spend');
  const top = catsRaw.length ? Math.max(...catsRaw.map((c) => c.usd)) : 0;
  const cats = catsRaw.sort((a, b) => b.usd - a.usd).slice(0, 8).map((c) => ({ name: str(c.name, 40), usd: c.usd, frac: top > 0 ? c.usd / top : 0 }));
  const subs = (Array.isArray(sub.items) ? sub.items : []).filter((s) => isObj(s) && s.active).slice(0, 8)
    .map((s) => ({ name: str(s.merchant, 40) || str(s.label, 40) || 'Recurring charge', usd: num(s.usd), every: EVERY[s.every] || '', next: str(s.next, 10), up: num(s.price_up) || 0 }));
  const leaks = (Array.isArray(doc.leaks) ? doc.leaks : []).filter(isObj).slice(0, 4).map((x) => ({ title: str(x.title, 80), usd_month: num(x.usd_month), detail: str(x.detail, 200) }));
  const lines = [];
  if (str(run.text, 240)) lines.push(str(run.text, 240));
  if (str(prop.text, 200)) lines.push('Prop firms (as your bank saw it): ' + str(prop.text, 200));
  if (num(kal.deposits) || num(kal.withdrawals)) lines.push('Kalshi (your money moving, not spending): ' + str(kal.text, 160));
  const notes = [`From ${num(data.rows)} rows of your own bank exports, ${str(data.first, 10)} to ${str(data.last, 10)}${age != null ? ` (newest ${age} day${age === 1 ? '' : 's'} old)` : ''}.`,
    'No account numbers ever; merchant names only if you turn them on in your rules.'];
  if (stale) notes.unshift(`The newest bank row is ${age} days old: download a fresh export.`);
  return { state: stale ? 'stale' : 'ok', pill: stale ? 'Old export' : 'Your bank data', pillCls: stale ? 'warn' : 'ok', lines, kpis, cats, subs, leaks, notes };
}
