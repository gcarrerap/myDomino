// Motor de dominó: funciones puras sobre el estado de la mesa.
// Código movido sin cambios desde index.html (fase 2 de #3).

import { tileRank } from "./tiles.js";
import { pushLog, nameOf } from "./table.js";
import { legalPlays, canDraw, canPass, play, draw, pass } from "./moves.js";

// Tiempos: 15 s para decidir quién sale (pareja ganadora), 20 s por turno
export const limitMs = (h) => (h && h.turn === null && !h.board.length ? 15000 : 20000);

// Se acabó el tiempo: si nadie de la pareja salió, sale la ficha más alta de los dos;
// si es un turno normal, come lo necesario y tira una ficha al azar (o pasa si no puede)
export function autoMove(st, rnd = Math.random) {
  if (st.status !== "playing") return st;
  const h = st.hand;
  const markAuto = (s2) => { const hh = s2.hand; if (hh && hh.history && hh.history.length) hh.history[hh.history.length - 1].auto = true; return s2; };
  const tag = (s2, seat) => markAuto({ ...s2, log: pushLog(s2.log.slice(0, -1), `Se acabó el tiempo de ${nameOf(st, seat)}`).concat(s2.log.slice(-1)).slice(-12) }) ;
  if (h.turn === null && !h.board.length) {
    let best = null, seat = h.openers[0];
    for (const s of h.openers) for (const t of h.hands[s]) if (best === null || tileRank(t) > tileRank(best)) { best = t; seat = s; }
    const s2 = markAuto(play(st, seat, best, "X"));
    return { ...s2, log: pushLog(s2.log.slice(0, -1), "Nadie salió a tiempo").concat(s2.log.slice(-1)).slice(-12) };
  }
  const seat = h.turn; let cur = st;
  for (let guard = 0; guard < 30; guard++) {
    const lp = legalPlays(cur, seat);
    if (lp.length) { const p = lp[Math.floor(rnd() * lp.length)]; return tag(play(cur, seat, p.tile, p.side), seat); }
    if (canDraw(cur, seat)) { cur = draw(cur, seat); continue; }
    if (canPass(cur, seat)) return tag(pass(cur, seat), seat);
    break;
  }
  return cur;
}
