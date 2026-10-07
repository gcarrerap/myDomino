// Jugadores de la compu, deducción y consejo. Solo usan lo que el jugador puede saber.
// Código movido sin cambios desde index.html (fase 3 de #3).

import { T, P, fullSet } from "../engine/index.js";

// Registro: fichas que un jugador todavía puede tener, desde la vista de "viewer"
// Deducción cruzada: para cada ficha desconocida, ¿quién la puede tener de verdad?
// Reparte las fichas desconocidas entre los jugadores (y el pozo) respetando cuántas tiene cada uno
// y los números que le faltan; una ficha solo puede estar con quien deje un reparto completo posible.
export function deduce(st, viewer) {
  const h = st.hand;
  const known = new Set([...(viewer >= 0 ? h.hands[viewer] : []), ...h.board.map(([a, b]) => T(a, b))]);
  if (h.muestra) known.add(h.muestra);
  const unknown = fullSet().filter((t) => !known.has(t));
  const holders = [];
  h.hands.forEach((hh, s) => {
    if (s === viewer) return;
    holders.push({ id: s, cap: hh.length, lacks: (h.lacks && h.lacks[s]) || [] });
  });
  if (h.pozo.length) holders.push({ id: "pozo", cap: h.pozo.length, lacks: [] });
  return { known, possible: possibleHolders(unknown, holders) };
}

// Núcleo de la deducción: reparte las fichas desconocidas entre quienes pueden tenerlas.
// holders: [{ id, cap: cuántas fichas tiene, lacks: números que seguro no tiene }]. La suma de cap debe ser igual al
// número de fichas desconocidas. Devuelve { ficha: [ids que de verdad pueden tenerla] }: una ficha solo puede estar
// con quien deje un reparto completo posible (emparejamiento bipartito con capacidades).
export function possibleHolders(unknown, holders) {
  const okFor = holders.map((H) => (t) => { const [x, y] = P(t); return !H.lacks.includes(x) && !H.lacks.includes(y); });
  const feasible = (tiles, caps) => {
    const slots = []; holders.forEach((H, i) => { for (let k = 0; k < caps[i]; k++) slots.push(i); });
    if (slots.length !== tiles.length) return false;
    const owner = Array(slots.length).fill(-1);
    const tryT = (ti, seen) => {
      for (let j = 0; j < slots.length; j++) {
        if (seen[j] || !okFor[slots[j]](tiles[ti])) continue;
        seen[j] = true;
        if (owner[j] < 0 || tryT(owner[j], seen)) { owner[j] = ti; return true; }
      }
      return false;
    };
    for (let ti = 0; ti < tiles.length; ti++) if (!tryT(ti, Array(slots.length).fill(false))) return false;
    return true;
  };
  const caps = holders.map((H) => H.cap);
  const possible = {};
  for (const t of unknown) {
    possible[t] = [];
    const rest = unknown.filter((x) => x !== t);
    holders.forEach((H, i) => {
      if (!okFor[i](t) || caps[i] === 0) return;
      const c2 = caps.slice(); c2[i]--;
      if (feasible(rest, c2)) possible[t].push(H.id);
    });
  }
  return possible;
}

// Registro: fichas que un jugador todavía puede tener, desde la vista de "viewer"
export function tracker(st, viewer, target) {
  const h = st.hand; if (!h) return null;
  const { known, possible } = deduce(st, viewer);
  const lacks = (h.lacks && h.lacks[target]) || [];
  const played = (h.played && h.played[target]) || [];
  const rows = [];
  for (let a = 6; a >= 0; a--) {
    const row = [];
    for (let b = a; b >= 0; b--) {
      const t = T(a, b);
      let state;
      if (played.includes(t)) state = "played";
      else if (known.has(t)) state = "gone";
      else {
        const p = possible[t] || [];
        state = !p.includes(target) ? "no" : p.length === 1 ? "sure" : "maybe";
      }
      row.push({ t, state });
    }
    rows.push(row);
  }
  const flat = rows.flat();
  const sure = flat.filter((x) => x.state === "sure").map((x) => x.t);
  const maybe = flat.filter((x) => x.state === "maybe").length;
  return { rows, lacks, sure, maybe, played, count: h.hands[target].length };
}

// Reparte al azar las fichas que no ve, respetando su registro. Devuelve {jugador|"pozo": [fichas]}.
export function sampleAssign(st, seat, ded, rnd = Math.random) {
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
      const tot = opts.reduce((q, id) => q + cap[id], 0); let r = rnd() * tot, pickId = opts[0];
      for (const id of opts) { r -= cap[id]; if (r <= 0) { pickId = id; break; } }
      out[pickId].push(t); cap[pickId]--;
    }
    if (ok) return out;
  }
  return null;
}
