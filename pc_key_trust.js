/* PC KEY TRUST (day-guard2 2026-11-26): loaded by pc_feed.js ONLY when needed (never on a normal page load: the phone budget).
 *   chain(text, keys, verify)  the trusted keys + every key a trusted key handed over in a signed rotation post (kind le-key-rotate,
 *                              tools/status_sign.py rotate on the PC), chained oldest first. Same rule as status_sign.accepted().
 *   scan(text, keys, verify)   the 3-hour window: no trusted key posted for 3 h, but ONE other key signed 12+ posts (carrying its
 *                              own svk) over 3 h+ -> {vk, n, first, last} and a banner that ASKS the owner ("Trust new key" only
 *                              if he reinstalled / changed the PC). Nothing is trusted without that tap.
 *   trust(vk)                  this phone trusts vk from now on (localStorage olympus.pc_vks; pc_feed.feedKeys reads it).
 * Tests: tests/test_guard2.py (node). */
(function (root) {
  'use strict';
  const VK_RX = /^[A-Za-z0-9_-]{87}$/, LVK = 'olympus.pc_vks', MIN_N = 12, SPAN_S = 3 * 3600;
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  function rows(text) {
    const out = [];
    for (const line of String(text || '').split('\n')) {
      let m, j = null;
      try { m = JSON.parse(line); } catch (e) { continue; }
      if (!isObj(m) || typeof m.message !== 'string') continue;
      try { j = JSON.parse(m.message); } catch (e) { /* not JSON */ }
      out.push({ m, j });
    }
    return out;
  }
  async function chain(text, keys, verify) {
    const ks = [...keys];
    const rots = rows(text).filter((r) => isObj(r.j) && r.j.kind === 'le-key-rotate' && VK_RX.test(String(r.j.new || '')))
      .sort((a, b) => (+a.j.t || 0) - (+b.j.t || 0));
    for (let ch = true; ch;) {
      ch = false;
      for (const r of rots) if (!ks.includes(r.j.new) && ks.includes(r.j.old) && await verify(r.m.message, r.j.old)) { ks.push(r.j.new); ch = true; }
    }
    return ks;
  }
  function trust(vk) {
    if (!VK_RX.test(String(vk || ''))) return false;
    try { const a = JSON.parse(localStorage.getItem(LVK) || '[]'); const l = Array.isArray(a) ? a : []; if (!l.includes(vk)) l.push(vk); localStorage.setItem(LVK, JSON.stringify(l)); return true; } catch (e) { return false; }
  }
  async function scan(text, keys, verify) {
    const cnt = new Map();
    for (const r of rows(text)) {
      const sv = isObj(r.j) ? String(r.j.svk || '') : '';
      if (!VK_RX.test(sv) || keys.includes(sv) || !(await verify(r.m.message, sv))) continue;
      const t = +r.m.time || 0, c = cnt.get(sv) || { vk: sv, n: 0, first: t, last: t };
      c.n += 1; c.first = Math.min(c.first, t); c.last = Math.max(c.last, t);
      cnt.set(sv, c);
    }
    let best = null;
    for (const c of cnt.values()) if (c.n >= MIN_N && c.last - c.first >= SPAN_S && (!best || c.n > best.n)) best = c;
    if (best) banner(best);
    return best;
  }
  function banner(c) {
    try {
      if (typeof document === 'undefined' || !document.body || document.getElementById('pcKeyTrust')) return;
      const skip = 'olympus.pc_vk_skip.' + c.vk.slice(0, 12);
      if (sessionStorage.getItem(skip)) return;
      const d = document.createElement('div');
      d.id = 'pcKeyTrust';
      d.setAttribute('role', 'alertdialog');
      d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:9999;background:#16131e;'
        + 'border:1px solid #4d2e76;box-shadow:0 0 18px #9d59ee55;border-radius:14px;padding:14px;color:#eee;font:14px/1.4 system-ui,sans-serif';
      const h = Math.round((c.last - c.first) / 360) / 10;
      d.innerHTML = '<b style="color:#f1c14b">Your PC\'s signing key changed?</b><br>The usual key has been silent for 3 h+ and a NEW key ('
        + '<code>' + c.vk.slice(0, 6) + '</code>) sent ' + c.n + ' posts over ' + h + ' h. Trust it ONLY if you reinstalled Windows or changed '
        + 'the PC AND Telegram /today shows <b>PC signing key: ' + c.vk.slice(0, 6) + '</b>; otherwise it may be someone else.<div style="display:flex;gap:8px;margin-top:10px">'
        + '<button id="pcKeyYes" style="flex:1;min-height:44px;border-radius:10px;border:0;background:#77db89;color:#000;font-weight:600">Trust new key</button>'
        + '<button id="pcKeyNo" style="flex:1;min-height:44px;border-radius:10px;border:1px solid #3e255e;background:#000;color:#eee">Not now</button></div>';
      document.body.appendChild(d);
      d.querySelector('#pcKeyYes').onclick = () => { trust(c.vk); d.remove(); try { location.reload(); } catch (e) { /* */ } };
      d.querySelector('#pcKeyNo').onclick = () => { try { sessionStorage.setItem(skip, '1'); } catch (e) { /* */ } d.remove(); };
    } catch (e) { /* never breaks a page */ }
  }
  const api = { chain, scan, trust };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PC_KEY_TRUST = api;
})(typeof window !== 'undefined' ? window : globalThis);
