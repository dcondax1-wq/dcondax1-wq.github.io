// Glance page (widget/glance.html): draws OLY_WIDGET's model as a big Home Screen card. Refreshes every 60 s while open and when the
// app comes back to the front. Text only through textContent; the SVG rings are built with createElementNS. Last good copy in
// localStorage (wrapped in try/catch), shown as CACHED with its age when the phone is offline.
(function () {
  'use strict';
  const W = window.OLY_WIDGET;
  if (!W) return;
  const $ = (id) => document.getElementById(id);
  const KEY = 'oly.glance.v1';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sgn = (v) => (typeof v === 'number' && v < 0 ? 'down' : typeof v === 'number' && v > 0 ? 'up' : 'soft');
  let last = null;
  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.') : '');

  function ring(frac) {
    const r = 26, C = 2 * Math.PI * r, f = typeof frac === 'number' ? Math.max(0, Math.min(1, frac)) : 0;
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('class', 'ring'); s.setAttribute('role', 'img');
    s.setAttribute('aria-label', typeof frac === 'number' ? 'Drawdown room left ' + Math.round(f * 100) + ' percent' : 'Drawdown room unknown');
    const mk = (cls) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 32); c.setAttribute('cy', 32); c.setAttribute('r', r); c.setAttribute('class', cls); return c; };
    const tr = mk('tr'), fg = mk('fg');
    fg.setAttribute('stroke', f < 0.35 ? 'var(--bad-fill)' : f < 0.6 ? 'var(--warn)' : 'var(--good-fill)');
    fg.setAttribute('stroke-dasharray', C.toFixed(2));
    fg.setAttribute('stroke-dashoffset', C.toFixed(2));
    s.append(tr, fg);
    const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 32); t.setAttribute('y', 29); t.textContent = typeof frac === 'number' ? Math.round(f * 100) + '%' : '—';
    const l = document.createElementNS(NS, 'text'); l.setAttribute('x', 32); l.setAttribute('y', 43); l.setAttribute('class', 'lb'); l.textContent = 'ROOM';
    s.append(t, l);
    requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute('stroke-dashoffset', (C * (1 - f)).toFixed(2))));
    return s;
  }
  function kv(label, value, cls) { const d = el('div'); d.append(el('small', null, label), el('b', cls || null, value)); return d; }

  function acct(c) {
    const row = el('div', 'acct');
    row.append(ring(c.room_frac));
    const body = el('div');
    const nm = el('div', 'nm');
    nm.append(el('span', null, c.name), el('span', 'tag ' + (c.badge === 'LIVE' ? 'live' : 'paper'), c.badge));
    if (c.funded) nm.append(el('span', 'tag bt', 'FUNDED'));
    body.append(nm, el('div', 'bal num', W.usd(c.balance)));
    const g = el('div', 'kv3');
    g.append(kv('today', W.usd(c.today, true), sgn(c.today)), kv(c.to_label, W.usd(c.to_go), 'gold'), kv('room left', W.usd(c.room), c.room_frac != null && c.room_frac < 0.35 ? 'down' : ''));
    body.append(g);
    const b = el('div', 'bar'); b.setAttribute('role', 'progressbar'); b.setAttribute('aria-label', c.to_label);
    const pct = c.progress != null ? Math.round(c.progress * 100) : 0;
    b.setAttribute('aria-valuenow', String(pct)); b.setAttribute('aria-valuemin', '0'); b.setAttribute('aria-valuemax', '100');
    const i = el('i'); i.style.setProperty('--w', pct + '%'); b.append(i);
    body.append(b, el('p', 'wait', (c.progress != null ? pct + '% of the way ' + c.to_label.replace('to ', 'to the ') + '. ' : '') + cap(c.window || c.waiting || '')));
    row.append(body);
    return row;
  }

  function draw(d) {
    const m = d.m, now = d.now;
    const src = $('src');
    if (!m) { src.textContent = 'OFFLINE'; src.className = 'tag bad'; $('accts').replaceChildren(el('p', 'muted', 'No numbers yet: no signal and no saved copy. Pull to refresh when you are online.')); return; }
    src.textContent = m.src === 'PC' ? (m.stale ? 'PC · OLD' : 'LIVE · PC') : m.src === 'SITE' ? 'PAPER · SITE' : 'CACHED';
    src.className = 'tag ' + (m.src === 'PC' && !m.stale ? 'live' : m.src === 'CACHED' ? 'cached' : 'paper');
    const t = $('today'); t.textContent = W.usd(m.today, true); t.className = 'g-big num ' + sgn(m.today);
    $('pcDot').className = 'dot ' + (m.pc.level || 'warn') + (m.pc.on ? ' pulse' : '');
    $('pcLabel').textContent = m.pc.label;
    $('model').textContent = m.pc.model || '';
    const box = $('accts');
    box.replaceChildren(...(m.accounts.length ? m.accounts.map(acct) : [el('p', 'muted', 'The PC has not posted account numbers yet.')]));
    const k = d.kalshi;
    $('kNext').textContent = k ? k.text + ' · ' + k.name : 'No window in the next week';
    $('kIn').textContent = k ? 'in ' + (k.in_s < 3600 ? Math.max(1, Math.round(k.in_s / 60)) + ' min' : Math.round(k.in_s / 3600) + ' h') : '';
    const kp = d.kpaper;
    $('kPaper').textContent = kp ? 'Paper rewards so far: ' + W.usd(kp.net, true) + (kp.per100 != null ? ' (' + kp.per100.toFixed(2) + ' $ a day per $100)' : '') + (kp.t ? ', updated ' + W.ago(now - kp.t) : '') : 'Paper rewards: no numbers yet.';
    $('age').textContent = (m.src === 'PC' ? 'PC posted ' : m.src === 'SITE' ? 'Site built ' : 'Saved ') + (m.t ? W.ago(now - m.t) : '—');
    $('upd').textContent = 'Checked ' + new Date(now * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('app').setAttribute('aria-busy', 'false');
  }

  async function refresh() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { cached = null; }
    const d = await W.load({ site: '../', cached });
    if (d.m && d.m.src !== 'CACHED' && d.m.accounts.length) { try { localStorage.setItem(KEY, JSON.stringify(d.m)); } catch (_) { /* private mode */ } }
    last = d;
    draw(d);
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!last || Date.now() / 1000 - last.now > 30)) refresh(); });
})();
