// Pruebas de la grabación de partidas (#25): el registro de cada mano, reproducirla, juntar partidas, la cola local,
// subir sin duplicados y que la app grabe sin que se note.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeFirestore } from "./fakes/firebase.js";

// localStorage de mentira antes de cargar la app (igual que en app.test.js)
const mem = new Map([["dom.timer", "0"]]);
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
globalThis.window = globalThis;

const {
  newTable, deal, newGame, play, draw, pass, legalPlays, canDraw, autoMove, sumHand,
  handRecordId, buildHandRecord, replayHand, groupGames, RECORD_VERSION,
} = await import("../src/engine/index.js");
const { botMove } = await import("../src/ai/index.js");
const { makeDb, saveHandRecord, RECORDINGS } = await import("../src/services/index.js");
const { createRecorder, QUEUE_KEY, MAX_QUEUE } = await import("../src/app/recorder.js");
const { state, notify, actions, recorder } = await import("../src/app/index.js");

// ---------- Ayudantes ----------

function table(config, code = "TEST") {
  const st = newTable(code, config, "host");
  st.seats = st.seats.map((_, i) => (i === 0 ? { id: "g_memo", name: "Memo" } : { id: "bot" + i, name: "Compu " + i, level: 1, bot: true }));
  return st;
}
// Juega lo que falta de la mano con la compu básica
function playOut(st) {
  for (let guard = 0; guard < 500 && st.status === "playing"; guard++) {
    const h = st.hand;
    const seat = h.turn !== null ? h.turn : h.openers[0];
    const m = botMove(st, seat, 1);
    st = m.type === "play" ? play(st, seat, m.tile, m.side) : m.type === "draw" ? draw(st, seat) : pass(st, seat);
  }
  assert.notEqual(st.status, "playing");
  return st;
}
// Juega una partida completa y devuelve las manos terminadas (estado al final de cada mano)
function playGame(config) {
  let st = deal(table(config)); const ends = [];
  for (let guard = 0; guard < 60; guard++) {
    st = playOut(st); ends.push(st);
    if (st.status === "gameover") return { ends, final: st };
    st = deal(st);
  }
  throw new Error("La partida no terminó");
}
const ctx = { mode: "practice", app: "test", isBot: (s) => s !== 0 };
// Firestore de mentira con la regla de "solo crear" para la colección de manos
function createOnlyFs() {
  const fs = fakeFirestore(), doc = fs.doc;
  fs.doc = (path) => {
    const r = doc(path);
    if (!path.startsWith(RECORDINGS + "/")) return r;
    return { ...r, set: async (data) => { if (fs._docs.has(path)) throw Object.assign(new Error("denied"), { code: "permission-denied" }); return r.set(data); } };
  };
  return fs;
}
const memStore = (init = {}) => { const m = new Map(Object.entries(init)); return { m, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)) }; };
const savedRecords = (fs) => [...fs._docs.entries()].filter(([p]) => p.startsWith(RECORDINGS + "/")).map(([, d]) => JSON.parse(d.json));

// ---------- Motor: el registro de una mano ----------

test("el reparto guarda cómo empezó la mano y cada partida nueva tiene su propio id", () => {
  let st = deal(table({ n: 4, teams: true, per: 7 }));
  const id1 = st.gameId;
  assert.match(id1, /^TEST-/);
  assert.deepEqual(st.hand.start.hands, st.hand.hands);
  assert.deepEqual(st.hand.start.openers, st.hand.openers);
  st = deal(playOut(st));
  assert.equal(st.gameId, id1, "las manos siguientes son de la misma partida");
  const st2 = deal(newGame(st));
  assert.notEqual(st2.gameId, id1, "una partida nueva en la misma mesa tiene otro id");
  assert.match(deal(table({ n: 4, teams: true, per: 7 }, "PRÁCTICA")).gameId, /^PRACTICA-/);
});

