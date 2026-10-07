// Pruebas de los perfiles de la compu (#27): compatibilidad con los niveles de antes, memoria, deducción, criterios,
// modificadores, factor aleatorio, que nadie vea fichas ajenas y el torneo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newTable, deal, autoMove, legalPlays, canDraw, canPass, T } from "../src/engine/index.js";
import { botMove, NOISE, PROFILES, PROFILE_IDS, getProfile, profileLabel, CRITERIA } from "../src/ai/index.js";
import { recall, knowledge, PERFECT_MEMORY, recallChance } from "../src/ai/mind.js";
import { turnContext, optionFacts, effectiveWeights } from "../src/ai/criteria.js";
import { choiceProbs, chooseIndex } from "../src/ai/decide.js";
import { CAPACITIES } from "../src/ai/profiles.js";
import { playGame, fingerprint, withSeed } from "../src/ai/tournament.js";
import { seededRandom } from "../src/ai/rng.js";
import { legacyBotMove } from "./fixtures/legacy-bots.js";
import { botProfileOf } from "../src/app/bots.js";

const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
function withRandom(rnd, fn) { const real = Math.random; Math.random = rnd; try { return fn(); } finally { Math.random = real; } }

const CONFIGS = [
  { n: 4, teams: true, per: 7 }, { n: 4, teams: false, per: 7 }, { n: 3, teams: false, per: 7 },
  { n: 3, teams: false, per: 9 }, { n: 2, teams: false, per: 7 }, { n: 2, teams: false, per: 14 },
];
function table(config) {
  const st = newTable("TEST", config, "host");
  st.seats = st.seats.map((_, i) => ({ id: "p" + i, name: "J" + (i + 1) }));
  return st;
}
function states(config, n, maxSteps = 14, seed0 = 1) {
  const out = [];
  for (let seed = seed0; out.length < n && seed < seed0 + 300; seed++) {
    const rnd = seeded(seed);
    let st = withRandom(seeded(seed + 99), () => deal(table(config), rnd));
    for (let i = 0; i < 1 + (seed % maxSteps) && st.status === "playing"; i++) st = autoMove(st, rnd);
    if (st.status === "playing" && st.hand.turn !== null && legalPlays(st, st.hand.turn).length > 1) out.push(st);
  }
  return out;
}
const isLegal = (st, seat, m) => {
  if (m.type === "play") return legalPlays(st, seat).some((p) => p.tile === m.tile && p.side === m.side);
  if (m.type === "draw") return canDraw(st, seat);
  if (m.type === "pass") return canPass(st, seat);
  return false;
};
function shuffleHidden(st, viewer, seed) {
  const s2 = structuredClone(st), h = s2.hand;
  const others = h.hands.map((_, i) => i).filter((i) => i !== viewer);
  const pool = [...others.flatMap((i) => h.hands[i]), ...h.pozo];
  const rnd = seeded(seed);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let k = 0;
  for (const i of others) h.hands[i] = pool.slice(k, (k += h.hands[i].length));
  h.pozo = pool.slice(k, k + h.pozo.length);
  return s2;
}
const FAST = PROFILE_IDS.filter((id) => !PROFILES[id].mente.calculo && !PROFILES[id].mente.sospechas);
const SLOW = PROFILE_IDS.filter((id) => !FAST.includes(id));

// ---------- Catálogo ----------

