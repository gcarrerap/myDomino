// Casos de uso: todo lo que cambia el estado de la app. Cada acción deja el estado listo y llama a notify();
// la interfaz solo dibuja y traduce clics en estas acciones.
import { newTable, deal, pts } from "../engine/index.js";
import { ls, initFirebase, signInWithGoogle, signOut, SKIP, makeDb, watchTableList, watchTable, saveNewTable, updateTable } from "../services/index.js";
import { state, notify, isGoogle, turnKey, mySeat, normBot, botSeatFields } from "./store.js";
import { BOT_NAMES } from "./bots.js";
import { runAI } from "./ai-client.js";
import { cleanupInactiveTables, CLEANUP_EVERY_MS } from "./cleanup.js";

// ---------- Sesión ----------
function applyUser(u) {
  state.authUser = u;
  state.me.id = isGoogle() ? "g_" + u.uid : state.deviceId;
  if (isGoogle() && !state.me.name && u.displayName) { state.me.name = u.displayName.split(" ")[0].slice(0, 16); ls.set("dom.name", state.me.name); }
}
// Conecta con Firebase (o se queda sin conexión, solo práctica) y empieza a escuchar la lista de mesas
export async function start() {
  try {
    state.db = makeDb(await initFirebase((u, first) => { applyUser(u); if (!first && state.view.screen === "lobby") notify(); }));
  } catch (e) { console.warn("Firebase no disponible:", e); state.db = null; }
  state.dbTried = true; notify();
  if (state.db) subscribeList();
}
export async function googleIn() {
  try { await signInWithGoogle(); }
  catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") { state.view.err = e.code === "auth/unauthorized-domain" ? "Este sitio aún no está autorizado en Firebase (Authorized domains)." : "No se pudo entrar con Google."; notify(); }
  }
}
export const googleOut = signOut;

function subscribeList() {
  if (!state.db || state.unsubList) return;
  state.unsubList = watchTableList(state.db, (list, updated) => {
    state.listCache = list; state.listUpdated = updated;
    cleanupInactiveTables();
    if (state.view.screen === "lobby") notify("list");
  }, () => { state.unsubList = null; });
  // Las mesas que se quedan vacías no vuelven a cambiar: se revisan cada minuto, no solo cuando cambia la lista
  if (!cleanupTimer) { cleanupTimer = setInterval(() => cleanupInactiveTables(), CLEANUP_EVERY_MS); cleanupTimer.unref?.(); } // unref: en Node (pruebas) no detiene la salida
}
let cleanupTimer = null;

// ---------- Mesas ----------
export function openTable(code) {
  state.view = { screen: "table", code, practice: false, sel: null, err: "" };
  if (state.unsubTable) state.unsubTable();
  state.tableState = null; notify();
  state.unsubTable = watchTable(state.db, code, (st) => {
    state.tableState = st;
    if (!st) { state.view.err = "Esta mesa ya no existe."; }
    notify();
  }, (e) => { state.view.err = "Se perdió la conexión con la mesa. Vuelve a abrirla."; notify(); });
}

// Aplica un cambio a la mesa: en práctica, al estado local; en línea, con una transacción (lee lo último, valida y guarda)
export async function mutate(fn) {
  const view = state.view;
  view.err = "";
  if (view.practice) {
    try { const nx = fn(structuredClone(state.tableState)); if (nx !== SKIP) state.tableState = nx; } catch (e) { view.err = e.message; }
    view.sel = null; notify(); return;
  }
  try {
    const skipped = await updateTable(state.db, view.code, fn);
    if (skipped) { notify(); return; }
  } catch (e) {
    view.err = e.code === "permission-denied" ? "No hay permiso para guardar en esta mesa." : (e.message || "Algo falló, intenta otra vez.");
  }
  view.sel = null; notify();
}

// La interfaz pide el nombre antes de llamar (needName)
export async function createTable() {
  if (!state.db) return;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  const st = newTable(code, { ...state.config }, state.me.id);
  st.seats[0] = { id: state.me.id, name: state.me.name };
  try { await saveNewTable(state.db, st); openTable(code); }
  catch (e) { state.view.err = e.code === "permission-denied" ? "No hay permiso para crear mesas." : e.code === "resource-exhausted" ? "Se alcanzó el límite gratis de hoy. Intenta mañana." : "No se pudo crear la mesa."; notify(); }
}

// ---------- La compu en mesas en línea (antes de repartir) ----------
// Cualquier jugador sentado puede agregarla, quitarla o cambiarle el nivel. La mueve el teléfono de una persona
// sentada (ver bots.js), por eso para repartir hace falta al menos una persona.
function botName(seats) {
  const used = new Set(seats.filter(Boolean).map((s) => s.name));
  return BOT_NAMES.find((n) => !used.has(n)) || `Compu ${seats.filter((s) => s && s.bot).length + 1}`;
}
function editSeats(fn) {
  return mutate((s) => {
    if (s.status !== "lobby") throw new Error("La partida ya empezó.");
    if (mySeat(s) < 0) throw new Error("Siéntate primero.");
    fn(s); s.v++; return s;
  });
}
// bot: id de perfil ("b07") o nivel de antes (1-3)
export function addBot(i, bot = "b02") {
  return editSeats((s) => { if (s.seats[i]) throw new Error("Ese asiento ya lo tomaron."); s.seats[i] = { id: "bot" + i, name: botName(s.seats), ...botSeatFields(bot), bot: true }; });
}
export function removeBot(i) {
  return editSeats((s) => { if (!(s.seats[i] && s.seats[i].bot)) throw new Error("En ese asiento no está la compu."); s.seats[i] = null; });
}
export function setOnlineBotProfile(i, bot) {
  return editSeats((s) => { if (!(s.seats[i] && s.seats[i].bot)) throw new Error("En ese asiento no está la compu."); s.seats[i] = { ...s.seats[i], ...botSeatFields(bot) }; });
}
export const hasPerson = (st) => st.seats.some((s) => s && !s.bot);

