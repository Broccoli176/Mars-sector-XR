# AGENTS.md — Marsianics

> Instrucciones para agentes de código (prototipo v0.1 en marcha). Este archivo define contratos, reglas y objetivos.
> Léelo completo antes de implementar. Cuando exista código, si algo aquí entra en conflicto con el código, el código gana **y este archivo debe actualizarse** en el mismo cambio.

---

## 0) Estado del repositorio

**Estado: prototipo v0.1 (2026-11-14).** Existe una rebanada vertical jugable:
- **Simulación headless** en `src/systems/`: tiempo, recursos, red eléctrica, soporte vital, comida/hidro, salud, incidentes y estado de partida.
- **Datos** en `src/data/` y **tests** Vitest en `tests/`.
- **Greybox WebXR** del plano con paneles y botones en `src/world`, `src/ui`, `src/objects` y `src/vr`. El arranque está en `src/core/main.js`.

Datos reales embebidos (sin «en vivo»), ver `docs/SIMULATION_SPEC.md` §6.5:
- `src/data/real/radlab.json` (NASA OSDR RadLab, MSL RAD) → `systems/Radiation.js` (fondo informativo, sin daño) y dosímetro de Personal.
- `src/data/real/radlab_sep.json` (tormenta solar REAL del 20/05/2024 medida por RAD) → evento `sep` del día 6: refugio en Personal (spec §6.5).
- `src/data/real/orbits.json` (JPL, elementos orbitales) → `systems/orbits.js` + `systems/Comms.js`: retraso real de luz Tierra–Marte (11 min al inicio), cola sin enlace, conjunción solar (spec §3.8.1).
- `src/data/real/solar_dust.json` (Mars Pathfinder MAE, 0,28 %/sol) → polvo en los paneles (`PowerGrid.dustFactor`, spec §2.5).
- `src/data/real/csa_food.json` (CSA) y `src/data/real/bioregen_crops.json` (NASA NTRS: quinua y espirulina en CELSS) → Hidroponía.
- `src/data/real/osdr_health.json` (NASA OSDR, estudios OSD-924/343/812) → panel «Salud del astronauta» de Personal.
- NASA DONKI **en vivo** (`src/rooms/personal/spaceWeatherLive.js`, solo presentación, nunca alimenta la simulación) → «El Sol ahora» de Personal; sin red usa el registro `src/data/real/donki_recent.json` y lo dice.
- Todos se atribuyen en el panel «Fuentes científicas» del hub. Resumen: `docs/DATA_SOURCES.md`.

Telecom básico implementado (`src/systems/Telecom.js`: señal según alineación, deriva en tormenta, ajuste con botones izquierda/derecha y alineación, motor averiado limita a 40). Hidroponía ampliada a 5 × 6 m con cocina (despensa, procesador de barras y dispensador; `src/systems/Kitchen.js`). Electrónica: banco de la Sala central que repara la fuente del receptor de Telecom (`src/systems/Electronics.js`, ver spec §6.6). Cola de mensajes con retraso de luz y enlace <20 % implementados (`src/systems/Comms.js`). Pendiente: niveles 30/50 % de la cola, apagones de radio y CME (no existe `src/data/spaceWeather.json` y nada emite el impacto `cme`), derrota por cascada, reparaciones del resto de componentes (las herramientas y fundas existen, pero la simulación aún no las consume), fugas, banco de entrenamiento (solo T1; faltan T2–T5), alarmas sonoras, guardado, CI y assets. **Desviaciones del prototipo:**
- Los controles se pulsan con rayo + gatillo. El agarre (`src/vr/Grab.js`) solo se usa para herramientas y la manguera.
- El modo primera persona del rover (`src/world/RoverWorld.js`, intent `rover:fpv`) mueve el rover y gasta su batería directamente, sin pasar por `rover:command` ni comprobar la señal, con números propios distintos de `balance/rover.json`. Es una violación conocida del boundary de §3; pendiente de llevarlo a `Rover.js`.
- Hay un modo escritorio de desarrollo (no es modo de juego).
- Tipografía y colores de todo el texto diegético salen de `src/ui/theme.js` (ver §4.2, «Texto de paneles»).

Decisiones/objetivos iniciales (a confirmar al arrancar):

