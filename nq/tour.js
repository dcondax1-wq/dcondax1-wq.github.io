// "HOW TO READ THIS PAGE": a 5-stop first-visit tour (night-nq-main 2026-11-27). Lazy: nq.js adds this file at idle only when
// localStorage 'nq.tour' is unset (or ?tour=1 replays it). Skippable at every stop (Skip, Esc); finishing or skipping saves 'nq.tour'.
// The spotlight is an outline (not a shadow, so SUNLIGHT MODE keeps it); prefers-reduced-motion = static callouts, no scrolling animation.
// A stop whose card is not on the page (e.g. the battle plan before the brief exists) is left out: the tour never points at nothing.
// textContent / createElement only.
const STOPS = [
  { sel: '#hero .hx-big', title: "Today's money", text: "The big number is today's profit or loss across your accounts, from your PC's last report. Green is up, red is down." },
  { sel: '#hero [data-hx="accts"]', title: 'Each account', text: "The ring fills as an account gets closer to passing (or to its payout). The big $ is what is left to go. The bar is the room left before the account fails." },
  { sel: '#hero [data-hx="bots"]', title: 'The bots in one word', text: 'LIT and ATLAS each say one word: WATCHING, SETUP FORMING, SETUP ARMED, IN TRADE or DONE TODAY, with what they are waiting for.' },
  { sel: '#battle', title: "Today's battle plan", text: 'When each bot may trade today, the price levels it watches, and the news pauses. Below it: the alert history and the December plan.' },
  { sel: '#hero .hx-age', title: 'Is the PC reporting?', text: 'This dot says how fresh the numbers are: green = the PC reported recently, gold = getting old, red = old. If it goes red, the hero shows the steps to bring it back.' },
];
const CSS = `.tr-spot{position:fixed;z-index:9998;border-radius:16px;border:2px solid #f1c14b;outline:9999px solid rgba(0,0,0,.72);pointer-events:none;transition:all .35s cubic-bezier(.2,.8,.2,1)}
.tr-card{position:fixed;z-index:9999;left:16px;right:16px;max-width:380px;margin:0 auto;padding:14px;border-radius:18px;border:2px solid #9d59ee;background:#0d0a14;color:#f4f1fa;display:grid;gap:8px;transition:top .35s cubic-bezier(.2,.8,.2,1)}
.tr-n{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#c9a6ff}.tr-t{margin:0;font-size:17px;color:#f1c14b}.tr-p{margin:0;font-size:14.5px;line-height:1.45;color:#ece6f6}
.tr-b{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.tr-b button{min-height:44px;min-width:44px;padding:0 14px;border-radius:999px;border:1px solid #4d2e76;background:#16131e;color:#f4f1fa;font:inherit;font-weight:700;cursor:pointer}
.tr-b .tr-go{background:#f1c14b;color:#000;border-color:#f1c14b}.tr-b .tr-skip{margin-right:auto;background:none;border-color:transparent;color:#cfc6de}
.tr-b button:focus-visible{outline:3px solid #f1c14b;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.tr-spot,.tr-card{transition:none}}`;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
let still = false; try { still = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { /* motion ok */ }
const visible = (n) => { if (!n || n.hidden || n.closest('[hidden]')) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

function save() { try { localStorage.setItem('nq.tour', 'done'); } catch (_) { /* private mode: it shows again next visit */ } }

function start() {
  if (document.getElementById('nqTour')) return;
  const stops = STOPS.filter((s) => visible(document.querySelector(s.sel)));
  if (!stops.length) return;
  const st = el('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = el('div'); root.id = 'nqTour';
  const spot = el('div', 'tr-spot'); spot.setAttribute('aria-hidden', 'true');
  const card = el('div', 'tr-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'trT');
  const n = el('span', 'tr-n'), t = el('h2', 'tr-t'), p = el('p', 'tr-p'); t.id = 'trT';
  const bar = el('div', 'tr-b'), skip = el('button', 'tr-skip', 'Skip tour'), back = el('button', '', 'Back'), go = el('button', 'tr-go', 'Next');
  for (const b of [skip, back, go]) b.type = 'button';
  bar.appendChild(skip); bar.appendChild(back); bar.appendChild(go);
  card.appendChild(n); card.appendChild(t); card.appendChild(p); card.appendChild(bar);
  root.appendChild(spot); root.appendChild(card); document.body.appendChild(root);
  let i = 0;
  const place = () => {
    const tgt = document.querySelector(stops[i].sel); if (!tgt) return;
    const r = tgt.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const ch = card.offsetHeight || 180, below = r.bottom + 14, above = r.top - 14 - ch;
    card.style.top = `${Math.round(below + ch <= innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, innerHeight - ch - 8))}px`;
  };
  const show = () => {
    const s = stops[i], tgt = document.querySelector(s.sel);
    n.textContent = `How to read this page · ${i + 1} of ${stops.length}`; t.textContent = s.title; p.textContent = s.text;
    back.hidden = i === 0; go.textContent = i === stops.length - 1 ? 'Done' : 'Next';
    const r = tgt.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight * 0.55) tgt.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
    place(); setTimeout(place, still ? 0 : 420);
    go.focus({ preventScroll: true });
  };
  const end = () => { save(); removeEventListener('resize', place); removeEventListener('scroll', place, true); document.removeEventListener('keydown', key, true); root.remove(); st.remove(); };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'Tab') { const f = [skip, back, go].filter((b) => !b.hidden); const k = f.indexOf(document.activeElement); e.preventDefault(); f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
  };
  skip.addEventListener('click', end);
  back.addEventListener('click', () => { if (i > 0) { i--; show(); } });
  go.addEventListener('click', () => { if (i < stops.length - 1) { i++; show(); } else end(); });
  addEventListener('resize', place); addEventListener('scroll', place, true); document.addEventListener('keydown', key, true);
  show();
}
window.NQ_TOUR = { start };
// wait for the hero's first real draw (its load class) so the stops have something in them; give up after ~8 s without one
// and up to ~3 s more for the battle plan (plan.js is lazy) so stop 4 is not dropped just for being late
(function wait(k, j) {
  const h = document.getElementById('hero'), b = document.getElementById('battle');
  if (!(h && h.classList.contains('hx-enter'))) { if (k < 40) setTimeout(() => wait(k + 1, j), 200); return; }
  if (!visible(b) && j < 15) { setTimeout(() => wait(k, j + 1), 200); return; }
  setTimeout(start, 600);
})(0, 0);
