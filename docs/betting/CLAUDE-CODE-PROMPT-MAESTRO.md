# PROMPT MAESTRO PARA CLAUDE CODE
## Módulo de Apuestas Deportivas — Futbolify
### Usar este prompt como CLAUDE.md o como instrucción inicial

---

## CONTEXTO DEL PROYECTO

Sos el developer principal de un módulo de apuestas deportivas inteligentes que se integra a Futbolify, una plataforma de fútbol existente.

**Stack de Futbolify:**
- Backend: NestJS + GraphQL + MongoDB (Mongoose)
- Frontend: Next.js (App Router) + TypeScript
- Bot: Telegram via Telegraf.js
- Infraestructura: MongoDB Atlas

**Lo que vas a construir:**
Un módulo completo de betting que detecta value bets en goles primera mitad y corners, genera combinadas inteligentes con correlación, envía alertas a Telegram, y muestra todo en un dashboard admin.

---

## DOCUMENTOS DE REFERENCIA

Tenés 5 documentos que son tu spec completo. SIEMPRE consultálos antes de escribir código:

| Documento | Qué contiene | Cuándo consultarlo |
|-----------|-------------|-------------------|
| `DOCUMENTO-MAESTRO-APUESTAS-2026.md` | Investigación de ligas, mercados, filosofía, ventanas de tiempo, calendario | Cuando necesitás contexto de negocio o entender POR QUÉ algo se hace de cierta forma |
| `ALGORITMOS-BOT-APUESTAS-2026.md` | Fórmulas de scoring, value detection, filtros, pipeline completo, API calls necesarios | Cuando estás construyendo servicios de scoring, value detection, o filtros |
| `COMBINADAS-NIVEL-DIOS-2026.md` | Matriz de correlación, motor de probabilidad conjunta, 7 tipos de combos, optimizer, anti-patterns, hedge logic | Cuando estás construyendo el combo engine, correlation service, o portfolio optimizer |
| `SPEC-TELEGRAM-DASHBOARD-2026.md` | Formato de alertas Telegram, pantallas del dashboard, schemas MongoDB, estructura NestJS, cron jobs, resolvers GraphQL | Cuando estás construyendo Telegram handlers, dashboard pages, schemas, o resolvers |
| `LIGAS-OBJETIVO-SEED-DATA-2026.md` | 24 ligas con API-Football IDs, Odds API sport keys, stats, horarios, modelConfig, schema de betting_leagues | Cuando necesitás IDs de APIs, seed data, o configuración de ligas |

---

## ORDEN DE CONSTRUCCIÓN

Construir en este orden exacto. Cada fase depende de la anterior.

### FASE 1: Schemas y Seed Data (día 1)

**Objetivo:** Crear las colecciones de MongoDB y poblar ligas.

**Archivos a crear:**
```
src/modules/betting/schemas/
  betting-league.schema.ts         → Schema de ligas (ver LIGAS-OBJETIVO doc, sección schema)
  betting-pick.schema.ts           → Schema de picks (ver SPEC doc, sección 3.1)
  betting-combo.schema.ts          → Schema de combinadas (ver SPEC doc, sección 3.2)
  betting-daily-summary.schema.ts  → Schema de resumen diario (ver SPEC doc, sección 3.3)
  betting-settings.schema.ts       → Schema de settings (ver SPEC doc, sección 3.4)

scripts/
  seed-betting-leagues.ts          → Script que inserta las 24 ligas del LIGAS-OBJETIVO doc
```

**Reglas:**
- Usar Mongoose con decoradores de NestJS (@Schema, @Prop)
- Todos los campos del schema están definidos en el SPEC doc sección 3 — NO inventar campos
- El seed script debe ser idempotente (upsert por apiFootballId)
- Tipos estrictos: usar enums para tier (1-4), status ("PENDING"|"ACTIVE"|"WON"|"LOST"|"VOID"|"CANCELLED"), tipo de combo ("GEMELA"|"CROSS_MERCADO"|"CROSS_LIGA"|"TRIPLE"|"DOBLE_GEMELA"|"GEMELA_INVERTIDA"|"SHARP_GEMELA"|"SHARP_CROSS_MERCADO")

