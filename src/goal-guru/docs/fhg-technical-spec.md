# FHG-ENGINE — Especificación Técnica de Implementación
## Para: Claude Code
## Stack: NestJS + GraphQL Resolvers + Services + MongoDB | NextJS + Tailwind + Apollo Client Codegen

---

## CONTEXTO PARA CLAUDE CODE

Este sistema detecta partidos de fútbol con alta probabilidad de gol en primera mitad (Over 0.5 First Half Goals) Y cuotas con valor positivo contra el mercado. Lee el documento "FHG-ENGINE v1.0 Blueprint" para contexto completo de negocio. Este documento traduce esa lógica a implementación concreta.

---

## 1. ESTRUCTURA DEL PROYECTO

```
packages/
├── backend/                          # NestJS + GraphQL
│   ├── src/
│   │   ├── modules/
│   │   │   ├── league/
│   │   │   │   ├── league.module.ts
│   │   │   │   ├── league.resolver.ts
│   │   │   │   ├── league.service.ts
│   │   │   │   └── league.schema.ts
│   │   │   ├── team/
│   │   │   │   ├── team.module.ts
│   │   │   │   ├── team.resolver.ts
│   │   │   │   ├── team.service.ts
│   │   │   │   └── team.schema.ts
│   │   │   ├── match/
│   │   │   │   ├── match.module.ts
│   │   │   │   ├── match.resolver.ts
│   │   │   │   ├── match.service.ts
│   │   │   │   └── match.schema.ts
│   │   │   ├── odds/
│   │   │   │   ├── odds.module.ts
│   │   │   │   ├── odds.resolver.ts
│   │   │   │   ├── odds.service.ts
│   │   │   │   └── odds.schema.ts
│   │   │   ├── prediction/
│   │   │   │   ├── prediction.module.ts
│   │   │   │   ├── prediction.resolver.ts
│   │   │   │   ├── prediction.service.ts  # PROBABILITY ENGINE
│   │   │   │   └── prediction.schema.ts
│   │   │   ├── value/
│   │   │   │   ├── value.module.ts
│   │   │   │   ├── value.resolver.ts
│   │   │   │   ├── value.service.ts       # VALUE DETECTOR
│   │   │   │   └── value.schema.ts
│   │   │   ├── selection/
│   │   │   │   ├── selection.module.ts
│   │   │   │   ├── selection.resolver.ts
│   │   │   │   ├── selection.service.ts   # EXECUTION & TRACKING
│   │   │   │   └── selection.schema.ts
│   │   │   ├── health/
│   │   │   │   ├── health.module.ts
│   │   │   │   ├── health.resolver.ts
│   │   │   │   └── health.service.ts      # HEALTH MONITOR
│   │   │   └── scraper/
│   │   │       ├── scraper.module.ts
│   │   │       ├── scraper.service.ts     # DATA COLLECTOR
│   │   │       ├── sources/
│   │   │       │   ├── footystats.scraper.ts
│   │   │       │   ├── statsdontlie.scraper.ts
│   │   │       │   ├── oddsportal.scraper.ts
│   │   │       │   └── sofascore.scraper.ts
│   │   │       └── scraper.scheduler.ts   # Cron jobs
│   │   ├── common/
│   │   │   ├── enums/
│   │   │   │   ├── league-tier.enum.ts
│   │   │   │   ├── signal-type.enum.ts
│   │   │   │   └── alert-level.enum.ts
│   │   │   ├── constants/
│   │   │   │   ├── league-config.ts       # Config estática de ligas
│   │   │   │   └── model-factors.ts       # Multiplicadores del modelo
│   │   │   └── interfaces/
│   │   │       └── prediction-result.interface.ts
│   │   └── app.module.ts
│   └── ...
│
├── frontend/                         # NextJS + Tailwind + Apollo
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/            # Dashboard principal
│   │   │   ├── selections/           # Selecciones del día
│   │   │   ├── history/              # Historial y tracking
│   │   │   ├── health/               # Health monitor
│   │   │   └── leagues/              # Config de ligas
│   │   ├── graphql/
│   │   │   ├── generated/            # Apollo codegen output
│   │   │   ├── queries/
│   │   │   └── mutations/
│   │   └── components/
│   │       ├── SelectionCard.tsx
│   │       ├── ValueBadge.tsx
│   │       ├── HealthDashboard.tsx
│   │       └── OddsComparison.tsx
│   └── ...
│
└── codegen.ts                        # Apollo codegen config
```

---

## 2. MONGODB SCHEMAS

### 2.1 League

