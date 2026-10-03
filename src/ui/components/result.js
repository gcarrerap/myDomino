// Resultado de la mano o de la partida.
import { P, TARGET, deal, nameOf, newGame } from "../../engine/index.js";
import { actions, state } from "../../app/index.js";
import { renderAdvice } from "./advice.js";
import { renderTracker } from "./tracker.js";
import { $, esc } from "../dom.js";
import { scoreLabels, teamColor } from "../labels.js";
import { tileSVG } from "../svg/tile.js";
const { leave, mutate } = actions;

export function renderResult(st, seat) {
  const m = $("#modal");
  if (!(st.status === "handover" || st.status === "gameover") || !st.result) {
    if (state.view.advice) return renderAdvice(st, seat);
    return renderTracker(st, seat);
  }
  actions.setView({ advice: null, track: null }, false);
  const r = st.result, c = st.config, labels = scoreLabels(st);
  const title = r.type === "domino" ? `${nameOf(st, r.seat)} dominó` : "Juego cerrado";
  const winTxt = c.teams ? `Gana la mano: ${labels[r.winner]}` : `Gana la mano: ${nameOf(st, r.winner)}`;
  const rows = st.seats.map((_, i) => `<div class="resrow"><div><strong>${c.teams ? `<span class="teamdot" style="background:${teamColor(i % 2)}"></span>` : ""}${esc(nameOf(st, i))}</strong>
      <div class="mini">${r.hands[i].map((t) => tileSVG(...P(t), false, 10)).join("") || '<span class="hint">sin fichas</span>'}</div></div>
      <span>${r.sums[i]} pts</span></div>`).join("");
  const adds = st.scores.map((s, i) => `<div class="resrow"><span>${esc(labels[i])}</span><span><span class="plus">${r.add[i] ? "+" + r.add[i] : "—"}</span> · ${s}</span></div>`).join("");
  const over = st.status === "gameover";
  const champ = over ? (c.teams ? labels[r.champion] : nameOf(st, r.champion)) : "";
  m.innerHTML = `<div class="overlay"><div class="modal" role="dialog" aria-modal="true">
    <h3>${esc(over ? `¡Ganó ${champ}!` : title)}</h3>
    <p class="hint">${esc(over ? `${title}. Alguien llegó a ${TARGET} puntos en contra.` : winTxt + (r.type === "cerrado" ? " (menos puntos)" : ""))}</p>
    <div class="res">${rows}</div>
    <h2>Puntos en contra</h2><div class="res">${adds}</div>
    <div class="row">${seat >= 0 ? (over ? `<button class="primary" id="again">Revancha</button>` : `<button class="primary" id="next">Siguiente mano</button>`) : ""}
      <button class="ghost" id="exit">Salir a mesas</button></div>
  </div></div>`;
  $("#next")?.addEventListener("click", () => mutate((s) => (s.status === "handover" ? deal(s) : s)));
  $("#again")?.addEventListener("click", () => mutate((s) => (s.status === "gameover" ? deal(newGame(s)) : s)));
  $("#exit").onclick = leave;
}
