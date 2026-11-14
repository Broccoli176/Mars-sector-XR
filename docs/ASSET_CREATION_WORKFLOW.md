# Asset Creation Workflow — Marte VR Survival

> How every 3D model, texture, lightmap, audio clip and diegetic UI asset is produced, optimized, validated and integrated for Meta Quest 3 (with conservative, Quest 2-class budgets).
>
> Audience: artists, technical artists, and agents generating or modifying assets.
>
> **Baseline documental (pre-implementación):** workflow objetivo. No asume assets, carpetas (`assets-src/`, `public/models|textures|audio`) ni herramientas ya configuradas. Aplicar al introducir assets reales y registrar excepciones/estado en `docs/ASSET_REGISTRY.md` respetando presupuestos de `AGENTS.md`.

---

## 0) Golden rules

1. **1 Blender unit = 1 metre = 1 Three.js unit.** No scaling at import time. Ever.
2. **Budget first, detail second.** If an asset cannot fit its class budget, redesign it — don't decimate the silhouette into mush.
3. **One material per asset where possible, one atlas per asset class.** Draw calls are the scarce resource, not triangles.
4. **Bake static light.** The basement is stationary; nearly everything can be baked.
5. **Runtime gets `.glb`, `.ktx2`, `.ogg` only.** `.blend`, `.psd`, `.wav` masters live in `assets-src/` and never ship.
6. **Origin, scale and rotation must be clean before export.** Apply transforms. Set pivots where the player grabs or rotates.
7. **Every downloaded asset is guilty until proven optimized.** Review, clean, re-export — never drop a raw marketplace file into `public/`.

---

## 1) Asset classes and budgets

| Class | Prefix | Tri budget | Texture | Max materials | Notes |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Room shell / architecture | `ENV_` | 8k–20k per room | 2K atlas | 1 | Shared atlas across all 5 rooms + corridor |
| Corridor module (repeated) | `ENV_` | 2k–5k | 2K shared | 1 | Instance it; reuse the same mesh |
| Large machinery (pumps, scrubbers) | `PROP_` | 2k–6k | 1K | 1–2 | Hero props may use 2 materials |
| Interactable hero object (breaker, valve, panel) | `INT_` / `PANEL_` | 1k–4k | 1K | 1 | Pivot at the interaction point |
| Small prop (ration pack, can, bolt box) | `PROP_` | 100–600 | 512–1K | 1 | Merge into atlases, instance copies |
| Tool | `TOOL_` | 500–1.5k | 512–1K | 1 | Hand-held; clean grip pivot |
| Food / consumable | `PROP_` | 150–800 | 512 | 1 | Atlas per food family |
| Dust / VFX card | — | 2 quads | 256–512 | 1 additive | Avoid full-screen overdraw |
| Diegetic gauge / label | `PANEL_` | quads | 512–1K | 1 emissive | Prefer baked text atlas in MVP |
| Audio (positional) | — | — | — | — | 48 kHz mono `.ogg`, ≤ 2 s loops |

**MVP-specific assets:** `PANEL_TrainingBoard` + practice components on the training bench (Taller, south wall; reuse real component meshes with a "PRÁCTICA" decal, no new materials), `SKT_Holster_L`/`SKT_Holster_R` hip sockets (invisible or minimal 1-material mesh), `PANEL_Biomonitor`, thermostat dial and antenna crank (`INT_`, pivot on the rotation axis). Full panel list: `docs/SIMULATION_SPEC.md` §9.2.

**Whole-scene targets:** <150 draw calls (guide ≈ 25 per room + 15 corridor), 500k–1M tris, ≤ 300–500 MB GPU texture memory (see `AGENTS.md` §7). If a room pushes draw calls over budget, merge static geometry or atlas further — do not remove gameplay props.

---

## 2) Where assets come from

