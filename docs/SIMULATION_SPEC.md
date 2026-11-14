# Simulation Spec — Marte VR Survival

> **Status: SPEC BASELINE / NOT IMPLEMENTED.** Numeric and rule specification for future implementation. Assumes no existing code, data or tests.
> When implementing, materialize values in data/config files and cover rules with headless tests; keep spec, data and tests in sync.
> Event/save contracts: see `AGENTS.md`. Design intent: see `docs/AGENT_CONTEXT.md`. Player-facing text: see `docs/CONTENT_SCRIPT.md`.
> **Balance values are a paper baseline** (reconciled by hand on 2026-11-14). Re-validate with headless runs as soon as the simulation exists and update this file with the results.

---

## 0) Decisions

✅ = confirmed by the project owner. Others = proposed baseline (2026-11-14), change freely but keep docs aligned.

| # | Decision | Value | Section |
| :-- | :-- | :-- | :-- |
| D1 | Power units | `power` resource = battery **kWh** (stock); all draws/generation in **kW**; `ratePerHour` of power = net kW | §2 |
| D2 | Food unit | **kcal** stored | §3.6 |
| D3 | Inventory vs resources | Resources own consumable quantities (`food`, `water`, `spares`). `inventory` only holds discrete physical items (filters, sealant charges, O₂ tanks) | §7 |
| D4 | Occupants | **1** (the player). No NPC crew in MVP | §3 |
| D5 | Player health | ✅ Health bar (`health`, 0–100) on a diegetic wrist biomonitor + central bio panel | §4 |
| D6 | Win | ✅ Alive at the end of day 7 ⇒ win. Post-run summary | §5 |
| D7 | Power shortage | Breakers are on/off. When the battery is empty, circuits are served by **fixed priority**; unserved circuits go `offline` | §2.3 |
| D8 | Telecom consequence | Signal gates early warnings, storm forecast and CME alert. Below 20 % **no data is transmitted** ✅ | §3.8 |
| D9 | Windows | Underground base: only the **airlock porthole** + **periscope feed** on the main PC | §9 |
| D10 | Player-facing language | ✅ Spanish, via `src/data/strings.es.json`; code/comments in English | §9 |
| D11 | Physics | **No physics engine in MVP.** Dropped tools fall to the floor plane (simple kinematic) and can be re-grabbed; sockets snap | §9 |
| D12 | TypeScript | **Not in MVP.** JS + JSDoc + `// @ts-check`; migrate post-MVP | — |
| D13 | Time controls | Physical lever in the central room: pause / 1× / 2× / 4×. Time keeps running while reading panels. **Pause = speed 0, not a game phase** | §1 |
| D14 | Tutorial | ✅ **Training bench** in the Workshop (Taller, `room_workshop`) (phase `training`, sim time stopped, skippable), then day 1 keeps two guided real incidents | §1, §9.4 |
| D15 | Platform | ✅ **Meta Quest 3** (WebXR, Quest Browser). Budgets stay conservative (72 Hz, Quest 2-class), so Quest 2/3S likely work but are not guaranteed | §9 |
| D16 | Day boundary | ✅ An in-game day **starts at 06:00** | §1 |
| D17 | Headset removal | ✅ **Auto-pause** when the headset is removed or the session loses focus | §1 |
| D18 | Crop spoilage | ✅ An unharvested crop, or one without light/water too long, **spoils** | §3.6 |
| D19 | Space weather | ✅ Static snapshot of NASA DONKI (`src/data/spaceWeather.json`) drives a CME and two radio blackouts. No live API in MVP | §6.3 |
| D20 | MVP mechanic scope | Adjustable thermostat **in**. Grow lights = `hydro` breaker only. Rationing, door seals and unscripted failures **out** (post-MVP) | §3.3 |
| D21 | Comms | **Text only** (screen + printer) with radio SFX. No voice in MVP | §9 |
| D22 | Save in hackathon | Save/load is a **stretch goal** for the 2-day hackathon | §7 |

---

## 1) Time and phases

| Parameter | Value |
| :-- | :-- |
| Tick | 1 in-game minute |
| Real seconds per in-game day at 1× | 360 (→ 4 ticks/s) |
| Speeds | 0 (pause), 1, 2, 4 |
| Fixed step | Accumulate `realDt × speed × ticksPerSecond`; run whole ticks |
| Catch-up cap | Max **8 ticks per frame**; discard the excess (avoid spiral of death after a hitch) |
| Day boundary | **06:00.** Day N spans N 06:00 → N+1 05:59. `time:dayStarted` fires at 06:00 |
| Session start | Day 1, 06:00 (tick 0) |
| End | Day 8, 06:00 = end of day 7 = **tick 10 080** (exactly 7 × 24 h; ≈ 42 min at 1×) |

Systems receive `dtHours = 1/60` per tick. Rates below are **per in-game hour**. Clock times in this spec are "day N, hh:mm" using the 06:00 boundary (all scripted times are between 06:00 and 23:59, so there is no ambiguity).

