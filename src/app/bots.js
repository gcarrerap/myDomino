// La compu: decide y juega con un pequeño retraso, como una persona. En práctica, todos los asientos menos el tuyo;
// en una mesa en línea, los asientos marcados como compu (seat.bot).
// En línea no hay servidor: mueve a la compu el teléfono del jugador humano sentado en el asiento más bajo; los demás
// humanos sentados son respaldo y esperan BACKUP_MS más por si ese teléfono no está. Cada jugada se guarda con una
// transacción que solo aplica si sigue siendo el mismo turno, así nunca cuentan dos jugadas para un turno.
import { legalPlays, play, draw, pass, limitMs } from "../engine/index.js";
import { openingPlan } from "../ai/index.js";
import { SKIP, updateTable } from "../services/index.js";
import { state, notify, timerOn, turnKey, mySeat } from "./store.js";
import { runAI } from "./ai-client.js";

export const BOT_NAMES = ["Lupe", "Toño", "Chuy"];
export const BACKUP_MS = 4000;

// ¿Ese asiento lo juega la compu?
export function isBotSeat(st, s) {
  if (state.view.practice) return s !== 0;
  return !!(st.seats[s] && st.seats[s].bot);
}
// Qué papel tiene este teléfono para mover a la compu: "primary", "backup" o null (no la mueve)
export function botRole(st) {
  if (state.view.practice) return "primary";
  const me = mySeat(st); if (me < 0) return null; // solo mirando: no mueve
  const humans = st.seats.map((s, i) => (s && !s.bot ? i : -1)).filter((i) => i >= 0);
  return humans[0] === me ? "primary" : "backup";
}

// Quién de la compu actúa ahora. Al salir en parejas, cada compu revisa su juego: los primeros 5 s son para
// pensar y luego sale según qué tan bueno es (juego 10/10 a los 5 s, 5/10 a los 10 s, 0/10 a los 15 s),
// siempre antes de que se acabe el tiempo. Si un humano sale antes, ya no sale. Entre dos compus sale la que se decide primero.
export function openDelayMs(st, plan) {
  let target = (15 - plan.rating) * 1000;
  if (timerOn(st)) target = Math.min(target, limitMs(st.hand) - 1000);
  return Math.max(0, target - (Date.now() - st.hand.since));
}
export function botActor(st) {
  if (!st || st.status !== "playing") return null;
  const h = st.hand;
  if (h.turn !== null) return isBotSeat(st, h.turn) ? { seat: h.turn } : null;
  if (h.board.length) return null;
  const cands = h.openers.filter((s) => isBotSeat(st, s)).map((s) => { const plan = openingPlan(h.hands[s]); return { seat: s, tile: plan.tile, delay: openDelayMs(st, plan) }; });
  cands.sort((x, y) => x.delay - y.delay);
  return cands[0] || null;
}

// Programa la siguiente jugada de la compu, si le toca a alguna. Se llama cada vez que se dibuja la mesa.
// La jugada se calcula en un hilo aparte (ai-client.js). Mientras piensa, state.botTimer sigue ocupado para que no
// se programe otra; si sales de la mesa (leave lo limpia) o la mesa cambia mientras tanto, el resultado se descarta.
export function scheduleBot() {
  const st0 = state.tableState;
  if (!st0 || state.botTimer) return;
  if (!state.view.practice && !(st0.seats && st0.seats.some((s) => s && s.bot))) return;
  const role = botRole(st0); if (!role) return;
  const act = botActor(st0); if (!act) return;
  const key = turnKey(st0);
  const wait = act.delay !== undefined ? act.delay + 30 : (st0.hand.drew ? 450 : 850);
  const id = setTimeout(async () => {
    if (state.botTimer !== id) return; // se canceló
    const st = state.tableState;
    if (turnKey(st) !== key) { state.botTimer = null; scheduleBot(); return; } // cambió la mesa mientras esperaba: vuelve a decidir
    const a = botActor(st); if (!a || !botRole(st)) { state.botTimer = null; return; }
    if (a.delay > 50) { state.botTimer = null; scheduleBot(); return; } // todavía no le toca decidir
    let decide; // del estado de la mesa al siguiente, con la jugada de la compu
    if (a.tile && legalPlays(st, a.seat).some((p) => p.tile === a.tile)) {
      decide = (s) => play(s, a.seat, a.tile, "X");
    } else {
      let m;
      try { m = await runAI("botMove", st, a.seat, (st.seats[a.seat] && st.seats[a.seat].level) || 1); }
      catch (e) { console.warn("La compu no pudo decidir:", e); m = null; }
      if (state.botTimer !== id) return; // saliste de la mesa mientras pensaba
      if (!m) { state.botTimer = null; return; }
      decide = (s) => (m.type === "play" ? play(s, a.seat, m.tile, m.side) : m.type === "draw" ? draw(s, a.seat) : pass(s, a.seat));
    }
    if (state.view.practice) {
      if (state.tableState !== st) { state.botTimer = null; scheduleBot(); return; } // la mesa cambió mientras pensaba
      state.botTimer = null;
      state.tableState = decide(st);
      notify();
      return;
    }
    // En línea: se guarda solo si sigue siendo el mismo turno (otro teléfono pudo adelantarse)
    try { await updateTable(state.db, state.view.code, (s) => (turnKey(s) === key ? decide(s) : SKIP)); }
    catch (e) { console.warn("No se pudo guardar la jugada de la compu:", e); }
    if (state.botTimer === id) { state.botTimer = null; scheduleBot(); }
  }, role === "backup" ? wait + BACKUP_MS : wait);
  state.botTimer = id;
}
