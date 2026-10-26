# 02 — Ritmo más lento, rebote en la pen y power pellets

**Estado:** Approved
**Depende de:** SPEC 01 — Cuatro fantasmas con comportamientos propios
**Fecha:** 2026-10-25

## Objetivo

Reducir un tercio la velocidad de Pac-Man y los fantasmas, animar el rebote de los que esperan en la pen y añadir power pellets que los vuelven asustados y comestibles.

## Alcance

**Entra:**

- `PACMAN_SPEED = 1 / 12` y `GHOST_SPEED = 1 / 15` (≈ −33% parejo, ratio 1.25 intacto).
- Rebote vertical de ±3 px para los fantasmas con `tick < releaseAt` (solo `render.js`).
- Tile `4` = power pellet en las 4 esquinas, 50 puntos, cuenta para ganar.
- Estado asustado de 360 frames: huida, mitad de velocidad, azul + parpadeo final.
- Puntos escalonados 200/400/800/1600 y vuelta a la pen del fantasma comido.
- Reset de vida que apaga el estado asustado.

**No entra (van a otras specs):**

- Scatter/chase, frutas, niveles, sonido, HUD nuevo, puntaje alto.
- Velocidades diferenciadas por fantasma.
- Fantasma como ojos volviendo a la pen.
- Re-entrada voluntaria a la pen.

## Modelo de datos

```js
// src/js/maze.js
// Leyenda: '#' pared(1) · '.' dot(2) · '-' puerta(3) · 'o' power pellet(4) · ' ' vacío(0)
// Pellets en filas 3 y 23, columnas 1 y 26.

// src/js/maze.js → parseTile()
if ( ch === 'o' ) return 4;

// src/js/game.js
const PACMAN_SPEED = 1 / 12;                // 1 celda cada 12 frames
const GHOST_SPEED = 1 / 15;                 // 1 celda cada 15 frames
const GHOST_SPEED_SCARED = GHOST_SPEED / 2; // 1/30
const FRIGHTENED_FRAMES = 360;              // ventana asustado
const FRIGHTENED_FLASH_FRAMES = 120;        // últimos frames, parpadeo
const GHOST_RESPAWN_DELAY = 120;            // espera en la pen tras ser comido
const GHOST_EAT_POINTS = [ 200, 400, 800, 1600 ];

// createGame() — campos nuevos
game = {
  // ...
  frightenedUntil: 0, // frame absoluto; 0 = inactivo
  ghostsEaten: 0,     // fantasmas comidos en la ventana actual
};
```

Convenciones:

- `isFrightened( game )` → `game.tick < game.frightenedUntil`.
- El fantasma comido reusa `releaseAt` y `exiting`: no hay campo nuevo.
- `ghostsEaten` se indexa con `Math.min( ghostsEaten, 3 )` sobre `GHOST_EAT_POINTS`.
- Superficie nueva expuesta: `window.isFrightened` (la usa `render.js`, igual que `DIRS`).

## Contexto actual

- `game.js` usa `aligned()` con tolerancia `1e-3`: **el speed tiene que ser `1/n`** o Pac-Man deja de girar en celdas impares. De ahí `1/12` y `1/15` en vez de `0.65 ×` exacto.
- `movePacman()` solo come `tile === 2` y suma 10. `update()` resta vida en cualquier colisión.
- `moveGhost()` corta si `game.tick < g.releaseAt`; el fantasma queda quieto y `render.js` lo dibuja igual.
- `drawDots()` dibuja todo tile 2 con radio 2.5. `drawGhost( ctx, g, color )` no conoce el estado asustado.
- `resetPositions()` recrea `ghosts` desde `GHOST_STARTS` y pone `tick = 0`.
- Las 4 celdas elegidas hoy son dots válidos y transitables.

## Plan de implementación

Cada paso deja el juego jugable. Abrí `src/index.html` después de cada uno para revisar el diff.

