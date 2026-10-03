// Pantalla de inicio: tu nombre, sesión, nueva mesa, práctica y mesas abiertas.
import { TARGET } from "../../engine/index.js";
import { BOT_NAMES, actions, isGoogle, state } from "../../app/index.js";
import { $, esc } from "../dom.js";
import { LEVEL_HELP, levelSeg, modeLabel } from "../labels.js";
const { createTable, googleIn, googleOut, openTable, startPractice } = actions;

export function authBox() {
  if (!state.dbTried || !state.db) return "";
  if (isGoogle()) return `<div class="row"><p class="hint" style="flex:1">Conectado con Google: <b>${esc(state.authUser.email || state.authUser.displayName || "")}</b></p><button class="ghost" id="gout">Salir</button></div>`;
  return `<div class="row"><button id="gin">Entrar con Google</button><p class="hint" style="flex:1">o sigue como invitado. Con Google eres el mismo jugador en cualquier teléfono.</p></div>`;
}

export function renderLobby(app) {
  $("#modal").innerHTML = "";
  app.className = "wrap";
  const c = state.config;
  const perOpts = c.n === 2 ? [[7, "7 fichas, se come"], [14, "14 fichas, sin pozo"]] : c.n === 3 ? [[9, "9 fichas + muestra"], [7, "7 fichas, se come"]] : [[7, "7 fichas"]];
  app.innerHTML = `
    <div class="brand"><h1>Dominó de la Familia</h1><small>Partidas a ${TARGET} puntos</small></div>
    <section class="panel">
      <label for="nm">Tu nombre en la mesa</label>
      <input type="text" id="nm" maxlength="16" placeholder="Ej. Barbara" value="${esc(state.me.name)}">
      ${authBox()}
    </section>
    <section class="panel">
      <h2>Nueva mesa</h2>
      <div class="seg" role="group" aria-label="Jugadores">
        ${[2, 3, 4].map((n) => `<button data-n="${n}" aria-pressed="${c.n === n}">${n} jugadores</button>`).join("")}
      </div>
      ${c.n === 4 ? `<div class="seg" role="group" aria-label="Modalidad">
        <button data-teams="1" aria-pressed="${c.teams}">Parejas</button>
        <button data-teams="0" aria-pressed="${!c.teams}">Individual</button></div>` : ""}
      ${perOpts.length > 1 ? `<div class="seg" role="group" aria-label="Fichas">${perOpts.map(([p, l]) => `<button data-per="${p}" aria-pressed="${c.per === p}">${l}</button>`).join("")}</div>` : ""}
      <div class="seg" role="group" aria-label="Límite de tiempo">
        <button data-timer="1" aria-pressed="${c.timer}">Con tiempo (20 s)</button>
        <button data-timer="0" aria-pressed="${!c.timer}">Sin límite de tiempo</button></div>
      <p class="hint">${esc(modeLabel(c))}. ${c.n === 4 && c.teams ? "Parejas: los asientos 1 y 3 contra 2 y 4." : ""}</p>
      <div class="row">
        <button class="primary" id="create" ${state.db ? "" : "disabled"}>Crear mesa</button>
        <button id="practice">Practicar contra la compu</button>
      </div>
      <div class="cpu">
        <h2>Nivel de la compu (práctica)</h2>
        ${Array.from({ length: c.n - 1 }, (_, i) => `<div class="cpurow"><span class="cpuname">${BOT_NAMES[i]}${c.teams ? (i === 1 ? " · tu pareja" : " · rival") : ""}</span>${levelSeg("lobby" + i, state.botLevels[i])}</div>`).join("")}
        <p class="hint">Básico: ${LEVEL_HELP[1]} Intermedio: ${LEVEL_HELP[2].toLowerCase()} Avanzado: ${LEVEL_HELP[3].toLowerCase()}</p>
      </div>
      ${state.dbTried && !state.db ? `<p class="hint">No se pudo conectar con las mesas en línea. Revisa tu internet y recarga; mientras, puedes practicar contra la compu.</p>` : ""}
    </section>
    <section class="panel">
      <h2>Mesas abiertas</h2>
      <div class="tables" id="tables"></div>
    </section>
    <p class="err" id="err">${esc(state.view.err)}</p>`;
  $("#nm").addEventListener("input", (e) => actions.setName(e.target.value));
  $("#gin")?.addEventListener("click", googleIn);
  $("#gout")?.addEventListener("click", googleOut);
  app.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => actions.setPlayers(+b.dataset.n));
  app.querySelectorAll("[data-timer]").forEach((b) => b.onclick = () => actions.setTimer(b.dataset.timer === "1"));
  app.querySelectorAll("[data-teams]").forEach((b) => b.onclick = () => actions.setTeams(b.dataset.teams === "1"));
  app.querySelectorAll("[data-per]").forEach((b) => b.onclick = () => actions.setPer(+b.dataset.per));
  $("#create").onclick = () => { if (needName()) return; createTable(); };
  $("#practice").onclick = startPractice;
  app.querySelectorAll("[data-lvl]").forEach((b) => b.onclick = () => { const [id, l] = b.dataset.lvl.split(":"); actions.setBotLevel(+id.replace("lobby", ""), +l); });
  renderTables();
}

export function renderTables() {
  const box = $("#tables"); if (!box) return;
  if (!state.db) { box.innerHTML = `<p class="hint">${state.dbTried ? "No se pudo conectar con las mesas en línea. Recarga la página." : "Buscando mesas…"}</p>`; return; }
  if (!state.listCache.length) { box.innerHTML = `<p class="hint">Todavía no hay mesas. Crea una y comparte el enlace de esta página con tu familia.</p>`; return; }
  box.innerHTML = state.listCache.map((t) => {
    const filled = t.seats.filter(Boolean).length, mine = t.seats.some((s) => s && s.id === state.me.id);
    const st = t.status === "lobby" ? `${filled}/${t.config.n} sentados` : t.status === "gameover" ? "Partida terminada" : `Mano ${t.handNo}`;
    return `<div class="trow"><div><div class="code">${esc(t.code)}</div><div class="meta">${esc(modeLabel(t.config))} · ${st}</div>
      <div class="meta">${t.seats.filter(Boolean).map((s) => esc(s.name)).join(", ") || "Sin jugadores"}</div></div>
      <button data-open="${esc(t.code)}" class="${mine ? "primary" : ""}">${mine ? "Volver" : "Entrar"}</button></div>`;
  }).join("");
  box.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openTable(b.dataset.open));
}

export function needName() { if (!state.me.name) { actions.setError("Escribe tu nombre primero."); $("#nm")?.focus(); return true; } return false; }
