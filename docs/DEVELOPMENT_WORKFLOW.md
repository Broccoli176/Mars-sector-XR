# Development Workflow — Marte VR Survival

> How to set up, iterate, test and ship a WebXR survival sim for Meta Quest 3 without drowning in rebuilds.
>
> **Prototipo v0.1:** scripts, simulación y tests ya existen (ver §2). CI, typecheck, validación de JSON Schemas y assets siguen pendientes.

---

## 1) Working principles

1. **Simulation first, rendering second.** Any rule that can be tested headlessly must live in `systems/` and be covered by Vitest.
2. **Test on hardware every session.** The emulator lies about tracking, latency and fill rate. End every work session with a 5-minute Quest pass.
3. **Vertical slices over breadth.** "One working breaker that cuts power to a real oxygen pump" beats five half-wired menus.
4. **Diegetic feedback is a feature, not polish.** If the player cannot see/hear a system failing from inside the room, the system is unfinished.
5. **Budget check at the moment an asset lands**, not at the end.

---

## 2) Setup

### Prerequisites
- Node.js **22 LTS** and npm
- Blender 4.x with the glTF exporter (for assets)
- Chrome with [Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator)
- **Meta Quest 3** in **Developer Mode**, USB-C cable, `adb` available
- Git + Git LFS

### Install and run
Dependencies (pinned exact in `package.json`): `three` 0.187.0 and `mitt` 3.0.1 at runtime; `vite` 8.3.8 and `vitest` 5.1.0 for dev. Planned additions: `typescript` (typecheck only) and `ajv` (schema tests).

```bash
npm ci                 # install
npm run dev            # vite --host
npm run build          # dist/
npm run preview        # serve dist/ locally
npm test               # vitest run (headless sim)
npm run test:watch
npm run sim            # headless balance report (idle / greedy / competent policies)
```

Scripted player policies live in `tests/helpers/policies.js` and are shared by tests and `scripts/simulate.js`.

Dev URL params:
- `?view=x,z,deg` places the player rig.
- `?ff=ticks` fast-forwards the simulation after "Iniciar turno".

### CI (pending)
GitHub Actions on every push/PR: `npm ci` → `npm test` → `npm run build`. On `main`, deploy `dist/` to GitHub Pages (HTTPS) for headset playtests.

### WebXR secure-context problem (read before testing)
`navigator.xr` is only available in a **secure context**. `http://<lan-ip>:5173` is *not* secure in Quest Browser, even though the page loads. Pick one:

| Method | Setup | Use for |
| :-- | :-- | :-- |
| **ADB reverse** (recommended) | `adb reverse tcp:5173 tcp:5173`, open `http://localhost:5173` in Quest Browser | Daily iteration over USB |
| **HTTPS tunnel** | `cloudflared tunnel --url http://localhost:5173` | Wi-Fi testing without USB |
| **Trusted local HTTPS** | `vite-plugin-mkcert` + install CA on headset | Long-term team setup |
| **Deployed HTTPS build** | Netlify/Vercel/GitHub Pages | Milestone demos, playtests |
| **Desktop emulator** | Chrome + Immersive Web Emulator | Fast logic/UI iteration |

If a page loads but shows "VR NOT SUPPORTED" over LAN IP, this is almost always the cause.

### Guard for the Enter-VR button
```js
const supported = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr');
enterVrButton.visible = !!supported;
```
There is no desktop gameplay fallback: desktop runs through the Immersive Web Emulator only (dev tooling). Simulation work does not depend on the headset because `systems/` is tested headlessly. Use `?seed=` for reproducible runs. Keep build and tests green before integrating changes.

---

## 3) Daily development loop

```
1. Pull latest, read AGENTS.md deltas
2. Start dev server with --host
3. Work in this order: data → systems → objects/UI → world → VR validation
4. Fast loop in emulator (logic/UI), then headset pass (scale/comfort/perf)
5. Profile stats: draw calls, tris, frame time
6. Commit in small, conventional steps
```

### Per-change checklist
- [ ] `npm run build` succeeds
- [ ] No new console errors/warnings in XR
- [ ] No new un-baked shadow lights, >2K textures, or >150 draw calls
- [ ] Simulation change covered by a unit test
- [ ] Contracts (events/save schema) updated in `AGENTS.md` if changed

