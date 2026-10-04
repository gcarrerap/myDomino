// Pruebas de la compu en mesas en línea (issue #15), con el Firebase de mentira.
import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { fakeFirebase } from "./fakes/firebase.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.FIREBASE_CONFIG = { projectId: "demo" };
const fb = fakeFirebase(); globalThis.firebase = fb.firebase;

const { isEmptyTable, autoMove } = await import("../src/engine/index.js");
const { state, actions, scheduleBot, botRole, isBotSeat, BACKUP_MS } = await import("../src/app/index.js");
const { _resetForTests } = await import("../src/app/ai-client.js");
const { handle } = await import("../src/ai/worker.js");

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const ME = () => state.me.id;

before(async () => { await actions.start(); state.me.name = "Ana"; });
beforeEach(() => { delete globalThis.Worker; _resetForTests(); actions.leave(); });

// Mesa en línea con estos asientos (null = libre; "me" = yo; "bot" = compu; otro texto = otra persona)
async function table(n, seats) {
  state.config = { n, teams: n === 4, per: 7, timer: false };
  await actions.createTable();
  await actions.mutate((s) => {
    s.seats = seats.map((x, i) => (x === null ? null : x === "me" ? { id: ME(), name: "Ana" } : x === "bot" ? { id: "bot" + i, name: "Compu" + i, level: 2, bot: true } : { id: "id_" + x, name: x }));
    s.v++; return s;
  });
  await settle();
  return state.view.code;
}
// Reparte y juega (con jugadas automáticas por los humanos) hasta que le toque a la compu
async function untilBotTurn() {
  const { deal } = await import("../src/engine/index.js");
  for (let tries = 0; tries < 30; tries++) {
    await actions.mutate((s) => deal({ ...s, status: "lobby", handNo: 0, lastWinner: null }));
    await settle();
    for (let k = 0; k < 40 && state.tableState.status === "playing"; k++) {
      const h = state.tableState.hand;
      if (h.turn !== null && isBotSeat(state.tableState, h.turn)) return;
      await actions.mutate((s) => autoMove(s)); await settle();
    }
  }
  throw new Error("nunca le tocó a la compu");
}

// ---------- Agregar, quitar y nivel ----------

test("agregar la compu en un asiento libre, cambiarle el nivel y quitarla", async () => {
  await table(4, ["me", null, null, null]);
  await actions.addBot(1); await actions.addBot(2); await actions.addBot(3); await settle();
  const seats = state.tableState.seats;
  assert.deepEqual(seats.slice(1).map((s) => [s.name, s.bot, s.level]), [["Lupe", true, 2], ["Toño", true, 2], ["Chuy", true, 2]]);
  await actions.setOnlineBotLevel(2, 3); await settle();
  assert.equal(state.tableState.seats[2].level, 3);
  await actions.removeBot(2); await settle();
  assert.equal(state.tableState.seats[2], null);
  await actions.addBot(2); await settle();
  assert.equal(state.tableState.seats[2].name, "Toño", "toma el primer nombre libre");
});

test("la compu no toma el nombre de alguien sentado", async () => {
  await table(3, ["me", "Lupe", null]);
  await actions.addBot(2); await settle();
  assert.equal(state.tableState.seats[2].name, "Toño");
});

test("para agregar la compu hay que estar sentado, y solo antes de repartir", async () => {
  await table(2, ["Beto", null]);
  await actions.addBot(1); await settle();
  assert.equal(state.view.err, "Siéntate primero.");
  assert.equal(state.tableState.seats[1], null);
  await table(2, ["me", "bot"]);
  await untilBotTurn();
  await actions.removeBot(1); await settle();
  assert.equal(state.view.err, "La partida ya empezó.");
});

test("una mesa con solo compus cuenta como vacía (para la limpieza)", () => {
  const st = { status: "lobby", seats: [null, { id: "bot1", name: "Lupe", bot: true }] };
  assert.ok(isEmptyTable(st));
  assert.ok(!actions.hasPerson(st));
  assert.ok(!isEmptyTable({ ...st, seats: [{ id: "a", name: "Ana" }, st.seats[1]] }));
});

