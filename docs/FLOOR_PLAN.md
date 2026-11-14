# Floor Plan — Marte VR Survival

> **Baseline (2026-11-14).** Dimensioned plan of the underground base, derived from the owner's sketch. It is the reference for the greybox (`docs/ASSET_CREATION_WORKFLOW.md` Stage 0/1) and for panel placement (`docs/SIMULATION_SPEC.md` §9.2). If the layout changes, update this file, the spec §9 and the `AGENT_CONTEXT.md` diagram in the same change.

---

## 1) Conventions

- Three.js axes: **+x = east, +y = up, −z = north**. 1 unit = 1 m.
- Origin: west end of the corridor centerline, at floor level (y = 0).
- Dimensions are **interior**. Walls are 0.2 m thick, ceiling 2.6 m.
- Doors: 0.8 × 2.0 m clear opening (kit frame 0.9 × 2.1 m outer).

## 2) Plan

```
                         EXTERIOR (regolito)
 z=-4.9 ┌───────[ESCLUSA]───┐ ░░ ┌───────────────────┐
        │     TELECOM       │ ░░ │   SOPORTE VITAL   │
        │     5 × 4 m       │ ░░ │     5 × 4 m       │ ┌────────────────────┐ z=-3
 z=-0.9 └──────┤ ├──────────┘ ░░ └───────┤ ├─────────┘ │                    │
  x=0   ═══════════════  PASILLO 12 × 1.8 m  ═══════════▶   SALA PRINCIPAL    │
 z=+0.9 ┌──────┤ ├──────────┐ ░░ ┌───────┤ ├─────────┐ │      6 × 6 m       │
        │      TALLER       │ ░░ │    HIDROPONÍA     │ │                    │
        │     5 × 4 m       │ ░░ │     5 × 4 m       │ └────────────────────┘ z=+3
 z=+4.9 └───────────────────┘ ░░ └───────────────────┘      x=12 ─── x=18
        x=0.5           x=5.5   x=6.5             x=11.5

   ┤ ├ = door (0.8 m)      ░░ = 1 m service shaft (conduits, not walkable)
   ▶   = 1.8 m open archway into the main room
```

## 3) Rooms

| Room (player name) | id | x | z | Size | Door |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Pasillo | `corridor` | 0 → 12 | −0.9 → 0.9 | 12 × 1.8 m | — |
| Telecom / esclusa | `room_telecom` | 0.5 → 5.5 | −4.9 → −0.9 | 5 × 4 m | south wall, x = 3 |
| Soporte Vital | `room_lifesupport` | 6.5 → 11.5 | −4.9 → −0.9 | 5 × 4 m | south wall, x = 9 |
| Taller (electrónica/reparación) | `room_workshop` | 0.5 → 5.5 | 0.9 → 4.9 | 5 × 4 m | north wall, x = 3 |
| Hidroponía | `room_hydro` | 6.5 → 11.5 | 0.9 → 4.9 | 5 × 4 m | north wall, x = 9 |
| Sala principal | `room_central` | 12 → 18 | −3 → 3 | 6 × 6 m | 1.8 m archway, west wall |
| Service shafts (×2) | `shaft_north`, `shaft_south` | 5.5 → 6.5 | north/south rows | 1 × 4 m | closed; seal panel on corridor side |

Checks: 0.5 + 5 + 1 + 5 + 0.5 = 12 m of corridor; 4 + 1.8 + 4 = 9.8 m total depth; the main room (6 m) is centered on z = 0. Sketch deviation: the main room does not span both rows; it stays at 6 × 6 m to keep the budget.

## 4) Panel placement

Panel centers at 1.2–1.5 m height; comfortable grab distance 0.4–0.7 m from the teleport anchor.

| Room | Wall → elements |
| :-- | :-- |
| Sala principal | **E:** main PC (incl. periscope feed, "Iniciar turno"/"Continuar") + time lever. **N:** breaker wall (6 breakers + relay reset lever + demand meter). **S:** bio panel, log terminal (manual save), "Ajustes" panel near the archway |
| Telecom | **N:** airlock hatch with porthole (only exterior view). **W:** radio console + antenna crank + signal gauge + message printer. **E:** `hull_seal_telecom` |
| Soporte Vital | **N:** electrolyzer + 2 O₂ tanks (`valve_o2_tank_1/2`). **E:** scrubber with filter socket. **W:** O₂/CO₂/pressure gauges. **S (by the door):** thermostat dial |
| Taller | **W:** tool wall. **S:** training bench + mission board (`PANEL_TrainingBoard`, also has "Iniciar turno"). **E:** workbench, spares locker, component status board |
| Hidroponía | **S:** grow racks with crop status lights (harvest). **E:** water tank + gauge + `valve_recycler`. **W:** ration locker + kcal counter |
| Pasillo | Emergency lights every 2 m; alarm beacon above each door; `hull_seal_corridor` on the north wall at the shaft (x = 6) |

## 5) Teleport, spawn and flow

| Anchor | Position (x, z) | Facing |
| :-- | :-- | :-- |
| `tp_central_pc` (spawn) | 15.5, 0 | east (main PC) |
| `tp_central_breakers` | 15, −1.8 | north |
| `tp_corridor_west` | 3, 0 | — |
| `tp_corridor_east` | 9, 0 | — |
| `tp_telecom` | 3, −2.9 | north |
| `tp_lifesupport` | 9, −2.9 | north |
| `tp_workshop` | 3, 2.9 | south (training bench) |
| `tp_hydro` | 9, 2.9 | south |

Free floor targeting is also allowed on `COL_Floor_*`.

- **Spawn** at `tp_central_pc`. In `training`, the main PC shows "Ve al Taller para el entrenamiento", so crossing the corridor is the first teleport practice.
- "Iniciar turno" exists on the main PC **and** on the training board.
- Walking distance from the main PC to the farthest room (Taller/Telecom) is ≈ 15 m, about 3–4 teleports.

## 6) Alarm sources (positional)

| Source | Position |
| :-- | :-- |
| Breaker wall / relay | central N wall |
| Life support resources, scrubber, electrolyzer | Soporte Vital |
| Thermal (`pump_thermal`) | north shaft, audible from the corridor at x = 6 |
| Water, crop, recycler | Hidroponía |
| Signal / link lost, antenna | Telecom console |
| Leaks | at the leaking seal (`hull_seal_corridor` x = 6; `hull_seal_telecom`) |
| Health | biomonitor (wrist) |
| Door beacons | above each door, mirroring the room's worst alarm (guides the player down the corridor) |

## 7) Rendering groups

- Each room, the corridor and the shafts are separate `Group`s for room-level culling. Rooms not visible from the player's room are disabled.
- Draw-call guide: ≈ 25 per room + 15 for corridor and shafts (< 150 total, `AGENTS.md` §7).
- The shafts are closed volumes: model only their corridor-facing panel and the seal.