| Source | Use | Policy |
| :-- | :-- | :-- |
| **In-house Blender** | Architecture, panels, hero interactables, layout | Preferred. Built to budget from the start |
| **Downloaded (CC0 / CC-BY)** | Generic props, crates, tools, background greebles | Allowed. Must be cleaned, re-scaled, re-exported and logged |
| **Procedural (Three.js / Blender)** | Terrain outside windows, dust particles, simple conduit runs | Allowed for VFX and repeated geometry |
| **AI-generated images** | Base color / poster / label concepts | Allowed as a starting texture only; must be legally cleared and downscaled |

**Never ship:** assets with unknown licenses, ripped game content, or store-bought packs whose EULA forbids redistribution.

### License logging (mandatory)
Every downloaded asset gets one row in `docs/ASSET_REGISTRY.md`:

| Field | Example |
| :-- | :-- |
| File | `public/models/PROP_Crate_A.glb` |
| Source URL | `https://...` |
| Author | Name |
| License | CC0 / CC-BY 4.0 / Owned |
| Attribution required | Yes/No + text |
| Modifications | Decimated, retextured, rescaled |
| Budget check | 480 tris, 1K texture, 1 material |

If attribution is required, the credit text goes into the game's credits panel **and** this registry.

---

## 3) Folder layout for assets (target)

Create these directories when introducing the corresponding asset types (not all exist in v0.1):

```
assets-src/                     # NOT deployed, track with Git LFS when added
├── blender/
│   ├── ENV_Basement_Master.blend
│   ├── PANEL_LifeSupport.blend
│   └── ...
├── textures-src/               # .psd / .spp / 4K masters
├── audio-src/                  # .wav masters
└── references/                 # concept art, floor plans

public/
├── models/                     # .glb runtime
│   ├── env/
│   ├── props/
│   ├── interactables/
│   └── tools/
├── textures/                   # .ktx2 runtime (+ optional .webp fallback)
├── audio/                      # .ogg runtime
└── fonts/
```

Runtime names use the prefix convention from `AGENTS.md` (`ENV_`, `PROP_`, `INT_`, `PANEL_`, `TOOL_`, `COL_`, `LGT_`, `SKT_`). For current procedural/code-generated visuals, document the source module and validation notes in `docs/ASSET_REGISTRY.md` instead of inventing binary entries.

---

## 4) The pipeline, stage by stage

### Stage 0 — Concept and reference (30–60 min per asset family)

- Collect 3–8 references (real Mars habitat concepts, industrial panels, submarine interiors).
- Decide the **silhouette** and the **interaction affordance** (what the player grabs, turns, presses).
- Note the real dimensions in metres **before** modelling.
- For the basement: the dimensioned plan is **`docs/FLOOR_PLAN.md`** (room coordinates, doors, panel walls, airlock, teleport anchors). A 1:50 drawing in `assets-src/references/` must match it.

**Deliverable:** a sketch or annotated reference sheet in `assets-src/references/`.

---

### Stage 1 — Greybox (layout and scale)

Purpose: validate space and comfort in VR, not visuals.

1. Blender, metric units (`Scene Properties → Units → Metric`, scale 1.0).
2. Build walls, floor, ceiling, doorways as simple boxes at real dimensions.
3. Standard reference heights:
   - Ceiling: 2.6 m (SIMULATION_SPEC §9)
   - Doorway: 2.0 m × 0.8 m clear opening (kit frame outer size 0.9 × 2.1 m)
   - Worktop: 0.9 m
   - Panel centre: 1.2–1.5 m eye-level reach
   - Corridor width: 1.8 m (SIMULATION_SPEC §9)
   - Room sizes and coordinates: `docs/FLOOR_PLAN.md` (authoritative). The two 1 m service shafts are closed volumes: model only their corridor-facing panel and the leak seal
4. Export the greybox to `public/models/env/ENV_Greybox.glb`.
5. **Test in headset before detailing.** Check reach distance (comfortable grab ≈ 0.4–0.7 m), doorway clearance, and teleport spots.

**Acceptance:** you can walk the space with teleport, reach every panel without leaning through walls, and never clip the camera into geometry.

