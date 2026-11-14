# Marte VR Survival

> **Prototipo v0.1** — simulación headless + greybox WebXR jugable de la base (sin assets finales).

A realistic, stationary **VR survival and management game** set in the first human outpost on Mars. You are the operator of an underground basement habitat: keep life support, power, food, water, telecom and electronics alive for **7 accelerated days** — and learn, by doing, that every engineering decision has a cost.

**Stack:** Three.js, Vite, WebXR y mitt (JavaScript + JSDoc, Vitest, Node 22) para **Meta Quest 3**. Se desarrolla en una **hackathon de 2 días: 14–15 de noviembre de 2026**.

---

## Estado

- **Actual (v0.1):**
  - Hecho: tiempo acelerado (4 ticks/s a 1×), red eléctrica con breakers, relé y tormenta, soporte vital con termostato, filtro y tanques de O₂, hidroponía con cosecha y putrefacción, salud, derrota por energía o salud y victoria en el día 7.
  - Escena: greybox de las 5 salas según [`docs/FLOOR_PLAN.md`](docs/FLOOR_PLAN.md), con paneles diegéticos y biomonitor en la muñeca.
  - Pendiente: telecom/clima espacial, reparaciones, fugas, herramientas, tutorial T1–T5, audio y guardado.
- **Objetivo MVP:** partida completa de 7 días acelerados con gestión de energía, soporte vital, comida/agua, telecomunicaciones y reparaciones; victoria al llegar al final del día 7 con vida; derrota por fallo de salud (asfixia, hipotermia, deshidratación o inanición), pérdida total de energía o cascada irrecuperable.
- **Idioma (objetivo):** texto de jugador en **español**; código y documentación en inglés.

Reglas numéricas: [`docs/SIMULATION_SPEC.md`](docs/SIMULATION_SPEC.md). Intención de diseño: [`docs/AGENT_CONTEXT.md`](docs/AGENT_CONTEXT.md).

## Quick start

Requisitos: Node ≥ 22 + npm. Para el visor: Meta Quest 3 en modo desarrollador y `adb`.

```bash
npm ci
npm run dev        # vite --host → http://localhost:5173
npm test           # simulación headless (Vitest)
npm run sim        # informe de balance: jugador inactivo / codicioso / competente
npm run build && npm run preview
```

### Controles

| Dónde | Cómo |
| :-- | :-- |
| Quest 3 | Botón «ENTER VR». Apunta con el rayo y aprieta el gatillo para pulsar botones o teletransportarte al suelo (aparece un aro azul). Stick: giro de 30°. Biomonitor en la muñeca izquierda |
| Escritorio (solo desarrollo) | Arrastra para mirar, WASD para moverte, clic para pulsar o teletransportarte |

Para empezar, pulsa «Iniciar turno» en el ordenador central (muro este de la sala principal). Los breakers están en el muro norte. A las 09:00 del día 1 salta el relé: rearma desde allí.

Parámetros de desarrollo: `?view=x,z,grados` coloca al jugador y `?ff=ticks` adelanta la simulación al iniciar turno (p. ej. `?ff=545` llega a la derrota por energía del jugador inactivo).

### Testing en Quest 3

WebXR requiere **contexto seguro**. Opciones típicas:

1. **ADB reverse (recomendado):** `adb reverse tcp:<puerto> tcp:<puerto>` y abrir `http://localhost:<puerto>` en Quest Browser.
2. **HTTPS tunnel** o **build desplegado en HTTPS**.
3. **Desktop:** Chrome + [Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator) para iteración rápida (no sustituye pruebas en headset).

Comprobar `navigator.xr.isSessionSupported('immersive-vr')` antes de mostrar el botón de entrar en VR.

## Visión de juego (objetivo)

| Sistema | Rol |
| :-- | :-- |
| Red eléctrica | Alimenta todo; breakers permiten redirigir/sacrificar circuitos |
| Soporte vital | O₂/CO₂, temperatura, presión |
| Comida y agua | Presión a medio/largo plazo; difícil de recuperar |
| Telecomunicaciones | Avisos tempranos y feedback de estado; sin alineación de antena no se transmiten datos |
| Electrónica (Taller) | Repuestos, reparaciones y banco de entrenamiento (tutorial) |
| Clima espacial | CME y fulguraciones basadas en datos reales de NASA DONKI (snapshot estático) |

## Estructura objetivo del repositorio (por crear)

- `src/core/` — arranque/motor/composición (planificado)
- `src/systems/` — simulación headless y propiedad del estado (planificado)
- `src/vr/`, `src/world/`, `src/objects/`, `src/ui/` — presentación e interacción (planificado)
- `src/data/` — balance, recursos, componentes, eventos, strings, gráficos (planificado)
- `src/types/` — contratos compartidos en JSDoc (planificado)
- `docs/` — documentación de diseño e ingeniería
- `tests/` — pruebas headless (planificado)

## Documentación

| Documento | Contenido |
| :-- | :-- |
| [`AGENTS.md`](AGENTS.md) | Contratos/reglas para agentes: arquitectura, eventos, save, presupuestos (baseline) |
| [`docs/AGENT_CONTEXT.md`](docs/AGENT_CONTEXT.md) | Contexto de diseño, sistemas, riesgos |
| [`docs/SIMULATION_SPEC.md`](docs/SIMULATION_SPEC.md) | Especificación numérica de simulación (baseline, no implementada) |
| [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) | Flujo de desarrollo, pruebas y profiling (objetivo) |
| [`docs/ASSET_CREATION_WORKFLOW.md`](docs/ASSET_CREATION_WORKFLOW.md) | Pipeline de assets y validación VR (objetivo) |
| [`docs/ASSET_REGISTRY.md`](docs/ASSET_REGISTRY.md) | Registro de assets/licencias y fuentes de datos |
| [`docs/CONTENT_SCRIPT.md`](docs/CONTENT_SCRIPT.md) | Guion de comms, tutorial y claves de strings |
| [`docs/FLOOR_PLAN.md`](docs/FLOOR_PLAN.md) | Plano acotado de la base (salas, paneles, teleport) |
| [`docs/references/registro_nasa_donki.md`](docs/references/registro_nasa_donki.md) | Snapshot NASA DONKI usado para el clima espacial |
| [`docs/project-context.json`](docs/project-context.json) | Resumen machine-readable |
| [`llms.txt`](llms.txt) | Mapa compacto para LLMs |

## Objetivos de rendimiento (Quest 3, presupuesto conservador)

72 Hz (60 mínimo) · <150 draw calls · 500k–1M tris · texturas optimizadas · iluminación mayormente bakeada · sin cadena de post-procesado por defecto. Verificar en hardware cuando exista implementación.

## Licencia

TBD. Registrar licencias y atribuciones de cualquier asset de terceros en [`docs/ASSET_REGISTRY.md`](docs/ASSET_REGISTRY.md) antes de incluirlo.