### 1.1 Phases (`GameState`)
`boot → training → playing → over | won`

| Phase | Sim time | Notes |
| :-- | :-- | :-- |
| `boot` | stopped | Assets load; diegetic "systems booting" panel |
| `training` | stopped | Training bench (§9.4). Pressing "Iniciar turno" on the main PC moves to `playing` (also skips training) |
| `playing` | runs at lever speed | |
| `over` / `won` | stopped | Summary on main PC; restart lever → `boot` (new seed) |

**Pause is speed 0, not a phase.** `time:setSpeed { speed: 0 }`.

**Auto-pause (D17):** on `document.visibilitychange` → hidden, or `XRSession` `visibilitychange` → `visible-blurred`/`hidden`, the time manager stores the current speed, forces speed 0 and emits `time:autoPaused { previousSpeed }`. It does **not** auto-resume: the time lever light blinks and the player resumes by moving the lever.

---

## 2) Power

### 2.1 Storage and generation

| Item | Value |
| :-- | :-- |
| Battery capacity | 60 kWh |
| Battery start | 30 kWh (50 %) |
| Warn / critical | 18 kWh (30 %) / 6 kWh (10 %) |
| RTG (constant) | **0.5 kW** |
| Solar mast | **1.6 kW** from 06:00 to 18:00, 0 at night |
| Dust storm factor on solar | × 0.2 |
| Bus limit | 3.0 kW total demand; above it for 5 in-game minutes the main relay trips |

Generation: clear day ≈ **31.2 kWh** (12.0 RTG + 19.2 solar); storm day ≈ **15.8 kWh**.

### 2.2 Circuits

| Circuit | Draw when on | Notes | Priority (1 = highest) |
| :-- | --: | :-- | :-- |
| `lifeSupport` | up to 0.8 kW | electrolyzer 0.5 + scrubber 0.3, each only while running; circuit demand = current running draw | 1 |
| `heating` | 1.0 kW | thermostat duty cycle (§3.3) | 2 |
| `lighting` | 0.2 kW | off ⇒ emergency lighting only | 3 |
| `telecom` | 0.3 kW | | 4 |
| `hydro` | 0.6 kW | grow lights only during 06:00–22:00 | 5 |
| `repairBay` | 0.4 kW | only while a powered repair is in progress | 6 |

### 2.3 Daily energy budget (reconciled, average draw including duty cycles)

| Load | Avg kW | kWh/day | Basis |
| :-- | --: | --: | :-- |
| Electrolyzer | 0.375 | 9.0 | 75 % duty (consumption 1.5 / production 2.0 %/h) |
| Scrubber | 0.24 | 5.8 | 80 % duty (production 120 / scrubbing 150 ppm/h) |
| Heating | 0.33 | 8.0 | 33 % duty at the default setpoint (§3.3) |
| Lighting | 0.2 | 4.8 | |
| **Essentials subtotal** | | **27.6** | |
| Telecom | 0.3 | 7.2 | |
| Hydro | 0.4 | 9.6 | 16 h/day |
| **Everything on** | | **44.4** | repairBay excluded (occasional) |

| Scenario | Clear day | Storm day |
| :-- | --: | --: |
| Essentials only | **+3.6** kWh/day | **−11.8** |
| Everything on | **−13.2** (30 kWh battery empty in ≈ 2.3 days) | **−28.6** |

**Headless check (prototype v0.1, `npm run sim`, 2026-11-14):**
- The everything-on day costs ≈ −13.6 kWh, matching this table.
- **Idle** player: `powerLoss` at day 1, 15:00.
- **Greedy** player (everything on, resets relay, harvests): `powerLoss` at day 3, 23:54.
- **Competent** policy (sheds telecom/lighting, thermostat 16 °C in storm, harvests on time): survives, but **with ≈ 2 health**. The battery hits 0 on day 5–6, hydro is cut and the crop is lost, so food runs out at day 6.
- Balance is tight. Candidate levers if playtests agree: battery start, or making hydro cheaper.

**That gap is the core trade-off:** the player can run everything on a clear day only by spending battery, and must shed `hydro`/`telecom` (and maybe lower the thermostat) during the 36 h storm. At night with an empty battery the RTG (0.5 kW) cannot carry the full `lifeSupport` draw (0.8 kW), so a drained battery is genuinely dangerous.

### 2.4 Rules
- Breakers are binary. `breaker:toggle` turns demand on or off.
- If the battery is above 0, all circuits that are on get served.
- If the battery is at 0, only generation is available. Serve circuits in priority order using their **current** draw; a circuit that does not fit goes `offline` and emits `power:lost { circuitId }`.
- **Overload:** if demand stays above the bus limit for 5 in-game minutes (5 ticks), the main relay trips: every circuit loses power, breakers **stay in their positions**, and an alarm sounds. `power:overloadWarning` fires as soon as demand exceeds the limit. Resetting the relay (one lever at the breaker wall) costs nothing and restores every circuit whose breaker is on. The **3rd trip within 24 in-game hours burns the relay**; it needs 1 spare to repair.
- **Total power loss:** `lifeSupport` **unserved for 3 continuous in-game hours for any reason** (offline by priority, breaker off, relay tripped or burned) ⇒ `game:over { reason: 'powerLoss' }`. Exception: during the **guided day-1 relay trip** the counter starts 3 h late (6 h total grace), so a new player has time to find the reset lever.

