// HERMES story cards. deck(w, key, peers) -> [card]; each card:
//   {id, name, colors: [3 x #rrggbb], mode: the scene (fx.js: 0 flow, 1 rays, 2 rings, 3 orbs, 4 aurora, 5 warp, 6 grid),
//    ms: how long it shows, html: its markup (every data text escaped), enter(el, fx, still): counters / lines / particles
//    when it opens, share(): the share image's spec (share.js)}
// Order: money, best, worst, eval, discipline, learned, Data City (if any), Kalshi (or a teaser), Planner (if any),
// the all-time hall, next. A card's parts carry data-z (how far they float off the card in the 3D tilt).
import { esc, usd, tone, plural, dayLabel, span, num, kalshiPeriod, plannerPeriod } from './data.js';
import { extraCards } from './cards2.js';

const NBSP = ' ';
const kt = (text, cls = 'title') => `<h1 class="${cls} kt">${String(text).split(' ').map((w, i) => `<span class="w"><span style="--i:${i}">${esc(w)}</span></span>`).join(' ')}</h1>`;
const kick = (p, extra) => `<p class="kicker">${esc(p.label)} · ${esc(span(p))}${extra ? ' · ' + esc(extra) : ''}</p>`;
const counter = (v, cls = '') => `<span class="count ${cls} ${tone(v)}" data-to="${num(v) || 0}">${esc(usd(0))}</span>`;
const R = (r) => (num(r) == null ? '' : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}R`);

// ------------------------------------------------------------------------------------------------ small parts
function sparkSVG(s, cls) {
  const pts = (s && s.points) || [];
  if (pts.length < 2) return '';
  // the scale holds the path, the entry and the stop; the target only when it is near (an 8R target far away would flatten a loss)
  const p0 = Math.min(...pts), p1 = Math.max(...pts), near = (v) => num(v) != null && v >= p0 - (p1 - p0) * 1.5 && v <= p1 + (p1 - p0) * 1.5;
  const lv = [s.stop, s.entry].filter((x) => num(x) != null).concat(near(s.target) ? [s.target] : []);
  const all = pts.concat(lv), lo = Math.min(...all), hi = Math.max(...all), r = hi - lo || 1;
  const W = 320, H = 120, P = 8, X = (i) => P + (i / (pts.length - 1)) * (W - 2 * P), Y = (v) => P + (1 - (v - lo) / r) * (H - 2 * P);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const line = (v, c, t) => (num(v) == null ? '' : `<line x1="0" x2="${W}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="lvl ${c}"/><text x="${W - 4}" y="${(Y(v) - 4).toFixed(1)}" class="lvt ${c}">${t}</text>`);
  return `<figure class="spark ${cls}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="trade path">
    ${near(s.target) ? line(s.target, 'tgt', 'target') : ''}${line(s.stop, 'stp', 'stop')}${line(s.entry, 'ent', 'entry')}
    <path d="${d}" class="path" pathLength="1"/><circle r="5" class="dot" cx="${X(pts.length - 1).toFixed(1)}" cy="${Y(pts[pts.length - 1]).toFixed(1)}"/></svg>
    <figcaption>${s.kind === 'bars' ? 'Price during the trade (5m closes)' : 'Trade path: entry, best point, exit (not every tick)'}</figcaption></figure>`;
}

function dayBars(days) {
  if (!days || !days.length) return '';
  const m = Math.max(...days.map(([, v]) => Math.abs(v))) || 1;
  return `<div class="bars" aria-label="P&amp;L per day">${days.slice(-23).map(([d, v], i) => `<div class="dbar ${tone(v)}" style="--h:${Math.max(4, Math.abs(v) / m * 100).toFixed(1)}%;--i:${i}"><i></i><b>${esc(dayLabel(d, { weekday: 'narrow' }))}</b></div>`).join('')}</div>`;
}

function ring(p, cls, label) {
  const C = 2 * Math.PI * 52;
  return `<svg viewBox="0 0 120 120" class="ring ${cls}" aria-label="${esc(label)}"><circle cx="60" cy="60" r="52" class="trk"/>
    <circle cx="60" cy="60" r="52" class="arc" style="--c:${C.toFixed(1)};--p:${Math.max(0, Math.min(1, p)).toFixed(4)}"/></svg>`;
}

