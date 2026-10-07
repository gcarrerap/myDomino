// Copia CONGELADA del botMove de antes de #27 (niveles 1, 2 y 3), solo para comprobar que los perfiles
// Básico, Intermedio y Avanzado deciden igual que antes con el factor aleatorio apagado. No se usa en el juego.
// Jugadores de la compu, deducción y consejo. Solo usan lo que el jugador puede saber.
// Código movido sin cambios desde index.html (fase 3 de #3).

import { T, P, pts, sumHand, fullSet, legalPlays, canDraw, canPass } from "../../src/engine/index.js";
import { deduce } from "../../src/ai/deduce.js";
import { newEnds, has } from "../../src/ai/heuristics.js";
import { monteCarloMove } from "../../src/ai/search.js";
import { NOISE, TUNE } from "../../src/ai/tune.js";

// ¿Tiene buen juego para salir? Cargado de un número (4+ con su mula, o 5+), y a lo más una mula suelta.
// Devuelve también con qué ficha conviene salir: la mula de su número fuerte, o una ficha de ese número.
function openingPlan(hand) {
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

export function legacyBotMove(st, seat, level = 1) {
  const lp = legalPlays(st, seat);
  if (!lp.length) {
    if (canDraw(st, seat)) return { type: "draw" };
    if (canPass(st, seat)) return { type: "pass" };
    return null;
  }
  const h = st.hand, pick = (p) => ({ type: "play", tile: p.tile, side: p.side });
  if (lp.length === 1) return pick(lp[0]);
  const my = h.hands[seat];
  if (level <= 1) {
    let best = null, bs = -1e9;
    for (const p of lp) {
      const [a, b] = P(p.tile), rest = my.filter((t) => t !== p.tile), ne = newEnds(h, p);
      const match = rest.filter((t) => ne.some((n) => has(t, n))).length;
      const sc = (a === b ? 8 : 0) + a + b + 2 * match + Math.random();
      if (sc > bs) { bs = sc; best = p; }
    }
    return pick(best);
  }
  if (level >= 3) {
    const b2 = legacyBotMove(st, seat, 2);
    return pick(monteCarloMove(st, seat, lp, TUNE.samples, b2, level >= 4 ? true : TUNE.infer)); // 4 = solo para pruebas
  }
  const c = st.config, n = c.n;
  const friend = (s) => s === seat || (c.teams && s % 2 === seat % 2);
  const order = []; for (let k = 1; k < n; k++) order.push((seat + k) % n);
  const known = new Set([...my, ...h.board.map(([a, b]) => T(a, b))]); if (h.muestra) known.add(h.muestra);
  const unknown = fullSet().filter((t) => !known.has(t));
  const avgPts = unknown.length ? unknown.reduce((q, t) => q + pts(t), 0) / unknown.length : 0;
  const unseen = (num) => unknown.filter((t) => has(t, num)).length;
  const partner = c.teams ? (seat + 2) % 4 : -1;
  const partnerNums = new Set(partner >= 0 && h.played ? h.played[partner].flatMap(P) : []);
  const danger = order.some((s) => !friend(s) && h.hands[s].length <= 2);
  // Nivel 3: su propio registro
  let ded = null, share = null;
  if (level >= 3) {
    ded = deduce(st, seat);
    const cap = (id) => (id === "pozo" ? h.pozo.length : h.hands[id].length);
    share = (t, s) => {
      const pos = ded.possible[t] || []; if (!pos.includes(s)) return 0;
      const tot = pos.reduce((q, id) => q + cap(id), 0); return tot ? cap(s) / tot : 0;
    };
  }
  const expPts = (s) => (share ? unknown.reduce((q, t) => q + share(t, s) * pts(t), 0) : h.hands[s].length * avgPts);

  let best = null, bs = -1e9;
  for (const p of lp) {
    const [a, b] = P(p.tile), rest = my.filter((t) => t !== p.tile), ne = newEnds(h, p);
    const nums = [...new Set(ne)];
    if (!rest.length) return pick(p); // dominó
    let sc = 0.6 * (a + b) + (a === b ? 5 : 0) + (NOISE.on ? Math.random() * 0.3 : (a * 7 + b) * 1e-4);
    const myCnt = (num) => rest.filter((t) => has(t, num)).length;
    sc += 2.5 * nums.reduce((q, num) => q + Math.min(myCnt(num), 3), 0);

    // ¿Se cierra el juego con este tiro?
    const closes = nums.every((num) => unseen(num) === 0 && myCnt(num) === 0);
    if (closes) {
      const mine = sumHand(rest);
      if (c.teams) {
        const us = mine + expPts(partner), them = order.filter((s) => !friend(s)).reduce((q, s) => q + expPts(s), 0);
        sc += us < them ? 300 : -300;
      } else if (n === 2) sc += mine < expPts(order[0]) ? 300 : -300;
      else { const avg = order.reduce((q, s) => q + expPts(s), 0) / order.length; sc += (avg - mine) * 3; }
      if (sc > bs) { bs = sc; best = p; }
      continue;
    }

    if (level === 2) {
      const block = nums.reduce((q, num) => q + unseen(num), 0);
      sc -= (danger ? 2.4 : 1.2) * block;
      if (partner >= 0) sc += 1.5 * nums.filter((num) => partnerNums.has(num)).length;
    } else {
      const W = TUNE;
      const block = nums.reduce((q, num) => q + unseen(num), 0);
      sc -= W.blk * (danger ? 2 : 1) * block;
      // Anticipa: ¿cuántas fichas que peguen tendrá cada jugador que sigue?
      const wk = [1, W.w2, W.w3];
      order.forEach((s, k) => {
        const E = unknown.filter((t) => nums.some((num) => has(t, num))).reduce((q, t) => q + share(t, s), 0);
        const pPlay = E <= 0 ? 0 : 1 - Math.exp(-W.k * E);
        if (friend(s)) sc += W.fr * wk[k] * pPlay;
        else sc += W.riv * wk[k] * (1 - pPlay) * (h.hands[s].length <= 2 ? W.urg : 1);
      });
      if (partner >= 0) sc += W.pn * nums.filter((num) => partnerNums.has(num)).length;
    }
    if (sc > bs) { bs = sc; best = p; }
  }
  return pick(best);
}
