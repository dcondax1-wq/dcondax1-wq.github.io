// Jarvis nudges (2026-11-10, JARVIS BRAIN): the proactive suggestions engine. A pure function from the published data to at most
// three short "nudges" the Jarvis home screen can show. One ES module, no DOM, no network. It only SUGGESTS; nothing here acts.
//
//   import { nudges } from './nudges.js';
//   nudges(sources, { now?, max? = 3, quiet? = [keys the owner dismissed] }) -> [{ id, key, level, text, why, ask, open?, route?, usd?, r?, src }]
//     level  'bad' | 'warn' | 'info'      text  one plain line, with the $ and the R      why  one more sentence
//     ask    a phrase the owner can tap to send to Jarvis ("how much drawdown do I have left")
//     open / route  where "Open" goes (an app id, e.g. 'demeter', and an optional route)
//     src    "home.json, 6 min ago"
//   sources: see jdata.js (home, money, odeon, rules, pythia, journal, ...). Anything missing is skipped, never guessed.
//
// Ranking: bad before warn before info, then by how soon / how many dollars. Rules (each only fires on data that is there):
//   dll_near      80% of the daily loss used            dd_low     less than 25% of the max loss left (under 50%: info)
//   deal_ending   a dated deal ends within 48 hours      event_soon a high-impact event today or tomorrow (the next one, within 3 days: info)
//   unrated       trades of the last 14 days without a journal rating        feeds_stale  a published file is older than its limit, or missing
//   bot_off       an account is not connected             eval_close an eval within 20% of its target
//   paper_dd      a paper ledger (not a real account) under 25% of its room: info, last (real accounts only in every rule above)

import { accounts, worstAccount, deals, nextEvents, unrated, feedHealth, both, usd, rtxt, asR, srcTag, isObj, num, etParts, daysBetween, usualR } from './jdata.js';

