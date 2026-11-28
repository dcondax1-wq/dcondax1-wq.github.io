// Research Hub: the PILLARS filter (day-pillars 2026-11-24). One chip row on each tab (Research, Strategy Lab): All / LIT / ATLAS /
// BLITZ / ORDER FLOW. The rule is ../pillars/pillarof.js (the same one the Strategy Brain uses). createElement only. Read only.
import { pillarOf, PILLARS } from '../pillars/pillarof.js?v=p2';

// the Hub's families are ['LIT', 'ATLAS', 'Rapid + fleet money', ...]: only 0 and 1 name a pillar (its 2 is NOT BLITZ)
export const ofCard = (c) => pillarOf(`${c && c.t || ''} ${c && c.x || ''}`, c && (c.f === 0 || c.f === 1) ? c.f : -1);
export const ofLab = (r) => (!r ? null : r.verdict === 'live' ? (r.id === 'lit' || r.id === 'atlas' ? r.id : null) : r.src === 'LEADERBOARD.md' ? 'lit'
  : pillarOf(`${r.name || ''} ${r.family || ''}`, -1));
window.HubPillar = { ofCard, ofLab };

function row(box, get, set) {
  if (!box) return;
  const draw = () => {
    box.replaceChildren();
    [['', 'All pillars'], ...PILLARS].forEach(([id, name]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip pil' + (id ? ' p-' + id : ''); b.dataset.pil = id; b.textContent = name;
      b.setAttribute('aria-pressed', String(get() === id)); b.addEventListener('click', () => { set(id); draw(); }); box.append(b);
    });
  };
  draw();
}
function boot() {
  row(document.getElementById('resPil'), () => (window.ResearchHub && window.ResearchHub.S.pil) || '', (id) => { if (window.ResearchHub) { window.ResearchHub.S.pil = id; window.ResearchHub.S.shown = 30; window.ResearchHub.render(); } });
  row(document.getElementById('labPil'), () => (window.HubLab && window.HubLab.S.pil) || '', (id) => { if (window.HubLab) { window.HubLab.S.pil = id; window.HubLab.render(); } });
  const q = new URLSearchParams(location.search).get('pillar');
  if (q && PILLARS.some(([id]) => id === q)) {
    const go = () => { const b = document.querySelector(`#resPil [data-pil="${q}"]`), c = document.querySelector(`#labPil [data-pil="${q}"]`); if (b) b.click(); if (c) c.click(); };
    if (window.ResearchHub && window.ResearchHub.S.data) go(); else setTimeout(go, 600);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