test("hay 20 perfiles, cada uno con código, descripción, estilo y capacidad; los niveles 1-3 son Bot 01-03", () => {
  assert.equal(PROFILE_IDS.length, 20);
  for (const id of PROFILE_IDS) {
    const p = PROFILES[id];
    assert.match(p.nombre, /^Bot \d\d$/);
    assert.ok(p.desc && p.detalle && p.estilo && p.capacidad, id);
    for (const k of Object.keys(p.pesos)) assert.ok(CRITERIA[k], `${id}: criterio desconocido ${k}`);
  }
  assert.equal(getProfile(1).id, "b01"); assert.equal(getProfile(2).id, "b02"); assert.equal(getProfile(3).id, "b03");
  assert.equal(getProfile("b07").id, "b07");
  assert.equal(getProfile(PROFILES.b12), PROFILES.b12);
  assert.equal(profileLabel("b07"), "Bot 07 · controlador · experto");
  assert.equal(profileLabel(2), "Bot 02 · Intermedio");
  // El asiento de la compu juega con su perfil, o con el de su nivel
  assert.equal(botProfileOf({ bot: true, level: 3 }), 3);
  assert.equal(botProfileOf({ bot: true, level: 2, perfil: "b14" }), "b14");
  assert.equal(botProfileOf(null), 1);
});

test("ningún perfil es determinista: todos tienen ventana de duda y temperatura", () => {
  for (const id of PROFILE_IDS) {
    const a = PROFILES[id].azar;
    assert.ok(a.ventana > 0 && a.temperatura > 0 && a.escala > 0, id);
  }
});

// ---------- Compatibilidad ----------

test("Bot 01 y Bot 02, con el azar apagado, deciden igual que los niveles Básico e Intermedio de antes", () => {
  const prev = NOISE.on; NOISE.on = false;
  try {
    let n = 0;
    for (const c of CONFIGS) for (const st of states(c, 25)) {
      const seat = st.hand.turn;
      const a1 = withRandom(() => 0, () => legacyBotMove(st, seat, 1)), b1 = botMove(st, seat, 1, { azar: false });
      assert.deepEqual(b1, a1, `nivel 1, ${JSON.stringify(c)}`);
      const a2 = legacyBotMove(st, seat, 2), b2 = botMove(st, seat, 2, { azar: false });
      assert.deepEqual(b2, a2, `nivel 2, ${JSON.stringify(c)}`);
      n++;
    }
    assert.ok(n > 100);
  } finally { NOISE.on = prev; }
});

test("Bot 03, con el azar apagado, decide igual que el Avanzado de antes", () => {
  const prev = NOISE.on; NOISE.on = false;
  try {
    for (const c of [CONFIGS[0], CONFIGS[2], CONFIGS[4]]) for (const [i, st] of states(c, 3, 10).entries()) {
      const seat = st.hand.turn;
      const a = withRandom(seeded(i + 5), () => legacyBotMove(st, seat, 3));
      const b = withRandom(seeded(i + 5), () => botMove(st, seat, 3, { azar: false }));
      assert.deepEqual(b, a);
    }
  } finally { NOISE.on = prev; }
});

// ---------- Jugadas válidas y sin ver fichas ajenas ----------

for (const c of CONFIGS) {
  test(`todos los perfiles rápidos solo hacen jugadas válidas: ${c.n} jugadores, ${c.per} fichas${c.teams ? ", parejas" : ""}`, () => {
    for (const [i, st] of states(c, 6).entries()) for (const id of FAST) {
      const m = botMove(st, st.hand.turn, id, { rnd: seeded(i) });
      assert.ok(isLegal(st, st.hand.turn, m), `${id}: ${JSON.stringify(m)}`);
    }
  });
}

test("los perfiles que leen intenciones o simulan también solo hacen jugadas válidas", () => {
  for (const c of [CONFIGS[0], CONFIGS[4]]) for (const [i, st] of states(c, 1, 8, 40).entries()) for (const id of SLOW) {
    const m = withRandom(seeded(i + 1), () => botMove(st, st.hand.turn, id));
    assert.ok(isLegal(st, st.hand.turn, m), `${id}: ${JSON.stringify(m)}`);
  }
});