---

## 3) Life support, food, water, telecom

Single occupant. Each resource follows the `ResourceState` contract in `AGENTS.md` §4.1.

### 3.0 Resource limits

| Resource | min | max | start | direction | warn | critical | failAt |
| :-- | --: | --: | --: | :-- | --: | --: | --: |
| `power` (kWh) | 0 | 60 | 30 | low | 18 | 6 | — |
| `oxygen` (%) | 0 | 100 | 100 | low | 40 | 15 | 10 |
| `co2` (ppm) | 400 | 10 000 | 400 | high | 2 000 | 5 000 | 8 000 |
| `temperature` (°C) | −20 | 30 | 21 | low | 12 | 4 | −5 |
| `pressure` (kPa) | 0 | 101 | 101 | low | 85 | 70 | 60 |
| `water` (L) | 0 | 50 | 40 | low | 15 | 5 | 0 |
| `food` (kcal) | 0 | 15 000 | 10 000 | low | 5 000 | 1 250 | 0 |
| `spares` (count) | 0 | 10 | 3 | low | 1 | 0 | — |
| `signal` (%) | 0 | 100 | 95 | low | 50 | 20 | — |
| `health` | 0 | 100 | 100 | low | 50 | 25 | 0 |

Status `offline` applies to resources only for `signal` (telecom unpowered or radio blackout). Circuits and components use `offline` independently.

### 3.1 Oxygen (`oxygen`)
| Item | Value |
| :-- | :-- |
| Consumption | −1.5 %/h |
| Electrolyzer (powered + water + healthy) | +2.0 %/h while O₂ < 100; uses 0.05 L/h water |
| Leak active | extra −1.0 %/h |
| Emergency O₂ tanks | 2 tanks (`valve_o2_tank_1`, `valve_o2_tank_2`); opening one = +30 % once |

### 3.2 CO₂ (`co2`)
| Item | Value |
| :-- | :-- |
| Production | +120 ppm/h |
| Scrubber (powered + filter life > 0 + fan healthy) | −150 ppm/h while > 400 |
| Filter life | 48 h of scrubbing; installed filter starts at **10 %** (day-1 guided swap, §6.2) |
| Spare filters | **3** in inventory (the day-1 swap uses one, 2 remain) |

### 3.3 Temperature (`temperature`) and thermostat
| Item | Value |
| :-- | :-- |
| Passive loss | Newton cooling toward **T_ext = −20 °C**: `−k × (T − T_ext)`, `k = 0.6 / 41 ≈ 0.0146 /h` (= −0.6 °C/h at 21 °C) |
| Leak active | extra −1.0 °C/h |
| Heater on | +1.8 °C/h |
| Thermostat | Player-adjustable dial, setpoint **16–22 °C** (default 21), hysteresis ±1 °C. Intent `thermostat:set { setpointC }` |
| Duty cycle | ≈ 33 % at 21 °C (8.0 kWh/day); ≈ 29 % at 16 °C (7.0 kWh/day) |
| `pump_thermal` broken | heater output halved (+0.9 °C/h) ⇒ about twice the energy |

The thermostat is a **modest lever** (≈ 1 kWh/day) that mainly matters during the storm. Lowering it also reduces the buffer before hypothermia if heating is lost.

### 3.4 Pressure (`pressure`)
| Item | Value |
| :-- | :-- |
| Leak | −2 kPa/h until sealed |
| Recovery (sealed, lifeSupport powered) | +1 kPa/h. Simplification: consumes no extra resource |
| Seal | `TOOL_SealantGun`, 1 charge per leak, 3 charges in inventory |

### 3.5 Water (`water`)
| Item | Value |
| :-- | :-- |
| Drinking | −0.104 L/h; **85 % recovered** if lifeSupport is powered and `valve_recycler` is free |
| Electrolysis | −0.05 L/h while running (not recovered) |
| Hydro | −0.15 L/h while grow lights are on; 50 % recovered as condensate |
| At 0 | −4 health/h (§4) |

Without recycling, total use ≈ 0.30 L/h, ≈ 50 L per run, which loses. With recycling ≈ 0.14 L/h, ≈ 24 L per run. Turning hydro off also saves water, at the cost of food.