```typescript
// league.schema.ts
@Schema({ timestamps: true })
export class League {
  @Prop({ required: true, unique: true })
  code: string; // 'DEN_SUPERLIGAEN', 'HUN_NB1', etc.

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  country: string;

  @Prop({ required: true, enum: ['MAX', 'HIGH', 'MEDIUM', 'LOW'] })
  tier: string;
  // MAX = Superligaen, NB I, Czech, Ykkönen, 1.Div NOR, etc.
  // HIGH = Bundesliga, Süper Lig, Série A BRA, Eredivisie, UCL
  // MEDIUM = Super League SUI, 1.Lig TUR, Superettan
  // LOW = PL, La Liga, Serie A ITA, Ligue 1 (mercados eficientes, no invertir)

  @Prop({ required: true })
  seasonStart: number; // mes (1-12)

  @Prop({ required: true })
  seasonEnd: number;

  @Prop({ required: true })
  totalTeams: number;

  @Prop({ type: Object })
  profile: {
    over05_1h_range: [number, number]; // ej: [80, 86]
    avg_goals_1h: number;
    avg_overround: number; // 0.06 = 6%
    bookmaker_scrutiny: string; // 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH'
    value_potential: string; // 'MAXIMUM' | 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW'
  };

  @Prop({ default: true })
  active: boolean;
}
```

### 2.2 Team

```typescript
// team.schema.ts
@Schema({ timestamps: true })
export class Team {
  @Prop({ required: true })
  name: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true })
  league: League;

  @Prop({ required: true })
  season: string; // '2025-26'

  @Prop({ type: Object, required: true })
  stats: {
    home: {
      matchesPlayed: number;
      over05_1h_pct: number;      // 0-100
      over15_1h_pct: number;
      avg_goals_1h_scored: number;
      avg_goals_1h_conceded: number;
      avg_first_goal_minute: number;
      btts_1h_pct: number;
      xg_1h_avg: number | null;   // null si no disponible
    };
    away: {
      matchesPlayed: number;
      over05_1h_pct: number;
      over15_1h_pct: number;
      avg_goals_1h_scored: number;
      avg_goals_1h_conceded: number;
      avg_first_goal_minute: number;
      btts_1h_pct: number;
      xg_1h_avg: number | null;
    };
  };

  @Prop({ type: [Object] })
  recentForm: {
    date: Date;
    opponent: string;
    isHome: boolean;
    goals_1h: number;           // goles totales en 1H de ese partido
    team_goals_1h: number;      // goles del equipo en 1H
    first_goal_minute: number | null;
  }[]; // últimos 10 partidos, ordenados por fecha desc

  @Prop()
  lastUpdated: Date;
}
```

### 2.3 Match

```typescript
// match.schema.ts
@Schema({ timestamps: true })
export class Match {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true })
  league: League;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true })
  homeTeam: Team;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true })
  awayTeam: Team;

  @Prop({ required: true })
  kickoff: Date;

  @Prop({ enum: ['SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED'], default: 'SCHEDULED' })
  status: string;

  @Prop({ type: Object })
  result: {
    goals_1h_home: number;
    goals_1h_away: number;
    goals_1h_total: number;
    first_goal_minute: number | null;
    goals_ft_home: number;
    goals_ft_away: number;
  } | null;

  @Prop({ type: Object })
  context: {
    homeTablePosition: number | null;
    awayTablePosition: number | null;
    isDerby: boolean;
    motivationHome: string; // 'TITLE' | 'EUROPE' | 'RELEGATION' | 'NOTHING' | 'UNKNOWN'
    motivationAway: string;
    lineupConfirmed: boolean;
    keyAttackerHomeStarts: boolean | null;
    keyAttackerAwayStarts: boolean | null;
  };
}
```

### 2.4 Odds

```typescript
// odds.schema.ts
@Schema({ timestamps: true })
export class Odds {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true })
  match: Match;

  @Prop({ required: true })
  market: string; // 'OVER_05_1H' | 'UNDER_05_1H' | 'OVER_15_1H' | 'AH_075_1H'

  @Prop({ type: [Object] })
  bookmakers: {
    name: string;        // 'pinnacle', 'bet365', 'williamhill', etc.
    odds: number;
    timestamp: Date;
    isOpening: boolean;
  }[];

  @Prop()
  bestOdds: number;

  @Prop()
  bestBookmaker: string;

  @Prop()
  worstOdds: number;

  @Prop()
  spread: number;          // bestOdds - worstOdds

  @Prop()
  overround: number;       // calculado: (1/over + 1/under) - 1

  @Prop()
  pinnacleOdds: number;    // benchmark sharp

  @Prop()
  closingOdds: number | null; // se llena justo antes del kickoff
}
```