test("ningún perfil ve fichas ajenas: si se reacomodan las que no ve, decide lo mismo", () => {
  for (const c of [CONFIGS[0], CONFIGS[2], CONFIGS[5]]) for (const [i, st] of states(c, 3).entries()) {
    const seat = st.hand.turn, alt = shuffleHidden(st, seat, i + 1);
    for (const id of FAST) {
      const a = botMove(st, seat, id, { rnd: seeded(i) }), b = botMove(alt, seat, id, { rnd: seeded(i) });
      assert.deepEqual(a, b, id);
    }
  }
  // Uno que lee intenciones (más lento)
  const st = states(CONFIGS[0], 1, 10, 7)[0], seat = st.hand.turn, alt = shuffleHidden(st, seat, 3);
  const a = withRandom(seeded(1), () => botMove(st, seat, "b13")), b = withRandom(seeded(1), () => botMove(alt, seat, "b13"));
  assert.deepEqual(a, b);
});

// ---------- Memoria ----------

// Una mano en parejas jugada hasta el final, guardando el estado antes de cada jugada
function handStates(seed) {
  const out = []; let st = withRandom(seeded(seed + 5), () => deal(table(CONFIGS[0]), seeded(seed)));
  for (let g = 0; g < 80 && st.status === "playing"; g++) { out.push(st); st = autoMove(st, seeded(seed * 31 + g)); }
  return out;
}

test("con memoria perfecta, el bot sabe exactamente lo público: mesa, quién tiró qué y quién pasó a qué", () => {
  for (const st of handStates(3)) {
    const m = recall(st, 0, PERFECT_MEMORY);
    assert.deepEqual([...m.gone].sort(), st.hand.board.map(([a, b]) => T(a, b)).sort());
    assert.deepEqual(m.playedBy, st.hand.played);
    assert.deepEqual(m.lacks, st.hand.lacks);
    assert.equal(m.forgotten, 0);
  }
});

test("con memoria imperfecta, el bot recuerda menos pero nunca algo falso", () => {
  for (const cap of ["distraido", "casual", "atento"]) {
    const mem = CAPACITIES[cap].mente.memoria;
    for (const seed of [1, 2, 3]) for (const st of handStates(seed)) for (let seat = 0; seat < 4; seat++) {
      const m = recall(st, seat, mem), board = new Set(st.hand.board.map(([a, b]) => T(a, b)));
      for (const t of m.gone) assert.ok(board.has(t), `${cap}: ${t} no está en la mesa`);
      m.playedBy.forEach((tiles, s) => tiles.forEach((t) => assert.ok(st.hand.played[s].includes(t), `${cap}: ${s} no tiró ${t}`)));
      m.lacks.forEach((nums, s) => nums.forEach((x) => assert.ok(st.hand.lacks[s].includes(x), `${cap}: ${s} sí puede tener ${x}`)));
      // Lo propio siempre se recuerda
      st.hand.played[seat].forEach((t) => assert.ok(m.gone.has(t)));
    }
  }
});

test("lo que el bot olvida no le regresa en los turnos siguientes, y con la misma partida olvida lo mismo", () => {
  const mem = CAPACITIES.distraido.mente.memoria;
  const sts = handStates(4), seat = 1;
  let prev = null, forgotSome = false;
  for (const st of sts) {
    const m = recall(st, seat, mem);
    const lacksNow = m.lacks.map((x) => x.slice());
    if (prev) {
      // Un dato de faltas que ya no recordaba no vuelve a aparecer (salvo que haya un pase nuevo)
      prev.lacks.forEach((nums, s) => {
        const passedAgain = (st.hand.history || []).slice(prev.n).some((e) => e.s === s && e.a === "pass");
        if (!passedAgain) for (const x of lacksNow[s]) assert.ok(nums.includes(x) || !prev.truth[s].includes(x), `faltas de ${s}`);
      });
      // Fichas atribuidas: lo olvidado no regresa
      prev.playedBy.forEach((tiles, s) => { const was = new Set(tiles); for (const t of st.hand.played[s]) if (prev.truthPlayed[s].includes(t) && !was.has(t)) assert.ok(!m.playedBy[s].includes(t), `regresó ${t}`); });
    }
    if (m.playedBy.some((tiles, s) => tiles.length < st.hand.played[s].length)) forgotSome = true;
    prev = { lacks: lacksNow, truth: st.hand.lacks.map((x) => x.slice()), playedBy: m.playedBy, truthPlayed: st.hand.played.map((x) => x.slice()), n: (st.hand.history || []).length };
    assert.deepEqual(recall(structuredClone(st), seat, mem), m, "misma partida, mismo recuerdo");
  }
  assert.ok(forgotSome, "un bot distraído debería olvidar algo en una mano completa");
  assert.ok(recallChance(mem, "pase", 0) > recallChance(mem, "otra", 0), "recuerda mejor los pases");
  assert.ok(recallChance(mem, "pase", 0) > recallChance(mem, "pase", 10), "olvida con el tiempo");
});

