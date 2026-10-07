# Diseño modular de Dominó de la Familia

Este documento describe cómo pasar de un solo `index.html` (~2,000 líneas) a una estructura modular, sin perder lo que hoy hace fácil al proyecto: se publica tal cual en GitHub Pages y no necesita ningún paso de compilación.

Issue: #3

## 1. Punto de partida

Todo el juego vive en `index.html`:

| Líneas aprox. | Contenido | Tipo de código |
|---|---|---|
| 1–17 | Scripts de Firebase (CDN) y `FIREBASE_CONFIG` | configuración |
| 21–277 | CSS: tokens de color, tema claro/oscuro, lobby, mesa, fichas | estilos |
| 284–585 | Motor (`const E = (() => …)()`): fichas, reparto, jugadas válidas, comer, pasar, fin de mano, puntuación, tiempos | lógica pura |
| 586–934 | Bots: deducción, especulación (inferencia bayesiana sobre los tiros ajenos), Monte Carlo, heurísticas por nivel | lógica pura, costosa |
| 935–1060 | Consejo: qué tirarían los tres niveles y por qué | lógica pura |
| 1064–1210 | Dibujo SVG de fichas y de la cadena en serpiente | vista |
| 1210–1350 | Identidad, `localStorage`, adaptador de Firestore, auth, suscripciones, `mutate` (transacciones) | infraestructura |
| 1350–1978 | Render de lobby y mesa, bots de práctica, tu mano (orden y giro), reloj, consejo, notas, registro, resultado | vista + estado |

### Lo que ya está bien

- **El motor ya es casi puro.** `E` recibe un estado y devuelve uno nuevo (`play`, `draw`, `pass`, `deal`…), no toca el DOM ni Firestore, y la aleatoriedad se puede inyectar (`rnd = Math.random`). Es la frontera natural para el primer módulo.
- **Toda escritura pasa por un solo punto** (`mutate(fn)`), tanto en práctica (estado local) como en línea (transacción en Firestore).

### Por qué cuesta mantenerlo

- **No hay fronteras.** La UI usa ~20 variables globales mutables (`view`, `tableState`, `config`, `me`, `db`, `arr`, `clock`, `notes`…) desde cualquier función. Un cambio en la mesa puede romper el lobby sin que se note.
- **No se puede probar.** El motor y los bots solo corren dentro de la página, así que cualquier ajuste a reglas o niveles se valida jugando a mano.
- **Revisar cambios es difícil.** Cualquier PR toca el mismo archivo de 120 KB, y los diffs de CSS, reglas y UI quedan mezclados.
- **Hay código muerto sin detectar** (por ejemplo `userCap`, `sampleCap`, `isOwnerView` se declaran pero nunca se asignan).
- **El cálculo pesado bloquea la pantalla.** La especulación y el Monte Carlo corren en el hilo principal; separarlos es requisito para moverlos a un Web Worker (resuelto en la fase 7a).

## 2. Principios

1. **Sin compilación.** Módulos ES nativos (`<script type="module">`), servidos como archivos estáticos. GitHub Pages sigue funcionando igual.
2. **Dependencias en una sola dirección.** Las capas de abajo no conocen a las de arriba (ver §4).
3. **El motor y la IA son funciones puras** sin DOM, sin Firebase, sin `localStorage`. Reloj y aleatoriedad se inyectan.
4. **Un solo dueño para el estado de la app.** Las vistas leen del store y piden cambios; no modifican variables globales.
5. **Cero cambios de comportamiento durante la migración.** Cada fase es un PR que mueve código, no lo reescribe, y el juego funciona igual al terminar cada una.

## 3. Estructura

Esta es la estructura final, tal como quedó al terminar la fase 6 (las diferencias con la propuesta original están en el plan de migración, §6).

