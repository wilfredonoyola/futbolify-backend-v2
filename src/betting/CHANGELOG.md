# Changelog - Sistema de Betting GolPicks

Todas las versiones notables del sistema de betting.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.5.0] - 2026-04-03

### Mejoras Quirúrgicas al Modelo de Predicción

**Cambio 1: Multiplicador de Favorito para Lambda (Goles)**
- Nuevo: `calculateFavoriteMultiplier()` en `scoring-goals.service.ts`
- Basado en odds 1X2 del equipo local:
  - Odds < 1.20: +15% lambda (EXTREME_FAVORITE)
  - Odds < 1.35: +10% lambda (STRONG_FAVORITE)
  - Odds < 1.55: +5% lambda (MODERATE_FAVORITE)
- Máximo de inflación: 35% (MAX_LAMBDA_INFLATION = 1.35)
- Razón: Equipos muy favoritos tienden a atacar más y generar más goles

**Cambio 2: Descuento de Independencia Dixon-Coles (Over 1.5)**
- Constante: `POISSON_INDEPENDENCE_DISCOUNT = 0.92`
- Aplicado solo a Over 1.5 1H (no a Over 0.5)
- Razón: Poisson asume independencia entre equipos, pero en realidad hay correlación
- El modelo Dixon-Coles sugiere 8% de descuento para múltiples goles

**Cambio 3: Peso del Árbitro en Modelo de Tarjetas (45%)**
- Nuevo schema: `referee-stats.schema.ts`
- Nuevo interface: `RefereeDataForScoring`
- Pesos actualizados en `scoring-cards.service.ts`:
  - CON árbitro: Árbitro (45%), Team cards (30%), Form (10%), Locality (8%), H2H (7%)
  - SIN árbitro: Team cards (65%), Form (15%), Locality (10%), H2H (10%)
- El árbitro es el predictor más fuerte de tarjetas totales
- Pendiente: Cron para poblar estadísticas de árbitros

**Cambio 4: Ajuste Táctico por Posesión (Corners)**
- Nuevo: `calculateMatchupAdjustment()` en `scoring-corners.service.ts`
- Basado en patrones de posesión:
  - Dominancia local (>60% vs <42%): +15% corners
  - Gap de posesión (>15 puntos): +8% corners
  - Posesión equilibrada (45-55% ambos): -5% corners
  - Dominancia visitante: +12% corners (más contraataques)
- Se combina con multiplicador de favorito para corners

**Cambio 5: Tier 5 y Umbrales Dinámicos por Liga**
- Schema actualizado: tier ahora permite valores 1-5
- Tier 5 para ligas femeninas y ultra-menores
- Nuevas funciones en `value-detection.service.ts`:
  - `getMinEdgeForTier()`: Tier 1=7%, Tier 2=6%, Tier 3=5%, Tier 4=4%, Tier 5=3%
  - `getMinGamesForTier()`: Tier 5 requiere solo 3 partidos mínimo
- Razón: Mercados menos eficientes necesitan menor edge para ser rentables

**Cambio 6: Detección de Correlación Cross-Market**
- Nuevo: Detección automática en `odds-monitor.cron.ts`
- Tipos de correlación:
  - ATTACKING_GAME: Goals Over + Corners Over (ambos equipos empujan)
  - DEFENSIVE_GAME: Goals Under + Corners Under (partido táctico)
  - CHAOTIC_GAME: Goals Over + Cards Over (partido intenso)
- Confidence: HIGH si avgEdge >= 8%, MEDIUM si < 8%
- Se guarda en picks: `crossMarket.detected`, `crossMarket.type`

**Archivos modificados:**
- `src/betting/services/scoring-goals.service.ts`
- `src/betting/services/scoring-corners.service.ts`
- `src/betting/services/scoring-cards.service.ts`
- `src/betting/services/value-detection.service.ts`
- `src/betting/cron/nightly-analysis.cron.ts`
- `src/betting/cron/odds-monitor.cron.ts`
- `src/betting/schemas/betting-league.schema.ts`
- `src/betting/schemas/referee-stats.schema.ts` (NUEVO)
- `src/betting/schemas/index.ts`

---

## [1.4.0] - 2026-04-02

### Filtrado de Mercados por Liga (marketStrengths)

