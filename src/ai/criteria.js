// Biblioteca de criterios de decisión (#27). Todos los bots usan los mismos criterios; cada perfil decide cuánto
// pesa cada uno. Un criterio califica UNA jugada posible con lo que el bot sabe (ver mind.js) y devuelve un número:
// positivo si la jugada le conviene según ese criterio, negativo si no. Los nombres siguen el documento
// "Tácticas del dominó por parejas" (A = mi mano, B = mi pareja, C = rivales, D = mesa, F = resultado).
import { T, P, sumHand } from "../engine/index.js";
import { newEnds, has } from "./heuristics.js";
import { openingPlan } from "./opening.js";
import { TUNE } from "./tune.js";

// Contexto del turno: se calcula una vez y lo comparten todos los criterios
export function turnContext(st, seat, know, mente = {}) {
  const h = st.hand, c = st.config, n = c.n, my = h.hands[seat];
  const friend = (s) => s === seat || (c.teams && s % 2 === seat % 2);
  const order = []; for (let k = 1; k < n; k++) order.push((seat + k) % n);
  const partner = c.teams ? (seat + 2) % 4 : -1;
  const partnerNums = new Set(partner >= 0 ? know.playedBy[partner].flatMap(P) : []);
  const rivals = order.filter((s) => !friend(s));
  const danger = rivals.some((s) => h.hands[s].length <= 2);
  const before = h.board.length ? [h.board[0][0], h.board[h.board.length - 1][1]] : null;
  // Números que ya se vieron en la mesa (según lo que recuerda) y en las puntas
  const seenNums = new Set([...know.gone].flatMap(P)); if (before) before.forEach((x) => seenNums.add(x));
  // Palo fuerte de cada rival: números que le recuerda haber jugado 2 o más veces
  const strong = {};
  for (const s of rivals) { const cnt = Array(7).fill(0); know.playedBy[s].forEach((t) => { const [a, b] = P(t); cnt[a]++; if (b !== a) cnt[b]++; }); strong[s] = cnt.map((k, x) => (k >= 2 ? x : -1)).filter((x) => x >= 0); }
  // Mulas que, por deducción exacta, solo puede tener un rival
  const rivalMulas = [];
  if (know.deduccion >= 3) for (let x = 0; x <= 6; x++) { const pos = know.possible[T(x, x)]; if (pos && pos.length && pos.every((id) => typeof id === "number" && !friend(id))) rivalMulas.push(x); }
  const expPts = (s) => (know.deduccion >= 3 ? know.unknown.reduce((q, t) => q + know.share(t, s) * (P(t)[0] + P(t)[1]), 0) : h.hands[s].length * know.avgPts);
  // Situación, para los modificadores
  const played = h.board.length, total = Math.min(28, n * c.per);
  const phase = total ? played / total : 0;
  const tm = c.teams ? seat % 2 : seat;
  const mineScore = st.scores[tm] ?? 0, theirs = Math.max(...st.scores.filter((_, i) => i !== tm), 0);
  const scoreDiff = (mineScore - theirs) / 100; // puntos en contra: positivo = va perdiendo
  const strength = openingPlan(my).rating / 10;
  return { st, h, c, n, seat, my, know, mente, friend, order, partner, partnerNums, rivals, danger, before, seenNums, strong, rivalMulas, expPts, phase, scoreDiff, strength };
}

// Datos de una jugada posible
export function optionFacts(ctx, p) {
  const { h, my, know } = ctx;
  const [a, b] = P(p.tile), rest = my.filter((t) => t !== p.tile), ne = newEnds(h, p);
  const nums = [...new Set(ne)];
  const myCnt = (num) => rest.filter((t) => has(t, num)).length;
  const closes = nums.every((num) => know.unseen(num) === 0 && myCnt(num) === 0);
  const removed = ctx.before ? ctx.before.filter((x) => !nums.includes(x)) : [];
  return { p, a, b, dbl: a === b, pts: a + b, rest, ne, nums, myCnt, closes, removed, cuadre: h.board.length > 0 && nums.length === 1, last: !rest.length };
}

// Los criterios posicionales no cuentan si la jugada cierra el juego o es la última ficha
const positional = (f) => !f.closes && !f.last;
const neg = (x) => (x ? -x : 0); // sin -0