```
myDomino/
├── sw.js                      # service worker: archivos del sitio siempre del servidor primero; copia para sin conexión (#19)
├── index.html                 # solo el esqueleto: <div id="app">, CSS, src/config.js y <script type="module" src="src/main.js">
├── styles/
│   ├── reset.css              # reset mínimo de la página
│   ├── tokens.css             # variables de color y tipografía, tema claro/oscuro
│   ├── base.css               # tipografía, botones, paneles, formularios
│   ├── lobby.css
│   └── table.css              # paño, fichas, mano, marcador, consejo
├── src/
│   ├── version.js             # VERSION publicada; se cambia en cada publicación (#19)
│   ├── main.js                # arranque: reloj, suscripción al estado, render inicial y conexión con Firebase
│   ├── config.js              # FIREBASE_CONFIG (único archivo a editar para usar otro proyecto; script clásico)
│   │
│   ├── engine/                # reglas del dominó — puro, probado con Node
│   │   ├── tiles.js           # T, P, pts, isDbl, fullSet, shuffle, sumHand, tileRank
│   │   ├── config.js          # validConfig, hasPozo, teamOf, nScores, TARGET
│   │   ├── table.js           # newTable, newGame, deal, nameOf, nextSeat, pushLog
│   │   ├── moves.js           # legalPlays, play, draw, pass, canDraw, canPass, ends, resolvePending
│   │   ├── scoring.js         # endHand (puntos en contra, tranque, campeón)
│   │   ├── timing.js          # limitMs, autoMove
│   │   ├── record.js          # buildHandRecord, replayHand, groupGames: grabación de manos (#25)
│   │   └── index.js           # reexporta la API del motor
│   │
│   ├── ai/                    # jugadores de la compu y consejo — puro, probado con Node
│   │   ├── tune.js            # TUNE, LEVELS, NOISE
│   │   ├── heuristics.js      # newEnds, has, heurScore, optionsAt (criterios compartidos)
│   │   ├── deduce.js          # deduce, tracker, sampleAssign (qué fichas puede tener cada quien)
│   │   ├── speculate.js       # inferenceEvents, logLikelihood, weightedAssigns, speculate, explainTile
│   │   ├── search.js          # sampleWorld, rollout, rolloutFull, worldsFor, monteCarloMove
│   │   ├── bots.js            # botMove(st, seat, perfil o nivel): decide con los criterios del perfil (#27)
│   │   ├── opening.js         # openingPlan: con qué salir y qué tan bueno es el juego
│   │   ├── criteria.js        # CRITERIA (biblioteca de criterios), modificadores de situación, scoreOptions (#27)
│   │   ├── mind.js            # recall (memoria del bot), knowledge (deducción 0-3 y sospechas) (#27)
│   │   ├── profiles.js        # PROFILES: Bot 01-20 (estilo × capacidad mental), getProfile, profileLabel (#27)
│   │   ├── decide.js          # factor aleatorio: ventana de duda y temperatura (#27)
│   │   ├── tournament.js      # playGame, match, fingerprint: torneo entre perfiles (#27)
│   │   ├── rng.js             # hash32, unitFor, seededRandom (#27)
│   │   ├── advice.js          # advise
│   │   ├── worker.js          # Web Worker: corre botMove y advise en un hilo aparte
│   │   └── index.js           # reexporta la API de la IA
│   │
│   ├── services/              # todo lo que toca el exterior
│   │   ├── firebase.js        # loadFirebaseSdk (carga el SDK del CDN después de dibujar), initFirebase (anónimo), signInWithGoogle, signOut
│   │   ├── tables-repo.js     # makeDb, watchTableList, watchTable, saveNewTable, updateTable, SKIP
│   │   ├── prefs.js           # ls: wrapper seguro de localStorage
│   │   ├── updates.js         # registerServiceWorker, fetchPublishedVersion (#19)
│   │   ├── recordings.js      # saveHandRecord: manos grabadas en la colección "manos" (#25)
│   │   └── index.js           # reexporta la API de servicios
│   │
│   ├── app/                   # estado y casos de uso de la app
│   │   ├── store.js           # state (view, tableState, config, me, db…), subscribe/notify y derivados (mySeat, turnKey, specFor…)
│   │   ├── actions.js         # start, openTable, mutate, createTable, startPractice, leave, setView, preferencias, mano, notas, askAdvice
│   │   ├── bots.js            # isBotSeat, botRole, botActor, scheduleBot, openDelayMs: la compu en práctica y en línea (#15)
│   │   ├── clock.js           # tickClock: reloj de turno (la interfaz solo lo pinta)
│   │   ├── ai-client.js       # runAI: pide cálculos al worker; si no hay worker, calcula aquí
│   │   ├── updates.js         # checkForUpdate, startUpdateChecks, applyUpdate: aviso de versión nueva (#19)
│   │   ├── recorder.js        # createRecorder: cola local y subida de manos grabadas (#25)
│   │   ├── recording.js       # conecta la grabación con el estado de la app (#25)
│   │   ├── cleanup.js         # cleanupInactiveTables: borra mesas sin cambios (5 min vacías, 1 h sin repartir, 6 h empezadas) (#13, #17)
│   │   └── index.js           # reexporta la API de la app
│   │
│   └── ui/                    # vista: produce HTML/SVG y conecta eventos
│       ├── dom.js             # $, esc
│       ├── labels.js          # modeLabel, scoreLabels, teamColor, levelSeg, LEVEL_HELP, seatPos
│       ├── render.js          # render() raíz: elige pantalla
│       ├── clock.js           # tick: pinta el reloj de turno
│       ├── svg/
│       │   ├── tile.js        # PIPS, half, tileSVG, tileG
│       │   └── chain.js       # layoutChain, layoutChainAt, chainSVG
│       ├── screens/
│       │   ├── lobby.js       # renderLobby (variante A de #20): perfil, Jugar en línea, Practicar, mesas abiertas
│       │   ├── seats.js       # renderSeats: asientos alrededor del paño, menú por asiento (#20)
│       │   └── table.js       # renderTable (incluye tu mano: tocar, girar y arrastrar)
│       └── components/
│           ├── sheet.js       # ventanas: openOverlay, closeOverlay, renderSheet, syncOverlayHistory; "atrás" y Esc las cierran (#20)
│           ├── result.js      # renderResult
│           ├── advice.js      # renderAdvice
│           └── tracker.js     # renderTracker, tileDetail
├── firestore.rules            # reglas de Firestore: mesas y manos grabadas (#25)
├── scripts/
│   ├── export-partidas.mjs    # descarga las manos grabadas a JSONL (#25); no es parte del juego publicado
│   └── torneo.mjs             # torneo entre perfiles de la compu: fuerza y huella de estilo (#27)
└── tests/
    ├── engine.test.js         # reparto, jugadas, tranque, puntuación por modo
    ├── ai.test.js             # los bots solo devuelven jugadas legales y no ven fichas ajenas
    ├── services.test.js       # mesas en Firestore, transacciones, sesión, localStorage
    ├── app.test.js            # práctica, compu, reloj, preferencias, mano, notas, mesas en línea, consejo
    ├── ai-worker.test.js      # el worker, el cliente (con un Worker de mentira) y la app mientras la compu piensa
    ├── cleanup.test.js        # limpieza de mesas abandonadas
    ├── updates.test.js        # service worker y aviso de versión nueva
    ├── profiles.test.js       # perfiles: compatibilidad, memoria, deducción, criterios, azar, torneo (#27)
    ├── fixtures/legacy-bots.js # copia congelada de los bots de antes de #27, para la prueba de compatibilidad
    ├── record.test.js         # grabación: registro de cada mano, reproducción, cola sin conexión, sin duplicados (#25)
    ├── online-bots.test.js    # la compu en mesas en línea: agregar/quitar, quién la mueve, respaldo, sin jugadas dobles
    └── fakes/firebase.js      # Firebase de mentira en memoria para las pruebas
```

