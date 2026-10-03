// API del motor de dominó. Las demás capas importan desde aquí.
export { T, P, pts, isDbl, sumHand, fullSet, shuffle, tileRank } from "./tiles.js";
export { TARGET, validConfig, hasPozo, teamOf, nScores } from "./config.js";
export { newTable, deal, pushLog, nextSeat, nameOf, newGame } from "./table.js";
export { ends, legalPlays, canDraw, canPass, resolvePending, play, draw, pass } from "./moves.js";
export { endHand } from "./scoring.js";
export { limitMs, autoMove } from "./timing.js";