export const CRITERIA = {
  // ---- Resultado ----
  dominar: { doc: "F2 · Quedarse sin fichas", fn: (f) => (f.last ? 1 : 0) },
  tranque: {
    doc: "F1/D3 · Cerrar el juego solo si conviene (según lo que calcula de puntos)",
    fn: (f, x) => {
      if (!f.closes || f.last) return 0;
      const mine = sumHand(f.rest), { c, n } = x;
      if (c.teams) { const us = mine + x.expPts(x.partner), them = x.order.filter((s) => !x.friend(s)).reduce((q, s) => q + x.expPts(s), 0); return us < them ? 1 : -1; }
      if (n === 2) return mine < x.expPts(x.order[0]) ? 1 : -1;
      const avg = x.order.reduce((q, s) => q + x.expPts(s), 0) / x.order.length; return (avg - mine) / 100;
    },
  },
  // ---- Mi mano ----
  puntos: { doc: "A1 · Soltar puntos (despintarse)", fn: (f) => f.pts },
  mula: { doc: "A4 · Soltar mulas", fn: (f) => (f.dbl ? 1 : 0) },
  mulaRiesgo: { doc: "A4 · Soltar la mula cuyo número se está acabando", fn: (f, x) => (f.dbl && positional(f) ? Math.max(0, 1 - x.know.unseen(f.a) / 6) : 0) },
  mayoria: { doc: "A2 · Dejar puntas de los números que más tengo", fn: (f) => f.nums.reduce((q, num) => q + Math.min(f.myCnt(num), 3), 0) },
  pegan: { doc: "A2 (simple) · Fichas que me quedan para las puntas nuevas", fn: (f) => f.rest.filter((t) => f.ne.some((num) => has(t, num))).length },
  variedad: {
    doc: "A3 · No quedarme sin fichas de un número que todavía puede salir",
    fn: (f, x) => {
      if (!positional(f)) return 0;
      let lost = 0;
      for (const num of [f.a, f.b].filter((v, i, arr) => arr.indexOf(v) === i)) if (f.myCnt(num) === 0 && x.know.unseen(num) > 0) lost++;
      return neg(lost);
    },
  },
  solitaria: {
    doc: "A5 · Guardar la ficha que es mi única defensa en sus dos números",
    fn: (f, x) => {
      if (!positional(f) || f.dbl || x.my.length <= 2) return 0;
      return f.rest.some((t) => has(t, f.a)) || f.rest.some((t) => has(t, f.b)) ? 0 : -1;
    },
  },
  asegurar: { doc: "A6 · Que me quede jugada para mi próximo turno", fn: (f) => (positional(f) && f.nums.some((num) => f.myCnt(num) > 0) ? 1 : 0) },
  // ---- Mi pareja ----
  pareja: { doc: "B1 · Dejar los números que ha jugado mi pareja", fn: (f, x) => (positional(f) ? f.nums.filter((num) => x.partnerNums.has(num)).length : 0) },
  noFalloPareja: { doc: "B3 · No dejarle a mi pareja números a los que ya pasó", fn: (f, x) => (positional(f) && x.partner >= 0 ? neg(f.nums.filter((num) => x.know.lacks[x.partner].includes(num)).length) : 0) },
  // ---- Rivales ----
  bloqueo: { doc: "C1 (por cuenta) · Dejar puntas de las que quedan pocas fichas fuera de mi mano", fn: (f, x) => (positional(f) ? neg(f.nums.reduce((q, num) => q + x.know.unseen(num), 0)) : 0) },
  hacerPasar: {
    doc: "C1 · Que el siguiente rival no pueda jugar (seguro, si recuerdo que pasó; si no, probable)",
    fn: (f, x) => { const nx = x.order[0]; return positional(f) && nx !== undefined && !x.friend(nx) ? x.know.pNone(nx, f.nums) : 0; },
  },
  taparPalo: {
    doc: "C3 · Taparle al rival el número que ha repetido",
    fn: (f, x) => { if (!positional(f)) return 0; let v = 0; for (const s of x.rivals) for (const num of x.strong[s]) { if (f.removed.includes(num)) v++; if (f.nums.includes(num)) v--; } return v; },
  },
  ahorcarMula: {
    doc: "C4 · Quitar de la mesa el número de una mula que solo puede tener un rival",
    fn: (f, x) => { if (!positional(f)) return 0; let v = 0; for (const num of x.rivalMulas) { if (x.know.unseen(num) > 3) continue; if (f.nums.includes(num)) v--; else if (f.removed.includes(num)) v++; } return v; },
  },
  frenar: {
    doc: "C6 · Frenar al rival que está por dominar",
    fn: (f, x) => { if (!positional(f)) return 0; let v = 0; for (const s of x.rivals) { const k = x.h.hands[s].length; if (k <= 2) v += x.know.pNone(s, f.nums) * (k === 1 ? 2 : 1); } return v; },
  },
  // ---- Mesa ----
  cuadre: {
    doc: "D1 · Cuadrar a un número que me conviene (no a uno del rival)",
    fn: (f, x) => {
      if (!positional(f) || !f.cuadre) return 0;
      const num = f.nums[0], nx = x.order[0];
      let v = f.myCnt(num) > 0 ? 1 : -1;
      if (x.partnerNums.has(num)) v += 0.5;
      if (nx !== undefined && !x.friend(nx) && x.know.lacks[nx].includes(num)) v += 1;
      if (x.rivals.some((s) => x.strong[s].includes(num))) v -= 1;
      return v;
    },
  },
  noAbrirNuevo: { doc: "D2 · No abrir números que nadie ha jugado", fn: (f, x) => (positional(f) && x.before ? neg(f.nums.filter((num) => !x.seenNums.has(num) && f.myCnt(num) < 2).length) : 0) },
  // ---- Anticipación (B2 + C1 mirando a varios jugadores) ----
  anticipacion: {
    doc: "B2/C1 · Anticipar si cada uno de los que siguen podrá jugar",
    fn: (f, x) => {
      const A = x.mente.anticipacion || 0; if (!A || !positional(f)) return 0;
      const W = TUNE, wk = [1, W.w2, W.w3]; let v = 0;
      x.order.slice(0, A).forEach((s, k) => {
        const E = x.know.unknown.filter((t) => f.nums.some((num) => has(t, num))).reduce((q, t) => q + x.know.share(t, s), 0);
        const pPlay = E <= 0 ? 0 : 1 - Math.exp(-W.k * E);
        if (x.friend(s)) v += W.fr * wk[k] * pPlay;
        else v += W.riv * wk[k] * (1 - pPlay) * (x.h.hands[s].length <= 2 ? W.urg : 1);
      });
      return v;
    },
  },
  // Desempate fijo (casi nada): entre dos jugadas iguales, la misma siempre
  desempate: { doc: "Desempate", fn: (f) => (f.a * 7 + f.b) * 1e-4 },
};

