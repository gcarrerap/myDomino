// Pruebas del estado de la app y sus acciones (práctica, preferencias, mano, notas, reloj, mesas en línea).
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { fakeFirebase } from "./fakes/firebase.js";

// localStorage de mentira antes de cargar la app (el estado inicial se lee de ahí)
const mem = new Map([["dom.botLevels", "[1,3,2]"], ["dom.timer", "0"]]);
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
globalThis.window = globalThis;
globalThis.FIREBASE_CONFIG = { projectId: "demo" }; // en el navegador viene de src/config.js

const { state, subscribe, mySeat, canReveal, timerOn, BOT_NAMES, scheduleBot, tickClock, actions } = await import("../src/app/index.js");
const { legalPlays, canDraw, canPass, fullSet } = await import("../src/engine/index.js");

let renders = [];
subscribe((what) => renders.push(what ?? "all"));
const flush = () => new Promise((r) => setTimeout(r, 0));

function reset() {
  actions.leave();
  delete globalThis.firebase;
  state.db = null; state.dbTried = false; state.authUser = null; state.unsubList = null; state.listCache = [];
  state.me = { id: state.deviceId, name: "" };
  state.config = { n: 4, teams: true, per: 7, timer: false };
  state.botLevels = [2, 2, 2];
  renders = [];
}
beforeEach(reset);

// ---------- Estado inicial ----------

test("el estado inicial sale de las preferencias del dispositivo", () => {
  assert.match(state.deviceId, /^d[a-z0-9]+$/);
  assert.equal(mem.get("dom.dev"), state.deviceId); // el id del dispositivo se guarda
  assert.equal(state.view.screen, "lobby");
});

// ---------- Práctica ----------

test("practicar: tú en el asiento 1 y la compu en los demás, con sus niveles", () => {
  state.me.name = "Memo"; state.botLevels = [1, 3, 2];
  actions.startPractice();
  const st = state.tableState;
  assert.equal(state.view.screen, "table");
  assert.ok(state.view.practice);
  assert.equal(st.status, "playing");
  assert.deepEqual(st.seats.map((s) => s.name), ["Memo", ...BOT_NAMES]);
  assert.deepEqual(st.seats.slice(1).map((s) => s.level), [1, 3, 2]);
  assert.equal(mySeat(st), 0);
  assert.ok(canReveal());
  assert.deepEqual(renders, ["all"]);
});

test("en práctica, mutate aplica la jugada; si es inválida, deja la mesa igual y muestra el error", async () => {
  state.config = { n: 2, teams: false, per: 7, timer: false };
  actions.startPractice();
  const st = state.tableState, seat = st.hand.turn;
  await actions.mutate((s) => { throw new Error("Jugada no válida"); });
  assert.equal(state.view.err, "Jugada no válida");
  assert.equal(state.tableState, st);
  const p = legalPlays(st, seat)[0];
  const { play } = await import("../src/engine/index.js");
  state.view.sel = "x";
  await actions.mutate((s) => play(s, seat, p.tile, p.side));
  assert.equal(state.view.err, "");
  assert.equal(state.view.sel, null);
  assert.equal(state.tableState.hand.board.length, 1);
});

test("la compu juega sola cuando le toca", () => {
  const timers = mock.timers; timers.enable({ apis: ["setTimeout"] });
  try {
    state.config = { n: 2, teams: false, per: 14, timer: false };
    // busca un reparto en el que salga la compu
    let tries = 0;
    do { actions.leave(); actions.startPractice(); } while (state.tableState.hand.turn !== 1 && ++tries < 50);
    assert.equal(state.tableState.hand.turn, 1);
    scheduleBot();
    assert.ok(state.botTimer);
    timers.tick(900);
    assert.equal(state.tableState.hand.board.length, 1, "la compu salió");
    assert.equal(state.tableState.hand.turn, 0);
  } finally { timers.reset(); }
});

test("salir de la mesa cancela a la compu y regresa al lobby", () => {
  actions.startPractice();
  state.botTimer = setTimeout(() => assert.fail("no debió correr"), 0);
  actions.leave();
  assert.equal(state.botTimer, null);
  assert.equal(state.view.screen, "lobby");
  assert.equal(state.tableState, null);
});

// ---------- Reloj ----------