Los nombres de función son los que ya existen hoy; la migración los mueve, no los renombra.

## 4. Capas y reglas de dependencia

```
        ui/  ───────────────┐
         │                  │
         ▼                  ▼
        app/  ──────►  services/
         │                  │
         ▼                  │
        ai/                 │
         │                  │
         ▼                  ▼
      engine/  ◄────────────┘   (services solo usa tipos/forma del estado)
```

| Capa | Puede importar | No puede importar | Responsabilidad |
|---|---|---|---|
| `engine/` | nada | todo lo demás | Reglas. Estado entra, estado sale. |
| `ai/` | `engine/` | `app/`, `ui/`, `services/` | Decidir jugadas y explicarlas con la información que un jugador puede saber. |
| `services/` | `engine/` (solo para serializar) | `app/`, `ui/` | Firebase y `localStorage`. Ningún otro módulo los toca. |
| `app/` | `engine/`, `ai/`, `services/` | `ui/` | Estado de la app y casos de uso. |
| `ui/` | `app/`, `engine/` (lectura) | `services/` directo | Dibujar y traducir clics en acciones. |

Reglas concretas:

- `engine/` y `ai/` no usan `document`, `window`, `localStorage`, `firebase` ni `Date.now()` directo. El tiempo entra como parámetro (`now`) con valor por defecto, igual que ya se hace con `rnd`. *Pendiente:* en la fase 2 el motor se movió sin cambios y todavía llama a `Date.now()` en `newTable`, `deal`, `play` y `pass`; inyectarlo es un cambio de firma que va en su propio PR.
- **Única dependencia circular, a propósito:** `bots.js` ↔ `search.js`. El nivel Avanzado (`botMove`) simula manos completas (`monteCarloMove` → `rolloutFull`), y esas simulaciones juegan con el nivel Intermedio, que es el mismo `botMove`. Es seguro en módulos ES porque son declaraciones de función y ninguna se llama al cargar.
- Ningún módulo exporta variables mutables. El estado compartido vive en `app/store.js`: se exporta el objeto `state` para leerlo, pero **solo los módulos de `app/` lo escriben**; la interfaz lo cambia siempre por medio de una acción. *Excepción pendiente:* `ai/tune.js` exporta `NOISE`, un objeto que `rolloutFull` apaga mientras simula para que el nivel Intermedio juegue sin azar, y lo vuelve a prender al terminar. Se movió tal cual; lo limpio es pasar el ruido como parámetro de `botMove`, en un PR aparte.
- La UI nunca llama a Firestore: pide `actions.play(tile, side)` y `actions` decide si es práctica (local) o en línea (transacción).

