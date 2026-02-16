# Goal-Guru Module - G1H Expert System

## Overview

Sistema de análisis de apuestas especializado en **Gol en Primera Mitad (G1H)** basado en patrones REALES de expertos.

## Expert Knowledge (Research-Based)

### Key Statistics (from FootyStats, Performance Odds, The Stat Bible)

| Stat | Value | Source |
|------|-------|--------|
| Matches with G1H | **75%** | WinDrawWin |
| Teams scoring 1H win | **68%** | Performance Odds |
| High-press teams win rate | **68-75%** | Performance Odds |
| Bayern 1H scoring rate | **78%** | Sportingpedia |
| PSG goals before min 30 | **70%** of 1H goals | Sportingpedia |

### Best Leagues for G1H (NOT the popular ones!)

| Rank | League | Avg G1H Goals | Rating |
|------|--------|---------------|--------|
| 1 | Finland Kolmonen | 1.86 | - |
| 2 | Germany Verbandsliga | 1.78 | - |
| 11 | **Danish Superliga** | 1.55 | HIGH |
| 20 | **Eredivisie** | 1.40 | HIGH |
| - | Bundesliga | ~1.35 | HIGH |
| - | Premier League | ~1.25 | MEDIUM |
| - | La Liga | ~1.15 | LOW |

**Source**: Over25Tips.com, FootyStats

### Expert Patterns (What REAL Gurus Look For)

1. **FAST STARTERS** - Teams scoring >60% of goals in 1H
   - Search: "{team} first half goals percentage 2025/26"

2. **DEFENSIVE WEAKNESS** - Teams conceding early
   - Search: "{team} goals conceded first half"

3. **FHPI Score** (First Half Performance Index)
   ```
   FHPI = (Goals 1H × 3) + (Corners 1H × 0.5) - (Cards 1H × 1)
   FHPI ≥ 4 = Dominates first half
   FHPI < 2 = Reactive/slow starter
   ```

4. **VALUE ODDS** - Expert recommendations:
   - Optimal: 1.40-1.55
   - Acceptable: 1.35-1.60
   - AVOID: <1.30 (no value) or >1.70 (too risky)

### Anti-Patterns (When to SKIP)

- Both teams with <50% G1H rate
- Tactical/defensive leagues (La Liga, Ligue 1)
- Both teams need to "not lose" (conservative play)
- Odds below 1.30 (overpriced, no value)

## Leagues Configuration

```typescript
// constants/leagues.ts
// Sorted by G1H potential

HIGH G1H:
- Eredivisie (1.40 avg)
- Bundesliga (1.35 avg)
- Danish Superliga (1.55 avg)
- Norwegian Eliteserien (1.38 avg)

MEDIUM G1H:
- Premier League (1.25 avg)
- Serie A (1.22 avg)
- Liga MX (1.20 avg)
- Champions League (1.30 avg)

LOW G1H (tactical):
- La Liga (1.15 avg)
- Ligue 1 (1.18 avg)
- Libertadores (1.10 avg)
```

## GraphQL API

### Queries

```graphql
# Get leagues (now includes G1H rating)
goalGuruLeagues {
  id
  name
  flag
  g1hRating    # HIGH, MEDIUM, LOW
  avgG1H       # Average first half goals
}

# Get matches
findGoalGuruMatches(leagueId: "eredivisie") {
  home
  away
  date
  time
}
```

### Mutations

```graphql
# Expert G1H Analysis
analyzeG1H(input: {
  matches: [...]
  leagueName: "Eredivisie"
}) {
  picks {
    match
    mercado
    odds
    confianza
    razon
    patron
    g1hStats {
      homeG1HPercent
      awayConcedeG1HPercent
      avgMinuteFirstGoal
      fhpiScore
    }
  }
  skip {
    match
    razon
  }
  mejorPick
  alertas
}
```

## AI Prompt Strategy

The AI prompt includes:

1. **League Context** - G1H rating and average
2. **Expert Statistics** - Real percentages from research
3. **Pattern Scoring** - Internal scoring system:
   - Fast starter confirmed: +3
   - Rival concedes early: +2
   - Value odds (1.40-1.55): +2
   - High pressing: +1
   - High FHPI: +1
   - Both defensive: -3
   - Slow start league: -2

Only recommend if score ≥ 5

## What Changed (vs Generic AI)

| Before | After |
|--------|-------|
| Generic "favorito en casa" | Specific G1H % per team |
| Made up stats | Search for real data |
| Any league = same | League-specific context |
| No scoring system | Pattern-based scoring |
| 70% confidence claimed | Honest ~55-60% expectation |

## Files

| File | Purpose |
|------|---------|
| `goal-guru.service.ts` | Expert G1H analysis |
| `constants/leagues.ts` | G1H ratings per league |
| `dto/analysis-result.dto.ts` | G1HStatsDto |
| `dto/league.dto.ts` | g1hRating, avgG1H fields |

## Environment

```bash
ANTHROPIC_API_KEY=sk-ant-xxx  # Required (web_search)
OPENAI_API_KEY=sk-xxx         # Fallback
API_FOOTBALL_KEY=xxx          # Fixtures
ODDS_API_KEY=xxx              # Real odds
```

## Research Sources

- [FootyStats](https://footystats.org/stats/1st-2nd-half-goals)
- [Performance Odds](https://www.performanceodds.com/how-to-guides/first-half-stats-power-guide-goals-corners-cards-patterns-that-predict-winners-in-todays-matches/)
- [The Stat Bible](https://www.thestatbible.com/stats/first-half-goals)
- [Over25Tips](https://www.over25tips.com/soccer-stats/leagues-with-most-first-half-goals/)
- [Sportingpedia](https://www.sportingpedia.com/2024/10/17/first-vs-second-half-goal-distribution-across-europes-top-5-leagues-scoring-patterns-of-all-96-teams/)

---

**Goal-Guru: Expert G1H System Based on Real Data**
