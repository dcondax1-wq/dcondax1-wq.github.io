// SHARE CARD (day-sharecard 2026-11-27; owner: "when we have good days I want a sick image to post on insta that shows daily PNL").
// Pure model + canvas drawing, no network, no storage. share.html gathers the day (live: the PC's post through livecore.js; a past day:
// replay/<day>.json, the bots' BACKTEST twins = stamped "BACKTEST" on the card) and calls:
//   const M = cardModel(src);            // src = { day, total, accounts: [{ name, usd, balance }], trades: [{ name, side, usd, r, t, xt, entry, exit }],
//                                         //         streak: { kind: 'W'|'L', n }, week, bars: [[t, o, h, l, c], ...], source: 'live'|'backtest' }
//   draw(canvas, M, { size: 'post'|'story', style: 'neon'|'clean'|'vault', hideBalances, hideUsd })
//   textOf(M, opts) -> every string the card draws (tests: no account number / firm id ever reaches the image)
// Names only: "Zlarior 50K", "ATLAS 25K funded"; any 4+ digit run, firm prefix id or e-mail is cut before drawing.
export const SIZES = { post: [1080, 1350], story: [1080, 1920] };
export const STYLES = ['neon', 'clean', 'vault'];
const C = { bg: '#000000', card: '#16131e', line: '#3e255e', line2: '#4d2e76', glow: '#9d59ee', gold: '#f1c14b', mint: '#77db89', red: '#ff5d6c', ink: '#f3eefc', dim: '#a99cc0', faint: '#6f6485' };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** a display name with nothing that identifies an account: digits runs >= 4, firm-id prefixes, e-mails, "#123456" go */
export function cleanName(s) {
  let t = String(s || '').replace(/\S+@\S+/g, '')
    .replace(/\b[A-Z]{2,8}[-_]?\d{4,}\w*\b/gi, '')          // firm-prefixed ids (letters + 4 or more digits)
    .replace(/\.{2,}\s*\d+/g, '')                          // "...6016"
    .replace(/#?\b\d{4,}\b/g, '').replace(/#\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^[-·:,]+|[-·:,]+$/g, '').trim();
  return t.slice(0, 26) || 'Account';
}
export const usd = (v, sign = true) => (num(v) === null ? '-' : `${sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`);
export const rr = (v) => (num(v) === null ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`);
export function niceDate(day) {
  try { return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (_) { return day; }
}

export function cardModel(src) {
  const S = src && typeof src === 'object' ? src : {};
  const trades = (Array.isArray(S.trades) ? S.trades : []).filter((t) => t && num(t.usd) !== null)
    .map((t) => ({ ...t, name: cleanName(t.name) })).sort((a, b) => (a.t || 0) - (b.t || 0));
  const accounts = (Array.isArray(S.accounts) ? S.accounts : []).filter((a) => a && num(a.usd) !== null && Math.round(a.usd) !== 0)
    .map((a) => ({ name: cleanName(a.name), usd: a.usd, balance: num(a.balance) })).sort((a, b) => b.usd - a.usd).slice(0, 4);
  const total = num(S.total) ?? trades.reduce((s, t) => s + t.usd, 0);
  const wins = trades.filter((t) => Math.round(t.usd) > 0).length, losses = trades.filter((t) => Math.round(t.usd) < 0).length;
  const rs = trades.map((t) => num(t.r)).filter((x) => x !== null);
  const st = S.streak && num(S.streak.n) ? S.streak : null;
  return {
    day: S.day || '', date: niceDate(S.day || ''), total, green: total > 0, source: S.source === 'backtest' ? 'backtest' : 'live',
    accounts, trades, n: trades.length, wins, losses, emoji: trades.map((t) => (Math.round(t.usd) > 0 ? '✅' : Math.round(t.usd) < 0 ? '❌' : '➖')).join(''),
    r: rs.length ? rs.reduce((s, x) => s + x, 0) : null,
    streak: st ? `${st.n} ${st.kind === 'W' ? 'win' : 'loss'}${st.n === 1 ? '' : st.kind === 'W' ? 's' : 'es'} in a row` : null,
    week: num(S.week), bars: Array.isArray(S.bars) ? S.bars.filter((b) => Array.isArray(b) && b.length >= 5 && b.every((x) => num(x) !== null)) : [],
  };
}

/** every string the card will draw, in order (also the test's privacy surface) */
export function textOf(M, opts) {
  const o = opts || {}, out = [];
  out.push('OLYMPUS · NQ', M.date);
  out.push(o.hideUsd ? (M.r !== null ? rr(M.r) : (M.green ? 'GREEN DAY' : 'RED DAY')) : usd(M.total));
  out.push(o.hideUsd ? 'day result in R' : 'day P&L');
  if (M.source === 'backtest') out.push('BACKTEST · not a live result');
  for (const a of M.accounts) {
    out.push(a.name);
    out.push(o.hideUsd ? (a.usd > 0 ? 'green' : 'red') : usd(a.usd));
    if (!o.hideBalances && !o.hideUsd && a.balance !== null) out.push(`balance ${usd(a.balance, false)}`);
  }
  out.push(`${M.n} trade${M.n === 1 ? '' : 's'}`, M.emoji || '—');
  if (M.r !== null && !o.hideUsd) out.push(rr(M.r));
  if (M.streak) out.push(M.streak);
  if (M.week !== null) out.push(o.hideUsd ? (M.week > 0 ? 'week green' : 'week red') : `week ${usd(M.week)}`);
  return out.filter((x) => x !== null && x !== undefined && x !== '');
}

// ------------------------------------------------------------------------------------------------ drawing
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif';
function font(px, w = 700) { return `${w} ${px}px ${FONT}`; }

const THEME = {
  neon: { bg: (g, W, H) => { g.fillStyle = C.bg; g.fillRect(0, 0, W, H); const rg = g.createRadialGradient(W * 0.5, H * 0.18, 10, W * 0.5, H * 0.18, W * 0.95);
      rg.addColorStop(0, 'rgba(157,89,238,.55)'); rg.addColorStop(0.45, 'rgba(157,89,238,.12)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(157,89,238,.10)'; g.lineWidth = 1; for (let y = 0; y < H; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } },
    panel: 'rgba(22,19,30,.82)', edge: C.line2, glow: 22, big: C.gold },
  clean: { bg: (g, W, H) => { const lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, '#0b0911'); lg.addColorStop(1, '#000'); g.fillStyle = lg; g.fillRect(0, 0, W, H); },
    panel: 'rgba(22,19,30,.95)', edge: C.line, glow: 0, big: C.ink },
  vault: { bg: (g, W, H) => { g.fillStyle = '#05040a'; g.fillRect(0, 0, W, H); const lg = g.createLinearGradient(0, 0, W, H); lg.addColorStop(0, 'rgba(77,46,118,.42)');
      lg.addColorStop(0.5, 'rgba(157,89,238,.08)'); lg.addColorStop(1, 'rgba(62,37,94,.30)'); g.fillStyle = lg; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(241,193,75,.35)'; g.lineWidth = 3; rrect(g, 24, 24, W - 48, H - 48, 40); g.stroke(); g.strokeStyle = 'rgba(241,193,75,.12)'; g.lineWidth = 1; rrect(g, 40, 40, W - 80, H - 80, 30); g.stroke(); },
    panel: 'rgba(16,13,24,.9)', edge: 'rgba(241,193,75,.45)', glow: 14, big: C.gold },
};

export function draw(canvas, M, opts) {
  const o = { size: 'post', style: 'neon', ...(opts || {}) };
  const [W, H] = SIZES[o.size] || SIZES.post;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d'), T = THEME[o.style] || THEME.neon, story = o.size === 'story';
  const up = M.green, money = up ? C.mint : C.red, pad = 72;
  T.bg(g, W, H);
  g.textBaseline = 'alphabetic';
  // brand + date
  let y = story ? 170 : 118;
  g.fillStyle = C.gold; g.font = font(34, 800); g.textAlign = 'left'; g.fillText('OLYMPUS · NQ', pad, y);
  g.fillStyle = C.dim; g.font = font(32, 600); g.textAlign = 'right'; g.fillText(M.date, W - pad, y);
  if (M.source === 'backtest') { y += 54; g.fillStyle = C.gold; g.font = font(28, 800); g.textAlign = 'left'; g.fillText('BACKTEST · not a live result', pad, y); }
  // the big number
  y += story ? 270 : 210;
  const big = o.hideUsd ? (M.r !== null ? rr(M.r) : (M.green ? 'GREEN DAY' : 'RED DAY')) : usd(M.total);
  g.textAlign = 'center';
  let fs = story ? 230 : 196; g.font = font(fs, 900);
  while (g.measureText(big).width > W - 2 * pad && fs > 90) { fs -= 8; g.font = font(fs, 900); }
  if (T.glow) { g.shadowColor = up ? 'rgba(119,219,137,.85)' : 'rgba(255,93,108,.8)'; g.shadowBlur = T.glow * 2.4; }
  const grd = g.createLinearGradient(0, y - fs, 0, y); grd.addColorStop(0, o.style === 'clean' ? C.ink : C.gold); grd.addColorStop(1, money);
  g.fillStyle = grd; g.fillText(big, W / 2, y);
  g.shadowBlur = 0; g.shadowColor = 'transparent';
  y += 80; g.fillStyle = C.dim; g.font = font(34, 600); g.fillText(o.hideUsd ? 'day result in R' : 'day P&L', W / 2, y);
  // the chart of the day
  const hasBars = Array.isArray(M.bars) && M.bars.length > 1;
  const chH = hasBars ? (story ? 700 : 300) : (story ? 260 : 150); y += 34;
  panel(g, T, pad, y, W - 2 * pad, chH);
  chart(g, M, pad + 24, y + 24, W - 2 * pad - 48, chH - 48);
  y += chH + 36;
  // accounts
  const rowH = 84, nAcc = Math.min(M.accounts.length, story ? 4 : 3);
  if (nAcc) {
    panel(g, T, pad, y, W - 2 * pad, nAcc * rowH + 28);
    M.accounts.slice(0, nAcc).forEach((a, i) => {
      const yy = y + 34 + i * rowH + 30;
      g.textAlign = 'left'; g.fillStyle = C.ink; g.font = font(38, 700); g.fillText(a.name, pad + 32, yy);
      if (!o.hideBalances && !o.hideUsd && a.balance !== null) { g.fillStyle = C.faint; g.font = font(26, 600); g.fillText(`balance ${usd(a.balance, false)}`, pad + 32, yy + 32); }
      g.textAlign = 'right'; g.fillStyle = a.usd > 0 ? C.mint : C.red; g.font = font(42, 800);
      g.fillText(o.hideUsd ? (a.usd > 0 ? 'green' : 'red') : usd(a.usd), W - pad - 32, yy);
    });
    y += nAcc * rowH + 28 + 30;
  }
  // stats row
  const stats = [[`${M.n}`, `trade${M.n === 1 ? '' : 's'}`], [M.emoji || '—', `${M.wins} won · ${M.losses} lost`]];
  if (M.r !== null && !o.hideUsd) stats.push([rr(M.r), 'R multiple']);
  if (M.week !== null) stats.push([o.hideUsd ? (M.week > 0 ? '▲' : '▼') : usd(M.week), 'this week']);
  const sw = (W - 2 * pad - (stats.length - 1) * 18) / stats.length;
  stats.forEach(([v, k], i) => {
    const x = pad + i * (sw + 18);
    panel(g, T, x, y, sw, 150);
    g.textAlign = 'center'; g.fillStyle = i === 0 ? C.gold : C.ink; let f2 = 54; g.font = font(f2, 800);
    while (g.measureText(v).width > sw - 24 && f2 > 26) { f2 -= 4; g.font = font(f2, 800); }
    g.fillText(v, x + sw / 2, y + 78); g.fillStyle = C.dim; g.font = font(26, 600); g.fillText(k, x + sw / 2, y + 122);
  });
  y += 150 + 46;
  if (M.streak) { g.textAlign = 'center'; g.fillStyle = up ? C.mint : C.dim; g.font = font(36, 700); g.fillText(`🔥 ${M.streak}`, W / 2, y); }
  // foot
  g.textAlign = 'center'; g.fillStyle = C.faint; g.font = font(26, 600);
  g.fillText('MNQ futures · prop evaluation accounts · not advice', W / 2, H - (story ? 120 : 56));
  return { W, H };
}

function panel(g, T, x, y, w, h) {
  g.save(); g.fillStyle = T.panel; rrect(g, x, y, w, h, 28); g.fill();
  g.strokeStyle = T.edge; g.lineWidth = 2; g.stroke();
  if (T.glow) { g.shadowColor = 'rgba(157,89,238,.45)'; g.shadowBlur = T.glow; g.stroke(); }
  g.restore();
}

function chart(g, M, x, y, w, h) {
  const B = M.bars;
  if (B.length < 3) { g.textAlign = 'center'; g.fillStyle = C.faint; g.font = font(30, 600); g.fillText('chart of the day not available', x + w / 2, y + h / 2); return; }
  let lo = Infinity, hi = -Infinity;
  for (const b of B) { lo = Math.min(lo, b[3]); hi = Math.max(hi, b[2]); }
  for (const t of M.trades) for (const p of [t.entry, t.exit]) if (num(p) !== null) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
  const padP = (hi - lo) * 0.06 || 1; lo -= padP; hi += padP;
  const t0 = B[0][0], t1 = B[B.length - 1][0] + 300;
  const X = (t) => x + w * (t - t0) / Math.max(1, t1 - t0), Y = (p) => y + h * (1 - (p - lo) / (hi - lo));
  const cw = Math.max(1.5, (w / B.length) * 0.62);
  // area under closes
  g.save();
  const ag = g.createLinearGradient(0, y, 0, y + h); ag.addColorStop(0, 'rgba(157,89,238,.35)'); ag.addColorStop(1, 'rgba(157,89,238,0)');
  g.beginPath(); g.moveTo(X(B[0][0]), y + h); for (const b of B) g.lineTo(X(b[0] + 150), Y(b[4])); g.lineTo(X(B[B.length - 1][0] + 150), y + h); g.closePath(); g.fillStyle = ag; g.fill();
  for (const b of B) {
    const upb = b[4] >= b[1], cx = X(b[0] + 150);
    g.strokeStyle = upb ? 'rgba(119,219,137,.75)' : 'rgba(255,93,108,.7)'; g.lineWidth = Math.max(1, cw * 0.18);
    g.beginPath(); g.moveTo(cx, Y(b[2])); g.lineTo(cx, Y(b[3])); g.stroke();
    g.fillStyle = upb ? C.mint : C.red; g.globalAlpha = 0.85;
    g.fillRect(cx - cw / 2, Y(Math.max(b[1], b[4])), cw, Math.max(1.5, Math.abs(Y(b[1]) - Y(b[4]))));
    g.globalAlpha = 1;
  }
  // entries / exits
  for (const t of M.trades) {
    if (num(t.t) === null || num(t.entry) === null || t.t < t0 - 600 || t.t > t1 + 600) continue;
    const ex = X(t.t), ey = Y(t.entry), win = t.usd > 0;
    if (num(t.xt) !== null && num(t.exit) !== null) {
      g.strokeStyle = win ? C.mint : C.red; g.lineWidth = 4; g.setLineDash([12, 10]);
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(X(t.xt), Y(t.exit)); g.stroke(); g.setLineDash([]);
      g.fillStyle = win ? C.mint : C.red; g.shadowColor = g.fillStyle; g.shadowBlur = 16;
      g.beginPath(); g.arc(X(t.xt), Y(t.exit), 12, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
    }
    g.fillStyle = C.gold; g.shadowColor = C.gold; g.shadowBlur = 18;
    g.beginPath(); const up_ = !/short/i.test(t.side || '');
    if (up_) { g.moveTo(ex, ey - 22); g.lineTo(ex + 16, ey + 8); g.lineTo(ex - 16, ey + 8); } else { g.moveTo(ex, ey + 22); g.lineTo(ex + 16, ey - 8); g.lineTo(ex - 16, ey - 8); }
    g.closePath(); g.fill(); g.shadowBlur = 0;
  }
  g.restore();
}

if (typeof window !== 'undefined') window.SHARECARD = { cardModel, draw, textOf, cleanName, SIZES, STYLES };
