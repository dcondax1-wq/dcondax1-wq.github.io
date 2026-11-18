// ATHENS data: what the owner's own published files say, turned into things you can see in the city. READ ONLY.
// Reads ../home.json (accounts), ../money/index.json (money streams), ../alerts.json (optional). Any of them missing or old -> the bundled
// athens-fixture.json (marked "Example numbers"), so the city is never blank. The "needs you" rules are the Stoa's (../stoa/stoacore.js).
// Nothing here trades or places an order; it only reads JSON.
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// which app temples glow when a Stoa card needs the owner (calm otherwise)
export const NEED_APPS = {
  bots: ['zenith', 'ares'], drawdown: ['fates', 'demeter', 'labyrinth', 'pnyx'], today: ['hestia', 'odeon', 'ledger'],
  deals: ['hera', 'plutus'], feeds: ['observatory', 'hermes'], alerts: ['inbox'],
};
const RANK = { bad: 0, warn: 1, info: 2 };

async function getJSON(url, ms = 6000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { if (t) clearTimeout(t); }
}

export function accountsOf(home) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [];
  return list.filter((a) => isObj(a) && !a.error).map((a, i) => {
    const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, st = isObj(a.stats) ? a.stats : {};
    const loss = num(st.avg_loss);
    return { id: String(a.id || 'acct' + i), name: String(a.name || a.id || 'Account').slice(0, 30), room: num(ev.room), mll: num(ev.mll),
      today: num(pnl.today) != null ? num(pnl.today) : num(ev.today) || 0, risk: loss ? Math.abs(loss) : null, open: isObj(a.position) && Object.keys(a.position).length > 0,
      side: isObj(a.position) ? String(a.position.side || '') : '', connected: isObj(a.conn) && typeof a.conn.connected === 'boolean' ? a.conn.connected : null };
  });
}

/** the pure part (tests call it in Node): inputs + stoa core -> what the scene and the banner show */
export function buildLive(inp, core, nowMs, demo) {
  const accounts = accountsOf(inp.home), sum = accounts.reduce((s, a) => s + a.today, 0);
  const risks = accounts.map((a) => a.risk).filter(Boolean), est = !risks.length, risk = risks.length ? risks.reduce((s, x) => s + x, 0) / risks.length : 425;
  const r = Math.round(sum / risk * 100) / 100;
  const cards = core ? core.buildCards(inp, nowMs) : [];
  const needs = {};
  for (const c of cards) if (c.needs && RANK[c.tone] != null) for (const id of NEED_APPS[c.slot] || []) {
    if (!needs[id] || RANK[c.tone] < RANK[needs[id].tone]) needs[id] = { tone: c.tone, title: c.title, say: c.say, slot: c.slot };
  }
  const usd = (v) => (v < 0 ? '-' : v > 0 ? '+' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
  const open = accounts.filter((a) => a.open), glowing = Object.keys(needs);
  const names = glowing.slice(0, 3).map((id) => id[0].toUpperCase() + id.slice(1));
  const feedsBad = cards.some((c) => c.slot === 'feeds' && c.needs);
  const lines = [
    accounts.length ? `${demo ? 'Example: ' : ''}Today ${usd(sum)} (${r > 0 ? '+' : ''}${r} R${est ? ', estimate' : ''}) on ${accounts.length} account${accounts.length === 1 ? '' : 's'}.` : 'No account numbers yet, so the pillar rests at zero.',
    glowing.length ? `${glowing.length} temple${glowing.length === 1 ? '' : 's'} glow gold: ${names.join(', ')}${glowing.length > 3 ? ' and more' : ''} need a look.` : 'All 40 temples are calm. Nothing needs you.',
    open.length ? `${open.length} open position${open.length === 1 ? '' : 's'}: ${open.length === 1 ? 'that ship sails' : 'those ships sail'} the bay.` : feedsBad ? 'Some data is old: check the Observatory.' : 'No open positions: every ship rests in the harbour.',
  ];
  return { demo: !!demo, accounts, pnl: { usd: Math.round(sum), r, est, risk: Math.round(risk) }, needs, cards, lines, open: open.length };
}

export async function loadLive(base = import.meta.url) {
  const u = (p) => new URL(p, base).href;
  const [fx, home, money, alerts] = await Promise.all([getJSON(u('./athens-fixture.json')), getJSON(u('../home.json')), getJSON(u('../money/index.json')), getJSON(u('../alerts.json'))]);
  let core = null; try { core = await import('../stoa/stoacore.js'); } catch (e) { core = null; }
  const real = isObj(home) && Array.isArray(home.accounts) && home.accounts.length > 0, now = Date.now();
  const F = isObj(fx) ? fx : { home: { accounts: [] }, money: { streams: [] } };
  const inp = real ? { home, money: isObj(money) ? money : null, alerts: isObj(alerts) || Array.isArray(alerts) ? alerts : null } : { home: F.home, money: F.money, alerts: F.alerts || null };
  // the fixture says "expires in N hours"; the Stoa wants a real time
  if (!real && inp.money && Array.isArray(inp.money.streams)) inp.money = { ...inp.money, streams: inp.money.streams.map((s) => ({ ...s, items: (s.items || []).map((i) => (i.expires_in_h != null ? { ...i, expires: new Date(now + i.expires_in_h * 3600000).toISOString() } : i)) })) };
  return buildLive(inp, core, now, !real);
}
