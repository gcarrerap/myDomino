// Pruebas de la IA: jugadores de la compu, registro, especulación y consejo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newTable, deal, autoMove, legalPlays, canDraw, canPass, fullSet, T } from "../src/engine/index.js";
import { LEVELS, deduce, tracker, speculate, explainTile, openingPlan, botMove, advise } from "../src/ai/index.js";

const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// La IA usa Math.random por dentro; esto la hace reproducible durante una prueba
function withRandom(seed, fn) {
  const real = Math.random;
  Math.random = seeded(seed);
  try { return fn(); } finally { Math.random = real; }
}

const CONFIGS = [
  { n: 4, teams: true, per: 7 },
  { n: 4, teams: false, per: 7 },
  { n: 3, teams: false, per: 7 },
  { n: 3, teams: false, per: 9 },
  { n: 2, teams: false, per: 7 },
  { n: 2, teams: false, per: 14 },
];

function table(config) {
  const st = newTable("TEST", config, "host");
  st.seats = st.seats.map((_, i) => ({ id: "p" + i, name: "J" + (i + 1) }));
  return st;
}

// Mesas a media mano: reparte y avanza unas jugadas automáticas
function midGame(config, seed, steps) {
  const rnd = seeded(seed);
  let st = deal(table(config), rnd);
  for (let i = 0; i < steps && st.status === "playing"; i++) st = autoMove(st, rnd);
  return st.status === "playing" ? st : null;
}
function states(config, n, maxSteps = 12) {
  const out = [];
  for (let seed = 1; out.length < n && seed < 200; seed++) {
    const st = midGame(config, seed, 1 + (seed % maxSteps));
    if (st && st.hand.turn !== null) out.push(st);
  }
  return out;
}

// Reacomoda las fichas que "viewer" no ve (manos ajenas y pozo), respetando cuántas tiene cada quien
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

const isLegal = (st, seat, m) => {
  if (m.type === "play") return legalPlays(st, seat).some((p) => p.tile === m.tile && p.side === m.side);
  if (m.type === "draw") return canDraw(st, seat);
  if (m.type === "pass") return canPass(st, seat);
  return false;
};

// ---------- Niveles ----------

test("tres niveles con nombre", () => {
  assert.deepEqual(LEVELS.slice(1), ["Básico", "Intermedio", "Avanzado"]);
});

// ---------- Registro y deducción ----------

test("lo que un jugador ve: su mano y la mesa son conocidas; lo demás es posible", () => {
  const st = states({ n: 4, teams: true, per: 7 }, 1)[0], h = st.hand, me = h.turn;
  const { known, possible } = deduce(st, me);
  for (const t of h.hands[me]) assert.ok(known.has(t));
  for (const [a, b] of h.board) assert.ok(known.has(T(a, b)));
  const unknown = fullSet().filter((t) => !known.has(t));
  assert.equal(unknown.length, 28 - known.size);
  for (const t of unknown) assert.ok(possible[t].length >= 1, `${t} tiene que estar con alguien`);
  // nunca se le atribuye una ficha a quien mira
  for (const t of unknown) assert.ok(!possible[t].includes(me));
});

test("si alguien pasó, el registro sabe que no tiene esos números", () => {
  // 2 jugadores sin pozo: el jugador 1 pasa con puntas 6 y 4
  const st = table({ n: 2, teams: false, per: 14 });
  const s1 = {
    ...st, status: "playing", handNo: 1,
    hand: {
      hands: [["5-5", "3-1"], ["2-0", "1-0"]], pozo: [], muestra: null, board: [[6, 4]], turn: 0, mano: 0, passes: 1,
      openers: [0], firstReq: null, drew: 0, lacks: [[], [4, 6]], played: [[], []], history: [], since: 0,
    },
  };
  const tr = tracker(s1, 0, 1);
  const cells = tr.rows.flat();
  for (const { t, state } of cells) {
    const [a, b] = t.split("-").map(Number);
    if (a === 4 || b === 4 || a === 6 || b === 6) assert.ok(state !== "maybe" && state !== "sure", `${t} no puede estar con él`);
  }
  assert.deepEqual(tr.lacks, [4, 6]);
  assert.equal(tr.count, 2);
});

