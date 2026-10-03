// Motor de dominó: funciones puras sobre el estado de la mesa.
// Código movido sin cambios desde index.html (fase 2 de #3).

export const T = (a, b) => (a >= b ? a + "-" + b : b + "-" + a); // canónica: mayor primero
export const P = (t) => t.split("-").map(Number);
export const pts = (t) => { const [a, b] = P(t); return a + b; };
export const isDbl = (t) => { const [a, b] = P(t); return a === b; };
export const sumHand = (h) => h.reduce((s, t) => s + pts(t), 0);

export function fullSet() { const s = []; for (let a = 0; a <= 6; a++) for (let b = 0; b <= a; b++) s.push(T(a, b)); return s; }
export function shuffle(arr, rnd = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Compara fichas: mula más alta primero, luego suma, luego extremo mayor
export function tileRank(t) { const [a, b] = P(t); return (a === b ? 100 : 0) + (a + b) * 10 + a; }
