// Jugadores de la compu, deducción y consejo. Solo usan lo que el jugador puede saber.
// Código movido sin cambios desde index.html (fase 3 de #3).

import { P, nameOf } from "../engine/index.js";
import { deduce, sampleAssign } from "./deduce.js";
import { heurScore, optionsAt } from "./heuristics.js";
import { TUNE } from "./tune.js";

// ===== Especulación: leer los tiros de los demás como decisiones =====
// Para un reparto imaginado, ¿qué tan probable es que cada jugador, con esa mano, hubiera tirado lo que tiró?
// Se usa un modelo de jugador razonable (el criterio del intermedio): tiros que él habría preferido son más
// probables. Los repartos que explican bien lo jugado pesan más. Solo usa lo que "viewer" puede saber.
export function inferenceEvents(st, viewer) {
  const h = st.hand, hist = h.history || [];
  const lastDraw = {}; hist.forEach((e, i) => { if (e.a === "draw") lastDraw[e.s] = i; });
  const evs = []; let cur = null; const boardSoFar = []; const playedBy = h.hands.map(() => []);
  hist.forEach((e, i) => {
    if (e.a === "play") {
      const usable = e.s !== viewer && !e.forced && !e.auto && !(lastDraw[e.s] >= i);
      if (usable) {
        const partner = st.config.teams ? (e.s + 2) % 4 : -1;
        evs.push({ i, s: e.s, tile: e.tile, side: e.side, before: cur, board: boardSoFar.slice(), partnerTiles: partner >= 0 ? playedBy[partner].slice() : [] });
      }
      boardSoFar.push(e.tile); playedBy[e.s].push(e.tile); cur = e.ends;
    }
  });
  // fichas que cada jugador tiró después de cada evento (para reconstruir su mano en ese momento)
  for (const ev of evs) ev.later = hist.filter((e, j) => j >= ev.i && e.a === "play" && e.s === ev.s).map((e) => e.tile);
  return evs;
}
export function logLikelihood(evs, handOf, parts, beta = TUNE.beta) {
  let ll = 0;
  for (const ev of evs) {
    if (parts) parts.push(0);
    const hand = [...handOf(ev.s), ...ev.later];
    const opts = optionsAt(hand, ev.before);
    if (opts.length <= 1) continue;
    const sc = opts.map((o) => beta * heurScore(hand, o.tile, o.side, ev.before, ev.board, ev.partnerTiles));
    const mx = Math.max(...sc), z = sc.reduce((q, v) => q + Math.exp(v - mx), 0);
    const k = opts.findIndex((o) => o.tile === ev.tile && (o.side === ev.side || o.side === "X"));
    if (k < 0) continue;
    const term = sc[k] - mx - Math.log(z);
    ll += term; if (parts) parts[parts.length - 1] = term;
  }
  return ll;
}
// Repartos imaginados con su peso (normalizados). n = cuántos se generan.
export function weightedAssigns(st, viewer, n, ded, rnd = Math.random, beta = TUNE.beta) {
  ded = ded || deduce(st, viewer);
  const evs = inferenceEvents(st, viewer), out = [];
  for (let k = 0; k < n; k++) {
    const asg = sampleAssign(st, viewer, ded, rnd); if (!asg) continue;
    const parts = [];
    const ll = evs.length ? logLikelihood(evs, (s) => asg[s] || [], parts, beta) : 0;
    out.push({ asg, ll, parts });
  }
  if (!out.length) return { list: [], ess: 0, events: evs.length, evs };
  const mx = Math.max(...out.map((x) => x.ll));
  let tot = 0; out.forEach((x) => { x.w = Math.exp(x.ll - mx); tot += x.w; });
  out.forEach((x) => (x.w /= tot));
  const ess = 1 / out.reduce((q, x) => q + x.w * x.w, 0);
  return { list: out, ess, events: evs.length, evs };
}
// Probabilidad especulativa de que cada ficha no vista esté con cada jugador (o en el pozo)
export function speculate(st, viewer, n = TUNE.specN, beta = TUNE.beta) {
  const ded = deduce(st, viewer), { list, ess, events, evs } = weightedAssigns(st, viewer, n, ded, Math.random, beta);
  const prob = {};
  for (const t of Object.keys(ded.possible)) prob[t] = {};
  for (const { asg, w } of list) for (const id of Object.keys(asg)) for (const t of asg[id]) prob[t][id] = (prob[t][id] || 0) + w;
  return { prob, ess, events, n: list.length, _list: list, _evs: evs, _ded: ded };
}