- **Plataforma:** **Meta Quest 3** (WebXR, Quest Browser) como objetivo principal, con presupuestos conservadores (clase Quest 2); preview desktop con emulador WebXR solo como herramienta de desarrollo.
- **Stack:** Three.js + Vite + WebXR + `mitt`; JavaScript ES modules + JSDoc/`@ts-check`; Vitest. Node 22 LTS + npm. Versiones exactas fijadas en el bootstrap (ver §8).
- **Calendario:** hackathon de **2 días, 14–15 de noviembre de 2026** (H1 = sáb 14, H2 = dom 15); plan en `docs/DEVELOPMENT_WORKFLOW.md` §6.
- **Plano:** `docs/FLOOR_PLAN.md` (coordenadas, puertas, paneles, anclas de teleport).
- **Trabajo en equipo (2 personas):** reparto por salas y flujo de ramas en **`docs/COLLABORATION.md`** (léelo antes de tocar código). Persona A: Personal, Hidroponía y Sala central. Persona B: Telecom, Control y Energía. Usad ramas cortas desde `main` con PR; `CODEOWNERS` pide revisión al dueño.
- **Arquitectura objetivo:** simulación headless desacoplada de render; composición clara entre core/systems/vr/world/objects/ui/data/utils.
- **MVP objetivo:** sobrevivir 7 días acelerados gestionando energía, soporte vital, comida/agua, telecom y electrónica/reparaciones.
- **Persistencia:** sin implementación; definir `SaveSystem` y migraciones cuando se aborde.
- **Idioma:** texto de jugador en español e inglés, elegible en el menú inicial (tablas `src/data/strings/es|en/`, misma clave en ambas, `tests/i18n.test.js`); código y documentación en inglés.
- **Git/LFS/tooling:** por definir/inicializar en el nuevo proyecto.

**Precedencia documental (cuando haya implementación):** comportamiento/código real > `AGENTS.md` (contratos/presupuestos/boundaries) > `docs/SIMULATION_SPEC.md` + datos de configuración (reglas numéricas) > `docs/AGENT_CONTEXT.md` (intención de diseño). Resolver y documentar conflictos en el mismo cambio.

---

## 1) Resumen de producto

| Item | Valor |
| :-- | :-- |
| Nombre | Marsianics |
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
| Derrota | Salud del jugador a 0 (asfixia, hipotermia, deshidratación, inanición o radiación) o pérdida total de energía. La cascada irrecuperable está **planificada, no implementada** |
| Salud | Barra/recurso de salud mostrado en UI diegética (sin HUD head-locked) |
| Idioma UI | Español o inglés, a elegir en el menú inicial antes del turno (`?lang=`, se recuerda en el navegador; recarga la página). Tablas `src/data/strings/<lang>/`; números con coma en español y punto en inglés (`fmt`, `setNumberLanguage`). Código/docs en inglés |
| Tiempo | Simulación acelerada basada en ticks (no acoplar reglas a delta de render). El día empieza a las **06:00**; la partida termina el día 8 06:00 (7 días exactos, ≈42 min a 1×) |
| Fases | `boot → training → playing → over \| won`. **Pausa = velocidad 0**, no es fase. **Pausa automática** al quitarse el visor |
| Tutorial | Banco de entrenamiento en la Sala central · Herramientas (`room_hub`) (fase `training`, tiempo parado, saltable) + incidentes guiados del día 1 |
| Clima espacial | Implementado: tormenta solar `sep` del día 6 (registro real de RAD). **Pendiente:** snapshot estático de NASA DONKI (`src/data/spaceWeather.json`, aún no existe) con una CME y dos apagones de radio |
| Locomoción | Teleport por defecto; movimiento suave opcional **con viñeta** |
| Interacción | Agarre directo para controles físicos; ray solo para controles diegéticos pequeños si aplica |
| Input | Mandos primero; sin hand tracking en MVP salvo decisión explícita |
| UI | Paneles/indicadores diegéticos. **Sin HUD head-locked**, con una única excepción decidida por el equipo (2026-11-15): el **cartel de avisos** (`src/ui/AlertBanner.js`), pegado a la cámara arriba de la vista, pequeño y semitransparente, que lista averías (rojo) y tareas pendientes (ámbar) con la sala donde están. Reglas puras en `src/ui/alertRules.js` (`activeAlerts`), sala de cada componente en `balance/hub.json` → `components[].room`, umbral en `balance/core.json` → `alerts`. Una avería nueva hace vibrar los mandos (`XRControls.pulseAll`). Oculto con el menú inicial |
| Entorno | Base en estrella alrededor de la **Sala central · Herramientas** (hub). Al norte: Telecom y Sala de control (spawn, ordenador principal y controles de tiempo al norte; biomonitor al sur; consola del rover en la pared este y panel vital al norte). Al oeste, pegada a la Sala central y sin pasillo: Personal (habitaciones de tripulación, dosímetro y refugio antirradiación). Al sur: Hidroponía · Agricultura y Energía y oxígeno. Ver `docs/FLOOR_PLAN.md`. Base subterránea con **dos ventanas al exterior**: la panorámica de Telecom (`src/world/Porthole.js`) y la del campo solar en Energía (`src/world/SolarField.js`, muro este, **redondeada**). Todas las vistas exteriores (ventana de Telecom, campo solar, mundo y NavCam/mapa del rover en Control) comparten paleta de suelo y cielo/luz por hora y tormenta: `src/world/marsLook.js`. En `layout.json` cada muro con ventana lleva `view: "telecom" | "solar"`; una ventana `[desde, hasta, alféizar, techo, radio?]` con radio > 0 tiene esquinas redondeadas (`src/world/roundedRect.js`) |
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
| `repair:work` / `repair:progress` / `repair:rejected` | ver «Reparaciones con herramientas» (implementado) | interacción / `Repairs` | reparaciones temporizadas |
| `component:damaged` | `{ componentId, reason }` | electrónica/eventos | |
| `leak:started` / `leak:sealed` | `{ leakId }` | `IncidentRunner` / `Repairs` | implementado (fuga `hull_seal_hub`) |
| `filter:swap` / `filter:swapped` | según diseño | intent / soporte vital | |
| `valve:turn` | `{ valveId, open }` | interacción (intent) | |
| `food:harvest` / `food:harvested` | `{ trayId? }` / `{ trayId, cropId, kcal }` | intent / hidroponía | sin `trayId` cosecha todo lo listo |
| `antenna:align` | según diseño | intent / telecom | |
| `antenna:turnLeft` / `antenna:turnRight` | `{}` | intent / Telecom | giro por paso configurado; motor averiado rechaza el giro |
| `incident:warning` / `incident:triggered` | `{ incidentId, etaHours? }` / `{ incidentId }` | runner de incidentes | |
| `comms:message` | `{ channel, key, params?, day?, hour? }` | simulación/comms | |
| `hint` | `{ key, params? }` | simulación/UI feedback | |
| `sim:reset` | `{ seed? }` | simulación/app | |
| `save:written` / `save:loaded` | `{ version, slot }` | SaveSystem | cuando exista persistencia |
| `item:grab` / `item:release` / `item:socket` | según diseño | interacción | si aplica |

