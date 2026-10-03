# Dominó de la Familia

Juego de dominó doble seis en el navegador, para jugar en familia desde cualquier teléfono o computadora. Puedes armar mesas multijugador en tiempo real o practicar contra la compu en tres niveles de dificultad.

Todo vive en un solo archivo, `index.html`: HTML, CSS y JavaScript sin dependencias de compilación. Las partidas en línea se sincronizan con Firebase.

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

Sírvelo con cualquier servidor estático. Abrirlo con doble clic (`file://`) puede impedir que funcione el inicio de sesión de Firebase.

```bash
# desde la carpeta del repo
python3 -m http.server 8000
# abre http://localhost:8000
```

## Usar tu propio proyecto de Firebase

El archivo trae la configuración del proyecto `dominomx`. Para usar uno tuyo:

1. Crea un proyecto en la [consola de Firebase](https://console.firebase.google.com/) y agrega una **app web**.
2. Copia su configuración en el bloque marcado al inicio de `index.html`:
   ```js
   // ====== PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE ======
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

- HTML, CSS y JavaScript sin frameworks ni proceso de compilación
- Firebase 10.12 (SDK *compat*): App, Authentication (anónimo y Google) y Cloud Firestore
- Tipografías: Alfa Slab One y Nunito Sans (Google Fonts)

## Estructura

```
myDomino/
├── index.html   # todo el juego: motor de reglas, bots, interfaz y sincronización
└── README.md
```

Dentro de `index.html` el código está organizado en estas partes:

- **Motor del juego:** reparto, jugadas válidas, comer, pasar, fin de mano y puntuación.
- **Bots:** deducción de fichas, simulaciones Monte Carlo y heurísticas por nivel.
- **Dibujo:** las fichas y la hilera de la mesa en SVG.
- **Interfaz:** lobby, mesa, consejo y notas.
- **Firebase:** autenticación y lectura/escritura de mesas en Firestore. Cada mesa se guarda como JSON en un solo documento.
