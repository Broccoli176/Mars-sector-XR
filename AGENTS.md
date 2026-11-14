# AGENTS.md — Marte VR Survival

> Instrucciones para agentes de código (prototipo v0.1 en marcha). Este archivo define contratos, reglas y objetivos.
> Léelo completo antes de implementar. Cuando exista código, si algo aquí entra en conflicto con el código, el código gana **y este archivo debe actualizarse** en el mismo cambio.

---

## 0) Estado del repositorio

**Estado: prototipo v0.1 (2026-11-14).** Existe una rebanada vertical jugable:
- **Simulación headless** en `src/systems/`: tiempo, recursos, red eléctrica, soporte vital, comida/hidro, salud, incidentes y estado de partida.
- **Datos** en `src/data/` y **tests** Vitest en `tests/`.
- **Greybox WebXR** del plano con paneles y botones en `src/world`, `src/ui`, `src/objects` y `src/vr`. El arranque está en `src/core/main.js`.

Datos reales embebidos (sin «en vivo»), ver `docs/SIMULATION_SPEC.md` §6.5:
- `src/data/real/radlab.json` (NASA OSDR RadLab, MSL RAD) → `systems/Radiation.js` (informativo, sin daño) y dosímetro de Personal.
- `src/data/real/csa_food.json` (CSA) → Hidroponía.
- Ambos se atribuyen en el panel «Fuentes científicas» del hub.

Telecom básico implementado (`src/systems/Telecom.js`: señal = 95 × alineación, deriva en tormenta, botón «Alinear antena», motor averiado limita a 40). Pendiente: cola de mensajes/enlace <20 % y clima espacial, electrónica/reparaciones, fugas, herramientas/fundas, banco de entrenamiento (T1–T5), alarmas sonoras, guardado, CI y assets. **Desviaciones del prototipo:**
- Los controles se pulsan con rayo + gatillo; el agarre directo llegará después.
- Hay un modo escritorio de desarrollo (no es modo de juego).
- Strings y balance siguen en un solo archivo cada uno.

Decisiones/objetivos iniciales (a confirmar al arrancar):

- **Plataforma:** **Meta Quest 3** (WebXR, Quest Browser) como objetivo principal, con presupuestos conservadores (clase Quest 2); preview desktop con emulador WebXR solo como herramienta de desarrollo.
- **Stack:** Three.js + Vite + WebXR + `mitt`; JavaScript ES modules + JSDoc/`@ts-check`; Vitest. Node 22 LTS + npm. Versiones exactas fijadas en el bootstrap (ver §8).
- **Calendario:** hackathon de **2 días, 14–15 de noviembre de 2026** (H1 = sáb 14, H2 = dom 15); plan en `docs/DEVELOPMENT_WORKFLOW.md` §6.
- **Plano:** `docs/FLOOR_PLAN.md` (coordenadas, puertas, paneles, anclas de teleport).
- **Trabajo en equipo (2 personas):** reparto por salas y flujo de ramas en **`docs/COLLABORATION.md`** (léelo antes de tocar código). Persona A: Personal, Hidroponía y Sala central. Persona B: Telecom, Control y Energía. Usad ramas cortas desde `main` con PR; `CODEOWNERS` pide revisión al dueño.
- **Arquitectura objetivo:** simulación headless desacoplada de render; composición clara entre core/systems/vr/world/objects/ui/data/utils.
- **MVP objetivo:** sobrevivir 7 días acelerados gestionando energía, soporte vital, comida/agua, telecom y electrónica/reparaciones.
- **Persistencia:** sin implementación; definir `SaveSystem` y migraciones cuando se aborde.
- **Idioma:** texto de jugador en español; código y documentación en inglés (objetivo).
- **Git/LFS/tooling:** por definir/inicializar en el nuevo proyecto.

**Precedencia documental (cuando haya implementación):** comportamiento/código real > `AGENTS.md` (contratos/presupuestos/boundaries) > `docs/SIMULATION_SPEC.md` + datos de configuración (reglas numéricas) > `docs/AGENT_CONTEXT.md` (intención de diseño). Resolver y documentar conflictos en el mismo cambio.

---

## 1) Resumen de producto

