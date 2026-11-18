// Jarvis switcher, "the orb" (2026-11-01). The owner: "there needs to be a way to access each thing, so calendar, kalshi, Jarvis,
// and my nq bot and eventually other stuff, make a really cool way to change between stuff".
//
// One glowing reactor orb floats over every mode (Jarvis, Zenith mode, the Calendar, Kalshi, every added app):
//   tap        the switcher opens out of the orb: one live card per app (Jarvis, NQ bot, Calendar, Kalshi, each added app, + Add)
//   swipe ← →  the next / previous app at once (like the iPhone's home bar)
//   hold       the apps fan out around the orb: slide onto one and let go (or tap one)
//   drag       move it up or down or to the other edge (kept on this phone, 'jarvis.orb')
// Light on purpose (the iPhone draws Jarvis black when a page asks too much of it): no backdrop blur, only transform / opacity
// animations, and none with reduced motion.
//
// mountSwitcher(opts) -> { update(), open(), close(), isOpen(), flick(dir), setHidden(on), use(id), destroy(), el }
//   opts.apps()        [{ id, name, label?, sub?, icon?, glyph?, group?, accent? ('#rrggbb', its card's colour), off? }] in switch
//                      order; 'home' is Jarvis itself. off: true = it cannot open now (not on the site yet): its card shows
//                      dimmed, the swipe and the ring skip it
//   opts.active()      the id on screen now
//   opts.status(id)    { value?, tone? ('up'|'dn'), lines?: [string, string?], level? ('ok'|'warn'|'bad'|'') }: the card's live text
//   opts.onSwitch(id)  go to that app (the shell does it)
//   opts.onAdd()       optional: "add a dashboard"
//   opts.system()      optional (2026-11-02, the System view): { verdict, level ('ok'|'warn'|'bad'|''), todo, rows: [{ id, name, level }] }:
//                      a strip at the top of the switcher (one dot per system + the one thing to do) and a dot on the orb when
//                      something needs the owner (amber / red)
//   opts.onSystem()    optional: the strip was tapped (the shell shows its System panel)
//   opts.sections(a)   optional (2026-11-03, OLYMPUS with ~12 apps): opts.apps() in groups, [{ group: { id, name } | null, apps }]
//                      (the shell passes apps.js byGroup: Jarvis first, then TRADING, LIFE, MONEY ...). The cards, the quick row
//                      and the swipe follow that order, each group under its heading; chips over the cards jump to a group.
//                      Without it (or when it fails): one list, as opts.apps() gives it.
//   opts.doc           optional: the document (tests)
// use(id) counts an app's opens on this phone ('jarvis.orb.use'; the shell calls it on every switch): the hold ring shows the
// RING_MAX most opened apps, plus a "more" slice (the whole switcher) when there are more.
const VERSION = 1;
const POS_KEY = 'jarvis.orb';
const TIP_KEY = 'jarvis.orb.tips';
const USE_KEY = 'jarvis.orb.use';
const HOLD_MS = 380;
const RING_MAX = 6;

