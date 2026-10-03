// Jugadores de la compu, deducción y consejo. Solo usan lo que el jugador puede saber.
// Código movido sin cambios desde index.html (fase 3 de #3).

import { teamOf, play, draw, pass } from "../engine/index.js";
import { botMove } from "./bots.js";
import { deduce } from "./deduce.js";
import { weightedAssigns } from "./speculate.js";
import { NOISE, TUNE } from "./tune.js";

export function sampleWorld(st, seat, ded, rnd = Math.random) {
  const h = st.hand;
  const unknown = Object.keys(ded.possible);
  const holders = h.hands.map((_, s) => s).filter((s) => s !== seat);
  if (h.pozo.length) holders.push("pozo");
  const cap0 = (id) => (id === "pozo" ? h.pozo.length : h.hands[id].length);
  for (let tries = 0; tries < 40; tries++) {
    const cap = {}; holders.forEach((id) => (cap[id] = cap0(id)));
    const out = {}; holders.forEach((id) => (out[id] = []));
    const order = unknown.slice().sort((x, y) => ded.possible[x].length - ded.possible[y].length || rnd() - 0.5);
    let ok = true;
    for (const t of order) {
      const opts = ded.possible[t].filter((id) => cap[id] > 0);
      if (!opts.length) { ok = false; break; }
      // elige proporcional al espacio que le queda a cada quien
      const tot = opts.reduce((q, id) => q + cap[id], 0); let r = rnd() * tot, pickId = opts[0];
      for (const id of opts) { r -= cap[id]; if (r <= 0) { pickId = id; break; } }
      out[pickId].push(t); cap[pickId]--;
    }
    if (!ok) continue;
    const w = structuredClone(st);
    holders.forEach((id) => { if (id === "pozo") w.hand.pozo = out[id].sort(() => rnd() - 0.5); else w.hand.hands[id] = out[id]; });
    return w;
  }
  return null;
}
// Juega la mano hasta el final (todos con nivel intermedio) y dice qué tan bien le fue a "seat"
export function rollout(w, seat) { return rolloutFull(w, seat).v; }
export function rolloutFull(w, seat) {
  let cur = w; const prev = NOISE.on; NOISE.on = false;
  for (let g = 0; g < 200 && cur.status === "playing"; g++) {
    const hh = cur.hand, s = hh.turn === null ? hh.openers[0] : hh.turn;
    const m = botMove(cur, s, 2);
    cur = m.type === "play" ? play(cur, s, m.tile, m.side) : m.type === "draw" ? draw(cur, s) : pass(cur, s);
  }
  NOISE.on = prev;
  const r = cur.result; if (!r) return { v: 0, win: false };
  const mine = teamOf(cur, seat);
  let v = 0; r.add.forEach((x, i) => { v += i === mine ? -x : x / Math.max(1, r.add.length - 1); });
  const win = r.winner === mine || (!cur.config.teams && r.winner === seat);
  if (win) v += 15;
  return { v, win };
}
// Parte del tiro del intermedio y solo lo cambia si la simulación muestra con claridad que otro es mejor
// Mundos para simular: si TUNE.infer, se generan más repartos y se escogen según qué tan bien explican lo jugado
export function worldsFor(st, seat, ded, samples, infer = TUNE.infer) {
  if (!infer) { const ws = []; for (let k = 0; k < samples; k++) { const w = sampleWorld(st, seat, ded); if (w) ws.push(w); } return ws; }
  const { list } = weightedAssigns(st, seat, samples * TUNE.overs, ded);
  if (!list.length) return [];
  const ws = []; let acc = 0, u = Math.random() / samples, j = 0;
  for (let k = 0; k < samples; k++) {
    const target = u + k / samples;
    while (j < list.length - 1 && acc + list[j].w < target) { acc += list[j].w; j++; }
    const w = structuredClone(st), asg = list[j].asg;
    for (const id of Object.keys(asg)) { if (id === "pozo") w.hand.pozo = asg[id].slice().sort(() => Math.random() - 0.5); else w.hand.hands[id] = asg[id].slice(); }
    ws.push(w);
  }
  return ws;
}
export function monteCarloMove(st, seat, lp, samples, base, infer) {
  const ded = deduce(st, seat), vals = lp.map(() => []);
  for (const w of worldsFor(st, seat, ded, samples, infer)) {
    lp.forEach((p, i) => { vals[i].push(rollout(play(w, seat, p.tile, p.side), seat)); });
  }
  const bi = lp.findIndex((p) => p.tile === base.tile && p.side === base.side);
  if (bi < 0 || vals[bi].length < 4) return base;
  let best = base, bestLead = 0;
  lp.forEach((p, i) => {
    if (i === bi) return;
    const d = vals[i].map((v, k) => v - vals[bi][k]), m = d.reduce((q, v) => q + v, 0) / d.length;
    const sd = Math.sqrt(d.reduce((q, v) => q + (v - m) ** 2, 0) / Math.max(1, d.length - 1)), se = sd / Math.sqrt(d.length);
    const lead = m - TUNE.z * se;
    if (lead > bestLead) { bestLead = lead; best = p; }
  });
  return best;
}
