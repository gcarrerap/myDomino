#!/usr/bin/env node
// Descarga las manos grabadas (#25) y las escribe como JSONL: una partida por línea, en el formato que usa el
// motor de lectura (#24). No es parte del juego publicado: se corre a mano, con credenciales de administrador.
//
// Uso:
//   npm install --no-save firebase-admin
//   GOOGLE_APPLICATION_CREDENTIALS=/ruta/cuenta-de-servicio.json node scripts/export-partidas.mjs [salida.jsonl] [--manos]
//
// --manos  escribe una mano por línea (sin agrupar en partidas).
// La cuenta de servicio se descarga en la consola de Firebase: Configuración del proyecto → Cuentas de servicio.
import { writeFileSync } from "node:fs";
import { groupGames } from "../src/engine/record.js";

const args = process.argv.slice(2);
const perHand = args.includes("--manos");
const out = args.find((a) => !a.startsWith("--")) || (perHand ? "manos.jsonl" : "partidas.jsonl");

let admin;
try { admin = (await import("firebase-admin")).default; }
catch { console.error("Falta firebase-admin. Instálalo con: npm install --no-save firebase-admin"); process.exit(1); }

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const snap = await admin.firestore().collection("manos").get();
const records = [];
for (const d of snap.docs) {
  try { records.push(JSON.parse(d.data().json)); } catch { console.warn("Registro ilegible:", d.id); }
}
const rows = perHand ? records.sort((a, b) => (a.start || 0) - (b.start || 0)) : groupGames(records);
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
const games = perHand ? new Set(records.map((r) => r.gameId)).size : rows.length;
console.log(`${records.length} manos de ${games} partidas → ${out}`);