| Item | Valor |
| :-- | :-- |
| Nombre | Marte VR Survival |
| Género | Simulación/gestión de supervivencia VR estacionaria |
| Ambientación | Primera colonia humana en Marte; base subterránea que el jugador no abandona |
| Plataforma | **Meta Quest 3** (objetivo), navegador Quest / WebXR |
| Preview desktop | Emulador WebXR en navegador (objetivo) |
| Meta educativa | Hacer tangibles los trade-offs de ingeniería de misión |
| Duración MVP | Sobrevivir **7 días acelerados** en juego (≈42 min a 1×) |

**El jugador es operador, no héroe de acción.** Bucle: *diagnosticar → redirigir/reparar/conservar → vivir la consecuencia*.

---

## 2) Reglas MVP (fuente de verdad de diseño)

| Regla | Definición (objetivo) |
| :-- | :-- |
| Victoria | Llegar vivo al final del día 7 (con resumen/post-run según diseño) |
| Derrota | Salud del jugador a 0 (asfixia, hipotermia, deshidratación o inanición), pérdida total de energía, o cascada irrecuperable |
| Salud | Barra/recurso de salud mostrado en UI diegética (sin HUD head-locked) |
| Idioma UI | Español (tabla de strings externa); código/docs en inglés |
| Tiempo | Simulación acelerada basada en ticks (no acoplar reglas a delta de render). El día empieza a las **06:00**; la partida termina el día 8 06:00 (7 días exactos, ≈42 min a 1×) |
| Fases | `boot → training → playing → over \| won`. **Pausa = velocidad 0**, no es fase. **Pausa automática** al quitarse el visor |
| Tutorial | Banco de entrenamiento en la Sala central · Herramientas (`room_hub`) (fase `training`, tiempo parado, saltable) + incidentes guiados del día 1 |
| Clima espacial | Snapshot estático de NASA DONKI (`src/data/spaceWeather.json`): una CME y dos apagones de radio |
| Locomoción | Teleport por defecto; movimiento suave opcional **con viñeta** |
| Interacción | Agarre directo para controles físicos; ray solo para controles diegéticos pequeños si aplica |
| Input | Mandos primero; sin hand tracking en MVP salvo decisión explícita |
| UI | Paneles/indicadores diegéticos. **Sin HUD head-locked** |
| Entorno | Base en estrella alrededor de la **Sala central · Herramientas** (hub). Al norte: Telecom y Sala de control. Al oeste: Personal (vacía). Al sur: Hidroponía · Agricultura y Energía y oxígeno. Ver `docs/FLOOR_PLAN.md`. Base subterránea; la única vista exterior es la ventana de Telecom |
| Persistencia | Guardado versionado con migraciones (cuando se implemente) |

### Principio de diseño
Evitar “barras independientes”: cada sistema debe compartir dependencias y existir al menos un trade-off recuperable sacrificando otro sistema.

---

## 3) Arquitectura y boundaries (objetivo)

**Capas previstas (ajustar a la implementación real):**
- `core/` — arranque, loop, composición, estado de juego
- `systems/` — simulación headless, reglas y recursos
- `vr/` — input XR, locomoción, interacción, hápticos
- `world/` — entorno, iluminación, atmósfera
- `objects/` — objetos interactuables (presentación + intents)
- `ui/` — UI diegética
- `data/` — configuración/balance/topología/strings
- `types/` — contratos compartidos (typedefs JSDoc: `ResourceState`, payloads de eventos, save); sin lógica
- `utils/` — utilidades compartidas

**Boundaries duros**
- `systems/` no debe importar librerías de render ni capas de presentación/VR/mundo/UI.
- `objects/` y `ui/` pueden leer estado, pero no deben mutar recursos directamente: emiten **intents/eventos** y los sistemas deciden.
- Un único módulo debe ser dueño de cada recurso (p. ej. `ResourceManager`).
- Comunicación entre sistemas preferentemente por bus de eventos, no referencias cruzadas directas.
- Lógica de render no debe filtrarse a `systems/`.

### Flujo de simulación (objetivo)
```
Input (VR/UI) --intent--> systems
                           |
                           v
                    Resource/state owner
                           |
                  emite eventos de estado
                           |
             world + objects + ui reaccionan
```

---

## 4) Contratos de datos

### 4.1 Recursos (contrato objetivo)