test("cada jugada, comida y pase lleva su hora", () => {
  const st = playOut(deal(table({ n: 2, teams: false, per: 7 })));
  assert.ok(st.hand.history.length > 0);
  for (const e of st.hand.history) assert.equal(typeof e.t, "number");
});

test("cuando se acaba el tiempo, todo lo que hizo el reloj queda marcado como automático (también lo que comió)", () => {
  // Busca un reparto donde el que tiene el turno tenga que comer antes de poder tirar
  for (let k = 0; k < 400; k++) {
    let st = deal(table({ n: 2, teams: false, per: 7 }));
    st = play(st, st.hand.turn, st.hand.firstReq, "X");
    const seat = st.hand.turn;
    if (legalPlays(st, seat).length || !canDraw(st, seat)) continue;
    const n0 = st.hand.history.length;
    const after = autoMove(st);
    const added = after.hand.history.slice(n0);
    assert.ok(added.length >= 2 && added[0].a === "draw");
    assert.ok(added.every((e) => e.auto));
    return;
  }
  assert.fail("no se encontró un reparto para probar");
});

test("solo hay registro cuando la mano terminó", () => {
  const st = deal(table({ n: 4, teams: true, per: 7 }));
  assert.equal(handRecordId(st), null);
  assert.equal(buildHandRecord(st, ctx), null);
  const done = playOut(st);
  assert.equal(handRecordId(done), `${done.gameId}_1`);
});

for (const config of [{ n: 4, teams: true, per: 7 }, { n: 2, teams: false, per: 7 }, { n: 3, teams: false, per: 9 }]) {
  test(`partida completa (${config.n} jugadores, ${config.per} fichas${config.teams ? ", parejas" : ""}): cada mano se reproduce igual`, () => {
    const { ends, final } = playGame(config);
    const recs = ends.map((st) => buildHandRecord(st, ctx));
    recs.forEach((rec, i) => {
      const st = ends[i];
      assert.equal(rec.v, RECORD_VERSION);
      assert.equal(rec.hand, i + 1);
      assert.equal(rec.gameId, final.gameId);
      assert.deepEqual(rec.players.map((p) => p.bot), st.seats.map((_, s) => s !== 0));
      assert.equal(rec.players[1].level, 1);
      assert.equal(rec.players[0].level, null);
      // Fichas iniciales: lo que quedó + lo que tiró cada quien (sin pozo, nadie come)
      if (!rec.deal.pozo.length) {
        rec.deal.hands.forEach((h0, s) => {
          const playedBy = rec.events.filter((e) => e.s === s && e.a === "play").map((e) => e.tile);
          assert.deepEqual([...rec.result.hands[s], ...playedBy].sort(), h0.slice().sort());
        });
      }
      for (const e of rec.events) { assert.equal(e.by, rec.players[e.s].bot ? "bot" : "human"); assert.ok(e.ms >= 0); }
      // Reproducir con las reglas del motor da el mismo resultado
      const re = replayHand(JSON.parse(JSON.stringify(rec)));
      assert.equal(re.result.type, rec.result.type);
      assert.equal(re.result.winner, rec.result.winner);
      assert.deepEqual(re.result.add, rec.result.add);
      assert.deepEqual(re.result.sums, rec.result.sums);
      assert.deepEqual(re.hand.hands, rec.result.hands);
      assert.deepEqual(re.scores, rec.result.scores);
    });
    const games = groupGames(recs.slice().reverse());
    assert.equal(games.length, 1);
    assert.equal(games[0].status, "finished");
    assert.deepEqual(games[0].scores, final.scores);
    assert.equal(games[0].champion, final.result.champion);
    assert.deepEqual(games[0].hands.map((h) => h.hand), recs.map((r) => r.hand));
  });
}

test("un registro alterado no se puede reproducir", () => {
  const rec = buildHandRecord(playOut(deal(table({ n: 4, teams: true, per: 7 }))), ctx);
  const bad = JSON.parse(JSON.stringify(rec));
  const ev = bad.events.find((e) => e.a === "play" && e.side !== "X");
  ev.tile = bad.deal.hands[(ev.s + 1) % 4].find((t) => !bad.events.some((x) => x.tile === t)) || "0-0";
  assert.throws(() => replayHand(bad));
});

