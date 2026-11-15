# Agent Context — Marte VR Survival

> Extended design and engineering context for AI agents and open-source contributors.
> **Baseline documental (pre-implementación).** Este documento describe intención y diseño; no implica que exista código, datos o assets.
> **Contratos normativos:** `AGENTS.md`. **Reglas numéricas/configuración objetivo:** `docs/SIMULATION_SPEC.md` y archivos de datos cuando se creen. Si al implementar hay conflicto con el código/contratos, prevalecen y este archivo debe actualizarse.

---

## 1) Vision

**Pitch:** You are the sole operator of *Ares Outpost One*, humanity's first permanent Mars habitat, buried under regolith to survive the surface. For seven accelerated days you keep the basement alive: reroute power, stretch oxygen, ration water, repair failing electronics, and listen to a comms link that is your only window to the outside.

**Learning goal:** Most STEM content about space either simplifies away the engineering trade-offs or overwhelms with math. This project makes the trade-offs **physical and legible**: you feel the weight of a decision because you *turn the breaker* that keeps the lights on in the greenhouse and kills the heater for one hour.

**Experience pillars**

| Pillar | Meaning in practice |
| :-- | :-- |
| **Tangible consequences** | Every action changes a physical system and produces visible/audible feedback |
| **Diegetic everything** | Information lives on panels, gauges, lights and sound — not floating menus |
| **Claustrophobic scale** | The habitat feels small, patched together, and precious |
| **Legible trade-offs** | Players can explain *why* something failed and what they traded to fix it |
| **No fantasy tech** | Systems behave like plausible near-future hardware, not magic |

---

## 2) Player fantasy and core loop

The player never leaves the basement. Locomotion is a short teleport between rooms; the "world" is six rooms around a central hub.

```
   ┌─[WINDOW]─┐                                ┌──────────────┐
   │ Telecom /├═══════ north hall ═════════════┤ Control room │
   │ Airlock  │            ║                   │ (PC, Rover)  │
   └──────────┘            ║                   └──────────────┘
   ┌──────────┐      ┌─────╨──────┐
   │ Personal ├══════┤ Hub / Tools│  (training bench)
   │ (crew/shelter) │      └─────╥──────┘
   └──────────┘            ║
   ┌──────────┐            ║                   ┌──────────────┐
   │ Hydro /  ├═══════ south hall ═════════════┤ Energy & O2  │
   │ Farming  │                                │ (breakers,   │
   └──────────┘                                │  life supp.) │
                                               └──────────────┘
```

Hub-and-spokes base: six rooms around the Sala central · Herramientas, linked by straight corridors. The dimensioned plan, coordinates, panel placement and teleport anchors are in `docs/FLOOR_PLAN.md` (authoritative); sizes also in `docs/SIMULATION_SPEC.md` §9. Keep this diagram consistent with them.

Core loop, repeated each in-game day:

1. **Read the room.** Check gauges, listen for alarms, watch indicator lights.
2. **Diagnose.** Correlate a symptom (cold, static, flicker) with a system panel.
3. **Decide.** Reroute power, spend a spare, close a valve, conserve water.
4. **Live with it.** The other system you starved degrades; consequences compound.

**Example trade-off (the one that teaches the lesson):**
A pump failure forces the solar array's stored power to be split between the heater and the electrolyzer. Keeping the heater on protects the crew but stops oxygen generation; keeping the electrolyzer on keeps O₂ in spec but the habitat cools toward hypothermia within a day. The player must also decide whether to spend a spare on the pump (removing the constraint) or keep it for a later, worse failure.

---

## 3) Learning design

| Concept | How it is taught | Where |
| :-- | :-- | :-- |
| Energy budgeting | Limited kW must be allocated between circuits | Central breaker panel |
| Life-support stoichiometry | O₂ consumption, CO₂ scrubbing, electrolysis | Life support panel |
| Thermal management | Heat loss vs heating power vs thermostat setpoint | Temperature gauge, thermostat dial |
| Water recycling | Closed-loop losses, hydro vs drinking water | Food/hydro panel |
| Space weather | CME travel time (speed → ETA), solar-flare radio blackouts, using real NASA DONKI data | Telecom console, main PC |
| Reliability engineering | Spares budget, redundancy, induced failures | Electronics toolkit |
| Systems thinking | Cascading failures via dependencies | Whole simulation |
| Communication engineering | Signal degradation, antenna alignment | Telecom panel |

