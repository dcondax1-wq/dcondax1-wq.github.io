/* Siri + Shortcuts pack (team JARVIS 2026-11-20, owner: "Olympus should work like a real app from the home screen"). Draws six iOS Shortcuts
 * with the Siri phrase, the exact build steps and a Copy button per URL. Free: Apple's Shortcuts app, this site's public pages and the PC's
 * public status post (the ntfy topic in ../status_feed.json, the same one every Olympus page reads). Read only: no shortcut can trade, arm or
 * change anything. No account ids: the spoken lines use names and dollars only. Classic script, textContent only. window.SHORTCUTS for tests. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const SITE = new URL('../', location.href).href;            // the site root (…/jarvis/shortcuts.html -> …/)
  const J = (q) => new URL('jarvis/?ask=' + encodeURIComponent(q), SITE).href;
  const state = { topic: '', ntfy: 'https://ntfy.sh', ready: false };
  window.SHORTCUTS = state;

  function feedUrl() { return state.topic ? `${state.ntfy.replace(/\/+$/, '')}/${encodeURIComponent(state.topic)}/json?poll=1&since=latest` : ''; }

  function list() {
    const feed = feedUrl();
    const spoken = (what) => [
      `Add "Get Contents of URL" and paste the status link (Copy it above).`,
      'Add "Get Dictionary Value": Get Value for key "message" in Contents of URL.',
      'Add "Get Dictionary from Input" (input: the Dictionary Value from the step before).',
    ].concat(what, ['Add "Speak Text" with that Text. Name the shortcut with the Siri phrase above.',
      'If Siri says blanks: the PC\'s latest post was its extras, not the accounts (it posts both, the accounts last), or the PC is off. Use the Jarvis link below: it merges both and says how old they are.']);
    return [
      { id: 'accounts', siri: 'How are my accounts', what: 'Siri reads each account: balance, room left and today, in dollars. Does not open anything.',
        urls: feed ? [['Status link (the PC\'s latest post)', feed]] : [],
        steps: spoken([
          'Add "Get Dictionary Value" three times on the Dictionary: keys "board.lit.balance", "board.lit.room", "board.lit.today_pnl" (Zlarior 50K), then the same with "board.atlas." (ATLAS).',
          'Add "Text": "Zlarior: [balance] dollars, [room] room left, today [today]. ATLAS: [balance], [room] room left, today [today]." (tap each [ ] and pick the matching value).',
        ]),
        alt: ['Want it simpler? Use "Open URL" with the Jarvis link below instead: Jarvis opens, answers and reads it out (tap the screen once if it waits for "Tap to hear").', J('How are my accounts?')] },
      { id: 'intrade', siri: 'Is a bot in a trade', what: 'Siri says whether ATLAS or Zlarior holds a position right now.',
        urls: feed ? [['Status link (the PC\'s latest post)', feed]] : [],
        steps: spoken([
          'Add "Get Dictionary Value": key "board.atlas.position.side" on the Dictionary.',
          'Add "If" (Dictionary Value has any value): inside add "Text": "ATLAS is in a [side] trade." Otherwise: "ATLAS is flat." Do the same with "board.lit.position.side" for Zlarior.',
        ]),
        alt: ['Simpler: "Open URL" with this Jarvis link (it also tells you the $ open and the stop):', J('Is a bot in a trade?')] },
      { id: 'nq', siri: 'Open NQ', what: 'Opens the NQ page (the bots, their room, the live chart).', urls: [['NQ page', new URL('nq/', SITE).href]],
        steps: ['Add "Open URL" and paste the NQ link.', 'Name the shortcut "Open NQ".'] },
      { id: 'kalshi', siri: 'Open Kalshi', what: 'Opens the Kalshi page.', urls: [['Kalshi page', new URL('kalshi/', SITE).href]],
        steps: ['Add "Open URL" and paste the Kalshi link.', 'Name the shortcut "Open Kalshi".'] },
      { id: 'ask', siri: 'Ask Jarvis', what: 'Siri asks what you want, then Jarvis opens with your question answered.', urls: [['Jarvis ask link (the start)', new URL('jarvis/?ask=', SITE).href]],
        steps: ['Add "Ask for Input" (prompt: "What do you want to ask?").', 'Add "URL Encode" on the Provided Input.', 'Add "Text": paste the Jarvis ask link, then tap after "=" and pick the URL Encoded Text.', 'Add "Open URL" with that Text. Name it "Ask Jarvis".'] },
      { id: 'web', siri: 'Websites next step', what: 'Opens the Agency: your website business, the leads and the Website expert.', urls: [['Agency', new URL('agency/', SITE).href], ['Website expert', new URL('agency/expert/', SITE).href]],
        steps: ['Add "Open URL" and paste the Agency link (or the Website expert link).', 'Name it "Websites next step".'] },
    ];
  }

  function copyRow(label, url) {
    const row = el('div', 'sc-copy');
    const code = el('code', '', url); code.setAttribute('aria-label', label);
    const b = el('button', '', 'Copy'); b.type = 'button'; b.setAttribute('aria-label', 'Copy ' + label);
    b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); b.textContent = 'Copied'; } catch (_) { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected'; } setTimeout(() => { b.textContent = 'Copy'; }, 1800); });
    row.append(code, b);
    const wrap = el('div', 'sc-url'); wrap.append(el('p', 'sc-ul', label), row);
    return wrap;
  }
  function draw() {
    const box = $('list'); box.replaceChildren();
    for (const s of list()) {
      const c = el('article', 'sc-card'); c.id = 'sc-' + s.id;
      c.append(el('h2', '', `"Hey Siri, ${s.siri}"`), el('p', 'sc-what', s.what));
      for (const [l, u] of s.urls) c.append(copyRow(l, u));
      if (!s.urls.length && (s.id === 'accounts' || s.id === 'intrade')) c.append(el('p', 'sc-what', 'The status link is not available on this site copy (status_feed.json missing): use the Jarvis version below.'));
      const ol = el('ol', 'sc-steps'); ol.append(el('li', '', 'Open the Shortcuts app, tap +, then "Add Action".')); for (const st of s.steps) ol.append(el('li', '', st)); c.append(ol);
      if (s.alt) { c.append(el('p', 'sc-what', s.alt[0])); c.append(copyRow('Jarvis link', s.alt[1])); }
      box.append(c);
    }
  }
  async function start() {
    try { const r = await fetch(new URL('status_feed.json', SITE).href, { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); if (j && typeof j.topic === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(j.topic)) { state.topic = j.topic; if (typeof j.ntfy === 'string' && /^https:\/\/[A-Za-z0-9.-]+$/.test(j.ntfy)) state.ntfy = j.ntfy; } } } catch (_) { /* offline: the Jarvis versions still work */ }
    draw(); state.ready = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