**Eventos propuestos (baseline 2026-11-14, ver `docs/SIMULATION_SPEC.md`):** cubren mecánicas de la spec que no tenían evento.

| Evento | Payload (propuesto) | Emisor previsto | Notas |
| :-- | :-- | :-- | :-- |
| `spaceWeather:alert` | `{ kind: 'cme' \| 'flare', speedKms?, etaHours? }` | runner de incidentes | **propuesto** para CME/fulguraciones (spec §6.3). Hoy solo se emite `{ kind: 'sep', etaHours }` (ver «Tormenta solar») |
| `spaceWeather:impact` | `{ kind }` | runner de incidentes | llegada de CME / inicio de apagón de radio |
| `time:autoPause` | `{}` | presentación (intent) | **implementado v0.1**: la app lo emite al ocultarse la página o la sesión XR |
| `time:autoPaused` | `{ previousSpeed }` | gestor de tiempo | **implementado v0.1**: visor quitado / foco perdido (spec §1.1) |
| `filter:rejected` | `{ reason: 'noSpare' }` | soporte vital | **implementado v0.1**: cambio de filtro sin repuestos |
| `save:request` | `{ slot: 'manual' }` | interacción (intent) | guardado manual en el terminal de log (spec §7) |
| `alarm:raised` / `alarm:cleared` | `{ alarmId, level: 'amber' \| 'red', sourceId }` | sistemas / UI feedback | catálogo en spec §9.3 |

Los tanques de O₂ de emergencia usan `valve:turn` (`valve_o2_tank_1/2`). Pendiente (OI-16): unificar `system:failed`/`system:repaired` (ids de sistema) con `component:damaged` (ids de componente, spec §6.1).

**Implementados en v0.1** (payloads tal cual en `src/systems/`):
- **Recursos:** `resource:changed`, `resource:critical`.
- **Energía:** `power:lost`/`restored`, `power:overloadWarning`, `breaker:toggle`, `relay:resetRequest`, `relay:tripped { guided, burned }`, `relay:reset`, `component:damaged` y `system:failed` (solo `relay_main`).
  - Relé quemado (2026-11-15): `relay:resetRequest` lo sustituye, con el destornillador encima (si no: `relay:rejected { reason: 'noTool', toolId: 'screwdriver' }`), gastando `power.relayRepairSpares` (1) de `spares` y emite `system:repaired { systemId: 'power', partId: 'relay_main' }` + `relay:reset`; sin repuestos emite `relay:rejected { reason: 'noSpare' }`.
  - `time:dayEnded` está en el contrato pero **no se emite** todavía.
