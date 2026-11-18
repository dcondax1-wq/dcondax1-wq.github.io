// MORE WORK page (classic script, read only, 2026-11-17). Everything comes from ./work.json and is drawn with textContent;
// outside links only when they start with https:// and always with rel=noopener.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x) => (x == null ? '' : String(x));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = str(text); return e; };
  const VERDICT = { legit: 'ok', saturated: 'warn', 'legit but tiny': 'info', 'skip for now': 'bad' };

  function kv(dl, rows) {
    dl.textContent = '';
    for (const r of arr(rows)) { if (!Array.isArray(r)) continue; dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); }
  }

  function list(node, items) {
    node.textContent = '';
    for (const t of arr(items)) node.appendChild(el('li', null, t));
  }

  function idea(x) {
    const c = el('section', 'ag-card card idea');
    const top = el('div', 'row');
    top.appendChild(el('h3', null, (Number.isFinite(+x.rank) ? '#' + (+x.rank) + ' ' : '') + str(x.name)));
    const v = str(x.verdict);
    top.appendChild(el('span', 'pill ' + (VERDICT[v] || 'info'), v || '?'));
    c.appendChild(top);
    c.appendChild(el('p', 'money', x.usd_month));
    const dl = el('dl', 'facts');
    kv(dl, [['Hours', x.hours], ['Start cost', x.cost], ['Claude does', x.claude]]);
    c.appendChild(dl);
    c.appendChild(el('p', 'note', x.why));
    if (x.niche) c.appendChild(el('p', 'note', x.niche));
    const ol = el('ol', 'steps'); list(ol, x.steps); c.appendChild(ol);
    return c;
  }

  function render(d) {
    list($('first'), d.first);
    const ideas = $('ideas'); ideas.textContent = '';
    for (const x of arr(d.ideas).slice().sort((a, b) => (+a.rank || 99) - (+b.rank || 99))) ideas.appendChild(idea(x));
    const p = d.plan || {};
    $('goal').textContent = str(p.goal);
    kv($('ladder'), p.ladder);
    $('pace').textContent = str(p.pace);
    kv($('weeks'), p.weeks);
    kv($('say'), p.say);
    $('planRules').textContent = str(p.rules);
    kv($('scams'), d.scams);
    const src = $('src'); src.textContent = '';
    for (const s of arr(d.sources)) {
      if (!Array.isArray(s) || !/^https:\/\//.test(str(s[1]))) continue;
      const li = el('li'), a = el('a', null, s[0]);
      a.href = str(s[1]); a.rel = 'noopener'; a.target = '_blank';
      li.appendChild(a); src.appendChild(li);
    }
    $('status').textContent = 'Updated ' + (str(d.updated) || '-') + '. Dollar figures are beginner estimates, not promises.';
  }

  async function main() {
    let d = null;
    try { const r = await fetch('work.json', { cache: 'no-cache' }); if (r.ok) d = await r.json(); } catch (e) { /* offline */ }
    if (!d || typeof d !== 'object') { $('status').textContent = 'Could not load the list. Pull to refresh.'; return; }
    render(d);
  }
  if (typeof module !== 'undefined') module.exports = { render };
  else main();
})();
