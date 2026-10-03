# Dominó de la Familia

Juego de dominó doble seis en el navegador, para jugar en familia desde cualquier teléfono o computadora. Puedes armar mesas multijugador en tiempo real o practicar contra la compu en tres niveles de dificultad.

Está hecho con HTML, CSS y JavaScript en módulos, sin dependencias ni paso de compilación, y las partidas en línea se sincronizan con Firebase (ver [Arquitectura](#arquitectura)).

## Características

- **Multijugador en tiempo real:** creas una mesa, los demás se unen desde *Mesas abiertas* y todos ven la partida al instante.
- **Práctica contra la compu:** juegas solo contra bots, sin necesidad de otros jugadores.
- **Tres niveles de bot:** Básico, Intermedio y Avanzado. Los bots solo usan información legítima: su propia mano, la mesa y lo que cada jugador ha tirado, comido o pasado. Nunca ven fichas ajenas.
- **Consejo:** muestra qué ficha tiraría cada uno de los tres niveles y por qué.
- **Registro de fichas:** deduce qué fichas puede o no tener cada jugador según el historial de la mano.
- **Notas:** marca una ficha de otro jugador como "creo que sí la tiene" o "creo que no".
- **Tu mano:** toca una ficha para girarla y arrástrala para acomodarla.
- **Cuenta con Google (opcional):** entras con Google y eres el mismo jugador en cualquier dispositivo. Si no, juegas como invitado.
- **Tema claro y oscuro,** según la configuración del sistema.

## Modos de juego

| Jugadores | Reparto | Notas |
|---|---|---|
| 2 | 7 fichas + pozo | |
| 2 | 14 fichas, sin pozo | |
| 3 | 7 fichas + pozo | |
| 3 | 9 fichas + muestra | |
| 4 | 7 fichas | Individual o en parejas |

- **Tiempo por turno:** 20 s por turno y 15 s para decidir quién sale. También se puede jugar sin límite de tiempo. Si se acaba el tiempo, la compu juega por ti.
- **Puntuación (puntos en contra):**
  - **2 jugadores o parejas:** quien pierde la mano se anota en contra los puntos que le quedaron; en parejas se suman los de los dos.
  - **3 o 4 individual:** todos se anotan en contra los puntos que les quedaron.
  - Si el juego se cierra (tranque), gana la mano quien tenga menos puntos.
  - La partida termina cuando alguien llega a **100 puntos en contra**, y gana quien tenga menos.

## Cómo jugarlo

### Opción 1: GitHub Pages (recomendada)

1. En el repo, ve a **Settings → Pages**.
2. En *Source*, elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. En uno o dos minutos el juego estará en `https://<usuario>.github.io/myDomino/`.

### Opción 2: localmente

Sírvelo con cualquier servidor estático. Abrirlo con doble clic (`file://`) no funciona: el juego usa módulos ES y los navegadores no los cargan desde archivos locales.

```bash
# desde la carpeta del repo
python3 -m http.server 8000
# abre http://localhost:8000
```

## Usar tu propio proyecto de Firebase

El repo trae la configuración del proyecto `dominomx`. Para usar uno tuyo:

1. Crea un proyecto en la [consola de Firebase](https://console.firebase.google.com/) y agrega una **app web**.
2. Copia su configuración en `src/config.js`:
   ```js
   window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", ... };
   ```
3. En **Authentication → Sign-in method**, habilita **Anónimo** (para invitados) y **Google**.
4. En **Authentication → Settings → Authorized domains**, agrega el dominio donde lo publiques (por ejemplo, `<usuario>.github.io`).
5. Crea una base de datos **Cloud Firestore**. Las mesas se guardan en la colección `mesas`.

### Reglas de seguridad

La `apiKey` de una app web de Firebase no es secreta, así que lo que protege los datos son las reglas de Firestore. Como mínimo, exige que el usuario haya iniciado sesión (los invitados entran de forma anónima) y limita el acceso a la colección `mesas`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /mesas/{mesa} {
      allow read, write: if request.auth != null;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

No dejes la base en *modo de prueba*: en ese modo cualquiera puede leer o borrar las mesas.

## Stack

- HTML, CSS y JavaScript (módulos ES nativos), sin frameworks ni proceso de compilación
- Firebase 10.12 (SDK *compat*): App, Authentication (anónimo y Google) y Cloud Firestore
- Tipografías: Alfa Slab One y Nunito Sans (Google Fonts)

## Arquitectura

El juego está dividido en módulos ES nativos, **sin paso de compilación**: el navegador los carga tal cual, y se publica igual que antes en GitHub Pages. Las dependencias van en una sola dirección:

```
ui/  →  app/  →  ai/  →  engine/
          ↘ services/ (Firebase, localStorage)
```

- **`engine/`** sabe las reglas: recibe el estado de la mesa y devuelve uno nuevo.
- **`ai/`** decide y explica jugadas con lo que un jugador puede saber.
- **`services/`** es lo único que habla con Firebase y `localStorage`.
- **`app/`** guarda el estado de la app y lo cambia con acciones.
- **`ui/`** solo dibuja y convierte clics en acciones.

El detalle (reglas de dependencia, decisiones, cómo se hizo la migración y pendientes) está en [DESIGN.md](DESIGN.md).

```
myDomino/
├── index.html          # esqueleto de la página: carga los estilos, Firebase y src/main.js
├── styles/
│   ├── reset.css       # reset mínimo de la página
│   ├── tokens.css      # colores, tipografía y tema claro/oscuro
│   ├── base.css        # paneles, formularios y botones
│   ├── lobby.css       # lista de mesas
│   └── table.css       # mesa, registro, consejo, tu mano, resultado y menú
├── src/
│   ├── main.js         # arranque
│   ├── config.js       # configuración de Firebase
│   ├── engine/         # reglas del dominó (funciones puras)
│   │   ├── tiles.js       # fichas: notación, puntos, juego completo, revolver
│   │   ├── config.js      # modos de juego válidos, pozo, equipos, meta de 100
│   │   ├── table.js       # mesa nueva, reparto, turnos, registro de jugadas
│   │   ├── moves.js       # jugadas válidas, tirar, comer, pasar
│   │   ├── scoring.js     # fin de mano y puntos en contra
│   │   ├── timing.js      # tiempo por turno y jugada automática
│   │   └── index.js       # API del motor
│   ├── ai/             # jugadores de la compu y consejo (funciones puras)
│   │   ├── tune.js        # niveles y parámetros
│   │   ├── heuristics.js  # criterios de jugada compartidos
│   │   ├── deduce.js      # registro: qué fichas puede tener cada quien
│   │   ├── speculate.js   # leer los tiros ajenos como decisiones (probabilidades)
│   │   ├── search.js      # simulaciones Monte Carlo
│   │   ├── bots.js        # plan de salida y jugada de cada nivel
│   │   ├── advice.js      # consejo: qué tiraría cada nivel y por qué
│   │   └── index.js       # API de la IA
│   ├── services/       # todo lo que toca el exterior
│   │   ├── firebase.js    # arranque, invitado, entrar con Google, salir
│   │   ├── tables-repo.js # mesas en Firestore: guardar, escuchar, cambios con transacción
│   │   ├── prefs.js       # preferencias del dispositivo en localStorage
│   │   └── index.js       # API de servicios
│   ├── app/            # estado de la app y lo que lo cambia
│   │   ├── store.js       # el estado (pantalla, mesa abierta, modo, tu mano, notas…) y quién lo escucha
│   │   ├── actions.js     # todo lo que cambia el estado: mesas, práctica, preferencias, consejo…
│   │   ├── practice.js    # la compu en modo práctica
│   │   ├── clock.js       # reloj de turno
│   │   └── index.js       # API de la app
│   └── ui/             # lo que se ve
│       ├── render.js      # escoge la pantalla
│       ├── dom.js         # utilidades del DOM
│       ├── labels.js      # textos compartidos: modo, marcadores, colores, nivel de la compu
│       ├── clock.js       # pinta el reloj de turno
│       ├── svg/           # fichas y la cadena en la mesa
│       ├── screens/       # lobby, escoger asiento, mesa de juego (con tu mano)
│       └── components/    # registro, consejo y resultado
├── tests/
│   ├── engine.test.js  # pruebas del motor
│   ├── ai.test.js      # pruebas de la IA
│   ├── services.test.js # pruebas de los servicios
│   ├── app.test.js     # pruebas del estado y las acciones
│   └── fakes/          # Firebase de mentira para las pruebas
├── package.json        # solo para correr las pruebas
├── DESIGN.md           # diseño y decisiones de la estructura modular
└── README.md
```

### Pruebas

El motor, la IA, los servicios y el estado de la app tienen pruebas que corren con Node (18 o más nuevo), sin instalar nada:

```bash
npm test
```

- **Motor:** el reparto en cada modo, jugadas válidas, comer y pasar, la puntuación (dominó, tranque, empates, fin de partida) y partidas completas con jugadas automáticas.
- **IA:** los tres niveles solo hacen jugadas válidas en todos los modos, el registro respeta lo que se sabe (quién pasó), el plan de salida, el consejo y las probabilidades de la especulación. Además hay una prueba de que **la compu no hace trampa**: si se reacomodan las fichas que un jugador no puede ver, su decisión y el consejo no cambian.
- **Servicios:** con un Firebase de mentira en memoria: guardar y leer mesas (con listas dentro de listas), la lista de mesas recientes, cambios con transacción (cancelar, borrar, jugada inválida, mesa que ya no existe), entrar como invitado, entrar con Google (ventana o redirección), salir y `localStorage` bloqueado.
- **App:** practicar (la compu en sus asientos y con sus niveles, y juega sola cuando le toca), el reloj de turno (cuenta atrás y resuelve el turno vencido una sola vez), preferencias guardadas en el dispositivo, el orden y giro de tu mano, las notas, una mesa en línea de principio a fin con un Firebase de mentira, entrar con Google y el consejo.