1. **`game.js` — velocidades.** `PACMAN_SPEED = 1 / 12`, `GHOST_SPEED = 1 / 15`, agregar `GHOST_SPEED_SCARED`.
   Test manual: todo se mueve más lento; Pac-Man gira en cualquier celda; los fantasmas salen escalonados.
2. **`render.js` — rebote en la pen.** `drawGhost` recibe `game` y `frame`; si `game.tick < g.releaseAt`, desplazar `cy` con `Math.sin( frame * 0.08 ) * 3`.
   Test manual: los 3 en espera rebotan ±3 px sin cambiar de celda ni salir antes.
3. **`maze.js` + `render.js` — pellets.** Pasar a `'o'` las celdas (1,3), (26,3), (1,23), (26,23); `parseTile` devuelve 4; `drawDots` usa radio 6 cuando el tile es 4.
   Test manual: se ven 4 bolitas grandes en las esquinas.
4. **`game.js` — comer pellets.** `createGame` cuenta tiles 2 y 4 en `dotsRemaining`; en `movePacman` comer `2` suma 10 y `4` suma 50.
   Test manual: comer una bolita suma 50; al limpiar dots y pellets aparece `GANASTE`.
5. **`game.js` — estado asustado.** Agregar `frightenedUntil` y `ghostsEaten`; al comer un pellet, `frightenedUntil = tick + 360` y `ghostsEaten = 0`; en `moveGhost`, si `isFrightened()` usar `GHOST_SPEED_SCARED` y elegir la dirección que **maximiza** la distancia a Pac-Man.
   Test manual: al comer una bolita los fantasmas se alejan y van más lento; a los 360 frames vuelven a perseguir.
6. **`render.js` — fantasmas azules.** `draw()` calcula `frightened` y `flashing`; `drawGhost` pinta `#2222ff`, o blanco cuando `Math.floor( frame / 15 ) % 2` dentro de los últimos 120 frames.
   Test manual: los 4 se ven azules y parpadean al final de la ventana.
7. **`game.js` — comer fantasmas.** En `update()`, si `isFrightened()` y `collides()` → sumar `GHOST_EAT_POINTS[ Math.min( ghostsEaten, 3 ) ]`, incrementar `ghostsEaten` y devolver el fantasma a su `GHOST_STARTS` con `releaseAt = tick + 120` y `exiting` recalculado. Si no hay estado asustado, resta vida como hoy.
   Test manual: tocar un fantasma azul suma 200 y lo manda a la pen; los siguientes en la misma ventana suman 400, 800 y 1600.