export function startPractice() {
  let st = newTable("PRÁCTICA", { ...state.config }, state.me.id);
  st.seats = st.seats.map((_, i) => (i === 0 ? { id: state.me.id, name: state.me.name || "Tú" } : { id: "bot" + i, name: BOT_NAMES[i - 1], ...botSeatFields(state.botLevels[i - 1]) }));
  st = deal(st);
  state.view = { screen: "table", code: st.code, practice: true, sel: null, err: "", track: null };
  state.tableState = st; notify();
}

export function leave() {
  clearTimeout(state.botTimer); state.botTimer = null; state.view.track = null;
  if (state.unsubTable) { state.unsubTable(); state.unsubTable = null; }
  state.tableState = null; state.view = { screen: "lobby", code: null, practice: false, sel: null, err: "" };
  notify();
}

// ---------- Vista ----------
// Cambia lo que se ve (menú, selección, registro abierto…) y vuelve a dibujar. Con redraw = false no redibuja:
// para cuando la interfaz ya está dibujando, o redibuja solo una parte (el registro, para no perder el scroll).
export function setView(patch, redraw = true) { Object.assign(state.view, patch); if (redraw) notify(); }
export function setError(msg) { state.view.err = msg; notify(); }
// La interfaz avisa que está arrastrando una ficha de tu mano (mientras tanto no se redibuja)
export function setDragging(on) { state.dragging = on; }

// ---------- Preferencias ----------
export function setName(name) { state.me.name = name.trim(); ls.set("dom.name", state.me.name); } // sin redibujar: se está escribiendo
export function setPlayers(n) { state.config = { n, teams: n === 4, per: n === 2 ? 7 : n === 3 ? 9 : 7, timer: state.config.timer }; notify(); }
export function setTimer(on) { state.config.timer = on; ls.set("dom.timer", on ? "1" : "0"); notify(); }
export function setTeams(on) { state.config.teams = on; notify(); }
export function setPer(per) { state.config.per = per; notify(); }
const saveLevels = () => ls.set("dom.botLevels", JSON.stringify(state.botLevels));
// Bot de la compu i (0-2) para las siguientes prácticas
export function setBotProfile(i, bot) { state.botLevels[i] = normBot(bot); saveLevels(); notify(); }
// Bot de la compu sentada en el asiento seat de la práctica en curso (y para las siguientes)
export function setSeatProfile(seat, bot) {
  state.tableState.seats[seat] = { ...state.tableState.seats[seat], ...botSeatFields(bot) };
  if (seat >= 1 && seat <= 3) { state.botLevels[seat - 1] = normBot(bot); saveLevels(); }
  notify();
}

// ---------- Tu mano: orden y giro que tú escoges (solo en este teléfono) ----------
export function handArrangement(st, seat) {
  const key = `${st.code}|${st.created}|${st.handNo}|${seat}`, hand = st.hand.hands[seat];
  if (state.arr.key !== key) state.arr = { key, order: hand.slice().sort((x, y) => pts(y) - pts(x)), flip: {} };
  const arr = state.arr;
  const keep = arr.order.filter((t) => hand.includes(t));
  const added = hand.filter((t) => !keep.includes(t)); // fichas que comiste: van al final
  arr.order = [...keep, ...added];
  return arr.order;
}
const saveArr = () => ls.set("dom.arr", JSON.stringify(state.arr));
export function flipTile(t) { state.arr.flip[t] = !state.arr.flip[t]; saveArr(); notify(); }
export function setHandOrder(order) { state.arr.order = order; saveArr(); notify(); }

// ---------- Notas del registro (solo en este teléfono) ----------
// Sin redibujar: la interfaz redibuja solo el registro para no perder la posición del scroll
export function setNote(key, val) {
  if (val) state.notes[key] = val; else delete state.notes[key];
  ls.set("dom.notes", JSON.stringify(state.notes));
}

// ---------- Consejo: qué tirarían los tres niveles ----------
export function askAdvice(seat) {
  const st = state.tableState; if (!st) return;
  const key = turnKey(st);
  state.view.track = null; state.view.advice = { key, data: null }; notify();
  // Se calcula en un hilo aparte: mientras tanto se ve "Pensando…" y el reloj sigue corriendo
  runAI("advise", st, seat).then((data) => data, () => ({ error: true })).then((data) => {
    const view = state.view;
    if (!view.advice || view.advice.key !== key || turnKey(state.tableState) !== key) return; // ya cambió el turno o lo cerraste
    view.advice.data = data;
    notify();
  });
}
