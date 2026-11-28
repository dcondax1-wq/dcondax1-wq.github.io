// HOME "TODAY" STRIP (day-pillars4 2026-11-25): one thin row under the Four Pillars on the Olympus Home: $ today, the 4 accounts, the open trade,
// the next setup. Mounts into #todayStrip (gate/index.html). Model: todaycore.js (pure). Data: the site's home.json + business/accounts.json and
// the PC's public post (window.PC_FEED.fetchLatest), once after load and every 2 minutes while visible. It takes NO height of its own: the
// strip's 44 px links sit right above the search (the header gives up its spare 18 px) (the 6 dashboards + More stay on the first 390 x 844 screen). createElement / textContent only. Read only.
import * as T from './todaycore.js?v=t1';
import * as PF from './pillarsfeed.js?v=p9';

const BASE = new URL('./', import.meta.url);
const CSS = `.g-today{display:flex;gap:4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;height:44px;margin:-2px 0 -26px;padding:0 2px;align-items:center;
 -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 18px),transparent);mask-image:linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 18px),transparent)}
.g-today::-webkit-scrollbar{display:none}
.g-today a{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;height:44px;min-width:44px;padding:0;text-decoration:none;color:#f3eefc}
.g-today a>span{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:99px;font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
 white-space:nowrap;background:rgba(22,19,30,.82);border:1px solid #3e255e;font-variant-numeric:tabular-nums}
.g-today a small{font:inherit;font-weight:500;color:#a99cc2}
.g-today a.k>span{border-color:#f1c14b;color:#f1c14b;box-shadow:0 0 10px rgba(241,193,75,.22)} .g-today a.k b{color:inherit}
.g-today .ok{color:#77db89}.g-today .bad{color:#ff6b8a}.g-today a.op>span{border-color:#77db89}.g-today a.nx>span{border-color:#9d59ee;box-shadow:0 0 10px rgba(157,89,238,.25)}`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const link = (href, cls, label, kids) => { const a = el('a', cls); a.href = new URL(href, BASE).href; a.setAttribute('aria-label', label); const s = el('span'); s.append(...kids); a.append(s); return a; };   // a 44 px tap target, the pill inside

export function draw(box, M) {
  const k = []; const b = el('b', M.dayLvl, M.dayText);
  k.push(link('../nq/accounts.html', 'k', `Today ${M.dayText} on all accounts`, [el('small', null, 'Today'), b]));
  for (const a of M.accounts) k.push(link('../nq/accounts.html', '', `${a.name}: today ${a.text}`, [el('small', null, a.name), el('b', a.lvl, a.text)]));
  k.push(link(M.open ? `../brain/#${M.open.bot === 'ATLAS' ? 'atlas' : 'lit'}` : '../trading/', M.open ? 'op' : '', `Open trade: ${M.openText}`, [el('small', null, 'Open'), el('b', M.open && M.open.usd !== null ? (M.open.usd >= 0 ? 'ok' : 'bad') : '', M.openText)]));
  k.push(link(`data.html#${M.next ? M.next.id : 'lit'}`, 'nx', `Next setup: ${M.nextText}`, [el('small', null, 'Next'), el('b', null, M.nextText)]));
  box.replaceChildren(...k);
  box.dataset.ready = M.has ? 'post' : 'site';
}
export async function mount(box) {
  if (!box || box.dataset.live === '1') return null;
  box.dataset.live = '1';
  if (!document.getElementById('gTodayCss')) { const s = el('style'); s.id = 'gTodayCss'; s.textContent = CSS; document.head.append(s); }
  const get = async (u) => { try { const r = await fetch(new URL(u, BASE), { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } };
  const [home, biz] = await Promise.all([get('../home.json'), get('../business/accounts.json')]);
  let lite = null;
  const render = () => { const t = Date.now() / 1000; const { cards } = PF.cardsFrom({ home: home || {}, biz, lite, nowS: t, feed: window.PC_FEED, coach: window.PAYOUT_COACH || null }); draw(box, T.build(cards, lite, t)); };
  render();
  const poll = async () => {
    const F = window.PC_FEED; if (!F || !F.fetchLatest || document.visibilityState === 'hidden') return;
    try { const l = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', BASE).href }), new Promise((r) => setTimeout(() => r(null), 15000))]); if (l) { lite = l; render(); } } catch (_) { /* keep */ }
  };
  poll(); setInterval(poll, 120000);
  return { render };
}
mount(document.getElementById('todayStrip'));