### 3.6 Food (`food`) and hydroponics
| Item | Value |
| :-- | :-- |
| Start | **10 000** kcal (20 ration packs × 500) |
| Consumption | −104 kcal/h (2 500/day), automatic |
| Growth | Advances only while `hydro` is served **and** water > 0. 48 h of growth ⇒ crop ready |
| Initial growth | 24 h ⇒ first harvest ready on day 2, 06:00 |
| Harvest | `food:harvest` intent at the hydro rack: +1 200 kcal, growth resets to 0 |
| Spoilage (D18) | A ready crop **not harvested within 12 h spoils**. A growing crop **without light or water for 6 continuous hours dies**. Both ⇒ `food:spoiled`, growth resets to 0 |
| At 0 | **−2 health/h** (§4) |

Without hydro, rations run out on day 5, 06:00 and starvation kills around day 7, 08:00. With 3 timely harvests (days 2, 4, 6) food lasts until ≈ day 6, 16:40 and the player survives with ≈ 25 health if nothing else hurts. **Hydro is required.**

### 3.7 Spares (`spares`)
Start **3**. Up to **5** failures can require a spare (4 scripted + `relay_main` if it burns from 3 trips or the CME). At least two must be worked around or left unfixed. That is intentional.

### 3.8 Signal (`signal`) and antenna
| Item | Value |
| :-- | :-- |
| Formula | `signal = 95 × antennaAlignment / 100` when telecom is powered; 0 otherwise |
| `antennaAlignment` | 0–100, starts at 100 |
| Dust storm | alignment −2 points/h |
| Realign | `antenna:align`: crank on the telecom console, hold 4 real s ⇒ alignment 100 |
| `antenna_motor` broken | signal capped at 40, realignment impossible |
| Radio blackout (§6.3) | signal forced to 0 for its duration |

**Data transmission (D8):**
- **< 20 %:** no data is transmitted (`comms:linkLost`). Incoming messages are **queued**, delivered when signal ≥ 20 again (`comms:linkRestored`), and **dropped** if the incident they announce has already triggered.
- **≥ 30 %:** storm forecast delivered (12 h ahead).
- **≥ 50 %:** failure warnings (`warnLeadHours`, §6.2) and CME alerts delivered.

---

## 4) Player health (`health`)

`health` is a regular resource owned by `ResourceManager`. A headless `systems/Crew` module computes its rate each tick. **The player loses when health reaches 0.**

| Item | Value |
| :-- | :-- |
| Regeneration | +2 /h while **none of `oxygen`, `co2`, `pressure`, `temperature`, `water`, `food` is `critical`** and food > 0 and water > 0. `signal`, `power` and `spares` do not block it |

**Damage per in-game hour** (stacks):

| Condition | Critical zone | Fail zone (`failAt`) | Cause tag |
| :-- | --: | --: | :-- |
| Oxygen | ≤ 15 % → −10 | ≤ 10 % → −30 | `suffocation` |
| CO₂ | ≥ 5 000 ppm → −8 | ≥ 8 000 ppm → −30 | `suffocation` |
| Pressure | ≤ 70 kPa → −8 | ≤ 60 kPa → −30 | `suffocation` |
| Temperature | ≤ 4 °C → −8 | ≤ −5 °C → −30 | `hypothermia` |
| Water = 0 | — | −4 (≈ 25 h to death) | `dehydration` |
| Food = 0 | — | **−2** (≈ 50 h to death) | `starvation` |

Each tick, `Crew` emits `crew:damage { cause, ratePerHour }` when the set of active causes changes.

**Cause of death** = the cause tag with the most damage over the last 6 in-game hours.

**Diegetic effects:**
- < 50: repair hold time × 1.25, heartbeat audio, biomonitor amber.
- < 25: repair hold time × 1.5, heavy breathing, slight dim on the comfort vignette, biomonitor red with a chirp.

**Presentation:** biomonitor on the **non-dominant** controller (`PANEL_Biomonitor`): health bar + icons for active causes. Physical device, not a head-locked HUD. The central bio panel mirrors it.

---

## 5) Win, lose, cascade

| Outcome | Rule | `reason` |
| :-- | :-- | :-- |
| Win | Reach tick 10 080 (day 8, 06:00) without a game-over | `survived` |
| Lose | `health` reaches 0 (§4) | `suffocation` / `hypothermia` / `dehydration` / `starvation` (dominant cause) |
| Lose | Total power loss (§2.4) | `powerLoss` |
| Lose | **Unrecoverable cascade**: ≥ 2 critical-chain components broken **and** spares = 0 **and** ≥ 2 resources `critical`, held for 2 h | `cascade` |

Critical-chain components: `pump_thermal`, `electrolyzer_cell`, `scrubber_fan`, `relay_main`.

### 5.1 Post-run summary (main PC)
Cause, day/hour, spares used and on what, min/max of each resource, and the **3 most impactful decisions**:

1. Every player decision is logged: breaker toggle, thermostat change, valve, spare spent, antenna realign, harvest.
2. On the tick a decision is applied, record `Δrate[r]` = net rate per hour of each resource right after minus right before the decision.
3. The decision stays active until superseded by another decision on the same control, or for at most **12 in-game hours**.
4. `score = Σ_r |Δrate[r] × activeHours| / (max[r] − min[r])` using §3.0 ranges.
5. Show the top 3 with their effect in units (e.g. "Apagar hidroponía (día 4, 07:10): +7.2 kWh, −1 cultivo").

