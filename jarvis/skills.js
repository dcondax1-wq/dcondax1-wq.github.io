// Jarvis skills (2026-11-10, JARVIS BRAIN): the tool layer. The router (router.js) names the intent; this answers it from the
// published data of the whole site (jdata.js), runs actions (actions.js, anything that writes asks first) and keeps the owner's
// memory (memstore.js). Deterministic, offline, rule-based: the same question and the same files give the same answer, and every
// number comes with its $ and R (R = $ / the owner's usual 1R, shown) and its source ("from home.json, 6 min ago"). A missing
// file or field is said to be missing ("I don't have that"), never filled in. Paper only: nothing here places an order.
//
//   import { createSkills } from './skills.js';
//   const sk = createSkills({ getSources, apps?, storage?, now?, assistant?, env?, mem?, actions?, compass? });
//     getSources() -> Promise<sources>   (jdata.loadSources + readLocal; cached by the caller)
//     apps() -> [{ id, name, purpose }]  (the apps list: OLYMPUS_APPS_LIST or the apps.js BUILT_INS)
//     env: { navigate, copy, download, briefing }   (see actions.js)
//   sk.handle(raw, q?, { now? }) -> Promise<reply | null>   null: not one of its intents (the brain carries on)
//        reply: { text, speak, intent, sources: ['home.json, 6 min ago'], missing?: true (it had no data), open?, route?, pending?, download?, cards? }
//   sk.confirm() / sk.cancel() / sk.pending      "yes" / "no" to a write it proposed (actions.js)
//   sk.contextFor(raw) -> Promise<string>        the same answers as plain text for the user's own model (tool results as context)
//   sk.nudges(opts?) -> Promise<[nudge]>         up to 3 proactive suggestions (nudges.js)
//   sk.mem · sk.actions                           the memory store and the action registry
//   sk.route(raw)                                 the router's verdict, for tests

import { route as routeText, norm, findApp, tokens, fuzzyEq, helpTable } from './router.js';
import * as KB from './kalshi-brain.js';
import { createMemStore } from './memstore.js';
import { createActions } from './actions.js';
import { nudges as nudgeList } from './nudges.js';
import * as J from './jdata.js';
import { createV3 } from './skills3.js';

const { usd, rtxt, num, str, isObj } = J;
const MISSING = (what, file) => ({ text: `I don't have that: ${what}. ${file ? `${file} has not loaded, so I will not guess.` : 'I will not guess.'}`, speak: `I don't have that. ${what}.`, missing: true });

export const EXAMPLES = [
  'how much drawdown do I have left', 'am I allowed to trade now', 'what is my worst weekday', 'what did Sibyl pick', 'when is the next CPI', 'any deals ending',
  'explain this trade', 'what should I do next', 'show me Athens', 'open Kronos', 'start the quiz', 'set my goal for today to stay flat before 10',
  'remember that I trade best before 10', 'what did I say about mornings', 'export my data', 'copy the briefing',
];
const COPILOT_EX = ['should I trade today', 'how much can I lose today', 'how close am I to passing', 'best and worst trade', 'what changed since yesterday', 'kalshi exposure today', "what's my day"];   // copilot.js HELP
const ZONES = { market: ['zenith', 'oracle', 'ares', 'forum', 'chronos', 'cities', 'odeon', 'pantheon', 'delphi', 'kronos'], research: ['datacity', 'observatory', 'tree', 'prometheus', 'hephaestus', 'nemesis', 'clio', 'fates', 'moirai'],
  risk: ['ledger', 'hera', 'plutus', 'pnyx', 'demeter', 'labyrinth', 'kalshi', 'kalshicity', 'tyche', 'dionysus', 'hermes', 'mint', 'mintcity', 'mercury', 'chrysos', 'sibyl'], command: ['hestia', 'inbox', 'argus', 'bridge', 'settings', 'atlas', 'stoa', 'kratos', 'argo'],
  life: ['planner', 'mind', 'arena', 'journal', 'athena', 'apollo', 'lyceum', 'nike', 'epilogue', 'gallery'] };       // atlas/atlas.js `zones` (checked by the tests)
const ZONE_NAME = { market: 'Market', research: 'Research', risk: 'Money', command: 'Command', life: 'Life' };

