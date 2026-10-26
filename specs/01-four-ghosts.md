# 01 — Cuatro fantasmas con comportamientos propios

**Estado:** Approved
**Fecha:** 2026-10-25

## Objetivo

Cuatro fantasmas con cuatro comportamientos distintos —uno persiguiendo agresivamente a Pac-Man— que salen de la pen escalonados.

## Alcance

**Entra:**

- Cuatro `GHOST_STARTS` con `kind` y `releaseDelay`.
- Un selector greedy único y un helper de distancia con wrap.
- Congelamiento en la pen, salida escalonada por la puerta y bloqueo posterior.
- Reset de posiciones y tiempos al perder una vida.
- Colores asignados por índice en `render.js`.

**No entra (van a otras specs):**

- Fases scatter/chase, modo asustado / power pellets.
- Velocidades diferenciadas por fantasma.
- Re-entrada a la pen, sprites nuevos, puntaje por comer fantasmas, sonido.

## Modelo de datos

```js
// src/js/maze.js — orden del array = índice de color en render.js
const GHOST_STARTS = [ { x, y, kind, releaseDelay } ];

// src/js/game.js → createGame()
game = {
  tick: 0, // frames desde el arranque o desde el último reset
  ghosts: [ {
    x, y,                  // celdas, origen arriba-izquierda
    dir: 'up',             // 'left' | 'right' | 'up' | 'down'
    speed: 0.1,            // celdas/frame
    kind,                  // 'aggressive' | 'ambusher' | 'flanker' | 'shy'
    releaseAt: 0,          // frame absoluto; al crear = releaseDelay
    exiting: false,        // true mientras cruza la pen
  } ],
};

// src/js/game.js
GHOST_BEHAVIORS[ kind ] = ( game, ghost ) => ( { x, y } ); // target en celdas
```

Convenciones:

- Distancia entre celdas: `min(|dx|, 28 − |dx|) + |dy|`, con las posiciones redondeadas.
- `tick` sube una vez por `update()` y vuelve a 0 en `resetPositions()`.

## Contexto actual

- `maze.js` define `GHOST_STARTS` con **2** fantasmas dentro de la pen: `hunter` (Manhattan greedy) y `random`.
- `game.js` → `decideGhost()` elige dirección; `hunter` minimiza distancia Manhattan, el resto es aleatorio.
- `render.js` ya tiene 4 colores en `GHOST_COLORS`, asignados por índice.
- La puerta (tile 3) hoy es atravesable por fantasmas en **ambos** sentidos (`isWall`). Con targeting greedy eso los deja atrapados en la pen: hay que cerrarla salvo durante la salida.

## Comportamientos

Misma velocidad (`GHOST_SPEED = 0.1`). Sin giro de 180° salvo callejón sin salida. Desempate determinista por orden `left, right, up, down`. Distancia entre celdas con wrap del túnel: `min(|dx|, W − |dx|) + |dy|`.

| # | kind | Color | Target |
|---|------|-------|--------|
| 1 | `aggressive` | rojo `#ff0000` | celda actual de Pac-Man (persecución directa, greedy) |
| 2 | `ambusher` | rosa `#ffb8ff` | celda de Pac-Man + 4 en su dirección |
| 3 | `flanker` | cian `#00ffff` | `2·(P + 2·dir) − A`, con `A` = posición del `aggressive` |
| 4 | `shy` | naranja `#ffb852` | distancia > 8 → Pac-Man; si no → esquina `(1, 29)` |

Cada comportamiento se reduce a una función `target(game, ghost) → {x, y}`; el selector greedy es único y compartido.

## Salida de la pen (escalonada)

```js
GHOST_STARTS = [
  { x: 13, y: 11, kind: 'aggressive', releaseDelay: 0   }, // fuera, sobre la puerta
  { x: 12, y: 14, kind: 'ambusher',   releaseDelay: 60  }, // pen
  { x: 13, y: 14, kind: 'flanker',    releaseDelay: 180 }, // pen
  { x: 14, y: 14, kind: 'shy',        releaseDelay: 300 }, // pen
];
```

Cada fantasma guarda `releaseAt` (frame absoluto) y `exiting`.

- `game.tick < ghost.releaseAt` → congelado en la pen (no se mueve).
- `exiting` → `dir = x !== 13 ? (x < 13 ? 'right' : 'left') : 'up'`, usando el actor `'ghost-exiting'`, único que puede cruzar la puerta.
- Al alcanzar `y <= 11` → `exiting = false` y pasa a comportamiento normal.

## Plan de implementación

Cada paso deja el juego jugable. Abrí `src/index.html` después de cada uno para revisar el diff.

1. **`maze.js` — cuatro arranques.** Reemplazar `GHOST_STARTS` por las 4 entradas con `kind` y `releaseDelay`.
   Test manual: se ven 4 fantasmas y la consola queda limpia.
