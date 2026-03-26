# Futbolify Backend

Backend API para Futbolify - plataforma de datos de fútbol y sistema de betting inteligente.

## Tech Stack

- **NestJS** 10.x - Backend framework
- **GraphQL** - API (Apollo Server)
- **MongoDB** - Base de datos (Mongoose)
- **AWS Cognito** - Autenticación
- **Telegram Bot** - Alertas de betting

## Instalación

```bash
yarn install
```

## Ejecutar

```bash
# desarrollo
yarn start:dev

# producción
yarn build && yarn start:prod
```

## Variables de Entorno

```env
MONGODB_URI=mongodb://...
AWS_COGNITO_USER_POOL_ID=...
AWS_COGNITO_CLIENT_ID=...
OPENAI_API_KEY=...
API_FOOTBALL_KEY=...
THE_ODDS_API_KEY=...
BETTING_TELEGRAM_BOT_TOKEN=...
ADMIN_TELEGRAM_ID=...
```

---

# Sistema de Betting - GolPicks

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FUENTES DE DATOS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│   │ API-Football │    │ The Odds API │    │  Open-Meteo  │                  │
│   │  (7,500/día) │    │  (500/mes)   │    │   (gratis)   │                  │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                  │
│          │                   │                   │                          │
│          ▼                   ▼                   ▼                          │
│   • Fixtures            • Cuotas USA        • Clima                         │
│   • Estadísticas        • Sharps            • Condiciones                   │
│   • Cuotas EU           • Value bets        • Outdoor matches               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CRON JOBS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  📅 PICK SCANNER (7:00 PM diario)                                   │   │
│   │                                                                     │   │
│   │  1. Obtener fixtures de MAÑANA (32 ligas configuradas)             │   │
│   │  2. Para cada partido:                                              │   │
│   │     • Obtener estadísticas de equipos                               │   │
│   │     • Obtener cuotas de casas de apuestas                          │   │
│   │     • Calcular probabilidades propias                               │   │
│   │  3. Detectar VALUE (edge > 5%)                                      │   │
│   │  4. Calcular stakes basado en edge                                  │   │
│   │  5. Guardar picks en MongoDB                                        │   │
│   │  6. Enviar alerta Telegram                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🔥 ODDS MONITOR (cada 30 min, 2h antes de partidos)                │   │
│   │                                                                     │   │
│   │  • Monitorea picks pendientes próximos a empezar                    │   │
│   │  • Detecta STEAM MOVES (cambio cuotas ≥10%)                         │   │
│   │  • Envía alerta INMEDIATA si hay cambio significativo               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  📊 RESULT COLLECTOR (cada 30 min)                                  │   │
│   │                                                                     │   │
│   │  • Revisa partidos finalizados                                      │   │
│   │  • Liquida picks (WON/LOST/VOID)                                    │   │
│   │  • Actualiza bankroll                                               │   │
│   │  • Envía notificación de resultado                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MERCADOS ANALIZADOS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│   │  ⚽ OVER 0.5 1H  │  │  🔲 CORNERS      │  │  📈 SHARPS       │          │
│   │                  │  │                  │  │                  │          │
│   │  • Goles primera │  │  • Handicap      │  │  • Asian lines   │          │
│   │    mitad         │  │  • Over/Under    │  │  • Value bets    │          │
│   │  • Alta liquidez │  │  • Por equipo    │  │  • Sharp money   │          │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CÁLCULO DE STAKES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Edge (ventaja) ──────────────────────────────► Stake (unidades)           │
│                                                                              │
│   ┌─────────────┬────────────┐                                              │
│   │    Edge     │   Stake    │                                              │
│   ├─────────────┼────────────┤                                              │
│   │   ≥ 20%     │   1.5u     │                                              │
│   │   ≥ 15%     │   1.0u     │                                              │
│   │   ≥ 10%     │   0.75u    │                                              │
│   │   ≥ 7%      │   0.5u     │                                              │
│   │   < 7%      │   0.25u    │                                              │
│   └─────────────┴────────────┘                                              │
│                                                                              │
│   📋 1u = $25 (configurable)                                                │
│   📋 Max exposición diaria: 15% del bankroll                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TELEGRAM ALERTS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  📅 7:00 PM - ANÁLISIS DIARIO                                       │   │
│   │  ──────────────────────────────                                     │   │
│   │  🎯 ANÁLISIS VIE, 28 MAR                                            │   │
│   │  ━━━━━━━━━━━━━━━━━━━━━━━                                            │   │
│   │  📊 15 partidos | 32 ligas                                          │   │
│   │  ✅ 5 picks con value                                               │   │
│   │                                                                     │   │
│   │  1️⃣ Real Madrid vs Barcelona                                        │   │
│   │     La Liga                                                         │   │
│   │     ⚽ Over 0.5 1H @1.35 ⭐⭐⭐⭐⭐                                    │   │
│   │     💵 Stake: 0.5u ($13)                                            │   │
│   │     ⏰ 15:00                                                        │   │
│   │                                                                     │   │
│   │  💰 Exposición total: 2u ($50)                                      │   │
│   │  📋 1u = $25                                                        │   │
│   │  🔔 Alertas inmediatas si hay cambios >10%                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🔥 INMEDIATO - STEAM MOVE                                          │   │
│   │  ──────────────────────────                                         │   │
│   │  🔥 STEAM MOVE DETECTADO                                            │   │
│   │                                                                     │   │
│   │  ⚽ Vietnam vs Bangladesh                                           │   │
│   │  📊 Over 0.5 1H                                                     │   │
│   │  📉 Cuota: 1.45 → 1.30 (-10.3%)                                     │   │
│   │                                                                     │   │
│   │  ⚠️ Dinero entrando → SEÑAL CONFIRMADA                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  ✅/❌ RESULTADO                                                     │   │
│   │  ─────────────────                                                  │   │
│   │  ✅ GANASTE +$12.50                                                 │   │
│   │                                                                     │   │
│   │  ⚽ Real Madrid vs Barcelona                                        │   │
│   │  📊 Over 0.5 1H @1.35                                               │   │
│   │  💵 Stake: 0.5u ($13)                                               │   │
│   │                                                                     │   │
│   │  💰 Bankroll: $500 → $512.50                                        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             MONGODB                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│   │ BettingPick    │  │ BettingCombo   │  │ BettingSettings│                │
│   ├────────────────┤  ├────────────────┤  ├────────────────┤                │
│   │ • fixtureId    │  │ • legs[]       │  │ • bankroll     │                │
│   │ • market       │  │ • combinedOdds │  │ • unitValue    │                │
│   │ • odds         │  │ • stake        │  │ • maxExposure  │                │
│   │ • edge         │  │ • status       │  │ • timezone     │                │
│   │ • stake        │  │ • result       │  │ • isActive     │                │
│   │ • status       │  └────────────────┘  │ • telegramOn   │                │
│   │ • steamMove    │                      └────────────────┘                │
│   │ • result       │  ┌────────────────┐                                    │
│   └────────────────┘  │ BettingLeague  │  ┌────────────────┐                │
│                       ├────────────────┤  │ AnalyzedFixture│                │
│                       │ • leagueId     │  ├────────────────┤                │
│                       │ • name         │  │ • fixtureId    │                │
│                       │ • country      │  │ • date         │                │
│                       │ • isActive     │  │ • analyzedAt   │                │
│                       │ • markets[]    │  └────────────────┘                │
│                       └────────────────┘  (evita re-analizar)               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Flujo Simplificado

