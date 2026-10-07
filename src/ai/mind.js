// Capacidad mental de un bot (#27): qué recuerda de la mano, qué deduce con eso y qué tan fino lo analiza.
// Todo sale solo de lo que el jugador "seat" puede saber: su mano, la mesa, cuántas fichas tiene cada quien y el
// historial público. Un bot con memoria imperfecta trabaja con MENOS datos, nunca con datos falsos.
import { T, P, pts, fullSet } from "../engine/index.js";
import { possibleHolders } from "./deduce.js";
import { speculate } from "./speculate.js";
import { unitFor } from "./rng.js";

const TYPES = ["pase", "mula", "alta", "pareja", "salida", "otra"];
export const PERFECT_MEMORY = { capacidad: 1, olvido: 0, prioridad: Object.fromEntries(TYPES.map((k) => [k, 1])), cuenta: "exacta", atribucion: 1 };

export function isPerfect(mem) {
  return !mem || (mem.capacidad >= 1 && !mem.olvido && mem.cuenta === "exacta" && (mem.atribucion ?? 1) >= 1 && TYPES.every((k) => (mem.prioridad?.[k] ?? 1) >= 1));
}

// Probabilidad de que el bot todavía recuerde un evento: baja con la antigüedad (eventos después de él) y es mayor
// para los tipos de evento que más le importan
export function recallChance(mem, type, age) {
  const prio = mem.prioridad?.[type] ?? 1;
  return Math.min(1, mem.capacidad * prio) * Math.exp(-(mem.olvido || 0) * age);
}

// Tipo de un evento para la memoria (el de más prioridad si cabe en varios)
function eventTypes(e, i, firstPlay, partner) {
  const out = [];
  if (e.a === "pass" || e.a === "draw") out.push("pase");
  if (e.a === "play") {
    const [a, b] = P(e.tile);
    if (a === b) out.push("mula");
    if (a + b >= 9) out.push("alta");
    if (i === firstPlay) out.push("salida");
  }
  if (e.s === partner) out.push("pareja");
  if (!out.length) out.push("otra");
  return out;
}

// Lo que el bot recuerda de la mano. Con memoria perfecta es exactamente la información pública completa.
//   gone: fichas que tiene contadas como fuera de juego (mesa y muestra que recuerda, más las de las puntas, que se ven)
//   playedBy[s]: fichas que recuerda que tiró cada jugador
//   lacks[s]: números que recuerda que no tiene cada jugador (por sus pases)
//   forgotten: cuántas fichas de la mesa ya no tiene contadas
export function recall(st, seat, mem = PERFECT_MEMORY) {
  const h = st.hand, n = st.config.n, board = h.board.map(([a, b]) => T(a, b));
  const partner = st.config.teams && n === 4 ? (seat + 2) % 4 : -1;
  const hist = h.history || [];
  if (isPerfect(mem)) {
    const gone = new Set(board); if (h.muestra) gone.add(h.muestra);
    return {
      gone, forgotten: 0, perfect: true,
      playedBy: h.hands.map((_, s) => (h.played && h.played[s] ? h.played[s].slice() : [])),
      lacks: h.hands.map((_, s) => ((h.lacks && h.lacks[s]) || []).slice()),
    };
  }
  const key = `${st.gameId || st.code || ""}|${st.handNo}|${seat}`;
  const firstPlay = hist.findIndex((e) => e.a === "play");
  const lastDraw = {}; hist.forEach((e, i) => { if (e.a === "draw") lastDraw[e.s] = i; });
  const remembered = hist.map((e, i) => {
    if (e.s === seat) return { yes: true, who: true }; // lo propio siempre se recuerda
    const age = hist.length - 1 - i;
    const p = Math.max(...eventTypes(e, i, firstPlay, partner).map((t) => recallChance(mem, t, age)));
    return { yes: unitFor(key + "|" + i) < p, who: unitFor(key + "|" + i + "|quien") < (mem.atribucion ?? 1) };
  });
  // Fichas contadas como fuera de juego
  const gone = new Set();
  if (mem.cuenta === "exacta") board.forEach((t) => gone.add(t));
  else if (mem.cuenta === "memoria") hist.forEach((e, i) => { if (e.a === "play" && remembered[i].yes) gone.add(e.tile); });
  hist.forEach((e) => { if (e.a === "play" && e.s === seat) gone.add(e.tile); });
  if (board.length) { gone.add(board[0]); gone.add(board[board.length - 1]); } // las puntas se ven
  if (h.muestra) gone.add(h.muestra);
  const playedBy = h.hands.map(() => []);
  hist.forEach((e, i) => { if (e.a === "play" && remembered[i].yes && remembered[i].who) playedBy[e.s].push(e.tile); });
  // Faltas: solo de pases que recuerda, posteriores a la última vez que ese jugador comió, y que también sabe el motor
  const lacks = h.hands.map((_, s) => {
    const truth = (h.lacks && h.lacks[s]) || [];
    const got = new Set();
    hist.forEach((e, i) => { if (e.a === "pass" && e.s === s && remembered[i].yes && !(lastDraw[s] > i)) (e.ends || []).forEach((x) => got.add(x)); });
    return truth.filter((x) => got.has(x));
  });
  return { gone, forgotten: board.filter((t) => !gone.has(t)).length, perfect: false, playedBy, lacks };
}

