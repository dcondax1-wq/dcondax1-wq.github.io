// Jarvis x the bots, the screen (owner 2026-11-04, overnight job 30): the "Bots" panel that shows in Trading mode: status lights
// (PC, prices, Zlarior, ATLAS), the next window countdown, a live P&L line, today's game plan / recap card and the last events,
// with Plan / Recap buttons and the alert switches. DOM only: the facts and the words are bots.js's. Read only: no button here
// arms, orders or changes a bot; they ask Jarvis (which only reads) or flip this phone's alert switches.
//
//   import { mountBots } from './bots-ui.js';
//   const ui = mountBots({ bots: () => botsInstance, live: () => D.getFacts().live, modes: () => modesInstance, anchor, onAsk(text) });
//   ui.render()        on every data change; it also refreshes itself every 30 s while shown (the countdown)
//   ui.el              the panel (hidden unless the mode is Trading)
// iPhone Safari 16: plain ES2020.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = (f, d) => { try { return f(); } catch (_) { return d; } };
const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } } };
export const DISMISS_KEY = 'jarvis.bots.cardx';
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.jx-bots{margin:8px auto 0;max-width:560px;padding:10px 12px;border-radius:14px;background:rgba(239,238,235,.05);border:1px solid rgba(239,238,235,.12);text-align:left;box-sizing:border-box;width:100%}
.jx-bots[hidden]{display:none}
.jx-bots[data-state=bad]{border-color:rgba(207,132,110,.55)}.jx-bots[data-state=warn]{border-color:rgba(213,174,74,.5)}
.jx-bots .h{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:13px;letter-spacing: .02em;text-transform: none;opacity:.9;flex-wrap:wrap}
.jx-bots .h span{flex:1;min-width:60px}
.jx-bots .h button,.jx-bots .card button.x{font:inherit;font-size:13px;min-height:44px;padding:3px 12px;border-radius:999px;color:inherit;letter-spacing:.02em;text-transform:none;
  background:rgba(var(--cr,200,162,74),.14);border:1px solid rgba(var(--cr,200,162,74),.45);cursor:pointer}
