// Mesa en línea antes de repartir: escoger asiento.
import { deal } from "../../engine/index.js";
import { actions, state } from "../../app/index.js";
import { $, esc } from "../dom.js";
import { levelSeg, modeLabel, teamColor } from "../labels.js";
const { leave, mutate } = actions;

export function renderSeats(app, st, seat) {
  const c = st.config, full = st.seats.every(Boolean), isHost = st.host === state.me.id;
  app.innerHTML = `
    <div class="top"><button class="ghost" id="back">← Mesas</button><span class="code">Mesa ${esc(st.code)}</span></div>
    <section class="panel">
      <h2>${esc(modeLabel(c))}</h2>
      <p class="hint">Comparte el enlace de esta página. Cada quien entra a la mesa ${esc(st.code)} y escoge asiento.</p>
      <div class="seats">${st.seats.map((s, i) => `<div class="seat ${s ? "taken" : ""}">
        <span class="lbl">${c.teams ? `<span class="teamdot" style="background:${teamColor(i % 2)}"></span>Pareja ${i % 2 === 0 ? "A" : "B"} · ` : ""}Asiento ${i + 1}</span>
        <strong>${s ? esc(s.name) + (s.bot ? " · compu" : s.id === state.me.id ? " (tú)" : "") : "Libre"}</strong>
        ${!s ? `<button data-sit="${i}">Sentarme aquí</button>${seat >= 0 ? `<button class="ghost" data-addbot="${i}">Agregar compu</button>` : ""}`
          : s.bot ? `${levelSeg("bot" + i, s.level || 2)}${seat >= 0 ? `<button class="ghost" data-unbot="${i}">Quitar</button>` : ""}`
          : s.id === state.me.id ? `<button class="ghost" data-stand="${i}">Levantarme</button>` : ""}
      </div>`).join("")}</div>
      ${!state.me.name ? `<label for="nm2">Tu nombre</label><input type="text" id="nm2" maxlength="16" placeholder="Ej. Rodrigo">` : ""}
      <div class="row">
        <button class="primary" id="start" ${full && seat >= 0 ? "" : "disabled"}>Repartir</button>
        ${isHost ? `<button class="ghost" id="del">Borrar mesa</button>` : ""}
      </div>
      <p class="hint">${full ? "Todos sentados. Cualquier jugador puede repartir." : seat >= 0 ? "Faltan jugadores. Puedes llenar los asientos libres con la compu." : "Faltan jugadores."}</p>
      ${st.seats.some((x) => x && x.bot) ? `<p class="hint">A la compu la mueve el teléfono de quien está sentado en el asiento más bajo; si no está, el de alguien más.</p>` : ""}
    </section>
    <p class="err">${esc(state.view.err)}</p>`;
  $("#back").onclick = leave;
  $("#nm2")?.addEventListener("input", (e) => actions.setName(e.target.value));
  app.querySelectorAll("[data-sit]").forEach((b) => b.onclick = () => {
    if (!state.me.name) return actions.setError("Escribe tu nombre primero.");
    const i = +b.dataset.sit;
    mutate((s) => { if (s.status !== "lobby") throw new Error("La partida ya empezó."); if (s.seats[i]) throw new Error("Ese asiento ya lo tomaron.");
      s.seats = s.seats.map((x) => (x && x.id === state.me.id ? null : x)); s.seats[i] = { id: state.me.id, name: state.me.name }; s.v++; return s; });
  });
  app.querySelectorAll("[data-stand]").forEach((b) => b.onclick = () => mutate((s) => { s.seats = s.seats.map((x) => (x && x.id === state.me.id ? null : x)); s.v++; return s; }));
  app.querySelectorAll("[data-addbot]").forEach((b) => b.onclick = () => actions.addBot(+b.dataset.addbot));
  app.querySelectorAll("[data-unbot]").forEach((b) => b.onclick = () => actions.removeBot(+b.dataset.unbot));
  if (seat >= 0) app.querySelectorAll("[data-lvl]").forEach((b) => b.onclick = () => { const [id, l] = b.dataset.lvl.split(":"); actions.setOnlineBotLevel(+id.replace("bot", ""), +l); });
  $("#start").onclick = () => mutate((s) => {
    if (s.status !== "lobby" || !s.seats.every(Boolean)) throw new Error("Faltan jugadores.");
    if (!actions.hasPerson(s)) throw new Error("Hace falta al menos una persona sentada.");
    return deal(s);
  });
  $("#del")?.addEventListener("click", () => { if ($("#del").dataset.armed) { mutate(() => null).then(leave); } else { $("#del").dataset.armed = "1"; $("#del").textContent = "Toca otra vez para borrar"; } });
  $("#modal").innerHTML = "";
}