### 2.5 Prediction

```typescript
// prediction.schema.ts
@Schema({ timestamps: true })
export class Prediction {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true })
  match: Match;

  @Prop({ required: true })
  p_real: number; // 0.00 - 1.00

  @Prop({ required: true })
  p_base: number;

  @Prop({ type: Object, required: true })
  factors: {
    league: number;
    momentum: number;
    aggressiveness: number;
    vulnerability: number;
    context: number;
    form: number;
  };

  @Prop({ required: true })
  edgeScore: number;

  @Prop({ type: Object, required: true })
  edgeBreakdown: {
    leaguePriority: number;
    momentumDivergent: number;
    earlyScorer: number;
    recentForm: number;
    defensiveVulnerability: number;
    motivationalContext: number;
    oddsSpread: number;
    droppingOdds: number;
  };

  @Prop()
  calculatedAt: Date;
}
```

### 2.6 Selection (el registro más importante)

```typescript
// selection.schema.ts
@Schema({ timestamps: true })
export class Selection {
  @Prop({ required: true, unique: true })
  selectionId: string; // 'FHG-2026-02-14-001'

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true })
  match: Match;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Prediction', required: true })
  prediction: Prediction;

  @Prop({ required: true })
  market: string; // 'OVER_05_1H' | 'OVER_15_1H' | 'OVER_05_1H_INPLAY' | 'AH_075_1H'

  @Prop({ required: true, enum: ['PRE_MATCH', 'IN_PLAY'] })
  type: string;

  @Prop({ required: true, enum: ['A', 'B', 'C'] })
  signal: string;

  // Valor
  @Prop({ required: true })
  p_real: number;

  @Prop({ required: true })
  fairOdds: number;        // 1 / p_real

  @Prop({ required: true })
  bestOdds: number;

  @Prop({ required: true })
  bookmaker: string;

  @Prop({ required: true })
  marginValor: number;     // (bestOdds * p_real) - 1

  @Prop({ required: true })
  edgeScore: number;

  // Ejecución
  @Prop({ required: true })
  stakePct: number;

  @Prop({ required: true })
  stakeAmount: number;

  @Prop({ required: true })
  bankrollAtBet: number;

  // Resultado (se llena post-partido)
  @Prop({ enum: ['PENDING', 'WIN', 'LOSS', 'VOID', 'HALF_WIN', 'HALF_LOSS'], default: 'PENDING' })
  outcome: string;

  @Prop()
  profitLoss: number | null;

  @Prop()
  closingOdds: number | null;

  @Prop()
  clv: number | null;      // bestOdds - closingOdds (positivo = bueno)

  @Prop()
  firstGoalMinute: number | null;

  @Prop()
  goals1hTotal: number | null;

  @Prop()
  settledAt: Date | null;
}
```

---

## 3. SERVICIOS CORE — LÓGICA DE NEGOCIO

### 3.1 PredictionService (Probability Engine)

