// Pruebas del motor de dominó. Correr con: npm test (o node --test tests/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  T, P, pts, isDbl, sumHand, fullSet, shuffle, tileRank,
  TARGET, validConfig, hasPozo, teamOf, nScores,
  newTable, deal, newGame, nameOf, pushLog,
  ends, legalPlays, canDraw, canPass, play, draw, pass,
  endHand, limitMs, autoMove,
} from "../src/engine/index.js";

// Aleatorio reproducible para que las pruebas den siempre lo mismo
const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

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

// Mesa a mitad de mano con fichas y tablero elegidos a mano
function midHand(config, { hands, board, pozo = [], turn = 0, mano = 0, scores }) {
  const st = table(config);
  return {
    ...st, status: "playing", handNo: 1, scores: scores || st.scores,
    hand: {
      hands, pozo, muestra: null, board, turn, mano, passes: 0, openers: [mano], firstReq: null, drew: 0,
      lacks: hands.map(() => []), played: hands.map(() => []), history: [], since: 0,
    },
  };
}

const tilesInPlay = (h) => h.hands.flat().length + h.pozo.length + h.board.length + (h.muestra ? 1 : 0);

// ---------- Fichas ----------

test("el juego tiene 28 fichas distintas, del 0-0 al 6-6", () => {
  const s = fullSet();
  assert.equal(s.length, 28);
  assert.equal(new Set(s).size, 28);
  assert.ok(s.includes("0-0") && s.includes("6-6"));
});

test("las fichas se escriben con el número mayor primero", () => {
  assert.equal(T(2, 5), "5-2");
  assert.equal(T(5, 2), "5-2");
  assert.deepEqual(P("5-2"), [5, 2]);
  assert.equal(pts("6-4"), 10);
  assert.ok(isDbl("3-3") && !isDbl("3-2"));
  assert.equal(sumHand(["6-6", "1-0", "0-0"]), 13);
});

test("mulas por encima de todo en el orden de salida", () => {
  assert.ok(tileRank("1-1") > tileRank("6-5"));
  assert.ok(tileRank("6-6") > tileRank("5-5"));
  assert.ok(tileRank("6-5") > tileRank("6-4"));
});

test("revolver es una permutación y se puede reproducir con la misma semilla", () => {
  const a = shuffle(fullSet(), seeded(1)), b = shuffle(fullSet(), seeded(1));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [...fullSet()].sort());
});

// ---------- Configuración ----------

test("modos válidos e inválidos", () => {
  for (const c of CONFIGS) assert.ok(validConfig(c), JSON.stringify(c));
  assert.ok(!validConfig({ n: 4, per: 9 }));
  assert.ok(!validConfig({ n: 2, per: 9 }));
  assert.ok(!validConfig({ n: 5, per: 5 }));
});

test("pozo, marcadores y equipos según el modo", () => {
  assert.ok(hasPozo({ n: 2, per: 7 }));
  assert.ok(!hasPozo({ n: 2, per: 14 }));
  assert.ok(hasPozo({ n: 3, per: 7 }));
  assert.ok(!hasPozo({ n: 3, per: 9 }));
  assert.ok(!hasPozo({ n: 4, per: 7 }));
  assert.equal(nScores({ n: 4, teams: true }), 2);
  assert.equal(nScores({ n: 3, teams: false }), 3);
  const st = table({ n: 4, teams: true, per: 7 });
  assert.deepEqual([0, 1, 2, 3].map((s) => teamOf(st, s)), [0, 1, 0, 1]);
  assert.equal(TARGET, 100);
});

// ---------- Reparto ----------

for (const c of CONFIGS) {
  test(`reparto ${c.n} jugadores, ${c.per} fichas${c.teams ? ", parejas" : ""}`, () => {
    const st = deal(table(c), seeded(3));
    const h = st.hand;
    assert.equal(st.status, "playing");
    assert.equal(st.handNo, 1);
    assert.equal(h.hands.length, c.n);
    for (const hh of h.hands) assert.equal(hh.length, c.per);
    if (c.n === 3 && c.per === 9) { assert.ok(h.muestra); assert.equal(h.pozo.length, 0); }
    else assert.equal(h.pozo.length, 28 - c.n * c.per);
    assert.equal(tilesInPlay(h), 28);
    // Primera mano: sale quien tiene la ficha más alta, y está obligado a salir con ella
    const all = h.hands.flat().sort((a, b) => tileRank(b) - tileRank(a));
    assert.equal(h.firstReq, all[0]);
    assert.ok(h.hands[h.turn].includes(all[0]));
    assert.deepEqual(legalPlays(st, h.turn), [{ tile: all[0], side: "X" }]);
  });
}

