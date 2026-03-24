# SPEC: TELEGRAM ALERTS + DASHBOARD ADMIN
## Módulo de Apuestas — Integrado en Futbolify
### Documento para Claude Code — Marzo 2026

---

# ÍNDICE

1. TELEGRAM BOT — ALERTAS Y COMANDOS
2. DASHBOARD ADMIN — /admin/betting
3. MODELOS DE DATOS (MongoDB)
4. CRON JOBS Y FLUJO TEMPORAL

---

# 1. TELEGRAM BOT — ALERTAS Y COMANDOS

## 1.1 Contexto

Futbolify ya tiene un bot de Telegram con Telegraf.js. Este módulo agrega un CANAL PRIVADO de alertas de apuestas que solo el admin (Wilfredo) recibe. No es un feature para usuarios — es la herramienta personal de ejecución.

## 1.2 Canales y permisos

```
Canal: @futbolify_sharp_alerts (privado, solo admin)
Bot: El mismo bot de Futbolify, con comandos adicionales solo para ADMIN_USER_ID
Autenticación: verificar que el chat_id == ADMIN_TELEGRAM_ID antes de ejecutar cualquier comando betting
```

## 1.3 Alertas automáticas

El bot envía alertas en 3 momentos del día:

### ALERTA 1: Análisis nocturno (viernes 9:00 PM hora El Salvador)

Se envía la noche anterior al día principal de partidos. Formato:

```
🎯 ANÁLISIS SÁBADO 29 MAR 2026
━━━━━━━━━━━━━━━━━━━━━━━

📊 15 partidos analizados | 7 ligas
✅ 4 picks con value | 2 combinadas

━━━ PICKS INDIVIDUALES ━━━

1️⃣ PSV vs NEC — Eredivisie
   Over 0.5 Goles 1H
   Prob: 92% | Cuota: @1.20 | Edge: 7.3%
   Confianza: 78/100
   ⏰ 8:45 AM | Stake sugerido: $2.00
   🏷️ Ventana A

2️⃣ Wolfsburg vs Bremen — Bundesliga
   Over 10.5 Corners
   Prob: 55% | Cuota: @1.85 | Edge: 6.0%
   Confianza: 65/100
   ⏰ 7:30 AM | Stake sugerido: $1.50
   🏷️ Ventana A

3️⃣ Leeds vs Norwich — Championship
   Over 0.5 Goles 1H
   Prob: 84% | Cuota: @1.22 | Edge: 5.8%
   Confianza: 62/100
   ⏰ 9:00 AM | Stake sugerido: $1.20
   🏷️ Ventana A

4️⃣ PSV vs NEC — Eredivisie
   Over 9.5 Corners
   Prob: 60% | Cuota: @1.62 | Edge: 5.3%
   Confianza: 58/100
   ⏰ 8:45 AM | Stake sugerido: $1.00
   🏷️ Ventana A

━━━ COMBINADAS ━━━

🔗 COMBO GEMELA — PSV vs NEC
   Pata 1: Over 0.5 Goles 1H @1.20
   Pata 2: Over 9.5 Corners @1.62
   Cuota combinada: @1.94
   Correlación: 0.56 | EV real: 18.5%
   Score: 82/100 ⭐ ELITE
   Stake sugerido: $1.50
   💡 Edge oculto por correlación: +11.2%

🔗 COMBO CROSS-MERCADO
   Pata 1: PSV Over 0.5 1H @1.20
   Pata 2: Wolfsburg Over 10.5 crn @1.85
   Cuota combinada: @2.22
   EV: 12.3%
   Score: 68/100 — FUERTE
   Stake sugerido: $1.00

━━━━━━━━━━━━━━━━━━━━━━━
💰 Exposición total: $8.20 (8.2% de bankroll)
📋 Bankroll actual: $100.00
🕐 Próxima alerta: Sáb 6:30 AM (verificación pre-partido)
```

### ALERTA 2: Verificación pre-partido (sábado 6:30 AM — 30 min antes de Ventana A)

