// Jugadores de la compu, deducción y consejo. Solo usan lo que el jugador puede saber.
// Código movido sin cambios desde index.html (fase 3 de #3).

import { T, P, pts, sumHand, fullSet, nameOf, ends, legalPlays, canDraw, canPass, play } from "../engine/index.js";
import { botMove } from "./bots.js";
import { deduce } from "./deduce.js";
import { newEnds, has } from "./heuristics.js";
import { rolloutFull, worldsFor } from "./search.js";
import { TUNE } from "./tune.js";

// ===== Consejo: qué tirarían los tres niveles y por qué (solo con lo que "seat" puede saber) =====
export function advise(st, seat) {
  const h = st.hand, lp = legalPlays(st, seat);
  if (!lp.length) {
    const act = canDraw(st, seat) ? "draw" : canPass(st, seat) ? "pass" : null;
    return { none: true, action: act };
  }
  const c = st.config, n = c.n, my = h.hands[seat];
  const nm = (s) => nameOf(st, s);
  const friend = (s) => s === seat || (c.teams && s % 2 === seat % 2);
  const order = []; for (let k = 1; k < n; k++) order.push((seat + k) % n);
  const known = new Set([...my, ...h.board.map(([a, b]) => T(a, b))]); if (h.muestra) known.add(h.muestra);
  const unknown = fullSet().filter((t) => !known.has(t));
  const avgPts = unknown.length ? unknown.reduce((q, t) => q + pts(t), 0) / unknown.length : 0;
  const unseen = (num) => unknown.filter((t) => has(t, num)).length;
  const partner = c.teams ? (seat + 2) % 4 : -1;
  const partnerNums = new Set(partner >= 0 && h.played ? h.played[partner].flatMap(P) : []);
  const ded = deduce(st, seat);
  const cap = (id) => (id === "pozo" ? h.pozo.length : h.hands[id].length);
  const share = (t, s) => { const pos = ded.possible[t] || []; if (!pos.includes(s)) return 0; const tot = pos.reduce((q, id) => q + cap(id), 0); return tot ? cap(s) / tot : 0; };
  const [L, R] = h.board.length ? ends(h) : [null, null];
  const sideTxt = (p) => {
    if (p.side === "X") return "para salir";
    const here = p.side === "L" ? L : R, other = p.side === "L" ? R : L;
    const both = lp.some((q) => q.tile === p.tile && q.side !== p.side);
    return `del lado del ${here}` + (both ? ` (también cabe del lado del ${other}, pero aquí es mejor)` : "");
  };
  const fact = (p) => {
    const [a, b] = P(p.tile), rest = my.filter((t) => t !== p.tile), ne = newEnds(h, p), nums = [...new Set(ne)];
    const myCnt = (num) => rest.filter((t) => has(t, num)).length;
    return { a, b, rest, ne, nums, myCnt, dbl: a === b, pts: a + b };
  };
  const pl = (k, w1, w2) => (k === 1 ? w1 : w2);
  const endsTxt = (nums) => (nums.length === 1 ? `el ${nums[0]} en las dos puntas` : `las puntas ${nums[0]} y ${nums[1]}`);

  // Básico
  const why1 = (p) => {
    const f = fact(p), out = [];
    if (!f.rest.length) return ["Es tu última ficha: con esta dominas."];
    if (f.dbl) out.push("Es mula: te la quitas antes de que se te quede.");
    out.push(`Vale ${f.pts} puntos: se quita lo más pesado por si pierdes la mano.`);
    const m = f.rest.filter((t) => f.nums.some((num) => has(t, num))).length;
    out.push(m ? `Deja ${endsTxt(f.nums)}, y te quedan ${m} ${pl(m, "ficha que pega", "fichas que pegan")} ahí.` : `Deja ${endsTxt(f.nums)}; no te quedan fichas para esas puntas.`);
    return out;
  };
  // Intermedio
  const why2 = (p) => {
    const f = fact(p), out = [];
    if (!f.rest.length) return ["Es tu última ficha: con esta dominas."];
    const closes = f.nums.every((num) => unseen(num) === 0 && f.myCnt(num) === 0);
    if (closes) {
      const mine = sumHand(f.rest);
      if (c.teams) { const us = Math.round(mine + h.hands[partner].length * avgPts), them = Math.round(order.filter((s) => !friend(s)).reduce((q, s) => q + h.hands[s].length * avgPts, 0));
        out.push(us < them ? `Cierra el juego y calcula que tu pareja y tú tienen menos puntos (unos ${us} contra ${them}).` : `Cierra el juego aunque calcula que tienen más puntos (unos ${us} contra ${them}); no le quedaba mejor opción.`); }
      else out.push(`Cierra el juego: tú quedarías con ${mine} puntos.`);
      return out;
    }
    for (const num of f.nums) {
      const k = f.myCnt(num), u = unseen(num);
      if (k >= 2) out.push(`Te quedan ${k} fichas del ${num}: controlas esa punta.`);
      if (u === 0) out.push(`Fuera de tu mano ya no hay ningún ${num}: nadie más puede pegarle ahí.`);
      else if (u <= 2) out.push(`Del ${num} solo quedan ${u} ${pl(u, "ficha", "fichas")} fuera de tu mano: es probable que los rivales pasen.`);
    }
    const pn = f.nums.filter((num) => partnerNums.has(num));
    if (pn.length) out.push(`Sigue el ${pn.join(" y el ")} que ha jugado tu pareja.`);
    const dz = order.filter((s) => !friend(s) && h.hands[s].length <= 2);
    if (dz.length) out.push(`A ${dz.map(nm).join(" y a ")} le ${dz.length > 1 ? "quedan" : "queda"} poco: hay que taparle el juego.`);
    if (f.dbl) out.push("Además es mula: te la quitas.");
    else if (f.pts >= 9) out.push(`Además te quitas ${f.pts} puntos.`);
    if (!out.length) out.push(`Es la que deja ${endsTxt(f.nums)} con menos riesgo y te quita ${f.pts} puntos.`);
    return out;
  };
  // Avanzado (con detalle de la simulación)
  const b2m = botMove(st, seat, 2), b2 = lp.find((q) => q.tile === b2m.tile && q.side === b2m.side) || lp[0];
  let b3 = b2, sim = null;
  if (lp.length > 1) {
    const vals = lp.map(() => []), wins = lp.map(() => 0); let ns = 0;
    for (const w of worldsFor(st, seat, ded, TUNE.samples)) {
      ns++;
      lp.forEach((p, i) => { const r = rolloutFull(play(w, seat, p.tile, p.side), seat); vals[i].push(r.v); if (r.win) wins[i]++; });
    }
    const bi = lp.indexOf(b2);
    if (ns >= 4) {
      let bestLead = 0;
      lp.forEach((p, i) => {
        if (i === bi) return;
        const d = vals[i].map((v, k) => v - vals[bi][k]), m = d.reduce((q, v) => q + v, 0) / d.length;
        const sd = Math.sqrt(d.reduce((q, v) => q + (v - m) ** 2, 0) / Math.max(1, d.length - 1));
        const lead = m - TUNE.z * sd / Math.sqrt(d.length);
        if (lead > bestLead) { bestLead = lead; b3 = p; }
      });
      const i3 = lp.indexOf(b3), mean = (i) => vals[i].reduce((q, v) => q + v, 0) / vals[i].length;
      sim = { ns, win3: Math.round(100 * wins[i3] / ns), win2: Math.round(100 * wins[bi] / ns), gain: mean(i3) - mean(bi), same: i3 === bi };
    }
  }
  const why3 = (p) => {
    const f = fact(p), out = [];
    if (!f.rest.length) return ["Es tu última ficha: con esta dominas."];
    if (sim) {
      if (sim.same) out.push(`Probó tus ${lp.length} tiros posibles en ${sim.ns} repartos que cuadran con tu registro y con cómo ha tirado cada quien, y confirma el tiro del intermedio.`);
      else out.push(`Cambia el tiro del intermedio: en ${sim.ns} repartos que cuadran con tu registro y con cómo ha tirado cada quien, este salió en promedio ${sim.gain.toFixed(1)} puntos mejor por mano.`);
      out.push(`Ganas la mano en ${sim.win3}% de esas simulaciones` + (sim.same ? "." : ` (con el tiro del intermedio, ${sim.win2}%).`));
    }
    const nx = order[0];
    if (nx !== undefined && !friend(nx)) {
      const lk = (h.lacks && h.lacks[nx]) || [];
      const known = f.nums.filter((num) => lk.includes(num));
      if (known.length === f.nums.length) out.push(`${nm(nx)} va después y ya se sabe que no tiene ${f.nums.join(" ni ")}: le toca ${h.pozo.length ? "comer" : "pasar"}.`);
      else {
        const pNone = unknown.filter((t) => f.nums.some((num) => has(t, num))).reduce((q, t) => q * (1 - share(t, nx)), 1);
        out.push(`Según tu registro, hay como ${Math.round(100 * pNone)}% de probabilidad de que ${nm(nx)}, que tira después, no tenga ${f.nums.join(" ni ")}.`);
      }
    }
    if (partner >= 0) {
      const pHas = 1 - unknown.filter((t) => f.nums.some((num) => has(t, num))).reduce((q, t) => q * (1 - share(t, partner)), 1);
      if (pHas >= 0.6) out.push(`Y es probable (${Math.round(100 * pHas)}%) que tu pareja tenga con qué seguir.`);
    }
    return out;
  };
  const b1m = botMove(st, seat, 1), b1 = lp.find((q) => q.tile === b1m.tile && q.side === b1m.side) || lp[0];
  const card = (p, why) => ({ tile: p.tile, side: p.side, sideText: sideTxt(p), reasons: why(p) });
  return { none: false, only: lp.length === 1, levels: [card(b1, why1), card(b2, why2), card(b3, why3)] };
}
