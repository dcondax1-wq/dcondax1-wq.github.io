// NQ v4: the funded tracker's rules (payready.js, the same as the Board / Trading) for the goals strip, loaded after the first paint by nq.js
// (a module tag it adds when the PC's post has arrived; the page's eager JS budget). Hands the model to the page and says so.
import { model } from './payready.js?v=2';
window.NQ_PAYREADY = model;
try { window.dispatchEvent(new Event('nq-payready')); } catch (e) { /* the page asks again on its next minute */ }