```
⚡ VERIFICACIÓN PRE-PARTIDO
━━━━━━━━━━━━━━━━━━━━━━━

✅ PSV Over 0.5 1H — Cuota se mantuvo @1.20 → CONFIRMAR
✅ Wolfsburg Over 10.5 crn — Cuota bajó a @1.78 → STEAM MOVE ↓
   ⚠️ Dinero entrando al Over → CONFIRMA nuestra señal
   Confianza: 65 → 85 (+20)
✅ Leeds Over 0.5 1H — Cuota subió a @1.25 → Edge mejoró a 6.8%
❌ PSV Over 9.5 crn — Cuota subió a @1.75 → Edge cayó a 2.1%
   → CANCELAR (debajo de umbral 5%)

━━━ RESULTADO FINAL ━━━

EJECUTAR:
• PSV Over 0.5 1H @1.20 — $2.00
• Wolfsburg Over 10.5 crn @1.78 — $1.50 (↑ steam)
• Leeds Over 0.5 1H @1.25 — $1.20
• COMBO GEMELA: PSV goles + corners CANCELADA (pata de corners sin value)
• COMBO CROSS: PSV goles @1.20 + Wolfsburg crn @1.78 = @2.14 — $1.00

CANCELADOS:
• PSV Over 9.5 crn — edge insuficiente

💰 Exposición final: $5.70
```

### ALERTA 3: Resultados del día (sábado noche / domingo mañana)

```
📊 RESULTADOS SÁBADO 29 MAR
━━━━━━━━━━━━━━━━━━━━━━━

✅ PSV 2-1 NEC (HT: 1-1) — Over 0.5 1H ✅ WIN
   Cuota: @1.20 | Profit: +$0.40
   CLV: +3.2% (cuota cerró @1.15)

✅ Wolfsburg 0-1 Bremen (12 corners) — Over 10.5 ✅ WIN
   Cuota: @1.78 | Profit: +$1.17
   CLV: +5.8% (cuota cerró @1.62) 🔥

❌ Leeds 0-0 Norwich (HT: 0-0) — Over 0.5 1H ❌ LOSE
   Cuota: @1.25 | Loss: -$1.20
   CLV: +1.5% (cuota cerró @1.22 — tuvimos mejor cuota)

✅ COMBO CROSS — PSV goles + Wolfsburg crn ✅ WIN
   Cuota: @2.14 | Profit: +$1.14

━━━ RESUMEN DEL DÍA ━━━

Picks: 2W 1L | Win rate: 67%
Combos: 1W 0L | Win rate: 100%
Profit del día: +$1.51
CLV promedio: +3.5% ✅ POSITIVO
Bankroll: $100 → $101.51

━━━ ACUMULADO TEMPORADA ━━━

Total apuestas: 47
CLV promedio: +2.8%
ROI: +6.2%
Bankroll: $100 → $106.20
Racha actual: 2W
```

## 1.4 Comandos del bot (solo admin)

| Comando | Función |
|---------|---------|
| `/picks` | Ver picks del día (resumen rápido) |
| `/picks_full` | Ver picks con detalle completo (probabilidades, variables) |
| `/combos` | Ver combinadas del día |
| `/bankroll` | Ver bankroll actual y exposición |
| `/result {fixture_id} {W/L}` | Registrar resultado de un pick |
| `/result_combo {combo_id} {W/L}` | Registrar resultado de una combinada |
| `/stats` | Resumen de stats acumuladas (CLV, ROI, win rate) |
| `/stats_goals` | Stats solo del módulo goles 1H |
| `/stats_corners` | Stats solo del módulo corners |
| `/stats_combos` | Stats solo de combinadas |
| `/streak` | Racha actual y máxima |
| `/set_bankroll {amount}` | Actualizar bankroll manualmente |
| `/force_scan` | Forzar escaneo de partidos (fuera del cron normal) |
| `/pause` | Pausar alertas (vacaciones, tilt, etc.) |
| `/resume` | Reanudar alertas |
| `/leagues` | Ver ligas activas y su tier |
| `/history {n}` | Últimas N apuestas con resultado |
| `/best` | Top 5 apuestas más rentables de la temporada |
| `/worst` | Top 5 peores apuestas de la temporada |

## 1.5 Flujo de interacción rápida

Para registrar resultados rápidamente después de los partidos, el bot envía botones inline:

```
PSV 2-1 NEC — Over 0.5 1H @1.20

[✅ WIN]  [❌ LOSE]  [🔄 VOID]
```

El admin toca un botón y el resultado se registra automáticamente. Sin necesidad de escribir comandos.

## 1.6 Implementación (Telegraf.js)

```
src/
  modules/
    betting/
      telegram/
        betting-telegram.module.ts
        betting-telegram.service.ts      // Lógica de envío de alertas
        betting-telegram.commands.ts     // Handlers de comandos /picks, /stats, etc.
        betting-telegram.callbacks.ts    // Handlers de botones inline (WIN/LOSE/VOID)
        betting-telegram.formatters.ts   // Formateadores de mensajes (Markdown)
        betting-telegram.guards.ts       // Guard: solo ADMIN_TELEGRAM_ID
```

---

# 2. DASHBOARD ADMIN — /admin/betting

## 2.1 Estructura de rutas

