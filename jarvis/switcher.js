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
//   Organize (2026-11-10): a search box (name or plain-words purpose), a MAP button (every app on one screen, group colours), favourites
//                      (long-press a card / tile, or F: 'jarvis.orb.fav') and recent apps ('jarvis.orb.recent') as their own sections on top.
//   opts.doc           optional: the document (tests)
//   Doors (2026-11-18; the five districts of 2026-11-10 before): everything is organised by the four doors: ZEUS Trading, Money, Kalshi, More (the same
//                      ids as atlas/atlas.js; olympus/doors.js is the source). The cards, chips and map follow them; the hold ring is two steps: hold, slide onto a
//                      district (or Search), let go, then its apps fan out (tap one; Back; All <district> opens the map there). opts.districts === false = the
//                      old groups from opts.sections.
// use(id) counts an app's opens on this phone ('jarvis.orb.use'; the shell calls it on every switch): the hold ring shows the
// RING_MAX most opened apps, plus a "more" slice (the whole switcher) when there are more.
const VERSION = 1;
const POS_KEY = 'jarvis.orb';
const TIP_KEY = 'jarvis.orb.tips';
const DOCK_KEY = 'jarvis.orb.dock2';       // home v2: the orb went back to its place in the row above the Ask bar (once)
const USE_KEY = 'jarvis.orb.use';
const FAV_KEY = 'jarvis.orb.fav';          // favourites (long-press a card or a map tile)
const REC_KEY = 'jarvis.orb.recent';       // the last apps opened, newest first
const FAV_MAX = 12, REC_MAX = 4, PRESS_MS = 520;
const HOLD_MS = 380;
const RING_MAX = 4;
// the FOUR DOORS (2026-11-18, night-org, docs/ORGANIZATION.md): ZEUS Trading, Money, Kalshi, More. The same ids, colours and app lists as
// olympus/doors.js (the source) and atlas/atlas.js zones (tests.test_apps_list + tests.test_jarvis_home_agora keep them equal). An app in no list: its
// group (trading = ZEUS, money = Money), else More. (jarvis/districts.js keeps the five old districts for the home courtyard's doorways only.)
const DIST = [
  { id: 'zeus', title: 'ZEUS Trading', colour: '#c8a24a', ids: ['zenith', 'nq', 'board', 'why', 'trading', 'aegis', 'pnyx', 'demeter', 'labyrinth', 'fates', 'moirai', 'odeon', 'nemesis', 'kronos', 'apollo', 'journal', 'kratos', 'epilogue', 'ares', 'argus', 'oracle', 'pantheon', 'pythia', 'pheme', 'kairos', 'chronos', 'forum', 'delphi'] },
  { id: 'money', title: 'Money', colour: '#7f8a52', ids: ['business', 'ledger', 'hera', 'plutus', 'chrysos', 'oikos', 'agency', 'mercury', 'mint', 'mintcity', 'harmonia', 'hermes', 'argo', 'arbiter'] },
  { id: 'kalshi', title: 'Kalshi', colour: '#b5a642', ids: ['kalshi', 'dionysus', 'kalshicity', 'sibyl', 'tyche'] },
  { id: 'more', title: 'More', colour: '#9c6b3c', ids: ['compass', 'helios', 'herald', 'stoa', 'hestia', 'inbox', 'planner', 'mind', 'arena', 'athena', 'lyceum', 'nike', 'gallery', 'polis', 'symposium', 'ergasterion', 'settings', 'bridge', 'atlas', 'cities', 'datacity', 'observatory', 'tree', 'prometheus', 'hephaestus', 'clio', 'archive', 'pinakes', 'colosseum'] },
];
const DGROUP = { trading: 'zeus', money: 'money' };
const distOf = (a) => { const id = a && a.id; for (const d of DIST) if (d.ids.indexOf(id) >= 0) return d.id; return DGROUP[String((a && a.group) || '').toLowerCase()] || 'more'; };

