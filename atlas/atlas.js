/* Olympus Atlas: one fast map for every published dashboard. Read-only; no orders or account actions. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const rows = (window.OLYMPUS_APPS_LIST || []).filter((a) => a && /^[a-z0-9-]+$/.test(a.id) && /^(trading|money|life)$/.test(a.group));
  const fallback = [
    { id:'zenith',name:'Zenith',glyph:'Z',colour:'#9c6b3c',group:'trading',purpose:'NQ bot dashboard',path:'' },
    { id:'oracle',name:'Oracle',glyph:'Θ',colour:'#7fa6bd',group:'trading',purpose:'Market radar',path:'oracle/' },
    { id:'cities',name:'Cities',glyph:'◈',colour:'#c9a06a',group:'trading',purpose:'Explore the city worlds',path:'cities/' },
    { id:'jarvis',name:'Jarvis',glyph:'J',colour:'#e5be83',group:'life',purpose:'Your assistant',path:'jarvis/' }
  ];
  const apps = rows.length ? rows : fallback;
  // The FOUR DOORS (2026-11-18, night-org; the five districts of 2026-11-10 before): the same ids, colours and app lists as olympus/doors.js
  // (tests.test_apps_list + tests.test_jarvis_home_agora keep them equal). Text colours stay readable on the dark cards.
  const zones = [
    { id:'zeus', title:'ZEUS Trading', colour:'#c8a24a', note:'Zlarior and ATLAS: accounts, live bots, trades, risk, rules, payouts.', ids:['pillars','zenith','nq','board','why','trading','aegis','pnyx','demeter','labyrinth','fates','moirai','odeon','nemesis','kronos','apollo','journal','kratos','epilogue','ares','argus','oracle','pantheon','pythia','pheme','kairos','chronos','forum','delphi'] },
    { id:'money', title:'Money', colour:'#7f8a52', note:'Business, taxes, payouts, the fleet plan and the household.', ids:['business','widget','ledger','hera','plutus','chrysos','oikos','agency','mercury','mint','mintcity','harmonia','hermes','argo','arbiter'] },
    { id:'kalshi', title:'Kalshi', colour:'#b5a642', note:'The Kalshi bot and its edges (paused: paper only).', ids:['kalshi','dionysus','kalshicity','sibyl','tyche'] },
    { id:'more', title:'More', colour:'#9c6b3c', note:'Research, my day, Jarvis, settings and everything else.', ids:['compass','helios','herald','stoa','hestia','inbox','planner','mind','arena','athena','lyceum','nike','gallery','polis','symposium','ergasterion','settings','bridge','atlas','cities','datacity','observatory','tree','prometheus','hephaestus','clio','archive','pinakes','colosseum'] }
  ];
  // the old district links (#zone=market from Jarvis "open the research district", the home courtyard's doorways) open the door that holds them now
  const legacy = [{ id:'market', to:'zeus' }, { id:'research', to:'more' }, { id:'risk', to:'money' }, { id:'command', to:'more' }, { id:'life', to:'more' }];
  const zoneOf = (a) => zones.find((zone) => zone.ids.includes(a.id)) || zones.find((zone) => zone.id === (a.group === 'money' ? 'money' : a.group === 'trading' ? 'zeus' : 'more'));
  const key = 'olympus.atlas.v1';
  let saved = { stars: [], recent: [] };
  function restoreSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      saved = {
        stars: (Array.isArray(v && v.stars) ? v.stars : []).filter((id) => apps.some((a) => a.id === id)).slice(0, 30),
        recent: (Array.isArray(v && v.recent) ? v.recent : []).filter((id) => apps.some((a) => a.id === id)).slice(0, 5)
      };
    } catch (_) { /* keep this page's preferences if storage is unavailable */ }
  }
  restoreSaved();
  let storageReady = false;
  try {
    const probe = key + '.probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    storageReady = true;
  } catch (_) { /* private browsing or full storage */ }
  function updateSaveStatus() {
    const status = $('#saveStatus');
    status.textContent = storageReady ? 'Your map is saved on this device.' : 'This browser cannot save favorites or recent rooms.';
    status.dataset.saveState = storageReady ? 'on' : 'off';
  }
  const store = () => {
    try { localStorage.setItem(key, JSON.stringify(saved)); storageReady = true; }
    catch (_) { storageReady = false; }
    updateSaveStatus();
  };
  updateSaveStatus();
  const recordRecent = (id) => { saved.recent = [id, ...saved.recent.filter((x) => x !== id)].slice(0, 5); store(); };
  const link = (a) => '../' + (/^(?:[a-z0-9-]+\/)?$/.test(a.path || '') ? a.path : (a.id + '/'));
  let filter = 'all';
  // Keep the four visible gates useful after a visit without adding another panel to the phone screen.
  const spotlight = $('.spotlight');
  const featured = [...spotlight.children];
  ['oracle', 'datacity', 'cities', 'kalshicity'].forEach((id, index) => {
    featured[index]?.addEventListener('click', () => recordRecent(id));
  });
  let spotlightKey = '';
  function renderSpotlight() {
    const personalized = saved.stars.length || saved.recent.length;
    const preferred = [...saved.stars.slice(0, 2), ...saved.recent.slice(0, 2),
      ...saved.stars, ...saved.recent, 'oracle', 'datacity', 'cities', 'kalshicity'];
    const selected = [...new Set(preferred)].map((id) => apps.find((a) => a.id === id)).filter(Boolean).slice(0, 4);
    const key = personalized ? selected.map((a) => a.id + (saved.stars.includes(a.id) ? '*' : '')).join('|') : 'featured';
    if (key === spotlightKey) return;
    spotlightKey = key;
    if (!personalized || !selected.length) {
      spotlight.setAttribute('aria-label', 'Featured destinations');
      spotlight.replaceChildren(...featured);
      return;
    }
    spotlight.setAttribute('aria-label', 'Quick launch: favorites and recent dashboards');
    spotlight.replaceChildren();
    for (const a of selected) {
      const gate = document.createElement('a'); gate.href = link(a);
      const label = document.createElement('span');
      label.textContent = saved.stars.includes(a.id) ? '★ Favorite' : saved.recent.includes(a.id) ? '↺ Recent' : zoneOf(a).title;
      const name = document.createElement('strong'); name.textContent = a.name;
      const purpose = document.createElement('small'); purpose.textContent = (a.purpose || 'Open dashboard') + ' ↗';
      gate.append(label, name, purpose); spotlight.append(gate);
      gate.addEventListener('click', () => recordRecent(a.id));
    }
  }
  const words = (q) => q.split(/\s+/).filter(Boolean);
  const matchesAll = (a, q) => {
    if (!q) return true;
    const D = window.OLYMPUS_DOORS;                          // the plain words of olympus/doors.js (payout, taxes, accounts...) when it loaded
    const hay = (a.name + ' ' + a.purpose + ' ' + a.id + ' ' + a.group + ' ' + zoneOf(a).title + ' ' + (D && D.words ? D.words(a) : '')).toLocaleLowerCase();
    return words(q).every((w) => hay.includes(w));
  };
  function render() {
    renderSpotlight();
    const q = $('#query').value.toLocaleLowerCase().trim();
    const shown = apps.filter((a) => (filter === 'all' || (filter === 'favorites' ? saved.stars.includes(a.id) : zoneOf(a).id === filter)) &&
      matchesAll(a, q));
    const host = $('#results'); host.replaceChildren();
    for (const zone of zones) {
      const zoneApps = shown.filter((a) => zoneOf(a).id === zone.id);
      if (!zoneApps.length) continue;
      const section = document.createElement('section'); section.className = 'zone'; section.setAttribute('aria-label', zone.title);
      const heading = document.createElement('div'); heading.className = 'zone-head';
      const title = document.createElement('h3'); title.textContent = zone.title;
      const note = document.createElement('p'); note.textContent = zone.note;
      section.style.setProperty('--zc', zone.colour);
      const tally = document.createElement('span'); tally.textContent = zoneApps.length + ' destinations';
      heading.append(title,note,tally); section.append(heading);
      const grid = document.createElement('div'); grid.className = 'zone-grid'; section.append(grid);
      for (const a of zoneApps) {
      const card = document.createElement('article'); card.className = 'card'; card.style.setProperty('--accent', /^#[0-9a-f]{6}$/i.test(a.colour) ? a.colour : '#e5be83'); card.style.setProperty('--zc', zone.colour); card.dataset.id = a.id;
      const sigil = document.createElement('span'); sigil.className = 'sigil'; sigil.textContent = a.glyph || a.name.charAt(0); sigil.setAttribute('aria-hidden','true');
      const body = document.createElement('div'); body.className = 'card-body';
      const group = document.createElement('small'); group.textContent = zone.title;
      const name = document.createElement('h3'); name.textContent = a.name;
      const purpose = document.createElement('p'); purpose.textContent = a.purpose || 'Open dashboard';
      body.append(group,name,purpose);
      const go = document.createElement('a'); go.className = 'go'; go.href = link(a); go.setAttribute('aria-label','Open ' + a.name); go.addEventListener('click', () => recordRecent(a.id));
      const star = document.createElement('button'); star.type = 'button'; star.className = 'star'; star.dataset.id = a.id; star.textContent = saved.stars.includes(a.id) ? '★' : '☆'; star.setAttribute('aria-pressed',String(saved.stars.includes(a.id))); star.setAttribute('aria-label',(saved.stars.includes(a.id) ? 'Remove ' : 'Favorite ') + a.name + (saved.stars.includes(a.id) ? ' from favorites' : ''));
      star.addEventListener('click', () => {
        saved.stars = saved.stars.includes(a.id) ? saved.stars.filter((id) => id !== a.id) : [...saved.stars,a.id]; store(); render();
        // render replaces the button; return keyboard focus to the same action, or the Favorites filter if that card disappeared.
        const next = [...document.querySelectorAll('.star')].find((b) => b.dataset.id === a.id) || document.querySelector('[data-filter="favorites"]');
        if (next) next.focus({ preventScroll: true });
      });
      let pt = 0, pressed = false;
      go.addEventListener('pointerdown', () => { clearTimeout(pt); pt = setTimeout(() => { pressed = true; star.click(); }, 520); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => go.addEventListener(ev, () => clearTimeout(pt)));
      go.addEventListener('click', (e) => { if (pressed) { pressed = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
      go.addEventListener('contextmenu', (e) => e.preventDefault());
      card.append(sigil,body,go,star); grid.append(card);
      }
      host.append(section);
    }
    const resultLabel = shown.length + (shown.length === 1 ? ' destination' : ' destinations');
    $('#count').textContent = rows.length ? resultLabel : resultLabel + ' · limited map (catalog unavailable)'; $('#empty').hidden = shown.length > 0;
    const pinned = $('#pinned'); pinned.replaceChildren(); pinned.hidden = !saved.stars.length || !!q || filter !== 'all';
    if (!pinned.hidden) {
      const pl = document.createElement('span'); pl.textContent = '\u2605 Pinned  '; pinned.append(pl);
      for (const id of saved.stars) { const a = apps.find((x) => x.id === id); if (!a) continue; const el = document.createElement('a'); el.href = link(a); el.textContent = a.name; el.addEventListener('click', () => recordRecent(a.id)); pinned.append(el); }
    }
    const recent = $('#recent'); recent.replaceChildren(); recent.hidden = !saved.recent.length || !!q || filter !== 'all';
    if (!recent.hidden) {
      const label = document.createElement('span'); label.textContent = 'Recent  '; recent.append(label);
      for (const id of saved.recent) { const a = apps.find((x) => x.id === id); if (!a) continue; const el = document.createElement('a'); el.href = link(a); el.textContent = a.name + ' ↗'; el.addEventListener('click', () => recordRecent(a.id)); recent.append(el); }
    }
  }
  $('#query').addEventListener('input',render);
  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); $('#query').focus(); } else if (e.key === 'Escape' && document.activeElement === $('#query')) { $('#query').value = ''; render(); $('#query').blur(); } });
  const mapBtn = $('#mapBtn');
  mapBtn.addEventListener('click', () => {
    const on = mapBtn.getAttribute('aria-pressed') !== 'true';
    mapBtn.setAttribute('aria-pressed', String(on));
    mapBtn.textContent = on ? 'Back to the full list' : 'All apps on one screen';
    document.body.classList.toggle('mapview', on);
    if (on) { filter = 'all'; document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.filter === 'all'))); render(); $('#deckTitle').scrollIntoView({ block: 'start' }); }
  });

  // "What needs me now": every live room's status card (jarvis.json) plus the accounts in home.json, when they are published.
  // Read-only; a room that does not answer in 5 s is skipped, and the strip always says something.
  function getJson(u) {
    return new Promise((res) => {
      let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
      setTimeout(() => fin(null), 5000);
      try { fetch(u, { cache: 'no-cache', credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then(fin, () => fin(null)); } catch (_) { fin(null); }
    });
  }
  async function loadNeeds() {
    // day-arenas 2026-11-20: the rooms folded under Archive (olympus/doors.js) are never "what needs me now": their stale research feeds
    // (Odeon, Data City, Daphne, Pantheon ...) filled the strip and hid what a trader must act on
    const D = window.OLYMPUS_DOORS, gone = (id) => !!(D && typeof D.archived === 'function' && D.archived(id));
    const list = apps.filter((a) => a.live && a.path && !gone(a.id)), found = [];
    let asked = 0, answered = 0, i = 0;
    const worker = async () => {
      while (i < list.length) {
        const a = list[i++]; asked++;
        const c = await getJson('../' + a.path + 'jarvis.json');
        if (!c) continue;
        answered++;
        const lv = c.status && c.status.level, age = c.t ? Date.now() / 1000 - +c.t : 0;
        if ((lv === 'warn' || lv === 'bad') && !(age > c.stale_after && c.stale_after)) found.push({ a, lv, text: String((c.status && c.status.label) || (lv === 'bad' ? 'A problem' : 'Needs a look')).slice(0, 60) });
      }
    };
    const home = getJson('../home.json');
    await Promise.all([worker(), worker(), worker(), worker()]);
    const h = await home;
    if (h && Array.isArray(h.accounts)) {
      for (const acc of h.accounts) {
        const ev = acc && (acc.eval || acc.funded_eval), room = ev && +ev.room, mll = ev && +ev.mll;
        if (room >= 0 && mll > 0 && room / mll < 0.5) found.push({ a: apps.find((x) => x.id === 'demeter') || apps[0], lv: room / mll < 0.25 ? 'bad' : 'warn', text: String(acc.name || acc.label || 'An account') + ': drawdown left $' + Math.round(room) + ' of $' + Math.round(mll) + ' max loss' });
      }
    }
    found.sort((x, y) => (x.lv === 'bad' ? 0 : 1) - (y.lv === 'bad' ? 0 : 1));
    const host = $('#needsList'); host.replaceChildren();
    $('#needsText').textContent = !answered && !h ? 'No live status yet. Open a room to see it.' : found.length ? found.length + (found.length === 1 ? ' room needs a look.' : ' rooms need a look.') : 'Nothing needs you right now.';
    $('#needs').dataset.level = found.some((f) => f.lv === 'bad') ? 'bad' : found.length ? 'warn' : 'ok';
    for (const f of found.slice(0, 6)) {
      const el = document.createElement('a'); el.href = link(f.a); el.className = 'need ' + f.lv;
      const n = document.createElement('strong'); n.textContent = f.a.name; const t = document.createElement('small'); t.textContent = f.text;
      el.append(n, t); el.addEventListener('click', () => recordRecent(f.a.id)); host.append(el);
    }
  }
  loadNeeds().catch(() => { $('#needsText').textContent = 'Status is not available right now.'; });
  // Deep link: #zone=zeus|money|kalshi|more shows only that door (the old district ids map through `legacy`).
  function zoneFromHash() {
    const m0 = /(?:^#|[&#])zone=([a-z]+)/.exec(location.hash || ''), old = m0 && legacy.find((l) => l.id === m0[1]);
    const m = m0 && old ? [m0[0], old.to] : m0, id = m && zones.some((zn) => zn.id === m[1]) ? m[1] : null;
    if (!id) return;
    filter = id;
    document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.filter === id)));
  }
  zoneFromHash();
  window.addEventListener('hashchange', () => { zoneFromHash(); render(); });
  render();
  // Back/forward cache restores the old DOM without rerunning this script.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    restoreSaved();
    render();
  });

  // AGORA (2026-11-09): the night-city canvas is gone (calm marble page, nothing animated).
})();
