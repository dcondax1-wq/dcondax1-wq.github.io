// HEPHAESTUS core (pure: no DOM, no network, no clock, no storage). The page hands it data.json (built by tools/hephaestus_build.py from the
// STORED backtest runs) and the dial settings; it answers which stored setting that is, which dial values exist ("not tested" for the rest),
// the plain verdict against the live setting, and the rows of the numbers table. It never computes a strategy result.

export const HALVES = ['h1', 'h2'];
export const HALF_NAME = { h1: 'Jan-Jun', h2: 'Jul-Oct' };

export function dialIds(data) { return ((data && data.dials) || []).map((d) => d.id); }

/** the selectable stored setting whose dials equal `dials` (all of them), or null */
export function find(data, dials) {
  if (!data || !Array.isArray(data.scenarios)) return null;
  const ids = dialIds(data);
  return data.scenarios.find((s) => s.selectable && ids.every((k) => s.dials && s.dials[k] === dials[k])) || null;
}
export const byId = (data, id) => ((data && data.scenarios) || []).find((s) => s.id === id) || null;

/** is the option v of dial `id` reachable with the OTHER dials as they are now (a stored run exists)? */
export function tested(data, dials, id, v) { return !!find(data, { ...dials, [id]: v }); }

/** the dial values present in at least one stored setting at all (for the "never tested" wording) */
export function anyTested(data, id, v) { return ((data && data.scenarios) || []).some((s) => s.selectable && s.dials && s.dials[id] === v); }

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
export function usd(v, sign = false) {
  const n = num(v); if (n == null) return '-';
  const a = Math.abs(Math.round(n)).toLocaleString('en-US');
  return (n < 0 ? '-$' : sign && n > 0 ? '+$' : '$') + a;
}
export const dec = (v, d = 2) => (num(v) == null ? '-' : v.toFixed(d));
export const pct = (v) => (num(v) == null ? '-' : v.toFixed(1) + '%');

/** the table rows: key in the stored half object, label, formatter, which way is better (+1 higher, -1 lower, 0 neutral) */
export const ROWS = [
  { k: 'net', label: 'Net $', f: (v) => usd(v), good: 1 },
  { k: 'per_month', label: '$ / month', f: (v) => usd(v), good: 1 },
  { k: 'pf', label: 'Profit factor', f: (v) => dec(v), good: 1 },
  { k: 'dd', label: 'Max drawdown', f: (v) => usd(v), good: 1 },
  { k: 'p10', label: 'Eval pass in 2 wks', f: pct, good: 1 },
  { k: 'f10', label: 'Eval fail in 2 wks', f: pct, good: -1 },
  { k: 'tpw', label: 'Trades / week', f: (v) => dec(v), good: 0 },
];

function win(a, b) { return num(a.net) != null && num(b.net) != null && a.net > b.net && (a.pf || 0) > (b.pf || 0); }

