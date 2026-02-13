# Goal Guru Module

## Overview

Módulo de análisis de apuestas de fútbol con IA que combina:
- **Datos reales**: API-Football para fixtures y estadísticas
- **Análisis AI**: Anthropic (web_search) + OpenAI (fallback)
- **Persistencia**: MongoDB para historial de picks y ROI tracking

## Architecture

```
Goal Guru Flow:
1. Select League → API-Football busca fixtures reales (próximos 7 días)
2. Get Context → Anthropic web_search busca forma, H2H, lesiones, odds
3. Triple Analysis → 3 capas AI (estadística, contexto, maestro)
4. Picks → Frontend marca resultados → MongoDB persiste
5. Stats → Win rate, ROI, profit tracking
```

## Integration Points

### API-Football (Real Data)
- **Service**: `api-football.service.ts`
- **Usage**: Upcoming fixtures por liga (real dates, teams, times)
- **Cache**: 30 minutos
- **Env**: `API_FOOTBALL_KEY`
- **Fallback**: Anthropic web_search si API falla

### Anthropic (AI Analysis)
- **Service**: `anthropic.service.ts`
- **Usage**: Match context + Triple layer analysis
- **Tools**: web_search para datos recientes
- **Env**: `ANTHROPIC_API_KEY`
- **Fallback**: OpenAI si Anthropic falla

### OpenAI (AI Fallback)
- **Usage**: Análisis cuando Anthropic no está disponible
- **Env**: `OPENAI_API_KEY` (ya configurado)

## Files Created

### Core
- `goal-guru.module.ts` - Module registration
- `goal-guru.resolver.ts` - 5 queries + 3 mutations
- `goal-guru.service.ts` - Business logic orchestration
- `anthropic.service.ts` - Anthropic API wrapper with retry
- `api-football.service.ts` - API-Football fixtures integration

### Schemas (MongoDB)
- `schemas/goal-guru-session.schema.ts` - Analysis sessions
- `schemas/goal-guru-pick.schema.ts` - Individual picks with results

### DTOs (GraphQL Types)
- `dto/league.dto.ts`
- `dto/goal-guru-match.dto.ts`
- `dto/match-context.dto.ts`
- `dto/pick.dto.ts`
- `dto/analysis-result.dto.ts`
- `dto/stats.dto.ts`
- `dto/analyze-matches.input.ts`
- `dto/mark-result.input.ts`

### Supporting
- `enums/risk-level.enum.ts` - BAJO, MEDIO, ALTO
- `constants/leagues.ts` - 8 leagues configuration

## GraphQL Operations

### Queries
```graphql
goalGuruLeagues: [GoalGuruLeagueDto!]!
findGoalGuruMatches(leagueId: String!): [GoalGuruMatchDto!]!
getGoalGuruMatchContext(input: MatchContextInput!): MatchContextDto
goalGuruHistory(limit: Int, offset: Int): [GoalGuruPickDto!]!
goalGuruStats: GoalGuruStatsDto!
```

### Mutations
```graphql
analyzeGoalGuruMatches(input: AnalyzeMatchesInput!): AnalysisResultDto
markGoalGuruPickResult(input: MarkResultInput!): GoalGuruPickDto!
clearGoalGuruHistory: Boolean!
```

## Setup

### 1. Environment Variables

Add to `.env`:
```bash
# API-Football (required for real fixtures)
API_FOOTBALL_KEY=your_api_football_key

# Anthropic (required for AI analysis)
ANTHROPIC_API_KEY=sk-ant-your_key

# OpenAI (optional, used as fallback)
OPENAI_API_KEY=sk-your_key
```

### 2. Start Backend

```bash
yarn start:dev
```

This will:
- Generate `schema.gql` with Goal Guru types
- Start GraphQL playground at `http://localhost:3001/graphql`

### 3. Frontend Codegen

After backend is running:

```bash
cd ../futbolify-web-v2
yarn codegen
```

This generates typed hooks in `generated/graphql.tsx`:
- `useGoalGuruLeaguesQuery()`
- `useFindGoalGuruMatchesLazyQuery()`
- `useGetGoalGuruMatchContextLazyQuery()`
- `useAnalyzeGoalGuruMatchesMutation()`
- `useMarkGoalGuruPickResultMutation()`
- `useGoalGuruHistoryQuery()`
- `useGoalGuruStatsQuery()`
- `useClearGoalGuruHistoryMutation()`

## Data Flow

```
Frontend (Next.js)
  → GraphQL Query (via Apollo)
    → NestJS Resolver (auth check)
      → Service Layer
        ├─ API-Football → Real fixtures (dates, teams, times)
        ├─ Anthropic web_search → Context (form, H2H, odds, injuries)
        └─ Anthropic analysis → Triple layer picks
      → MongoDB (persist picks/history)
    → Return to Frontend
  → Display picks with confidence/risk/stake
```

## API-Football Integration Details

**Leagues Mapped**:
- Premier League (ID: 39)
- La Liga (ID: 140)
- Serie A (ID: 135)
- Bundesliga (ID: 78)
- Ligue 1 (ID: 61)
- Liga MX (ID: 262)
- Champions League (ID: 2)
- Copa Libertadores (ID: 13)

**Fixtures Endpoint**:
```
GET /fixtures?league={id}&season={year}&from={date}&to={date}
```

**Response Format**:
```json
{
  "response": [{
    "fixture": { "id": 12345, "date": "2025-02-15T15:00:00+00:00" },
    "teams": {
      "home": { "id": 541, "name": "Real Madrid" },
      "away": { "id": 529, "name": "Barcelona" }
    },
    "league": { "name": "La Liga" }
  }]
}
```

## Next Steps (Future Enhancements)

1. **H2H Integration**: Use API-Football `/fixtures/headtohead` for real head-to-head
2. **Team Stats**: Use `/teams/statistics` for season stats
3. **Odds API**: Integrate real odds provider (Odds API, Betfair)
4. **Backtesting**: Test strategy on historical data
5. **ML Model**: Train predictive model with real features
6. **Notifications**: Alert users when high-value picks appear

## Current Credibility Level

**~40-50%** with API-Football integration:
- ✅ Real fixtures (dates, teams, times)
- ✅ AI fallback if API fails
- ⚠️ Context still via web_search (form, odds) - puede ser impreciso
- ⚠️ No historical validation (sin backtest)
- ⚠️ AI analysis (not ML model) - heuristic, not predictive

**To reach 70%**: Need odds API, H2H real data, backtesting engine, ML model training.
