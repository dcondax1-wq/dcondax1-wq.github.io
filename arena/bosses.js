// ARENA weekly bosses (ES module, no DOM, no clock, no imports but rules.js): four discipline challenges, one fight per week
// (Monday to Friday, New York days). A boss is beaten with discipline, never with money: the checks read only the same
// verifiable events the XP uses (bot_day, clean_trade, rule_broken, journal, goal_day) and never $, size or R.
//
//   BOSSES                                  the four bosses (id, name, glyph, colour, plain-language rule)
//   evaluateWeek(events, mon, today, hour, linked) -> [result]   one result per boss: { id, state, hits, max, parts, note, day }
//        state: 'fighting' | 'slain' | 'escaped' (can no longer be beaten this week) | 'locked' (its source is not linked)
//   history(events, today, hour, linked, n) -> [{ mon, bosses }]  the last n finished weeks
//   bossEvents(results, mon)                -> the XP events (kind 'boss', one per slain boss, id boss:<mon>:<boss>)
//   weekStart(day) / featured(mon)          Monday of a day's week; the boss in the spotlight that week
// "hour" is the New York hour as a decimal: a market day counts as finished from 16:00 (the bot is flat at 15:55).
import { addDays, weekday, dayNumber, cleanEvents } from './rules.js';

export const BOSSES = [
  { id: 'minotaur', name: 'The Minotaur of Revenge', glyph: 'MI', color: '#c96a4a', title: 'No revenge trade',
    text: 'Five market days without a revenge trade: no manual order, no broken rule, never a second trade in a day. A quiet day counts.',
    needs: 'site', max: 5, src: 'Site events (bot_day, clean_trade, rule_broken)' },
  { id: 'cerberus', name: 'Cerberus of the Plan', glyph: 'CE', color: '#e0a060', title: 'Follow the plan',
    text: 'Three heads: at least 2 clean trades this week, not one rule broken, and never more than 4 trades (the plan is 2 to 4 a week).',
    needs: 'site', max: 3, src: 'Site events (clean_trade, rule_broken)' },
  { id: 'sphinx', name: 'The Sphinx of the Journal', glyph: 'SP', color: '#6f9bb8', title: 'Write the journal',
    text: 'Answer the riddle 4 days out of 5: a daily note in the Obsidian vault for that date.',
    needs: 'vault', max: 4, src: 'Obsidian daily notes (this phone)' },
  { id: 'chimera', name: 'The Chimera of Habits', glyph: 'CH', color: '#9bab63', title: 'Hit the daily goal',
    text: 'Meet the daily goal (every habit checked in, or every task of the day done) on 3 days this week.',
    needs: 'planner', max: 3, src: 'Planner daily goal (this phone)' },
];

export const weekStart = (day) => addDays(day, -((weekday(day) + 6) % 7));
export const featured = (mon) => BOSSES[((Math.floor(dayNumber(mon) / 7) % BOSSES.length) + BOSSES.length) % BOSSES.length].id;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function dayStats(evs, day) {
  const o = { site: false, clean: 0, broken: 0, journal: false, goal: false, botDown: false };
  for (const e of evs) {
    if (e.day !== day) continue;
    if (e.src === 'site') o.site = true;
    if (e.kind === 'clean_trade') o.clean++;
    else if (e.kind === 'rule_broken') o.broken++;
    else if (e.kind === 'journal') o.journal = true;
    else if (e.kind === 'goal_day') o.goal = true;
    else if (e.kind === 'bot_down') o.botDown = true;
  }
  return o;
}

