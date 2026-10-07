// Números al azar reproducibles para la IA (#27): la memoria de cada bot y las simulaciones.

// Hash de texto a entero de 32 bits (FNV-1a)
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// Número fijo entre 0 y 1 para una clave: siempre el mismo para la misma clave
export const unitFor = (key) => hash32(key) / 4294967296;

// Generador con semilla (mulberry32): rnd() da números entre 0 y 1, siempre la misma sucesión para la misma semilla
export function seededRandom(seed) {
  let a = (typeof seed === "number" ? seed : hash32(String(seed))) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
