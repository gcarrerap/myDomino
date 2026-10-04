// Preferencias de este dispositivo en localStorage. Nunca truena: si el navegador bloquea el almacenamiento
// (modo privado, permisos), get devuelve null y set no hace nada.
// Claves en uso: dom.dev (id del dispositivo), dom.name, dom.timer, dom.botLevels, dom.arr (orden de tu mano),
// dom.notes (tus notas del registro), dom.rec y dom.recSeen (manos grabadas por subir, #25).
export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
