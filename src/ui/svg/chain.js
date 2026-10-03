// La cadena de fichas en la mesa, en serpiente: sale del centro, crece a los dos lados y da vuelta en las orillas.
import { tileG } from "./tile.js";

// Si alguna vuelta no puede evitar una mula, "recorre" la cadena: prueba moviendo la ficha de salida
// hacia un lado u otro hasta que todas las vueltas caigan en fichas normales.
// Acomoda la cadena: primero la recorre según cuántas fichas tiene cada lado (para no dar vuelta en un lado
// mientras al otro le sobra espacio); luego, si alguna vuelta no puede evitar una mula, la recorre un poco más.
export function layoutChain(board, origin, W, s) {
  const lenOf = (t) => (t[0] === t[1] ? s : 2 * s);
  const lenR = board.slice(origin + 1).reduce((q, t) => q + lenOf(t), 0);
  const lenL = board.slice(0, origin).reduce((q, t) => q + lenOf(t), 0);
  const half0 = board[origin][0] === board[origin][1] ? s / 2 : s;
  const lim = Math.max(0, W / 2 - half0 - 2 - 2 * s);   // hasta dónde se puede recorrer la salida
  const base = Math.max(-lim, Math.min(lim, (lenL - lenR) / 2));
  let best = null;
  for (let k = 0; k <= 12; k++) {
    const shift = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * s;
    if (Math.abs(shift) > lim + 0.5 && k) continue;
    const r = layoutChainAt(board, origin, W, s, shift);
    if (!best || r.fb < best.fb) best = r;
    if (!r.fb) break;
  }
  // último recurso: probar recorridos en toda la mesa
  for (let k = 1; best.fb && k <= 80; k++) {
    const shift = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * s / 4;
    if (Math.abs(shift) > W / 2 - half0 - 2) continue;
    const r = layoutChainAt(board, origin, W, s, shift);
    if (r.fb < best.fb) best = r;
  }
  best.rects.fb = best.fb;
  return best.rects;
}

export function layoutChainAt(board, origin, W, s, shift) {
  const m = 2, rects = []; let fb = 0;
  const cxo = W / 2 + shift;
  const H = (x, yc, d, near, far) => { // horizontal a lo largo de la fila
    const x0 = d > 0 ? x : x - 2 * s;
    rects.push({ x: x0, y: yc - s / 2, w: 2 * s, h: s, v1: d > 0 ? near : far, v2: d > 0 ? far : near });
  };
  const [oa, ob] = board[origin];
  if (oa === ob) rects.push({ x: cxo - s / 2, y: -s, w: s, h: 2 * s, v1: oa, v2: ob });
  else rects.push({ x: cxo - s, y: -s / 2, w: 2 * s, h: s, v1: oa, v2: ob });
  const half0 = oa === ob ? s / 2 : s;
  // Recorre un brazo de la cadena. Las mulas van atravesadas y nunca junto a una vuelta: ni la última
  // ficha de la fila, ni la que da la vuelta (C), ni la primera de la nueva fila (F) pueden ser mula.
  // La vuelta baja desde debajo de la punta de la última ficha, así las filas quedan bien separadas.
  // Si no hay un buen punto para girar, se cuenta (fb) y layoutChain recorre la cadena o achica las fichas.
  const walk = (tiles, d, v) => {
    let x = cxo + d * half0, yc = 0, i = 0, lastDbl = oa === ob;
    const dbl = (k) => !!tiles[k] && tiles[k][0] === tiles[k][1];
    const len = (k) => (dbl(k) ? s : 2 * s);
    const fitsAt = (xx, k) => (d > 0 ? xx + len(k) <= W - m : xx - len(k) >= m);
    const placeRow = (k) => {
      const [near, far] = tiles[k];
      if (dbl(k)) rects.push({ x: d > 0 ? x : x - s, y: yc - s, w: s, h: 2 * s, v1: near, v2: far });
      else H(x, yc, d, near, far);
      x += d * len(k); lastDbl = dbl(k);
    };
    while (i < tiles.length) {
      let xx = x, k = i;
      while (k < tiles.length && fitsAt(xx, k)) { xx += d * len(k); k++; }
      if (k >= tiles.length) { while (i < tiles.length) placeRow(i++); break; }
      let j = -1;
      for (let q = k; q >= i; q--) {
        const before = q > i ? dbl(q - 1) : lastDbl;
        if (!before && !dbl(q) && !dbl(q + 1)) { j = q; break; }
      }
      if (j < 0) { j = k; fb++; }
      while (i < j) placeRow(i++);
      // C: baja (o sube) desde debajo de la punta de la última ficha
      const [near, far] = tiles[j], cx0 = d > 0 ? x - s : x;
      const reach = lastDbl ? s : s / 2; // hasta dónde llega la última ficha hacia abajo/arriba
      const top = v > 0 ? yc + reach : yc - reach - 2 * s;
      rects.push({ x: cx0, y: top, w: s, h: 2 * s, v1: v > 0 ? near : far, v2: v > 0 ? far : near });
      d = -d; let yTop = v > 0 ? top + 2 * s : top; i = j + 1;
      if (dbl(i)) fb++;
      while (i < tiles.length && dbl(i)) { // solo en el caso extremo
        const [n2, f2] = tiles[i];
        rects.push({ x: d < 0 ? cx0 - s : cx0, y: v > 0 ? yTop : yTop - s, w: 2 * s, h: s, v1: n2, v2: f2 });
        yTop += v * s; i++;
      }
      if (i >= tiles.length) break;
      // F: primera ficha de la nueva fila, con su punta pegada al final de la vuelta
      const [n3, f3] = tiles[i]; yc = yTop + v * s / 2;
      if (d < 0) { rects.push({ x: cx0 - s, y: yc - s / 2, w: 2 * s, h: s, v1: f3, v2: n3 }); x = cx0 - s; }
      else { rects.push({ x: cx0, y: yc - s / 2, w: 2 * s, h: s, v1: n3, v2: f3 }); x = cx0 + 2 * s; }
      lastDbl = false; i++;
    }
  };
  walk(board.slice(origin + 1).map(([a, b]) => [a, b]), 1, 1);
  walk(board.slice(0, origin).reverse().map(([a, b]) => [b, a]), -1, -1);
  return { rects, fb };
}

