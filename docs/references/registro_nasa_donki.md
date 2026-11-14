# NASA DONKI – Registro de actividad espacial

> Documento de referencia (datos fuente). Uso en el juego: ver §6 y `docs/SIMULATION_SPEC.md` §6.3. Datos materializados en `src/data/spaceWeather.json` (planificado). Atribución en `docs/ASSET_REGISTRY.md`.

## 1. Información de captura

| Parámetro | Valor |
|---|---|
| Institución | NASA – CCMC |
| Plataforma | DONKI |
| Fecha de captura | 14/11/2026 |
| Periodo analizado | Últimos 7 días |
| Fecha inicial aproximada | 08/11/2026 |
| Fecha final | 14/11/2026 |
| Instante seleccionado | 13/11/2026 20:09:51 UTC |
| Eventos mostrados en gráfica | 51 |

## 2. Datos estadísticos de actividad espacial

### 2.1 Erupciones solares (FLR)

| Indicador | Últimos 7 días |
|---|---:|
| Total de erupciones | 6 |
| Clase M | 6 |
| Clase X | 0 |

### 2.2 Partículas energéticas solares (SEP)

| Indicador | Últimos 7 días |
|---|---:|
| Total (>10 MeV, protones >10 pfu) | 0 |
| Total (>100 MeV, protones >1 pfu) | 0 |
| Flujo mínimo (pfu) | 0.2 |
| Flujo máximo (pfu) | 0.5 |

### 2.3 Eyecciones de masa coronal (CME)

| Indicador | Últimos 7 días |
|---|---:|
| Total de eventos | 16 |
| Velocidad mínima (km/s) | 247 |
| Velocidad máxima (km/s) | 974 |
| Velocidad mediana (km/s) | 367 |
| Velocidad promedio (km/s) | 456.6 |

### 2.4 Simulaciones WSA-ENLIL

| Indicador | Últimos 7 días |
|---|---:|
| Total de simulaciones | 14 |
| Total con impactos | 9 |
| Total impactando la Tierra | 0 |

### 2.5 Eyecciones de masa coronal interplanetarias (ICME)

| Indicador | Últimos 7 días |
|---|---:|
| Total de eventos | 0 |
| Total en la Tierra | 0 |

### 2.6 Viento solar de alta velocidad (HSS)

| Indicador | Últimos 7 días |
|---|---:|
| Total de eventos | 1 |
| Velocidad (km/s) | No disponible |

### 2.7 Cruce de magnetopausa (MPC)

| Indicador | Últimos 7 días |
|---|---:|
| Total de eventos | 0 |
| Distancia (UA) | 11.3 |

### 2.8 Aumento de electrones en cinturones de radiación (RBE)

| Indicador | Últimos 7 días |
|---|---:|
| Total (≥2 MeV electrones) | 1 |
| Flujo (electrones/cm²/s/sr) | 1841.1 |

### 2.9 Tormentas geomagnéticas (GST)

| Indicador | Últimos 7 días |
|---|---:|
| Total (Kp ≥ 5) | 0 |
| Kp mínimo | No disponible |
| Kp máximo | No disponible |
| Kp promedio | No disponible |

## 3. Resumen general

| Categoría | Resultado |
|---|---:|
| FLR | 6 |
| SEP | 0 eventos por los umbrales indicados |
| CME | 16 |
| ENLIL | 14 simulaciones |
| ICME | 0 |
| HSS | 1 |
| MPC | 0 |
| RBE | 1 |
| GST | 0 |

## 4. Observaciones para el proyecto de Marte

Los datos pueden servir como referencia para desarrollar eventos ambientales en una simulación de una base marciana.

- **FLR:** generar alertas por actividad solar.
- **SEP:** representar posibles escenarios de exposición a partículas energéticas.
- **CME:** simular alertas por eyecciones de masa coronal.
- **HSS:** representar cambios en las condiciones del viento solar.
- **RBE:** utilizar como referencia para eventos de radiación de electrones.
- **GST:** representar actividad geomagnética.

Estos datos son observaciones del entorno espacial y no representan directamente mediciones de radiación en la superficie de Marte.

## 5. Fuente original

NASA – Community Coordinated Modeling Center (CCMC).

DONKI:
https://ccmc.gsfc.nasa.gov/DONKI/events/?start=now+-+7d&end=now&view=tables

Fecha de extracción: 14 de noviembre de 2026.

Origen: tabla estadística del PDF proporcionado por el usuario.

**Nota:** Se utiliza exclusivamente la columna Last 7 days de la tabla original. Los valores no disponibles se conservan como tales.

## 6. Uso en el juego (decisión 2026-11-14)

| Dato | Uso en MVP | Motivo |
|---|---|---|
| CME, velocidad máxima 974 km/s | **Mecánica.** Una CME hacia Marte: ETA = 1.52 UA (≈2.27·10⁸ km) / 974 km/s ≈ **65 h** (detectada día 4 19:00, llega día 7 12:00). Si la demanda > 2.0 kW al llegar, se quema `relay_main` | Enseña tiempo de tránsito y el valor del aviso temprano |
| FLR, 6 clase M | **Mecánica.** Dos apagones de radio de 2 h (día 3 16:00, día 6 13:00) | Enseña que la pérdida de comunicaciones no siempre es la antena |
| SEP (0 eventos) | Solo texto ambiental | Sin eventos en el periodo |
| HSS, RBE, GST, MPC | Solo texto ambiental | Describen la magnetosfera terrestre, que Marte no tiene |
| WSA-ENLIL, ICME | Solo texto ambiental ("9 simulaciones con impacto") | Contexto |

**Honestidad científica:** el daño de una CME a la electrónica de superficie es una **simplificación didáctica**. En Marte, el riesgo real de los eventos solares es la radiación (SEP), y la base subterránea está protegida por regolito. Los textos del juego lo indican (`docs/CONTENT_SCRIPT.md`).