test("después de la primera mano, en parejas sale cualquiera de la pareja ganadora", () => {
  const st = deal({ ...table({ n: 4, teams: true, per: 7 }), handNo: 1, lastWinner: 1 }, seeded(5));
  assert.deepEqual(st.hand.openers, [1, 3]);
  assert.equal(st.hand.turn, null);
  assert.equal(st.hand.firstReq, null);
  assert.equal(limitMs(st.hand), 15000);
});

// ---------- Jugadas ----------

test("solo se puede tirar por una punta que coincida", () => {
  const st = midHand({ n: 2, teams: false, per: 7 }, {
    hands: [["6-1", "3-2", "4-4"], ["0-0"]], board: [[6, 5], [5, 4]], pozo: ["2-2"],
  });
  assert.deepEqual(ends(st.hand), [6, 4]);
  assert.deepEqual(legalPlays(st, 0), [{ tile: "6-1", side: "L" }, { tile: "4-4", side: "R" }]);
  assert.deepEqual(legalPlays(st, 1), []); // no es su turno
  assert.throws(() => play(st, 0, "3-2", "L"), /Jugada no válida/);
  assert.equal(limitMs(st.hand), 20000);
});

test("si las dos puntas son iguales, la ficha cuenta una sola vez", () => {
  const st = midHand({ n: 2, teams: false, per: 7 }, { hands: [["3-1"], ["0-0"]], board: [[3, 3]] });
  assert.deepEqual(legalPlays(st, 0), [{ tile: "3-1", side: "L" }]);
});

test("tirar pone la ficha en la punta correcta y pasa el turno", () => {
  const st = midHand({ n: 2, teams: false, per: 7 }, { hands: [["6-1", "4-4"], ["0-0"]], board: [[6, 5], [5, 4]] });
  const s1 = play(st, 0, "6-1", "L");
  assert.deepEqual(s1.hand.board[0], [1, 6]);
  assert.deepEqual(ends(s1.hand), [1, 4]);
  assert.deepEqual(s1.hand.hands[0], ["4-4"]);
  assert.equal(s1.hand.turn, 1);
  assert.deepEqual(s1.hand.played[0], ["6-1"]);
  assert.equal(s1.v, st.v + 1);
  // el estado original no se modifica
  assert.deepEqual(st.hand.hands[0], ["6-1", "4-4"]);
});

test("comer solo si no tienes jugada y hay pozo; pasar solo si no hay pozo", () => {
  const st = midHand({ n: 2, teams: false, per: 7 }, { hands: [["2-1"], ["0-0"]], board: [[6, 4]], pozo: ["3-3", "6-0"] });
  assert.ok(canDraw(st, 0) && !canPass(st, 0));
  assert.throws(() => pass(st, 0), /No puedes pasar/);
  const s1 = draw(st, 0); // come "6-0" (la última del pozo)
  assert.deepEqual(s1.hand.hands[0], ["2-1", "6-0"]);
  assert.equal(s1.hand.pozo.length, 1);
  assert.ok(!canDraw(s1, 0)); // ya tiene jugada
  assert.throws(() => draw(s1, 0), /No puedes comer/);
  const s2 = midHand({ n: 2, teams: false, per: 7 }, { hands: [["2-1"], ["0-0"]], board: [[6, 4]] });
  assert.ok(canPass(s2, 0) && !canDraw(s2, 0));
  const s3 = pass(s2, 0);
  assert.equal(s3.hand.turn, 1);
  assert.deepEqual(s3.hand.lacks[0], [4, 6]); // ya se sabe que no tiene 4 ni 6
});

// ---------- Fin de mano y puntuación (puntos en contra) ----------

