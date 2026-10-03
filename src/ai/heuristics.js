// Jugadores de la compu, deducción y consejo. Solo usan lo que el jugador puede saber.
// Código movido sin cambios desde index.html (fase 3 de #3).

import { P, ends } from "../engine/index.js";

export function newEnds(h, p) {
  const [a, b] = P(p.tile);
  if (p.side === "X") return [a, b];
  const [l, r] = ends(h);
  return p.side === "L" ? [a === l ? b : a, r] : [l, a === r ? b : a];
}
export const has = (t, n) => { const [x, y] = P(t); return x === n || y === n; };

export function heurScore(hand, tile, side, before, board, partnerTiles) {
  const [a, b] = P(tile), rest = hand.filter((t) => t !== tile);
  let ne;
  if (side === "X" || !before) ne = [a, b];
  else { const [l, r] = before; ne = side === "L" ? [a === l ? b : a, r] : [l, a === r ? b : a]; }
  const nums = [...new Set(ne)];
  const seen = [...board, tile, ...rest];
  let sc = 0.6 * (a + b) + (a === b ? 5 : 0);
  for (const n of nums) {
    const mine = rest.filter((t) => has(t, n)).length;
    const unseenN = 7 - seen.filter((t) => has(t, n)).length;
    sc += 2.5 * Math.min(mine, 3) - 1.2 * unseenN;
    if (partnerTiles.some((t) => has(t, n))) sc += 1.5;
  }
  return sc;
}
export function optionsAt(hand, before) {
  if (!before) return hand.map((t) => ({ tile: t, side: "X" }));
  const [l, r] = before, out = [];
  for (const t of hand) {
    const [a, b] = P(t);
    if (a === l || b === l) out.push({ tile: t, side: "L" });
    if ((a === r || b === r) && !(l === r && (a === l || b === l))) out.push({ tile: t, side: "R" });
  }
  return out;
}