test("la deducción de cualquier capacidad nunca descarta al verdadero dueño de una ficha", () => {
  for (const cap of Object.keys(CAPACITIES)) {
    const mente = { ...CAPACITIES[cap].mente, sospechas: null };
    for (const seed of [5, 6]) for (const st of handStates(seed).filter((_, i) => i % 3 === 0)) {
      const seat = 2, k = knowledge(st, seat, mente), h = st.hand;
      const board = new Set(h.board.map(([a, b]) => T(a, b)));
      for (const t of k.unknown) {
        const owner = h.hands.findIndex((hh) => hh.includes(t));
        const truth = owner >= 0 ? owner : board.has(t) ? "mesa" : "pozo";
        assert.ok(k.possible[t].includes(truth), `${cap}: ${t} es de ${truth}, posibles ${k.possible[t]}`);
      }
    }
  }
});

// ---------- Criterios ----------

// Mesa a mitad de mano, armada a mano (4 en parejas). Por omisión le toca al asiento 0.
function mid({ hands, board, lacks = [[], [], [], []], played = [[], [], [], []], turn = 0, scores = [0, 0], history = [] }) {
  const st = table(CONFIGS[0]);
  return { ...st, gameId: "G", status: "playing", handNo: 1, scores, hand: { hands, pozo: [], muestra: null, board, turn, mano: 0, passes: 0, openers: [0], firstReq: null, drew: 0, lacks, played, history, since: 0 } };
}
const crit = (st, k, tile, side, mente = { deduccion: 3, anticipacion: 0 }) => {
  const know = knowledge(st, st.hand.turn, mente), ctx = turnContext(st, st.hand.turn, know, mente);
  const p = legalPlays(st, st.hand.turn).find((q) => q.tile === tile && q.side === side);
  assert.ok(p, `${tile} ${side} no es jugada válida`);
  return CRITERIA[k].fn(optionFacts(ctx, p), ctx);
};
// Manos ajenas de relleno (fichas reales que no estorban)
const BASE = { hands: [["5-3", "5-1", "6-0", "3-2"], ["4-4", "4-0", "2-2", "1-1"], ["0-0", "4-1", "2-1", "4-2"], ["6-6", "6-1", "3-0", "2-0"]], board: [[5, 6], [6, 3]] };

test("B3: castiga dejarle a la pareja un número al que ya pasó", () => {
  const lacks = [[], [], [5], []]; // la pareja (asiento 2) pasó al 5
  const st = mid({ ...BASE, lacks });
  // Mesa 5 … 3. 3-2 en el 3 deja 5 y 2; 5-1 en el 5 quita el 5
  assert.equal(crit(st, "noFalloPareja", "3-2", "R"), -1);
  assert.equal(crit(st, "noFalloPareja", "5-1", "L"), 0);
});

