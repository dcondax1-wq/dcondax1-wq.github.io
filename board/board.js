// BOARD page (classic script, 2026-11-17, docs/BOARD.md). What the bot, you and Claude know, on one screen: one row per account,
// the event feed (newest first), what waits on you, and a big red banner when the PC is silent. Everything is drawn with
// textContent. Reads ./board.json, the PC's ntfy status (../pc_feed.js), ../business/accounts.json and ./fixture.json (demo).
// The one write: the note box posts {"text"} to /inbox/board, which only works through your PC's private link (Tailscale).
// window.BOARD is the test hook.
(function () {
  'use strict';
  const M = window.BOARD_MODEL;
  const $ = (id) => document.getElementById(id);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const nowS = () => Math.floor(Date.now() / 1000);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); };
  const demo = /[?&]demo=1\b/.test(location.search);
  const ET = (t) => { try { return new Date(t * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'; } catch (e) { return ''; } };

  async function getJSON(u, ms) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
    try { const r = await fetch(u, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); if (r.ok) return await r.json(); } catch (e) { /* none */ } finally { clearTimeout(tm); }
    return null;
  }

  function row(a, now) {
    const c = el('article', 'brow ag-card');
    c.dataset.key = a.key;
    const top = el('div', 'brow-top');
    top.appendChild(el('h3', null, a.name));
    const ch = el('span', 'chip chip-' + String(a.chip || 'eval').toLowerCase(), (a.plan_only ? 'PLAN · ' : '') + (a.chip || 'eval'));
    top.appendChild(ch);
    if (a.locked && a.chip !== 'locked') top.appendChild(el('span', 'chip chip-locked', 'locked'));
    c.appendChild(top);
    c.appendChild(el('p', 'brow-plan', (a.plan || '') + (a.plan_only ? ' · PLAN only: no PC numbers yet' : '') + (a.not_in_plan ? ' · on your PC, not in the plan yet' : '')));
    const dl = el('dl', 'nums');
    const kv = (k, v, cls) => { const w = el('div', cls || ''); w.appendChild(el('dt', null, k)); w.appendChild(el('dd', null, v)); dl.appendChild(w); };
    kv('Balance', M.usd(a.balance));
    if (a.today != null && !a.plan_only) kv('Today', (a.today > 0.5 ? '+' : '') + M.usd(a.today), a.today > 0.5 ? 'pos' : a.today < -0.5 ? 'neg' : '');
    kv('Room', a.chip === 'PASSED' ? 'n/a' : M.usd(a.room));
    // a funded account: the SAME "to payout" every page shows (pc_feed.js payoutLines = the payout coach's need_more), its details in Payouts below
    const payTo = window.BOARD && window.BOARD.payTo ? window.BOARD.payTo[a.card || a.key] : undefined;
    if (a.chip === 'funded') kv('To payout', payTo === 0 ? 'ready' : payTo != null ? M.usd(payTo) : 'see Payouts');
    else kv('To pass', a.chip === 'PASSED' ? 'done' : M.usd(a.to_pass));
    c.appendChild(dl);
    const age = a.src_t ? now - a.src_t : null;
    const src = el('p', 'brow-src', 'Source: ' + (a.src || 'PLAN') + ' · ');
    const A = window.OLY_AGE, chip = el('span');
    if (age != null && A) { A.chip(chip, age, 'pc'); src.appendChild(chip); } else src.textContent = 'Source: ' + (a.src || 'PLAN') + (age != null ? ' · ' + M.ago(age) : '');
    c.appendChild(src);
    // the account's last event on its tile only while it is news (2 days); the feed below keeps every event
    if (isObj(a.last) && a.last.t && now - a.last.t < 2 * 86400) c.appendChild(el('p', 'brow-last', (M.KIND_WORDS[a.last.kind] || a.last.kind) + ' · ' + ET(a.last.t) + ': ' + (a.last.text || '')));
    if (a.chip === 'PASSED') c.appendChild(el('p', 'brow-hint', 'Passed: MFFU locks the eval (orders get "Limit 0") until the funded account comes. Send its name (last 4) below.'));
    return c;
  }

  function feedItem(e) {
    const li = el('li', 'ev' + (M.LOUD.has(e.kind) ? ' loud' : '') + ' ev-' + (e.src || 'bot'));
    const top = el('div', 'ev-top');
    top.appendChild(el('b', null, M.KIND_WORDS[e.kind] || e.kind));
    top.appendChild(el('span', 'ev-when', (e.acct ? String(e.acct).toUpperCase() + ' · ' : '') + ET(e.t) + ' · ' + (M.SRC_WORDS[e.src] || e.src || 'PC')));
    li.appendChild(top);
    li.appendChild(el('p', null, e.text || ''));
    return li;
  }

  function draw(res) {
    const b = res.board, now = nowS();
    $('mode').textContent = res.label;
    $('mode').className = 'tag mode-' + res.mode;
    const s = M.silent(b, now);
    const ban = $('silent');
    ban.hidden = !s.silent || res.mode === 'demo';
    $('silentText').textContent = s.text.replace(/^PC SILENT:\s*/, '').replace(/^./, (c) => c.toUpperCase());
    $('pcLine').textContent = s.silent ? '' : s.text;
    const acc = $('accounts'); clear(acc);
    const rows = (b.accounts || []).filter((a) => !/blitz/i.test(String(a.key)));
    const live = rows.filter((a) => a.chip !== 'planned'), later = rows.filter((a) => a.chip === 'planned');
    for (const a of live) acc.appendChild(row(a, now));
    const lt = $('later'); clear(lt);
    for (const a of later) lt.appendChild(el('li', null, a.name + ' · ' + (a.plan || '') + ' · not bought yet'));
    $('laterBox').hidden = !later.length;
    const w = $('waiting'); clear(w);
    const plan = window.DECIDE && window.DECIDE.ok !== false ? [] : (b.waiting || []); // the Decide card above shows the decisions
    for (const x of plan) w.appendChild(el('li', null, x));
    for (const n of b.open_notes || []) w.appendChild(el('li', 'note-open', 'Your note, not answered yet: ' + (n.text || '')));
    $('waitBox').hidden = !plan.length && !(b.open_notes || []).length;
    const f = $('feed'); clear(f);
    const evs = (b.events || []).filter((e) => !/blitz/i.test(String(e.acct || ''))).slice(0, 40);
    for (const e of evs) f.appendChild(feedItem(e));
    $('feedEmpty').hidden = evs.length > 0;
    $('foot').textContent = 'Board built ' + (b.t ? ET(b.t) : '?') + (b.plan_updated ? ' · plan ' + b.plan_updated : '') + '. Read only, except your note.';
    window.BOARD.last = res;
  }

  async function sendNote(ev) {
    ev.preventDefault();
    const box = $('noteText'), say = $('noteSay'), text = String(box.value || '').trim().slice(0, 200);
    if (!text) { say.textContent = 'Type a note first.'; return; }
    say.textContent = 'Sending...';
    try {
      const r = await fetch('/inbox/board', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Olympus-Inbox': '1' }, body: JSON.stringify({ text }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.ok) { say.textContent = j.said || 'On the board.'; box.value = ''; load(); return; }
      say.textContent = (j && j.error) || 'The PC did not take it.';
    } catch (e) {
      say.textContent = 'Notes go through your PC link (Tailscale). Open the Board from the PC link, or tell Claude in chat.';
    }
    if (!/PC link/.test(say.textContent)) say.textContent += ' Notes only work on your PC link (Tailscale); or tell Claude in chat.';
  }

  async function load() {
    const [site, plan, fixture] = await Promise.all([demo ? null : getJSON('board.json'), demo ? null : getJSON('../business/accounts.json'), getJSON('fixture.json')]);
    let lite = null;
    try { if (!demo && window.PC_FEED) lite = await window.PC_FEED.fetchLatest({ feedUrl: '../status_feed.json' }); } catch (e) { /* none */ }
    // truth (Olympus 2): the funded accounts' "to payout" through the same rule as every page (pc_feed.js payoutLines + the payout coach)
    window.BOARD.payTo = {};
    try {
      if (lite && lite.board && window.PC_FEED && window.PC_FEED.payoutLines && window.PAYOUT_COACH) {
        const pb = JSON.parse(JSON.stringify(lite.board));
        window.PC_FEED.payoutLines(pb, [], lite, window.PAYOUT_COACH);
        for (const k of Object.keys(pb)) if (pb[k] && typeof pb[k] === 'object' && /funded/i.test(String(pb[k].status || '')) && pb[k].to_target != null) window.BOARD.payTo[k] = Math.max(0, pb[k].to_target);
      }
    } catch (e) { /* the tile says 'see Payouts' */ }
    draw(M.pick({ site, lite, plan, fixture, demo }, nowS()));
    try { if (window.EDGE_CHIP && !demo) window.EDGE_CHIP.update(lite); } catch (e) { /* never the page */ }
    try { if (window.PAYOUT_CARD && !demo) window.PAYOUT_CARD.mount($('payouts'), { plan, lite, title: 'Payouts', titleClass: 'sect' }); } catch (e) { /* never the page */ }
    window.BOARD.data = { lite, plan, demo };                       // nqdash3: payready_mount.js (payout readiness) reads it
    try { window.dispatchEvent(new Event('board-data')); } catch (e) { /* the readiness card waits */ }
  }

  window.BOARD = { load, last: null };
  document.addEventListener('DOMContentLoaded', () => {
    $('noteForm').addEventListener('submit', sendNote);
    $('refresh').addEventListener('click', load);
    load();
    setInterval(() => { if (!document.hidden) load(); }, 60000);
  });
})();
