/* Ask Jarvis, on every app (team JARVIS 2026-11-20, owner: "Jarvis reachable from every app in one tap"). One self-contained classic
 * script, no dependencies: a small round button (44 px, bottom left, above the safe area) that opens a sheet with the questions that fit
 * THIS page ("on NQ: ask about this account"), answered right there by jarvis/biz.js from the real feeds (the PC report + the site's
 * JSON), dollars first, with the source and its age; "Open Jarvis" carries the question into the full Jarvis (jarvis/?ask=...).
 * Read only: it never sends orders, arms or changes anything. Offline: the last PC report this phone saw, with its age.
 *
 *   <script src="../jarvis/ask.js" defer data-app="nq"></script>          the button mounts itself (data-app: the page's app id; else the folder)
 *   <script src="../jarvis/ask.js" defer data-auto="off"></script>         the kit mounts it: OLY_ASK.mount({ app: 'nq', host: el })
 *   window.OLY_ASK = { mount(opts), open(question?), close(), chipsFor(app), answer(question) -> Promise<{text, src}> }
 * Style hooks for the design kit: .oly-ask-btn / .oly-ask-sheet and the CSS variables --oly-ask-accent, --oly-ask-bg, --oly-ask-text.
 * Never on the Jarvis page itself (it IS Jarvis). Safari 15+, text only through textContent. */