**Nueva funcionalidad:**
- Cada liga ahora tiene un campo `marketStrengths` que define qué mercados son aptos para esa liga
- El sistema solo genera picks para mercados que la liga tiene configurados
- Valores posibles: `goals_1h`, `over25`, `btts`, `corners`, `sharps`

**Ligas Brasileñas Excluidas de Goles 1H:**
- Brasil tiene solo ~65% de Over 0.5 1H (vs promedio global ~75%)
- Serie B (ID: 72) ya no tiene `goals_1h` en sus marketStrengths
- Esto evita picks de baja calidad en ligas con pocos goles en primera mitad

**Archivos modificados:**
- `src/betting/cron/nightly-analysis.cron.ts` (filtro por marketStrengths)
- `src/betting/schemas/betting-league.schema.ts` (campo marketStrengths)

### Result Collector Optimizado

**Cambios:**
- Frecuencia cambiada de cada 2 horas a cada 4 horas (8, 12, 16, 20, 0)
- Reduce carga de API sin afectar la liquidación de picks
- Los partidos se liquidan cuando kickoff fue hace 2+ horas

**Archivos modificados:**
- `src/betting/cron/result-collector.cron.ts`

### Fix: ScheduleModule Duplicado

**Problema:**
- `ScheduleModule.forRoot()` estaba en `app.module.ts` Y `betting.module.ts`
- Esto causaba que algunos cron jobs no se ejecutaran correctamente

**Solución:**
- Removido `ScheduleModule.forRoot()` de `betting.module.ts`
- Solo debe estar en el módulo raíz (`AppModule`)

**Archivos modificados:**
- `src/betting/betting.module.ts`

---

## [1.3.0] - 2026-03-29

### Nuevos Mercados: Tarjetas y BTTS 1H

**Tarjetas (Cards)**
- Nuevo servicio: `scoring-cards.service.ts`
- Modelo: Poisson con λ = tarjetas esperadas
- Pesos: Team card avg (65%), Form (15%), Locality (10%), H2H (10%)
- Líneas: 3.5, 4.5, 5.5 (full match), 1.5 (1H)
- Filtros: MIN_ODDS=1.40, MIN_STARS=3, MIN_GAMES=8
- Razón: Mercado nicho menos eficiente que 1X2

**BTTS 1H (Ambos Marcan Primera Mitad)**
- Integrado en `scoring-goals.service.ts`
- Fórmula: `P(BTTS 1H) = P(Local ≥1 en 1H) × P(Visitante ≥1 en 1H)`
- Cada equipo: `P(≥1) = 1 - e^(-λ)` usando Poisson
- Filtros: MIN_ODDS=1.40, MIN_EDGE=5%, MIN_STARS=3
- Razón: Casas derivan odds de BTTS FT en lugar de modelar 1H específicamente

**Configuración**
- maxPicksPerDay: 5 → 8 (para alcanzar muestra estadística más rápido)

**Combo Engine Mejorado (Multi-Mercado)**
- GEMELA ahora soporta cualquier par de mercados correlacionados:
  - Goals + Corners (clásico)
  - Goals + Cards
  - Goals + BTTS
  - Corners + Cards
  - BTTS + Corners
  - BTTS + Cards
- Nuevo: GEMELA_TRIPLE (3 mercados distintos en mismo partido)
- Umbrales de correlación mínima variables por tipo de mercado:
  - Goals + Corners: 0.30
  - Goals + BTTS: 0.35
  - Cards + otros: 0.20
  - Default: 0.25
- CROSS combos ahora detectan correctamente categorías (GOALS, BTTS, CORNERS, CARDS)
- Actualizada matriz de correlación con BTTS_1H y Cards

**Archivos modificados:**
- `src/betting/services/scoring-cards.service.ts` (NUEVO)
- `src/betting/services/scoring-goals.service.ts` (BTTS 1H)
- `src/betting/services/combo-engine.service.ts` (multi-mercado GEMELA)
- `src/betting/services/correlation.service.ts` (matriz actualizada)
- `src/betting/cron/nightly-analysis.cron.ts` (integración)
- `src/betting/enums/betting.enums.ts` (nuevos MarketTypes)
- `src/betting/schemas/betting-pick.schema.ts` (campos cards)
- `src/betting/telegram/betting-telegram.formatters.ts`

---

## [1.2.0] - 2026-03-27

### Timezone Fixes
- Partidos nocturnos ahora se encuentran correctamente
- Telegram header muestra fecha local correcta

---

## [1.0.1] - 2026-03-26

