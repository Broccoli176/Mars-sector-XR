# Floor Plan — Marte VR Survival

> **Baseline (2026-11-14, v2: hub layout).** A hub-and-spokes underground base derived from the owner's sketch. It is the reference for the greybox (`docs/ASSET_CREATION_WORKFLOW.md` Stage 0/1) and for panel placement (`docs/SIMULATION_SPEC.md` §9.2).
> **Source of truth for coordinates:** `src/data/layout.json`. Walls, floors, collision, teleport and stations are all generated from it. If the layout changes, update that file, this document, the spec §9 and the `AGENT_CONTEXT.md` diagram in the same change.

---

## 1) Conventions

- Three.js axes: **+x = east, +y = up, −z = north**. 1 unit = 1 m. Origin at the centre of the hub, floor level.
- Dimensions are **interior**. Walls are 0.2 m thick, ceiling 2.6 m.
- Doors: 0.8 × 2.0 m clear opening, with a yellow frame. Hub openings to the north and south connectors: 1.8 × 2.3 m.
- The owner's sketch has diagonal corridors. They are built as straight L-shaped corridors with the **same connections**, because the engine handles 90° walls only.

## 2) Plan

```
                          (exterior: Mars, seen through the window)
   ┌────────[VENTANA]──┐                                   ┌──────────────────┐ z=-8.5
   │     TELECOM       │                                   │  SALA DE CONTROL │
   │      5 × 4        ├┤ ├═══════ north hall ════════┤ ├──┤      6 × 6       │
   │   (airlock W)     │          10 × 1.8 m              │  (spawn, main PC)│
   └───────────────────┘              ║                    └──────────────────┘ z=-2.5
 z=-7.5…-3.5                   north connector
 ┌──────────────────┐                ║
 │    PERSONAL      │          ┌─────╨──────┐ z=-2.5
 │      5 × 4       ├┤ ├═ west ═┤ ├  HUB /  │
 │    (empty)       │ corridor │HERRAMIENTAS│
 └──────────────────┘          │   6 × 5    │
 z=-2…2                        └─────╥──────┘ z=2.5
                               south connector
   ┌──────────────────┐              ║                      ┌──────────────────┐ z=4.5
   │   HIDROPONÍA ·   ├┤ ├═══════ south hall ══════════┤ ├──┤  ENERGÍA Y       │
   │   AGRICULTURA    │           12 × 1.8 m                │  OXÍGENO  6 × 5  │
   │      5 × 4       │                                     │                  │
   └──────────────────┘ z=5…9                               └──────────────────┘ z=9.5
   x=-10            x=-5     x=-0.9  x=0.9                  x=7               x=13

   ┤ ├ = door 0.8 m      ║ / ═ = corridor (1.8 m wide)      [VENTANA] = panoramic window
```

## 3) Areas

| Area (player name) | id | x | z | Size | Doors / openings |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Sala central · Herramientas (hub) | `room_hub` | −3 → 3 | −2.5 → 2.5 | 6 × 5 m | N + S 1.8 m openings (x 0), W door (z 0) |
| Sala de control | `room_control` | 5 → 11 | −8.5 → −2.5 | 6 × 6 m | W door (z −5.5) |
| Telecom / Esclusa | `room_telecom` | −10 → −5 | −7.5 → −3.5 | 5 × 4 m | E door (z −5.5); window on the N wall |
| Personal | `room_personal` | −11 → −6 | −2 → 2 | 5 × 4 m | E door (z 0). Crew quarters + dosimeter |
| Hidroponía · Agricultura | `room_hydro` | −10 → −5 | 5 → 9 | 5 × 4 m | E door (z 6.9) |
| Energía y oxígeno | `room_energy` | 7 → 13 | 4.5 → 9.5 | 6 × 5 m | W door (z 6.9) |
| North connector | `conn_north` | −0.9 → 0.9 | −4.6 → −2.5 | 1.8 × 2.1 m | — |
| North hall | `hall_north` | −5 → 5 | −6.4 → −4.6 | 10 × 1.8 m | opening to the connector (x 0) |
| West corridor | `hall_west` | −6 → −3 | −0.9 → 0.9 | 3 × 1.8 m | — |
| South connector | `conn_south` | −0.9 → 0.9 | 2.5 → 6 | 1.8 × 3.5 m | — |
| South hall | `hall_south` | −5 → 7 | 6 → 7.8 | 12 × 1.8 m | opening to the connector (x 0) |

