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
- **El cálculo pesado bloquea la pantalla.** La especulación y el Monte Carlo corren en el hilo principal; separarlos es requisito para moverlos a un Web Worker.

## 2. Principios

1. **Sin compilación.** Módulos ES nativos (`<script type="module">`), servidos como archivos estáticos. GitHub Pages sigue funcionando igual.
2. **Dependencias en una sola dirección.** Las capas de abajo no conocen a las de arriba (ver §4).
3. **El motor y la IA son funciones puras** sin DOM, sin Firebase, sin `localStorage`. Reloj y aleatoriedad se inyectan.
4. **Un solo dueño para el estado de la app.** Las vistas leen del store y piden cambios; no modifican variables globales.
5. **Cero cambios de comportamiento durante la migración.** Cada fase es un PR que mueve código, no lo reescribe, y el juego funciona igual al terminar cada una.

## 3. Estructura propuesta

```
myDomino/
├── index.html                 # solo el esqueleto: <div id="app">, CSS y <script type="module" src="src/main.js">
├── styles/
│   ├── tokens.css             # variables de color y tipografía, tema claro/oscuro
│   ├── base.css               # reset, botones, paneles, formularios
│   ├── lobby.css
│   └── table.css              # paño, fichas, mano, marcador, consejo
├── src/
│   ├── main.js                # arranque: carga config, inicia Firebase, monta la app
│   ├── config.js              # FIREBASE_CONFIG (único archivo a editar para usar otro proyecto)
│   │
│   ├── engine/                # reglas del dominó — puro, probado con Node
│   │   ├── tiles.js           # T, P, pts, isDbl, fullSet, shuffle, sumHand
│   │   ├── config.js          # validConfig, hasPozo, teamOf, nScores, TARGET
│   │   ├── table.js           # newTable, newGame, deal, nameOf
│   │   ├── moves.js           # legalPlays, play, draw, pass, canDraw, canPass, ends
│   │   ├── scoring.js         # endHand (puntos en contra, tranque, campeón)
│   │   ├── timing.js          # limitMs, autoMove
│   │   └── index.js           # reexporta la API pública del motor
│   │
│   ├── ai/                    # jugadores de la compu y consejo — puro, probado con Node
│   │   ├── tune.js            # TUNE, LEVELS, NOISE
│   │   ├── deduce.js          # deduce, tracker (qué fichas puede tener cada quien)
│   │   ├── speculate.js       # inferenceEvents, logLikelihood, weightedAssigns, speculate, explainTile
│   │   ├── search.js          # sampleWorld, rollout, worldsFor, monteCarloMove
│   │   ├── bots.js            # heurScore, openingPlan, botMove (por nivel)
│   │   └── advice.js          # advise
│   │
│   ├── services/              # todo lo que toca el exterior
│   │   ├── firebase.js        # initializeApp, auth (anónimo + Google), applyUser
│   │   ├── tables-repo.js     # adaptador de Firestore (makeDb), subscribeList, openTable, mutate
│   │   └── prefs.js           # wrapper seguro de localStorage: nombre, niveles, timer, orden de la mano
│   │
│   ├── app/                   # estado y casos de uso de la app
│   │   ├── store.js           # view, tableState, config, me, listCache + subscribe/notify
│   │   ├── actions.js         # createTable, startPractice, leave, jugar/comer/pasar vía mutate
│   │   ├── practice.js        # botActor, scheduleBot, openDelayMs (bots en modo práctica)
│   │   └── clock.js           # reloj de turno (tick, turnKey)
│   │
│   └── ui/                    # vista: produce HTML/SVG y conecta eventos
│       ├── dom.js             # $, esc
│       ├── render.js          # render() raíz: elige pantalla
│       ├── svg/
│       │   ├── tile.js        # half, tileSVG, tileG
│       │   └── chain.js       # layoutChain, layoutChainAt, chainSVG
│       ├── screens/
│       │   ├── lobby.js       # renderLobby, renderTables, authBox, levelSeg
│       │   └── table.js       # renderTable, renderSeats, renderResult
│       └── components/
│           ├── hand.js        # handArrangement, arrastrar y girar
│           ├── advice.js      # askAdvice, renderAdvice
│           ├── tracker.js     # renderTracker, tileDetail
│           └── notes.js       # cycleNote
└── tests/
    ├── engine.test.js         # reparto, jugadas, tranque, puntuación por modo
    └── ai.test.js             # los bots solo devuelven jugadas legales y no ven fichas ajenas
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

- `engine/` y `ai/` no usan `document`, `window`, `localStorage`, `firebase` ni `Date.now()` directo. El tiempo entra como parámetro (`now`) con valor por defecto, igual que ya se hace con `rnd`.
- Ningún módulo exporta variables mutables. El estado compartido vive en `app/store.js` y se cambia solo con sus funciones.
- La UI nunca llama a Firestore: pide `actions.play(tile, side)` y `actions` decide si es práctica (local) o en línea (transacción).

## 5. Decisiones

**Módulos ES nativos, sin bundler.** Mantiene el despliegue actual (subir archivos y listo) y no agrega `node_modules` para correr el juego. Se reconsidera solo si el número de archivos llega a afectar la carga; HTTP/2 en GitHub Pages lo hace poco probable.

**Firebase: primero sin cambios, luego SDK modular.** En las primeras fases se siguen cargando los scripts *compat* como globales, encapsulados en `services/firebase.js`, para que la migración no cambie comportamiento. Después, en un PR aparte, se puede pasar a los imports modulares desde el CDN (`https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js`, etc.), que pesan menos.

**Store mínimo hecho a mano.** Un objeto con `get()`, `set(patch)` y `subscribe(fn)` alcanza; no hace falta un framework. `render()` se suscribe al store.

**Pruebas con `node:test`.** Node ya trae corredor de pruebas; basta un `package.json` con `"type": "module"` y `"test": "node --test tests/"`. No se agregan dependencias.

**Web Worker para la IA (después).** Con `ai/` aislado y puro, `speculate` y `monteCarloMove` pueden correr en un Worker para que la pantalla no se congele en el nivel Avanzado. Queda fuera de esta migración, pero es la razón de separar `ai/` de `engine/`.

## 6. Plan de migración

Cada fase es un PR independiente. Al terminar cada una, el juego se prueba a mano en práctica y en una mesa en línea.

| Fase | Cambio | Riesgo |
|---|---|---|
| 0 | `DESIGN.md` y actualización del README | ninguno |
| 1 | Sacar CSS a `styles/` y la configuración a `src/config.js`. El JS sigue igual. | bajo |
| 2 | Pasar el motor a `src/engine/` como módulos ES y agregar `tests/engine.test.js`. La UI importa `E` desde ahí. | bajo: el motor ya es puro |
| 3 | Pasar bots, especulación y consejo a `src/ai/` con `tests/ai.test.js`. | bajo |
| 4 | Pasar Firebase, `localStorage` y `mutate` a `src/services/`. | medio: auth y transacciones |
| 5 | Introducir `app/store.js` y `app/actions.js`; quitar las variables globales de la UI. | medio: es el cambio más grande |
| 6 | Dividir la UI en `ui/screens` y `ui/components`; borrar código muerto. | bajo |
| 7 (opcional) | IA en Web Worker; SDK modular de Firebase. | medio |

## 7. Consecuencias

- **Ya no funciona con doble clic.** Los navegadores bloquean módulos ES desde `file://`. Para jugar localmente hay que usar un servidor estático (`python3 -m http.server`), lo que el README ya recomienda.
- **Más archivos que publicar.** Sin impacto en GitHub Pages; solo hay que subir la carpeta completa en lugar de un archivo.
- **Las mesas guardadas no cambian.** El formato del documento en Firestore (`json`, `code`, `created`, `updated`) se mantiene, así que mesas abiertas antes y después de la migración son compatibles.

## 8. Fuera de alcance

- Cambiar reglas, niveles de los bots o la interfaz.
- **Seguridad del juego en línea.** Hoy el estado completo, incluidas las manos de todos, se guarda en un solo documento que cualquier jugador de la mesa puede leer, y cada cliente aplica las reglas. Evitar trampas requeriría manos privadas por jugador y validar jugadas en el servidor (reglas de Firestore o Cloud Functions). La estructura modular lo facilita, porque `engine/` podría correr también en el servidor, pero es un trabajo aparte.