test("una partida sin su última mano queda como abandonada", () => {
  const { ends } = playGame({ n: 4, teams: true, per: 7 });
  const recs = ends.map((st) => buildHandRecord(st, ctx));
  if (ends.length > 1) assert.equal(groupGames(recs.slice(0, -1))[0].status, "abandoned"); // falta la mano final
  if (ends.length > 2) assert.equal(groupGames([recs[0], recs[2]])[0].status, "abandoned"); // falta una mano en medio
});

// ---------- Grabador: cola local y subida ----------

test("graba una mano terminada una sola vez y la sube", async () => {
  const fs = createOnlyFs(), db = makeDb(fs), store = memStore();
  const r = createRecorder({ store, getDb: () => db, save: saveHandRecord });
  const st = playOut(deal(table({ n: 4, teams: true, per: 7 })));
  assert.equal(r.capture(deal(table({ n: 4, teams: true, per: 7 })), ctx), false, "a media mano no graba");
  assert.equal(r.capture(st, ctx), true);
  assert.equal(r.capture(st, ctx), false, "la misma mano no se vuelve a grabar");
  await r.flush();
  const saved = savedRecords(fs);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, handRecordId(st));
  assert.equal(fs._docs.get(`${RECORDINGS}/${saved[0].id}`).gameId, st.gameId);
  assert.deepEqual(r.pending(), []);
});

test("dos teléfonos de la misma mesa graban la misma mano: queda un solo registro y ninguno se queda con pendientes", async () => {
  const fs = createOnlyFs(), db = makeDb(fs);
  const a = createRecorder({ store: memStore(), getDb: () => db, save: saveHandRecord });
  const b = createRecorder({ store: memStore(), getDb: () => db, save: saveHandRecord });
  const st = playOut(deal(table({ n: 4, teams: true, per: 7 })));
  a.capture(st, { ...ctx, mode: "online" }); b.capture(st, { ...ctx, mode: "online" });
  await a.flush(); await b.flush();
  assert.equal(savedRecords(fs).length, 1);
  assert.deepEqual(a.pending(), []);
  assert.deepEqual(b.pending(), []);
});

test("sin conexión la mano se queda en la cola (y sobrevive a cerrar el juego); al conectarse se sube", async () => {
  const fs = createOnlyFs(), db = makeDb(fs), store = memStore();
  let online = false;
  const r = createRecorder({ store, getDb: () => (online ? db : null), save: saveHandRecord });
  const st = playOut(deal(table({ n: 4, teams: true, per: 7 })));
  r.capture(st, ctx);
  await r.flush();
  assert.equal(r.pending().length, 1);
  assert.equal(JSON.parse(store.m.get(QUEUE_KEY)).length, 1);
  // "Se cierra el juego": otro grabador con el mismo almacenamiento
  online = true;
  const r2 = createRecorder({ store, getDb: () => db, save: saveHandRecord });
  assert.equal(r2.capture(st, ctx), false, "ya estaba grabada en este teléfono");
  await r2.flush();
  assert.equal(savedRecords(fs).length, 1);
  assert.deepEqual(JSON.parse(store.m.get(QUEUE_KEY)), []);
});

test("si falla la subida no truena: se reintenta después, en orden", async () => {
  const fs = createOnlyFs(), db = makeDb(fs);
  let fail = true;
  const save = (d, rec) => (fail ? Promise.reject(Object.assign(new Error("offline"), { code: "unavailable" })) : saveHandRecord(d, rec));
  const r = createRecorder({ store: memStore(), getDb: () => db, save });
  const s1 = playOut(deal(table({ n: 4, teams: true, per: 7 })));
  const s2 = playOut(deal(s1));
  assert.doesNotThrow(() => { r.capture(s1, ctx); r.capture(s2, ctx); });
  await r.flush(); await r.flush();
  assert.deepEqual(r.pending().map((x) => x.hand), [1, 2]);
  fail = false;
  await r.flush();
  assert.deepEqual(savedRecords(fs).map((x) => x.hand).sort(), [1, 2]);
  assert.deepEqual(r.pending(), []);
});

