// Jugadores de la compu, deducción y consejo. Solo usan lo que el jugador puede saber.
// Código movido sin cambios desde index.html (fase 3 de #3).

// ===== Jugadores de la compu =====
// Nivel 1 (básico): tira mulas y fichas pesadas, y deja puntas que él tenga.
// Nivel 2 (intermedio): además busca dominar: deja puntas donde quedan pocas fichas fuera de su mano
//   (para que los rivales pasen), sigue los números de su pareja y decide si le conviene cerrar.
// Nivel 3 (avanzado): lo del 2 usando su propio registro (quién pasó, quién comió, fichas seguras)
//   para anticipar si el siguiente rival podrá tirar y si su pareja tendrá jugada.
// Ningún nivel ve fichas ajenas: solo su mano, la mesa y lo que pasó a la vista de todos.
export const LEVELS = ["", "Básico", "Intermedio", "Avanzado"];
export const NOISE = { on: true };
export const TUNE = { infer: true, beta: 0.6, overs: 6, specN: 600, z: 0.8, samples: 48, blk: 0.6, k: 1.4, fr: 6, riv: 14, urg: 2, w2: 0.5, w3: 0.3, pn: 1 };