test("C1: hacer pasar al siguiente es seguro si recuerda que pasó a esos números", () => {
  const st = mid({ ...BASE, lacks: [[], [5, 1], [], []] }); // el siguiente (1) no tiene 5 ni 1
  assert.equal(crit(st, "hacerPasar", "3-2", "R"), crit(st, "hacerPasar", "3-2", "R")); // determinista
  // 5-3 en el 3 deja 5 y 5: seguro pasa
  assert.equal(crit(st, "hacerPasar", "5-3", "R"), 1);
  assert.ok(crit(st, "hacerPasar", "3-2", "R") < 1);
  // Sin deducción de pases, no lo sabe con certeza
  assert.ok(crit(st, "hacerPasar", "5-3", "R", { deduccion: 1 }) < 1);
});

test("A5: castiga soltar la única ficha de sus dos números", () => {
  const st = mid({ hands: [["5-3", "6-1", "2-0", "4-4"], ["3-3", "5-0", "2-2", "1-1"], ["0-0", "4-1", "2-1", "4-2"], ["6-6", "5-5", "3-0", "6-2"]], board: [[5, 6], [6, 3]] });
  // 6-1 no cabe (puntas 5 y 3). 5-3 es la única con 5 y la única con 3
  assert.equal(crit(st, "solitaria", "5-3", "L"), -1);
});

test("A3: castiga quedarse sin fichas de un número que todavía puede salir", () => {
  const st = mid(BASE);
  // Tiene 5-3 y 3-2 con 3: soltar 3-2 deja de tener 2 (y quedan doses fuera)
  assert.equal(crit(st, "variedad", "3-2", "R"), -1);
  // Soltar 5-1 lo deja sin 1
  assert.equal(crit(st, "variedad", "5-1", "L"), -1);
});

test("D2: castiga abrir un número que nadie ha jugado, salvo que tenga varias fichas de él", () => {
  const st = mid(BASE);
  // Mesa con 5, 6 y 3. 5-1 en el 5 abre el 1 (solo tiene una ficha más con 1: ninguna)
  assert.equal(crit(st, "noAbrirNuevo", "5-1", "L"), -1);
  assert.equal(crit(st, "noAbrirNuevo", "5-3", "L"), 0); // deja 3: ya se vio
});

test("C4: premia quitar de la mesa el número de una mula que solo puede tener un rival", () => {
  // Del 4 ya salieron tres fichas; la pareja (2) pasó al 4, así que la mula de 4 solo puede estar con un rival
  const hands = [["4-0", "3-2", "6-6", "1-0", "5-5", "6-1"], ["4-4", "2-2", "0-0", "3-3", "6-2", "5-2"], ["1-1", "2-1", "6-0", "3-1", "2-0", "6-5"], ["4-2", "4-3", "5-0", "3-0", "5-3"]];
  const board = [[3, 6], [6, 4], [4, 5], [5, 1], [1, 4]]; // puntas 3 y 4
  const st = mid({ hands, board, lacks: [[], [], [4], []] });
  assert.equal(crit(st, "ahorcarMula", "4-0", "R"), 1); // quita el 4
  assert.equal(crit(st, "ahorcarMula", "3-2", "L"), -1); // lo deja
  // Sin deducción exacta no sabe dónde está la mula
  assert.equal(crit(st, "ahorcarMula", "4-0", "R", { deduccion: 2 }), 0);
});

test("modificadores: con un rival por dominar, el bloqueo pesa el doble; el perfil completo reacciona más", () => {
  const st = mid({ ...BASE, hands: [BASE.hands[0], ["4-4"], BASE.hands[2], BASE.hands[3]] });
  const know = knowledge(st, 0, { deduccion: 3 }), ctx = turnContext(st, 0, know, {});
  assert.ok(ctx.danger);
  assert.equal(effectiveWeights(PROFILES.b02, ctx).bloqueo, 2 * PROFILES.b02.pesos.bloqueo);
  assert.equal(effectiveWeights(PROFILES.b19, ctx).bloqueo, 2.5 * PROFILES.b19.pesos.bloqueo);
  // Va perdiendo por mucho: el apostador sube el tranque más que el equilibrado
  const losing = mid({ ...BASE, scores: [80, 10] });
  const c2 = turnContext(losing, 0, knowledge(losing, 0, { deduccion: 3 }), {});
  assert.ok(effectiveWeights(PROFILES.b16, c2).tranque / PROFILES.b16.pesos.tranque > effectiveWeights(PROFILES.b18, c2).tranque / PROFILES.b18.pesos.tranque);
});

