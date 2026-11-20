/* HOW DO I (hub/help.html, 2026-11-18, night-help). The questions come from help.json:
 *   { v, updated, items: [{ id, q, words, where, steps: [2-4 plain lines], copy ('' or ONE line), copy_note, link: { href, label }, src }] }
 * Search: every word typed must be in the question, its words, where or its steps (case-insensitive); filler words ("how do I", "my",
 * "the", "what") are skipped, so "how do I pause" = "pause". help.html#<id> opens that answer; ?q=<words> starts with a search.
 * Read only: one GET of help.json, no write, nothing sent. Text only through textContent. Classic script: window.HELP_PAGE
 * (module.exports in node: the pure part, tests/test_help_page.py). */
(function (root) {
  'use strict';
  var STOP = { how: 1, do: 1, i: 1, my: 1, me: 1, the: 1, a: 1, an: 1, to: 1, what: 1, where: 1, is: 1, are: 1, can: 1, when: 1, now: 1, of: 1, on: 1 };
  function terms(q) {
    return String(q == null ? '' : q).toLowerCase().replace(/[?!.,]/g, ' ').split(/\s+/).filter(function (w) { return w && !STOP[w]; });
  }
  function hay(it) { return [it.q, it.words, it.where, (it.steps || []).join(' '), it.link ? it.link.label : ''].join(' ').toLowerCase(); }
  function match(it, q) {                                   // true when every real word of q is in the item
    var ws = terms(q), h = hay(it);
    for (var k = 0; k < ws.length; k++) if (h.indexOf(ws[k]) < 0) return false;
    return true;
  }
  function score(it, q) {                                   // 3 per word in the question, 2 in its search words, 1 elsewhere: best first
    var ws = terms(q), t = String(it.q || '').toLowerCase(), w = String(it.words || '').toLowerCase(), n = 0;
    for (var k = 0; k < ws.length; k++) n += t.indexOf(ws[k]) >= 0 ? 3 : w.indexOf(ws[k]) >= 0 ? 2 : 1;
    return n;
  }
  function filter(items, q) {                               // the matching answers, best first (ties keep the page order)
    return (items || []).map(function (it, i) { return { it: it, i: i }; }).filter(function (x) { return match(x.it, q); })
      .sort(function (a, b) { return score(b.it, q) - score(a.it, q) || a.i - b.i; }).map(function (x) { return x.it; });
  }
  function valid(it) {                                      // the page's own rules for one answer
    return !!(it && typeof it.id === 'string' && /^[a-z0-9-]+$/.test(it.id) && it.q && it.where && Array.isArray(it.steps) && it.steps.length >= 2 && it.steps.length <= 4
      && typeof (it.copy == null ? '' : it.copy) === 'string' && String(it.copy || '').indexOf('\n') < 0 && it.link && it.link.href && it.link.label);
  }
  var api = { terms: terms, match: match, score: score, filter: filter, valid: valid, STOP: STOP };
  root.HELP_PAGE = api;
  if (typeof module === 'object' && module && module.exports) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  var d = document, list, q, count, empty, items = [], nodes = [];
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function copyLine(text, btn) {
    var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1600); };
    var fallback = function () {                            // select the line so the phone's own Copy works
      try { var r = d.createRange(); r.selectNodeContents(btn.previousSibling); var s = root.getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Selected'; } catch (e) { /* none */ }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  function card(it) {
    var det = el('details', 'hp-q'); det.id = it.id; det.setAttribute('data-id', it.id);
    var sum = el('summary'); sum.appendChild(el('b', '', it.q)); var ch = el('i', '', '›'); ch.setAttribute('aria-hidden', 'true'); sum.appendChild(ch);
    det.appendChild(sum);
    var body = el('div', 'hp-body');
    var w = el('p', 'hp-where'); w.appendChild(el('b', '', 'Where: ')); w.appendChild(d.createTextNode(it.where)); body.appendChild(w);
    var ol = el('ol', 'hp-steps'); it.steps.forEach(function (s) { ol.appendChild(el('li', '', s)); }); body.appendChild(ol);
    if (it.copy) {
      var cp = el('div', 'hp-copy'), code = el('code', '', it.copy), b = el('button', '', 'Copy');
      b.type = 'button'; b.setAttribute('aria-label', 'Copy this line');
      b.addEventListener('click', function () { copyLine(it.copy, b); });
      cp.appendChild(code); cp.appendChild(b); body.appendChild(cp);
      if (it.copy_note) body.appendChild(el('p', 'hp-cnote', it.copy_note));
    }
    var go = el('a', 'hp-go'); go.href = it.link.href;
    if (/^https?:/.test(it.link.href)) { go.target = '_blank'; go.rel = 'noopener'; }
    go.appendChild(el('span', '', 'Open: ' + it.link.label)); var ar = el('span', '', '›'); ar.setAttribute('aria-hidden', 'true'); go.appendChild(ar);
    body.appendChild(go);
    det.appendChild(body);
    det.addEventListener('toggle', function () {
      if (det.open && location.hash !== '#' + it.id) { try { history.replaceState(null, '', '#' + it.id); } catch (e) { /* file:// */ } }
    });
    return det;
  }
  function apply() {
    var text = (q && q.value || '').trim(), hits = filter(items, text), shown = hits.length, rank = {};
    hits.forEach(function (it, i) { rank[it.id] = i; });
    nodes.slice().sort(function (a, b) { return text ? ((a.it.id in rank ? rank[a.it.id] : 999) - (b.it.id in rank ? rank[b.it.id] : 999)) || a.i - b.i : a.i - b.i; })
      .forEach(function (n) { n.el.hidden = !(n.it.id in rank); list.appendChild(n.el); });      // best first while searching, page order otherwise
    count.textContent = text ? shown + ' of ' + items.length + ' questions' : items.length + ' questions';
    empty.hidden = shown > 0;
    if (!shown) {
      empty.replaceChildren();
      empty.appendChild(d.createTextNode('Nothing found for "' + text.slice(0, 40) + '". Try one plain word (payout, restart, taxes, silent), or search every app on '));
      var a = el('a', '', 'the four doors'); a.href = 'doors.html'; empty.appendChild(a); empty.appendChild(d.createTextNode('.'));
    }
    if (shown === 1 && text) nodes.forEach(function (n) { if (!n.el.hidden) n.el.open = true; });
  }
  function openHash() {
    var id = (location.hash || '').slice(1), n = id && d.getElementById(id);
    if (n && n.classList.contains('hp-q')) { n.hidden = false; n.open = true; try { n.scrollIntoView({ block: 'start' }); } catch (e) { /* old */ } }
  }
  function start(data) {
    items = (data && Array.isArray(data.items) ? data.items : []).filter(valid);
    nodes = items.map(function (it, i) { var e = card(it); list.appendChild(e); return { it: it, el: e, i: i }; });
    if (data && data.updated) d.getElementById('foot').textContent = 'Checked against the docs ' + data.updated + '. Read only: nothing here can trade or change a bot.';
    try { var m = /[?&]q=([^&#]*)/.exec(location.search); if (m && q) q.value = decodeURIComponent(m[1].replace(/\+/g, ' ')).slice(0, 60); } catch (e) { /* bad query */ }
    apply(); openHash();
    api.ready = true;
  }
  function boot() {
    list = d.getElementById('list'); q = d.getElementById('q'); count = d.getElementById('count'); empty = d.getElementById('empty');
    if (!list) return;
    if (q) {
      q.addEventListener('input', apply);
      q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; apply(); } });
    }
    root.addEventListener('hashchange', openHash);
    fetch('help.json?v=7', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(start, function () {
        count.textContent = 'The questions could not load. Pull to refresh, or open the four doors.';
        api.ready = true;
      });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
}(typeof window !== 'undefined' ? window : globalThis));