8. **`game.js` — reset de vida.** `resetPositions()` apaga `frightenedUntil` y `ghostsEaten`.
   Test manual: morir con el estado activo devuelve a los fantasmas a su color y comportamiento; los pellets comidos no reaparecen.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/js/maze.js` | `'o'` en (1,3), (26,3), (1,23), (26,23); `parseTile( 'o' ) → 4`; leyenda actualizada |
| `src/js/game.js` | Speeds `1/12` y `1/15` + `GHOST_SPEED_SCARED`; constantes de ventana y puntos; `frightenedUntil` y `ghostsEaten` en `createGame`; conteo de tile 4; comer pellet con 50; huida y velocidad en `moveGhost`; rama de comer fantasma en `update`; fantasma a la pen con `releaseAt = tick + 120`; `resetPositions` apaga el estado; `window.isFrightened` |
| `src/js/render.js` | `drawDots` con radio 6 para tile 4; `drawGhost` con rebote, azul y parpadeo; `draw` calcula la ventana |

Sin cambios en `main.js`, `index.html`, `style.css`.

## Criterios de aceptación

- [ ] Un pasillo recto de 10 celdas tarda ~120 frames en recorrerse (antes ~80).
- [ ] Pac-Man puede girar en celdas pares e impares.
- [ ] Los 3 fantasmas en espera rebotan ±3 px sin cambiar de celda ni adelantar su salida.
- [ ] Hay 4 bolitas grandes visibles en (1,3), (26,3), (1,23) y (26,23).
- [ ] Comer una bolita suma 50 puntos y la hace desaparecer.
- [ ] Comer una bolita pone a los 4 fantasmas en huida a mitad de velocidad durante 360 frames.
- [ ] Los fantasmas asustados se ven azules y parpadean cada 15 frames en los últimos 120.
- [ ] Comer fantasmas en la misma ventana suma 200, 400, 800 y 1600 en ese orden.
- [ ] Un fantasma comido vuelve a su celda de arranque y sale de nuevo a los 120 frames.
- [ ] Tocar un fantasma no asustado resta una vida; tocarlo asustado no.
- [ ] Comer otro pellet reinicia el timer a 360 y mantiene la escalada de puntos.
- [ ] Perder una vida apaga el estado asustado y no revive pellets comidos.
- [ ] `GANASTE` aparece solo cuando no quedan dots ni pellets.
- [ ] Sin errores en consola.

## Decisiones

- **Sí:** `1/12` y `1/15` en vez de `0.65 ×` exacto. Un speed que no es `1/n` rompe `aligned()` y Pac-Man deja de girar; −33% con la grilla intacta vale más que −35% con el snap reescrito.
- **Sí:** `'o'` dentro de `MAZE_STR` en vez de un array `POWER_PELLETS`. El mapa ya es la fuente de verdad de dots y paredes; una lista paralela se desincroniza.
- **Sí:** tile `4` en vez de reusar tile `2` con una lista de coordenadas. Render y colisión deciden por valor de celda en un solo lugar.
- **Sí:** `frightenedUntil` como frame absoluto, igual que `releaseAt`. Se compara contra `tick` y no necesita decremento.
- **Sí:** reutilizar `releaseAt` + `exiting` para el fantasma comido. La salida de la pen ya funciona; un estado `eaten` agrega una rama sin cambiar el resultado.
- **Sí:** huida con el `greedyDir` invertido (maximizar distancia) en vez de azar. Ya existe el selector y la spec 01 sacó el azar.
- **Sí:** velocidad asustado `1/30` (`GHOST_SPEED / 2`), otra fracción que mantiene la alineación.
- **Sí:** pellets cuentan en `dotsRemaining` con valor por tile. Una sola condición de victoria.
- **No:** teletransporte como ojos. Mandar el fantasma a la pen logra el mismo efecto jugable con cero código de render nuevo.
- **No:** `performance.now()` para la ventana asustado. Todo el juego se mide en frames de `tick`.
- **No:** HUD, sonido, frutas, niveles, scatter/chase.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Bajar la velocidad alarga en segundos reales las salidas fijas de 60/180/300 frames | Aceptado; si molesta, se ajustan los `releaseDelay` en una spec de balance |
| `tick` cuenta frames de rAF: 360 frames duran ~2.5 s en 144 Hz | Mismo riesgo aceptado en la 01; se documenta con un `shortcut:` en el código |
| Comerse los 4 fantasmas por pellet da 3000 puntos extra | Es la regla clásica; si rompe el balance, se ajusta `GHOST_EAT_POINTS` |
| `1/15` deja al fantasma a 0.75 de la velocidad de Pac-Man (antes 0.8) → juego algo más fácil | Se ajusta `GHOST_SPEED` en una spec de balance |
| El fantasma `aggressive` comido vuelve a (13,11), fuera de la pen, y podría ser comido de nuevo | La escalada está clampeada en 1600; no rompe nada |

## No incluido en esta spec

- Scatter/chase, frutas, niveles, sonido, HUD nuevo y puntaje alto.
- Velocidades distintas por fantasma.
- Fantasma como ojos volviendo a la pen.
- Re-entrada voluntaria a la pen.

Cada uno, si aparece, va en su propia spec.
