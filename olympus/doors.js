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
 *   find(q, apps)         { items: [{ door, item }], apps: [app] }: every word of q must match (case-insensitive) */
(function (g) {
  'use strict';
  var DOORS = [
    { id: 'zeus', title: 'ZEUS Trading', line: 'Zlarior and ATLAS: accounts, live bots, trades, brain, rules, payouts', colour: '#c8a24a',
      home: 'hub/zeus.html',   // the door's landing (night-zeushub 2026-11-18): live accounts, today, the big buttons; the Doors page links it first
      items: [
        { label: 'My accounts', greek: 'Business · My Accounts', href: 'business/accounts.html', app: 'business', words: 'accounts evals funded mffu builder 50k 25k rapid balance pass target floor' },
        { label: 'Bots right now', greek: 'NQ', href: 'nq/', app: 'nq', words: 'bots live on off running pc zlarior atlas lit status drawdown ninjatrader' },
        { label: 'Full dashboard', greek: 'Zenith', href: 'index.html', app: 'zenith', words: 'dashboard home main today results zenith' },
        { label: "Bot's brain", greek: 'Zenith · Brain', href: 'index.html#/brain', app: '', words: 'brain thinking setups levels sweep why waiting' },
        { label: 'Trades', greek: 'Trading', href: 'trading/', app: 'trading', words: 'trades history calendar stats fills today pnl p&l' },
        { label: 'Drawdown left', greek: 'Aegis', href: 'aegis/', app: 'aegis', words: 'risk drawdown stop loss max loss limit room guard dll mll' },
        { label: 'Rules', greek: 'Pnyx', href: 'pnyx/', app: 'pnyx', words: 'rules prop firm mffu calculator micros contracts size stop' },
        { label: 'Payout rules', greek: 'Trading · payout check', href: 'trading/#rulesCard', app: '', words: 'payout payouts withdraw request rules consistency best day' }
      ],
      ids: ['zenith', 'nq', 'board', 'why', 'trading', 'aegis', 'pnyx', 'demeter', 'labyrinth', 'fates', 'moirai', 'odeon', 'nemesis', 'kronos', 'apollo', 'journal',
        'kratos', 'epilogue', 'ares', 'argus', 'oracle', 'pantheon', 'pythia', 'pheme', 'kairos', 'chronos', 'forum', 'delphi'] },
    { id: 'money', title: 'Money', line: 'Business, taxes, payouts, the fleet plan and the household', colour: '#7f8a52',
      items: [
        { label: 'Business', greek: 'Business', href: 'business/', app: 'business', words: 'business money models next step side income' },
        { label: 'Real money', greek: 'Ledger', href: 'ledger/', app: 'ledger', words: 'money cash fees payouts profit net spend paid scoreboard' },
        { label: 'Taxes', greek: 'Business · Taxes', href: 'business/taxes.html', app: '', words: 'taxes tax irs estimated quarterly 30% pot set aside' },
        { label: 'Payout plan', greek: 'Hera', href: 'hera/', app: 'hera', words: 'payout payouts plan 12 month what to buy next roadmap' },
        { label: 'Fleet plan', greek: 'Business · Fleet Plan', href: 'business/plan.html', app: '', words: 'fleet plan accounts 6 months buy rapid builder monte carlo' },
        { label: 'Household', greek: 'Oikos', href: 'oikos/', app: 'oikos', words: 'household bills budget leaks buckets home spending' },
        { label: 'More work', greek: 'Business · More Work', href: 'business/work.html', app: '', words: 'work jobs side work freelance agency websites income' },
        { label: 'Work week', greek: 'Business · Work Week', href: 'business/schedule.html', app: '', words: 'schedule week calendar checks review payout day' }
      ],
      ids: ['business', 'ledger', 'hera', 'plutus', 'chrysos', 'oikos', 'agency', 'mercury', 'mint', 'mintcity', 'harmonia', 'hermes', 'argo', 'arbiter'] },
    { id: 'kalshi', title: 'Kalshi', line: 'The Kalshi bot and its edges. Paused: paper only, no real bets', colour: '#b5a642',
      items: [
        { label: 'Kalshi bot', greek: 'Kalshi', href: 'kalshi/', app: 'kalshi', words: 'kalshi bot balance bets open p&l paused rewards' },
        { label: 'Kalshi desk', greek: 'Dionysus', href: 'dionysus/', app: 'dionysus', words: 'kalshi desk guard what if scan suggestions' },
        { label: 'Edges map', greek: 'Kalshi City', href: 'kalshicity/', app: 'kalshicity', words: 'kalshi edges city learned' },
        { label: 'Paper picks', greek: 'Sibyl', href: 'sibyl/', app: 'sibyl', words: 'kalshi picks prediction markets edges fees paper ruin' },
        { label: 'Bets wheel', greek: 'Tyche', href: 'tyche/', app: 'tyche', words: 'kalshi bets wheel fortune' }
      ],
      ids: ['kalshi', 'dionysus', 'kalshicity', 'sibyl', 'tyche'] },
    { id: 'more', title: 'More', line: 'Research, my day, Jarvis, settings and everything else', colour: '#9c6b3c',
      items: [
        { label: 'What to do next', greek: 'Compass', href: 'compass/', app: 'compass', words: 'todo to do today next actions priorities' },
        { label: 'My day', greek: 'Planner', href: 'planner/', app: 'planner', words: 'day week plan calendar tasks habits shift' },
        { label: 'Ask Jarvis', greek: 'Jarvis', href: 'jarvis/', app: '', words: 'jarvis ask assistant voice talk' },
        { label: 'Morning brief', greek: 'Helios', href: 'helios/', app: 'helios', words: 'morning brief briefing today plan news' },
        { label: 'Research library', greek: 'Clio', href: 'clio/', app: 'clio', words: 'research studies writeups library tested backtest' },
        { label: 'Help: how do I...', greek: 'Help', href: 'hub/help.html', app: '', words: 'help how do i questions faq guide lost stuck find steps payout taxes account restart update pause flatten silent holidays kalshi cloudflare address' },
        { label: 'Me: health, home', greek: 'Me hub', href: 'hub/index.html?h=me', app: '', words: 'me health wifi cards home car dates personal' },
        { label: 'Settings', greek: 'Settings', href: 'settings/', app: 'settings', words: 'settings look theme voice storage tour' }
      ],
      ids: ['compass', 'helios', 'herald', 'stoa', 'hestia', 'inbox', 'planner', 'mind', 'arena', 'athena', 'lyceum', 'nike', 'gallery', 'polis', 'symposium',
        'ergasterion', 'settings', 'bridge', 'atlas', 'cities', 'datacity', 'observatory', 'tree', 'prometheus', 'hephaestus', 'clio', 'archive', 'pinakes', 'colosseum'] }
  ];
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
    for (var n = 0; n < list.length; n++) if (list[n] && all(words(list[n]))) res.apps.push(list[n]);
    return res;
  }
  var api = { VERSION: 1, DOORS: DOORS, WORDS: WORDS, door: door, doorOf: doorOf, homeOf: homeOf, words: words, find: find, ALL: 'gate/index.html#az', PAGE: 'hub/doors.html' };
  g.OLYMPUS_DOORS = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this));
