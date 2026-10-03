// Dibuja la pantalla que toca (lobby o mesa). Se llama cada vez que cambia el estado (ver src/main.js).
import { state } from "../app/index.js";
import { $ } from "./dom.js";
import { renderLobby } from "./screens/lobby.js";
import { renderTable } from "./screens/table.js";

export function render() {
  if (state.dragging) return; // no redibujar a medio arrastre
  const app = $("#app");
  if (state.view.screen === "lobby") return renderLobby(app);
  return renderTable(app);
}
