// La mesa de juego: marcador, jugadores alrededor, la cadena, tu mano y tus acciones.
import { P, TARGET, canDraw, canPass, draw, ends, hasPozo, legalPlays, nameOf, pass, play, teamOf } from "../../engine/index.js";
import { deduce } from "../../ai/index.js";
import { actions, canReveal, mySeat, notify, scheduleBot, state, timerOn } from "../../app/index.js";
import { tick } from "../clock.js";
import { renderResult } from "../components/result.js";
import { $, esc } from "../dom.js";
import { modeLabel, scoreLabels, teamColor } from "../labels.js";
import { renderSeats } from "./seats.js";
import { chainSVG } from "../svg/chain.js";
import { tileSVG } from "../svg/tile.js";
const { askAdvice, handArrangement, leave, mutate } = actions;

// Posición de cada jugador en la mesa, vista desde mí: abajo yo; el turno pasa a la derecha, luego arriba, luego izquierda.
export function seatPos(st, seat, s) {
  const n = st.config.n, k = (s - (seat < 0 ? 0 : seat) + n) % n;
  if (k === 0) return "bottom";
  if (n === 2) return "top";
  if (n === 3) return k === 1 ? "right" : "left";
  return ["bottom", "right", "top", "left"][k];
}

export function renderTable(app) {
  const st = state.tableState;
  app.className = "wrap";
  if (!st) { app.innerHTML = `<div class="top"><button class="ghost" id="back">← Mesas</button></div><p class="hint">${esc(state.view.err || "Cargando mesa…")}</p>`; $("#back").onclick = leave; $("#modal").innerHTML = ""; return; }
  const seat = mySeat(st);
  if (st.status === "lobby") return renderSeats(app, st, seat);
  app.className = "game";
  const c = st.config, h = st.hand, n = c.n;
  const labels = scoreLabels(st);
  const myScoreIdx = seat >= 0 ? teamOf(st, seat) : -1;
  const turnSeats = h.turn !== null ? [h.turn] : (h.board.length ? [] : h.openers);
  const ded = st.status === "playing" ? deduce(st, seat) : null;
  const sureCount = (s) => (ded ? Object.values(ded.possible).filter((p) => p.length === 1 && p[0] === s).length : 0);
  const reveal = state.view.reveal && canReveal();

  // Marcador corto para la barra
  const short = c.teams
    ? `<span class="sc"><span class="teamdot" style="background:${teamColor(myScoreIdx < 0 ? 0 : myScoreIdx)}"></span>Nos <b>${st.scores[myScoreIdx < 0 ? 0 : myScoreIdx]}</b></span><span class="sc"><span class="teamdot" style="background:${teamColor(myScoreIdx < 0 ? 1 : 1 - myScoreIdx)}"></span>Ellos <b>${st.scores[myScoreIdx < 0 ? 1 : 1 - myScoreIdx]}</b></span>`
    : st.scores.map((v, i) => `<span class="sc ${i === seat ? "mine" : ""}">${esc(i === seat ? "Tú" : nameOf(st, i).slice(0, 6))} <b>${v}</b></span>`).join("");

  // Jugadores alrededor de la mesa
  // Cada jugador es una franja delgada pegada a su orilla de la mesa (arriba, izquierda o derecha)
  const badge = (s) => {
    const pos = seatPos(st, seat, s), cnt = h.hands[s].length, lk = (h.lacks && h.lacks[s]) || [], sc = sureCount(s);
    const tiles = reveal ? `<span class="rl-rev">${h.hands[s].map((x) => tileSVG(...P(x), false, 8)).join("")}</span>`
      : `<span class="rl-backs">${"<i></i>".repeat(Math.min(cnt, 14))}</span>`;
    const info = [s === h.mano ? "salió" : "", lk.length ? `sin ${lk.join(",")}` : "", sc ? `${sc} segura${sc === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
    return `<button class="rl rl-${pos} ${turnSeats.includes(s) && st.status === "playing" ? "turn" : ""}" data-track="${s}" aria-label="${esc(nameOf(st, s))}: ${cnt} fichas${info ? ", " + info : ""}. Ver registro">
      <span class="rl-nm">${c.teams ? `<span class="teamdot" style="background:${teamColor(s % 2)}"></span>` : ""}${esc(nameOf(st, s))}</span>
      ${tiles}${info ? `<span class="rl-info">${esc(info)}</span>` : ""}</button>`;
  };
  const others = []; for (let k = 0; k < n; k++) if (k !== seat) others.push(k);
  const at = (pos) => others.filter((s) => seatPos(st, seat, s) === pos).map(badge).join("");

  const legal = seat >= 0 ? legalPlays(st, seat) : [];
  const legalTiles = new Set(legal.map((p) => p.tile));
  const sel = state.view.sel && legalTiles.has(state.view.sel) ? state.view.sel : null;
  const selSides = sel ? legal.filter((p) => p.tile === sel).map((p) => p.side) : [];
  const [le, re] = h.board.length ? ends(h) : [null, null];

  // La cadena crece al inicio hacia la pareja (o el jugador) que lleva la mano
  let vertical = false;
  if (h.board.length && h.mano !== null && h.mano !== undefined) {
    const team = others.concat(seat >= 0 ? [seat] : []).filter((s) => (c.teams ? s % 2 === h.mano % 2 : s === h.mano));
    vertical = team.some((s) => ["top", "bottom"].includes(seatPos(st, seat, s)));
  }

  let statusTxt = "", myTurn = false;
  if (st.status === "playing") {
    myTurn = turnSeats.includes(seat);
    if (myTurn) statusTxt = "Te toca";
    else if (turnSeats.length) statusTxt = `Turno de ${turnSeats.map((s) => nameOf(st, s)).join(" o ")}`;
    if (h.turn === null && !h.board.length && myTurn) statusTxt = "Sale tu pareja o tú";
    if (myTurn && !legal.length) statusTxt += canDraw(st, seat) ? " · come" : " · pasa";
    else if (myTurn && sel && selSides.length > 1) statusTxt += " · ¿de qué lado?";
  }

  const emptyMsg = !h.board.length ? (() => {
    const who = h.turn !== null ? nameOf(st, h.turn) : h.openers.map((s) => nameOf(st, s)).join(" o ");
    return `<div class="empty">Sale ${esc(who)}${h.firstReq ? ` con la ${h.firstReq === "6-6" ? "mula de 6" : "ficha " + h.firstReq}` : ""}</div>`;
  })() : "";
  const sideBtns = sel && (selSides.includes("L") || selSides.includes("R") || selSides.includes("X"))
    && !(selSides.length === 1) ? `<div class="sidebtns">${selSides.map((sd) => `<button class="endbtn" data-side="${sd}">${sd === "X" ? `Tirar ${sel}` : `Pegar al ${sd === "L" ? le : re}`}</button>`).join("")}</div>` : "";

  const order = seat >= 0 ? handArrangement(st, seat) : [];
  const handHTML = seat >= 0 ? order.map((t) => {
    const [a, b] = P(t), fl = state.arr.flip[t], cls = legalTiles.has(t) ? (t === sel ? "sel" : "play") : "dim";
    return `<button class="tilebtn ${cls} ${state.view.rotMode ? "rot" : ""}" data-tile="${t}" aria-label="Ficha ${t}">${tileSVG(fl ? b : a, fl ? a : b, true, 22)}</button>`;
  }).join("") : `<p class="hint" style="color:var(--felt-muted)">Estás mirando la mesa.</p>`;

  const menu = state.view.menu ? `<div class="menuov" id="menuov"><nav class="menu" aria-label="Menú">
      <div class="menu-head"><b>${esc(state.view.practice ? "Práctica" : "Mesa " + st.code)}</b><span class="hint">Mano ${st.handNo} · ${esc(modeLabel(c))}</span></div>
      <div class="scores">${st.scores.map((v, i) => `<div class="score ${i === myScoreIdx ? "mine" : ""}"><div class="who">${c.teams ? `<span class="teamdot" style="background:${teamColor(i)}"></span>` : ""}${esc(labels[i])}</div>
        <div class="val">${v}<small> / ${TARGET}</small></div><div class="bar"><i style="width:${Math.min(100, v)}%"></i></div></div>`).join("")}</div>
      ${canReveal() ? `<button id="reveal" class="${reveal ? "primary" : ""}">${reveal ? "Ocultar manos" : "Ver manos (evaluar)"}</button>` : ""}
      <h2>Jugadas</h2><div class="log">${st.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join("")}</div>
      <button id="back">← Salir a mesas</button>
      <button class="primary" id="menuclose">Volver al juego</button>
    </nav></div>` : "";

  app.innerHTML = `
    <header class="gbar">
      <button class="menubtn" id="menu" aria-label="Menú" aria-expanded="${!!state.view.menu}"><span></span><span></span><span></span></button>
      <div class="bar-sc">${short}</div>
      <div class="bar-info">${hasPozo(c) ? `Pozo <b>${h.pozo.length}</b>` : ""}${h.muestra ? ` <span class="muestra">${tileSVG(...P(h.muestra), false, 8)}</span>` : ""}</div>
    </header>
    <section class="table">
      <div class="rail rail-top">${at("top")}</div>
      <div class="rail rail-left">${at("left")}</div>
      <div class="board" id="board"><div class="chain" id="chain">${emptyMsg}</div></div>
      <div class="rail rail-right">${at("right")}</div>
      <div class="band band-bot"><span class="ends" id="ends"></span></div>
    </section>
    <section class="me">
      <div class="status ${myTurn ? "me" : ""}">${esc(statusTxt)}${st.status === "playing" && timerOn(st) ? ` <span id="clock" class="clock"></span>` : ""}</div>
      ${st.status === "playing" && timerOn(st) ? `<div class="timer" aria-hidden="true"><i id="clockbar"></i></div>` : ""}
      ${sideBtns}
      <div class="hand ${state.view.rotMode ? "rotmode" : ""}" id="hand">${handHTML}</div>
      ${seat >= 0 && st.status === "playing" ? `<div class="actions">
        <button id="draw" ${canDraw(st, seat) ? "" : "disabled"}>Comer${hasPozo(c) ? ` (${h.pozo.length})` : ""}</button>
        <button id="pass" ${canPass(st, seat) ? "" : "disabled"}>Pasar</button>
        <button id="advice" class="ghost-felt" ${myTurn ? "" : "disabled"}>Consejo</button>
        <button id="rot" class="ghost-felt ${state.view.rotMode ? "on" : ""}" aria-pressed="${!!state.view.rotMode}">${state.view.rotMode ? "Listo" : "Girar"}</button></div>` : ""}
      ${state.view.rotMode ? `<p class="rothint">Toca una ficha para girarla. Arrastra para acomodarla.</p>` : ""}
      ${state.view.err ? `<p class="err">${esc(state.view.err)}</p>` : ""}
    </section>
    ${menu}`;

  // Cadena: se dibuja con el tamaño real de la mesa
  // Cadena: usa toda la mesa (los jugadores están en la banda de arriba)
  if (h.board.length) {
    const bd = $("#board"), W = Math.max(120, bd.clientWidth), H = Math.max(120, bd.clientHeight);
    const origin = Math.min(h.left || 0, h.board.length - 1);
    $("#chain").innerHTML = chainSVG(h.board, origin, W, H, vertical).svg;
    $("#ends").innerHTML = `Puntas <b>${le}</b> y <b>${re}</b>`;
  }

  // Mano: tocar = tirar (o girar en modo Girar); arrastrar = acomodar
  const handEl = $("#hand");
  const tapTile = (t) => {
    if (state.view.rotMode) return actions.flipTile(t);
    if (!legalTiles.has(t)) return;
    const sides = legal.filter((p) => p.tile === t).map((p) => p.side);
    if (sides.length === 1) return mutate((s2) => play(s2, seat, t, sides[0]));
    actions.setView({ sel: state.view.sel === t ? null : t });
  };
  if (handEl && seat >= 0) {
    let drag = null;
    const finish = (cancel) => {
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onCancel);
      const d = drag; drag = null; actions.setDragging(false);
      if (!d) return;
      d.el.classList.remove("dragging");
      if (cancel) return notify();
      if (d.moved) actions.setHandOrder([...handEl.querySelectorAll("[data-tile]")].map((x) => x.dataset.tile));
      else tapTile(d.t);
    };
    const onMove = (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
      if (!drag.moved) { drag.moved = true; drag.el.classList.add("dragging"); actions.setDragging(true); }
      e.preventDefault();
      const sibs = [...handEl.querySelectorAll("[data-tile]")].filter((x) => x !== drag.el);
      for (const o of sibs) {
        const r = o.getBoundingClientRect();
        if (e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10 && e.clientX >= r.left && e.clientX <= r.right) {
          handEl.insertBefore(drag.el, e.clientX < r.left + r.width / 2 ? o : o.nextSibling); break;
        }
      }
    };
    const onUp = () => finish(false), onCancel = () => finish(true);
    handEl.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("[data-tile]"); if (!b || drag) return;
      drag = { el: b, t: b.dataset.tile, x: e.clientX, y: e.clientY, moved: false };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onCancel);
    });
    handEl.querySelectorAll("[data-tile]").forEach((b) => b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapTile(b.dataset.tile); } }));
  }
  app.querySelectorAll("[data-side]").forEach((b) => b.onclick = () => { const t = sel; mutate((s2) => play(s2, seat, t, b.dataset.side)); });
  $("#draw")?.addEventListener("click", () => mutate((s2) => draw(s2, seat)));
  $("#pass")?.addEventListener("click", () => mutate((s2) => pass(s2, seat)));
  $("#advice")?.addEventListener("click", () => askAdvice(seat));
  $("#rot")?.addEventListener("click", () => actions.setView({ rotMode: !state.view.rotMode }));
  $("#menu").onclick = () => actions.setView({ menu: !state.view.menu });
  if (state.view.menu) {
    $("#menuclose").onclick = () => actions.setView({ menu: false });
    $("#menuov").onclick = (e) => { if (e.target.id === "menuov") actions.setView({ menu: false }); };
    $("#back").onclick = leave;
    $("#reveal")?.addEventListener("click", () => actions.setView({ reveal: !state.view.reveal }));
  }
  app.querySelectorAll("[data-track]").forEach((b) => b.onclick = () => actions.setView({ advice: null, trkSel: null, track: +b.dataset.track }));
  renderResult(st, seat);
  scheduleBot();
  tick();
}
