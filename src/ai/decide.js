// Factor aleatorio de la compu (#27): decisiones firmes cuando la jugada es clara, dudas cuando no.
// - Entran al sorteo solo las jugadas dentro de la "ventana de duda" debajo de la mejor (en unidades de SCORE_SCALE).
//   Las demás tienen probabilidad cero: una jugada claramente mejor se escoge siempre.
// - Entre las que entran se escoge con una softmax de temperatura baja: la mejor sale más seguido, pero no siempre.

// Escala típica de puntaje: diferencia mediana entre la mejor y la segunda jugada, medida para cada perfil en partidas
// simuladas (scripts/torneo.mjs --escala) y guardada en su azar.escala. Sirve para que "cerca" signifique lo mismo
// para cualquier perfil, aunque sus pesos den puntajes de tamaños distintos. Si un perfil no la trae, se usa esta.
export const SCORE_SCALE = 5;

// Índice de la mejor jugada (la primera si hay empate exacto)
export function bestIndex(scores) {
  let bi = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[bi]) bi = i;
  return bi;
}

// Jugadas que entran al sorteo y su probabilidad. azar = { ventana, temperatura, escala } o null (sin azar)
export function choiceProbs(scores, azar) {
  const bi = bestIndex(scores), best = scores[bi], S = (azar && azar.escala) || SCORE_SCALE;
  const probs = scores.map((_, i) => (i === bi ? 1 : 0));
  if (!azar || !(azar.ventana > 0) || !(azar.temperatura > 0)) return probs;
  const near = scores.map((s, i) => i === bi || (best - s) / S <= azar.ventana);
  if (near.filter(Boolean).length <= 1) return probs;
  const w = scores.map((s, i) => (near[i] ? Math.exp((s - best) / (S * azar.temperatura)) : 0));
  const tot = w.reduce((q, v) => q + v, 0);
  return w.map((v) => v / tot);
}

export function chooseIndex(scores, azar, rnd = Math.random) {
  const probs = choiceProbs(scores, azar);
  const bi = bestIndex(scores);
  if (probs[bi] === 1) return bi;
  let r = rnd();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r < 0 && probs[i] > 0) return i; }
  return bi;
}
