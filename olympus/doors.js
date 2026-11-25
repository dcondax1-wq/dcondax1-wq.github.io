/* OLYMPUS four doors (2026-11-18, night-org, docs/ORGANIZATION.md). Owner: "I can't find a lot of shit ... whether it's Kalshi, Jarvis, money or
 * trading. I need everything organized, figure out a clean way."  ONE file says where every app lives:
 *   ZEUS Trading   accounts, the live bots, trades, the bot's brain, rules, payouts (and the market pages the bots trade on)
 *   Money          business, taxes, payouts, the fleet plan, household, side work
 *   Kalshi         the Kalshi bot and its edges (paused: paper only)
 *   More           research, life, Jarvis, settings, the 3D worlds: everything else
 * Each door: the 5-8 things he uses (plain name first, the Greek app name as the subtitle), then "All apps" (ids: every app of
 * olympus/apps-list.js is in exactly ONE door; tests.test_apps_list checks it). Visible labels only: no app id or URL changes.
 * Used by: hub/doors.html (the Doors page), the Gate's four door tiles, launcher.js (groups + door shortcuts, it loads this file),
 * jarvis/switcher.js DIST, jarvis/districts.js and atlas/atlas.js zones (their own copies of `ids`, kept equal by the tests).
 * Classic ES5 script, no DOM, no network: window.OLYMPUS_DOORS (module.exports in node). Paths are from the site root.
 *   DOORS                 [{ id, title, line, colour, home?, items: [{ label, greek, href, app, words }], ids }]   home = the door's own landing page
 *   homeOf(id)            the door's landing: its home page, else the Doors page at that door (hub/doors.html#<id>)
 *   doorOf(id)            the door id of an app ('more' when it is in no list: a new app lands in More until it is filed)
 *   words(app)            the plain search words of an app (its name, purpose, id, its door, its shortcut labels, WORDS)
 *   find(q, apps)         { items: [{ door, item }], apps: [app] }: every word of q must match (case-insensitive)
 *   ARCHIVE, archived(id) the weak / duplicate apps folded under "Archive" in their door (2026-11-20 revamp); still in `ids`, still found */