test("reloj: sin límite de tiempo no hay reloj", () => {
  state.config = { n: 2, teams: false, per: 7, timer: false };
  actions.startPractice();
  assert.ok(!timerOn(state.tableState));
  assert.equal(tickClock(), null);
});

test("reloj: cuenta hacia atrás y, al vencerse, resuelve el turno una sola vez", async () => {
  const realNow = Date.now; let now = 1_000_000; Date.now = () => now;
  try {
    state.config = { n: 2, teams: false, per: 14, timer: true };
    actions.startPractice();
    const st = state.tableState;
    const c1 = tickClock();
    assert.equal(c1.secs, 20); assert.equal(c1.pct, 100); assert.equal(c1.fire, null);
    now += 15_500;
    const c2 = tickClock();
    assert.equal(c2.secs, 5); assert.equal(c2.fire, null);
    now += 5_000;
    const c3 = tickClock();
    assert.equal(c3.secs, 0); assert.equal(c3.pct, 0);
    assert.equal(typeof c3.fire, "function");
    assert.equal(tickClock().fire, null, "no se dispara dos veces");
    await c3.fire();
    assert.notEqual(state.tableState, st, "se resolvió el turno vencido");
    assert.equal(state.tableState.hand.board.length, 1);
  } finally { Date.now = realNow; }
});

// ---------- Preferencias ----------

test("escoger jugadores ajusta el modo, sin perder el reloj", () => {
  state.config.timer = true;
  actions.setPlayers(3);
  assert.deepEqual(state.config, { n: 3, teams: false, per: 9, timer: true });
  actions.setPlayers(2);
  assert.deepEqual(state.config, { n: 2, teams: false, per: 7, timer: true });
  actions.setPer(14); actions.setPlayers(4); actions.setTeams(false);
  assert.deepEqual(state.config, { n: 4, teams: false, per: 7, timer: true });
  assert.equal(renders.length, 5);
});

test("las preferencias se guardan en el dispositivo", () => {
  actions.setTimer(true); assert.equal(mem.get("dom.timer"), "1");
  actions.setTimer(false); assert.equal(mem.get("dom.timer"), "0");
  actions.setBotLevel(1, 3); assert.equal(mem.get("dom.botLevels"), "[2,3,2]");
  actions.setName("  Memo  "); assert.equal(state.me.name, "Memo"); assert.equal(mem.get("dom.name"), "Memo");
});

test("cambiar el nivel de una compu en plena práctica también cambia el de las siguientes", () => {
  actions.startPractice();
  actions.setSeatLevel(2, 1);
  assert.equal(state.tableState.seats[2].level, 1);
  assert.deepEqual(state.botLevels, [2, 1, 2]);
});

// ---------- Tu mano y notas ----------

test("tu mano: de mayor a menor la primera vez, lo que comes va al final, y se puede reacomodar y girar", () => {
  state.config = { n: 2, teams: false, per: 7, timer: false };
  actions.startPractice();
  const st = state.tableState;
  const order = actions.handArrangement(st, 0);
  const pts = (t) => t.split("-").reduce((a, b) => a + +b, 0);
  assert.deepEqual(order.map(pts), order.map(pts).slice().sort((a, b) => b - a));
  const st2 = structuredClone(st); st2.hand.hands[0] = [...st.hand.hands[0], "9-9"];
  assert.equal(actions.handArrangement(st2, 0).at(-1), "9-9");
  actions.setHandOrder(order.slice().reverse());
  assert.deepEqual(JSON.parse(mem.get("dom.arr")).order, order.slice().reverse());
  actions.flipTile(order[0]);
  assert.equal(state.arr.flip[order[0]], true);
  assert.equal(JSON.parse(mem.get("dom.arr")).flip[order[0]], true);
});

test("notas del registro: se guardan y se borran", () => {
  actions.setNote("K|1", "si");
  assert.equal(JSON.parse(mem.get("dom.notes"))["K|1"], "si");
  actions.setNote("K|1", "");
  assert.equal(JSON.parse(mem.get("dom.notes"))["K|1"], undefined);
});

test("setView redibuja salvo que se pida lo contrario", () => {
  actions.setView({ menu: true });
  actions.setView({ trkSel: "6-6" }, false);
  assert.ok(state.view.menu); assert.equal(state.view.trkSel, "6-6");
  assert.deepEqual(renders, ["all"]);
});