```
/admin/betting                    → Dashboard principal (resumen del día)
/admin/betting/picks              → Lista de picks (filtrable por fecha, liga, mercado)
/admin/betting/combos             → Lista de combinadas (filtrable)
/admin/betting/history            → Historial completo de apuestas
/admin/betting/analytics          → Analytics avanzados (CLV, ROI, correlación)
/admin/betting/leagues            → Config de ligas activas y tiers
/admin/betting/settings           → Configuración (bankroll, umbrales, API keys)
```

## 2.2 Dashboard principal — /admin/betting

### Fila superior: Metric Cards (4 cards)

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  BANKROLL     │ │  ROI          │ │  CLV PROMEDIO │ │  RACHA        │
│  $106.20      │ │  +6.2%        │ │  +2.8%        │ │  2W           │
│  ↑ +$6.20     │ │  47 apuestas  │ │  ✅ Positivo  │ │  Max: 5W      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Sección: Picks del día

```
HOY — Sábado 29 Marzo 2026                    [Ventana A: 7-9 AM] [Ventana B: 9-1 PM]

┌─────────────────────────────────────────────────────────────────┐
│ ⏰ 7:30 AM  Wolfsburg vs Bremen — Bundesliga                    │
│ Over 10.5 Corners                                               │
│ Prob: 55% → Cuota: @1.85 → Edge: 6.0%                         │
│ Confianza: ████████░░ 65/100                                    │
│ 🔥 STEAM MOVE: cuota bajó de @1.92 a @1.78 en 2h              │
│ Stake: $1.50                                    [Pendiente ⏳]  │
├─────────────────────────────────────────────────────────────────┤
│ ⏰ 8:45 AM  PSV vs NEC — Eredivisie                            │
│ Over 0.5 Goles 1H                                              │
│ Prob: 92% → Cuota: @1.20 → Edge: 7.3%                         │
│ Confianza: ████████░░ 78/100                                    │
│ Stake: $2.00                                    [Pendiente ⏳]  │
├─────────────────────────────────────────────────────────────────┤
│ ⏰ 9:00 AM  Leeds vs Norwich — Championship                    │
│ Over 0.5 Goles 1H                                              │
│ Prob: 84% → Cuota: @1.25 → Edge: 5.8%                         │
│ Confianza: ██████░░░░ 62/100                                    │
│ Stake: $1.20                                    [Pendiente ⏳]  │
└─────────────────────────────────────────────────────────────────┘
```

### Sección: Combinadas del día

```
COMBINADAS ACTIVAS

┌─────────────────────────────────────────────────────────────────┐
│ 🔗 COMBO CROSS-MERCADO          Score: 68/100 — FUERTE         │
│                                                                  │
│   Pata 1: PSV Over 0.5 1H @1.20                    [Ventana A] │
│   Pata 2: Wolfsburg Over 10.5 crn @1.78             [Ventana A] │
│                                                                  │
│   Cuota: @2.14 | EV: 12.3% | Stake: $1.00                      │
│   Correlación: 0.00 (cross-partido)                              │
│                                                                  │
│   [Pendiente ⏳]                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Sección: Resultados recientes (últimos 7 días)

```
ÚLTIMOS 7 DÍAS

Fecha     | Partido              | Mercado        | Cuota | Resultado | Profit  | CLV
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
22 Mar    | Bayern 4-0 Union     | Over 0.5 1H    | @1.12 | ✅ WIN   | +$0.24  | +1.8%
22 Mar    | Dortmund 3-2 Hamburg | Over 10.5 crn  | @1.70 | ✅ WIN   | +$1.05  | +4.2%
22 Mar    | COMBO: Bay+Dor      | Cross-mercado   | @1.90 | ✅ WIN   | +$0.90  | —
15 Mar    | PSV 3-0 Groningen   | Over 0.5 1H    | @1.15 | ✅ WIN   | +$0.30  | +2.1%
15 Mar    | Ajax 1-1 Twente     | Over 9.5 crn   | @1.55 | ❌ LOSE  | -$1.00  | +0.5%
```

### Sección: Mini-gráfico de bankroll (últimos 30 días)

```
$110 ┤
     │            ╱╲
$105 ┤      ╱╲╱╲╱  ╲╱╲
     │    ╱╱              ╲╱╲
$100 ┤───╱                    ╲───── actual: $106.20
     │
 $95 ┤
     └────────────────────────────
     Mar 1                  Mar 29
```

## 2.3 Pantalla de Analytics — /admin/betting/analytics

### KPIs principales

```
━━━ PERFORMANCE GENERAL ━━━