// ------------------------------------------------------------------------------------------------ the cards
function money(w, p, peers) {
  const all = w.periods.all, kp = kalshiPeriod(peers.kalshi, p), up = p.net >= 0;
  const row = (name, tag, sub, v) => `<li><span>${esc(name)}${tag ? ` <em>${esc(tag)}</em>` : ''}<small>${esc(sub)}</small></span><span class="${tone(v)}">${esc(usd(v))}</span></li>`;
  const bots = p.bots.map((b) => row(b.name, b.paper ? 'paper' : '', plural(b.trades, 'trade'), b.net)).join('');
  const twin = p.paper_twin ? `<p class="note">Paper twin ${esc(usd(p.paper_twin.net))}: the same trades on paper, not counted twice.</p>` : '';
  const ks = kp ? row(kp.name, 'real money', 'Kalshi', kp.net) : '';
  return {
    id: 'money', name: 'The money', colors: up ? ['#100c08', '#7f8a52', '#c8a24a'] : ['#100c08', '#483327', '#e0907a'], mode: up ? 4 : 1, ms: 8000,
    html: `${kick(p)}${kt(p.trades ? (up ? 'The bots made money' : 'A red stretch. Here it is.') : 'No trades yet')}
      <div class="hero" data-z="3">${counter(p.net, 'xl')}<p class="sub">${esc(plural(p.trades, 'trade'))} · ${p.wins} won · ${p.losses} lost${p.win_pct != null ? ` · ${p.win_pct}% wins` : ''}</p></div>
      <div class="split"><div><small>Won</small><b class="up">${esc(usd(p.won_usd))}</b></div><div><small>Lost</small><b class="down">${esc(usd(p.lost_usd))}</b></div>
      <div><small>Per month</small><b class="${tone(p.per_month)}">${esc(usd(p.per_month, { cents: false }))}</b>${p.key !== 'all' ? `<i>at this pace \u00b7 avg ${esc(usd(all.per_month, { cents: false }))}</i>` : '<i>average</i>'}</div></div>
      ${dayBars(p.days)}<ul class="bots">${bots}${ks}</ul>${twin}`,
    enter(el, fx) {
      if (!p.trades) return;
      fx.burst(up ? 'coins' : 'embers', up ? 60 : 50, { colors: up ? ['#c8a24a'] : ['#e0907a', '#e0907a'] });
      if (up) fx.burst('confetti', 80, { colors: ['#9bab63', '#c8a24a', '#f3ece0', '#6f9bb8', '#b08064'] });   // a green week: confetti
    },
    share: () => ({ kicker: `${p.label} · ${span(p)}`, title: 'The money', big: usd(p.net), tone: tone(p.net),
      lines: [`${plural(p.trades, 'trade')}: ${p.wins} won, ${p.losses} lost`, `Won ${usd(p.won_usd)} · Lost ${usd(p.lost_usd)}`,
        `${usd(p.per_month, { cents: false })} a month at this pace`].concat(p.bots.map((b) => `${b.name} ${usd(b.net)}`)) }),
  };
}

function best(w, p) {
  const b = p.best;
  if (!b) return null;
  return {
    id: 'best', name: 'Best trade', colors: ['#0f0c08', '#3f4529', '#9bab63'], mode: 0, ms: 7500,
    html: `${kick(p)}${kt('Trade of the week'.replace('week', p.key === 'all' ? 'all time' : p.key))}
      <div class="hero" data-z="3">${counter(b.pnl, 'lg')}<p class="sub">${esc(b.bot)} · ${esc(b.side || '')} · ${esc(dayLabel(b.day, { weekday: 'short', month: 'short', day: 'numeric' }))}${b.time ? ' ' + esc(b.time) : ''} · ${esc(R(b.r))}</p></div>
      ${sparkSVG(b.spark, 'up')}
      <p class="fact">${esc(b.exit ? `Exit: ${b.exit}.` : '')} ${b.qty ? esc(`${b.qty} micros`) + ', ' : ''}${b.risk_pts ? esc(`${b.risk_pts}-pt stop`) : ''}${b.paper ? ' (paper)' : ''}</p>`,
    enter(el, fx) { fx.burst('sparks', 50, { y: 0.55, colors: ['#9bab63', '#f3ece0'] }); },
    share: () => ({ kicker: `${p.label} · best trade`, title: `${b.bot} · ${dayLabel(b.day)}`, big: usd(b.pnl), tone: 'up', spark: b.spark.points,
      lines: [`${b.side || ''} · ${R(b.r)}${b.exit ? ' · ' + b.exit : ''}`] }),
  };
}

function worst(w, p) {
  const b = p.worst;
  if (!b) {
    if (!p.trades) return null;
    return { id: 'worst', name: 'Worst trade', colors: ['#110e0a', '#3f4429', '#9bab63'], mode: 2, ms: 5500,
      html: `${kick(p)}${kt('No losing trade. Not one.')}<p class="lesson">Every trade closed green or flat. Enjoy it; it will not always look like this.</p>`,
      enter() {}, share: () => ({ kicker: p.label, title: 'No losing trade', big: '0 losses', tone: 'up', lines: [`${plural(p.trades, 'trade')}, all green or flat`] }) };
  }
  return {
    id: 'worst', name: 'Worst trade', colors: ['#110d09', '#4c291d', '#e0a060'], mode: 2, ms: 8500,
    html: `${kick(p)}${kt('The one that hurt')}
      <div class="hero" data-z="3">${counter(b.pnl, 'lg')}<p class="sub">${esc(b.bot)} · ${esc(b.side || '')} · ${esc(dayLabel(b.day, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${esc(R(b.r))}</p></div>
      ${sparkSVG(b.spark, 'down')}<blockquote class="lesson"><small>The lesson</small>${esc(b.lesson || '')}</blockquote>`,
    enter() {},
    share: () => ({ kicker: `${p.label} · worst trade`, title: `${b.bot} · ${dayLabel(b.day)}`, big: usd(b.pnl), tone: 'down', spark: b.spark.points, lines: [b.lesson || ''] }),
  };
}

