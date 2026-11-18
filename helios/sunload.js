// HELIOS: loads the 3D sun on its own, so a missing three.js or WebGL never stops the page (helios.js waits for the event, then keeps the flat sunrise).
import * as T from './sun.js';
window.__heliosSun = T;
window.dispatchEvent(new Event('helios-sun'));
