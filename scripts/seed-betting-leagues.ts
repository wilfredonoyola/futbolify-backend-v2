import { MongoClient } from 'mongodb'
import * as dotenv from 'dotenv'

dotenv.config()

// League seed data from LIGAS-OBJETIVO-SEED-DATA-2026.md
const LEAGUES_SEED_DATA = [
  // TIER 1 — PRIORIDAD MÁXIMA
  {
    name: 'Eredivisie',
    country: 'Netherlands',
    division: 1,
    tier: 1,
    isActive: true,
    apiFootballId: 88,
    oddsApiSportKey: 'soccer_netherlands_eredivisie',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-08'),
    seasonEnd: new Date('2026-05-17'),
    stats: {
      avgGoals1H: 1.4,
      over05_1H_pct: 0.813,
      over15_1H_pct: 0.418,
      avgCornersPerMatch: 10.43,
      avgShotsPerMatch: 25.8,
      bts1H_pct: 0.276,
      matchesPlayed: 225,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['16:45 CET', '18:45 CET', '20:00 CET'],
      timezone: 'Europe/Amsterdam',
      utcOffset: 1,
      windowA: true,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.02,
      correlationAdj: 0.05,
      cornersBaseline: 10.43,
      goalsBaseline: 1.4,
      shotsBaseline: 25.8,
      bookmakerQuality: 'medium',
    },
    notes:
      'Liga #1 en corners (10.43/partido). PSV y Fortuna Sittard 96% Over 0.5 1H. Feyenoord lidera corners a favor (7.59). FC Twente es trampa (68% Over 0.5 1H).',
  },
  {
    name: 'Bundesliga',
    country: 'Germany',
    division: 1,
    tier: 1,
    isActive: true,
    apiFootballId: 78,
    oddsApiSportKey: 'soccer_germany_bundesliga',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-22'),
    seasonEnd: new Date('2026-05-16'),
    stats: {
      avgGoals1H: 1.35,
      over05_1H_pct: 0.85,
      over15_1H_pct: 0.43,
      avgCornersPerMatch: 9.64,
      avgShotsPerMatch: 26.2,
      bts1H_pct: 0.3,
      matchesPlayed: 234,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['15:30 CET', '18:30 CET'],
      timezone: 'Europe/Berlin',
      utcOffset: 1,
      windowA: true,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.02,
      correlationAdj: 0.05,
      cornersBaseline: 9.64,
      goalsBaseline: 1.35,
      shotsBaseline: 26.2,
      bookmakerQuality: 'high',
    },
    notes:
      'Wolfsburg 11.34 corners/partido (máximo). Bayern 93 goles en temporada, 6.17 corners a favor. Eintracht Frankfurt más bajo en corners (8.54).',
  },
  {
    name: 'Superligaen',
    country: 'Denmark',
    division: 1,
    tier: 1,
    isActive: true,
    apiFootballId: 119,
    oddsApiSportKey: 'soccer_denmark_superliga',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-07-18'),
    seasonEnd: new Date('2026-05-28'),
    stats: {
      avgGoals1H: 1.55,
      over05_1H_pct: 0.87,
      over15_1H_pct: 0.46,
      avgCornersPerMatch: 9.6,
      avgShotsPerMatch: 24.0,
      bts1H_pct: 0.32,
      matchesPlayed: 200,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['16:00 CET', '18:00 CET'],
      timezone: 'Europe/Copenhagen',
      utcOffset: 1,
      windowA: true,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.02,
      correlationAdj: 0.04,
      cornersBaseline: 9.6,
      goalsBaseline: 1.55,
      shotsBaseline: 24.0,
      bookmakerQuality: 'medium',
    },
    notes:
      '#1 en avg goles 1H (1.55) entre ligas con odds. Liga small market = más ineficiencias en cuotas.',
  },
  {
    name: 'Süper Lig',
    country: 'Turkey',
    division: 1,
    tier: 1,
    isActive: true,
    apiFootballId: 203,
    oddsApiSportKey: 'soccer_turkey_super_league',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-15'),
    seasonEnd: new Date('2026-05-24'),
    stats: {
      avgGoals1H: 1.28,
      over05_1H_pct: 0.84,
      over15_1H_pct: 0.4,
      avgCornersPerMatch: 9.3,
      avgShotsPerMatch: 23.5,
      bts1H_pct: 0.28,
      matchesPlayed: 240,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['16:00 TRT', '19:00 TRT'],
      timezone: 'Europe/Istanbul',
      utcOffset: 3,
      windowA: true,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.02,
      correlationAdj: 0.03,
      cornersBaseline: 9.3,
      goalsBaseline: 1.28,
      shotsBaseline: 23.5,
      bookmakerQuality: 'medium',
    },
    notes:
      'Galatasaray, Fenerbahçe, Beşiktaş dominan stats. Liga puede ser volátil en derbis.',
  },

  // TIER 2 — SEGUNDAS DIVISIONES
  {
    name: 'Championship',
    country: 'England',
    division: 2,
    tier: 2,
    isActive: true,
    apiFootballId: 40,
    oddsApiSportKey: 'soccer_efl_champ',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-09'),
    seasonEnd: new Date('2026-05-03'),
    stats: {
      avgGoals1H: 1.3,
      over05_1H_pct: 0.8,
      over15_1H_pct: 0.38,
      avgCornersPerMatch: 9.8,
      avgShotsPerMatch: 24.5,
      bts1H_pct: 0.26,
      matchesPlayed: 400,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'tuesday',
      typicalKickoffs: ['15:00 GMT'],
      timezone: 'Europe/London',
      utcOffset: 0,
      windowA: true,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.01,
      correlationAdj: 0.03,
      cornersBaseline: 9.8,
      goalsBaseline: 1.3,
      shotsBaseline: 24.5,
      bookmakerQuality: 'low',
    },
    notes:
      '46 partidos por equipo = máximo volumen. 2da div inglesa con cobertura completa. Cuotas peor modeladas que Premier.',
  },
  {
    name: '2. Bundesliga',
    country: 'Germany',
    division: 2,
    tier: 2,
    isActive: true,
    apiFootballId: 79,
    oddsApiSportKey: 'soccer_germany_bundesliga2',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-01'),
    seasonEnd: new Date('2026-05-17'),
    stats: {
      avgGoals1H: 1.27,
      over05_1H_pct: 0.7,
      over15_1H_pct: 0.36,
      avgCornersPerMatch: 9.2,
      avgShotsPerMatch: 23.0,
      bts1H_pct: 0.24,
      matchesPlayed: 243,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'friday',
      typicalKickoffs: ['13:00 CET', '20:30 CET'],
      timezone: 'Europe/Berlin',
      utcOffset: 1,
      windowA: false,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.01,
      correlationAdj: 0.03,
      cornersBaseline: 9.2,
      goalsBaseline: 1.27,
      shotsBaseline: 23.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Over 0.5 1H solo 70% — más selectivo que Bundesliga. Dato verificado Footiqo. Avg goles 1H decente (1.27).',
  },
  {
    name: '3. Liga',
    country: 'Germany',
    division: 3,
    tier: 2,
    isActive: true,
    apiFootballId: 80,
    oddsApiSportKey: 'soccer_germany_liga3',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-01'),
    seasonEnd: new Date('2026-05-17'),
    stats: {
      avgGoals1H: 1.25,
      over05_1H_pct: 0.72,
      over15_1H_pct: 0.34,
      avgCornersPerMatch: 9.1,
      avgShotsPerMatch: 22.5,
      bts1H_pct: 0.23,
      matchesPlayed: 280,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'wednesday',
      typicalKickoffs: ['14:00 CET'],
      timezone: 'Europe/Berlin',
      utcOffset: 1,
      windowA: true,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.01,
      correlationAdj: 0.02,
      cornersBaseline: 9.1,
      goalsBaseline: 1.25,
      shotsBaseline: 22.5,
      bookmakerQuality: 'low',
    },
    notes:
      'JOYA ABSOLUTA: 3ra división con cobertura COMPLETA en ambas APIs. Las casas casi no ponen recursos. Mayor edge potencial.',
  },
  {
    name: 'Superettan',
    country: 'Sweden',
    division: 2,
    tier: 2,
    isActive: false,
    apiFootballId: 114,
    oddsApiSportKey: 'soccer_sweden_superettan',
    hasOddsApi: true,
    season: '2026',
    seasonType: 'summer',
    seasonStart: new Date('2026-04-05'),
    seasonEnd: new Date('2026-11-08'),
    stats: {
      avgGoals1H: 1.3,
      over05_1H_pct: 0.78,
      over15_1H_pct: 0.36,
      avgCornersPerMatch: 9.0,
      avgShotsPerMatch: 22.0,
      bts1H_pct: 0.25,
      matchesPlayed: 0,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'monday',
      typicalKickoffs: ['15:00 CET', '17:30 CET'],
      timezone: 'Europe/Stockholm',
      utcOffset: 1,
      windowA: true,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.01,
      correlationAdj: 0.02,
      cornersBaseline: 9.0,
      goalsBaseline: 1.3,
      shotsBaseline: 22.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Temporada verano. Juego abierto, defensas vulnerables. Activar cuando arranque en abril 2026.',
  },
  {
    name: 'La Liga 2',
    country: 'Spain',
    division: 2,
    tier: 2,
    isActive: true,
    apiFootballId: 141,
    oddsApiSportKey: 'soccer_spain_segunda_division',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-16'),
    seasonEnd: new Date('2026-05-31'),
    stats: {
      avgGoals1H: 1.1,
      over05_1H_pct: 0.72,
      over15_1H_pct: 0.3,
      avgCornersPerMatch: 9.0,
      avgShotsPerMatch: 22.5,
      bts1H_pct: 0.22,
      matchesPlayed: 320,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['16:00 CET', '18:30 CET', '21:00 CET'],
      timezone: 'Europe/Madrid',
      utcOffset: 1,
      windowA: true,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.01,
      correlationAdj: 0.01,
      cornersBaseline: 9.0,
      goalsBaseline: 1.1,
      shotsBaseline: 22.5,
      bookmakerQuality: 'low',
    },
    notes:
      'Avg goles 1H bajo (1.10) pero cubierta completa. Más útil para corners que para goles 1H.',
  },
  {
    name: 'Ligue 2',
    country: 'France',
    division: 2,
    tier: 2,
    isActive: true,
    apiFootballId: 62,
    oddsApiSportKey: 'soccer_france_ligue_two',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-16'),
    seasonEnd: new Date('2026-05-16'),
    stats: {
      avgGoals1H: 1.15,
      over05_1H_pct: 0.74,
      over15_1H_pct: 0.32,
      avgCornersPerMatch: 9.0,
      avgShotsPerMatch: 22.0,
      bts1H_pct: 0.23,
      matchesPlayed: 290,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'monday',
      typicalKickoffs: ['19:00 CET'],
      timezone: 'Europe/Paris',
      utcOffset: 1,
      windowA: false,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.01,
      correlationAdj: 0.01,
      cornersBaseline: 9.0,
      goalsBaseline: 1.15,
      shotsBaseline: 22.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Similar a La Liga 2. Partidos típicamente de noche (19:00 CET = 11 AM SV). Ventana B.',
  },
  {
    name: 'Serie B',
    country: 'Italy',
    division: 2,
    tier: 2,
    isActive: true,
    apiFootballId: 136,
    oddsApiSportKey: 'soccer_italy_serie_b',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-16'),
    seasonEnd: new Date('2026-05-09'),
    stats: {
      avgGoals1H: 1.1,
      over05_1H_pct: 0.71,
      over15_1H_pct: 0.3,
      avgCornersPerMatch: 9.0,
      avgShotsPerMatch: 22.0,
      bts1H_pct: 0.22,
      matchesPlayed: 300,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['15:00 CET', '17:15 CET', '20:30 CET'],
      timezone: 'Europe/Rome',
      utcOffset: 1,
      windowA: true,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.01,
      correlationAdj: 0.0,
      cornersBaseline: 9.0,
      goalsBaseline: 1.1,
      shotsBaseline: 22.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Cultura defensiva italiana. Avg bajo pero cubierta completa. Correlación goles-corners baja.',
  },
  {
    name: 'Série B',
    country: 'Brazil',
    division: 2,
    tier: 2,
    isActive: false,
    apiFootballId: 72,
    oddsApiSportKey: 'soccer_brazil_serie_b',
    hasOddsApi: true,
    season: '2026',
    seasonType: 'summer',
    seasonStart: new Date('2026-04-19'),
    seasonEnd: new Date('2026-11-22'),
    stats: {
      avgGoals1H: 1.2,
      over05_1H_pct: 0.76,
      over15_1H_pct: 0.34,
      avgCornersPerMatch: 8.8,
      avgShotsPerMatch: 21.0,
      bts1H_pct: 0.24,
      matchesPlayed: 0,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'tuesday',
      typicalKickoffs: ['16:00 BRT', '19:00 BRT', '21:30 BRT'],
      timezone: 'America/Sao_Paulo',
      utcOffset: -3,
      windowA: false,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.01,
      correlationAdj: 0.02,
      cornersBaseline: 8.8,
      goalsBaseline: 1.2,
      shotsBaseline: 21.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Temporada abril-noviembre. Errores defensivos comunes. Activar cuando arranque.',
  },

  // TIER 3 — LIGAS DE VERANO + TERCERAS/CUARTAS DIVISIONES
  {
    name: 'Eliteserien',
    country: 'Norway',
    division: 1,
    tier: 3,
    isActive: false,
    apiFootballId: 103,
    oddsApiSportKey: 'soccer_norway_eliteserien',
    hasOddsApi: true,
    season: '2026',
    seasonType: 'summer',
    seasonStart: new Date('2026-03-30'),
    seasonEnd: new Date('2026-11-29'),
    stats: {
      avgGoals1H: 1.25,
      over05_1H_pct: 0.78,
      over15_1H_pct: 0.35,
      avgCornersPerMatch: 8.9,
      avgShotsPerMatch: 22.0,
      bts1H_pct: 0.25,
      matchesPlayed: 0,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'sunday',
      secondaryDay: 'wednesday',
      typicalKickoffs: ['17:00 CET', '19:00 CET'],
      timezone: 'Europe/Oslo',
      utcOffset: 1,
      windowA: false,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.0,
      correlationAdj: 0.02,
      cornersBaseline: 8.9,
      goalsBaseline: 1.25,
      shotsBaseline: 22.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Temporada verano. Cubre vacío cuando Europa para. Activar en abril.',
  },
  {
    name: 'Allsvenskan',
    country: 'Sweden',
    division: 1,
    tier: 3,
    isActive: false,
    apiFootballId: 113,
    oddsApiSportKey: 'soccer_sweden_allsvenskan',
    hasOddsApi: true,
    season: '2026',
    seasonType: 'summer',
    seasonStart: new Date('2026-04-05'),
    seasonEnd: new Date('2026-11-08'),
    stats: {
      avgGoals1H: 1.2,
      over05_1H_pct: 0.76,
      over15_1H_pct: 0.33,
      avgCornersPerMatch: 9.0,
      avgShotsPerMatch: 22.5,
      bts1H_pct: 0.24,
      matchesPlayed: 0,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['15:00 CET', '17:30 CET'],
      timezone: 'Europe/Stockholm',
      utcOffset: 1,
      windowA: true,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.0,
      correlationAdj: 0.02,
      cornersBaseline: 9.0,
      goalsBaseline: 1.2,
      shotsBaseline: 22.5,
      bookmakerQuality: 'low',
    },
    notes:
      'Temporada verano. Activar en abril. Cae en Ventana A los sábados.',
  },
  {
    name: 'Veikkausliiga',
    country: 'Finland',
    division: 1,
    tier: 3,
    isActive: false,
    apiFootballId: 244,
    oddsApiSportKey: 'soccer_finland_veikkausliiga',
    hasOddsApi: true,
    season: '2026',
    seasonType: 'summer',
    seasonStart: new Date('2026-04-11'),
    seasonEnd: new Date('2026-10-25'),
    stats: {
      avgGoals1H: 1.3,
      over05_1H_pct: 0.8,
      over15_1H_pct: 0.38,
      avgCornersPerMatch: 9.1,
      avgShotsPerMatch: 22.0,
      bts1H_pct: 0.26,
      matchesPlayed: 0,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'tuesday',
      typicalKickoffs: ['17:00 EEST'],
      timezone: 'Europe/Helsinki',
      utcOffset: 2,
      windowA: true,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.0,
      correlationAdj: 0.02,
      cornersBaseline: 9.1,
      goalsBaseline: 1.3,
      shotsBaseline: 22.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Temporada verano. Liga con buenas stats pero muestra chica. Activar en abril.',
  },
  {
    name: 'League One',
    country: 'England',
    division: 3,
    tier: 3,
    isActive: true,
    apiFootballId: 41,
    oddsApiSportKey: 'soccer_england_league1',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-09'),
    seasonEnd: new Date('2026-05-03'),
    stats: {
      avgGoals1H: 1.16,
      over05_1H_pct: 0.71,
      over15_1H_pct: 0.31,
      avgCornersPerMatch: 9.0,
      avgShotsPerMatch: 21.5,
      bts1H_pct: 0.22,
      matchesPlayed: 460,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'tuesday',
      typicalKickoffs: ['15:00 GMT'],
      timezone: 'Europe/London',
      utcOffset: 0,
      windowA: true,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.0,
      correlationAdj: 0.01,
      cornersBaseline: 9.0,
      goalsBaseline: 1.16,
      shotsBaseline: 21.5,
      bookmakerQuality: 'low',
    },
    notes:
      '3ra div inglesa. Dato Footiqo verificado: 1.16 avg 1H, 71% Over 0.5. Volumen alto (460 partidos).',
  },
  {
    name: 'League Two',
    country: 'England',
    division: 4,
    tier: 3,
    isActive: true,
    apiFootballId: 42,
    oddsApiSportKey: 'soccer_england_league2',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-09'),
    seasonEnd: new Date('2026-05-03'),
    stats: {
      avgGoals1H: 1.14,
      over05_1H_pct: 0.67,
      over15_1H_pct: 0.33,
      avgCornersPerMatch: 8.8,
      avgShotsPerMatch: 20.5,
      bts1H_pct: 0.2,
      matchesPlayed: 463,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'tuesday',
      typicalKickoffs: ['15:00 GMT'],
      timezone: 'Europe/London',
      utcOffset: 0,
      windowA: true,
      windowB: false,
    },
    modelConfig: {
      leagueBonus: 0.0,
      correlationAdj: 0.01,
      cornersBaseline: 8.8,
      goalsBaseline: 1.14,
      shotsBaseline: 20.5,
      bookmakerQuality: 'low',
    },
    notes:
      '4ta div inglesa. Over 0.5 1H solo 67% — más bajo. Pero cuotas MÁS desfasadas que cualquier otra liga.',
  },

  // TIER 4 — PRIMERAS DIVISIONES PRINCIPALES
  {
    name: 'Premier League',
    country: 'England',
    division: 1,
    tier: 4,
    isActive: true,
    apiFootballId: 39,
    oddsApiSportKey: 'soccer_epl',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-16'),
    seasonEnd: new Date('2026-05-24'),
    stats: {
      avgGoals1H: 1.3,
      over05_1H_pct: 0.78,
      over15_1H_pct: 0.36,
      avgCornersPerMatch: 9.85,
      avgShotsPerMatch: 25.0,
      bts1H_pct: 0.27,
      matchesPlayed: 290,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['15:00 GMT', '17:30 GMT'],
      timezone: 'Europe/London',
      utcOffset: 0,
      windowA: true,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: -0.01,
      correlationAdj: 0.03,
      cornersBaseline: 9.85,
      goalsBaseline: 1.3,
      shotsBaseline: 25.0,
      bookmakerQuality: 'high',
    },
    notes:
      'Cuotas perfectamente modeladas. Poco value. Solo apostar cuando filtros son EXCEPCIONALES. West Ham 11.57 crn, Newcastle 6.5 crn a favor.',
  },
  {
    name: 'La Liga',
    country: 'Spain',
    division: 1,
    tier: 4,
    isActive: true,
    apiFootballId: 140,
    oddsApiSportKey: 'soccer_spain_la_liga',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-16'),
    seasonEnd: new Date('2026-05-24'),
    stats: {
      avgGoals1H: 1.2,
      over05_1H_pct: 0.78,
      over15_1H_pct: 0.33,
      avgCornersPerMatch: 9.4,
      avgShotsPerMatch: 24.0,
      bts1H_pct: 0.25,
      matchesPlayed: 280,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['16:15 CET', '18:30 CET', '21:00 CET'],
      timezone: 'Europe/Madrid',
      utcOffset: 1,
      windowA: true,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: -0.01,
      correlationAdj: 0.01,
      cornersBaseline: 9.4,
      goalsBaseline: 1.2,
      shotsBaseline: 24.0,
      bookmakerQuality: 'high',
    },
    notes:
      'Variable (70-82% Over 0.5 1H). Equipos como Getafe/Leganés destruyen la estadística. Solo matchups top.',
  },
  {
    name: 'Serie A',
    country: 'Italy',
    division: 1,
    tier: 4,
    isActive: true,
    apiFootballId: 135,
    oddsApiSportKey: 'soccer_italy_serie_a',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-17'),
    seasonEnd: new Date('2026-05-24'),
    stats: {
      avgGoals1H: 1.15,
      over05_1H_pct: 0.74,
      over15_1H_pct: 0.3,
      avgCornersPerMatch: 9.5,
      avgShotsPerMatch: 24.5,
      bts1H_pct: 0.23,
      matchesPlayed: 280,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['15:00 CET', '18:00 CET', '20:45 CET'],
      timezone: 'Europe/Rome',
      utcOffset: 1,
      windowA: true,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: -0.01,
      correlationAdj: -0.05,
      cornersBaseline: 9.5,
      goalsBaseline: 1.15,
      shotsBaseline: 24.5,
      bookmakerQuality: 'high',
    },
    notes:
      'Cultura defensiva. correlationAdj NEGATIVO porque defensas italianas rompen la correlación goles-corners. Muchos 0-0 al descanso.',
  },
  {
    name: 'Ligue 1',
    country: 'France',
    division: 1,
    tier: 4,
    isActive: true,
    apiFootballId: 61,
    oddsApiSportKey: 'soccer_france_ligue_one',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-08-09'),
    seasonEnd: new Date('2026-05-24'),
    stats: {
      avgGoals1H: 1.18,
      over05_1H_pct: 0.76,
      over15_1H_pct: 0.31,
      avgCornersPerMatch: 9.32,
      avgShotsPerMatch: 23.5,
      bts1H_pct: 0.24,
      matchesPlayed: 270,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['17:00 CET', '21:00 CET'],
      timezone: 'Europe/Paris',
      utcOffset: 1,
      windowA: false,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: -0.01,
      correlationAdj: -0.02,
      cornersBaseline: 9.32,
      goalsBaseline: 1.18,
      shotsBaseline: 23.5,
      bookmakerQuality: 'high',
    },
    notes:
      'Nice 10.74 crn/partido, Lens 5.85 crn a favor. Sin PSG la liga baja mucho. Partidos tarde (Ventana B).',
  },

  // LIGAS CON COBERTURA PARCIAL
  {
    name: '1. HNL',
    country: 'Croatia',
    division: 1,
    tier: 3,
    isActive: true,
    apiFootballId: 210,
    oddsApiSportKey: null,
    hasOddsApi: false,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-07-19'),
    seasonEnd: new Date('2026-05-30'),
    stats: {
      avgGoals1H: 1.54,
      over05_1H_pct: 0.82,
      over15_1H_pct: 0.42,
      avgCornersPerMatch: 9.2,
      avgShotsPerMatch: 22.0,
      bts1H_pct: 0.28,
      matchesPlayed: 200,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['17:00 CET', '19:15 CET'],
      timezone: 'Europe/Zagreb',
      utcOffset: 1,
      windowA: false,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.0,
      correlationAdj: 0.03,
      cornersBaseline: 9.2,
      goalsBaseline: 1.54,
      shotsBaseline: 22.0,
      bookmakerQuality: 'low',
    },
    notes:
      'SORPRESA: 1.54 avg goles 1H. Sin The Odds API — usar odds de API-Football. Distribución desigual (goleadas).',
  },
  {
    name: 'NB I',
    country: 'Hungary',
    division: 1,
    tier: 3,
    isActive: true,
    apiFootballId: 271,
    oddsApiSportKey: null,
    hasOddsApi: false,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-07-26'),
    seasonEnd: new Date('2026-05-30'),
    stats: {
      avgGoals1H: 1.2,
      over05_1H_pct: 0.8,
      over15_1H_pct: 0.35,
      avgCornersPerMatch: 9.0,
      avgShotsPerMatch: 21.0,
      bts1H_pct: 0.24,
      matchesPlayed: 190,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['17:00 CET', '19:30 CET'],
      timezone: 'Europe/Budapest',
      utcOffset: 1,
      windowA: false,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.0,
      correlationAdj: 0.02,
      cornersBaseline: 9.0,
      goalsBaseline: 1.2,
      shotsBaseline: 21.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Infravalora por casas = más value. Sin The Odds API — usar odds de API-Football.',
  },
  {
    name: 'Super League',
    country: 'Switzerland',
    division: 1,
    tier: 3,
    isActive: true,
    apiFootballId: 207,
    oddsApiSportKey: 'soccer_switzerland_superleague',
    hasOddsApi: true,
    season: '2025',
    seasonType: 'winter',
    seasonStart: new Date('2025-07-19'),
    seasonEnd: new Date('2026-05-21'),
    stats: {
      avgGoals1H: 1.25,
      over05_1H_pct: 0.79,
      over15_1H_pct: 0.34,
      avgCornersPerMatch: 9.1,
      avgShotsPerMatch: 22.0,
      bts1H_pct: 0.25,
      matchesPlayed: 180,
      lastUpdated: new Date('2026-03-23'),
    },
    schedule: {
      primaryDay: 'saturday',
      secondaryDay: 'sunday',
      typicalKickoffs: ['18:00 CET', '20:30 CET'],
      timezone: 'Europe/Zurich',
      utcOffset: 1,
      windowA: false,
      windowB: true,
    },
    modelConfig: {
      leagueBonus: 0.0,
      correlationAdj: 0.02,
      cornersBaseline: 9.1,
      goalsBaseline: 1.25,
      shotsBaseline: 22.0,
      bookmakerQuality: 'low',
    },
    notes:
      'Liga compacta, equipos atacantes. Young Boys y Basel inflan stats. Cobertura completa en Odds API.',
  },
]

async function seedBettingLeagues(db: any) {
  const collection = db.collection('betting_leagues')

  console.log(`\n⚽ Seeding ${LEAGUES_SEED_DATA.length} betting leagues...`)

  let inserted = 0
  let updated = 0

  for (const league of LEAGUES_SEED_DATA) {
    const result = await collection.updateOne(
      { apiFootballId: league.apiFootballId },
      {
        $set: {
          ...league,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )

    if (result.upsertedCount > 0) {
      inserted++
      console.log(`  ✓ Inserted: ${league.name} (${league.country})`)
    } else if (result.modifiedCount > 0) {
      updated++
      console.log(`  ↻ Updated: ${league.name} (${league.country})`)
    } else {
      console.log(`  - Unchanged: ${league.name} (${league.country})`)
    }
  }

  // Create indexes
  console.log('\nCreating indexes...')
  await collection.createIndex({ apiFootballId: 1 }, { unique: true })
  await collection.createIndex({ isActive: 1, tier: 1 })
  await collection.createIndex({ country: 1 })
  await collection.createIndex(
    { oddsApiSportKey: 1 },
    { sparse: true },
  )

  console.log('\n✅ Leagues seed completed!')
  console.log(`   Inserted: ${inserted}`)
  console.log(`   Updated: ${updated}`)
  console.log(`   Total leagues: ${LEAGUES_SEED_DATA.length}`)

  // Summary by tier
  const tierCounts = LEAGUES_SEED_DATA.reduce(
    (acc, l) => {
      acc[l.tier] = (acc[l.tier] || 0) + 1
      return acc
    },
    {} as Record<number, number>,
  )
  console.log('\n   By tier:')
  Object.entries(tierCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([tier, count]) => {
      console.log(`     Tier ${tier}: ${count} leagues`)
    })

  // Active vs inactive
  const activeCount = LEAGUES_SEED_DATA.filter((l) => l.isActive).length
  const inactiveCount = LEAGUES_SEED_DATA.filter((l) => !l.isActive).length
  console.log(`\n   Active: ${activeCount} | Inactive (summer): ${inactiveCount}`)
}

async function seedBettingSettings(db: any) {
  console.log('\n📊 Checking BettingSettings...')
  const settingsCollection = db.collection('betting_settings')

  const existing = await settingsCollection.findOne({})
  if (existing) {
    console.log('  ✓ BettingSettings already exists')
    console.log(`    - Bankroll: $${existing.bankroll}`)
    console.log(`    - Active: ${existing.isActive}`)
    return
  }

  const defaultSettings = {
    adminId: 'system',
    bankroll: 100,
    isActive: true,
    telegramAlertsOn: true,
    thresholds: {
      minEdge: 0.05,
      minComboEV: 0.05,
      minScore: 40,
      minGamesPlayed: 8,
    },
    stakes: {
      kellyFraction: 0.2,
      maxStakeIndividualPct: 0.03,
      maxStakeComboPct: 0.02,
      maxDailyExposurePct: 0.15,
      maxPicksPerDay: 5,
      maxCombosPerDay: 3,
    },
    antiTilt: {
      stopLossDailyPct: 0.1,
      maxConsecutiveLosses: 7,
    },
    cronSchedule: {
      nightlyAnalysis: '0 21 * * 5',
      preMatchCheck: '30 6 * * 6',
      resultCollection: '0 15 * * 6',
      leagueSync: '0 6 * * 1',
      statsUpdater: '30 8 * * 1',
    },
    activeLeagues: [],
    currentStreak: 0,
    maxWinStreak: 0,
    maxLoseStreak: 0,
    consecutiveLosses: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await settingsCollection.insertOne(defaultSettings)
  console.log('  ✓ Created default BettingSettings')
  console.log(`    - Bankroll: $${defaultSettings.bankroll}`)
  console.log(`    - Min Edge: ${defaultSettings.thresholds.minEdge * 100}%`)
  console.log(`    - Max Stake: ${defaultSettings.stakes.maxStakeIndividualPct * 100}%`)
}

async function main() {
  const mongoUri =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/futbolify'
  const client = new MongoClient(mongoUri)

  try {
    console.log('🚀 Betting System Seed Script')
    console.log('━'.repeat(40))
    console.log('Connecting to MongoDB...')
    await client.connect()
    const db = client.db()

    // Seed leagues
    await seedBettingLeagues(db)

    // Seed settings
    await seedBettingSettings(db)

    console.log('\n🎉 All done!')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nConnection closed.')
  }
}

main()
