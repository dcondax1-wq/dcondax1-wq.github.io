// RESEARCH HUB v2 (night-hub2 2026-11-22): every piece of trading research in one phone page.
// Data = hub-data.json (tools/build_research_hub.py). Read only: it sends nothing; the last good copy is kept in localStorage for offline.
(function () {
  'use strict';
  const KEY = 'olyResearchHub2';
  const PAGE = 30;
  const VWORD = { a: 'Adopted', r: 'Rejected', o: 'Open' };
  const S = { data: null, q: '', fam: -1, v: '', shown: PAGE, offline: false };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slugOk = (s) => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s);
  const readUrl = (s) => '../clio/?read=' + encodeURIComponent(s);

  function filtered() {
    const d = S.data; if (!d) return [];
    const words = S.q.toLowerCase().split(/\s+/).filter(Boolean);
    return d.cards.filter((c) => {
      if (S.fam >= 0 && c.f !== S.fam) return false;
      if (S.v && c.v !== S.v) return false;
      if (!words.length) return true;
      const hay = (c.t + ' ' + c.m + ' ' + c.x + ' ' + (d.fam[c.f] || '') + ' ' + c.d + ' ' + VWORD[c.v]).toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  function card(c) {
    const d = S.data;
    const m = c.m ? `<span class="m">${esc(c.m)}</span>` : '<span class="m no">no $ figure</span>';
    return `<a class="cd" href="${slugOk(c.s) ? readUrl(c.s) : '#'}" data-s="${esc(c.s)}"><span class="meta"><span class="v ${esc(c.v)}">${VWORD[c.v] || ''}</span>`
      + `<span class="fam">${esc(d.fam[c.f] || '')}</span><span>${esc(c.d || 'no date')}</span></span><span class="t">${esc(c.t)}</span>${m}</a>`;
  }

  function renderList() {
    const all = filtered();
    const n = S.data.cards.length;
    $('count').textContent = `${all.length} of ${n} studies` + (S.offline ? ' (saved copy: offline)' : '');
    $('cards').innerHTML = all.length ? all.slice(0, S.shown).map(card).join('') : '<p class="empty">Nothing matches. Clear the search or pick All.</p>';
    $('more').hidden = all.length <= S.shown;
  }

  function renderTop() {
    const d = S.data;
    $('built').textContent = 'to ' + d.built;
    $('allN').textContent = `${d.counts.studies} · ${d.counts.adopted} adopted · ${d.counts.rejected} rejected · ${d.counts.open} open`;
    $('brainSub').textContent = `${d.counts.neurons} findings as neurons · ${d.counts.rejected_list} on the rejected list`;
    $('live').innerHTML = d.live.map((r) => `<div class="lv"><b>${esc(r.k)}</b><i class="${r.s === 'LIVE' ? 'on' : ''}">${esc(r.s)}</i><p>${esc(r.t)}</p></div>`).join('');
    $('waitN').textContent = d.wait.length ? `· ${d.wait.length} cards` : '';
    $('wait').innerHTML = d.wait.length ? d.wait.map((w) => `<a class="wt" href="../board/#decide" data-id="${esc(w.id)}"><span class="q">${esc(w.q)}</span>`
      + `<span class="m">${esc(w.m)}</span><span class="r">${w.st === 'later' ? 'Later · ' : ''}Claude says: ${esc(w.rec || 'see the card')}</span></a>`).join('')
      : '<p class="empty">Nothing waiting on you.</p>';
    $('huntD').textContent = '· ' + d.hunt.date;
    $('huntHead').textContent = d.hunt.head;
    $('hunt').innerHTML = d.hunt.lines.map((h) => `<a class="hl" href="${slugOk(h.s) ? readUrl(h.s) : '#'}"><b>${esc(h.k)}</b>${esc(h.t)}</a>`).join('');
    $('fams').innerHTML = ['All'].concat(d.fam).map((f, i) => `<button class="chip" data-f="${i - 1}" aria-pressed="${i - 1 === S.fam}">${esc(f)}</button>`).join('');
    $('foot').textContent = `${d.counts.studies} write-ups · ${d.counts.ledger} ledger findings · ${d.counts.rejected_list} tested-and-rejected lines. Read only: nothing here changes a bot.`;
  }

  function wire() {
    $('q').addEventListener('input', (e) => { S.q = e.target.value.slice(0, 80); S.shown = PAGE; renderList(); });
    $('fams').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      S.fam = +b.dataset.f; S.shown = PAGE;
      for (const x of $('fams').children) x.setAttribute('aria-pressed', String(x === b));
      renderList();
    });
    $('verd').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      S.v = b.dataset.v; S.shown = PAGE;
      for (const x of $('verd').children) x.setAttribute('aria-pressed', String(x === b));
      renderList();
    });
    $('more').addEventListener('click', () => { S.shown += PAGE; renderList(); });
  }

  function valid(d) { return d && Array.isArray(d.cards) && Array.isArray(d.fam) && Array.isArray(d.live) && Array.isArray(d.wait) && d.hunt && d.counts; }

  async function load() {
    try {
      const r = await fetch('hub-data.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (!valid(d)) throw new Error('bad data');
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) { /* full or private: fine */ }
      return d;
    } catch (e) {
      try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (valid(d)) { S.offline = true; return d; } } catch (_) { /* nothing saved */ }
      throw e;
    }
  }

  async function boot() {
    wire();
    try {
      S.data = await load();
    } catch (e) {
      $('count').textContent = 'Could not load the research (offline and no saved copy). Pull to refresh.';
      return;
    }
    renderTop();
    renderList();
  }

  window.ResearchHub = { S, filtered, render: () => { renderTop(); renderList(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
