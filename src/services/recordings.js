// Manos grabadas en Firestore (colección "manos", #25). Un documento por mano terminada, con id fijo
// (<partida>_<mano>): si dos teléfonos de la misma mesa graban la misma mano, las reglas de Firestore solo
// dejan crear el documento una vez (ver firestore.rules), así que nunca hay duplicados.
// Los teléfonos solo pueden crear: no leen, no cambian y no borran. Se leen con scripts/export-partidas.mjs.

export const RECORDINGS = "manos";

// Firestore no acepta listas dentro de listas: el registro va como texto JSON, más algunos campos para buscar
export function saveHandRecord(db, rec) {
  return db.fs.doc(`${RECORDINGS}/${rec.id}`).set({
    json: JSON.stringify(rec), gameId: rec.gameId, hand: rec.hand, mode: rec.mode, v: rec.v,
    start: rec.start || null, created: Date.now(),
  });
}