// Modificadores de situación: cuánto se multiplica el peso de cada criterio en esta situación.
// Cada perfil tiene una sensibilidad por modificador: peso × (1 + sensibilidad × (factor − 1)).
export function situationFactors(ctx) {
  const out = { peligro: {}, fase: {}, marcador: {}, fuerza: {} };
  if (ctx.danger) Object.assign(out.peligro, { bloqueo: 2, hacerPasar: 2, frenar: 1.5 });
  if (ctx.phase < 0.3) Object.assign(out.fase, { variedad: 1.5, mulaRiesgo: 1.3, pareja: 1.3, solitaria: 1.3, mula: 1.2 });
  else if (ctx.phase > 0.6) Object.assign(out.fase, { frenar: 1.5, tranque: 1.2, ahorcarMula: 1.3, variedad: 0.7 });
  if (ctx.scoreDiff > 0.25) Object.assign(out.marcador, { tranque: 1.5, hacerPasar: 1.3, cuadre: 1.2, puntos: 0.8 });
  else if (ctx.scoreDiff < -0.25) Object.assign(out.marcador, { puntos: 1.5, mula: 1.2, cuadre: 0.8 });
  if (ctx.strength < 0.3) Object.assign(out.fuerza, { pareja: 1.5, noFalloPareja: 1.3, mayoria: 0.8, puntos: 1.2 });
  else if (ctx.strength > 0.6) Object.assign(out.fuerza, { mayoria: 1.3, asegurar: 1.3, pareja: 0.8 });
  return out;
}

export function effectiveWeights(profile, ctx) {
  const f = situationFactors(ctx), sens = profile.sensibilidad || {}, w = {};
  for (const [k, base] of Object.entries(profile.pesos)) {
    let m = 1;
    for (const mod of Object.keys(f)) { const fac = f[mod][k]; if (fac !== undefined) m *= 1 + (sens[mod] || 0) * (fac - 1); }
    w[k] = base * m;
  }
  return w;
}

// Puntaje de cada jugada posible
export function scoreOptions(ctx, profile, lp) {
  const w = effectiveWeights(profile, ctx);
  return lp.map((p) => {
    const f = optionFacts(ctx, p);
    let sc = 0;
    for (const [k, wk] of Object.entries(w)) if (wk) sc += wk * CRITERIA[k].fn(f, ctx);
    return sc;
  });
}
