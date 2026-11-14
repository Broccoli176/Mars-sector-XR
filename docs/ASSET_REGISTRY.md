# Asset Registry — Marte VR Survival

> Baseline documental: registrar aquí todo asset que entre en runtime (`public/`, binarios empaquetados, audio/fuentes, etc.) y toda fuente de datos externa. Sin excepciones.
> Status: `wip` → `review` → `approved` → `deprecated`.

## Estado actual (inicio limpio)

- **Sin assets registrados.** No hay modelos, texturas runtime, audio ni fuentes de terceros o propios aprobados en este proyecto aún.
- Antes de marcar un asset como `approved`, registrar fuente, licencia, atribución, modificaciones y medición de impacto (tris/materiales/texturas/draw calls según aplique).
- Si se usan assets procedurales generados por código, documentar módulo fuente y validación en la sección correspondiente.

## Procedural (code-generated) visuals

Generated at runtime by our own code. There are no external files and no third-party licences.

| Asset | Source module | Size / cost | Status | Notes |
| :-- | :-- | :-- | :-- | :-- |
| Wall panel texture (seams, rivets, baseboard, grime) | `src/world/textures.js` `createWallTexture` | 256×512 canvas, 1 shared material | wip | World-space UVs: 1 repeat = 2 m × wall height |
| Floor plate texture (tinted per room via vertex colour) | `createFloorTexture` | 256² canvas | wip | 1 repeat = 2 m |
| Ceiling panel texture | `createCeilingTexture` | 256² canvas | wip | Emissive lift, dimmed in emergency |
| Machinery skin for props | `createMachineTexture` | 256² canvas | wip | Shared, tinted per prop colour |
| Telecom window + 3D Mars diorama (dunes, instanced rocks, dish antenna, sun/stars/Phobos, dust points) | `src/world/Porthole.js` (original by teammate B) | ≈ 15 draw calls, no extra lights | wip | Baked vertex shading, tinted by time of day / storm |
| Merged greybox geometry (walls, floors, ceilings, door frames, conduits, light fixtures) | `src/world/Basement.js` | 1 draw call per group | wip | Built from `layout.json` |
| Hydro plants (low-poly foliage + pots) | `src/rooms/hydro/stations.js` | 2 instanced draw calls | wip | Grow with the crop |

Measured with `?debug` in desktop Chrome (2026-11-14): 6–59 draw calls per view on the hub layout (budget < 150). Quest 3 measurement pending.

## Runtime 3D assets

| Asset | Class | Tris | Materials | Textures | Source | License | Attribution | Status | Notes |
| :-- | :-- | --: | --: | :-- | :-- | :-- | :-- | :-- | :-- |
| — | — | — | — | — | — | — | — | — | — |

## Textures

| File | Size | Format | Used by | Source | License | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| — | — | — | — | — | — | — |

## Audio

| File | Type | Duration | Source | License | Status |
| :-- | :-- | :-- | :-- | :-- | :-- |
| — | — | — | — | — | — |

## Fonts

| File | License | Usage | Status |
| :-- | :-- | :-- | :-- |
| — | — | — | — |

## Data sources

| Dataset | Used in | Source | Extracted | Terms | Notes |
| :-- | :-- | :-- | :-- | :-- | :-- |
| NASA DONKI space-weather statistics (last 7 days) | `src/data/spaceWeather.json` (planned), reference `docs/references/registro_nasa_donki.md` | NASA – Community Coordinated Modeling Center (CCMC), DONKI: https://ccmc.gsfc.nasa.gov/DONKI/ | 2026-11-14 | NASA data, publicly available; credit NASA/CCMC | Snapshot only, no live API. Game use is a teaching simplification (`docs/SIMULATION_SPEC.md` §6.3) |

## Attribution text (for credits panel)

> Mantener esta lista sincronizada con las tablas anteriores.

- "Datos de clima espacial: NASA – Community Coordinated Modeling Center (CCMC), DONKI (Space Weather Database Of Notifications, Knowledge, Information). Captura del 14/11/2026."