/** the plain verdict of setting `sc` against what it is judged on. kind: live | beats | tradeoff | mixed | still */
export function verdict(data, sc) {
  if (!sc) return { kind: 'none', head: 'Not tested', plain: 'No stored run has this exact mix of dials, so there is no number to show.', flags: [], ref: null, halves: {} };
  if (sc.id === data.live_id) return { kind: 'live', head: 'This is the live setting', plain: 'This is what the bot runs. Turn a dial to see what the stored tests say about a change.', flags: [], ref: sc, halves: {} };
  const ref = byId(data, sc.ref) || byId(data, data.live_id);
  const halves = {}, flags = [];
  for (const h of HALVES) {
    const a = sc[h] || {}, b = ref[h] || {};
    halves[h] = { win: win(a, b), netUp: num(a.net) != null && a.net > b.net, dNet: num(a.net) != null && num(b.net) != null ? a.net - b.net : null, dPf: num(a.pf) != null && num(b.pf) != null ? a.pf - b.pf : null };
  }
  const wins = HALVES.filter((h) => halves[h].win).length, netUp = HALVES.every((h) => halves[h].netUp);
  const tpwOk = HALVES.every((h) => (sc[h].tpw || 0) >= 2);
  if (!tpwOk) flags.push('Fewer than 2 trades a week in a half.');
  if (HALVES.some((h) => (sc[h].f10 || 0) > (ref[h].f10 || 0) + 2)) flags.push('More evals fail inside 2 weeks.');
  if (sc.base_confirm && ref.id !== data.live_id) flags.push(`Judged against its own twin run (confirm window ${sc.base_confirm}), not today's.`);
  let kind, head, plain;
  if (wins === 2 && tpwOk) { kind = 'beats'; head = 'This beats live in both halves'; plain = 'More money and a better profit factor than live in Jan-Jun and in Jul-Oct. A lead to study, not a change: nothing here touches the bot.'; }
  else if (wins === 2) { kind = 'mixed'; head = 'Beats live, but breaks the rules'; plain = 'Better numbers in both halves, but it does not keep 2 or more trades a week.'; }
  else if (wins === 0 && netUp) { kind = 'tradeoff'; head = 'More money, weaker edge'; plain = 'It makes more dollars than live in both halves but with a lower profit factor. Live keeps the better edge.'; }
  else if (wins === 0) { kind = 'still'; head = 'The live setting is still best'; plain = 'Not better than live in either half. Live stays.'; }
  else { kind = 'mixed'; head = 'Mixed: wins one half'; plain = `Better than live only in ${HALF_NAME[HALVES.find((h) => halves[h].win)]}. The rule: pick on Jan-Jun, it must hold in Jul-Oct. Live stays.`; }
  return { kind, head, plain, flags, ref, halves };
}

/** the table: for each row [label, {h1:{v,ref,d}, h2:{...}}] with already formatted text and the colour class of the difference */
export function table(data, sc) {
  const ref = (sc && byId(data, sc.ref)) || byId(data, data.live_id) || sc;
  if (!sc) return [];
  return ROWS.map((r) => {
    const cells = {};
    for (const h of HALVES) {
      const a = sc[h] ? sc[h][r.k] : null, b = ref && ref[h] ? ref[h][r.k] : null;
      let cls = '';
      if (r.good && num(a) != null && num(b) != null && a !== b) cls = (a - b) * r.good > 0 ? 'up' : 'down';
      cells[h] = { v: r.f(a), ref: r.f(b), cls, same: ref === sc || a === b };
    }
    return { k: r.k, label: r.label, cells };
  });
}

/** the one-line summary the Jarvis card and the verdict dock use */
export function summary(data, sc) {
  if (!sc) return 'Not tested';
  const y = sc.y26 || {};
  return `${usd(y.net)} · PF ${dec(y.pf)} · ${usd(sc.h2 && sc.h2.per_month)}/mo H2`;
}

/** colour per verdict kind (the page and the scene share it) */
export const KIND_COLOR = { live: '#c8a24a', beats: '#7f8a52', tradeoff: '#4b7a99', mixed: '#e0b060', still: '#9a8f7d', none: '#7a6f5f' };

// ---------------------------------------------------------------------------------------------- JOB 4+5 (2026-11-04): recipes, compare,
// history, the report card. Still pure and still only a reader: every recipe is one STORED run picked by a rule over its stored numbers;
// nothing is computed that the stored runs do not already hold.

const sel = (data) => ((data && data.scenarios) || []).filter((s) => s.selectable && s.h1 && s.h2 && s.y26);
const worst = (s, k) => Math.max(num(s.h1[k]) || 0, num(s.h2[k]) || 0);
const best = (list, score) => list.reduce((a, b) => (score(b) > score(a) ? b : a), list[0]);