```ts
type ResourceId =
  | 'power'        // kWh almacenados (stock); tasa neta en kW según convención
  | 'oxygen'       // %
  | 'co2'          // ppm (alto es malo)
  | 'temperature'  // °C
  | 'pressure'     // kPa
  | 'water'        // L
  | 'food'         // kcal
  | 'spares'       // unidades
  | 'signal'       // %
  | 'health';      // 0-100

type ResourceStatus = 'nominal' | 'warning' | 'critical' | 'offline';

interface ResourceState {
  id: ResourceId;
  value: number;
  min: number;
  max: number;
  unit: string;
  ratePerHour: number; // neto por hora de juego
  status: ResourceStatus;
  direction: 'low' | 'high';
  warnAt: number;
  criticalAt: number;
  failAt?: number;
}
```

Definir unidades, umbrales y valores concretos en `docs/SIMULATION_SPEC.md` y en los archivos de datos de configuración cuando existan.

### 4.2 Eventos (contrato objetivo)

Los nombres de eventos son API pública una vez implementados: renombrarlos requiere actualizar emisores y suscriptores en el mismo cambio. La tabla siguiente es un **baseline de contrato** (payloads sujetos a ajuste al implementar, pero deben documentarse).

| Evento | Payload (objetivo) | Emisor previsto | Notas |
| :-- | :-- | :-- | :-- |
| `resource:changed` | `{ id, value, ratePerHour, status }` | owner de recursos | cambio de estado |
| `resource:critical` | `{ id, value }` | owner de recursos | umbral crítico |
| `power:lost` / `power:restored` | `{ circuitId }` | red eléctrica | |
| `system:failed` / `system:repaired` | `{ systemId, reason }` / `{ systemId, partId }` | sistemas | |
| `breaker:toggle` | `{ circuitId, on }` | interacción (intent) | |
| `tool:use` | `{ toolId, targetId }` | interacción (intent) | acciones instantáneas |
| `time:tick` | `{ tick, day, hour }` | gestor de tiempo | |
| `time:dayStarted` / `time:dayEnded` | `{ day }` | gestor de tiempo | |
| `time:setSpeed` / `time:speedChanged` | `{ speed }` | intent / tiempo | |
| `game:start` / `game:restart` | `{}` o `{ slot? }` | interacción (intent) | definir al implementar |
| `game:phaseChanged` | `{ from, to }` | estado de juego | |
| `game:over` / `game:won` | `{ reason }` | estado de juego | |
| `relay:resetRequest` / `relay:tripped` / `relay:reset` | según diseño | intent / red eléctrica | |
| `repair:hold` / `repair:progress` / `repair:rejected` | según diseño | interacción / electrónica | reparaciones temporizadas |
| `component:damaged` | `{ componentId, reason }` | electrónica/eventos | |
| `leak:started` / `leak:sealed` | `{ leakId }` | sistema correspondiente | |
| `filter:swap` / `filter:swapped` | según diseño | intent / soporte vital | |
| `valve:turn` | `{ valveId, open }` | interacción (intent) | |
| `food:harvest` / `food:harvested` | según diseño | intent / hidroponía | |
| `antenna:align` | según diseño | intent / telecom | |
| `incident:warning` / `incident:triggered` | `{ incidentId, etaHours? }` / `{ incidentId }` | runner de incidentes | |
| `comms:message` | `{ channel, key, params?, day?, hour? }` | simulación/comms | |
| `hint` | `{ key, params? }` | simulación/UI feedback | |
| `sim:reset` | `{ seed? }` | simulación/app | |
| `save:written` / `save:loaded` | `{ version, slot }` | SaveSystem | cuando exista persistencia |
| `item:grab` / `item:release` / `item:socket` | según diseño | interacción | si aplica |

**Eventos propuestos (baseline 2026-11-14, ver `docs/SIMULATION_SPEC.md`):** cubren mecánicas de la spec que no tenían evento.

