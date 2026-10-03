// Estado de la app: un solo objeto, dueño de todo lo que antes eran variables globales de index.html.
// Las acciones (actions.js, practice.js, clock.js) lo cambian y llaman a notify(); la interfaz se suscribe
// con subscribe() y vuelve a dibujar. Los valores iniciales se leen de las preferencias del dispositivo.
import { ls } from "../services/index.js";
import { speculate } from "../ai/index.js";

const deviceId = ls.get("dom.dev") || ("d" + Math.random().toString(36).slice(2, 10));
ls.set("dom.dev", deviceId);

function loadBotLevels() {
  let botLevels = [2, 2, 2];
  try { const bl = JSON.parse(ls.get("dom.botLevels") || "null"); if (Array.isArray(bl) && bl.length === 3) botLevels = bl.map((x) => Math.min(3, Math.max(1, +x || 2))); } catch {}
  return botLevels;
}
function loadArrangement() {
  let arr = { key: null, order: [], flip: {} };
  try { const sv = JSON.parse(ls.get("dom.arr") || "null"); if (sv && sv.key) arr = sv; } catch {}
  return arr;
}
function loadNotes() {
  try { return JSON.parse(ls.get("dom.notes") || "{}") || {}; } catch { return {}; }
}

export const state = {
  deviceId,
  me: { id: deviceId, name: ls.get("dom.name") || "" }, // id cambia a "g_<uid>" si entra con Google
  authUser: null,
  db: null, dbTried: false, // Firestore (adaptador) y si ya se intentó conectar
  // Pantalla: lobby o mesa, y lo que se ve en la mesa (selección, menú, registro abierto, consejo…)
  view: { screen: "lobby", code: null, practice: false, sel: null, err: "" },
  tableState: null, // la mesa abierta (en línea o de práctica)
  listCache: [], // mesas abiertas en el lobby
  unsubTable: null, unsubList: null,
  config: { n: 4, teams: true, per: 7, timer: ls.get("dom.timer") !== "0" }, // modo para la siguiente mesa
  botLevels: loadBotLevels(), // nivel de cada compu en práctica
  arr: loadArrangement(), // orden y giro de tu mano (solo en este teléfono)
  notes: loadNotes(), // tus notas del registro (solo en este teléfono)
  clock: { key: null, start: 0, fired: false }, // reloj del turno, medido desde que este teléfono vio el turno
  specCache: { key: null, viewer: null, data: null },
  botTimer: null,
  dragging: false, // la interfaz está arrastrando una ficha de tu mano: no redibujar
};

// ---------- Suscripción ----------
// what: "list" cuando solo cambió la lista de mesas del lobby; undefined para todo lo demás
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify(what) { for (const fn of listeners) fn(what); }

// ---------- Derivados ----------
export const isGoogle = () => !!(state.authUser && !state.authUser.isAnonymous);
export const timerOn = (st) => st && st.config && st.config.timer !== false; // mesas viejas: con tiempo
// "Ver manos": solo para evaluar la especulación en práctica. Solo cambia lo que TÚ ves; la compu nunca ve fichas ajenas.
export const canReveal = () => state.view.practice;
export function mySeat(st) {
  if (!st) return -1;
  if (state.view.practice) return 0;
  return st.seats.findIndex((s) => s && s.id === state.me.id);
}
export function turnKey(st) {
  if (!st || st.status !== "playing") return null;
  const h = st.hand; return `${st.code}|${st.created}|${st.handNo}|${h.since}|${h.turn}|${h.board.length}`;
}
// Especulación cacheada por turno y por quien mira (es un cálculo de unas décimas de segundo)
export function specFor(st, viewer) {
  const key = turnKey(st) + "|" + (st.hand && st.hand.history ? st.hand.history.length : 0);
  const c = state.specCache;
  if (c.key !== key || c.viewer !== viewer) state.specCache = { key, viewer, data: speculate(st, viewer) };
  return state.specCache.data;
}
export const noteKey = (st, target, t) => `${st.code}|${st.created}|${st.handNo}|${target}|${t}`;
