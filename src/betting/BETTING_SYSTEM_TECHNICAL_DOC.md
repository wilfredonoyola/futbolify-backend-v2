# Sistema de Betting GolPicks - Documentación Técnica Completa

> **Versión:** 1.5.0
> **Última actualización:** 2026-04-03
> **Changelog:** [CHANGELOG.md](./CHANGELOG.md)

---

## Estado Actual de Mercados

| Mercado | Estado | Filtros | Eficiencia |
|---------|--------|---------|------------|
| **Goles 1H (Over 0.5/1.5)** | ✅ ACTIVO | MIN_ODDS=1.40, MIN_STARS=3, MIN_GAMES=3, requiere `goals_1h` en marketStrengths | Media |
| **BTTS 1H** | ✅ ACTIVO | MIN_ODDS=1.40, MIN_EDGE=5%, MIN_STARS=3 | Baja (nicho) |
| **Corners (Over/Under)** | ✅ ACTIVO | MIN_ODDS=1.40, MIN_STARS=3, MIN_GAMES=5 | Baja (nicho) |
| **Tarjetas (Over/Under)** | ✅ ACTIVO | MIN_ODDS=1.40, MIN_STARS=3, MIN_GAMES=8 | Baja (nicho) |
| **Corners Handicap** | ⏸️ DESACTIVADO | Las líneas del modelo no coinciden con Bet365 | - |

### Mercados Nicho (Menos Eficientes)

Los mercados nicho como **BTTS 1H**, **Corners** y **Tarjetas** son menos eficientes porque:
1. Menor volumen de apuestas → menos datos para calibrar odds
2. Casas derivan odds de mercados principales en lugar de modelar específicamente
3. Menos escrutinio de apostadores profesionales (sharps)
4. Mayor potencial para encontrar value

---

## Configuración del Usuario

| Setting | Valor Default | Descripción |
|---------|---------------|-------------|
| `maxPicksPerDay` | 5 | Máximo de picks individuales por día |
| `maxCombosPerDay` | 2 | Máximo de combos por día |
| `maxPicksPerMatch` | 2 | Máximo de picks por partido (diversificación) |
| `timezone` | America/El_Salvador | Zona horaria para fechas y alertas |
| `bankroll` | 100 | Bankroll inicial en USD |

---

## Filtrado de Mercados por Liga (marketStrengths)

Cada liga tiene un campo `marketStrengths` que define qué mercados son aptos para esa liga. El sistema **solo genera picks para mercados configurados**.

### Valores Disponibles

| Valor | Descripción |
|-------|-------------|
| `goals_1h` | Goles primera mitad (Over 0.5/1.5 1H) |
| `over25` | Over 2.5 goles partido completo |
| `btts` | Ambos equipos marcan |
| `corners` | Mercados de corners |
| `sharps` | Usa líneas Pinnacle como referencia (The Odds API) |

### Ejemplo de Configuración

```typescript
// Liga con todos los mercados habilitados
{
  name: "Bundesliga",
  marketStrengths: ["sharps", "goals_1h", "over25", "btts"]
}

// Liga sin goles 1H (ej: Brasil Serie B - solo 65% Over 0.5 1H)
{
  name: "Série B",
  marketStrengths: ["over25", "btts"]  // SIN goals_1h
}
```

### Ligas Excluidas de Goles 1H

Las siguientes ligas tienen tasas de Over 0.5 1H por debajo del promedio global (~75%):

| Liga | País | Over 0.5 1H % | marketStrengths |
|------|------|---------------|-----------------|
| Série B | Brasil | ~65% | `["over25", "btts"]` |

> **Nota:** Para excluir una liga de un mercado, simplemente quita el valor de su array `marketStrengths` desde el UI de administración.

### Código de Filtrado

```typescript
// En nightly-analysis.cron.ts
const supportsGoals1H = league.marketStrengths?.includes('goals_1h') ?? false
if (supportsGoals1H && goalsResult.probOver05_1H > 0 && odds) {
  // Analizar mercado de goles 1H
}
```

---

## Cambios v1.5.0 (2026-04-03)

### Multiplicador de Favorito (Goles)

Equipos muy favoritos (según odds 1X2) tienden a atacar más:

```typescript
function calculateFavoriteMultiplier(homeOdds1X2: number | null): {
  multiplier: number
  reason: string | null
} {
  if (!homeOdds1X2 || homeOdds1X2 <= 0) return { multiplier: 1.0, reason: null }
  if (homeOdds1X2 < 1.20) return { multiplier: 1.15, reason: 'EXTREME_FAVORITE' }
  if (homeOdds1X2 < 1.35) return { multiplier: 1.10, reason: 'STRONG_FAVORITE' }
  if (homeOdds1X2 < 1.55) return { multiplier: 1.05, reason: 'MODERATE_FAVORITE' }
  return { multiplier: 1.0, reason: null }
}
```

### Descuento Dixon-Coles (Over 1.5)

```typescript
const POISSON_INDEPENDENCE_DISCOUNT = 0.92  // 8% descuento

// Aplicado solo a Over 1.5 1H
probOver15_1H = probOver15_1H * POISSON_INDEPENDENCE_DISCOUNT
```

### Peso del Árbitro (Tarjetas)

El árbitro es el predictor más fuerte de tarjetas. Nuevo schema `referee-stats.schema.ts`:

| Peso (con árbitro) | Variable |
|-------------------|----------|
| 45% | Estilo del árbitro |
| 30% | Promedio tarjetas equipos |
| 10% | Forma reciente |
| 8% | Localía |
| 7% | H2H |

### Ajuste Táctico por Posesión (Corners)

```typescript
function calculateMatchupAdjustment(homePoss: number, awayPoss: number) {
  // Dominancia local (mucha posesión vs muy poca)
  if (homePoss > 60 && awayPoss < 42) return { multiplier: 1.15, reason: 'POSSESSION_DOMINANCE' }

  // Gap de posesión significativo
  if ((homePoss - awayPoss) > 15) return { multiplier: 1.08, reason: 'POSSESSION_GAP' }

  // Posesión equilibrada (menos corners esperados)
  if (homePoss > 45 && homePoss < 55 && awayPoss > 45 && awayPoss < 55)
    return { multiplier: 0.95, reason: 'BALANCED_POSSESSION' }

  // Dominancia visitante (más contraataques)
  if (awayPoss > 58 && homePoss < 44) return { multiplier: 1.12, reason: 'AWAY_DOMINANCE' }

  return { multiplier: 1.0, reason: null }
}
```

### Tier 5 y Umbrales Dinámicos

| Tier | Min Edge | Min Games | Bonus |
|------|----------|-----------|-------|
| 1 | 7% | 5 | 0% |
| 2 | 6% | 4 | 2% |
| 3 | 5% | 4 | 3% |
| 4 | 4% | 3 | 4% |
| 5 | 3% | 3 | 6% |

### Detección Cross-Market

```typescript
// Correlación detectada automáticamente cuando múltiples mercados
// coinciden en dirección para el mismo partido
interface CrossMarketCorrelation {
  fixtureId: number
  markets: string[]              // ['GOALS_1H', 'CORNERS']
  direction: 'OVER' | 'UNDER'
  correlationType: 'ATTACKING_GAME' | 'DEFENSIVE_GAME' | 'CHAOTIC_GAME'
  confidence: 'HIGH' | 'MEDIUM'  // HIGH si avgEdge >= 8%
}
```