```typescript
// prediction.service.ts — LÓGICA CENTRAL

@Injectable()
export class PredictionService {

  /**
   * Calcula P_real para un partido dado.
   * Retorna probabilidad estimada de Over 0.5 FHG (0.00 - 1.00)
   */
  async calculatePrediction(match: Match): Promise<PredictionResult> {

    const home = await this.teamService.findById(match.homeTeam);
    const away = await this.teamService.findById(match.awayTeam);
    const league = await this.leagueService.findById(match.league);

    // VALIDACIÓN: mínimo 8 partidos por equipo
    if (home.stats.home.matchesPlayed < 8 || away.stats.away.matchesPlayed < 8) {
      return { eligible: false, reason: 'INSUFFICIENT_DATA' };
    }

    // P_BASE: promedio de Over 0.5 1H de ambos equipos (local/visitante)
    const p_base = (home.stats.home.over05_1h_pct + away.stats.away.over05_1h_pct) / 2 / 100;

    // FACTOR 1: Liga
    const f_league = this.getLeagueFactor(league.tier);

    // FACTOR 2: Momentum
    const f_momentum = this.getMomentumFactor(home, away);

    // FACTOR 3: Agresividad de inicio
    const f_aggression = this.getAggressionFactor(home, away);

    // FACTOR 4: Vulnerabilidad defensiva
    const f_vulnerability = this.getVulnerabilityFactor(home, away);

    // FACTOR 5: Contexto motivacional
    const f_context = this.getContextFactor(match.context);

    // FACTOR 6: Forma reciente bruta
    const f_form = this.getFormFactor(home, away);

    // CÁLCULO FINAL
    let p_real = p_base * f_league * f_momentum * f_aggression
                 * f_vulnerability * f_context * f_form;

    // LIMITAR entre 0.50 y 0.97
    p_real = Math.max(0.50, Math.min(0.97, p_real));

    // EDGE SCORE
    const edgeBreakdown = this.calculateEdgeScore(home, away, league, match);
    const edgeScore = Object.values(edgeBreakdown).reduce((a, b) => a + b, 0);

    return {
      eligible: true,
      p_real,
      p_base,
      factors: {
        league: f_league,
        momentum: f_momentum,
        aggressiveness: f_aggression,
        vulnerability: f_vulnerability,
        context: f_context,
        form: f_form,
      },
      edgeScore,
      edgeBreakdown,
    };
  }

  // --- FACTORES ---

  private getLeagueFactor(tier: string): number {
    const map = { 'MAX': 1.03, 'HIGH': 1.00, 'MEDIUM': 1.00, 'LOW': 0.97 };
    return map[tier] ?? 1.00;
  }

  private getMomentumFactor(home: Team, away: Team): number {
    // Compara goles 1H en últimos 5 vs promedio temporada
    const homeMomentum = this.calcMomentum(home, true);
    const awayMomentum = this.calcMomentum(away, false);
    const maxDivergence = Math.max(homeMomentum, awayMomentum);

    if (maxDivergence > 0.15) return 1.05;  // racha caliente
    if (maxDivergence < -0.15) return 0.95; // racha fría
    return 1.00;
  }

  private calcMomentum(team: Team, isHome: boolean): number {
    const recent = team.recentForm
      .filter(f => f.isHome === isHome)
      .slice(0, 5);
    if (recent.length < 3) return 0;

    const recentRate = recent.filter(f => f.goals_1h > 0).length / recent.length;
    const seasonRate = isHome
      ? team.stats.home.over05_1h_pct / 100
      : team.stats.away.over05_1h_pct / 100;

    return recentRate - seasonRate; // positivo = por encima del promedio
  }

  private getAggressionFactor(home: Team, away: Team): number {
    const homeAvg = home.stats.home.avg_first_goal_minute;
    const awayAvg = away.stats.away.avg_first_goal_minute;

    if (homeAvg < 28 || awayAvg < 28) return 1.04;
    if (homeAvg < 32 && awayAvg < 32) return 1.06;
    if (homeAvg > 38 && awayAvg > 38) return 0.94;
    return 1.00;
  }

  private getVulnerabilityFactor(home: Team, away: Team): number {
    const v = home.stats.home.avg_goals_1h_conceded + away.stats.away.avg_goals_1h_conceded;
    if (v > 1.2) return 1.04;
    if (v < 0.6) return 0.95;
    return 1.00;
  }

  private getContextFactor(ctx: Match['context']): number {
    const dominated = [ctx.motivationHome, ctx.motivationAway];
    if (dominated.includes('TITLE') || dominated.includes('RELEGATION')) return 1.03;
    if (dominated.every(m => m === 'NOTHING')) return 0.96;
    if (ctx.isDerby) return 0.98;
    return 1.00;
  }

  private getFormFactor(home: Team, away: Team): number {
    const homeRecent = home.recentForm.slice(0, 5);
    const awayRecent = away.recentForm.slice(0, 5);

    const homeStreak = homeRecent.filter(f => f.goals_1h > 0).length;
    const awayStreak = awayRecent.filter(f => f.goals_1h > 0).length;
    const best = Math.max(homeStreak, awayStreak);

    if (best >= 5) return 1.04;
    if (best >= 4) return 1.02;
    if (homeStreak <= 2 && awayStreak <= 2) return 0.93;
    return 1.00;
  }

  private calculateEdgeScore(home: Team, away: Team, league: League, match: Match) {
    return {
      leaguePriority: league.tier === 'MAX' ? 1.5 : 0,
      momentumDivergent: /* ... */ 0,
      earlyScorer: /* avg_first_goal < 28 ? 1.5 : 0 */ 0,
      recentForm: /* 4/5 or 5/5 ? 1.5 : 0 */ 0,
      defensiveVulnerability: /* vulnerability > 1.2 ? 1.0 : 0 */ 0,
      motivationalContext: /* TITLE/RELEGATION ? 1.0 : 0 */ 0,
      oddsSpread: /* spread > 0.10 ? 1.0 : 0 */ 0,
      droppingOdds: /* dropped > 8% ? 1.5 : 0 */ 0,
    };
  }
}
```

### 3.2 ValueService (Value Detector)

