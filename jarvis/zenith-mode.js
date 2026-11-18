// Zenith mode for the Jarvis hub (owner 2026-11-01: "on Jarvis I can switch between that mode [Jarvis], zenith mode with all
// of the features"). The whole Zenith app (the NQ dashboard at <site>/, tools/web_public/index.html) full screen inside Jarvis:
// the Jarvis bar is covered, one small floating control (edge-docked, draggable, safe-area aware, never over Zenith's header
// or bottom tab bar) goes back to Jarvis mode, and the Zenith frame stays alive while Jarvis mode shows, so its page, scroll
// and route are kept.
//
//   import { mountZenithMode } from './zenith-mode.js';
//   const zm = mountZenithMode({ host, onExit });      // host: the Jarvis page's element for Zenith mode (e.g. #zen)
//   zm.show('#/blitz');  zm.show();  zm.hide();  zm.isActive();
//
//   mountZenithMode(opts) -> { show(route?), hide(), isActive(), open(route), state(), unload(), destroy(), frame }
//     opts.host        required. Zenith mode draws a full-screen layer (position: fixed) inside it.
//     opts.onExit()    called when the owner goes back to Jarvis mode (the control, or Zenith's own "Back to Jarvis").
//     opts.onState(s)  optional: s = { route, title, badge, active } whenever Zenith reports a change.
//     opts.onWantShow(route)  optional: a Zenith notification was tapped while Jarvis runs (sw.js v50); the hub should
//                      switch to Zenith mode and call show(route). Without it the route is only kept for the next show().
//     opts.apps()      optional: the hub's apps [{ id, name, icon?, glyph? }] for the switcher (Zenith itself is left out);
//                      icon = a picture link (shown in the app's chip), glyph = a letter when there is no picture.
//     opts.onSwitch(id) optional: with apps, the control is a tiny switcher: tap = back to Jarvis as before; hold it
//                      (0.45 s, or an arrow key) and the other apps show as chips next to it; a chip calls onSwitch(id)
//                      (the "Jarvis" chip calls onExit). Without onSwitch the control only goes back to Jarvis.
//     opts.src         optional: Zenith's address (default: the site root next to jarvis/, i.e. '../').
//     opts.preload     optional: load Zenith right away, hidden (default: on the first show(), iPhone memory).
//   The host also gets DOM events: 'zenith:state' (detail = state), 'zenith:exit', 'zenith:wantshow' (detail.route),
//   'zenith:switch' (detail.app).
//   show(route) opens Zenith mode; route is a Zenith address such as '#/blitz' (also 'blitz' or '/blitz'); without it
//   Zenith stays where the owner left it (first open: the route saved this session, else Zenith's Home).
//   open(route) moves Zenith without showing it; unload() lets the frame go (iPhone memory: one dashboard at a time) and
//   the next show() loads it again at the route it had; destroy() removes everything (listeners included).
//   For the hub: call show() for the Zenith chip / card / brain, hide() whenever another view takes the screen (onExit
//   is the owner leaving by himself). host may be hidden between shows (hidden / display:none): the layer is
//   position:fixed, lifted above the hub's own stacking while it shows, and Zenith gets its scroll back. Hidden, Zenith
//   is paused like a backgrounded app but stays loaded; unload() (or destroy()) is how the hub frees it.
//   zenithRouteFor(text) maps spoken words to a Zenith route for Jarvis's brain: "open BLITZ" -> '#/blitz',
//   "atlas trades" -> '#/atlas/trades', "holodeck" -> '#/holo', null when nothing matches.
//   CSS hooks on the Jarvis page: --zm-z (the layer's z-index, default 2147483000) and --zm-safe-top / -right / -bottom /
//   -left (override the screen's safe areas, e.g. in a test; default env(safe-area-inset-*)). The look follows the page's
//   theme: --c (border, glow), --c2, --c3 (highlights), --pr (glass), --txt, --fh (Orbitron labels); without them the
//   Jarvis violet: #a855f7 / #c084fc on rgba(12,10,20,.85).
//   Zenith's side: index.html's head (inside-Jarvis detection, the safe areas) and embed.js (the protocol, the settings
//   code "bring my Zenith settings": which keys move and which never do is listed at the top of embed.js).
//   Tested by tests/test_zenith_mode.py.
//
// ---------------------------------------------------------------------------------------------------- the postMessage protocol
// Same site only, both ways: every message is posted with targetOrigin = this site's origin, and every receiver drops a
// message unless event.origin is its own origin AND event.source is the expected window (Jarvis: its Zenith frame;
// Zenith: window.parent). Messages are plain objects { ns, v: 1, type, ... }; unknown types and other versions are ignored.
//
//   Zenith -> Jarvis   (ns 'le-zenith'; sent by tools/web_public/embed.js)
//     hello   { route, title, badge }   Zenith started inside Jarvis (Jarvis answers with insets + visible, and a waiting open)
//     state   { route, title, badge }   on every change: route '#/blitz/brain' (/^#\/[\w\-/:.%,]*$/, <= 200 chars),
//                                        title 'BLITZ' (the page title, <= 80 chars), badge = unseen activity (0..9999)
//     layout  { top, bottom, cover }    the floating control's room: top = the header's bottom edge (px from the top),
//                                        bottom = the tab bar + scroll-to-top slot (px from the bottom); cover = a layer is
//                                        open over the page (Holodeck / Live View full screen, the search palette, a sheet,
//                                        a trade picture, the intro): the control steps aside until it closes
//     exit    {}                        Zenith's own "Back to Jarvis" (Settings > Inside Jarvis)
//   Jarvis -> Zenith   (ns 'le-jarvis'; sent by this module)
//     open    { route }                 go to that Zenith page ("open BLITZ" -> '#/blitz'); Zenith checks the route again
//     insets  { top, right, bottom, left }   the screen's safe areas this frame covers, px (Zenith pads with them instead
//                                        of env(), so nothing pads twice: index.html's head maps env(safe-area-inset-*))
//     visible { visible }               Zenith mode shown / hidden: hidden = Zenith pauses like a backgrounded app (3D, polling)
//     ping    {}                        Zenith answers with state + layout
//
// Paper only, read-only: nothing here talks to the bots. Safari 16 syntax, no imports.