## 5. Decisiones

**Módulos ES nativos, sin bundler.** Mantiene el despliegue actual (subir archivos y listo) y no agrega `node_modules` para correr el juego. Se reconsidera solo si el número de archivos llega a afectar la carga; HTTP/2 en GitHub Pages lo hace poco probable.

**Firebase: SDK compat, cargado después de dibujar (fase 7b).** El plan original era pasar al SDK modular porque "pesa menos", pero eso solo es cierto con un empaquetador que quite lo que no se usa, y este proyecto no tiene paso de compilación. Medido con los archivos del CDN de la versión 10.12.2 (app + auth + firestore): compat 512 KB (150 KB comprimido) contra modular 689 KB (173 KB comprimido), es decir, el modular pesa ~15% **más**. Se queda el compat, encapsulado en `services/firebase.js`. Lo que sí costaba era que los tres scripts estaban en el `<head>` y bloqueaban la página: nada se veía, ni la práctica, hasta descargar Firebase. Ahora `services/firebase.js` agrega esos scripts después de dibujar (en paralelo y en orden), así el lobby y la práctica aparecen de inmediato aunque el CDN sea lento. Si más adelante conviene el SDK modular (por soporte a largo plazo), el cambio queda contenido en `services/`.

**Store mínimo hecho a mano.** Un objeto con `get()`, `set(patch)` y `subscribe(fn)` alcanza; no hace falta un framework. `render()` se suscribe al store.

**Pruebas con `node:test`.** Node ya trae corredor de pruebas; basta un `package.json` con `"type": "module"` y `"test": "node --test"` (Node encuentra solo los archivos `*.test.js`). No se agregan dependencias.