---

## Cambios v1.4.0 (2026-04-02)

### Filtrado por marketStrengths
- Solo genera picks de goles 1H si la liga tiene `goals_1h` en marketStrengths
- Brasil Serie B excluida de goles 1H (65% vs 75% promedio global)

### Result Collector Optimizado
- Frecuencia: cada 4 horas (8, 12, 16, 20, 0) en lugar de cada 2 horas
- Reduce carga de API manteniendo liquidación oportuna

### Fix ScheduleModule
- Corregido `ScheduleModule.forRoot()` duplicado que impedía ejecución de crons

---

## Cambios v1.3.0 (2026-03-29)

### Nuevos Mercados

#### Tarjetas (Cards)
- **Servicio:** `scoring-cards.service.ts`
- **Líneas:** 3.5, 4.5, 5.5 (full match), 1.5 (1H)
- **Modelo:** Poisson con λ = tarjetas esperadas
- **Pesos:** Team card avg (65%), Form (15%), Locality (10%), H2H (10%)
- **Filtros:** MIN_ODDS=1.40, MIN_STARS=3, MIN_GAMES=8

#### BTTS 1H (Ambos Marcan Primera Mitad)
- **Fórmula:** `P(BTTS 1H) = P(Local ≥1 en 1H) × P(Visitante ≥1 en 1H)`
- **Cálculo por equipo:** `P(≥1) = 1 - e^(-λ)` donde λ = xG 1H del equipo
- **Filtros:** MIN_ODDS=1.40, MIN_EDGE=5%, MIN_STARS=3
- **Mercado nicho:** Casas no lo modelan tan bien como BTTS Full Time

### maxPicksPerDay
- Incrementado de 5 a 8 picks/día para alcanzar muestra estadística más rápido

---

## Fixes v1.2.0 (2026-03-27)

### Timezone Fixes
- **Fixtures UTC**: Partidos nocturnos (ej. 11 PM local) ahora se encuentran correctamente
  - El sistema consulta fecha local + fecha UTC siguiente y filtra por timezone
- **Telegram fecha**: Header muestra fecha local correcta (no UTC)
- **Filtro picks**: Picks se filtran por rango UTC convertido a timezone local

### Corners Handicap
- **Desactivado temporalmente**: El modelo calcula líneas (ej. -2.5) que no existen en Bet365
- **Pendiente**: Implementar validación de líneas disponibles antes de generar pick

---

## Índice