function evalCard(w, p, peers) {
  const E = w.eval || [];
  if (!E.length) return null;
  const odds = peers.fates ? `<p class="odds"><b>${esc(peers.fates.value)}</b> ${esc(peers.fates.label)} <small>(Fates)</small></p>`
    : w.odds ? `<p class="odds"><b>${esc(w.odds.p10)}%</b> pass within 2 weeks · ${esc(w.odds.f10)}% fail <small>(backtest ${esc(w.odds.span)}, the live sizing)</small></p>` : '';
  const rows = E.map((e) => {
    const done = e.to_target <= 0;
    return `<div class="ev"><div class="rings">${ring(e.progress, 'prog', 'progress to the target')}${ring(e.room_frac, 'room', 'room above the floor')}
      <span class="pct">${Math.round(e.progress * 100)}%</span></div><div class="evt"><b>${esc(e.bot)} · ${esc(e.plan || e.name)}</b>
      <span>${done ? 'Target reached' : `${esc(usd(e.profit))} of ${esc(usd(e.target, { sign: false, cents: false }))} · ${esc(usd(e.to_target, { sign: false, cents: false }))} to go`}</span>
      <span>${e.room != null ? `Drawdown left ${esc(usd(e.room, { sign: false, cents: false }))}${e.mll != null ? ` of ${esc(usd(e.mll, { sign: false, cents: false }))}` : ''}` : ''}</span></div></div>`;
  }).join('');
  return {
    id: 'eval', name: 'Evals', colors: ['#140f0a', '#8b7259', '#6f9bb8'], mode: 6, ms: 8000,
    html: `<p class="kicker">Evals · now</p>${kt('Road to funded')}<div class="evs" data-z="2">${rows}</div>${odds}
      <p class="note">Outer ring: profit to the target. Inner ring: room above the trailing floor.</p>`,
    enter(el, fx) { if (E.some((e) => e.to_target <= 0)) fx.burst('confetti', 90, { colors: ['#6f9bb8', '#c8a24a', '#f3ece0', '#b08064'] }); },
    share: () => ({ kicker: 'Evals', title: 'Road to funded', big: `${Math.round(E[0].progress * 100)}%`, tone: E[0].progress >= 1 ? 'up' : 'flat',
      lines: E.map((e) => `${e.bot} ${e.plan || e.name}: ${usd(e.profit)} of ${usd(e.target, { sign: false, cents: false })}, floor ${usd(e.room, { sign: false, cents: false })} below`) }),
  };
}

function disciplineCard(w, p) {
  const d = p.discipline || {};
  if (d.score == null) return null;
  const rows = (d.rules || []).map((r, i) => `<li style="--i:${i}" class="${r.ok ? 'ok' : 'miss'}"><span class="mk">${r.ok ? '✓' : '✕'}</span><span>${esc(r.label)}</span><b>${r.kept}/${r.total}</b></li>`).join('');
  return {
    id: 'discipline', name: 'Discipline', colors: ['#0a0805', '#50371e', '#e0a060'], mode: 3, ms: 7500,
    html: `${kick(p)}${kt('Discipline score')}<div class="score" data-z="3"><span class="count big" data-to="${d.score}" data-fmt="int">0</span><small>/100</small></div>
      <ul class="rules">${rows}</ul><p class="note">Checked from the trades: ${esc(d.kept)} of ${esc(d.checked)} rule checks kept.</p>`,
    enter(el, fx) { if (d.score >= 90) fx.burst('sparks', 40, { colors: ['#e0a060', '#f3ece0'] }); },
    share: () => ({ kicker: `${p.label} · discipline`, title: 'Rules kept', big: `${d.score}/100`, tone: d.score >= 90 ? 'up' : d.score >= 70 ? 'flat' : 'down',
      lines: (d.rules || []).map((r) => `${r.ok ? '✓' : '✕'} ${r.label} ${r.kept}/${r.total}`) }),
  };
}

function learnedCard(w) {
  const L = w.learned || [];
  if (!L.length) return null;
  return {
    id: 'learned', name: 'Learned', colors: ['#140f0a', '#8b7259', '#b08064'], mode: 0, ms: 9500,
    html: `<p class="kicker">What the bots learned</p>${kt('Smarter than last week')}<ol class="learn">${L.map((x, i) => `<li style="--i:${i}"><small>${esc(x.tag)}</small>${esc(x.text)}</li>`).join('')}</ol>
      <p class="note">Read-only: nothing changes until you approve it.</p>`,
    enter() {}, share: () => ({ kicker: 'What the bots learned', title: 'Smarter than last week', big: `${L.length} lessons`, tone: 'flat', lines: L.map((x) => x.text) }),
  };
}

function discoveryCard(w, p, peers) {
  const d = peers.discovery;
  if (!d) return null;
  return {
    id: 'discovery', name: 'Discovery', colors: ['#0e0b08', '#332a21', '#6f9bb8'], mode: 3, ms: 7500,
    html: `<p class="kicker">Data City · discovery of the week</p>${kt(d.title || 'Discovery')}
      ${d.usd != null ? `<div class="hero" data-z="3">${counter(d.usd, 'lg')}</div>` : d.stat ? `<div class="hero"><span class="count lg flat">${esc(d.stat)}</span></div>` : ''}
      <p class="lesson">${esc(d.text)}</p>`,
    enter(el, fx) { fx.burst('sparks', 30, { colors: ['#6f9bb8', '#f3ece0'] }); },
    share: () => ({ kicker: 'Data City · discovery', title: d.title || 'Discovery', big: d.usd != null ? usd(d.usd) : d.stat || '', tone: tone(d.usd), lines: [d.text] }),
  };
}

