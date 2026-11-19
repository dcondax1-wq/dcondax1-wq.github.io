// ZEUS edge chip (2026-11-18, docs: research/writeups/edge-health-2026-11-17.md). One small chip on the Board, Trading and MFFU pages:
//   "ZEUS edge: GREEN · last 40 sessions PF 3.8 vs 2026 3.9 · data to Nov 6"  (+ ATLAS the same way, at a fixed size)
// Tap it: what the light means and what to do on AMBER / RED (nothing automatic; ZEUS Lab will propose).
// Data: the PC status key "eh" (tools/edge_pc.read_tiny: the PC's daily `tools/edge_health.py --pc` on its own fresh bars) or the
// site's ../edge.json (the cloud's run), whichever reaches the newer day. eh = {d: LIT data to, z: [G|A|R, PF40, 2026 PF],
// a: [G|A|R, R-PF40, 2026 R-PF, ATLAS data to], t: built}. A warning, not a switch: it changes no bot.
// Classic script (window.EDGE_CHIP) + CommonJS for node tests (tests/test_edge_chip.py). Text only through textContent.
//   valid(eh) / pick(siteJson, lite) / lines(eh, nowS) / help(eh)     pure
//   mount(el, {site, lite, url, feed}) / update(lite)                   DOM; [data-edge-chip] elements mount themselves
(function (root) {
  'use strict';
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const WORD = { G: 'GREEN', A: 'AMBER', R: 'RED' };
  const LEVEL = { G: 'good', A: 'warn', R: 'bad' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

  function valid(eh) {
    return isObj(eh) && isDay(eh.d) && Array.isArray(eh.z) && eh.z.length >= 3 && !!WORD[eh.z[0]] ? eh : null;
  }

  // the freshest of the site's copy and the PC's status: the later "data to" day wins, then the later build
  function pick(site, lite) {
    const s = valid(isObj(site) ? site.eh : null), l = valid(isObj(lite) ? lite.eh : null);
    if (!s || !l) return l ? { eh: l, src: 'pc' } : s ? { eh: s, src: 'site' } : null;
    if (l.d !== s.d) return l.d > s.d ? { eh: l, src: 'pc' } : { eh: s, src: 'site' };
    return (+l.t || 0) >= (+s.t || 0) ? { eh: l, src: 'pc' } : { eh: s, src: 'site' };
  }

  const md = (d) => (isDay(d) ? MON[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) : '?');
  const pf = (v) => (okN(v) ? (v >= 20 ? '20+' : (Math.round(v * 10) / 10).toFixed(1)) : '?');
  const daysOld = (d, nowS) => (isDay(d) && okN(nowS) ? Math.floor((nowS * 1000 - Date.parse(d + 'T21:00:00Z')) / 86400000) : 0);

  function lines(eh, nowS) {
    const e = valid(eh);
    if (!e) return null;
    const now = okN(nowS) ? nowS : Date.now() / 1000;
    const old = (d) => (daysOld(d, now) > 7 ? ' (old)' : '');
    const z = e.z, out = {
      light: WORD[z[0]], level: LEVEL[z[0]],
      main: 'ZEUS edge: ' + WORD[z[0]] + ' · last 40 sessions PF ' + pf(z[1]) + ' vs 2026 ' + pf(z[2]) + ' · data to ' + md(e.d) + old(e.d),
    };
    const a = Array.isArray(e.a) && WORD[e.a[0]] ? e.a : null;
    if (a) {
      out.atlas = 'ATLAS: ' + WORD[a[0]] + ' · last 40 sessions PF ' + pf(a[1]) + ' vs 2026 ' + pf(a[2]) + ' (fixed size) · data to ' + md(a[3]) + old(a[3]);
      out.atlasLevel = LEVEL[a[0]];
    }
    return out;
  }

  function help(eh) {
    const e = valid(eh), worst = e ? [e.z[0], ...(Array.isArray(e.a) ? [e.a[0]] : [])].sort((x, y) => 'GAR'.indexOf(y) - 'GAR'.indexOf(x))[0] : null;
    const now = worst === 'R' ? 'Now RED: nothing changes by itself. ZEUS Lab will propose what to do; do not buy a new eval while it is RED.'
      : worst === 'A' ? 'Now AMBER: nothing changes by itself. ZEUS Lab looks at it and will propose a change only if one passes the tests. Wait for the next payout before buying another eval.'
        : 'Now GREEN: nothing to do.';
    return [
      'What it is: ZEUS\'s own last 40 sessions (about 8 weeks) next to 2026 Jan-Jun, when it made money. PF = $ won per $ lost (above 1 = making money). ATLAS is measured at a fixed size, because the eval\'s sizing bends its $.',
      'GREEN = the last 8 weeks look like 2026. Fine to buy the next eval.',
      'AMBER = weaker than 2026, still positive. Nothing automatic: the bots trade the same. ZEUS Lab will propose if a change passes the tests. Wait for the next payout before buying.',
      'RED = the last 8 weeks look like 2021-25 (about $0). Still nothing automatic: ZEUS Lab will propose. Do not buy a new eval while RED.',
      now,
      'It says what the last weeks were, not what comes next. Your PC refreshes it daily after 17:00 ET; else the cloud copy (older bars).',
    ];
  }

  // ------------------------------------------------------------------------------------------ DOM
  const chips = [];
  let siteP = null;

  function css() {
    if (typeof document === 'undefined' || document.getElementById('edge-chip-css')) return;
    const s = document.createElement('style');
    s.id = 'edge-chip-css';
    s.textContent = '.edge-chip{margin:8px 0 12px;max-width:100%}'
      + '.edge-chip button{display:block;width:100%;min-height:44px;text-align:left;font:inherit;font-size:.85rem;line-height:1.35;color:inherit;'
      + 'background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:8px 12px;cursor:pointer;overflow-wrap:anywhere}'
      + '.edge-chip .ec-row{display:block}.edge-chip .ec-row+.ec-row{margin-top:2px;opacity:.85}'
      + '.edge-chip .ec-dot{display:inline-block;width:.6em;height:.6em;border-radius:50%;margin-right:.45em;background:#a9a9b3;vertical-align:.05em}'
      + '.edge-chip .good .ec-dot,.edge-chip .ec-dot.good{background:#9fcf8a}.edge-chip .warn .ec-dot,.edge-chip .ec-dot.warn{background:#e0b85a}'
      + '.edge-chip .bad .ec-dot,.edge-chip .ec-dot.bad{background:#e07a6a}'
      + '.edge-chip button.good{border-color:rgba(159,207,138,.5)}.edge-chip button.warn{border-color:rgba(224,184,90,.6)}.edge-chip button.bad{border-color:rgba(224,122,106,.7)}'
      + '.edge-chip .ec-help{margin:6px 2px 0;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.18);font-size:.85rem;line-height:1.4}'
      + '.edge-chip .ec-help p{margin:0 0 6px;overflow-wrap:anywhere}.edge-chip .ec-help p.ec-now{font-weight:600}.edge-chip .ec-src{opacity:.7;font-size:.75rem}';
    (document.head || document.documentElement).appendChild(s);
  }

  function getSite(url) {
    if (!siteP) {
      siteP = (typeof fetch === 'function' ? fetch(url || '../edge.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)) : Promise.resolve(null))
        .catch(() => null);
    }
    return siteP;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function draw(c) {
    const p = pick(c.site, c.lite), L = p ? lines(p.eh) : null;
    const box = c.el;
    box.classList.add('edge-chip');
    box.textContent = '';
    if (!L) { box.hidden = true; return; }
    box.hidden = false;
    const b = el('button', L.level);
    b.type = 'button';
    b.setAttribute('aria-expanded', c.open ? 'true' : 'false');
    const r1 = el('span', 'ec-row ' + L.level); r1.appendChild(el('span', 'ec-dot ' + L.level)); r1.appendChild(document.createTextNode(L.main)); b.appendChild(r1);
    if (L.atlas) { const r2 = el('span', 'ec-row ' + L.atlasLevel); r2.appendChild(el('span', 'ec-dot ' + L.atlasLevel)); r2.appendChild(document.createTextNode(L.atlas)); b.appendChild(r2); }
    const h = el('div', 'ec-help');
    h.id = (box.id || 'edgechip') + '-help';
    h.hidden = !c.open;
    b.setAttribute('aria-controls', h.id);
    const H = help(p.eh);
    H.forEach((t, i) => h.appendChild(el('p', i === 4 ? 'ec-now' : null, t)));
    const when = okN(+p.eh.t) && +p.eh.t > 0 ? new Date(+p.eh.t * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '?';
    h.appendChild(el('p', 'ec-src', (p.src === 'pc' ? 'From your PC (its own NinjaTrader bars), built ' : 'Cloud copy (TradingView files + the PC\'s last bars), built ') + when + '. A warning, not a switch.'));
    b.addEventListener('click', () => { c.open = !c.open; h.hidden = !c.open; b.setAttribute('aria-expanded', c.open ? 'true' : 'false'); });
    box.appendChild(b);
    box.appendChild(h);
  }

  function mount(node, opts) {
    if (!node || typeof document === 'undefined') return null;
    const o = opts || {};
    let c = chips.find((x) => x.el === node);
    if (!c) { c = { el: node, site: null, lite: null, open: false }; chips.push(c); css(); }
    if (o.lite !== undefined) c.lite = o.lite;
    if (o.site !== undefined) c.site = o.site;
    draw(c);
    if (o.site === undefined && !c.site) getSite(o.url).then((s) => { c.site = s; draw(c); });
    if (o.feed && !c.lite) feedLite(o.feedUrl).then((l) => { if (l && !c.lite) { c.lite = l; draw(c); } });
    return c;
  }

  // a page that already has the PC's status (board.js, mffu.js) hands it over; every chip redraws
  function update(lite) {
    for (const c of chips) { c.lite = lite || c.lite; draw(c); }
  }

  // Trading: no lite of its own, so read the PC status once (pc_feed.js is loaded there by olympus/truth.js; wait up to ~4 s for it)
  function feedLite(feedUrl) {
    return new Promise((res) => {
      let n = 0;
      const go = () => {
        const F = root.PC_FEED;
        if (F && typeof F.fetchLatest === 'function') {
          Promise.race([F.fetchLatest(feedUrl ? { feedUrl } : {}), new Promise((r) => setTimeout(() => r(null), 4000))]).then(res, () => res(null));
        } else if (++n < 16) setTimeout(go, 250); else res(null);
      };
      go();
    });
  }

  function auto() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-edge-chip]').forEach((n) => {
      // the PC's status_feed.json sits at the site root next to edge.json (night-bugsweep: with no path the feed reader tried the page's own
      // folder first, /trading/status_feed.json, a 404 on every Trading load)
      const src = n.getAttribute('data-edge-src') || '../edge.json';
      mount(n, { url: src, feed: n.hasAttribute('data-edge-feed'), feedUrl: n.getAttribute('data-edge-feed') || src.replace(/[^/]*$/, 'status_feed.json') });
    });
  }

  const API = { valid, pick, lines, help, mount, update };
  root.EDGE_CHIP = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  }
})(typeof window !== 'undefined' ? window : globalThis);
