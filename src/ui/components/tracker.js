// Registro de un jugador: qué fichas puede tener, con qué probabilidad y por qué, y tus notas.
import { P, hasPozo, nameOf } from "../../engine/index.js";
import { explainTile, tracker } from "../../ai/index.js";
import { actions, canReveal, noteKey, specFor, state } from "../../app/index.js";
import { $, esc } from "../dom.js";
import { closeOverlay, renderSheet } from "./sheet.js";
import { levelSeg } from "../labels.js";
import { tileSVG } from "../svg/tile.js";

// Explicación del porcentaje de una ficha (al tocarla en el registro)
export function tileDetail(st, seat, t, tr, spec) {
  const tile = state.view.trkSel; if (!tile) return "";
  const cellX = tr.rows.flat().find((x) => x.t === tile); if (!cellX || cellX.state === "gone" || cellX.state === "played") return "";
  const name = nameOf(st, t), [a, b] = P(tile), note = state.notes[noteKey(st, t, tile)];
  let body;
  if (cellX.state === "sure") body = `<p><b>Seguro la tiene.</b> Ya no puede estar con nadie más: o los demás pasaron con sus números, o contando las fichas que les quedan no les cabe.</p>`;
  else if (cellX.state === "no") {
    const lk = (st.hand.lacks && st.hand.lacks[t]) || [], miss = [a, b].filter((x) => lk.includes(x));
    body = `<p><b>Seguro no la tiene.</b> ${miss.length ? `${esc(name)} pasó o comió cuando había ${miss.join(" y ")} en la punta.` : "Contando las fichas que tiene cada quien y lo que se sabe que les falta, a él no le cabe."}</p>`;
  } else {
    const ex = explainTile(st, seat, spec, tile, t), pf = Math.round(100 * ex.pFull), pb = Math.round(100 * ex.pBase);
    body = `<p class="det-num"><b>${pf}%</b> de que ${esc(name)} la tenga.</p>
      <p><b>Con solo lo seguro serían ${pb}%.</b> La ${tile} puede estar con ${esc(name)}${ex.holders.length ? ", " + esc(ex.holders.join(", ")) : ""}; sin leer los tiros, se reparte según cuántas fichas tiene cada quien.</p>
      ${ex.facts.length ? `<ul>${ex.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      ${ex.events.length ? `<p><b>Los tiros que la movieron de ${pb}% a ${pf}%:</b></p><ul class="det-ev">${ex.events.map((e) => `<li><span class="det-d ${e.delta > 0 ? "up" : "down"}">${e.delta > 0 ? "+" : "−"}${Math.round(Math.abs(100 * e.delta))}</span> <b>${esc(e.what)}.</b> ${esc(e.why)}</li>`).join("")}</ul>`
        : `<p>${ex.analyzed ? "Ningún tiro la movió de forma notable" : "Todavía no hay tiros de otros que analizar"}: el porcentaje sale casi solo de lo seguro.</p>`}
      <p class="hint">Cada número es cuánto cambiaría el porcentaje si no se tomara en cuenta solo ese tiro. Los tiros se refuerzan entre sí, por eso no siempre suman la diferencia completa. Se calcula imaginando ${ex.samples} repartos posibles y viendo qué tan bien explica cada uno lo que tiró cada quien.</p>`;
  }
  return `<section class="det" aria-live="polite">
    <div class="adv-head"><span class="adv-tile">${tileSVG(a, b, false, 16)}</span><b>${tile}</b> en el registro de ${esc(name)}</div>
    ${body}
    <div class="row det-notes"><span class="hint">Tu nota:</span>
      <button class="${note === "si" ? "primary" : ""}" data-setnote="${tile}|si">Creo que la tiene</button>
      <button class="${note === "no" ? "primary" : ""}" data-setnote="${tile}|no">Creo que no</button>
      ${note ? `<button class="ghost" data-setnote="${tile}|">Borrar nota</button>` : ""}</div>
  </section>`;
}

export function renderTracker(st, seat) {
  const m = $("#modal"), t = state.view.track;
  if (t === null || t === undefined || !st.hand || t === seat) { m.innerHTML = ""; return; }
  const tr = tracker(st, seat, t), name = nameOf(st, t), h = st.hand;
  const pending = h.pend && h.pend.seat === t;
  const exact = tr.sure.length === tr.count && tr.count > 0;
  const S = 15;
  const spec = specFor(st, seat);
  const pOf = (tile) => Math.round(100 * ((spec.prob[tile] && spec.prob[tile][t]) || 0));
  const reveal = state.view.reveal && canReveal();
  const real = reveal ? new Set(h.hands[t]) : null;
  const cell = (inner, pct) => `<span class="trk-cell">${inner}<span class="trk-pct">${pct}</span></span>`;
  const grid = tr.rows.map((row) => `<div class="trk-row">${row.map((x) => {
    const [a, b] = P(x.t);
    if (x.state === "gone") return cell(`<span class="trk-slot" title="${x.t}: ya salió o es tuya"></span>`, "");
    if (x.state === "played") return cell(`<span class="trk-t played" title="${x.t}: la tiró ${esc(name)}">${tileSVG(a, b, false, S)}</span>`, "");
    const note = state.notes[noteKey(st, t, x.t)];
    const p = x.state === "maybe" ? pOf(x.t) : null;
    const lbl = x.state === "sure" ? "seguro la tiene" : x.state === "no" ? "no la tiene" : `puede tenerla, probabilidad estimada ${p}%`;
    return cell(`<button class="trk-t ${x.state} ${note ? "note-" + note : ""} ${real && real.has(x.t) ? "real" : ""} ${state.view.trkSel === x.t ? "sel" : ""}" data-note="${x.t}" aria-label="${x.t}: ${lbl}${note ? (note === "si" ? ", tu nota: creo que la tiene" : ", tu nota: creo que no") : ""}">${tileSVG(a, b, false, S)}</button>`,
      p === null ? "" : `${p}%`);
  }).join("")}</div>`).join("");
  let calib = "";
  if (reveal) {
    const hidden = h.hands[t].filter((x) => spec.prob[x] && !tr.sure.includes(x));
    if (hidden.length) {
      const avg = Math.round(hidden.reduce((q, x) => q + pOf(x), 0) / hidden.length);
      const maybeN = tr.rows.flat().filter((x) => x.state === "maybe").length;
      const naive = maybeN ? Math.round(100 * hidden.length / maybeN) : 0;
      calib = `<p class="reveal-note">Modo evaluación: las fichas con punto verde son las que ${esc(name)} tiene de verdad. A esas, el cálculo les daba en promedio <b>${avg}%</b>; repartiendo parejo habría sido como ${naive}%.</p>`;
    } else calib = `<p class="reveal-note">Modo evaluación: todas las fichas de ${esc(name)} ya están marcadas como seguras.</p>`;
  }
  renderSheet(m, "track-" + t, `Registro de ${name}`, `
    ${state.view.practice && st.seats[t] && st.seats[t].level ? `<div class="cpurow"><span class="cpuname">Nivel</span>${levelSeg("seat" + t, st.seats[t].level)}</div>` : ""}
    <p class="hint">Tiene <b>${tr.count}</b> ficha${tr.count === 1 ? "" : "s"}. ${exact ? "" : `Puede tener cualquiera de las que se ven completas.`}
      ${hasPozo(st.config) && h.pozo.length ? ` Hay ${h.pozo.length} en el pozo.` : ""}</p>
    ${tr.played.length ? `<p class="trk-played">Tiró: ${tr.played.map((x) => `<b>${x}</b>`).join(" ")}</p>` : ""}
    ${tr.sure.length ? `<p class="trk-sure">Seguro tiene: ${tr.sure.map((x) => `<b>${x}</b>`).join(" ")}</p>` : ""}
    ${tr.lacks.length ? `<p class="trk-no">No tiene: ${tr.lacks.map((n) => `<b>${n}</b>`).join(" ")}</p>` : ""}
    ${pending ? `<p class="hint">Acaba de comer. Lo que no tiene se confirma en su siguiente jugada.</p>` : ""}
    ${exact ? `<p class="trk-exact">Ya sabes exactamente qué fichas tiene.</p>` : ""}
    ${calib}
    <div class="trk">${grid}</div>
    ${tileDetail(st, seat, t, tr, spec)}
    <p class="hint">El porcentaje es especulativo: sale de leer los tiros de cada quien (${spec.events} ${spec.events === 1 ? "tiro analizado" : "tiros analizados"}), no solo de lo seguro. Lo rojo y lo tachado sí son seguros.</p>
    <p class="hint">Toca una ficha para ver por qué tiene ese porcentaje y para anotarla en azul.</p>
    <details class="help"><summary>¿Qué significa cada color?</summary><div class="trk-legend">
      <span><span class="trk-t maybe">${tileSVG(6, 1, false, 9)}</span> puede tenerla</span>
      <span><span class="trk-t sure">${tileSVG(6, 1, false, 9)}</span> seguro la tiene</span>
      <span><span class="trk-t no">${tileSVG(6, 1, false, 9)}</span> no la tiene</span>
      <span><span class="trk-t played">${tileSVG(6, 1, false, 9)}</span> la tiró ${esc(name)}</span>
      <span><span class="trk-slot sm"></span> la tiró otro o es tuya</span>
      <span><span class="trk-pct lg">62%</span> probabilidad especulativa</span>
      <span><span class="trk-t maybe note-si">${tileSVG(6, 1, false, 9)}</span> tu nota: creo que sí</span>
      <span><span class="trk-t maybe note-no">${tileSVG(6, 1, false, 9)}</span> tu nota: creo que no</span></div></details>
    <button class="primary" id="trkclose">Cerrar</button>`);
  $("#trkclose").onclick = closeOverlay;
  m.querySelectorAll("[data-lvl]").forEach((b) => b.onclick = () => {
    const [id, l] = b.dataset.lvl.split(":");
    actions.setSeatLevel(+id.replace("seat", ""), +l);
  });
  m.querySelectorAll("[data-setnote]").forEach((b) => b.onclick = () => {
    const [tile, val] = b.dataset.setnote.split("|"), k = noteKey(st, t, tile);
    actions.setNote(k, val);
    renderTracker(state.tableState, seat); // renderSheet conserva la posición del scroll
  });
  m.querySelectorAll("[data-note]").forEach((b) => b.onclick = () => {
    actions.setView({ trkSel: state.view.trkSel === b.dataset.note ? null : b.dataset.note }, false);
    renderTracker(state.tableState, seat);
  });
}
