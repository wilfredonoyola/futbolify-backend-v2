# Goal Guru - G1H Specialist

## Quick Start

```bash
# Start server
yarn start:dev

# Test in GraphQL Playground
open http://localhost:3001/graphql
```

## What is G1H?

**Gol en Primera Mitad** (Goal in First Half) - betting market for whether there will be a goal before halftime.

## Why G1H Only?

| Reason | Benefit |
|--------|---------|
| Specialization | Better than being mediocre at many markets |
| Clear patterns | Favorites at home, offensive teams |
| Speed | One AI call instead of 6-9 |
| Less competition | Bookmakers less efficient here |

## API

### Get Matches
```graphql
query {
  findGoalGuruMatches(leagueId: "premier-league") {
    home
    away
    date
    time
  }
}
```

### Analyze G1H
```graphql
mutation {
  analyzeG1H(input: {
    matches: [
      { home: "Liverpool", away: "Everton", date: "16/02", time: "17:30", comp: "Premier League" }
    ]
    leagueName: "Premier League"
  }) {
    picks {
      match
      mercado
      odds
      confianza
      razon
      patron
    }
    mejorPick
  }
}
```

## Response Time

- **Before**: 90+ seconds (6-9 AI calls)
- **After**: 15-20 seconds (1 AI call)

## Files

| File | Purpose |
|------|---------|
| `goal-guru.service.ts` | Main logic (`analyzeG1H`) |
| `goal-guru.resolver.ts` | GraphQL endpoints |
| `anthropic.service.ts` | AI with rate limiting |
| `CLAUDE.md` | Full documentation |

## Environment

```bash
ANTHROPIC_API_KEY=sk-ant-xxx  # Required
OPENAI_API_KEY=sk-xxx         # Fallback
API_FOOTBALL_KEY=xxx          # Fixtures
ODDS_API_KEY=xxx              # Real odds
```

## Supported Leagues

- Premier League
- La Liga
- Serie A
- Bundesliga
- Ligue 1
- Liga MX
- Champions League
- Copa Libertadores

---

See `CLAUDE.md` for full documentation.
