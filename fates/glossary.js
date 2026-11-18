// Plain words for fates: underlines these words and shows what they mean on a tap.
// olympus/glossary-core.js does the work and holds the meanings (one place for every app).
// Delete this file and its one line in index.html to switch it off.
import { watch, pick } from '../olympus/glossary-core.js';
watch(pick(['p10', 'f10', 'MLL', 'drawdown', 'PF']));
