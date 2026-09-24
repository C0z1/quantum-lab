# Quantum Lab — Instrucciones de proyecto

Este archivo es la fuente de verdad para cualquier agente (Claude, Codex, etc.) que toque la interfaz de **Quantum Lab**. Léelo entero antes de editar. Si una instrucción de chat contradice este archivo, prevalece el chat **solo** cuando el usuario lo pida de forma explícita.

---

## 1. Misión

Eres Arquitecto UI/UX y Desarrollador Frontend Senior.

**Tarea:** reestructurar el **shell de layout** de Quantum Lab para que se comporte como un IDE nativo (VS Code / Xcode / Logic Pro): tres columnas tipo Inspector + panel inferior colapsable.

**Problema que estás resolviendo:** el layout actual está hardcodeado. Paneles, circuito y controles flotan con `position: absolute`, márgenes negativos y tamaños estáticos. Se superponen y no escalan.

**No es tu tarea:** reescribir el simulador, los shaders, la matemática cuántica, ni la API de ejecución.

Criterio de éxito:

- ningún panel del chrome flota
- la vista 3D y el circuito **nunca** se superponen
- la consola **no** tapa el lienzo
- la app sigue ejecutando los algoritmos actuales

---

## 2. Hechos del proyecto (completar / verificar)

Rellená este bloque con el repo real **antes** de implementar. Si un valor no existe, no lo inventes: usá el wrapper de layout y un slot vacío tipado.

```text
Stack:            [React + Tailwind — verificar package.json]
Estado global:    [QuantumEngine / store — NO TOCAR]
Canvas 3D:        [Three / R3F / propio — verificar]
Tokens CSS:       [pegar variables: --bg-app, --bg-panel, --border-subtle, --accent, …]
```

### Componentes existentes — mover, no duplicar

| Slot | Componente | Notas |
|---|---|---|
| Lista de algoritmos | `[AlgorithmList]` | Grover, Teletransportación, Shor, etc. |
| Vista 3D | `[BlochScene]` | Esferas de Bloch |
| Circuito | `[CircuitGraph]` | Gates; nunca overlay del 3D |
| Parámetros | `[ParameterPanel]` | Colatitud, azimut, Ejecutar, Reset |
| Telemetría | `[TelemetryPanel]` | Paso actual, ángulos, estado de run |
| Vector de estado | `[StateVectorTable]` | Columnas Estado, Re, Im, P |
| Transport | `[PlaybackBar]` | Play / Pausa / timeline |
| Consola | `[ConsolePanel]` | Logs; cerrada por defecto |
| Motor | `[QuantumEngine / store]` | **Prohibido reescribir** |

Nombres entre corchetes son placeholders. Sustituilos por los exports reales del repo. Si un componente no existe, creá solo el slot (wrapper + `children` / render prop). No inventes un segundo simulador.

---

## 3. No negociable

**Siempre:**

- Layout del chrome con Flexbox o Grid **estrictos**.
- Contenedor raíz a `height: 100vh; overflow: hidden`.
- Scroll **solo** dentro de cada panel si el contenido desborda.
- Tema oscuro actual y colores semánticos actuales. No reinventes la paleta.
- Reusar componentes existentes montándolos en los slots.
- Al cambiar de algoritmo: reset de la run, del vector de estado y del transport.

**Nunca:**

- `position: absolute` / `fixed` ni márgenes negativos para **paneles del chrome** (columnas, header del lienzo, footer, consola, segmented control).
- Tamaños estáticos para el lienzo 3D o el circuito (`width: 800px`, etc.).
- Parámetros, sliders o telemetría en la columna izquierda.
- Circuito flotando encima de las esferas de Bloch.
- Consola como overlay / `absolute` tapando el canvas.
- Duplicar un componente que ya existe.
- Reescribir el motor cuántico “porque el layout cambió”.
- Inventar splitters, drag-resize o un titlebar nuevo en este paso (no están en el alcance).

**Excepción de posicionamiento:** `absolute` / `fixed` **sí** está permitido en canvas WebGL, tooltips, playhead de la timeline, menús emergentes y badges. Prohibido para estructurar las regiones principales.

---

## 4. Arquitectura de layout

Patrón: **3 columnas + 1 fila inferior colapsable**.

```text
┌─────────────┬──────────────────────────┬──────────────┐
│  NAV 260px  │     LIENZO  (1fr)        │ INSPECTOR    │
│  Algoritmos │  [Vista 3D | Circuito]   │  300px       │
│             │                          │  Parámetros  │
│             │         flex-1           │  Telemetría  │
│             │                          │  Vector      │
│             ├──────────────────────────┤              │
│             │  Transport h-12 + Consola│              │
├─────────────┴──────────────────────────┴──────────────┤
│  CONSOLA  (span 3, 0px cerrada / 200px abierta)       │
└───────────────────────────────────────────────────────┘
```

### Grid raíz (`AppShell`)

