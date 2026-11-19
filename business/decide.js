// THE DECIDE CARD (classic script, 2026-11-18, night-decide; docs/BOARD.md "Decide card"). On the Board and the ZEUS page: every
// open decision from ./decisions.json (Claude keeps that one file) with its question, a one-line why, its $ impact and (when
// tools/money/money_plan.py valued it) Claude's yes / no with the reason and the risk in plain words.
//  - On the PC's private Tailscale link (the site under /site/): Yes / No / Later buttons. A tap posts ONE owner note,
//    {"text": "Decide <id>: YES - <question>", "decision", "answer"}, to /inbox/board (engine/day_inbox kind "board"). Claude reads
//    it next session (python tools/board.py read, "owner notes not answered") and applies it by the CLAUDE.md rules.
//  - Anywhere else (the public site): no buttons, no write: "Open on your PC link to answer" and the exact question.
//  - A tap NEVER changes a live setting by itself.
// Mount: any element with data-decide (data-decide-src / data-decide-board override the two files). Text only through textContent.
// window.DECIDE is the test hook (and module.exports for node).
(function (root) {
  'use strict';
  const ANSWERS = ['yes', 'no', 'later'];
  const WORD = { yes: 'Yes', no: 'No', later: 'Later' };
  const RX = /^Decide\s+([a-z0-9][a-z0-9_-]{1,39})\s*:\s*(YES|NO|LATER)\b/i;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

  function onPc(pathname) { return /^\/site\//.test(String(pathname || '')); }

  function openItems(doc) {
    const items = isObj(doc) && Array.isArray(doc.items) ? doc.items : [];
    return items.filter((d) => isObj(d) && d.id && d.question && String(d.status || 'open') === 'open');
  }

  // the newest answer per decision id from the board's events (an owner_note with data.decision, or its text "Decide <id>: YES")
  function answers(events) {
    const out = {};
    for (const e of Array.isArray(events) ? events : []) {
      if (!isObj(e) || (e.kind && e.kind !== 'owner_note')) continue;
      const d = isObj(e.data) ? e.data : {};
      let id = d.decision, a = d.answer;
      if (!id) { const m = RX.exec(String(e.text || '')); if (m) { id = m[1].toLowerCase(); a = m[2]; } }
      a = String(a || '').toLowerCase();
      if (!id || !ANSWERS.includes(a)) continue;
      const t = Number(e.t) || 0;
      if (!out[id] || t >= out[id].t) out[id] = { answer: a, t };
    }
    return out;
  }

  function noteText(item, ans) {
    return ('Decide ' + item.id + ': ' + String(ans).toUpperCase() + ' - ' + String(item.question || '')).slice(0, 200);
  }

  function body(item, ans) {
    if (!isObj(item) || !ANSWERS.includes(ans)) return null;
    return { text: noteText(item, ans), decision: String(item.id), answer: ans };
  }

  const api = { ANSWERS, onPc, openItems, answers, noteText, body, last: null, ok: null };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  root.DECIDE = api;

  // ---------------------------------------------------------------------------------------------- the page part
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const ET = (t) => { try { return new Date(t * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'; } catch (e) { return ''; } };
  const CSS = '.dc{margin:14px 0 0;padding:14px 16px;border-radius:16px;background:var(--ag-s2,#221d17);border:1px solid var(--ag-line,#3a3228);border-top:3px solid var(--ag-gold,#c8a24a);box-sizing:border-box}'
    + '.dc h2{margin:0;font:700 1.15rem/1.2 var(--ag-serif,Georgia,serif);color:var(--ag-gold-hi,#dcbd6e)}'
    + '.dc-hint{margin:4px 0 0;color:var(--ag-muted,#a89c88);font-size:.85rem}'
    + '.dc-item{margin-top:12px;padding-top:12px;border-top:1px solid var(--ag-line,#3a3228)}'
    + '.dc-q{margin:0;font-weight:700;overflow-wrap:anywhere}.dc-why,.dc-imp,.dc-sent,.dc-say{margin:4px 0 0;font-size:.9rem;overflow-wrap:anywhere}'
    + '.dc-why{color:var(--ag-soft,#cfc4b2)}.dc-imp{color:var(--ag-gold-hi,#dcbd6e);font-weight:600}.dc-sent{color:var(--ag-olive-text,#a0ac6e)}'
    + '.dc-rec,.dc-risk{margin:4px 0 0;font-size:.9rem;overflow-wrap:anywhere}.dc-rec{font-weight:700}.dc-rec.y{color:#a6d47f}.dc-rec.n{color:#ff9d8f}'
    + '.dc-rec.l{color:var(--ag-sun,#e0b060)}.dc-risk{color:var(--ag-muted,#a89c88)}'
    + '.dc-btns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}'
    + '.dc-btns button{min-height:44px;border-radius:12px;font:700 1rem var(--ag-sans,system-ui);color:var(--ag-text,#f3ece0);background:var(--ag-s1,#1b1713);border:1px solid var(--ag-line,#3a3228);cursor:pointer}'
    + '.dc-btns button.yes{border-color:#8fbf6a}.dc-btns button.no{border-color:#ff8a7a}.dc-btns button.on{background:var(--ag-gold,#c8a24a);color:#14110e}.dc-btns button:disabled{opacity:.6}'
    + '.dc-off{margin-top:8px;padding:10px 12px;border-radius:12px;background:var(--ag-s1,#1b1713);border:1px dashed var(--ag-line,#3a3228)}'
    + '.dc-off b{display:block;min-height:24px}.dc-off small{display:block;margin-top:4px;color:var(--ag-muted,#a89c88);font-size:.8125rem;overflow-wrap:anywhere}'
    + '.dc-say{color:var(--ag-sun,#e0b060)}.dc-foot{margin:10px 0 0;color:var(--ag-muted,#a89c88);font-size:.8125rem}';

  async function getJSON(u, ms) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
    try { const r = await fetch(u, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); if (r.ok) return await r.json(); } catch (e) { /* none */ } finally { clearTimeout(tm); }
    return null;
  }

  function style() {
    if (document.getElementById('decideCss')) return;
    const s = document.createElement('style'); s.id = 'decideCss'; s.textContent = CSS; document.head.appendChild(s);
  }

  function itemView(item, st, pc) {
    const box = el('article', 'dc-item'); box.dataset.id = item.id;
    box.appendChild(el('p', 'dc-q', item.question));
    if (item.why) box.appendChild(el('p', 'dc-why', 'Why: ' + item.why));
    if (item.impact) box.appendChild(el('p', 'dc-imp', '$: ' + item.impact));
    if (item.recommend) box.appendChild(el('p', 'dc-rec ' + (item.recommend === 'yes' ? 'y' : item.recommend === 'no' ? 'n' : 'l'),
      'Claude says ' + String(item.recommend).toUpperCase() + (item.recommend_why ? ': ' + item.recommend_why : '')));
    if (item.risk) box.appendChild(el('p', 'dc-risk', 'Risk: ' + item.risk));
    const got = st.got[item.id];
    if (got) box.appendChild(el('p', 'dc-sent', 'You said ' + WORD[got.answer] + (got.t ? ' (' + ET(got.t) + ')' : '') + '. Claude applies it next session; nothing live changes until then.'));
    if (pc) {
      const row = el('div', 'dc-btns'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Answer: ' + item.question);
      const say = el('p', 'dc-say'); say.setAttribute('role', 'status'); say.setAttribute('aria-live', 'polite');
      const opts = (Array.isArray(item.options) ? item.options : ANSWERS).filter((a) => ANSWERS.includes(a));
      for (const a of opts) {
        const b = el('button', a + (got && got.answer === a ? ' on' : ''), WORD[a]); b.type = 'button'; b.dataset.ans = a;
        b.addEventListener('click', () => send(item, a, row, say, st));
        row.appendChild(b);
      }
      box.appendChild(row); box.appendChild(say);
    } else {
      const off = el('div', 'dc-off');
      off.appendChild(el('b', null, 'Open on your PC link to answer'));
      off.appendChild(el('small', null, 'Tailscale on, then open the Board or ZEUS from your PC link. Or tell Claude: "' + item.id + ': yes" (or no / later).'));
      box.appendChild(off);
    }
    return box;
  }

  async function send(item, ans, row, say, st) {
    const b = body(item, ans);
    if (!b || !onPc(location.pathname)) { say.textContent = 'Open on your PC link to answer.'; return; }
    for (const x of row.querySelectorAll('button')) x.disabled = true;
    say.textContent = 'Sending ' + WORD[ans] + '...';
    try {
      const r = await fetch('/inbox/board', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Olympus-Inbox': '1' }, body: JSON.stringify(b) });
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.ok) {
        st.got[item.id] = { answer: ans, t: Math.floor(Date.now() / 1000) };
        const fresh = itemView(item, st, true);
        const old = st.list.querySelector('.dc-item[data-id="' + item.id + '"]');
        if (old) st.list.replaceChild(fresh, old);
        const s2 = fresh.querySelector('.dc-say'); if (s2) s2.textContent = j.said || 'Saved for Claude.';
        api.last.sent.push(b);
        return;
      }
      say.textContent = (j && j.error) || 'The PC did not take it. Try again, or tell Claude in chat.';
    } catch (e) {
      say.textContent = 'Your PC link did not answer. Try again, or tell Claude in chat.';
    }
    for (const x of row.querySelectorAll('button')) x.disabled = false;
  }

  async function mount(rootEl) {
    if (!rootEl) return null;
    style();
    const src = rootEl.getAttribute('data-decide-src') || '../business/decisions.json';
    const boardSrc = rootEl.getAttribute('data-decide-board') || '../board/board.json';
    const [doc, board] = await Promise.all([getJSON(src), getJSON(boardSrc)]);
    const pc = onPc(location.pathname);
    while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);
    const items = openItems(doc);
    api.ok = !!doc;
    api.last = { onPc: pc, ids: items.map((d) => d.id), sent: [] };
    if (!items.length) { rootEl.hidden = true; return api.last; }
    const st = { got: answers(isObj(board) ? board.events : []), list: null };
    api.last.got = st.got;
    rootEl.classList.add('dc');
    rootEl.appendChild(el('h2', null, 'Decide (' + items.length + ' waiting on you)'));
    rootEl.appendChild(el('p', 'dc-hint', pc ? 'Each tap is a note for Claude. Nothing live changes until Claude applies it by the rules.'
      : 'Answers only from your PC link (Tailscale). Nothing is written on this public site.'));
    st.list = el('div', 'dc-list');
    for (const d of items) st.list.appendChild(itemView(d, st, pc));
    rootEl.appendChild(st.list);
    if (doc.updated) rootEl.appendChild(el('p', 'dc-foot', 'List kept by Claude, updated ' + doc.updated + '.'));
    rootEl.hidden = false;
    return api.last;
  }

  api.mount = mount;
  const go = () => { for (const r of document.querySelectorAll('[data-decide]')) mount(r); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})(typeof window !== 'undefined' ? window : globalThis);