function kalshiCard(w, p, peers) {
  const k = kalshiPeriod(peers.kalshi, p);
  if (!k) {
    return { id: 'kalshi', name: 'Kalshi', colors: ['#0d0a07', '#393e25', '#9bab63'], mode: 1, ms: 5000,
      html: `<p class="kicker">Kalshi · coming soon</p>${kt('The prediction bot joins next')}<p class="lesson">Once the Kalshi bot publishes its feed, its week shows up here: real money, wins, losses, the best strategy.</p>`,
      enter() {}, share: () => ({ kicker: 'Kalshi', title: 'Coming soon', big: 'Kalshi', tone: 'flat', lines: ['The prediction bot joins the recap once its feed is live.'] }) };
  }
  return {
    id: 'kalshi', name: 'Kalshi', colors: ['#0d0a07', '#393e25', '#9bab63'], mode: 1, ms: 7000,
    html: `${kick(p, 'real money')}${kt(k.name)}<div class="hero" data-z="3">${counter(k.net, 'lg')}<p class="sub">${k.balance != null ? `Balance ${esc(usd(k.balance, { sign: false }))} · ` : ''}${esc(plural(k.wins, 'win'))} · ${esc(plural(k.losses, 'loss', 'losses'))} (all time)</p></div>
      ${dayBars(k.days)}${k.top ? `<p class="fact">Best strategy: ${esc(k.top.name)} ${esc(usd(k.top.pnl))}</p>` : ''}${k.running ? '' : '<p class="note">The bot reports it is stopped.</p>'}`,
    enter(el, fx) { if (k.net > 0) fx.burst('coins', 40, { colors: ['#9bab63'] }); },
    share: () => ({ kicker: `${p.label} · Kalshi`, title: k.name, big: usd(k.net), tone: tone(k.net), lines: [k.balance != null ? `Balance ${usd(k.balance, { sign: false })}` : ''] }),
  };
}

function plannerCard(w, p, peers) {
  const P = peers.planner === undefined ? plannerPeriod(p) : peers.planner;
  if (!P) return null;
  const hab = P.habits.map((h) => `<li><span>${esc(h.name)}</span><b>${h.n}×</b></li>`).join('');
  return {
    id: 'planner', name: 'Planner', colors: ['#0e0b08', '#593e22', '#e0a060'], mode: 0, ms: 7000,
    html: `${kick(p, 'Planner')}${kt('Off the charts too')}<div class="split"><div><small>Tasks done</small><b>${P.done}</b></div><div><small>Still open</small><b>${P.open}</b></div><div><small>Events</small><b>${P.events}</b></div></div>
      ${hab ? `<ul class="bots">${hab}</ul>` : ''}${P.top.length ? `<p class="fact">Done: ${P.top.map(esc).join(' · ')}</p>` : ''}`,
    enter() {}, share: () => ({ kicker: `${p.label} · Planner`, title: 'Off the charts too', big: `${P.done} done`, tone: 'flat', lines: P.habits.map((h) => `${h.name}: ${h.n}×`) }),
  };
}


// ------------------------------------------------------------------------------------------------ new cards (2026-11-03)
const EVAL_FEE = 91.8;                      // the owner's real Builder 50K price, one-time (CLAUDE.md), so "a month pays the fee N times" is his number

/** Money a month: the pace of this period against the all-time average, what it is a week / a trading day / a year, and what a
 *  month of it covers (the eval fee). A pace, not a promise: said on the card. */
function paceCard(w, p) {
  const all = w.periods.all;
  if (!p.trades || num(p.per_month) == null) return null;
  const pm = p.per_month, avg = num(all.per_month), top = Math.max(Math.abs(pm), Math.abs(avg || 0), 1);
  const bar = (label, v, cls) => `<div class="pbar ${cls}"><span>${esc(label)}</span><i style="--w:${(Math.abs(v) / top * 100).toFixed(1)}%"></i><b class="${tone(v)}">${esc(usd(v, { cents: false }))}</b></div>`;
  const cell = (k, v) => `<div><small>${esc(k)}</small><b class="${tone(v)}">${esc(usd(v, { cents: false }))}</b></div>`;
  const fees = pm > 0 ? Math.floor(pm / EVAL_FEE) : 0;
  const rel = avg ? pm / avg : null;
  return {
    id: 'pace', name: 'Per month', colors: pm >= 0 ? ['#100d09', '#41472a', '#c8a24a'] : ['#110d09', '#402d22', '#e0907a'], mode: 2, ms: 8000,
    html: `${kick(p)}${kt(pm >= 0 ? 'At this pace, a month is' : 'At this pace, a month costs')}
      <div class="hero" data-z="3">${counter(pm, 'xl gold').replace('class="count', 'data-fmt="usd0" class="count')}<p class="sub">a month, if every month looked like ${esc(p.label.toLowerCase())}</p></div>
      <div class="pbars" data-z="2">${bar(p.label, pm, 'now')}${avg != null && p.key !== 'all' ? bar('All-time average', avg, 'avg') : ''}</div>
      <div class="split">${cell('A week', pm * 12 / 52)}${cell('A trading day', pm / 21)}${cell('A year', pm * 12)}</div>
      ${pm > 0 ? `<p class="fact">One month covers the $${EVAL_FEE.toFixed(2)} Builder 50K eval fee <b class="up">${fees}×</b>${rel != null && p.key !== 'all' ? ` · ${rel >= 1 ? `${rel.toFixed(1)}× your all-time pace` : `${Math.round(rel * 100)}% of your all-time pace`}` : ''}.</p>` : ''}
      <p class="note">A pace, not a promise: ${esc(plural(p.trades, 'trade'))} is a small sample. Paper and eval accounts, losses included.</p>`,
    enter(el, fx) { if (pm > 0) fx.burst('coins', 40, { colors: ['#c8a24a', '#f3ece0'] }); },
    share: () => ({ kicker: `${p.label} · money a month`, title: pm >= 0 ? 'At this pace, a month is' : 'At this pace, a month costs', big: usd(pm, { cents: false }), tone: tone(pm),
      lines: [`${usd(pm * 12 / 52, { cents: false })} a week · ${usd(pm / 21, { cents: false })} a trading day`, avg != null ? `All-time average ${usd(avg, { cents: false })} a month` : '',
        `${plural(p.trades, 'trade')} · a pace, not a promise`].filter(Boolean) }),
  };
}

