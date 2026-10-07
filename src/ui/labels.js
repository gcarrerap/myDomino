// Textos y etiquetas compartidos: modo de juego, marcadores, colores de pareja y la lista de bots de la compu.
import { nameOf } from "../engine/index.js";
import { PROFILES, CAPACITIES, getProfile } from "../ai/index.js";
import { esc } from "./dom.js";

// Lista de los 20 bots (#27): los tres de siempre arriba y luego los demás agrupados por capacidad mental
const GROUPS = [["Los de siempre", Object.values(PROFILES).filter((p) => p.nivel)]];
for (const [k, c] of Object.entries(CAPACITIES)) {
  const list = Object.values(PROFILES).filter((p) => !p.nivel && p.capacidad === k);
  if (list.length) GROUPS.push([c.nombre[0].toUpperCase() + c.nombre.slice(1), list]);
}
export const botOptionText = (p) => `${p.nombre} · ${p.desc}`;
// Nombre corto para el letrero del asiento: "Intermedio" o "Bot 07"
export const botShort = (v) => { const p = getProfile(v); return p.nivel ? p.desc : p.nombre; };
export const botHelp = (v) => getProfile(v).detalle;

// <select> con los 20 bots. key identifica a quién se le cambia el bot (lo lee quien conecta el evento).
export function botSelect(key, value, label = "Bot de la compu") {
  const cur = getProfile(value).id;
  const groups = GROUPS.map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((p) => `<option value="${p.id}"${p.id === cur ? " selected" : ""}>${esc(botOptionText(p))}</option>`).join("")}</optgroup>`).join("");
  return `<select class="botsel" data-bot="${esc(key)}" aria-label="${esc(label)}">${groups}</select>`;
}

export const BOT_HELP = `Cada bot combina un <b>estilo</b> (qué le importa: soltar puntos, imponer su número, apoyar a su pareja, hacer pasar a los rivales, contar, arriesgar o adaptarse) con una <b>capacidad</b> (qué tanto recuerda, deduce y analiza: distraído, casual, atento, experto o maestro). Básico, Intermedio y Avanzado son los de siempre.`;

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

// Posición de cada jugador en la mesa, vista desde mí: abajo yo; el turno pasa a la derecha, luego arriba, luego izquierda.
export function seatPos(st, seat, s) {
  const n = st.config.n, k = (s - (seat < 0 ? 0 : seat) + n) % n;
  if (k === 0) return "bottom";
  if (n === 2) return "top";
  if (n === 3) return k === 1 ? "right" : "left";
  return ["bottom", "right", "top", "left"][k];
}