**Difficulty should come from trade-offs, not from hidden numbers.** Every threshold that matters must be visible somewhere diegetic. If a student cannot explain a failure after it happens, the UI failed — not the student.

---

## 4) System specifications (functional)

### 4.1 Time
- Tick-based; one tick = 1 in-game minute (configurable).
- Default 6 real minutes per in-game day at 1×; speed lever pause/1×/2×/4×. Pause is speed 0, not a phase.
- Days start at 06:00; a run is exactly 7 days (≈42 min at 1×). Day boundaries emit events used for autosave and scripted events.
- The game auto-pauses when the headset is removed.

### 4.2 Power grid
- Sources: battery bank + constant RTG + a surface solar mast (daytime only, reduced by dust storms). Values in `docs/SIMULATION_SPEC.md` §2.
- Circuits: `lifeSupport`, `heating`, `hydro`, `telecom`, `lighting`, `repairBay`.
- Breakers are physical, binary interactables (no brownout). When the battery is empty, circuits are served by fixed priority and the ones that do not fit go `offline` (SIMULATION_SPEC D7, §2.3).
- Failure: total power loss = game over after a grace period; an `offline` circuit stops its dependent systems.

### 4.3 Life support
- Oxygen: partial pressure percentage, consumed per occupant, produced by electrolyzer (needs power + water).
- CO₂: rises from occupancy, reduced by scrubbers (needs power; filter consumable).
- Temperature: drifts toward Mars ambient without heating; damage to occupants below threshold; hypothermia fail state.
- Pressure: seal integrity; leaks introduce cold and pressure loss.

### 4.4 Food and water
- Water is the shared resource: drinking, electrolysis, hydroponics.
- Food: rations (finite) + hydroponics (needs power, water, light cycle). Rations alone do not last 7 days. A crop that is not harvested in time, or loses light/water too long, spoils.
- Starvation/dehydration damage health slowly; low health slows repairs before it kills.
- Rationing is post-MVP.

### 4.5 Electronics and repairs
- In the MVP, components fail from the seeded incident script, repeated relay overloads, or the CME arrival. Emergent failures from thermal stress are post-MVP.
- Repair requires the correct tool + a spare + time; some repairs require power.
- Spares are scarce; misusing one early makes a later cascade unrecoverable.

### 4.6 Telecom
- Provides the "outside world" feedback: comms from mission control, weather warnings, and system telemetry.
- Signal % follows antenna alignment (dust storms misalign it), telecom power and the antenna motor.
- Below 20 % no data is transmitted; messages queue until the link returns.
- Space weather from a real NASA DONKI snapshot: a CME whose ETA is computed from its measured speed, and solar-flare radio blackouts.
- Primary narrative channel without cutscenes; text-only messages with radio SFX.

### 4.7 Fail and win resolution
- **Win:** alive at the end of day 7.
- **Lose:** player health reaches 0 (damage comes from critical oxygen, CO₂, pressure, temperature, water or food), total power loss, or cascading shutdown.
- Game over is diegetic: emergency lighting, a final status panel, and a short cause-of-failure summary the player can learn from.

---

## 5) Technical architecture

### 5.1 Runtime boundaries

| Layer | May import | Must not import | Responsibility |
| :-- | :-- | :-- | :-- |
| `systems/` | `data/`, `types/`, `utils/EventBus` | `three`, DOM, `vr/`, `world/` | Simulation truth |
| `objects/` | `three`, `systems` (read-only), `vr/`, `ui/` | — | Scene objects + interaction |
| `ui/` | `three`, `systems` (read-only) | — | Diegetic presentation |
| `vr/` | `three`, `objects/`, `systems` (via intents) | — | Input, locomotion, haptics |
| `world/` | `three`, `utils/AssetLoader` | `systems` mutation | Environment |
| `core/` | everything (composition root) | — | Boot, loop, wiring |

