// Motor de dominó: funciones puras sobre el estado de la mesa.
// Código movido sin cambios desde index.html (fase 2 de #3).

import { sumHand } from "./tiles.js";
import { TARGET, nScores } from "./config.js";
import { pushLog, nameOf } from "./table.js";

export function endHand(st, how) {
  const c = st.config, h = st.hand, n = c.n;
  const sums = h.hands.map(sumHand);
  const add = Array(nScores(c)).fill(0);
  let winner; // asiento (individual) o equipo
  const orderFromMano = []; for (let i = 0; i < n; i++) orderFromMano.push((h.mano + i) % n);
  if (c.teams) {
    const tsum = [sums[0] + sums[2], sums[1] + sums[3]];
    if (how.type === "domino") winner = how.seat % 2;
    else winner = tsum[0] === tsum[1] ? h.mano % 2 : (tsum[0] < tsum[1] ? 0 : 1);
    add[1 - winner] = tsum[1 - winner];
  } else if (n === 2) {
    if (how.type === "domino") winner = how.seat;
    else winner = sums[0] === sums[1] ? h.mano : (sums[0] < sums[1] ? 0 : 1);
    add[1 - winner] = sums[1 - winner];
  } else {
    // Individual 3-4: todos se anotan sus puntos en contra
    sums.forEach((s, i) => (add[i] = s));
    if (how.type === "domino") winner = how.seat;
    else { let min = Infinity; for (const s of orderFromMano) if (sums[s] < min) { min = sums[s]; winner = s; } }
  }
  const scores = st.scores.map((s, i) => s + add[i]);
  const over = scores.some((s) => s >= TARGET);
  let champion = null;
  if (over) {
    if (c.teams || n === 2) champion = scores[0] >= TARGET && scores[1] >= TARGET ? (scores[0] < scores[1] ? 0 : 1) : (scores[0] >= TARGET ? 1 : 0);
    else { let min = Infinity; scores.forEach((s, i) => { if (s < min) { min = s; champion = i; } }); }
  }
  const result = { type: how.type, seat: how.seat ?? null, winner, add, sums, hands: h.hands, over, champion };
  const label = how.type === "domino" ? `${nameOf(st, how.seat)} dominó` : "Juego cerrado";
  return { ...st, hand: { ...h, turn: null }, status: over ? "gameover" : "handover", scores, lastWinner: winner, result,
    log: pushLog(st.log, label), v: st.v + 1 };
}
