// home.json with your PC's numbers, for every app that reads home.json (night-feedsB 2026-11-18, owner: "everything with accounts,
// all live feed fixed"). The site's home.json is the CLOUD's copy: since GitHub stopped, the cloud cannot see the PC, so its accounts
// are its paper twin on old bars ("MFFU 50K Eval $49,900, floor $48,000, $1,900 left"), its board says "the PC has not reported" and
// "ATLAS is not set up". The PC posts its real status every 15 minutes (tools/pc_report.py -> ntfy, status_feed.json names the topic).
// This classic script, loaded before an app's own module, answers that app's fetch of the site's home.json (and data.json, which
// Ares reads) with the PC's post laid over it
// (pc_feed.js homeOver: live.pc + age, the PC's board, the real accounts and 50K eval, the funded payout line of the payout coach),
// so Ares, Argus, Forum, Labyrinth, Nemesis, Delphi, Epilogue, Pnyx, Kairos and Pythia show what the ZEUS card shows, with no code of
// their own changed. No post (offline, ntfy down, a test's stub) = the cloud's home.json exactly as before. ?demo=1 is never touched.
// Read only: GET only, nothing written, nothing armed. Loads ../pc_feed.js and ../business/payoutcoach.js when the page has not.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof window.fetch !== 'function' || window.HOME_FEED) return;
  const d = document, me = d.currentScript && d.currentScript.src ? d.currentScript.src : null;
  const url = (rel) => { try { return new URL(rel, me || location.href).href; } catch (e) { return rel; } };
  const orig = window.fetch.bind(window);
  const demo = /[?&]demo=1(&|$)/.test(location.search || '');
  const API = window.HOME_FEED = { version: 1, lite: null, used: false, ready: null };
  if (demo) return;
  // loaded with import() (both files are module-safe and set window.PC_FEED / PAYOUT_COACH): a missing file only rejects this promise,
  // where a <script> tag's load error would make the OLYMPUS kit show "could not load" over the whole page while it is starting
  function need(global, src) {
    if (window[global]) return Promise.resolve(window[global]);
    return Promise.race([import(url(src)).then(() => window[global] || null, () => null), new Promise((ok) => setTimeout(() => ok(window[global] || null), 4000))]);
  }
  // the PC's newest post (core + ext), asked once per page as soon as this script runs; 3.5 s at most
  API.ready = Promise.all([need('PC_FEED', 'pc_feed.js?v=n9'), need('PAYOUT_COACH', 'business/payoutcoach.js?v=4')]).then(([F]) => {
    if (!F || !F.fetchLatest) return null;
    return Promise.race([F.fetchLatest({ feedUrl: url('status_feed.json'), fetch: orig }), new Promise((r) => setTimeout(() => r(null), 3500))]);
  }).then((lite) => { API.lite = lite || null; return API.lite; }).catch(() => null);
  // the site's own home.json and data.json only (next to this script: Ares reads data.json), never an app's own data.json
  const ROOTS = ['home.json', 'data.json'].map((n) => { try { return new URL(url(n)).pathname; } catch (e) { return null; } }).filter(Boolean);
  const isHome = (u) => { try { const a = new URL(u, location.href); return a.origin === location.origin && ROOTS.includes(a.pathname); } catch (e) { return false; } };
  window.fetch = function (input, init) {
    const u = typeof input === 'string' ? input : input && input.url;
    if (!u || !isHome(u)) return orig(input, init);
    return orig(input, init).then((r) => {
      if (!r || !r.ok) return r;
      // 2.5 s at most for a post still on its way (the apps abort their own fetch after 6 s): then the cloud's file, as before
      const ready = Promise.race([API.ready, new Promise((ok) => setTimeout(() => ok(null), 2500))]);
      return Promise.all([r.clone().json().catch(() => null), ready]).then(([home, lite]) => {
        const F = window.PC_FEED;
        if (!home || !lite || !F || !F.homeOver) return r;
        const h = F.homeOver(home, lite, Date.now() / 1000, window.PAYOUT_COACH || null);
        if (!h || h === home) return r;
        API.used = true;
        return new Response(JSON.stringify(h), { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } });
      }).catch(() => r);
    });
  };
})();
