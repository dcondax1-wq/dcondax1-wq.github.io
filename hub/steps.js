/* YOUR STEPS (hub/steps.html). Reads steps.json (one GET, nothing sent). Text only through textContent.
 * The Done tick is saved on this phone in localStorage (try/catch; works without it). Classic script: window.STEPS_PAGE. */
(function (root) {
  'use strict';
  var KEY = 'oly-steps-done-v1';
  function load() { try { var o = JSON.parse(root.localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function save(o) { try { root.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private window: tick lasts until reload */ } }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function copyBtn(text) {
    var b = el('button', null, 'Copy'); b.type = 'button';
    b.addEventListener('click', function () {
      var ok = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); };
      var sel = function () { try { var r = document.createRange(); r.selectNodeContents(b.previousSibling); var s = root.getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected'; } catch (e) { /* nothing */ } };
      try { if (root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(text).then(ok, sel); } else { sel(); } } catch (e) { sel(); }
    });
    return b;
  }
  function copyRow(text) { var r = el('div', 'st-copy'); r.appendChild(el('code', null, text)); r.appendChild(copyBtn(text)); return r; }
  function card(it, done, onTick) {
    var c = el('article', 'st-card' + (done ? ' is-done' : '')); c.id = it.id;
    var h = el('div', 'st-head');
    h.appendChild(el('span', 'st-n', String(it.n)));
    var t = el('div', 'st-t'); t.appendChild(el('h2', null, it.title)); t.appendChild(el('p', 'st-what', it.what)); h.appendChild(t);
    c.appendChild(h);
    var tags = el('div', 'st-tags');
    tags.appendChild(el('span', 'st-tag st-where', it.where === 'PC' ? 'At the PC' : 'On the phone'));
    if (it.optional) tags.appendChild(el('span', 'st-tag', 'Optional'));
    c.appendChild(tags);
    var w = el('p', 'st-why'); w.appendChild(el('b', null, 'Why: ')); w.appendChild(document.createTextNode(it.why)); c.appendChild(w);
    var ol = el('ol', 'st-steps'); (it.steps || []).forEach(function (s) { ol.appendChild(el('li', null, s)); }); c.appendChild(ol);
    if (it.copy) c.appendChild(copyRow(it.copy));
    if (it.copy2) c.appendChild(copyRow(it.copy2));
    if (it.copy_note) c.appendChild(el('p', 'st-cnote', it.copy_note));
    var lab = el('label', 'st-done'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!done;
    lab.appendChild(cb); lab.appendChild(el('span', null, 'Done'));
    cb.addEventListener('change', function () { c.classList.toggle('is-done', cb.checked); onTick(it.id, cb.checked); });
    c.appendChild(lab);
    return c;
  }
  function render(data) {
    var items = (data && data.items) || [], st = load(), list = document.getElementById('list'), count = document.getElementById('count');
    function upd() { var d = items.filter(function (i) { return st[i.id]; }).length; count.textContent = d >= items.length ? 'All done' : (items.length - d) + ' to do, ' + d + ' done'; }
    items.forEach(function (it) { list.appendChild(card(it, !!st[it.id], function (id, on) { if (on) st[id] = 1; else delete st[id]; save(st); upd(); })); });
    upd();
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t && t.scrollIntoView) t.scrollIntoView(); }
    root.STEPS_PAGE.ready = true;
  }
  root.STEPS_PAGE = { ready: false };
  function start() {
    fetch('steps.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(render).catch(function () {
      document.getElementById('count').textContent = 'Could not load the steps. Pull down to retry.'; root.STEPS_PAGE.ready = true;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}(typeof window !== 'undefined' ? window : this));