---

## 4) Evolución de arquitectura (guía)

- Mantener `systems/` (o la capa de simulación) headless y testeable; la presentación se suscribe a eventos/intents.
- Construir/refactorizar incrementalmente manteniendo la app ejecutable en cada paso.
- Si se usa tipado progresivo, evitar mezclar migraciones masivas con cambios de comportamiento; preferir pasos pequeños y coherentes. Definir convenciones (JS+JSDoc/TS, estructura) al arrancar y documentarlas.

---

## 5) Implementation order (systems)

| Step | Module | Why first | Done when |
| :-- | :-- | :-- | :-- |
| 1 | `TimeManager` | Everything scales from ticks | Accelerated day advances; `time:tick` fires |
| 2 | `ResourceManager` | Single source of truth | Resources change only through it; events emitted |
| 3 | `PowerGrid` | Most dependencies | Breakers cut/restore real circuits; `power:lost` fires |
| 4 | `LifeSupport` | Deadliest failure | O₂/CO₂/temperature/pressure follow spec §3; status changes at warn/critical thresholds |
| 5 | `Crew` (health) | Single lose path for life support | Health damage/regen per spec §4; cause tag tracked; game over at 0 |
| 6 | `Food` (rations + hydro) | Trade-off pressure | Food/water drain and hydro harvest per spec §3.5–3.6 |
| 7 | `Electronics` | Recovery loop | Induced breakage + spares repair restores a system |
| 8 | `Telecom` | Discoverability | Signal % per spec §3.8; gates early warnings |
| 9 | `IncidentRunner` + weather + space weather | Scripted pressure | `events.json` schedule with seeded jitter; dust storm; CME and radio blackouts from `spaceWeather.json` |
| 10 | `GameState` | Closure | Phases `boot/training/playing/over/won`; 7-day win + all lose paths; post-run summary |
| 11 | Training bench | Onboarding | T1–T5 practice missions, skippable |
| 12 | `SaveSystem` (stretch) | Persistence | v1 round-trip + migration harness |

---

## 6) Plan de la hackathon (sáb 14 – dom 15 de noviembre de 2026)

H1 = sábado 14, H2 = domingo 15. El greybox sigue `docs/FLOOR_PLAN.md`.

| Bloque | Entregable | Hecho cuando |
| :-- | :-- | :-- |
| **H1 mañana** | Bootstrap (Vite, scripts, CI), greybox de 5 salas + pasillo, núcleo headless: `TimeManager`, `ResourceManager`, `PowerGrid` | `npm test` verde; sesión XR abre en Quest 3 |
| **H1 tarde** | `LifeSupport`, `Crew`, breakers, palanca de tiempo, relé, paneles de Central | Breaker apaga un circuito real y se ve/oye |
| **H1 cierre** | Pase en Quest 3: sesión, teleport, agarre, 72 Hz | Checklist VR §8 sin bloqueantes |
| **H2 mañana** | `IncidentRunner` + tormenta + clima espacial DONKI, `Telecom`, `Electronics` (reparaciones), banco de entrenamiento | Partida headless completa con guion |
| **H2 tarde** | Victoria/derrota, resumen, `strings.es.json`, alarmas, audio | Escenarios de aceptación 1–6 de la spec en verde |
| **H2 últimas 2 h** | Perf pass en Quest 3, deploy a GitHub Pages, ensayo de demo. `SaveSystem` solo si sobra tiempo | Build desplegado jugable de principio a fin |

Recortes si falta tiempo (en este orden): guardado → termostato → recordatorio de CME → segundo apagón de radio → T4/T5 del tutorial. Nunca recortar el pase en hardware.

---

## 7) Branching y commits (recomendado)

- Inicializar Git en el bootstrap (H1) con remoto en GitHub (necesario para CI y Pages). Preferir ramas cortas y commits convencionales (`feat:`, `fix:`, `docs:`, etc.).
- Un commit = una intención revisable. No mezclar importación de assets con cambios de lógica.
- Configurar LFS antes de versionar binarios pesados (fuentes o runtime) cuando aplique. Excluir artefactos generados (`dist/`, dependencias).

