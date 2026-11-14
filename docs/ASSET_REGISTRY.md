# Asset Registry — Marte VR Survival

> Baseline documental: registrar aquí todo asset que entre en runtime (`public/`, binarios empaquetados, audio/fuentes, etc.) y toda fuente de datos externa. Sin excepciones.
> Status: `wip` → `review` → `approved` → `deprecated`.

## Estado actual (inicio limpio)

- **Sin assets registrados.** No hay modelos, texturas runtime, audio ni fuentes de terceros o propios aprobados en este proyecto aún.
- Antes de marcar un asset como `approved`, registrar fuente, licencia, atribución, modificaciones y medición de impacto (tris/materiales/texturas/draw calls según aplique).
- Si se usan assets procedurales generados por código, documentar módulo fuente y validación en la sección correspondiente.

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