Total apuestas: 47          Win rate: 64%           ROI: +6.2%
Avg CLV: +2.8%              Sharpe: 1.32            Max drawdown: -8.3%
Profit total: +$6.20        Mejor día: +$3.40       Peor día: -$2.10
```

### Breakdown por mercado

```
GOLES PRIMERA MITAD                    CORNERS
━━━━━━━━━━━━━━━━━                      ━━━━━━━━━━━━━━
Apuestas: 28                            Apuestas: 19
Win rate: 71%                           Win rate: 53%
ROI: +5.8%                              ROI: +7.1%
CLV promedio: +2.5%                     CLV promedio: +3.3%
Mejor liga: Eredivisie (+9.2%)          Mejor liga: Bundesliga (+8.5%)
Peor liga: La Liga (-1.2%)             Peor liga: Championship (+0.3%)
```

### Breakdown por tipo de combinada

```
COMBINADAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tipo              | Count | Win% | ROI    | Avg EV  | Hidden edge
GEMELA            |   5   | 40%  | +12.3% | 15.2%  | +8.5%
CROSS_MERCADO     |   8   | 50%  | +8.7%  | 10.1%  | 0%
TRIPLE            |   2   | 50%  | +22.0% | 18.5%  | +6.2%
CROSS_LIGA        |   3   | 33%  | -2.1%  | 6.8%   | 0%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL COMBOS      |  18   | 44%  | +9.2%  | 11.5%  | +4.1%
```

### Breakdown por liga

```
PERFORMANCE POR LIGA (top 5)

Liga                  | Apuestas | Win% | ROI    | CLV    | Nota
Eredivisie            |    12    | 75%  | +9.2%  | +3.8%  | ⭐ Mejor liga
Bundesliga            |    10    | 60%  | +7.5%  | +2.9%  | Consistente
Championship          |     8   | 62%  | +4.1%  | +1.8%  | Aceptable
3. Liga               |     5   | 60%  | +11.0% | +4.5%  | 🔥 Mayor edge
Superligaen           |     4   | 50%  | +3.2%  | +2.1%  | Muestra chica
```

### Gráfico: CLV por apuesta (scatter plot)

```
CLV %
+8% │        ●                    ●
+6% │    ●       ●         ●
+4% │  ●   ● ●     ●   ●     ●
+2% │ ●  ●    ●  ●   ●  ● ●    ●  ●
  0 │───●──────────●────────────────────
-2% │      ●          ●
-4% │            ●
    └─────────────────────────────────
    Apuesta #1                    #47
    
    ━━ Tendencia: +2.8% promedio (línea verde = sistema funciona)
```

### Gráfico: Correlación real vs esperada

```
Para combinadas GEMELA:

Correlación calculada:  0.35  0.42  0.56  0.38  0.51
Resultado real:         WIN   LOSE  WIN   WIN   LOSE
Correlación real observada (backtesting): ~0.44

→ Nuestra estimación de correlación es CONSERVADORA
→ Podemos subir el factor base en +0.05
```

## 2.4 Pantalla de Picks — /admin/betting/picks

### Filtros

```
[Fecha: Hoy ▼] [Liga: Todas ▼] [Mercado: Todos ▼] [Estado: Todos ▼]
[Confianza: Min 0 ▼] [Buscar equipo...]
```

### Tabla principal

```
Fecha     | Partido              | Liga         | Mercado        | Prob  | Cuota | Edge  | Score | Estado    | CLV
29 Mar    | PSV vs NEC           | Eredivisie   | Over 0.5 1H    | 92%   | @1.20 | 7.3%  | 78    | ✅ WIN   | +3.2%
29 Mar    | Wolfsburg vs Bremen  | Bundesliga   | Over 10.5 crn  | 55%   | @1.78 | 6.0%  | 85    | ✅ WIN   | +5.8%
29 Mar    | Leeds vs Norwich     | Championship | Over 0.5 1H    | 84%   | @1.25 | 5.8%  | 62    | ❌ LOSE  | +1.5%
```

### Detalle de pick (expandible al hacer click)

```
▼ PSV vs NEC — Over 0.5 Goles 1H

  Variables del modelo:
  ├── Over 0.5 1H % PSV (home):    100% (peso 35%)
  ├── Over 0.5 1H % NEC (away):     92% (peso 35%)
  ├── Forma PSV (últimos 5):         5/5 con gol 1H (peso 15%)
  ├── Forma NEC (últimos 5):         4/5 con gol 1H (peso 15%)
  ├── H2H (últimos 5):               5/5 con gol 1H (peso 10%)
  └── Liga bonus (Tier 1):          +0.02 (peso 5%)

  Probabilidad calculada: 92.0%
  Cuota apostada: @1.20 (prob implícita: 83.3%)
  Edge: 8.7%
  
  Cuota de cierre: @1.15 (prob implícita: 86.9%)
  CLV: +3.6% ← apostamos a mejor cuota que el cierre

  Contexto del partido:
  ├── Derby: No
  ├── Jornada decisiva: No
  ├── Rotación: No
  ├── Clima: Normal
  └── Flags: [SCORING_STREAK_PSV]

  Resultado: PSV 2-1 NEC (HT: 1-1) → WIN
  Profit: +$0.40 (stake $2.00 × @1.20 - $2.00)