/** The report card: profit factor, the average win against the average loss, what a trade is worth, and the win bar. */
function reportCard(w, p) {
  if (!p.trades || !(p.wins + p.losses)) return null;
  const won = Math.abs(num(p.won_usd) || 0), lost = Math.abs(num(p.lost_usd) || 0);
  const pf = lost > 0 ? won / lost : null, aw = p.wins ? won / p.wins : null, al = p.losses ? lost / p.losses : null;
  const payoff = aw != null && al ? aw / al : null, exp = p.net / p.trades, wp = p.win_pct != null ? p.win_pct : (p.wins / (p.wins + p.losses)) * 100;
  const plaque = (label, value, sub, cls = '') => `<div class="plaque ${cls}" data-oly-fx="shimmer"><small>${esc(label)}</small><b>${esc(value)}</b><i>${esc(sub)}</i></div>`;
  const grade = pf == null ? 'A+' : pf >= 3 ? 'A+' : pf >= 2 ? 'A' : pf >= 1.5 ? 'B' : pf >= 1 ? 'C' : 'D';
  return {
    id: 'report', name: 'Report card', colors: ['#130f0a', '#594939', '#6f9bb8'], mode: 6, ms: 8000,
    html: `${kick(p)}${kt('The report card')}
      <div class="hero grade" data-z="3"><span class="count lg ${pf != null && pf < 1 ? 'down' : 'up'}" data-fmt="grade">${esc(grade)}</span><p class="sub">${pf == null ? 'No losing trade' : `Profit factor ${pf.toFixed(2)}: every $1 lost brought $${pf.toFixed(2)}`}</p></div>
      <div class="wl" data-z="2" aria-label="${esc(p.wins)} wins, ${esc(p.losses)} losses"><i class="w" style="--w:${wp.toFixed(1)}%"></i><i class="l"></i><b>${esc(Math.round(wp))}% won</b></div>
      <div class="plaques" data-z="2">
        ${plaque('Average win', aw != null ? usd(aw, { cents: false }) : '—', plural(p.wins, 'winner'), 'up')}
        ${plaque('Average loss', al != null ? usd(-al, { cents: false }) : '—', plural(p.losses, 'loser'))}
        ${plaque('Win / loss size', payoff != null ? `${payoff.toFixed(1)} : 1` : '—', 'the average win against the average loss')}
        ${plaque('A trade is worth', usd(exp, { cents: false }), 'average, losses included', exp >= 0 ? 'up' : '')}
      </div>`,
    enter(el, fx) { if (pf == null || pf >= 2) fx.burst('glitter', 50, { colors: ['#6f9bb8', '#f3ece0', '#b08064'] }); },
    share: () => ({ kicker: `${p.label} · report card`, title: 'The report card', big: grade, tone: pf != null && pf < 1 ? 'down' : 'up',
      lines: [pf != null ? `Profit factor ${pf.toFixed(2)}` : 'No losing trade', `${Math.round(wp)}% won · ${plural(p.trades, 'trade')}`,
        aw != null && al != null ? `Average win ${usd(aw, { cents: false })} · average loss ${usd(-al, { cents: false })}` : '', `A trade is worth ${usd(exp, { cents: false })} on average`].filter(Boolean) }),
  };
}