test("plan de salida: una mano cargada de un número es fuerte y sale con su mula", () => {
  const plan = openingPlan(["6-6", "6-5", "6-4", "6-3", "6-1", "2-0", "1-0"]);
  assert.equal(plan.suit, 6);
  assert.equal(plan.tile, "6-6");
  assert.ok(plan.strong);
  assert.ok(plan.rating > 6);
  const weak = openingPlan(["6-6", "5-5", "4-4", "3-2", "2-1", "1-0", "0-0"]);
  assert.ok(!weak.strong);
});

// ---------- Jugadores de la compu ----------

for (const c of CONFIGS) {
  test(`niveles 1 y 2 solo hacen jugadas válidas: ${c.n} jugadores, ${c.per} fichas${c.teams ? ", parejas" : ""}`, () => {
    for (const [i, st] of states(c, 8).entries()) {
      for (const level of [1, 2]) {
        const m = withRandom(i, () => botMove(st, st.hand.turn, level));
        assert.ok(isLegal(st, st.hand.turn, m), JSON.stringify(m));
      }
    }
  });
}

test("nivel 3 solo hace jugadas válidas", () => {
  for (const c of [CONFIGS[0], CONFIGS[2], CONFIGS[4]]) {
    for (const [i, st] of states(c, 2, 8).entries()) {
      const m = withRandom(i, () => botMove(st, st.hand.turn, 3));
      assert.ok(isLegal(st, st.hand.turn, m), JSON.stringify(m));
    }
  }
});

test("la compu no ve fichas ajenas: si se reacomodan las que no ve, decide lo mismo", () => {
  for (const c of [CONFIGS[0], CONFIGS[2], CONFIGS[4]]) {
    for (const [i, st] of states(c, 4).entries()) {
      const seat = st.hand.turn, other = shuffleHidden(st, seat, 100 + i);
      assert.deepEqual(other.hand.hands[seat], st.hand.hands[seat]); // su mano no cambia
      for (const level of [1, 2, 3]) {
        if (level === 3 && i > 0) continue; // el nivel 3 es lento: basta un caso por modo
        const a = withRandom(7, () => botMove(st, seat, level));
        const b = withRandom(7, () => botMove(other, seat, level));
        assert.deepEqual(a, b, `nivel ${level}`);
      }
    }
  }
});

test("el consejo tampoco ve fichas ajenas", () => {
  const st = states({ n: 4, teams: true, per: 7 }, 1, 6)[0], seat = st.hand.turn;
  const a = withRandom(3, () => advise(st, seat));
  const b = withRandom(3, () => advise(shuffleHidden(st, seat, 9), seat));
  assert.deepEqual(a, b);
});

// ---------- Consejo y especulación ----------

test("el consejo da una jugada válida por nivel", () => {
  const st = states({ n: 4, teams: true, per: 7 }, 1, 6)[0], seat = st.hand.turn;
  const adv = withRandom(1, () => advise(st, seat));
  if (adv.none) return; // sin jugada: tiene que comer o pasar
  assert.equal(adv.levels.length, 3);
  for (const card of adv.levels) {
    assert.ok(legalPlays(st, seat).some((p) => p.tile === card.tile && p.side === card.side));
    assert.ok(Array.isArray(card.reasons));
  }
});

test("especulación: para cada ficha oculta, las probabilidades de quién la tiene suman 1", () => {
  const st = states({ n: 4, teams: true, per: 7 }, 1, 10)[0], seat = st.hand.turn;
  const spec = withRandom(5, () => speculate(st, seat, 150));
  const tiles = Object.keys(spec.prob);
  assert.ok(tiles.length > 0);
  for (const t of tiles) {
    const sum = Object.values(spec.prob[t]).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${t}: ${sum}`);
    assert.ok(!(seat in spec.prob[t]), "quien mira no puede tener fichas ocultas");
  }
  const t = tiles[0], target = Number(Object.keys(spec.prob[t]).find((k) => k !== "pozo"));
  const ex = explainTile(st, seat, spec, t, target);
  assert.ok(ex.pFull >= 0 && ex.pFull <= 1);
});
