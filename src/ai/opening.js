// Plan de salida (movido de bots.js en #27 para que lo usen también los criterios).
import { T, P } from "../engine/index.js";

// ¿Tiene buen juego para salir? Cargado de un número (4+ con su mula, o 5+), y a lo más una mula suelta.
// Devuelve también con qué ficha conviene salir: la mula de su número fuerte, o una ficha de ese número.
export function openingPlan(hand) {
  const cnt = Array(7).fill(0), dbl = Array(7).fill(false);
  for (const t of hand) { const [a, b] = P(t); cnt[a]++; if (b !== a) cnt[b]++; else dbl[a] = true; }
  const loose = [0, 1, 2, 3, 4, 5, 6].filter((n) => dbl[n] && cnt[n] <= 2).length;
  let suit = 0;
  for (let n = 0; n <= 6; n++) if (cnt[n] > cnt[suit] || (cnt[n] === cnt[suit] && (dbl[n] && !dbl[suit] || (dbl[n] === dbl[suit] && n > suit)))) suit = n;
  const strong = ((cnt[suit] >= 4 && dbl[suit]) || cnt[suit] >= 5) && loose <= 1;
  let tile = null;
  if (dbl[suit]) tile = T(suit, suit);
  else {
    // ficha del número fuerte cuyo otro número también tenga respaldo; si empata, la más pesada
    let best = -1;
    for (const t of hand) { const [a, b] = P(t); if (a !== suit && b !== suit) continue; const o = a === suit ? b : a; const sc = cnt[o] * 20 + a + b; if (sc > best) { best = sc; tile = t; } }
  }
  const score = cnt[suit] * 10 + (dbl[suit] ? 5 : 0) - loose * 4;
  // Calificación 0-10: 4 de un número con su mula y sin mulas sueltas ≈ 6.5; 6 de un número con su mula = 10
  const rating = Math.max(0, Math.min(10, (cnt[suit] - 2) * 2.5 + (dbl[suit] ? 1.5 : 0) - loose));
  return { strong, suit, tile, score, rating, count: cnt[suit], loose };
}
