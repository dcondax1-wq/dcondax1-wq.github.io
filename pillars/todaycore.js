// HOME "TODAY" STRIP, the model (day-pillars4 2026-11-25; lead: "a one-screen 'Today' strip on Home with the 4 accounts, open trade, next setup,
// $ today"). Pure ES module (no DOM, no fetch; node-tested by tests/test_pillars.py). The cards are the Accounts screen's (nq/acctcore via
// pillarsfeed.cardsFrom); the open trade = the PC post's real trades (lite.at, an exit time of null); the next setup = the PC's brain feed
// (lite.bf.bots.<id>.next) first, else its step report (glance). Nothing made up: no PC post = "waiting", every $ "-".
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 120);

export function usd(v, sign = true) {
  const n = num(v); if (n === null) return '-';
  const a = '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  return n < 0 && Math.round(n) ? '-' + a : (sign && Math.round(n) > 0 ? '+' + a : a);
}
/** "+$1,234" / "-$56" / "$0" -> number, "-" -> null */
export function money(text) {
  const t = String(text == null ? '' : text); if (!/\d/.test(t)) return null;
  const n = num(t.replace(/[^\d.]/g, '')); return n === null ? null : /^\s*-|−/.test(t) ? -n : n;
}
const BOTS = [['lit', 'LIT', /^(mffu50k_eval|lit|b25k_2|z\w*)$/i], ['atlas', 'ATLAS', /^(atlas\w*|acct_b)$/i]];
const short = (name) => str(name, 40).replace(/^Zlarior\s+/i, 'Z ').replace(/Builder\s+/i, '').replace(/\s+eval$/i, '');

/** cards (acctcore), lite (the merged PC post) -> {accounts[<=4], day, dayText, open, next, has} */
export function build(cards, lite, nowS) {
  const C = arr(cards).filter(isObj).slice(0, 4);
  const accounts = C.map((c) => { const v = c.has ? money(c.today) : null; return { key: str(c.key, 30), name: short(c.name), stage: str(c.stage, 10), today: v, text: c.has ? usd(v) : '-', lvl: v === null ? 'none' : v > 0 ? 'ok' : v < 0 ? 'bad' : 'none' }; });
  const known = accounts.filter((a) => a.today !== null);
  const day = known.length ? known.reduce((s, a) => s + a.today, 0) : null;
  // the open trade (the PC's real trades: an exit time of null)
  let open = null;
  const L = isObj(lite) ? lite : null;
  for (const a of arr(L && isObj(L.at) ? L.at.a : null)) {
    if (!isObj(a)) continue;
    const bot = BOTS.find(([, , rx]) => rx.test(String(a.id || '')));
    for (const r of arr(a.tr)) if (Array.isArray(r) && num(r[0]) !== null && r[1] == null && (!open || num(r[0]) > open.t)) open = { t: num(r[0]), bot: bot ? bot[1] : 'Bot', side: num(r[2]) < 0 ? 'SHORT' : 'LONG', usd: num(r[8]) };
  }
  // the next setup: the brain feed first, else the glance's stage / waiting words
  let next = null;
  const bf = L && isObj(L.bf) && isObj(L.bf.bots) ? L.bf.bots : null, bfT = num(L && isObj(L.bf) ? L.bf.t : null);
  for (const [id, name] of BOTS) {
    const n = bf && isObj(bf[id]) && isObj(bf[id].next) ? bf[id].next : null;
    if (n && n.setup && !/done for today/i.test(n.setup)) { next = { bot: name, id, text: str(n.setup, 80), dist: num(n.dist_pts), from: 'bf', age: bfT !== null ? Math.max(0, num(nowS) - bfT) : null }; break; }
  }
  if (!next) {
    const G = arr(L && isObj(L.pc) && isObj(L.pc.glance) ? L.pc.glance.bots : null), gt = num(L && isObj(L.pc) && isObj(L.pc.glance) ? L.pc.glance.t : null);
    for (const [id, name] of BOTS) {
      const g = G.find((x) => isObj(x) && x.id === id);
      if (g && (g.armed || g.stage)) { next = { bot: name, id, text: str(g.armed && arr(g.arm)[0] ? `${g.arm[0].side || ''} ${g.arm[0].text || ''}` : g.stage, 80), dist: null, from: 'glance', age: gt !== null ? Math.max(0, num(nowS) - gt) : null }; break; }
    }
  }
  return { has: !!L, accounts, day, dayText: day === null ? '-' : usd(day), dayLvl: day === null ? 'none' : day > 0 ? 'ok' : day < 0 ? 'bad' : 'none',
    open, openText: open ? `${open.bot} ${open.side}${open.usd !== null ? ` ${usd(open.usd)}` : ''}` : L ? 'none' : '-',
    next, nextText: next ? `${next.bot}: ${next.text}` : L ? 'nothing forming' : 'waiting for the PC' };
}