The summary also states that the CME effect on surface electronics is a **teaching simplification** (§6.3).

---

## 6) Components, incidents and space weather

### 6.1 Components

| id | System | Effect when broken | Tool | Spares | Hold time (real s) | Needs `repairBay` power |
| :-- | :-- | :-- | :-- | --: | --: | :-- |
| `pump_thermal` | heating | heater output halved | `TOOL_Wrench` | 1 | 10 | no |
| `scrubber_fan` | lifeSupport | scrubber stops | `TOOL_Screwdriver` | 1 | 8 | no |
| `electrolyzer_cell` | lifeSupport | O₂ production stops | `TOOL_SolderIron` | 1 | 15 | yes |
| `antenna_motor` | telecom | signal capped at 40 | `TOOL_Wrench` | 1 | 10 | no |
| `relay_main` | power | all circuits off (when burned) | `TOOL_Screwdriver` | 1 | 8 | no |
| `valve_recycler` | lifeSupport/water | no water recovery | `TOOL_Wrench` | 0 (unstick) | 6 | no |
| `hull_seal_*` | pressure | leak | `TOOL_SealantGun` | 0 (1 charge) | 5 | no |

**Repair timing:**
- Hold times are **real seconds** and do **not** scale with time speed.
- While paused, repairs are frozen.
- Releasing the grip pauses progress, and progress is kept for 30 real seconds.
- A spare is consumed only when the repair completes.

### 6.2 Incident script (`src/data/events.json`)

In-game times. Randomization: timing ± 2 h (clamped to stay within 06:00–23:59 of the same day), magnitude ± 25 %, seeded RNG (§6.4). Day-1 incidents and space-weather events have no jitter.

| Day | Time | Incident | `warnLeadHours` / `minSignal` | Teaches |
| :-- | :-- | :-- | :-- | :-- |
| 1 | 09:00 | Scripted relay trip (guided: reset it at the breaker wall) | — | Relay reset |
| 1 | 14:00 | CO₂ filter at 10 % ⇒ guided swap | — | Consumables |
| 2 | 10:00 | Corridor leak (`hull_seal_corridor`) | 6 / 50 | Locate by sound, seal |
| 3 | 14:00 | `pump_thermal` fails | 8 / 50 | Heater vs electrolyzer power split; spend a spare or not |
| 3 | 16:00 | **Radio blackout** (solar flare, 2 h) | — | Comms loss is not always the antenna |
| 4 | 06:00 → day 5 18:00 | **Dust storm** (solar × 0.2, antenna drift) | 12 / 30 | Load shedding, thermostat |
| 4 | 19:00 | **CME detected** (alert, §6.3) | delivered now / 50 | Space weather, telecom value |
| 4 | 20:00 | `scrubber_fan` fails | 6 / 50 | CO₂ climbs during the storm |
| 5 | 06:00 | `electrolyzer_cell` fails (needs repairBay power during low battery) | 8 / 50 | Spend power to fix power-hungry systems |
| 5 | 15:00 | `valve_recycler` sticks | 4 / 50 | Water recovery |
| 6 | 10:00 | `antenna_motor` fails | 6 / 50 | Fix comms or save the spare? |
| 6 | 12:00 | CME reminder ("impacto en 24 h") | delivered now / 50 | |
| 6 | 13:00 | **Radio blackout** (solar flare, 2 h) | — | |
| 6 | 18:00 | Second leak (`hull_seal_telecom`) | 6 / 50 | |
| 7 | 12:00 | **CME arrival** (§6.3) | see day 4 alert | Telecom early warning pays off |

### 6.3 Space weather (NASA DONKI snapshot, D19)

Source: `docs/references/registro_nasa_donki.md` (NASA CCMC DONKI, 7 days ending 2026-11-14), materialized as `src/data/spaceWeather.json`.

| DONKI datum | Game use |
| :-- | :-- |
| **CME** max speed **974 km/s** (16 CMEs, median 367) | One CME toward Mars. ETA = 1.52 AU (≈ 2.27 × 10⁸ km) / 974 km/s ≈ **65 h**: detected day 4, 19:00, arrives day 7, 12:00. The alert message shows the speed and the ETA calculation |
| **FLR** 6 M-class flares | Two **radio blackouts** of 2 h (day 3 16:00, day 6 13:00): signal forced to 0, messages queued |
| SEP (0 events), HSS (1), RBE (1), GST (0), MPC (0) | **No mechanic.** HSS/RBE/GST/MPC describe Earth's magnetosphere, which Mars lacks; SEP had no events. Used only as ambient comms text |

**CME arrival rule:** at arrival, if total demand > **2.0 kW**, `relay_main` burns (needs 1 spare). In all cases the solar mast is offline for 2 h. Essentials with the heater running draw exactly 2.0 kW, so the player must shed telecom/hydro (or briefly the heater) at 12:00.