---

### Stage 2 — Modelling (low-poly, game-ready)

**Rules**
- Model to the class tri budget, not above it.
- Hard-surface work: use bevels on silhouettes, not dense subdivision.
- Delete hidden faces (backs of wall panels, undersides of shelves).
- No n-gons in deforming or triangulated areas; keep quads where practical, triangulate on export.
- Apply all transforms (`Ctrl+A → All Transforms`) before export.
- Origin at the logical pivot: base centre for props, hinge axis for doors/valves, grip point for tools.
- Remove unused objects, collections, cameras and lights from the export collection.

**Repetition strategy**
- Corridor, conduits, crates and bolts are **instanced**, never duplicated with unique meshes.
- In Blender, build one module; in Three.js, use `InstancedMesh` or clone the same geometry/material.
- Merge static non-moving props per room into a single mesh where material allows.

**Modular kit for the basement**
| Kit piece | Size | Reuse |
| :-- | :-- | :-- |
| Wall panel | 2.0 × 2.6 m | All rooms |
| Floor tile section | 2.0 × 2.0 m | All rooms |
| Ceiling + light housing | 2.0 × 2.6 m | All rooms |
| Door frame + hatch | 0.9 × 2.1 m outer (0.8 × 2.0 m opening) | Corridor ↔ rooms |
| Conduit run | 2.0 m | Corridor, machine room |
| Panel housing | 0.6 × 0.8 m | All control panels |

---

### Stage 3 — UVs and atlasing

- One UV set for color/ORM, a **second UV set (`UV2`)** for baked lightmaps/AO.
- Texel density target: **~512 px/m** for props, **~256 px/m** for large walls.
- Pack related assets into one atlas:
  - `ATLAS_Rooms` (walls, floors, ceilings)
  - `ATLAS_Machinery`
  - `ATLAS_Props_Small`
  - `ATLAS_Panels`
- Leave 4–8 px padding between islands to prevent bleeding with mipmaps/KTX2.
- No overlapping UVs on the lightmap channel. Overlap is fine on the color channel only for mirrored details.

---

### Stage 4 — Materials and texturing

**PBR setup (glTF-compatible)**
| Map | Channel | Notes |
| :-- | :-- | :-- |
| Base Color | sRGB | No baked lighting in base color |
| ORM | R = AO, G = Roughness, B = Metalness | Single packed texture |
| Normal | Linear | 1K is usually enough; UASTC for KTX2 |
| Emissive | sRGB | Panels, indicator lights, signs |

**Style for this project**
- Grimy industrial: worn paint, scuffs, taped labels, condensation near pipes.
- Color-code function *subtly*: O₂ lines pale blue, power conduits yellow/grey, water green.
- Keep albedo values mid-range so emissive warning lights read clearly in a dim basement.
- Do **not** bake directional lighting or shadows into base color — that fights the lightmap and flickering lights.

**Texture formats**
- Source: PNG/TGA masters in `assets-src/textures-src/`.
- Runtime: **KTX2 (Basis Universal)**.
  - `ETC1S` for albedo/ORM/emissive (smaller, slight quality loss).
  - `UASTC` for normal maps and crisp UI text.
  - Keep a `.webp` fallback only if a target browser fails KTX2 (Quest Browser supports KTX2).

**Commands (pick one path)**
```bash
# A) All-in-one glTF optimization + KTX2 + Draco/Meshopt
npx gltf-transform optimize in.glb out.glb --texture-compress ktx2

# B) Separate texture compression
toktx --t2 --encode etc1s --clevel 4 --qlevel 128 out.ktx2 in.png

# C) Geometry compression only
npx gltf-transform draco in.glb out.glb
# or
npx gltfpack -i in.glb -o out.glb -cc
```

Prefer **Meshopt** (`gltfpack -cc`) over Draco when decode time matters on Quest; Draco files are smaller but decode slower on mobile GPUs. Measure both if the scene is heavy.

---

### Stage 5 — Baking lightmaps and AO

