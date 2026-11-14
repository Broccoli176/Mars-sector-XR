# Data sources — Marte VR Survival

> Short explanation of the real datasets for the NASA Space Apps 2026 challenge "Build a Junior Astronaut Mission Trainer".
> In-game attribution: hub board «Fuentes científicas» + a source line on every panel that shows real data.
> Verified 2026-11-14.

## Honesty rule

Each panel says which kind of data it shows:
- **live**: «● EN VIVO · consultado a las HH:MM». Only shown after a successful request.
- **snapshot**: «REGISTRO del dd/mm/aaaa · no en vivo». Real data, embedded with its retrieval date.
- **curated**: facts copied by hand from the source page, with their URL.

Real data never drives hidden game rules. Anything time-compressed or simplified (crop growth, CME effects) is labelled that way in-world.

## Datasets

| Dataset | Access | Where in the game | Why (trade-off it teaches) |
| :-- | :-- | :-- | :-- |
| **NASA DONKI** — CMEs, geomagnetic storms (GST), solar energetic particles (SEP), last 7 days. `https://api.nasa.gov/DONKI/{CME,GST,SEP}` | **Live** from the browser (api.nasa.gov sends CORS `*`). Key: `VITE_NASA_API_KEY` in `.env`, else `DEMO_KEY`. 10 s timeout, refreshed every 30 min. Offline fallback: `src/data/real/donki_recent.json` (`npm run data:donki`) | Personal → «El Sol ahora», next to the dosimeter | Links the Sun's real activity right now to radiation and the regolith shielding of the base |
| **NASA OSDR RadLab** — MSL RAD (Curiosity, Gale crater) + ISS DosTel, 24 h on 2023-01-01 | Snapshot (`npm run data:radlab`). The API has no CORS, so it can't be called from the Quest | Personal → dosimeter (rate, chart, shift dose, ISS comparison) | Mars surface vs ISS vs inside the base; why shelter matters |
| **NASA OSDR study search** — OSD-924 (muscle, SpaceX-16), OSD-343 (mitochondrial stress, SpaceX-12 + astronaut data), OSD-812 (human NK cells, simulated microgravity + radiation-relevant cells) | Snapshot of metadata (`npm run data:osdr`). CORS is limited to osdr.nasa.gov. Kid-level summaries hand-written in `strings/es/personal.json` from each study's description | Personal → «Salud del astronauta» (accession + link per study) | Spaceflight effects on the body explain why health, exercise and radiation protection are mission resources |
| **NASA NTRS — CELSS crops**: quinoa (Schlick & Bubenheim 1993, NASA TP-3422, https://ntrs.nasa.gov/citations/19940015664: protein 12–18 %) and spirulina (Tadros 1993 NASA-CR-194123, https://ntrs.nasa.gov/citations/19940009624: edible, evolves O₂; Tadros 1988 NASA-CR-185329: protein up to ≈70 %; Oguchi et al. 1987: food + gas exchange) | Curated by hand (`src/data/real/bioregen_crops.json`) | Hidroponía → crop guide + spirulina bioreactor | NASA chose some crops and algae for life support because they give protein **and** O₂ |
| **CSA Food production toolkit** — crop growth times, crew diet range, plant habitats, O₂/CO₂ | Curated by hand (`src/data/real/csa_food.json`, URL per fact) | Hidroponía → crop guide + rack | Food is slow to grow; light and water compete with power |
| **NASA DONKI snapshot (Person B)** — one CME and two radio blackouts | Static (`docs/references/registro_nasa_donki.md`, planned `src/data/spaceWeather.json`) | Telecom/incidents (spec §6.3) | Space weather degrades comms; a simplified teaching model |

## Evaluated but not used

- **Mars Trek** (trek.nasa.gov): terrain and imagery. Suggested to Person B for the Telecom window view.
- **Mars Rover Photos API** (api.nasa.gov): discontinued, returns 404 "No such app".
- **DONKI `/FLR` on api.nasa.gov**: returns 404, so flares are not part of the live panel.

## Refresh

```bash
npm run data:radlab -- 2023-01-01   # RadLab snapshot
npm run data:osdr                   # OSDR study metadata
npm run data:donki                  # DONKI offline fallback (uses NASA_API_KEY if set)
```

Terms: NASA OSDR https://www.nasa.gov/reference/osdr-help-terms-and-conditions/ · CSA https://www.asc-csa.gc.ca/eng/terms.asp · NASA API data is public (credit NASA/CCMC). See `docs/ASSET_REGISTRY.md` for credits.