const CSS = `
.nx-orb{position:fixed;z-index:2147483100;width:56px;height:56px;margin:0;padding:0;border:0;background:none;border-radius:50%;
  touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;cursor:pointer;
  transition:opacity .25s ease,transform .18s ease;color:var(--oly-th-n37, #f3ece0)}
.nx-orb .nx-core{position:absolute;inset:7px;border-radius:50%;
  background:radial-gradient(circle at 50% 38%,#2b4377 0,#16264a 55%,#0b1430 100%);   /* the Home Screen icon's navy (web/icons/icon.svg, 2026-11-18) */
  
  box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-orb::after{content:"";position:absolute;inset:1px;border-radius:50%;border:1.5px solid rgba(var(--oly-th-warn-rgb, 224,176,96),.55);border-top-color:var(--oly-th-a8, #c8a24a);
  border-bottom-color:rgba(var(--oly-th-a8-rgb, 192,155,80),.35)}
.nx-orb::before{content:"";position:absolute;inset:-3px;border-radius:50%;border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.28);border-left-color:rgba(var(--oly-th-warn-rgb, 224,176,96),.8)}
.nx-orb.idle{opacity:.72}
.nx-orb:active,.nx-orb.press{transform:scale(.92)}
.nx-orb.hide{opacity:0;visibility:hidden;pointer-events:none}
.nx-orb:focus{outline:none}.nx-orb:focus-visible{outline:2px solid var(--oly-th-warn, #e0b060);outline-offset:3px}
.nx-orb .nx-core svg{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-14px 0 0 -13px;fill:#e6bb62}
.nx-orb.pulse .nx-core{animation:nx-pulse .6s ease}
@keyframes nx-pulse{50%{transform:scale(.94)}}
@keyframes nx-spin{to{transform:rotate(360deg)}}
@keyframes nx-spin-r{to{transform:rotate(-360deg)}}
.nx-tip{position:fixed;z-index:2147483101;padding:7px 11px;border-radius:10px;background:rgba(var(--oly-th-n3-rgb, 21,18,15),.96);border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.55);
  color:var(--oly-th-n37, #f3ece0);font:600 13px/1.3 -apple-system,system-ui,sans-serif;letter-spacing:.04em;white-space:nowrap;pointer-events:none;
  opacity:0;transform:translateY(4px);transition:opacity .18s ease,transform .18s ease;box-shadow:0 6px 24px rgba(var(--oly-th-n3-rgb, 21,20,17),.5)}
.nx-tip.on{opacity:1;transform:none}
.nx-tip.row{height:44px;display:flex;align-items:center;gap:6px;box-sizing:border-box;padding:0 14px;border-radius:22px;background:var(--oly-th-n4, #1d1914);border-color:var(--oly-th-n8, #3a3228);box-shadow:none;font-size:14px;letter-spacing:0;overflow:hidden;text-overflow:ellipsis}
.nx-tip b{font:700 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;color:var(--oly-th-n37, #f3ece0)}
.nx-fan{position:fixed;inset:0;z-index:2147483099;pointer-events:none}
.nx-fan.on{pointer-events:auto}
.nx-fan .nx-fs{position:absolute;inset:0;background:rgba(var(--oly-th-n1-rgb, 6,5,4),.55);opacity:0;transition:opacity .16s ease}
.nx-fan.on .nx-fs{opacity:1}
.nx-fb{position:absolute;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.6);
  background:radial-gradient(circle at 50% 40%,rgba(var(--oly-th-n11-rgb, 88,70,52),.98),rgba(var(--oly-th-n3-rgb, 24,20,16),.98));color:var(--oly-th-n37, #f3ece0);display:grid;place-items:center;padding:0;
  box-shadow: 0 4px 14px rgba(0,0,0,.32);opacity:0;transform:translate(var(--fx0),var(--fy0)) scale(.4);
  transition:opacity .16s ease,transform .2s cubic-bezier(.2,.9,.25,1.2);font:700 15px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif)}
.nx-fan.on .nx-fb{opacity:1;transform:translate(0,0) scale(1)}
.nx-fb.hot{border-color:var(--oly-th-a8, #c8a24a);box-shadow: 0 4px 14px rgba(0,0,0,.32);transform:scale(1.14)!important}
.nx-fb.now{border-color:var(--oly-th-warn, #e0b060);box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-fb img{width:30px;height:30px;border-radius:8px;object-fit:cover}
.nx-fb .nx-fl{position:absolute;top:50%;right:66px;transform:translateY(-50%);padding:4px 8px;border-radius:8px;background:rgba(var(--oly-th-n2-rgb, 15,13,11),.92);
  border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.35);font:700 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;white-space:nowrap;color:var(--oly-th-n37, #f3ece0)}
.nx-fan.l .nx-fb .nx-fl{right:auto;left:66px}
.nx-root{position:fixed;inset:0;z-index:2147483200;display:flex;flex-direction:column;color:var(--oly-th-n37, #f3ece0);
  background:radial-gradient(120% 70% at 50% 0%,rgba(var(--oly-th-a4-rgb, 116,89,62),.55),transparent 60%),radial-gradient(90% 60% at 50% 100%,rgba(var(--oly-th-n6-rgb, 49,40,32),.45),transparent 70%),var(--oly-th-n3, #14110e);
  padding:calc(env(safe-area-inset-top,0px) + 10px) 0 calc(env(safe-area-inset-bottom,0px) + 14px);box-sizing:border-box;
  opacity:0;visibility:hidden;pointer-events:none;-webkit-clip-path:circle(0 at var(--ox,90%) var(--oy,70%));clip-path:circle(0 at var(--ox,90%) var(--oy,70%));
  transition:clip-path .42s cubic-bezier(.3,.8,.25,1),-webkit-clip-path .42s cubic-bezier(.3,.8,.25,1),opacity .2s ease,visibility 0s linear .42s;
  font:500 16px/1.4 -apple-system,system-ui,sans-serif}
.nx-root.on{opacity:1;visibility:visible;pointer-events:auto;-webkit-clip-path:circle(150% at var(--ox,90%) var(--oy,70%));
  clip-path:circle(150% at var(--ox,90%) var(--oy,70%));transition:clip-path .42s cubic-bezier(.3,.8,.25,1),-webkit-clip-path .42s cubic-bezier(.3,.8,.25,1),opacity .12s ease}
.nx-root::before{content:none}
.nx-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px 4px}
.nx-head>div{min-width:0}
.nx-head h2{margin:0;font:700 15px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;color:var(--oly-th-n37, #f3ece0);text-shadow: none}
.nx-head small{display:block;margin-top:3px;font:600 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;color:var(--oly-th-n22, #9a8f7d)}
.nx-x{flex:none;width:44px;height:44px;border-radius:50%;border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.5);background:rgba(var(--oly-th-n4-rgb, 28,24,20),.9);color:var(--oly-th-n37, #f3ece0);font:400 22px/1 -apple-system,system-ui,sans-serif;padding:0}
.nx-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center}
.nx-track{position:relative;display:flex;gap:14px;width:100%;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
  padding:12px calc(50% - min(39vw,160px));box-sizing:border-box;scrollbar-width:none;perspective:900px}
.nx-track::-webkit-scrollbar{display:none}
.nx-card{position:relative;flex:0 0 min(78vw,320px);height:min(56vh,430px);scroll-snap-align:center;border-radius:22px;padding:18px 18px 16px;box-sizing:border-box;
  border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.45);background:linear-gradient(165deg,rgba(var(--oly-th-n7-rgb, 58,46,34),.97),rgba(var(--oly-th-n3-rgb, 19,16,13),.98) 60%);color:inherit;text-align:left;
  display:flex;flex-direction:column;gap:10px;overflow:hidden;font:inherit;box-shadow:0 18px 50px rgba(var(--oly-th-n3-rgb, 21,20,17),.55),inset 0 1px 0 rgba(var(--oly-th-n37-rgb, 239,238,235),.06);
  transform-origin:50% 60%;will-change:transform}
.nx-card::after{content:"";position:absolute;inset:auto -30% -45% -30%;height:70%;background:radial-gradient(closest-side,rgba(var(--nx-acr,168,85,247),.32),transparent);pointer-events:none}
.nx-card[style]{border-color:rgba(var(--nx-acr),.5)}
.nx-card[style]::before{content:"";position:absolute;left:22%;right:22%;top:0;height:2px;border-radius:0 0 2px 2px;background:rgb(var(--nx-acr));box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-card[style] .nx-emb .i{background:radial-gradient(circle at 50% 40%,rgba(var(--nx-acr),.85),rgba(var(--oly-th-n3-rgb, 24,20,16),.98));box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-card.now{border-color:var(--oly-th-warn, #e0b060);box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-card .nx-top{display:flex;align-items:center;gap:12px}
.nx-mini{display:block;border-radius:50%;background:radial-gradient(circle at 38% 32%,var(--oly-th-a14, #f3e3bd) 0,var(--oly-th-warn, #e0b060) 24%,var(--oly-th-a8, #c8a24a) 50%,var(--oly-th-a4, #7a5230) 100%)}
.nx-emb{flex:1 1 0;min-height:56px;display:flex;align-items:center;justify-content:center}
.nx-emb .e{position:relative;height:min(140px,100%);aspect-ratio:1/1;max-width:100%;border-radius:50%;display:grid;place-items:center}
.nx-emb .e::before{content:"";position:absolute;inset:0;border-radius:50%;border:1.5px dashed rgba(var(--oly-th-warn-rgb, 224,176,96),.42)}
.nx-emb .e::after{content:"";position:absolute;inset:11px;border-radius:50%;border:2px solid rgba(var(--oly-th-a8-rgb, 192,155,80),.18);border-top-color:var(--oly-th-a8, #c8a24a);border-right-color:rgba(var(--oly-th-warn-rgb, 224,176,96),.7)}
.nx-emb .i{width:56%;height:56%;border-radius:24px;overflow:hidden;display:grid;place-items:center;font:700 40px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);color:var(--oly-th-n37, #f3ece0);
  background:radial-gradient(circle at 50% 40%,rgba(var(--oly-th-a9-rgb, 197,164,98),.95),rgba(var(--oly-th-n6-rgb, 45,37,29),.98));box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-emb .i img{width:100%;height:100%;object-fit:cover}
.nx-emb .i .nx-mini{width:62%;height:62%;box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-ic{flex:none;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;overflow:hidden;
  background:radial-gradient(circle at 50% 40%,rgba(var(--oly-th-a9-rgb, 197,164,98),.9),rgba(var(--oly-th-n6-rgb, 45,37,29),.95));border:1px solid rgba(var(--oly-th-warn-rgb, 224,176,96),.5);font:700 22px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif)}
.nx-ic img{width:100%;height:100%;object-fit:cover}
.nx-ic .nx-mini{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 50% 45%,var(--oly-th-n37, #f3ece0) 0,var(--oly-th-n37, #f3ede1) 18%,var(--oly-th-a8, #c8a24a) 46%,var(--oly-th-a2, #533e28) 100%);
  box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-nm{min-width:0}
.nx-nm b{display:block;font:700 19px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;color:var(--oly-th-n37, #f3ece0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx-nm span{display:block;color:var(--oly-th-n30, #cfc4b2);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx-now{position:absolute;top:14px;right:14px;padding:3px 8px;border-radius:999px;font:700 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;
  color:var(--oly-th-n3, #14110e);background:var(--oly-th-warn, #e0b060);box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-val{font:700 clamp(28px,9vw,38px)/1.05 var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing:.02em;color:var(--oly-th-n37, #f3ece0);text-shadow: none;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nx-val.up{color:var(--oly-th-g8, #a3ae6b);text-shadow: none}.nx-val.dn{color:var(--oly-th-r9, #e0795a);text-shadow: none}
.nx-ln{margin:0;color:var(--oly-th-n30, #cfc4b2);font-size:16px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.nx-ln.m{color:var(--oly-th-n22, #9a8f7d);font-size:15px}
.nx-ft{display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.22);
  font:700 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;color:var(--oly-th-warn, #e0b060)}
.nx-dot{width:9px;height:9px;border-radius:50%;background:var(--oly-th-n15, #68625c);display:inline-block;margin-right:8px;vertical-align:1px}
.nx-dot.ok{background:var(--oly-th-g8, #a3ae6b);box-shadow: 0 4px 14px rgba(0,0,0,.32)}.nx-dot.warn{background:var(--oly-th-warn, #e0b060);box-shadow: 0 4px 14px rgba(0,0,0,.32)}.nx-dot.bad{background:var(--oly-th-r9, #e0795a);box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-card.off,.nx-qb.off{opacity:.5;border-style:dashed}
.nx-card.add{align-items:center;justify-content:center;text-align:center;border-style:dashed;background:rgba(var(--oly-th-n3-rgb, 21,18,15),.85)}
.nx-card.add .nx-ic{width:64px;height:64px;font-size:30px}
.nx-row{display:flex;gap:10px;padding:6px 16px 2px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;
  overscroll-behavior-x:contain}
.nx-row::-webkit-scrollbar{display:none}
.nx-row>:first-child{margin-left:auto}.nx-row>:last-child{margin-right:auto}
.nx-qb{flex:none;width:46px;height:46px;border-radius:50%;padding:0;border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.45);background:rgba(var(--oly-th-n4-rgb, 28,24,20),.92);color:var(--oly-th-n37, #f3ece0);
  display:grid;place-items:center;font:700 14px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);overflow:hidden}
.nx-qs{flex:none;width:1px;height:28px;align-self:center;background:rgba(var(--oly-th-a8-rgb, 200,162,74),.35)}
.nx-gr{display:flex;gap:8px;padding:8px 16px 0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.nx-gr::-webkit-scrollbar{display:none}
.nx-gr[hidden]{display:none}
.nx-gb{flex:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.35);background:rgba(var(--oly-th-n4-rgb, 28,24,20),.85);color:var(--oly-th-n30, #cfc4b2);
  font:700 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em}
.nx-gb i{font-style:normal;color:var(--oly-th-n22, #9a8f7d);margin-left:6px;letter-spacing:0}
.nx-gb.on{border-color:var(--oly-th-warn, #e0b060);color:var(--oly-th-n37, #f3ece0);box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-gl{flex:0 0 auto;align-self:center;padding:14px 0;-webkit-writing-mode:vertical-rl;writing-mode:vertical-rl;transform:rotate(180deg);
  font:700 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;color:var(--oly-th-n30, #cfc4b2);border-left:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.4);padding-left:6px}
.nx-fb.more{font-size:22px;border-style:dashed}
.nx-fb.dist{border-color:var(--mc,var(--oly-th-a8, #c8a24a))}
.nx-fb.dist i,.nx-fb.srch i{font:600 20px/1 var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);font-style:normal;color:var(--mc,var(--oly-th-warn, #e0b060))}
.nx-fb.back{font:400 26px -apple-system,system-ui,sans-serif;border-style:dashed}
.nx-fb .nx-fl small{font:500 12px -apple-system,system-ui,sans-serif;color:var(--oly-th-n30, #cfc4b2);margin-left:6px}
.nx-map h3 .nx-hn{font:500 12px -apple-system,system-ui,sans-serif;color:var(--oly-th-n22, #9a8f7d);margin-left:8px}
.nx-qb img{width:26px;height:26px;border-radius:7px;object-fit:cover}
.nx-qb[data-nx="home"]{position:sticky;left:0;right:0;z-index:1}
.nx-qb.now{border-color:var(--oly-th-warn, #e0b060);box-shadow: 0 4px 14px rgba(0,0,0,.32)}
.nx-qb .nx-mini{width:20px;height:20px;border-radius:50%;background:radial-gradient(circle at 50% 45%,var(--oly-th-n37, #f3ece0) 0,var(--oly-th-n37, #f3ede1) 18%,var(--oly-th-a8, #c8a24a) 46%,var(--oly-th-a2, #533e28) 100%)}
.nx-sys{position:relative;display:flex;align-items:center;gap:10px;margin:8px 16px 0;padding:8px 12px;min-height:46px;box-sizing:border-box;border-radius:14px;
  border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.4);background:rgba(var(--oly-th-n4-rgb, 28,24,20),.92);color:var(--oly-th-n37, #f3ece0);text-align:left;font:600 14px/1.3 -apple-system,system-ui,sans-serif;width:calc(100% - 32px)}
.nx-sys[hidden]{display:none}
.nx-sys.ok{border-color:rgba(var(--oly-th-g9-rgb, 175,184,112),.5)}.nx-sys.warn{border-color:rgba(var(--oly-th-a8-rgb, 213,174,74),.6)}.nx-sys.bad{border-color:rgba(var(--oly-th-r9-rgb, 207,132,110),.8);background:rgba(var(--oly-th-r3-rgb, 115,56,38),.95)}
.nx-sys b{flex:none;font:700 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;color:var(--oly-th-n37, #f3ece0)}
.nx-sys.ok b{color:var(--oly-th-g8, #a3ae6b)}.nx-sys.warn b{color:var(--oly-th-warn, #e0b060)}.nx-sys.bad b{color:var(--oly-th-r9, #e0795a)}
.nx-sys .nx-st{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--oly-th-n30, #cfc4b2)}
.nx-sys .nx-sd{flex:none;display:flex;gap:3px}
.nx-sys .nx-sd i{width:8px;height:8px;border-radius:50%;background:var(--oly-th-n9, #3e3c39)}
.nx-sys .nx-sd i.ok{background:var(--oly-th-g8, #a3ae6b)}.nx-sys .nx-sd i.warn{background:var(--oly-th-warn, #e0b060)}.nx-sys .nx-sd i.bad{background:var(--oly-th-r9, #e0795a)}
.nx-orb .nx-alert{position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;border:2px solid var(--oly-th-n3, #14110e);display:none;box-sizing:border-box}
.nx-orb.lv-warn .nx-alert{display:block;background:var(--oly-th-warn, #e0b060)}.nx-orb.lv-bad .nx-alert{display:block;background:var(--oly-th-r9, #e0795a)}
.nx-hint{text-align:center;color:var(--oly-th-n22, #9a8f7d);font:600 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,-apple-system,system-ui,sans-serif);letter-spacing: .02em;padding:10px 16px 0}
.nx-find{display:flex;gap:8px;padding:8px 16px 0}
.nx-find input{flex:1;min-width:0;height:46px;border-radius:12px;border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.4);background:rgba(var(--oly-th-n4-rgb, 28,24,20),.92);color:var(--oly-th-n37, #f3ece0);padding:0 14px;font:500 16px -apple-system,system-ui,sans-serif}
.nx-find input::placeholder{color:var(--oly-th-n22, #9a8f7d)}
.nx-find input:focus{outline:2px solid var(--oly-th-warn, #e0b060);outline-offset:1px}
.nx-mapb{flex:none;min-width:64px;min-height:46px;padding:0 14px;border-radius:12px;border:1px solid rgba(var(--oly-th-a8-rgb, 200,162,74),.5);background:rgba(var(--oly-th-n4-rgb, 28,24,20),.92);color:var(--oly-th-warn, #e0b060);
  font:700 13px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);letter-spacing:.02em}
.nx-mapb[aria-pressed="true"]{background:var(--oly-th-a8, #c8a24a);color:var(--oly-th-n3, #14110e)}
.nx-fv{position:absolute;top:12px;left:12px;color:var(--oly-th-warn, #e0b060);font-size:16px;line-height:1}
.nx-empty{padding:18px 16px;text-align:center;color:var(--oly-th-n30, #cfc4b2);font:500 15px -apple-system,system-ui,sans-serif}
.nx-map{display:none;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:6px 16px calc(18px + env(safe-area-inset-bottom,0px));flex:1;min-height:0}
.nx-root.map .nx-map{display:block}
.nx-root.map .nx-stage,.nx-root.map .nx-row,.nx-root.map .nx-gr,.nx-root.map .nx-hint{display:none}
.nx-map h3{margin:12px 2px 6px;font:700 14px var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);letter-spacing:.02em;color:var(--mc,var(--oly-th-a8, #c8a24a));border-bottom:1px solid var(--mc,var(--oly-th-a8, #c8a24a));padding-bottom:4px}
.nx-mg{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.nx-mt{position:relative;min-height:56px;padding:6px 2px 4px;border-radius:12px;border:1px solid var(--mc,var(--oly-th-a8, #c8a24a));background:rgba(var(--oly-th-n4-rgb, 28,24,20),.92);color:var(--oly-th-n37, #f3ece0);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:600 11px/1.15 -apple-system,system-ui,sans-serif;text-align:center;overflow:hidden}
.nx-mt i{font:700 18px/1 var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);font-style:normal;color:var(--mc,var(--oly-th-a8, #c8a24a))}
.nx-mt span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nx-mt.now{background:rgba(var(--oly-th-a8-rgb, 200,162,74),.22)}.nx-mt.off{opacity:.5;border-style:dashed}
.nx-mt .nx-fv{top:2px;left:4px;font-size:11px}
@media (min-width:520px){.nx-mg{grid-template-columns:repeat(6,minmax(0,1fr))}}
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
    const all = given();
    if (opts.districts !== false) {
      const home = all.filter((a) => a.id === 'home'), rest = all.filter((a) => a.id !== 'home');
      const out = home.length ? [{ g: null, apps: home }] : [];
      for (const d of DIST) { const apps = rest.filter((a) => distOf(a) === d.id); if (apps.length) out.push({ g: { id: d.id, name: d.title }, apps }); }
      return out;
    }
    const s = typeof opts.sections === 'function' ? call(opts.sections, all) : null;
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
  orb.setAttribute('aria-label', 'Switch apps: tap for all apps, swipe for the next one, hold for the four doors');
  orb.innerHTML = '<span class="nx-core"><svg viewBox="160 200 704 624" aria-hidden="true"><path d="M512 226 830 392H194zM512 282 296 362h432z" fill-rule="evenodd"/><rect x="194" y="408" width="636" height="44" rx="6"/><rect x="245" y="474" width="84" height="22" rx="4"/><rect x="256" y="496" width="62" height="196"/><rect x="395" y="474" width="84" height="22" rx="4"/><rect x="406" y="496" width="62" height="196"/><rect x="545" y="474" width="84" height="22" rx="4"/><rect x="556" y="496" width="62" height="196"/><rect x="695" y="474" width="84" height="22" rx="4"/><rect x="706" y="496" width="62" height="196"/><rect x="214" y="712" width="596" height="38" rx="5"/><rect x="174" y="768" width="676" height="40" rx="6"/></svg></span><span class="nx-alert"></span>';      // its two turning rings are ::before / ::after (inside the screen edge)
  const tip = doc.createElement('div'); tip.className = 'nx-tip'; tip.setAttribute('aria-hidden', 'true');
  const fan = doc.createElement('div'); fan.className = 'nx-fan'; fan.innerHTML = '<div class="nx-fs"></div>';
  const rootEl = doc.createElement('div');
  rootEl.className = 'nx-root'; rootEl.id = 'nxRoot'; rootEl.setAttribute('role', 'dialog'); rootEl.setAttribute('aria-modal', 'true');
  rootEl.setAttribute('aria-label', 'Switch apps'); rootEl.setAttribute('aria-hidden', 'true');
  rootEl.innerHTML = '<div class="nx-head"><div><h2>OLYMPUS</h2><small>Four doors \u00b7 swipe, or hold the orb</small></div>'
    + '<button class="nx-x" type="button" aria-label="Close">×</button></div>'
    + '<div class="nx-find"><input id="nxFind" type="search" autocomplete="off" autocapitalize="off" placeholder="Search every app" aria-label="Search apps by name or what they do">'
    + '<button class="nx-mapb" id="nxMapBtn" type="button" aria-pressed="false" aria-label="Show all apps on one screen">MAP</button></div>'
    + '<button class="nx-sys" type="button" id="nxSys" hidden></button>'
    + '<div class="nx-gr" id="nxGroups" role="group" aria-label="Jump to a group" hidden></div>'
    + '<div class="nx-stage"><div class="nx-track" id="nxTrack"></div></div><div class="nx-row" id="nxRow"></div>'
    + '<div class="nx-map" id="nxMap" aria-label="All apps on one screen"></div>';
  doc.body.appendChild(fan); doc.body.appendChild(rootEl); doc.body.appendChild(orb); doc.body.appendChild(tip);
  const noImg = (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.parentNode) t.parentNode.replaceChild(doc.createTextNode(t.dataset.g || '?'), t); };
  rootEl.addEventListener('error', noImg, true); fan.addEventListener('error', noImg, true);
  const track = rootEl.querySelector('.nx-track'), row = rootEl.querySelector('.nx-row'), sysEl = rootEl.querySelector('.nx-sys');
  const groupsEl = rootEl.querySelector('.nx-gr'), findEl = rootEl.querySelector('#nxFind'), mapBtn = rootEl.querySelector('#nxMapBtn'), mapEl = rootEl.querySelector('#nxMap');
  let query = '', mapOn = false;
  const GCOL = { zeus: '#c8a24a', kalshi: '#b5a642', more: '#9c6b3c', market: '#c8a24a', research: '#4b7a99', money: '#7f8a52', command: '#c96a4a', life: '#9c6b3c', trading: '#c8a24a', fav: '#e0b060', recent: '#9c6b3c' };
  const favs = () => { const f = lsGet(FAV_KEY, []); return Array.isArray(f) ? f.filter((x) => typeof x === 'string').slice(0, FAV_MAX) : []; };
  const recents = () => { const f = lsGet(REC_KEY, []); return Array.isArray(f) ? f.filter((x) => typeof x === 'string').slice(0, REC_MAX) : []; };
  function toggleFav(id) {
    const f = favs(), i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.push(id);
    lsSet(FAV_KEY, f.slice(0, FAV_MAX));
    try { if (win.navigator.vibrate) win.navigator.vibrate(10); } catch (_) { /* none on iPhone */ }
    render();
  }
  // the plain-words line of an app: its sub-line, else the Olympus list's purpose
  const plain = (a) => { const L = win.OLYMPUS_APPS_LIST, r = Array.isArray(L) ? L.find((x) => x.id === a.id) : null; return String(a.sub || '') + ' ' + (r ? r.purpose : ''); };
  const matches = (a, gname) => !query || (String(a.label || '') + ' ' + String(a.name || '') + ' ' + a.id + ' ' + plain(a) + ' ' + (gname || '')).toLowerCase().includes(query);

  // position: a side ('r' | 'l') and a height (fraction of the screen), kept on this phone
  // Home v2 (2026-11-11): the orb's own place is the row above the Ask bar, at the right (side 'r', y 1): it never floats over the page. On the
  // Jarvis home that row is clear for it (html[data-orb-dock="1"]: the search button moves over); the owner can still drag it anywhere.
  let pos = lsGet(POS_KEY, null);
  if (!lsGet(DOCK_KEY, 0)) { pos = null; lsSet(DOCK_KEY, 1); lsSet(POS_KEY, { side: 'r', y: 1 }); }     // once: back to its place
  if (!pos || (pos.side !== 'l' && pos.side !== 'r') || !(pos.y >= 0 && pos.y <= 1)) pos = { side: 'r', y: 1 };
  const htmlEl = doc.documentElement;
  const geom = () => {
    const W = win.innerWidth, H = win.innerHeight, cs = win.getComputedStyle(htmlEl);
    const sb = parseFloat(cs.getPropertyValue('--sab')) || 0;
    let slot = null;                                          // the top of the orb when it sits in the row above the Ask bar (Jarvis home only)
    const dock = doc.getElementById('dock');
    if (dock && htmlEl.getAttribute('data-mode') === 'jarvis') { const r = dock.getBoundingClientRect(); if (r.height > 0 && r.top > H * 0.5) slot = Math.round(r.top - 5 - 56); }
    return { W, H, top: 70, bottom: H - 56 - 96 - sb, slot };
  };
  const setDock = (on) => { if (on) htmlEl.setAttribute('data-orb-dock', '1'); else htmlEl.removeAttribute('data-orb-dock'); };
  function place(x, y) {
    const g = geom();
    let left, top;
    if (x == null) {
      const docked = pos.side === 'r' && pos.y >= 0.999 && g.slot != null;
      left = pos.side === 'l' ? 8 : g.W - 56 - 8; top = docked ? g.slot : g.top + pos.y * Math.max(0, g.bottom - g.top);
      setDock(docked);
    } else { left = Math.max(4, Math.min(g.W - 60, x - 28)); top = Math.max(g.top, Math.min(g.bottom, y - 28)); }
    orb.style.left = Math.round(left) + 'px'; orb.style.top = Math.round(top) + 'px';
  }
  place();
  renderSys();
  win.addEventListener('resize', () => place(), { passive: true });
  let idleT = 0;
  const wake = () => { orb.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => orb.classList.add('idle'), 4000); };
  wake();

  const isDocked = () => htmlEl.getAttribute('data-orb-dock') === '1';
  // the chip and the search button come back only once the hint has faded out (.18 s): no frame shows both texts on top of each other
  const tipOff = () => { tip.classList.remove('on'); clearTimeout(tipOff.t); tipOff.t = setTimeout(() => { if (!tip.classList.contains('on')) htmlEl.removeAttribute('data-orb-tip'); }, 200); };
  function showTip(html, ms = 1100) {
    clearTimeout(tipOff.t);
    tip.innerHTML = html;
    const r = orb.getBoundingClientRect(), W = win.innerWidth, row = isDocked();
    tip.classList.toggle('row', row);
    if (row) {                                              // docked: the words take the place of the next chip and the search button in the orb's own row
      htmlEl.setAttribute('data-orb-tip', '1');
      tip.style.top = Math.round(r.top + 6) + 'px'; tip.style.left = '12px'; tip.style.maxWidth = Math.max(120, Math.round(r.left - 22)) + 'px';
      tip.classList.add('on');
    } else {
      tip.style.maxWidth = '';
      tip.style.top = Math.round(r.top + 16) + 'px';
      tip.classList.add('on');
      const w = tip.offsetWidth;
      tip.style.left = Math.round(pos.side === 'l' ? Math.min(W - w - 6, r.right + 8) : Math.max(6, r.left - w - 8)) + 'px';
    }
    clearTimeout(showTip.t); showTip.t = setTimeout(tipOff, ms);
  }
  // the first use: say what the orb does, ONCE, in the orb's own row (never over the page), gone by itself after 3 s
  const tips = +lsGet(TIP_KEY, 0) || 0;
  if (tips < 1) setTimeout(() => { place(); if (!hidden && !isOpen() && isDocked()) { lsSet(TIP_KEY, tips + 1); showTip('<b>Apps</b> · tap, swipe or hold the orb', 3200); } }, 1800);

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
    const base = sections(), cur = activeId(), all = list(), byId = new Map(all.map((a) => [a.id, a]));
    let parts = base.map((p) => ({ g: p.g, apps: p.apps.filter((a) => matches(a, p.g && p.g.name)) })).filter((p) => p.apps.length);
    const fv = favs().map((id) => byId.get(id)).filter(Boolean), rc = recents().map((id) => byId.get(id)).filter((a) => a && a.id !== cur && !fv.includes(a));
    const top = [];
    if (!query && fv.length) top.push({ g: { id: 'fav', name: 'FAVOURITES' }, apps: fv });
    if (!query && rc.length) top.push({ g: { id: 'recent', name: 'RECENT' }, apps: rc });
    parts = top.concat(parts);
    const many = parts.filter((p) => p.g).length > 1, favSet = new Set(favs());
    const head = (p) => (many && p.g ? `<div class="nx-gl" data-nx-g="${escH(p.g.id)}" aria-hidden="true">${escH(p.g.name)}</div>` : '');
    track.innerHTML = (parts.length ? '' : `<p class="nx-empty">No app matches "${escH(query.slice(0, 40))}".</p>`) + parts.map((p) => head(p) + p.apps.map((a) => card(a, a.id === cur, many && p.g)).join('')).join('')
      + (typeof opts.onAdd === 'function' ? '<button class="nx-card add" type="button" data-nx-add="1" aria-label="Add a dashboard">'
        + '<span class="nx-ic">+</span><div class="nx-nm"><b>ADD</b><span>Any dashboard with a link (Ascend too)</span></div></button>' : '');
    const qb = (a) => `<button class="nx-qb${a.id === cur ? ' now' : ''}${a.off ? ' off' : ''}" type="button" data-nx="${escH(a.id)}" aria-label="${escH(label(a))}">${inner(a)}</button>`;
    track.querySelectorAll('.nx-card[data-nx]').forEach((c) => { if (favSet.has(c.dataset.nx)) c.insertAdjacentHTML('afterbegin', '<span class="nx-fv" aria-hidden="true">\u2605</span>'); });
    const star = (a) => (favSet.has(a.id) ? '<b class="nx-fv" aria-hidden="true">\u2605</b>' : '');
    mapEl.innerHTML = !parts.length ? `<p class="nx-empty">No app matches "${escH(query.slice(0, 40))}".</p>` : parts.map((p) => {
      const isHome = !p.g && p.apps.some((a) => a.id === 'home'), gid = p.g ? p.g.id : isHome ? 'fav' : 'more', col = GCOL[String(gid).toLowerCase()] || '#c96a4a';
      return `<h3 style="--mc:${col}" data-nx-d="${escH(gid)}">${escH(p.g ? p.g.name : isHome ? 'Home' : 'More')}<span class="nx-hn">${p.apps.length}</span></h3><div class="nx-mg" style="--mc:${col}">`
        + p.apps.map((a) => `<button class="nx-mt${a.id === cur ? ' now' : ''}${a.off ? ' off' : ''}" type="button" data-nx="${escH(a.id)}" aria-label="${escH(label(a))}${favSet.has(a.id) ? ', favourite' : ''}">${star(a)}<i>${escH(String(a.glyph || a.name || '?').charAt(0).toUpperCase())}</i><span>${escH(String(a.name || a.id))}</span></button>`).join('') + '</div>';
    }).join('');
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
    query = ''; findEl.value = ''; mapOn = false; rootEl.classList.remove('map'); mapBtn.setAttribute('aria-pressed', 'false');
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
    if (id && id !== 'home' && id !== activeId()) lsSet(REC_KEY, [id].concat(recents().filter((x) => x !== id)).slice(0, REC_MAX));
    if (id && id !== activeId()) call(opts.onSwitch, id);
    orb.classList.remove('pulse'); void orb.offsetWidth; orb.classList.add('pulse');
  }
  let noClickUntil = 0;
  rootEl.addEventListener('click', (e) => {
    if (Date.now() < noClickUntil) return;                // the long-press that just set a favourite
    if (Date.now() - openedAt < 350) return;              // the tap that opened it, landing again (never a switch by itself)
    if (e.target.closest('.nx-sys')) { close(); call(opts.onSystem); return; }
    const j = e.target.closest('[data-nx-jump]');
    if (j) { jump(j.dataset.nxJump); return; }
    const t = e.target.closest('[data-nx], [data-nx-add], .nx-x');
    if (e.target.closest('#nxMapBtn')) { mapOn = !mapOn; rootEl.classList.toggle('map', mapOn); mapBtn.setAttribute('aria-pressed', String(mapOn)); return; }
    if (!t) { if (!e.target.closest('.nx-card, .nx-qb, .nx-row, .nx-gr, .nx-find, .nx-map')) close(); return; }
    if (t.classList.contains('nx-x')) { close(); return; }
    if (t.dataset.nxAdd) { close(); call(opts.onAdd); return; }
    go(t.dataset.nx);
  });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (openNow) close(); else hideFan(); } });
  findEl.addEventListener('input', () => { query = findEl.value.trim().toLowerCase(); render(); });
  findEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && query) { const t = (mapOn ? mapEl : track).querySelector('[data-nx]'); if (t) go(t.dataset.nx); } });
  // long-press a card or a map tile (or press F on it): star it as a favourite
  let pressT = 0;
  const pressEnd = () => clearTimeout(pressT);
  rootEl.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.nx-card[data-nx], .nx-mt[data-nx]');
    if (!t || t.dataset.nx === 'home') return;
    clearTimeout(pressT);
    pressT = setTimeout(() => { noClickUntil = Date.now() + 700; toggleFav(t.dataset.nx); }, PRESS_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) rootEl.addEventListener(ev, pressEnd);
  rootEl.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('[data-nx]');
    if ((e.key === 'f' || e.key === 'F') && t && t.dataset.nx !== 'home' && e.target !== findEl) toggleFav(t.dataset.nx);
  });
  rootEl.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-nx]')) e.preventDefault(); });

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
  let fanOn = false, hot = null, ringLevel = 'root';
  // the ring, step 1: Jarvis (unless you are on him), the districts that have an app you can open, then Search; step 2 (after a district): its RING_MAX most opened apps,
  // "All <district>" (the map, scrolled there) and Back
  function ringApps() {
    const apps = list().filter((a) => a.id !== activeId() && !a.off), u = uses();
    if (ringLevel === 'root') {
      const items = DIST.map((d) => ({ dist: d.id, title: d.title, colour: d.colour, n: apps.filter((a) => a.id !== 'home' && distOf(a) === d.id).length })).filter((x) => x.n);
      items.push({ search: true });
      const home = apps.find((a) => a.id === 'home');            // Jarvis himself first, one slide away from anywhere
      if (home) items.unshift(home);
      return items;
    }
    const d = DIST.find((x) => x.id === ringLevel) || DIST[0];
    const inD = apps.map((a, i) => [a, +u[a.id] || 0, i]).filter((x) => x[0].id !== 'home' && distOf(x[0]) === d.id).sort((x, y) => y[1] - x[1] || x[2] - y[2]).map((x) => x[0]);
    const out = inD.slice(0, RING_MAX);
    if (inD.length > RING_MAX) out.push({ more: true, dist: d.id, title: d.title });
    out.push({ back: true });
    return out;
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
      b.type = 'button'; b.className = 'nx-fb' + (a.more ? ' more' : '') + (a.dist && !a.more ? ' dist' : '') + (a.search ? ' srch' : '') + (a.back ? ' back' : '');
      if (a.more) { b.dataset.nxMore = '1'; b.dataset.nxDist = a.dist; } else if (a.dist) b.dataset.nxDist = a.dist; else if (a.search) b.dataset.nxSearch = '1'; else if (a.back) b.dataset.nxBack = '1'; else b.dataset.nx = a.id;
      if (a.dist && !a.more) b.style.setProperty('--mc', a.colour);
      b.setAttribute('aria-label', a.more ? 'All ' + a.title + ' apps' : a.dist ? a.title + ': ' + a.n + ' apps' : a.search ? 'Search every app' : a.back ? 'Back to the doors' : label(a));
      b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px';
      b.style.setProperty('--fx0', Math.round(cx - x) + 'px'); b.style.setProperty('--fy0', Math.round(cy - y) + 'px');
      b.innerHTML = a.more ? '⋯<span class="nx-fl">All ' + escH(a.title) + '</span>' : a.dist ? `<i>${escH(a.title.charAt(0))}</i><span class="nx-fl">${escH(a.title)}<small>${a.n}</small></span>`
        : a.search ? '<i>⌕</i><span class="nx-fl">Search</span>' : a.back ? '‹<span class="nx-fl">Back</span>' : inner(a) + `<span class="nx-fl">${escH(label(a))}</span>`;
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
    fanOn = false; hot = null; ringLevel = 'root';
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
  // a district's own place in the full switcher: the map, scrolled to its heading
  function openDistrict(id) {
    hideFan(); open();
    mapOn = true; rootEl.classList.add('map'); mapBtn.setAttribute('aria-pressed', 'true');
    const h = mapEl.querySelector('[data-nx-d="' + id + '"]');
    if (h) { try { h.scrollIntoView({ block: 'start' }); } catch (_) { mapEl.scrollTop = h.offsetTop; } }
  }
  const pick = (b) => {
    const d = b.dataset;
    if (d.nxMore) { openDistrict(d.nxDist); return; }
    if (d.nxDist) { ringLevel = d.nxDist; hot = null; showFan(); return; }
    if (d.nxBack) { ringLevel = 'root'; hot = null; showFan(); return; }
    if (d.nxSearch) { hideFan(); open(); setTimeout(() => { try { findEl.focus(); } catch (_) { /* fine */ } }, 120); return; }
    go(d.nx);
  };
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
    if (pos.side === 'r' && r.top >= gm.bottom - 14) pos.y = 1;                 // let go at the bottom right: back into its row
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
    if (hidden) { hideFan(); tipOff(); }
  }
  const dragging = () => !!(g && g.drag);
  function update() { if (openNow) { render(); tilt(); } else { renderSys(); if (!dragging()) place(); } }
  function destroy() {
    for (const el of [orb, tip, fan, rootEl]) el.remove();
    doc.documentElement.removeAttribute('data-nexus');
  }
  return { update, open, close, isOpen, flick, setHidden, use, destroy, el: orb, version: VERSION };
}