```typescript
// value.service.ts

@Injectable()
export class ValueService {

  /**
   * Evalúa si un partido tiene valor para apostar.
   * Compara P_real del modelo vs cuotas del mercado.
   */
  async evaluateValue(
    prediction: PredictionResult,
    odds: Odds,
  ): Promise<ValueResult> {

    const p_real = prediction.p_real;
    const fairOdds = 1 / p_real;
    const bestOdds = odds.bestOdds;
    const marginValor = (bestOdds * p_real) - 1;

    // Determinar señal
    let signal: 'A' | 'B' | 'C' | 'NONE';
    if (marginValor > 0.08 && prediction.edgeScore >= 6) {
      signal = 'A'; // valor excepcional
    } else if (marginValor > 0.03 && prediction.edgeScore >= 4) {
      signal = 'B'; // valor suficiente
    } else if (marginValor > 0 && prediction.edgeScore >= 5) {
      signal = 'C'; // valor marginal
    } else {
      signal = 'NONE';
    }

    // Determinar mercado óptimo
    let recommendedMarket = 'NONE';
    let recommendedType = 'PRE_MATCH';

    if (signal !== 'NONE') {
      if (bestOdds > 1.28 && marginValor > 0.03) {
        recommendedMarket = 'OVER_05_1H';
        recommendedType = 'PRE_MATCH';
      } else if (bestOdds <= 1.25) {
        // Cuota pre-match muy baja → marcar para in-play
        recommendedMarket = 'OVER_05_1H';
        recommendedType = 'IN_PLAY'; // esperar min 15-20
      }
    }

    // Calcular stake recomendado
    const stakePct = signal === 'A' ? 0.015 // 1.5%
                   : signal === 'B' ? 0.01  // 1%
                   : signal === 'C' ? 0.005 // 0.5%
                   : 0;

    return {
      p_real,
      fairOdds,
      bestOdds,
      bestBookmaker: odds.bestBookmaker,
      marginValor,
      signal,
      recommendedMarket,
      recommendedType,
      stakePct,
      overround: odds.overround,
      spread: odds.spread,
      pinnacleOdds: odds.pinnacleOdds,
    };
  }
}
```

### 3.3 SelectionService (Execution & Tracking)

```typescript
// selection.service.ts

@Injectable()
export class SelectionService {

  /**
   * Pipeline diario: escanea, filtra, genera selecciones.
   * Ejecutar via cron a las ~10:00 UTC (ajustar por zona horaria de partidos)
   */
  async runDailyPipeline(date: Date): Promise<Selection[]> {

    // FASE 1: Obtener partidos del día en ligas activas
    const matches = await this.matchService.findByDate(date, {
      excludeTiers: ['LOW'], // excluir PL, La Liga, etc.
    });

    const selections: Selection[] = [];

    for (const match of matches) {
      // FASE 2: Calcular predicción
      const prediction = await this.predictionService.calculatePrediction(match);
      if (!prediction.eligible) continue;

      // Filtro: P_real mínimo
      if (prediction.p_real < 0.73) continue;

      // Filtro: Edge Score mínimo
      if (prediction.edgeScore < 4) continue;

      // FASE 3: Obtener cuotas y evaluar valor
      const odds = await this.oddsService.getLatest(match._id, 'OVER_05_1H');
      if (!odds || !odds.bestOdds) continue;

      const value = await this.valueService.evaluateValue(prediction, odds);
      if (value.signal === 'NONE') continue;

      // Filtro: margen positivo obligatorio
      if (value.marginValor <= 0) continue;

      // FASE 4: Crear selección
      const bankroll = await this.getBankroll();
      const stakeAmount = bankroll * value.stakePct;

      selections.push({
        selectionId: this.generateId(date),
        match: match._id,
        prediction: prediction._id,
        market: value.recommendedMarket,
        type: value.recommendedType,
        signal: value.signal,
        p_real: prediction.p_real,
        fairOdds: value.fairOdds,
        bestOdds: value.bestOdds,
        bookmaker: value.bestBookmaker,
        marginValor: value.marginValor,
        edgeScore: prediction.edgeScore,
        stakePct: value.stakePct,
        stakeAmount,
        bankrollAtBet: bankroll,
        outcome: 'PENDING',
      });
    }

    // Limitar a 5 selecciones máximo, ordenadas por margen_valor desc
    const final = selections
      .sort((a, b) => b.marginValor - a.marginValor)
      .slice(0, 5);

    // Validar exposición total <= 8%
    const totalExposure = final.reduce((s, sel) => s + sel.stakePct, 0);
    if (totalExposure > 0.08) {
      // Reducir proporcionalmente
      const ratio = 0.08 / totalExposure;
      final.forEach(s => {
        s.stakePct *= ratio;
        s.stakeAmount *= ratio;
      });
    }

    // Guardar en DB
    await this.selectionModel.insertMany(final);
    return final;
  }

  /**
   * Resolver resultados post-partido.
   * Ejecutar via cron cada hora para partidos finalizados.
   */
  async settleSelections(): Promise<void> {
    const pending = await this.selectionModel.find({ outcome: 'PENDING' })
      .populate('match');

    for (const sel of pending) {
      const match = sel.match as Match;
      if (match.status !== 'FINISHED' || !match.result) continue;

      const goals1h = match.result.goals_1h_total;
      const isWin = this.resolveOutcome(sel.market, goals1h);

      // Obtener closing odds
      const closingOdds = await this.oddsService.getClosing(match._id, sel.market);

      sel.outcome = isWin ? 'WIN' : 'LOSS';
      sel.profitLoss = isWin
        ? sel.stakeAmount * (sel.bestOdds - 1)
        : -sel.stakeAmount;
      sel.closingOdds = closingOdds;
      sel.clv = sel.bestOdds - (closingOdds ?? sel.bestOdds);
      sel.firstGoalMinute = match.result.first_goal_minute;
      sel.goals1hTotal = goals1h;
      sel.settledAt = new Date();

      await sel.save();
    }
  }
}
```

