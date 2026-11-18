// HARMONIA: loads the 3D balance beam on its own, so a missing three.js or WebGL never stops the page (harmonia.js waits for the event, then keeps the flat balance).
import * as T from './beam.js';
window.__harmoniaBeam = T;
window.dispatchEvent(new Event('harmonia-beam'));
