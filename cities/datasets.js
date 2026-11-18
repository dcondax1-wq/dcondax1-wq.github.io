// The dataset adapters of the Cities hub: every city reads ONE normalized dataset, whatever file it came from.
//
//   dataset = { id, title, source, items: [{ id, label, f: { field: number | string } }], fields: [{ key, label, fmt, values? }],
//               demo: boolean, note, label(item) }
//
// An adapter turns one published file (or two) into items; `fields` says what each field means (the stats card prints them,
// the generator reads them by name: district_by, height_by, glow_by, window_by, color_by of a city spec in cities.json).
// A field with `values` holds an index into that list (weekday 0..4 -> 'Mon'..). Derived datasets (sessions, months, streaks,
// the VIX slice of the ideas) are computed from another dataset's items, so one download feeds many cities.
//
// Pure: no DOM, no three.js. `get(url)` is injected (fetch in the page, fs in Node). Every number is data the site already
// publishes (odeon/trades.json, datacity/city.json, tree/tree.json, prometheus/forge.json, pantheon, fates, arena, athena,
// hephaestus, plutus); a file that cannot be loaded falls back to fixture.json (a small sample of the same files, marked demo).
import { comboId, comboLabel, CLS } from '../datacity/data.js';

const F = (key, label, fmt = 'num', extra) => ({ key, label, fmt, ...(extra || {}) });
const DAY = 86400;
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00');
const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
const str = (v, d = '') => (v === null || v === undefined ? d : String(v));
const pad2 = (x) => String(x).padStart(2, '0');

/** 'YYYY-MM-DD' -> epoch seconds (UTC noon, so no day ever slips) */
export const dayT = (day) => Date.parse(day + 'T12:00:00Z') / 1000;
const wdOf = (day) => (new Date(dayT(day) * 1000).getUTCDay() + 6) % 7;
export const weekOf = (day) => new Date((dayT(day) - wdOf(day) * DAY) * 1000).toISOString().slice(0, 10);
const monthOf = (day) => day.slice(0, 7);
/** ET hour and weekday of an epoch second (fixed UTC-5: a chart label, not a clock) */
const clockOf = (t) => ({ hour: Math.floor((((t - 18000) % DAY) + DAY) % DAY / 3600), weekday: (new Date((t - 18000) * 1000).getUTCDay() + 6) % 7 });
const nth = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

/** cumulative P&L, the drawdown from the running peak and the win / loss streak, in time order (adds f.cum, f.dd, f.streak) */
function series(items) {
  items.sort((a, b) => a.f.t - b.f.t || (a.id < b.id ? -1 : 1));
  let cum = 0, peak = 0, streak = 0;
  items.forEach((it, i) => {
    cum += it.f.usd; peak = Math.max(peak, cum);
    streak = it.f.usd > 0 ? (streak > 0 ? streak + 1 : 1) : (streak < 0 ? streak - 1 : -1);
    Object.assign(it.f, { idx: i + 1, cum: Math.round(cum), dd: Math.round(peak - cum), streak, win: it.f.usd > 0 ? 1 : 0 });
  });
  return items;
}

const TRADE_FIELDS = [
  F('day', 'Day', 'date'), F('month', 'Month', 'txt'), F('week', 'Week of', 'txt'), F('weekday', 'Weekday', 'int', { values: WD }),
  F('hour', 'Entry hour (ET)', 'int', { values: HOURS }), F('usd', 'Result', 'usd'), F('r', 'Result in R', 'r'), F('win', 'Won', 'flag'),
  F('exit', 'How it ended', 'txt'), F('side', 'Side', 'txt'), F('cum', 'Account after it', 'usd'), F('dd', 'Below the peak', 'usd'),
  F('streak', 'Streak', 'int'), F('idx', 'Trade number', 'int'),
];

const ODEON_FIELDS = [...TRADE_FIELDS, F('risk_pts', 'Stop distance', 'pts'), F('risk_usd', 'Money at risk', 'usd'), F('qty', 'Micros', 'int'),
      F('stopb', 'Stop size', 'txt'), F('qtyb', 'Size group', 'txt'), F('acct', 'Account', 'txt'), F('bot', 'Bot', 'txt'), F('src', 'Source', 'txt'),
      F('held_min', 'Minutes in trade', 'int'), F('mfe_r', 'Best move', 'r'), F('mae_r', 'Worst move', 'r'), F('plan_rr', 'Planned reward', 'num'),
      F('nlev', 'Levels swept', 'int'), F('t', 'Entry time', 'int'), F('strat', 'Strategy', 'txt')];