### 5.2 Simulation loop
```
Engine frame → TimeManager.advance(dt) → for each system: system.update(dtInGameHours)
            → ResourceManager commits → events → presentation layer reacts
```
Rendering reads state; it never drives it. Time scaling is a property of `TimeManager`, not of the render loop.

### 5.3 State shape
- `ResourceManager`: map of `ResourceState`.
- Each system holds its own topology (circuits, component health, leak states) and reports deltas to `ResourceManager`.
- `GameState`: phase (`boot`, `training`, `playing`, `over`, `won`), day, cause of failure. Pause is time speed 0, not a phase.

### 5.4 Persistence
- `SaveSystem` serializes `GameState` + `ResourceManager` + system snapshots.
- Version field mandatory; migration functions stored in a map `{ 1: migrateV1toV2, ... }`.
- Validate on load; if validation fails, keep the old save intact and start a fresh run rather than crashing.

---

## 6) Data files (planned)

| File (objetivo) | Contenido previsto |
| :-- | :-- |
| `src/data/resources.json` | definiciones de recursos: ids, unidades, límites, valores iniciales, umbrales/dirección/fallo |
| `src/data/balance/*.json` | tasas, tuning, tiempos y parámetros de economía (un archivo por dueño, se fusionan) |
| `src/data/stations/*.json` | colocación de estaciones por sala |
| `src/data/components.json` | metadatos de componentes/herramientas/repuestos |
| `src/data/events.json` | guion de incidentes y avisos |
| `src/data/graphics.json` | ajustes visuales/render (si aplica) |
| `src/data/strings/es/*.json` | strings de UI/comunicaciones en español (común + uno por sala) |
| `src/data/connections.json` (opcional) | dependencias/topología si se externaliza |

Reglas: sin números mágicos en código; los sistemas deben leer configuración y tolerar campos opcionales ausentes con defaults seguros. Mantener `docs/SIMULATION_SPEC.md`, datos y pruebas sincronizados cuando existan.

### Balance and data (current source of truth)

Use `docs/SIMULATION_SPEC.md` and `src/data/*.json` for numeric values, units, thresholds, incident timing, and strings/graphics tuning. Do not rely on ad-hoc tables here for implementation.

<details>
<summary>Historical early sketch (superseded)</summary>

Early first-pass numbers (kept for context only; units/threshold semantics differ from the current spec):

| Resource | Start | Warn | Critical | Notes |
| :-- | --: | --: | --: | :-- |
| Oxygen | 100% | 40% | 15% | ~1.5%/in-game hour baseline consumption |
| CO₂ | 400 ppm | 2000 | 5000 | scrubber reduces ~150 ppm/h when powered |
| Temperature | 21 °C | 12 °C | 4 °C | passive loss ~0.6 °C/h unheated |
| Pressure | 101 kPa | 85 | 70 | leak events drop ~2 kPa/h until sealed |
| Power | 100% battery | 35% | 10% | circuits draw 5–25% per hour combined |
| Water | 60 L | 20 L | 5 L | ~0.4 L/h baseline for one occupant |
| Food | 7 days | 2 days | 0.5 days | rations + hydro supplement |
| Spares | 3 | — | — | one per major repair |

</details>

---

## 7) Room and interaction plan

| Room | Contents | Primary interactions |
| :-- | :-- | :-- |
| Control room (Sala de control) | Spawn; main computer, time lever, bio panel; rover map/NavCam console with driving controls, disconnected vital-status panel, local practice minigame | Read telemetry, start/restart, set time speed, monitor health; operate the rover; practice on the minigame |
| Energy & oxygen (Energía y oxígeno) | Breaker wall + relay, electrolyzer, scrubber, O₂ tanks, thermostat | Reroute power, reset relay, open O₂ tank valves, swap filters, set thermostat |
| Hydro / farming (Hidroponía · Agricultura) | Racks, water tank, ration locker, recycler valve | Harvest before it spoils, unstick recycler, read water/food |
| Telecomunicaciones | Console under the panoramic window (the only direct view outside), steerable antenna, communications distribution panel | Improve antenna alignment, inspect uplink/signal status, read comms and space-weather alerts |
| Hub / tools (Sala central · Herramientas) | Training bench with mission board; tool wall, spares locker | Tutorial missions, pick tools, repair components, consume spares |
| Personal | Bunk with water-tank radiation shelter, locker, dosimeter, space-weather and astronaut-health panels | Shelter during solar storms; review personal and real-data information |