### 3.4 HealthService (Health Monitor)

```typescript
// health.service.ts

@Injectable()
export class HealthService {

  async getHealthReport(windowSize = 200): Promise<HealthReport> {
    const recent = await this.selectionModel
      .find({ outcome: { $ne: 'PENDING' } })
      .sort({ settledAt: -1 })
      .limit(windowSize);

    if (recent.length < 20) {
      return { status: 'INSUFFICIENT_DATA', sampleSize: recent.length };
    }

    const settled = recent.filter(s => ['WIN', 'LOSS'].includes(s.outcome));
    const wins = settled.filter(s => s.outcome === 'WIN').length;
    const hitRate = wins / settled.length;
    const avgCLV = settled.reduce((s, sel) => s + (sel.clv ?? 0), 0) / settled.length;
    const totalPL = settled.reduce((s, sel) => s + (sel.profitLoss ?? 0), 0);
    const totalStaked = settled.reduce((s, sel) => s + sel.stakeAmount, 0);
    const roi = totalStaked > 0 ? totalPL / totalStaked : 0;

    // Status por CLV
    let clvStatus: 'GREEN' | 'YELLOW' | 'RED';
    if (avgCLV > 0.02) clvStatus = 'GREEN';
    else if (avgCLV >= 0) clvStatus = 'YELLOW';
    else clvStatus = 'RED';

    // Status por hit rate
    let hitRateStatus: 'GREEN' | 'YELLOW' | 'RED';
    if (hitRate >= 0.78) hitRateStatus = 'GREEN';
    else if (hitRate >= 0.73) hitRateStatus = 'YELLOW';
    else hitRateStatus = 'RED';

    // Alertas
    const alerts: Alert[] = [];
    if (clvStatus === 'RED' && settled.length >= 100) {
      alerts.push({
        level: 'CRITICAL',
        message: 'CLV negativo por 100+ selecciones. PAUSAR sistema y revisar modelo.',
      });
    }
    if (clvStatus === 'YELLOW' && settled.length >= 50) {
      alerts.push({
        level: 'WARNING',
        message: 'CLV en zona gris. Revisar multiplicadores del modelo.',
      });
    }
    if (hitRate > 0.90 && settled.length >= 50) {
      alerts.push({
        level: 'INFO',
        message: 'Hit rate inusualmente alto. Probable varianza positiva. No aumentar stakes.',
      });
    }

    // Breakdown por liga
    const byLeague = this.groupByField(settled, 'league');
    // Breakdown por señal
    const bySignal = this.groupByField(settled, 'signal');
    // Breakdown por mercado
    const byMarket = this.groupByField(settled, 'market');

    return {
      status: clvStatus === 'RED' ? 'CRITICAL' : clvStatus === 'YELLOW' ? 'REVIEW' : 'HEALTHY',
      sampleSize: settled.length,
      metrics: { hitRate, avgCLV, roi, totalPL, totalStaked },
      statuses: { clv: clvStatus, hitRate: hitRateStatus },
      alerts,
      breakdown: { byLeague, bySignal, byMarket },
    };
  }
}
```

---

## 4. GRAPHQL SCHEMA