```

## 2.5 Pantalla de Combinadas — /admin/betting/combos

### Tabla de combinadas

```
Fecha | Tipo           | Patas | Cuota  | EV real | Score | Hidden edge | Estado   | Profit
29 Mar| CROSS_MERCADO  | 2     | @2.14  | 12.3%   | 68    | 0%          | ✅ WIN  | +$1.14
22 Mar| GEMELA         | 2     | @1.94  | 18.5%   | 82    | +11.2%      | ✅ WIN  | +$1.41
15 Mar| TRIPLE         | 3     | @3.82  | 16.8%   | 71    | +6.2%       | ❌ LOSE | -$0.75
```

### Detalle de combinada (expandible)

```
▼ COMBO GEMELA — PSV vs NEC — 22 Mar

  Pata 1: Over 0.5 Goles 1H @1.20 → ✅ WIN (HT: 1-1)
  Pata 2: Over 9.5 Corners @1.62 → ✅ WIN (11 corners)
  
  Correlación dinámica: 0.56
  ├── Base (goles↔corners): 0.35
  ├── Posesión similar (+0.10)
  ├── Eredivisie (+0.05)
  └── Combined shots >28 (+0.06)

  P(casa) = 0.847 × 0.606 = 0.513
  P(real) = 0.5336 + (0.56 × 0.271 × 0.494) = 0.609
  
  Hidden edge: 0.609 - 0.513 = +9.6%
  EV real: (0.609 × 1.94) - 1 = +18.2%

  Cuota combinada: @1.94
  Stake: $1.50
  Profit: +$1.41
```

## 2.6 Pantalla de Settings — /admin/betting/settings

```
━━━ GENERAL ━━━
Bankroll actual:               [$106.20  ] [Actualizar]
Modo:                          [● Activo  ○ Pausado]
Alertas Telegram:              [● ON      ○ OFF]

━━━ UMBRALES ━━━
Edge mínimo para pick:         [5  ]%
Edge mínimo para combo:        [5  ]%
Score mínimo para apostar:     [40 ]/100
Muestra mínima (partidos):     [8  ]

━━━ STAKES ━━━
Kelly fraction:                [0.20]
Max stake individual:          [3   ]% del bankroll
Max stake combinada:           [2   ]% del bankroll
Max exposición diaria:         [15  ]% del bankroll
Max picks individuales/día:    [5   ]
Max combinadas/día:            [3   ]

━━━ ANTI-TILT ━━━
Stop-loss diario:              [10  ]% del bankroll
Max pérdidas consecutivas:     [7   ] → pausar 24h

━━━ APIs ━━━
API-Football key:              [●●●●●●●●●●ah3k] [Editar]
API-Football plan:             Pro ($29.99/mes)
The Odds API key:              [●●●●●●●●●●x92f] [Editar]
The Odds API plan:             Starter ($19/mes)

━━━ HORARIOS DE CRON ━━━
Análisis nocturno:             [21:00] hora El Salvador
Verificación pre-partido:      [06:30] hora El Salvador
Recolección resultados:        [15:00] hora El Salvador

