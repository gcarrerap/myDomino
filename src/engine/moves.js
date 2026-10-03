// Motor de dominó: funciones puras sobre el estado de la mesa.
// Código movido sin cambios desde index.html (fase 2 de #3).

import { P } from "./tiles.js";
import { pushLog, nextSeat, nameOf } from "./table.js";
import { endHand } from "./scoring.js";

export const ends = (h) => (h.board.length ? [h.board[0][0], h.board[h.board.length - 1][1]] : null);

// Jugadas legales para un asiento: [{tile, side:'L'|'R'|'X'}]
export function legalPlays(st, seat) {
  const h = st.hand; if (!h || st.status !== "playing") return [];
  const hand = h.hands[seat];
  if (!h.board.length) {
    if (!h.openers.includes(seat)) return [];
    if (h.turn !== null && h.turn !== seat) return [];
    const allowed = h.firstReq ? hand.filter((t) => t === h.firstReq) : hand;
    return allowed.map((t) => ({ tile: t, side: "X" }));
  }
  if (h.turn !== seat) return [];
  const [l, r] = ends(h), out = [];
  for (const t of hand) {
    const [a, b] = P(t);
    if (a === l || b === l) out.push({ tile: t, side: "L" });
    if ((a === r || b === r) && !(l === r && (a === l || b === l))) out.push({ tile: t, side: "R" });
  }
  return out;
}
export const canDraw = (st, seat) => st.status === "playing" && st.hand.board.length > 0 && st.hand.turn === seat && legalPlays(st, seat).length === 0 && st.hand.pozo.length > 0;
export const canPass = (st, seat) => st.status === "playing" && st.hand.board.length > 0 && st.hand.turn === seat && legalPlays(st, seat).length === 0 && st.hand.pozo.length === 0;

export function resolvePending(h, seat) {
  if (!h.lacks) h.lacks = h.hands.map(() => []);
  if (h.pend && h.pend.seat === seat) { h.lacks[seat] = h.pend.ends.slice().sort(); h.pend = null; }
}

export function play(st, seat, tile, side) {
  const lp = legalPlays(st, seat).find((p) => p.tile === tile && (p.side === side || p.side === "X"));
  if (!lp) throw new Error("Jugada no válida");
  const h = structuredClone(st.hand);
  const [a, b] = P(tile);
  if (lp.side === "X") { h.board = [[a, b]]; h.left = 0; h.mano = seat; h.firstReq = null; }
  else {
    const [l, r] = ends(h);
    if (lp.side === "L") { h.board.unshift(b === l ? [a, b] : [b, a]); h.left = (h.left || 0) + 1; }
    else h.board.push(a === r ? [a, b] : [b, a]);
  }
  h.hands[seat] = h.hands[seat].filter((t) => t !== tile);
  if (!h.played) h.played = h.hands.map(() => []);
  h.played[seat].push(tile);
  if (!h.history) h.history = [];
  h.history.push({ s: seat, a: "play", tile, side: lp.side, ends: [h.board[0][0], h.board[h.board.length - 1][1]], forced: lp.side === "X" && !!st.hand.firstReq });
  resolvePending(h, seat);
  h.passes = 0; h.drew = 0;
  let s2 = { ...st, hand: h, log: pushLog(st.log, `${nameOf(st, seat)} tiró ${tile}`), v: st.v + 1 };
  if (!h.hands[seat].length) return endHand(s2, { type: "domino", seat });
  h.turn = nextSeat(st, seat); h.since = Date.now();
  return s2;
}

export function draw(st, seat) {
  if (!canDraw(st, seat)) throw new Error("No puedes comer");
  const h = structuredClone(st.hand);
  const t = h.pozo.pop(); h.hands[seat].push(t); h.drew = (h.drew || 0) + 1;
  // Si come, no tenía ninguna punta. La ficha que acaba de comer puede pegar, así que el dato
  // se confirma en su siguiente acción (vuelve a comer, tira o pasa).
  resolvePending(h, seat);
  h.lacks[seat] = [];
  h.pend = { seat, ends: [...new Set(ends(h))] };
  if (!h.history) h.history = [];
  h.history.push({ s: seat, a: "draw", ends: ends(h) });
  return { ...st, hand: h, log: pushLog(st.log, `${nameOf(st, seat)} comió`), v: st.v + 1 };
}

export function pass(st, seat) {
  if (!canPass(st, seat)) throw new Error("No puedes pasar: tienes jugada");
  const h = structuredClone(st.hand);
  h.passes += 1; h.drew = 0;
  resolvePending(h, seat);
  h.lacks[seat] = [...new Set([...h.lacks[seat], ...ends(h)])].sort();
  if (!h.history) h.history = [];
  h.history.push({ s: seat, a: "pass", ends: ends(h) });
  let s2 = { ...st, hand: h, log: pushLog(st.log, `${nameOf(st, seat)} pasó`), v: st.v + 1 };
  if (h.passes >= st.config.n) return endHand(s2, { type: "cerrado" });
  h.turn = nextSeat(st, seat); h.since = Date.now();
  return s2;
}