**Scientific honesty:** surface-electronics damage from a CME is a **teaching simplification**. On Mars, the main real hazard from solar events is radiation (SEP), and the underground base is shielded by regolith. State this in comms/summary text.

Events: `spaceWeather:alert { kind: 'cme' | 'flare', speedKms?, etaHours? }`, `spaceWeather:impact { kind }`.

### 6.4 RNG
- `mulberry32` seeded PRNG.
- New run seed = `Date.now()`; override with the URL param `?seed=` for tests and demos.
- All jitter is resolved **at run start** into a fixed schedule stored in `gameState`, so save/load does not depend on the PRNG position.

---

## 7) Save (v1) — stretch goal for the hackathon (D22)

- **When:** autosave on `time:dayStarted` (06:00), plus a manual save (`save:request`) at the log terminal in the central room.
- **Where:** `localStorage` key `marte-vr-survival:save:<slot>`, slots `auto` and `manual`.
- **Load flow:** in `boot`, the main PC shows "Continuar" if `auto` validates. On `game:over`/`game:won` the `auto` slot is cleared; `manual` is kept.
- **Validation:** check `version`, required keys and value ranges (§3.0). On failure, keep the stored save untouched and start a new run.
- **Shape:** as in `AGENTS.md` §4.3.
  - `time`: `{ tick, day, hour, speed }`
  - `inventory`: `{ filters, sealantCharges, o2Tanks }`. Ration packs are **not** stored: food lives only in `resources.food` (D3); the ration locker visual is derived from it.
  - `systems.powerGrid`: `{ breakers: {circuitId: bool}, relayTripped, relayTripTicks: [], relayBurned, overloadTicks, cmePending }`
  - `systems.lifeSupport`: `{ filterLife, leaks: [], valves: {valveId: bool}, o2TanksOpened: [], thermostatSetpointC }`
  - `systems.food`: `{ hydroGrowthHours, harvestReady, readySinceHours, unservedHours }`
  - `systems.telecom`: `{ antennaAlignment, queuedMessages: [] }`
  - `systems.electronics`: `{ broken: [] }`. `repairProgress` is **not** saved (it expires after 30 real s).
  - `systems.crew`: `{ damageLog6h: { suffocation, hypothermia, dehydration, starvation } }` (health itself under `resources.health`)
  - `systems.stats`: `{ decisions: [], resourceMinMax: {}, sparesUsed: [] }`
  - `gameState`: `{ phase, powerLossHours, cascadeHours, rngSeed, schedule: [], incidentsFired: [] }`
  - `flags`: `{ trainingDone: [], hintsShown: [] }`

---

## 8) Contrato de eventos (referencia cruzada)

Ver **`AGENTS.md` §4.2** para el contrato de eventos y payloads (baseline + propuestos). Al implementar, mantener allí la tabla canónica de estado (propuesto/implementado) con payload exacto.

`tool:use` se reserva para acciones instantáneas; reparaciones temporizadas usan `repair:*`. Al cambiar payloads/semántica, actualizar `AGENTS.md`, esta spec y suscriptores en el mismo cambio.

---

## 9) Space, VR and presentation

### 9.1 Space and XR

| Item | Value |
| :-- | :-- |
| Ceiling height | 2.6 m |
| Central control | 6 × 6 m |
| Life support, food/hydro, telecom/airlock, workshop (Taller) | 5 × 4 m each (5 m along the corridor) |
| Corridor | 1.8 m wide × 12 m long, all rooms open onto it; central at the east end |
| Service shafts | 1 m wide between the two rooms of each row (closed; corridor leak seal at x = 6) |
| Layout | Coordinates, doors, panel walls and teleport anchors: **`docs/FLOOR_PLAN.md`** (authoritative) |
| Doorways | 0.8 × 2.0 m clear opening |
| Teleport | only onto `COL_Floor_*` meshes; 1–2 named teleport anchors per room plus free floor targeting |
| Reference space | `local-floor`; standing default, seated toggle adds +0.4 m eye-height offset |
| Turning | snap 30° default; smooth turn optional, with vignette |
| Start / restart | Player spawns in central room in front of the main PC (`tp_central_pc`); the PC sends the player to the Taller for training. "Iniciar turno" exists on the main PC and on the training board. After game over, the same PC shows the summary and a physical restart lever |
| Window | airlock porthole (dust storm VFX, 1 quad layer max) + periscope feed on main PC |
| Device | **Meta Quest 3**, Quest Browser (D15) |
| XR settings | 72 Hz default (90 Hz only if measured stable); `setFoveation(1.0)` to start (measure text legibility); `framebufferScaleFactor` 1.0 |
| Audio | ≤ 8 simultaneous positional sources; red alarms preempt amber; at most 2 alarms audible at once |
| Strings | `src/data/strings.es.json`; no hard-coded player-facing text (keys in `docs/CONTENT_SCRIPT.md`) |