// Dibuja la cadena en el espacio W×H. vertical = crece hacia arriba y abajo (hacia los jugadores de arriba y abajo);
// si no, hacia los lados. Escoge el tamaño de ficha más grande con el que cabe toda la cadena.
// Dibuja la cadena en el espacio W×H. vertical = crece hacia arriba y abajo; si no, hacia los lados.
// "budget" = espacio transversal que puede ocupar (para no tapar a los jugadores de los lados).
// Escoge la ficha más grande con la que cabe todo y devuelve también el rectángulo que ocupa.
export function chainSVG(board, origin, W, H, vertical, budget) {
  const along = vertical ? H : W, across = vertical ? W : H, room = Math.min(across, budget || across);
  // la ficha más grande que quepa; si con ella alguna mula queda en una vuelta, prueba hasta 4 tamaños más chicos
  let pick = null, firstFit = null;
  for (let s = 24; s >= 9; s--) {
    const rs = layoutChain(board, origin, along, s);
    let a0 = Infinity, a1 = -Infinity;
    rs.forEach((r) => { a0 = Math.min(a0, r.y); a1 = Math.max(a1, r.y + r.h); });
    if (a1 - a0 + 4 > room) continue;
    const cand = { s, rects: rs, y0: a0, y1: a1 };
    if (!firstFit) firstFit = cand;
    if (!rs.fb) { pick = cand; break; }
    if (s <= firstFit.s - 4) break;
  }
  if (!pick) pick = firstFit || (() => { const rs = layoutChain(board, origin, along, 9); let a0 = Infinity, a1 = -Infinity; rs.forEach((r) => { a0 = Math.min(a0, r.y); a1 = Math.max(a1, r.y + r.h); }); return { s: 9, rects: rs, y0: a0, y1: a1 }; })();
  const s = pick.s, rects = pick.rects, y0 = pick.y0, y1 = pick.y1;
  const span = y1 - y0 + 4, off = (across - span) / 2 - y0 + 2;
  let x0 = Infinity, x1 = -Infinity;
  rects.forEach((r) => { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); });
  const tiles = rects.map((r) => vertical
    ? tileG(r.y + off, r.x, r.h, r.w, r.v1, r.v2, s)
    : tileG(r.x, r.y + off, r.w, r.h, r.v1, r.v2, s)).join("");
  const box = vertical ? { left: y0 + off, right: y1 + off, top: x0, bottom: x1 } : { left: x0, right: x1, top: y0 + off, bottom: y1 + off };
  return { svg: `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cadena de ${board.length} fichas">${tiles}</svg>`, box };
}
