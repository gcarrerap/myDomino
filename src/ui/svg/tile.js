// Fichas de dominó en SVG.
export const PIPS = { 0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };

export function half(n, ox, oy, s) {
  return PIPS[n].map(([x, y]) => `<circle cx="${ox + s * (0.22 + x * 0.28)}" cy="${oy + s * (0.22 + y * 0.28)}" r="${s * 0.085}" fill="var(--pip)"/>`).join("");
}

export function tileSVG(a, b, vertical, s) {
  const w = vertical ? s : 2 * s, h = vertical ? 2 * s : s;
  const line = vertical ? `<line x1="${s * .15}" y1="${s}" x2="${s * .85}" y2="${s}" stroke="var(--tile-edge)" stroke-width="1.5"/>` : `<line x1="${s}" y1="${s * .15}" x2="${s}" y2="${s * .85}" stroke="var(--tile-edge)" stroke-width="1.5"/>`;
  const p2 = vertical ? half(b, 0, s, s) : half(b, s, 0, s);
  return `<svg class="tile" width="${w}" height="${h}" viewBox="-1 -1 ${w + 2} ${h + 2}" aria-label="${a}-${b}"><rect x="0" y="0" width="${w}" height="${h}" rx="${s * .14}" fill="var(--tile)" stroke="var(--tile-edge)" stroke-width="1.2"/>${line}${half(a, 0, 0, s)}${p2}</svg>`;
}

export function tileG(x, y, w, h, v1, v2, s) {
  const vert = h > w, g = 1; // v1 = izquierda/arriba, v2 = derecha/abajo
  const line = vert ? `<line x1="${x + s * .18}" y1="${y + s}" x2="${x + s * .82}" y2="${y + s}" stroke="var(--tile-edge)" stroke-width="1.3"/>`
    : `<line x1="${x + s}" y1="${y + s * .18}" x2="${x + s}" y2="${y + s * .82}" stroke="var(--tile-edge)" stroke-width="1.3"/>`;
  return `<g><rect x="${x + g}" y="${y + g}" width="${w - 2 * g}" height="${h - 2 * g}" rx="${s * .14}" fill="var(--tile)" stroke="var(--tile-edge)" stroke-width="1.1"/>${line}${half(v1, x, y, s)}${vert ? half(v2, x, y + s, s) : half(v2, x + s, y, s)}</g>`;
}