Because the basement is static, baking is the single biggest performance win.

**Option A — Full lightmap bake (preferred for architecture)**
1. In Blender, assign a second UV map named `UVMap_Lightmap` (non-overlapping, packed).
2. Use Cycles, bake type **Diffuse → Direct + Indirect**, disable color, bake to an image (1K–2K per room).
3. Export the lightmap as a separate KTX2 and reference it in Three.js as `material.lightMap` (requires `geometry.attributes.uv1`/`uv2` depending on Three version — verify against your Three.js release).
4. Set `material.lightMapIntensity` to tune.

**Option B — AO-only bake (simpler, MVP-friendly)**
1. Bake **Ambient Occlusion** to the second UV set.
2. Export as ORM's R channel or a separate AO texture.
3. Use `material.aoMap`.

**Option C — Vertex colors / fake gradients**
For very cheap rooms, bake soft gradients into vertex colors and skip textures. Acceptable for corridor filler.

**Rules**
- Bake with the *same* light layout as the runtime scene (positions/intensities), or the result won't match flickering lights.
- Keep real-time lights only for: emergency strobes, alarm beacons, and the player's tool light. These should **not** cast shadows.
- Never double-light: if the bake includes a light, don't also keep a real-time version of it.

---

### Stage 6 — Collision and interaction metadata

**Collision**
- Create a separate collection per asset named `COL_<AssetName>`.
- Use boxes, capsules and convex hulls only. No collision meshes for decorative greebles.
- Export colliders either as a separate GLB (`ENV_Room_Central_COL.glb`) or as named child meshes; the loader hides them from rendering.
- **No physics engine in MVP** (SIMULATION_SPEC D11). `COL_` meshes are used for teleport targeting (`COL_Floor_*`), raycasts and the simple kinematic floor drop of released tools. If physics is added later, static architecture → trimesh/box compound, dynamic props → convex hull or primitive.

**Interaction metadata**
- Add Empties in Blender named with prefixes:
  - `SKT_Grab` — where the hand attaches
  - `SKT_ToolSocket` — where a tool plugs in
  - `LGT_Alarm` — where the alarm light emissive lives
  - `ANM_Hinge` — hinge axis for valves/doors
- Export the empties as nodes (glTF keeps them). Read them by name in `objects/`.
- Keep interaction pivots at the *physical* rotation axis, not the object centre.

---

### Stage 7 — Blender export settings

Use **File → Export → glTF 2.0 (.glb)**:

| Setting | Value |
| :-- | :-- |
| Format | glTF Binary (`.glb`) |
| Include | Selected objects / active collection only |
| Transform | +Y up (default) |
| Apply Modifiers | On |
| Data | Meshes, materials, UVs, normals, tangents (only if normal maps), no cameras/lights |
| Compression | Off in Blender — compress afterwards with `gltf-transform`/`gltfpack` so you control the result |
| Animations | Only if the asset actually animates |

Name the export exactly as the runtime file: `PROP_Pump_A.glb`, `PANEL_LifeSupport.glb`.

---

### Stage 8 — Optimization pass

Run on every asset, every time (fast, scriptable):

```bash
# Merge duplicate materials, prune unused data, weld vertices, compress textures
npx gltf-transform optimize raw.glb public/models/props/PROP_Pump_A.glb \
  --texture-compress ktx2 --texture-size 1024 --compress meshopt

# Inspect the result
npx gltf-transform inspect public/models/props/PROP_Pump_A.glb
```

Checklist after optimization:
- [ ] Triangle count within class budget
- [ ] Draw calls: material count ≤ class max
- [ ] Textures ≤ 1K (props) / 2K (architecture), KTX2
- [ ] No unused nodes, cameras, lights, animations
- [ ] Normals/tangents sane (no black shading)
- [ ] Bounding box matches real-world size
- [ ] Pivot/origin preserved
- [ ] No negative scale

---

### Stage 9 — Integration in Three.js

**Loader setup (single place)**