Corridor areas (`light: false`) have emissive ceiling fixtures and colour-coded conduits but no point light. The 6 rooms have one point light each (Quest light budget).

## 4) Panel placement

Panel centres at 1.2–1.5 m height.

| Room | Wall → elements |
| :-- | :-- |
| Sala de control | **E:** main PC (incl. "Iniciar turno"/"Continuar") + time lever. **S:** bio panel. **N:** rover console (`rover_console`, x ≈ 8: MAPA, NAVCAM and ESTADO screens + 6 desk buttons). Settings panel and log terminal pending |
| Energía y oxígeno | **N:** breaker wall (6 breakers + relay reset + demand meter). **E:** O₂/CO₂/pressure/temperature gauges. **S:** CO₂ scrubber with filter socket; 2 emergency O₂ tanks + electrolyzer. **W** (by the door): thermostat. **E:** window onto the solar field (z 7.7–9.3, sill 1.1 m, top 2.1 m; `view: "solar"`) with the rover charging pad outside, and the «Campo solar» label under it (`energy_solar_view`) |
| Hidroponía · Agricultura | **W:** bench with **4 trays** (`hydro_racks`): soil coloured by moisture, procedural plant per crop, panel per tray (crop, growth, moisture bar), «Semilla ▶» and «Sembrar/Cosechar» buttons on the front lip. **N:** crop guide (`hydro_cropguide`, x ≈ −9.05), water tank + recycler (`hydro_water`, x ≈ −7.5), **hose reel** with a grabbable nozzle (`hydro_hose`, x ≈ −5.6). **S:** rations + kcal (`hydro_food`, x ≈ −7.5), **spirulina bioreactor** (`hydro_bioreactor`, x ≈ −5.9) |
| Telecom / Esclusa | **N:** panoramic window (opening x −8.4…−6.6, y 1.1…2.1; 3D Mars diorama `src/world/Porthole.js`) with the operator console under it (status panel, "Alinear antena" button on the desk) and the antenna motor unit. **W:** airlock hatch (wheel + status LED) |
| Sala central · Herramientas | **E:** training bench + mission board (`PANEL_TrainingBoard`, "Iniciar turno", live checklist for mission T1). **N:** "Fuentes científicas" board (`hub_sources`, real-data attribution, x ≈ −1.95) and «Prueba de mandos» controller diagnostics (`hub_controllers`, x ≈ 1.95: live per-hand buttons/axes, select/squeeze counters, ray test button). **S:** tool wall with 4 grabbable tools (`hub_toolwall`, x ≈ 1.95) and spares locker with live counters (`hub_spares`, x ≈ −1.95). **W:** component status board (`hub_status`, z ≈ −1.6) and **electronics bench** (`hub_electronics`, z ≈ 1.35: receiver board on the bench, oscilloscope + instructions on the wall, grabbable multimeter, parts bin) |
| Personal | **W:** dosimeter with real Mars-surface radiation (`personal_dosimeter`, NASA OSDR RadLab / MSL RAD) and «El Sol ahora» (`personal_spaceweather`, along 1.25, NASA DONKI live). **S:** bunk. **N:** locker and «Salud del astronauta» (`personal_health`, along −7.3, NASA OSDR) |

## 5) Teleport, spawn and flow

- **Spawn:** Sala de control, in front of the main PC at (9, −5.5), facing east. In `training` the PC sends the player to the Sala central (hub) for the training bench.
- Teleport works on any floor (`COL_Floor_*`, merged). There are no fixed anchors yet.
- Typical routes from the hub: Control ≈ 13 m, Telecom ≈ 11 m, Energy ≈ 14 m, Hydro ≈ 12 m, Personal ≈ 7 m.
- Keyboard collision (`src/vr/Collision.js`) uses the same walls, the door frames and the solid furniture, with door assist.

## 6) Alarm sources (positional, planned)

| Source | Position |
| :-- | :-- |
| Breaker wall / relay, life support resources, scrubber, electrolyzer | Energía y oxígeno |
| Water, crop, recycler | Hidroponía · Agricultura |
| Signal / link lost, antenna | Telecom console |
| Leaks | at the leaking seal (positions to be defined for the new layout) |
| Health | biomonitor (wrist) + bio panel in Control |
| Door beacons | above each door, mirroring the room's worst alarm |

## 7) Rendering

- Static geometry is merged by material: walls, floors, ceilings, door frames + conduits, and fixtures each take 1 draw call.
- Measured (desktop, `?debug`, 2026-11-14): 6–59 draw calls per view (budget < 150); 6 point lights + 1 hemisphere light.
