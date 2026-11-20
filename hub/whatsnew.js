/* WHAT'S NEW (hub/whatsnew.html, 2026-11-20, day-manual NAV). Draws whatsnew.json:
 *   { v, updated, status: {key: label}, items: [{ day: 'YYYY-MM-DD', status: site|pc|yes|tested|you, title, what, money, href, label }] }
 * Newest day first, one heading per day ("Today", "Yesterday", "Wed Nov 18"); "Needs me" shows only status you / yes.
 * Read only: one GET of whatsnew.json, nothing sent, no storage. Text only through textContent. window.WHATS_NEW (tests). */
(function (root) {
  'use strict';
  var NEED = { you: 1, yes: 1 };
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function etToday(now) {
    try {
      var p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(now || new Date()).forEach(function (x) { p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    } catch (e) { return (now || new Date()).toISOString().slice(0, 10); }
  }
  function dayName(day, today) {
    var d = new Date(day + 'T12:00:00Z'), t = new Date(today + 'T12:00:00Z');
    if (isNaN(d)) return day;
    var diff = Math.round((t - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return DAYS[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate();
  }
  function groups(items, onlyNeed) {   // [{day, items}] newest day first, file order inside a day
    var out = [], at = {};
    (items || []).filter(function (it) { return it && it.title && (!onlyNeed || NEED[it.status]); })
      .slice().sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : 0; })
      .forEach(function (it) { if (!at[it.day]) { at[it.day] = { day: it.day, items: [] }; out.push(at[it.day]); } at[it.day].items.push(it); });
    return out;
  }
  var API = { groups: groups, dayName: dayName, etToday: etToday };
  root.WHATS_NEW = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;

  var d = document, data = null, onlyNeed = false;
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function draw() {
    var box = d.getElementById('list'), cnt = d.getElementById('count');
    box.replaceChildren();
    if (!data) { cnt.textContent = ''; box.appendChild(el('p', 'wn-empty', 'The list did not load. Check the connection and open this page again.')); return; }
    var gs = groups(data.items, onlyNeed), today = etToday(), n = 0, labels = data.status || {};
    gs.forEach(function (g) {
      box.appendChild(el('h2', 'wn-day', dayName(g.day, today)));
      g.items.forEach(function (it) {
        n++;
        var a = el('article', 'wn-item ' + (it.status || ''));
        a.appendChild(el('span', 'wn-tag', labels[it.status] || it.status || ''));
        a.appendChild(el('h3', '', it.title));
        if (it.money) a.appendChild(el('p', 'wn-money', it.money));
        a.appendChild(el('p', 'wn-what', it.what));
        if (it.href) {
          var go = el('a', 'wn-go'); go.href = it.href;
          go.appendChild(el('span', '', it.label || 'Open'));
          var ar = el('span', '', '›'); ar.setAttribute('aria-hidden', 'true'); go.appendChild(ar);
          a.appendChild(go);
        }
        box.appendChild(a);
      });
    });
    cnt.textContent = onlyNeed ? (n ? n + ' need you' : 'Nothing needs you right now.') : n + ' changes · updated ' + (data.updated || '');
    if (!n && onlyNeed) box.appendChild(el('p', 'wn-empty', 'Nothing here needs you. Your steps has the full to-do list.'));
    root.WHATS_NEW.ready = true;
  }
  function setFilter(need) {
    onlyNeed = need;
    d.getElementById('fAll').setAttribute('aria-pressed', need ? 'false' : 'true');
    d.getElementById('fYou').setAttribute('aria-pressed', need ? 'true' : 'false');
    draw();
  }
  function init() {
    d.getElementById('fAll').addEventListener('click', function () { setFilter(false); });
    d.getElementById('fYou').addEventListener('click', function () { setFilter(true); });
    if (/[?&]need=1/.test(root.location.search || '')) onlyNeed = true;
    var done = function (j) { data = j && j.items ? j : null; setFilter(onlyNeed); };
    try {
      root.fetch('whatsnew.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; }).then(done, function () { done(null); });
    } catch (e) { done(null); }
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
}(typeof window !== 'undefined' ? window : globalThis));
