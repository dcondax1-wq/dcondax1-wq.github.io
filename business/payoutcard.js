// PAYOUT COACH card (2026-11-17, classic script; needs payoutcoach.js first). Used by business/accounts.html and board/index.html.
// For each funded account: what you can request today (or what is missing), the 50% best-day rule, days traded this cycle,
// the 30% tax pot and the net, the 7-day inactivity countdown. Numbers from the PC (its funded tracker in home.json / the ntfy
// feed, when under 12 hours old), else what you typed here (saved on this phone only), else accounts.json (what you told Claude).
// Everything is drawn with textContent. Never requests a payout: you do that in the MFFU dashboard.
//   PAYOUT_CARD.mount(container, {plan, home, lite})   plan = business/accounts.json, home = home.json, lite = the PC feed
(function () {
  'use strict';
  const C = window.PAYOUT_COACH;
  const KEY = 'business.payout.v1', FRESH_S = 12 * 3600;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const FIELDS = [['balance', 'Balance now ($)', 'number'], ['cycle_start_balance', 'Balance when this cycle began ($: 25,000, or right after the last payout)', 'number'],
                  ['best_day', 'Best day this cycle ($)', 'number'], ['cycle_days', 'Days traded this cycle', 'number'],
                  ['first_trade', 'First funded trade day', 'date'], ['last_trade', 'Last trade day', 'date'], ['payouts_n', 'Payouts taken so far', 'number']];

  function load() { try { const j = JSON.parse(localStorage.getItem(KEY) || '{}'); return isObj(j) ? j : {}; } catch (e) { return {}; } }
  function save(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch (e) { return false; } }

  // the PC's tracker for an account key (ATLAS = board.atlas.funded; others = board[key].funded when there is one)
  function pcState(key, home, lite) {
    let best = null;
    for (const src of [lite, home]) {
      const b = isObj(src) && isObj(src.board) ? src.board : null;
      const a = b && isObj(b[key]) ? b[key] : null;
      if (!a || !isObj(a.funded)) continue;
      const t = +(a.data_t || a.t || b.data_t || b.t || (isObj(src) && src.t) || 0);
      if (!best || t > best.t) best = { t, state: C.fromTracker(a.funded, { last_trade: a.last_trade }), from: src === lite ? 'your PC (live feed)' : 'your PC (site)' };
    }
    return best;
  }

  function rowsOf(plan, home, lite) {
    const out = [];
    for (const a of (isObj(plan) && Array.isArray(plan.accounts) ? plan.accounts : [])) {
      if (!isObj(a) || /blitz/i.test(String(a.key))) continue;
      const pc = pcState(a.key, home, lite);
      if (!isObj(a.funded) && a.stage !== 'funded' && !pc) continue;
      out.push({ key: a.key, name: a.name, planKey: a.match === 'builder50k' ? 'builder50k' : 'builder25k', told: isObj(a.funded) ? a.funded : null, pc });
    }
    return out;
  }

  // newest of: the PC (fresh), typed here, told to Claude (accounts.json)
  function pick(r, typed, nowS) {
    const c = [];
    if (r.pc && r.pc.state && r.pc.state.balance != null && nowS - r.pc.t < FRESH_S) c.push({ t: r.pc.t, state: r.pc.state, from: r.pc.from });
    if (isObj(typed) && typed.balance != null) c.push({ t: +typed.t || 0, state: typed, from: 'what you typed on this phone' });
    if (r.told && r.told.balance != null) c.push({ t: Date.parse((r.told.as_of || '1970-01-01') + 'T21:00:00Z') / 1000 || 0, state: r.told, from: 'what you told Claude (' + (r.told.as_of || '?') + ')' });
    c.sort((a, b) => b.t - a.t);
    return c[0] || null;
  }

  function card(r, all, rerender) {
    const nowS = Math.floor(Date.now() / 1000);
    const typed = all[r.key];
    const p = pick(r, typed, nowS);
    const box = el('section', 'ag-card card pc-coach');
    box.dataset.key = r.key;
    const top = el('div', 'row2');
    top.appendChild(el('h3', null, 'Payout coach: ' + r.name));
    const res = p ? C.coach(p.state, r.planKey) : null;
    const chip = !res || !res.ok ? 'waiting' : res.status === 'ready' ? 'live' : res.status === 'allowed' ? 'buying' : 'waiting';
    top.appendChild(el('span', 'st ' + chip, !res || !res.ok ? 'NO NUMBERS' : res.status === 'ready' ? 'READY' : res.status === 'allowed' ? 'ALLOWED' : res.status === 'not_yet' ? 'NOT YET' : res.status.toUpperCase()));
    box.appendChild(top);
    if (res && res.ok) {
      const ul = el('ul', 'coach-lines');
      C.lines(res).forEach((t, i) => ul.appendChild(el('li', i === 0 ? 'lead' : (/^Inactivity/.test(t) && res.idle_warn ? 'warn' : null), t)));
      box.appendChild(ul);
      if (res.after_room != null) box.appendChild(el('p', 'meta', 'After this payout: balance ' + C.usd(res.after_balance) + ', room ' + C.usd(res.after_room) + ' above the floor (it sits at ' + C.usd(C.PLANS[r.planKey].start + C.PLANS[r.planKey].lock) + ' after the 1st payout).'));
      box.appendChild(el('p', 'meta', 'Numbers from ' + p.from + '. Plan: ' + C.POLICY.text + ' (' + C.usd(res.plan_line) + ' above start). You request it in the MFFU dashboard; the bot never does.'));
    } else {
      box.appendChild(el('p', 'meta', 'No funded numbers yet. Once the funded account trades, your PC fills this in, or type them below (or tell Claude).'));
    }
    const det = el('details', 'coach-form');
    det.appendChild(el('summary', null, 'Type your numbers (from the MFFU dashboard)'));
    const form = el('form');
    const cur = isObj(typed) ? typed : (r.told || {});
    for (const [k, label, type] of FIELDS) {
      const id = 'pc-' + r.key + '-' + k;
      const lab = el('label', null, label); lab.htmlFor = id;
      const inp = document.createElement('input');
      inp.id = id; inp.name = k; inp.type = type;
      if (type === 'number') { inp.inputMode = 'decimal'; inp.step = 'any'; }
      if (cur[k] != null) inp.value = String(cur[k]);
      form.appendChild(lab); form.appendChild(inp);
    }
    const btn = el('button', 'ag-btn', 'Save on this phone'); btn.type = 'submit';
    form.appendChild(btn);
    const say = el('p', 'meta'); say.setAttribute('role', 'status');
    form.appendChild(say);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = { t: Math.floor(Date.now() / 1000) };
      for (const [k, , type] of FIELDS) {
        const x = String(form.elements[k].value || '').trim();
        if (x !== '') v[k] = type === 'number' ? +x.replace(/[,$\s]/g, '') : x;
      }
      all[r.key] = v;
      say.textContent = save(all) ? 'Saved.' : 'Could not save on this phone (private mode?).';
      rerender();
    });
    det.appendChild(form);
    box.appendChild(det);
    return box;
  }

  function mount(container, opts) {
    if (!container || !C) return;
    if (container.querySelector('details[open]')) return;       // a refresh never wipes what you are typing
    const o = opts || {};
    const rows = rowsOf(o.plan, o.home, o.lite);
    const draw = () => {
      const all = load();
      while (container.firstChild) container.removeChild(container.firstChild);
      if (rows.length && o.title) container.appendChild(el('h2', o.titleClass || null, o.title));
      for (const r of rows) container.appendChild(card(r, all, draw));
      container.hidden = !rows.length;
    };
    draw();
  }

  window.PAYOUT_CARD = { mount, rowsOf, pick, KEY };
})();