```graphql
type Query {
  # Selecciones del día
  todaySelections: [Selection!]!
  
  # Selecciones por fecha
  selectionsByDate(date: String!): [Selection!]!
  
  # Historial con filtros
  selectionHistory(
    limit: Int
    offset: Int
    league: String
    signal: String
    outcome: String
    dateFrom: String
    dateTo: String
  ): SelectionConnection!
  
  # Health
  healthReport(windowSize: Int): HealthReport!
  
  # Ligas activas hoy
  activeLeagues: [League!]!
  
  # Partidos candidatos (antes de filtrar)
  matchCandidates(date: String!): [MatchCandidate!]!
  
  # Detalle de predicción para un partido
  matchPrediction(matchId: ID!): PredictionDetail!
}

type Mutation {
  # Ejecutar pipeline manualmente
  runDailyPipeline(date: String!): [Selection!]!
  
  # Resolver selecciones pendientes
  settleSelections: Int!
  
  # Actualizar bankroll
  updateBankroll(amount: Float!): Float!
  
  # Forzar actualización de datos
  refreshTeamStats(leagueCode: String!): Boolean!
  refreshOdds(matchId: ID!): Boolean!
}

type Subscription {
  # Cuando se genera nueva selección
  selectionCreated: Selection!
  
  # Cuando se resuelve una selección
  selectionSettled: Selection!
  
  # Alertas de salud
  healthAlert: Alert!
}
```

---

## 5. CRON JOBS (ScraperScheduler)

```typescript
// scraper.scheduler.ts

@Injectable()
export class ScraperScheduler {

  // Actualizar stats de equipos — diario a las 06:00 UTC
  @Cron('0 6 * * *')
  async updateTeamStats() {
    const activeLeagues = await this.leagueService.findActive();
    for (const league of activeLeagues) {
      await this.scraperService.scrapeTeamStats(league);
    }
  }

  // Obtener partidos del día — diario a las 07:00 UTC
  @Cron('0 7 * * *')
  async fetchTodayMatches() {
    await this.scraperService.scrapeTodayMatches();
  }

  // Obtener cuotas — cada 30 min entre 08:00-22:00 UTC
  @Cron('*/30 8-22 * * *')
  async fetchOdds() {
    const todayMatches = await this.matchService.findToday('SCHEDULED');
    for (const match of todayMatches) {
      await this.scraperService.scrapeOdds(match);
    }
  }

  // Ejecutar pipeline de selecciones — diario a las 10:00 UTC
  @Cron('0 10 * * *')
  async runPipeline() {
    await this.selectionService.runDailyPipeline(new Date());
  }

  // Resolver selecciones — cada hora
  @Cron('0 * * * *')
  async settle() {
    await this.selectionService.settleSelections();
  }

  // Capturar closing odds — 5 min antes de cada kickoff
  // (implementar con setTimeout dinámico basado en kickoff times)
  async captureClosingOdds(match: Match) {
    const delay = match.kickoff.getTime() - Date.now() - 5 * 60 * 1000;
    if (delay > 0) {
      setTimeout(async () => {
        await this.scraperService.scrapeOdds(match);
        await this.oddsService.markAsClosing(match._id);
      }, delay);
    }
  }
}
```

---

## 6. FRONTEND — PÁGINAS PRINCIPALES

### 6.1 Dashboard (`/dashboard`)
- Resumen del día: selecciones activas, pendientes, resueltas
- Bankroll actual con gráfico de evolución
- Health status (semáforo CLV, hit rate, ROI)
- Próximos kickoffs con countdown

### 6.2 Selecciones (`/selections`)
- Lista de selecciones del día con cards:
  - Match, liga, señal (A/B/C con color)
  - P_real, cuota, margen_valor
  - Stake recomendado
  - Hora de kickoff
  - Status: PENDING / WIN / LOSS
- Filtros: por fecha, liga, señal, outcome

### 6.3 Historial (`/history`)
- Tabla paginada de todas las selecciones históricas
- Métricas rolling: CLV, hit rate, ROI, P&L
- Gráficos: P&L acumulado, CLV por liga, hit rate por señal
- Export a CSV

### 6.4 Health (`/health`)
- Semáforos grandes: CLV, hit rate, ROI
- Alertas activas
- Breakdown por liga, mercado, señal, rango de cuota
- Gráfico de CLV rolling (últimas 200 selecciones)

### 6.5 Config (`/config`)
- Ligas activas (toggle on/off)
- Multiplicadores del modelo (editable para recalibración)
- Bankroll actual
- Reglas de staking

---

## 7. CONSTANTES Y CONFIGURACIÓN