// Conocimiento del bot sobre las fichas que no ve, según su memoria y su nivel de deducción:
//   0: solo su mano y las puntas · 1: + cuenta de lo jugado · 2: + pases · 3: + eliminación cruzada exacta (y
//   sospechas, si las tiene y su memoria es perfecta).
// share(t, s): probabilidad (para el bot) de que la ficha t la tenga s. pNone(s, nums): de que s no tenga ninguna
// ficha con esos números.
export function knowledge(st, seat, mente = {}) {
  const h = st.hand, ded = mente.deduccion ?? 3;
  const mem = recall(st, seat, mente.memoria || PERFECT_MEMORY);
  const my = h.hands[seat];
  let gone = mem.gone;
  if (ded <= 0) { // ni cuenta: solo ve las puntas
    gone = new Set(); const b = h.board;
    if (b.length) { gone.add(T(...b[0])); gone.add(T(...b[b.length - 1])); }
    if (h.muestra) gone.add(h.muestra);
  }
  const mine = new Set(my);
  const unknown = fullSet().filter((t) => !mine.has(t) && !gone.has(t));
  const forgotten = unknown.length - h.hands.reduce((q, hh, s) => q + (s === seat ? 0 : hh.length), 0) - h.pozo.length;
  const holders = [];
  h.hands.forEach((hh, s) => { if (s !== seat) holders.push({ id: s, cap: hh.length, lacks: ded >= 2 ? mem.lacks[s] : [] }); });
  if (h.pozo.length) holders.push({ id: "pozo", cap: h.pozo.length, lacks: [] });
  if (forgotten > 0) holders.push({ id: "mesa", cap: forgotten, lacks: [] }); // fichas que ya salieron pero no tiene contadas
  const capOf = Object.fromEntries(holders.map((H) => [H.id, H.cap]));
  let possible = null;
  if (ded >= 3) possible = possibleHolders(unknown, holders);
  else possible = Object.fromEntries(unknown.map((t) => { const [x, y] = P(t); return [t, holders.filter((H) => H.cap > 0 && !H.lacks.includes(x) && !H.lacks.includes(y)).map((H) => H.id)]; }));
  let spec = null;
  const useSpec = mente.sospechas && ded >= 3 && mem.perfect;
  const share = (t, s) => {
    if (useSpec) {
      if (!spec) spec = speculate(st, seat, mente.sospechas.n || 200, mente.sospechas.beta);
      const row = spec.prob[t]; if (row) return row[s] || 0;
    }
    const pos = possible[t] || []; if (!pos.includes(s)) return 0;
    const tot = pos.reduce((q, id) => q + (capOf[id] || 0), 0); return tot ? capOf[s] / tot : 0;
  };
  const has = (t, num) => { const [x, y] = P(t); return x === num || y === num; };
  const unseenMemo = {};
  const unseen = (num) => (unseenMemo[num] ??= unknown.filter((t) => has(t, num)).length);
  const pNone = (s, nums) => {
    if (ded >= 2 && nums.every((x) => mem.lacks[s].includes(x))) return 1;
    return unknown.filter((t) => nums.some((x) => has(t, x))).reduce((q, t) => q * (1 - share(t, s)), 1);
  };
  const avgPts = unknown.length ? unknown.reduce((q, t) => q + pts(t), 0) / unknown.length : 0;
  return { unknown, possible, share, pNone, unseen, avgPts, lacks: ded >= 2 ? mem.lacks : h.hands.map(() => []), playedBy: mem.playedBy, gone, perfect: mem.perfect, deduccion: ded, forgotten };
}