---

### FASE 2: Servicios de Data — API Wrappers (día 2)

**Objetivo:** Crear wrappers para API-Football y The Odds API.

**Archivos a crear:**
```
src/modules/betting/services/
  api-football.service.ts     → Wrapper de API-Football
  odds-api.service.ts         → Wrapper de The Odds API
  open-meteo.service.ts       → Wrapper de Open-Meteo (clima)
```

**Para api-football.service.ts:**
- Endpoints necesarios listados en ALGORITMOS doc sección 11.1
- Métodos: getFixtures(date, leagueId), getTeamStats(leagueId, teamId), getH2H(teamA, teamB, last), getOdds(fixtureId), getFixtureStats(fixtureId)
- Manejar rate limiting (7,500 calls/día en plan Pro)
- Cache de 30 min para stats de equipos (no cambian cada minuto)
- API base URL: https://v3.football.api-sports.io
- Auth: header "x-apisports-key"

**Para odds-api.service.ts:**
- Endpoints necesarios listados en ALGORITMOS doc sección 11.2
- Métodos: getOdds(sportKey, markets, regions), getScores(sportKey)
- Sport keys de cada liga están en LIGAS-OBJETIVO doc (campo oddsApiSportKey)
- Si la liga tiene hasOddsApi: false, este servicio NO se llama — se usan odds de API-Football
- API base URL: https://api.the-odds-api.com/v4
- Auth: query param "apiKey"

**Para open-meteo.service.ts:**
- Un solo método: getWeather(latitude, longitude, date)
- Retorna: windSpeed, precipitation, temperature
- URL: https://api.open-meteo.com/v1/forecast
- No requiere API key
- Cache de 3 horas (el clima no cambia cada minuto)

---

### FASE 3: Servicios Core — Scoring (día 3-4)

**Objetivo:** Implementar los algoritmos de scoring para ambos mercados.

**Archivos a crear:**
```
src/modules/betting/services/
  scoring-goals.service.ts      → Scoring de goles primera mitad
  scoring-corners.service.ts    → Scoring de corners
  context.service.ts            → Factores contextuales del partido
```

**Para scoring-goals.service.ts:**
- Implementar EXACTAMENTE las fórmulas de ALGORITMOS doc sección 2
- Método: scoreGoals1H(fixture, teamAStats, teamBStats, h2h) → { probOver05, probOver15 }
- Tabla de pesos: sección 2.3 del doc
- Umbrales: sección 2.4 del doc
- Usar el modelo Poisson para Over 1.5 (fórmula exacta en sección 2.2)
- El filtro de BTS 1H para Over 1.5 es OBLIGATORIO (si BTS < 25%, prob_over15 = 0)

**Para scoring-corners.service.ts:**
- Implementar EXACTAMENTE las fórmulas de ALGORITMOS doc sección 3
- Método: scoreCorners(fixture, teamAStats, teamBStats, h2h) → { cornersExpected, probOver (por línea) }
- Cálculo de corners esperados: sección 3.2
- Conversión a probabilidad con Poisson: sección 3.3
- Corners primera mitad: cornersExpected × 0.44
- Tabla de pesos: sección 3.6

**Para context.service.ts:**
- Implementar EXACTAMENTE la función get_match_context de COMBINADAS doc sección 9.1
- Método: getMatchContext(fixture, teamAStats, teamBStats, weather) → { goalsMultiplier, cornersMultiplier, correlationAdj, flags }
- Incluir TODOS los factores: derby, jornada decisiva, midweek fatigue, scoring streak, post-break, clima, rotación

---

### FASE 4: Value Detection + Combo Engine (día 5-7)

**Objetivo:** Detectar value y generar combinadas inteligentes.

**Archivos a crear:**
```
src/modules/betting/services/
  value-detection.service.ts      → Comparar prob vs cuota
  correlation.service.ts          → Matriz de correlación dinámica
  combo-engine.service.ts         → Motor de combinadas (nivel dios)
  portfolio-optimizer.service.ts  → Selector óptimo de combinadas
  anti-pattern.service.ts         → Detección de trampas
  stake-calculator.service.ts     → Kelly Criterion + sizing
```