```typescript
// constants/league-config.ts

export const LEAGUE_CONFIG = {
  DEN_SUPERLIGAEN: { tier: 'MAX', seasonStart: 8, seasonEnd: 5, teams: 12 },
  HUN_NB1: { tier: 'MAX', seasonStart: 8, seasonEnd: 5, teams: 12 },
  CZE_LIGA: { tier: 'MAX', seasonStart: 8, seasonEnd: 5, teams: 16 },
  FIN_YKKONEN: { tier: 'MAX', seasonStart: 4, seasonEnd: 10, teams: 10 },
  NOR_1DIV: { tier: 'MAX', seasonStart: 4, seasonEnd: 11, teams: 16 },
  SWE_SUPERETTAN: { tier: 'MEDIUM', seasonStart: 4, seasonEnd: 11, teams: 16 },
  SUI_SUPER: { tier: 'MEDIUM', seasonStart: 8, seasonEnd: 5, teams: 12 },
  TUR_1LIG: { tier: 'MEDIUM', seasonStart: 8, seasonEnd: 5, teams: 18 },
  TUR_SUPERLIG: { tier: 'HIGH', seasonStart: 8, seasonEnd: 5, teams: 19 },
  GER_BUNDESLIGA: { tier: 'HIGH', seasonStart: 8, seasonEnd: 5, teams: 18 },
  NED_EREDIVISIE: { tier: 'HIGH', seasonStart: 8, seasonEnd: 5, teams: 18 },
  UEFA_UCL: { tier: 'HIGH', seasonStart: 9, seasonEnd: 5, teams: 36 },
  BRA_SERIEA: { tier: 'HIGH', seasonStart: 4, seasonEnd: 12, teams: 20 },
  // LOW tier — excluidos del pipeline
  ENG_PL: { tier: 'LOW' },
  ESP_LALIGA: { tier: 'LOW' },
  ITA_SERIEA: { tier: 'LOW' },
  FRA_LIGUE1: { tier: 'LOW' },
};

// constants/model-factors.ts

export const MODEL_FACTORS = {
  league: { MAX: 1.03, HIGH: 1.00, MEDIUM: 1.00, LOW: 0.97 },
  momentum: { HOT: 1.05, NEUTRAL: 1.00, COLD: 0.95 },
  aggression: { EARLY: 1.04, BOTH_EARLY: 1.06, LATE: 0.94, NORMAL: 1.00 },
  vulnerability: { HIGH: 1.04, LOW: 0.95, NORMAL: 1.00 },
  context: { HIGH_STAKES: 1.03, NOTHING: 0.96, DERBY: 0.98, NORMAL: 1.00 },
  form: { STREAK_5: 1.04, STREAK_4: 1.02, COLD: 0.93, NORMAL: 1.00 },
};

export const RULES = {
  MIN_MATCHES_PLAYED: 8,
  MIN_P_REAL: 0.73,
  MIN_EDGE_SCORE: 4.0,
  MIN_MARGIN_VALOR: 0.0,       // estrictamente positivo
  MAX_SELECTIONS_PER_DAY: 5,
  MAX_DAILY_EXPOSURE: 0.08,    // 8% del bankroll
  MAX_SINGLE_STAKE: 0.03,      // 3% del bankroll
  STAKE_SIGNAL_A: 0.015,
  STAKE_SIGNAL_B: 0.01,
  STAKE_SIGNAL_C: 0.005,
  PRE_MATCH_MIN_ODDS: 1.28,    // bajo esto → marcar para in-play
};
```

---

## 8. NOTAS PARA CLAUDE CODE

1. **Prioridad de implementación**: Backend primero (Módulos 2-5), luego scrapers (Módulo 1), luego frontend. El sistema tiene valor incluso sin UI si corre los pipelines por cron.

2. **Scrapers**: Empezar con FootyStats y OddsPortal. Estos dos cubren el 80% de los datos necesarios. Los demás son complementarios.

3. **Calibración del modelo**: Los multiplicadores en `MODEL_FACTORS` son estimaciones iniciales. El sistema DEBE incluir funcionalidad para ajustarlos desde la UI (`/config`). La calibración real vendrá con datos de producción.

4. **Closing odds**: Capturar la cuota ~5 minutos antes del kickoff es CRÍTICO para calcular CLV. Sin CLV el sistema no puede validarse a sí mismo.

5. **No over-engineer el frontend al inicio**. El dashboard y la lista de selecciones son suficientes para v1. Health y config pueden ser v1.1.

6. **Testing**: El `PredictionService` y `ValueService` son los servicios más críticos. Deben tener unit tests exhaustivos con datos reales de partidos históricos.

7. **El scraper de alineaciones** (Sofascore) es el más frágil y el menos prioritario. Puede ser manual en v1 (input desde UI) y automatizarse después.