```css
height: 100vh;
overflow: hidden;
display: grid;
grid-template-columns: 260px minmax(0, 1fr) 300px;
grid-template-rows: minmax(0, 1fr) auto;
```

| Región | Grid | Ancho / alto |
|---|---|---|
| Navegación | fila 1, col 1 | `260px` fijo |
| Lienzo | fila 1, col 2 | `minmax(0, 1fr)` |
| Inspector | fila 1, col 3 | `300px` fijo |
| Consola | fila 2, `grid-column: 1 / -1` | `0` cerrada / `200px` abierta |

- Centro: `min-width: 0` y `min-height: 0` para que canvas y circuito encajan sin empujar el grid.
- No splitters. No columnas colapsables. No chrome superior extra en este paso.
- Divisores: borde de `1px` (`border-slate-800` o el token `--border-subtle`).
- Fondos: laterales un tono **más claro** que el lienzo; el lienzo es el tono **más oscuro**. Jerarquía por superficie, no por sombras pesadas.

### Viewport

- Desktop-first, diseñado para **≥ 1280px**.
- Bajo `1024px`, apilar: navegación arriba (lista horizontal), inspector debajo del canvas, consola al fondo.
- No intentes mantener `260 + 300` fijos a `390px`. El lab se vuelve injugable.

---

## 5. Columna izquierda — Navegación (260px)

Exclusiva para la lista de **Algoritmos**.

- Un ítem activo a la vez. Menú de selección limpio.
- **Sin** parámetros, sliders, botones de ejecución ni telemetría.
- Scroll interno si la lista crece.
- Nombres largos: truncar con ellipsis, no ensanchar la columna.
- Click en otro algoritmo:
  1. detener la run si está `running` / `paused`
  2. reset del transport al inicio
  3. reset del vector de estado
  4. limpiar error previo
  5. pasar a `ready`

---

## 6. Columna central — Lienzo (`1fr`)

Tres franjas en columna Flex, el padre con `min-height: 0`:

```text
header   h-12     segmented control
área     flex-1   min-h-0   vista activa
footer   h-12     transport + botón Consola
```

### Header — segmented control (no tabs)

Opciones: **Vista 3D** | **Circuito**.

- Una vista a la vez. Control segmentado, no pestañas con paneles superpuestos.
- La vista inactiva no se monta encima: o se desmonta, o queda `hidden` / `display: none` **sin** overlay.
- El circuito **no** es una tira sobre el 3D.

### Área activa

- El componente seleccionado (`BlochScene` o `CircuitGraph`) ocupa **todo** el slot.
- El canvas 3D se adapta al tamaño del slot (`ResizeObserver` o el sizing de R3F/`useThree`). Prohibido `width`/`height` hardcodeados en el canvas.
- `min-h-0` es obligatorio; sin él el 3D revienta el grid.

### Footer del lienzo (`h-12`)

- Izquierda / centro: Play, Pausa, timeline.
- Derecha: botón sutil **Consola** que abre/cierra la fila 2.
- Una sola fuente de tiempo: el transport controla el paso de la ejecución actual (animación Bloch **y/o** recorrido del circuito, según la vista activa). No dos timelines.

---

## 7. Columna derecha — Inspector (300px)

Stack vertical. Cada bloque con título de sección. Scroll del **inspector entero**; la ventana no scrollea.

### Arriba — Parámetros

- Sliders de colatitud y azimut.
- Botones **Ejecutar** y **Reset**.
- En `running`: sliders locked, o bien se aplican al **próximo** paso. Nunca mutar a mitad sucia.

### Centro — Telemetría

- Paso actual, ángulos, estado de la run (`idle | ready | running | paused | error`).

### Abajo — Vector de estado

- Tabla: Estado | Re | Im | P.
- Scrollea la **tabla**, no el panel. 8+ qubits no pueden estirar el layout ni empujar columnas.

---

## 8. Consola (fila 2, span 3)

Este es un **cuarto panel**, no un overlay de las tres columnas.

| Estado | Altura | Comportamiento |
|---|---|---|
| Cerrada (default) | `0` (`auto` de fila = 0) | sin overlay, sin sombra, sin pointer-events |
| Abierta | `200px` | borde superior 1px, scroll interno de logs |

- Toggle: botón **Consola** del footer del lienzo.
- Cerrar también con `Esc`.
- En estado `error`: abrir automáticamente y mostrar el mensaje.
- Prohibido `position: absolute` / `fixed` para este panel.

---

## 9. Máquina de estados de UI

Estos estados son obligatorios. Conectalos al store/motor existente; no crees un estado paralelo.

| Estado | Condición | UI |
|---|---|---|
| `empty` | ningún algoritmo seleccionado | inspector y transport deshabilitados; Ejecutar inactivo |
| `ready` | algoritmo elegido, sin run en curso | Ejecutar activo; sliders editables |
| `running` | ejecución en marcha | Play → Pausa; sliders locked o diferidos al próximo paso |
| `paused` | run detenida a mitad | Play disponible; vector congelado en el paso actual |
| `error` | fallo de ejecución | consola auto-abierta; telemetría refleja el error |

