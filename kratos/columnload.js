// KRATOS: loads the 3D column on its own, so a missing three.js or WebGL never stops the page (kratos.js waits for the event, then keeps the flat column).
import * as T from './column.js';
window.__kratosColumn = T;
window.dispatchEvent(new Event('kratos-column'));