- **Costes de cada decisión (2026-11-15, spec §10.8, `tests/tradeoffs.test.js`):** sin el circuito `lighting` la salud no se regenera (`Crew.regenBlocked === 'dark'`, `health.darkRegenFactor`); por debajo de `food.cold.belowC` (18 °C) los cultivos crecen × 0,6 (`Food.cold`); limpiar paneles cuesta 1,5 kWh y recupera el 60 %; fuera del refugio la tormenta solar hace 12 de daño/h; el aviso `sep` llega 3 h antes solo si hay enlace.
- **Texto de paneles (compartido, `src/ui/theme.js`):** fuente, colores (`COLORS`, `BUTTON` con contraste ≥ 4,5:1), resolución mínima de lienzo (640 px/m, tope 2048 px) y tamaño mínimo de texto (22 mm). `Panel.renderLines` nunca baja del mínimo: el título se parte en 2 líneas y lo que no cabe termina en «…» (`panel.truncated`, visible con `?debug` en `mesh.userData.panel`). Ayudas: `wrapLines`, `ellipsize`, `fitLine`, y `paragraph` en `pictograms.js`. Los números con decimales que pasan por `t()` salen con coma (`src/utils/strings.js`, `fmt`). Botones: mayúscula inicial, sin emoji.
- **Tiempo:** `time:tick`, `time:dayStarted`, `time:setSpeed`, `time:speedChanged`.
- **Partida:** `game:start`, `game:phaseChanged`, `game:over`, `game:won`.
- **Soporte vital:** `thermostat:set`, `valve:turn` (tanques O₂), `filter:swap`/`swapped`, `crew:damage`.
- **Hidroponía (4 bandejas + biorreactor de espirulina, `src/systems/Food.js`):**
  - Intents: `hydro:sow { trayId, cropId }` (solo bandeja vacía), `hydro:water { trayId, liters }` (manguera; resta agua del tanque), `hydro:feed {}` (un cartucho de nutrientes al depósito compartido) y `food:harvest { trayId? }` (`trayId: 'bioreactor'` para la espirulina).
  - Eventos: `hydro:sown { trayId, cropId }`, `hydro:rejected { trayId?, reason: 'notEmpty' | 'noWater' | 'noCartridge' | 'full' }` (sin `trayId` en las dos últimas), `hydro:fed { level, cartridgesLeft }`, `hydro:nutrientsLow {}`, `food:ready { trayId, cropId }`, `food:harvested { trayId, cropId, kcal }`, `food:spoiled { trayId, cropId, reason: 'unharvested' | 'noLight' | 'noWater' | 'overwatered' }`.
  - `food:harvested` **ya no suma kcal**: la cosecha va cruda a la despensa (`Kitchen`).
  - Reglas reales que nunca matan la planta: solución nutritiva baja ⇒ crecimiento ×0,5; fotosíntesis ⇒ cada canal sano con luz resta CO₂ y suma O₂ (spec §3.6).
  - Presentación para jugadores jóvenes: paneles de pictogramas (`src/rooms/hydro/hydroIcons.js`, `Panel.renderCustom`), cartel de pasos (`currentStep` en `hydroRules.js`) y botón «Info» por estación con la ficha de rigor científico.
- **Paneles de pictogramas + fichas «Info» (compartido, presentación):** `src/ui/pictograms.js` (formas genéricas en canvas) y `src/ui/InfoSheet.js` (`addInfo`: botón «Info»/«Cerrar» que abre una ficha de texto; no toca la simulación). Los usan Hidroponía, Personal (`src/rooms/personal/personalIcons.js`) y Energía y oxígeno (`src/rooms/energy/energyIcons.js`). `kit.addPanel` acepta un 6.º argumento opcional `{ pxPerMeter }` para lienzos más nítidos.
- **Despensa y procesador de alimentos (`src/systems/Kitchen.js`, ampliación sur de Hidroponía, spec §3.6.1):**
  - Intents: `kitchen:auto {}` (el botón «Hacer barra»: elige la receta que más kcal da y la procesa), `kitchen:select { recipeId }`, `kitchen:process {}` (receta seleccionada, lotes más viejos primero) y `kitchen:eat {}` (todo lo crudo al 100 %, sin energía).
  - Eventos: `kitchen:stored { itemId, kcal }`, `kitchen:started { recipeId, hours }`, `kitchen:done { recipeId, kcal }`, `kitchen:rejected { recipeId?, reason: 'missing' | 'busy' | 'noPower' | 'empty' }`, `kitchen:spoiled { itemId, kcal }` (crudo con más de `rawShelfHours`), `kitchen:eaten { kcal }`.
  - Consume en el circuito `hydro` mientras procesa y se pausa sin energía. Recetas y tipos de ingrediente en `balance/hydro.json` → `kitchen`.
- **Electrónica (fuente del receptor de Telecom, `src/systems/Electronics.js`):**
  - Intents: `electronics:heat { slotId }` (el soldador funde o suelda la unión), `electronics:remove { slotId }` (solo desoldada) y `electronics:insert { slotId, partId, reversed }` (solo hueco vacío; gasta stock).
  - Eventos: `component:damaged { componentId: 'rx_psu', reason, slotId, signalCap, quality }`, `system:repaired { systemId: 'telecom_rx', partId: 'rx_psu' }`, `electronics:rejected { slotId, partId?, reason: 'soldered' | 'occupied' | 'wrongKind' | 'noStock' }`, `electronics:changed { quality }`.
  - Escucha `weather:changed` (tormenta ⇒ diodo en corto) y `spaceWeather:impact { kind: 'cme' }` (diodo abierto; lo emitirá Persona B).
  - `Telecom` limita la señal a `signalCap` mientras la fuente falla.
  - Banco (`src/rooms/hub/electronics.js`): minijuego guiado de 3 pasos, solo rayo + gatillo. 1) ESCANEAR: la pieza rota parpadea en rojo. 2) Tocarla: se desuelda y sale (`heat` + `remove`). 3) Tocar la tarjeta de repuesto con la misma forma que el hueco verde: entra soldada (`insert { reversed: false }` + `heat`). Solo se ofrecen los repuestos correctos (`bench.cards`). Sin multímetro ni soldador en la mano. Pasos puros en `electronicsRules.js` (`benchStep`, `isBroken`).
