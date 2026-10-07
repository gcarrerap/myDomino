// Perfiles de la compu (#27). Un perfil es solo datos, con dos partes independientes:
//   - estilo: cuánto pesa cada criterio (criteria.js), qué tanto reacciona a la situación y su factor aleatorio
//   - mente: qué tanto recuerda, deduce y analiza (mind.js)
// Bot 01-03 son los niveles de siempre (Básico, Intermedio, Avanzado) y deciden igual que antes con el azar apagado.
// Bot 04-20 combinan un estilo con una capacidad mental.
import { TUNE } from "./tune.js";
import { PERFECT_MEMORY } from "./mind.js";

// ---------- Estilos ----------
// Pesos de partida de los perfiles nuevos (los del intermedio más los criterios nuevos)
const BASE = {
  dominar: 1e6, tranque: 300, puntos: 0.6, mula: 5, mulaRiesgo: 3, mayoria: 2.5, pegan: 0, variedad: 1.5, solitaria: 1.5, asegurar: 2,
  pareja: 1.5, noFalloPareja: 2, bloqueo: 1.2, hacerPasar: 3, taparPalo: 1.5, ahorcarMula: 2, frenar: 6, cuadre: 1.5, noAbrirNuevo: 1,
  anticipacion: 1, desempate: 1,
};
const SENS = { peligro: 1, fase: 1, marcador: 1, fuerza: 1 };

export const STYLES = {
  equilibrado: { nombre: "equilibrado", desc: "sin preferencias marcadas", mult: {}, azar: { ventana: 0.15, temperatura: 0.25 } },
  descargador: { nombre: "descargador", desc: "suelta puntos y mulas cuanto antes", mult: { puntos: 3, mula: 1.5, mulaRiesgo: 1.5, mayoria: 0.6, cuadre: 0.5, hacerPasar: 0.6 }, azar: { ventana: 0.15, temperatura: 0.25 } },
  controlador: { nombre: "controlador", desc: "impone su número y se asegura la jugada", mult: { mayoria: 1.8, asegurar: 2, cuadre: 2, noAbrirNuevo: 2, pareja: 0.5, puntos: 0.6 }, azar: { ventana: 0.1, temperatura: 0.2 } },
  escudero: { nombre: "escudero", desc: "juega para su pareja", mult: { pareja: 3, noFalloPareja: 2.5, anticipacion: 1.5, mayoria: 0.6, puntos: 1.2 }, azar: { ventana: 0.15, temperatura: 0.25 } },
  castigador: { nombre: "castigador", desc: "vive para hacer pasar a los rivales", mult: { hacerPasar: 3, bloqueo: 2, taparPalo: 2.5, ahorcarMula: 2.5, frenar: 1.5, cuadre: 1.5, pareja: 0.6 }, azar: { ventana: 0.2, temperatura: 0.3 } },
  contador: { nombre: "contador", desc: "cuenta todo y juega los finales con cálculo", mult: { ahorcarMula: 2, mulaRiesgo: 1.5, frenar: 1.5, bloqueo: 1.3, variedad: 1.2, puntos: 1.2 }, azar: { ventana: 0.08, temperatura: 0.15 } },
  apostador: { nombre: "apostador", desc: "arriesga para ganar en grande", mult: { cuadre: 2, hacerPasar: 2, variedad: 0.5, solitaria: 0.5, puntos: 0.5 }, sens: { marcador: 2 }, azar: { ventana: 0.3, temperatura: 0.45 } },
  completo: { nombre: "completo", desc: "cambia de plan según la mano, la fase y el marcador", mult: {}, sens: { peligro: 1.5, fase: 1.5, marcador: 1.5, fuerza: 1.5 }, azar: { ventana: 0.12, temperatura: 0.2 } },
};

