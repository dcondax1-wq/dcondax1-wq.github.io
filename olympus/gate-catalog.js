/* OLYMPUS Gate catalog v2 (2026-11-14, docs/OLYMPUS_IA_V2.md): every app in plain words, filed under NINE HUBS named after the owner's jobs.
 * Owner: "Make it very organized. I keep saying this but it always looks the same: 'Trading', 'Money', 'Life' subcategories. I want something more organized."
 * v1 had 82 rows in 4 districts (Trading 33 / Money 16 / Life 12 / Worlds 11) + a Workshop. v2: the districts ARE the hubs (so the theme engine's
 * per-district "mix" follows the hubs): Today, Bots & Evals, Kalshi, My Money, Plan & Day, Research, Jarvis, Worlds, Settings & Help.
 * + Me (2026-11-14, team ME1, docs/ME_HUB.md): a PAGE hub (page: 'me', no apps, no tabs): its areas are drawn by hub/me.js from the PC's private
 *   me/me.json; it has its own look in Mix like any hub; findHubs(q) lets the Gate's search find it ("health", "wifi", "cards").
 * Inside a hub, a section = one job. The FIRST app of a section is its best version ("best"); an app whose 9th column names another app is a duplicate
 * folded into that one (shown under "Other views of the same", never removed). Every old app URL stays: hubs only link / embed them.
 * One row per app: [id, path from the site root ('' = the dashboard), Greek name, plain label (what the owner reads first), one-line purpose,
 *   hub, section inside the hub, extra search words, folded into (id of the best version, or '')].
 * Classic script (ES5), no network, no DOM: window.OLYMPUS_GATE (and module.exports in node).
 * tests/test_gate_page.py + tests/test_hubs.py check every app folder and every row of olympus/apps-list.js is here exactly once. */