// ¿Por qué esta ficha tiene ese porcentaje? Compara con solo lo seguro y mide cuánto movió cada tiro
// (quitando ese tiro del cálculo y viendo cuánto cambia). Todo desde lo que "viewer" puede saber.
export function explainTile(st, viewer, spec, tile, target) {
  const h = st.hand, list = spec._list || [], evs = spec._evs || [], ded = spec._ded;
  const nm = (s) => nameOf(st, s);
  const hasT = (x) => (x.asg[target] || []).includes(tile);
  const pFull = list.reduce((q, x) => q + (hasT(x) ? x.w : 0), 0);
  const pBase = list.length ? list.filter(hasT).length / list.length : 0;
  // Hechos seguros: quién no puede tenerla
  const [a, b] = P(tile), facts = [];
  const pos = (ded && ded.possible[tile]) || [];
  h.hands.forEach((_, s) => {
    if (s === viewer || s === target) return;
    const lk = (h.lacks && h.lacks[s]) || [], miss = [a, b].filter((x, i, arr) => lk.includes(x) && arr.indexOf(x) === i);
    if (miss.length) facts.push(`${nm(s)} no la tiene: pasó o comió cuando había ${miss.join(" y ")} en la punta.`);
    else if (!pos.includes(s)) facts.push(`${nm(s)} no puede tenerla: contando las fichas que le quedan y lo que le falta, no le cabe.`);
  });
  const holders = pos.filter((id) => id !== target).map((id) => (id === "pozo" ? "el pozo" : nm(id)));
  // Tiros que movieron el porcentaje
  const events = [];
  evs.forEach((ev, k) => {
    let num = 0, den = 0;
    for (const x of list) { const w = x.w * Math.exp(-(x.parts[k] || 0)); den += w; if (hasT(x)) num += w; }
    if (!den) return;
    const delta = pFull - num / den;
    if (Math.abs(delta) < 0.03) return;
    const opening = !ev.before;
    const covered = opening ? null : ev.before[ev.side === "L" ? 0 : 1], other = opening ? null : ev.before[ev.side === "L" ? 1 : 0];
    const [ea, eb] = P(ev.tile), left = opening ? null : (ea === covered ? eb : ea);
    const what = opening ? `${nm(ev.s)} salió con ${ev.tile}` : `${nm(ev.s)} tiró ${ev.tile} en el ${covered} (la otra punta era ${other})`;
    let why;
    if (ev.s === target) {
      const playable = tile !== ev.tile && optionsAt([tile], ev.before).length > 0;
      if (delta < 0 && playable) why = `Pudo tirar la ${tile} ahí y escogió otra: si la tuviera, lo más probable es que la hubiera preferido.`;
      else if (delta < 0 && covered !== null && (a === covered || b === covered)) why = `Tapó el ${covered}: si tuviera la ${tile}, le convenía cuidar ese número en vez de taparlo.`;
      else if (delta < 0) why = `Su tiro tiene menos sentido si tuviera esta ficha.`;
      else if (opening && (a === ea || a === eb || b === ea || b === eb)) why = `Quien sale con un número suele estar cargado de él, y esta ficha lleva ese número.`;
      else if (left !== null && (a === left || b === left)) why = `Dejó el ${left} en la punta: eso se hace cuando uno guarda más fichas de ese número, como esta.`;
      else why = `Su tiro tiene más sentido si guarda esta ficha.`;
    } else {
      why = delta > 0 ? `Si ${nm(ev.s)} la tuviera, su tiro tendría menos sentido; eso la hace más probable para ${nm(target)}.`
        : `El tiro de ${nm(ev.s)} tiene más sentido si la tiene él (u otro), y eso le baja probabilidad a ${nm(target)}.`;
    }
    events.push({ what, why, delta, s: ev.s });
  });
  events.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return { pFull, pBase, facts, holders, events: events.slice(0, 5), analyzed: evs.length, samples: list.length };
}