export function createSkills(opts) {
  const o = isObj(opts) ? opts : {};
  const nowMs = (n) => { const v = n != null ? n : (typeof o.now === 'function' ? o.now() : Date.now()); return v instanceof Date ? v.getTime() : Number(v) || Date.now(); };
  const mem = o.mem || createMemStore({ storage: o.storage, now: o.now });
  const actions = o.actions || createActions({ storage: o.storage, now: o.now, mem, compass: o.compass, planner: o.planner, env: { ...(o.env || {}), sources: () => sources() } });
  const appsList = () => { try { const l = typeof o.apps === 'function' ? o.apps() : o.apps; return Array.isArray(l) ? l.filter((x) => x && x.id).map((x) => ({ id: x.id, name: x.name, purpose: x.purpose || x.sub || '' })) : []; } catch (_) { return []; } };
  const sources = async () => { try { const S = typeof o.getSources === 'function' ? await o.getSources() : null; return isObj(S) ? S : { at: {} }; } catch (_) { return { at: {} }; } };
  const reply = (text, extra) => ({ text, speak: (extra && extra.speak) || text.replace(/\n+/g, ' '), ...(extra || {}) });
  const tag = (S, names, now) => { const t = names.map((n) => J.srcTag(S, n, now).text); return { sources: t, line: 'From ' + t.join('; ') + '.' }; };
  const withSrc = (S, names, now, lines, extra) => { const t = tag(S, names, now); return reply(lines.filter(Boolean).join('\n') + '\n' + t.line, { sources: t.sources, ...(extra || {}) }); };
  const oneR = (S) => { const u = J.usualR(S); return u ? ` Your usual 1R is about ${usd(u)} (median of your last trades).` : ''; };
  const both = (v, S, sign) => J.both(v, S, sign);

  // the household: money/household.json (tools/money_import.py: the owner's own bank exports; the PC's private link only)
  const hh = (S) => (isObj(S.household) && S.household.kind === 'olympus-household' && S.household.status === 'ok' ? S.household : null);
  const HH_MISSING = () => MISSING('your bank money', 'money/household.json (your bank exports, on the PC\'s private link)');
  const household = (S, now, lines, id) => withSrc(S, ['household'], now, lines.concat(['From your own bank exports; no account numbers.']), { intent: id, open: undefined });
  // your health: me/health.json (tools/me_health.py: the Apple Watch Shortcut + the Health export; the Me hub, the PC's private link only).
  // The lines are made on the PC (health.json "jarvis"): read as they are, with the source and its age, never filled in.
  const hj = (S) => (isObj(S.health) && S.health.kind === 'olympus-health' && S.health.status === 'ok' ? S.health : null);
  const HJ_MISSING = () => MISSING('your Apple Watch days', 'me/health.json (the Shortcut "Health to PC", on the PC\'s private link)');
  const healthLine = (S, now, key, id) => { const H = hj(S); if (!H) return HJ_MISSING(); return withSrc(S, ['health'], now, [str(isObj(H.jarvis) ? H.jarvis[key] : '', 400) || 'I have no number for that yet.'], { intent: id, open: undefined }); };
  const HH_CATS = [[/\b(food|groceries|grocery|eating out|restaurants?|takeout|take out|delivery|doordash)\b/, 'food'], [/\b(gas|fuel)\b/, 'gas'], [/\brent\b/, 'rent'],
    [/\bsubscriptions?\b/, 'subscriptions'], [/\bshopping\b/, 'shopping'], [/\b(bills|utilities|phone|internet)\b/, 'utilities'], [/\b(car|rides|uber)\b/, 'transport'],
    [/\b(health|gym)\b/, 'health'], [/\bbank fees\b/, 'bank_fees'], [/\b(atm|cash)\b/, 'cash']];

  // ------------------------------------------------------------------------------------------------ answers from the data
  const A = {
    drawdown_left(S, now) {
      const a = J.accounts(S).filter((x) => x.room != null && x.mll);
      if (!a.length) return MISSING('your drawdown room', 'home.json');
      const lines = a.map((x) => `${x.name}: drawdown left ${both(x.room, S)} of ${usd(x.mll)} max loss (${Math.round((x.room / x.mll) * 100)}% left).`);
      const w = J.worstAccount(a);
      return withSrc(S, ['home'], now, lines.concat(a.length > 1 ? [`Tightest: ${w.name}.`] : [], [oneR(S).trim()]), { intent: 'drawdown_left', cards: undefined });
    },
    daily_loss_left(S, now) {
      const a = J.accounts(S).filter((x) => x.dll);
      if (!a.length) return MISSING('your daily loss limit', 'home.json');
      return withSrc(S, ['home'], now, a.map((x) => `${x.name}: ${both(Math.max(0, x.dll - x.dllUsed), S)} of today's ${usd(x.dll)} daily loss left (${usd(x.dllUsed)} used).`), { intent: 'daily_loss_left' });
    },
    eval_progress(S, now) {
      const a = J.accounts(S).filter((x) => x.target && x.toTarget != null);
      if (!a.length) return MISSING('your profit target', 'home.json');
      return withSrc(S, ['home'], now, a.map((x) => `${x.name}: ${both(Math.max(0, x.toTarget), S)} to the ${usd(x.target)} target (${Math.round(((x.target - x.toTarget) / x.target) * 100)}% done).`), { intent: 'eval_progress' });
    },
    pnl_today(S, now) {
      const a = J.accounts(S).filter((x) => x.today != null);
      if (!a.length) return MISSING('today\'s result', 'home.json');
      const sum = a.reduce((s, x) => s + x.today, 0);
      return withSrc(S, ['home'], now, a.map((x) => `${x.name}: ${both(x.today, S, true)} today.`).concat(a.length > 1 ? [`Together: ${both(sum, S, true)}.`] : []), { intent: 'pnl_today' });
    },
    balance(S, now) {
      const a = J.accounts(S).filter((x) => x.balance != null);
      if (!a.length) return MISSING('your balances', 'home.json');
      return withSrc(S, ['home'], now, a.map((x) => `${x.name}: ${usd(x.balance)}${x.today != null ? ` (${both(x.today, S, true)} today)` : ''}.`), { intent: 'balance' });
    },
    weekday(S, now, worst, day) {
      const rows = J.byWeekday(S), n = rows.reduce((s, x) => s + x.n, 0);
      if (!n) return MISSING('your trades by weekday', 'odeon/trades.json');
      if (day) {
        const r = rows.find((x) => x.name.toLowerCase() === day);
        return r ? withSrc(S, ['odeon'], now, [`${r.name}: ${both(r.usd, S, true)} over ${r.n} ${r.n === 1 ? 'trade' : 'trades'}, ${both(r.avg, S, true)} on average, ${r.wins} won.${r.n < 5 ? ' Small sample: treat it as a hint.' : ''}`], { intent: 'weekday_' + (worst ? 'worst' : 'best') }) : reply(`I have no trades on a ${day} in the data (${n} trades in total).`, { intent: 'weekday', missing: true });
      }
      const ok = rows.filter((x) => x.n >= 3);
      const pool = ok.length ? ok : rows, pick = pool.slice().sort((a, b) => (worst ? a.usd - b.usd : b.usd - a.usd))[0];
      const note = ok.length ? '' : ' Each weekday has fewer than 3 trades, so this is only a hint.';
      const others = pool.filter((x) => x !== pick).sort((a, b) => (worst ? a.usd - b.usd : b.usd - a.usd)).slice(0, 2).map((x) => `${x.name} ${both(x.usd, S, true)} (${x.n})`).join(', ');
      return withSrc(S, ['odeon'], now, [`Your ${worst ? 'worst' : 'best'} weekday: ${pick.name}, ${both(pick.usd, S, true)} over ${pick.n} ${pick.n === 1 ? 'trade' : 'trades'} (${both(pick.avg, S, true)} each, ${pick.wins} won).${note}`, others ? `Next ${worst ? 'weakest' : 'strongest'}: ${others}.` : '', `Based on ${n} trades; a past pattern, not a promise.`], { intent: 'weekday_' + (worst ? 'worst' : 'best') });
    },
    win_rate(S, now) {
      const st = J.stats(J.trades(S));
      if (!st) return MISSING('your trades', 'odeon/trades.json');
      return withSrc(S, ['odeon'], now, [`${st.n} trades: ${st.wins} won, ${st.losses} lost (${Math.round(st.winRate * 100)}% win rate).`, `Net ${both(st.net, S, true)}${st.pf != null ? `, profit factor ${st.pf.toFixed(2)}` : ''}${st.avgR != null ? `, average ${rtxt(st.avgR)} a trade` : ''}.`], { intent: 'win_rate' });
    },
    trades_count(S, now) {
      const t = J.trades(S);
      if (!t.length) return MISSING('your trades', 'odeon/trades.json');
      const today = J.etParts(now).day, wk = new Date(now - 7 * 86400000).toISOString().slice(0, 10), mo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
      const c = (f) => t.filter((x) => x.day >= f).length;
      return withSrc(S, ['odeon'], now, [`${c(wk)} trades in the last 7 days, ${c(mo)} in the last 30, ${t.length} in the file (last one ${t[t.length - 1].day}).`, J.daysBetween(t[t.length - 1].day, today) > 5 ? 'The last trade is a few days old: the file may be behind.' : ''], { intent: 'trades_count' });
    },
    last_trade(S, now) {
      const t = J.trades(S), x = t[t.length - 1];
      if (!x) return MISSING('your trades', 'odeon/trades.json');
      return withSrc(S, ['odeon'], now, [tradeLine(x, S)], { intent: 'last_trade' });
    },
    explain_trade(S, now) {
      const t = J.trades(S), x = t[t.length - 1];
      if (!x) return MISSING('your trades', 'odeon/trades.json');
      const ex = isObj(x.exit) ? x.exit : {}, en = isObj(x.entry) ? x.entry : {};
      const kind = String(ex.kind || '').toUpperCase(), won = x.usd > 0;
      const how = kind === 'STOP' ? (x.usd >= 0 ? 'was stopped out at breakeven or better' : 'was stopped out') : kind === 'TARGET' ? 'reached its target' : kind === 'BE' ? 'was closed at breakeven' : kind ? `ended with ${kind.toLowerCase()}` : 'was closed';
      const bits = [tradeLine(x, S),
        `Entry ${num(en.px) != null ? en.px : '?'}${num(x.stop) != null ? `, stop ${x.stop}` : ''}${num(x.target) != null ? `, target ${x.target}${x.target_label ? ' (' + str(x.target_label, 20) + ')' : ''}` : ''}. The trade ${how}${num(ex.px) != null ? ' at ' + ex.px : ''}${num(x.held_min) != null ? ` after ${x.held_min} minutes` : ''}.`,
        num(x.mfe_r) != null && num(x.mae_r) != null ? `At best it was ${rtxt(x.mfe_r)} (${usd(x.mfe_usd)}) in your favour; at worst ${rtxt(-Math.abs(x.mae_r))} (${usd(-Math.abs(num(x.mae_usd) || 0))}) against you.` : '',
        num(x.plan_rr) != null ? `The plan aimed for ${x.plan_rr}R.` : '',
        won ? 'A win is a win; judge it on whether you followed the plan, not on the money.' : 'A loss inside the plan is a cost of doing business: check it was the plan and not a hand-made change. You can rate it in Mnemosyne (the journal).'];
      return withSrc(S, ['odeon'], now, bits, { intent: 'explain_trade', open: undefined });
    },
    next_event(S, now, args) {
      if (!isObj(S.pythia)) return MISSING('the risk calendar', 'pythia/events.json');
      const q = args && args.q || '';
      const word = Object.keys(J.EVENT_WORDS).find((k) => J.EVENT_WORDS[k].test(q)) || null;
      const list = J.nextEvents(S, now, word, 3);
      if (!list.length) return withSrc(S, ['pythia'], now, [word ? `The risk calendar has no ${word.toUpperCase()} on it from today on.` : 'The risk calendar has nothing from today on.', 'It may not be extended yet: open Pythia to check.'], { intent: 'next_event', missing: true });
      const when = (e) => (e.inDays === 0 ? 'today' : e.inDays === 1 ? 'tomorrow' : `in ${e.inDays} days (${e.date})`) + (e.time ? ` at ${e.time} ET` : '');
      return withSrc(S, ['pythia'], now, list.map((e, i) => `${i === 0 ? 'Next: ' : ''}${e.title}, ${when(e)}${e.impact ? `, ${e.impact} impact` : ''}${e.verify ? ' (date not verified yet)' : ''}.`).concat(['The bots keep their own rules around news; do not add trades by hand into it.']), { intent: 'next_event', open: undefined });
    },
    can_trade_now(S, now) {
      const p = J.etParts(now), hm = `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}`, wk = p.dow >= 1 && p.dow <= 5;
      const rules = isObj(S.rules) && isObj(S.rules.limits) ? S.rules.limits.builder_50k : null;
      const flatBy = rules && num(rules.flat_by_mod) ? Math.floor(rules.flat_by_mod / 60) + ':' + String(rules.flat_by_mod % 60).padStart(2, '0') : '16:10';
      const open = p.mod >= 120 && p.mod < 930;           // the bot's entry window 02:00 to 15:30 ET (CLAUDE.md, planner windows)
      const why = [];
      let level = 'yes';
      if (!wk) { level = 'no'; why.push(`It is the weekend (${hm} ET): the bot takes no entries.`); }
      else if (p.mod < 120) { level = 'no'; why.push(`The entry window opens at 02:00 ET; it is ${hm} ET.`); }
      else if (p.mod >= 930) { level = 'no'; why.push(`The last entry is 15:30 ET; it is ${hm} ET. The bot is flat by 15:55 and MFFU needs you flat by ${flatBy} ET.`); }
      else why.push(`The entry window (02:00 to 15:30 ET) is open; it is ${hm} ET.`);
      const a = J.accounts(S);
      if (a.length) {
        for (const x of a) {
          if (x.paused) { level = level === 'no' ? 'no' : 'caution'; why.push(`${x.name} is paused.`); }
          if (x.connected === false) { level = level === 'no' ? 'no' : 'caution'; why.push(`${x.name} is not connected to NinjaTrader.`); }
          if (x.dll && x.dllUsed >= x.dll) { level = 'no'; why.push(`${x.name}: the daily loss is used up (${usd(x.dllUsed)} of ${usd(x.dll)}).`); }
          else if (x.dll && x.dllUsed / x.dll >= 0.8) { level = level === 'no' ? 'no' : 'caution'; why.push(`${x.name}: daily loss nearly used, ${both(x.dll - x.dllUsed, S)} left.`); }
          if (x.room != null && x.mll && x.room / x.mll < 0.25) { level = level === 'no' ? 'no' : 'caution'; why.push(`${x.name}: drawdown left ${both(x.room, S)} of ${usd(x.mll)}, so stay small.`); }
        }
      } else why.push('I do not have your account numbers (home.json), so I cannot check the loss limits.');
      const head = level === 'yes' ? 'Yes, the window is open.' : level === 'caution' ? 'Open, but with care.' : 'No, not now.';
      return withSrc(S, a.length ? ['home'] : ['rules'].filter((n) => isObj(S[n])), now, [head].concat(why, ['The bot places its own paper trades; this is the rulebook, not an order. Real money is always your decision.']), { intent: 'can_trade_now', speak: head + ' ' + why[0] });
    },
    rules_limit(S, now, args) {
      const L = isObj(S.rules) && isObj(S.rules.limits) ? S.rules.limits : null;
      if (!L) return MISSING('the MFFU rulebook', 'ledger/rules.json');
      const q = (args && args.q) || '', plan = /\b25k|25 k|atlas\b/i.test(q) ? 'builder_25k' : 'builder_50k', r = L[plan];
      if (!isObj(r)) return MISSING('that plan\'s limits', 'ledger/rules.json');
      const nm = plan === 'builder_25k' ? 'Builder 25K' : 'Builder 50K', lines = [];
      if (/micro|contract|size/i.test(q)) lines.push(`${nm}: up to ${r.max_micros} micros or ${r.max_minis} minis at once.`);
      else if (/flat|cutoff|cut off/i.test(q)) lines.push(`${nm}: be flat by ${Math.floor(r.flat_by_mod / 60)}:${String(r.flat_by_mod % 60).padStart(2, '0')} ET.`);
      else if (/payout/i.test(q)) lines.push(`${nm} payouts: ${usd(r.pay_min)} to ${usd(r.pay_max)} each, you keep ${Math.round(r.split * 100)}%, a cycle every ${r.cycle_days} winning days, up to ${r.max_payouts} payouts.`);
      else if (/inactiv/i.test(q)) lines.push(`${nm}: trade at least once every ${r.inactivity_days} days or the account can be closed.`);
      else if (/consisten/i.test(q)) lines.push(`${nm}: consistency rule ${Math.round(r.cons * 100)}% (no single day over that share of the profit).`);
      else lines.push(`${nm}: profit target ${usd(r.target)}, max loss ${usd(r.mll)}, daily loss ${usd(r.dll)}, up to ${r.max_micros} micros / ${r.max_minis} minis, flat by ${Math.floor(r.flat_by_mod / 60)}:${String(r.flat_by_mod % 60).padStart(2, '0')} ET.`);
      const built = isObj(S.rules.source) ? S.rules.source.built : null;
      return withSrc(S, ['rules'], now, lines.concat([built ? `The rulebook was checked on ${str(built, 20)}; re-check MFFU's page before relying on it.` : '']), { intent: 'rules_limit' });
    },
    deals(S, now) {
      const st = J.streams(S);
      if (!st.length) return MISSING('the money streams', 'money/index.json');
      const d = J.deals(S, now);
      if (!d.length) return withSrc(S, ['money'], now, ['No dated deal is running in the data right now.'], { intent: 'deals' });
      return withSrc(S, ['money'], now, d.slice(0, 3).map((x) => `${x.title}: ends in ${x.hours < 48 ? Math.round(x.hours) + ' hours' : Math.round(x.hours / 24) + ' days'}${x.usd ? `, worth about ${usd(x.usd)} (an estimate)` : ''}${x.sample ? ' [sample data]' : ''}.`).concat(['Use a deal only if you were buying anyway, and check the firm\'s own page.']), { intent: 'deals', open: undefined });
    },
    sibyl_pick(S, now) {
      const s = J.streams(S).find((x) => x.id === 'sibyl');
      if (!s) return MISSING('Sibyl\'s picks', 'money/index.json');
      const items = (Array.isArray(s.items) ? s.items : []).filter((i) => isObj(i) && i.picked), top = items.sort((a, b) => (num(b.score) || 0) - (num(a.score) || 0)).slice(0, 2);
      if (!top.length) return withSrc(S, ['money'], now, ['Sibyl has no paper-worthy edge today: no pick. That is an honest answer, not a gap.'], { intent: 'sibyl_pick' });
      const lines = top.map((i) => `${str(i.title, 60)} (n=${num(i.n) != null ? i.n : '?'}): ${num(i.win) != null ? Math.round(i.win * 1000) / 10 + '% won vs ' + Math.round((num(i.break_even) || 0) * 1000) / 10 + '% to break even' : 'see Sibyl'}; paper stake ${usd(num(i.stake_usd))} = 1R${num(i.win_usd) != null ? `, a win is about ${usd(i.win_usd, true)} (${rtxt(i.win_usd / i.stake_usd)})` : ''}.`);
      return withSrc(S, ['money'], now, lines.concat([s.status === 'sample' ? 'These are SAMPLE numbers, not real.' : '', 'Paper only: Sibyl places no bet. Past win rates are not a promise.']), { intent: 'sibyl_pick', open: undefined });
    },
    streams(S, now) {
      const st = J.streams(S);
      if (!st.length) return MISSING('the money streams', 'money/index.json');
      return withSrc(S, ['money'], now, st.slice(0, 6).map((s) => `${str(s.id, 20)}: ${isObj(s.headline) && s.headline.text ? str(s.headline.text, 140) : 'no headline'}${isObj(s.headline) && num(s.headline.usd_month) != null ? ` (about ${usd(s.headline.usd_month)} a month, an estimate)` : ''}${s.status === 'sample' ? ' [sample]' : ''}`), { intent: 'streams' });
    },
    unrated(S, now) {
      if (!isObj(S.odeon)) return MISSING('your trades', 'odeon/trades.json');
      const u = J.unrated(S, now, 14);
      if (!isObj(S.journal)) return withSrc(S, ['odeon'], now, [`${u.length} trades in the last 14 days; I cannot see your journal ratings on this phone, so I count them all as unrated.`], { intent: 'unrated' });
      return withSrc(S, ['odeon'], now, [u.length ? `${u.length} ${u.length === 1 ? 'trade' : 'trades'} from the last 14 days ${u.length === 1 ? 'is' : 'are'} unrated (${both(u.reduce((s, t) => s + t.usd, 0), S, true)} together).` : 'Every trade of the last 14 days is rated. Nice.'], { intent: 'unrated', open: u.length ? 'journal' : undefined });
    },
    household_spend_cat(S, now, args) {
      const H = hh(S); if (!H) return HH_MISSING();
      const q = norm((args && args.q) || ''), last = /\blast month\b/.test(q), M = isObj(H[last ? 'last_month' : 'this_month']) ? H[last ? 'last_month' : 'this_month'] : {};
      const cat = HH_CATS.find(([rx]) => rx.test(q)), id = cat ? cat[1] : null, name = id && isObj(H.categories) && isObj(H.categories[id]) ? str(H.categories[id].name, 40) : id;
      if (!id) return household(S, now, ['Which kind of spending? Say food, gas, rent, subscriptions, shopping, bills, car, health or bank fees.'], 'household_spend_cat');
      const by = isObj(M.by_cat) ? M.by_cat : {}, v = num(by[id]) || 0, other = isObj(H[last ? 'this_month' : 'last_month']) && isObj(H[last ? 'this_month' : 'last_month'].by_cat) ? num(H[last ? 'this_month' : 'last_month'].by_cat[id]) : null;
      const lines = [`${name} in ${str(M.month, 7)}${M.partial ? ' so far' : ''}: ${usd(v)}${other != null ? ` (${last ? 'this month so far' : 'last month'} ${usd(other)})` : ''}.`];
      const fs = id === 'food' && isObj(M.food_subs) ? Object.keys(M.food_subs).filter((k) => num(M.food_subs[k]) > 0) : [];
      if (fs.length) lines.push('Of that: ' + fs.map((k) => `${str(k, 20)} ${usd(M.food_subs[k])}`).join(', ') + '.');
      if (id === 'subscriptions' && isObj(H.subscriptions)) lines.push(`Running subscriptions and bills: ${usd(num(H.subscriptions.usd_month) || 0)} a month (${num(H.subscriptions.active) || 0} found).`);
      return household(S, now, lines, 'household_spend_cat');
    },
    household_month(S, now, args) {
      const H = hh(S); if (!H) return HH_MISSING();
      const last = /\blast month\b/.test(norm((args && args.q) || '')), M = isObj(H[last ? 'last_month' : 'this_month']) ? H[last ? 'last_month' : 'this_month'] : {}, a3 = isObj(H.avg3) ? H.avg3 : {};
      const cats = (Array.isArray(M.cats) ? M.cats : []).filter((c) => isObj(c) && isObj(H.categories) && isObj(H.categories[c.id]) && H.categories[c.id].kind === 'spend' && num(c.usd) > 0).slice(0, 3);
      return household(S, now, [`${str(M.month, 7)}${M.partial ? ' so far' : ''}: ${usd(num(M.out) || 0)} out, ${usd(num(M.in) || 0)} in, net ${usd(num(M.net) || 0, true)}.`,
        cats.length ? 'Biggest: ' + cats.map((c) => `${str(c.name, 40)} ${usd(c.usd)}`).join(', ') + '.' : '',
        num(a3.out) != null ? `A normal month lately: ${usd(a3.out)} out, ${usd(num(a3.in) || 0)} in (the last ${num(a3.months) || 0} full months).` : ''], 'household_month');
    },
    household_subs(S, now) {
      const H = hh(S); if (!H) return HH_MISSING();
      return household(S, now, [str(isObj(H.jarvis) ? H.jarvis.subscriptions : '', 900) || 'No recurring charges found yet.'], 'household_subs');
    },
    household_runway(S, now) {
      const H = hh(S); if (!H) return HH_MISSING();
      return household(S, now, [str(isObj(H.runway) ? H.runway.text : '', 300) || 'I cannot work that out yet: add your balances on the PC.', 'An estimate from your own bank exports and balances, not advice.'], 'household_runway');
    },
    household_networth(S, now) {
      const H = hh(S); if (!H) return HH_MISSING();
      return household(S, now, [str(isObj(H.jarvis) ? H.jarvis.networth : '', 300) || 'No balances entered yet.'], 'household_networth');
    },
    health_sleep(S, now) { return healthLine(S, now, 'sleep', 'health_sleep'); },
    health_steps(S, now) { return healthLine(S, now, 'steps_week', 'health_steps'); },
    health_recovered(S, now) { return healthLine(S, now, 'recovered', 'health_recovered'); },
    feeds(S, now) {
      const f = J.feedHealth(S, now), bad = f.filter((x) => x.missing || x.stale);
      const age = (x) => (x.missing ? 'missing' : x.ageH == null ? 'age unknown' : x.ageH < 1.5 ? 'fresh' : x.ageH < 48 ? Math.round(x.ageH) + ' h old' : Math.round(x.ageH / 24) + ' days old');
      // plain words, never a file name (night-fitperf 2026-11-19); the source tags below keep the files for the curious
      const WHAT = { home: 'Account numbers', money: 'Money estimates', odeon: 'Trade history (replays)', rules: 'The rules list', pythia: 'The news calendar' };
      return reply((bad.length ? `${bad.length} of ${f.length} files need a look.` : 'All the published files look fresh.') + '\n' + f.map((x) => `${WHAT[x.name] || x.name}: ${age(x)}${x.stale ? ' (too old)' : ''}`).join('\n'), { intent: 'feeds', sources: f.map((x) => `${x.file}, ${age(x)}`), speak: bad.length ? `${bad.length} of ${f.length} files need a look.` : 'All the published files look fresh.' });
    },
  };

  // ------------------------------------------------------------------------------------------------ Kalshi (kalshi-brain.js + the City's files)
  // The live feed (sources.kalshi, the brain's facts) when it answers, else the engine's copy in kalshicity/edges.json. How the bot is doing,
  // its risks and size come from kalshi-brain.js's own answer(); the rest is read from the same snapshot. Paper-style: suggestions only.
  const kSnap = (S, now) => { const f = isObj(S.kalshi) ? S.kalshi : null, e = isObj(S.kalshiEdges) ? S.kalshiEdges : null; if (!f && !e) return null; const s2 = KB.snapshot(f, { edges: e, log: S.kalshiLog, learned: S.kalshiLearned }, now); return s2 && s2.ok ? s2 : null; };
  const kNames = (S) => (isObj(S.kalshi) ? ['kalshi'] : []).concat(isObj(S.kalshiEdges) ? ['kalshiEdges'] : []);
  const kR = (v, st) => { const u = st && st.stakeAvg; return u && num(v) != null ? ` (${rtxt(v / u, false)} of a ${usd(u)} average bet)` : ''; };
  const kUsd = (v, sign) => KB.usd(v, sign) || '$0.00';
  const kNote = (s2) => (s2.live ? '' : 'This is the engine\'s copy: the live feed is not answering.');
  const kMissing = () => MISSING('the Kalshi numbers', 'kalshi.json and kalshicity/edges.json');
  const kPositions = (S) => (isObj(S.kalshi) ? S.kalshi.positions : isObj(S.kalshiEdges) && isObj(S.kalshiEdges.book) ? S.kalshiEdges.book.positions : []) || [];
  const kRecent = (S) => (isObj(S.kalshi) && Array.isArray(S.kalshi.trades) ? S.kalshi.trades : isObj(S.kalshiEdges) && isObj(S.kalshiEdges.book) ? S.kalshiEdges.book.recent : []) || [];
  const kTime = (S, s2, now) => withSrc(S, kNames(S), now, [], { sources: kNames(S).map((n) => J.srcTag(S, n, now).text) });
  A.kalshi_status = (S, now) => {
    const sn = kSnap(S, now); if (!sn) return kMissing();
    let r = null; try { r = KB.answer('how is kalshi doing', sn, now); } catch (_) { r = null; }
    const lines = r && r.text ? [r.text] : [`Kalshi: ${sn.paused ? 'paused' : sn.running ? 'running' : 'status unknown'}, balance ${kUsd(sn.balance)}, today ${kUsd(sn.today, true)}${kR(sn.today, sn)}, this week ${kUsd(sn.week, true)}, all time ${kUsd(sn.total, true)}.`];
    return withSrc(S, kNames(S), now, lines.concat([kNote(sn), sn.ledger && sn.ledger.n != null ? `Based on ${sn.ledger.n} settled bets in the engine's ledger.` : '']), { intent: 'kalshi_status', speak: r && r.speak });
  };
  A.kalshi_balance = (S, now) => {
    const sn = kSnap(S, now); if (!sn || sn.balance == null) return kMissing();
    return withSrc(S, kNames(S), now, [`Kalshi balance ${kUsd(sn.balance)}. Today ${kUsd(sn.today, true)}${kR(sn.today, sn)}, this week ${kUsd(sn.week, true)}, all time ${kUsd(sn.total, true)} (${sn.mode || 'live'} money).`, sn.balance < 40 ? 'That is under the $40 floor Jarvis watches.' : '', kNote(sn)], { intent: 'kalshi_balance' });
  };
  A.kalshi_positions = (S, now) => {
    const sn = kSnap(S, now); if (!sn) return kMissing();
    const pos = kPositions(S).filter(isObj);
    if (!pos.length) return withSrc(S, kNames(S), now, ['No open Kalshi bets right now (n=0).', kNote(sn)], { intent: 'kalshi_positions' });
    const sum = pos.reduce((a, p) => a + (num(p.pnl) || 0), 0);
    return withSrc(S, kNames(S), now, [`${pos.length} open ${pos.length === 1 ? 'bet' : 'bets'}, ${kUsd(sum, true)} open P&L${kR(sum, sn)}:`].concat(pos.slice(0, 5).map((p) => `• ${str(p.title || p.ticker, 60)}: ${str(p.side, 4)} ${num(p.contracts) != null ? p.contracts + ' contracts' : ''}${num(p.avg_price) != null ? ' at ' + p.avg_price : ''}${num(p.pnl) != null ? ', ' + kUsd(p.pnl, true) : ''}`), pos.length > 5 ? `…and ${pos.length - 5} more.` : '', kNote(sn)), { intent: 'kalshi_positions' });
  };
  A.kalshi_today = (S, now) => {
    const sn = kSnap(S, now); if (!sn || sn.today == null) return kMissing();
    const day = J.etParts(now).day, rec = kRecent(S).filter((t) => isObj(t) && num(t.t) != null && J.etParts(num(t.t) * 1000).day === day && num(t.pnl) != null);
    const wins = rec.filter((t) => t.pnl > 0).length, head = sn.today > 0.004 ? `Yes: up ${kUsd(sn.today)} today` : sn.today < -0.004 ? `No: down ${kUsd(Math.abs(sn.today))} today` : 'Flat today: $0.00';
    return withSrc(S, kNames(S), now, [`${head}${kR(sn.today, sn)}${rec.length ? `, ${rec.length} settled ${rec.length === 1 ? 'bet' : 'bets'} (n=${rec.length}), ${wins} won` : ''}.`, sn.paused ? 'The bot is paused, so no new bets.' : '', kNote(sn)], { intent: 'kalshi_today' });
  };
  A.kalshi_losers = (S, now) => {
    const E = isObj(S.kalshiEdges) ? S.kalshiEdges : null; if (!E || !Array.isArray(E.edges)) return kMissing();
    const sn = kSnap(S, now), bad = E.edges.filter((e) => isObj(e) && e.size === 1 && num(e.pnl) != null && e.pnl < 0 && (num(e.n) || 0) >= 30).sort((a, b) => a.pnl - b.pnl).slice(0, 4);
    if (!bad.length) return withSrc(S, ['kalshiEdges'], now, ['No bet kind with 30 or more bets is losing money in the engine\'s ledger.'], { intent: 'kalshi_losers' });
    const stopIds = new Set((E.lists && E.lists.stop) || []);
    return withSrc(S, ['kalshiEdges'], now, ['Bet kinds that lost money (30 or more bets, after fees):'].concat(bad.map((e) => `• ${str(e.label, 60)}: ${kUsd(e.pnl, true)}${kR(e.pnl, sn)} over n=${e.n} bets, ${num(e.w) != null ? Math.round(e.w * 1000) / 10 + '% won' : ''}${num(e.p) != null ? ' vs ' + Math.round(e.p * 1000) / 10 + '% needed to break even' : ''}${stopIds.has(e.id) ? ' (the engine says STOP)' : ''}`), 'A losing past is not proof it keeps losing; the engine only says STOP when the sample is big enough.'), { intent: 'kalshi_losers' });
  };
  A.kalshi_edge_research = (S) => {
    const t = isObj(S.kalshiEdge) && typeof S.kalshiEdge.text === 'string' ? S.kalshiEdge : null;      // a published json of the Kalshi edge write-ups (none exists yet)
    if (!t) return { text: 'I do not have that yet: the Kalshi edge research has no published file. I will not guess what it says.', speak: 'I do not have that yet.', intent: 'kalshi_edge_research', missing: true, sources: [] };
    return { text: str(t.text, 600), speak: str(t.text, 300), intent: 'kalshi_edge_research', sources: ['kalshi edge research'] };
  };
  function tradeLine(x, S) {
    const en = isObj(x.entry) ? x.entry : {};
    return `${x.day}: ${str(x.side, 6).toLowerCase() || 'trade'}${x.qty ? ' ' + x.qty + ' micros' : ''}${num(en.px) != null ? ' at ' + en.px : ''} (${str(x.strat || x.bot, 20)}), ${usd(x.usd, true)}${x.r != null ? ` (${rtxt(x.r)} on its own stop` + (x.risk ? `, risk ${usd(x.risk)}` : '') + ')' : ''}.`;
  }

  // next best action: Compass's own rules when importable (the same list the Compass app shows), else the nudges
  async function nextAction(S, now) {
    let C = o.compass || null;
    if (!C) { try { C = await import('../compass/compasscore.js'); } catch (_) { C = null; } }
    if (!isObj(S.home) && !isObj(S.money) && !isObj(S.odeon)) return MISSING('what needs you', 'home.json');
    let list = [];
    if (C) {
      try {
        const ctx = C.context({ home: S.home, money: S.money, rules: S.rules, odeon: S.odeon, journal: S.journal, ledger: S.ledger }, now), st = C.cleanState(S.compassState);
        const l = C.plan ? C.plan(C.actions(ctx), st, now) : C.actions(ctx);
        list = (Array.isArray(l) ? l : (l && (l.top || l.actions)) || []).slice(0, 3).map((a) => ({ title: a.title, why: a.why, usd: a.usd }));
      } catch (_) { list = []; }
    }
    if (!list.length) list = nudgeList(S, { now, max: 3 }).map((n) => ({ title: n.text, why: n.why, usd: n.usd }));
    if (!list.length) return withSrc(S, ['home'], now, ['Nothing needs you right now. The calm choice is to let the bots work.'], { intent: 'next_action' });
    return withSrc(S, ['home', 'money', 'odeon'].filter((n) => isObj(S[n])), now, [`Do this first: ${list[0].title}`, list[0].why ? `Why: ${list[0].why}` : '', list[0].usd ? `At stake: about ${usd(list[0].usd)}${J.asR(list[0].usd, S) != null ? ` (${rtxt(J.asR(list[0].usd, S), false)})` : ''} (an estimate).` : ''].concat(list.slice(1).map((a, i) => `${i + 2}. ${a.title}`)), { intent: 'next_action', open: 'compass' });
  }

  // ------------------------------------------------------------------------------------------------ memory
  function remember(text) {
    const r = mem.remember(text);
    if (!r.ok) return reply(r.reason === 'secret' ? 'I will not keep passwords, keys or card numbers. Nothing saved.' : 'What should I remember?', { intent: 'memory_remember', ok: false });
    const it = r.item;
    return reply(`${r.replaced && r.previous ? 'Updated' : 'Got it'}: ${it.text}. Say "forget ${it.text.split(' ').slice(0, 3).join(' ')}" to remove it. It stays on this phone.`, { intent: 'memory_remember', speak: 'Got it, I will remember that.', memoryId: it.id });
  }
  function recall(topic) {
    if (!topic || !str(topic, 80)) return memList();
    const hits = mem.search(topic, 4), a = (o.assistant && typeof o.assistant.facts === 'function') ? o.assistant.facts() : [];
    const extra = Array.isArray(a) ? a.filter((f) => f && f.text && tokens(topic).some((w) => w.length >= 3 && tokens(f.text).some((x) => fuzzyEq(w, x)))).slice(0, 3).map((f) => f.text) : [];
    if (!hits.length && !extra.length) return reply(`I don't have anything saved about "${str(topic, 40)}". Tell me with "remember that ...".`, { intent: 'memory_recall', missing: true });
    const when = (t) => new Date(t).toISOString().slice(0, 10);
    const lines = hits.map((h) => `• ${h.item.text} (${when(h.item.t)})`).concat(extra.map((t) => `• ${t}`));
    return reply(`You told me:\n${lines.join('\n')}`, { intent: 'memory_recall', speak: `You told me: ${hits.length ? hits[0].item.text : extra[0]}.` });
  }
  function memList() {
    const l = mem.list();
    if (!l.length) return reply('I have nothing saved yet. Say "remember that ..." and I will keep it on this phone.', { intent: 'memory_list', missing: true });
    return reply(`I remember ${l.length} ${l.length === 1 ? 'thing' : 'things'} (newest first):\n` + l.slice(0, 8).map((x) => '• ' + x.text).join('\n') + (l.length > 8 ? `\n…and ${l.length - 8} more. Say "export my data" for all of it.` : ''), { intent: 'memory_list', speak: `I remember ${l.length} things. The newest: ${l[0].text}.` });
  }
  function forget(topic) {
    const t = str(topic, 80);
    if (/^(everything|all|all of it|all my memories|all memories)$/i.test(t)) return reply('That clears everything I remember. Use Settings to wipe it, or say "forget" and a topic.', { intent: 'memory_forget', ok: false });
    const r = t ? mem.forget(t) : { ok: false };
    return r.ok ? reply(`Forgotten: ${r.removed.map((x) => x.text).join('; ')}.`, { intent: 'memory_forget', speak: 'Forgotten.' }) : reply(`I could not find "${t}" in what I remember.`, { intent: 'memory_forget', missing: true });
  }

  // ------------------------------------------------------------------------------------------------ the entry points
  function helpReply() {
    const T = helpTable(), lines = ['Here is what I can do. Every number comes with its dollars, its R and where it came from; anything that changes something asks you first.'];
    for (const g of T) { lines.push('', g.name); for (const it of g.items) lines.push(`• ${it.label}: ${it.examples.map((x) => '"' + x + '"').join(', ')}`); }
    lines.push('', 'Money copilot', `• GO / CAREFUL / SIT OUT, loss budget, pass odds, P&L, what changed, Kalshi: ${COPILOT_EX.map((x) => '"' + x + '"').join(', ')}`);
    lines.push('', 'Find, explain, tour'); for (const it of v3.help) lines.push(`• ${it.label}: ${it.ex.map((x) => '"' + x + '"').join(', ')}`);
    lines.push('', 'I never place, arm or change a trade: paper and suggestions only.');
    return reply(lines.join('\n'), { intent: 'skills_help', groups: T, more: v3.help, speak: 'I can answer from your numbers, open any app, set a goal in the Planner, check Kalshi, and remember things for you. The full list is on screen.' });
  }
  const AN = { weekday_worst: (S, n, a) => A.weekday(S, n, true, a.day), weekday_best: (S, n, a) => A.weekday(S, n, false, a.day) };

  async function answerIntent(r, raw, now, Sover) {
    const a = { ...r.args, q: raw };
    switch (r.intent) {
      case 'navigate': { const known = appsList(); if (known.length && !known.some((x) => x.id === a.target)) return reply(`I do not have an app called ${a.name || a.target}.`, { intent: 'navigate', missing: true }); return actions.plan('open_app', { app: a.target, route: a.route, name: a.name }); }
      case 'atlas_district': { const ids = ZONES[a.district] || [], nm = new Map(appsList().map((x) => [x.id, x.name])); const r2 = await actions.plan('open_district', { district: a.district }); r2.text += ` It holds ${ids.length} apps: ${ids.slice(0, 8).map((i) => nm.get(i) || i).join(', ')}${ids.length > 8 ? '…' : ''}.`; return r2; }
      case 'quiz_start': return actions.plan('start_quiz', {});
      case 'planner_goal': return actions.plan('planner_goal', { text: a.text });
      case 'planner_task': return actions.plan('planner_task', { text: a.text });
      case 'planner_note': return actions.plan('planner_note', { text: a.text });
      case 'planner_event': return actions.plan('planner_event', { text: a.text });
      case 'plan_today': return actions.plan('plan_today', { which: a.which });
      case 'compass_done': return actions.plan('compass_done', { which: a.which });
      case 'export_data': return actions.plan('export_data', {});
      case 'copy_briefing': return actions.plan('copy_briefing', {});
      case 'import_data': return reply('Open Settings, then Storage, then Import, and choose your file. I will not read files by myself. A Jarvis memory file merges in without removing anything.', { intent: 'import_data', open: 'settings' });
      case 'remember': return remember(a.text);
      case 'recall': return recall(a.topic);
      case 'memory_list': return memList();
      case 'forget': return forget(a.topic);
      case 'help_skills': return helpReply();
      case 'kalshi_edge_research': return A.kalshi_edge_research(await sources());
      case 'briefing': return null;               // the brain's own briefing
      default: break;
    }
    const S = Sover || await sources();
    if (r.intent === 'next_action') return nextAction(S, now);
    const fn = AN[r.intent] || A[r.intent];
    return fn ? fn(S, now, a) : null;
  }
  // the money copilot (copilot.js, J1 2026-11-13): "should I trade today", "how much can I lose today", "how close am I to passing", P&L / best and
  // worst trade / $ a month, "what changed since yesterday", Kalshi's day. Loaded on the first question (a missing file = the older answers);
  // asked right after the safety guard, before the follow-ups and the router.
  let cpP = null;
  const copilot = () => { if (!cpP) cpP = import('./copilot.js').then((m) => (m && typeof m.createCopilot === 'function' ? m.createCopilot({ storage: o.storage, now: o.now }) : null)).catch(() => { cpP = null; return null; }); return cpP; };
  async function copilotAsk(text, now) {
    const cp = await copilot(); if (!cp) return null;
    const id = cp.match(text); if (!id) return null;
    const out = cp.answer(id, await sources(), now);
    if (!out || typeof out.text !== 'string') return null;
    try { v3.note(out.intent, {}, { ...out, open: out.app }, text, now); } catch (_) { /* follow-ups are optional: "open it" opens out.app */ }
    return { ...out, routed: out.intent, copilot: true };
  }
  async function early(raw, now) {
    const text = String(raw == null ? '' : raw).slice(0, 500);
    if (!text.trim()) return null;
    const g = v3.guard(text); if (g) return g;
    try { const c = await copilotAsk(text, now); if (c) return c; } catch (_) { /* the older skills carry on */ }
    return v3.early(text, now);
  }
  async function handle(raw, q, opt) {
    const text = String(raw == null ? '' : raw).slice(0, 500);
    if (!text.trim()) return null;
    const now = nowMs(opt && opt.now);
    try { const e = await early(text, now); if (e) return { ...e, routed: e.routed || e.intent, v3: !e.copilot }; } catch (_) { /* the router carries on */ }
    // "and open kronos", "now what is my worst weekday": a leading joining word is not part of the question
    const r = routeText(text, { apps: appsList() }) || routeText(text.replace(/^\s*(?:and|now|ok and|okay and|then|so|and then|and now)\s+/i, ''), { apps: appsList() });
    if (!r) { try { return await v3.explainMissing(text); } catch (_) { return null; } }
    try {
      const out = await answerIntent(r, text, now);
      if (!out) return null;
      v3.note(r.intent, r.args, out, text, now);
      return { intent: out.intent || r.intent, ...out, routed: r.intent, score: r.score };
    } catch (_) { return null; }
  }
  // v3 (skills3.js): safety, follow-ups, tours, the six-line briefing, explain, search. It gets this module's own helpers.
  const v3 = createV3({ J, KB, A: { ...A, weekday: A.weekday }, answerIntent, sources, appsList, actions, reply, withSrc, tag, MISSING, nextAction, now: o.now, getIndex: o.getIndex, getFacts: o.getFacts, getAgents: o.getAgents, getPeople: o.getPeople, people: o.people, helios: o.helios });
  async function contextFor(raw) {
    const r = routeText(String(raw || ''), { apps: appsList() }), now = nowMs(), S = await sources();
    const lines = [];
    const add = (label, rep2) => { if (rep2 && rep2.text && !rep2.missing) lines.push(`${label}: ${rep2.text.replace(/\n+/g, ' ')}`); };
    const want = new Set([r && r.intent].filter(Boolean));
    if (!want.size || ['next_action', 'help_skills'].includes(r && r.intent)) ['drawdown_left', 'pnl_today'].forEach((k) => want.add(k));
    for (const k of want) { if (A[k]) add(k, A[k](S, now, { q: raw })); else if (AN[k]) add(k, AN[k](S, now, {})); }
    if (want.has('next_action') || (r && r.intent === 'next_action')) add('next_action', await nextAction(S, now));
    try { const cp = await copilot(), id = cp && cp.match(String(raw || '')); if (id) add('copilot_' + id, cp.answer(id, S, now)); } catch (_) { /* optional */ }
    const m = mem.search(raw, 3).map((h) => h.item.text);
    if (m.length) lines.push('what the owner told you to remember: ' + m.join(' | '));
    return lines.join('\n');
  }
  async function nudgesFor(opt) { const S = await sources(); return nudgeList(S, { now: nowMs(), ...(opt || {}) }); }
  return {
    handle, contextFor, nudges: nudgesFor, mem, actions, route: (t) => routeText(t, { apps: appsList() }), examples: EXAMPLES.slice(),
    early: (raw, opt) => early(raw, nowMs(opt && opt.now)), copilot: async () => copilot(), card: async (n) => { const cp = await copilot(); return cp ? cp.card(await sources(), nowMs(n)) : null; }, heard: () => v3.heard(), context: (n) => v3.context(nowMs(n)), tours: () => v3.tours(), search: (q, n) => v3.search(q, n), brief: (kind, n) => v3.brief(kind, nowMs(n)),
    explain: (w) => v3.explain(w), agents: (n) => v3.agents(nowMs(n)), claims: (raw) => v3.claims(raw), guard: (raw) => v3.guard(raw),
    confirm: () => actions.confirm(), cancel: () => actions.cancel(), get pending() { return actions.pending; }, answer: (id, S, now, args) => (A[id] ? A[id](S, nowMs(now), args || {}) : null),
  };
}
export default createSkills;
export { ZONES, ZONE_NAME, findApp, norm };