- **Rover tipo Perseverance (`src/systems/Rover.js`, consola en la Sala de control):**
  - Intent: `rover:command { cmd: 'forward' | 'back' | 'left' | 'right' | 'stop' | 'sample' }` (avanza 10 m, atrás 5 m, gira 30°, muestra a ≤ 8 m de un sitio). Necesita enlace: señal ≥ 20 %. Intent de presentación `rover:fpv {}` (modo primera persona; ver «Desviaciones del prototipo»).
  - Eventos: `rover:rejected { cmd, reason: 'noLink' | 'battery' | 'stuck' | 'noSite' | 'busy' }`, `rover:stopped { reason: 'obstacle' | 'sand' | 'battery' | 'edge' }`, `rover:sampled { siteId, kind: 'core' | 'salvage' }`, `rover:delivered { cores, spares }`.
  - Se recarga en la base por el circuito `repairBay` («Taller · Rover»). Los restos del aterrizaje que trae dan +1 `spares` cada uno (sirven para cambiar el relé quemado). Los tubos de roca son **ciencia, no supervivencia**: al entregarlos emite `comms:send { key: 'comms.science.cores', params: { cores, total } }` y la Tierra responde con el retraso real; el resumen final cuenta muestras y repuestos.
  - El panel adyacente `rover_vitals` lee la simulación (solo lectura): enlace y señal, batería del rover, distancia a la base y muestras. Generador, velocidad y tubos son datos reales de Perseverance (`src/data/real/perseverance.json`).
- **Visibilidad y luz horneada (compartido, solo presentación, 2026-11-15):** `src/world/Visibility.js` oculta estaciones, carteles de puerta y vistas exteriores que no se ven (§7); `src/world/Basement.js` devuelve mallas de colisión simples e invisibles (`floors`, `walls`: lo único que prueban los rayos) aparte del casco visible, y hornea su luz. `stations.groups` da el grupo y la sala de cada estación.
- **Usar lo que sostienes (compartido, `src/vr/Grab.js`):** `userData.grab.onUse(active, handId)`. Con un objeto así en la mano, el gatillo (XR) o la tecla F (escritorio) lo usan en vez del rayo. Lo usa la manguera de Hidroponía. En escritorio, R gira lo que sostienes.
- **Incidentes y avisos:** `incident:warning`/`triggered`, `weather:changed`, `comms:message`, `hint`.
- **Enlace con la Tierra (`src/systems/Comms.js`):**
  - Intent `comms:send { channel, key, params? }` (lo emiten IncidentRunner y el parte diario).
  - Eventos `comms:message { channel, key, params, day, hour, minute, sentDay, sentHour, sentMinute, delayMin }` (llega tras el retraso de luz real), `comms:linkLost { reason: 'signal' | 'conjunction' }`, `comms:linkRestored {}`.
- **Polvo en paneles (`PowerGrid`):** intent `solar:clean {}` (botón «Limpiar» de la consola solar: robot limpiador). En la ventana, el robot `SolarCleanerRover` sale de su base `SolarCleanerDock`, salta a cada uno de los 12 paneles, lo cepilla de lado a lado borrando la capa de polvo por panel y vuelve (`cleanerPath`/`cleanerDuration` en `src/world/SolarField.js`, tiempos en `balance.cleanFx`; solo presentación, la simulación aplica la limpieza al instante); eventos `solar:dustChanged { dustFactor }`, `solar:cleaned { by: 'robot' | 'devil', gained, kwh }`, `solar:rejected { reason: 'noDust' | 'storm' | 'relay' | 'battery' | 'tracker' }`. Evento de guion `dustDevil`.
- **Seguidor solar (`src/systems/SolarTracker.js`, consola bajo la ventana de Energía):**
  - Intents: `solar:turn { dir: -1 | 1 }` (manual, paso 18°, límite ±60° sobre eje vertical), `solar:auto { on }` (botón «Auto» de la consola, 2026-11-15; sigue al Sol; motor 0,05 kW de día ≈ 0,6 kWh por sol, frente a girar a mano gratis pero teniendo que volver cada pocas horas) y `solar:stow { on }` (PROTEGER: de canto, sin producción, ×0,25 de polvo en tormenta).
  - Evento: `solar:tracker { mode: 'manual' | 'auto' | 'stow', angleDeg, targetDeg }`.
  - La producción solar = pico × coseno(azimut Sol − azimut panel) × polvo × tormenta (spec §2.6). `SolarField` muestra 12 paneles (2 filas de 6; solo visual, la producción es la misma) y los gira sobre su eje vertical con `sim.solarTracker.angleDeg`.