━━━ LIGAS ACTIVAS ━━━
[Lista de ligas con toggles ON/OFF y selector de Tier 1-4]
```

---

# 3. MODELOS DE DATOS (MongoDB)

## 3.1 Colección: betting_picks

```javascript
{
  _id: ObjectId,
  fixtureId: Number,           // ID de API-Football
  date: Date,
  league: {
    id: Number,
    name: String,              // "Eredivisie"
    country: String,           // "Netherlands"
    tier: Number               // 1, 2, 3, 4
  },
  teamHome: {
    id: Number,
    name: String
  },
  teamAway: {
    id: Number,
    name: String
  },
  kickoff: Date,               // hora exacta del partido
  timeWindow: String,          // "WINDOW_A", "WINDOW_B", "WINDOW_C"
  
  // Pick
  market: String,              // "over_05_1h", "over_15_1h", "over_95_corners", etc.
  direction: String,           // "OVER" | "UNDER"
  line: Number,                // 0.5, 1.5, 9.5, 10.5, etc.
  
  // Modelo
  probOwn: Number,             // 0.0 - 1.0
  probImplied: Number,         // 1 / odds
  edge: Number,                // probOwn - probImplied
  confidenceScore: Number,     // 0-100
  
  // Variables del modelo (para debugging/análisis)
  modelInputs: {
    probBase: Number,
    formAdjustment: Number,
    h2hAdjustment: Number,
    leagueAdjustment: Number,
    contextMultiplier: Number,
    contextFlags: [String]     // ["DERBY", "STEAM_MOVE", etc.]
  },
  
  // Cuotas
  oddsAtDetection: Number,     // cuota cuando el bot lo detectó
  oddsAtBet: Number,           // cuota cuando se apostó (puede diferir)
  oddsAtClose: Number,         // cuota de cierre (se llena post-partido)
  bestBookmaker: String,       // "bet365", "pinnacle", etc.
  pinnacleOdds: Number,        // referencia sharp
  
  // Steam move
  steamMove: {
    detected: Boolean,
    direction: String,         // "FAVORABLE" | "CONTRA"
    pctChange: Number,
    timestamp: Date
  },
  
  // Ejecución
  status: String,              // "PENDING" | "ACTIVE" | "WON" | "LOST" | "VOID" | "CANCELLED"
  stake: Number,               // monto apostado
  profit: Number,              // ganancia/pérdida
  clv: Number,                 // CLV en probabilidad
  
  // Resultado del partido
  matchResult: {
    scoreHT: String,           // "1-1"
    scoreFT: String,           // "2-1"
    cornersTotal: Number,
    cornersHT: Number,
    cornersHome: Number,
    cornersAway: Number
  },
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  telegramAlertSent: Boolean,
  inCombo: Boolean,            // si forma parte de una combinada
  comboId: ObjectId            // referencia a la combinada
}
```

## 3.2 Colección: betting_combos

```javascript
{
  _id: ObjectId,
  date: Date,
  type: String,                // "GEMELA", "CROSS_MERCADO", "CROSS_LIGA", "TRIPLE", "DOBLE_GEMELA", "GEMELA_INVERTIDA"
  sharpConfirmed: Boolean,     // si tiene steam move en alguna pata
  
  // Patas
  legs: [{
    pickId: ObjectId,          // referencia a betting_picks
    fixtureId: Number,
    market: String,
    direction: String,
    odds: Number,
    probOwn: Number,
    result: String             // "WON" | "LOST" | "VOID" | "PENDING"
  }],
  
  // Correlación
  correlation: {
    base: Number,              // correlación base de la matriz
    dynamic: Number,           // correlación ajustada al contexto
    adjustments: [{
      factor: String,          // "possession_similar", "derby", etc.
      value: Number
    }]
  },
  
  // Probabilidades
  pCasa: Number,               // probabilidad que la casa calcula (independencia)
  pReal: Number,               // probabilidad real (con correlación)
  hiddenEdge: Number,          // pReal - pCasa
  
  // Cuotas
  combinedOdds: Number,        // producto de cuotas individuales
  evReal: Number,              // (pReal × combinedOdds) - 1
  
  // Scoring
  score: Number,               // 0-100
  scoreBreakdown: {
    evPoints: Number,
    correlationPoints: Number,
    confidencePoints: Number,
    steamPoints: Number,
    diversificationPoints: Number,
    penalties: Number
  },
  
  // Ejecución
  status: String,              // "PENDING" | "WON" | "LOST" | "PARTIAL" | "CANCELLED"
  stake: Number,
  profit: Number,
  
  // Metadata
  timeWindow: String,
  createdAt: Date,
  updatedAt: Date,
  telegramAlertSent: Boolean,
  warnings: [String]           // anti-patterns detectados
}
```

## 3.3 Colección: betting_daily_summary

```javascript
{
  _id: ObjectId,
  date: Date,
  
  // Picks del día
  totalPicks: Number,
  picksWon: Number,
  picksLost: Number,
  picksVoid: Number,
  picksCancelled: Number,
  
  // Combos del día
  totalCombos: Number,
  combosWon: Number,
  combosLost: Number,
  
  // Financiero
  totalStaked: Number,
  totalProfit: Number,
  bankrollBefore: Number,
  bankrollAfter: Number,
  
  // Métricas
  avgCLV: Number,
  avgEdge: Number,
  avgConfidence: Number,
  
  // Breakdown
  byMarket: {
    goals_1h: { count: Number, won: Number, profit: Number, avgCLV: Number },
    corners: { count: Number, won: Number, profit: Number, avgCLV: Number }
  },
  byLeague: [{
    leagueId: Number,
    leagueName: String,
    count: Number,
    won: Number,
    profit: Number
  }],
  byComboType: [{
    type: String,
    count: Number,
    won: Number,
    profit: Number,
    avgHiddenEdge: Number
  }],
  
  createdAt: Date
}
```

## 3.4 Colección: betting_settings

```javascript
{
  _id: ObjectId,
  adminId: String,
  
  bankroll: Number,
  isActive: Boolean,
  telegramAlertsOn: Boolean,
  
  thresholds: {
    minEdge: Number,           // 0.05
    minComboEV: Number,        // 0.05
    minScore: Number,          // 40
    minGamesPlayed: Number     // 8
  },
  
  stakes: {
    kellyFraction: Number,     // 0.20
    maxStakeIndividualPct: Number,  // 0.03
    maxStakeComboPct: Number,       // 0.02
    maxDailyExposurePct: Number,    // 0.15
    maxPicksPerDay: Number,         // 5
    maxCombosPerDay: Number         // 3
  },
  
  antiTilt: {
    stopLossDailyPct: Number,  // 0.10
    maxConsecutiveLosses: Number // 7
  },
  
  apiKeys: {
    apiFootball: String,       // encrypted
    theOddsApi: String         // encrypted
  },
  
  cronSchedule: {
    nightlyAnalysis: String,   // "0 21 * * 5" (viernes 9 PM)
    preMatchCheck: String,     // "30 6 * * 6" (sábado 6:30 AM)
    resultCollection: String   // "0 15 * * 6" (sábado 3 PM)
  },
  
  activeLeagues: [{
    id: Number,
    name: String,
    tier: Number,
    isActive: Boolean
  }],
  
  updatedAt: Date
}
```

---

# 4. CRON JOBS Y FLUJO TEMPORAL

## 4.1 Jobs programados

```
src/
  modules/
    betting/
      cron/
        nightly-analysis.cron.ts     // Viernes 9 PM: analizar partidos del sábado
        pre-match-check.cron.ts      // Sábado 6:30 AM: verificar cuotas + steam moves
        result-collector.cron.ts     // Sábado/Domingo 3 PM: recopilar resultados
        odds-monitor.cron.ts         // Cada 30 min pre-partido: monitorear cuotas
        daily-summary.cron.ts        // Cada noche: generar resumen diario
        weekly-report.cron.ts        // Lunes 8 AM: reporte semanal
        league-sync.cron.ts          // Lunes 6 AM: sincronizar estado de ligas con API-Football
        stats-updater.cron.ts        // Lunes 8:30 AM: actualizar stats de ligas activas
