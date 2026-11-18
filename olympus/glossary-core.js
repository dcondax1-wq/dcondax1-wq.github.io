// OLYMPUS plain words (tools/web_public/olympus/glossary-core.js, 2026-11-04): the one place that says what the trading words mean.
// An app opts in with a tiny file of its own and ONE line in its index.html:
//
//   <script type="module" src="glossary.js"></script>          // glossary.js:  import { watch, pick } from '../olympus/glossary-core.js';
//                                                              //               watch(pick(['IFVG', 'sweep', 'PF']));
//
// watch(terms) underlines the words it knows (a dotted line, <abbr class="oly-gl" title="...">) and a tap on one shows the plain meaning in a
// small bubble (a title alone never shows on a phone). Safari 16 safe: no lookbehind. It only touches visible text, never an input, a script, a canvas or a word that
// already has a title; at most 6 underlines per word on a page; it follows the page when the app redraws; it never changes what the page
// says and never throws. Reduced motion: the bubble has no animation.
export const TERMS = {
  IFVG: 'Inverse fair-value gap: a gap in price that price later runs back through, after which the gap pushes the other way.',
  CISD: 'Change in state of delivery: price stops pushing one way and closes back through the last opposite candle. The first sign of a turn.',
  inducement: 'A small move that tempts traders in early, just before the real move the other way.',
  displacement: 'A fast, strong move in one direction (big candles, hardly any pullback).',
  sweep: 'Price pokes through an obvious high or low to grab the orders waiting there, then turns back.',
  liquidity: 'The orders (and stop losses) parked at obvious highs and lows. Price is drawn to them.',
  confluence: 'Several reasons lining up at the same time.',
  PF: 'Profit factor: money won divided by money lost. Above 1 means it made money.',
  drawdown: 'How far the account fell from its best point.',
  FDR: 'False discovery rate: a guard that stops flukes from looking like finds. "Survives" means the idea passed it.',
  p10: 'The chance an eval is PASSED within 10 trading sessions.',
  f10: 'The chance an eval is FAILED within 10 trading sessions.',
  EV: 'Expected value: what a bet is worth on average.',
  MFE: 'Best move in your favour while the trade was open.',
  MAE: 'Worst move against you while the trade was open.',
  MLL: 'Max loss limit: the floor your account must never touch.',
  OOS: 'Out of sample: data the idea never saw while it was being built.',
  slippage: 'The gap between the price you expected and the price you got.',
  expectancy: 'The average money made per trade.',
};
const CASE_SENSITIVE = new Set(['IFVG', 'CISD', 'PF', 'FDR', 'p10', 'f10', 'EV', 'MLL', 'OOS', 'MFE', 'MAE']);
const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|CANVAS|SVG|ABBR|CODE|PRE|NOSCRIPT|TITLE)$/;
const MAX_PER_TERM = 6;