const NS_J = 'le-jarvis', NS_Z = 'le-zenith', V = 1;
const ROUTE_RX = /^#\/[\w\-/:.%,]*$/;
const KEY_ROUTE = 'jarvis.zenith.route', KEY_DOCK = 'jarvis.zenith.dock', KEY_TIP = 'jarvis.zenith.tips';
const CH = 48;                         // the control's height (hit area 44 x 48)
const IDLE_MS = 2600;

/** '#/blitz' from '#/blitz', '/blitz' or 'blitz'; null when it is not a Zenith address. */
export function normRoute(r) {
  if (typeof r !== 'string') return null;
  let s = r.trim();
  if (!s) return null;
  if (s[0] !== '#') s = '#' + (s[0] === '/' ? s : '/' + s);
  return s.length <= 200 && ROUTE_RX.test(s) ? s : null;
}

// Jarvis's brain: words -> a Zenith page. The bots' sections follow Zenith's own order (Today · Brain · Trades · Results · Rules).
const BOT = [[/\b(zlarior|lit)\b/, 'lit'], [/\batlas\b/, 'atlas'], [/\bblitz\b/, 'blitz']];
const PART = [[/\bbrain\b/, 'brain'], [/\btrades?\b/, 'trades'], [/\b(results?|performance|perf)\b/, 'results'], [/\b(rules?|strategy|setups?)\b/, 'rules'], [/\bgo ?live\b/, 'golive']];
const BOT_PART = {
  lit: { brain: '#/brain', trades: '#/trades', results: '#/perf', rules: '#/strategy' },
  atlas: { brain: '#/atlas/brain', trades: '#/atlas/trades', results: '#/atlas/results', rules: '#/atlas/setups' },
  blitz: { brain: '#/blitz/brain', trades: '#/blitz/trades', results: '#/blitz/results', rules: '#/blitz/rules', golive: '#/blitz/golive' },
};
export const ZENITH_ROUTES = [
  ['#/liveview', /\blive ?view\b|\blive chart\b/], ['#/holo', /\bholo(deck)?\b|\b3d\b/], ['#/mission', /\bmission( control)?\b/],
  ['#/deck', /\b(trader'?s )?deck\b/], ['#/mind', /\bthe mind\b|\bmind\b/], ['#/settings', /\bsettings?\b/],
  ['#/activity', /\bactivity\b|\bfills\b/], ['#/alerts', /\bnotifications?\b|\balerts?\b/], ['#/news', /\bnews\b|\beconomic calendar\b/],
  ['#/board', /\b(live )?board\b/], ['#/real', /\bmoney\b|\breal (results|money)\b/], ['#/system', /\bmore\b/],
  ['#/today', /\bzenith( home)?\b|\bnq\b/],
];
/** A Zenith route for a spoken / typed request ("open BLITZ" -> '#/blitz'), or null. */
export function zenithRouteFor(text) {
  const q = String(text || '').toLowerCase().replace(/[’']/g, "'");
  if (!q.trim()) return null;
  const bot = (BOT.find(([re]) => re.test(q)) || [])[1];
  if (bot) {
    const part = (PART.find(([re]) => re.test(q)) || [])[1];
    return (part && BOT_PART[bot][part]) || '#/' + bot;
  }
  const hit = ZENITH_ROUTES.find(([, re]) => re.test(q));
  return hit ? hit[0] : null;
}

const CSS = `
.zm-root{position:fixed;inset:0;z-index:var(--zm-z,2147483000);background:#07080c;opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .2s ease,visibility 0s linear .2s;
  --zm-cr:168,85,247;--zm-c2r:192,132,252;--zm-c3r:192,132,252;--zm-pr:12,10,20;--zm-txt:var(--txt,#ece9f2);
  --zm-fh:var(--fh,"Orbitron","Bahnschrift","Segoe UI",system-ui,-apple-system,sans-serif)}
.zm-root.on{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .2s ease}
.zm-frame{position:absolute;inset:0;width:100%;height:100%;border:0;margin:0;padding:0;display:block;background:#07080c;color-scheme:dark}
.zm-back{position:absolute;z-index:5;top:0;right:var(--zm-sr,0px);width:44px;height:${CH}px;margin:0;padding:0;border:0;background:none;color:var(--zm-txt);
  cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;
  transform:translate3d(0,var(--zm-y,50vh),0);transition:transform .32s cubic-bezier(.2,.8,.2,1),opacity .3s ease,visibility 0s;opacity:.95}
.zm-back.left{right:auto;left:var(--zm-sl,0px)}
.zm-pill{position:absolute;top:2px;bottom:2px;right:0;width:34px;display:grid;place-items:center;border-radius:22px 0 0 22px;
  background:rgba(var(--zm-pr),.85);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);
  border:1px solid rgba(var(--zm-cr),.62);border-right:0;
  box-shadow:0 0 16px rgba(var(--zm-cr),.38),0 8px 24px rgba(0,0,0,.55),inset 0 0 10px rgba(var(--zm-cr),.18)}
.zm-back.left .zm-pill{right:auto;left:0;border-radius:0 22px 22px 0;border-right:1px solid rgba(var(--zm-cr),.62);border-left:0}
.zm-orb{position:relative;width:18px;height:18px;border-radius:50%;
  background:radial-gradient(circle,#fff 0 16%,rgba(var(--zm-c3r),.85) 30%,rgba(var(--zm-cr),.28) 58%,rgba(var(--zm-cr),0) 72%);
  box-shadow:0 0 12px rgba(var(--zm-cr),.65)}
.zm-orb::after{content:"";position:absolute;inset:1px;border-radius:50%;border:1.5px solid rgba(var(--zm-c3r),.6)}
.zm-back.idle{opacity:.6}
.zm-back.drag{transition:none;opacity:1}
.zm-back.drag .zm-pill{border-radius:22px;border:1px solid rgba(var(--zm-cr),.9);background:rgba(var(--zm-pr),.95);box-shadow:0 0 22px rgba(var(--zm-cr),.55),0 8px 24px rgba(0,0,0,.55)}
.zm-back.cov{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,visibility 0s linear .2s}
.zm-back:focus{outline:none}.zm-back:focus-visible .zm-pill{outline:2px solid rgba(var(--zm-cr),.9);outline-offset:2px}
.zm-back:active .zm-orb{transform:scale(.9)}
.zm-tip{position:absolute;top:50%;right:42px;transform:translate(6px,-50%);padding:8px 12px;border-radius:10px;background:rgba(var(--zm-pr),.92);
  border:1px solid rgba(var(--zm-cr),.5);color:var(--zm-txt);font:600 10.5px/1.2 var(--zm-fh);letter-spacing:.14em;text-transform:uppercase;
  white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .25s ease,transform .25s ease;
  box-shadow:0 0 14px rgba(var(--zm-cr),.3),0 8px 24px rgba(0,0,0,.5)}
.zm-back.left .zm-tip{right:auto;left:42px;transform:translate(-6px,-50%)}
.zm-back.tip .zm-tip{opacity:1;transform:translate(0,-50%)}
.zm-back.sw .zm-pill::after{content:"";position:absolute;bottom:6px;left:50%;width:10px;height:2px;margin-left:-5px;border-radius:2px;
  background:rgba(var(--zm-c3r),.6);box-shadow:0 0 6px rgba(var(--zm-cr),.6)}
.zm-scrim{position:absolute;inset:0;z-index:3;background:rgba(0,0,0,.38);opacity:0;transition:opacity .16s ease}
.zm-apps{position:absolute;z-index:4;top:0;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:16px;box-sizing:border-box;min-width:156px;
  background:rgba(var(--zm-pr),.85);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);
  border:1px solid rgba(var(--zm-cr),.55);box-shadow:0 0 22px rgba(var(--zm-cr),.3),0 14px 40px rgba(0,0,0,.6),inset 0 0 18px rgba(var(--zm-cr),.1);
  opacity:0;transform:scale(.96);transition:opacity .16s ease,transform .16s ease}
.zm-root.apps .zm-apps,.zm-root.apps .zm-scrim{opacity:1;transform:none}
.zm-apps[hidden],.zm-scrim[hidden]{display:none}
.zm-chip{display:flex;align-items:center;gap:10px;min-height:44px;min-width:44px;margin:0;padding:0 16px 0 8px;text-align:left;border-radius:11px;
  border:1px solid rgba(var(--zm-cr),.32);background:rgba(var(--zm-cr),.07);color:var(--zm-txt);font:600 11.5px/1 var(--zm-fh);letter-spacing:.14em;
  text-transform:uppercase;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease,border-color .12s ease}
.zm-chip:active{background:rgba(var(--zm-cr),.2);border-color:rgba(var(--zm-cr),.75)}
.zm-chip:focus{outline:none}.zm-chip:focus-visible{outline:2px solid rgba(var(--zm-cr),.9);outline-offset:2px}
.zm-ci{width:28px;height:28px;border-radius:8px;flex:none;display:grid;place-items:center;object-fit:cover;box-sizing:border-box;overflow:hidden;
  border:1px solid rgba(var(--zm-cr),.35);background:rgba(var(--zm-pr),.9)}
.zm-chip .zm-orb{width:18px;height:18px}
.zm-gl{color:rgb(var(--zm-c3r));font:700 13px/1 var(--zm-fh);letter-spacing:0;text-shadow:0 0 8px rgba(var(--zm-cr),.6)}
@media (prefers-reduced-motion:reduce){.zm-root,.zm-back,.zm-apps,.zm-scrim,.zm-chip{transition:none!important}}
html.zm-on,html.zm-on body{overscroll-behavior:none}
`;

const store = {
  get(s, k, d) { try { const v = s.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(s, k, v) { try { s.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: nothing kept */ } },
};

/** Zenith mode inside the Jarvis page. See the top of this file. */
export function mountZenithMode(opts = {}) {
  const host = opts.host;
  if (!host || !host.ownerDocument) throw new Error('mountZenithMode: host element required');
  const doc = host.ownerDocument, win = doc.defaultView;
  const ORIGIN = win.location.origin;
  const SS = (() => { try { return win.sessionStorage; } catch (e) { return null; } })();
  const LS = (() => { try { return win.localStorage; } catch (e) { return null; } })();
  const base = (() => { try { return new URL(opts.src || new URL('../', import.meta.url).href, win.location.href); } catch (e) { return new URL('../', win.location.href); } })();
  base.hash = '';

  if (!doc.getElementById('zm-css')) {
    const st = doc.createElement('style'); st.id = 'zm-css'; st.textContent = CSS; (doc.head || doc.documentElement).appendChild(st);
  }
  const root = doc.createElement('div');
  root.className = 'zm-root';
  root.setAttribute('aria-hidden', 'true');
  root.inert = true;
  const btn = doc.createElement('button');
  btn.type = 'button'; btn.className = 'zm-back';
  btn.setAttribute('aria-label', 'Back to Jarvis'); btn.title = 'Back to Jarvis';
  btn.innerHTML = '<span class="zm-pill"><span class="zm-orb"></span></span><span class="zm-tip" aria-hidden="true">Back to Jarvis</span>';
  const scrim = doc.createElement('div'); scrim.className = 'zm-scrim'; scrim.hidden = true;
  const panel = doc.createElement('div'); panel.className = 'zm-apps'; panel.hidden = true;
  panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Switch app');
  root.appendChild(scrim); root.appendChild(btn); root.appendChild(panel);
  host.appendChild(root);

  // the hub's theme (Jarvis: --c / --c2 / --c3 / --pr on <html data-theme>, any CSS colour or an "r,g,b" token) carries over
  // to the control and its chips; violet (#a855f7 / #c084fc on rgba(12,10,20,.85)) when the page has none
  const cprobe = doc.createElement('i');
  cprobe.setAttribute('aria-hidden', 'true');
  cprobe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
  root.appendChild(cprobe);
  function rgbOf(v) {
    const t = String(v || '').trim();
    if (!t) return null;
    if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(t)) return t.split(',').map((x) => Math.min(255, +x.trim()));
    cprobe.style.color = '';
    cprobe.style.color = t;
    if (!cprobe.style.color) return null;                              // not a colour
    const m = win.getComputedStyle(cprobe).color.match(/(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/);
    return m ? [m[1], m[2], m[3]].map((x) => Math.round(+x)) : null;
  }
  function theme() {
    const cs = win.getComputedStyle(doc.documentElement), g = (k) => rgbOf(cs.getPropertyValue(k));
    const put = (k, v) => root.style.setProperty(k, v.join(','));
    put('--zm-cr', g('--c') || [168, 85, 247]);
    put('--zm-c2r', g('--c2') || [192, 132, 252]);
    put('--zm-c3r', g('--c3') || g('--c2') || [192, 132, 252]);
    put('--zm-pr', g('--pr') || [12, 10, 20]);
  }
  theme();
  const themeObs = new win.MutationObserver(theme);
  themeObs.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });

  const st = {
    active: false, ready: false, legacy: false, frame: null, route: (SS && store.get(SS, KEY_ROUTE, null)) || null, title: '', badge: 0,
    pending: null, layout: null, cover: false, lifted: null, portal: false, tipT: 0, holdT: 0, dock: { side: 'right', f: 0.6, ...((LS && store.get(LS, KEY_DOCK, null)) || {}) }, theme: null, idleT: 0, loadT: 0,
  };
  if (st.route && !normRoute(st.route)) st.route = null;
  if (st.dock.side !== 'left') st.dock.side = 'right';
  if (!(st.dock.f >= 0 && st.dock.f <= 1)) st.dock.f = 0.6;

  // ------------------------------------------------------------------ the screen's safe areas (env(), or the --zm-safe-* hooks)
  let probe = null;
  function safe() {
    if (!probe) {
      probe = doc.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
        + 'padding:var(--zm-safe-top,env(safe-area-inset-top,0px)) var(--zm-safe-right,env(safe-area-inset-right,0px)) '
        + 'var(--zm-safe-bottom,env(safe-area-inset-bottom,0px)) var(--zm-safe-left,env(safe-area-inset-left,0px))';
      root.appendChild(probe);
    }
    const c = win.getComputedStyle(probe), n = (v) => Math.max(0, Math.round(parseFloat(v) || 0));
    return { top: n(c.paddingTop), right: n(c.paddingRight), bottom: n(c.paddingBottom), left: n(c.paddingLeft) };
  }

  // ------------------------------------------------------------------ messages
  function send(type, data) {
    const f = st.frame;
    if (!f || !f.contentWindow) return false;
    try { f.contentWindow.postMessage({ ns: NS_J, v: V, type, ...(data || {}) }, ORIGIN); return true; } catch (e) { return false; }
  }
  const sendInsets = () => { const s = safe(); send('insets', s); };
  function emit() {
    const s = api.state();
    try { if (typeof opts.onState === 'function') opts.onState(s); } catch (e) { console.error(e); }
    host.dispatchEvent(new win.CustomEvent('zenith:state', { detail: s, bubbles: true }));
  }
  const cleanTitle = (t) => String(t).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
  function takeState(m) {
    let changed = false;
    const r = normRoute(m.route);
    if (r && r !== st.route) { st.route = r; changed = true; if (SS) store.set(SS, KEY_ROUTE, r); }
    if (typeof m.title === 'string') { const t = cleanTitle(m.title); if (t !== st.title) { st.title = t; changed = true; } }
    if (m.badge != null) { const b = Math.max(0, Math.min(9999, Math.round(+m.badge) || 0)); if (b !== st.badge) { st.badge = b; changed = true; } }
    if (changed) emit();
  }
  function onMessage(e) {
    if (e.origin !== ORIGIN) return;                                   // same site only
    if (!st.frame || e.source !== st.frame.contentWindow) return;      // only our Zenith frame
    const m = e.data;
    if (!m || typeof m !== 'object' || m.ns !== NS_Z || m.v !== V || typeof m.type !== 'string') return;
    if (m.type === 'hello') {
      st.ready = true; st.legacy = false;
      takeState(m);
      sendInsets();
      send('visible', { visible: st.active });
      if (st.pending) { send('open', { route: st.pending }); st.pending = null; }
    } else if (m.type === 'state') {
      takeState(m);
    } else if (m.type === 'layout') {
      const num = (v, hi) => (Number.isFinite(+v) ? Math.max(0, Math.min(hi, +v)) : null);
      const H = win.innerHeight;
      st.layout = { top: num(m.top, H), bottom: num(m.bottom, H) };
      st.cover = m.cover === true;
      if (st.cover) closeApps(false);
      place();
    } else if (m.type === 'exit') {
      exit();
    }
  }
  win.addEventListener('message', onMessage);
  // a Zenith notification tapped while Jarvis runs (Zenith's service worker, sw.js v50): Zenith mode at that notice
  const onSw = (e) => {
    const m = e.data;
    if (!m || m.type !== 'open' || m.app !== 'zenith') return;
    const r = normRoute(m.hash);
    if (!r) return;
    if (st.active) { open(r); return; }
    st.route = r; if (SS) store.set(SS, KEY_ROUTE, r);
    if (st.frame) open(r);
    try { if (typeof opts.onWantShow === 'function') opts.onWantShow(r); } catch (er) { console.error(er); }
    host.dispatchEvent(new win.CustomEvent('zenith:wantshow', { detail: { route: r }, bubbles: true }));
  };
  const swc = win.navigator && win.navigator.serviceWorker;
  if (swc) swc.addEventListener('message', onSw);

  // ------------------------------------------------------------------ the Zenith frame (one, kept alive while Jarvis mode shows)
  function ensureFrame(route) {
    if (!root.isConnected) (st.portal ? doc.body : host).appendChild(root);    // the hub put host back after taking it out
    if (st.frame && st.frame.isConnected) return st.frame;
    st.frame = null; st.ready = false; st.legacy = false;
    const f = doc.createElement('iframe');
    f.className = 'zm-frame';
    f.title = 'Zenith';
    // same-site frame: Web Share is allowed by default; 'fullscreen' here, so no allowfullscreen (the browser warns on both)
    f.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; autoplay; screen-wake-lock; accelerometer; gyroscope; magnetometer');
    const u = new URL(base.href);
    const r = normRoute(route) || st.route;
    if (r) u.hash = r;
    f.src = u.href;
    st.ready = false;
    f.addEventListener('load', () => {
      // an older Zenith without the protocol (an offline copy) still opens a route: same site, so set its address directly
      clearTimeout(st.loadT);
      st.loadT = win.setTimeout(() => {
        if (st.ready) return;
        st.legacy = true;
        if (st.pending) { try { f.contentWindow.location.hash = st.pending; } catch (e) { /* not reachable */ } st.pending = null; }
      }, 1500);
    });
    root.insertBefore(f, btn);
    st.frame = f;
    return f;
  }
  function open(route) {
    const r = normRoute(route);
    if (!r) return false;
    if (!st.frame || !st.frame.isConnected) { st.route = r; if (SS) store.set(SS, KEY_ROUTE, r); return true; }
    if (st.ready) send('open', { route: r });
    else if (st.legacy) { try { st.frame.contentWindow.location.hash = r; } catch (e) { return false; } }
    else st.pending = r;
    return true;
  }

  // ------------------------------------------------------------------ the floating control
  function band() {
    const H = win.innerHeight, s = safe(), L = st.layout || {};
    const top = Math.max(s.top + 8, (L.top != null ? L.top : s.top + 64) + 8);
    const bottom = Math.max(s.bottom + 8, (L.bottom != null ? L.bottom : s.bottom + 136) + 8);
    return { min: top, max: H - bottom - CH, s };
  }
  function place(yPx) {
    const b = band();
    let y;
    if (yPx != null) y = Math.max(b.min, Math.min(b.max, yPx));
    else y = b.max >= b.min ? b.min + st.dock.f * (b.max - b.min) : Math.max(b.s.top, (b.min + b.max) / 2);
    btn.style.setProperty('--zm-y', Math.round(y) + 'px');
    btn.classList.toggle('left', st.dock.side === 'left');
    root.style.setProperty('--zm-sl', b.s.left + 'px');
    root.style.setProperty('--zm-sr', b.s.right + 'px');
    btn.classList.toggle('cov', !!st.cover);
    return y;
  }
  function wake() {
    btn.classList.remove('idle');
    win.clearTimeout(st.idleT);
    st.idleT = win.setTimeout(() => btn.classList.add('idle'), IDLE_MS);
  }
  let drag = null, dragged = false;
  btn.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    wake();
    btn.classList.remove('tip');
    const r = btn.getBoundingClientRect();
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, top: r.top, moved: false, held: false };
    dragged = false;
    try { btn.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
    win.clearTimeout(st.holdT);
    if (switcher()) st.holdT = win.setTimeout(() => { if (drag && !drag.moved) { drag.held = true; openApps(false); } }, 450);
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (drag.held || (!drag.moved && Math.hypot(dx, dy) < 7)) return;
    win.clearTimeout(st.holdT);
    drag.moved = true;
    btn.classList.add('drag');
    st.dock.side = e.clientX < win.innerWidth / 2 ? 'left' : 'right';
    place(drag.top + dy);
    e.preventDefault();
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    win.clearTimeout(st.holdT);
    btn.classList.remove('drag');
    if (d.held) {                                                      // a hold opened the apps: not a tap
      dragged = true;
      const el = e && e.type === 'pointerup' ? doc.elementFromPoint(e.clientX, e.clientY) : null, c = el && el.closest ? el.closest('.zm-chip') : null;
      if (c && panel.contains(c)) c.click();                           // hold, slide onto an app, let go
      return;
    }
    if (!d.moved) return;
    dragged = true;
    const b = band(), y = parseFloat(btn.style.getPropertyValue('--zm-y')) || b.min;
    st.dock.f = b.max > b.min ? Math.max(0, Math.min(1, (y - b.min) / (b.max - b.min))) : 0.5;
    if (LS) store.set(LS, KEY_DOCK, st.dock);
    place();
    wake();
  };
  btn.addEventListener('pointerup', endDrag);
  btn.addEventListener('pointercancel', endDrag);
  btn.addEventListener('click', (e) => {
    if (dragged) { dragged = false; e.preventDefault(); return; }
    if (!panel.hidden) { closeApps(true); return; }
    exit();
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());       // a long press is the switcher, not a menu
  btn.addEventListener('keydown', (e) => {
    if (switcher() && /^(Arrow(Left|Right|Up|Down)|ContextMenu)$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); openApps(true); }
  });

  // ------------------------------------------------------------------ the switcher (opts.apps + opts.onSwitch)
  const switcher = () => typeof opts.onSwitch === 'function' && typeof opts.apps === 'function';
  btn.classList.toggle('sw', switcher());
  if (switcher()) btn.setAttribute('aria-haspopup', 'true');
  function iconUrl(u) {                                                 // a picture link: http(s), relative, or a data:image
    if (typeof u !== 'string' || !u) return null;
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(u) && u.length < 200000) return u;
    try { const x = new URL(u, win.location.href); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; }
  }
  function appList() {
    let list = [];
    try { list = opts.apps() || []; } catch (e) { list = []; }
    const out = [], seen = new Set();
    for (const a of Array.isArray(list) ? list : []) {
      if (!a || a.id == null) continue;
      const id = String(a.id).slice(0, 40), home = id === 'home' || id === 'jarvis';
      if (id === 'zenith' || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, home, name: String(a.name || (home ? 'Jarvis' : id)).slice(0, 24), icon: home ? null : iconUrl(a.icon),
        glyph: typeof a.glyph === 'string' && a.glyph.trim() && a.glyph !== 'orb' ? a.glyph.trim().slice(0, 2) : null });
    }
    if (!out.some((a) => a.home)) out.unshift({ id: 'home', home: true, name: 'Jarvis', icon: null });
    return out.slice(0, 9);
  }
  function chip(a) {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = 'zm-chip'; b.dataset.app = a.id;
    let ic;
    if (a.home) { ic = doc.createElement('span'); ic.className = 'zm-ci'; ic.innerHTML = '<span class="zm-orb"></span>'; }
    else if (a.icon) {
      ic = doc.createElement('img'); ic.className = 'zm-ci'; ic.alt = ''; ic.decoding = 'async'; ic.src = a.icon;
      ic.addEventListener('error', () => { const g = doc.createElement('span'); g.className = 'zm-ci zm-gl'; g.setAttribute('aria-hidden', 'true'); g.textContent = (a.glyph || a.name[0] || '?').toUpperCase(); ic.replaceWith(g); }, { once: true });
    }
    else { ic = doc.createElement('span'); ic.className = 'zm-ci zm-gl'; ic.textContent = (a.glyph || a.name[0] || '?').toUpperCase(); }
    ic.setAttribute('aria-hidden', 'true');
    const t = doc.createElement('span'); t.textContent = a.name;
    b.appendChild(ic); b.appendChild(t);
    return b;
  }
  function placeApps() {
    const r = btn.getBoundingClientRect(), b = band(), W = win.innerWidth, gap = 6;
    const right = st.dock.side !== 'left';
    panel.style.left = right ? 'auto' : Math.round(r.right + gap) + 'px';
    panel.style.right = right ? Math.round(W - r.left + gap) + 'px' : 'auto';
    panel.style.maxWidth = Math.max(160, Math.round((right ? r.left : W - r.right) - gap - Math.max(8, right ? b.s.left : b.s.right))) + 'px';
    const h = panel.offsetHeight, lo = b.min, hi = b.max + CH - h;          // inside the control's band: never over the tab bar
    const y = Math.max(lo, Math.min(hi, r.top + r.height / 2 - h / 2));
    panel.style.top = Math.round(hi < lo ? lo : y) + 'px';
  }
  function openApps(focus) {
    if (!switcher() || !st.active || st.cover) return;
    win.clearTimeout(st.tipT); st.tipT = 0; btn.classList.remove('tip');
    panel.textContent = '';
    for (const a of appList()) panel.appendChild(chip(a));
    panel.hidden = false; scrim.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    placeApps();
    win.requestAnimationFrame(() => root.classList.add('apps'));
    if (focus) { const c = panel.querySelector('.zm-chip'); if (c) c.focus(); }
  }
  function closeApps(focusBack) {
    if (panel.hidden) return;
    root.classList.remove('apps');
    panel.hidden = true; scrim.hidden = true; panel.textContent = '';
    btn.setAttribute('aria-expanded', 'false');
    if (focusBack) { try { btn.focus({ preventScroll: true }); } catch (e) { /* fine */ } }
    wake();
  }
  scrim.addEventListener('pointerdown', (e) => { e.preventDefault(); closeApps(false); });
  root.addEventListener('keydown', (e) => {
    if (panel.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeApps(true); return; }
    if (!panel.contains(doc.activeElement)) return;
    if (/^Arrow/.test(e.key)) {                                        // arrows move between the chips
      const cs = [...panel.querySelectorAll('.zm-chip')], i = cs.indexOf(doc.activeElement);
      const n = cs[(i + (/Right|Down/.test(e.key) ? 1 : -1) + cs.length) % cs.length];
      if (n) { e.preventDefault(); n.focus(); }
    }
  });
  panel.addEventListener('click', (e) => {
    const c = e.target.closest('.zm-chip');
    if (!c) return;
    const id = c.dataset.app;
    closeApps(false);
    if (id === 'home' || id === 'jarvis') { exit(); return; }
    host.dispatchEvent(new win.CustomEvent('zenith:switch', { detail: { app: id }, bubbles: true }));
    try { opts.onSwitch(id); } catch (er) { console.error(er); }
    if (st.active) hide();                                             // the hub shows the other app (it hides Zenith itself too)
  });

  // ------------------------------------------------------------------ show / hide
  const meta = () => doc.querySelector('meta[name="theme-color"]');
  // The hub's view for Zenith may be its own stacking context under the Jarvis bar (e.g. a fixed view with z-index 1):
  // while Zenith mode shows, host and every ancestor that is a stacking context get the layer's z-index (put back on hide).
  function lift(on) {
    if (on) {
      if (st.lifted) return;
      st.lifted = [];
      for (let el = host; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
        const cs = win.getComputedStyle(el);
        if (el !== host && (cs.position === 'static' || cs.zIndex === 'auto')) continue;
        st.lifted.push([el, el.style.getPropertyValue('z-index'), el.style.getPropertyPriority('z-index')]);
        el.style.setProperty('z-index', 'var(--zm-z, 2147483000)', 'important');
      }
    } else if (st.lifted) {
      for (const [el, v, pr] of st.lifted) { if (v) el.style.setProperty('z-index', v, pr); else el.style.removeProperty('z-index'); }
      st.lifted = null;
    }
  }
  // ... and a transform / filter / contain on an ancestor would shrink the full-screen layer to that box: then the layer
  // moves to <body> once, before Zenith's frame exists (moving a frame reloads it)
  function trapped() {
    const r = root.getBoundingClientRect();
    return r.width > 0 && (r.top > 0.5 || r.left > 0.5 || r.width < win.innerWidth - 1 || r.height < win.innerHeight - 1);
  }
  function show(route) {
    const r = normRoute(route);
    const fresh = !st.frame || !st.frame.isConnected;
    if (fresh && root.parentNode !== doc.body && trapped()) { doc.body.appendChild(root); st.portal = true; }
    ensureFrame(r);
    if (r && !fresh) open(r);
    if (!st.active) {
      st.active = true;
      root.classList.add('on');
      root.removeAttribute('aria-hidden');
      root.inert = false;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Zenith');
      lift(true);
      doc.documentElement.classList.add('zm-on');                      // no rubber band of the Jarvis page behind Zenith
      const m = meta();
      if (m) { st.theme = m.getAttribute('content'); m.setAttribute('content', '#07080c'); }
      send('visible', { visible: true });
      emit();
    }
    sendInsets();
    place();
    wake();
    tip();
    try { st.frame.focus({ preventScroll: true }); } catch (e) { /* fine */ }
    return api;
  }
  // the first three times Zenith mode opens on this phone, the control says what it does
  function tip() {
    const n = (LS && store.get(LS, KEY_TIP, 0)) || 0;
    if (n >= 3 || st.tipT) return;
    if (LS) store.set(LS, KEY_TIP, n + 1);
    btn.querySelector('.zm-tip').textContent = switcher() ? 'Back to Jarvis · hold for apps' : 'Back to Jarvis';
    btn.classList.add('tip');
    st.tipT = win.setTimeout(() => { btn.classList.remove('tip'); st.tipT = 0; }, 3200);
  }
  function hide() {
    if (!st.active) return api;
    closeApps(false);
    st.active = false;
    root.classList.remove('on');
    root.setAttribute('aria-hidden', 'true');
    root.removeAttribute('role'); root.removeAttribute('aria-modal');
    root.inert = true;
    lift(false);
    doc.documentElement.classList.remove('zm-on');
    const m = meta();
    if (m && st.theme != null && m.getAttribute('content') === '#07080c') m.setAttribute('content', st.theme);   // unless the hub changed it since
    st.theme = null;
    send('visible', { visible: false });
    emit();
    return api;
  }
  function exit() {
    const was = st.active;
    hide();
    if (!was) return;
    try { if (typeof opts.onExit === 'function') opts.onExit(); } catch (e) { console.error(e); }
    host.dispatchEvent(new win.CustomEvent('zenith:exit', { bubbles: true }));
  }
  const onResize = () => { closeApps(false); if (st.frame) sendInsets(); place(); };
  win.addEventListener('resize', onResize);
  win.addEventListener('orientationchange', onResize);

  const api = {
    show, hide, open,
    isActive: () => st.active,
    state: () => ({ route: st.route, title: st.title, badge: st.badge, active: st.active, ready: st.ready }),
    get frame() { return st.frame; },
    unload() {
      hide();
      if (st.frame) { st.frame.remove(); st.frame = null; }
      st.ready = false; st.legacy = false; st.pending = null; st.layout = null; st.cover = false;
      win.clearTimeout(st.loadT);
      place();
      return api;
    },
    destroy() {
      hide();
      themeObs.disconnect();
      win.removeEventListener('message', onMessage);
      win.removeEventListener('resize', onResize);
      win.removeEventListener('orientationchange', onResize);
      if (swc) swc.removeEventListener('message', onSw);
      win.clearTimeout(st.idleT); win.clearTimeout(st.loadT); win.clearTimeout(st.tipT); win.clearTimeout(st.holdT);
      root.remove();
      st.frame = null;
    },
  };
  place();
  if (opts.preload) ensureFrame(null);
  return api;
}

export default mountZenithMode;
