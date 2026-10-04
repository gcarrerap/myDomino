// Limpieza de mesas abandonadas: las mesas en línea que siguen sin repartir y sin nadie sentado se borran
// después de un rato sin cambios. No hay servidor: lo hace cualquier jugador que tenga el lobby abierto.
import { isEmptyTable } from "../engine/index.js";
import { SKIP, updateTable } from "../services/index.js";
import { state } from "./store.js";

// Margen para que no desaparezca mientras alguien se levanta para cambiarse de asiento o está por sentarse
export const EMPTY_TABLE_GRACE_MS = 5 * 60 * 1000;
export const CLEANUP_EVERY_MS = 60 * 1000;

const inFlight = new Set(); // mesas que ya se están borrando (para no pedirlo dos veces)

// Revisa la lista del lobby y borra las mesas vacías desde hace más del margen. Antes de borrar vuelve a revisar,
// dentro de una transacción, que la mesa siga vacía: si alguien se sentó en ese momento, no se borra.
// Devuelve una promesa que termina cuando acabaron los borrados que se pidieron (útil en pruebas).
export function cleanupEmptyTables(now = Date.now()) {
  if (!state.db) return Promise.resolve([]);
  const jobs = [];
  for (const st of state.listCache) {
    if (!isEmptyTable(st) || inFlight.has(st.code)) continue;
    const updated = state.listUpdated[st.code];
    if (typeof updated !== "number" || now - updated < EMPTY_TABLE_GRACE_MS) continue;
    inFlight.add(st.code);
    jobs.push(updateTable(state.db, st.code, (cur) => (isEmptyTable(cur) ? null : SKIP))
      .then((skipped) => (skipped ? null : st.code))
      .catch(() => null) // ya no existe, o las reglas de Firestore no lo permiten: no pasa nada
      .finally(() => inFlight.delete(st.code)));
  }
  return Promise.all(jobs).then((codes) => codes.filter(Boolean));
}
