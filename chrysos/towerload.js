// CHRYSOS: loads the 3D tower on its own, so a missing three.js or WebGL never stops the page (chrysos.js waits for the event, then keeps the flat tower).
import * as T from './tower.js';
window.__chrysosTower = T;
window.dispatchEvent(new Event('chrysos-tower'));