- **Batería (pared de breakers):** la cabecera dice si la batería se está cargando o descargando (tasa neta de `resources.power`) y cuánto falta para llenarse o vaciarse (`batteryCharge` en `src/rooms/energy/stations.js`). El Rover 2 limpiador se eliminó.
- **Tormenta solar (`Radiation`):** `spaceWeather:alert { kind: 'sep', etaHours }` y `spaceWeather:impact { kind: 'sep', durationHours }` (IncidentRunner, evento `sep`); intent `crew:shelter { inside }` (presentación: solo cuenta la cabeza dentro del rincón-refugio de Personal, con la litera y depósitos de agua en paredes y techo; tamaño en `balance/personal.json` → `shelter`, regla pura `insideAlcove` en `src/rooms/personal/shelterRules.js`; el suelo del rincón parpadea en rojo en la tormenta si estás fuera y se pone verde dentro); `crew:damage { cause: 'radiation' }` fuera del refugio en lo peor de la tormenta.
- **Telecom:** `antenna:align`, `antenna:turnLeft`, `antenna:turnRight` (intents); escucha `component:damaged`/`system:repaired` para `antenna_motor`.
- **Reparaciones con herramientas (`src/systems/Repairs.js`, 2026-11-15):**
  - Averías guionizadas en `events.json`: tipo `failure { componentId }` ⇒ `component:damaged { componentId, reason: 'scripted' }`; tipo `leak { leakId }` ⇒ `leak:started { leakId }`. Calendario: D3 `scrubber_fan` (destornillador), D5 fuga `hull_seal_hub` (pistola de sellado), D7 `antenna_motor` (llave inglesa); el soldador sigue con el banco de electrónica (D2).
  - Intent `repair:work { componentId, seconds }`: lo envía `src/rooms/hub/tools.js` por lotes de 0,25 s mientras apuntas la herramienta a la pieza (escritorio: con la mira) y mantienes gatillo/F. `componentId` es el id del componente o de la fuga.
  - `Repairs` acumula segundos reales hasta `holdSeconds` (×1,25 con salud < 50, ×1,5 con < 25) y conserva el progreso si sueltas. Emite `repair:progress { componentId, progress }`, `repair:rejected { componentId, reason: 'notBroken' | 'paused' | 'noTool' | 'noSpare' | 'noCharge', toolId? }` y al terminar gasta `spares` (o una carga de `inventory.sealantCharges`) y emite `system:repaired { systemId, partId }` o `leak:sealed { leakId }`.
  - `LifeSupport` reacciona a `scrubber_fan`, `pump_thermal`, `valve_recycler` y a las fugas; `Telecom` a `antenna_motor`.
  - Presentación: `src/ui/RepairPoint.js` (`addRepairPoint`: volumen de puntería en `kit.repairTargets`, luz roja/verde y etiqueta con herramienta, rechazo y barra de progreso); fuga en `src/rooms/hub/leak.js` (grieta, vapor y espuma). Animaciones de uso en `tools.js` con reglas puras en `toolRules.js` (`toolMotion`, `TOOL_TIPS`, `TOOL_EFFECT`): la llave oscila ±35° y saca chispas, el destornillador gira, la punta del soldador se calienta y echa humo, la pistola retrocede y suelta espuma. Un único `Points` compartido para todas las partículas.
- **Herramientas (fase 2: la simulación las consume, `src/systems/Toolbelt.js`):**
  - `item:grab { itemId, hand }`
  - `item:release { itemId }` (cae al suelo)
  - `item:socket { itemId, slot: 'SKT_Holster_L' | 'SKT_Holster_R' | 'toolwall' }`
  - Los emite `src/rooms/hub/tools.js`. `Toolbelt` sabe qué herramientas llevas (mano o funda; `toolwall` o soltarla ⇒ ya no) y `sim.tools.canRepair(componentId)` decide.
  - Solo las averías que existen en esta versión (`components[].inGame` en `balance/hub.json`) piden herramienta: relé quemado ⇒ destornillador; banco de electrónica (`rx_psu`) ⇒ soldador. Llave inglesa y pistola de sellado se rotulan «Sin uso por ahora» en la pared.
  - Rechazos: `relay:rejected { reason: 'noTool', toolId }` y `electronics:rejected { slotId, reason: 'noTool', toolId }` (antes de `noSpare`/`soldered`). Con 2 fundas y 4 herramientas, el jugador elige qué llevar.
  - Al reiniciar partida, `tools.js` reenvía `item:grab`/`item:socket` de lo que llevas para que la nueva simulación lo sepa.
  - Cada herramienta (y la boquilla de la manguera de Hidroponía) es una zona de agarre invisible (herramientas 0,20 × 0,20 × 0,38 m, boquilla 0,22 × 0,22 × 0,34 m) con la malla visible como hija, para acertar fácil con el rayo. En la mano la zona no hace raycast.
  - Puntería generosa al trabajar: el volumen de puntería de cada avería es 1,8 veces la pieza (`AIM_SCALE` en `RepairPoint.js`), la herramienta alcanza 1 m desde la punta y la manguera riega en un cono de ≈10° hasta 2,5 m (`balance/hydro.json` → `food.hose.rangeMeters`).