// ---------- Capacidades mentales ----------
export const CAPACITIES = {
  distraido: {
    nombre: "distraído", desc: "recuerda poco y no cuenta; solo ve su mano y las puntas",
    mente: { memoria: { capacidad: 0.4, olvido: 0.2, prioridad: { pase: 0.8, mula: 0.7, alta: 0.6, pareja: 0.6, salida: 0.7, otra: 0.4 }, cuenta: "no", atribucion: 0.3 }, deduccion: 0, anticipacion: 0, sospechas: null, calculo: 0 },
    azarMult: 1.8,
  },
  casual: {
    nombre: "casual", desc: "recuerda lo importante (pases, mulas) por un rato y cuenta lo que recuerda",
    mente: { memoria: { capacidad: 0.8, olvido: 0.08, prioridad: { pase: 1, mula: 1, alta: 0.8, pareja: 0.9, salida: 1, otra: 0.5 }, cuenta: "memoria", atribucion: 0.6 }, deduccion: 2, anticipacion: 1, sospechas: null, calculo: 0 },
    azarMult: 1.2,
  },
  atento: {
    nombre: "atento", desc: "recuerda casi todo, cuenta exacto y deduce por eliminación",
    mente: { memoria: { capacidad: 1, olvido: 0.01, prioridad: { pase: 1, mula: 1, alta: 1, pareja: 1, salida: 1, otra: 0.9 }, cuenta: "exacta", atribucion: 0.9 }, deduccion: 3, anticipacion: 3, sospechas: null, calculo: 0 },
    azarMult: 1,
  },
  experto: {
    nombre: "experto", desc: "memoria perfecta, deducción exacta y lee las intenciones de los demás",
    mente: { memoria: PERFECT_MEMORY, deduccion: 3, anticipacion: 3, sospechas: { beta: TUNE.beta, n: 150 }, calculo: 0 },
    azarMult: 0.8,
  },
  maestro: {
    nombre: "maestro", desc: "como el experto, y además simula cada jugada antes de decidir",
    mente: { memoria: PERFECT_MEMORY, deduccion: 3, anticipacion: 3, sospechas: { beta: TUNE.beta, n: 150 }, calculo: TUNE.samples },
    azarMult: 0.8,
  },
};

// Escala típica de puntaje de cada perfil (mediana de mejor − segunda jugada), medida con
// "node scripts/torneo.mjs --escala". Ver decide.js.
const ESCALA = { b01: 3, b02: 3.6, b03: 3.6, b04: 7.4, b05: 7.7, b06: 6.1, b07: 7.2, b08: 5.7, b09: 7.1, b10: 8.7, b11: 5.5, b12: 7.7, b13: 8.1, b14: 6, b15: 6, b16: 5.2, b17: 6.5, b18: 6.4, b19: 6.9, b20: 6.9 };

function build(id, estilo, capacidad) {
  const S = STYLES[estilo], C = CAPACITIES[capacidad];
  const pesos = {}; for (const [k, v] of Object.entries(BASE)) pesos[k] = v * (S.mult[k] ?? 1);
  return {
    id, nombre: "Bot " + id.slice(1), estilo, capacidad,
    desc: `${S.nombre} · ${C.nombre}`, detalle: `${S.desc}; ${C.desc}.`,
    pesos, sensibilidad: { ...SENS, ...(S.sens || {}) }, mente: C.mente,
    azar: { ventana: S.azar.ventana * C.azarMult, temperatura: S.azar.temperatura * C.azarMult, escala: ESCALA[id] },
  };
}

