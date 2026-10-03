// Pruebas de la IA en un hilo aparte: el worker, el cliente (con un Worker de mentira) y cómo lo usa la app.
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;

const { handle } = await import("../src/ai/worker.js");
const { runAI, _resetForTests } = await import("../src/app/ai-client.js");
const { state, scheduleBot, actions } = await import("../src/app/index.js");
const { newTable, deal, autoMove, legalPlays, canDraw, canPass } = await import("../src/engine/index.js");

const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const settle = () => new Promise((r) => setImmediate(r));

function midGame(seed) {
  const rnd = seeded(seed);
  let st = newTable("T", { n: 4, teams: true, per: 7 }, "h");
  st.seats = st.seats.map((_, i) => ({ id: "p" + i, name: "J" + i }));
  st = deal(st, rnd);
  for (let i = 0; i < 6 && st.status === "playing"; i++) st = autoMove(st, rnd);
  return st;
}
const isLegal = (st, seat, m) => m.type === "play" ? legalPlays(st, seat).some((p) => p.tile === m.tile && p.side === m.side) : m.type === "draw" ? canDraw(st, seat) : canPass(st, seat);

// Worker de mentira: recibe mensajes y contesta cuando la prueba lo pide (con el mismo handle del worker real)
class FakeWorker {
  static last = null; static mode = "ok";
  constructor(url, opts) { this.url = String(url); this.opts = opts; this.inbox = []; this.terminated = false; FakeWorker.last = this; }
  postMessage(msg) {
    if (FakeWorker.mode === "fail") { setImmediate(() => this.onerror && this.onerror({ message: "no se pudo cargar" })); return; }
    this.inbox.push(structuredClone(msg));
  }
  reply() { const msg = this.inbox.shift(); this.onmessage({ data: structuredClone(handle(msg)) }); }
  terminate() { this.terminated = true; }
}

beforeEach(() => { delete globalThis.Worker; FakeWorker.mode = "ok"; FakeWorker.last = null; _resetForTests(); actions.leave(); });

// ---------- El worker ----------

test("worker: calcula la jugada de la compu y el consejo", () => {
  const st = midGame(3), seat = st.hand.turn;
  const r = handle({ id: 7, fn: "botMove", args: [st, seat, 2] });
  assert.equal(r.id, 7);
  assert.ok(isLegal(st, seat, r.result));
  const a = handle({ id: 8, fn: "advise", args: [st, seat] });
  assert.ok(a.result.none || a.result.levels.length === 3);
});

test("worker: un pedido inválido regresa un error, no truena", () => {
  assert.match(handle({ id: 1, fn: "borrarTodo", args: [] }).error, /desconocida/);
  assert.equal(handle({ id: 2, fn: "botMove", args: [null, 0, 1] }).id, 2);
  assert.ok(handle({ id: 2, fn: "botMove", args: [null, 0, 1] }).error);
});

// ---------- El cliente ----------

test("cliente: sin Worker (como en Node) calcula aquí mismo", async () => {
  const st = midGame(4), seat = st.hand.turn;
  const m = await runAI("botMove", st, seat, 3);
  assert.ok(isLegal(st, seat, m));
  await assert.rejects(runAI("borrarTodo"), /desconocida/);
});

test("cliente: con Worker, el cálculo va al hilo aparte y la respuesta regresa a quien la pidió", async () => {
  globalThis.Worker = FakeWorker;
  const st = midGame(5), seat = st.hand.turn;
  const p1 = runAI("botMove", st, seat, 1), p2 = runAI("advise", st, seat);
  const w = FakeWorker.last;
  assert.match(w.url, /ai\/worker\.js$/);
  assert.equal(w.opts.type, "module");
  assert.equal(w.inbox.length, 2);
  w.inbox.reverse(); w.reply(); w.reply(); // contesta en otro orden: cada respuesta llega a su promesa
  assert.ok(isLegal(st, seat, await p1));
  const adv = await p2; assert.ok(adv.none || adv.levels.length === 3);
});

