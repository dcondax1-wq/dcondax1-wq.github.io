// AGORA palette of the Data City: the engine's section colours (cyan, magenta, mint, violet) are replaced here by marble, bronze, gold,
// olive and terracotta, and every district is filed under a plain theme (hour, setup, weekday, month, mood) for the district index.
// Pure (no DOM, no three.js).
export const SECTION_AGORA = {
  times: '#c8a24a', confluences: '#b07a45', week: '#8f9a5c', seasons: '#c96a4a', volatility: '#6f93ab',
  gaps: '#e0b060', orange: '#a8744a', esnq: '#b9a98c', while: '#cfc4b2', harbor: '#c8a24a',
};
const SPARE = ['#c8a24a', '#9c6b3c', '#7f8a52', '#c96a4a', '#b9a98c', '#e0b060'];
// the theme of a district, in the owner's words: by hour, by setup, by weekday, by month, by market mood
export const THEMES = [
  { key: 'hour', name: 'By hour', keys: ['times', 'orange'], blurb: 'Which time of day an idea works' },
  { key: 'setup', name: 'By setup', keys: ['confluences', 'while', 'esnq'], blurb: 'Which pattern or state triggers it' },
  { key: 'weekday', name: 'By weekday', keys: ['week'], blurb: 'Monday to Friday' },
  { key: 'month', name: 'By month', keys: ['seasons'], blurb: 'Month of the year, turn of the month, OpEx week' },
  { key: 'mood', name: 'By market mood', keys: ['volatility', 'gaps'], blurb: 'VIX levels, gaps up and down' },
];
export const themeOf = (key) => THEMES.find((t) => t.keys.includes(key)) || { key: 'other', name: 'Other', blurb: 'Added districts' };

/** the AGORA colour of a section (a plug-in or unknown key gets a warm colour from its name) */
export function agoraColor(key, i = 0) {
  if (SECTION_AGORA[key]) return SECTION_AGORA[key];
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[(h + i) % SPARE.length];
}