/** a sub-dictionary: pick(['sweep', 'PF']) -> { sweep: '...', PF: '...' } (unknown names are ignored) */
export const pick = (names) => Object.fromEntries((names || []).filter((n) => TERMS[n]).map((n) => [n, TERMS[n]]));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function watch(terms, opts = {}) {
  const names = Object.keys(terms || {});
  if (!names.length || typeof document === 'undefined') return { stop() {} };
  const sens = names.filter((n) => CASE_SENSITIVE.has(n)), loose = names.filter((n) => !CASE_SENSITIVE.has(n));
  const parts = [...sens.map((n) => `\\b${esc(n)}\\b`), ...loose.map((n) => `\\b${esc(n)}(?:s|es|ed)?\\b`)];
  const re = new RegExp(parts.join('|'), 'g'), reI = new RegExp(`^(?:${loose.map(esc).join('|') || '(?!)'})`, 'i');
  const count = Object.fromEntries(names.map((n) => [n, 0]));
  const root = opts.root || document.body;
  let timer = 0, stopped = false, bubble = null, hideT = 0;

  const keyOf = (word) => names.find((n) => n === word) || names.find((n) => !CASE_SENSITIVE.has(n) && reI.test(word) && word.toLowerCase().startsWith(n.toLowerCase()));

  function wrapNode(tn) {
    const text = tn.nodeValue;
    re.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = re.exec(text))) {
      const key = keyOf(m[0]);
      if (!key || count[key] >= MAX_PER_TERM) continue;
      count[key]++;
      frag = frag || document.createDocumentFragment();
      frag.append(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('abbr');
      a.className = 'oly-gl'; a.title = terms[key]; a.setAttribute('data-gl', key); a.textContent = m[0];
      frag.append(a);
      last = m.index + m[0].length;
    }
    if (frag) { frag.append(document.createTextNode(text.slice(last))); tn.replaceWith(frag); }
  }

  const dbg = (window.__olyGlossary = window.__olyGlossary || { scans: 0, err: '', last: 0 });   // for the tests / the crawler: how many scans, the last error, when
  function scan() {
    timer = 0;
    if (stopped) return;
    dbg.scans++; dbg.last = Date.now(); dbg.pending = false;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || !n.nodeValue.trim() || SKIP.test(p.tagName.toUpperCase()) || p.closest('abbr, [contenteditable], [hidden], [aria-hidden="true"]') || p.title) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const list = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) list.push(n);
      // a word already underlined on the page counts toward the cap (a redraw replaces the nodes: recount from the DOM)
      for (const k of names) count[k] = root.querySelectorAll(`abbr.oly-gl[data-gl="${k}"]`).length;
      for (const n of list) wrapNode(n);
    } catch (e) { dbg.err = String(e && e.message || e); /* plain words are optional */ }
  }
  const later = () => { if (!timer && !stopped) { dbg.pending = true; timer = setTimeout(scan, 450); } };

  if (!document.getElementById('olyGlossaryCss')) {
    const st = document.createElement('style');
    st.id = 'olyGlossaryCss';
    st.textContent = 'abbr.oly-gl{text-decoration:underline dotted rgba(255,255,255,.55);text-underline-offset:3px;cursor:help}'
      + '.oly-gl-tip{position:fixed;z-index:90;max-width:min(280px,calc(100vw - 24px));padding:9px 12px;border-radius:12px;pointer-events:none;'
      + 'background:rgba(9,11,22,.96);border:1px solid rgba(255,255,255,.22);color:#f3f5fb;font:600 13px/1.35 var(--oly-ui,system-ui,sans-serif);box-shadow:0 8px 28px rgba(0,0,0,.5)}'
      + '.oly-gl-tip b{display:block;margin-bottom:2px;font:800 11px/1 var(--oly-display,system-ui,sans-serif);letter-spacing: .05em;text-transform:uppercase;color:var(--oly-accent,#c9a06a)}';
    document.head.append(st);
  }
  function show(a) {
    hide();
    bubble = document.createElement('div');
    bubble.className = 'oly-gl-tip'; bubble.setAttribute('role', 'tooltip');
    const b = document.createElement('b'); b.textContent = a.getAttribute('data-gl') || '';
    bubble.append(b, document.createTextNode(a.title));
    document.body.append(bubble);
    const r = a.getBoundingClientRect(), w = bubble.offsetWidth, h = bubble.offsetHeight;
    const x = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)), y = r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8;
    bubble.style.left = x + 'px'; bubble.style.top = y + 'px';
    clearTimeout(hideT); hideT = setTimeout(hide, 4500);
  }
  function hide() { if (bubble) { bubble.remove(); bubble = null; } }
  const onTap = (e) => { const a = e.target && e.target.closest ? e.target.closest('abbr.oly-gl') : null; if (a) show(a); else hide(); };
  document.addEventListener('click', onTap, true);        // capture + no preventDefault: the app still gets every tap
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(later) : null;
  if (mo) mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });   // a panel un-hidden is a change too
  scan();
  return { stop() { stopped = true; if (mo) mo.disconnect(); document.removeEventListener('click', onTap, true); hide(); }, scan, count };
}