export function evaluateWeek(events, mon, today, hour, linked, R) {
  const evs = R ? cleanEvents(events, R) : (Array.isArray(events) ? events : []);
  const lk = linked || {};
  const days = DAYS.map((_, i) => addDays(mon, i));
  const closed = (d) => d < today || (d === today && (+hour || 0) >= 16);
  const weekClosed = closed(days[4]);
  const S = days.map((d) => dayStats(evs, d));
  const fri = days[4];
  const out = [];
  const mk = (b, o) => ({ id: b.id, name: b.name, glyph: b.glyph, color: b.color, title: b.title, text: b.text, src: b.src, week: mon, max: b.max,
    hits: 0, parts: [], state: 'fighting', note: '', day: null, ...o });

  // ---- the Minotaur: a clean day is a hit, a revenge day lets him escape
  {
    const b = BOSSES[0], parts = [];
    let hits = 0, miss = 0;
    days.forEach((d, i) => {
      const s = S[i], trades = s.clean + s.broken, revenge = s.broken > 0 || trades > 1;
      if (!closed(d)) parts.push({ label: DAYS[i], state: 'open' });
      else if (revenge) { parts.push({ label: DAYS[i], state: 'miss' }); miss++; }
      else if (s.site) { parts.push({ label: DAYS[i], state: 'ok' }); hits++; }
      else parts.push({ label: DAYS[i], state: 'nodata' });
    });
    const state = miss ? 'escaped' : hits === 5 ? 'slain' : 'fighting';
    out.push(mk(b, { hits, parts, state, day: state === 'slain' ? fri : null,
      note: miss ? 'A revenge day let him escape this week' : hits === 5 ? 'Five calm days' : `${hits} clean day${hits === 1 ? '' : 's'} of 5` }));
  }
  // ---- Cerberus: three heads, settled on Friday's close
  {
    const b = BOSSES[1];
    const clean = S.reduce((a, s) => a + s.clean, 0), broken = S.reduce((a, s) => a + s.broken, 0), trades = clean + broken;
    const h1 = clean >= 2, h2 = broken === 0, h3 = trades <= 4;
    const parts = [{ label: '2+ clean trades', state: h1 ? 'ok' : weekClosed ? 'miss' : 'open' }, { label: 'No rule broken', state: h2 ? (weekClosed ? 'ok' : 'open') : 'miss' },
      { label: '4 trades at most', state: h3 ? (weekClosed ? 'ok' : 'open') : 'miss' }];
    const hits = (h1 ? 1 : 0) + (h2 && weekClosed ? 1 : 0) + (h3 && weekClosed ? 1 : 0);
    const dead = !h2 || !h3 || (weekClosed && !h1);
    const state = dead ? 'escaped' : weekClosed ? 'slain' : 'fighting';
    out.push(mk(b, { hits, parts, state, day: state === 'slain' ? fri : null,
      note: state === 'slain' ? `${clean} clean trades, none broken` : dead ? (!h2 ? 'A rule was broken' : !h3 ? 'More than 4 trades' : 'Under 2 clean trades') : `${clean} clean trade${clean === 1 ? '' : 's'} so far` }));
  }
  // ---- the Sphinx and the Chimera: count days, beaten as soon as the count is reached
  for (const [bi, key, noun] of [[2, 'journal', 'note'], [3, 'goal', 'goal day']]) {
    const b = BOSSES[bi], parts = [];
    let hits = 0, lastDay = null, misses = 0;
    days.forEach((d, i) => {
      if (S[i][key]) { hits++; lastDay = d; parts.push({ label: DAYS[i], state: 'ok' }); }
      else if (closed(d)) { misses++; parts.push({ label: DAYS[i], state: 'miss' }); }
      else parts.push({ label: DAYS[i], state: 'open' });
    });
    const need = b.max, linkedOk = bi === 2 ? lk.vault : lk.planner;
    let state = hits >= need ? 'slain' : 5 - misses < need ? 'escaped' : 'fighting';
    if (state !== 'slain' && !linkedOk && hits === 0) state = 'locked';
    out.push(mk(b, { hits: Math.min(hits, need), parts, state, day: state === 'slain' ? lastDay : null,
      note: state === 'locked' ? `Link ${bi === 2 ? 'Obsidian' : 'the Planner'} on this phone to fight` : state === 'slain' ? `${hits} ${noun}s` : `${hits} of ${need} ${noun}s` }));
  }
  return out;
}

/** The last n finished weeks, newest first. */
export function history(events, today, hour, linked, n = 4, R) {
  const mon0 = weekStart(today), out = [];
  for (let i = 1; i <= n; i++) { const mon = addDays(mon0, -7 * i); out.push({ mon, bosses: evaluateWeek(events, mon, today, hour, linked, R) }); }
  return out;
}

export function bossEvents(results, mon) {
  return results.filter((r) => r.state === 'slain' && r.day)
    .map((r) => ({ id: `boss:${mon}:${r.id}`, day: r.day, kind: 'boss', src: 'quest', note: `${r.name}: ${r.note}` }));
}

/** counts for the trophies: how many bosses were ever slain (from the boss events) and the best run of weeks with one slain */
export function bossStats(events) {
  const slain = (Array.isArray(events) ? events : []).filter((e) => e && e.kind === 'boss');
  const weeks = [...new Set(slain.map((e) => weekStart(e.day)))].sort();
  let run = 0, best = 0;
  weeks.forEach((w, i) => { run = i && addDays(weeks[i - 1], 7) === w ? run + 1 : 1; best = Math.max(best, run); });
  return { slain: slain.length, weeks: weeks.length, best };
}
