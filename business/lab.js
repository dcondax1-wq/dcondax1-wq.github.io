// ZEUS LAB page (classic script, read only; docs/ZEUS_LAB.md). Data: ./lab_pc.json (the PC's nightly run) else ./lab.json (the
// published copy), both from tools/zeus_lab.py. Everything is drawn with textContent; nothing from the data is parsed as HTML.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const num = (v) => (v == null || !Number.isFinite(+v) ? null : +v);
  const usd = (v) => (num(v) == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
  const sgn = (v) => (num(v) == null ? '-' : (v < 0 ? '-$' : '+$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (d) => (d && d.length >= 10 ? MN[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) : '-');
  const SPANS = [['H1', 'Jan-Jun 2026 (picked on)'], ['H2', 'Jul-Oct 2026 (checked on)'], ['2021-25', '2021-25 (shown)']];
  const FILTERS = [['live', 'Being tested'], ['all', 'All'], ['rejected', 'Rejected'], ['parked', 'Not built']];
  let D = null, flt = 'live';
  try { const s = localStorage.getItem('lab.flt'); if (FILTERS.some((f) => f[0] === s)) flt = s; } catch (e) { /* default */ }

  function keep(r) {
    if (flt === 'all') return true;
    if (flt === 'rejected') return r.status === 'rejected' || r.status === 'blocked';
    if (flt === 'parked') return r.status === 'parked';
    return ['ready', 'shadow', 'testing', 'proposed', 'error', 'adopted'].includes(r.status);
  }

  function money(r) {
    const t = el('table', 'mt');
    const hd = el('tr'); ['$ a month', 'Today', 'With it', 'Change'].forEach((h) => hd.appendChild(el('th', null, h)));
    t.appendChild(el('thead')).appendChild(hd);
    const tb = el('tbody');
    for (const [k, name] of SPANS) {
      const m = (r.months || {})[k]; if (!m) continue;
      const tr = el('tr'); tr.appendChild(el('td', null, name));
      tr.appendChild(el('td', null, usd(m.now))); tr.appendChild(el('td', null, usd(m.exp)));
      const d = num(m.exp) != null && num(m.now) != null ? m.exp - m.now : null;
      tr.appendChild(el('td', d == null ? null : d > 0 ? 'pos' : d < 0 ? 'neg' : null, sgn(d)));
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    return t;
  }

  function card(r) {
    const s = el('section', 'exp');
    const top = el('div'); top.appendChild(el('span', 'st ' + r.status, r.word || r.status)); top.appendChild(el('span', 'who', r.who + (r.cross_of ? ' - learned from the other bot' : '')));
    s.appendChild(top);
    s.appendChild(el('h3', null, r.title));
    s.appendChild(el('p', 'what', 'What it would change: ' + r.what));
    if (r.months) s.appendChild(money(r));
    if (r.status === 'shadow' || r.status === 'ready') {
      const sh = r.shadow || {};
      s.appendChild(el('p', 'why', 'Paper shadow since ' + day(r.shadow_from) + ': ' + sgn(sh.usd) + ' on ' + (sh.trades || 0) + ' changed trades, ' + (sh.weeks || 0) + ' weeks' + (r.needs ? ' (needs ' + r.needs + ')' : '')));
    }
    if (r.was_shadow) s.appendChild(el('p', 'why', 'Its paper shadow (from ' + day(r.was_shadow.from) + '): ' + sgn(r.was_shadow.usd) + ' on ' + (r.was_shadow.trades || 0) + ' trades.'));
    if (r.why) s.appendChild(el('p', 'why', (r.status === 'ready' ? 'Why: ' : r.status === 'parked' ? 'Why not yet: ' : r.status === 'proposed' ? 'What the bot saw: ' : 'Result: ') + r.why));
    if (r.status === 'ready') s.appendChild(el('p', 'why', 'Your step: tell Claude "yes, adopt ' + r.id + '". Claude runs it through the checks, then it goes live.'));
    if (r.source) s.appendChild(el('p', 'why', 'From: ' + r.source + (r.tested ? ' - last test on data to ' + day(r.tested) : '')));
    return s;
  }

  function draw() {
    const rows = D.rows || [], c = D.counts || {};
    const live = (c.ready || 0) + (c.shadow || 0) + (c.testing || 0);
    const prop = c.proposed || 0;
    $('big').textContent = (c.ready ? c.ready + ' READY for your yes. ' : '') + live + ' being tested, ' + ((c.rejected || 0) + (c.blocked || 0)) + ' rejected, ' + (c.parked || 0) + ' not built' + (prop ? ', ' + prop + ' new from the bot' : '');
    const sf = D.safety || {};
    $('safe').textContent = sf.say || '';
    $('safe').className = 'safe ' + String(sf.light || '').toLowerCase();
    $('sumNote').textContent = 'Last run ' + (D.built || '-') + ' on data to ' + day(D.data_to) + ' (' + (D.where === 'pc' ? 'your PC' : 'Claude') + '). ' +
      D.cells + ' ideas tested so far, so each must beat luck at p <= ' + D.p_needed + '. Live settings untouched: ' + (D.protected_ok ? 'yes' : 'NO - check') + '.';
    const fb = $('flt'); fb.textContent = '';
    for (const [k, t] of FILTERS) {
      const b = el('button', 'btn', t); b.type = 'button'; b.setAttribute('aria-pressed', String(k === flt));
      b.addEventListener('click', () => { flt = k; try { localStorage.setItem('lab.flt', k); } catch (e) { /* ok */ } draw(); });
      fb.appendChild(b);
    }
    const box = $('exps'); box.textContent = '';
    const show = rows.filter(keep);
    if (!show.length) box.appendChild(el('p', 'note', flt === 'live' ? 'Nothing passing right now - the normal case. Every idea is re-tested each night as new days come in; tap All to see each result.' : 'None.'));
    show.forEach((r) => box.appendChild(card(r)));
    const how = $('how'); how.textContent = '';
    (D.how || []).forEach((t) => how.appendChild(el('li', null, t)));
    const fl = $('forever'); fl.textContent = '';
    const F = (D.forever || []).map((f) => f.title + ' (' + (f.source || '') + ')').concat(D.forever_doc || []);
    $('forN').textContent = String(F.length);
    F.forEach((t) => fl.appendChild(el('li', null, t)));
    $('foot').textContent = 'Paper research only. The Lab never changes a live setting and never stops a bot. Adopting is your yes, then Claude.';
    $('status').textContent = '';
  }

  async function load() {
    for (const f of ['lab_pc.json', 'lab.json']) {
      try {
        const r = await fetch(f + '?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) { D = await r.json(); if (D && D.rows) { draw(); return; } }
      } catch (e) { /* next */ }
    }
    $('status').textContent = 'No Lab data yet. On the PC it fills in after the first night.';
  }
  load();
})();