```js
// utils/AssetLoader.js (JS + JSDoc per SIMULATION_SPEC D12)
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** @param {import('three').WebGLRenderer} renderer */
export function createLoader(renderer) {
  const ktx2 = new KTX2Loader()
    .setTranscoderPath('/basis/')
    .detectSupport(renderer);

  const draco = new DRACOLoader().setDecoderPath('/draco/');

  return new GLTFLoader()
    .setKTX2Loader(ktx2)
    .setDRACOLoader(draco)
    .setMeshoptDecoder(MeshoptDecoder);
}
```

**Rules**
- Preload room assets before the XR session starts; show a diegetic "systems booting" panel instead of a blank void.
- Cache by URL; dispose geometries/materials/textures when a room unloads.
- Never create a new material per instance — clone the shared material only when you need per-instance emissive changes; otherwise use vertex colors or instancing attributes.
- Static room meshes: set `matrixAutoUpdate = false`.
- Mark large static architecture `frustumCulled = true` but keep room-level culling groups so an entire room can be skipped.
- Enable `renderer.xr.setFoveation(...)` if supported; measure visual impact.

**Scene assembly pattern**
```
WorldRoom (Group)
├── Static (merged meshes, baked lightmap material)
├── Props (shared materials, instanced where possible)
├── Interactables (INT_/PANEL_ nodes with SKT_ children)
├── Colliders (COL_ nodes, invisible)
└── Lights (only emergency/alarm, no shadows)
```

---

### Stage 10 — VR validation (must happen on hardware)

For every new room or asset family:

1. **Scale check** — a 0.9 m worktop hits mid-thigh? A panel at 1.4 m is comfortable? Doorways clear?
2. **Reach check** — can you grab every interactable from a natural standing position without leaning through geometry?
3. **Legibility check** — gauge text readable at 0.5–0.8 m; color states distinguishable in dim light.
4. **Comfort check** — no flicker-induced discomfort; alarm strobes ≤ 3 Hz; no large moving transparent surfaces near the face.
5. **Performance check** — frame time stable at 72 Hz in the busiest room, with alarms and dust VFX active.

Log results in the asset registry (pass/fail + measured draw calls).

---

## 5) Downloaded-asset cleanup workflow

Marketplace/Sketchfab assets are usually 10–100× too heavy and wrongly scaled.

1. **Import** into a fresh Blender scene.
2. **Measure** the bounding box; scale to real metres and apply transforms.
3. **Inspect** topology: delete hidden internals, merge by distance, remove loose verts.
4. **Decimate** to the class budget (collapse, keep silhouette) or retopo if the shape matters.
5. **Rebuild materials** — never keep 12 marketplace materials. Bake color down to one atlas if necessary.
6. **Re-UV** if the original UVs are unusable for atlasing.
7. **Rename** with project prefixes, set the pivot, add `COL_` and `SKT_` helpers.
8. **Export + optimize** as in Stages 7–8.
9. **Log license and attribution** in `docs/ASSET_REGISTRY.md`.

---

## 6) Diegetic UI and text assets

- **MVP approach:** pre-render panel faces (labels, gauge scales, warning legends) into a texture atlas in Blender/Photoshop; drive needles/bars/lights with separate meshes and emissive materials.
- **Dynamic text** (day counter, live values): render to a `CanvasTexture` at low update rate (1–4 Hz), not every frame. Keep canvas ≤ 512×256 per panel.
- **Legibility rules:** minimum ~2 cm cap height at 0.6 m viewing distance; high contrast; avoid pure red on pure black (use amber/white on dark grey). Test in dim lighting.
- **No world-space floating text over objects.** Put information on the object or its adjacent panel.
- Use SDF or pre-baked text for anything that must stay crisp; bitmap fonts at 1K blur quickly.

---

## 7) Audio asset workflow

