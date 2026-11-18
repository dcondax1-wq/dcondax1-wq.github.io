// ARGUS extras (ES module, JOB 10+11, 2026-11-04): the watchtower's memory and its voice.
//   incidentStats(H)           the incident history in numbers (count, longest, total red time, average) from histSummary()
//   uptimeStats(hist, H)       the uptime streak: clear days in a row, the best run in the 14 days, the share of seen days that were clear
//   decorate(pane, ctx)        appends the uptime card, the incident log (by day) and the share-card buttons under "Since yesterday"
//   openDrawer(eye, ctx)       the per-system detail drawer: the light's value, why, what to do, its incidents, its neighbours
//   shareCanvas(R, H, now)     the status share card as a 1080 x 1080 canvas (verdict, counts, the 100 eyes, the streak)
//   shareText(R, H, now)       the same card as plain text
// Read-only: nothing here talks to a bot or a broker. The card is made on this phone and only saved or shared when you tap.
import { HIST_DAYS } from './arguscore.js';

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const ET = 'America/New_York';
const COLOR = { ok: '#c8a24a', warn: '#e0b060', bad: '#c96a4a', idle: '#4b7a99' };
const dayOf = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date(t * 1000));
const clock = (t) => new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t * 1000));
export const dur = (s) => (s < 90 ? `${Math.round(s)} sec` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1).replace(/\.0$/, '')} hours` : `${Math.round(s / 86400)} days`);

export function incidentStats(H) {
  const done = H.reds.filter((r) => !r.open), all = H.reds;
  const total = all.reduce((s, r) => s + r.secs, 0), longest = all.reduce((a, r) => (r.secs > (a ? a.secs : -1) ? r : a), null);
  const by = new Map(); for (const r of all) by.set(r.label, (by.get(r.label) || 0) + 1);
  const rep = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  return { count: all.length, open: all.filter((r) => r.open).length, closed: done.length, total, avg: done.length ? done.reduce((s, r) => s + r.secs, 0) / done.length : 0, longest, repeat: rep && rep[1] > 1 ? { label: rep[0], n: rep[1] } : null };
}

export function uptimeStats(H) {
  let best = 0, run = 0;
  for (const s of H.strip) { if (s.level === 'ok') { run++; best = Math.max(best, run); } else if (s.level !== 'idle') run = 0; }
  const seen = H.strip.filter((s) => s.level !== 'idle'), ok = seen.filter((s) => s.level === 'ok').length;
  return { cur: H.streak, best, seen: seen.length, ok, pct: seen.length ? Math.round((ok / seen.length) * 100) : null };
}

export function decorate(pane, ctx) {
  const H = ctx.H, I = incidentStats(H), U = uptimeStats(H);
  // the uptime streak
  const up = h('section', 'xcard uptime'); up.id = 'uptime';
  up.append(h('p', 'xh', 'Uptime streak'));
  const row = h('div', 'xrow'); row.append(h('b', 'xbig', String(U.cur)), h('span', '', U.cur === 1 ? 'clear day in a row' : 'clear days in a row'));
  up.append(row, h('p', 'hint', U.seen ? `Best run in ${HIST_DAYS} days: ${U.best}. ${U.ok} of ${U.seen} days I saw were clear (${U.pct}%).` : 'Nothing seen yet. I count from the first time I look.'));
  // the incident log, by day
  const log = h('section', 'xcard incidents'); log.id = 'incidents';
  log.append(h('p', 'xh', 'Incident history'));
  if (!I.count) log.append(h('p', 'empty', 'No incidents in the days I saw.'));
  else {
    const st = h('div', 'xstats');
    for (const [k, v] of [['Incidents', String(I.count)], ['Red time', dur(I.total)], ['Average', I.closed ? dur(I.avg) : '-'], ['Longest', I.longest ? dur(I.longest.secs) : '-']]) { const c = h('div', 'xstat'); c.append(h('b', '', v), h('span', '', k)); st.append(c); }
    log.append(st);
    const byDay = new Map();
    for (const r of H.reds) { const d = dayOf(r.from); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); }
    for (const [d, list] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7)) {
      const g = h('div', 'xday'); g.append(h('b', '', d.slice(5)));
      for (const r of list) { const li = h('div', 'xinc' + (r.open ? ' now' : '')); li.dataset.light = r.id; li.append(h('span', '', r.label), h('span', 'xd', r.open ? `red now · ${dur(r.secs)}` : `${clock(r.from)}, ${dur(r.secs)}`)); g.append(li); }
      log.append(g);
    }
    if (I.repeat) log.append(h('p', 'hint', `${I.repeat.label} went red ${I.repeat.n} times. That is the one to fix for good.`));
  }
  // the share card
  const sh = h('section', 'xcard share'); sh.id = 'share';
  sh.append(h('p', 'xh', 'Status card'));
  const btns = h('div', 'xbtns'), png = h('button', 'xbtn', 'Save card (PNG)'), cp = h('button', 'xbtn ghost', 'Copy as text');
  png.type = cp.type = 'button'; png.id = 'sharePng'; cp.id = 'shareCopy';
  png.addEventListener('click', () => {
    try {
      shareCanvas(ctx.R, H, ctx.now).toBlob(async (b) => {
        if (!b) return;
        const file = typeof File === 'function' ? new File([b], 'argus-status.png', { type: 'image/png' }) : null;
        try { if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) { await navigator.share({ files: [file], title: 'Argus status' }); return; } } catch (_) { /* fall back to a download */ }
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'argus-status.png'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    } catch (_) { /* no canvas */ }
  });
  cp.addEventListener('click', async () => { const t = shareText(ctx.R, H, ctx.now); let ok = false; try { await navigator.clipboard.writeText(t); ok = true; } catch (_) { ok = false; } cp.textContent = ok ? 'Copied' : 'Press and hold to copy'; setTimeout(() => { cp.textContent = 'Copy as text'; }, 2000); });
  btns.append(png, cp);
  sh.append(btns, h('p', 'hint', 'The card shows the verdict, the counts, the 100 eyes and the streak. It is drawn on this phone and goes nowhere until you save or share it.'));
  pane.append(up, log, sh);
}

export function shareText(R, H, now) {
  const U = uptimeStats(H), c = R.counts, I = incidentStats(H);
  return [`ARGUS ${R.verdict.word.toUpperCase()}`, `${c.bad} red, ${c.warn} amber, ${c.ok} green${c.idle ? `, ${c.idle} resting` : ''}.`, R.verdict.line,
    `Uptime streak: ${U.cur} clear day${U.cur === 1 ? '' : 's'} (best ${U.best} in ${HIST_DAYS}).`, `Incidents in ${HIST_DAYS} days: ${I.count}${I.count ? `, ${dur(I.total)} red in all` : ''}.`,
    `As of ${new Intl.DateTimeFormat('en-US', { timeZone: ET, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(now * 1000))} ET. Read-only dashboard, paper trading.`].join('\n');
}

export function shareCanvas(R, H, now) {
  const c = document.createElement('canvas'); c.width = c.height = 1080;
  const g = c.getContext('2d'), lv = R.verdict.level, col = COLOR[lv] || COLOR.idle;
  g.fillStyle = '#13100d'; g.fillRect(0, 0, 1080, 1080);
  const bg = g.createRadialGradient(540, 470, 40, 540, 470, 640); bg.addColorStop(0, col + '55'); bg.addColorStop(1, 'rgba(19, 16, 13,0)'); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
  g.textAlign = 'center'; g.fillStyle = '#e0b060'; g.font = '700 46px "Iowan Old Style", Palatino, Georgia, serif'; g.fillText('ARGUS', 540, 92);
  // the eyes: a Fibonacci disc of 100 dots, each coloured by its light
  const N = 100, owner = (i) => Math.min(R.eyes.length - 1, Math.floor((i * R.eyes.length) / N)), ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const r = Math.sqrt((i + 0.5) / N) * 300, a = i * ga, x = 540 + Math.cos(a) * r, y = 470 + Math.sin(a) * r, e = R.eyes[owner(i)], k = COLOR[e ? e.level : 'idle'];
    g.fillStyle = '#f3ece0'; g.beginPath(); g.ellipse(x, y, 25, 15, a, 0, 6.3); g.fill();
    g.fillStyle = k; g.beginPath(); g.arc(x, y, 9, 0, 6.3); g.fill();
    g.fillStyle = '#13100d'; g.beginPath(); g.arc(x, y, 3.6, 0, 6.3); g.fill();
  }
  g.fillStyle = col; g.font = '800 96px "Iowan Old Style", Palatino, Georgia, serif'; g.fillText(R.verdict.word.toUpperCase(), 540, 862);
  g.fillStyle = '#e6dbca'; g.font = '600 40px system-ui, sans-serif'; g.fillText(`${R.counts.bad} red · ${R.counts.warn} amber · ${R.counts.ok} green`, 540, 920);
  const U = uptimeStats(H);
  g.fillStyle = '#4b7a99'; g.font = '500 34px system-ui, sans-serif'; g.fillText(`Uptime streak ${U.cur} day${U.cur === 1 ? '' : 's'}${U.pct != null ? ` · ${U.pct}% clear` : ''}`, 540, 975);
  g.fillStyle = '#4b7a99'; g.font = '500 28px system-ui, sans-serif'; g.fillText(`${new Intl.DateTimeFormat('en-US', { timeZone: ET, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(now * 1000))} ET · read-only · paper`, 540, 1032);
  return c;
}

// ------------------------------------------------------------------ the per-system drawer
export function openDrawer(eye, ctx) {
  const d = document.getElementById('drawer'); if (!d || !eye) return null;
  const body = d.querySelector('.dbody'), reds = ctx.H.reds.filter((r) => r.id === eye.id), same = ctx.R.eyes.filter((e) => e.group === eye.group && e.id !== eye.id);
  body.replaceChildren();
  const head = h('div', 'dhead ' + eye.level); head.append(h('i', 'dot'), h('b', '', eye.label), h('span', 'dv', eye.value));
  body.append(head, h('p', 'dsub', { ok: 'Fine', warn: 'Needs a look', bad: 'Needs action', idle: 'Resting' }[eye.level] || ''));
  body.append(h('p', 'dd', eye.detail));
  if (eye.fix || eye.step) { const f = h('div', 'dfix'); f.append(h('b', '', 'Do this'), h('span', '', eye.fix || eye.step)); body.append(f); }
  if (eye.cmd) {
    const code = h('code', '', eye.cmd.text), b = h('button', 'xbtn', eye.cmd.kind === 'pc' ? 'Copy file name' : 'Copy message for Claude'); b.type = 'button';
    b.addEventListener('click', async () => { let ok = false; try { await navigator.clipboard.writeText(eye.cmd.text); ok = true; } catch (_) { ok = false; } b.textContent = ok ? 'Copied' : 'Press and hold to copy'; });
    body.append(code, b);
  }
  body.append(h('p', 'xh', 'This light in the last 14 days'));
  if (!reds.length) body.append(h('p', 'empty', 'It has not gone red in the days I saw.'));
  for (const r of reds.slice(0, 5)) { const li = h('div', 'xinc' + (r.open ? ' now' : '')); li.append(h('span', '', `${dayOf(r.from).slice(5)} ${clock(r.from)}`), h('span', 'xd', r.open ? `red now · ${dur(r.secs)}` : dur(r.secs))); body.append(li); }
  if (same.length) {
    body.append(h('p', 'xh', 'Next to it'));
    const row = h('div', 'dnear');
    for (const e of same.slice(0, 8)) { const b = h('button', 'nb ' + e.level, e.label); b.type = 'button'; b.dataset.light = e.id; b.addEventListener('click', () => ctx.pick(e.id)); row.append(b); }
    body.append(row);
  }
  d.hidden = false; d.dataset.light = eye.id;
  return d;
}
export function closeDrawer() { const d = document.getElementById('drawer'); if (d) { d.hidden = true; d.dataset.light = ''; } }