// ---------- Los niveles de siempre ----------
const ZERO = Object.fromEntries(Object.keys(BASE).map((k) => [k, 0]));
const LEGACY = {
  b01: {
    id: "b01", nombre: "Bot 01", estilo: "equilibrado", capacidad: "distraido", nivel: 1, desc: "Básico", detalle: "Tira mulas y fichas pesadas, y deja puntas que él tenga. Solo ve su mano y las puntas.",
    pesos: { ...ZERO, dominar: 1e6, mula: 8, puntos: 1, pegan: 2 },
    sensibilidad: {}, mente: { memoria: PERFECT_MEMORY, deduccion: 0, anticipacion: 0, sospechas: null, calculo: 0 },
    azar: { ventana: 0.3, temperatura: 0.45 },
  },
  b02: {
    id: "b02", nombre: "Bot 02", estilo: "equilibrado", capacidad: "atento", nivel: 2, desc: "Intermedio", detalle: "Además busca dominar: deja puntas donde quedan pocas fichas fuera de su mano, sigue los números de su pareja y decide si le conviene cerrar. Cuenta todo lo jugado.",
    pesos: { ...ZERO, dominar: 1e6, tranque: 300, puntos: 0.6, mula: 5, mayoria: 2.5, desempate: 1, bloqueo: 1.2, pareja: 1.5 },
    sensibilidad: { peligro: 1 }, mente: { memoria: PERFECT_MEMORY, deduccion: 1, anticipacion: 0, sospechas: null, calculo: 0 },
    azar: { ventana: 0.15, temperatura: 0.25 },
  },
  b03: {
    id: "b03", nombre: "Bot 03", estilo: "equilibrado", capacidad: "maestro", nivel: 3, desc: "Avanzado", detalle: "Parte del tiro del intermedio y lo cambia si, al simular repartos que cuadran con lo que ha visto y con cómo ha tirado cada quien, otro tiro sale claramente mejor.",
    pesos: { ...ZERO, dominar: 1e6, tranque: 300, puntos: 0.6, mula: 5, mayoria: 2.5, desempate: 1, bloqueo: 1.2, pareja: 1.5 },
    sensibilidad: { peligro: 1 }, mente: { memoria: PERFECT_MEMORY, deduccion: 1, anticipacion: 0, sospechas: { beta: TUNE.beta, n: TUNE.specN }, calculo: TUNE.samples, inferirEnCalculo: true },
    azar: { ventana: 0.12, temperatura: 0.2 },
  },
};

// ---------- Catálogo ----------
const GRID = [
  ["b04", "descargador", "casual"], ["b05", "descargador", "atento"],
  ["b06", "controlador", "casual"], ["b07", "controlador", "experto"],
  ["b08", "escudero", "casual"], ["b09", "escudero", "atento"], ["b10", "escudero", "experto"],
  ["b11", "castigador", "distraido"], ["b12", "castigador", "atento"], ["b13", "castigador", "experto"],
  ["b14", "contador", "atento"], ["b15", "contador", "maestro"],
  ["b16", "apostador", "casual"], ["b17", "apostador", "experto"],
  ["b18", "completo", "atento"], ["b19", "completo", "experto"], ["b20", "completo", "maestro"],
];
export const PROFILES = { ...LEGACY };
for (const p of Object.values(LEGACY)) p.azar.escala = ESCALA[p.id];
for (const [id, e, c] of GRID) PROFILES[id] = build(id, e, c);
export const PROFILE_IDS = Object.keys(PROFILES);

// Nivel de siempre (1-3) → perfil. El 4 era "Avanzado con lectura" solo para pruebas: ahora es el mismo Avanzado.
export const LEVEL_PROFILE = { 1: "b01", 2: "b02", 3: "b03", 4: "b03" };

// Acepta un perfil, su id ("b07") o un nivel (1-3)
export function getProfile(who) {
  if (who && typeof who === "object" && who.pesos) return who;
  if (typeof who === "string" && PROFILES[who]) return PROFILES[who];
  const lv = Number(who);
  return PROFILES[LEVEL_PROFILE[lv] || LEVEL_PROFILE[Math.min(3, Math.max(1, Math.round(lv) || 1))]];
}

// Para mostrar: "Bot 07 · controlador · experto"
export const profileLabel = (who) => { const p = getProfile(who); return `${p.nombre} · ${p.desc}`; };
