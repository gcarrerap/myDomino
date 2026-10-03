// Arranque de la interfaz: reloj, suscripción al estado, redibujar al cambiar el tamaño y conectar con Firebase.
import { actions, state, subscribe } from "./app/index.js";
import { tick } from "./ui/clock.js";
import { render } from "./ui/render.js";
import { renderTables } from "./ui/screens/lobby.js";

setInterval(tick, 250);

subscribe((what) => (what === "list" ? renderTables() : render()));

window.addEventListener("resize", () => { if (state.view.screen === "table") render(); });

render();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", actions.start); else actions.start();
