# Changelog - Sistema de Betting GolPicks

Todas las versiones notables del sistema de betting.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.1] - 2026-03-26

### Fix: Validación de Tamaño de Muestra Mínimo

**Problema detectado:**
- Partidos como Gibraltar vs Latvia y Malta vs Luxembourg tenían 0 juegos de datos históricos
- El sistema usaba probabilidades por defecto (50%) que inflaban artificialmente via la fórmula `1 - (1-pA)(1-pB)` = 75%
- Esto generaba picks con "edge" falso que perdieron ambos (0-0 HT)

**Solución implementada:**
- Agregado `MIN_GAMES_FOR_VALUE = 3` en `value-detection.service.ts`
- Si `sampleSize < 3`, el pick es rechazado automáticamente con `insufficientData: true`
- Actualizado `nightly-analysis.cron.ts` para pasar `goalsResult.sampleSize` a todas las llamadas de `detectValueGoals()`

**Archivos modificados:**
- `src/betting/services/value-detection.service.ts`
- `src/betting/cron/nightly-analysis.cron.ts`

**Impacto:**
- Elimina picks basados en datos inventados
- Solo genera picks con datos históricos reales (mínimo 3 partidos)
- Reduce falsos positivos significativamente

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
- [ ] Tracking de ROI por mercado
- [ ] Alertas de CLV después de cada partido
- [ ] Integración con más bookmakers
- [ ] Machine Learning para ajustar probabilidades

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