const RANK = { bad: 0, warn: 1, info: 2 };
const hoursText = (h) => (h < 1 ? 'under an hour' : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

export function nudges(S, opts) {
  const o = isObj(opts) ? opts : {}, now = num(o.now) != null ? o.now : Date.now(), max = num(o.max) != null ? o.max : 3, quiet = new Set(Array.isArray(o.quiet) ? o.quiet : []);
  const out = [], add = (n) => { out.push({ ...n, key: n.id + ':' + (n.sig || '') }); };
  const S0 = isObj(S) ? S : {};
  const all = accounts(S0), accts = all.filter((a) => !a.paper), paper = all.filter((a) => a.paper);   // real accounts first; a paper ledger is a test

  // --- risk first
  for (const a of accts) {
    if (a.connected === false) add({ id: 'bot_off', sig: a.name, level: 'warn', text: `${a.name} is not connected to NinjaTrader.`, why: 'The bot cannot see the market until the PC is connected again.', ask: 'are my feeds stale', open: 'zenith', src: srcTag(S0, 'home', now).text, score: 70 });
    if (a.dll && a.dllUsed / a.dll >= 0.8) { const left = Math.max(0, a.dll - a.dllUsed); add({ id: 'dll_near', sig: a.name, level: 'bad', text: `${a.name}: daily loss nearly used. ${both(left, S0)} of ${usd(a.dll)} left today.`, why: 'No extra trades by hand today.', ask: 'how much daily loss do I have left', open: 'aegis', usd: left, src: srcTag(S0, 'home', now).text, score: 100 }); }
  }
  const w = worstAccount(accts);
  if (w && w.room / w.mll < 0.5) {
    const low = w.room / w.mll < 0.25, r = asR(w.room, S0);
    add({ id: 'dd_low', sig: w.name + (low ? ':low' : ':half'), level: low ? 'bad' : 'info', text: `${w.name}: drawdown left ${both(w.room, S0)} of ${usd(w.mll)} max loss.`, why: low ? 'One more big loss could end the eval. Stay small.' : 'Less than half of the room is left. Let the bot run its plan.', ask: 'how much drawdown do I have left', open: 'demeter', usd: w.room, r, src: srcTag(S0, 'home', now).text, score: low ? 95 : 45 });
  }
  // a paper test low on its practice room: one calm line (never red), last in the list (2026-11-18: "Paper (cloud): drawdown left $389" read like a real emergency)
  const wp = worstAccount(paper);
  if (wp && wp.room / wp.mll < 0.25) add({ id: 'paper_dd', sig: wp.name, level: 'info', text: `Paper test, not real money: ${usd(wp.room)} of ${usd(wp.mll)} practice drawdown left.`, why: 'The cloud paper ledger practises the rules; your real accounts are not affected.', ask: 'how much drawdown do I have left', open: 'zenith', usd: wp.room, src: srcTag(S0, 'home', now).text, score: 5 });
  const close = accts.filter((a) => !a.funded && a.target && a.toTarget != null && a.toTarget > 0 && a.toTarget / a.target <= 0.2).sort((x, y) => x.toTarget - y.toTarget)[0];
  if (close) add({ id: 'eval_close', sig: close.name, level: 'info', text: `${close.name} is ${both(close.toTarget, S0)} from its profit target.`, why: 'Close to passing: keep the plan, no extra risk.', ask: 'how far am I from the target', open: 'demeter', usd: close.toTarget, src: srcTag(S0, 'home', now).text, score: 60 });

  // --- deals, events
  const d = deals(S0, now).filter((x) => x.hours <= 48 && !x.sample)[0];
  if (d) add({ id: 'deal_ending', sig: d.title, level: 'warn', text: `A deal ends in ${hoursText(d.hours)}: ${d.title}${d.usd ? ` (about ${usd(d.usd)}, an estimate)` : ''}.`, why: 'Use it only if you were buying anyway; check the firm\'s own page.', ask: 'any deals ending', open: 'mercury', usd: d.usd || undefined, src: srcTag(S0, 'money', now).text, score: 80 - Math.min(20, d.hours / 3) });
  const ev = nextEvents(S0, now, null, 6).filter((e) => e.impact === 'high' || e.impact === 'red' || /cpi|fomc|nfp|payroll|rate decision/i.test(e.title));
  const e0 = ev[0];
  if (e0 && e0.inDays <= 3) add({ id: 'event_soon', sig: e0.date + e0.title, level: e0.inDays <= 1 ? 'warn' : 'info', text: `${e0.title} ${e0.inDays === 0 ? 'today' : e0.inDays === 1 ? 'tomorrow' : 'in ' + e0.inDays + ' days'}${e0.time ? ' at ' + e0.time + ' ET' : ''}.`, why: e0.verify ? 'The date is not verified yet: check it before you plan around it.' : 'Spreads and moves get wild around it. The bot has its own rules; do not add trades by hand.', ask: 'when is the next CPI', open: 'pythia', src: srcTag(S0, 'pythia', now).text, score: e0.inDays <= 1 ? 72 : 40 });

  // --- housekeeping
  const un = unrated(S0, now, 14);
  if (un.length) { const sum = un.reduce((s, t) => s + t.usd, 0); add({ id: 'unrated', sig: String(un.length), level: 'info', text: `${un.length} ${un.length === 1 ? 'trade' : 'trades'} from the last 14 days ${un.length === 1 ? 'has' : 'have'} no journal rating (${both(sum, S0, true)} together).`, why: 'Rating takes ten seconds each and shows what your habits cost.', ask: 'how many unrated trades', open: 'journal', usd: Math.abs(sum), src: srcTag(S0, 'odeon', now).text, score: 35 + Math.min(15, un.length * 2) }); }
  const bad = feedHealth(S0, now).filter((f) => f.missing || f.stale);
  // night-feedsA: only old ACCOUNT numbers (home) need the owner; an old replay / calendar file is a site-publish matter (info, never the hero)
  if (bad.length) add({ id: 'feeds_stale', sig: bad.map((f) => f.name + (f.missing ? '!' : '')).join(','), level: bad.some((f) => f.name === 'home') ? 'warn' : 'info', text: `${bad.some((f) => f.name === 'home') ? 'Account numbers' : 'Some data'} ${bad.length === 1 && bad[0].missing ? 'is missing' : 'is old or missing'}: ${bad.map((f) => f.file + (f.missing ? ' (missing)' : ` (${hoursText(f.ageH)} old)`)).join(', ')}.`, why: 'Open the PC and run STATUS.bat; the answers I give from old files may be out of date.', ask: 'are my feeds stale', open: 'inbox', src: 'feeds', score: bad.some((f) => f.name === 'home') ? 66 : 50 });

  out.sort((a, b) => (RANK[a.level] - RANK[b.level]) || (b.score - a.score));
  return out.filter((n) => !quiet.has(n.key)).slice(0, max).map(({ score, sig, ...n }) => n);
}
export default nudges;