| Evento | Payload (propuesto) | Emisor previsto | Notas |
| :-- | :-- | :-- | :-- |
| `weather:changed` | `{ state: 'clear' \| 'dustStorm', solarFactor }` | runner de incidentes | tormenta (spec §6.2) |
| `spaceWeather:alert` | `{ kind: 'cme' \| 'flare', speedKms?, etaHours? }` | runner de incidentes | datos DONKI; entrega sujeta a señal (spec §6.3) |
| `spaceWeather:impact` | `{ kind }` | runner de incidentes | llegada de CME / inicio de apagón de radio |
| `comms:linkLost` / `comms:linkRestored` | `{}` | telecom | señal < 20 % ⇒ no se transmiten datos; mensajes en cola (spec §3.8) |
| `thermostat:set` | `{ setpointC }` | interacción (intent) | dial 16–22 °C (spec §3.3) |
| `food:ready` / `food:spoiled` | `{}` / `{ reason: 'unharvested' \| 'noLight' \| 'noWater' }` | hidroponía | spec §3.6 |
| `time:autoPause` | `{}` | presentación (intent) | **implementado v0.1**: la app lo emite al ocultarse la página o la sesión XR |
| `time:autoPaused` | `{ previousSpeed }` | gestor de tiempo | **implementado v0.1**: visor quitado / foco perdido (spec §1.1) |
| `filter:rejected` | `{ reason: 'noSpare' }` | soporte vital | **implementado v0.1**: cambio de filtro sin repuestos |
| `save:request` | `{ slot: 'manual' }` | interacción (intent) | guardado manual en el terminal de log (spec §7) |
| `power:overloadWarning` | `{ demandKw, limitKw }` | red eléctrica | demanda sobre el límite antes del disparo (spec §2.4) |
| `crew:damage` | `{ cause, ratePerHour }` | `Crew` | causa activa para el biomonitor (spec §4) |
| `alarm:raised` / `alarm:cleared` | `{ alarmId, level: 'amber' \| 'red', sourceId }` | sistemas / UI feedback | catálogo en spec §9.3 |

Los tanques de O₂ de emergencia usan `valve:turn` (`valve_o2_tank_1/2`). Pendiente (OI-16): unificar `system:failed`/`system:repaired` (ids de sistema) con `component:damaged` (ids de componente, spec §6.1).

**Implementados en v0.1** (payloads tal cual en `src/systems/`):
- **Recursos:** `resource:changed`, `resource:critical`.
- **Energía:** `power:lost`/`restored`, `power:overloadWarning`, `breaker:toggle`, `relay:resetRequest`, `relay:tripped { guided, burned }`, `relay:reset`, `component:damaged` y `system:failed` (solo `relay_main`).
- **Tiempo:** `time:tick`, `time:dayStarted`, `time:setSpeed`, `time:speedChanged`.
- **Partida:** `game:start`, `game:phaseChanged`, `game:over`, `game:won`.
- **Soporte vital y comida:** `thermostat:set`, `valve:turn` (tanques O₂), `filter:swap`/`swapped`, `food:harvest`/`harvested`/`ready`/`spoiled`, `crew:damage`.
- **Incidentes y avisos:** `incident:warning`/`triggered`, `weather:changed`, `comms:message`, `hint`.
- **Telecom:** `antenna:align` (intent); escucha `component:damaged`/`system:repaired` para `antenna_motor`.
- **Herramientas (presentación, fase 1):**
  - `item:grab { itemId, hand }`
  - `item:release { itemId }` (cae al suelo)
  - `item:socket { itemId, slot: 'SKT_Holster_L' | 'SKT_Holster_R' | 'toolwall' }`
  - Los emite `src/rooms/hub/tools.js`; la simulación aún no los consume (fase 2: reparaciones).

El resto sigue **propuesto**.

> Al ampliar, mantener esta lista **implementado vs propuesto** con payload exacto, emisor y consumidores.

### 4.3 Guardado (contrato objetivo v1)

```json
{
  "version": 1,
  "savedAt": "ISO-8601",
  "time": { "tick": 0, "day": 1, "hour": 0 },
  "resources": {},
  "inventory": {},
  "systems": {},
  "brokenComponents": [],
  "flags": {}
}
```

Reglas:
- Cambios aditivos dentro de la misma versión. Cambios incompatibles incrementan `version` y requieren migración.
- Cantidades consumibles no deben duplicarse entre `resources` e `inventory`.
- Validar al cargar; ante datos inválidos/corruptos, no destruir el guardado válido y permitir iniciar partida nueva.

---

## 5) Layout objetivo del repositorio (plantilla)

