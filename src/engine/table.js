// Motor de dominó: funciones puras sobre el estado de la mesa.
// Código movido sin cambios desde index.html (fase 2 de #3).

import { fullSet, shuffle, tileRank } from "./tiles.js";
import { nScores } from "./config.js";

export function newTable(code, config, host) {
  return {
    code, config, host, created: Date.now(),
    seats: Array(config.n).fill(null),
    status: "lobby", scores: Array(nScores(config)).fill(0),
    handNo: 0, lastWinner: null, hand: null, result: null, log: [], v: 0,
  };
}

export function deal(st, rnd = Math.random) {
  const c = st.config, deck = shuffle(fullSet(), rnd);
  const hands = []; let k = 0;
  for (let i = 0; i < c.n; i++) { hands.push(deck.slice(k, k + c.per)); k += c.per; }
  const rest = deck.slice(k);
  let muestra = null, pozo = [];
  if (c.n === 3 && c.per === 9) muestra = rest[0];
  else pozo = rest;
  const h = { hands, pozo, muestra, board: [], turn: null, mano: null, passes: 0, openers: null, firstReq: null, drew: 0, lacks: hands.map(() => []), played: hands.map(() => []), history: [], since: Date.now() };
  if (st.handNo === 0 || st.lastWinner === null) {
    // Primera mano: sale la mula más alta (o la ficha más alta si no hay mulas)
    let best = null, seat = 0;
    hands.forEach((hh, i) => hh.forEach((t) => { if (best === null || tileRank(t) > tileRank(best)) { best = t; seat = i; } }));
    h.turn = seat; h.openers = [seat]; h.firstReq = best;
  } else if (c.teams) {
    const tm = st.lastWinner; h.openers = [tm, tm + 2]; h.turn = null; // cualquiera del equipo ganador
  } else {
    h.turn = st.lastWinner; h.openers = [st.lastWinner];
  }
  return { ...st, status: "playing", handNo: st.handNo + 1, hand: h, result: null,
    log: pushLog(st.log, `Mano ${st.handNo + 1}: repartidas ${c.per} fichas por jugador` + (muestra ? `, muestra ${muestra}` : "")), v: st.v + 1 };
}

export function pushLog(log, msg) { return [...(log || []), msg].slice(-12); }

export const nextSeat = (st, s) => (s + 1) % st.config.n;
export const nameOf = (st, s) => (st.seats[s] && st.seats[s].name) || `Jugador ${s + 1}`;

// Mesa en línea abandonada antes de repartir: nadie sentado
export const isEmptyTable = (st) => st.status === "lobby" && st.seats.every((s) => !s);

export function newGame(st) {
  return { ...st, status: "lobby", scores: Array(nScores(st.config)).fill(0), handNo: 0, lastWinner: null, hand: null, result: null, log: pushLog(st.log, "Nueva partida"), v: st.v + 1 };
}