---

## 8) Testing strategy

### Unit (Vitest, no WebGL)
- Resource math: rates, clamps, thresholds
- Time scaling: tick → hour → day rollover
- Power propagation: breaker state → dependent systems
- Save migrations: v1 → vN fixtures

```js
// example (JS + JSDoc per SIMULATION_SPEC D12)
import { describe, it, expect } from 'vitest';
import { ResourceManager } from '../src/systems/ResourceManager.js';

describe('ResourceManager', () => {
  it('clamps at zero and flags critical', () => {
    const rm = new ResourceManager();
    rm.set('oxygen', 1);
    rm.applyDelta('oxygen', -2, 'lifeSupport');
    expect(rm.get('oxygen').value).toBe(0);
    expect(rm.get('oxygen').status).toBe('critical');
  });
});
```

### Integration (desktop)
- Run the sim at high time scale with rendering off; assert 7 days can be survived with correct play and failed with wrong play.

### VR manual checklist (every session)
- [ ] Session enters/exits cleanly
- [ ] Teleport lands on walkable floor only
- [ ] Direct grab works for breaker/valve/tool at natural reach
- [ ] Alarm audible and locatable by turning the head
- [ ] Gauges readable in dim light
- [ ] 72 Hz in the busiest room during a cascade event
- [ ] No comfort issues after 10 minutes

---

## 9) Performance profiling

| Tool | Use |
| :-- | :-- |
| `renderer.info.render` | Calls, triangles, textures per frame |
| `stats.js` (dev only) | FPS/frame-time graph |
| Chrome DevTools over USB (`chrome://inspect`) | Quest Browser console, memory, CPU profile |
| `gltf-transform inspect` | Per-asset tris/materials/textures before import |
| Frame timing in XR | Confirm stable 72 Hz, not just desktop FPS |

**Escape hatches when over budget**
1. Bake more lighting / remove real-time lights.
2. Merge static meshes per room; atlas materials.
3. Instance repeated props; disable `castShadow` on props.
4. Lower texture sizes (2K → 1K), switch ETC1S.
5. Unload rooms not visible; use room-level groups for culling.
6. Reduce dust/VFX overdraw.

---

## 10) Build and deploy

```bash
npm run build        # dist/
npm run preview      # local check
```

- Deploy `dist/` to any HTTPS static host for headset playtests.
- Ensure `public/basis/`, `public/draco/` (if used) and compressed textures are served with correct MIME types; some hosts need explicit `.ktx2` and `.glb` mappings.
- Add a cache-busting version to assets when swapping GLBs, or Quest Browser may serve stale files.
- Keep the deployed build under the same perf budget — production minification does not fix draw calls.

---

## 11) Risk register

| Risk | Impact | Mitigation |
| :-- | :-- | :-- |
| WebXR secure-context confusion | Blocks all headset testing | ADB reverse from day 0; document in README |
| 2-day hackathon scope | Unfinished demo | Cut list in §6; headless tests first; hardware pass at the end of H1 |
| Scope creep into open-world locomotion | Wasted days, nausea, perf loss | Stationary design is a feature; teleport only |
| Over-modeled basement | Draw calls/tris blow past budget | Greybox → budgeted kit → atlas; measure per room |
| Simulation coupling | Bugs, untestable gameplay | Headless `systems/`, event bus, unit tests |
| Marketplace assets too heavy | Frame drops, long loads | Cleanup pipeline + registry + acceptance checklist |
| Hand-tracking temptation | Tracking loss, rework | Controllers only for MVP |
| Save schema drift | Broken saves mid-jam | Version + migration test fixtures |
| Lighting mismatch | Baked rooms look wrong when alarms fire | Bake static base, keep alarms as separate real-time emissives |

---

## 12) Definition of done for any task

1. Behaviour matches the spec in `AGENTS.md`.
2. Headless logic covered by a test when applicable.
3. Works in the emulator **and** a quick headset pass.
4. No budget regression (draw calls, tris, textures, lights).
5. Docs updated if a contract changed.
6. `npm run build` green.
