// AEGIS: loads the 3D shield on its own, so a missing three.js or WebGL never stops the page (aegis.js waits for the event, then keeps the flat shield).
import * as T from './shield.js';
window.__aegisShield = T;
window.dispatchEvent(new Event('aegis-shield'));
