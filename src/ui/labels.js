// Textos y etiquetas compartidos: modo de juego, marcadores, colores de pareja y el selector de nivel de la compu.
import { nameOf } from "../engine/index.js";
import { LEVELS } from "../ai/index.js";

export const LEVEL_HELP = { 1: "Tira mulas y fichas pesadas.", 2: "Busca dominar: hacer pasar a los rivales y ayudar a su pareja.", 3: "Como el intermedio, pero imagina dónde están las fichas usando su registro y leyendo los tiros de los demás, y prueba cada tiro hasta el final de la mano." };

export function levelSeg(id, lv) {
  return `<div class="seg lvl" role="group" aria-label="Nivel">${[1, 2, 3].map((l) => `<button data-lvl="${id}:${l}" aria-pressed="${lv === l}">${LEVELS[l]}</button>`).join("")}</div>`;
}

export function modeLabel(c) {
  return modeLabel0(c) + (c.timer === false ? " · sin límite de tiempo" : "");
}

export function modeLabel0(c) {
  const base = c.n === 4 ? (c.teams ? "4 jugadores · parejas" : "4 jugadores · individual") : `${c.n} jugadores`;
  const extra = c.n === 3 && c.per === 9 ? "9 fichas + muestra" : c.n === 2 && c.per === 14 ? "14 fichas, sin pozo" : c.n * c.per < 28 ? "7 fichas + pozo" : "7 fichas";
  return `${base} · ${extra}`;
}

export function scoreLabels(st) {
  const c = st.config;
  if (c.teams) return [0, 1].map((t) => `${nameOf(st, t)} y ${nameOf(st, t + 2)}`);
  return st.seats.map((_, i) => nameOf(st, i));
}

export const teamColor = (t) => (t === 0 ? "var(--ta)" : "var(--tb)");