.jx-bots .h button[aria-pressed=false]{opacity:.6}
.jx-bots ul.lights{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}
.jx-bots ul.lights li{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;line-height:1.25}
.jx-bots ul.lights b{font-weight:600;flex:0 0 auto}
.jx-bots ul.lights em{font-style:normal;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.jx-bots .dot{flex:0 0 auto;width:11px;height:11px;border-radius:50%;background:#847867;box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.jx-bots li[data-level=ok] .dot{background:#a2ad5a;box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.jx-bots li[data-level=warn] .dot{background:#d5ae4a;box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.jx-bots li[data-level=bad] .dot{background:#cf846e;box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.jx-bots li[data-active=true] .dot{animation:jxbp 1.4s ease-in-out infinite}
@keyframes jxbp{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}
@media (prefers-reduced-motion:reduce){.jx-bots li[data-active=true] .dot{animation:none}}
.jx-bots .win,.jx-bots .pnl{margin:8px 0 0;font-size:14px;line-height:1.35}
.jx-bots .pnl{font-weight:600}
.jx-bots .card{margin:8px 0 0;padding:8px 10px;border-radius:12px;background:rgba(239,238,235,.06);font-size:13px;line-height:1.4}
.jx-bots .card[hidden]{display:none}
.jx-bots .card .ct{display:flex;align-items:center;gap:8px;margin:0 0 4px;font-size:13px;letter-spacing: .02em;text-transform: none;opacity:.8}
.jx-bots .card .ct span{flex:1}
.jx-bots .card p{margin:3px 0}
.jx-bots ol.ev{list-style:none;margin:8px 0 0;padding:0;font-size:13px;opacity:.85}
.jx-bots ol.ev li{padding:3px 0;border-top:1px solid rgba(239,238,235,.07)}
.jx-bots ol.ev li:first-child{border-top:0}
.jx-bots ol.ev i{font-style:normal;opacity:.6;margin-right:6px}`;
  document.head.appendChild(s);
}

export function mountBots(o) {
  style();
  const x = o || {};
  const get = (f) => (typeof f === 'function' ? safe(() => f(), null) : f || null);
  const bots = () => get(x.bots), modes = () => get(x.modes), live = () => get(x.live);
  const el = document.createElement('section');
  el.className = 'jx-bots'; el.id = 'botsPanel'; el.hidden = true; el.setAttribute('aria-label', 'Bots'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<p class="h"><span>Bots</span><button type="button" data-act="plan">Plan</button><button type="button" data-act="recap">Recap</button>
    <button type="button" data-act="alerts" aria-pressed="true">Alerts on</button><button type="button" data-act="quiet" aria-pressed="false">Quiet hours</button></p>
    <ul class="lights"></ul><p class="win"></p><p class="pnl"></p>
    <div class="card" hidden><p class="ct"><span></span><button type="button" class="x" data-act="x" aria-label="Hide">Hide</button></p><div class="cb"></div></div><ol class="ev"></ol>`;
  const at = x.anchor && x.anchor.parentNode ? x.anchor : null;
  if (at) at.parentNode.insertBefore(el, at); else document.body.appendChild(el);
  const $ = (s) => el.querySelector(s);
  let timer = 0, shown = false;
  function card(b) {
    const c = b.cards ? safe(() => b.cards(), null) : null;
    const k = c ? [c.recap, c.plan, c.pre, c.end].filter(Boolean).sort((p, q) => (q.t || 0) - (p.t || 0))[0] : null;
    return k && ls.get(DISMISS_KEY) !== k.id ? k : null;
  }
  function render() {
    const m = modes(), b = bots();
    shown = !!(m && m.mode === 'trading' && b);
    el.hidden = !shown;
    if (!shown) { clearInterval(timer); timer = 0; return; }
    if (!timer) timer = setInterval(() => { if (document.visibilityState === 'visible') render(); }, 30e3);
    const P = safe(() => b.panel(live()), null);
    if (!P || !P.ok) { $('ul.lights').innerHTML = '<li data-level="idle"><i class="dot"></i><b>Bots</b><em>no data yet</em></li>'; $('.win').textContent = ''; $('.pnl').textContent = P ? P.pnl.line : ''; el.dataset.state = 'idle'; }
    else {
      el.dataset.state = P.state;
      $('ul.lights').innerHTML = P.lights.map((l) => `<li data-level="${esc(l.level)}" data-active="${l.active ? 'true' : 'false'}" data-id="${esc(l.id)}"><i class="dot"></i><b>${esc(l.label)}</b><em>${esc(l.word)}</em></li>`).join('');
      $('.win').textContent = P.windowText;
      $('.pnl').textContent = P.pnl.line + (P.stale ? ' (old numbers)' : '');
    }
    const st = safe(() => b.settings(), { on: true, quiet: { on: false } });
    const a = $('[data-act=alerts]'), q = $('[data-act=quiet]');
    a.setAttribute('aria-pressed', String(!!st.on)); a.textContent = st.on ? 'Alerts on' : 'Alerts off';
    q.setAttribute('aria-pressed', String(!!(st.quiet && st.quiet.on))); q.textContent = st.quiet && st.quiet.on ? 'Quiet 11P-6A' : 'Quiet hours';
    const c = card(b), cb = $('.card');
    cb.hidden = !c;
    if (c) { cb.dataset.id = c.id; cb.querySelector('.ct span').textContent = `${c.title}${c.tag ? ' · ' + c.tag : ''}`; cb.querySelector('.cb').innerHTML = c.lines.slice(0, 7).map((t) => `<p>${esc(t)}</p>`).join(''); }
    const ev = (safe(() => b.log(), []) || []).slice(0, 3);
    $('ol.ev').innerHTML = ev.map((e) => `<li><i>${esc(e.hm)}</i>${esc(e.text)}</li>`).join('');
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const act = t.dataset.act, b = bots();
    if (act === 'plan' && typeof x.onAsk === 'function') x.onAsk('Game plan');
    else if (act === 'recap' && typeof x.onAsk === 'function') x.onAsk('Recap');
    else if (act === 'alerts' && b) { const s = safe(() => b.settings(), { on: true }); safe(() => b.set({ on: !s.on })); render(); }
    else if (act === 'quiet' && b) { const s = safe(() => b.settings(), { quiet: {} }); safe(() => b.set({ quiet: { on: !(s.quiet && s.quiet.on) } })); render(); }
    else if (act === 'x') { const id = $('.card').dataset.id; if (id) ls.set(DISMISS_KEY, id); render(); }
  });
  const m0 = modes();
  if (m0 && typeof m0.onChange === 'function') safe(() => m0.onChange(() => render()));
  return { render, el, get shown() { return shown; } };
}
export default mountBots;
