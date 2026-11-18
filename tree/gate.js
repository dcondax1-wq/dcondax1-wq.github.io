// DAPHNE gate (ES module, JOB 47, 2026-11-04): can a top rule go to the bot? The owner's tests, applied to numbers the search already holds.
// No DOM, no clock, no fetch: rules in, plain facts out. Paper only; a "candidate" is a rule worth the 5-year check, never an order.
//
//   EVAL = { mll: 2000, planMin: 2, planMax: 4, proof: 30, run: 4, horizon: 40, minTrades: 10 }   the MFFU 50K max loss and the owner's frequency plan
//   atBot(period, risk)          -> { usd, r, n } | null   average $ a trade at bot size and the same in R (1R = the bot's risk a trade)
//   monthly(period, risk)        -> { usd, r } | null      $ a month at bot size and the same in R
//   gate(rule, meta)             -> { verdict, passed, checks:[{key, ok, text}] }   candidate / watch / reject against the owner's rules
//   rhythm(rule)                 -> { tpw, stack, weeks, months } | null   trades a week, rules like it for 2 a week, weeks to see 30 live trades
//   lossRun(rule, meta)          -> { k, loss, r, left, odds, wipe, wipeOdds, n } | null   k stop-outs in a row: money lost, Drawdown left of the max loss, odds in the next N trades
//   sortRules(top, key, onlyHolds, meta) -> [{ r, i }]     the list sorted (rank | mo2026 | motest | tpw), optionally only the rules that hold
//   gateHtml(rule, meta) / noteText(rule, meta) / fmtUsd / fmtR   strings for the page (numbers only: rule text is escaped by the caller)

export const EVAL = Object.freeze({ mll: 2000, planMin: 2, planMax: 4, proof: 30, run: 4, horizon: 40, minTrades: 10 });

const num = (x) => (Number.isFinite(+x) && x !== null && x !== '' ? +x : null);
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
export function fmtUsd(v) { const x = num(v); return x === null ? '—' : `${sgn(Math.round(x))}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`; }
export function fmtR(v) { const x = num(v); return x === null ? '—' : `${sgn(Math.round(x * 100) / 100)}${Math.abs(x).toFixed(2)}R`; }
const risk = (meta) => num(meta && meta.bot_risk_usd) || 282;

export function atBot(p, rk) {
  const n = num(p && p.n), net = num(p && p.net_bot);
  if (!n || net === null) return null;
  const usd = net / n; return { usd, r: usd / rk, n };
}
export function monthly(p, rk) {
  const m = num(p && p.mo_bot);
  return m === null ? null : { usd: m, r: m / rk };
}

export function gate(rule, meta) {
  const rk = risk(meta), te = rule.test || {}, y = rule.y2026 || {};
  const yb = atBot(y, rk), tb = atBot(te, rk);
  const checks = [
    { key: 'oos', ok: !!rule.holds, text: rule.holds ? 'Holds out of sample' : 'Fails out of sample' },
    { key: 'y26', ok: !!(yb && yb.usd > 0), text: yb ? (yb.usd > 0 ? '2026 makes money' : '2026 loses money') : 'No 2026 trades' },
    { key: 'test', ok: !!(tb && tb.usd > 0), text: tb ? (tb.usd > 0 ? 'Unseen data makes money at bot size' : 'Unseen data loses money at bot size') : 'No unseen trades' },
    { key: 'n', ok: (num(y.n) || 0) >= EVAL.minTrades, text: `${num(y.n) || 0} trades in 2026 (need ${EVAL.minTrades}+)` },
  ];
  const passed = checks.filter((c) => c.ok).length;
  return { verdict: passed === checks.length ? 'candidate' : passed >= 3 && checks[0].ok ? 'watch' : 'reject', passed, checks };
}

export function rhythm(rule) {
  const tpw = num((rule.y2026 || {}).tpw) ?? num((rule.test || {}).tpw) ?? num((rule.train || {}).tpw);
  if (!tpw || tpw <= 0) return null;
  const weeks = EVAL.proof / tpw;
  return { tpw, stack: Math.ceil(EVAL.planMin / tpw), weeks, months: weeks / 4.33 };
}

/** the odds of a run of k losses in a row somewhere in the next N trades, each trade losing with chance q (a small exact walk) */
export function runOdds(q, k, N) {
  if (!(q > 0)) return 0; if (q >= 1) return 1;
  let s = new Array(k).fill(0); s[0] = 1; let hit = 0;                 // s[j] = chance of sitting on j losses in a row without having hit k
  for (let t = 0; t < N; t++) {
    const nx = new Array(k).fill(0);
    for (let j = 0; j < k; j++) { nx[0] += s[j] * (1 - q); if (j + 1 === k) hit += s[j] * q; else nx[j + 1] += s[j] * q; }
    s = nx;
  }
  return hit;
}