```

## 4.2 Línea de tiempo de un sábado típico

```
VIERNES
━━━━━━━
21:00  CRON: nightly-analysis
       → Obtener fixtures sábado (15 ligas)
       → Calcular scoring goles 1H + corners
       → Detectar value + generar combinadas
       → Guardar picks en MongoDB
       → Enviar ALERTA 1 a Telegram

SÁBADO
━━━━━━
06:00  CRON: odds-monitor (primera ejecución)
       → Verificar cuotas actualizadas
       → Detectar steam moves tempranos
       → Actualizar picks en MongoDB

06:30  CRON: pre-match-check
       → Verificación final de cuotas
       → Cancelar picks sin value
       → Confirmar picks con steam
       → Enviar ALERTA 2 a Telegram

07:00  VENTANA A ABIERTA
       → Admin ejecuta apuestas en Bet365
       → Marca picks como "ACTIVE" via /result o botones

07:00- CRON: odds-monitor (cada 30 min)
09:00  → Monitorear cuotas de picks activos
       → Si detecta steam move → notificar

09:00  VENTANA A CIERRA (mayoría de partidos en curso)
       → Primer tiempo en progreso

09:45  Medio tiempo de Ventana A
       → Resultados parciales disponibles

10:30  Final de partidos Ventana A
       → Resultados finales disponibles

10:30- VENTANA B (late games)
13:00  → Repetir proceso para picks de Ventana B

15:00  CRON: result-collector
       → Obtener resultados de API-Football
       → Calcular CLV (comparar cuota apostada vs cierre)
       → Actualizar status de picks (WON/LOST/VOID)
       → Actualizar status de combinadas
       → Calcular profit/loss
       → Actualizar bankroll
       → Enviar ALERTA 3 a Telegram

21:00  CRON: daily-summary
       → Generar resumen diario
       → Guardar en betting_daily_summary
       → Si domingo con partidos, repetir cycle

LUNES
━━━━━
06:00  CRON: league-sync
       → Consultar API-Football: GET /leagues?id={id}&current=true para cada liga
       → Detectar qué temporadas están activas
       → Activar/desactivar ligas automáticamente
       → Actualizar season, seasonStart, seasonEnd, coverage
       → Si una liga de verano arrancó → activarla y notificar por Telegram