```
<proyecto>/
├── public/                # runtime assets (cuando existan)
├── src/
│   ├── core/
│   ├── vr/
│   ├── world/
│   ├── systems/
│   ├── objects/
│   ├── ui/
│   ├── rooms/         # una carpeta por sala: <sala>/stations.js (dueño por sala, ver docs/COLLABORATION.md)
│   ├── data/          # layout.json (geometría) + stations/ + strings/es/ + balance/ (un archivo por dueño)
│   ├── types/
│   └── utils/
├── docs/
├── tests/
├── AGENTS.md
├── CLAUDE.md
├── README.md
└── llms.txt
```

Ajustar a la estructura real al crear el proyecto y actualizar este documento.

---

## 6) Convenciones (objetivo)

| Área | Regla |
| :-- | :-- |
| Unidades | 1 unidad de motor = 1 metro; usar SI/unidades definidas en spec |
| Sistema de coordenadas | Definir y documentar según motor/stack |
| Nombres de archivo | Consistentes por tipo (clases, utilidades, assets) |
| Prefijos de assets | `ENV_`, `PROP_`, `INT_`, `PANEL_`, `TOOL_`, `COL_`, `LGT_`, `SKT_` (si aplica) |
| Imports | Evitar ciclos, especialmente entre módulos de `systems/` |
| Tipos/contratos | Centralizar contratos compartidos; evitar duplicación |
| Números mágicos | No hardcodear tunables; usar configuración/datos |
| Strings de jugador | No hardcodear en UI; usar tabla de strings |
| Commits | Convencionales y pequeños (cuando haya VCS) |

---

## 7) Presupuesto de rendimiento (Quest 3, objetivo conservador)

Presupuesto deliberadamente de clase Quest 2 para dejar margen en Quest 3 (y probable compatibilidad con Quest 2/3S, no garantizada).

| Métrica | Presupuesto |
| :-- | :-- |
| Frame rate | 72 Hz objetivo (90 Hz solo si se mide estable), nunca por debajo de 60 Hz |
| Draw calls | < 100–150 por frame; guía por sala ≈ 25 (6 salas + pasillos); máximo medido 59 |
| Triángulos | 500k–1M visibles |
| Memoria de texturas | ~300–500 MB GPU-resident objetivo (medir) |
| Texturas | 1K props, 2K superficies grandes; formato comprimido en runtime |
| Iluminación | Bakeada/estática preferida; mínimas luces dinámicas |
| Sombras | Evitar sombras dinámicas costosas por defecto |
| Post-procesado | Ninguno por defecto |
| MSAA | Conservador y medido en XR |

Medir en hardware real antes de cerrar decisiones de presupuesto.

**Medido en v0.1** (escritorio, `renderer.info`): 6–59 draw calls por vista en la base en estrella (antes 67 en el peor pasillo del plano anterior).

Patrones que lo mantienen bajo:
- Geometría estática fusionada por material.
- Botones de 2 draw calls (cuerpo + etiqueta), nunca cajas multimaterial.
- Plantas instanciadas.
- Tone mapping ACES en el propio shader, sin pase de post-procesado.
- No exponer el espacio de nombres `THREE` como valor, porque rompe el tree-shaking.

---

## 8) Comandos y ciclo de pruebas

Implementados (v0.1):

```bash
npm ci                 # install (Node ≥ 22)
npm run dev            # vite --host (Quest vía adb reverse o túnel HTTPS)
npm run build          # vite build → dist/
npm run preview        # vite preview --host
npm test               # vitest run (simulación headless)
npm run test:watch     # vitest
npm run sim            # informe headless de balance: políticas idle/greedy/competent (`npm run sim -- competent`)
npm run data:radlab    # descarga un día real de NASA OSDR RadLab (MSL RAD + ISS) → src/data/real/radlab.json
```

Parámetros de URL solo de desarrollo:
- `?view=x,z,grados`: coloca al jugador.
- `?ff=ticks`: adelanta la simulación al iniciar turno.
- `?iwer`: emulación de Quest 3 con el runtime IWER de Meta, carga diferida y sin extensión.
- `?debug`: expone `window.__marte`.

Agarre: botón de agarre (grip) del mando en XR, tecla **G** en escritorio (`src/vr/Grab.js`). Hay fundas en la cadera (`src/vr/Holsters.js`).

