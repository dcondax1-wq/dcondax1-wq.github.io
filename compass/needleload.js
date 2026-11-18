// COMPASS: loads the 3D compass rose on its own, so a missing three.js or WebGL never stops the page (compass.js waits for the event, then keeps the flat compass).
import * as T from './rose.js';
window.__compassRose = T;
window.dispatchEvent(new Event('compass-rose'));
