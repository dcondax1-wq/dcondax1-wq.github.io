// Plain words for hephaestus: underlines these words and shows what they mean on a tap.
// olympus/glossary-core.js does the work and holds the meanings (one place for every app).
// Delete this file and its one line in index.html to switch it off.
import { watch, pick } from '../olympus/glossary-core.js';
watch(pick(['IFVG', 'CISD', 'inducement', 'displacement', 'sweep', 'PF', 'drawdown', 'liquidity', 'p10', 'f10', 'slippage', 'MFE', 'MAE']));