(function (g) {
  'use strict';
  var R = [
    // ---- Today: what is happening, and what do I do now
    ['compass', 'compass/', 'Compass', 'What to do next', 'At most five things for today, with why', 'today', 'now', 'todo to do tasks actions next priorities', ''],
    ['ares', 'ares/', 'Ares', 'Go, wait or halt', 'The pre-trade check: GO, WAIT or HALT', 'today', 'now', 'go wait halt war room status checklist', ''],
    ['inbox', 'inbox/', 'Inbox', 'Inbox', 'Everything that needs a look, in one place', 'today', 'now', 'alerts messages notifications inbox', ''],
    ['stoa', 'stoa/', 'Stoa', 'Needs you now', 'What needs a look right now', 'today', 'now', 'attention alerts urgent now', 'compass'],
    ['hestia', 'hestia/', 'Hestia', 'Today at home', 'What to do right now, at home', 'today', 'now', 'today home now', 'compass'],
    ['helios', 'helios/', 'Helios', 'Morning briefing', 'Today in one scroll: drawdown, deals, the plan', 'today', 'brief', 'morning briefing brief today plan summary sun', ''],
    ['herald', 'herald/', 'Herald', 'Daily paper', 'Who built what, the day, the verdicts', 'today', 'brief', 'news newspaper paper today changes what changed', ''],
    ['delphi', 'delphi/', 'Delphi', 'Go or no-go', 'The plan, the target and go / no-go for today', 'today', 'brief', 'go no go plan target oracle', 'helios'],
    ['forum', 'forum/', 'Forum', 'Market morning notes', 'The briefing at the real New York hour', 'today', 'brief', 'market morning briefing new york open', 'helios'],
    ['pythia', 'pythia/', 'Pythia', 'Risk calendar', 'The next 14 days of news, and what the bots do', 'today', 'market', 'news events cpi fomc nfp calendar economic week schedule', ''],
    ['kairos', 'kairos/', 'Kairos', "The bots' day", 'A 24-hour ring: what the bots do now', 'today', 'market', 'clock schedule hours timeline day window', ''],
    ['oracle', 'oracle/', 'Oracle', 'Market radar', 'The market, live', 'today', 'market', 'market radar live price vix', ''],
    ['pantheon', 'pantheon/', 'Pantheon', 'Market mood', 'Rates, liquidity and fear', 'today', 'market', 'rates liquidity fear vix macro mood', ''],
    ['pheme', 'pheme/', 'Pheme', 'News days', "Releases, and NQ's past moves on them", 'today', 'market', 'news releases cpi fomc moves reaction', 'pythia'],
    ['chronos', 'chronos/', 'Chronos', 'Session clock', 'Time and the trading sessions', 'today', 'market', 'time session clock london new york asia hours', 'kairos'],
    // ---- Bots & Evals: each account, its drawdown, trades and pass odds
    ['nq', 'nq/', 'NQ', 'Bots right now', 'Is each bot on, drawdown left, the last trades', 'bots', 'bots', 'bots bot status zlarior atlas blitz lit running pc drawdown trades nq ninjatrader', ''],
    ['pillars', 'pillars/', 'Four Pillars', 'The four pillars', 'LIT, ATLAS, BLITZ, ORDER FLOW: status, edge, next', 'bots', 'bots', 'four pillars lit zlarior atlas blitz order flow orderflow ticks edge strategy what is next', 'nq'],
    ['brain', 'brain/', 'The Brain', 'Bot brain, live 3D', 'Next trade, live chart, thinking and what it learned', 'bots', 'bots', 'brain 3d neurons thinking learning next trade live chart lit atlas blitz order flow', 'nq'],
    ['warroom', 'warroom/', 'War Room', 'Every bot, every step, live', 'Each bot: its steps, what it waits for, how close a trade', 'bots', 'bots', 'war room live steps ladder brain thinking entry setup now trade countdown narration', 'nq'],
    ['today', '', 'Dashboard', 'Full NQ dashboard', 'The full NQ dashboard: today, trades, results', 'bots', 'bots', 'dashboard zenith home main board results today nq bot', ''],
    ['argus', 'argus/', 'Argus', 'What to fix', 'The hundred eyes: problems worth fixing', 'bots', 'review', 'fix problems issues bugs health lights', ''],
    ['board', 'board/', 'Board', 'Live board', 'What the bot, you and Claude know: accounts and notes', 'bots', 'bots', 'board notes accounts events claude what the bot knows', ''],
    ['aegis', 'aegis/', 'Aegis', 'Risk guard', 'Drawdown left, and when to stop for the day', 'bots', 'risk', 'drawdown risk stop loss max loss limit safe danger shield guard dll mll', ''],
    ['pnyx', 'pnyx/', 'Pnyx', 'Rules and risk calculator', 'Prop-firm rules, and stop to micros', 'bots', 'risk', 'rules calculator micros size contracts stop prop firm', ''],
    ['labyrinth', 'labyrinth/', 'Labyrinth', 'Size your eval', 'The risk maze: how big to trade', 'bots', 'risk', 'size sizing micros contracts risk eval', ''],
    ['demeter', 'demeter/', 'Demeter', 'Account health', 'Drawdown dials and payout rules', 'bots', 'risk', 'drawdown account health payout rules dials', 'aegis'],
    ['fates', 'fates/', 'Fates', 'Pass odds', 'The odds each eval passes', 'bots', 'odds', 'eval pass odds probability mffu chance', ''],
    ['moirai', 'moirai/', 'Moirai', 'Eval simulator', 'Pass, bust and time of an eval, simulated', 'bots', 'odds', 'eval simulate monte carlo pass bust', ''],
    ['odeon', 'odeon/', 'Odeon', 'Trade replays', 'Every trade, replayed in 3D', 'bots', 'trades', 'trades history replay chart past fills', ''],
    ['nemesis', 'nemesis/', 'Nemesis', 'Losing trades', 'What went wrong, trade by trade', 'bots', 'trades', 'losses losers losing mistakes what went wrong', ''],
    ['kronos', 'kronos/', 'Kronos', 'P&L calendar', 'Daily P&L, best weekday and hour', 'bots', 'trades', 'pnl calendar days money daily', ''],
    ['trading', 'trading/', 'Trading', 'Every trade', "Today's $, the calendar, the stats and the payout rules", 'bots', 'trades', 'trades trading calendar stats payout payouts rules today pnl', ''],
    ['why', 'why/', 'Why', 'Why we win and lose', 'Why our trades win and lose, per bot', 'bots', 'trades', 'why win lose losses wins reasons anatomy bot', ''],
    ['apollo', 'apollo/', 'Apollo', 'Weekly review', "The week's review and one rule for next week", 'bots', 'review', 'weekly review week lessons rule', ''],
    ['journal', 'journal/', 'Mnemosyne', 'Trade journal', 'A 10-second journal: what your habits cost', 'bots', 'review', 'journal diary notes habits mistakes log mnemosyne', ''],
    ['kratos', 'kratos/', 'Kratos', 'Discipline score', 'A 0-100 score a day: plan, stop, size, hours', 'bots', 'review', 'discipline score rules habits', ''],
    ['epilogue', 'epilogue/', 'Epilogue', 'Your week in 60 seconds', 'The Sunday review', 'bots', 'review', 'week sunday review summary', 'apollo'],
    // ---- Kalshi: the Kalshi bot, its bets and its edges
    ['kalshi', 'kalshi/', 'Kalshi', 'Kalshi bot', 'Balance, open bets and P&L, from your PC', 'kalshi', 'bot', 'kalshi bets prediction market balance', ''],
    ['dionysus', 'dionysus/', 'Dionysus', 'Kalshi desk', 'Guard, what-if and scan (suggestions only)', 'kalshi', 'edges', 'kalshi desk scan what if guard', ''],
    ['sibyl', 'sibyl/', 'Sibyl', 'Prediction-market picks', 'Edges after fees, paper picks only', 'kalshi', 'edges', 'kalshi polymarket picks edges prediction', 'dionysus'],
    // ---- My Money: cash, payouts, plans, net worth
    ['ledger', 'ledger/', 'Ledger', 'Your real money', 'Fees, payouts and net profit', 'money', 'real', 'money fees payouts profit net cost spend paid scoreboard cash net worth', ''],
    ['harmonia', 'harmonia/', 'Harmonia', 'Balance check', 'What leans on the NQ bots, and what is left', 'money', 'real', 'balance diversify income spread', ''],
    ['hermes', 'hermes/', 'Hermes', 'Money, wrapped', 'Your money story, wrapped', 'money', 'real', 'wrapped story summary year', 'ledger'],
    ['hera', 'hera/', 'Hera', '12-month money plan', 'Payouts, and what to buy next', 'money', 'plan', 'money plan payouts budget year buy next', ''],
    ['chrysos', 'chrysos/', 'Chrysos', 'Prop-firm planner', 'Fees against payouts, break-even', 'money', 'plan', 'prop firm mffu accounts fees eval cost fleet', ''],
    ['argo', 'argo/', 'Argo', 'Money goals', 'Your goals as islands, honest ETAs', 'money', 'plan', 'goals targets savings eta', ''],
    ['plutus', 'plutus/', 'Plutus', 'Accounts and payouts', 'The money plan: accounts and payouts', 'money', 'plan', 'accounts payouts plan', 'hera'],
    ['oikos', 'oikos/', 'Oikos', 'Household money', 'Leaks, tax set-aside and buckets', 'money', 'home', 'budget tax spending household bills buckets', ''],
    ['mint', 'mint/', 'Mint', 'Money machine', 'Five money streams, one honest estimate', 'money', 'ideas', 'money income earn streams estimate side', ''],
    ['mercury', 'mercury/', 'Mercury', 'Deals and codes', 'Sales, discount codes, free resets', 'money', 'ideas', 'discount coupon promo code sale deal reset price', ''],
    ['arbiter', 'arbiter/', 'Arbiter', 'Spreads and funding', 'Paper-only spreads: net yearly return', 'money', 'ideas', 'spreads funding arbitrage crypto yield', ''],
    ['agency', 'agency/', 'Agency', 'Website business', 'Your web business HQ: leads, audits, 3D demos, offers, calls', 'money', 'ideas', 'website websites web 3d site sites marketing agency web design clients client leads audit audits proposal proposals offer offers retainer care plan showcase portfolio demo demos crm pipeline calls cold call call list script side business', ''],
    ['business', 'business/', 'Business', 'All my businesses', 'Every side business: next step, money, 7-day launch', 'money', 'ideas', 'business businesses side hustle agency products gigs instagram income launch checklist next step money plan', ''],
    // (2026-11-20 night-gatefix) the iPhone widget (night-revamp-dash, widget/): last of the money rows, so each tab's best stays Ledger / Hera / Oikos / Mint
    ['widget', 'widget/', 'Widget', 'iPhone widget', 'Your accounts on the Home Screen, plus the Glance page', 'money', 'real', 'widget glance home screen scriptable iphone phone balance accounts', ''],
    // ---- Plan & Day: calendar, shifts, tasks, habits
    ['planner', 'planner/', 'Planner', 'Day and week plan', 'Sessions, shifts, tasks, habits and notes', 'plan', 'plan', 'calendar tasks todo habits schedule plan focus shift work', ''],
    ['mind', 'mind/', 'Mind', 'Your notes as a brain', 'Your vault as a living 3D brain', 'plan', 'plan', 'obsidian notes vault memory brain', ''],
    ['lyceum', 'lyceum/', 'Lyceum', 'Daily rules quiz', 'Quiz, ranks and the habits that cost money', 'plan', 'habits', 'quiz learn school rules test', ''],
    ['nike', 'nike/', 'Nike', 'Trophy hall', 'Milestones and wins from real numbers', 'plan', 'habits', 'trophies wins achievements milestones', ''],
    ['arena', 'arena/', 'Arena', 'Ranks and XP', 'XP for discipline', 'plan', 'habits', 'xp level rank game points', 'lyceum'],
    // ---- Research: backtests, edges, write-ups
    ['archive', 'archive/', 'Archive', 'Everything we tested', 'The searchable library of every test', 'research', 'library', 'research tests backtests library search experiments', ''],
    ['clio', 'clio/', 'Clio', 'Research in plain words', 'Every study, explained', 'research', 'library', 'research studies writeups explained', ''],
    ['athena', 'athena/', 'Athena', 'Strategy library', 'The strategy, the rules and a quiz', 'research', 'library', 'strategy rules lit learn library', ''],
    ['hephaestus', 'hephaestus/', 'Hephaestus', 'Tune the dials', 'Try the settings and see the result', 'research', 'search', 'tune settings dials parameters backtest', ''],
    ['prometheus', 'prometheus/', 'Prometheus', 'Strategy forge', 'Strategies tested in the forge', 'research', 'search', 'strategies forge tested', ''],
    ['tree', 'tree/', 'Daphne', 'Strategy search', 'The strategy tree search', 'research', 'search', 'strategy search tree daphne', ''],
    ['observatory', 'observatory/', 'Observatory', 'Data health', 'Data health and research evidence', 'research', 'data', 'data health evidence', ''],
    ['pinakes', 'pinakes/', 'Pinakes', 'Every data table', 'Browse and query every table OLYMPUS keeps', 'research', 'data', 'data tables database query catalogue', ''],
    // ---- Jarvis: ask anything, your AI team
    ['jarvis', 'jarvis/', 'Jarvis', 'Jarvis', 'Ask anything: your home screen and the orb', 'jarvis', 'ask', 'assistant ask voice home orb chat ai', ''],
    ['bridge', 'bridge/', 'Bridge', 'Link ChatGPT', '3 steps to link ChatGPT, and live job status', 'jarvis', 'ask', 'chatgpt gpt openai link ai jobs', ''],
    ['ergasterion', 'ergasterion/', 'Ergasterion', 'Your AI workers', 'Every AI worker, what it does and learns', 'jarvis', 'team', 'agents workers ai factory workshop floor', ''],
    ['symposium', 'symposium/', 'Symposium', 'Meet your workers', 'Everyone who works for you; talk to them', 'jarvis', 'team', 'characters people agents talk hall', 'ergasterion'],
    // ---- Worlds: the 3D places (optional)
    ['polis', 'polis/', 'Polis', 'The city', 'Every app a building under the real sky', 'worlds', 'top', 'city 3d world acropolis buildings', ''],
    ['cities', 'cities/', 'Cities', 'Cities and Hellas', 'Athens and the city islands of your research', 'worlds', 'top', 'cities hellas athens islands 3d', ''],
    ['colosseum', 'colosseum/', 'Colosseum', 'Strategy duels', 'Strategies fight on real stored numbers', 'worlds', 'top', 'duel fight strategies battle', ''],
    ['kalshicity', 'kalshicity/', 'Kalshi City', 'Kalshi City', "The Kalshi bot's edges as a night city", 'worlds', 'views', 'kalshi city 3d', ''],
    ['tyche', 'tyche/', 'Tyche', 'Fortune wheel', 'The Kalshi bets as a 3D wheel', 'worlds', 'views', 'kalshi wheel bets 3d', 'kalshicity'],
    ['mintcity', 'mintcity/', 'Mint City', 'Mint City', 'The money machines as a marble city', 'worlds', 'views', 'money city 3d', ''],
    ['datacity', 'datacity/', 'Data City', 'Data City', 'Every combo tested, as a city', 'worlds', 'views', 'data combos city 3d research', ''],
    ['atlascity', 'atlascity/', 'ATLAS City', 'ATLAS City', "ATLAS's three strategies as a city", 'worlds', 'views', 'atlas strategy city 3d', ''],
    // ---- Settings & Help: look, the PC, every app, the workshop
    ['settings', 'settings/', 'Settings', 'Settings', 'Look, voice, storage and the tour', 'settings', 'settings', 'settings theme voice sound storage tour options look', ''],
    ['pc', 'pc/', 'PC', 'Start the bot on this PC', 'The steps to start the bot on your PC', 'settings', 'settings', 'pc windows start bot ninjatrader setup install', ''],
    ['atlas', 'atlas/', 'Atlas', 'The old map of apps', 'Every OLYMPUS app by the old districts', 'settings', 'help', 'map apps list all directory', ''],
    ['gallery', 'gallery/', 'Agora Gallery', 'Agora Gallery', 'Every 3D shape on a turning pedestal', 'settings', 'workshop', 'shapes 3d gallery models', ''],
    ['agora-lab', 'olympus/agora-lab.html', 'Design Lab', 'Design Lab', 'The look every app shares', 'settings', 'workshop', 'design look lab', ''],
    ['env-lab', 'olympus/env-lab.html', 'Places Lab', 'Places Lab', 'Marble, stone, bronze, golden light', 'settings', 'workshop', 'places environment lab', ''],
    ['fx-lab', 'olympus/fx-lab.html', 'Effects Lab', 'Effects Lab', 'Every light, sky, sea, fire and burst', 'settings', 'workshop', 'effects fx lab', ''],
    ['sfx-lab', 'olympus/sfx-lab.html', 'Sound Lab', 'Sound Lab', 'Every sound, place and harp tune', 'settings', 'workshop', 'sound audio sfx lab', ''],
    ['people-lab', 'olympus/people-lab.html', 'People Lab', 'People Lab', 'Every character, faces and poses', 'settings', 'workshop', 'people characters lab', ''],
    ['polis-lab', 'olympus/polis-lab.html', 'Greek Look Kit', 'Greek Look Kit', 'Greek key, columns, pottery, coins', 'settings', 'workshop', 'greek kit polis lab', ''],
    ['polis-life-lab', 'olympus/polis-life-lab.html', 'Polis Life Lab', 'Polis Life Lab', 'People walking the city', 'settings', 'workshop', 'polis life people lab', ''],
    ['render-lab', 'olympus/render-lab.html', 'Render Lab', 'Render Lab', 'The 3D render core on test', 'settings', 'workshop', 'render 3d lab', '']
  ];
  /* the nine hubs, in the order of the home screen. q = the question the hub answers (the owner's words); legacy = the v1 district it mostly
     replaces (for a theme that still keys on the old four); see = apps filed in another hub that also belong here (shown as "In other hubs") */
  var HUBS = [
    /* night A 2026-11-16 (owner: lead with money and the two bots): Bots & Evals and My Money first, Kalshi (paused) and the 3D Worlds last */
    { id: 'bots', name: 'Bots & Evals', q: 'Are my bots on, and how is each eval doing?', line: 'Each account: drawdown, trades, pass odds', icon: 'bots', legacy: 'trading',
      sections: [['bots', 'Bots now', 'On or off, the last report, what to fix'], ['risk', 'Risk', 'Drawdown left, when to stop, how big to trade'], ['odds', 'Pass odds', 'The odds each eval passes, and how fast'],
        ['trades', 'Trades', 'Every trade, the losers, the P&L by day'], ['review', 'Review', 'The weekly review, the journal, discipline']],
      see: ['pythia', 'ledger'] },
    { id: 'money', name: 'My Money', q: 'What have I really made and spent, and what is next?', line: 'Cash, payouts, plans and net worth', icon: 'money', legacy: 'money',
      sections: [['real', 'Real money', 'Fees, payouts, net: cash only'], ['plan', 'Plan and payouts', 'The 12-month plan, prop-firm costs, goals'], ['home', 'Household', 'Bills, leaks and tax set-aside'],
        ['ideas', 'Ideas and deals', 'Side streams and discount codes (estimates, not cash)']],
      see: ['kalshi', 'mintcity'] },
    { id: 'today', name: 'Today', q: 'What is happening, and what do I do now?', line: 'Do now, the morning brief, news and the clock', icon: 'sun', legacy: 'trading',
      sections: [['now', 'Do now', 'The few things that need you today'], ['brief', 'Morning brief', 'How today looks, in one read'], ['market', 'News and market', 'News days, the clock and the market mood']],
      see: ['nq', 'aegis', 'planner'] },
    /* the Me hub (team ME1, 2026-11-14, docs/ME_HUB.md): a PAGE hub. No app tabs: hub/me.js draws 4 status tiles and the areas below, each a short
       card stack, from the PC's private me/me.json (tools/me_hub.py; the PC's own link only, empty on the public site). area = [id, title, blurb] */
    { id: 'me', name: 'Me', q: 'How am I doing — money, health, home?', line: 'Money, cards, health, home and dates, in one place', icon: 'me', legacy: 'life', page: 'me',
      words: 'me personal life private health watch apple fitness sleep steps heart hrv recovered workouts weight wifi wi-fi internet speed outage router network devices ' +
        'cards credit card utilization due bills subscriptions spending budget net worth birthday birthdays dates anniversary car oil registration insurance freedom quit job paycheck streaks',
      sections: [],
      areas: [['money', 'Money', 'Spending this month vs last, subscriptions, bills due, net worth'], ['cards', 'Cards', 'Use per card, due dates, interest if carried'],
        ['health', 'Health', 'Today, last night, the week, resting heart rate and HRV'], ['home', 'Home & WiFi', 'Internet speed, outages, devices, this PC'],
        ['freedom', 'Freedom', 'Side income against your paycheck, months to quit'], ['dates', 'Dates', 'Birthdays and important days'],
        ['car', 'Car', 'Oil change, registration, mileage'], ['streaks', 'Streaks', 'Days in a row, counted for you']],
      see: ['oikos', 'planner', 'argo'] },
    { id: 'plan', name: 'Plan & Day', q: "What is on my calendar and my list?", line: 'Calendar, shifts, tasks, habits, notes', icon: 'plan', legacy: 'life',
      sections: [['plan', 'Calendar and tasks', 'Your day, week, shifts and notes'], ['habits', 'Habits and progress', 'The daily quiz, trophies and ranks']],
      see: ['pythia', 'kratos'] },
    { id: 'jarvis', name: 'Jarvis', q: 'Ask anything. Who works for me?', line: 'Ask anything; your AI team', icon: 'jarvis', legacy: 'life',
      sections: [['ask', 'Ask', 'Jarvis, and the link to ChatGPT'], ['team', 'Your AI team', 'Every AI worker and what it learns']],
      see: ['mind'] },
    { id: 'research', name: 'Research', q: 'What have we tested, and what works?', line: 'Backtests, edges and write-ups', icon: 'research', legacy: 'trading',
      sections: [['library', 'Library', 'Every test and every study, in plain words'], ['search', 'Strategy search', 'Tune the dials, the forge, the tree'], ['data', 'Data', 'Data health and every table']],
      see: ['colosseum', 'datacity', 'atlascity'] },
    { id: 'kalshi', name: 'Kalshi', q: 'How is the Kalshi bot doing, and where is an edge?', line: 'The Kalshi bot, its bets and its edges', icon: 'kalshi', legacy: 'money',
      sections: [['bot', 'The bot', 'Balance, open bets and P&L'], ['edges', 'Edges', 'Where the bot could do better (suggestions only)']],
      see: ['kalshicity', 'tyche'] },
    { id: 'worlds', name: 'Worlds', q: 'The 3D places (optional, for fun)', line: 'The 3D city, duels and night cities', icon: 'worlds', legacy: 'worlds',
      sections: [['top', 'Most visited', 'The city, the islands, the duels'], ['views', 'Numbers as places', 'Kalshi, money, data and ATLAS as cities']],
      see: ['odeon', 'symposium'] },
    { id: 'settings', name: 'Settings & Help', q: 'How do I change the look, start the PC or find an app?', line: 'Look, the PC, every app, the workshop', icon: 'settings', legacy: 'life',
      sections: [['settings', 'Settings', 'Look, voice, storage, and the PC'], ['help', 'Help and every app', 'Every app A to Z, and the old map'], ['workshop', 'Workshop', 'Labs and test pages (for building, not daily use)']],
      see: [] }
  ];
  var apps = R.map(function (r, i) {
    return Object.freeze({ id: r[0], path: r[1], name: r[2], label: r[3], line: r[4], district: r[5], hub: r[5], section: r[6], words: r[7], fold: r[8] || '', rank: i });
  });
  var BY = {}, HB = {}, BEST = {};
  apps.forEach(function (a) { BY[a.id] = a; var k = a.hub + '/' + a.section; if (!BEST[k] && !a.fold) BEST[k] = a.id; });
  HUBS.forEach(function (h) {
    HB[h.id] = h; h.count = apps.filter(function (a) { return a.hub === h.id; }).length;
    h.size = h.page ? (h.areas || []).length + ' areas' : h.count + ' app' + (h.count === 1 ? '' : 's');   // what the home tile and Go to say under the name
    Object.freeze(h);
  });
  var DNAME = {};
  HUBS.forEach(function (h) { DNAME[h.id] = h.name.toLowerCase(); });
  /* the owner's order (2026-11-20, lead): Cities, Kalshi, the NQ bot, Jarvis first; then Planner and Business; then the rest. RETIRED apps
     (day-archive's list + Hephaestus + the city apps that live inside Cities) never show in search or A to Z; their URLs still open. */
  var FIRST = { cities: 60, kalshi: 60, nq: 60, jarvis: 60, agency: 30, business: 30, planner: 30 };
  var RETIRED = ['delphi', 'stoa', 'hestia', 'plutus', 'argo', 'mint', 'harmonia', 'kairos', 'chronos', 'lyceum', 'polis', 'atlascity',
    'gallery', 'mintcity', 'nike', 'arena', 'mind', 'symposium', 'herald', 'ergasterion', 'observatory', 'pheme', 'bridge', 'arbiter', 'hermes',
    'hephaestus', 'datacity', 'kalshicity'];
  var RET = {}; RETIRED.forEach(function (id) { RET[id] = 1; });
  function retired(id) { return !!RET[id]; }
  /* ARCHIVED (day-site5 2026-11-26, lead: "list the ones nobody opens and move them to an Archive door, no deletions"; evidence:
     research/handoff/2026-11-26/site5/ARCHIVE_LIST.md). Unlike RETIRED they do NOT redirect: the page they were folded into still links
     them and every old URL opens as before. They leave search, A to Z and the arena lists; the Archive door (hub/arena.html?a=archive)
     lists them with where their content lives now. ARCHIVE_INTO = that page. */
  var ARCHIVE_INTO = { forum: 'helios', epilogue: 'journal', apollo: 'journal', kratos: 'journal', nemesis: 'journal', labyrinth: 'pnyx', why: 'trading',
    sibyl: 'dionysus', demeter: 'aegis', athena: 'archive', colosseum: 'archive' };
  var ARCHIVED = Object.keys(ARCHIVE_INTO);
  var ARCH = {}; ARCHIVED.forEach(function (id) { ARCH[id] = 1; });
  function archived(id) { return !!ARCH[id]; }
  function hidden(id) { return !!RET[id] || !!ARCH[id]; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9&$]+/g, ' ').replace(/^\s+|\s+$/g, ''); }
  function wordStarts(text, t) { var w = text.split(' '); for (var i = 0; i < w.length; i++) if (w[i].indexOf(t) === 0) return true; return false; }
  function isBest(a) { return !!a && BEST[a.hub + '/' + a.section] === a.id; }
  /** search by name, plain label, purpose and synonyms. Every word typed must match somewhere; best first. -> [app] */
  function find(q, n) {
    var toks = toksOf(q);
    if (!toks.length) return [];
    var hits = [];
    apps.forEach(function (a0) {
      if (RET[a0.id]) return;
      var a = a0, host = ARCH[a0.id] ? BY[ARCHIVE_INTO[a0.id]] : null;   // an archived app's words still find the page that holds its content now
      if (ARCH[a0.id] && (!host || hidden(host.id))) return;
      var label = norm(a.label), name = norm(a.name), line = norm(a.line), words = norm(a.words + ' ' + a.id), score = 0;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], s = 0;
        if (label.indexOf(t) === 0 || name.indexOf(t) === 0) s = 40;
        else if (wordStarts(label, t) || wordStarts(name, t)) s = 26;
        else if (wordStarts(words, t)) s = 16;
        else if (t.length > 2 && (line.indexOf(t) >= 0 || label.indexOf(t) >= 0 || name.indexOf(t) >= 0)) s = 9;
        else if (DNAME[a.hub] && wordStarts(DNAME[a.hub], t)) s = 4;
        if (!s) return;
        score += s;
      }
      if (isBest(a)) score += 10;
      score += FIRST[a.id] || 0;
      if (a.fold) score -= 3;
      if (a.section === 'workshop') score -= 12;
      if (host) { a = host; score -= 6; }
      hits.push({ a: a, s: score });
    });
    var best = {};                  // one row per app (an archived app and its host land on the same page)
    hits = hits.filter(function (h) { var b = best[h.a.id]; if (b && b.s >= h.s) return false; if (b) b.s = -1e9; best[h.a.id] = h; return true; }).filter(function (h) { return h.s > -1e8; });
    hits.sort(function (x, y) { return y.s - x.s || x.a.rank - y.a.rank; });
    return hits.slice(0, n || 8).map(function (h) { return h.a; });
  }
  /** the hubs a search names: every word typed starts a word of the hub's name, line, question, own words or areas (the Me hub: "health", "wifi") */
  function findHubs(q) {
    var toks = toksOf(q).filter(function (t) { return t.length > 2; });
    if (!toks.length) return [];
    return HUBS.filter(function (h) {
      var text = norm([h.name, h.line, h.q, h.words || ''].concat((h.areas || []).map(function (a) { return a[1] + ' ' + a[2]; })).join(' '));
      for (var i = 0; i < toks.length; i++) if (!wordStarts(text, toks[i])) return false;
      return !!h.page;          // app hubs are found through their apps; a page hub has no app of its own to find
    });
  }
  /* NAV v3 (2026-11-15, team NAV, docs/OLYMPUS_NAV.md). Owner: "the little categories are too hard to find everything, there's gotta be a better way".
     One search for EVERYTHING: apps (find), the hub tabs ("Bots & Evals > Risk") and a few plain ACTIONS (things he does, not apps).
     ACTIONS row: [id, label, one line, path from the site root, extra search words]. Read only: none of them can trade or change a bot. */
  var ACTIONS = [
    // the owner's ten most-checked things + the manual (2026-11-20 day-manual NAV): one search hop each. A 6th column = words that never
    // trigger the row ALONE ('kalshi' alone still opens the Kalshi bot first; 'money' alone stays Mint / Ledger)
    ['act-open', 'Open trade right now', 'Is a bot in a trade: side, size, live $ (MFFU view)', 'business/mffu.html', 'open trade trades position in long short live now entry entered running atlas zlarior', 'atlas zlarior'],
    ['act-pcstatus', 'PC status: is it on?', 'When the PC last reported, each account, PC SILENT', 'hub/zeus.html', 'pc computer status on off online silent alive running report reported working bot bots up down', 'bot bots'],
    ['act-decide', 'Decide cards', 'The yes / no questions waiting for you', 'board/index.html#decide', 'decide decision decisions yes no questions approve answer waiting cards'],
    ['act-alerts', 'Phone alerts on or off', 'Allow notifications, send a test, turn off', 'jarvis/index.html#pushCard', 'alerts alert notifications notification notify push pings ping sound phone off on'],
    ['act-k8', 'Kalshi K8 today', "Today's K8 clock bets (gold, silver), paper or live", 'kalshi/index.html#k8d', 'kalshi k8 today bets bet gold silver metals clock', 'kalshi'],
    ['act-sos', 'Emergency: what to do', '10 cards, 3 steps each: PC off, stuck trade, disconnected...', 'hub/manual.html#sos', 'emergency sos panic wrong broken problem stuck disconnected disconnect error urgent ninjatrader nt'],
    ['act-kill', 'Stop everything now', 'The kill switch: flatten every account, stop the bot', 'hub/manual.html#sos-8', 'stop kill everything halt flatten close all bot bots shut off switch out', 'bot bots'],
    ['act-manual', 'Owner manual', 'Who is who, a normal day, money, every word explained', 'hub/manual.html', 'manual guide who is explain meaning means glossary words word mean define definition'],
    ['act-web', 'Website business HQ', 'Next step, pipeline, leads, audits, 3D demos, offers', 'agency/index.html#hq', 'website websites web 3d site sites marketing leads audit proposal proposals clients client agency business hq retainer'],
    ['act-setup', 'Set up your iPhone', 'Home Screen icons, the widget, notifications, Siri', 'hub/setup.html', 'setup set up iphone phone home screen icon icons install add widget notifications siri shortcuts'],
    ['act-new', "What's new", 'What changed in Olympus and the bots, newest first', 'hub/whatsnew.html', 'new changed changes change updates latest recent whats week'],
    ['act-steps', 'Your steps', 'What you still have to do, in order', 'hub/steps.html', 'steps todo to-do waiting owner list next need'],
    ['act-add', 'Add an account', 'Pick the plan, the Name, your phrase: 3 steps', 'hub/manual.html#sos-9', 'add new account accounts buy bought rapid builder eval start'],
    ['act-passed', 'My eval passed: what now', 'Upgrade at MFFU, then move the bot (4 steps)', 'hub/help.html#eval-passed', 'eval passed pass funded upgrade now'],
    ['act-restart', 'Restart the bot safely', 'Only when flat; the best time; your phrase', 'hub/help.html#restart', 'restart reboot start again bot bots'],
    ['act-update', 'Update the PC', 'It updates itself; how to do it now', 'hub/help.html#update', 'update updates upgrade new code pc version blocked'],
    ['act-holidays', 'Holidays and early closes', 'What the bot does on short days', 'hub/help.html#holidays', 'holiday holidays early close closed thanksgiving christmas new year short day'],
    ['act-bringback', 'Bring the bots back', 'The 5 steps when the PC went quiet', 'nq/index.html?howto=1', 'restart start bots off stopped quiet old offline pc fix back'],
    ['act-az', 'All apps A to Z', 'Every app in one list, with pins', 'gate/index.html#az', 'all apps list every directory a z index pin pins favourites favorites'],
    ['act-look', 'Change the look', 'Colours and style, everywhere', 'gate/index.html#lookSec', 'theme themes colour color colors dark light look style skin mode'],
    ['act-pnl', "Today's $ per account", 'Zlarior and ATLAS today, from the PC', 'hub/zeus.html', 'pnl p&l profit today money made lost up down day result zlarior atlas', 'money'],
    ['act-dd', 'Room left on each account', '$ left before each account fails (MFFU view)', 'business/mffu.html', 'drawdown room left max loss lose mll trailing floor fail blow close near zlarior atlas'],
    ['act-window', 'Next trade window', 'When the bots may trade next', 'kairos/index.html', 'window when trade next session hours open close'],
    ['act-micros', 'How many micros for a stop', 'Stop size to contracts', 'pnyx/index.html', 'micros contracts how many stop size calculator mnq'],
    ['act-payout', 'Payout: when, and how much', 'What you can ask MFFU for, and when (Payout coach)', 'business/accounts.html#coach', 'payout payouts paid withdraw cash coach request next when'],
    ['act-paid', 'Money in and out so far', 'What came in, what went out', 'ledger/index.html', 'payouts paid fees cost profit cash spent so far history'],
    ['act-pc', 'Start the bot on the PC', 'The steps on your Windows PC', 'pc/index.html', 'start pc windows ninjatrader setup install launch'],
    ['act-workshop', 'Workshop (labs)', 'Test pages for building', 'hub/index.html?h=settings&t=workshop', 'labs lab workshop test build'],
    // the four doors' pages that are not apps (2026-11-18, olympus/doors.js): so the Home search finds them by plain words
    // (2026-11-18 night-gate) the doors row no longer answers 'money' / 'kalshi' / 'trading' / 'zeus': those words open their own apps first (Mint, Ledger, the Kalshi bot)
    ['act-zeus', 'ZEUS', 'Zlarior + ATLAS: live accounts, today, the big buttons', 'hub/zeus.html', 'zeus trading engine system lit zlarior atlas'],
    ['act-doors', 'The four doors', 'ZEUS Trading, Money, Kalshi, More', 'hub/doors.html', 'doors door four organized organised everything'],
    ['act-help', 'How do I...?', 'Plain steps: payout, taxes, restart, pause', 'hub/help.html', 'help how do i faq guide lost stuck steps questions'],
    ['act-accounts', 'My accounts', 'Every eval and funded account on one page', 'business/accounts.html', 'accounts account evals eval funded mffu builder 50k 25k rapid balance pass'],
    ['act-taxes', 'Taxes', 'The 30% tax pot and the next due date', 'business/taxes.html', 'taxes tax irs estimated quarterly pot set aside save owe'],
    ['act-fleet', 'Fleet plan', 'All accounts, 6 months, what to buy next', 'business/plan.html', 'fleet plan accounts buy rapid builder months monte carlo'],
    ['act-brain', "The bot's brain", 'What the bot is thinking right now', 'index.html#/brain', 'brain thinking setups levels sweep why waiting bot'],
    ['act-payrules', 'Payout rules check', 'Can I ask for a payout yet', 'trading/index.html#rulesCard', 'payout payouts rules request withdraw consistency best day']
  ].map(function (r) { return Object.freeze({ kind: 'action', id: r[0], label: r[1], line: r[2], path: r[3], words: r[4], notAlone: r[5] || '' }); });
  function allWords(text, toks, min) { for (var i = 0; i < toks.length; i++) { if (toks[i].length < (min || 1) || !wordStarts(text, toks[i])) return false; } return toks.length > 0; }
  /* plain questions (2026-11-20 day-manual NAV): "how much can I lose", "is atlas in a trade", "stop the bot". The little words are dropped
     (only when something is left), and a few owner words count as their app words (SYN). */
  var STOP = ' a an the i im me my mine is are am was were be been do does did can could should would will how much what whats where when which who why'
    + ' to of for in at it its this that there with and or so please show tell see check any you your we our us still now right just get got have has go turn ';
  var SYN = { lose: 'loss drawdown room', losing: 'loss drawdown room', lost: 'loss', loss: 'drawdown room', left: 'room', blow: 'fail', blown: 'fail', failing: 'fail', failed: 'fail',
    position: 'trade', positions: 'trade', notifications: 'alerts', notification: 'alerts', pings: 'alerts', push: 'alerts', computer: 'pc', pcs: 'pc',
    owe: 'taxes', tax: 'taxes', irs: 'taxes', emergency: 'sos', panic: 'sos', broken: 'sos', wrong: 'sos', withdraw: 'payout', cashout: 'payout',
    paid: 'payout', money: 'pnl', made: 'pnl', make: 'pnl', earn: 'pnl', earned: 'pnl', decisions: 'decide', approve: 'decide', metals: 'k8', gold: 'k8', silver: 'k8', glossary: 'manual', meaning: 'manual' };
  function toksOf(q) {
    var all = norm(q).split(' ').filter(function (t) { return t.length > 0; });
    var kept = all.filter(function (t) { return STOP.indexOf(' ' + t + ' ') < 0; });
    return kept.length ? kept : all;
  }
  function tokIn(text, t) {
    if (wordStarts(text, t)) return true;
    var alt = SYN[t]; if (!alt) return false;
    alt = alt.split(' '); for (var i = 0; i < alt.length; i++) if (wordStarts(text, alt[i])) return true;
    return false;
  }
  /** the plain actions a search names: every (non-little) word starts a word of the label or its words (or its SYN), best first */
  function findActions(q, n) {
    var toks = toksOf(q); if (!toks.length) return [];
    var hits = [];
    ACTIONS.forEach(function (a, i) {
      var label = norm(a.label), text = norm(a.label + ' ' + a.words), score = 0;
      for (var k = 0; k < toks.length; k++) {
        var t = toks[k];
        if (!tokIn(text, t)) return;
        score += label.indexOf(t) === 0 ? 6 : wordStarts(label, t) ? 4 : wordStarts(text, t) ? 2 : 1;
      }
      if (a.notAlone && toks.every(function (t) { return (' ' + a.notAlone + ' ').indexOf(' ' + t + ' ') >= 0; })) return;
      hits.push({ a: a, s: score + toks.length * 3, i: i });
    });
    hits.sort(function (x, y) { return y.s - x.s || x.i - y.i; });
    return hits.slice(0, n || 3).map(function (h) { return h.a; });
  }
  /** the hub TABS a search names ("risk" -> Bots & Evals > Risk): every word starts a word of the hub name, the tab's title or its blurb */
  function findTabs(q, n) {
    var toks = toksOf(q), out = []; if (!toks.length) return out;
    HUBS.forEach(function (h) {
      h.sections.forEach(function (s) {
        if (allWords(norm(h.name + ' ' + s[1] + ' ' + s[2]), toks, 2)) out.push({ kind: 'tab', id: h.id + '/' + s[0], hub: h.id, label: h.name + ' › ' + s[1], line: s[2], path: 'hub/index.html?h=' + h.id + '&t=' + s[0] });
      });
    });
    return out.slice(0, n || 4);
  }
  /** one search for everything: { hubs: [page hub], actions: [action], apps: [app], tabs: [tab] } (each list already short) */
  /* "what does DLL mean", "what is room": the word's line in the Owner manual (hub/manual.html#g-...) comes first */
  var GLOSS = { room: 'room', drawdown: 'dd', dd: 'dd', mll: 'dd', floor: 'floor', dll: 'dll', eod: 'eod', limit: 'limit0', r: 'r', pf: 'pf', twin: 'twin',
    edge: 'edge', circuit: 'cb', breaker: 'cb', sweep: 'sweep', mnq: 'mnq', micro: 'mnq', micros: 'mnq', flat: 'flat', armed: 'armed', arm: 'armed',
    paper: 'paper', sim: 'paper', silent: 'silent', eval: 'eval', funded: 'eval', pass: 'pass' };
  var ASK = ' mean means meaning explain define definition whats what ';
  function glossAction(q) {
    var w = norm(q).split(' '), ask = false, term = '';
    for (var i = 0; i < w.length; i++) { if (ASK.indexOf(' ' + w[i] + ' ') >= 0) ask = true; else if (!term && GLOSS[w[i]]) term = w[i]; }
    if (!ask || !term) return null;
    var up = term.length <= 3 ? term.toUpperCase() : term;
    return Object.freeze({ kind: 'action', id: 'act-word', label: 'What "' + up + '" means', line: 'One plain line in the Owner manual', path: 'hub/manual.html#g-' + GLOSS[term], words: term, notAlone: '' });
  }
  function findAll(q, n) {
    var r = { hubs: findHubs(q), actions: findActions(q, 3), apps: find(q, n || 8), tabs: findTabs(q, 4) }, gw = glossAction(q);
    if (gw) { r.actions = [gw].concat(r.actions).slice(0, 3); return r; }
    // a plain action whose own NAME holds every word ("my steps" -> Your steps) beats a page hub found only through its areas (Me: health steps)
    if (r.hubs.length && r.actions.length) {
      var lab = norm(r.actions[0].label), tk = toksOf(q);
      if (tk.every(function (t) { return wordStarts(lab, t); })) r.hubs = [];
    }
    if (r.hubs.length || r.actions.length || r.apps.length || r.tabs.length) return r;
    // nothing for every word: keep the words something knows ("how do I see my room left on zlarior blah" -> room left zlarior)
    var known = toksOf(q).filter(function (t) { return findActions(t, 1).length || find(t, 1).length; });
    if (!known.length || known.length === toksOf(q).length) return r;
    var k = known.join(' ');
    return { hubs: findHubs(k), actions: findActions(k, 3), apps: find(k, n || 8), tabs: findTabs(k, 4), partial: k };
  }
  /** every app A to Z by its plain label (the Workshop labs at the end) */
  function az() {
    return apps.filter(function (a) { return !hidden(a.id); }).sort(function (x, y) {
      var wx = x.section === 'workshop' ? 1 : 0, wy = y.section === 'workshop' ? 1 : 0;
      return wx - wy || (norm(x.label) < norm(y.label) ? -1 : norm(x.label) > norm(y.label) ? 1 : 0);
    });
  }
  /* the six he uses most, one tap from the home (owner: Zlarior / ATLAS status, money, today): [app id, short title] */
  var QUICK = [['nq', 'Zlarior · ATLAS'], ['compass', 'Today'], ['ledger', 'Money'], ['aegis', 'Drawdown'], ['planner', 'My day'], ['kalshi', 'Kalshi']];
  function byId(id) { return BY[id] || null; }
  function hubOf(id) { var a = BY[id]; return a ? HB[a.hub] : null; }      // the hub an APP lives in
  function hub(id) { return HB[id] || null; }                               // a hub by its own id
  /** one hub, laid out: [{ id, title, blurb, best, peers: [app], folded: [app] }] (best = the section's best version; folded = its duplicates) */
  function layout(hid) {
    var h = HB[hid]; if (!h) return [];
    return h.sections.map(function (s) {
      var list = apps.filter(function (a) { return a.hub === hid && a.section === s[0]; });
      var best = BY[BEST[hid + '/' + s[0]]] || list[0] || null;
      return { id: s[0], title: s[1], blurb: s[2], best: best, peers: list.filter(function (a) { return a !== best && !a.fold; }), folded: list.filter(function (a) { return !!a.fold; }) };
    });
  }
  /** where an app sits: the hub page link (relative to the site root) and the words of the breadcrumb */
  function crumbOf(id) {
    var a = BY[id], h = a && HB[a.hub]; if (!h) return null;
    var sec = null; for (var i = 0; i < h.sections.length; i++) if (h.sections[i][0] === a.section) sec = h.sections[i];
    return { hub: h.id, hubName: h.name, section: a.section, sectionName: sec ? sec[1] : '', path: 'hub/index.html?h=' + h.id + '&t=' + a.section, app: a.label };
  }
  /* ORGANIZE (day-a11y 2026-11-21, owner: "more organized"; docs/OLYMPUS_MAP.md): the SIX ARENAS of the Home + Everything else are the ONE
     top level. Each arena = its front page (the app the Home tile opens) + the hubs whose apps it holds (an app may be moved with apps:/not:).
     The breadcrumb on every page is Home > arena > app (gate-nav.js), and hub/arena.html?a=<id> lists an arena's apps grouped by section.
     RETIRED apps redirect to REPLACE[id] (gate-nav.js; ?stay=1 keeps the old page). FACTS = the one page that owns each fact; the pages that
     also show it get a small "the one place: X" link (gate-nav.js). */
  var ARENAS = [   // 2026-11-22 (owner: "6 main dashboards"): the Home's tiles in his order, then Everything else (= More)
    { id: 'nq', name: 'NQ Bot', front: 'nq', line: 'ZEUS: the accounts, the trades, the brain', hubs: ['bots', 'today'], apps: ['today'], not: ['inbox', 'compass', 'stoa', 'hestia', 'helios', 'herald'] },
    { id: 'jarvis', name: 'Jarvis', front: 'jarvis', line: 'Ask anything; today at a glance; your AI team', hubs: ['jarvis', 'me'], apps: ['inbox', 'compass', 'stoa', 'hestia', 'helios', 'herald'] },
    { id: 'agency', name: 'Websites', front: 'agency', line: 'The website business: leads, the site factory, the caller portal', hubs: [], apps: ['agency'] },
    { id: 'data', name: 'Data City', front: 'cities', frontPath: 'cities/world/index.html', line: 'Every idea tested as a city, and the Research hub', hubs: ['worlds', 'research'], not: ['kalshicity', 'tyche'] },
    { id: 'money', name: 'Money', front: 'business', frontPath: 'business/mffu.html', line: 'My MFFU Accounts, payouts, decisions, taxes and the money plan', hubs: ['money', 'plan'], not: ['agency'] },
    { id: 'kalshi', name: 'Kalshi', front: 'kalshi', line: 'The Kalshi bot, its bets and its edges', hubs: ['kalshi'], apps: ['kalshicity', 'tyche'] },
    { id: 'else', name: 'Everything else', front: '', line: 'Settings, the PC, help and the workshop', hubs: ['settings'] }
  ];
  var AR = {}, ARN = {};
  ARENAS.forEach(function (x) { ARN[x.id] = x; });
  apps.forEach(function (a) {
    for (var i = 0; i < ARENAS.length; i++) {
      var x = ARENAS[i];
      if ((x.apps || []).indexOf(a.id) >= 0) { AR[a.id] = x.id; return; }
    }
    for (var j = 0; j < ARENAS.length; j++) {
      var y = ARENAS[j];
      if (y.hubs.indexOf(a.hub) >= 0 && (y.not || []).indexOf(a.id) < 0) { AR[a.id] = y.id; return; }
    }
    AR[a.id] = 'else';
  });
  ARENAS.forEach(function (x) { x.count = apps.filter(function (a) { return AR[a.id] === x.id && !hidden(a.id); }).length; Object.freeze(x); });
  /* the ARCHIVE door: not one of the Home's arenas (C.arenas stays the 6 + Everything else); C.arena('archive') draws it on hub/arena.html */
  var ARCHIVE_DOOR = Object.freeze({ id: 'archive', name: 'Archive', front: '', door: true, hubs: [],
    line: 'Old, duplicate and retired apps: every page still opens, nothing is deleted', count: ARCHIVED.length + RETIRED.length });
  /* each retired app opens the page that replaced it (its 'folded into' app when that one is live, else the named one) */
  var REPLACE = { delphi: 'helios', stoa: 'compass', hestia: 'compass', plutus: 'hera', argo: 'hera', mint: 'business', harmonia: 'ledger', kairos: 'nq',
    chronos: 'nq', lyceum: 'planner', polis: 'cities', atlascity: 'cities', gallery: 'settings', mintcity: 'cities', nike: 'planner', arena: 'planner',
    mind: 'jarvis', symposium: 'jarvis', herald: 'helios', ergasterion: 'jarvis', observatory: 'archive', pheme: 'pythia', bridge: 'jarvis', arbiter: 'business',
    hermes: 'ledger', hephaestus: 'archive', datacity: 'cities', kalshicity: 'dionysus' };
  /* one place per fact (owner: "more organized"; lead 2026-11-21): fact -> [owner app, the anchor on it, the words, the apps that also show it] */
  var FACTS = {   // all three live on My MFFU Accounts (business/mffu.html: every account the way MFFU shows it, the payout tracker, the 7-day clocks)
    accounts: { app: 'business', path: 'business/mffu.html', name: 'My MFFU Accounts', label: 'Accounts', also: ['board', 'nq', 'aegis', 'demeter', 'widget', 'trading', 'today', 'ledger', 'hera', 'fates'] },
    payout: { app: 'business', path: 'business/mffu.html', name: 'My MFFU Accounts', label: 'Payouts', also: ['board', 'nq', 'trading', 'hera', 'demeter', 'widget', 'ledger', 'chrysos'] },
    clocks: { app: 'business', path: 'business/mffu.html', name: 'My MFFU Accounts', label: '7-day clocks', also: ['board', 'nq', 'aegis'] }
  };
  function arenaOf(id) { return ARN[AR[id]] || null; }
  function arena(id) { return id === 'archive' ? ARCHIVE_DOOR : ARN[id] || null; }
  function replacementOf(id) { var r = RET[id] ? REPLACE[id] : ''; return r && BY[r] && !RET[r] ? BY[r] : null; }
  function factsOn(id) { var out = []; for (var k in FACTS) if (Object.prototype.hasOwnProperty.call(FACTS, k) && FACTS[k].also.indexOf(id) >= 0) out.push({ fact: k, label: FACTS[k].label, app: BY[FACTS[k].app], path: FACTS[k].path, name: FACTS[k].name }); return out; }
  function arenaCrumb(id) {
    var x = arenaOf(id), a = BY[id]; if (!x || !a) return null;
    return { arena: x.id, arenaName: x.name, path: 'hub/arena.html?a=' + x.id, app: a.label, front: x.front === id };
  }
  function archiveLayout() {      // the Archive door: folded-in duplicates, apps nobody opens, then the retired ones (each with where it lives now)
    var into = function (a, to, stay) { var t = BY[to]; return Object.freeze({ id: a.id, path: a.path, name: a.name, label: a.label, line: a.line, hub: a.hub, section: a.section,
      words: a.words, fold: a.fold, rank: a.rank, stay: !!stay, instead: t ? { id: t.id, path: t.path, label: t.label } : null }); };
    var dup = ARCHIVED.filter(function (id) { return BY[id] && ARCHIVE_INTO[id] !== 'archive'; }).map(function (id) { return into(BY[id], ARCHIVE_INTO[id]); });
    var unused = ARCHIVED.filter(function (id) { return BY[id] && ARCHIVE_INTO[id] === 'archive'; }).map(function (id) { return into(BY[id], ARCHIVE_INTO[id]); });
    var ret = RETIRED.filter(function (id) { return BY[id]; }).map(function (id) { var r = replacementOf(id); return into(BY[id], r ? r.id : '', true); });
    return [{ hub: 'archive', section: 'folded', name: 'Folded into another page', line: 'Their content lives on the page named under each; the old page still opens', apps: dup },
      { hub: 'archive', section: 'unused', name: 'Nobody opens these', line: 'No live page links them; the research they show is in Everything we tested', apps: unused },
      { hub: 'archive', section: 'retired', name: 'Retired', line: 'An old link opens the replacement; these open the old page itself', apps: ret }].filter(function (x) { return x.apps.length; });
  }
  function arenaLayout(xid) {   // [{hub, section, name, apps:[app]}] for one arena, live apps only, in the hubs' own order
    if (xid === 'archive') return archiveLayout();
    var x = ARN[xid]; if (!x) return [];
    var out = [], hubs = HUBS.filter(function (h) { return apps.some(function (a) { return AR[a.id] === xid && a.hub === h.id; }); });
    hubs.forEach(function (h) {
      (h.sections.length ? h.sections : [['', h.name, h.line]]).forEach(function (sec) {
        var list = apps.filter(function (a) { return AR[a.id] === xid && a.hub === h.id && (!sec[0] || a.section === sec[0]) && !hidden(a.id); });
        if (list.length) out.push({ hub: h.id, section: sec[0], name: sec[1], line: sec[2], apps: list });
      });
    });
    return out;
  }
  var out = Object.freeze({ v: 3, arenas: ARENAS, arena: arena, ARCHIVE_DOOR: ARCHIVE_DOOR, ARCHIVED: ARCHIVED, ARCHIVE_INTO: ARCHIVE_INTO, archived: archived, hidden: hidden, arenaOf: arenaOf, arenaCrumb: arenaCrumb, arenaLayout: arenaLayout, REPLACE: REPLACE,
    replacementOf: replacementOf, FACTS: FACTS, factsOn: factsOn, apps: Object.freeze(apps), districts: HUBS, hubs: HUBS, start: ['nq', 'today', 'jarvis'], actions: Object.freeze(ACTIONS), quick: QUICK,
    find: find, retired: retired, RETIRED: RETIRED, FIRST: FIRST, findHubs: findHubs, findActions: findActions, findTabs: findTabs, findAll: findAll, az: az, byId: byId, norm: norm, hub: hub, hubOf: hubOf, layout: layout, crumbOf: crumbOf, isBest: isBest, mixOf: function (id) { var h = hubOf(id); return h ? h.id : ''; } });
  g.OLYMPUS_GATE = out;
  if (typeof module !== 'undefined' && module.exports) module.exports = out;
}(typeof window !== 'undefined' ? window : globalThis));