test("la cola tiene tope: se descartan primero las manos más viejas", () => {
  const r = createRecorder({ store: memStore(), getDb: () => null, save: saveHandRecord });
  let st = deal(table({ n: 2, teams: false, per: 14 })), first = null;
  for (let k = 0; k < MAX_QUEUE + 5; k++) {
    const done = playOut(st);
    // Cada mano como si fuera de una partida distinta, para no depender de cuántas manos dura una partida
    const one = { ...done, gameId: "G" + k };
    if (!first) first = one;
    r.capture(one, ctx);
    st = deal({ ...table({ n: 2, teams: false, per: 14 }) });
  }
  const p = r.pending();
  assert.equal(p.length, MAX_QUEUE);
  assert.ok(!p.some((x) => x.gameId === first.gameId));
});

test("un almacenamiento dañado no rompe el grabador", () => {
  const store = memStore({ [QUEUE_KEY]: "{no es json", "dom.recSeen": "42" });
  const r = createRecorder({ store, getDb: () => null, save: saveHandRecord });
  assert.deepEqual(r.pending(), []);
  assert.equal(r.capture(playOut(deal(table({ n: 4, teams: true, per: 7 }))), ctx), true);
});

// ---------- La app graba sola y sin que se note ----------

test("en práctica la app graba cada mano al terminar, sin mostrar nada; sin conexión la guarda y la sube al conectarse", async () => {
  state.db = null;
  state.me.name = "Memo";
  actions.startPractice();
  const view0 = JSON.stringify(state.view);
  state.tableState = playOut(state.tableState);
  notify();
  assert.equal(recorder.pending().length, 1, "sin conexión queda en la cola");
  const rec = recorder.pending()[0];
  assert.equal(rec.mode, "practice");
  assert.equal(rec.players[0].bot, false);
  assert.ok(rec.players.slice(1).every((p) => p.bot && p.level >= 1));
  assert.ok(JSON.parse(mem.get(QUEUE_KEY)).length >= 1);
  assert.equal(state.view.err, "");
  assert.equal(JSON.stringify(state.view), view0, "la vista no cambia");
  // Se conecta: lo pendiente se sube
  const fs = createOnlyFs();
  state.db = makeDb(fs);
  notify();
  await recorder.flush();
  assert.equal(savedRecords(fs).length, 1);
  assert.deepEqual(recorder.pending(), []);
  actions.leave();
});

test("en una mesa en línea, quien solo mira no graba", async () => {
  const fs = createOnlyFs();
  state.db = makeDb(fs);
  actions.leave();
  const st = playOut(deal(table({ n: 4, teams: true, per: 7 }, "MIRA")));
  state.view = { screen: "table", code: "MIRA", practice: false, sel: null, err: "" };
  state.me = { id: "alguien-mas", name: "Visita" };
  state.tableState = st;
  notify();
  await recorder.flush();
  assert.equal(savedRecords(fs).length, 0);
  // Sentado (asiento 0) sí graba, como mesa en línea
  state.me = { id: "g_memo", name: "Memo" };
  notify();
  await recorder.flush();
  const saved = savedRecords(fs);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].mode, "online");
  assert.deepEqual(saved[0].players.map((p) => p.bot), [false, true, true, true]);
  state.tableState = null; state.view = { screen: "lobby", code: null, practice: false, sel: null, err: "" };
});

test("sumHand de las manos finales coincide con los puntos del resultado", () => {
  const rec = buildHandRecord(playOut(deal(table({ n: 4, teams: true, per: 7 }))), ctx);
  assert.deepEqual(rec.result.hands.map(sumHand), rec.result.sums);
});