### 9.2 Panels per room

| Room | Panels / interactables |
| :-- | :-- |
| Central | Main PC (pages: Estado, Energía, Comms, Resumen; "Iniciar turno" / "Continuar"), breaker wall (6 breakers + relay reset lever + demand meter kW vs 3.0 limit), time lever, bio panel (biomonitor mirror), log terminal (manual save), "Ajustes" panel |
| Life support | O₂, CO₂ and pressure gauges; thermostat dial (temperature gauge built in); filter socket; `valve_o2_tank_1`, `valve_o2_tank_2` |
| Food / hydro | Water tank gauge; kcal counter + ration locker; crop lights (growing / ready / spoiling); harvest rack; `valve_recycler` |
| Telecom / airlock | Signal gauge; alignment crank + alignment needle; message screen/printer; porthole; airlock pressure gauge |
| Workshop (Taller) | Tool wall, spares counter, component status board, **training bench** (§9.4) |
| Corridor | Emergency lights, hull seal panels (leak points), alarm beacons |
| Wrist | Biomonitor on the non-dominant hand |

Every threshold in §3.0 must be readable on at least one of these panels. Wall-by-wall placement: `docs/FLOOR_PLAN.md` §4.

### 9.3 Interaction, tools and alarms

**Valves:** `valve_recycler` (stuck fault, unstick with wrench), `valve_o2_tank_1`, `valve_o2_tank_2` (`valve:turn { valveId, open }`).

**Tools:** `TOOL_Wrench`, `TOOL_Screwdriver`, `TOOL_SolderIron`, `TOOL_SealantGun`.
- One tool per hand, plus **2 hip holsters**. Holsters are sockets attached to the body, not to the head, so they are not a head-locked HUD.
- A tool released outside a socket falls to the floor. If it lands outside the navigable floor, it returns to the tool wall after 10 real s.

**Alarm catalog:**

| Condition | Level | Source position |
| :-- | :-- | :-- |
| Resource reaches `warning` | amber chirp | that resource's room panel |
| Resource reaches `critical` | red klaxon | source component/panel |
| Demand above bus limit (`power:overloadWarning`) | amber | breaker wall |
| Relay tripped / burned | red | breaker wall |
| Leak active | hiss + amber | hull seal |
| Component broken | red | the component |
| Health < 50 / < 25 | amber / red | biomonitor |
| Link lost (`comms:linkLost`) | amber | telecom console |
| Crop ready / spoiling (< 3 h left) | amber chirp | hydro rack |

Acknowledge button on each panel mutes the audio for 60 in-game minutes; the light keeps blinking. States are encoded by **color + icon + blink pattern** (colorblind-safe). Strobes ≤ 3 Hz.

### 9.4 Training bench (tutorial, D14)

Located on the south wall of the Workshop (Taller). The phase is `training`, so sim time is stopped. The bench has a mission board (`PANEL_TrainingBoard`) and practice components that consume no resources or spares. Missions are checked off on the board. The player can skip at any time with "Iniciar turno" on the main PC or on the board.

| Mission | Teaches |
| :-- | :-- |
| T1 | Grab a tool, holster it, drop it, recover it |
| T2 | Practice breaker + relay reset lever |
| T3 | Swap a practice filter (socket) |
| T4 | Seal a practice leak with the sealant gun |
| T5 | Soldering repair: hold, release, resume |

After training, day 1 keeps two guided real incidents (relay trip 09:00, filter swap 14:00) with hints.

### 9.5 Accessibility and settings ("Ajustes" panel, central room)
- Dominant hand (moves the biomonitor to the other wrist).
- Seated or standing.
- Snap or smooth turn, and vignette on or off.
- Master/alarm volume.
- Comms are text, so subtitles are inherent.
- Colorblind-safe state encoding (§9.3).

---

## 10) Acceptance (headless, objetivo)

Con esta spec/datos, los siguientes escenarios deben poder expresarse sin inventar números. Mantener seeds/inputs explícitos y marcar cada uno como **pendiente/implementado** cuando existan tests.

1. **Idle player loses early:** sin intervenir (sin reset del relé del día 1), la partida se pierde el día 1 hacia las 15:00 por `powerLoss` (soporte vital sin servicio tras el disparo guiado de las 09:00 + 6 h de gracia).
2. **Scripted competent play wins:** un guion de inputs (`tests/fixtures/competent.json`, por crear) con reset de relé, cambio de filtro, sellado de fugas, cosechas a tiempo, recorte de carga en tormenta y ante la CME llega vivo al tick 10 080.
3. **Greedy overload during storm loses:** mantener todo encendido durante la tormenta vacía la batería y provoca derrota (`powerLoss` o `hypothermia`) antes del final del día 6.
4. **No hydro loses:** sin cosechas, derrota por `starvation` el día 7.
5. **Health recovery rules:** la salud se regenera al resolverse condiciones críticas y no se regenera con comida o agua en 0.
6. **CME rule:** demanda > 2.0 kW en día 7 12:00 quema `relay_main`; ≤ 2.0 kW no.
7. **Save/load determinism:** guardar en día 3 → cargar → continuar produce el mismo resultado que una ejecución ininterrumpida con la misma seed e inputs (cuando exista SaveSystem).

