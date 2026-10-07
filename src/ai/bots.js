// Jugadores de la compu (#27). Todos los bots usan los mismos criterios de decisión (criteria.js); cada perfil
// (profiles.js) decide cuánto pesa cada uno, qué tanto recuerda, deduce y analiza (mind.js), y con cuánta duda decide
// cuando la jugada no es clara (decide.js). Ningún bot ve fichas ajenas: solo su mano, la mesa y lo que pasó a la
// vista de todos (y de eso, solo lo que recuerda).
//
// Los niveles de siempre (1 Básico, 2 Intermedio, 3 Avanzado) son los perfiles Bot 01-03.
import { legalPlays, canDraw, canPass } from "../engine/index.js";
import { knowledge } from "./mind.js";
import { turnContext, scoreOptions } from "./criteria.js";
import { getProfile } from "./profiles.js";
import { chooseIndex } from "./decide.js";
import { monteCarloMove } from "./search.js";
import { NOISE } from "./tune.js";
export { openingPlan } from "./opening.js";

// who: perfil, id de perfil ("b07") o nivel (1-3).
// opts.rnd: números al azar (para reproducir); opts.onScores(scores, lp): para el torneo; opts.azar: false apaga el factor aleatorio (simulaciones internas y
// pruebas). Por omisión el azar sigue a NOISE.on, que las simulaciones apagan mientras juegan por dentro.
export function botMove(st, seat, who = 1, opts = {}) {
  const lp = legalPlays(st, seat);
  if (!lp.length) {
    if (canDraw(st, seat)) return { type: "draw" };
    if (canPass(st, seat)) return { type: "pass" };
    return null;
  }
  const pick = (p) => ({ type: "play", tile: p.tile, side: p.side });
  if (lp.length === 1) return pick(lp[0]);
  const prof = getProfile(who), rnd = opts.rnd || Math.random;
  const azarOn = opts.azar ?? NOISE.on;
  const know = knowledge(st, seat, prof.mente);
  const ctx = turnContext(st, seat, know, prof.mente);
  const scores = scoreOptions(ctx, prof, lp);
  if (opts.onScores) opts.onScores(scores, lp, ctx);
  const base = lp[chooseIndex(scores, azarOn ? prof.azar : null, rnd)];
  if (prof.mente.calculo > 0) {
    const infer = prof.mente.inferirEnCalculo ?? !!prof.mente.sospechas;
    return pick(monteCarloMove(st, seat, lp, prof.mente.calculo, base, infer));
  }
  return pick(base);
}
