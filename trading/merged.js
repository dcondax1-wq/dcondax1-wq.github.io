// TRADING round 3 (lead 2026-11-20: the audit's MERGE verdicts): Odeon (the trade reels) and Why (win / loss anatomy) as two cards here.
// Their files load only when the card is about to show (../odeon/trades.json is ~0.5 MB). The old apps stay (each card links to it). Text only.
//   reels(odeon, filter) -> newest first [{id, href, bot, day, side, usd, r, src, mfe_r, mae_r, held}]     why(j) -> the card's model
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const arr = (x) => (Array.isArray(x) ? x : []);
const money = (v, s) => { const n = num(v); if (n === null) return '-'; const a = Math.round(Math.abs(n)); return a === 0 ? '$0' : (n < 0 ? '-' : s ? '+' : '') + '$' + a.toLocaleString('en-US'); };
const rTxt = (v) => { const n = num(v); return n === null ? '' : `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}R`; };
const SRC = { real: 'LIVE', paper: 'PAPER', backtest: 'BACKTEST', lit: 'BACKTEST' };

export function reels(odeon, f) {
  const want = (f && f.bot) || 'all';
  return arr(isObj(odeon) ? odeon.trades : null).filter((t) => isObj(t) && t.id && !/blitz/i.test(String(t.bot) + t.label + t.id) && (want === 'all' || t.bot === want))
    .map((t) => ({ id: String(t.id), href: '../odeon/#reel=' + encodeURIComponent(t.id), bot: t.bot === 'LIT' ? 'Zlarior' : String(t.bot || ''), day: String(t.day || ''),
      side: String(t.side || ''), usd: num(t.usd), r: num(t.r), src: SRC[t.src] || String(t.src || '').toUpperCase(), mfe_r: num(t.mfe_r), mae_r: num(t.mae_r), held: num(t.held_min),
      label: String(t.label || '') }))
    .sort((a, b) => (a.src === 'LIVE') - (b.src === 'LIVE') || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)).sort((a, b) => (b.src === 'LIVE') - (a.src === 'LIVE'));
}
export function why(j) {
  if (!isObj(j)) return null;
  const bots = arr(j.bots).filter((b) => isObj(b) && !/blitz/i.test(String(b.bot) + b.name)).map((b) => ({
    name: String(b.name || b.bot || ''), headline: String(b.headline || ''),
    lose: arr(b.lose).filter(isObj).map((x) => ({ label: String(x.label || ''), share: num(x.share), usd: num(x.usd), n: num(x.n) })),
    money: arr(b.money).filter(isObj).map((m) => ({ span: String(m.span || ''), pf: num(m.pf), pm: num(m.per_month), n: num(m.n) })) }));
  return { title: String(j.title || 'Why we win / why we lose'), verdict: String(j.verdict || ''), lines: arr(j.lines).map(String), checklist: arr(j.checklist).map(String),
    tested: String(j.tested || ''), data_to: String(j.data_to || ''), bots };
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
export function drawReels(box, L, n = 10) {
  clear(box);
  if (!L.length) { box.appendChild(el('p', 'note', 'No reel yet.')); return; }
  const ol = el('ol', 'mg-reels');
  for (const t of L.slice(0, n)) {
    const li = el('li'), a = el('a', 'mg-reel'); a.href = t.href;
    const l = el('span', 'mg-l'); l.appendChild(el('b', '', `${t.bot} ${t.side.toLowerCase()}`)); l.appendChild(el('small', '', `${t.day} · ${t.src}${t.held !== null ? ` · ${t.held} min` : ''}${t.mfe_r !== null ? ` · went +${t.mfe_r.toFixed(1)}R / -${(t.mae_r || 0).toFixed(1)}R` : ''}`));
    a.appendChild(l); a.appendChild(el('span', 'mg-r ag-num ' + ((t.usd || 0) > 0 ? 'pos' : (t.usd || 0) < 0 ? 'neg' : ''), `${money(t.usd, true)} ${rTxt(t.r)}`.trim()));
    li.appendChild(a); ol.appendChild(li);
  }
  box.appendChild(ol);
}
export function drawWhy(box, W) {
  clear(box);
  if (!W) { box.appendChild(el('p', 'note', 'The win / loss study is not in this build.')); return; }
  box.appendChild(el('p', 'lead', W.verdict));
  for (const b of W.bots) {
    const s = el('div', 'mg-why'); s.appendChild(el('b', '', b.name)); s.appendChild(el('p', 'note', b.headline));
    const bars = el('div', 'mg-bars'); bars.setAttribute('role', 'img'); bars.setAttribute('aria-label', `Where ${b.name}'s lost dollars went: ` + b.lose.map((x) => `${x.label} ${x.share}%`).join(', '));
    for (const x of b.lose) { const row = el('div', 'mg-bar'); row.appendChild(el('span', '', x.label)); const m = el('i'); m.style.setProperty('--w', `${Math.max(2, Math.min(100, x.share || 0))}%`); row.appendChild(m); row.appendChild(el('small', 'ag-num', `${Math.round(x.share || 0)}% · ${money(x.usd)}`)); bars.appendChild(row); }
    s.appendChild(bars); box.appendChild(s);
  }
  if (W.checklist.length) { box.appendChild(el('p', 'ag-eyebrow', 'A careful human would skip a trade that is')); const ul = el('ul', 'plain'); for (const c of W.checklist) ul.appendChild(el('li', '', c)); box.appendChild(ul); }
  if (W.tested) box.appendChild(el('p', 'note', W.tested));
  box.appendChild(el('p', 'note', `BACKTEST research, data to ${W.data_to}, costs in. Nothing here changes a live setting.`));
}
