// PEOPLE OF OLYMPUS, the optional model: when the owner connected his own model in Jarvis ("Connect my brain": his own key, kept only in this phone's
// localStorage under 'jarvis.smart'), a question the offline engine cannot answer goes to THAT provider with the person's persona and facts as context.
// Nothing is sent when Jarvis's smart mode is off or has no key. The key is only read here, never written, shown or logged. One request, 8 s, no tools.
// The reply is thrown away when it contains a number that is not in the person's facts (people.js checks), so a model cannot invent figures.
const SMART_KEY = 'jarvis.smart';
const PROVIDERS = {
  groq: { name: 'Groq', model: 'openai/gpt-oss-120b', url: 'https://api.groq.com/openai/v1/chat/completions' },
  gemini: { name: 'Gemini', model: 'gemini-3.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  openrouter: { name: 'OpenRouter', model: 'meta-llama/llama-3.3-70b-instruct:free', url: 'https://openrouter.ai/api/v1/chat/completions' },
  anthropic: { name: 'Anthropic', model: 'claude-sonnet-5-5', url: 'https://api.anthropic.com/v1/messages' },
};
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** { on, provider, name, model } when Jarvis's smart mode is on with a key for its provider; null otherwise */
export function connection(storage) {
  try {
    const st = storage || (typeof localStorage !== 'undefined' ? localStorage : null), v = st ? JSON.parse(st.getItem(SMART_KEY) || 'null') : null;
    if (!isObj(v) || !v.on || !PROVIDERS[v.provider]) return null;
    const key = isObj(v.keys) && typeof v.keys[v.provider] === 'string' ? v.keys[v.provider].trim() : '';
    if (!key) return null;
    const model = isObj(v.models) && typeof v.models[v.provider] === 'string' && v.models[v.provider] ? v.models[v.provider] : PROVIDERS[v.provider].model;
    return { on: true, provider: v.provider, name: PROVIDERS[v.provider].name, model, key };
  } catch (_) { return null; }
}
export function wire(c, system, msgs) {
  if (c.provider === 'anthropic') return { url: PROVIDERS.anthropic.url, headers: { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' }, body: { model: c.model, max_tokens: 300, system, messages: msgs } };
  if (c.provider === 'gemini') return { url: PROVIDERS.gemini.url + encodeURIComponent(c.model) + ':generateContent', headers: { 'x-goog-api-key': c.key, 'content-type': 'application/json' }, body: { systemInstruction: { parts: [{ text: system }] }, contents: msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 1024 } } };
  const headers = { Authorization: 'Bearer ' + c.key, 'content-type': 'application/json' };
  if (c.provider === 'openrouter') headers['X-Title'] = 'Olympus people';
  return { url: PROVIDERS[c.provider].url, headers, body: { model: c.model, max_tokens: 1024, messages: [{ role: 'system', content: system }].concat(msgs) } };
}
export function parse(provider, j) {
  if (!isObj(j)) return '';
  if (provider === 'anthropic') return j.stop_reason === 'refusal' ? '' : (Array.isArray(j.content) ? j.content : []).filter((b) => isObj(b) && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim();
  if (provider === 'gemini') { const c = Array.isArray(j.candidates) ? j.candidates[0] : null, parts = isObj(c) && isObj(c.content) && Array.isArray(c.content.parts) ? c.content.parts : []; return parts.filter((x) => isObj(x) && typeof x.text === 'string' && !x.thought).map((x) => x.text).join('').trim(); }
  const c = Array.isArray(j.choices) ? j.choices[0] : null;
  return isObj(c) && isObj(c.message) && typeof c.message.content === 'string' ? c.message.content.trim() : '';
}
/** the model's answer (plain text, at most 600 characters) or '' on any failure. turns = the last few [{ role: 'user' | 'assistant', content }] */
export async function askModel(system, turns, text, opts) {
  const o = opts || {}, c = o.connection || connection();
  if (!c) return '';
  try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return ''; } catch (_) { /* unknown: try */ }
  const msgs = [];
  for (const m of (turns || []).slice(-6)) { if (!msgs.length && m.role !== 'user') continue; if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += '\n' + m.content; else msgs.push({ role: m.role, content: String(m.content).slice(0, 600) }); }
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
  msgs.push({ role: 'user', content: String(text).slice(0, 600) });
  const req = wire(c, system, msgs), ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), o.timeout || 8000) : 0;
  try {
    const r = await (o.fetch || fetch)(req.url, { method: 'POST', signal: ctl ? ctl.signal : undefined, headers: req.headers, body: JSON.stringify(req.body) });
    if (!r || !r.ok) return '';
    return parse(c.provider, await r.json()).replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, 600);
  } catch (_) { return ''; } finally { clearTimeout(timer); }
}