**Para value-detection.service.ts:**
- Implementar detect_value_goals y detect_value_corners de ALGORITMOS doc sección 4
- Implementar find_best_odds de ALGORITMOS doc sección 4.3
- Retornar: { hasValue, edge, confidence, bestOdds, bestBookmaker }

**Para correlation.service.ts:**
- Implementar la MATRIZ DE CORRELACIÓN COMPLETA de COMBINADAS doc sección 1
- Método: calculateDynamicCorrelation(fixture, marketA, marketB, teamAStats, teamBStats) → number
- Incluir TODOS los ajustes: posesión, intensidad, pressing, liga, favoritismo
- La función calculateMatchIntensity está en COMBINADAS doc sección 1.6

**Para combo-engine.service.ts:**
- ESTE ES EL SERVICIO MÁS IMPORTANTE Y COMPLEJO
- Implementar los 7 tipos de combinadas de COMBINADAS doc sección 3
- Implementar joint_probability y joint_probability_triple de COMBINADAS doc sección 2
- Implementar el árbol de decisión completo de COMBINADAS doc sección 8
- Implementar el pseudocódigo de la sección 13 del doc (run_combo_engine)
- Cada combo debe tener: type, legs, combinedOdds, pJoint, pCasa, evReal, hiddenEdge, score

**Para portfolio-optimizer.service.ts:**
- Implementar optimize_combo_portfolio de COMBINADAS doc sección 4
- Usar Sharpe Ratio adaptado (no solo EV bruto)
- Restricciones: no repetir fixture, max 2 combos misma liga, max 5 combos/día

**Para anti-pattern.service.ts:**
- Implementar los 7 ANTI_PATTERNS de COMBINADAS doc sección 10
- Método: checkAntiPatterns(combo, dailyPicks) → warnings[]

**Para stake-calculator.service.ts:**
- Implementar Kelly Criterion modificado de COMBINADAS doc sección 7
- Implementar confidence score de ALGORITMOS doc sección 6
- Tablas de stakes por tipo de apuesta y nivel de confianza

---

### FASE 5: Cron Jobs (día 8-9)

**Objetivo:** Automatizar todo el flujo temporal.

**Archivos a crear:**
```
src/modules/betting/cron/
  league-sync.cron.ts          → Lunes 6 AM: sincronizar ligas con API-Football
  stats-updater.cron.ts        → Lunes 8:30 AM: actualizar stats de ligas activas
  nightly-analysis.cron.ts     → Viernes 9 PM: analizar partidos del sábado
  pre-match-check.cron.ts      → Sábado 6:30 AM: verificar cuotas + steam moves
  odds-monitor.cron.ts         → Cada 30 min pre-partido: monitorear cuotas
  result-collector.cron.ts     → Sábado 3 PM: recopilar resultados y calcular CLV
  daily-summary.cron.ts        → Cada noche: generar resumen diario
  weekly-report.cron.ts        → Lunes 8 AM: reporte semanal
```

**Flujo temporal completo:** Ver SPEC doc sección 4.2
**League sync lógica:** Ver LIGAS-OBJETIVO doc sección "Detección automática de temporada"
**Pipeline del bot para combinadas:** Ver DOCUMENTO MAESTRO sección 11.3

**IMPORTANTE:** Todas las horas son hora El Salvador (UTC-6). Usar la timezone correcta en los cron expressions.

---

### FASE 6: Telegram (día 10)

**Objetivo:** Alertas y comandos para el admin.

**Archivos a crear:**
```
src/modules/betting/telegram/
  betting-telegram.module.ts
  betting-telegram.service.ts
  betting-telegram.commands.ts
  betting-telegram.callbacks.ts
  betting-telegram.formatters.ts
  betting-telegram.guards.ts
```

**Formato EXACTO de las 3 alertas:** Ver SPEC doc sección 1.3
**Lista de 18 comandos:** Ver SPEC doc sección 1.4
**Botones inline para registrar resultados:** Ver SPEC doc sección 1.5
**Guard de admin:** Solo permitir comandos betting si chat_id === process.env.ADMIN_TELEGRAM_ID

---

### FASE 7: GraphQL Resolvers (día 11)