**La compu en mesas en línea, sin servidor (#15).** No hay un servidor que ejecute la lógica del juego: Firestore guarda y sincroniza, y cada teléfono aplica las reglas. Por eso a la compu de una mesa en línea la mueve un teléfono: el de la persona sentada en el asiento más bajo; las demás personas sentadas son respaldo (esperan 4 s más). Cada jugada se guarda con una transacción que solo aplica si sigue siendo el mismo turno, así nunca cuentan dos jugadas para un turno. Limitación conocida: si ninguna persona de la mesa tiene el juego abierto, la compu no mueve. Un servidor propio (Cloud Functions o un servidor con WebSockets) resolvería eso, y también permitiría manos privadas y validar jugadas (§8); queda como decisión aparte.

**Web Worker para la IA (fase 7a).** Con `ai/` aislado y puro, lo pesado puede correr en un Worker para que la pantalla no se congele. Medido en posiciones de media mano con 4 jugadores: `botMove` nivel 3 tarda ~280 ms (hasta ~540 ms) y `advise` ~260 ms (hasta ~460 ms); todo lo demás (`deduce`, `tracker`, `speculate`, `explainTile`, niveles 1 y 2) tarda de 0 a ~13 ms. Por eso **solo `botMove` y `advise` van al worker**: mover lo demás costaría más en copiar datos entre hilos de lo que ahorra. Si el navegador no puede crear el worker o este falla al cargar, `app/ai-client.js` calcula en el hilo principal como antes.

## 6. Plan de migración

Cada fase es un PR independiente. Al terminar cada una, el juego se prueba a mano en práctica y en una mesa en línea.

| Fase | Cambio | Riesgo |
|---|---|---|
| 0 ✅ | `DESIGN.md` y actualización del README | ninguno |
| 1 ✅ | Sacar CSS a `styles/` y la configuración a `src/config.js`. El JS sigue igual. | bajo |
| 2 ✅ | Pasar el motor a `src/engine/` como módulos ES y agregar `tests/engine.test.js`. Los dos `<script>` de `index.html` pasan a ser módulos: el primero importa el motor y arma `window.E` con la IA que todavía vive ahí; el segundo es la UI. Desde aquí el juego ya no abre con doble clic. | bajo: el motor ya es puro |
| 3 ✅ | Pasar bots, especulación y consejo a `src/ai/` con `tests/ai.test.js`. El primer `<script>` de `index.html` queda solo para armar `window.E`. Se agregó `heuristics.js` para que `heurScore` (que usan la especulación y los bots) no cree un ciclo entre tres archivos. | bajo |
| 4 ✅ | Pasar Firebase, `localStorage` y `mutate` a `src/services/`. Lo que decide qué ver y qué mensaje mostrar (`view`, `render`, textos de error) se queda en la interfaz; los servicios solo hablan con Firebase y devuelven datos o errores. La interfaz ya importa directo de `src/services/`. | medio: auth y transacciones |
| 5 ✅ | Introducir `app/store.js` y `app/actions.js`; quitar las variables globales de la UI. Además `app/practice.js` (bots de práctica) y `app/clock.js` (reloj de turno). La interfaz ya no tiene variables globales: lee `state`, se suscribe con `subscribe` y pide acciones. Cuando solo cambia la lista de mesas, se redibuja solo la lista (como antes), para no interrumpir a quien está escribiendo su nombre. Se borró el código muerto que habría que mover al store (`userCap`, `sampleCap`, `isOwnerView`, `sleep`, `renderPending`, `cycleNote`). | medio: es el cambio más grande |
| 6 ✅ | Dividir la UI en `ui/screens` y `ui/components`; que la UI importe del motor y la IA en vez de usar `window.E`, y quitar el `<script>` que lo arma. `index.html` queda en 20 líneas y carga `src/main.js`. Diferencias con la propuesta: `labels.js` reúne textos compartidos por lobby, mesa y registro; `screens/seats.js` y `components/result.js` son archivos propios; el manejo de tu mano (tocar, girar, arrastrar) se queda dentro de `screens/table.js` porque depende de las jugadas válidas que calcula esa pantalla; `askAdvice` y las notas ya vivían en `app/actions.js` desde la fase 5. Para no crear ciclos, las pantallas piden redibujar con `notify()` de `app/` en lugar de importar `render`. | bajo |
| 7a ✅ | IA en Web Worker: `ai/worker.js` y `app/ai-client.js`; la compu Avanzada y el consejo se calculan en un hilo aparte (ver §5). En una partida de práctica con las tres compus en Avanzado y pidiendo consejo cada turno, el hilo de la pantalla pasó de 21 bloqueos (el más largo de 817 ms, 6.6 s en total) a ninguno. Se borraron los estilos sobrantes de una tarjeta "Opus" que ya no existía. | medio |
| 7b ✅ | En lugar del SDK modular (que desde el CDN pesa más, ver §5): cargar el SDK compat después de dibujar, no en el `<head>`. Con el CDN tardando 3 s, el lobby aparece a los 0.3 s en vez de a los 3.5 s; el modo en línea queda listo ~0.15 s después que antes. | bajo |

### Interfaz sin scroll (#20)

- **Parte 1 ✅:** pantalla de inicio (variante A del diseño), ventanas de "Nueva mesa", "Practicar" y "Tu perfil", y la pantalla de asientos con un menú por asiento. Ninguna pantalla se desplaza; si hay muchas mesas, solo se desplaza la lista.
- **Parte 2 ✅:** el menú de la partida, el registro de cada jugador, el consejo y el resultado de la mano usan la misma ventana. Se abre una a la vez (menú > resultado > consejo > registro). El resultado no tiene ✕: hay que escoger "Siguiente mano" o "Salir". La lista de jugadas y la leyenda del registro son secciones que se abren y se cierran, y se quedan como las dejaste aunque la ventana se redibuje (por ejemplo, cuando juega la compu).
- **Ventanas y el botón "atrás":** lo abierto vive en `state.view` (`sheet`, `seatMenu`, `track`, `advice`). El historial sigue al estado: después de cada dibujo, `syncOverlayHistory()` agrega una entrada (`pushState`) si algo se abrió (también si lo abrió `app/`, como el consejo) y la quita (`history.back()`) si se cerró (✕, tocar fuera, Esc, cambió el turno, empezó otra mano o entraste a una mesa). Así "atrás" siempre cierra la ventana en lugar de salir del juego. Como `history.back()` no es inmediato, no se vuelve a llamar hasta recibir `popstate` (si no, dos cierres seguidos sacaban al usuario del juego).

### Pendientes conocidos (fuera de las fases)

- **Inyectar el reloj en el motor:** `newTable`, `deal`, `play` y `pass` todavía llaman a `Date.now()` (§4).
- **`NOISE` como parámetro:** `ai/tune.js` exporta un objeto mutable que `rolloutFull` apaga mientras simula (§4).
- **Prueba con Firebase real:** dominio autorizado, reglas de Firestore y login con Google (ver abajo).

### Cómo se prueba lo que toca Firebase

Firebase real no se puede usar en las pruebas automáticas, así que hay dos redes de seguridad:

- `tests/services.test.js` corre los servicios contra un Firebase de mentira en memoria (`tests/fakes/firebase.js`): guardar y leer mesas, transacciones, `SKIP`, borrar, errores, entrar como invitado, Google con ventana o redirección, y salir.
- En cada fase que toca servicios o interfaz, se juega una partida en línea completa en el navegador con dos jugadores (contextos separados) y un Firebase de mentira inyectado en lugar del CDN, en `main` y en la rama, y se comparan las pantallas y los documentos guardados.
- Desde la fase 5 también se hace un recorrido por toda la interfaz con el reloj del navegador detenido (`page.clock`), comparando el HTML de la pantalla y lo guardado en el dispositivo después de cada paso.

La prueba con el Firebase real (dominio autorizado, reglas de Firestore, login con Google) queda para el final de la migración.

### Grabación de partidas (#25)

Cada mano que termina se graba en Firestore para entrenar y evaluar el motor de lectura (#24). No se ve en la interfaz.

- **Qué se graba:** un documento por mano en la colección `manos`, con id `<partida>_<mano>`: partida, modo (en línea o práctica), versión del juego, configuración, jugadores (nombre, id, persona o compu con su nivel), reparto inicial (manos, pozo, muestra, quién sale), cada evento con su hora y quién lo decidió (`human`, `bot` o `auto` si fue el reloj), tiempo de decisión (`ms`) y resultado con el marcador antes y después. El formato está en `engine/record.js`.
- **De dónde sale:** el motor guarda cómo empezó la mano (`hand.start`), el id de la partida (`gameId`, nuevo en cada primera mano) y la hora de cada evento (`t`). `app/recording.js` se suscribe al estado y, cuando ve una mano terminada, la arma con `buildHandRecord`. Las horas vienen del reloj del teléfono que aplicó cada jugada, así que en línea el tiempo de decisión puede tener algo de ruido.
- **Cola y subida:** `app/recorder.js` guarda cada mano en `localStorage` (`dom.rec`, máximo 150) y la sube cuando hay conexión. Si la subida falla por conexión, se reintenta al terminar la siguiente mano o al volver a abrir el juego. Nunca muestra errores.
- **Sin duplicados:** en línea graban todos los teléfonos con persona sentada (quien solo mira no graba). Las reglas (`firestore.rules`) solo permiten **crear**: el segundo intento de la misma mano se rechaza con `permission-denied` y se descarta. Por eso **las reglas deben publicarse antes que esta versión del juego**: sin ellas, Firestore rechaza todo y las manos se descartan.
- **Lectura:** los teléfonos no pueden leer, cambiar ni borrar la colección. `scripts/export-partidas.mjs` las descarga con una cuenta de servicio y las agrupa en partidas (`groupGames`): una por línea, marcada `finished` o `abandoned`.
- **Reproducir:** `replayHand(registro)` vuelve a jugar la mano con las reglas del motor y llega al mismo resultado; las pruebas lo verifican.
- **Límite:** solo se graban manos terminadas. Si se abandona una mano a la mitad, esa mano no queda (la partida aparece como `abandoned`).

### Perfiles de la compu (#27)

Todos los bots usan los mismos criterios de decisión. Lo que cambia entre uno y otro es el perfil, que es solo datos (`ai/profiles.js`) y tiene dos ejes independientes:

- **Estilo:** cuánto pesa cada criterio de `ai/criteria.js` (documento "Tácticas del dominó por parejas": A mi mano, B mi pareja, C rivales, D mesa, F resultado), qué tanto reacciona a la situación (modificadores de **peligro**, **fase**, **marcador** y **fuerza de la mano**: peso × (1 + sensibilidad × (factor − 1))) y su factor aleatorio.
- **Capacidad mental** (`ai/mind.js`):
  - **Memoria:** cuánto retiene, qué tan rápido olvida, qué recuerda mejor (pases, mulas, fichas altas, pareja, salida), si cuenta lo jugado (`exacta`, `memoria` o `no`) y si recuerda quién tiró cada ficha. Olvidar es reproducible: el umbral de cada evento sale de un hash de partida, mano, asiento y evento, y como el recuerdo solo baja con el tiempo, lo olvidado no regresa. El bot nunca recuerda algo falso: solo menos.
  - **Deducción** de 0 a 3 (solo puntas; cuenta; pases; eliminación cruzada exacta con `possibleHolders`, el núcleo de `deduce`). Las fichas de la mesa que ya no tiene contadas van a un poseedor "mesa", así que la deducción sigue siendo correcta.
  - **Análisis:** sospechas (`speculate`, solo con memoria perfecta), anticipación (a cuántos jugadores siguientes mira) y cálculo (Monte Carlo).

**Factor aleatorio** (`ai/decide.js`): entran al sorteo solo las jugadas dentro de una *ventana de duda* debajo de la mejor, medida con la escala típica de puntaje de cada perfil (mediana de mejor − segunda, `scripts/torneo.mjs --escala`). Entre esas se escoge con softmax de temperatura baja. Una jugada claramente mejor sale siempre. Ningún perfil es determinista, y en simulaciones y pruebas el azar se puede fijar.

**Catálogo:** Bot 01-03 son los niveles de siempre y, con el azar apagado, deciden exactamente igual que antes (`tests/fixtures/legacy-bots.js`). Bot 04-20 combinan 8 estilos (descargador, controlador, escudero, castigador, contador, apostador, completo, equilibrado) con 5 capacidades (distraído, casual, atento, experto, maestro). Un asiento de la compu juega con `seat.perfil` si lo tiene, o con el perfil de su `level`.

**Torneo** (`ai/tournament.js`, `scripts/torneo.mjs`): cada perfil juega en pareja contra el Intermedio, alternando asientos, y se reporta qué tanto gana y su huella de estilo (mula en las primeras jugadas, cuadres, puntos soltados, cuántas veces hace pasar al siguiente, cuántas veces corta el número de su pareja).

Hallazgo al migrar: en el `botMove` anterior, la rama de anticipación con `TUNE.blk`, `fr`, `riv`, `urg`, `w2`, `w3` y `pn` nunca se ejecutaba (el nivel 3 salía antes, por el Monte Carlo). Esa lógica ahora es el criterio `anticipacion`, que usan los perfiles atento, experto y maestro.

## 7. Consecuencias

- **Ya no funciona con doble clic (desde la fase 2).** Los navegadores bloquean módulos ES desde `file://`. Para jugar localmente hay que usar un servidor estático (`python3 -m http.server`), lo que el README ya recomienda.
- **Más archivos que publicar.** Sin impacto en GitHub Pages; solo hay que subir la carpeta completa en lugar de un archivo.
- **Las mesas guardadas no cambian.** El formato del documento en Firestore (`json`, `code`, `created`, `updated`) se mantiene, así que mesas abiertas antes y después de la migración son compatibles.

## 8. Fuera de alcance

- Cambiar reglas, niveles de los bots o la interfaz.
- **Seguridad del juego en línea.** Hoy el estado completo, incluidas las manos de todos, se guarda en un solo documento que cualquier jugador de la mesa puede leer, y cada cliente aplica las reglas. Evitar trampas requeriría manos privadas por jugador y validar jugadas en el servidor (reglas de Firestore o Cloud Functions). La estructura modular lo facilita, porque `engine/` podría correr también en el servidor, pero es un trabajo aparte.