08:00  CRON: weekly-report
       → Generar reporte semanal
       → Enviar a Telegram: CLV semanal, ROI, mejor/peor liga
       → Sugerir ajustes si CLV es negativo

08:30  CRON: stats-updater
       → Actualizar campo stats de cada liga activa
       → Recalcular avgGoals1H, avgCornersPerMatch, over05_1H_pct, etc.
       → Solo ligas con isActive: true
```

## 4.3 Estructura del módulo NestJS

```
src/
  modules/
    betting/
      betting.module.ts                    // Módulo principal
      
      // Servicios core
      services/
        scoring-goals.service.ts           // Algoritmo de scoring goles 1H
        scoring-corners.service.ts         // Algoritmo de scoring corners
        value-detection.service.ts         // Detectar value (prob vs cuota)
        combo-engine.service.ts            // Motor de combinadas (nivel dios)
        correlation.service.ts             // Matriz de correlación dinámica
        context.service.ts                 // Factores contextuales de partido
        steam-move.service.ts              // Detectar steam moves
        clv-tracker.service.ts             // Calcular CLV post-partido
        portfolio-optimizer.service.ts     // Optimizador de portafolio de combos
        anti-pattern.service.ts            // Detección de trampas
        stake-calculator.service.ts        // Kelly Criterion + sizing
        bankroll.service.ts                // Gestión de bankroll
      
      // Data
      services/
        api-football.service.ts            // Wrapper API-Football
        odds-api.service.ts                // Wrapper The Odds API
        fixture-collector.service.ts       // Obtener fixtures + stats
        result-collector.service.ts        // Obtener resultados post-partido
      
      // Cron
      cron/
        nightly-analysis.cron.ts
        pre-match-check.cron.ts
        result-collector.cron.ts
        odds-monitor.cron.ts
        daily-summary.cron.ts
        weekly-report.cron.ts
        league-sync.cron.ts              // Sincroniza estado de ligas con API-Football
        stats-updater.cron.ts            // Actualiza stats semanales de ligas activas
      
      // Telegram
      telegram/
        betting-telegram.service.ts
        betting-telegram.commands.ts
        betting-telegram.callbacks.ts
        betting-telegram.formatters.ts
        betting-telegram.guards.ts
      
      // GraphQL
      resolvers/
        betting-picks.resolver.ts          // Queries para el dashboard
        betting-combos.resolver.ts
        betting-analytics.resolver.ts
        betting-settings.resolver.ts
      
      // Schemas
      schemas/
        betting-pick.schema.ts
        betting-combo.schema.ts
        betting-daily-summary.schema.ts
        betting-settings.schema.ts
      
      // DTOs
      dto/
        create-pick.dto.ts
        update-result.dto.ts
        combo-output.dto.ts
        analytics-query.dto.ts
```

## 4.4 Resolvers GraphQL para el Dashboard

```graphql
type Query {
  # Dashboard principal
  bettingDashboard(date: String): BettingDashboard
  
  # Picks
  bettingPicks(filters: PickFilters): [BettingPick]
  bettingPickDetail(id: ID!): BettingPick
  
  # Combinadas
  bettingCombos(filters: ComboFilters): [BettingCombo]
  bettingComboDetail(id: ID!): BettingCombo
  
  # Analytics
  bettingAnalytics(dateFrom: String, dateTo: String): BettingAnalytics
  bettingPerformanceByLeague: [LeaguePerformance]
  bettingPerformanceByMarket: [MarketPerformance]
  bettingPerformanceByComboType: [ComboTypePerformance]
  bettingBankrollHistory(days: Int): [BankrollDataPoint]
  bettingCLVHistory: [CLVDataPoint]
  
  # Settings
  bettingSettings: BettingSettings
}

type Mutation {
  # Registrar resultado
  updatePickResult(id: ID!, result: PickResult!): BettingPick
  updateComboResult(id: ID!, result: ComboResult!): BettingCombo
  
  # Settings
  updateBettingSettings(input: BettingSettingsInput!): BettingSettings
  updateBankroll(amount: Float!): BettingSettings
  toggleBettingActive(active: Boolean!): BettingSettings
  toggleLeague(leagueId: Int!, active: Boolean!): BettingSettings
  
  # Manual actions
  forceScan(date: String!): ScanResult
  cancelPick(id: ID!, reason: String): BettingPick
}
```

---

*Spec generado el 23 de marzo de 2026.*
*Diseñado para integrarse al stack existente de Futbolify: NestJS + GraphQL + MongoDB + Next.js + Telegraf.js*
*Dashboard en /admin/betting protegido por el auth de admin existente.*
