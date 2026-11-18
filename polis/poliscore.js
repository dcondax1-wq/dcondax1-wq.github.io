/* POLIS core (2026-11-11): the pure maths of the Polis page. ES5, no document / browser globals / fetch / storage; node-tested (tests/test_polis_page.py).
 * A plain script in the page (self.POLIS_CORE) and a CommonJS module in node.
 *   fresh(card, nowS)                 0..1: how fresh an app's published status card (jarvis.json) is; 0 = not fresh (demo / off cards never glow)
 *   ships(home, kalshi, nowS, fixture) the four bots as ships: in port (off / silent), under sail (running), returning with cargo (traded today, $ on board)
 *   treasury(harbour)                 today's $ over the ships with a real report today, and whether it is up
 *   record(home, kalshi)              true when today is the best day in the published history (the shooting star)
 *   motions(home, queue, fixture)     the assembly board: the Mind's proposals (numbers kept) and the matters it raised
 *   citizens(people)                  the rolls: name, role, deme
 *   money(v) / ago(s) / skyWords(phase, nyTime)  plain words
 */
(function (root) {
  'use strict';
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function obj(x) { return isObj(x) ? x : {}; }
  function num(x) { if (x === null || x === undefined || x === '' || typeof x === 'boolean') return null; var v = +x; return isFinite(v) ? v : null; }
  function str(x, n) { var s = x == null ? '' : String(x).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim(); return n && s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function first() { for (var i = 0; i < arguments.length; i++) { var v = num(arguments[i]); if (v !== null) return v; } return null; }
  function money(v) {
    var n = num(v); if (n === null) return '$0';
    var a = Math.abs(n), s = a >= 1000 ? Math.round(a).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : (Math.round(a * 100) / 100).toFixed(a % 1 ? 2 : 0);
    return (n < -0.004 ? '-$' : n > 0.004 ? '+$' : '$') + s;
  }
  function ago(sec) {
    var s = num(sec); if (s === null || s < 0) return 'just now';
    if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 172800) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' days ago';
  }

  // ------------------------------------------------------------------------------------------------ fresh news (the glow)
  var FRESH_S = 86400;   // a card published in the last 24 hours counts as fresh news
  function fresh(card, nowS) {
    var c = obj(card), t = num(c.t), lvl = obj(c.status).level;
    if (t === null || t <= 0 || lvl === 'off' || ['ok', 'warn', 'bad'].indexOf(lvl) < 0) return 0;
    var age = Math.max(0, (num(nowS) || 0) - t);
    if (age > FRESH_S) return 0;
    return Math.round((1 - 0.6 * age / FRESH_S) * 100) / 100;
  }

  // ------------------------------------------------------------------------------------------------ the harbour of the bots
  var BOTS = [
    { key: 'lit', name: 'LIT', who: 'Zlarior 50K', mark: 'Λ', colour: '#c8a24a', app: 'nq' },
    { key: 'atlas', name: 'ATLAS', who: 'ATLAS 25K', mark: 'A', colour: '#4b7a99', app: 'nq' },
    { key: 'blitz', name: 'BLITZ', who: 'BLITZ 25K', mark: 'Β', colour: '#c96a4a', app: 'nq' },
    { key: 'kalshi', name: 'Kalshi', who: 'the Kalshi bot', mark: 'K', colour: '#7f8a52', app: 'kalshi' }
  ];
  var LIVE_S = 1200, QUIET_S = 7200;   // a report in the last 20 minutes = live; older than 2 hours = the ship stays in port
  function report(key, home, kalshi) {
    var h = obj(home), live = obj(h.live), pc = obj(live.pc), board = obj(h.board);
    var running = typeof pc.running === 'boolean' ? pc.running : typeof board.running === 'boolean' ? board.running : null;
    if (key === 'lit') return { t: first(pc.t, board.data_t, live.t), running: running, today: first(obj(board.lit).today_pnl, obj(obj(board.lit).eval).today), has: isObj(board.lit) || isObj(pc.lit) || num(pc.t) !== null };
    if (key === 'atlas') return { t: first(obj(pc.second).t, pc.t, obj(h.second).pc_t, board.data_t), running: running, today: first(obj(board.atlas).today_pnl, obj(obj(obj(h.second).account_b).eval).today), has: isObj(board.atlas) || isObj(h.second) };
    if (key === 'blitz') { var bl = obj(pc.blitz); return { t: first(bl.t, isObj(pc.blitz) ? pc.t : null), running: typeof bl.running === 'boolean' ? bl.running : isObj(pc.blitz) ? running : null, today: first(obj(bl.eval).today, bl.today_pnl), has: isObj(pc.blitz) }; }
    var k = obj(kalshi); return { t: num(k.t), running: typeof k.running === 'boolean' ? k.running : null, today: num(k.today_pnl), has: isObj(kalshi) && num(k.t) !== null };
  }
  function shipFrom(P, R, nowS) {
    var age = R.t === null ? null : Math.max(0, nowS - R.t), today = R.today === null ? 0 : Math.round(R.today * 100) / 100, s;
    if (!R.has || R.t === null) s = { state: 'port', why: 'No report from it yet.' };
    else if (age > QUIET_S) s = { state: 'port', why: 'Last report ' + ago(age) + ': in port until it reports again.' };
    else if (R.running === false) s = { state: 'port', why: 'Stopped (reported ' + ago(age) + ').' };
    else if (Math.abs(today) >= 1) s = { state: 'returning', why: (today >= 0 ? 'Back with ' : 'Back with a lighter hold: ') + money(today) + ' today (reported ' + ago(age) + ').' };
    else s = { state: 'sail', why: 'Running, no closed trade today yet (reported ' + ago(age) + ').' };
    var words = { port: 'In port', sail: 'Under sail', returning: 'Returning with cargo' }[s.state];
    return { key: P.key, name: P.name, who: P.who, mark: P.mark, colour: P.colour, app: P.app, state: s.state, words: words, why: s.why, usd: s.state === 'returning' ? today : 0, todayKnown: R.today !== null && age !== null && age <= QUIET_S,
      today: today, age: age, label: P.name + ' · ' + (s.state === 'returning' ? money(today) : words.toLowerCase()) };
  }
  function ships(home, kalshi, nowS, fixture) {
    var any = isObj(home) || (isObj(kalshi) && num(obj(kalshi).t) !== null);
    if (!any) {   // nothing published on this site: the DEMO harbour from the fixture (marked demo on the page)
      var fx = obj(fixture), list = Array.isArray(fx.ships) ? fx.ships : [], out = [];
      for (var i = 0; i < BOTS.length; i++) {
        var f = null; for (var j = 0; j < list.length; j++) if (isObj(list[j]) && list[j].key === BOTS[i].key) f = list[j];
        f = obj(f); out.push(shipFrom(BOTS[i], { t: nowS - (num(f.age_s) || 300), running: f.running !== false, today: num(f.today), has: !!f.key }, nowS));
      }
      return { demo: true, ships: out };
    }
    return { demo: false, ships: BOTS.map(function (P) { return shipFrom(P, report(P.key, home, kalshi), nowS); }) };
  }
  function treasury(harbour) {
    var t = 0, n = 0, list = obj(harbour).ships || [];
    for (var i = 0; i < list.length; i++) if (list[i].todayKnown) { t += list[i].today; n++; }
    t = Math.round(t * 100) / 100;
    return { today: t, n: n, up: n > 0 && t > 0.5, words: n ? (t > 0.5 ? 'The treasury takes in ' + money(t) + ' today.' : t < -0.5 ? 'The treasury pays out ' + money(t) + ' today.' : 'The treasury is even today.') : 'No bot has reported today.' };
  }
  /** a new record: today's $ is above every earlier day in the published history (the Kalshi feed's days, the bots' closed trades) */
  function record(home, kalshi, nowS) {
    var k = obj(kalshi), days = Array.isArray(k.days) ? k.days : [], today = num(k.today_pnl), best = null, d;
    if (today !== null && today > 0 && days.length >= 5) {
      for (var i = 0; i < days.length - 1; i++) { d = Array.isArray(days[i]) ? num(days[i][1]) : isObj(days[i]) ? num(days[i].pnl) : null; if (d !== null && (best === null || d > best)) best = d; }
      if (best !== null && today > best) return { on: true, what: 'Kalshi: best day so far, ' + money(today) };
    }
    var tr = Array.isArray(obj(obj(home).board).trades) ? home.board.trades : [], by = {}, keys = [];
    for (var j = 0; j < tr.length; j++) { var x = obj(tr[j]), day = str(x.day, 10), u = num(x.usd); if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || u === null || x.open === true) continue; if (!(day in by)) { by[day] = 0; keys.push(day); } by[day] += u; }
    keys.sort();
    if (keys.length >= 5) {
      var last = keys[keys.length - 1], lastV = by[last], prev = null;
      for (j = 0; j < keys.length - 1; j++) if (prev === null || by[keys[j]] > prev) prev = by[keys[j]];
      var ageOk = nowS == null || Math.abs(Date.parse(last + 'T20:00:00Z') / 1000 - nowS) < 36 * 3600;
      if (lastV > 0 && prev !== null && lastV > prev && ageOk) return { on: true, what: 'The bots: best day so far, ' + money(lastV) };
    }
    return { on: false, what: '' };
  }

  // ------------------------------------------------------------------------------------------------ the assembly (ekklesia)
  var STONE = { candidate: { stone: 'white', words: 'Ready for your vote' }, testing: { stone: 'grey', words: 'Still being tested' }, rejected: { stone: 'black', words: 'Rejected by the numbers' } };
  function motions(home, queue, fixture) {
    var h = obj(home), mind = isObj(obj(obj(h.live).pc).mind) ? h.live.pc.mind : isObj(h.mind) ? h.mind : null;
    var props = mind && Array.isArray(mind.proposals) ? mind.proposals : [], out = [], src = 'home.json (the Mind)';
    for (var i = 0; i < props.length && out.length < 6; i++) {
      var p = obj(props[i]), ev = obj(p.evidence), st = STONE[p.status] ? p.status : 'testing';
      if (!str(p.idea)) continue;
      out.push({ id: str(p.id, 60) || 'm' + i, title: str(p.idea, 140), bot: str(p.bot, 12), status: st, stone: STONE[st].stone, verdict: STONE[st].words, change: str(p.change, 220),
        lines: [str(ev.h2, 160), str(ev.h1, 160), str(ev.r2125, 160)].filter(Boolean), usd_month: num(ev.usd_month) });
    }
    var q = obj(obj(queue).mind), obs = Array.isArray(q.observations) ? q.observations : [], raised = [];
    for (var j = 0; j < obs.length && raised.length < 5; j++) { var o = obj(obs[j]); if (str(o.text)) raised.push({ text: str(o.text, 200), bot: str(o.bot, 12), score: num(o.score) }); }
    var demo = false;
    if (!out.length && !raised.length) { var fx = obj(fixture); demo = true; src = 'fixture.json (DEMO)'; return { demo: true, src: src, motions: (Array.isArray(fx.motions) ? fx.motions : []).slice(0, 4), raised: [], date: '' }; }
    // open motions first (candidate, testing), then the rejected ones
    var order = { candidate: 0, testing: 1, rejected: 2 }; out.sort(function (a, b) { return order[a.status] - order[b.status]; });
    return { demo: demo, src: out.length ? src : 'ergasterion/queue.json (the Mind)', motions: out, raised: raised, date: str(q.date, 10), tested: num(q.tested) };
  }

  // ------------------------------------------------------------------------------------------------ the citizens' rolls
  var DEMES = { trading: ['Akropolis', 'the bots'], money: ['Peiraieus', 'the harbour of money'], market: ['Agora', 'the market'], research: ['Akademeia', 'the research'], life: ['Kepoi', 'the gardens'],
    command: ['Prytaneion', 'the command'], archive: ['Kerameikos', 'the stored results'], jarvis: ['Kolonos', 'Jarvis'], factory: ['Melite', 'the workshop'], design: ['Kerameis', 'the potters (design)'],
    data: ['Skambonidai', 'the data'], quality: ['Kollytos', 'the fixers'], arena: ['Kydathenaion', 'the arena'], cities: ['Koile', 'the cities'] };
  var KIND = { scanner: 'Money scanner', bot: 'Trading bot (paper)', mind: 'Thinker', keeper: 'District keeper', builder: 'Builder', champion: 'Stored result', villager: 'Villager' };
  function citizens(people) {
    var p = obj(people), list = Array.isArray(p.people) ? p.people : [], out = [];
    for (var i = 0; i < list.length; i++) {
      var x = obj(list[i]); if (!str(x.name)) continue;
      var d = DEMES[x.area] || ['Astu', 'the town'];
      out.push({ id: str(x.id, 60), name: str(x.name, 32), role: str(x.title, 90) || KIND[x.kind] || 'Citizen', kind: KIND[x.kind] || 'Citizen', deme: d[0], demeWords: d[1], meaning: str(x.meaning, 40), app: /^[a-z0-9]+$/.test(String(x.app || '')) ? x.app : '' });
    }
    var rank = { bot: 0, mind: 1, scanner: 2, keeper: 3, builder: 4, champion: 5 };
    out.sort(function (a, b) { var ka = rank[(a.id.split(':')[0] === 'mind' ? 'mind' : a.id.split(':')[0])], kb = rank[(b.id.split(':')[0] === 'mind' ? 'mind' : b.id.split(':')[0])]; return (ka == null ? 9 : ka) - (kb == null ? 9 : kb); });
    return { n: out.length, asof: str(p.asof, 10), list: out };
  }

  // ------------------------------------------------------------------------------------------------ words for the sky
  var PHASE_WORDS = { dawn: 'Dawn over the Acropolis', day: 'Daylight over the Acropolis', dusk: 'Dusk over the Acropolis', night: 'Night over the Acropolis' };
  function skyWords(phase, nyTime) { return (PHASE_WORDS[phase] || 'The Acropolis') + (nyTime ? ' · ' + nyTime + ' in New York' : ''); }
  var WX = { clear: { cloud: 0, rain: 0, fog: 0 }, cloud: { cloud: 0.7, rain: 0, fog: 0.1 }, rain: { cloud: 0.9, rain: 0.8, fog: 0.15 }, fog: { cloud: 0.4, rain: 0, fog: 0.75 } };
  /** sky.json (optional, published by a build): {v: 1, t, cloud 0..1, rain 0..1, fog 0..1, text}; ?wx= wins; else a clear sky */
  function weather(sky, q, nowS) {
    if (q && WX[q]) return { cloud: WX[q].cloud, rain: WX[q].rain, fog: WX[q].fog, src: '?wx=' + q, text: q };
    var s = obj(sky), t = num(s.t);
    if (t !== null && (nowS == null || nowS - t < 6 * 3600)) return { cloud: Math.max(0, Math.min(1, num(s.cloud) || 0)), rain: Math.max(0, Math.min(1, num(s.rain) || 0)), fog: Math.max(0, Math.min(1, num(s.fog) || 0)), src: 'sky.json', text: str(s.text, 60) };
    return { cloud: 0.12, rain: 0, fog: 0, src: 'none', text: '' };
  }

  var API = { fresh: fresh, ships: ships, treasury: treasury, record: record, motions: motions, citizens: citizens, money: money, ago: ago, skyWords: skyWords, weather: weather, BOTS: BOTS, DEMES: DEMES, FRESH_S: FRESH_S, str: str, num: num };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.POLIS_CORE = API;
})(typeof self !== 'undefined' ? self : this);
