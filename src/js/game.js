// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 1 / 12;                // 1 celda cada 12 frames
const GHOST_SPEED = 1 / 15;                 // 1 celda cada 15 frames
const GHOST_SPEED_SCARED = GHOST_SPEED / 2; // 1/30

const FRIGHTENED_FRAMES = 360; // ventana asustado
// shortcut: los frames son de rAF; a 144 Hz la ventana dura ~2.5 s, subir si molesta
const FRIGHTENED_FLASH_FRAMES = 120; // ultimos frames, parpadeo
const GHOST_RESPAWN_DELAY = 120;     // espera en la pen tras ser comido
const GHOST_EAT_POINTS = [ 200, 400, 800, 1600 ];

function isFrightened( game ) {
  return game.tick < game.frightenedUntil;
}

// Estado inicial de un fantasma, segun su GHOST_STARTS.
// exiting: los que arrancan dentro de la pen (y > 11) cruzan la puerta al salir.
function spawnGhost( start ) {
  return {
    x: start.x,
    y: start.y,
    dir: 'up',
    speed: GHOST_SPEED,
    kind: start.kind,
    releaseAt: start.releaseDelay,
    exiting: start.y > 11,
  };
}

// Devuelve el fantasma comido a su celda de arranque, con espera en la pen.
function sendToPen( game, g ) {
  const start = GHOST_STARTS.find( ( s ) => s.kind === g.kind );
  Object.assign( g, spawnGhost( start ) );
  g.releaseAt = game.tick + GHOST_RESPAWN_DELAY;
}

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    tick: 0,
    dotsRemaining: dots,
    frightenedUntil: 0, // frame absoluto; 0 = inactivo
    ghostsEaten: 0,     // fantasmas comidos en la ventana actual
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( spawnGhost ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman, ghost: bloqueados por pared (1) y puerta (3)
//   ghost-exiting: bloqueado solo por pared (1) — unico que cruza la puerta
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor !== 'ghost-exiting' ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot (10) o power pellet (50).
    const tile = grid[ p.y ][ p.x ];
    if ( tile === 2 || tile === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += tile === 4 ? 50 : 10;
      game.dotsRemaining--;
      if ( tile === 4 ) {
        game.frightenedUntil = game.tick + FRIGHTENED_FRAMES;
        game.ghostsEaten = 0;
      }
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

function cell( actor ) {
  return { x: Math.round( actor.x ), y: Math.round( actor.y ) };
}

// Distancia entre celdas con wrap del tunel: min(|dx|, W - |dx|) + |dy|.
function cellDistance( a, b ) {
  const dx = Math.abs( a.x - b.x );
  return Math.min( dx, MAZE[ 0 ].length - dx ) + Math.abs( a.y - b.y );
}

// Celda a `steps` por delante del actor, en su direccion actual.
function ahead( actor, steps ) {
  const c = cell( actor );
  const d = DIRS[ actor.dir ] || { x: 0, y: 0 };
  return { x: c.x + d.x * steps, y: c.y + d.y * steps };
}

// Cada comportamiento solo calcula un target; el movimiento lo resuelve el greedy.
const GHOST_BEHAVIORS = {
  aggressive: ( game ) => cell( game.pacman ),

  ambusher: ( game ) => ahead( game.pacman, 4 ),

  // 2*(P + 2*dir) - A, con A = celda del aggressive.
  flanker: ( game ) => {
    const p = ahead( game.pacman, 2 );
    const a = cell( game.ghosts.find( ( o ) => o.kind === 'aggressive' ) );
    return { x: 2 * p.x - a.x, y: 2 * p.y - a.y };
  },

  // Persigue de lejos; a <= 8 celdas se retira a la esquina inferior izquierda.
  shy: ( game, g ) => {
    const p = cell( game.pacman );
    return cellDistance( cell( g ), p ) > 8 ? p : { x: 1, y: 29 };
  },
};

// Selector greedy unico: minimiza la distancia al target.
// Con flee = true la maximiza (huida).
// Desempate determinista por orden de DIRS: left, right, up, down.
function greedyDir( game, g, target, flee ) {
  const grid = game.grid;
  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ OPPOSITE[ g.dir ] ];

  let best = choices[ 0 ];
  let bestDist = flee ? -Infinity : Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const dist = cellDistance( { x: g.x + d.x, y: g.y + d.y }, target );
    if ( flee ? dist > bestDist : dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

function decideGhost( game, g ) {
  g.dir = greedyDir( game, g, GHOST_BEHAVIORS[ g.kind ]( game, g ) );
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( game.tick < g.releaseAt ) return; // congelado en la pen

  const speed = isFrightened( game ) ? GHOST_SPEED_SCARED : g.speed;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    // Ya cruzo la puerta: vuelve a comportarse como fantasma normal.
    if ( g.exiting && g.y <= 11 ) g.exiting = false;
    if ( g.exiting ) {
      // Salida fija: centrarse en la columna 13 y subir por la puerta.
      g.dir = g.x !== 13 ? ( g.x < 13 ? 'right' : 'left' ) : 'up';
    } else if ( isFrightened( game ) ) {
      // Huida: la direccion que mas se aleja de Pac-Man.
      g.dir = greedyDir( game, g, cell( game.pacman ), true );
    } else {
      decideGhost( game, g );
    }
    const actor = g.exiting ? 'ghost-exiting' : 'ghost';
    if ( !canMove( grid, g.x, g.y, g.dir, actor ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * speed;
  g.y += d.y * speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.tick = 0;
  game.frightenedUntil = 0;
  game.ghostsEaten = 0;
  game.ghosts = GHOST_STARTS.map( spawnGhost );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  game.tick++; // shortcut: cuenta frames de rAF; en 144 Hz las salidas llegan antes
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( !collides( game.pacman, g ) ) continue;

    // Asustado: se lo come y vuelve a la pen; la escalada esta clampeada.
    if ( isFrightened( game ) ) {
      game.score += GHOST_EAT_POINTS[ Math.min( game.ghostsEaten, 3 ) ];
      game.ghostsEaten++;
      sendToPen( game, g );
      continue;
    }

    game.lives--;
    if ( game.lives <= 0 ) {
      game.state = 'lost';
      return;
    }
    resetPositions( game );
    break;
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
window.isFrightened = isFrightened;
window.FRIGHTENED_FLASH_FRAMES = FRIGHTENED_FLASH_FRAMES;
