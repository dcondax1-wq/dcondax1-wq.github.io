// Jarvis daily briefing (2026-11-11, JARVIS BRAIN v3): "brief me", "brief me on Kalshi", "brief me on money".
// Six lines, written and spoken, every amount with its $ and its R. The day briefing is Helios' own logic (../helios/helioscore.js:
// how the day looks, the accounts, the deals, what to do first) on the same published files Helios reads; the Kalshi and money
// briefings read the same snapshot the Kalshi and money skills answer from. A file that is missing is said to be missing on its
// line, never filled in. No DOM, no network: the skills pass the data in.
//
//   import { briefKind, compose } from './jbrief.js';
//   briefKind('brief me on kalshi')  -> 'kalshi' | 'money' | 'day' | null
//   compose(kind, { S, now, H, J, KB })  -> { lines: [6], names: [source keys], say } | null (nothing to brief from)
// iPhone Safari 16: plain ES2020, no regex lookbehind.

import { norm } from './router.js';

const BRIEF = /\b(?:brief|briefing|debrief|de-brief|sitrep|sit rep|rundown|run down)\b|^(?:please |jarvis |hey jarvis )*(?:run me through|walk me through|take me through) (?:the|my|to)(?:day| day|s day)\b/;
/** which briefing a phrase asks for, or null when it is not a "brief me" at all */
export function briefKind(raw) {
  const q = norm(raw).replace(/[?!.]+$/g, '').trim();
  if (!q || q.length > 120 || !BRIEF.test(q)) return null;
  if (/\b(?:copy|clipboard|share|send|paste|export|open|show me the|go to|launch|app|page)\b/.test(q)) return null;      // "copy the briefing", "open the briefing": other skills
  if (/\b(?:kalshi|bets?|prediction markets?|the bot'?s? bets)\b/.test(q)) return 'kalshi';
  if (/\b(?:money|money machines?|machines|mint|streams?|deals?|income|side income|sibyl|mercury)\b/.test(q)) return 'money';
  return 'day';
}
export const KIND_NAME = { day: 'Today', kalshi: 'Kalshi', money: 'Money' };

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const first = (s) => { const m = String(s || '').match(/^.*?[.!?](?:\s|$)/); return (m ? m[0] : String(s || '')).trim(); };
const hours = (h) => (h < 1 ? 'under an hour' : h < 48 ? Math.round(h) + ' hours' : Math.round(h / 24) + ' days');

function day({ S, now, H, J }) {
  const acc = J.accounts(S), usd = J.usd, both = (v, sign) => J.both(v, S, sign);
  const haveCal = isObj(S.pythia), haveMoney = J.streams(S).length > 0;
  if (!acc.length && !haveCal && !haveMoney) return null;
  const L = [], names = [];
  // 1. how the day looks (Helios' lookOf), or the clock alone
  let m = null;
  if (H && typeof H.build === 'function') { try { m = H.build({ events: S.pythia, home: S.home, money: S.money, lyceum: null }, now); } catch (_) { m = null; } }
  const p = J.etParts(now), hello = m ? m.slot.hello : p.h < 12 ? 'Good morning' : p.h < 18 ? 'Good afternoon' : 'Good evening';
  if (m && haveCal) { L.push(`${hello}. ${H.lookWords(m.look)}. ${m.look.why}`); names.push('pythia'); }
  else L.push(`${hello}. I don't have the risk calendar (pythia/events.json), so I cannot say how the day looks.`);
  // 2. today's result, 3. drawdown
  const td = acc.filter((a) => a.today != null);
  if (td.length) {
    const sum = td.reduce((s, a) => s + a.today, 0);
    L.push('Today: ' + td.map((a) => `${a.name} ${both(a.today, true)}`).join(', ') + (td.length > 1 ? `; together ${both(sum, true)}.` : '.'));
    names.push('home');
  } else L.push("Today: I don't have your account numbers (home.json).");
  const w = J.worstAccount(acc);
  if (w) {
    const dl = acc.filter((a) => a.dll && a.dllUsed > 0);
    L.push(`Drawdown: ${acc.filter((a) => a.room != null && a.mll).length > 1 ? 'tightest is ' : ''}${w.name}, ${both(w.room)} of ${usd(w.mll)} left (${Math.round((w.room / w.mll) * 100)}%)` + (dl.length ? `; daily loss used ${dl.map((a) => `${usd(a.dllUsed)} of ${usd(a.dll)} on ${a.name}`).join(', ')}.` : '; no daily loss used.'));
  } else L.push("Drawdown: I don't have it (home.json), so I will not guess.");
  // 4. the next release
  if (haveCal) {
    const ev = J.nextEvents(S, now, null, 6), top = ev.find((e) => e.impact === 'high') || ev[0];
    L.push(top ? `Calendar: next ${top.impact === 'high' ? 'big release' : 'release'} is ${top.title}, ${top.inDays === 0 ? 'today' : top.inDays === 1 ? 'tomorrow' : 'in ' + top.inDays + ' days (' + top.date + ')'}${top.time ? ' at ' + top.time + ' ET' : ''}${top.verify ? ' (date not verified yet)' : ''}.` : 'Calendar: nothing is scheduled from today on.');
  } else L.push('Calendar: not loaded.');
  // 5. money: a deal ending, else Kalshi today, else the streams
  const deals = haveMoney ? J.deals(S, now).filter((d) => !d.sample && d.hours <= 48) : [];
  const E = isObj(S.kalshi) ? S.kalshi : isObj(S.kalshiEdges) && isObj(S.kalshiEdges.book) ? { today_pnl: S.kalshiEdges.book.today, balance: S.kalshiEdges.book.balance } : null;
  const kt = E && J.num(E.today_pnl) != null ? `Kalshi is ${E.today_pnl > 0.004 ? 'up ' + usd(E.today_pnl) : E.today_pnl < -0.004 ? 'down ' + usd(Math.abs(E.today_pnl)) : 'flat'} today` : '';
  if (deals.length) { L.push(`Money: a deal ends in ${hours(deals[0].hours)}: ${deals[0].title}${deals[0].usd ? `, worth about ${both(deals[0].usd)} (an estimate)` : ''}${kt ? '; ' + kt : ''}.`); names.push('money'); }
  else if (haveMoney) { L.push(`Money: no deal ends in the next 48 hours${kt ? '; ' + kt : ''}.`); names.push('money'); }
  else L.push(kt ? `Money: ${kt}; the money streams are not loaded.` : 'Money: the money streams (money/index.json) are not loaded.');
  if (kt) names.push(isObj(S.kalshi) ? 'kalshi' : 'kalshiEdges');
  // 6. what to do first (Helios' actions, the same rules as Compass)
  const a = m && m.actions && m.actions[0];
  L.push(a ? `Do first: ${a.title}${/[.!?]$/.test(a.title) ? '' : '.'} ${first(a.why)}${a.usd && first(a.why).indexOf('$') < 0 ? ` About ${both(a.usd)} at stake (an estimate).` : ''}` : 'Do first: nothing needs you. Letting the bots work is the plan.');
  return { lines: L, names, say: [L[0], L[1], L[2], L[5]].join(' '), plan: m ? m.plan : '' };
}

function kalshi({ S, now, J, KB }) {
  const f = isObj(S.kalshi) ? S.kalshi : null, e = isObj(S.kalshiEdges) ? S.kalshiEdges : null;
  if (!f && !e) return null;
  let sn = null; try { sn = KB.snapshot(f, { edges: e, log: S.kalshiLog, learned: S.kalshiLearned }, now); } catch (_) { sn = null; }
  if (!sn || !sn.ok) return null;
  const k = (v, sign) => KB.usd(v, sign) || '$0.00', R = (v) => (sn.stakeAvg && J.num(v) != null ? ` (${J.rtxt(v / sn.stakeAvg, true)}, 1R = the ${k(sn.stakeAvg)} average bet)` : '');
  const names = (f ? ['kalshi'] : []).concat(e ? ['kalshiEdges'] : []), L = [];
  L.push(`Kalshi bot: ${sn.paused ? 'paused' : sn.running ? 'running' : 'status unknown'}${sn.mode ? ', ' + sn.mode + ' money' : ''}${sn.live ? '' : ". This is the engine's copy: the live feed is not answering"}.`);
  L.push(sn.balance != null ? `Balance ${k(sn.balance)}; today ${sn.today != null ? k(sn.today, true) + R(sn.today) : 'not known'}.` : "Balance: I don't have it.");
  L.push(`This week ${sn.week != null ? k(sn.week, true) : 'not known'}; all time ${sn.total != null ? k(sn.total, true) : 'not known'}${e && isObj(e.book) && J.num(e.book.bets_total) != null ? ` over n=${e.book.bets_total} bets` : ''}.`);
  const pos = (f ? f.positions : e && isObj(e.book) ? e.book.positions : []) || [], open = pos.filter(isObj), sum = open.reduce((a, p) => a + (J.num(p.pnl) || 0), 0);
  L.push(open.length ? `Open bets: ${open.length}, ${k(sum, true)} open P&L${R(sum)}.` : 'Open bets: none right now (n=0).');
  const bad = e && Array.isArray(e.edges) ? e.edges.filter((x) => isObj(x) && x.size === 1 && J.num(x.pnl) != null && x.pnl < 0 && (J.num(x.n) || 0) >= 30).sort((a, b) => a.pnl - b.pnl).slice(0, 2) : [];
  L.push(!e ? 'Losing bet kinds: the engine file is not loaded.' : bad.length ? 'Losing bet kinds (30+ bets, after fees): ' + bad.map((x) => `${J.str(x.label, 40)} ${k(x.pnl, true)} over n=${x.n}`).join('; ') + '.' : 'Losing bet kinds: none with 30 or more bets.');
  const stop = sn.stop || [];
  L.push(sn.paused ? 'Do first: the bot is paused, so no new bets. Check why on the PC before anything else.' : stop.length ? `Do first: the engine says STOP on ${stop.length} bet ${stop.length === 1 ? 'kind' : 'kinds'} (${stop.slice(0, 2).map((x) => x.label).join(', ')}). A suggestion: it changes nothing by itself.` : 'Do first: nothing needs you. Suggestions only; no bet is placed from here.');
  return { lines: L, names, say: [L[0], L[1], L[3], L[5]].join(' ') };
}

function money({ S, now, J }) {
  const st = J.streams(S);
  if (!st.length) return null;
  const usd = J.usd, both = (v, sign) => J.both(v, S, sign), L = [];
  const sample = st.filter((s) => s.status === 'sample'), stale = st.filter((s) => s.status === 'stale'), ok = st.length - sample.length - stale.length;
  L.push(`Money machines: ${st.length} ${st.length === 1 ? 'stream' : 'streams'}, ${ok} fresh${stale.length ? ', ' + stale.length + ' stale' : ''}${sample.length ? ', ' + sample.length + ' on sample data' : ''}. Paper only.`);
  const withUsd = st.filter((s) => s.status !== 'sample' && isObj(s.headline) && J.num(s.headline.usd_month) != null).sort((a, b) => b.headline.usd_month - a.headline.usd_month);
  const best = withUsd[0] || st.find((s) => s.status !== 'sample' && isObj(s.headline) && s.headline.text);
  L.push(best ? `Biggest: ${J.str(best.name || best.id, 20)}: ${J.str(best.headline.text, 130)}${J.num(best.headline.usd_month) != null ? ` About ${both(best.headline.usd_month)} a month (an estimate, not a promise).` : ''}` : 'Biggest: no stream has a real headline yet.');
  const deals = J.deals(S, now).filter((d) => !d.sample);
  L.push(deals.length ? `Deals: ${deals.slice(0, 2).map((d) => `${d.title} ends in ${hours(d.hours)}${d.usd ? ', about ' + both(d.usd) + ' (an estimate)' : ''}`).join('; ')}.` : 'Deals: no dated deal is running.');
  const sib = st.find((s) => s.id === 'sibyl'), picks = sib ? (Array.isArray(sib.items) ? sib.items : []).filter((i) => isObj(i) && i.picked).sort((a, b) => (J.num(b.score) || 0) - (J.num(a.score) || 0)) : [];
  L.push(!sib ? "Sibyl: I don't have her stream." : picks.length ? `Sibyl: ${picks.length} paper ${picks.length === 1 ? 'pick' : 'picks'}; the best is ${J.str(picks[0].title, 50)} (n=${J.num(picks[0].n) != null ? picks[0].n : '?'}), paper stake ${usd(J.num(picks[0].stake_usd))} = 1R${sib.status === 'sample' ? ' [sample numbers]' : ''}.` : 'Sibyl: no paper-worthy edge today. That is an honest answer.');
  L.push(stale.length || sample.length ? `Needs a refresh: ${stale.concat(sample).map((s) => J.str(s.name || s.id, 16) + (s.status === 'sample' ? ' (sample)' : ' (stale)')).join(', ')}. tools/bat/RUN_MONEY.bat on the PC updates them.` : 'Freshness: every stream is up to date.');
  L.push(deals.length && deals[0].hours <= 48 ? `Do first: look at "${deals[0].title}" on the firm's own page, and use it only if you were buying anyway.` : 'Do first: nothing needs you. These are estimates and suggestions; nothing here spends or trades.');
  return { lines: L, names: ['money'], say: [L[0], L[1], L[2], L[5]].join(' ') };
}

/** the six lines for a kind, or null when there is nothing to brief from */
export function compose(kind, ctx) {
  const fn = kind === 'kalshi' ? kalshi : kind === 'money' ? money : day;
  try { const r = fn(ctx); return r && r.lines.length === 6 ? r : null; } catch (_) { return null; }
}
export default compose;