test("cliente: si el worker no carga, lo pendiente y lo siguiente se calcula aquí", async () => {
  globalThis.Worker = FakeWorker; FakeWorker.mode = "fail";
  const warn = console.warn; console.warn = () => {};
  try {
    const st = midGame(6), seat = st.hand.turn;
    const m = await runAI("botMove", st, seat, 2);
    assert.ok(isLegal(st, seat, m));
    assert.ok(FakeWorker.last.terminated);
    const before = FakeWorker.last;
    assert.ok(isLegal(st, seat, await runAI("botMove", st, seat, 1)));
    assert.equal(FakeWorker.last, before, "no vuelve a intentar crear el worker");
  } finally { console.warn = warn; }
});

test("cliente: si el navegador no deja crear el worker, calcula aquí", async () => {
  globalThis.Worker = class { constructor() { throw new Error("SecurityError"); } };
  const st = midGame(7), seat = st.hand.turn;
  assert.ok(isLegal(st, seat, await runAI("botMove", st, seat, 1)));
});

// ---------- La app mientras la compu piensa ----------

function practiceWithBotTurn() {
  state.config = { n: 2, teams: false, per: 14, timer: false };
  let tries = 0;
  do { actions.leave(); actions.startPractice(); } while (state.tableState.hand.turn !== 1 && ++tries < 50);
  assert.equal(state.tableState.hand.turn, 1);
}

test("mientras la compu piensa no se programa otra jugada, y al terminar juega", async () => {
  globalThis.Worker = FakeWorker;
  const timers = mock.timers; timers.enable({ apis: ["setTimeout"] });
  try {
    practiceWithBotTurn();
    scheduleBot(); timers.tick(900); await settle();
    const w = FakeWorker.last;
    assert.equal(w.inbox.length, 1, "pidió una jugada");
    assert.ok(state.botTimer, "sigue ocupada pensando");
    scheduleBot(); timers.tick(900); await settle();
    assert.equal(w.inbox.length, 1, "no pidió otra mientras piensa");
    w.reply(); await settle();
    assert.equal(state.tableState.hand.board.length, 1);
    assert.equal(state.botTimer, null);
  } finally { timers.reset(); }
});

test("si sales de la mesa mientras la compu piensa, su jugada se descarta", async () => {
  globalThis.Worker = FakeWorker;
  const timers = mock.timers; timers.enable({ apis: ["setTimeout"] });
  try {
    practiceWithBotTurn();
    scheduleBot(); timers.tick(900); await settle();
    const w = FakeWorker.last;
    actions.leave();
    w.reply(); await settle();
    assert.equal(state.tableState, null);
    assert.equal(state.view.screen, "lobby");
  } finally { timers.reset(); }
});

test("el consejo: 'Pensando…' hasta que llega; si cambia el turno antes, no se muestra", async () => {
  globalThis.Worker = FakeWorker;
  state.config = { n: 2, teams: false, per: 14, timer: false };
  let tries = 0;
  do { actions.leave(); actions.startPractice(); } while (state.tableState.hand.turn !== 0 && ++tries < 50);
  actions.askAdvice(0);
  const w = FakeWorker.last;
  assert.equal(state.view.advice.data, null);
  w.reply(); await settle();
  assert.equal(state.view.advice.data.levels.length, 3);
  // otra vez, pero el turno cambia antes de que llegue
  actions.askAdvice(0);
  const lp = legalPlays(state.tableState, 0)[0];
  const { play } = await import("../src/engine/index.js");
  await actions.mutate((s) => play(s, 0, lp.tile, lp.side));
  w.reply(); await settle();
  assert.ok(!state.view.advice || state.view.advice.data === null);
});

test("el consejo: si falla el cálculo, se muestra un error y no se cuelga", async () => {
  globalThis.Worker = FakeWorker;
  state.config = { n: 2, teams: false, per: 14, timer: false };
  let tries = 0;
  do { actions.leave(); actions.startPractice(); } while (state.tableState.hand.turn !== 0 && ++tries < 50);
  actions.askAdvice(0);
  const w = FakeWorker.last;
  w.onmessage({ data: { id: w.inbox[0].id, error: "algo falló" } }); await settle();
  assert.deepEqual(state.view.advice.data, { error: true });
});
