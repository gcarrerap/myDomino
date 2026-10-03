// Jugadores simulados en modo práctica: deciden y juegan con un pequeño retraso, como una persona.
import { legalPlays, play, draw, pass, limitMs } from "../engine/index.js";
import { openingPlan } from "../ai/index.js";
import { state, notify, timerOn, turnKey } from "./store.js";
import { runAI } from "./ai-client.js";

export const BOT_NAMES = ["Lupe", "Toño", "Chuy"];

// Quién de la compu actúa ahora. Al salir en parejas, cada compu revisa su juego: los primeros 5 s son para
// pensar y luego sale según qué tan bueno es (juego 10/10 a los 5 s, 5/10 a los 10 s, 0/10 a los 15 s),
// siempre antes de que se acabe el tiempo. Si yo salgo antes, ya no sale. Entre dos compus sale la que se decide primero.
export function openDelayMs(st, plan) {
  let target = (15 - plan.rating) * 1000;
  if (timerOn(st)) target = Math.min(target, limitMs(st.hand) - 1000);
  return Math.max(0, target - (Date.now() - st.hand.since));
}
export function botActor(st) {
  if (!st || st.status !== "playing") return null;
  const h = st.hand;
  if (h.turn !== null) return h.turn === 0 ? null : { seat: h.turn };
  if (h.board.length) return null;
  const cands = h.openers.filter((s) => s !== 0).map((s) => { const plan = openingPlan(h.hands[s]); return { seat: s, tile: plan.tile, delay: openDelayMs(st, plan) }; });
  cands.sort((x, y) => x.delay - y.delay);
  return cands[0] || null;
}
// Programa la siguiente jugada de la compu, si le toca a alguna. Se llama cada vez que se dibuja la mesa.
// La jugada se calcula en un hilo aparte (ai-client.js). Mientras piensa, state.botTimer sigue ocupado para que no
// se programe otra; si sales de la mesa (leave lo limpia) o la mesa cambia mientras tanto, el resultado se descarta.
export function scheduleBot() {
  if (!state.view.practice || state.botTimer) return;
  const act = botActor(state.tableState); if (!act) return;
  const key = turnKey(state.tableState);
  const id = setTimeout(async () => {
    if (state.botTimer !== id) return; // se canceló
    const st = state.tableState;
    if (turnKey(st) !== key) { state.botTimer = null; scheduleBot(); return; } // cambió la mesa mientras esperaba: vuelve a decidir
    const a = botActor(st); if (!state.view.practice || !a) { state.botTimer = null; return; }
    if (a.delay > 50) { state.botTimer = null; scheduleBot(); return; } // todavía no le toca decidir
    let next;
    if (a.tile && legalPlays(st, a.seat).some((p) => p.tile === a.tile)) {
      next = play(st, a.seat, a.tile, "X");
    } else {
      let m;
      try { m = await runAI("botMove", st, a.seat, (st.seats[a.seat] && st.seats[a.seat].level) || 1); }
      catch (e) { console.warn("La compu no pudo decidir:", e); m = null; }
      if (state.botTimer !== id) return; // saliste de la mesa mientras pensaba
      if (state.tableState !== st) { state.botTimer = null; scheduleBot(); return; } // la mesa cambió mientras pensaba
      if (!m) { state.botTimer = null; return; }
      next = m.type === "play" ? play(st, a.seat, m.tile, m.side) : m.type === "draw" ? draw(st, a.seat) : pass(st, a.seat);
    }
    state.botTimer = null;
    state.tableState = next;
    notify();
  }, act.delay !== undefined ? act.delay + 30 : (state.tableState.hand.drew ? 450 : 850));
  state.botTimer = id;
}