// ---------- Factor aleatorio ----------

test("factor aleatorio: una jugada claramente mejor sale siempre; dos casi empatadas salen las dos", () => {
  const azar = { ventana: 0.15, temperatura: 0.25, escala: 5 };
  const clear = [10, 2, 1];
  assert.deepEqual(choiceProbs(clear, azar), [1, 0, 0]);
  const rnd = seededRandom(1);
  for (let i = 0; i < 1000; i++) assert.equal(chooseIndex(clear, azar, rnd), 0);
  const tie = [10, 9.8, 1];
  const pr = choiceProbs(tie, azar);
  assert.ok(pr[0] > pr[1] && pr[1] > 0 && pr[2] === 0);
  const count = [0, 0, 0];
  for (let i = 0; i < 1000; i++) count[chooseIndex(tie, azar, rnd)]++;
  assert.ok(count[0] > count[1] && count[1] > 50 && count[2] === 0, JSON.stringify(count));
  // Misma semilla, mismas decisiones
  const a = [], b = [], r1 = seededRandom(9), r2 = seededRandom(9);
  for (let i = 0; i < 50; i++) { a.push(chooseIndex(tie, azar, r1)); b.push(chooseIndex(tie, azar, r2)); }
  assert.deepEqual(a, b);
  // Sin azar, siempre la mejor
  assert.deepEqual(choiceProbs(tie, null), [1, 0, 0]);
});

test("en una situación dudosa real, el mismo bot a veces escoge distinto; con la misma semilla, igual", () => {
  let found = false;
  for (const st of states(CONFIGS[0], 30)) {
    const seat = st.hand.turn, seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(JSON.stringify(botMove(st, seat, "b16", { rnd: seededRandom(i), azar: true })));
    if (seen.size > 1) { found = true; break; }
  }
  assert.ok(found, "en 30 situaciones debería haber alguna dudosa");
  const st = states(CONFIGS[0], 1)[0];
  assert.deepEqual(botMove(st, st.hand.turn, "b16", { rnd: seededRandom(4), azar: true }), botMove(st, st.hand.turn, "b16", { rnd: seededRandom(4), azar: true }));
});

// ---------- Torneo ----------

test("torneo: la misma semilla da la misma partida", () => {
  const a = playGame(["b04", "b02", "b04", "b02"], { seed: 11 });
  const b = playGame(["b04", "b02", "b04", "b02"], { seed: 11 });
  assert.deepEqual([a.winner, a.scores, a.hands], [b.winner, b.scores, b.hands]);
  assert.ok(a.scores.some((x) => x >= 100));
});

test("torneo: perfiles de estilos distintos dejan huellas distintas", () => {
  const fp = (id) => { const st = []; for (let g = 0; g < 6; g++) { const r = playGame([id, "b02", id, "b02"], { seed: 100 + g }); st.push(r.stats[0], r.stats[2]); } return fingerprint(st); };
  const bas = fp("b01"), desc = fp("b04"), ctrl = fp("b06"), cast = fp("b11");
  assert.ok(desc.puntosSoltados > ctrl.puntosSoltados, "el descargador suelta más puntos que el controlador");
  assert.ok(cast.cuadra > bas.cuadra, "el castigador cuadra más que el básico");
});

test("withSeed deja Math.random como estaba", () => {
  const real = Math.random;
  withSeed(3, () => assert.notEqual(Math.random, real));
  assert.equal(Math.random, real);
});