// ------------------------------------------------------------------ the adapters
export const DATASETS = {
  // ---- the 60 reels of ODEON: LIT and ATLAS trades with bars, risk, size
  trades: {
    title: 'Odeon trades', source: 'odeon/trades.json', url: '../odeon/trades.json',
    fields: ODEON_FIELDS,
    build(raw) {
      const T = (raw && raw.trades) || [];
      const out = T.map((t) => {
        const off = num(t.off, -18000), et = num(t.entry && t.entry.t) + off, hour = Math.floor((et % DAY) / 3600);
        const rp = num(t.risk_pts), q = num(t.qty, 1);
        const day = str(t.day);
        return { id: str(t.id), label: `${str(t.bot)} ${str(t.side).toLowerCase()} ${day}`, f: {
          t: num(t.entry && t.entry.t), day, month: monthOf(day), week: weekOf(day), weekday: wdOf(day), hour: hour < 0 ? hour + 24 : hour,
          usd: num(t.usd), r: num(t.r), exit: str(t.exit && t.exit.kind, 'END').replace('_', ' '), side: str(t.side).toLowerCase(),
          risk_pts: rp, risk_usd: num(t.risk_usd), qty: q, stopb: rp < 15 ? 'under 15 pts' : rp < 30 ? '15-30 pts' : rp < 50 ? '30-50 pts' : '50+ pts',
          qtyb: q === 1 ? '1 micro' : q <= 3 ? '2-3 micros' : q <= 6 ? '4-6 micros' : '7+ micros', acct: `${str(t.bot)} · ${str(t.src)}`,
          bot: str(t.bot), strat: str(t.strat), src: str(t.src), held_min: num(t.held_min), mfe_r: num(t.mfe_r), mae_r: num(t.mae_r), plan_rr: num(t.plan_rr),
          nlev: (t.levels || []).length } };
      });
      return series(out);
    },
  },

  // ATLAS member Cities are separate historical backtest slices of the published
  // Odeon rows. Recompute the curve on each slice; never carry mixed-bot equity.
  ...Object.fromEntries([['atlas_ema', 'EMA'], ['atlas_macd', 'MACD'], ['atlas_sr', 'S/R']].map(([id, strategy]) => [id, {
    title: `ATLAS ${strategy} historical backtest`, source: `odeon/trades.json (ATLAS ${strategy} backtest rows)`, from: 'trades', historical: true, emptyIsValid: true,
    fields: ODEON_FIELDS.map(f => f.key === 'cum' ? F('cum', 'Strategy backtest cumulative', 'usd') : f.key === 'dd' ? F('dd', 'Strategy backtest drawdown', 'usd') : f.key === 'src' ? F('src', 'Source mode', 'txt') : f),
    derive(base) {
      return series(base.filter(it => it.f.bot === 'ATLAS' && it.f.strat === strategy && it.f.src === 'backtest')
        .map(it => ({ ...it, label: `ATLAS ${strategy} backtest · ${it.f.day}`, f: { ...it.f } })));
    },
  }])),

  // ---- the 631 LIT replay trades of the Data City's harbor (2021 -> now)
  harbor: {
    title: 'LIT replay trades', source: 'datacity/city.json (harbor)', url: '../datacity/city.json',
    fields: [...TRADE_FIELDS, F('year', 'Year', 'txt'), F('t', 'Day', 'int')],
    build(raw) {
      const rows = (raw && raw.harbor && raw.harbor.rows) || [];
      const out = rows.map((r, i) => {
        const day = str(r[0]);
        return { id: `h${i}`, label: `LIT ${num(r[1]) > 0 ? 'long' : 'short'} ${day}`, f: { t: dayT(day), day, month: monthOf(day), year: day.slice(0, 4),
          week: weekOf(day), weekday: wdOf(day), hour: 0, usd: num(r[3]), r: num(r[2]), exit: str(r[4]), side: num(r[1]) > 0 ? 'long' : 'short' } };
      });
      return series(out);
    },
  },

  // ---- one building per trading day / per month / per streak: computed from the trades above
  sessions: {
    title: 'Trading days', source: 'odeon/trades.json', from: 'trades',
    fields: [F('day', 'Day', 'date'), F('week', 'Week of', 'txt'), F('month', 'Month', 'txt'), F('weekday', 'Weekday', 'int', { values: WD }),
      F('n', 'Trades', 'int'), F('usd', 'Day result', 'usd'), F('r', 'Day in R', 'r'), F('best', 'Best trade', 'usd'), F('worst', 'Worst trade', 'usd'),
      F('win', 'Green day', 'flag'), F('cum', 'Account after it', 'usd'), F('qty', 'Micros traded', 'int'), F('t', 'Day', 'int')],
    derive(base) {
      const by = new Map();
      for (const it of base) { const k = it.f.day; (by.get(k) || by.set(k, []).get(k)).push(it); }
      const out = [];
      for (const [day, L] of [...by].sort()) {
        const usd = L.reduce((s, x) => s + x.f.usd, 0);
        out.push({ id: 's' + day, label: `${day} · ${L.length} trade${L.length > 1 ? 's' : ''}`, f: { t: dayT(day), day, week: weekOf(day), month: monthOf(day),
          weekday: wdOf(day), n: L.length, usd: Math.round(usd), r: +L.reduce((s, x) => s + x.f.r, 0).toFixed(2), best: Math.max(...L.map((x) => x.f.usd)),
          worst: Math.min(...L.map((x) => x.f.usd)), win: usd > 0 ? 1 : 0, qty: L.reduce((s, x) => s + x.f.qty, 0), cum: 0 } });
      }
      let c = 0; for (const o of out) { c += o.f.usd; o.f.cum = Math.round(c); }
      return out;
    },
  },
  months: {
    title: 'Months', source: 'datacity/city.json (harbor)', from: 'harbor',
    fields: [F('month', 'Month', 'txt'), F('year', 'Year', 'txt'), F('mon', 'Month of year', 'int', { values: MON }), F('n', 'Trades', 'int'),
      F('usd', 'Month result', 'usd'), F('r', 'Month in R', 'r'), F('winrate', 'Win rate', 'pct'), F('best', 'Best trade', 'usd'), F('worst', 'Worst trade', 'usd'),
      F('win', 'Green month', 'flag'), F('t', 'Month', 'int'), F('cum', 'Account after it', 'usd')],
    derive(base) {
      const by = new Map();
      for (const it of base) { const k = it.f.month; (by.get(k) || by.set(k, []).get(k)).push(it); }
      let c = 0;
      return [...by].sort().map(([m, L]) => {
        const usd = L.reduce((s, x) => s + x.f.usd, 0); c += usd;
        return { id: 'm' + m, label: `${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}`, f: { month: m, year: m.slice(0, 4), mon: +m.slice(5) - 1, n: L.length,
          usd: Math.round(usd), r: +L.reduce((s, x) => s + x.f.r, 0).toFixed(2), winrate: (100 * L.filter((x) => x.f.usd > 0).length) / L.length,
          best: Math.max(...L.map((x) => x.f.usd)), worst: Math.min(...L.map((x) => x.f.usd)), win: usd > 0 ? 1 : 0, t: dayT(m + '-15'), cum: Math.round(c) } };
      });
    },
  },
  streaks: {
    title: 'Streaks', source: 'datacity/city.json (harbor)', from: 'harbor',
    fields: [F('kind', 'Kind', 'txt'), F('len', 'Trades in a row', 'int'), F('usd', 'Money in the run', 'usd'), F('from', 'From', 'date'), F('to', 'To', 'date'),
      F('year', 'Year', 'txt'), F('win', 'Winning run', 'flag'), F('t', 'Start', 'int'), F('worst', 'Worst trade', 'usd')],
    derive(base) {
      const out = [];
      let cur = null;
      for (const it of base) {
        const w = it.f.usd > 0 ? 1 : 0;
        if (!cur || cur.win !== w) { cur = { win: w, L: [] }; out.push(cur); }
        cur.L.push(it);
      }
      return out.map((c, i) => {
        const a = c.L[0].f, b = c.L[c.L.length - 1].f, usd = c.L.reduce((s, x) => s + x.f.usd, 0);
        return { id: 'k' + i, label: `${c.L.length} ${c.win ? 'wins' : 'losses'} in a row, ${a.day}`, f: { kind: c.win ? 'winning run' : 'losing run', len: c.L.length,
          usd: Math.round(usd), from: a.day, to: b.day, year: a.day.slice(0, 4), win: c.win, t: a.t, worst: Math.min(...c.L.map((x) => x.f.usd)) } };
      });
    },
  },

  // ---- which liquidity levels the bots swept (one building per sweep, read from the reels' captions)
  levels: {
    title: 'Swept levels', source: 'odeon/trades.json (events)', from: 'trades', raw: true,
    fields: [F('level', 'Level', 'txt'), F('session', 'Session', 'txt'), F('side', 'High or low', 'txt'), F('family', 'Family', 'txt'), F('usd', 'Trade result', 'usd'),
      F('r', 'Trade in R', 'r'), F('win', 'Won', 'flag'), F('day', 'Day', 'date'), F('hour', 'Hour', 'int', { values: HOURS }), F('t', 'Time', 'int'), F('n', 'Levels in that sweep', 'int')],
    deriveRaw(raw) {
      const out = [];
      for (const t of (raw && raw.trades) || []) {
        for (const [i, e] of (t.events || []).entries()) {
          if (e.k !== 'sweep') continue;
          const text = str(e.text);
          const names = [...text.matchAll(/(?:sweeps? the|and the) ([^()]+?) \(/g)].map((m) => m[1].trim());
          const session = text.split(' sweep')[0].trim() || 'London';
          const hour = Math.floor((((num(e.t) + num(t.off, -18000)) % DAY) + DAY) % DAY / 3600);
          for (const nm of names) {
            out.push({ id: `${t.id}#${i}#${nm}`, label: `${nm}, ${str(t.day)}`, f: { level: nm, session, side: /low/i.test(nm) ? 'low' : 'high', family: nm.split(' ')[0],
              usd: num(t.usd), r: num(t.r), win: num(t.usd) > 0 ? 1 : 0, day: str(t.day), hour, t: num(e.t), n: names.length } });
          }
        }
      }
      return out.sort((a, b) => a.f.t - b.f.t || (a.id < b.id ? -1 : 1));
    },
  },

  // ---- the Data City's 31k tested ideas (time x trigger x while-state), decoded like the Data City page decodes them
  combos: {
    title: 'Tested ideas', source: 'datacity/city.json', url: '../datacity/city.json', heavy: true,
    fields: [F('district', 'District', 'txt'), F('cls', 'Honesty class', 'txt'), F('trig', 'Trigger', 'txt'), F('window', 'Where in the day', 'txt'), F('dir', 'Direction', 'txt'),
      F('e', '$ per trade', 'usd'), F('r', 'R per trade', 'r'), F('wr', 'Win rate', 'pct'), F('n', 'Trades', 'int'), F('tpw', 'Trades a week', 'num'),
      F('e26', '$ per trade 2026', 'usd'), F('n26', 'Trades 2026', 'int'), F('eo', '$ per trade 2021-25', 'usd'), F('fdr', 'Survives the noise guard', 'flag'),
      F('trend', 'Trend', 'txt'), F('vix', 'VIX bucket', 'txt')],
    build(raw) {
      const D = raw && raw.dict, SK = raw && raw.skyline;
      if (!D || !SK || !SK.rows) return [];
      const cols = SK.cols || D.cols, ix = Object.fromEntries(cols.map((k, i) => [k, i])), FL = D.flags;
      const vixFam = D.fams.findIndex((f) => f[0] === 'vix');
      const items = SK.rows.map((row, k) => {
        const g = (n) => row[ix[n]], code = [g('t'), g('w'), g('k1'), g('k2')], fl = g('fl');
        const w = code[1], tr = D.trigs[code[0]];
        const vk = [code[2], code[3]].find((x) => x >= 0 && (x >> 4) === vixFam);
        return { id: comboId(D, code), code, label: null, f: { district: D.districts[g('d')], cls: CLS[g('cls')] || 'grey', trig: tr[1], dir: tr[2] > 0 ? 'long' : 'short',
          window: w >= 100 ? `${pad2(Math.floor(((w - 100) * 15) / 60))}:${pad2(((w - 100) * 15) % 60)} slot` : w < 0 ? 'any time' : D.wins[w], e: g('e'), r: g('r') / 100, wr: g('wr'),
          n: g('n'), tpw: g('tpw') / 100, e26: g('e26'), n26: g('n26'), eo: g('eo'), fdr: fl & FL.fdr ? 1 : 0, trend: fl & FL.rising ? 'rising' : fl & FL.decaying ? 'decaying' : 'steady',
          vix: vk === undefined ? '' : D.fams[vixFam][1][vk & 15] } };
      });
      const lab = (it) => it.label || (it.label = it.code ? comboLabel(D, it.code) : it.id);
      items.lab = lab;
      return items;
    },
  },
  vix: {
    title: 'Ideas by VIX', source: 'datacity/city.json', from: 'combos',
    fields: [], // the same fields as the ideas (copied below)
    derive(base) { return base.filter((it) => it.f.vix); },
  },

  // ---- Daphne's idea trees: every node is one narrowing of a setup
  tree: {
    title: 'Daphne trees', source: 'tree/tree.json', url: '../tree/tree.json',
    fields: [F('root', 'Setup family', 'txt'), F('level', 'Level', 'txt'), F('depth', 'Depth', 'int'), F('n', 'Trades', 'int'), F('excess', '$ over the root', 'usd'),
      F('score', 'Score', 'num'), F('bound', 'Upper bound', 'num'), F('status', 'Status', 'txt'), F('best', 'On the best path', 'flag'), F('oos', '$ out of sample', 'usd'),
      F('oos_n', 'Trades out of sample', 'int'), F('good', 'Beats the root', 'flag')],
    build(raw) {
      if (!raw || !raw.trees) return [];
      const names = raw.status_names || ['open', 'expanded', 'cut', 'leaf'], keyOf = {}, lvl = {};
      for (const r of raw.roots || []) { keyOf[r.id] = str(r.key); lvl[r.id] = str(r.level); }
      const out = [];
      for (const [rid, nodes] of Object.entries(raw.trees)) {
        const list = Array.isArray(nodes) ? nodes : nodes.nodes || [];
        for (const nd of list) {
          const [id, parent, cond, depth, n, excess, score, bound, status, best, oos, oosn] = nd;
          const c = raw.conds && raw.conds[cond];
          out.push({ id: `${rid}:${id}`, label: `${keyOf[rid] || rid}${c ? ' · ' + c[3] : ' · whole setup'}`, f: { root: keyOf[rid] || rid, level: lvl[rid] || '', depth, n, excess, score,
            bound, status: names[status] || 'open', best: best ? 1 : 0, oos, oos_n: oosn, good: excess > 0 ? 1 : 0 } });
        }
      }
      return out;
    },
  },

  // ---- Prometheus: the bred strategy versions
  forge: {
    title: 'Forge versions', source: 'prometheus/forge.json', url: '../prometheus/forge.json',
    fields: [F('gen', 'Generation', 'int'), F('origin', 'How it was born', 'txt'), F('fit', 'Fitness', 'num'), F('pm_h1', '$ a month Jan-Jun', 'usd'), F('pf_h1', 'PF Jan-Jun', 'num'),
      F('pm_h2', '$ a month Jul-Oct', 'usd'), F('pf_h2', 'PF Jul-Oct', 'num'), F('p10_h2', 'Pass in 10 days', 'pct'), F('f10_h2', 'Fail in 10 days', 'pct'),
      F('tpw_h2', 'Trades a week', 'num'), F('pm_y', '$ a month 2021-25', 'usd'), F('champion', 'The champion', 'flag'), F('live', 'The live setting', 'flag')],
    build(raw) {
      if (!raw || !raw.genomes) return [];
      const genOf = {}, orig = { S: 'seed', C: 'child', E: 'elite', R: 'random', L: 'live' };
      (raw.gens || []).forEach((gen, gi) => gen.forEach((g) => { if (genOf[g.k] === undefined) genOf[g.k] = gi; if (!genOf['o' + g.k]) genOf['o' + g.k] = orig[g.o] || 'child'; }));
      const champ = raw.champion && raw.champion.k, live = raw.live && raw.live.k;
      return Object.entries(raw.genomes).map(([k, g]) => {
        const h1 = g.h1 || {}, h2 = g.h2 || {}, y = g.y || {};
        return { id: k, label: `Version ${k}${k === champ ? ' (champion)' : k === live ? ' (live)' : ''}`, f: { gen: genOf[k] ?? 0, origin: genOf['o' + k] || 'child', fit: num(g.f2),
          pm_h1: num(h1.pm), pf_h1: num(h1.pf), pm_h2: num(h2.pm), pf_h2: num(h2.pf), p10_h2: num(h2.p10), f10_h2: num(h2.f10), tpw_h2: num(h2.tpw), pm_y: num(y.pm),
          champion: k === champ ? 1 : 0, live: k === live ? 1 : 0 } };
      });
    },
  },

  // ---- Pantheon: the gods' states (when each world condition was on)
  gods: {
    title: 'Pantheon states', source: 'pantheon/states.json', url: '../pantheon/states.json',
    fields: [F('god', 'God', 'txt'), F('days_on', 'Days on', 'int'), F('pct', 'Share of days on', 'pct'), F('runs', 'Separate runs', 'int'), F('now', 'On now', 'flag'),
      F('longest', 'Longest run (days)', 'int'), F('since', 'Tracked since', 'txt')],
    build(raw) {
      if (!raw || !raw.states) return [];
      return raw.states.map((s) => {
        const on = Array.isArray(s.on) ? s.on.filter(Array.isArray) : [];
        const longest = on.reduce((m, [a, b]) => Math.max(m, Math.round((dayT(b) - dayT(a)) / DAY) + 1), 0);
        return { id: str(s.id), label: str(s.label, s.id), f: { god: str(s.god).replace(/^./, (c) => c.toUpperCase()), days_on: num(s.days_on), pct: Math.min(100, (100 * num(s.days_on)) / 1300),
          runs: on.length, now: s.now ? 1 : 0, longest, since: str(s.from) } };
      });
    },
  },
  feeds: {
    title: 'Data feeds', source: 'pantheon/pantheon.json', url: '../pantheon/pantheon.json',
    fields: [F('kind', 'Source', 'txt'), F('rows', 'Rows', 'int'), F('age', 'Days since the newest row', 'int'), F('ok', 'Healthy', 'flag'), F('newest', 'Newest row', 'txt')],
    build(raw) {
      if (!raw || !raw.sources) return [];
      const now = raw.t ? raw.t * 1000 : Date.parse('2026-11-03T12:00:00Z');
      return raw.sources.map((s, i) => ({ id: str(s.id, 'f' + i), label: str(s.name, s.id), f: { kind: str(s.id).split(':')[0] || 'feed', rows: num(s.rows),
        age: s.newest ? Math.max(0, Math.round((now - Date.parse(s.newest + 'T12:00:00Z')) / (DAY * 1000))) : 99, ok: s.error ? 0 : 1, newest: str(s.newest, 'none') } }));
    },
  },

  // ---- Fates: the simulated evals
  evals: {
    title: 'Simulated evals', source: 'fates/fates.json', url: '../fates/fates.json',
    fields: [F('outcome', 'Outcome', 'txt'), F('days', 'Sessions it ran', 'int'), F('final', 'Profit at the end', 'usd'), F('low', 'Lowest point', 'usd'), F('high', 'Highest point', 'usd'),
      F('pass', 'Passed', 'flag'), F('speed', 'Speed', 'txt')],
    build(raw) {
      const sc = raw && raw.scenarios && (raw.scenarios['eval:zlarior:2026'] || Object.values(raw.scenarios).find((s) => s.kind === 'eval'));
      if (!sc || !sc.threads) return [];
      const OUT = { p: 'passed', s: 'stuck', o: 'still open', f: 'failed' };
      return Array.from(sc.threads.o).map((o, i) => {
        const b = sc.threads.b[i] || [];
        const fin = Array.isArray(b[b.length - 1]) ? 0 : num(b[b.length - 1]);
        const nums = b.filter((x) => Number.isFinite(x));
        return { id: `e${i}`, label: `Simulated eval ${i + 1}: ${OUT[o] || o}`, f: { outcome: OUT[o] || o, days: b.length, final: fin, low: nums.length ? Math.min(...nums) : 0,
          high: nums.length ? Math.max(...nums) : 0, pass: o === 'p' ? 1 : 0, speed: o !== 'p' ? 'n/a' : b.length <= 10 ? 'within 10' : b.length <= 15 ? '11-15' : 'slower' } };
      });
    },
  },
  evalspeed: {
    title: 'Sessions to pass', source: 'fates/fates.json', url: '../fates/fates.json',
    fields: [F('scenario', 'Bot and period', 'txt'), F('bot', 'Bot', 'txt'), F('period', 'Period', 'txt'), F('session', 'Session', 'int'), F('count', 'Evals passing then', 'int'),
      F('cum', 'Passed by then', 'pct'), F('fast', 'Within 10 sessions', 'flag')],
    build(raw) {
      if (!raw || !raw.scenarios) return [];
      const out = [];
      for (const [key, sc] of Object.entries(raw.scenarios)) {
        if (sc.kind !== 'eval' || !sc.summary || !Array.isArray(sc.summary.pass_hist)) continue;
        const H = sc.summary.pass_hist, tot = Math.max(1, H.reduce((a, b) => a + b, 0)), nm = `${str(sc.name)} ${str(sc.period)}`;
        let c = 0;
        H.forEach((n, i) => { c += n; out.push({ id: `${key}#${i + 1}`, label: `${nm}: session ${i + 1}`, f: { scenario: nm, bot: str(sc.name), period: str(sc.period), session: i + 1, count: n,
          cum: (100 * c) / tot, fast: i + 1 <= 10 ? 1 : 0 } }); });
      }
      return out;
    },
  },

  // ---- Arena: the verifiable events that earn XP
  arena: {
    title: 'Arena events', source: 'arena/events.json', url: '../arena/events.json',
    fields: [F('kind', 'Event', 'txt'), F('day', 'Day', 'date'), F('week', 'Week of', 'txt'), F('xp', 'XP', 'int'), F('src', 'Source', 'txt'), F('note', 'Note', 'txt'), F('t', 'Day', 'int')],
    build(raw) {
      const XP = { bot_day: 20, bot_down: 0, clean_trade: 25, rule_broken: 0, plan_week: 60, green_week: 40, lapse: 0, eval_passed: 500, payout: 400, task_done: 5, goal_day: 20,
        habit: 5, journal: 15, kalshi_day: 10, quest: 15, quest_sweep: 25, boss: 100 };
      return ((raw && raw.events) || []).map((e, i) => ({ id: str(e.id, 'a' + i), label: str(e.note, e.kind), f: { kind: str(e.kind).replace(/_/g, ' '), day: str(e.day), week: weekOf(str(e.day, '2026-01-05')),
        xp: XP[e.kind] ?? 5, src: str(e.src), note: str(e.note), t: dayT(str(e.day, '2026-01-05')) } }));
    },
  },

  // ---- Athena's library
  library: {
    title: 'Library', source: 'athena/library.json', url: '../athena/library.json',
    fields: [F('kind', 'Shelf', 'txt'), F('words', 'Words', 'int'), F('links', 'Links to other entries', 'int'), F('tags', 'Tags', 'int'), F('shortw', 'Words in the summary', 'int')],
    build(raw) {
      return ((raw && raw.entries) || []).map((e, i) => {
        const body = Array.isArray(e.body) ? e.body.join(' ') : str(e.body);
        return { id: str(e.id, 'l' + i), label: str(e.title, e.id), f: { kind: str(e.kind), words: body.split(/\s+/).filter(Boolean).length, links: (body.match(/\[\[/g) || []).length,
          tags: (e.tags || []).length, shortw: str(e.short).split(/\s+/).filter(Boolean).length }, text: str(e.short) };
      });
    },
  },

  // ---- Hephaestus: the workshop (tested settings and the rejected ideas)
  workshop: {
    title: 'Workshop', source: 'hephaestus/data.json', url: '../hephaestus/data.json',
    fields: [F('kind', 'Kind', 'txt'), F('net_h2', 'Net Jul-Oct', 'usd'), F('net_h1', 'Net Jan-Jun', 'usd'), F('pf_h2', 'PF Jul-Oct', 'num'), F('pm_h2', '$ a month Jul-Oct', 'usd'),
      F('tpw_h2', 'Trades a week', 'num'), F('p10_h2', 'Pass in 10 days', 'pct'), F('f10_h2', 'Fail in 10 days', 'pct'), F('win_h2', 'Win rate', 'pct'), F('dd_h2', 'Worst drawdown', 'usd')],
    build(raw) {
      if (!raw) return [];
      const out = [];
      for (const s of raw.scenarios || []) {
        const h1 = s.h1 || {}, h2 = s.h2 || {};
        out.push({ id: str(s.id), label: str(s.label, s.id), f: { kind: s.id === 'live' ? 'live setting' : 'tested', net_h2: num(h2.net), net_h1: num(h1.net), pf_h2: num(h2.pf), pm_h2: num(h2.per_month),
          tpw_h2: num(h2.tpw), p10_h2: num(h2.p10), f10_h2: num(h2.f10), win_h2: num(h2.win), dd_h2: num(h2.dd) } });
      }
      (raw.rejected || []).forEach((r, i) => out.push({ id: `rej${i}`, label: str(r.title), f: { kind: 'rejected', net_h2: 0, net_h1: 0, pf_h2: 0, pm_h2: 0, tpw_h2: 0, p10_h2: 0, f10_h2: 0, win_h2: 0, dd_h2: 0 }, text: str(r.text) }));
      return out;
    },
  },

  // ---- Plutus: the prop-firm plans
  plans: {
    title: 'Prop-firm plans', source: 'plutus/plans.json', url: '../plutus/plans.json',
    fields: [F('plan', 'Plan', 'txt'), F('span', 'Period', 'txt'), F('per_month', '$ a month', 'usd'), F('net_6m', 'Net in 6 months', 'usd'), F('p10', 'Pass in 10 days', 'pct'),
      F('f10', 'Fail in 10 days', 'pct'), F('lost', 'Chance of losing it all', 'pct'), F('price', 'Your price', 'usd'), F('evals', 'Evals bought', 'num')],
    build(raw) {
      const out = [];
      for (const p of (raw && raw.plans) || []) {
        for (const [span, s] of Object.entries(p.spans || {})) {
          out.push({ id: `${p.id}#${span}`, label: `${str(p.firm)} ${str(p.name)} (${span})`, f: { plan: `${str(p.firm)} ${str(p.name)}`, span, per_month: num(s.per_month), net_6m: num(s.net_6m),
            p10: num(s.p10), f10: num(s.f10), lost: num(s.lost), price: num(p.price), evals: num(s.evals) } });
        }
      }
      return out;
    },
  },

  // ---- Kalshi: the bot's bets (a remote feed; the sample stands in until it answers)
  kalshi: {
    title: 'Kalshi bets', source: 'kalshi-feed/kalshi.json', local: '../kalshi.json', url: 'https://raw.githubusercontent.com/demetrades2000-coder/kalshi-feed/main/kalshi.json', remote: true,
    fields: [F('asset', 'Asset', 'txt'), F('side', 'Side', 'txt'), F('state', 'State', 'txt'), F('contracts', 'Contracts', 'int'), F('price', 'Price', 'num'), F('pnl', 'Result', 'usd'),
      F('value', 'Value', 'usd'), F('strategy', 'Strategy', 'txt'), F('t', 'Time', 'int'), F('hour', 'Hour (ET)', 'int', { values: HOURS }), F('weekday', 'Weekday', 'int', { values: WD })],
    build(raw) {
      if (!raw || (!Array.isArray(raw.trades) && !Array.isArray(raw.positions))) return [];
      const asset = (r) => str(r.asset || (/^KX([A-Z]+)/.exec(str(r.ticker)) || [])[1], 'OTHER');
      const row = (r, i, state) => ({ id: `${state}${i}:${str(r.ticker)}`, label: str(r.title || r.ticker, 'bet'), f: { asset: asset(r), side: str(r.side).toLowerCase().replace('up', 'yes').replace('down', 'no') || 'yes',
        state, contracts: num(r.contracts), price: num(r.price ?? r.avg_price), pnl: num(r.pnl), value: num(r.value), strategy: str(r.strategy, 'bot'), t: num(r.t) || num(raw.t), ...clockOf(num(r.t) || num(raw.t)) } });
      return [...(raw.trades || []).slice(0, 80).map((r, i) => row(r, i, 'settled')), ...(raw.positions || []).slice(0, 60).map((r, i) => row(r, i, 'open'))];
    },
  },

  // ---- Obsidian: the vault, read through Jarvis's own module on this phone (private: never fetched, never sent)
  notes: {
    title: 'Obsidian notes', source: 'Jarvis vault (this phone)', vault: true,
    fields: [F('kind', 'Kind', 'txt'), F('folder', 'Folder', 'txt'), F('words', 'Words', 'int'), F('links', 'Links', 'int'), F('tags', 'Tags', 'int'), F('age', 'Days since edited', 'int')],
    build(raw) {
      const snap = raw && Array.isArray(raw.notes) ? raw : null;
      if (!snap) return [];
      const now = num(snap.t) ? (snap.t < 1e11 ? snap.t * 1000 : snap.t) : Date.now();
      return snap.notes.slice(0, 5000).map((n, i) => ({ id: str(n.id, 'n' + i), label: str(n.title, n.id), f: { kind: str(n.kind, 'note'), folder: str(n.path).split('/')[0] || 'Vault',
        words: num(n.words), links: (n.links || []).length, tags: (n.tags || []).length, age: Math.max(0, Math.round((now - num(n.mtime) * (n.mtime < 1e11 ? 1000 : 1)) / (DAY * 1000))) } }));
    },
  },
};
DATASETS.vix.fields = DATASETS.combos.fields;

export const DATASET_IDS = Object.keys(DATASETS);
/** each dataset's continent and region on the world map (the catalogue script and the random cities use the same table) */
export const DATASET_GROUP = Object.fromEntries(Object.entries({
  trades: ['trading', 'Odeon reels'], atlas_ema: ['trading', 'ATLAS backtest'], atlas_macd: ['trading', 'ATLAS backtest'], atlas_sr: ['trading', 'ATLAS backtest'], harbor: ['trading', 'LIT replay'], sessions: ['trading', 'Trading days'], months: ['trading', 'Calendar'], streaks: ['trading', 'Streaks'], levels: ['trading', 'Liquidity levels'],
  combos: ['research', 'Tested ideas'], vix: ['research', 'Volatility'], tree: ['research', 'Daphne'], forge: ['research', 'Forge'], workshop: ['research', 'Workshop'], gods: ['research', 'Pantheon'], feeds: ['research', 'Data feeds'],
  evals: ['money', 'Simulated evals'], evalspeed: ['money', 'Simulated evals'], plans: ['money', 'Prop firms'], kalshi: ['kalshi', 'Kalshi bot'], arena: ['life', 'Arena'], library: ['life', 'Library'], notes: ['obsidian', 'The vault'],
}).map(([k, [group, region]]) => [k, { group, region }]));
/** the datasets that share one downloaded file (so one fetch feeds many) */
export const shares = (id) => { const d = DATASETS[id]; return d.from ? shares(d.from) : id; };

/** Field descriptor map of a dataset */
export const fieldMap = (ds) => Object.fromEntries((ds.fields || []).map((f) => [f.key, f]));

const wrap = (id, items, extra) => {
  const d = DATASETS[id];
  return { id, title: d.title, source: d.source, fields: d.fields, items, demo: false, historical: !!d.historical, note: '', label: items.lab || ((it) => it.label || it.id), ...extra };
};

/**
 * Load a dataset. env: { get(url) -> Promise<json> (rejects when the file is missing), fixture: {id: {items, note}}, vault() -> snapshot|null }.
 * Resolves a dataset; never rejects: a missing or empty file gives the fixture sample (demo: true).
 */
export async function loadDataset(id, env, cache) {
  const D = DATASETS[id];
  if (!D) throw new Error('unknown dataset ' + id);
  const memo = cache || (env._cache = env._cache || new Map());
  if (memo.has(id)) return memo.get(id);
  const run = (async () => {
    let items = [], raw = null, real = false;
    try {
      if (D.from && !D.raw) {
        const base = await loadDataset(D.from, env, memo);
        if (!base.demo) { items = D.derive(base.items); real = items.length > 0 || !!D.emptyIsValid; }
        else if (D.emptyIsValid && !(env.fixture && env.fixture[id])) return wrap(id, [], { demo: true, note: 'No verified ATLAS historical backtest rows are available; no source towers are shown.' });
      } else if (D.vault) {
        raw = env.vault ? await env.vault() : null;
        items = D.build(raw); real = items.length > 0;
      } else {
        const url = DATASETS[shares(id)].url, rawMap = env._raw || (env._raw = new Map());
        if (!rawMap.has(url)) {
          const L = DATASETS[shares(id)].local;      // this site's own copy first (pc_publish); the remote url is the fallback
          rawMap.set(url, L ? (async () => { try { const r = await env.get(L); if (r && typeof r === 'object' && !Array.isArray(r)) return r; } catch (_) { /* fall back */ } return env.get(url); })() : env.get(url));
        }
        raw = await rawMap.get(url);
        items = D.deriveRaw ? D.deriveRaw(raw) : D.build(raw);
        real = items.length > 0;
      }
    } catch (e) { real = false; }
    if (real) return wrap(id, items);
    const fx = env.fixture && env.fixture[id];
    if (!fx) return wrap(id, [], { demo: true, note: 'No data yet.' });
    return wrap(id, fx.items.map((it) => ({ ...it })), { demo: true, note: fx.note || `A small sample of ${D.source}: the live file did not answer.` });
  })();
  memo.set(id, run);
  return run;
}