(function (g) {
  'use strict';
  var DOORS = [
    { id: 'zeus', title: 'ZEUS Trading', line: 'Zlarior and ATLAS: accounts, live bots, trades, brain, rules, payouts', colour: '#c8a24a',
      home: 'hub/zeus.html',   // the door's landing (night-zeushub 2026-11-18): live accounts, today, the big buttons; the Doors page links it first
      items: [
        { label: 'My accounts', greek: 'Business · My Accounts', href: 'business/accounts.html', app: 'business', words: 'accounts evals funded mffu builder 50k 25k rapid balance pass target floor' },
        { label: 'Bots right now', greek: 'NQ', href: 'nq/', app: 'nq', words: 'bots live on off running pc zlarior atlas lit status drawdown ninjatrader' },
        { label: 'Room left on each account', greek: 'MFFU view', href: 'business/mffu.html', app: '', words: 'room drawdown left lose floor open trade live' },
        { label: 'Decide cards', greek: 'Board · Decide', href: 'board/index.html#decide', app: '', words: 'decide decisions yes no questions' },
        { label: 'Trades', greek: 'Trading', href: 'trading/', app: 'trading', words: 'trades history calendar stats fills today pnl p&l' },
        { label: 'Drawdown left', greek: 'Aegis', href: 'aegis/', app: 'aegis', words: 'risk drawdown stop loss max loss limit room guard dll mll' },
        { label: 'Rules', greek: 'Pnyx', href: 'pnyx/', app: 'pnyx', words: 'rules prop firm mffu calculator micros contracts size stop' },
        { label: 'Payout rules', greek: 'Trading · payout check', href: 'trading/#rulesCard', app: '', words: 'payout payouts withdraw request rules consistency best day payout ready readiness when request how much days left' }
      ],
      ids: ['brain', 'warroom', 'pillars', 'zenith', 'nq', 'board', 'why', 'trading', 'aegis', 'pnyx', 'demeter', 'labyrinth', 'fates', 'moirai', 'odeon', 'nemesis', 'kronos', 'apollo', 'journal',
        'kratos', 'epilogue', 'ares', 'argus', 'oracle', 'pantheon', 'pythia', 'pheme', 'kairos', 'chronos', 'forum', 'delphi'] },
    { id: 'money', title: 'Money', line: 'Business, taxes, payouts, the fleet plan and the household', colour: '#7f8a52',
      items: [
        { label: 'Business', greek: 'Business', href: 'business/', app: 'business', words: 'business money models next step side income' },
        { label: 'Widget + Glance', greek: 'Widget', href: 'widget/', app: 'widget', words: 'widget glance home screen scriptable accounts iphone' },
        { label: 'Real money', greek: 'Ledger', href: 'ledger/', app: 'ledger', words: 'money cash fees payouts profit net spend paid scoreboard' },
        { label: 'Taxes', greek: 'Business · Taxes', href: 'business/taxes.html', app: '', words: 'taxes tax irs estimated quarterly 30% pot set aside' },
        { label: 'Payout plan', greek: 'Hera', href: 'hera/', app: 'hera', words: 'payout payouts plan 12 month what to buy next roadmap' },
        { label: 'Fleet plan', greek: 'Business · Fleet Plan', href: 'business/plan.html', app: '', words: 'fleet plan accounts 6 months buy rapid builder monte carlo' },
        { label: 'Household', greek: 'Oikos', href: 'oikos/', app: 'oikos', words: 'household bills budget leaks buckets home spending' },
        { label: 'Websites: your web business HQ', greek: 'Agency', href: 'agency/', app: 'agency', words: 'website websites web 3d site sites marketing leads audit proposal proposals clients agency design build retainer care plan more work side income' },   // day-web-hub 2026-11-20: replaces 'More work' (business/work.html still in Business), the door stays at 8
      ],
      ids: ['business', 'widget', 'ledger', 'hera', 'plutus', 'chrysos', 'oikos', 'agency', 'mercury', 'mint', 'mintcity', 'harmonia', 'hermes', 'argo', 'arbiter'] },
    { id: 'kalshi', title: 'Kalshi', line: 'The Kalshi bot and its edges. Paused: paper only, no real bets', colour: '#b5a642',
      items: [
        { label: 'Kalshi bot', greek: 'Kalshi', href: 'kalshi/', app: 'kalshi', words: 'kalshi bot balance bets open p&l paused rewards' },
        { label: 'Kalshi desk', greek: 'Dionysus', href: 'dionysus/', app: 'dionysus', words: 'kalshi desk k8 today guard what if scan suggestions sibyl picks kalshi city edges' },
        { label: 'Kalshi fees + going broke', greek: 'Dionysus · fees', href: 'dionysus/#feeCard', app: '', words: 'kalshi fee fees break even must win fair price ruin broke bet size bankroll' },
        { label: 'What the old bot taught', greek: 'Dionysus · lessons', href: 'dionysus/#lessonCard', app: '', words: 'kalshi lessons learned old bot retired edges stop xrp 90-95 paper picks sibyl' },
        { label: 'Bets wheel', greek: 'Tyche', href: 'tyche/', app: 'tyche', words: 'kalshi bets wheel fortune' }
      ],
      ids: ['kalshi', 'dionysus', 'kalshicity', 'sibyl', 'tyche'] },
    { id: 'more', title: 'More', line: 'Research, my day, Jarvis, settings and everything else', colour: '#9c6b3c',
      items: [
        { label: 'My day', greek: 'Planner', href: 'planner/', app: 'planner', words: 'day week plan calendar tasks habits shift' },
        { label: 'Ask Jarvis', greek: 'Jarvis', href: 'jarvis/', app: '', words: 'jarvis ask assistant voice talk' },
        // day-manual 2026-11-20: 'Set up your iPhone' replaces 'Olympus World' here (the World lives in Cities, on the Home grid): the door stays at 8
        { label: 'Set up your iPhone: Home Screen, widget, alerts, Siri', greek: 'Set up', href: 'hub/setup.html', app: '', words: 'setup set up iphone phone home screen icon icons app apps widget notifications alerts push siri shortcuts install add' },
        { label: 'Help: how do I...', greek: 'Help', href: 'hub/help.html', app: '', words: 'help how do i questions faq guide lost stuck find steps payout taxes account restart update pause flatten silent holidays kalshi cloudflare address' },
        { label: 'Owner manual: SOS, who is who, money, words', greek: 'Manual', href: 'hub/manual.html', app: '', words: 'manual sos emergency kill stop everything glossary words room drawdown dll eod pf twin edge who accounts bots hours payout tax' },
        { label: 'Your steps: what is left to do', greek: 'Steps', href: 'hub/steps.html', app: '', words: 'steps todo to do waiting list next need' },
        { label: "What's new: what changed today and this week", greek: "What's new", href: 'hub/whatsnew.html', app: '', words: 'whats new changed changes updates latest recent week today' },
        { label: 'Me: health, home', greek: 'Me hub', href: 'hub/index.html?h=me', app: '', words: 'me health wifi cards home car dates personal' },
      ],
      ids: ['compass', 'helios', 'herald', 'stoa', 'hestia', 'inbox', 'planner', 'mind', 'arena', 'athena', 'lyceum', 'nike', 'gallery', 'polis', 'symposium',
        'ergasterion', 'settings', 'bridge', 'atlas', 'cities', 'datacity', 'observatory', 'tree', 'prometheus', 'hephaestus', 'clio', 'archive', 'pinakes', 'colosseum'] }
  ];
  // ARCHIVE (night-revamp-main 2026-11-20, owner: "a lot of those arenas are shit. We need the main stuff."): these apps stay in their door
  // (every app is still in exactly one door, every URL works, search still finds them) but the Doors page, the launcher and Jarvis's
  // switcher show them folded under "Archive" at the end of the door, so each door opens on the few pages he uses. Audit:
  // research/handoff/2026-11-20/revamp-main/AUDIT.md. To bring one back: take its id out of this list.
  var ARCHIVE = ['apollo', 'ares', 'delphi', 'epilogue', 'forum', 'kratos', 'labyrinth', 'moirai', 'nemesis', 'odeon', 'why', 'pythia', 'argus', 'oracle', 'pantheon',
    'pheme', 'kairos', 'chronos',
    'plutus', 'mint', 'mintcity', 'harmonia', 'hermes', 'argo', 'arbiter',
    'herald', 'stoa', 'hestia', 'mind', 'arena', 'athena', 'lyceum', 'nike', 'gallery', 'polis', 'symposium', 'ergasterion', 'bridge', 'datacity',
    'observatory', 'tree', 'prometheus', 'hephaestus', 'archive', 'pinakes', 'colosseum',
    'sibyl', 'kalshicity'];   // day-kalshi 2026-11-20: merged into Dionysus (plain cards); the old pages stay reachable
  // plain words for apps that are not a door shortcut (or need more): what the owner would type
  var WORDS = {
    business: 'taxes tax accounts fleet plan side work', ledger: 'tax taxes', board: 'board notes accounts events claude what the bot knows', demeter: 'account health drawdown payout rules dials', labyrinth: 'size sizing micros eval risk',
    fates: 'pass odds eval chance probability', moirai: 'eval simulator pass bust monte carlo', odeon: 'trades replay chart history', nemesis: 'losses losing trades mistakes',
    kronos: 'pnl calendar daily money days', apollo: 'weekly review lessons', journal: 'journal diary notes habits', kratos: 'discipline score habits',
    ares: 'go wait halt checklist', argus: 'fix problems issues health', oracle: 'market radar live price vix', pythia: 'news calendar cpi fomc events',
    plutus: 'accounts payouts plan', chrysos: 'prop firm fees fleet planner break even', agency: 'agency websites leads calls side work', mercury: 'deals sales codes discounts resets',
    mint: 'side income streams', harmonia: 'balance diversify income', hermes: 'wrapped money story', argo: 'goals savings', arbiter: 'spreads funding paper',
    inbox: 'alerts messages notifications', mind: 'brain vault notes obsidian', athena: 'library strategy rules quiz learn', bridge: 'chatgpt link jobs',
    atlas: 'map all apps every app directory', datacity: 'research data combos tested', prometheus: 'research strategies forge tested', hephaestus: 'research tune dials',
    tree: 'research strategy tree search', archive: 'every test tests strategies tried rejected backtests', observatory: 'research data health', pinakes: 'tables catalogue data query', colosseum: 'research strategies fight rounds'
  };
  var byId = {}, i, j;
  for (i = 0; i < DOORS.length; i++) for (j = 0; j < DOORS[i].ids.length; j++) byId[DOORS[i].ids[j]] = DOORS[i].id;
  function door(id) { for (var k = 0; k < DOORS.length; k++) if (DOORS[k].id === id) return DOORS[k]; return null; }
  function doorOf(id) { return byId[id] || 'more'; }
  var arc = {}; for (i = 0; i < ARCHIVE.length; i++) arc[ARCHIVE[i]] = 1;
  function archived(id) { return !!arc[id]; }                    // folded under Archive (still in its door)
  // RETIRED (owner 2026-11-20 "the forges and stuff we don't need ... Cities should be one overall thing"; day-archive INVENTORY.md + NAV):
  // shown nowhere (not in the doors, the Archive fold or search); the page and URL still open. Same list as olympus/gate-catalog.js RETIRED.
  var RETIRED = ['delphi', 'stoa', 'hestia', 'plutus', 'argo', 'mint', 'harmonia', 'kairos', 'chronos', 'lyceum', 'polis', 'atlascity',
    'gallery', 'mintcity', 'nike', 'arena', 'mind', 'symposium', 'herald', 'ergasterion', 'observatory', 'pheme', 'bridge', 'arbiter', 'hermes',
    'hephaestus', 'datacity', 'kalshicity'];
  var ret = {}; for (var ri = 0; ri < RETIRED.length; ri++) ret[RETIRED[ri]] = 1;
  function retired(id) { return !!ret[id]; }
  // THE 6 ARENAS (owner 2026-11-20 17:00 ET: "I want like 6 arenas, that's it, then a separate area for the smaller stuff"): shown FIRST on the
  // Home, the launcher and the Doors page, in this order; every other app stays in its door, under "More". The four doors stay (the World's
  // four districts, Atlas and the Doors page are built on them).
  var ARENAS = [
    { id: 'cities', label: 'Cities', href: 'cities/index.html', line: 'The 3D world of all your apps' },
    { id: 'kalshi', label: 'Kalshi', href: 'kalshi/index.html', line: 'The K8 clock bets' },
    { id: 'nq', label: 'NQ Bot', href: 'nq/index.html', line: 'Zlarior + ATLAS right now' },
    { id: 'jarvis', label: 'Jarvis', href: 'jarvis/index.html', line: 'Ask anything' },
    { id: 'agency', label: 'Websites', href: 'agency/index.html', line: 'Your website business HQ' },
    { id: 'business', label: 'Business', href: 'business/index.html', line: 'Accounts, payouts, plan (Planner at its top)' }
  ];
  function arena(id) { for (var k = 0; k < ARENAS.length; k++) if (ARENAS[k].id === id) return true; return false; }                     // still in its door's ids, so doorOf() keeps working
  function homeOf(id) { var d = door(id); return d && d.home ? d.home : 'hub/doors.html#' + (d ? d.id : 'zeus'); }
  function words(a) {
    if (!a) return '';
    var id = String(a.id || ''), d = door(doorOf(id)), out = [a.name, a.purpose, a.label, a.sub, id, d ? d.title : '', WORDS[id] || ''];
    for (var k = 0; k < DOORS.length; k++) for (var m = 0; m < DOORS[k].items.length; m++) { var it = DOORS[k].items[m]; if (it.app && it.app === id) out.push(it.label, it.words); }
    return out.join(' ').toLowerCase();
  }
  function itemWords(d, it) { return [it.label, it.greek, it.words, d.title].join(' ').toLowerCase(); }
  function find(q, apps) {
    var ws = String(q == null ? '' : q).toLowerCase().split(/\s+/).filter(Boolean), res = { items: [], apps: [] };
    if (!ws.length) return res;
    var all = function (hay) { for (var k = 0; k < ws.length; k++) if (hay.indexOf(ws[k]) < 0) return false; return true; };
    for (var k = 0; k < DOORS.length; k++) for (var m = 0; m < DOORS[k].items.length; m++) if (all(itemWords(DOORS[k], DOORS[k].items[m]))) res.items.push({ door: DOORS[k], item: DOORS[k].items[m] });
    var list = apps || [];
    for (var n = 0; n < list.length; n++) if (list[n] && !ret[list[n].id] && all(words(list[n]))) res.apps.push(list[n]);
    return res;
  }
  var api = { VERSION: 2, ARENAS: ARENAS, arena: arena, DOORS: DOORS, WORDS: WORDS, ARCHIVE: ARCHIVE, archived: archived, RETIRED: RETIRED, retired: retired, door: door, doorOf: doorOf, homeOf: homeOf, words: words, find: find, ALL: 'gate/index.html#az', PAGE: 'hub/doors.html' };
  g.OLYMPUS_DOORS = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this));
