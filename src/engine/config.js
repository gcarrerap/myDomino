// Motor de dominó: funciones puras sobre el estado de la mesa.
// Código movido sin cambios desde index.html (fase 2 de #3).

export const TARGET = 100;

// config: {n:2|3|4, teams:bool, per:7|9|14}
export function validConfig(c) {
  if (c.n === 2) return c.per === 7 || c.per === 14;
  if (c.n === 3) return c.per === 7 || c.per === 9;
  if (c.n === 4) return c.per === 7;
  return false;
}
export const hasPozo = (c) => c.n * c.per < 28 && !(c.n === 3 && c.per === 9);
export const teamOf = (st, seat) => (st.config.teams ? seat % 2 : seat);
export const nScores = (c) => (c.teams ? 2 : c.n);