/** the preset recipes: which STORED run each rule picks ({ id, name, rule, sc }); the live setting first */
export function presets(data) {
  const l = sel(data); if (!l.length) return [];
  const live = byId(data, data.live_id) || l[0];
  const ok = l.filter((s) => HALVES.every((h) => (s[h].tpw || 0) >= 2));
  const pool = ok.length ? ok : l;
  const safe = best(pool, (s) => -(worst(s, 'f10') * 1000 + Math.abs(s.y26.dd || 0) / 10) + (s.y26.pf || 0) / 100);
  const aggr = best(l, (s) => s.y26.net || 0);
  const fast = best(l, (s) => (s.h1.p10 || 0) + (s.h2.p10 || 0));
  const sharp = best(pool, (s) => Math.min(s.h1.pf || 0, s.h2.pf || 0));
  const rows = [
    { id: 'live', name: 'Live', rule: 'what the bot runs today', sc: live },
    { id: 'safe', name: 'Safe', rule: 'the fewest evals failing inside 2 weeks, then the smallest drawdown (2+ trades a week kept)', sc: safe },
    { id: 'aggressive', name: 'Aggressive', rule: 'the most 2026 dollars of any stored run', sc: aggr },
    { id: 'fast', name: 'Fast pass', rule: 'the most evals passed inside 2 weeks', sc: fast },
    { id: 'sharp', name: 'Sharp edge', rule: 'the best profit factor in the weaker half', sc: sharp },
  ];
  return rows.map((r) => ({ ...r, same: r.id !== 'live' && r.sc.id === live.id, blurb: `${r.name}: ${r.rule}. ${summary(data, r.sc)}.${r.id !== 'live' && r.sc.id === live.id ? ' Nothing stored beats the live setting on this rule: live is already the pick.' : ''}` }));
}

/** two settings side by side: rows with both values (formatted) and who is better in each half; a plain line for B against A */
export function compare(data, a, b) {
  if (!a || !b) return { rows: [], line: 'Pin one setting, then turn the dials to another one.', winner: null };
  const rows = ROWS.map((r) => {
    const cells = {};
    for (const hf of HALVES) {
      const x = a[hf] ? a[hf][r.k] : null, y = b[hf] ? b[hf][r.k] : null;
      let who = '';
      if (r.good && num(x) != null && num(y) != null && x !== y) who = (y - x) * r.good > 0 ? 'b' : 'a';
      cells[hf] = { a: r.f(x), b: r.f(y), who };
    }
    return { k: r.k, label: r.label, cells };
  });
  if (a.id === b.id) return { rows, line: 'Both sides are the same setting.', winner: null };
  const bw = HALVES.filter((h) => win(b[h] || {}, a[h] || {})).length, aw = HALVES.filter((h) => win(a[h] || {}, b[h] || {})).length;
  const winner = bw === 2 ? 'b' : aw === 2 ? 'a' : null;
  const line = winner === 'b' ? 'B beats A on both halves: more money and a better profit factor in Jan-Jun and in Jul-Oct.'
    : winner === 'a' ? 'A beats B on both halves: more money and a better profit factor in Jan-Jun and in Jul-Oct.'
      : bw || aw ? `Split: ${bw ? 'B' : 'A'} wins ${bw || aw} half, the other side wins the other. The rule is to pick on Jan-Jun and confirm on Jul-Oct.` : 'Neither side beats the other on both money and profit factor in either half: a trade-off, read the rows.';
  return { rows, line, winner };
}

/** the history of settings tried: newest first, no repeat of the same run in a row, at most `max` */
export function pushHistory(list, entry, max = 12) {
  const l = Array.isArray(list) ? list.filter((e) => e && e.id) : [];
  if (!entry || !entry.id) return l.slice(0, max);
  if (l[0] && l[0].id === entry.id) return l.slice(0, max);
  return [entry, ...l.filter((e) => e.id !== entry.id)].slice(0, max);
}

/** the text of the report card image: a title, the verdict, four big numbers, the two halves, a footer (all from the stored run) */
export function cardModel(data, sc, v) {
  if (!sc) return null;
  const y = sc.y26 || {};
  return {
    title: 'HEPHAESTUS · REPORT CARD',
    name: sc.label || sc.id,
    head: (v && v.head) || '',
    plain: (v && v.plain) || '',
    big: [['2026 net', usd(y.net)], ['Per month', usd(y.per_month)], ['Profit factor', dec(y.pf)], ['Max drawdown', usd(y.dd)]],
    rows: ROWS.filter((r) => ['net', 'pf', 'p10', 'f10', 'tpw'].includes(r.k)).map((r) => [r.label, r.f(sc.h1 && sc.h1[r.k]), r.f(sc.h2 && sc.h2[r.k])]),
    foot: `Stored run ${sc.run}. Read-only: nothing here changes the bot.`,
    kind: (v && v.kind) || 'none',
  };
}