Panel placement per wall: `docs/FLOOR_PLAN.md` §4. Alarm catalog, tools/holsters and accessibility: `docs/SIMULATION_SPEC.md` §9.
| Corridors | Conduits, emergency lights, patched panels | Navigation, leak discovery, alarm localization |

**Interaction affordances**
- Breakers: physical toggle, haptic click, audible clunk.
- Valves: rotate with hand, resistance feedback, hiss on open.
- Tools: grab, socket into component, hold to repair with progress feedback on the component itself.
- Panels: gauges and indicator lights; a small physical button for page cycling is acceptable.

---

## 8) Audio direction

| Layer | Examples | Role |
| :-- | :-- | :-- |
| Room tone | pump hum, air handling, low electrical buzz | Presence and comfort |
| Mechanical | valve hiss, relay clunk, fan spin-up | Confirms actions |
| Alarms | soft amber chirp → urgent red klaxon | Directs attention |
| Comms | filtered radio voice, static, dropout | Narrative and early warning |
| Exterior | muffled Martian wind through seals/airlock | Reminds player of hostile outside |

Audio is the primary spatial cue. Every alarm must be positional at the failing component.

---

## 9) Open questions (resolve before those systems are built)

> The open-issue list lives in `docs/SIMULATION_SPEC.md` §11. MVP scope decision (D20): adjustable thermostat **in**; grow lights = `hydro` breaker; rationing, water refill, door seals and emergent failures are **post-MVP**.

1. ~~Does the player have a body?~~ **MVP:** controllers with grip models only, plus 2 hip holsters.
2. ~~Tutorial?~~ **Resolved 2026-11-14:** training bench in the Sala central · Herramientas hub (time stopped, skippable) + guided day-1 incidents.
3. ~~Pause while reading?~~ **Resolved:** continuous time, physical lever (pause = speed 0), auto-pause on headset removal.
4. ~~Randomization?~~ **Resolved:** fixed script + seeded jitter (timing ± 2 h, magnitude ± 25 %).
5. ~~Is the win state a score (efficiency) or binary?~~ **Resolved 2026-11-11:** binary (alive at end of day 7), with a post-run summary.
6. ~~Which language is the UI?~~ **Resolved 2026-11-11:** player-facing text in Spanish (`src/data/strings/es/*.json`); code/docs in English.
7. **Resolved 2026-11-11:** the player has a `health` bar (0–100) on a diegetic wrist biomonitor; see `docs/SIMULATION_SPEC.md` §4.

---

## 10) Risks and mitigations

| Risk | Mitigation |
| :-- | :-- |
| Coupling simulation to rendering | Enforce import boundaries; Vitest tests run without WebGL |
| Perf blowup from detailed basement | Greybox → kit → bake → atlas; per-room draw-call budget |
| WebXR testing friction | ADB reverse documented as the default path |
| Balance unreadable for learners | Every threshold visible diegetically; post-failure cause summary |
| Asset licensing | Registry with license + attribution; no unknown sources |
| Scope creep (open world, hand tracking) | Stationary + controllers are locked MVP decisions |

---

## 11) Glossary

| Term | Meaning |
| :-- | :-- |
| Diegetic | Existing in the game world (a panel in the room, not a screen overlay) |
| Tick | One simulation step, the base unit of accelerated time |
| Cascade | A failure propagating through dependencies |
| Trade-off | A decision that improves one system at the cost of another |
| Load shedding | Turning off lower-priority circuits (manually or by priority at empty battery) to keep critical ones served |
| Lightmap | Pre-baked lighting stored in a texture, mapped via a second UV set |
| KTX2 | GPU-compressed texture container (Basis Universal) used on Quest |
| Draw call | One render submission; the main performance currency on mobile XR |
