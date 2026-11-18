// SYMPOSIUM: loads the 3D hall on its own, so a missing three.js or WebGL never stops the page (symposium.js waits for the event, then keeps the portrait grid).
import * as T from './hall.js?v=q6d';
window.__symHall = T;
window.dispatchEvent(new Event('sym-hall'));
// the scene director (establishing shot, greeter, conversation camera: direct.js); without it the hall keeps its own camera
import('./direct.js?v=d2').then((D) => { window.__symDirect = D; window.dispatchEvent(new Event('sym-direct')); }).catch(() => {});
