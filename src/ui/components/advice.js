// Consejo: qué tirarían los tres niveles y por qué.
import { P, play } from "../../engine/index.js";
import { LEVELS } from "../../ai/index.js";
import { actions, state, timerOn, turnKey } from "../../app/index.js";
import { renderTracker } from "./tracker.js";
import { $, esc } from "../dom.js";
import { closeOverlay, renderSheet } from "./sheet.js";
import { tileSVG } from "../svg/tile.js";
const { mutate } = actions;

export function renderAdvice(st, seat) {
  const m = $("#modal"), adv = state.view.advice;
  if (!adv || turnKey(st) !== adv.key) { actions.setView({ advice: null }, false); m.innerHTML = ""; return renderTracker(st, seat); }
  const d = adv.data;
  let body;
  if (!d) body = `<p class="hint">Pensando… el avanzado está probando tus tiros en varios repartos posibles.</p>`;
  else if (d.error) body = `<p class="err">No se pudo calcular el consejo. Intenta otra vez.</p>`;
  else if (d.none) body = `<p>No tienes ninguna ficha que pegue. ${d.action === "draw" ? "Los tres niveles te dicen lo mismo: <b>come</b> hasta que te salga una que pegue." : "Los tres niveles te dicen lo mismo: <b>pasa</b>."}</p>`;
  else {
    const same = d.levels.every((x) => x.tile === d.levels[0].tile && x.side === d.levels[0].side);
    body = (d.only ? `<p class="hint">Solo tienes un tiro posible.</p>` : same ? `<p class="adv-agree">Los tres niveles coinciden.</p>` : "") +
      d.levels.map((x, i) => {
        const [a, b] = P(x.tile);
        return `<section class="adv-card">
          <div class="adv-head"><span class="lvtag adv-lv">${LEVELS[i + 1]}</span>
            <span class="adv-tile">${tileSVG(a, b, false, 16)}</span>
            <span class="adv-what"><b>${x.tile}</b> ${esc(x.sideText)}</span></div>
          <ul>${x.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
          <button class="primary adv-play" data-advplay="${x.tile}|${x.side}">Tirar ${x.tile}</button>
        </section>`;
      }).join("");
  }
  renderSheet(m, "advice", "Consejo", `
    <p class="hint">Cada nivel solo usa lo que tú puedes saber: tus fichas, la mesa y tu registro.${timerOn(st) ? " El reloj sigue corriendo." : ""}</p>
    ${body}`);
  m.querySelectorAll("[data-advplay]").forEach((b) => b.onclick = () => {
    const [t, side] = b.dataset.advplay.split("|"); closeOverlay();
    mutate((s2) => play(s2, seat, t, side));
  });
}
