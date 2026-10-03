// Estado de la app y casos de uso. La interfaz lee `state`, se suscribe con `subscribe` y pide acciones.
export { state, subscribe, notify, isGoogle, timerOn, canReveal, mySeat, turnKey, specFor, noteKey } from "./store.js";
export * as actions from "./actions.js";
export { BOT_NAMES, scheduleBot } from "./practice.js";
export { tickClock } from "./clock.js";
