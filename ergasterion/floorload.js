// ERGASTERION: loads the 3D floor on its own, so a missing three.js or WebGL never stops the page (ergasterion.js waits for the event, then keeps the flat plan view).
import * as T from './floor.js';
window.__ergFloor = T;
window.dispatchEvent(new Event('erg-floor'));
// the scene director (third person, tap-to-walk, the conversation camera: direct.js) comes next; without it the floor keeps its first-person controls
import('./direct.js?v=d2').then((D) => { window.__ergDirect = D; window.dispatchEvent(new Event('erg-direct')); }).catch(() => {});
