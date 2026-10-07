#!/usr/bin/env node
// Torneo entre perfiles de la compu (#27). Cada perfil juega en pareja contra una referencia (por omisión el
// Intermedio, Bot 02), alternando asientos, y se reporta su fuerza y su huella de estilo.
//
// Uso:
//   node scripts/torneo.mjs [--partidas 40] [--meta 100] [--ref b02] [--perfiles b04,b05] [--semilla 1] [--json salida.json]
//   node scripts/torneo.mjs --escala        mide la escala típica de puntaje de cada perfil (para profiles.js)
import { writeFileSync } from "node:fs";
import { match, playGame } from "../src/ai/tournament.js";
import { PROFILE_IDS, getProfile } from "../src/ai/index.js";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes("--" + k);
const games = +arg("partidas", 40), target = +arg("meta", 100), ref = arg("ref", "b02"), seed = +arg("semilla", 1);
const ids = (arg("perfiles", "") || PROFILE_IDS.join(",")).split(",").filter(Boolean);
const pct = (x) => (x === null ? "  —  " : (100 * x).toFixed(0).padStart(4) + "%");

if (flag("escala")) {
  for (const id of ids) {
    const gaps = [];
    for (let g = 0; g < games; g++) { const r = playGame([id, ref, id, ref], { seed: seed * 1000 + g, target }); gaps.push(...r.stats[0].gaps, ...r.stats[2].gaps); }
    gaps.sort((a, b) => a - b);
    console.log(`${id}  escala (mediana mejor − segunda) = ${gaps[gaps.length >> 1].toFixed(2)}  (${gaps.length} decisiones)`);
  }
  process.exit(0);
}

console.log(`Torneo: ${games} partidas por perfil, a ${target} puntos, contra ${getProfile(ref).nombre} (${getProfile(ref).desc})\n`);
console.log("perfil                              gana    IC95%        pts/mano  mula1ª  cuadra  pts+   hacePasar  cortaPareja");
const out = [];
for (const id of ids) {
  const t0 = Date.now(), r = match(id, ref, { games, seed, target }), p = getProfile(id), fp = r.fingerprint;
  out.push({ id, desc: p.desc, ...r, ms: Date.now() - t0 });
  console.log(`${(p.nombre + " · " + p.desc).padEnd(34)} ${pct(r.winRate)}  [${pct(r.ci95[0])},${pct(r.ci95[1])}]  ${r.pointsPerHand.toFixed(1).padStart(6)}   ${pct(fp.mulaTemprana)}  ${pct(fp.cuadra)}  ${(fp.puntosSoltados ?? 0).toFixed(2).padStart(5)}   ${pct(fp.hacePasar)}      ${pct(fp.cortaPareja)}   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
const file = arg("json", null); if (file) writeFileSync(file, JSON.stringify(out, null, 2));