const CSS = `
.nx-orb{position:fixed;z-index:2147483100;width:56px;height:56px;margin:0;padding:0;border:0;background:none;border-radius:50%;
  touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;cursor:pointer;
  transition:opacity .25s ease,transform .18s ease;color:#f3ece0}
.nx-orb .nx-core{position:absolute;inset:7px;border-radius:50%;
  background:radial-gradient(circle at 50% 45%,#fff 0,#f1e6ff 14%,#c9a06a 34%,#9c6b3c 62%,#3b3126 100%);
  box-shadow:0 0 18px rgba(156,107,60,.85),0 0 42px rgba(156,107,60,.45),inset 0 0 10px rgba(255,255,255,.35)}
.nx-orb::after{content:"";position:absolute;inset:1px;border-radius:50%;border:1.5px solid rgba(201,160,106,.55);border-top-color:#8b7259;
  border-bottom-color:rgba(139,114,89,.35)}
.nx-orb::before{content:"";position:absolute;inset:-3px;border-radius:50%;border:1px solid rgba(156,107,60,.28);border-left-color:rgba(201,160,106,.8)}
.nx-orb.idle{opacity:.72}
.nx-orb:active,.nx-orb.press{transform:scale(.92)}
.nx-orb.hide{opacity:0;visibility:hidden;pointer-events:none}
.nx-orb:focus{outline:none}.nx-orb:focus-visible{outline:2px solid #c9a06a;outline-offset:3px}
.nx-orb.pulse .nx-core{animation:nx-pulse .6s ease}
@keyframes nx-pulse{50%{box-shadow:0 0 30px #c9a06a,0 0 70px rgba(156,107,60,.7),inset 0 0 12px #fff}}
@keyframes nx-spin{to{transform:rotate(360deg)}}
@keyframes nx-spin-r{to{transform:rotate(-360deg)}}
@media (prefers-reduced-motion:no-preference){.nx-orb::after{animation:nx-spin 7s linear infinite}.nx-orb::before{animation:nx-spin-r 11s linear infinite}}
.nx-tip{position:fixed;z-index:2147483101;padding:7px 11px;border-radius:10px;background:rgba(14,10,26,.96);border:1px solid rgba(156,107,60,.55);
  color:#ece9f2;font:600 13px/1.3 "Georgia",-apple-system,system-ui,sans-serif;letter-spacing:.04em;white-space:nowrap;pointer-events:none;
  opacity:0;transform:translateY(4px);transition:opacity .18s ease,transform .18s ease;box-shadow:0 6px 24px rgba(0,0,0,.5)}
.nx-tip.on{opacity:1;transform:none}
.nx-tip b{font:700 12px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;color:#e9ddff}
.nx-fan{position:fixed;inset:0;z-index:2147483099;pointer-events:none}
.nx-fan.on{pointer-events:auto}
.nx-fan .nx-fs{position:absolute;inset:0;background:rgba(3,2,8,.55);opacity:0;transition:opacity .16s ease}
.nx-fan.on .nx-fs{opacity:1}
.nx-fb{position:absolute;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;border:1px solid rgba(156,107,60,.6);
  background:radial-gradient(circle at 50% 40%,rgba(85,70,55,.98),rgba(16,10,30,.98));color:#ece9f2;display:grid;place-items:center;padding:0;
  box-shadow:0 0 14px rgba(156,107,60,.35);opacity:0;transform:translate(var(--fx0),var(--fy0)) scale(.4);
  transition:opacity .16s ease,transform .2s cubic-bezier(.2,.9,.25,1.2);font:700 15px "Georgia",-apple-system,system-ui,sans-serif}
.nx-fan.on .nx-fb{opacity:1;transform:translate(0,0) scale(1)}
.nx-fb.hot{border-color:#8b7259;box-shadow:0 0 22px rgba(139,114,89,.7),0 0 6px #fff;transform:scale(1.14)!important}
.nx-fb.now{border-color:#c9a06a;box-shadow:0 0 18px rgba(201,160,106,.8)}
.nx-fb img{width:30px;height:30px;border-radius:8px;object-fit:cover}
.nx-fb .nx-fl{position:absolute;top:50%;right:66px;transform:translateY(-50%);padding:4px 8px;border-radius:8px;background:rgba(10,6,20,.92);
  border:1px solid rgba(156,107,60,.35);font:700 10px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;white-space:nowrap;color:#e9ddff}
.nx-fan.l .nx-fb .nx-fl{right:auto;left:66px}
.nx-root{position:fixed;inset:0;z-index:2147483200;display:flex;flex-direction:column;color:#ece9f2;
  background:radial-gradient(120% 70% at 50% 0%,rgba(109,89,69,.55),transparent 60%),radial-gradient(90% 60% at 50% 100%,rgba(49,40,32,.45),transparent 70%),#05030b;
  padding:calc(env(safe-area-inset-top,0px) + 10px) 0 calc(env(safe-area-inset-bottom,0px) + 14px);box-sizing:border-box;
  opacity:0;visibility:hidden;pointer-events:none;-webkit-clip-path:circle(0 at var(--ox,90%) var(--oy,70%));clip-path:circle(0 at var(--ox,90%) var(--oy,70%));
  transition:clip-path .42s cubic-bezier(.3,.8,.25,1),-webkit-clip-path .42s cubic-bezier(.3,.8,.25,1),opacity .2s ease,visibility 0s linear .42s;
  font:500 16px/1.4 "Georgia",-apple-system,system-ui,sans-serif}
.nx-root.on{opacity:1;visibility:visible;pointer-events:auto;-webkit-clip-path:circle(150% at var(--ox,90%) var(--oy,70%));
  clip-path:circle(150% at var(--ox,90%) var(--oy,70%));transition:clip-path .42s cubic-bezier(.3,.8,.25,1),-webkit-clip-path .42s cubic-bezier(.3,.8,.25,1),opacity .12s ease}
.nx-root::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;
  background:linear-gradient(rgba(156,107,60,.07) 1px,transparent 1px) 0 0/100% 34px,linear-gradient(90deg,rgba(156,107,60,.06) 1px,transparent 1px) 0 0/34px 100%}
.nx-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px 4px}
.nx-head>div{min-width:0}
.nx-head h2{margin:0;font:700 15px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;color:#e9ddff;text-shadow: none}
.nx-head small{display:block;margin-top:3px;font:600 11px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;color:#8a8499}
.nx-x{flex:none;width:44px;height:44px;border-radius:50%;border:1px solid rgba(156,107,60,.5);background:rgba(29,24,19,.9);color:#ece9f2;font:400 22px/1 -apple-system,system-ui,sans-serif;padding:0}
.nx-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center}
.nx-track{position:relative;display:flex;gap:14px;width:100%;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
  padding:12px calc(50% - min(39vw,160px));box-sizing:border-box;scrollbar-width:none;perspective:900px}
.nx-track::-webkit-scrollbar{display:none}
.nx-card{position:relative;flex:0 0 min(78vw,320px);height:min(56vh,430px);scroll-snap-align:center;border-radius:22px;padding:18px 18px 16px;box-sizing:border-box;
  border:1px solid rgba(156,107,60,.45);background:linear-gradient(165deg,rgba(56,46,36,.97),rgba(12,8,24,.98) 60%);color:inherit;text-align:left;
  display:flex;flex-direction:column;gap:10px;overflow:hidden;font:inherit;box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);
  transform-origin:50% 60%;will-change:transform}
.nx-card::after{content:"";position:absolute;inset:auto -30% -45% -30%;height:70%;background:radial-gradient(closest-side,rgba(var(--nx-acr,168,85,247),.32),transparent);pointer-events:none}
.nx-card[style]{border-color:rgba(var(--nx-acr),.5)}
.nx-card[style]::before{content:"";position:absolute;left:22%;right:22%;top:0;height:2px;border-radius:0 0 2px 2px;background:rgb(var(--nx-acr));box-shadow:0 0 12px rgb(var(--nx-acr))}
.nx-card[style] .nx-emb .i{background:radial-gradient(circle at 50% 40%,rgba(var(--nx-acr),.85),rgba(16,10,30,.98));box-shadow:0 0 34px rgba(var(--nx-acr),.5),inset 0 0 0 1px rgba(var(--nx-acr),.55)}
.nx-card.now{border-color:#c9a06a;box-shadow:0 0 0 1px rgba(201,160,106,.5),0 0 34px rgba(156,107,60,.45),0 18px 50px rgba(0,0,0,.55)}
.nx-card .nx-top{display:flex;align-items:center;gap:12px}
.nx-mini{display:block;border-radius:50%;background:radial-gradient(circle at 50% 45%,#fff 0,#e9d5ff 18%,#9c6b3c 46%,#4b3e30 100%)}
.nx-emb{flex:1 1 0;min-height:56px;display:flex;align-items:center;justify-content:center}
.nx-emb .e{position:relative;height:min(140px,100%);aspect-ratio:1/1;max-width:100%;border-radius:50%;display:grid;place-items:center}
.nx-emb .e::before{content:"";position:absolute;inset:0;border-radius:50%;border:1.5px dashed rgba(201,160,106,.42)}
.nx-emb .e::after{content:"";position:absolute;inset:11px;border-radius:50%;border:2px solid rgba(139,114,89,.18);border-top-color:#8b7259;border-right-color:rgba(201,160,106,.7)}
@media (prefers-reduced-motion:no-preference){.nx-root.on .nx-emb .e::after{animation:nx-spin 6s linear infinite}.nx-root.on .nx-emb .e::before{animation:nx-spin-r 18s linear infinite}}
.nx-emb .i{width:56%;height:56%;border-radius:24px;overflow:hidden;display:grid;place-items:center;font:700 40px "Georgia",-apple-system,system-ui,sans-serif;color:#f3ece0;
  background:radial-gradient(circle at 50% 40%,rgba(156,107,60,.95),rgba(45,37,29,.98));box-shadow:0 0 34px rgba(156,107,60,.55),inset 0 0 0 1px rgba(201,160,106,.5)}
.nx-emb .i img{width:100%;height:100%;object-fit:cover}
.nx-emb .i .nx-mini{width:62%;height:62%;box-shadow:0 0 28px #9c6b3c,0 0 60px rgba(156,107,60,.6)}
.nx-ic{flex:none;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;overflow:hidden;
  background:radial-gradient(circle at 50% 40%,rgba(156,107,60,.9),rgba(45,37,29,.95));border:1px solid rgba(201,160,106,.5);font:700 22px "Georgia",-apple-system,system-ui,sans-serif}
.nx-ic img{width:100%;height:100%;object-fit:cover}
.nx-ic .nx-mini{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 50% 45%,#fff 0,#e9d5ff 18%,#9c6b3c 46%,#4b3e30 100%);
  box-shadow:0 0 14px #9c6b3c}
.nx-nm{min-width:0}
.nx-nm b{display:block;font:700 19px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;color:#f3ece0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx-nm span{display:block;color:#a99fc4;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx-now{position:absolute;top:14px;right:14px;padding:3px 8px;border-radius:999px;font:700 10px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;
  color:#05030b;background:#c9a06a;box-shadow:0 0 12px rgba(201,160,106,.8)}
.nx-val{font:700 clamp(28px,9vw,38px)/1.05 "Georgia",-apple-system,system-ui,sans-serif;letter-spacing:.02em;color:#e9ddff;text-shadow: none;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nx-val.up{color:#4ade80;text-shadow: none}.nx-val.dn{color:#ff6b86;text-shadow: none}
.nx-ln{margin:0;color:#cfc8e3;font-size:16px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.nx-ln.m{color:#8a8499;font-size:15px}
.nx-ft{display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid rgba(156,107,60,.22);
  font:700 11px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;color:#c9a06a}
.nx-dot{width:9px;height:9px;border-radius:50%;background:#5b5470;display:inline-block;margin-right:8px;vertical-align:1px}
.nx-dot.ok{background:#4ade80;box-shadow:0 0 8px #4ade80}.nx-dot.warn{background:#fbbf24;box-shadow:0 0 8px #fbbf24}.nx-dot.bad{background:#ff4d6d;box-shadow:0 0 8px #ff4d6d}
.nx-card.off,.nx-qb.off{opacity:.5;border-style:dashed}
.nx-card.add{align-items:center;justify-content:center;text-align:center;border-style:dashed;background:rgba(14,10,26,.85)}
.nx-card.add .nx-ic{width:64px;height:64px;font-size:30px}
.nx-row{display:flex;gap:10px;padding:6px 16px 2px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;
  overscroll-behavior-x:contain}
.nx-row::-webkit-scrollbar{display:none}
.nx-row>:first-child{margin-left:auto}.nx-row>:last-child{margin-right:auto}
.nx-qb{flex:none;width:46px;height:46px;border-radius:50%;padding:0;border:1px solid rgba(156,107,60,.45);background:rgba(29,24,19,.92);color:#ece9f2;
  display:grid;place-items:center;font:700 14px "Georgia",-apple-system,system-ui,sans-serif;overflow:hidden}
.nx-qs{flex:none;width:1px;height:28px;align-self:center;background:rgba(156,107,60,.35)}
.nx-gr{display:flex;gap:8px;padding:8px 16px 0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.nx-gr::-webkit-scrollbar{display:none}
.nx-gr[hidden]{display:none}
.nx-gb{flex:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid rgba(156,107,60,.35);background:rgba(29,24,19,.85);color:#cfc8e3;
  font:700 11px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em}
.nx-gb i{font-style:normal;color:#8a8499;margin-left:6px;letter-spacing:0}
.nx-gb.on{border-color:#c9a06a;color:#f3ece0;box-shadow:0 0 12px rgba(201,160,106,.45)}
.nx-gl{flex:0 0 auto;align-self:center;padding:14px 0;-webkit-writing-mode:vertical-rl;writing-mode:vertical-rl;transform:rotate(180deg);
  font:700 11px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;color:#a99fc4;border-left:1px solid rgba(156,107,60,.4);padding-left:6px}
.nx-fb.more{font-size:22px;border-style:dashed}
.nx-qb img{width:26px;height:26px;border-radius:7px;object-fit:cover}
.nx-qb.now{border-color:#c9a06a;box-shadow:0 0 12px rgba(201,160,106,.7)}
.nx-qb .nx-mini{width:20px;height:20px;border-radius:50%;background:radial-gradient(circle at 50% 45%,#fff 0,#e9d5ff 18%,#9c6b3c 46%,#4b3e30 100%)}
.nx-sys{position:relative;display:flex;align-items:center;gap:10px;margin:8px 16px 0;padding:8px 12px;min-height:46px;box-sizing:border-box;border-radius:14px;
  border:1px solid rgba(156,107,60,.4);background:rgba(29,24,19,.92);color:#ece9f2;text-align:left;font:600 14px/1.3 "Georgia",-apple-system,system-ui,sans-serif;width:calc(100% - 32px)}
.nx-sys[hidden]{display:none}
.nx-sys.ok{border-color:rgba(74,222,128,.5)}.nx-sys.warn{border-color:rgba(251,191,36,.6)}.nx-sys.bad{border-color:rgba(255,77,109,.8);background:rgba(60,8,20,.95)}
.nx-sys b{flex:none;font:700 11px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;color:#e9ddff}
.nx-sys.ok b{color:#4ade80}.nx-sys.warn b{color:#fbbf24}.nx-sys.bad b{color:#ff6b86}
.nx-sys .nx-st{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cfc8e3}
.nx-sys .nx-sd{flex:none;display:flex;gap:3px}
.nx-sys .nx-sd i{width:8px;height:8px;border-radius:50%;background:#3a3542}
.nx-sys .nx-sd i.ok{background:#4ade80}.nx-sys .nx-sd i.warn{background:#fbbf24}.nx-sys .nx-sd i.bad{background:#ff4d6d}
.nx-orb .nx-alert{position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;border:2px solid #05030b;display:none;box-sizing:border-box}
.nx-orb.lv-warn .nx-alert{display:block;background:#fbbf24}.nx-orb.lv-bad .nx-alert{display:block;background:#ff4d6d}
.nx-hint{text-align:center;color:#8a8499;font:600 11px "Georgia",-apple-system,system-ui,sans-serif;letter-spacing: .05em;padding:10px 16px 0}
@media (prefers-reduced-motion:reduce){.nx-root,.nx-root.on,.nx-fb,.nx-orb,.nx-tip,.nx-fan .nx-fs{transition:none!important}.nx-card{will-change:auto}}
html[data-nexus] .zm-back{display:none!important}
`;

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } };
const escH = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^(https:\/\/|\.\.?\/|\/(?!\/))/i.test(u) ? u : '');

