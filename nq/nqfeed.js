// NQ FEED (night-nq-speed 2026-11-27): ONE fetch of the PC's signed status post for every widget, every NQ page, every tab.
// Classic script (window.NQ_FEED), loaded right after ../pc_feed.js; CommonJS for node tests (tests/test_nq_speed.py). Spec + how to
// use it: research/handoff/2026-11-27/speed/NQCORE_API.md.
//   - starts the fetch the moment the page head runs (not after the module graph + home.json: that was 2-6 s on a phone)
//   - stale-while-revalidate: the last VERIFIED post (pc_feed.js keepSigned already passed it) is kept in localStorage and handed out
//     at once with its real report time "t", so a page shows numbers + their true age in the first paint, then the new post replaces it
//   - one request in flight per page; across tabs / hub iframes a 8 s localStorage lease + BroadcastChannel: one tab fetches, all get it
//   - the status_feed.json settings (topic, keys) are cached too: the ntfy poll starts without that extra round trip; revalidated each load
//   - retries with backoff (2, 4, 8, 16, 30, 60 s) while the page is visible, at once when the phone comes back online
//   - while visible, a tiny "anything new?" poll every 60 s (ntfy since=<time>: empty answer = a few hundred bytes); only a new post
//     triggers the full read, so a new report shows within ~1 minute instead of the pages' 5-minute refresh
//   - wraps PC_FEED.fetchLatest on the page (data-wrap="0" on the tag turns that off): pages that already call it get all of the above
//     with no code change. Never invents a post: no cache + no network = null, exactly as before.
//   - [data-age-t="<epoch s>"] elements get "3 minutes ago" written into them and kept counting (one 15 s ticker for the page)
(function (root) {
  'use strict';
  const V = 1, KEY = 'olympus.nqfeed.v1', CFG_KEY = 'olympus.nqfeed.cfg.v1', LEASE_KEY = 'olympus.nqfeed.lease', CH = 'olympus-nq-feed';
  const FRESH_MS = 60000, LEASE_MS = 8000, PROBE_MS = 60000, FULL_MS = 5 * 60000, BACKOFF = [2000, 4000, 8000, 16000, 30000, 60000], HARD_MS = 15000;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const hasDoc = typeof document !== 'undefined';

  // ---------------------------------------------------------------- storage (every access wrapped: private mode / blocked storage = no cache)
  function makeStore(ls) {
    return {
      get(k) { try { const s = ls && ls.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
      set(k, v) { try { if (ls) ls.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
      del(k) { try { if (ls) ls.removeItem(k); } catch (e) { /* none */ } },
    };
  }
  /** a post worth keeping: the lite live.json shape with its own heartbeat time, never one dated in the future (> 10 min skew) */
  function okPost(j, nowS) { return isObj(j) && okN(+j.t) && +j.t > 0 && +j.t <= (okN(nowS) ? nowS : Date.now() / 1000) + 600; }
  /** the newer of two posts by the PC's own times (heartbeat t, reporter t) */
  function newer(a, b) {
    if (!isObj(a)) return b || null; if (!isObj(b)) return a;
    const ta = Math.max(+a.t || 0, (isObj(a.reporter) && +a.reporter.t) || 0), tb = Math.max(+b.t || 0, (isObj(b.reporter) && +b.reporter.t) || 0);
    return tb > ta ? b : a;
  }
  const sameCfg = (a, b) => isObj(a) && isObj(b) && a.ntfy === b.ntfy && a.topic === b.topic && a.vk === b.vk && JSON.stringify(a.vks || []) === JSON.stringify(b.vks || []);

  // ---------------------------------------------------------------- age words (the same as nqcore.js ageWords, short)
  function ageShort(sec) {
    const s = Math.max(0, Math.floor(+sec || 0));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h + ' h' + (m ? ' ' + m + ' min' : '') + ' ago'; }
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d + ' day' + (d === 1 ? '' : 's') + (h ? ' ' + h + ' h' : '') + ' ago';
  }
  /** {s, text, level}: ok <= 20 min (the PC posts every 15), warn <= 36 h, bad older; none without a time */
  function age(t, nowS) {
    const v = +t; if (!okN(v) || v <= 0) return { s: null, text: 'no report yet', level: 'off' };
    const s = Math.max(0, Math.floor((okN(nowS) ? nowS : Date.now() / 1000) - v));
    return { s, text: ageShort(s), level: s <= 1200 ? 'ok' : s <= 36 * 3600 ? 'warn' : 'bad' };
  }

  // ---------------------------------------------------------------- the loader (a factory: node tests make one with fake fetch / clock / storage)
  function create(env) {
    const E = env || {};
    const now = E.now || (() => Date.now());
    const store = makeStore(E.storage !== undefined ? E.storage : (() => { try { return root.localStorage; } catch (e) { return null; } })());
    const feedApi = () => E.pcFeed || root.PC_FEED || null;
    const timer = E.setTimeout || ((f, ms) => setTimeout(f, ms));
    const visible = E.visible || (() => !hasDoc || document.visibilityState !== 'hidden');
    const net = E.fetch || (typeof fetch !== 'undefined' ? (u, o) => fetch(u, o) : null);
    const feedUrl = E.feedUrl || 'status_feed.json';
    const subs = new Set();
    const S = { mem: null, at: 0, src: '', inflight: null, fails: 0, retryAt: 0, probing: false, lastFull: 0, cfg: store.get(CFG_KEY), stats: { net: 0, cache: 0, peer: 0, probe: 0, probeEmpty: 0, fail: 0 } };
    let bc = null;
    try { if (!E.noChannel && typeof BroadcastChannel === 'function') { bc = new BroadcastChannel(CH); bc.onmessage = (ev) => takePeer(ev && ev.data); } } catch (e) { bc = null; }

    function emit(src) {
      const j = S.mem; if (!j) return;
      for (const f of Array.from(subs)) { try { f(copy(j), { src, at: S.at, age: age(j.t, now() / 1000) }); } catch (e) { /* one widget never breaks the rest */ } }
      if (hasDoc && !E.noChannel) { try { root.dispatchEvent(new CustomEvent('nq-feed', { detail: { src, t: +j.t } })); } catch (e) { /* none */ } }   // window 'nq-feed': a page re-reads
    }
    function keep(j, src, at) {
      const nowS = now() / 1000; if (!okPost(j, nowS)) return false;
      const best = newer(S.mem, j);
      const changed = best === j && (!S.mem || JSON.stringify(S.mem) !== JSON.stringify(j));
      S.at = Math.max(S.at, at || now());
      if (best === j) { S.mem = j; S.src = src; }
      if (changed && src !== 'cache') store.set(KEY, { v: V, at: S.at, lite: S.mem });
      else if (src === 'net') store.set(KEY, { v: V, at: S.at, lite: S.mem });   // a re-check that found the same post: the "checked" time moves on
      return changed;
    }
    function takePeer(d) {
      if (!isObj(d) || d.v !== V || !isObj(d.lite)) return;
      S.stats.peer++;
      if (keep(d.lite, 'peer', +d.at || now())) emit('peer');
    }
    // the cache at start: shown at once (its t is the PC's own: an old post reads as old)
    (function boot() { const c = store.get(KEY); if (isObj(c) && c.v === V && okPost(c.lite)) { S.mem = c.lite; S.at = +c.at || 0; S.src = 'cache'; S.stats.cache++; } })();

    async function getCfg() {
      // the cached settings let the poll start now; the real file is read in parallel and wins when it differs (a key rotation)
      const fresh = (async () => {
        if (!net) return null;
        try {
          const early = hasDoc && root.NQ_EARLY && root.NQ_EARLY.text && root.NQ_EARLY.text['../status_feed.json'];
          let j = null;
          if (early) { try { j = JSON.parse((await early) || 'null'); } catch (e) { j = null; } }
          if (!j) { const r = await net(feedUrl, { cache: 'no-cache' }); j = r && r.ok ? await r.json() : null; }
          if (isObj(j) && j.topic) { if (!sameCfg(j, S.cfg)) store.set(CFG_KEY, j); return j; }
        } catch (e) { /* the cached copy */ }
        return null;
      })();
      return { cached: isObj(S.cfg) && S.cfg.topic ? S.cfg : null, fresh };
    }
    async function full() {
      const F = feedApi(), orig = (F && F.__nqOrig) || (F && F.fetchLatest);
      if (!orig) return null;
      const { cached, fresh } = await getCfg();
      let j = null;
      const run = (feed) => Promise.race([orig.call(F, { feed, fetch: E.fetch }), new Promise((r) => timer(() => r(null), HARD_MS))]).catch(() => null);
      if (cached) {
        j = await run(cached);
        const f = await fresh;
        if (f && !sameCfg(f, cached)) { S.cfg = f; j = newer(j, await run(f)); }   // settings changed: read again with the new ones
      } else {
        const f = await fresh; if (f) { S.cfg = f; j = await run(f); }
      }
      return j;
    }
    function leaseHeld() { const l = store.get(LEASE_KEY); return isObj(l) && okN(+l.until) && +l.until > now() && l.id !== ID; }
    const ID = Math.random().toString(36).slice(2);
    function waitPeer(ms) {
      return new Promise((ok) => { const t0 = S.at; let done = false; const fin = () => { if (!done) { done = true; subs.delete(on1); ok(S.at > t0); } };
        const on1 = () => fin(); subs.add(on1); timer(fin, ms); });
    }
    /** a fresh read (single flight); force skips the "fresh enough" check */
    function refresh(force) {
      if (S.inflight) return S.inflight;
      if (!force && S.mem && now() - S.at < FRESH_MS) return Promise.resolve(copy(S.mem));
      S.inflight = (async () => {
        try {
          if (!force && leaseHeld() && bc) { if (await waitPeer(LEASE_MS)) return copy(S.mem); }
          store.set(LEASE_KEY, { id: ID, until: now() + LEASE_MS });
          const j = await full();
          S.lastFull = now();
          if (j && okPost(j, now() / 1000)) {
            S.stats.net++; S.fails = 0;
            const changed = keep(j, 'net', now());
            try { if (bc) bc.postMessage({ v: V, at: S.at, lite: S.mem }); } catch (e) { /* none */ }
            if (changed) emit('net');
            return copy(S.mem);
          }
          S.stats.fail++; S.fails++; backoff();
          return copy(S.mem);   // the last verified post (its own age) or null: never a made-up one
        } finally { S.inflight = null; if (store.get(LEASE_KEY) && store.get(LEASE_KEY).id === ID) store.del(LEASE_KEY); }
      })();
      return S.inflight;
    }
    function backoff() {
      if (E.noTimers) return;
      const ms = BACKOFF[Math.min(S.fails - 1, BACKOFF.length - 1)], at = now() + ms;
      if (S.retryAt && S.retryAt <= at) return;
      S.retryAt = at;
      timer(() => { S.retryAt = 0; if (visible()) refresh(true); else S.fails = Math.max(1, S.fails); }, ms);
    }
    /** the cheap "anything new?" check: messages on the topic since the last full read (60 s grace); empty = nothing to do */
    async function probe() {
      const cfg = S.cfg; if (!net || !isObj(cfg) || !cfg.topic || S.inflight || S.probing) return false;
      if (now() - S.lastFull >= FULL_MS) { await refresh(true); return true; }
      const base = String(cfg.ntfy || 'https://ntfy.sh').replace(/\/+$/, '');
      if (!/^https:\/\//.test(base) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(cfg.topic))) return false;
      S.probing = true;
      try {
        const since = Math.floor(S.lastFull / 1000) - 60;
        const r = await net(`${base}/${encodeURIComponent(cfg.topic)}/json?poll=1&since=${since}`, { cache: 'no-store' });
        S.stats.probe++;
        const t = r && r.ok ? await r.text() : '';
        if (!/"event":"message"/.test(t || '')) { S.stats.probeEmpty++; return false; }
      } catch (e) { return false; } finally { S.probing = false; }
      await refresh(true);
      return true;
    }

    /** the newest post now: the kept one when read < 60 s ago, else the network (one flight); null only with no post at all */
    function latest(opts) { return refresh(!!(opts && opts.force)); }
    /** the kept post, synchronously (localStorage / this page / another tab), or null */
    function cached() { return copy(S.mem); }
    /** cb(post, {src: cache|net|peer, at, age}) now (when a post is kept) and on every newer post; returns the unsubscribe */
    function on(cb) { if (typeof cb !== 'function') return () => {}; subs.add(cb); if (S.mem) { try { cb(copy(S.mem), { src: S.src, at: S.at, age: age(S.mem.t, now() / 1000) }); } catch (e) { /* none */ } } return () => subs.delete(cb); }
    /** a drop-in for PC_FEED.fetchLatest(opts): the shared post (a custom feed / fetch goes straight to the original) */
    function fetchLatestShared(opts) {
      const o = opts || {}, F = feedApi(), orig = F && (F.__nqOrig || F.fetchLatest);
      if ((o.feed || o.fetch) && orig) return orig.call(F, o);
      return latest();
    }
    function info() { return { at: S.at, src: S.src, t: S.mem ? +S.mem.t : null, fails: S.fails, stats: { ...S.stats } }; }
    return { latest, cached, on, refresh, probe, fetchLatestShared, info, age, _state: S };
  }

  // ---------------------------------------------------------------- the page instance
  const API = { V, KEY, CFG_KEY, create, age, ageShort, okPost, newer };
  if (hasDoc && typeof window !== 'undefined') {
    const me = document.currentScript, src = me && me.src ? me.src : document.baseURI;
    let url; try { url = new URL((me && me.getAttribute('data-feed')) || '../status_feed.json', src).href; } catch (e) { url = '../status_feed.json'; }
    const L = create({ feedUrl: url });
    Object.assign(API, L);
    const F = window.PC_FEED;
    if (F && F.fetchLatest && !F.__nqOrig && !(me && me.getAttribute('data-wrap') === '0')) { F.__nqOrig = F.fetchLatest; F.fetchLatest = L.fetchLatestShared; }
    L.latest();                                                       // start now, in the head: the modules find it in flight
    // the 60 s "anything new?" while visible; a page coming back / the phone back online re-reads at once
    setInterval(() => { if (document.visibilityState !== 'hidden') L.probe(); }, PROBE_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - L._state.at > FRESH_MS) L.refresh(true); });
    window.addEventListener('online', () => L.refresh(true));
    // [data-age-t] ages, one ticker
    const tick = () => { try { const n = Date.now() / 1000; document.querySelectorAll('[data-age-t]').forEach((el) => { const a = age(+el.getAttribute('data-age-t'), n); if (el.textContent !== a.text) el.textContent = a.text; el.setAttribute('data-age-level', a.level); }); } catch (e) { /* none */ } };
    API.tickAges = tick;
    setInterval(() => { if (document.visibilityState !== 'hidden') tick(); }, 15000);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
  }
  root.NQ_FEED = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