1. [Arquitectura General](#1-arquitectura-general)
2. [Fuentes de Datos](#2-fuentes-de-datos)
3. [Cálculo de Probabilidades](#3-cálculo-de-probabilidades)
4. [Detección de Value](#4-detección-de-value)
5. [Cálculo de Stakes](#5-cálculo-de-stakes)
6. [Gestión de Riesgo](#6-gestión-de-riesgo)
7. [Sistema de Combos](#7-sistema-de-combos)
8. [Anti-Patterns](#8-anti-patterns)
9. [Flujo de Cron Jobs](#9-flujo-de-cron-jobs)
10. [Métricas y Validación](#10-métricas-y-validación)

---

## 1. Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GOLPICKS SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ API-Football │    │ The Odds API │    │  Open-Meteo  │    │  MongoDB  │ │
│  │  (fixtures,  │    │   (US odds,  │    │   (weather)  │    │   (data)  │ │
│  │   stats)     │    │   sharps)    │    │              │    │           │ │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └─────┬─────┘ │
│         │                   │                   │                  │       │
│         ▼                   ▼                   ▼                  │       │
│  ┌─────────────────────────────────────────────────────────────────┴─────┐ │
│  │                         DATA LAYER                                     │ │
│  │  • Team Statistics    • Odds from multiple bookmakers                 │ │
│  │  • H2H History        • Weather conditions                            │ │
│  │  • League Info        • Historical picks & results                    │ │
│  └───────────────────────────────────┬───────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      ANALYSIS LAYER                                    │ │
│  │                                                                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │ │
│  │  │ ScoringGoals    │  │ ScoringCorners  │  │ ValueDetection  │       │ │
│  │  │ Service         │  │ Service         │  │ Service         │       │ │
│  │  │                 │  │                 │  │                 │       │ │
│  │  │ • P(Over 0.5)   │  │ • Expected      │  │ • VIG extract   │       │ │
│  │  │ • P(Over 1.5)   │  │   corners       │  │ • Edge calc     │       │ │
│  │  │ • xG 1H         │  │ • P(Over/Under) │  │ • Significance  │       │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │ │
│  │                                                                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │ │
│  │  │ StakeCalculator │  │ ComboEngine     │  │ AntiPattern     │       │ │
│  │  │ Service         │  │ Service         │  │ Service         │       │ │
│  │  │                 │  │                 │  │                 │       │ │
│  │  │ • Kelly         │  │ • Correlation   │  │ • Risk filters  │       │ │
│  │  │ • Drawdown      │  │ • Combo types   │  │ • Pattern detect│       │ │
│  │  │ • Risk mgmt     │  │ • Joint prob    │  │ • Adjustments   │       │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │ │
│  └───────────────────────────────────┬───────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      OUTPUT LAYER                                      │ │
│  │                                                                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │ │
│  │  │ BettingPick     │  │ BettingCombo    │  │ Telegram        │       │ │
│  │  │ (MongoDB)       │  │ (MongoDB)       │  │ Alerts          │       │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Stack Tecnológico

| Componente | Tecnología | Versión |
|------------|------------|---------|
| Framework | NestJS | 10.x |
| Base de datos | MongoDB (Mongoose) | 8.x |
| API | GraphQL (Apollo) | 16.8 |
| Scheduling | @nestjs/schedule | 4.x |
| Alertas | Telegram Bot API | - |

### 1.2 Archivos Principales

```
src/betting/
├── cron/
│   ├── nightly-analysis.cron.ts    # Análisis cada 30 min (pick scanner)
│   ├── odds-monitor.cron.ts        # Monitor de steam moves
│   └── result-collector.cron.ts    # Liquidación de picks
├── services/
│   ├── scoring-goals.service.ts    # Probabilidades goles + BTTS 1H
│   ├── scoring-corners.service.ts  # Probabilidades corners
│   ├── scoring-cards.service.ts    # Probabilidades tarjetas (v1.3.0)
│   ├── value-detection.service.ts  # Detección de value
│   ├── stake-calculator.service.ts # Cálculo de stakes
│   ├── combo-engine.service.ts     # Generación de combos
│   ├── anti-pattern.service.ts     # Filtros de riesgo
│   └── correlation.service.ts      # Correlación entre picks
├── schemas/
│   ├── betting-pick.schema.ts      # Schema de picks
│   ├── betting-combo.schema.ts     # Schema de combos
│   └── betting-settings.schema.ts  # Configuración
└── telegram/
    └── betting-telegram.service.ts # Alertas Telegram
```

---

## 2. Fuentes de Datos

### 2.1 API-Football

**Límite:** 7,500 calls/día

**Endpoints utilizados:**

| Endpoint | Uso | Datos |
|----------|-----|-------|
| `/fixtures` | Partidos del día | fecha, equipos, liga, kickoff |
| `/fixtures/statistics` | Stats del partido | goles, corners, posesión |
| `/teams/statistics` | Stats de equipo | promedios, forma, H2H |
| `/odds` | Cuotas EU | odds por mercado y bookmaker |

**Estructura de Team Statistics:**

```typescript
interface TeamStats {
  // Goles primera mitad
  avg_goals_1h: number          // Promedio goles marcados 1H
  avg_conceded_1h: number       // Promedio goles recibidos 1H
  home_over05_1h: number        // % partidos con gol 1H (local)
  away_over05_1h: number        // % partidos con gol 1H (visitante)
  over05_1h_pct: number         // % general partidos con gol 1H
  form_goals_1h: number         // Últimos 5: partidos con gol 1H

  // Both Teams Score
  bts_1h_pct: number            // % partidos con BTS en 1H

  // Corners
  corners_for_avg: number       // Promedio corners a favor
  corners_against_avg: number   // Promedio corners en contra

  // Metadatos
  gamesPlayed: number           // Partidos jugados (sample size)
  failed_to_score_pct: number   // % partidos sin marcar
}
```

### 2.2 The Odds API

**Límite:** 500 calls/mes

**Propósito:** Obtener odds de bookmakers americanos (sharps)

```typescript
interface OddsApiResponse {
  bookmakers: {
    key: string           // 'pinnacle', 'draftkings', etc.
    markets: {
      key: string         // 'totals', 'totals_h1'
      outcomes: {
        name: string      // 'Over', 'Under'
        point: number     // 0.5, 1.5, 2.5
        price: number     // American odds (-110, +150)
      }[]
    }[]
  }[]
}
```

**Conversión American → Decimal:**

```typescript
function americanToDecimal(american: number): number {
  if (american > 0) {
    return (american / 100) + 1
  } else {
    return (100 / Math.abs(american)) + 1
  }
}

// Ejemplos:
// -110 → 1.91
// +150 → 2.50
// -200 → 1.50
```

### 2.3 Open-Meteo (Weather)

**Límite:** Gratis, ilimitado

**Propósito:** Clima para partidos outdoor

```typescript
interface WeatherData {
  temperature: number      // °C
  precipitation: number    // mm
  windSpeed: number        // km/h
  weatherCode: number      // WMO code
}

// Flags generados:
// RAIN_HEAVY: precipitation > 5mm
// WIND_STRONG: windSpeed > 30km/h
// COLD: temperature < 5°C
// HOT: temperature > 32°C
```

---

## 3. Cálculo de Probabilidades

### 3.1 Over 0.5 Goles Primera Mitad

**Archivo:** `scoring-goals.service.ts`

**Fórmula Principal (CORRECTA):**

```
P(Over 0.5 1H) = 1 - P(Ningún equipo marca)
              = 1 - (1 - P_A)(1 - P_B)
```

Donde:
- `P_A` = probabilidad de que equipo A marque en 1H
- `P_B` = probabilidad de que equipo B marque en 1H

**Código:**

```typescript
// Team A es local, Team B es visitante
const probA = teamAStats.home_over05_1h  // Ej: 0.75
const probB = teamBStats.away_over05_1h  // Ej: 0.60

// Fórmula correcta usando regla del complemento
let probBase = 1 - (1 - probA) * (1 - probB)
// = 1 - (0.25 * 0.40) = 1 - 0.10 = 0.90
```

**¿Por qué NO usar promedio aritmético?**

```
INCORRECTO: (P_A + P_B) / 2 = (0.75 + 0.60) / 2 = 0.675

CORRECTO:   1 - (1 - P_A)(1 - P_B) = 0.90

Diferencia: 22.5 puntos porcentuales
```

El promedio subestima porque:
- Si A tiene 75% y B tiene 60%, la probabilidad de que AL MENOS UNO marque es mayor
- Solo necesitamos que UNO marque, no ambos

**Ajustes adicionales:**

```typescript
// 1. Ajuste por forma reciente (peso: 15%)
const formScore = (teamAStats.form_goals_1h + teamBStats.form_goals_1h) / 10
const formAdjustment = (formScore - 0.6) * 0.15

// 2. Ajuste por H2H (peso: 10%)
const h2hScore = h2h.last_5_goals_1h / 5
const h2hAdjustment = (h2hScore - 0.7) * 0.1

// 3. Ajuste por tier de liga (peso: 5%)
const LEAGUE_TIER_BONUS = {
  1: 0,      // Top leagues (más eficientes)
  2: 0.02,   // Second tier
  3: 0.03,   // Third tier
  4: 0.04,   // Lower leagues (más ineficientes)
}

// Probabilidad final
let probOver05_1H = probBase + formAdjustment + h2hAdjustment + leagueAdjustment

// Clamp entre 50% y 99%
probOver05_1H = Math.max(0.50, Math.min(0.99, probOver05_1H))
```

### 3.2 Over 1.5 Goles Primera Mitad

**Modelo:** Distribución de Poisson

```
P(X = k) = (λ^k * e^(-λ)) / k!
```

Donde λ = goles esperados en primera mitad (xG 1H)

**Cálculo de λ (Expected Goals 1H):**

```typescript
const expectedGoals1H = (
  teamAStats.avg_goals_1h +      // Goles que marca A
  teamBStats.avg_conceded_1h +   // Goles que recibe B
  teamBStats.avg_goals_1h +      // Goles que marca B
  teamAStats.avg_conceded_1h     // Goles que recibe A
) / 2
```

**Probabilidad Over 1.5:**

```typescript
// P(X >= 2) = 1 - P(X=0) - P(X=1)
const lambda = expectedGoals1H
const p0 = Math.exp(-lambda)                    // P(X=0)
const p1 = lambda * Math.exp(-lambda)           // P(X=1)
let probOver15_1H = 1 - p0 - p1                 // P(X>=2)
```

**Ejemplo numérico:**

```
λ = 1.5 goles esperados

P(X=0) = e^(-1.5) = 0.223
P(X=1) = 1.5 * e^(-1.5) = 0.335
P(X>=2) = 1 - 0.223 - 0.335 = 0.442 (44.2%)
```

### 3.3 Filtro BTS (Both Teams Score) - Escalado Suave

**Problema:** Over 1.5 requiere que ambos equipos tengan capacidad de marcar.

**Solución:** Función logística (sigmoid) para transición suave.

```typescript
const combinedBts1H = (teamAStats.bts_1h_pct + teamBStats.bts_1h_pct) / 2

// Parámetros de la función logística
const BTS_MIDPOINT = 0.25    // 50% factor cuando BTS = 25%
const BTS_STEEPNESS = 15     // Pendiente de la transición

// Función logística: f(x) = 1 / (1 + e^(-k(x - x0)))
const btsFactor = 1 / (1 + Math.exp(-BTS_STEEPNESS * (combinedBts1H - BTS_MIDPOINT)))

// Aplicar factor
probOver15_1H = probOver15_1H * btsFactor
```

**Tabla de factores resultantes:**

| BTS % | Factor | Efecto |
|-------|--------|--------|
| 40% | 0.98 | Casi sin reducción |
| 30% | 0.82 | -18% |
| 25% | 0.50 | -50% |
| 20% | 0.27 | -73% |
| 15% | 0.18 | -82% |
| 10% | 0.08 | -92% |

**Gráfico de la función:**

```
Factor
  1.0 ┤                    ●●●●●●●●
      │                 ●●●
  0.8 ┤              ●●●
      │            ●●
  0.6 ┤          ●●
      │        ●●
  0.4 ┤      ●●
      │    ●●
  0.2 ┤  ●●
      │●●
  0.0 ┼──────────────────────────────
      0%   10%   20%   30%   40%   BTS%
                    ↑
                 Midpoint (25%)
```

### 3.4 Verificación de Consistencia

**Restricción matemática:** P(Over 1.5) ≤ P(Over 0.5)

Si hay 2+ goles, necesariamente hay al menos 1 gol.

```typescript
if (probOver15_1H > probOver05_1H) {
  // Violación detectada - aplicar corrección conservadora
  warnings.push(`Consistency violation: O15 > O05`)
  probOver15_1H = probOver05_1H * 0.85
}
```

### 3.5 Corners - Modelo de Esperanza

**Archivo:** `scoring-corners.service.ts`

**Cálculo de corners esperados:**

```typescript
const expectedCorners = (
  teamAStats.corners_for_avg +
  teamBStats.corners_against_avg +
  teamBStats.corners_for_avg +
  teamAStats.corners_against_avg
) / 2
```

**Probabilidad por línea (distribución normal aproximada):**

```typescript
// Desviación estándar típica para corners: ~3.0
const stdDev = 3.0

// Para línea X (ej: 9.5 corners)
// P(Total > X) usando distribución normal
const zScore = (expectedCorners - line) / stdDev
const probOver = 1 - normalCDF(zScore)
const probUnder = normalCDF(zScore)

// Función CDF normal estándar
function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736
  const a3 = 1.421413741, a4 = -1.453152027
  const a5 = 1.061405429, p = 0.3275911

  const sign = z < 0 ? -1 : 1
  z = Math.abs(z) / Math.sqrt(2)
  const t = 1.0 / (1.0 + p * z)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z)

  return 0.5 * (1.0 + sign * y)
}
```

### 3.6 BTTS 1H (Both Teams To Score First Half)

**Archivo:** `scoring-goals.service.ts`

**Fórmula:**

```
P(BTTS 1H) = P(Local marca ≥1 en 1H) × P(Visitante marca ≥1 en 1H)
```

Donde cada probabilidad se calcula con Poisson:

```
P(equipo marca ≥1) = 1 - P(X = 0) = 1 - e^(-λ)
```

**Cálculo de λ por equipo:**

```typescript
// Expected goals 1H para cada equipo
const expectedGoalsHome1H = (teamAStats.avg_goals_1h + teamBStats.avg_conceded_1h) / 2
const expectedGoalsAway1H = (teamBStats.avg_goals_1h + teamAStats.avg_conceded_1h) / 2

// Probabilidad de marcar ≥1 gol
const probHomeScores1H = 1 - Math.exp(-expectedGoalsHome1H)
const probAwayScores1H = 1 - Math.exp(-expectedGoalsAway1H)

// Probabilidad BTTS 1H
let probBTTS_1H = probHomeScores1H * probAwayScores1H
```

**Ejemplo numérico:**

```
Local: avg_goals_1h = 0.6, Visitante: avg_conceded_1h = 0.5
Visitante: avg_goals_1h = 0.4, Local: avg_conceded_1h = 0.6

λ_local = (0.6 + 0.5) / 2 = 0.55
λ_visitante = (0.4 + 0.6) / 2 = 0.50

P(Local ≥1) = 1 - e^(-0.55) = 42.3%
P(Visitante ≥1) = 1 - e^(-0.50) = 39.3%

P(BTTS 1H) = 0.423 × 0.393 = 16.6%
```

**¿Por qué BTTS 1H es un mercado ineficiente?**

1. **Menos volumen** - Mucho menos apostado que BTTS Full Time
2. **Pricing derivado** - Casas derivan odds de BTTS FT en lugar de modelar 1H específicamente
3. **Menos datos** - Casas tienen menos datos históricos de goles por mitad
4. **Menos escrutinio** - Sharps se enfocan en mercados principales

### 3.7 Tarjetas (Cards)

**Archivo:** `scoring-cards.service.ts`

**Modelo:** Distribución de Poisson

```
P(X = k) = (λ^k × e^(-λ)) / k!
```

Donde λ = tarjetas esperadas totales

**v1.5.0: Sistema de Pesos Dinámico**

El árbitro es el predictor más importante. Cuando tenemos datos del árbitro:

| Variable | Peso (con árbitro) | Peso (sin árbitro) |
|----------|-------------------|-------------------|
| Árbitro | 45% | - |
| Team cards avg | 30% | 65% |
| Forma (últimos 5) | 10% | 15% |
| Localía | 8% | 10% |
| H2H | 7% | 10% |

**Cálculo de tarjetas esperadas:**

```typescript
// Base: suma de promedios de ambos equipos
const baseCardsExpected = teamAStats.avg_cards_total + teamBStats.avg_cards_total

// Ajuste por árbitro (45% cuando disponible)
let refereeAdj = 0
if (refereeData && refereeData.seasonMatches >= 5) {
  const refereeDiff = refereeData.avgCardsPerMatch - leagueAvgCards
  refereeAdj = refereeDiff * 0.45  // 45% weight
}

// Ajuste por localía
const localityAdj = ((homeCardFactor + awayCardFactor) / 2 - 1.0) * baseCardsExpected * localityWeight

// Ajuste por forma reciente
const avgFormCards = teamAStats.form_cards_5 + teamBStats.form_cards_5
const formAdj = (avgFormCards - baseCardsExpected) * formWeight

// Ajuste por H2H
let h2hAdj = 0
if (h2h?.avg_cards > 0) {
  h2hAdj = (h2h.avg_cards - baseCardsExpected) * h2hWeight
}

// Final
cardsExpected = baseCardsExpected + refereeAdj + localityAdj + formAdj + h2hAdj
```

**Clasificación de estilo del árbitro:**

| Estilo | Tarjetas/partido | Descripción |
|--------|------------------|-------------|
| STRICT | >4.5 | Árbitro estricto, muchas tarjetas |
| MODERATE | 3.5-4.5 | Árbitro neutral |
| LENIENT | <3.5 | Árbitro permisivo |

**Promedios por liga (tarjetas amarillas/partido):**

| Liga | Promedio |
|------|----------|
| La Liga | 4.5 |
| La Liga 2 | 4.8 |
| Liga BetPlay | 4.6 |
| Serie A | 4.2 |
| Liga MX | 4.5 |
| Primeira Liga | 4.0 |
| MLS | 3.8 |
| Eredivisie | 3.8 |
| Ligue 1 | 3.6 |
| Bundesliga | 3.5 |
| Championship | 3.4 |
| Premier League | 3.2 |
| J1 League | 3.0 |

**Líneas analizadas:**
- Full match: 3.5, 4.5, 5.5
- Primera mitad: 1.5

**Primera mitad:**
```typescript
// ~38% de tarjetas caen en primera mitad
const cardsExpected1H = cardsExpected * 0.38
```

---

## 4. Detección de Value

### 4.1 Extracción de VIG (Vigorish)

**Archivo:** `value-detection.service.ts`

**¿Qué es VIG?**

El margen del bookmaker. Si las odds fueran justas:
- Over @2.00 + Under @2.00 = 100% probabilidad implícita

Pero en realidad:
- Over @1.90 + Under @1.90 = 105.3% (5.3% es el VIG)

**Fórmula de extracción:**

```typescript
interface VigInfo {
  totalImplied: number     // Suma de probabilidades (>1.0)
  vigPercent: number       // Margen del bookmaker
  trueProbOver: number     // Probabilidad real Over
  trueProbUnder: number    // Probabilidad real Under
  isValidMarket: boolean   // VIG < 10% (válido)
}

function extractVig(oddsOver: number, oddsUnder: number): VigInfo {
  // Probabilidades implícitas naive
  const naiveProbOver = 1 / oddsOver
  const naiveProbUnder = 1 / oddsUnder
  const totalImplied = naiveProbOver + naiveProbUnder

  // VIG es el exceso sobre 100%
  const vigPercent = totalImplied - 1

  // Probabilidades reales (removiendo VIG proporcionalmente)
  return {
    totalImplied,
    vigPercent,
    trueProbOver: naiveProbOver / totalImplied,
    trueProbUnder: naiveProbUnder / totalImplied,
    isValidMarket: vigPercent > 0 && vigPercent < 0.10,
  }
}
```

**Ejemplo:**

```
Odds: Over 0.5 1H @1.85, Under 0.5 1H @2.00

Naive:
  P(Over) = 1/1.85 = 54.1%
  P(Under) = 1/2.00 = 50.0%
  Total = 104.1% (VIG = 4.1%)

Real (VIG extraído):
  P(Over) = 54.1% / 104.1% = 51.9%
  P(Under) = 50.0% / 104.1% = 48.1%
  Total = 100%
```

### 4.2 Cálculo de Edge

**Edge = Nuestra probabilidad - Probabilidad implícita real**

```typescript
function detectValueGoals(
  scoringResult: GoalsScoringResult,
  market: 'over_05_1h' | 'over_15_1h',
  odds: number,
  bookmaker: string
): ValueResult {
  // Nuestra probabilidad calculada
  const probOwn = market === 'over_05_1h'
    ? scoringResult.probOver05_1H
    : scoringResult.probOver15_1H

  // Probabilidad implícita (con VIG extraído si tenemos odds de ambos lados)
  // Si solo tenemos odds de un lado, usamos naive con ajuste
  const probImplied = 1 / odds * 0.97  // ~3% ajuste por VIG estimado

  // Edge
  const edge = probOwn - probImplied

  return {
    hasValue: edge >= EDGE_THRESHOLDS.BAJA,
    edge,
    edgePercent: `${(edge * 100).toFixed(1)}%`,
    probOwn,
    probImplied,
    // ...
  }
}
```

### 4.3 Umbrales de Edge

```typescript
const EDGE_THRESHOLDS = {
  ALTA: 0.10,   // 10%+ edge - muy fuerte
  MEDIA: 0.07,  // 7-10% edge - sólido
  BAJA: 0.05,   // 5-7% edge - mínimo aceptable
}

// Clasificación de confianza
if (edge >= EDGE_THRESHOLDS.ALTA) {
  confidence = 'ALTA'
  hasValue = true
} else if (edge >= EDGE_THRESHOLDS.MEDIA) {
  confidence = 'MEDIA'
  hasValue = true
} else if (edge >= EDGE_THRESHOLDS.BAJA) {
  confidence = 'BAJA'
  hasValue = true
} else {
  confidence = 'SIN_VALUE'
  hasValue = false
}
```

### 4.4 Validación de Significancia Estadística

**Problema:** Con muestras pequeñas (5-15 partidos), el edge calculado puede ser ruido.

**Solución:** Test de significancia estadística.

```typescript
function isEdgeSignificant(
  probOwn: number,
  probImplied: number,
  sampleSize: number,
  confidenceLevel: number = 1.645  // 90% confianza
): { isSignificant: boolean; marginOfError: number } {

  // Muestra muy pequeña = no significativo
  if (sampleSize < 10) {
    return { isSignificant: false, marginOfError: 1.0 }
  }

  // Error estándar de una proporción
  const stdError = Math.sqrt((probOwn * (1 - probOwn)) / sampleSize)

  // Margen de error al nivel de confianza dado
  const marginOfError = confidenceLevel * stdError

  // Edge es significativo si es mayor que el margen de error
  const edge = probOwn - probImplied

  return {
    isSignificant: edge > marginOfError,
    marginOfError,
  }
}
```

**Ejemplo:**

```
probOwn = 0.80 (80%)
probImplied = 0.70 (70%)
edge = 0.10 (10%)
sampleSize = 20 partidos

stdError = √(0.80 × 0.20 / 20) = √0.008 = 0.089
marginOfError = 1.645 × 0.089 = 0.147 (14.7%)

edge (10%) < marginOfError (14.7%)
→ NO es estadísticamente significativo

Con 50 partidos:
stdError = √(0.80 × 0.20 / 50) = 0.057
marginOfError = 1.645 × 0.057 = 0.093 (9.3%)

edge (10%) > marginOfError (9.3%)
→ SÍ es estadísticamente significativo
```

---

## 5. Cálculo de Stakes

### 5.1 Criterio de Kelly

**Archivo:** `stake-calculator.service.ts`

**Fórmula Kelly:**

```
f* = (bp - q) / b
```

Donde:
- `f*` = fracción óptima del bankroll a apostar
- `b` = odds decimales - 1 (ganancia neta por unidad)
- `p` = probabilidad de ganar
- `q` = 1 - p (probabilidad de perder)

**Implementación:**

```typescript
function calculateKelly(
  probability: number,
  odds: number
): number {
  const b = odds - 1        // Net odds
  const p = probability
  const q = 1 - p

  const kellyFull = (b * p - q) / b

  // Kelly negativo = no apostar
  return Math.max(0, kellyFull)
}
```

**Ejemplo:**

```
Odds: 1.80
Probabilidad propia: 65%

b = 1.80 - 1 = 0.80
p = 0.65
q = 0.35

Kelly = (0.80 × 0.65 - 0.35) / 0.80
      = (0.52 - 0.35) / 0.80
      = 0.17 / 0.80
      = 0.2125 (21.25% del bankroll)
```

### 5.2 Kelly Fraccional

**Problema:** Kelly completo es muy agresivo. Una mala racha puede devastar el bankroll.

**Solución:** Usar fracción de Kelly (típicamente 10-25%)

```typescript
const DEFAULT_CONFIG = {
  kellyFraction: 0.10,  // 10% de Kelly - estándar profesional
}

// Stake real
const kellyFraction = kellyFull * 0.10
// 21.25% × 0.10 = 2.125% del bankroll
```

### 5.3 Penalización por Legs (Combos)

**Problema:** Combos multi-leg tienen varianza exponencial.

**Fórmula:**

```typescript
function calculateLegsPenalty(
  numLegs: number,
  hasCorrelation: boolean = false
): number {
  // Exponente basado en correlación
  const exponent = hasCorrelation ? 0.5 : 0.6

  // Penalización = numLegs^(-exponent)
  return Math.max(0.25, Math.pow(numLegs, -exponent))
}
```

**Valores resultantes:**

| Legs | Sin correlación | Con correlación |
|------|-----------------|-----------------|
| 2 | 0.66 | 0.71 |
| 3 | 0.52 | 0.58 |
| 4 | 0.44 | 0.50 |
| 5 | 0.38 | 0.45 |

### 5.4 Multiplicadores de Stake

```typescript
function calculateMultipliers(combo: GeneratedCombo): StakeMultipliers {
  // 1. Por score del combo
  const scoreMultiplier = getScoreMultiplier(combo.score)
  // score >= 80: 1.0
  // score >= 60: 0.9
  // score >= 40: 0.8
  // score < 40: 0.7

  // 2. Por número de legs
  const legsMultiplier = calculateLegsPenalty(combo.legs.length)

  // 3. Por tipo de combo
  const TYPE_MULTIPLIERS = {
    GEMELA: 1.0,
    CROSS_LIGA: 0.9,
    MISMO_MERCADO: 0.95,
    SHARP_GEMELA: 1.1,
  }
  const typeMultiplier = TYPE_MULTIPLIERS[combo.type]

  // Multiplicador final (con cap de seguridad)
  const finalMultiplier = Math.min(
    1.2,  // Cap máximo
    scoreMultiplier * legsMultiplier * typeMultiplier
  )

  return { scoreMultiplier, legsMultiplier, typeMultiplier, finalMultiplier }
}
```

### 5.5 Fórmula Final de Stake

```typescript
let stake = bankroll * kellyFraction * finalMultiplier

// Límites
const maxByType = bankroll * TYPE_STAKE_LIMITS[combo.type]
const maxStake = Math.min(bankroll * 0.02, maxByType)  // 2% max

stake = Math.max(minStake, Math.min(maxStake, stake))
stake = Math.round(stake * 100) / 100  // Redondear a 2 decimales
```

---

## 6. Gestión de Riesgo

### 6.1 Protección de Drawdown

**Archivo:** `stake-calculator.service.ts`

```typescript
interface DrawdownConfig {
  maxDrawdownPct: number       // 15% - máximo drawdown permitido
  maxConsecutiveLosses: number // 7 - máximo pérdidas seguidas
  lossesBeforeReduction: number // 3 - cuándo empezar a reducir
  stakeReductionOnLoss: number  // 0.5 - reducción por pérdida (50%)
}

function checkDrawdownProtection(
  currentBankroll: number,
  peakBankroll: number,
  consecutiveLosses: number,
  config: DrawdownConfig
): {
  shouldPause: boolean
  stakeAdjustment: number
  reason?: string
  severity: 'none' | 'warning' | 'critical'
} {
  // Calcular drawdown actual
  const drawdown = (peakBankroll - currentBankroll) / peakBankroll

  // CRÍTICO: Pausar si drawdown >= 15%
  if (drawdown >= config.maxDrawdownPct) {
    return {
      shouldPause: true,
      stakeAdjustment: 0,
      reason: `Drawdown ${(drawdown * 100).toFixed(1)}% - protección activada`,
      severity: 'critical',
    }
  }

  // CRÍTICO: Pausar si 7+ pérdidas consecutivas
  if (consecutiveLosses >= config.maxConsecutiveLosses) {
    return {
      shouldPause: true,
      stakeAdjustment: 0,
      reason: `${consecutiveLosses} pérdidas consecutivas`,
      severity: 'critical',
    }
  }

  // WARNING: Reducir stake después de 3 pérdidas
  if (consecutiveLosses >= config.lossesBeforeReduction) {
    const factor = Math.pow(0.5, consecutiveLosses - config.lossesBeforeReduction + 1)
    return {
      shouldPause: false,
      stakeAdjustment: Math.max(0.25, factor),
      reason: `Stake reducido a ${(factor * 100).toFixed(0)}%`,
      severity: 'warning',
    }
  }

  return { shouldPause: false, stakeAdjustment: 1.0, severity: 'none' }
}
```

**Escala de reducción:**

| Pérdidas consecutivas | Factor de stake |
|-----------------------|-----------------|
| 0-2 | 100% |
| 3 | 50% |
| 4 | 25% |
| 5 | 25% (mínimo) |
| 6 | 25% |
| 7+ | PAUSAR |

### 6.2 Exposición Diaria Máxima

```typescript
const maxDailyExposure = bankroll * 0.15  // 15% del bankroll por día

// Verificar antes de cada pick
const currentDailyExposure = getTodaysPendingStakes()
if (currentDailyExposure + newStake > maxDailyExposure) {
  // Reducir stake o rechazar pick
}
```

---

## 7. Sistema de Combos

### 7.1 Tipos de Combos

**Archivo:** `combo-engine.service.ts`

| Tipo | Descripción | Legs | Correlación |
|------|-------------|------|-------------|
| GEMELA | 2 picks mismo partido, diferentes mercados | 2 | Alta |
| GEMELA_TRIPLE | 3 picks mismo partido, 3 mercados distintos | 3 | Alta |
| CROSS_LIGA | Mismo mercado, diferentes ligas | 2-4 | Baja |
| CROSS_MERCADO | Diferentes mercados, diferentes partidos | 2-4 | Baja |
| TRIPLE_CORRELACIONADO | Gemela + pick adicional | 3 | Media-Alta |
| SHARP_GEMELA | Gemela confirmada por Pinnacle | 2 | Alta |
| DOBLE_GEMELA | 2 gemelas combinadas | 4 | Alta |

### 7.2 GEMELA Multi-Mercado (v1.3.0)

Con la adición de múltiples mercados (Goals, BTTS, Corners, Cards), el sistema
ahora genera GEMELA combos para cualquier par de mercados correlacionados:

**Pares válidos:**
- Goals + Corners (clásico, correlación ~0.35-0.55)
- Goals + Cards (correlación ~0.25-0.30)
- Goals + BTTS (correlación ~0.55-0.70)
- Corners + Cards (correlación ~0.40-0.45)
- BTTS + Corners (correlación ~0.40-0.45)
- BTTS + Cards (correlación ~0.30)

**Umbrales de correlación mínima:**
```typescript
function getMinCorrelationForMarkets(marketA, marketB): number {
  // Goals + Corners: bien estudiado
  if (isGoals(A) && isCorners(B)) return 0.30

  // Goals + BTTS: ambos son mercados de goles
  if (isGoals(A) && isBTTS(B)) return 0.35

  // Cards: mercado nicho, umbral bajo
  if (isCards(A) || isCards(B)) return 0.20

  // BTTS + Corners
  if (isBTTS(A) && isCorners(B)) return 0.25

  // Default
  return 0.25
}
```

**GEMELA_TRIPLE:**

Cuando un mismo partido tiene picks en 3+ categorías de mercado distintas,
se genera un GEMELA_TRIPLE:

```typescript
// Ejemplo: Almería vs Real Sociedad II
{
  legs: [
    { market: 'OVER_05_1H', prob: 0.75 },    // Goals
    { market: 'OVER_95_CORNERS', prob: 0.62 }, // Corners
    { market: 'OVER_35_CARDS', prob: 0.58 }   // Cards
  ],
  // Correlación promedio de los 3 pares
  avgCorrelation: (corrAB + corrBC + corrAC) / 3,
  // Probabilidad conjunta usando cadena de Bayes
  pJoint: P(A) × P(B|A) × P(C|A,B)
}
```

### 7.3 Cálculo de Probabilidad Conjunta

**Sin correlación (eventos independientes):**

```
P(A ∩ B) = P(A) × P(B)
```

**Con correlación:**

```typescript
// Factor de correlación por tipo
const CORRELATION_FACTORS = {
  GEMELA: 0.85,        // Alta correlación
  CROSS_LIGA: 0.95,    // Casi independientes
  MISMO_MERCADO: 0.90, // Correlación media
}

function calculateJointProbability(
  picks: BettingPick[],
  comboType: ComboType
): number {
  // Probabilidad naive (independencia)
  const naiveProb = picks.reduce((acc, p) => acc * p.probOwn, 1)

  // Aplicar factor de correlación
  const corrFactor = CORRELATION_FACTORS[comboType]

  // Ajuste: correlación alta → probabilidad conjunta mayor
  return naiveProb * corrFactor
}
```

### 7.4 Expected Value del Combo

```typescript
function calculateComboEV(combo: GeneratedCombo): number {
  // EV = P(win) × ganancia - P(lose) × stake
  // EV = P(win) × (odds - 1) - (1 - P(win)) × 1
  // EV = P(win) × odds - 1

  return combo.pJoint * combo.combinedOdds - 1
}

// EV > 0 significa +EV (value)
// EV < 0 significa -EV (no apostar)
```

---

## 8. Anti-Patterns

### 8.1 Patrones de Riesgo Detectados

**Archivo:** `anti-pattern.service.ts`

| Pattern | Descripción | Acción |
|---------|-------------|--------|
| HIGH_EXPOSURE_SINGLE_MATCH | >2 picks mismo partido | Descartar combo |
| CORRELATED_LOSSES | Picks correlacionados negativamente | Reducir score |
| CHASING_LOSSES | Stake alto después de pérdidas | Aplicar drawdown |
| LOW_SAMPLE_SIZE | <5 partidos de muestra | Warning |
| SUSPICIOUS_ODDS_MOVE | Odds cambiaron >15% | Revisar |

### 8.2 Implementación

```typescript
interface AntiPatternWarning {
  pattern: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  adjustment: number  // Multiplicador al score
  reason: string
}

function checkAntiPatterns(
  combo: GeneratedCombo,
  teamContexts: Map<number, TeamContext>,
  dailySummary: DailyPicksSummary
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = []

  // Verificar múltiples picks mismo partido
  const matchCounts = new Map<number, number>()
  for (const leg of combo.legs) {
    const count = (matchCounts.get(leg.fixtureId) || 0) + 1
    matchCounts.set(leg.fixtureId, count)

    if (count > 2) {
      warnings.push({
        pattern: 'HIGH_EXPOSURE_SINGLE_MATCH',
        severity: 'critical',
        adjustment: 0,  // Descartar
        reason: `${count} picks en mismo partido`,
      })
    }
  }

  // Verificar sample size
  for (const leg of combo.legs) {
    const context = teamContexts.get(leg.fixtureId)
    if (context && context.sampleSize < 5) {
      warnings.push({
        pattern: 'LOW_SAMPLE_SIZE',
        severity: 'medium',
        adjustment: 0.8,  // -20% score
        reason: `Solo ${context.sampleSize} partidos de muestra`,
      })
    }
  }

  return warnings
}

function shouldDiscardCombo(warnings: AntiPatternWarning[]): boolean {
  return warnings.some(w => w.severity === 'critical' || w.adjustment === 0)
}

function applyAntiPatternAdjustments(
  combo: GeneratedCombo,
  warnings: AntiPatternWarning[]
): GeneratedCombo {
  let adjustedScore = combo.score

  for (const warning of warnings) {
    if (warning.adjustment > 0 && warning.adjustment < 1) {
      adjustedScore *= warning.adjustment
    }
  }

  return { ...combo, score: Math.round(adjustedScore) }
}
```

---

## 9. Flujo de Cron Jobs

### 9.1 Pick Scanner (7:00 PM diario)

```
┌─────────────────────────────────────────────────────────────┐
│  PICK SCANNER - @Cron('0 19 * * *')                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. OBTENER FIXTURES DE MAÑANA                              │
│     └─► API-Football: /fixtures?date={tomorrow}             │
│         └─► Filtrar por ligas activas (32 configuradas)     │
│                                                              │
│  2. PARA CADA FIXTURE:                                       │
│     ├─► Obtener team stats                                  │
│     ├─► Obtener H2H                                         │
│     ├─► Obtener odds (API-Football + The Odds API)          │
│     ├─► Obtener clima (si outdoor)                          │
│     │                                                        │
│     ├─► SCORING:                                            │
│     │   ├─► calcularProbGoles1H()                           │
│     │   └─► calcularProbCorners()                           │
│     │                                                        │
│     ├─► VALUE DETECTION:                                    │
│     │   ├─► Para Over 0.5 1H                                │
│     │   ├─► Para Over 1.5 1H (si odds O05 < 1.40)          │
│     │   └─► Para Corners Over/Under                         │
│     │                                                        │
│     └─► Si hasValue && edge >= 5%:                          │
│         └─► Crear BettingPick en MongoDB                    │
│                                                              │
│  3. GENERAR COMBOS                                          │
│     ├─► ComboEngine.generateCombos(picks)                   │
│     ├─► AntiPatternService.validate(combos)                 │
│     └─► Guardar BettingCombo en MongoDB                     │
│                                                              │
│  4. CALCULAR STAKES                                         │
│     └─► StakeCalculator.calculate(picks, combos)            │
│                                                              │
│  5. ENVIAR ALERTA TELEGRAM                                  │
│     └─► Resumen con picks, stakes, exposición total         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Odds Monitor (cada 30 min, 2h antes de partidos)

```
┌─────────────────────────────────────────────────────────────┐
│  ODDS MONITOR - @Cron('*/30 * * * *')                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. OBTENER PICKS PENDIENTES PRÓXIMOS                       │
│     └─► kickoff entre ahora y +2 horas                      │
│                                                              │
│  2. PARA CADA PICK:                                         │
│     ├─► Obtener odds actuales                               │
│     ├─► Comparar con oddsAtDetection                        │
│     │                                                        │
│     └─► Si cambio >= 10%:                                   │
│         ├─► STEAM MOVE detectado                            │
│         ├─► Actualizar pick.steamMove                       │
│         └─► Enviar ALERTA INMEDIATA Telegram                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Result Collector (cada 4h, 8 AM - 12 AM)

```
┌─────────────────────────────────────────────────────────────┐
│  RESULT COLLECTOR - @Cron('0 8,12,16,20,0 * * *')           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. OBTENER PICKS PENDIENTES FINALIZADOS                    │
│     └─► status = PENDING, kickoff < now - 2h                │
│                                                              │
│  2. PARA CADA PICK:                                         │
│     ├─► Obtener resultado de API-Football                   │
│     │   └─► scoreHT, scoreFT, corners                       │
│     │                                                        │
│     ├─► LIQUIDAR:                                           │
│     │   ├─► Evaluar si ganó según mercado                   │
│     │   ├─► status = WON | LOST | VOID                      │
│     │   └─► profit = (odds - 1) × stake (si WON)            │
│     │                                                        │
│     ├─► CALCULAR CLV (Closing Line Value):                  │
│     │   └─► clv = oddsAtDetection - oddsAtClose             │
│     │                                                        │
│     └─► ACTUALIZAR BANKROLL:                                │
│         └─► settings.bankroll += profit                     │
│                                                              │
│  3. LIQUIDAR COMBOS                                         │
│     └─► Si todas las legs resueltas                         │
│                                                              │
│  4. ENVIAR ALERTA RESULTADO                                 │
│     └─► Win/Loss con detalles y nuevo bankroll              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Métricas y Validación

### 10.1 Closing Line Value (CLV)

**¿Qué es?** La diferencia entre las odds cuando detectamos el pick y las odds al cierre (antes de kickoff).

**¿Por qué importa?** CLV positivo indica que encontramos value antes que el mercado.

```typescript
// Al liquidar pick
const clv = pick.oddsAtDetection - pick.oddsAtClose

// CLV > 0: Odds bajaron → el mercado confirmó nuestro value
// CLV < 0: Odds subieron → quizás no había value real
// CLV = 0: Sin cambio
```

**Interpretación del CLV promedio:**

| CLV Promedio | Interpretación |
|--------------|----------------|
| > +0.05 | Modelo excelente, continuar |
| +0.02 a +0.05 | Modelo válido, continuar |
| 0 a +0.02 | Modelo marginal, reducir stakes |
| < 0 | Modelo inválido, pausar y recalibrar |

### 10.2 ROI (Return on Investment)

```typescript
const roi = totalProfit / totalStaked × 100

// Ejemplo:
// Staked: $1000
// Won: $850
// Lost: $150 (los otros $850 devueltos)
// Net profit: $85
// ROI = 85/1000 × 100 = 8.5%
```

### 10.3 Win Rate por Mercado

```typescript
interface MarketStats {
  market: MarketType
  totalPicks: number
  won: number
  lost: number
  void: number
  winRate: number       // won / (won + lost)
  avgOdds: number
  avgEdge: number
  profit: number
  roi: number
}
```

### 10.4 Validación del Modelo

Después de N picks, evaluar:

```typescript
async function validateModel(settledPicks: BettingPick[]): Promise<{
  isValid: boolean
  metrics: ModelMetrics
  recommendation: string
}> {
  const metrics = {
    totalPicks: settledPicks.length,
    winRate: calculateWinRate(settledPicks),
    avgCLV: calculateAvgCLV(settledPicks),
    roi: calculateROI(settledPicks),
    profitUnits: calculateProfitUnits(settledPicks),
  }

  // Criterios de validación
  const isValid = (
    metrics.avgCLV > 0 &&
    metrics.totalPicks >= 50 &&
    (metrics.roi > -5 || metrics.avgCLV > 0.02)
  )

  let recommendation: string
  if (metrics.avgCLV > 0.03) {
    recommendation = 'Modelo excelente - continuar normal'
  } else if (metrics.avgCLV > 0) {
    recommendation = 'Modelo válido - monitorear'
  } else if (metrics.roi > 0) {
    recommendation = 'CLV negativo pero ROI positivo - revisar'
  } else {
    recommendation = 'Modelo inválido - pausar y recalibrar'
  }

  return { isValid, metrics, recommendation }
}
```

---

## Apéndice A: Constantes del Sistema

```typescript
// Edge thresholds
const EDGE_THRESHOLDS = {
  ALTA: 0.10,   // 10%
  MEDIA: 0.07,  // 7%
  BAJA: 0.05,   // 5%
}

// Probability thresholds
const PROB_THRESHOLDS = {
  OVER_05_1H: 0.65,  // 65% mínimo
  OVER_15_1H: 0.55,  // 55% mínimo
  CORNERS: 0.55,     // 55% mínimo
}

// Odds filter
const MIN_ODDS_OVER_05 = 1.40  // No apostar Over 0.5 con odds < 1.40

// Kelly
const KELLY_FRACTION = 0.10  // 10% de Kelly

// Bankroll
const MAX_STAKE_PERCENT = 0.02      // 2% max por pick
const MAX_DAILY_EXPOSURE = 0.15     // 15% max por día

// Drawdown
const MAX_DRAWDOWN_PCT = 0.15       // 15% para pausar
const MAX_CONSECUTIVE_LOSSES = 7    // 7 para pausar

// League tiers (v1.5.0: added tier 5)
const LEAGUE_TIER_BONUS = {
  1: 0,      // Premier, La Liga, etc.
  2: 0.02,   // Championship, Serie B, etc.
  3: 0.03,   // League One, etc.
  4: 0.04,   // Leagues menores
  5: 0.06,   // Women's leagues, ultra-minor

// Dynamic edge thresholds by tier
const MIN_EDGE_BY_TIER = {
  1: 0.07,   // 7% min edge
  2: 0.06,   // 6% min edge
  3: 0.05,   // 5% min edge
  4: 0.04,   // 4% min edge
  5: 0.03,   // 3% min edge (less efficient markets)
}
```

---

## Apéndice B: Schemas MongoDB

### BettingPick

```typescript
{
  _id: ObjectId,
  fixtureId: number,
  date: Date,
  kickoff: Date,

  // Teams
  league: { id, name, country, tier },
  teamHome: { id, name },
  teamAway: { id, name },

  // Pick details
  market: 'over_05_1h' | 'over_15_1h' | 'over_X_corners' | ...,
  direction: 'OVER' | 'UNDER',
  line: number,

  // Calculations
  probOwn: number,
  probImplied: number,
  edge: number,
  confidenceScore: number,  // 0-100
  stars: number,            // 1-5

  // Odds
  oddsAtDetection: number,
  oddsAtBet: number,
  oddsAtClose: number,
  bestBookmaker: string,

  // Model inputs (for debugging)
  modelInputs: {
    dataSource: string,
    expectedGoals1H: number,
    teamAStats: {...},
    teamBStats: {...},
    contextFlags: string[],
    weatherDescription: string,
  },

  // Status
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID',
  stake: number,
  profit: number,
  clv: number,

  // Match result
  matchResult: {
    scoreHT: string,
    scoreFT: string,
    cornersHT: number,
    cornersTotal: number,
  },

  // Steam move
  steamMove: {
    detected: boolean,
    direction: 'FAVORABLE' | 'UNFAVORABLE',
    pctChange: number,
    timestamp: Date,
  },

  // Tracking
  reasons: string[],
  telegramAlertSent: boolean,
  betPlaced: boolean,
  betPlacedAt: Date,

  createdAt: Date,
  updatedAt: Date,
}
```

### BettingSettings

```typescript
{
  _id: ObjectId,

  bankroll: number,
  unitValue: number,

  thresholds: {
    minEdge: number,
    minProbability: number,
    minOdds: number,
    maxOdds: number,
  },

  riskManagement: {
    maxDrawdownPct: number,
    maxConsecutiveLosses: number,
    maxDailyExposure: number,
  },

  telegram: {
    enabled: boolean,
    chatId: string,
  },

  timezone: string,
  isActive: boolean,
}
```

---

## Apéndice C: Glosario

| Término | Definición |
|---------|------------|
| **Edge** | Ventaja sobre la casa = P(propia) - P(implícita) |
| **VIG** | Vigorish/margen del bookmaker (típicamente 2-5%) |
| **CLV** | Closing Line Value - diferencia entre odds iniciales y finales |
| **Kelly** | Criterio para calcular stake óptimo basado en edge y odds |
| **xG** | Expected Goals - goles esperados basado en estadísticas |
| **BTS** | Both Teams Score - ambos equipos marcan |
| **Steam Move** | Cambio brusco de odds (típicamente por dinero sharp) |
| **Sharp** | Apostador profesional con edge consistente |
| **Pinnacle** | Bookmaker de referencia para líneas sharp |
| **Drawdown** | Caída desde el pico del bankroll |
| **Combo/Parlay** | Apuesta múltiple combinando varios picks |
| **Leg** | Cada pick individual dentro de un combo |
| **1H** | Primera mitad del partido |
| **FT** | Full Time - partido completo |

---

*Documento generado: 26 de Marzo 2026*
*Sistema: GolPicks v1.5.0*
*Última actualización: 03 de Abril 2026 - Mejoras quirúrgicas al modelo*
