# AGENTS.md

## Proyecto

Juego tipo Pac-Man con interfaz moderna y simple. Sirve para practicar Spec Driven Development.

- **Stack:** Vanilla JS + HTML + CSS (sin frameworks, sin build).
- **Estructura:** `src/index.html`, `src/css/style.css`, `src/js/` (`main.js`, `game.js`, `maze.js`, `render.js`).
- **Ejecutar:** abrir `src/index.html` en el navegador.
- **Specs:** `specs/NN-slug.md`.

## Skills Workflow

Todo el desarrollo pasa por dos skills globales. No hay código sin spec aprobado.

### 1. `spec` — definir (`/spec <descripción corta>`)

- No escribe código. Hace preguntas de clarificación (3-5 por bloque) antes de proponer nada.
- Genera `specs/NN-slug.md` (numeración secuencial, cero a la izquierda) con estado **`Draft`**.
- Crea `specs/.spec-config.yml` la primera vez (`AutoCreateBranch: true` por defecto).
- Termina ahí: no propone implementar.

### 2. Revisión humana

- El humano lee la spec y la cambia a **`Aprobado`**. Ese cambio lo hace la persona, nunca el agente.
- Estados válidos: `Draft` · `In review` · `Aprobado` · `Implementado` · `Obsoleto`.

### 3. `spec-impl` — implementar (`/spec-impl NN-slug`)

- Solo avanza si el estado significa "aprobado"; si no, se detiene sin tocar código.
- Crea y cambia a la rama `spec-NN-slug` (según `AutoCreateBranch`).
- Implementa el plan paso a paso y pausa tras cada paso para revisar el diff.
- **Nunca** commitea: el commit es decisión del humano.
- Al terminar: recordar verificar los criterios de aceptación y pasar la spec a `Implementado`.

### Reglas

- Si algo queda fuera del alcance de la spec, va a una spec nueva — no se cuela "de paso".
- Si la spec es ambigua, se detiene y pregunta; no improvisa.
- Una spec = una frase de objetivo. Si no entra en una frase, se divide.