(function () {
  'use strict';
  if (window.OLY_ASK) return;
  const me = document.currentScript;
  const BASE = (() => { try { return new URL('.', me && me.src ? me.src : location.href).href; } catch (_) { return './'; } })();   // .../jarvis/
  const SITE = new URL('../', BASE).href;
  const LITE_KEY = 'jarvis.biz.lite';
  const Q = {
    accounts: ['Accounts', 'How are my accounts?'], intrade: ['In a trade?', 'Is ATLAS in a trade?'], room: ['Room left', 'How much room does Zlarior have?'],
    today: ['Today', 'What did the bots do today?'], week: ['This week', 'What did the bots do this week?'], payout: ['First payout', 'When is my first payout?'],
    payoutnow: ['Payout now?', 'Can I ask for a payout?'], taxes: ['Taxes', 'How much for taxes?'], month: ['$ a month', 'How much will I make a month?'],
    decide: ['Decide', 'What do you recommend?'], steps: ['To-do', 'What should I do today?'], pc: ['PC OK?', 'Is the PC OK?'], news: ['News', "What's on the news today?"],
    kalshi: ['Kalshi', "How's Kalshi?"], pass: ['To pass', 'How far to pass?'], edge: ['Edge', 'Is the edge OK?'],
    web3d: ['Price 3D', 'How do I price a 3D site?'], webniche: ['Best 3D trades', 'Best niche for 3D?'], websay: ['Roofer words', 'What do I say to a roofer?'],
    webobj: ['Objections', 'How do I handle objections?'], webgbp: ['Google profile', 'How do I sell a Google Business Profile fix?'], weboffers: ['The offers', 'What should I charge for a website?'],
  };
  // the page's own questions first (by app id / folder); the rest of the four come from the default set
  const BY_APP = [
    [/^(nq|zenith|trading|board|aegis|ares|argus|odeon|nqdash)/, 'NQ', ['intrade', 'room', 'today', 'accounts', 'pass', 'edge']],
    [/^(kalshi|kalshicity|tyche)/, 'Kalshi', ['kalshi', 'news', 'pc', 'steps']],
    [/^(business|money|plutus|hermes|ledger|mint|oikos|taxes|demeter)/, 'Money', ['payout', 'payoutnow', 'taxes', 'month', 'decide', 'accounts']],
    [/^(hub|gate|olympus|planner|helios|settings|atlas)/, 'Olympus', ['steps', 'decide', 'pc', 'accounts', 'news', 'intrade']],
    [/^(pythia|news|kairos)/, 'News', ['news', 'intrade', 'today', 'steps']],
    [/^(agency|expert|call)/, 'Agency', ['weboffers', 'web3d', 'webniche', 'websay', 'webobj', 'webgbp']],   // the website business (team web-expert)
  ];
  const DEFAULT = ['accounts', 'intrade', 'steps', 'pc', 'payout', 'news'];
  function appOf() {
    const d = me && me.dataset && me.dataset.app;
    if (d) return String(d).toLowerCase();
    try { const p = new URL(location.href).pathname.replace(/\/index\.html$/, '/').split('/').filter(Boolean); return (p[p.length - 1] || '').toLowerCase(); } catch (_) { return ''; }
  }
  function chipsFor(app) {
    const a = String(app || '').toLowerCase();
    for (const [rx, label, ids] of BY_APP) if (rx.test(a)) return { label, ids };
    return { label: '', ids: DEFAULT };
  }

  // ---------------------------------------------------------------------------------------------- the data: biz.js + the PC report
  let bizP = null, liteP = null, liteAt = 0;
  const biz = () => bizP || (bizP = import(new URL('biz.js?v=b3', BASE).href).catch(() => { bizP = null; return null; }));
  function script(src, global) {
    if (window[global]) return Promise.resolve(window[global]);
    return new Promise((ok) => { const s = document.createElement('script'); s.src = new URL(src, SITE).href; s.async = true; s.onload = () => ok(window[global] || null); s.onerror = () => ok(null); document.head.appendChild(s); });
  }
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private / full */ } };
  function lite() {
    if (liteP && Date.now() - liteAt < 60e3) return liteP;
    liteAt = Date.now();
    liteP = (async () => {
      const F = await script('pc_feed.js?v=n6', 'PC_FEED');
      let j = null;
      if (F && typeof F.fetchLatest === 'function') {
        try { j = await Promise.race([F.fetchLatest({ feedUrl: new URL('status_feed.json', SITE).href }), new Promise((r) => setTimeout(() => r(null), 6000))]); } catch (_) { j = null; }
      }
      if (j && typeof j === 'object') { lsSet(LITE_KEY, { at: Date.now(), j }); return { j, cached: false }; }
      const k = lsGet(LITE_KEY);
      return k && k.j ? { j: k.j, cached: true } : null;
    })();
    return liteP;
  }
  async function answer(text) {
    const B = await biz();
    if (!B) return { text: 'Jarvis could not load here. Open Jarvis for the answer.', src: '' };
    if (!B.match(text)) return { text: 'Here I answer the money questions (accounts, trades, room, payouts, the to-do list, the PC, Kalshi, news) and the website business (prices, 3D, what to say). For anything else, open Jarvis.', src: '' };
    const L0 = await lite(), L = L0 ? B.liveFromLite(L0.j, L0.cached) : null;
    if (L && L0.cached && L0.j) L.raw = null;
    const r = await B.ask(text, { facts: () => ({ live: L }), refreshLive: null, feed: window.PC_FEED || null });
    if (!r) return { text: 'I have nothing new on that here. Open Jarvis for the full answer.', src: '' };
    return { text: r.speak || r.text, src: r.src || '' };
  }

  // ---------------------------------------------------------------------------------------------- the look (self-contained; the kit may restyle)
  const CSS = `
.oly-ask-btn{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:44px;height:44px;border-radius:50%;
 border:1px solid var(--oly-ask-accent,#c8a24a);background:var(--oly-ask-bg,rgba(20,16,10,.88));color:var(--oly-ask-accent,#dcbd6e);display:grid;place-items:center;padding:0;cursor:pointer;
 box-shadow:0 4px 14px rgba(0,0,0,.45);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.oly-ask-btn:focus-visible{outline:2px solid var(--oly-ask-accent,#dcbd6e);outline-offset:3px}
.oly-ask-btn svg{width:22px;height:22px}
.oly-ask-back{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45)}
.oly-ask-sheet{position:fixed;left:0;right:0;bottom:0;z-index:2147483002;max-height:82vh;overflow:auto;overscroll-behavior:contain;background:var(--oly-ask-bg,#17130e);color:var(--oly-ask-text,#f3ece0);
 border-top:1px solid var(--oly-ask-accent,#c8a24a);border-radius:16px 16px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));font:500 16px/1.4 system-ui,-apple-system,sans-serif}
.oly-ask-sheet h2{margin:0 0 10px;font:700 17px/1.2 system-ui,-apple-system,sans-serif;display:flex;justify-content:space-between;align-items:center;gap:8px}
.oly-ask-x{min-width:44px;min-height:44px;border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer}
.oly-ask-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 10px}
.oly-ask-chips button{min-height:44px;min-width:0;padding:6px 8px;border-radius:12px;border:1px solid var(--oly-ask-accent,#c8a24a);background:transparent;color:inherit;font:600 15px/1.1 system-ui,-apple-system,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.oly-ask-form{display:flex;gap:8px;margin:0 0 10px}
.oly-ask-form input{flex:1;min-width:0;min-height:44px;border-radius:12px;border:1px solid rgba(243,236,224,.25);background:rgba(0,0,0,.3);color:inherit;padding:0 12px;font:16px system-ui,-apple-system,sans-serif}
.oly-ask-form button,.oly-ask-open{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--oly-ask-accent,#c8a24a);background:var(--oly-ask-accent,#c8a24a);color:#17130e;font:700 15px system-ui,-apple-system,sans-serif;cursor:pointer}
.oly-ask-open{display:inline-flex;align-items:center;text-decoration:none;background:transparent;color:var(--oly-ask-accent,#dcbd6e)}
.oly-ask-out{white-space:pre-line;margin:0 0 6px;min-height:1.4em}
.oly-ask-src{margin:0 0 12px;font-size:13px;opacity:.75}
@media (prefers-reduced-motion:no-preference){.oly-ask-sheet{animation:olyAskUp .18s ease-out}@keyframes olyAskUp{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}}`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  let btn = null, sheet = null, back = null, lastFocus = null, ctx = { app: '', label: '', ids: DEFAULT };
  function mount(opts) {
    const o = opts || {};
    if (btn || /\/jarvis\/(index\.html)?$/.test(location.pathname)) return btn;
    ctx = { app: o.app || appOf(), ...chipsFor(o.app || appOf()) };
    if (!document.getElementById('oly-ask-css')) { const st = el('style'); st.id = 'oly-ask-css'; st.textContent = CSS; document.head.appendChild(st); }
    btn = el('button', 'oly-ask-btn'); btn.type = 'button';
    btn.setAttribute('aria-label', `Ask Jarvis${ctx.label ? ' about ' + ctx.label : ''}`); btn.title = 'Ask Jarvis';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>';
    btn.addEventListener('click', () => open());
    (o.host || document.body).appendChild(btn);
    if (!o.host) document.body.classList.add('oly-has-ask');   // QA 2026-11-20: the page's last lines scroll clear of the button
    return btn;
  }
  function close() {
    if (!sheet) return;
    sheet.remove(); back.remove(); sheet = back = null;
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (_) { /* gone */ }
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab' && sheet) {                                   // keep the focus inside the sheet
      const f = [...sheet.querySelectorAll('button, input, a[href]')].filter((x) => !x.disabled);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }
  function open(question) {
    if (sheet) close();
    lastFocus = document.activeElement;
    back = el('div', 'oly-ask-back'); back.addEventListener('click', close);
    sheet = el('section', 'oly-ask-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'oly-ask-h');
    const h = el('h2'); const ht = el('span', '', `Ask Jarvis${ctx.label ? ' · on ' + ctx.label : ''}`); ht.id = 'oly-ask-h';
    const x = el('button', 'oly-ask-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', close);
    h.append(ht, x);
    const chips = el('div', 'oly-ask-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Questions for this page');
    for (const id of ctx.ids.slice(0, 6)) { const [label, q] = Q[id] || []; if (!q) continue; const c = el('button', '', label); c.type = 'button'; c.dataset.q = q; c.addEventListener('click', () => run(q)); chips.appendChild(c); }
    const form = el('form', 'oly-ask-form'); const inp = el('input'); inp.type = 'text'; inp.placeholder = 'Ask about the money…'; inp.setAttribute('aria-label', 'Your question'); inp.autocomplete = 'off';
    const go = el('button', '', 'Ask'); go.type = 'submit'; form.append(inp, go);
    form.addEventListener('submit', (e) => { e.preventDefault(); const q = inp.value.trim(); if (q) run(q); });
    const out = el('p', 'oly-ask-out'); out.setAttribute('aria-live', 'polite'); out.id = 'oly-ask-out';
    const src = el('p', 'oly-ask-src');
    const link = el('a', 'oly-ask-open', 'Open Jarvis'); link.href = new URL('./', BASE).href;
    sheet.append(h, chips, form, out, src, link);
    document.body.append(back, sheet);
    document.addEventListener('keydown', onKey, true);
    (chips.querySelector('button') || inp).focus();
    let n = 0;
    async function run(q) {
      const my = ++n;
      out.textContent = 'Checking…'; src.textContent = '';
      link.href = new URL('./?ask=' + encodeURIComponent(q.slice(0, 200)), BASE).href;
      let r;
      try { r = await answer(q); } catch (_) { r = { text: 'Something went wrong. Open Jarvis for the answer.', src: '' }; }
      if (my !== n || !sheet) return;
      out.textContent = r.text; src.textContent = r.src;
    }
    if (question) run(String(question));
  }
  window.OLY_ASK = { mount, open, close, chipsFor, answer, version: 'a1' };
  if (!(me && me.dataset && me.dataset.auto === 'off')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(), { once: true }); else mount();
  }
})();