```
    7:00 PM                    Durante el día                  Post-partido
       │                            │                               │
       ▼                            ▼                               ▼
┌─────────────┐            ┌─────────────────┐            ┌─────────────────┐
│   ANÁLISIS  │            │  ODDS MONITOR   │            │    LIQUIDAR     │
│   MAÑANA    │───────────▶│  (steam moves)  │───────────▶│   RESULTADOS    │
└─────────────┘            └─────────────────┘            └─────────────────┘
       │                            │                               │
       ▼                            ▼                               ▼
   📱 Telegram              📱 Alerta inmediata            📱 Win/Loss alert
   "5 picks"                "Steam move -10%"              "+$12.50"
```

## Endpoints de Testing

| Endpoint | API Calls | Descripción |
|----------|-----------|-------------|
| `/betting/test/scan?dryRun=true` | ❌ No | Ver picks existentes |
| `/betting/test/send-nightly-alert` | ❌ No | Probar alerta Telegram |
| `/betting/test/send-pick-alert` | ❌ No | Probar pick individual |
| `/betting/test/tomorrow-picks` | ❌ No | Ver picks de mañana |
| `/betting/test/settings` | ❌ No | Ver configuración |
| `/betting/test/scan` | ✅ Sí | Scan real (consume API) |

## Configuración de Ligas

Las ligas se configuran desde el admin panel (`/admin/betting/leagues`). Cada liga tiene:
- Mercados habilitados (Over 0.5 1H, Corners, etc.)
- Prioridad
- Estado activo/inactivo

---

## License

MIT