2. **`game.js` — reloj, espera y salida por la puerta.** Agregar `tick: 0` al estado e incrementarlo al inicio de `update()`; guardar `releaseAt` y `exiting` en `createGame()`; cortar `moveGhost()` si `game.tick < g.releaseAt`; `isWall()` bloquea el tile 3 salvo para `'ghost-exiting'`; forzar `dir` mientras `exiting` y apagarlo al llegar a `y <= 11`.
   Test manual: los 3 salen escalonados, cruzan la puerta una sola vez y no vuelven a entrar.
3. **`game.js` — comportamientos y selector único.** Agregar `cell()`, `cellDistance()` (con wrap), `GHOST_BEHAVIORS` con los 4 targets y reemplazar el `if hunter / else random` de `decideGhost()` por el greedy compartido.
   Test manual: el rojo persigue; el rosa se adelanta; el cian flanquea; el naranja se retira cuando está cerca.
4. **`game.js` — reset de vida.** `resetPositions()` restaura `releaseAt` y `exiting`, y vuelve `tick` a 0.
   Test manual: al perder una vida todos vuelven a su celda y repiten la salida escalonada; a la tercera aparece `PERDISTE`.
5. **`render.js` — colores.** Reordenar `GHOST_COLORS` a rojo, rosa, cian, naranja.
   Test manual: cada fantasma sale con el color de su `kind`.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/js/maze.js` | 4 entradas en `GHOST_STARTS` con `releaseDelay` |
| `src/js/game.js` | `tick` en el estado + incremento en `update()`; `GHOST_BEHAVIORS[kind] → target`; target unificado en `decideGhost()`; helper de distancia con wrap; `isWall` → puerta bloquea salvo `'ghost-exiting'`; `moveGhost()` con espera y salida de la pen; `resetPositions()` restaura `releaseAt`, `exiting` y `tick = 0` |
| `src/js/render.js` | Reordenar `GHOST_COLORS` a `[rojo, rosa, cian, naranja]` |

Sin cambios en `main.js`, `index.html`, `style.css`.

## Criterios de aceptación

- [ ] Al iniciar hay 4 fantasmas visibles con los 4 colores indicados.
- [ ] Solo el `aggressive` arranca fuera de la pen; los otros 3 salen escalonados y alcanzan la zona jugable.
- [ ] El `aggressive` es el fantasma que más se acerca a Pac-Man en 10 s de juego.
- [ ] `ambusher` apunta delante de Pac-Man, `flanker` al vector de flanqueo y `shy` se retira a su esquina cuando está a ≤ 8 celdas.
- [ ] Ningún fantasma vuelve a entrar por la puerta después de salir.
- [ ] Cruzar el túnel no confunde a ningún fantasma (distancia con wrap).
- [ ] Perder una vida resetea posiciones y tiempos de salida; a la tercera vida → `PERDISTE`.
- [ ] Se puede ganar comiendo todos los dots; sin errores en consola.

## Decisiones

- **Sí:** cuatro `kind` fijos en `GHOST_STARTS` en vez de configuración externa. Son cuatro y el spec los nombra; un archivo de config solo agrega indirección.
- **Sí:** cada comportamiento es una función `target(game, ghost) → {x, y}` y hay un único selector greedy. Evita cuatro copias de la lógica de movimiento.
- **Sí:** la puerta (tile 3) bloquea a todos salvo al actor `'ghost-exiting'`. Con el greedy anterior los fantasmas quedaban encerrados o volvían a entrar.
- **Sí:** salida de la pen con regla fija (`x !== 13 ? … : 'up'`) en vez de pathfinding. La pen son 6 celdas y el camino siempre es el mismo.
- **Sí:** `tick` propio en vez de `Date.now()`. Se detiene con la pestaña y comparte el ritmo de `requestAnimationFrame`.
- **No:** `hunter` y `random`. Se reemplazan por los 4 comportamientos; el azar sale del juego.

## Riesgos

- Cuatro fantasmas a la misma velocidad que Pac-Man suben bastante la dificultad; si resulta injugable, la spec siguiente es bajar `GHOST_SPEED` o reducir perseguidores.
- `tick` cuenta frames de `requestAnimationFrame`: en pantallas de 144 Hz las salidas llegan antes. Se documenta con un comentario `shortcut:` en el código.
- El target de `flanker` cerca del túnel puede caer fuera del mapa; el greedy lo ignora porque solo evalúa celdas vecinas transitables.

## No incluido en esta spec

- Scatter/chase y modo asustado.
- Velocidades distintas por fantasma.
- Re-entrada a la pen.
- Sprites nuevos, puntaje por comer fantasmas y sonido.

Cada uno, si aparece, va en su propia spec.
