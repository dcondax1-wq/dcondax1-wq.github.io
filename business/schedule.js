// WORK WEEK page (classic script, read only, 2026-11-17). ONE list of weekly blocks (New York time) drawn with textContent and,
// on a tap, turned into a calendar file (.ics) made on the phone: no fetch, no storage, nothing sent. window.SCHEDULE = test hook.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WK = [1, 2, 3, 4, 5];

  // the week, built around LIT's hours (entries 02:00-15:30 ET, flat 15:55, MFFU flat 16:10, the market reopens 18:00 Sun-Thu)
  const BLOCKS = [
    { days: [0], start: '20:00', end: '20:10', kind: 'bots', what: 'Sunday night PC check', how: 'PC on, NinjaTrader connected, STATUS green. The market opened at 18:00; the bot starts watching at 02:00.' },
    { days: [1, 2, 3, 4], start: '21:00', end: '21:05', kind: 'bots', what: 'Night check', how: 'PC on and connected. The bot works 02:00 to 08:00 ET while you sleep: most trades happen then.' },
    { days: WK, start: '08:45', end: '08:55', kind: 'bots', what: 'Before the open', how: 'Open Hestia: did it trade overnight? $ today, $ room left. Anything red: look at the PC.', link: ['Hestia', '../hestia/'] },
    { days: WK, start: '12:00', end: '12:05', kind: 'bots', what: 'Lunch look', how: 'Phone only: a trade open? Room left OK? Then leave it alone.' },
    { days: WK, start: '16:15', end: '16:25', kind: 'bots', what: 'After the close', how: 'No trade open (MFFU needs flat by 16:10). Note today\'s $ in Planner. Done.', link: ['Planner', '../planner/'] },
    { days: [5], start: '16:30', end: '17:15', kind: 'review', what: 'Friday weekly review', how: 'Open ZEUS this week: $ and trades per account, Zlarior and ATLAS vs 2026, next week\'s news days and decisions. The PC builds it from 16:15 ET and updates itself Fri/Sat when flat.', link: ['ZEUS this week', 'week.html'] },
    { days: [5], start: '17:15', end: '17:30', kind: 'money', what: 'Payout check', how: 'A funded account past its payout line? Ask MFFU now (rules below).' },
    { days: [1, 3], start: '10:00', end: '11:30', kind: 'side', what: 'Agency: calls and emails', how: 'Shops are open. Work down the call list.', link: ['Agency', '../agency/'] },
    { days: [2, 4], start: '13:00', end: '15:00', kind: 'side', what: 'Agency: build websites', how: 'Work on demo or paid sites.' },
    { days: [6], start: '10:00', end: '12:00', kind: 'side', what: 'Products and listings', how: 'Business: tick off one "Ready for you to upload" item.', link: ['Business', './'] },
  ];
  const KIND = { bots: 'bots', review: 'review', money: 'payout', side: 'side work' };
  // US estimated-tax due dates (weekend / holiday moves it to the next business day)
  const TAX = [['2026-09-15', 'Jun-Aug 2026'], ['2027-01-15', 'Sep-Dec 2026'], ['2027-04-15', 'Jan-Mar 2027 (and the 2026 return)'], ['2027-06-15', 'Apr-May 2027'],
               ['2027-09-15', 'Jun-Aug 2027'], ['2028-01-18', 'Sep-Dec 2027']];

  function nyNow(d) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
    const o = {}; for (const p of f.formatToParts(d)) o[p.type] = p.value;
    return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), mod: (+o.hour % 24) * 60 + +o.minute, ymd: o.year + '-' + o.month + '-' + o.day };
  }
  const mins = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
  const dayBlocks = (wd) => BLOCKS.filter((b) => b.days.includes(wd)).sort((a, b) => mins(a.start) - mins(b.start));
  function dur(m) { const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min'; }

  function slot(b, isNext) {
    const li = el('li', 'slot' + (isNext ? ' now' : ''));
    li.appendChild(el('b', 't', b.start));
    const w = el('span', 'w', b.what); w.appendChild(el('span', 'tag2', KIND[b.kind])); li.appendChild(w);
    const h = el('span', 'h', b.how + ' ');
    if (b.link) { const a = el('a', null, b.link[0] + ' →'); a.href = b.link[1]; h.appendChild(a); }
    li.appendChild(h);
    return li;
  }

  // ---- the calendar file (RFC 5545, weekly repeats in New York time)
  const TZ = ['BEGIN:VTIMEZONE', 'TZID:America/New_York', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  function ics(now) {
    const stamp = (now || new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Olympus//Work week//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Work week', ...TZ];
    const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    BLOCKS.forEach((b, i) => {
      const first = Math.min(...b.days.map((d) => (d + 6) % 7));                 // the anchor week starts Monday 2026-11-16
      const day = '202611' + String(16 + first).padStart(2, '0');
      L.push('BEGIN:VEVENT', `UID:olympus-week-${i}@olympus.local`, `DTSTAMP:${stamp}`, `DTSTART;TZID=America/New_York:${day}T${b.start.replace(':', '')}00`,
        `DTEND;TZID=America/New_York:${day}T${b.end.replace(':', '')}00`, `RRULE:FREQ=WEEKLY;BYDAY=${b.days.map((d) => BY[d]).join(',')}`,
        `SUMMARY:${esc(b.what)}`, `DESCRIPTION:${esc(b.how)}`, 'END:VEVENT');
    });
    TAX.forEach(([d, what], i) => {
      const n = d.replace(/-/g, ''), nd = new Date(d + 'T12:00:00Z'); nd.setUTCDate(nd.getUTCDate() + 1);
      L.push('BEGIN:VEVENT', `UID:olympus-tax-${i}@olympus.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${n}`, `DTEND;VALUE=DATE:${nd.toISOString().slice(0, 10).replace(/-/g, '')}`,
        `SUMMARY:${esc('Estimated tax due (' + what + ')')}`, `DESCRIPTION:${esc('Pay the quarterly estimated tax. See Business > Taxes. Not tax advice.')}`, 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }

  function render(now) {
    const n = nyNow(now);
    const today = dayBlocks(n.wd), next = today.find((b) => mins(b.end) > n.mod);
    $('todayH').textContent = 'Today, ' + WD[n.wd];
    $('todayPill').textContent = n.wd === 6 ? 'market closed' : n.wd === 0 && n.mod < 1080 ? 'opens 18:00' : today.filter((b) => b.kind === 'bots').length + ' bot checks';
    const ul = $('today'); ul.textContent = '';
    if (!today.length) ul.appendChild(el('li', 'note', 'Nothing planned today. Rest.'));
    for (const b of today) ul.appendChild(slot(b, b === next));
    $('status').textContent = next ? (mins(next.start) > n.mod ? 'Next: ' + next.what + ' at ' + next.start + ' ET, in ' + dur(mins(next.start) - n.mod) + '.' : 'Now: ' + next.what + ' (until ' + next.end + ' ET).')
      : 'Done for today. Next check: ' + (dayBlocks((n.wd + 1) % 7)[0] || { what: '-' }).what + ' tomorrow.';

    const wk = $('week'); wk.textContent = '';
    for (const wd of [1, 2, 3, 4, 5, 6, 0]) {
      const d = el('details', 'item'); if (wd === n.wd) d.open = true;
      const bs = dayBlocks(wd);
      const sm = el('summary'); sm.appendChild(el('span', 'nm', WD[wd])); sm.appendChild(el('span', 'note', bs.length + (bs.length === 1 ? ' block' : ' blocks'))); d.appendChild(sm);
      const ol = el('ul', 'slots'); for (const b of bs) ol.appendChild(slot(b, false)); d.appendChild(ol);
      wk.appendChild(d);
    }

    const dl = $('taxes'); dl.textContent = '';
    const up = TAX.find(([d]) => d >= n.ymd), from = Math.max(0, (up ? TAX.indexOf(up) : TAX.length) - 1);   // the last past date, then the next ones
    for (const [d, what] of TAX.slice(from)) {
      const when = new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      dl.appendChild(el('dt', null, what));
      dl.appendChild(el('dd', d === (up && up[0]) ? 'next' : '', d < n.ymd ? when + ' (past)' : when));
    }
    if (up) {
      const days = Math.round((Date.parse(up[0] + 'T12:00:00Z') - Date.parse(n.ymd + 'T12:00:00Z')) / 864e5);
      $('taxPill').textContent = 'next in ' + days + ' day' + (days === 1 ? '' : 's');
    }
  }

  function download() {
    try {
      const url = URL.createObjectURL(new Blob([ics()], { type: 'text/calendar' }));
      const a = document.createElement('a'); a.href = url; a.download = 'work-week.ics'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      $('icsNote').textContent = 'Calendar file made. Open it and tap "Add all".';
    } catch (e) { $('icsNote').textContent = 'This browser could not make the file. Use Planner instead: type "every Friday 16:30 weekly review".'; }
  }

  let ready = false;
  window.SCHEDULE = { ready: () => ready, blocks: BLOCKS, tax: TAX, ics, nyNow };
  function start() {
    const q = new URLSearchParams(location.search).get('at'), d = q ? new Date(q) : new Date();
    render(Number.isFinite(d.getTime()) ? d : new Date());
    $('ics').addEventListener('click', download);
    ready = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