- **Taquilla de repuestos (`src/rooms/hub/spares.js`, solo presentación, sin intents):** armario naranja junto al panel de herramientas. Tocar una puerta abre las dos (animación en `balance/hub.json` → `sparesLocker`). Dentro se ven en 3D `resources.spares` e `inventory` (filtros, sellador, tanques de O₂), con la lista de para qué sirve cada uno y un aviso de que diodos y condensadores están en el banco de electrónica. La Sala central mide 7,5 × 5 m (x −3…4,5).

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
| Draw calls | < 100–150 por frame; guía por sala ≈ 25 (6 salas contando la central + pasillos); máximo medido 71 (ver «Medido») |
| Triángulos | 500k–1M visibles |
| Memoria de texturas | ~300–500 MB GPU-resident objetivo (medir) |
| Texturas | 1K props, 2K superficies grandes; formato comprimido en runtime |
| Iluminación | Bakeada/estática preferida; mínimas luces dinámicas |
| Sombras | Evitar sombras dinámicas costosas por defecto |
| Post-procesado | Ninguno por defecto |
| MSAA | Conservador y medido en XR |

Medir en hardware real antes de cerrar decisiones de presupuesto.

**Medido tras la auditoría de gráficos (2026-11-15, escritorio 1920 × 1020, `renderer.info`):**

| | Antes | Después |
| :-- | :-- | :-- |
| Draw calls por vista (80 vistas: centro de cada sala × 8 direcciones) | media 112, máx. 243 | media 29, máx. 56 |
| Draw calls, peor caso (9 264 vistas, incluidas puertas y cabeza inclinada) | 216 sin culling | 71 |
| CPU de `renderer.render` por vista (las dos versiones medidas por turnos en la misma página) | 1,25 ms (peor vista 3,1) | 0,41 ms (peor vista 0,9): ≈ 3 veces menos |
| Refresco de paneles (4 Hz), en Energía | ≈ 8–9 ms en un solo frame, 19 ms por segundo | 1,5–4 ms en el peor frame, 9–11 ms por segundo |
| Triángulos por vista | ≈ 20 k | ≈ 35–40 k (el casco subdividido son ≈ 22 k) |
| Texturas de lienzo (con mipmaps) | 118 MB | 124 MB |

- En VR cada draw call se emite una vez por ojo (`WebGLRenderer` no tiene multiview): 34–67 por ojo en el emulador de Quest 3.
- La cifra anterior de este documento («6–59») era de un prototipo con menos estaciones: estaba obsoleta.
- **Pendiente:** medir en el visor real (el emulador no mide GPU).

