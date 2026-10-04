// Grabación de partidas (#25): de una mano terminada a un registro que se puede guardar, reproducir y exportar.
// Funciones puras: no saben de Firebase ni de localStorage (eso vive en app/recorder.js y services/).
//
// Un registro es UNA MANO terminada, con todo lo necesario para reproducirla y saber a qué partida pertenece.
// La partida completa se arma juntando sus manos (groupGames), que es el formato JSONL que usa el motor de
// lectura (#24): una partida por línea.

import { TARGET } from "./config.js";
import { play, draw, pass } from "./moves.js";

export const RECORD_VERSION = 1;

const finished = (st) => !!(st && st.hand && st.hand.start && st.result && (st.status === "handover" || st.status === "gameover"));

// Identificador del registro de la mano que acaba de terminar (o null si no hay una mano terminada que grabar)
export function handRecordId(st) {
  return finished(st) && st.gameId ? `${st.gameId}_${st.handNo}` : null;
}

// ctx: { mode: "online" | "practice", app: versión del juego, isBot(seat) opcional }
export function buildHandRecord(st, ctx = {}) {
  const id = handRecordId(st); if (!id) return null;
  const h = st.hand, r = st.result, c = st.config;
  const isBot = ctx.isBot || ((s) => !!(st.seats[s] && st.seats[s].bot));
  const players = st.seats.map((p, s) => {
    const bot = isBot(s);
    return { seat: s, name: (p && p.name) || null, id: (p && p.id) || null, bot, level: bot ? (p && p.level) || 1 : null };
  });
  let prevT = h.start.t;
  const events = (h.history || []).map((e) => {
    const t = e.t ?? null;
    const by = e.auto ? "auto" : players[e.s] && players[e.s].bot ? "bot" : "human";
    const ev = { t, ms: t !== null && prevT ? Math.max(0, t - prevT) : null, s: e.s, a: e.a, by };
    if (e.a === "play") { ev.tile = e.tile; ev.side = e.side; if (e.forced) ev.forced = true; }
    ev.ends = e.ends || null;
    if (t !== null) prevT = t;
    return ev;
  });
  return {
    v: RECORD_VERSION,
    id, gameId: st.gameId, hand: st.handNo,
    mode: ctx.mode || "online", app: ctx.app || null, code: st.code || null,
    config: { n: c.n, teams: !!c.teams, per: c.per, timer: c.timer !== false },
    target: ctx.target || TARGET,
    players,
    gameStart: st.gameStart || null, start: h.start.t || null, end: events.length ? events[events.length - 1].t : null,
    deal: { hands: h.start.hands, pozo: h.start.pozo, muestra: h.start.muestra ?? null, turn: h.start.turn, openers: h.start.openers, firstReq: h.start.firstReq ?? null },
    mano: h.mano ?? null,
    events,
    result: {
      type: r.type, seat: r.seat ?? null, winner: r.winner, add: r.add, sums: r.sums, hands: r.hands,
      scoresBefore: st.scores.map((v, i) => v - (r.add[i] || 0)), scores: st.scores,
      over: !!r.over, champion: r.over ? r.champion : null,
    },
  };
}

// Vuelve a jugar la mano desde el reparto, evento por evento, con las mismas reglas del juego.
// Devuelve el estado final; truena si algún evento no es válido (el registro no corresponde a una mano real).
export function replayHand(rec) {
  const hands = rec.deal.hands.map((x) => x.slice());
  const h = {
    hands, pozo: rec.deal.pozo.slice(), muestra: rec.deal.muestra, board: [], turn: rec.deal.turn, mano: null, passes: 0,
    openers: rec.deal.openers.slice(), firstReq: rec.deal.firstReq, drew: 0, lacks: hands.map(() => []), played: hands.map(() => []), history: [], since: 0,
  };
  const seats = rec.players.map((p) => (p.name ? { id: p.id, name: p.name } : null));
  let st = { code: rec.code, config: { ...rec.config }, seats, status: "playing", scores: rec.result.scoresBefore.slice(),
    handNo: rec.hand, hand: h, result: null, log: [], v: 0 };
  for (const e of rec.events) {
    if (st.status !== "playing") throw new Error("La mano ya había terminado");
    st = e.a === "play" ? play(st, e.s, e.tile, e.side) : e.a === "draw" ? draw(st, e.s) : pass(st, e.s);
  }
  if (st.status === "playing") throw new Error("La mano no terminó");
  return st;
}

// Junta los registros de mano en partidas (una por gameId, manos en orden). Una partida sin la mano que la cierra
// (o con manos faltantes) queda marcada como abandonada.
export function groupGames(records) {
  const byGame = new Map();
  for (const r of records) {
    if (!r || !r.gameId) continue;
    if (!byGame.has(r.gameId)) byGame.set(r.gameId, new Map());
    byGame.get(r.gameId).set(r.hand, r); // si hubiera duplicados, queda uno
  }
  const games = [];
  for (const [gameId, m] of byGame) {
    const hands = [...m.values()].sort((a, b) => a.hand - b.hand);
    const first = hands[0], last = hands[hands.length - 1];
    const complete = hands.every((r, i) => r.hand === i + 1);
    const over = !!last.result.over;
    games.push({
      v: RECORD_VERSION, gameId, mode: first.mode, app: first.app, config: first.config, target: first.target,
      players: first.players, start: first.gameStart || first.start, end: last.end,
      status: over && complete ? "finished" : "abandoned",
      scores: last.result.scores, champion: over ? last.result.champion : null,
      hands: hands.map(({ v, gameId: g, mode, app, config, target, players, gameStart, code, ...rest }) => rest),
    });
  }
  return games.sort((a, b) => (a.start || 0) - (b.start || 0));
}
