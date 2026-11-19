// Live data from the PC, laid over data.json (engine/live_publish.py, owner 2026-10-21: "everything needs to refresh").
// The PC pushes live.json (the Home essentials: verdict, account, position, today's P&L, eval $ to go / room / session,
// feed ages, health, last check-in) to the branch `live` of this site's public repo every 60 s while the bot runs (5 min
// otherwise). data.json comes from the cloud monitor every ~30 min in the session, nothing overnight.
// This file polls live.json every 30-60 s while the app is open and visible (and at once on focus): first GitHub's API
// (fresh within ~60 s, 60 calls an hour per network without a login), then raw.githubusercontent.com (may be up to
// ~5 min behind) when the API's limit is used up. Always network-only (cross-origin: the service worker never caches it).
// It merges live.json into data.json's live.pc / live.pc_verdict / accounts (only when newer), so Home, Trades > Accounts
// and Money show it, and redraws those pages. window.LIVE.apply(X) is called by index.html after every data.json load.
// Classic script loaded after hub.js; uses the main page's globals (D, PAGE, render, $, openDD). Read-only.
(function () {
  'use strict';
  const host = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
  const OWNER = /\.github\.io$/.test(host) ? host.split('.')[0] : 'demetrades2000-coder';
  const REPO = /\.github\.io$/.test(host) && seg && !/\./.test(seg) ? seg : 'nq-dashboard';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/live.json?ref=live`;
  const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/live/live.json`;
  const FRESH_S = 20 * 60;                 // live.json older than this no longer overrides the verdict (the cloud's own rule)
  const LIVE = window.LIVE = { j: null, at: 0, src: null, err: null, apiUntil: 0, every: 45, busy: false, polls: 0 };
  const nowS = () => Date.now() / 1000;
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  LIVE.age = () => (LIVE.j && okN(+LIVE.j.t) ? Math.max(0, nowS() - LIVE.j.t) : null);
  LIVE.fresh = () => { const a = LIVE.age(); return a != null && a < FRESH_S; };

  function inSession(ts = nowS()) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(ts * 1000));
    const g = (k) => (p.find((x) => x.type === k) || {}).value, h = +g('hour') % 24, m = +g('minute'), wd = g('weekday');
    return !['Sat', 'Sun'].includes(wd) && h * 60 + m >= 110 && h * 60 + m <= 955;
  }
  function mergeTrades(a, b) {          // union by entry time, newest last
    const m = new Map();
    for (const t of [...(a || []), ...(b || [])]) if (t) m.set(String(t.entry_t || t.time || '') + '|' + (t.day || ''), t);
    return [...m.values()].sort((x, y) => (+x.entry_t || 0) - (+y.entry_t || 0));
  }

  // ---- the real accounts from the PC's post (night-feedsB 2026-11-18). data.json / home.json are the CLOUD's copy: its board,
  // accounts and eval are its paper twin on old bars (Zlarior $49,900, "ATLAS not set up", "the PC has not reported"). Once the PC's
  // post is here, every account number on this page comes from it (with its age): the board (PC_FEED.boardOver: the cloud lends
  // only its calendar), the accounts (the PC's, then ATLAS from its board card, the cloud twin last), the 50K eval, and for a funded
  // account the payout coach's line (business/payoutcoach.js, the ZEUS card's own rule, so both say the same "need $X more").
  const CLOUD = new WeakMap();                       // X -> the cloud's own board, kept so every new post is laid over it again
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const etDay = (t) => { try { return new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch (e) { return new Date(t * 1000).toISOString().slice(0, 10); } };
  // lay live.json over a data.json / home.json object (in place). Only parts newer than what X already has.
  LIVE.apply = function (X) {
    const j = LIVE.j, raw = LIVE.raw || null, F = window.PC_FEED;
    if (!X || !j || !okN(+j.t)) return X;
    X.live = X.live || {};
    const pc0 = X.live.pc || {}, age = nowS() - j.t;
    if (+j.t >= (+pc0.t || 0)) {
      X.live.pc = { ...pc0, ...(j.pc || {}), present: true, t: j.t, age_s: Math.round(age), live: true };
      if (age < FRESH_S && j.pc_verdict) X.live.pc_verdict = j.pc_verdict;
      else if (j.pc && j.pc.running && inSession()) {
        X.live.pc_verdict = { code: 'SILENT', label: 'PC SILENT', level: 'bad', in_session: true, hb_age_s: Math.round(age), t: Math.round(nowS()),
          reason: `no check-in from the PC for ${Math.round(age / 60)} min (its live feed); the bot said it was running` };
        X.live.pc.silent = true;
      }
      if (age < FRESH_S && okN(+j.price)) X.live.price = +j.price;
      if (typeof j.model_state === 'string' && j.model_state) X.live.model_state = j.model_state;      // the PC bot's own words, not the twin's
    }
    // the board: the PC's, over the cloud's own (kept per object, so each new post starts from the cloud's again)
    if (raw && F && F.boardOver) {
      if (!CLOUD.has(X)) CLOUD.set(X, X.board || null);
      const b = F.boardOver(CLOUD.get(X), raw, nowS());
      if (b && b !== CLOUD.get(X)) X.board = b;
    }
    const B = isObj(X.board) ? X.board : {};
    // the accounts (pc_feed.js accountsOver: the PC's, ATLAS from its board card, the cloud's twin last) and the real 50K eval
    if (F && F.accountsOver && (Array.isArray(j.accounts) || isObj(B.atlas))) X.accounts = F.accountsOver(X.accounts, j, B);
    else if (Array.isArray(j.accounts)) {                       // an older pc_feed.js (cached): the PC's accounts merged the old way
      const L = Array.isArray(X.accounts) ? X.accounts : (X.accounts = []);
      for (const a of j.accounts) {
        if (!a || !a.id) continue;
        const i = L.findIndex((x) => x && x.id === a.id);
        if (i < 0) { L.push({ ...a, live: true }); continue; }
        const o = L[i];
        if ((+(a.conn || {}).t || 0) < (+(o.conn || {}).t || 0)) continue;
        L[i] = { ...o, ...a, trades: mergeTrades(o.trades, a.trades), days: (a.days || []).length >= (o.days || []).length ? a.days : o.days, live: true };
      }
    }
    const e = F && F.eval50 ? F.eval50(X.accounts, isObj(X.live.eval) && !X.live.eval.real ? X.live.eval : X.live.eval_paper, j.t) : null;
    if (e) { if (!X.live.eval_paper && isObj(X.live.eval) && !X.live.eval.real) X.live.eval_paper = X.live.eval; X.live.eval = e; }
    // a funded account says what the ZEUS card says (the payout coach's "need $X more"); the pickers (board.js, mission.js, blitz.js) read
    // LIVE.j.board, so it gets the same line
    if (F && F.payoutLines) {
      const C = window.PAYOUT_COACH || null, today = etDay(nowS());
      const miss = F.payoutLines(B, X.accounts, j, C, today);
      if (j.board && j.board !== B) F.payoutLines(j.board, null, j, C, today);
      if (miss) needCoach();
    }
    return X;
  };

  async function get(url, opts) { const r = await fetch(url, opts); if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.r = r; throw e; } return r; }
  async function fetchLive() {
    // Round 7 (no GitHub): the PC's 15-minute status through ntfy (pc_feed.js) comes first; the GitHub sources stay as a fallback
    try {
      const lj = window.PC_FEED && await window.PC_FEED.fetchLatest();
      if (lj) return { j: window.PC_FEED.toLive(lj, (window.HOMEJ || {}).board), raw: lj, src: 'ntfy' };
    } catch (e) { /* fall through to the old sources */ }
    let r = null, src = 'api';
    if (Date.now() >= LIVE.apiUntil) {
      try {
        r = await get(API, { cache: 'no-cache', headers: { Accept: 'application/vnd.github.raw+json' } });
        const rem = +r.headers.get('x-ratelimit-remaining'), reset = +r.headers.get('x-ratelimit-reset');
        if (okN(rem)) { LIVE.every = rem > 30 ? 30 : 60; if (rem <= 2) LIVE.apiUntil = (okN(reset) && reset > 0 ? reset * 1000 : Date.now() + 15 * 60e3); }
      } catch (e) {
        r = null;
        const h = e.r && e.r.headers, reset = h ? +h.get('x-ratelimit-reset') : NaN;
        if (e.status === 403 || e.status === 429 || !e.status) LIVE.apiUntil = okN(reset) && reset > 0 ? reset * 1000 : Date.now() + 15 * 60e3;
        else if (e.status === 404) LIVE.apiUntil = Date.now() + 10 * 60e3;   // no live branch yet (the PC has not pushed)
      }
    }
    if (!r) { src = 'raw'; r = await get(RAW + '?t=' + Date.now(), { cache: 'no-store' }); }
    let j = await r.json();
    if (j && j.encoding === 'base64' && typeof j.content === 'string') {     // the API ignored the raw Accept header
      const bin = atob(j.content.replace(/\s/g, '')), u8 = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      j = JSON.parse(new TextDecoder().decode(u8));
    }
    if (!j || j.kind !== 'le-live' || !okN(+j.t)) throw new Error('not a live.json');
    return { j, src };
  }
  // the pages that show an account number redraw when a new PC post lands (the bot tabs, the eval pages and the board too: they
  // used to keep the cloud's paper numbers until a reload, night-feedsB 2026-11-18)
  const LIVE_PAGES = ['today', 'accounts', 'money', 'whatif', 'live', 'cockpit', 'trades', 'brain', 'lit', 'atlas', 'eval', 'evalhq', 'plan', 'board', 'mission', 'goals', 'activity'];
  function redraw() {
    try {
      if (typeof D === 'undefined') return;
      if (D) LIVE.apply(D);
      if (window.HOMEJ) LIVE.apply(window.HOMEJ);
      if (document.hidden || (typeof openDD !== 'undefined' && openDD) || document.querySelector('.sheet-wrap')) return;
      if (typeof PAGE !== 'undefined' && LIVE_PAGES.includes(PAGE) && (D || (PAGE === 'today' && window.HOMEJ)) && typeof render === 'function') render(true);
    } catch (e) { console.warn('live redraw', e); }
  }
  // the payout coach (business/payoutcoach.js): the ZEUS card loads it on Home; any other page asks olympus/zeus_core.js for it once
  // (its need() loads the ZEUS models), then the funded lines are drawn again
  let coachSeen = false, coachAsked = false;
  function needCoach() {
    if (coachAsked || window.PAYOUT_COACH) return;
    coachAsked = true;
    try { const Z = window.ZEUS_CORE; if (Z && Z.need) Promise.resolve(Z.need()).then(() => { if (window.PAYOUT_COACH && !coachSeen && LIVE.j) { coachSeen = true; redraw(); } }).catch(() => null); } catch (e) { /* the number stays out */ }
  }
  addEventListener('zeus:update', () => { if (!coachSeen && window.PAYOUT_COACH && LIVE.j) { coachSeen = true; redraw(); } });
  LIVE.poll = async function (force) {
    if (LIVE.busy || (!force && document.hidden)) return;
    // the Live View page (liveview.js) polls its own liveview.json from the same API: live.json waits ~3 min there
    if (!force && typeof PAGE !== 'undefined' && PAGE === 'liveview' && Date.now() - LIVE.at < 170e3) return;
    LIVE.busy = true;
    try {
      const { j, src, raw } = await fetchLive();
      const changed = !LIVE.j || j.t !== LIVE.j.t || (raw && (!LIVE.raw || (raw.reporter || {}).t !== (LIVE.raw.reporter || {}).t));
      // the same post again (a focus / 45 s poll): keep the copy already laid out (its funded line has the payout coach's number);
      // a fresh copy would put the PC's own payout line back on the pickers (board.js, mission.js, blitz.js) until the next redraw
      if (changed) { LIVE.j = j; LIVE.raw = raw || null; }
      LIVE.at = Date.now(); LIVE.src = src; LIVE.err = null; LIVE.polls++;
      if (changed) redraw();
    } catch (e) { LIVE.err = e.message || String(e); }
    finally { LIVE.busy = false; chip(); }
  };

  // the header chip next to the cloud status: "live · 12 s ago" (green < 3 min, amber < 20 min, else hidden)
  function chip() {
    const st = document.getElementById('status'); if (!st) return;
    let el = document.getElementById('liveChip');
    // the PC's status post (ntfy): the header says when the PC last reported, in the ZEUS card's words and its 30-minute rule,
    // instead of the cloud monitor's run age next to a live chip that vanished after 20 minutes (night-feedsB 2026-11-18)
    const rt = LIVE.raw ? +((LIVE.raw.reporter && LIVE.raw.reporter.t) || LIVE.raw.t) || null : null;
    if (rt) {
      const ra = Math.max(0, nowS() - rt), m = Math.round(ra / 60);
      if (!el) { el = document.createElement('span'); el.id = 'liveChip'; el.className = 'status live-chip pc-chip'; st.after(el); }
      st.hidden = true;
      el.innerHTML = `<span class="dot ${ra < 1800 ? '' : 'warn'}"></span><span class="lbl">PC reported </span>${ra < 90 ? 'just now' : m < 90 ? m + ' min ago' : Math.round(ra / 3600) + ' h ago'}`;
      el.title = `Your PC's last status report (ntfy), ${new Date(rt * 1000).toLocaleTimeString()}; quiet after 30 min`;
      return;
    }
    st.hidden = false;
    const a = LIVE.age();
    if (a == null || a > FRESH_S) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('span'); el.id = 'liveChip'; el.className = 'status live-chip'; st.after(el); }
    const txt = a < 90 ? Math.round(a) + ' s' : Math.round(a / 60) + ' min';
    el.innerHTML = `<span class="dot ${a < 180 ? '' : 'warn'}"></span><span class="lbl">live · </span>${txt} ago`;
    el.title = `From the PC (${LIVE.j.host || 'Surface'}) via ${LIVE.src === 'ntfy' ? 'the PC status feed (ntfy)' : LIVE.src === 'raw' ? 'raw.githubusercontent.com' : 'the GitHub API'}; checked ${new Date(LIVE.at).toLocaleTimeString()}`;
  }
  const css = document.createElement('style');
  css.textContent = '.live-chip{margin-left:6px}.live-chip .dot{background:var(--good)}.live-chip .dot.warn{background:var(--warn)}';
  document.head.appendChild(css);

  let timer = null;
  function loop() { clearTimeout(timer); timer = setTimeout(async () => { await LIVE.poll(); loop(); }, LIVE.every * 1000); }
  let lastFocus = 0;
  const onFocus = () => { if (document.hidden || Date.now() - lastFocus < 10000) return; lastFocus = Date.now(); LIVE.poll(true).then(loop); };
  document.addEventListener('visibilitychange', onFocus);
  addEventListener('focus', onFocus);
  addEventListener('pageshow', onFocus);
  setInterval(chip, 5000);
  // the refresh button, pull to refresh and the "Updated" line call load(true): fetch live.json too
  if (typeof window.load === 'function') {
    const l0 = window.load;
    window.load = function (manual) { if (manual === true) LIVE.poll(true); return l0.apply(this, arguments); };
  }
  LIVE.poll(true).then(loop);
})();