Patrones que lo mantienen bajo (cumplirlos al añadir contenido):
- **Culling por visibilidad** (`src/world/Visibility.js`, reglas puras en `visibilityRules.js`, `tests/visibility.test.js`): en cada render se oculta lo que no se ve desde la cabeza del jugador. Las salas son rectángulos de `layout.json` y cada hueco de puerta es un portal; una sala vista por una puerta solo dibuja las estaciones que caen en la rendija visible. Cada estación pertenece a `station.room`; las dos vistas exteriores, a la sala de su ventana (y solo se dibujan si la ventana está en pantalla). Lo que una sala añade con `scene.add` fuera de su grupo de estación **no** se oculta. `?nocull` lo desactiva para comparar.
- **Luz del casco horneada** (`src/world/bakedLight.js`, `tests/bakedLight.test.js`): paredes, suelos, techos y marcos usan `MeshBasicMaterial` con la luz en colores de vértice, calculada con las mismas fórmulas que el `MeshLambertMaterial` de Three.js. Cubre las lámparas de sala, la luz hemisférica, el modo emergencia y el sol y ambiente del exterior (`basement.setExteriorLight`). Las luces siguen en la escena solo para los props. No añadir luces dinámicas: cada una se evalúa por píxel en todos los props.
- **Mobiliario fusionado:** `kit.addBox`/`kit.addCylinder` se fusionan en 1 draw call por estación; las cajas quedan como proxies invisibles de colisión y de rayo. Pasar `{ dynamic: true }` si luego mueves, ocultas o recoloreas la malla devuelta.
- **Botones de 1 draw call** (`src/objects/Button.js`): una caja cuya cara frontal lleva el lienzo (borde + etiqueta); nunca cajas multimaterial.
- **Lienzos:** un panel o botón de una sala oculta no se redibuja (`setCulled`); guarda la última petición y la pinta al volver a verse. Los refrescos de 4 Hz se reparten entre frames (`stations.refreshSpread`), sin pico periódico.
- **Calentamiento al cargar** (`main.js`): un render de todo desde arriba sube shaders, texturas y buffers mientras se ve el menú, para que entrar por primera vez en una sala no pare un frame.
- Geometría estática fusionada por material; plantas y rocas instanciadas.
- Nada de `new`, arrays temporales ni colores en texto (`color.set('#…')`) en código que corre cada frame.
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
npm run data:radlab:sep # tormenta solar real del 20/05/2024 (3 días) → src/data/real/radlab_sep.json
npm run data:osdr      # metadatos de estudios OSDR → src/data/real/osdr_health.json
npm run data:donki     # registro de respaldo DONKI (7 días) → src/data/real/donki_recent.json
```

Parámetros de URL solo de desarrollo:
- `?view=x,z,grados`: coloca al jugador.
- `?ff=ticks`: adelanta la simulación al iniciar turno.
- `?iwer`: emulación de Quest 3 con el runtime IWER de Meta, carga diferida y sin extensión.
- `?mode=browser`: salta el menú inicial (también `?view=`).

**Menú inicial** (`src/ui/StartMenu.js`, reglas puras en `src/ui/startMenuRules.js`, textos `menu.*`): capa HTML previa a la sesión (no es HUD de juego).
- «Tu misión»: `missionBriefing(balance, events)` saca de los datos los días (`time.totalDays`), la hora de inicio, la duración a 1×, la regla de pérdida de energía y las crisis guionizadas (`events.json` relayTrip/storm/sep + `electronics.faults.scheduled`). Si cambia el guion, el menú cambia solo.
- «Realidad virtual»: si `navigator.xr` ofrece `immersive-vr` (visor o extensión Meta Immersive Web Emulator) pide la sesión en el mismo clic con `renderer.xr.setSession()`; si no, explica cómo instalar la extensión y ofrece el emulador integrado (IWER, `src/dev/iwer.js`, cargado bajo demanda).
- «Navegador»: muestra la ayuda y la mira y activa ratón y teclado (`DesktopControls.enabled`, `KeyboardLocomotion.enabled`; desactivados con el menú abierto).
- Al terminar la sesión XR se vuelve al menú; el botón «Menú» de la ayuda también lo abre. Sustituye al botón «ENTER VR» de Three.js.
- `?debug`: expone `window.__marte`.
- `?nocull`: desactiva el culling por visibilidad (dibuja todas las salas), para comparar draw calls.

Agarre: botón de agarre (grip) del mando en XR, tecla **G** en escritorio (`src/vr/Grab.js`). Hay dos fundas en el cinturón (`src/vr/Holsters.js`): **B/Y** (tecla **H** en escritorio) guarda la herramienta en la funda de ese lado y, con la mano vacía, la saca. También se puede soltar junto al anillo: se ilumina verde cuando está a tiro. El cinturón solo gira con el cuerpo (zona muerta de 35°), no con cada mirada.

`kit.services.locomotion` (solo lectura: `headWorld`) permite a una sala saber dónde está la cabeza del jugador (refugio de Personal).

**Diagnóstico de mandos:** panel «Prueba de mandos» en la Sala central (muro norte, a la derecha de la puerta; `src/rooms/hub/controllerDiag.js`). Dentro del visor muestra lo que llega de cada mando (gatillo, agarre, A/B/X/Y, stick, eventos select/squeeze) y tiene un botón para probar el rayo. Lee `renderer.xr` mediante `kit.services.renderer` (solo lectura).

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
- No introducir más HUD head-locked para feedback de gameplay (la única excepción es el cartel de avisos, ver §2 UI).
- No acoplar reglas de simulación al framerate.
- No añadir dependencias o features costosas sin justificar impacto.
- No mezclar refactors grandes con cambios de comportamiento sin necesidad.

---

## 10) Definition of Done (MVP, objetivo)

- [ ] Sesión VR funcional en Quest 3 por ruta de prueba documentada
- [ ] Banco de entrenamiento (T1–T5) funcional y saltable
- [ ] Entorno base jugable (6 salas contando la central, en estrella + pasillos) con locomoción cómoda
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
| `docs/DATA_SOURCES.md` | Datos reales NASA/CSA: acceso (en vivo / registro / curado), dónde se ven y por qué (para el jurado) |
| `docs/CONTENT_SCRIPT.md` | Guion de comms, tutorial y convención de claves de strings |
| `docs/FLOOR_PLAN.md` | Plano acotado: salas, puertas, paneles por muro, anclas de teleport, alarmas |
| `docs/COLLABORATION.md` | Reparto de archivos por sala entre 2 personas, archivos compartidos y flujo de ramas/PR en GitHub |
| `docs/references/registro_nasa_donki.md` | Snapshot NASA DONKI usado para el clima espacial |
| `docs/project-context.json` | Resumen machine-readable |
| `llms.txt` | Mapa compacto del repo |
| `README.md` | Visión general y arranque |