### Fix: Validación de Tamaño de Muestra Mínimo

**Problema detectado:**
- Partidos como Gibraltar vs Latvia y Malta vs Luxembourg tenían 0 juegos de datos históricos
- El sistema usaba probabilidades por defecto (50%) que inflaban artificialmente via la fórmula `1 - (1-pA)(1-pB)` = 75%
- Esto generaba picks con "edge" falso que perdieron ambos (0-0 HT)

**Solución implementada:**
- Rechazar si **AMBOS** equipos tienen < 3 juegos de historial
- Ambos equipos necesitan datos reales para cálculo confiable
- NO se excluyen Friendlies - el problema es la falta de datos, no el tipo de partido
- Parámetros cambiados: `teamAGames, teamBGames` en lugar de `sampleSize`

**Archivos modificados:**
- `src/betting/services/value-detection.service.ts`
- `src/betting/cron/nightly-analysis.cron.ts`
- `src/betting/betting-test.controller.ts` (diagnose acepta param date)

**Impacto:**
- Elimina picks donde AMBOS equipos tienen < 3 juegos
- Friendlies con datos reales siguen siendo válidos
- Gibraltar vs Latvia (0,0) → RECHAZADO
- Brasil vs Francia (4,0) → RECHAZADO (Francia sin datos)
- Colombia vs Croatia (4,0) → RECHAZADO (Croatia sin datos)

---

## [1.0.0] - 2026-03-26

### Resumen
Primera versión estable del sistema de betting con todas las correcciones matemáticas implementadas.

### Arquitectura
- NestJS 10.x + MongoDB + GraphQL
- 3 Cron jobs: Pick Scanner (7PM), Odds Monitor (30min), Result Collector (2h)
- Telegram bot para alertas (GolPicks)
- 32 ligas configuradas

### Cálculo de Probabilidades
- **Over 0.5 1H:** Fórmula correcta `1 - (1-pA)(1-pB)` (no promedio)
- **Over 1.5 1H:** Modelo Poisson con λ = xG 1H
- **BTS Filter:** Función logística suave (no corte duro)
- **Corners:** Distribución normal con σ = 3.0
- **Consistencia:** Verificación `P(O15) <= P(O05)`

### Detección de Value
- VIG extraction de odds (probabilidades reales)
- Validación de significancia estadística
- Edge mínimo: **5%** (BAJA), 7% (MEDIA), 10% (ALTA)
- Odds mínimas Over 0.5 1H: **1.40**
- Switch inteligente a Over 1.5 cuando odds O05 < 1.40

### Gestión de Riesgo
- Kelly fraccional: **10%** (estándar profesional)
- Penalización por legs: `numLegs^(-0.6)`
- Drawdown protection: pausa automática a 15%
- Máximo pérdidas consecutivas: 7
- Exposición diaria máxima: 15% bankroll

### Sistema de Combos
- 4 tipos: GEMELA, CROSS_LIGA, MISMO_MERCADO, SHARP_GEMELA
- Correlación aplicada a probabilidad conjunta
- Anti-patterns conectados al pipeline

### Documentación
- `BETTING_SYSTEM_TECHNICAL_DOC.md` - Documentación técnica completa

---

## [Unreleased]

### Por implementar
- [ ] Dashboard de métricas en tiempo real
- [ ] Tracking de ROI por mercado y por liga
- [ ] Alertas de CLV (Closing Line Value) después de cada partido
- [ ] Integración con más bookmakers (Pinnacle directo, Betfair)
- [ ] Machine Learning para ajustar probabilidades
- [ ] Mercado BTTS Full Time (si encontramos ineficiencias)
- [ ] Mercado Over/Under goles Full Time
- [ ] Corners Handicap con validación de líneas disponibles
- [ ] Análisis de rendimiento histórico por mercado

---

## Historial de Cambios Menores

### [1.0.1] - 2026-03-26
- Fix: Validación de tamaño de muestra mínimo (MIN_GAMES_FOR_VALUE = 3)
- Fix: Pasar sampleSize a detectValueGoals() en nightly-analysis.cron.ts

### [1.0.0] - 2026-03-26
- Initial release con sistema completo

---

## Versionado

- **MAJOR (X.0.0):** Cambios que rompen compatibilidad
- **MINOR (0.X.0):** Nueva funcionalidad compatible
- **PATCH (0.0.X):** Correcciones de bugs
