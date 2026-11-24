// The FOUR PILLARS mini strip (day-pillars 2026-11-24): 4 chips (LIT, ATLAS, BLITZ, ORDER FLOW) with one status word each, a tap opens
// that pillar on ../pillars/. Mounts into #pillarsStrip of the page that loads it (the NQ page). It FETCHES NOTHING: the chips come
// from what the page already holds (window.NQ.S: home, biz, lite = the PC's post) + the bare pillar list (pillarscore.PILLAR_BASE),
// and it redraws on the page's 'nq-refresh'. createElement / textContent only. Read only.
// BLITZ (owner 2026-11-23: one of the 4 pillars) shows only as "built · OFF": no live BLITZ number while hidden_bots holds it.
import * as P from './pillarscore.js?v=p3';
import * as PF from './pillarsfeed.js?v=p3';

const BASE = new URL('./', import.meta.url);
const CSS = `.pstrip{margin:10px 0 4px}.pstrip .ph{display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 6px}
.pstrip .ph b{font-size:12px;letter-spacing:.9px;text-transform:uppercase;color:#f1c14b}.pstrip .ph a{font-size:12px;color:#9d59ee;text-decoration:none;display:inline-flex;align-items:center;justify-content:flex-end;min-width:44px;min-height:44px;margin:-14px -4px -14px 0;padding:0 4px}
.pstrip .pg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.pstrip .pc{display:block;min-width:0;min-height:44px;padding:8px 6px;border-radius:12px;background:#16131e;border:1px solid #3e255e;text-decoration:none;color:#f3eefc;text-align:center;
 box-shadow:inset 0 -3px 0 var(--c)}
.pstrip .pc b{display:block;font-size:11px;line-height:1.15;color:var(--c);letter-spacing:.3px;min-height:2.3em;display:flex;align-items:center;justify-content:center}
.pstrip .pc span{display:block;font-size:10px;font-weight:700;margin-top:2px}.pstrip .pc small{display:block;font-size:9.5px;color:#a99cc2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pstrip .pc i{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:3px;vertical-align:1px;background:#a99cc2}
.pstrip .pc i.ok{background:#77db89;box-shadow:0 0 6px #77db89}.pstrip .pc i.warn{background:#f1c14b}.pstrip .pc i.off{background:#5b3f86}`;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
export function draw(box, chips) {
  box.replaceChildren();
  const h = el('div', 'ph'); h.append(el('b', null, 'Four Pillars')); const a = el('a', null, 'Open ›'); a.href = new URL('./', BASE).href; h.append(a); box.append(h);
  const g = el('div', 'pg');
  for (const c of chips) {
    const x = el('a', 'pc'); x.href = new URL('./#' + c.id, BASE).href; x.style.setProperty('--c', c.color); x.dataset.p = c.id;
    x.setAttribute('aria-label', `${c.name}: ${c.word}, ${c.line}`);
    const w = el('span'); w.append(el('i', c.level), document.createTextNode(c.word.split(' · ')[0])   /* the main word; the line under it says waiting / N of M armed */);
    x.append(el('b', null, c.name), w, el('small', null, c.line)); g.append(x);
  }
  box.append(g);
}
export async function mount(box) {
  if (!box) return null;
  if (!document.getElementById('pstripCss')) { const s = el('style'); s.id = 'pstripCss'; s.textContent = CSS; document.head.append(s); }
  const render = () => {
    const S = (window.NQ && window.NQ.S) || {};
    draw(box, P.chips(PF.modelFrom({ data: { pillars: P.PILLAR_BASE }, home: S.home || {}, biz: S.biz || null, payday: null, lite: S.lite || null,
      nowS: Date.now() / 1000, feed: window.PC_FEED, coach: window.PAYOUT_COACH || null })));
    box.dataset.ready = S.lite ? 'post' : 'site';
  };
  render();
  let n = 0; const wait = setInterval(() => { n += 1; if ((window.NQ && window.NQ.S && window.NQ.S.lite) || n > 20) { clearInterval(wait); render(); } }, 1000);
  addEventListener('nq-refresh', () => setTimeout(render, 1500));
  return { render };
}
mount(document.getElementById('pillarsStrip'));