// ---------- En línea (con Firebase de mentira) ----------

test("sin Firebase, la app queda en modo práctica", async () => {
  const warn = console.warn; console.warn = () => {};
  try { await actions.start(); } finally { console.warn = warn; }
  assert.equal(state.db, null);
  assert.ok(state.dbTried);
});

test("en línea: invitado, crear mesa, sentarse, repartir y jugar", async () => {
  const fb = fakeFirebase(); globalThis.firebase = fb.firebase;
  await actions.start();
  assert.ok(state.db);
  assert.equal(state.authUser.uid, "anon1");
  assert.equal(state.me.id, state.deviceId); // invitado: el id es el del dispositivo
  state.me.name = "Ana"; state.config = { n: 2, teams: false, per: 7, timer: false };
  await actions.createTable();
  assert.equal(state.view.screen, "table");
  const code = state.view.code;
  assert.ok(fb.fs._docs.has("mesas/" + code));
  assert.equal(state.tableState.seats[0].name, "Ana");
  // la lista del lobby ya no se redibuja porque estamos en la mesa
  assert.ok(!renders.includes("list") || renders.indexOf("list") < renders.lastIndexOf("all"));
  // Beto se sienta (otro dispositivo escribe en la mesa)
  await actions.mutate((s) => { s.seats[1] = { id: "beto", name: "Beto" }; s.v++; return s; });
  assert.equal(state.tableState.seats[1].name, "Beto");
  const { deal } = await import("../src/engine/index.js");
  await actions.mutate((s) => deal(s));
  assert.equal(state.tableState.status, "playing");
  assert.equal(state.tableState.hand.hands[0].length, 7);
  await actions.mutate((s) => { throw Object.assign(new Error("x"), { code: "permission-denied" }); });
  assert.equal(state.view.err, "No hay permiso para guardar en esta mesa.");
  actions.leave();
  assert.equal(state.unsubTable, null);
});

test("en línea: la lista del lobby se redibuja sola, sin redibujar todo", async () => {
  const fb = fakeFirebase(); globalThis.firebase = fb.firebase;
  await actions.start();
  renders = [];
  await fb.fs.doc("mesas/ZZZZ").set({ json: JSON.stringify({ code: "ZZZZ", seats: [null, null], config: { n: 2 }, status: "lobby" }), code: "ZZZZ", created: 5 });
  assert.deepEqual(renders, ["list"]);
  assert.equal(state.listCache[0].code, "ZZZZ");
});

test("entrar con Google: el jugador es el mismo en cualquier teléfono, y toma el nombre si no tenía", async () => {
  const fb = fakeFirebase(); globalThis.firebase = fb.firebase;
  await actions.start();
  renders = [];
  await actions.googleIn();
  await flush();
  assert.equal(state.me.id, "g_g1");
  assert.equal(state.me.name, "Memo");
  assert.deepEqual(renders, ["all"]); // en el lobby, se redibuja al cambiar de usuario
  await actions.googleOut();
});

test("entrar con Google: errores con mensaje claro, y cerrar la ventana no es error", async () => {
  globalThis.firebase = fakeFirebase({ popup: "auth/unauthorized-domain" }).firebase;
  await actions.googleIn();
  assert.equal(state.view.err, "Este sitio aún no está autorizado en Firebase (Authorized domains).");
  state.view.err = "";
  globalThis.firebase = fakeFirebase({ popup: "auth/popup-closed-by-user" }).firebase;
  await actions.googleIn();
  assert.equal(state.view.err, "");
});

test("el consejo se calcula para el turno en curso", async () => {
  const timers = mock.timers; timers.enable({ apis: ["setTimeout"] });
  try {
    state.config = { n: 2, teams: false, per: 14, timer: false };
    let tries = 0;
    do { actions.leave(); actions.startPractice(); } while (state.tableState.hand.turn !== 0 && ++tries < 50);
    actions.askAdvice(0);
    assert.equal(state.view.advice.data, null);
    timers.tick(50);
    const d = state.view.advice.data;
    assert.ok(d && !d.error);
    assert.equal(d.levels.length, 3);
  } finally { timers.reset(); }
});