**Objetivo:** API para el dashboard frontend.

**Archivos a crear:**
```
src/modules/betting/resolvers/
  betting-picks.resolver.ts
  betting-combos.resolver.ts
  betting-analytics.resolver.ts
  betting-settings.resolver.ts
  betting-leagues.resolver.ts

src/modules/betting/dto/
  (DTOs necesarios para cada resolver)
```

**Schema GraphQL completo:** Ver SPEC doc sección 4.4
**Queries y Mutations exactas definidas ahí**
**Proteger todos los resolvers con guard de admin**

---

### FASE 8: Dashboard Frontend (día 12-14)

**Objetivo:** Páginas del dashboard en Next.js.

**Archivos a crear:**
```
app/admin/betting/
  page.tsx                    → Dashboard principal
  picks/page.tsx              → Lista de picks
  combos/page.tsx             → Lista de combinadas
  history/page.tsx            → Historial completo
  analytics/page.tsx          → Analytics avanzados
  leagues/page.tsx            → Config de ligas
  settings/page.tsx           → Configuración
  
components/betting/
  MetricCard.tsx              → Cards de KPIs
  PickCard.tsx                → Card de un pick individual
  ComboCard.tsx               → Card de una combinada
  ConfidenceBar.tsx           → Barra visual de confianza (0-100)
  BankrollChart.tsx           → Gráfico de línea del bankroll
  CLVScatter.tsx              → Scatter plot de CLV por apuesta
  LeaguePerformanceTable.tsx  → Tabla de performance por liga
  ComboTypeBreakdown.tsx      → Breakdown por tipo de combo
  PickDetail.tsx              → Detalle expandible de un pick
  ComboDetail.tsx             → Detalle expandible de una combo
```

**Wireframes de cada pantalla:** Ver SPEC doc sección 2.2 a 2.6
**Usar las mismas métricas y layouts descritos en los wireframes**
**Componentes de UI: usar lo que ya exista en Futbolify (design system, componentes de admin)**

---

## REGLAS GENERALES

### Código
- TypeScript estricto en todo. No usar `any`.
- Cada servicio debe tener su interfaz definida.
- Tests unitarios para scoring-goals, scoring-corners, correlation, y combo-engine (son los más críticos).
- Logging con NestJS Logger en cada cron job y decisión importante.
- Variables de entorno: API_FOOTBALL_KEY, ODDS_API_KEY, ADMIN_TELEGRAM_ID, BETTING_ACTIVE (boolean).

### Base de datos
- Indexes en betting_picks: { date: 1, league.id: 1 }, { fixtureId: 1 }, { status: 1 }
- Indexes en betting_combos: { date: 1 }, { type: 1 }, { status: 1 }
- Indexes en betting_leagues: { apiFootballId: 1 }, { isActive: 1, tier: 1 }

### Manejo de errores
- Si API-Football falla, loguear y seguir con las otras ligas. NO parar todo el análisis.
- Si The Odds API falla, usar las odds de API-Football como fallback.
- Si Open-Meteo falla, usar contexto sin clima (goalsMultiplier = 1.0, cornersMultiplier = 1.0).
- Anti-tilt automático: si daily loss > 10% bankroll, pausar apuestas y notificar por Telegram.

### Performance
- Cache de 30 min para stats de equipos (no cambian en 30 min).
- Cache de 3 horas para clima.
- Batch requests a API-Football cuando sea posible.
- El nightly analysis debe completar en < 5 minutos (175 API calls).

---

## EJEMPLO DE USO

Cuando estés listo para empezar, decíme:

"Empezá con la Fase 1: Schemas y Seed Data"

Y yo voy a:
1. Leer los schemas del SPEC doc sección 3
2. Leer el seed data del LIGAS-OBJETIVO doc
3. Crear los archivos .schema.ts con Mongoose/NestJS decorators
4. Crear el script de seed con las 24 ligas

Después de cada fase, hacemos review y pasamos a la siguiente.

---

*Prompt maestro generado el 23 de marzo de 2026.*
*Diseñado para ser usado como CLAUDE.md en el root del proyecto Futbolify o como instrucción inicial en cada sesión de Claude Code.*