export function mountSwitcher(opts = {}) {
  const doc = opts.doc || document, win = doc.defaultView || window;
  const reduce = () => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const call = (f, ...a) => { try { return typeof f === 'function' ? f(...a) : undefined; } catch (e) { console.error(e); return undefined; } };
  const given = () => { const l = call(opts.apps); return Array.isArray(l) ? l.filter((a) => a && a.id) : []; };
  // the apps in their groups (opts.sections), else one list: every app of opts.apps() once (one left out goes at the end)
  function sections() {
    const all = given(), s = typeof opts.sections === 'function' ? call(opts.sections, all) : null;
    if (!Array.isArray(s)) return [{ g: null, apps: all }];
    const byId = new Map(all.map((a) => [a.id, a])), seen = new Set();
    const out = s.map((p) => ({ g: p && p.group && p.group.id && p.group.name ? p.group : null,
      apps: (p && Array.isArray(p.apps) ? p.apps : []).map((a) => a && byId.get(a.id)).filter((a) => a && !seen.has(a.id) && seen.add(a.id)) }));
    out.push({ g: null, apps: all.filter((a) => !seen.has(a.id)) });
    return out.filter((p) => p.apps.length);
  }
  const list = () => sections().reduce((all, p) => all.concat(p.apps), []);
  // opens per app on this phone: the hold ring's order
  const uses = () => { const u = lsGet(USE_KEY, null); return u && typeof u === 'object' && !Array.isArray(u) ? u : {}; };
  function use(id) {
    if (!id || typeof id !== 'string') return;
    const u = uses(), ids = new Set(given().map((a) => a.id));
    u[id] = Math.min(1e6, (+u[id] || 0) + 1);
    for (const k of Object.keys(u)) if (!ids.has(k) && k !== id) delete u[k];      // apps no longer here
    lsSet(USE_KEY, u);
  }
  const activeId = () => call(opts.active) || 'home';

  if (!doc.getElementById('nx-css')) { const st = doc.createElement('style'); st.id = 'nx-css'; st.textContent = CSS; doc.head.appendChild(st); }
  doc.documentElement.setAttribute('data-nexus', String(VERSION));

  // ---------------------------------------------------------------- the orb
  const orb = doc.createElement('button');
  orb.type = 'button'; orb.className = 'nx-orb'; orb.id = 'nxOrb';
  orb.setAttribute('aria-label', 'Switch apps: tap for all apps, swipe for the next one, hold for the quick ring');
  orb.innerHTML = '<span class="nx-core"></span><span class="nx-alert"></span>';      // its two turning rings are ::before / ::after (inside the screen edge)
  const tip = doc.createElement('div'); tip.className = 'nx-tip'; tip.setAttribute('aria-hidden', 'true');
  const fan = doc.createElement('div'); fan.className = 'nx-fan'; fan.innerHTML = '<div class="nx-fs"></div>';
  const rootEl = doc.createElement('div');
  rootEl.className = 'nx-root'; rootEl.id = 'nxRoot'; rootEl.setAttribute('role', 'dialog'); rootEl.setAttribute('aria-modal', 'true');
  rootEl.setAttribute('aria-label', 'Switch apps'); rootEl.setAttribute('aria-hidden', 'true');
  rootEl.innerHTML = '<div class="nx-head"><div><h2>OLYMPUS</h2><small>SWITCH \u00b7 SWIPE OR HOLD THE ORB</small></div>'
    + '<button class="nx-x" type="button" aria-label="Close">×</button></div>'
    + '<button class="nx-sys" type="button" id="nxSys" hidden></button>'
    + '<div class="nx-gr" id="nxGroups" role="group" aria-label="Jump to a group" hidden></div>'
    + '<div class="nx-stage"><div class="nx-track" id="nxTrack"></div></div><div class="nx-row" id="nxRow"></div>';
  doc.body.appendChild(fan); doc.body.appendChild(rootEl); doc.body.appendChild(orb); doc.body.appendChild(tip);
  const noImg = (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.parentNode) t.parentNode.replaceChild(doc.createTextNode(t.dataset.g || '?'), t); };
  rootEl.addEventListener('error', noImg, true); fan.addEventListener('error', noImg, true);
  const track = rootEl.querySelector('.nx-track'), row = rootEl.querySelector('.nx-row'), sysEl = rootEl.querySelector('.nx-sys');
  const groupsEl = rootEl.querySelector('.nx-gr');

  // position: a side ('r' | 'l') and a height (fraction of the screen), kept on this phone
  let pos = lsGet(POS_KEY, null);
  if (!pos || (pos.side !== 'l' && pos.side !== 'r') || !(pos.y >= 0 && pos.y <= 1)) pos = { side: 'r', y: 0.66 };
  const geom = () => {
    const W = win.innerWidth, H = win.innerHeight, cs = win.getComputedStyle(doc.documentElement);
    const sb = parseFloat(cs.getPropertyValue('--sab')) || 0;
    return { W, H, top: 70, bottom: H - 56 - 96 - sb };
  };
  function place(x, y) {
    const g = geom();
    let left, top;
    if (x == null) { left = pos.side === 'l' ? 8 : g.W - 56 - 8; top = g.top + pos.y * Math.max(0, g.bottom - g.top); }
    else { left = Math.max(4, Math.min(g.W - 60, x - 28)); top = Math.max(g.top, Math.min(g.bottom, y - 28)); }
    orb.style.left = Math.round(left) + 'px'; orb.style.top = Math.round(top) + 'px';
  }
  place();
  renderSys();
  win.addEventListener('resize', () => place(), { passive: true });
  let idleT = 0;
  const wake = () => { orb.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => orb.classList.add('idle'), 4000); };
  wake();

  function showTip(html, ms = 1100) {
    tip.innerHTML = html;
    const r = orb.getBoundingClientRect(), W = win.innerWidth;
    tip.style.top = Math.round(r.top + 16) + 'px';
    tip.classList.add('on');
    const w = tip.offsetWidth;
    tip.style.left = Math.round(pos.side === 'l' ? Math.min(W - w - 6, r.right + 8) : Math.max(6, r.left - w - 8)) + 'px';
    clearTimeout(showTip.t); showTip.t = setTimeout(() => tip.classList.remove('on'), ms);
  }
  // first uses: say what the orb does (three times at most)
  const tips = +lsGet(TIP_KEY, 0) || 0;
  if (tips < 3) setTimeout(() => { if (!hidden && !isOpen()) { lsSet(TIP_KEY, tips + 1); showTip('<b>APPS</b> · tap · swipe ← → · hold', 3200); } }, 1800);

  // ---------------------------------------------------------------- icons, names, live text
  const label = (a) => String(a.label || a.name || a.id).toUpperCase();
  function inner(a) {                                   // the app's mark: Jarvis's reactor, its icon, else its first letter
    if (a.id === 'home') return '<span class="nx-mini"></span>';
    const src = safeUrl(a.icon), ch = escH(String(a.glyph || a.name || '?').charAt(0).toUpperCase());
    if (src) return `<img src="${escH(src)}" alt="" loading="lazy" decoding="async" data-g="${ch}">`;
    return ch;
  }
  const icon = (a, cls) => `<span class="${cls}">${inner(a)}</span>`;
  function card(a, now, g) {
    const s = call(opts.status, a.id) || {};
    const lines = (Array.isArray(s.lines) ? s.lines : []).filter(Boolean).slice(0, 2);
    const lvl = ['ok', 'warn', 'bad'].includes(s.level) ? s.level : '';
    const ac = /^#[0-9a-f]{6}$/i.test(a.accent || '') ? parseInt(a.accent.slice(1), 16) : -1;
    const tint = ac < 0 ? '' : ` style="--nx-acr:${ac >> 16},${(ac >> 8) & 255},${ac & 255}"`;
    return `<button class="nx-card${now ? ' now' : ''}${a.off ? ' off' : ''}" type="button"${tint} data-nx="${escH(a.id)}" aria-label="${escH(label(a))}${g ? ', ' + escH(g.name.toLowerCase()) : ''}${now ? ' (on screen now)' : ''}">`
      + `<div class="nx-top"><div class="nx-nm"><b>${escH(label(a))}</b><span>${escH(a.sub || '')}</span></div></div>`
      + (now ? '<span class="nx-now">NOW</span>' : '')
      + `<div class="nx-emb" aria-hidden="true"><span class="e"><span class="i">${inner(a)}</span></span></div>`
      + `<div class="nx-val${s.tone === 'up' ? ' up' : s.tone === 'dn' ? ' dn' : ''}">${escH(s.value || '—')}</div>`
      + lines.map((l, i) => `<p class="nx-ln${i ? ' m' : ''}">${escH(l)}</p>`).join('')
      + `<div class="nx-ft"><span><i class="nx-dot ${lvl}"></i>${now ? 'ON SCREEN' : 'OPEN'}</span><span>›</span></div></button>`;
  }
  // the System strip and the orb's alert dot (opts.system): one verdict for every system, the one thing to do
  function renderSys() {
    const LV = ['ok', 'warn', 'bad'];
    const s = typeof opts.system === 'function' ? call(opts.system) : null;
    const lvl = s && LV.includes(s.level) ? s.level : '';
    orb.classList.toggle('lv-warn', lvl === 'warn'); orb.classList.toggle('lv-bad', lvl === 'bad');
    if (!s || !s.verdict) { sysEl.hidden = true; return; }
    const rows = (Array.isArray(s.rows) ? s.rows : []).filter((r) => r && r.id).slice(0, 8);
    sysEl.hidden = false;
    sysEl.className = 'nx-sys' + (lvl ? ' ' + lvl : '');
    sysEl.setAttribute('aria-label', `System: ${s.verdict}${s.todo ? '. ' + s.todo : ''}`);
    sysEl.innerHTML = `<b>${escH(String(s.verdict).toUpperCase())}</b><span class="nx-st">${escH(s.short || s.todo || (lvl === 'ok' ? 'Every system fine' : 'Every system at a glance'))}</span>`
      + `<span class="nx-sd" aria-hidden="true">${rows.map((r) => `<i class="${LV.includes(r.level) ? r.level : ''}" title="${escH(r.name || r.id)}"></i>`).join('')}</span>`;
  }
  function render() {
    renderSys();
    const parts = sections(), cur = activeId(), many = parts.filter((p) => p.g).length > 1;
    const head = (p) => (many && p.g ? `<div class="nx-gl" data-nx-g="${escH(p.g.id)}" aria-hidden="true">${escH(p.g.name)}</div>` : '');
    track.innerHTML = parts.map((p) => head(p) + p.apps.map((a) => card(a, a.id === cur, many && p.g)).join('')).join('')
      + (typeof opts.onAdd === 'function' ? '<button class="nx-card add" type="button" data-nx-add="1" aria-label="Add a dashboard">'
        + '<span class="nx-ic">+</span><div class="nx-nm"><b>ADD</b><span>Any dashboard with a link (Ascend too)</span></div></button>' : '');
    const qb = (a) => `<button class="nx-qb${a.id === cur ? ' now' : ''}${a.off ? ' off' : ''}" type="button" data-nx="${escH(a.id)}" aria-label="${escH(label(a))}">${inner(a)}</button>`;
    row.innerHTML = parts.map((p, i) => (i && many ? '<i class="nx-qs" aria-hidden="true"></i>' : '') + p.apps.map(qb).join('')).join('');
    groupsEl.hidden = !many;
    groupsEl.innerHTML = !many ? '' : parts.filter((p) => p.g).map((p) => `<button class="nx-gb${p.apps.some((a) => a.id === cur) ? ' on' : ''}" type="button" `
      + `data-nx-jump="${escH(p.g.id)}" aria-label="${escH(p.g.name)}: ${p.apps.length} apps">${escH(p.g.name)}<i>${p.apps.length}</i></button>`).join('');
  }
  // a group chip: the carousel glides to that group's first card
  function jump(gid) {
    const c = [...track.querySelectorAll('[data-nx-g]')].find((h) => h.dataset.nxG === gid);
    const first = c && c.nextElementSibling;
    if (!first) return;
    const left = Math.max(0, first.offsetLeft - (track.clientWidth - first.offsetWidth) / 2);
    try { track.scrollTo({ left, behavior: reduce() ? 'auto' : 'smooth' }); } catch (_) { track.scrollLeft = left; }
  }
  // the 3D carousel: cards turn away from the middle as they scroll (one transform per card, on the next frame)
  let raf = 0;
  function tilt() {
    raf = 0;
    if (reduce()) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    for (const c of track.children) {
      if (!c.classList.contains('nx-card')) continue;               // the group headings stay flat
      const d = (c.offsetLeft + c.offsetWidth / 2 - mid) / (c.offsetWidth || 1);
      const k = Math.max(-1.6, Math.min(1.6, d));
      c.style.transform = `rotateY(${(-k * 16).toFixed(2)}deg) scale(${(1 - Math.min(1, Math.abs(k)) * 0.1).toFixed(3)})`;
      c.style.opacity = String(1 - Math.min(1, Math.abs(k)) * 0.35);
    }
  }
  track.addEventListener('scroll', () => { if (!raf) raf = win.requestAnimationFrame(tilt); }, { passive: true });

  // ---------------------------------------------------------------- open / close
  let openNow = false, hidden = false, openedAt = 0;
  function isOpen() { return openNow; }
  function open() {
    if (openNow) return;
    hideFan();
    render();
    const r = orb.getBoundingClientRect();
    rootEl.style.setProperty('--ox', Math.round(r.left + r.width / 2) + 'px');
    rootEl.style.setProperty('--oy', Math.round(r.top + r.height / 2) + 'px');
    openNow = true; openedAt = Date.now();
    rootEl.classList.add('on'); rootEl.setAttribute('aria-hidden', 'false');
    orb.classList.add('hide'); tip.classList.remove('on');
    // the current app's card in the middle, its quick button in view
    const c = track.querySelector('.nx-card.now') || track.querySelector('.nx-card');
    if (c) track.scrollLeft = c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2;
    const q = row.querySelector('.nx-qb.now');
    if (q) row.scrollLeft = Math.max(0, q.offsetLeft - (row.clientWidth - q.offsetWidth) / 2);
    tilt();
    setTimeout(() => { const f = c || rootEl.querySelector('.nx-x'); if (f) { try { f.focus({ preventScroll: true }); } catch (_) { f.focus(); } } }, 60);
  }
  function close() {
    if (!openNow) return;
    openNow = false;
    rootEl.classList.remove('on'); rootEl.setAttribute('aria-hidden', 'true');
    if (!hidden) orb.classList.remove('hide');
    wake();
  }
  function go(id) {
    try { if (win.jarvisSfx) win.jarvisSfx('tap'); } catch (_) { /* the sound layer is optional */ }
    close(); hideFan();
    if (id && id !== activeId()) call(opts.onSwitch, id);
    orb.classList.remove('pulse'); void orb.offsetWidth; orb.classList.add('pulse');
  }
  rootEl.addEventListener('click', (e) => {
    if (Date.now() - openedAt < 350) return;              // the tap that opened it, landing again (never a switch by itself)
    if (e.target.closest('.nx-sys')) { close(); call(opts.onSystem); return; }
    const j = e.target.closest('[data-nx-jump]');
    if (j) { jump(j.dataset.nxJump); return; }
    const t = e.target.closest('[data-nx], [data-nx-add], .nx-x');
    if (!t) { if (!e.target.closest('.nx-card, .nx-qb, .nx-row, .nx-gr')) close(); return; }
    if (t.classList.contains('nx-x')) { close(); return; }
    if (t.dataset.nxAdd) { close(); call(opts.onAdd); return; }
    go(t.dataset.nx);
  });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (openNow) close(); else hideFan(); } });

  // ---------------------------------------------------------------- swipe: the next / previous app
  function flick(dir) {
    const cur = activeId(), all = list().filter((a) => !a.off || a.id === cur);      // the next one that can open
    if (all.length < 2) return null;
    const i = all.findIndex((a) => a.id === cur);
    const n = all[((i < 0 ? 0 : i) + (dir > 0 ? 1 : -1) + all.length) % all.length];
    showTip(`${dir > 0 ? '→' : '←'} <b>${escH(label(n))}</b>`, 900);
    go(n.id);
    return n.id;
  }

  // ---------------------------------------------------------------- hold: the ring of apps around the orb
  let fanOn = false, hot = null;
  // the ring: the RING_MAX most opened apps (ties: switch order), then "more" (the whole switcher) when there are others
  function ringApps() {
    const others = list().filter((a) => a.id !== activeId() && !a.off), u = uses();
    if (others.length <= RING_MAX) return others;
    const top = others.map((a, i) => [a, +u[a.id] || 0, i]).sort((x, y) => y[1] - x[1] || x[2] - y[2]).slice(0, RING_MAX).map((x) => x[0]);
    return top.concat([{ id: '', more: true }]);
  }
  function showFan() {
    const all = ringApps();
    if (!all.length) return;
    fanOn = true;
    const r = orb.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, W = win.innerWidth, H = win.innerHeight;
    // an arc that opens toward the middle of the screen: at most ~150 degrees and at least 66 px of arc per button, kept on the
    // screen's side of the orb (an end past the edge would be pushed onto its neighbour)
    const n = all.length, R = n > 5 ? 158 : n > 3 ? 132 : 118, step = Math.max(66 / R, Math.min(0.78, 2.6 / Math.max(1, n - 1)));
    const spread = step * Math.max(1, n - 1) + 0.0001, half = Math.min(Math.PI / 2, spread / 2);
    let toward = Math.atan2(H / 2 - cy, W / 2 - cx);
    if (cx >= W / 2) { if (toward < 0) toward += 2 * Math.PI; toward = Math.max(Math.PI / 2 + half, Math.min(1.5 * Math.PI - half, toward)); }
    else toward = Math.max(-Math.PI / 2 + half, Math.min(Math.PI / 2 - half, toward));
    fan.classList.toggle('l', cx < W / 2);                // the orb on the left: the names go to the right of their buttons
    fan.querySelectorAll('.nx-fb').forEach((b) => b.remove());
    all.forEach((a, k) => {
      const ang = toward + (n === 1 ? 0 : -spread / 2 + (spread * k) / (n - 1));
      let x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
      x = Math.max(34, Math.min(W - 34, x)); y = Math.max(40, Math.min(H - 60, y));
      const b = doc.createElement('button');
      b.type = 'button'; b.className = 'nx-fb' + (a.more ? ' more' : '');
      if (a.more) b.dataset.nxMore = '1'; else b.dataset.nx = a.id;
      b.setAttribute('aria-label', a.more ? 'All apps' : label(a));
      b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px';
      b.style.setProperty('--fx0', Math.round(cx - x) + 'px'); b.style.setProperty('--fy0', Math.round(cy - y) + 'px');
      b.innerHTML = a.more ? '\u22ef<span class="nx-fl">ALL APPS</span>' : inner(a) + `<span class="nx-fl">${escH(label(a))}</span>`;
      fan.appendChild(b);
    });
    // the buttons grow out of the orb: their start is laid out first (a reflow, not a frame: WebKit can hold frames back, and
    // the ring stayed invisible under a held finger until one came; tested in WebKit's iPhone profile)
    void fan.offsetWidth;
    fan.classList.add('on');
    orb.classList.add('press');
    try { if (win.navigator.vibrate) win.navigator.vibrate(8); } catch (_) { /* no vibration on the iPhone */ }
  }
  function hideFan() {
    if (!fanOn) return;
    fanOn = false; hot = null;
    fan.classList.remove('on'); orb.classList.remove('press');
    setTimeout(() => { if (!fanOn) fan.querySelectorAll('.nx-fb').forEach((b) => b.remove()); }, 220);
  }
  function hitFan(x, y) {
    let best = null, bd = 44 * 44;
    for (const b of fan.querySelectorAll('.nx-fb')) {
      const r = b.getBoundingClientRect(), dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2), d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = b; }
    }
    if (best !== hot) { if (hot) hot.classList.remove('hot'); hot = best; if (hot) hot.classList.add('hot'); }
    return hot;
  }
  const pick = (b) => { if (b.dataset.nxMore) { hideFan(); open(); } else go(b.dataset.nx); };
  fan.addEventListener('click', (e) => {
    const b = e.target.closest('.nx-fb');
    if (b) pick(b); else hideFan();
  });

  // ---------------------------------------------------------------- the orb's gestures (one pointer)
  let g = null;
  // the finger's own times (the events' timestamps), not when a busy page got round to them: a quick flick stays a flick
  const when = (e) => (e && Number.isFinite(e.timeStamp) && e.timeStamp > 0 ? e.timeStamp : win.performance ? win.performance.now() : Date.now());
  orb.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    wake();
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: when(e), moved: false, drag: false, held: false };
    try { orb.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    // a hold: still unmoved HOLD_MS later. Decided on the next frame (the moves a busy phone has queued come first, so a drag
    // started while Jarvis was busy never turns into the ring), or 120 ms later when no frame comes
    const s0 = g;
    g.timer = setTimeout(() => {
      let done = false;
      const hold = () => { if (done) return; done = true; if (g === s0 && !s0.moved) { s0.held = true; showFan(); } };
      win.requestAnimationFrame(hold); setTimeout(hold, 120);
    }, HOLD_MS);
  });
  orb.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.held) { hitFan(e.clientX, e.clientY); return; }
    if (!g.moved && dx * dx + dy * dy > 64) { g.moved = true; clearTimeout(g.timer); }
    // a slow or mostly up / down move carries the orb; a quick sideways flick switches on release
    if (g.moved && (Math.abs(dy) > Math.abs(dx) * 0.8 || when(e) - g.t > 320)) { g.drag = true; place(e.clientX, e.clientY); }
  });
  function end(e, cancel) {
    if (!g || (e && e.pointerId !== g.id)) return;
    const s = g; g = null;
    clearTimeout(s.timer);
    const dx = e ? e.clientX - s.x : 0, dy = e ? e.clientY - s.y : 0, dt = e ? when(e) - s.t : 0;
    if (cancel) { if (s.held) hideFan(); if (s.drag) snap(); return; }
    if (s.held) { const b = hitFan(e.clientX, e.clientY); if (b) pick(b); return; }   // let go on an app (or "more"); else the ring stays to tap
    if (s.drag) { snap(); return; }
    if (s.moved) {
      if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 600) flick(dx < 0 ? 1 : -1);
      return;
    }
    open();
  }
  function snap() {
    const r = orb.getBoundingClientRect(), gm = geom();
    pos = { side: r.left + r.width / 2 < gm.W / 2 ? 'l' : 'r', y: Math.max(0, Math.min(1, (r.top - gm.top) / Math.max(1, gm.bottom - gm.top))) };
    lsSet(POS_KEY, pos);
    place();
  }
  orb.addEventListener('pointerup', (e) => end(e, false));
  orb.addEventListener('pointercancel', (e) => end(e, true));
  orb.addEventListener('click', (e) => { if (e.detail === 0) open(); });          // the keyboard (Enter / Space): open the switcher
  orb.addEventListener('contextmenu', (e) => e.preventDefault());
  // the orb's touches are all handled above: no copy click afterwards on whatever opened under the finger (iPhone)
  orb.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  // ---------------------------------------------------------------- the shell's hooks
  function setHidden(on) {
    hidden = !!on;
    orb.classList.toggle('hide', hidden || openNow);
    if (hidden) { hideFan(); tip.classList.remove('on'); }
  }
  function update() { if (openNow) { render(); tilt(); } else renderSys(); }
  function destroy() {
    for (const el of [orb, tip, fan, rootEl]) el.remove();
    doc.documentElement.removeAttribute('data-nexus');
  }
  return { update, open, close, isOpen, flick, setHidden, use, destroy, el: orb, version: VERSION };
}
