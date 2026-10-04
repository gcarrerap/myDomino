// Ventanas (#20): un solo componente para las ventanas que suben desde abajo y los menús que flotan.
// Lo que está abierto vive en el estado (state.view.sheet y state.view.seatMenu). Abrir agrega una entrada al
// historial del navegador, así el botón "atrás" del teléfono cierra la ventana en lugar de salir del juego.
import { state, actions } from "../../app/index.js";
import { esc } from "../dom.js";

const OVERLAYS = { sheet: null, seatMenu: null };
export const overlayOpen = () => !!state.view.sheet || (state.view.seatMenu !== null && state.view.seatMenu !== undefined);

// history.back() no es inmediato: hasta que llega "popstate" no hay que volver a llamarlo (si no, se sale del juego)
let backing = false, reopen = null;
const goBack = () => { if (!backing) { backing = true; history.back(); } };
const inOverlayEntry = () => !!(history.state && history.state.overlay);

// Abre una ventana o menú (cierra cualquier otro que estuviera abierto)
export function openOverlay(patch) {
  if (backing) { reopen = patch; return; } // se abre en cuanto termine de regresar
  if (inOverlayEntry()) history.replaceState({ overlay: true }, "");
  else history.pushState({ overlay: true }, "");
  actions.setView({ ...OVERLAYS, ...patch });
}
// Cierra lo que esté abierto (por el historial, para que "atrás" y ✕ hagan lo mismo)
export function closeOverlay() {
  if (backing) { reopen = null; return; }
  if (inOverlayEntry()) goBack();
  else actions.setView({ ...OVERLAYS });
}
// Después de dibujar: si algo se cerró por otra vía (por ejemplo, al entrar a una mesa), quita la entrada del historial
export function syncOverlayHistory() {
  if (!overlayOpen() && inOverlayEntry()) goBack();
}
export function installOverlayKeys() {
  window.addEventListener("popstate", () => {
    backing = false;
    if (reopen) { const p = reopen; reopen = null; openOverlay(p); }
    else if (overlayOpen()) actions.setView({ ...OVERLAYS });
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlayOpen()) closeOverlay(); });
}

const X = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>`;

// Dibuja una ventana que sube desde abajo dentro de `host` (normalmente #modal). Anima solo al abrirse.
export function renderSheet(host, id, title, body) {
  const anim = !(host.querySelector(".sheet") && host.querySelector(".sheet").dataset.sheet === id);
  const scroll = anim ? 0 : host.querySelector(".sheet").scrollTop;
  host.innerHTML = `<div class="sheet-bg ${anim ? "anim" : ""}" id="sheetbg">
    <section class="sheet ${anim ? "anim" : ""}" data-sheet="${esc(id)}" role="dialog" aria-modal="true" aria-labelledby="sheettitle">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-head"><h3 id="sheettitle">${esc(title)}</h3><button class="iconbtn" id="sheetclose" aria-label="Cerrar">${X}</button></div>
      ${body}
    </section></div>`;
  const sheet = host.querySelector(".sheet");
  sheet.scrollTop = scroll;
  host.querySelector("#sheetclose").onclick = closeOverlay;
  host.querySelector("#sheetbg").onclick = (e) => { if (e.target.id === "sheetbg") closeOverlay(); };
  if (anim) host.querySelector("#sheetclose").focus({ preventScroll: true });
  return sheet;
}
export const closeIcon = X;