Locomoción de desarrollo por teclado (`src/vr/KeyboardLocomotion.js`): WASD + Q/E. Funciona también dentro de sesiones XR emuladas. Colisión en `src/vr/Collision.js`:
- El cuerpo es un círculo de 0,22 m que choca con paredes y marcos (derivados de `layout.json`) y con los muebles sólidos de las estaciones, y se desliza a lo largo de ellos.
- Avanza en sub-pasos para no atravesar paredes.
- Asistencia de puertas: si caminas hacia una puerta un poco descentrado, te guía al centro.

**Regla:** para la posición o dirección de la cabeza en XR, usar la cámara del usuario (hija del rig), nunca recalcular la matriz de `renderer.xr.getCamera()`. Esa cámara no tiene padre y pierde la transformación del rig (ver `Locomotion.headWorld`).

Pendientes: `npm run typecheck` (JSDoc + `@ts-check`), validación de JSON Schemas en tests, CI (GitHub Actions `npm ci` → `npm test` → `npm run build`) y despliegue a GitHub Pages.

Requisitos recomendados:
- Simulación testeable sin WebGL/render.
- Verificación en emulador y pase periódico en headset real.
- `build` y `test` en verde antes de integrar cambios (cuando existan).

---

## 9) Reglas para agentes (do / don't)

**Do**
- Respetar boundaries de simulación/presentación y contratos de eventos/recursos.
- Poner números tunables en configuración/datos, no en código.
- Añadir feedback diegético ante nuevos modos de fallo.
- Actualizar esta documentación cuando cambien contratos, layout o presupuestos.

**Don't**
- No mutar estado interno de otros sistemas desde fuera de su contrato.
- No introducir HUD head-locked para feedback de gameplay.
- No acoplar reglas de simulación al framerate.
- No añadir dependencias o features costosas sin justificar impacto.
- No mezclar refactors grandes con cambios de comportamiento sin necesidad.

---

## 10) Definition of Done (MVP, objetivo)

- [ ] Sesión VR funcional en Quest 3 por ruta de prueba documentada
- [ ] Banco de entrenamiento (T1–T5) funcional y saltable
- [ ] Entorno base jugable (6 salas en estrella + pasillos) con locomoción cómoda
- [ ] Reruteo de energía con consecuencias visibles/audibles
- [ ] Soporte vital con degradación y estados de fallo legibles
- [ ] Al menos un trade-off forzado entre sistemas
- [ ] Telecom aporta avisos/feedback útil ligado al estado
- [ ] Bucle de avería y reparación con repuestos
- [ ] Victoria (día 7) y condiciones de derrota implementadas
- [ ] Guardado/carga versionado (si entra en MVP) con round-trip correcto
- [ ] Rendimiento dentro del presupuesto medido en hardware
- [ ] Build de producción ejecutable en el entorno objetivo

---

## 11) Índice de documentación

| Archivo | Propósito |
| :-- | :-- |
| `AGENTS.md` | Contratos, reglas, presupuestos y convenciones |
| `CLAUDE.md` | Puntero/resumen para Claude Code |
| `docs/AGENT_CONTEXT.md` | Contexto de diseño e intención |
| `docs/SIMULATION_SPEC.md` | Especificación numérica y reglas de simulación |
| `docs/DEVELOPMENT_WORKFLOW.md` | Flujo de desarrollo, pruebas y profiling |
| `docs/ASSET_CREATION_WORKFLOW.md` | Pipeline de assets y validación |
| `docs/ASSET_REGISTRY.md` | Registro de assets/licencias y fuentes de datos |
| `docs/CONTENT_SCRIPT.md` | Guion de comms, tutorial y convención de claves de strings |
| `docs/FLOOR_PLAN.md` | Plano acotado: salas, puertas, paneles por muro, anclas de teleport, alarmas |
| `docs/COLLABORATION.md` | Reparto de archivos por sala entre 2 personas, archivos compartidos y flujo de ramas/PR en GitHub |
| `docs/references/registro_nasa_donki.md` | Snapshot NASA DONKI usado para el clima espacial |
| `docs/project-context.json` | Resumen machine-readable |
| `llms.txt` | Mapa compacto del repo |
| `README.md` | Visión general y arranque |