Overflow real (no solo el happy path):

- nombres de algoritmo largos → ellipsis
- tabla de estado grande → scroll interno
- 3D / circuito grandes → se adaptan al slot, **nunca** scroll de página
- consola abierta → el lienzo **encoge** (`minmax(0, 1fr)`), no se tapa

---

## 10. Diseño visual

- Tema oscuro existente. No cambies la paleta.
- Separación de columnas: borde `1px` slate-800 (o token nativo equivalente).
- Lienzo más oscuro que los laterales.
- Controles nativos / semánticos actuales (botones, sliders, tablas).
- El botón Consola es **sutil**, no un CTA.
- Segmented control alineado a UI nativa (track + segmento activo), no un row de tabs subrayados.
- Sin sombras pesadas, glassmorphism ni gradientes nuevos “para que se vea moderno”.
- No rediseñes iconografía en este paso.

---

## 11. Organización de archivos (si hay que crear shell nuevo)

Preferí editar el shell existente. Si no hay un shell claro, esta forma es la canónica:

```text
src/
  app/  o  src/
    AppShell.tsx          # grid raíz — ÚNICO dueño del layout
    layout/
      NavColumn.tsx       # slot izquierdo
      CanvasColumn.tsx    # header + área + footer
      InspectorColumn.tsx # stack derecho
      ConsoleDrawer.tsx   # fila 2
    components/           # los existentes, solo se importan
```

`AppShell` no contiene lógica de simulación. Solo composición, estado de UI de layout (`activeView`, `consoleOpen`) y los slots.

---

## 12. Orden de implementación

1. Extraer/crear `AppShell` con el grid de 3 columnas + fila consola. Fondos y bordes. Sin contenido real todavía, pero con slots nombrados.
2. Montar `AlgorithmList` a la izquierda. Verificar scroll interno y reset al cambiar de algoritmo.
3. Montar segmented control + `BlochScene` / `CircuitGraph` en el centro. Verificar que no se superponen y que el canvas sigue al resize del slot.
4. Montar `PlaybackBar` en el footer del lienzo. Una sola fuente de tiempo.
5. Montar inspector: Parámetros → Telemetría → Vector. Scroll del panel, tabla independiente.
6. Montar consola en fila 2. Toggle + `Esc` + auto-open en `error`.
7. Conectar estados `empty | ready | running | paused | error` a controles (disable, lock sliders, abrir consola).
8. Pasada de overflow: 8+ qubits, nombres largos, consola abierta, viewport 1280 y 1024.

No empieces por “rediseñar componentes internos”. El shell primero.

---

## 13. Qué entregar

1. `AppShell` (grid) con los 4 slots funcionando.
2. Componentes **existentes** montados en esos slots.
3. Segmented control Vista 3D | Circuito.
4. Toggle de consola (botón + `Esc`, auto-open en error).
5. Reset al cambiar de algoritmo.
6. Paleta e iconografía intactas.

No entregar:

- un mock HTML suelto desconectado del repo
- un rewrite del motor
- componentes gemelos (`BlochScene2`, `NewCircuit`, etc.)
- splitters, temas claros, ni features fuera de este contrato

---

## 14. Criterios de aceptación

Un cambio se considera listo solo si cumple **todos**:

- [ ] El chrome no usa `absolute`/`fixed` ni márgenes negativos.
- [ ] `body` / raíz no scrollean; el scroll es por panel.
- [ ] Izquierda = solo algoritmos; parámetros viven a la derecha.
- [ ] Vista 3D y Circuito son mutuamente excluyentes; cero superposición.
- [ ] El canvas 3D se redimensiona con el slot.
- [ ] Consola cerrada = altura 0; abierta = 200px debajo, lienzo encoge.
- [ ] `Esc` cierra la consola.
- [ ] Error de ejecución abre la consola.
- [ ] Cambiar de algoritmo resetea run + vector + transport.
- [ ] Tabla de estado con muchos qubits no rompe el grid.
- [ ] ≥1280px: 3 columnas estables (260 / 1fr / 300).
- [ ] <1024px: layout apilado, usable, sin overflow horizontal.
- [ ] El simulador existente sigue ejecutando Grover / Teletransportación / Shor (o los algoritmos reales del repo).

---

## 15. Fuera de alcance (no implementar ahora)

- Splitters / resize de columnas
- Titlebar / menú nativo de aplicación
- Vista 3D y circuito simultáneos (split interno del lienzo)
- Tema claro
- Atajos de teclado más allá de `Esc` para la consola
- Refactor del motor, shaders o fórmulas
- Persistencia de layout (qué columna / vista / consola)

Si el usuario pide una de estas en el chat, implementala **además** de este contrato, no en lugar de él.