export function lossRun(rule, meta) {
  const rk = risk(meta), p = rule.test && num(rule.test.win) !== null ? rule.test : rule.y2026;
  const win = p ? num(p.win) : null;
  if (win === null) return null;
  const k = EVAL.run, loss = k * rk, wipe = Math.ceil(EVAL.mll / rk), q = 1 - win / 100;
  return { k, loss, r: k, left: Math.max(0, EVAL.mll - loss), odds: runOdds(q, k, EVAL.horizon), wipe, wipeOdds: runOdds(q, wipe, EVAL.horizon), n: EVAL.horizon, win };
}

export function sortRules(top, key, onlyHolds, meta) {
  const rk = risk(meta), val = {
    mo2026: (r) => (monthly(r.y2026, rk) || { usd: -1e9 }).usd,
    motest: (r) => (monthly(r.test, rk) || { usd: -1e9 }).usd,
    tpw: (r) => (rhythm(r) || { tpw: -1 }).tpw,
  }[key];
  const list = (top || []).map((r, i) => ({ r, i })).filter((x) => !onlyHolds || x.r.holds);
  if (val) list.sort((a, b) => val(b.r) - val(a.r) || a.i - b.i);
  return list;
}

export function noteText(rule, meta) {
  const g = gate(rule, meta), rh = rhythm(rule), rk = risk(meta), m = monthly(rule.y2026, rk);
  const head = { candidate: 'CANDIDATE', watch: 'WATCH', reject: 'NOT YET' }[g.verdict];
  return `${head} ${g.passed}/${g.checks.length}` + (m ? ` · 2026 ${fmtUsd(m.usd)}/MO = ${fmtR(m.r)}` : '') + (rh ? ` · ${rh.tpw}/WK` : '');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function gateHtml(rule, meta) {
  const g = gate(rule, meta), rh = rhythm(rule), lr = lossRun(rule, meta), rk = risk(meta);
  const word = { candidate: 'Candidate for the bot', watch: 'Watch, not ready', reject: 'Does not pass' }[g.verdict];
  const cell = (name, p) => {
    const t = atBot(p, rk), mo = monthly(p, rk);
    return `<div><small>${name}</small>${t ? `<b class="${t.usd >= 0 ? 'pos' : 'neg'}">${fmtUsd(t.usd)} · ${fmtR(t.r)}</b><small>a trade</small>` : '<b>—</b><small>no trades</small>'}`
      + `${mo ? `<b class="${mo.usd >= 0 ? 'pos' : 'neg'}">${fmtUsd(mo.usd)} · ${fmtR(mo.r)}</b><small>a month</small>` : ''}</div>`;
  };
  let h = `<div class="gate g-${g.verdict}"><p class="gv"><b>${word}</b><span>${g.passed} of ${g.checks.length} checks</span></p>`
    + `<ul class="gc">${g.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${esc(c.text)}</li>`).join('')}</ul>`
    + `<div class="gm">${cell('Unseen', rule.test)}${cell('2026', rule.y2026)}</div>`;
  if (rh) {
    h += `<p class="gl"><b>How often:</b> ${rh.tpw} a week. It would take ${rh.stack} like it to make ${EVAL.planMin} a week. `
      + `${EVAL.proof} live trades to prove it take about ${rh.weeks >= 104 ? Math.round(rh.weeks / 52 * 10) / 10 + ' years' : rh.weeks >= 9 ? Math.round(rh.months) + ' months' : Math.round(rh.weeks) + ' weeks'}.</p>`;
  }
  if (lr) {
    h += `<p class="gl"><b>Losing run:</b> ${lr.k} stop-outs in a row = ${fmtUsd(-lr.loss)} (−${lr.k}R). Drawdown left ${fmtUsd(lr.left).replace('+', '')} of ${fmtUsd(EVAL.mll).replace('+', '')} max loss. `
      + `Odds of that run in the next ${lr.n} trades: ${Math.round(lr.odds * 100)}%. ${lr.wipe} in a row would use the whole max loss: ${Math.round(lr.wipeOdds * 100)}%.</p>`;
  }
  return h + `<p class="gl dim">1R = ${fmtUsd(rk).replace('+', '')}, the bot's risk a trade. Paper only.</p></div>`;
}
