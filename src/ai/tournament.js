// Torneo entre bots (#27): partidas simuladas sin interfaz, reproducibles con semilla, para medir qué tan fuerte es
// cada perfil y si de verdad juega distinto ("huella de estilo"). Lo usan scripts/torneo.mjs y las pruebas.
import { newTable, deal, play, draw, pass, legalPlays, P } from "../engine/index.js";
import { botMove } from "./bots.js";
import { openingPlan } from "./opening.js";
import { getProfile } from "./profiles.js";
import { seededRandom } from "./rng.js";
import { newEnds } from "./heuristics.js";

// Corre fn con Math.random reemplazado por un generador con semilla (la IA y el motor lo usan por dentro)
export function withSeed(seed, fn) {
  const real = Math.random; Math.random = seededRandom(seed);
  try { return fn(); } finally { Math.random = real; }
}

const emptyStats = () => ({ decisions: 0, mulaOpp: 0, mulaYes: 0, cuadreOpp: 0, cuadreYes: 0, ptsRel: 0, plays: 0, nextPassed: 0, partnerOpp: 0, partnerCut: 0, closeOpp: 0, closeYes: 0, gaps: [] });

// Una partida 2 contra 2 a "target" puntos en contra. seats: 4 perfiles (o ids), en orden de asiento.
// Devuelve { winner: equipo 0|1, scores, hands, stats: por asiento }
export function playGame(seats, { seed = 1, target = 100, config = { n: 4, teams: true, per: 7, timer: false }, maxHands = 60 } = {}) {
  return withSeed(seed, () => {
    const profs = seats.map(getProfile);
    let st = newTable("TORNEO", config, "torneo");
    st.seats = profs.map((p, i) => ({ id: "bot" + i, name: p.nombre, bot: true, perfil: p.id }));
    const stats = profs.map(emptyStats);
    let hands = 0;
    while (hands < maxHands) {
      st = deal(st); hands++;
      st.gameId = `torneo-${seed}`; // fijo: la memoria de los bots depende de él (la hora cambiaría el olvido)
      const firstPlays = [0, 0, 0, 0];
      for (let g = 0; g < 300 && st.status === "playing"; g++) {
        const h = st.hand;
        if (h.turn === null && !h.board.length) { // sale la pareja ganadora: el de mejor juego, con su plan
          const s = h.openers.slice().sort((x, y) => openingPlan(h.hands[y]).rating - openingPlan(h.hands[x]).rating)[0];
          const plan = openingPlan(h.hands[s]);
          st = play(st, s, plan.tile, "X"); firstPlays[s]++; continue;
        }
        const s = h.turn, lp = legalPlays(st, s);
        let scores = null;
        const m = botMove(st, s, profs[s], { onScores: (sc) => { scores = sc; } });
        if (m.type === "play" && lp.length > 1) record(stats[s], st, s, lp, m, scores, firstPlays[s] < 2);
        st = m.type === "play" ? play(st, s, m.tile, m.side) : m.type === "draw" ? draw(st, s) : pass(st, s);
        if (m.type === "play") {
          firstPlays[s]++; stats[s].plays++;
          const nh = st.hand; if (st.status === "playing" && nh.turn !== null && legalPlays(st, nh.turn).length === 0) stats[s].nextPassed++;
        }
      }
      const total = st.scores;
      if (total.some((x) => x >= target)) {
        const winner = total[0] === total[1] ? st.lastWinner : total[0] < total[1] ? 0 : 1;
        return { winner, scores: total, hands, stats };
      }
    }
    return { winner: st.scores[0] <= st.scores[1] ? 0 : 1, scores: st.scores, hands, stats };
  });
}

function record(S, st, s, lp, m, scores, early) {
  const h = st.hand;
  S.decisions++;
  const facts = lp.map((p) => { const [a, b] = P(p.tile); const ne = newEnds(h, p); return { p, dbl: a === b, pts: a + b, cuadre: h.board.length > 0 && ne[0] === ne[1], ne }; });
  const k = lp.findIndex((p) => p.tile === m.tile && p.side === m.side), ch = facts[k];
  if (early && facts.some((f) => f.dbl)) { S.mulaOpp++; if (ch.dbl) S.mulaYes++; }
  if (facts.some((f) => f.cuadre) && facts.some((f) => !f.cuadre)) { S.cuadreOpp++; if (ch.cuadre) S.cuadreYes++; }
  S.ptsRel += ch.pts - facts.reduce((q, f) => q + f.pts, 0) / facts.length;
  // Cortar el número de la pareja: había opción de dejarlo y lo quitó
  const partner = (s + 2) % 4, pn = new Set((h.played?.[partner] || []).flatMap(P));
  const keeps = (f) => f.ne.some((x) => pn.has(x));
  if (pn.size && facts.some(keeps) && facts.some((f) => !keeps(f))) { S.partnerOpp++; if (!keeps(ch)) S.partnerCut++; }
  if (scores) {
    const srt = scores.slice().sort((x, y) => y - x);
    if (srt.length > 1 && srt[0] < 1e5) S.gaps.push(srt[0] - srt[1]);
    // ¿Había una jugada que cerraba el juego? (puntaje de tranque visible como ±300 o más)
  }
}

// Resumen de la huella de estilo de varias partidas (asientos de un mismo perfil sumados)
export function fingerprint(statsList) {
  const S = emptyStats();
  for (const x of statsList) for (const k of Object.keys(S)) { if (k === "gaps") S.gaps.push(...x.gaps); else S[k] += x[k]; }
  const r = (a, b) => (b ? a / b : null);
  return {
    decisiones: S.decisions,
    mulaTemprana: r(S.mulaYes, S.mulaOpp), // de las veces que pudo poner mula en sus 2 primeras jugadas
    cuadra: r(S.cuadreYes, S.cuadreOpp), // de las veces que pudo cuadrar (y también no cuadrar)
    puntosSoltados: r(S.ptsRel, S.decisions), // puntos de la ficha escogida menos el promedio de sus opciones
    hacePasar: r(S.nextPassed, S.plays), // jugadas después de las cuales el siguiente no pudo jugar
    cortaPareja: r(S.partnerCut, S.partnerOpp), // quitó de la mesa los números de su pareja pudiendo dejarlos
  };
}

// Enfrenta un perfil (asientos 0 y 2, o 1 y 3 alternando) contra una referencia, games partidas.
export function match(profile, reference, { games = 20, seed = 1, target = 100 } = {}) {
  let wins = 0, diff = 0, hands = 0; const st = [];
  for (let g = 0; g < games; g++) {
    const flip = g % 2 === 1;
    const seats = flip ? [reference, profile, reference, profile] : [profile, reference, profile, reference];
    const r = playGame(seats, { seed: seed * 1000 + g, target });
    const me = flip ? 1 : 0;
    if (r.winner === me) wins++;
    diff += r.scores[1 - me] - r.scores[me]; hands += r.hands;
    st.push(r.stats[me], r.stats[me + 2]);
  }
  const p = wins / games, se = Math.sqrt(Math.max(p * (1 - p), 1e-9) / games);
  return { games, wins, winRate: p, ci95: [Math.max(0, p - 1.96 * se), Math.min(1, p + 1.96 * se)], pointsPerHand: diff / hands, fingerprint: fingerprint(st) };
}
