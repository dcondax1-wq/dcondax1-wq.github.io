// GOALS page (classic script, read only). Data: ./goals.json from tools/money/goals_build.py. Everything is drawn with
// textContent; nothing from the data is parsed as HTML.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const usd = (v) => (v == null || !Number.isFinite(+v) ? '' : (v < 0 ? '-$' : '+$') + Math.abs(+v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  const CHIP = { done: ['ok', 'done'], next: ['warn', 'next'], later: ['', 'later'] };

  function chip(st, auto) {
    if (auto && st !== 'done') return el('span', 'pill info', 'bot does it');
    const c = CHIP[st] || CHIP.later;
    return el('span', 'pill' + (c[0] ? ' ' + c[0] : ''), c[1]);
  }

  function steps(box, rows, ladder) {
    box.textContent = '';
    for (const r of rows || []) {
      const li = el('li', r.status || 'later');
      li.appendChild(el('span', 'd', r.when || r.date || ''));
      li.appendChild(el('span', 'w', r.what || ''));
      li.appendChild(chip(r.status, r.auto));
      const why = r.why || r.detail;
      if (why) li.appendChild(el('span', 'y', why));
      if (ladder && r.usd != null) li.appendChild(el('span', 'usd', usd(r.usd)));
      box.appendChild(li);
    }
  }

  function draw(D) {
    const now = $('now'); now.textContent = '';
    for (const r of D.now || []) now.appendChild(el('li', null, r[0] + ': ' + r[1] + (r[2] ? ' (' + r[2] + ')' : '')));
    if (D.pc) now.appendChild(el('li', null, D.pc));
    steps($('week'), D.week, false);
    $('ladNote').textContent = D.note || '';
    steps($('ladder'), D.ladder, true);
    $('bad').textContent = 'Bad case: ' + (D.bad_case || '');
    const dl = $('rules'); dl.textContent = '';
    for (const [k, v] of D.rules || []) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
    const dec = $('dec'); dec.textContent = '';
    for (const d of D.decisions || []) dec.appendChild(el('li', null, d));
    if (!(D.decisions || []).length) dec.appendChild(el('li', null, 'Nothing waiting on you.'));
    const nx = (D.ladder || []).find((m) => m.status === 'next');
    $('status').textContent = 'Updated ' + (D.updated || '?') + (nx ? '. Next milestone: ' + nx.what + ' (' + nx.when + ').' : '.');
    $('foot').textContent = 'Market for the dates: ' + (D.market || '-') + '. Rebuilt by ' + (D.built_by || 'tools/money/goals_build.py') + '.';
  }

  fetch('goals.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(draw)
    .catch((e) => { $('status').textContent = 'Could not load the plan (' + e.message + '). Pull down to try again.'; });
})();