**Trazabilidad spec ↔ datos ↔ tests:** al materializar valores en archivos de configuración y crear pruebas, documentar seed/condiciones iniciales y actualizar ventanas esperadas (día/causa) en conjunto.

---

## 11) Open issues

Review history: list created 2026-11-14, resolved the same day with owner decisions (✅ in §0) and proposed baselines.

| id | Topic | Status |
| :-- | :-- | :-- |
| OI-1 | `powerLoss` unreachable | ✅ Redefined (§2.4) + RTG lowered |
| OI-2 | Energy budget vs duty cycles | ✅ Reconciled table (§2.3); validate headless |
| OI-3 | Food gives no pressure | ✅ 10 000 kcal start, −2/h starvation, spoilage (§3.6) |
| OI-4 | Day-7 surge weak | ✅ Replaced by CME arrival, threshold 2.0 kW (§6.3) |
| OI-5 | Health regen gate | ✅ Explicit list (§4) |
| OI-6 | Spares/filters count | ✅ §3.2, §3.7 |
| OI-7 | Real vs game time | ✅ §2.4, §6.1 |
| OI-8 | AGENT_CONTEXT-only mechanics | ✅ D20 |
| OI-9 | Resource limits | ✅ §3.0 |
| OI-10 | Telecom / alignment | ✅ §3.8 |
| OI-11 | Hydro | ✅ §3.6 |
| OI-12 | Leak recovery / relay | ✅ §2.4, §3.4 |
| OI-13 | Day boundary, RNG, phases, auto-pause | ✅ §1, §6.4 |
| OI-14 | Save fields / flow | ✅ §7 (stretch goal) |
| OI-15 | Decision attribution | ✅ §5.1 |
| OI-16 | Event payloads / naming | Partially: proposed events in `AGENTS.md` §4.2. Still open: unify `system:*` vs `component:*`, final payloads of `relay:*`, `repair:*`, `item:*` |
| OI-17 | Diegetic UI / alarms | ✅ §9.2, §9.3 |
| OI-18 | Interactions / tools | ✅ §9.3 |
| OI-19 | Tutorial, comms, string keys | ✅ §9.4, `docs/CONTENT_SCRIPT.md` |
| OI-20 | Accessibility | ✅ §9.5. Desktop fallback: emulator only (dev tooling) |
| OI-21 | JSON schemas | ✅ §12 |
| OI-22 | Floor plan, style guide, SFX list, per-room budget | Per-room budget ✅ (`AGENTS.md` §7). Floor plan ✅ (`docs/FLOOR_PLAN.md`). **Open:** style guide, SFX list (post-hackathon) |
| OI-23 | Tooling, schedule, license | Tooling and schedule ✅ (hackathon **14–15 Nov 2026**, `docs/DEVELOPMENT_WORKFLOW.md` §6). **Open:** project license |

---

## 12) Data files and schemas

JSON Schemas live in `src/data/schemas/<file>.schema.json` and are validated by a headless test. Systems tolerate missing optional fields with safe defaults.

| File | Shape (key fields) |
| :-- | :-- |
| `resources.json` | `{ [ResourceId]: { unit, min, max, start, direction, warnAt, criticalAt, failAt? } }` (§3.0) |
| `balance.json` | `{ time: { secondsPerDay, ticksPerHour, maxTicksPerFrame, dayStartHour }, power: { batteryKwh, rtgKw, solarKw, solarHours, stormSolarFactor, busLimitKw, overloadTicks, relayBurnTrips }, circuits: { [id]: { drawKw, priority, activeHours? } }, lifeSupport: {...}, thermal: {...}, water: {...}, food: {...}, telecom: {...}, health: {...}, cascade: {...} }` |
| `components.json` | `[ { id, system, effect, toolId, spares, holdSeconds, needsRepairBay } ]` (§6.1) |
| `events.json` | `[ { id, day, time: "HH:MM", type: 'failure' \| 'leak' \| 'storm' \| 'flare' \| 'cme' \| 'scripted', params: {}, durationHours?, warnLeadHours?, minSignal?, jitter: bool, stringKey } ]` (§6.2) |
| `spaceWeather.json` | `{ source: { institution, platform, url, capturedAt, period }, flr: { total, m, x }, cme: { total, minKms, maxKms, medianKms, meanKms }, sep: {...}, hss: {...}, rbe: {...}, gst: {...}, derived: { marsDistanceKm, cmeEtaHours } }` (§6.3) |
| `strings.es.json` | Flat map `{ "<domain>.<context>.<id>[.<variant>]": "texto con {param}" }` (`docs/CONTENT_SCRIPT.md`) |
| `graphics.json` | Render/XR settings (§9.1), optional |