/** The green streak: this month at a glance as a calendar heat map (the last 5 weeks of trading days), the run you are on and the record. */
function streakCard(w, p) {
  const days = ((w.periods.all && w.periods.all.days) || []).filter((d) => Array.isArray(d) && num(d[1]) != null).slice().sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (days.length < 3) return null;
  let cur = 0, rec = 0, run = 0;
  days.forEach(([, v]) => { run = v > 0 ? run + 1 : 0; rec = Math.max(rec, run); });
  for (let i = days.length - 1; i >= 0 && days[i][1] > 0; i--) cur++;
  const m = Math.max(...days.map(([, v]) => Math.abs(v))) || 1, last = days.slice(-35);
  const cells = last.map(([d, v], i) => `<i class="hc ${tone(v)}" style="--a:${(0.25 + 0.75 * Math.min(1, Math.abs(v) / m)).toFixed(2)};--i:${i}" title="${esc(dayLabel(d))} ${esc(usd(v, { cents: false }))}"></i>`).join('');
  const green = last.filter(([, v]) => v > 0).length;
  return {
    id: 'streak', name: 'Streak', colors: ['#0e0b08', '#663727', '#e0a060'], mode: 3, ms: 7500,
    html: `<p class="kicker">Streak · the last ${esc(plural(last.length, 'trading day'))}</p>${kt(cur >= 2 ? `${cur} green days in a row` : cur === 1 ? 'A green day on the board' : 'The streak starts again')}
      <div class="hero" data-z="3"><span class="count xl gold" data-to="${cur}" data-fmt="int">0</span><p class="sub">${cur === 1 ? 'green day' : 'green days'} in a row now · the record is ${esc(plural(rec, 'day'))}</p></div>
      <div class="heat" data-z="2" role="img" aria-label="${green} green days of ${last.length}">${cells}</div>
      <p class="note">${green} green of the last ${last.length} trading days. Brighter = a bigger day. Paper and eval accounts, losses included.</p>`,
    enter(el, fx) { if (cur >= 3) fx.burst('embers', 40, { colors: ['#e0a060', '#e0a060', '#f3ece0'] }); },
    share: () => ({ kicker: 'Streak', title: cur >= 2 ? `${cur} green days in a row` : 'The streak', big: `${cur}`, tone: cur ? 'up' : 'flat',
      lines: [`Record: ${plural(rec, 'day')} in a row`, `${green} of the last ${last.length} trading days green`] }),
  };
}

