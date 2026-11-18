// ATHENA store: the reader's own small memory, on this phone only (localStorage keys that all start with 'athena.'): bookmarks, reading
// history, the flashcard boxes, today's rule checks and the days a lesson was read. A blocked or full storage never breaks the page: it
// just forgets. Nothing is sent anywhere.
//   load(name, fallback) -> the saved JSON value (or the fallback)      save(name, value) -> true when kept
const P = 'athena.';

export function load(name, fallback) {
  try {
    const v = localStorage.getItem(P + name);
    return v == null ? fallback : JSON.parse(v);
  } catch (_) {
    return fallback;
  }
}

export function save(name, value) {
  try {
    localStorage.setItem(P + name, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}