test("parejas: quien domina hace que la otra pareja se anote sus puntos", () => {
  const st = midHand({ n: 4, teams: true, per: 7 }, {
    hands: [["6-1"], ["5-5"], ["2-0"], ["4-3"]], board: [[6, 6]], turn: 0,
  });
  const s1 = play(st, 0, "6-1", "L");
  assert.equal(s1.status, "handover");
  assert.equal(s1.result.type, "domino");
  assert.equal(s1.result.winner, 0);
  assert.deepEqual(s1.scores, [0, 10 + 7]); // 5-5 + 4-3
  assert.equal(s1.lastWinner, 0);
  assert.equal(s1.hand.turn, null);
});

test("tranque en parejas: gana la pareja con menos puntos; empate gana la pareja de la mano", () => {
  const cfg = { n: 4, teams: true, per: 7 };
  const s1 = endHand(midHand(cfg, { hands: [["1-0"], ["6-6"], ["2-0"], ["1-1"]], board: [[3, 3]], mano: 1 }), { type: "cerrado" });
  assert.equal(s1.result.winner, 0);
  assert.deepEqual(s1.scores, [0, 14]);
  const s2 = endHand(midHand(cfg, { hands: [["2-0"], ["1-0"], ["1-0"], ["1-0"]], board: [[3, 3]], mano: 1 }), { type: "cerrado" });
  assert.equal(s2.result.winner, 1); // pareja 0: 2+1 = 3; pareja 1: 1+1 = 2 → gana la pareja 1
  const s3 = endHand(midHand(cfg, { hands: [["1-0"], ["1-0"], ["1-0"], ["1-0"]], board: [[3, 3]], mano: 3 }), { type: "cerrado" });
  assert.equal(s3.result.winner, 1); // empate: gana la pareja de la mano (asiento 3)
});

test("2 jugadores: el que pierde se anota sus puntos", () => {
  const st = endHand(midHand({ n: 2, teams: false, per: 7 }, { hands: [["6-5"], ["1-0"]], board: [[3, 3]] }), { type: "cerrado" });
  assert.equal(st.result.winner, 1);
  assert.deepEqual(st.scores, [11, 0]);
});

test("3 o 4 individual: todos se anotan sus puntos y gana la mano el de menos", () => {
  const st = endHand(midHand({ n: 3, teams: false, per: 7 }, { hands: [["6-5"], ["1-0"], ["3-2"]], board: [[4, 4]] }), { type: "cerrado" });
  assert.equal(st.result.winner, 1);
  assert.deepEqual(st.scores, [11, 1, 5]);
});

test("la partida termina al llegar a 100 en contra y gana el de menos puntos", () => {
  const cfg = { n: 3, teams: false, per: 7 };
  const st = midHand(cfg, { hands: [["6-6"], ["1-0"], ["3-2"]], board: [[4, 4]], scores: [90, 50, 95] });
  const s1 = endHand(st, { type: "cerrado" });
  assert.equal(s1.status, "gameover");
  assert.ok(s1.result.over);
  assert.equal(s1.result.champion, 1);
  const s2 = newGame(s1);
  assert.equal(s2.status, "lobby");
  assert.deepEqual(s2.scores, [0, 0, 0]);
});

// ---------- Utilidades ----------

test("el registro de jugadas guarda solo las últimas 12", () => {
  let log = [];
  for (let i = 0; i < 20; i++) log = pushLog(log, "m" + i);
  assert.equal(log.length, 12);
  assert.equal(log[11], "m19");
});

test("nombre por defecto si el asiento está vacío", () => {
  const st = newTable("X", { n: 2, teams: false, per: 7 }, "h");
  assert.equal(nameOf(st, 1), "Jugador 2");
});

// ---------- Partidas completas ----------

for (const c of CONFIGS) {
  test(`partida completa con jugadas automáticas: ${c.n} jugadores, ${c.per} fichas${c.teams ? ", parejas" : ""}`, () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rnd = seeded(seed);
      let st = deal(table(c), rnd), steps = 0;
      while (st.status !== "gameover") {
        assert.ok(++steps < 5000, "la partida no termina");
        if (st.status === "handover") { st = deal(st, rnd); continue; }
        const before = st.scores.slice();
        st = autoMove(st, rnd);
        assert.equal(tilesInPlay(st.hand), 28);
        st.scores.forEach((s, i) => assert.ok(s >= before[i], "los puntos en contra nunca bajan"));
      }
      assert.ok(st.scores.some((s) => s >= TARGET));
      assert.notEqual(st.result.champion, null);
    }
  });
}