| Type | Format | Notes |
| :-- | :-- | :-- |
| Positional loop (pump hum, vent hiss) | `.ogg`, mono, 48 kHz | Seamless loop, no leading silence. ≤ 10 s loop |
| One-shot (switch click, valve turn, alarm chirp) | `.ogg`, mono | Trim to transient, normalize to −3 dBFS peak |
| Ambient bed (basement room tone) | `.ogg`, stereo | Non-positional, very low level |
| UI/haptic confirmation | `.ogg`, mono | Short (<300 ms), paired with controller haptics |

Rules:
- Loudness-match loops to about −18 LUFS; alarms slightly hotter for urgency.
- Alarms must be **positional** and originate at the failing component — audio is the primary attention guide in a claustrophobic space.
- Avoid high-frequency whines near the ear; test on the built-in Quest speakers.
- Keep simultaneous positional sources ≤ 8.

---

## 8) Git, storage and versioning

- Track `assets-src/` and all binaries with **Git LFS**:
  ```bash
  git lfs install
  git lfs track "*.blend" "*.psd" "*.wav" "*.glb" "*.ktx2"
  ```
- Never commit `node_modules/`, build output, or temporary exports.
- One asset = one logical file pair: `assets-src/blender/PROP_Pump_A.blend` + `public/models/props/PROP_Pump_A.glb`.
- Name versions only when needed (`_v2`), and delete the old one from `public/` in the same commit.
- Record final polygon/texture stats in the registry when the asset is marked *approved*.

---

## 9) Asset registry template

Create `docs/ASSET_REGISTRY.md` with this table and add a row per asset:

| Asset | Class | Tris | Materials | Textures | Source | License | Status | Notes |
| :-- | :-- | --: | --: | :-- | :-- | :-- | :-- | :-- |
| `ENV_Room_Central` | architecture | 14.2k | 1 | 2K atlas + 2K lightmap | in-house | owned | approved | baked, 38 draw calls |
| `PANEL_LifeSupport` | interactable | 1.8k | 1 | 1K | in-house | owned | review | sockets verified |
| `PROP_Crate_A` | prop | 480 | 1 | 1K atlas | sketchfab URL | CC0 | approved | decimated from 12k |

Status values: `wip` → `review` → `approved` → `deprecated`.

---

## 10) Command cheat sheet

**Prereqs (when using this pipeline):** Node/npm; `npx` for `gltf-transform`/`gltfpack` as needed; KTX-Software (`toktx`) for manual KTX2 encoding; Blender 4.x for authoring/export. Install/configure Git LFS before adding large binaries.

```bash
# Inspect any GLB
npx gltf-transform inspect model.glb

# Full optimize (geometry + KTX2)
npx gltf-transform optimize raw.glb out.glb --texture-compress ktx2 --texture-size 1024

# Meshopt compression
npx gltfpack -i in.glb -o out.glb -cc

# Draco compression
npx gltf-transform draco in.glb out.glb

# KTX2 encode (ETC1S / UASTC)
toktx --t2 --encode etc1s --clevel 4 --qlevel 128 out.ktx2 albedo.png
toktx --t2 --encode uastc --uastc_quality 2 out.ktx2 normal.png

# Serve locally for Quest testing
npm run dev -- --host
adb reverse tcp:5173 tcp:5173   # then open http://localhost:5173 on the headset
```

---

## 11) Per-asset acceptance checklist (copy into PRs)

- [ ] Metric scale, transforms applied, pivot correct
- [ ] Tri count within class budget
- [ ] ≤ class material limit; atlas used where required
- [ ] Textures KTX2, correct size, correct color space, no baked lighting in albedo
- [ ] Second UV set present and non-overlapping if baked
- [ ] `COL_` colliders authored (static = boxes/trimesh, dynamic = convex)
- [ ] `SKT_`/`ANM_` markers present and named correctly
- [ ] Asset optimized (`gltf-transform`/`gltfpack`), no cameras/lights/animations left over
- [ ] License logged with attribution if required
- [ ] Verified in VR: scale, reach, legibility, comfort, frame rate
- [ ] Draw call delta measured and within room budget
