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

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    tick: 0,
    dotsRemaining: dots,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      releaseAt: g.releaseDelay,
      exiting: g.y > 11, // arranca dentro de la pen: cruza la puerta al salir
    } ) ),
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
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
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
// Desempate determinista por orden de DIRS: left, right, up, down.
function greedyDir( game, g, target ) {
  const grid = game.grid;
  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ OPPOSITE[ g.dir ] ];

  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const dist = cellDistance( { x: g.x + d.x, y: g.y + d.y }, target );
    if ( dist < bestDist ) {
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

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    // Ya cruzo la puerta: vuelve a comportarse como fantasma normal.
    if ( g.exiting && g.y <= 11 ) g.exiting = false;
    if ( g.exiting ) {
      // Salida fija: centrarse en la columna 13 y subir por la puerta.
      g.dir = g.x !== 13 ? ( g.x < 13 ? 'right' : 'left' ) : 'up';
    } else {
      decideGhost( game, g );
    }
    const actor = g.exiting ? 'ghost-exiting' : 'ghost';
    if ( !canMove( grid, g.x, g.y, g.dir, actor ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  game.tick++; // shortcut: cuenta frames de rAF; en 144 Hz las salidas llegan antes
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
