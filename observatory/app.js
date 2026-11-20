(function () {
  'use strict';
  const SOURCES = [
    { id: 'datacity', label: 'Data City', url: '../datacity/jarvis.json', type: 'research', detail: 'Research status and the underlying data freshness' },
    { id: 'cities', label: 'Cities', url: '../cities/cities.json', type: 'map', detail: 'City atlas and routing' },
    { id: 'arena', label: 'Arena', url: '../arena/events.json', type: 'events', detail: 'Verified activity events' },
    { id: 'oracle', label: 'Oracle', url: '../oracle/prophecy.json', type: 'forecast', detail: 'Published forecast state' },
    // Kalshi City's scan.json is gone for good (written only from the retired kalshi-feed repo, 2026-11-19): no source here asks for it
    { id: 'learning', label: 'Learning', url: '../kalshicity/learning_log.json', type: 'lessons', detail: 'Append-only Kalshi City lessons; lesson dates do not show when the publisher last ran' }
  ];
  const $ = (id) => document.getElementById(id);
  const key = 'olympus.observatory.scans.v1';
  let selected = SOURCES[0].id;
  let latest = [];
  let history = [];
  try { const h = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(h)) history = h.slice(-30).filter((record) => record && Array.isArray(record.sources)); } catch (_) { /* storage unavailable */ }
  const now = () => Date.now();
  const stamp = (t) => new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  function numericTime(data) {
    // An append-only lesson's event time is not a publisher timestamp.
    const candidates = [data && data.cronos && data.cronos.data_t, data && data.t, data && data.generated_at, data && data.updated_at, data && data.built];
    for (const value of candidates) {
      if (typeof value === 'number' && value > 1000000000) return value < 100000000000 ? value * 1000 : value;
      if (typeof value === 'string') { const parsed = Date.parse(value); if (Number.isFinite(parsed)) return parsed; }
    }
    return null;
  }
  function fingerprint(data) {
    const value = JSON.stringify(data);
    let hash = 2166136261;
    // FNV-1a is a local change marker, not a security hash.
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  function previous(id) {
    for (let i = history.length - 1; i >= 0; i--) {
      const source = history[i].sources.find((s) => s && s.id === id && s.ok);
      if (source) return source;
    }
    return null;
  }
  async function load(source) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(source.url + '?observed=' + Math.floor(now() / 300000), { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!data || typeof data !== 'object') throw new Error('The source did not return an object');
      const t = numericTime(data);
      const entries = source.id === 'learning' && Array.isArray(data.entries) ? data.entries : [];
      // The append-only log also records publisher run events. A run is not a
      // newly learned lesson, even when it is the latest line in the file.
      const lessons = entries.filter((entry) => entry && entry.kind === 'learned');
      const lastLesson = lessons.length ? numericTime({ t: lessons[lessons.length - 1].t }) : null;
      const demo = data.demo === true || data.mode === 'demo';
      // The status card's checked_t and age_h change on every publish; compare its underlying research snapshot instead.
      const hash = fingerprint(source.id === 'datacity' && data.cronos && data.cronos.orig ? data.cronos.orig : data);
      const old = previous(source.id);
      const ageHours = t ? Math.max(0, (now() - t) / 3600000) : null;
      // Allow small device/publisher clock skew; a later timestamp cannot prove a feed is fresh.
      const futureMinutes = t && t > now() + 300000 ? Math.ceil((t - now()) / 60000) : null;
      // Static sources without a timestamp are not called stale.
      const reported = data.status && data.status.level;
      const cronos = data.cronos && data.cronos.state;
      const healthIssue = reported === 'warn' || reported === 'bad' ? 'The source status is ' + reported + '.' : cronos && cronos !== 'fresh' ? 'The source publisher reports ' + cronos + '.' : source.id === 'learning' && !t ? 'The lesson log has no publisher timestamp; its last event is not a refresh check.' : '';
      const status = demo || healthIssue || futureMinutes != null || ageHours != null && ageHours > 48 ? 'warn' : 'good';
      return { ...source, ok: true, status, hash, t, lastLesson, ageHours, futureMinutes, demo, healthIssue, changed: !!old && old.hash !== hash, bytes: JSON.stringify(data).length };
    } catch (error) {
      return { ...source, ok: false, status: 'bad', error: error.name === 'AbortError' ? 'Timed out after 10 seconds' : String(error.message || error) };
    } finally { clearTimeout(timer); }
  }
  function insight(source) {
    if (!source.ok) return { title: source.label + ' feed is unavailable', evidence: source.error, action: 'Open the source and check its publisher or path.' };
    if (source.demo) return { title: source.label + ' is marked demo', evidence: 'Published JSON contains demo=true or mode=demo.', action: 'Keep demo labels visible and check whether live data is expected.' };
    if (source.futureMinutes != null) return { title: source.label + ' has a future timestamp', evidence: 'Published time is ' + stamp(source.t) + ', about ' + source.futureMinutes + ' minutes ahead of this device.', action: 'Check the publisher and device clocks before treating this feed as current.' };
    if (source.healthIssue) return { title: source.label + ' needs review', evidence: source.healthIssue, action: source.id === 'learning' ? 'Check the timestamped Kalshi City scan and its publisher workflow.' : 'Open the source status card and check its latest publisher run.' };
    if (source.ageHours != null && source.ageHours > 48) return { title: source.label + ' may be stale', evidence: 'Published timestamp is ' + Math.floor(source.ageHours) + ' hours old (' + stamp(source.t) + ').', action: 'Check the source schedule and its latest successful publish.' };
    if (source.changed) return { title: source.label + ' changed since your last scan', evidence: 'Content marker differs from the last available copy on this device.', action: 'Review the change in the source app before proposing a dashboard adjustment.' };
    return null;
  }
  function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; }
  function render() {
    const towers = $('towers'); towers.replaceChildren();
    latest.forEach((source, index) => {
      const tower = node('button', 'tower ' + (source.status === 'good' ? '' : source.status), null);
      tower.type = 'button'; tower.style.setProperty('--i', String(index));
      tower.setAttribute('aria-label', source.label + ': ' + (source.ok ? source.status === 'good' ? 'available' : 'needs review' : 'unavailable'));
      tower.setAttribute('aria-pressed', String(source.id === selected));
      tower.append(node('span', '', source.label), node('small', '', source.ok ? source.status === 'good' ? 'Working' : 'Look' : 'Down'));
      tower.addEventListener('click', () => { selected = source.id; renderDetail(); towers.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === tower))); });
      towers.append(tower);
    });
    const up = latest.filter((s) => s.ok), look = latest.filter((s) => insight(s));
    $('healthy').textContent = String(up.length); $('total').textContent = ' of ' + latest.length;
    $('heroLine').textContent = up.length === latest.length && !look.length ? 'Every feed answers and looks right. Nothing to fix.'
      : up.length < latest.length ? 'Down: ' + latest.filter((s) => !s.ok).map((s) => s.label).join(', ') + '. Fix that first.'
      : 'All answer; ' + look.length + ' to look at: ' + look.map((s) => s.label).join(', ') + '.';
    document.querySelector('.hero').dataset.level = up.length < latest.length ? 'bad' : look.length ? 'warn' : 'ok';
    $('attention').textContent = String(latest.filter((s) => insight(s)).length);
    $('history').textContent = String(history.length);
    renderDetail();
    const reviews = $('reviews'); reviews.replaceChildren();
    const findings = latest.map(insight).filter(Boolean);
    if (!findings.length) reviews.append(node('p', '', 'No source needs review in this scan. This is a health check, not proof of trading performance.'));
    findings.forEach((finding) => {
      const card = node('article', 'item'); const title = node('b', '', finding.title);
      title.append(node('span', 'pill', 'Review'));
      card.append(title, node('small', '', 'Evidence: ' + finding.evidence), node('small', '', 'Next: ' + finding.action)); reviews.append(card);
    });
  }
  function renderDetail() {
    const source = latest.find((s) => s.id === selected); if (!source) return;
    $('detail-title').textContent = source.label;
    const detail = $('detail'); detail.replaceChildren(node('p', '', source.detail));
    const rows = [
      'Status: ' + (source.ok ? source.status === 'good' ? 'Available' : 'Available · review' : 'Unavailable'),
      'Source: ' + source.url,
      source.ok ? 'Content marker: ' + source.hash + (source.changed ? ' · changed locally' : '') : 'Error: ' + source.error,
      source.t ? 'Published: ' + stamp(source.t) + (source.futureMinutes != null ? ' · future time, review' : '') : 'Published time: not provided by this source',
      source.id === 'learning' && source.ok ? (source.lastLesson ? 'Last lesson event: ' + stamp(source.lastLesson) + ' · not a publisher check' : 'No dated lesson event yet; publisher time is unknown') : null,
      source.ok ? 'Size: ' + source.bytes.toLocaleString() + ' characters' : 'No data received'
    ];
    rows.filter(Boolean).forEach((row) => { const i = row.indexOf(': '), it = node('div', 'item kv'); it.append(node('span', '', row.slice(0, i)), node('b', '', row.slice(i + 2))); detail.append(it); });
  }
  let scanning = false;
  async function scan() {
    if (scanning) return;
    scanning = true;
    const button = $('refresh'); button.disabled = true; button.textContent = 'Scanning…';
    $('updated').textContent = 'Checking six published sources…';
    try {
      latest = await Promise.all(SOURCES.map(load));
      history.push({ at: now(), sources: latest.map(({ id, ok, status, hash, t, demo, error }) => ({ id, ok, status, hash, t, demo, error })) });
      history = history.slice(-30);
      try { localStorage.setItem(key, JSON.stringify(history)); } catch (_) { /* storage quota or privacy mode */ }
      render(); $('updated').textContent = 'Last scan ' + stamp(now()) + ' · refreshes while open every five minutes';
      if (window.OLYMPUS && window.OLYMPUS.ready) window.OLYMPUS.ready();
    } catch (_) {
      $('updated').textContent = 'Scan failed. Check your connection and try again.';
    } finally {
      scanning = false;
      button.disabled = false; button.textContent = 'Scan sources';
    }
  }
  function exportReview() {
    const report = { title: 'OLYMPUS Observatory review', generated: new Date().toISOString(), method: 'Read-only published JSON scan; change markers stored on this device; no code or trading change applied', sources: latest, findings: latest.map(insight).filter(Boolean), scansSaved: history.length };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = node('a'); link.href = url; link.download = 'olympus-observatory-review.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('refresh').addEventListener('click', scan); $('export').addEventListener('click', exportReview);
  scan(); setInterval(() => { if (!document.hidden) scan(); }, 300000);
})();
