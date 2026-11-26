// Buy gate card (big-shadow 2026-11-26; engine/buy_gate.py). DISPLAY ONLY: "OK to buy" / "STOP buying" new evals + the shadow
// eval line, from the PC report's "bg" block. Hidden when the PC sends none (the switch data/buy_gate.json is OFF by default).
(function () {
  'use strict';
  function view(bg) {
    if (!bg || typeof bg !== 'object' || (bg.s !== 'OK' && bg.s !== 'STOP')) return null;
    return { stop: bg.s === 'STOP', word: bg.s === 'STOP' ? 'STOP buying new evals' : 'OK to buy new evals',
             line: String(bg.l || '').slice(0, 240), shadow: String(bg.sh || '').slice(0, 200), t: Number(bg.t) || 0 };
  }
  function draw(box, v) {
    if (!box) return;
    if (!v) { box.hidden = true; return; }
    box.textContent = '';
    const h = document.createElement('h2'), p = document.createElement('p'), s = document.createElement('p'), f = document.createElement('p');
    h.textContent = 'Buy gate: ' + v.word;
    h.style.color = v.stop ? '#ff8a8a' : '#77db89';
    p.textContent = v.line; s.textContent = v.shadow;
    f.className = 'note'; f.textContent = 'Display only: it never buys or blocks anything.' + (v.t ? ' As of ' + new Date(v.t * 1000).toLocaleString() + '.' : '');
    box.append(h, p); if (v.shadow) box.append(s); box.append(f);
    box.hidden = false;
  }
  async function main() {
    const box = document.getElementById('buyGate');
    let lite = null;
    try { if (window.PC_FEED) lite = await window.PC_FEED.fetchLatest({ feedUrl: '../status_feed.json' }); } catch (e) { lite = null; }
    draw(box, view(lite && lite.bg));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { view };
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main); else main();
})();