// ---------- Quién mueve a la compu ----------

test("la mueve quien está en el asiento más bajo; los demás son respaldo; quien solo mira, no", async () => {
  await table(4, ["me", "bot", "Beto", "bot"]);
  assert.equal(botRole(state.tableState), "primary");
  await actions.mutate((s) => { s.seats[0] = { id: "id_Carla", name: "Carla" }; s.seats[2] = { id: ME(), name: "Ana" }; s.v++; return s; }); await settle();
  assert.equal(botRole(state.tableState), "backup");
  await actions.mutate((s) => { s.seats[2] = { id: "id_Beto", name: "Beto" }; s.v++; return s; }); await settle();
  assert.equal(botRole(state.tableState), null);
});

test("en una mesa en línea sin compu no se programa nada", async () => {
  await table(2, ["me", "Beto"]);
  const { deal } = await import("../src/engine/index.js");
  await actions.mutate((s) => deal(s)); await settle();
  scheduleBot();
  assert.equal(state.botTimer, null);
});

// ---------- La compu juega ----------

test("cuando le toca, la compu juega sola y la jugada se guarda en la mesa", async () => {
  const timers = mock.timers; timers.enable({ apis: ["setTimeout"] });
  try {
    const code = await table(2, ["me", "bot"]);
    await untilBotTurn();
    const before = state.tableState, writes = fb.fs.writes;
    scheduleBot(); timers.tick(1000); await settle();
    const saved = JSON.parse(fb.fs._docs.get("mesas/" + code).json);
    assert.equal(fb.fs.writes, writes + 1, "una sola escritura");
    assert.equal(saved.hand.history.length, before.hand.history.length + 1);
    assert.equal(saved.hand.history.at(-1).s, 1, "jugó la compu");
    assert.equal(state.tableState.v, saved.v, "el cambio llegó a este teléfono");
  } finally { timers.reset(); }
});

test("el respaldo espera 4 s más antes de mover", async () => {
  const timers = mock.timers; timers.enable({ apis: ["setTimeout"] });
  try {
    await table(3, ["Beto", "me", "bot"]);
    await untilBotTurn();
    const v = state.tableState.v;
    scheduleBot(); timers.tick(1000); await settle();
    assert.equal(state.tableState.v, v, "a tiempo normal no mueve (lo debería hacer Beto)");
    timers.tick(BACKUP_MS); await settle();
    assert.equal(state.tableState.v, v + 1, "Beto no movió: mueve el respaldo");
  } finally { timers.reset(); }
});

test("si otro teléfono ya movió a la compu, la jugada de este no se aplica (nunca dos jugadas por turno)", async () => {
  // Worker de mentira para poder responder cuando la prueba quiera
  class FakeWorker { static last; constructor() { this.inbox = []; FakeWorker.last = this; } postMessage(m) { this.inbox.push(m); } reply() { this.onmessage({ data: handle(this.inbox.shift()) }); } terminate() {} }
  globalThis.Worker = FakeWorker;
  const timers = mock.timers; timers.enable({ apis: ["setTimeout"] });
  try {
    const code = await table(2, ["me", "bot"]);
    await untilBotTurn();
    const len = state.tableState.hand.history.length;
    scheduleBot(); timers.tick(1000); await settle();
    const w = FakeWorker.last;
    assert.equal(w.inbox.length, 1, "este teléfono está pensando");
    // mientras tanto, otro teléfono movió a la compu
    await actions.mutate((s) => autoMove(s)); await settle();
    const writes = fb.fs.writes;
    w.reply(); await settle();
    assert.equal(fb.fs.writes, writes, "no escribió nada");
    assert.equal(JSON.parse(fb.fs._docs.get("mesas/" + code).json).hand.history.length, len + 1, "solo una jugada");
  } finally { timers.reset(); }
});