// ------------------------------------------------------------------------------------------------ new cards (2026-11-04): best day, best week, accounts
// They use the OLYMPUS effects library (../olympus/fx-*.js) when the page has it: confetti / sparkles from the hero number, a shimmer on the
// plaques. Without it (or on still / LITE) the cards read the same and the story's own particles play instead.
const OFX = () => window.OLYMPUS_FX || null;
const lib = (name, el, opts, fallback, fx) => {
  const L = OFX(), host = el && el.querySelector('.hero');
  if (L && L[name] && host) L[name](host, opts); else if (fallback) fx.burst(fallback[0], fallback[1], fallback[2]);
};
/** Monday of the week of an ISO day (UTC arithmetic on the calendar day, no time zones involved) */
function mondayOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)), dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
/** weekly sums of the all-time days: [[monday, net, tradingDays]] oldest first */
export function weekSums(days) {
  const m = new Map();
  for (const d of days || []) if (Array.isArray(d) && num(d[1]) != null && mondayOf(d[0])) { const k = mondayOf(d[0]), c = m.get(k) || [0, 0]; m.set(k, [c[0] + num(d[1]), c[1] + 1]); }
  return [...m.entries()].map(([k, [v, n]]) => [k, Math.round(v * 100) / 100, n]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Best day of the period: the biggest green day, its share of the period's profit, the days around it. */
function bestDayCard(w, p) {
  const days = (p.days || []).filter((d) => Array.isArray(d) && num(d[1]) != null);
  const top = days.reduce((a, d) => (!a || d[1] > a[1] ? d : a), null);
  if (!top || top[1] <= 0) return null;
  const share = p.net > 0 ? Math.min(100, Math.round((top[1] / p.net) * 100)) : null, green = days.filter(([, v]) => v > 0).length;
  return {
    id: 'bestday', name: 'Best day', colors: ['#0f0c08', '#3f4529', '#c8a24a'], mode: 4, ms: 7500,
    html: `${kick(p)}${kt('The best day')}<div class="hero" data-z="3">${counter(top[1], 'xl gold')}<p class="sub">${esc(dayLabel(top[0], { weekday: 'long', month: 'short', day: 'numeric' }))}</p></div>
      ${dayBars(days)}<div class="split"><div><small>Share of the profit</small><b class="up">${share != null ? share + '%' : '—'}</b></div><div><small>Green days</small><b>${green}/${days.length}</b></div></div>
      <p class="note">One day out of ${esc(plural(days.length, 'trading day'))}. Paper and eval accounts, losses included.</p>`,
    enter(el, fx) { lib('sparkleBurst', el, { count: 30 }, ['sparks', 50, { y: 0.45, colors: ['#c8a24a', '#f3ece0'] }], fx); },
    share: () => ({ kicker: `${p.label} · best day`, title: dayLabel(top[0], { weekday: 'long', month: 'short', day: 'numeric' }), big: usd(top[1]), tone: 'up',
      lines: [share != null ? `${share}% of the period's profit in one day` : '', `${green} of ${days.length} trading days green`].filter(Boolean) }),
  };
}

/** Best week ever: weekly sums of every day on record, the best one on top, the last eight weeks as bars. */
function bestWeekCard(w, p) {
  const W = weekSums((w.periods.all && w.periods.all.days) || []);
  if (W.length < 2) return null;
  const top = W.reduce((a, x) => (!a || x[1] > a[1] ? x : a), null);
  if (!top || top[1] <= 0) return null;
  const last = W.slice(-8), m = Math.max(...last.map((x) => Math.abs(x[1]))) || 1, green = W.filter((x) => x[1] > 0).length, avg = W.reduce((a, x) => a + x[1], 0) / W.length;
  const bars = `<div class="bars" aria-label="P&amp;L per week">${last.map(([d, v], i) => `<div class="dbar ${tone(v)}" style="--h:${Math.max(4, Math.abs(v) / m * 100).toFixed(1)}%;--i:${i}"><i></i><b>${esc(dayLabel(d, { month: 'numeric', day: 'numeric' }))}</b></div>`).join('')}</div>`;
  return {
    id: 'bestweek', name: 'Best week', colors: ['#080705', '#50371e', '#c8a24a'], mode: 2, ms: 7500,
    html: `<p class="kicker">All time · ${esc(plural(W.length, 'week'))} on record</p>${kt('The best week ever')}<div class="hero" data-z="3">${counter(top[1], 'xl gold')}<p class="sub">Week of ${esc(dayLabel(top[0], { month: 'short', day: 'numeric' }))} · ${esc(plural(top[2], 'trading day'))}</p></div>
      ${bars}<div class="split"><div><small>Green weeks</small><b class="up">${green}/${W.length}</b></div><div><small>Average week</small><b class="${tone(avg)}">${esc(usd(avg, { cents: false }))}</b></div></div>`,
    enter(el, fx) { lib('confetti', el, { count: 90 }, ['confetti', 80, { colors: ['#c8a24a', '#f3ece0', '#9bab63', '#f3ece0'] }], fx); },
    share: () => ({ kicker: 'All time · best week', title: `Week of ${dayLabel(top[0])}`, big: usd(top[1]), tone: 'up', lines: [`${green} of ${W.length} weeks green`, `${plural(top[2], 'trading day')} that week`] }),
  };
}

/** Accounts: the period's money by account (eval, funded, paper), each with its bot and its share of the move. */
function accountsCard(w, p) {
  const by = new Map();
  for (const b of p.bots || []) {
    const k = b.account || b.name, c = by.get(k) || { name: k, net: 0, trades: 0, bots: [] };
    c.net += num(b.net) || 0; c.trades += num(b.trades) || 0; c.bots.push(b.name);
    by.set(k, c);
  }
  const rows = [...by.values()].filter((r) => r.trades || r.net).sort((a, b) => b.net - a.net);
  if (!rows.length) return null;
  const top = Math.max(...rows.map((r) => Math.abs(r.net)), 1), sum = rows.reduce((a, r) => a + r.net, 0), ev = (w.eval || []).length;
  const bar = (r) => `<div class="pbar ${r.net < 0 ? 'avg' : 'now'}"><span>${esc(r.name)}</span><b class="${tone(r.net)}">${esc(usd(r.net, { cents: false }))}</b><i style="--w:${(Math.abs(r.net) / top * 100).toFixed(1)}%"></i></div>`;
  return {
    id: 'accounts', name: 'Accounts', colors: ['#140f0a', '#8b7259', '#c8a24a'], mode: 6, ms: 7500,
    html: `${kick(p)}${kt('Where the money sits')}<div class="hero" data-z="3">${counter(sum, 'lg gold')}<p class="sub">${esc(plural(rows.length, 'account'))} · ${esc(plural(rows.reduce((a, r) => a + r.trades, 0), 'trade'))}</p></div>
      <div class="pbars" data-z="2">${rows.slice(0, 4).map(bar).join('')}</div>
      <ul class="bots">${rows.slice(0, 4).map((r) => `<li><span>${esc(r.bots.join(', '))}<small>${esc(plural(r.trades, 'trade'))}</small></span><span class="${tone(r.net)}">${sum ? Math.round((r.net / Math.abs(sum)) * 100) : 0}%</span></li>`).join('')}</ul>
      <p class="note">${ev ? `${esc(plural(ev, 'eval account'))} on the road to funded (see the Evals card). ` : ''}Paper twins are not counted twice.</p>`,
    enter(el, fx) { lib('sparkleBurst', el, { count: 24 }, ['sparks', 36, { y: 0.45, colors: ['#c8a24a', '#6f9bb8'] }], fx); },
    share: () => ({ kicker: `${p.label} · accounts`, title: 'Where the money sits', big: usd(sum, { cents: false }), tone: tone(sum), lines: rows.slice(0, 4).map((r) => `${r.name} ${usd(r.net, { cents: false })} (${plural(r.trades, 'trade')})`) }),
  };
}

/** The all-time hall: the lifetime numbers and the records (best trade, best day, longest green run, win rate). */
function hallStats(all) {
  if (!all || !all.trades) return null;
  const days = (all.days || []).filter((d) => Array.isArray(d) && num(d[1]) != null);
  let bestDay = null, run = 0, streak = 0;
  for (const [d, v] of days) {
    if (!bestDay || v > bestDay[1]) bestDay = [d, v];
    run = v > 0 ? run + 1 : 0;
    streak = Math.max(streak, run);
  }
  return { net: all.net, perMonth: all.per_month, trades: all.trades, winPct: all.win_pct, from: all.from, best: all.best || null,
    bestDay: bestDay && bestDay[1] > 0 ? bestDay : null, streak, greenDays: days.filter(([, v]) => v > 0).length, days: days.length };
}

function hallCard(w) {
  const H = hallStats(w.periods.all);
  if (!H) return null;
  const plaque = (label, value, sub, cls = '') => `<div class="plaque ${cls}" data-oly-fx="shimmer"><small>${esc(label)}</small><b>${esc(value)}</b><i>${esc(sub)}</i></div>`;
  const b = H.best;
  return {
    id: 'hall', name: 'Hall of fame', colors: ['#080705', '#412d19', '#c8a24a'], mode: 5, ms: 8500,
    html: `<p class="kicker">All time · since ${esc(dayLabel(H.from, { month: 'short', day: 'numeric', year: 'numeric' }))}</p>${kt('The hall of fame', 'title hall-t')}
      <div class="hero" data-z="3">${counter(H.net, 'xl gold')}<p class="sub">${esc(plural(H.trades, 'trade'))} · ${esc(usd(H.perMonth, { cents: false }))} a month on average</p></div>
      <div class="plaques" data-z="2">
        ${b ? plaque('Best trade ever', usd(b.pnl), `${b.bot} · ${dayLabel(b.day)}`, 'up') : ''}
        ${H.bestDay ? plaque('Best day', usd(H.bestDay[1]), dayLabel(H.bestDay[0], { weekday: 'short', month: 'short', day: 'numeric' }), 'up') : ''}
        ${plaque('Longest green run', plural(H.streak, 'day'), `${H.greenDays} of ${H.days} trading days green`)}
        ${H.winPct != null ? plaque('Win rate', `${H.winPct}%`, 'every trade, losses included') : ''}
      </div>`,
    enter(el, fx) { fx.burst('glitter', 70, { colors: ['#c8a24a', '#f3ece0', '#c8a24a'] }); },
    share: () => ({ kicker: 'All time · the hall of fame', title: 'The hall of fame', big: usd(H.net), tone: tone(H.net),
      lines: [b ? `Best trade: ${b.bot} ${usd(b.pnl)} (${dayLabel(b.day)})` : '', H.bestDay ? `Best day: ${usd(H.bestDay[1])} (${dayLabel(H.bestDay[0])})` : '',
        `Longest green run: ${plural(H.streak, 'day')}`, H.winPct != null ? `Win rate ${H.winPct}% over ${plural(H.trades, 'trade')}` : ''].filter(Boolean) }),
  };
}

function nextCard(w, p) {
  const n = w.next || { goal: 'Same rules, same edge', why: '' };
  return {
    id: 'next', name: 'Next week', colors: ['#19140e', '#b08064', '#b08064'], mode: 1, ms: 9000,
    html: `<p class="kicker">Next week's plan · one goal</p>${kt(n.goal, 'title goal')}<p class="lesson">${esc(n.why)}</p>
      <div class="end"><button type="button" class="btn ghost" data-act="replay">Watch again</button><button type="button" class="btn gold" data-act="share-week">Share the ${p.key === 'month' ? 'month' : p.key === 'all' ? 'story' : 'week'}</button></div>
      <p class="note">${w.demo ? 'DEMO data: the real recap appears once the dashboard publishes.' : `Built ${esc(new Date(w.t * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }))} ET${NBSP}· paper and eval accounts, losses included.`}</p>`,
    enter(el, fx) { fx.burst('confetti', 70, { colors: ['#b08064', '#b08064', '#c8a24a', '#f3ece0'] }); },
    share: () => ({ kicker: "Next week's plan", title: n.goal, big: 'One goal', tone: 'up', lines: [n.why] }),
  };
}

export function deck(w, key, peers = {}) {
  const p = w.periods[key] || w.periods.week;
  return [money, best, worst, evalCard, disciplineCard, learnedCard, discoveryCard, kalshiCard, plannerCard, paceCard, reportCard, streakCard, bestDayCard, bestWeekCard, accountsCard, hallCard, ...extraCards, nextCard]
    .map((f) => f(w, p, peers)).filter(Boolean);
}

// ------------------------------------------------------------------------------------------------ the opening animations
const easeOut = (x) => 1 - Math.pow(1 - x, 4);
export function animateCounts(el, still) {
  const C = [...el.querySelectorAll('.count[data-to]')];
  const fmt = (c, v) => (c.dataset.fmt === 'int' ? String(Math.round(v)) : c.dataset.fmt === 'usd0' ? usd(v, { cents: false }) : usd(v));
  if (still) { C.forEach((c) => { c.textContent = fmt(c, +c.dataset.to); }); return () => {}; }
  const t0 = performance.now(), dur = 1500;
  let raf = 0;
  const step = (now) => {
    const k = easeOut(Math.min(1, (now - t0) / dur));
    C.forEach((c) => { c.textContent = fmt(c, +c.dataset.to * k); });
    raf = k < 1 ? requestAnimationFrame(step) : 0;
  };
  const land = () => { if (raf) cancelAnimationFrame(raf); raf = 0; C.forEach((c) => { c.textContent = fmt(c, +c.dataset.to); }); };
  raf = requestAnimationFrame(step);
  const done = setTimeout(land, dur + 80);              // slow frames never leave a number short of its value
  return () => { clearTimeout(done); land(); };
}
