# LIGAS OBJETIVO — SEED DATA COMPLETO
## Para colección betting_leagues en MongoDB
### Todas las ligas con IDs de APIs, stats, horarios y config del modelo

---

## CÓMO USAR ESTE DOCUMENTO

Este archivo es el seed data para la colección `betting_leagues`.
Cada entrada tiene TODO lo que el bot necesita para operar sobre esa liga:
- IDs de API-Football y sport keys de The Odds API
- Estadísticas actuales de la temporada (se actualizan automáticamente)
- Horarios típicos convertidos a hora El Salvador
- Configuración del modelo (bonuses, baselines, ajustes de correlación)

### DETECCIÓN AUTOMÁTICA DE TEMPORADA

El bot NO depende de fechas hardcodeadas. Usa el endpoint de API-Football:

```
GET /leagues?id={apiFootballId}&current=true
```

Response:
```json
{
  "response": [{
    "league": { "id": 88, "name": "Eredivisie" },
    "seasons": [{
      "year": 2025,
      "start": "2025-08-08",
      "end": "2026-05-17",
      "current": true,          // ← ESTO es lo que importa
      "coverage": {
        "fixtures": {
          "events": true,
          "lineups": true,
          "statistics_fixtures": true,  // ← stats por partido disponibles
          "statistics_players": true
        },
        "standings": true,
        "players": true,
        "top_scorers": true,
        "predictions": true,
        "odds": true              // ← odds disponibles
      }
    }]
  }]
}
```

### Cron job: league-sync (se ejecuta cada lunes a las 6:00 AM)

```python
def sync_leagues():
    """
    Sincroniza el estado de todas las ligas con API-Football.
    Detecta automáticamente qué temporadas están activas.
    """
    leagues = db.betting_leagues.find()
    
    for league in leagues:
        api_response = api_football.get(f"/leagues?id={league.apiFootballId}")
        
        seasons = api_response.response[0].seasons
        current_season = next((s for s in seasons if s.current), None)
        
        if current_season:
            # Liga activa — activar y actualizar datos de temporada
            db.betting_leagues.update_one(
                {"_id": league._id},
                {"$set": {
                    "isActive": True,
                    "season": str(current_season.year),
                    "seasonStart": current_season.start,
                    "seasonEnd": current_season.end,
                    "coverage": current_season.coverage,
                    "lastSynced": datetime.utcnow()
                }}
            )
        else:
            # No hay temporada activa — desactivar
            db.betting_leagues.update_one(
                {"_id": league._id},
                {"$set": {
                    "isActive": False,
                    "lastSynced": datetime.utcnow()
                }}
            )
    
    # Log
    active = db.betting_leagues.count_documents({"isActive": True})
    inactive = db.betting_leagues.count_documents({"isActive": False})
    print(f"League sync: {active} activas, {inactive} inactivas")
```

Esto significa que:
- Las ligas de verano (Eliteserien, Allsvenskan, etc.) se ACTIVAN SOLAS cuando la API detecta que arrancó su temporada
- Las ligas de invierno se DESACTIVAN SOLAS cuando termina su temporada en mayo
- Si una liga cambia de fechas, el bot se adapta sin intervención manual
- El campo `coverage` te dice si la liga tiene stats, odds, lineups — útil para saber qué features del modelo pueden usarse

Los campos `seasonStart`, `seasonEnd` y `isActive` del seed data son valores INICIALES que se sobreescriben automáticamente en el primer sync.
El campo `season` (año) también se actualiza automáticamente.

El cron `stats-updater` (semanal) debe actualizar el campo `stats` solo para ligas con `isActive: true`.

---

## TIER 1 — PRIORIDAD MÁXIMA

### 1. Eredivisie (Holanda)

```json
{
  "name": "Eredivisie",
  "country": "Netherlands",
  "division": 1,
  "tier": 1,
  "isActive": true,
  "apiFootballId": 88,
  "oddsApiSportKey": "soccer_netherlands_eredivisie",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-08",
  "seasonEnd": "2026-05-17",
  "stats": {
    "avgGoals1H": 1.40,
    "over05_1H_pct": 0.813,
    "over15_1H_pct": 0.418,
    "avgCornersPerMatch": 10.43,
    "avgShotsPerMatch": 25.8,
    "bts1H_pct": 0.276,
    "matchesPlayed": 225,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["16:45 CET", "18:45 CET", "20:00 CET"],
    "timezone": "Europe/Amsterdam",
    "utcOffset": 1,
    "windowA": true,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.02,
    "correlationAdj": 0.05,
    "cornersBaseline": 10.43,
    "goalsBaseline": 1.40,
    "shotsBaseline": 25.8,
    "bookmakerQuality": "medium"
  },
  "notes": "Liga #1 en corners (10.43/partido). PSV y Fortuna Sittard 96% Over 0.5 1H. Feyenoord lidera corners a favor (7.59). FC Twente es trampa (68% Over 0.5 1H)."
}
```

### 2. Bundesliga (Alemania)

```json
{
  "name": "Bundesliga",
  "country": "Germany",
  "division": 1,
  "tier": 1,
  "isActive": true,
  "apiFootballId": 78,
  "oddsApiSportKey": "soccer_germany_bundesliga",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-22",
  "seasonEnd": "2026-05-16",
  "stats": {
    "avgGoals1H": 1.35,
    "over05_1H_pct": 0.85,
    "over15_1H_pct": 0.43,
    "avgCornersPerMatch": 9.64,
    "avgShotsPerMatch": 26.2,
    "bts1H_pct": 0.30,
    "matchesPlayed": 234,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["15:30 CET", "18:30 CET"],
    "timezone": "Europe/Berlin",
    "utcOffset": 1,
    "windowA": true,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.02,
    "correlationAdj": 0.05,
    "cornersBaseline": 9.64,
    "goalsBaseline": 1.35,
    "shotsBaseline": 26.2,
    "bookmakerQuality": "high"
  },
  "notes": "Wolfsburg 11.34 corners/partido (máximo). Bayern 93 goles en temporada, 6.17 corners a favor. Eintracht Frankfurt más bajo en corners (8.54)."
}
```

### 3. Superligaen (Dinamarca)

```json
{
  "name": "Superligaen",
  "country": "Denmark",
  "division": 1,
  "tier": 1,
  "isActive": true,
  "apiFootballId": 119,
  "oddsApiSportKey": "soccer_denmark_superliga",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-07-18",
  "seasonEnd": "2026-05-28",
  "stats": {
    "avgGoals1H": 1.55,
    "over05_1H_pct": 0.87,
    "over15_1H_pct": 0.46,
    "avgCornersPerMatch": 9.60,
    "avgShotsPerMatch": 24.0,
    "bts1H_pct": 0.32,
    "matchesPlayed": 200,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["16:00 CET", "18:00 CET"],
    "timezone": "Europe/Copenhagen",
    "utcOffset": 1,
    "windowA": true,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.02,
    "correlationAdj": 0.04,
    "cornersBaseline": 9.60,
    "goalsBaseline": 1.55,
    "shotsBaseline": 24.0,
    "bookmakerQuality": "medium"
  },
  "notes": "#1 en avg goles 1H (1.55) entre ligas con odds. Liga small market = más ineficiencias en cuotas."
}
```

### 4. Süper Lig (Turquía)

```json
{
  "name": "Süper Lig",
  "country": "Turkey",
  "division": 1,
  "tier": 1,
  "isActive": true,
  "apiFootballId": 203,
  "oddsApiSportKey": "soccer_turkey_super_league",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-15",
  "seasonEnd": "2026-05-24",
  "stats": {
    "avgGoals1H": 1.28,
    "over05_1H_pct": 0.84,
    "over15_1H_pct": 0.40,
    "avgCornersPerMatch": 9.30,
    "avgShotsPerMatch": 23.5,
    "bts1H_pct": 0.28,
    "matchesPlayed": 240,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["16:00 TRT", "19:00 TRT"],
    "timezone": "Europe/Istanbul",
    "utcOffset": 3,
    "windowA": true,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.02,
    "correlationAdj": 0.03,
    "cornersBaseline": 9.30,
    "goalsBaseline": 1.28,
    "shotsBaseline": 23.5,
    "bookmakerQuality": "medium"
  },
  "notes": "Galatasaray, Fenerbahçe, Beşiktaş dominan stats. Liga puede ser volátil en derbis."
}
```

---

## TIER 2 — SEGUNDAS DIVISIONES (EL ORO REAL)

### 5. Championship (Inglaterra)

```json
{
  "name": "Championship",
  "country": "England",
  "division": 2,
  "tier": 2,
  "isActive": true,
  "apiFootballId": 40,
  "oddsApiSportKey": "soccer_efl_champ",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-09",
  "seasonEnd": "2026-05-03",
  "stats": {
    "avgGoals1H": 1.30,
    "over05_1H_pct": 0.80,
    "over15_1H_pct": 0.38,
    "avgCornersPerMatch": 9.80,
    "avgShotsPerMatch": 24.5,
    "bts1H_pct": 0.26,
    "matchesPlayed": 400,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "tuesday",
    "typicalKickoffs": ["15:00 GMT"],
    "timezone": "Europe/London",
    "utcOffset": 0,
    "windowA": true,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.01,
    "correlationAdj": 0.03,
    "cornersBaseline": 9.80,
    "goalsBaseline": 1.30,
    "shotsBaseline": 24.5,
    "bookmakerQuality": "low"
  },
  "notes": "46 partidos por equipo = máximo volumen. 2da div inglesa con cobertura completa. Cuotas peor modeladas que Premier."
}
```

### 6. 2. Bundesliga (Alemania)

```json
{
  "name": "2. Bundesliga",
  "country": "Germany",
  "division": 2,
  "tier": 2,
  "isActive": true,
  "apiFootballId": 79,
  "oddsApiSportKey": "soccer_germany_bundesliga2",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-01",
  "seasonEnd": "2026-05-17",
  "stats": {
    "avgGoals1H": 1.27,
    "over05_1H_pct": 0.70,
    "over15_1H_pct": 0.36,
    "avgCornersPerMatch": 9.20,
    "avgShotsPerMatch": 23.0,
    "bts1H_pct": 0.24,
    "matchesPlayed": 243,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "friday",
    "typicalKickoffs": ["13:00 CET", "20:30 CET"],
    "timezone": "Europe/Berlin",
    "utcOffset": 1,
    "windowA": false,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.01,
    "correlationAdj": 0.03,
    "cornersBaseline": 9.20,
    "goalsBaseline": 1.27,
    "shotsBaseline": 23.0,
    "bookmakerQuality": "low"
  },
  "notes": "Over 0.5 1H solo 70% — más selectivo que Bundesliga. Dato verificado Footiqo. Avg goles 1H decente (1.27)."
}
```

### 7. 3. Liga (Alemania) — LA JOYA

```json
{
  "name": "3. Liga",
  "country": "Germany",
  "division": 3,
  "tier": 2,
  "isActive": true,
  "apiFootballId": 80,
  "oddsApiSportKey": "soccer_germany_liga3",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-01",
  "seasonEnd": "2026-05-17",
  "stats": {
    "avgGoals1H": 1.25,
    "over05_1H_pct": 0.72,
    "over15_1H_pct": 0.34,
    "avgCornersPerMatch": 9.10,
    "avgShotsPerMatch": 22.5,
    "bts1H_pct": 0.23,
    "matchesPlayed": 280,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "wednesday",
    "typicalKickoffs": ["14:00 CET"],
    "timezone": "Europe/Berlin",
    "utcOffset": 1,
    "windowA": true,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.01,
    "correlationAdj": 0.02,
    "cornersBaseline": 9.10,
    "goalsBaseline": 1.25,
    "shotsBaseline": 22.5,
    "bookmakerQuality": "low"
  },
  "notes": "JOYA ABSOLUTA: 3ra división con cobertura COMPLETA en ambas APIs. Las casas casi no ponen recursos. Mayor edge potencial."
}
```

### 8. Superettan (Suecia)

```json
{
  "name": "Superettan",
  "country": "Sweden",
  "division": 2,
  "tier": 2,
  "isActive": false,
  "apiFootballId": 114,
  "oddsApiSportKey": "soccer_sweden_superettan",
  "hasOddsApi": true,
  "season": "2026",
  "seasonType": "summer",
  "seasonStart": "2026-04-05",
  "seasonEnd": "2026-11-08",
  "stats": {
    "avgGoals1H": 1.30,
    "over05_1H_pct": 0.78,
    "over15_1H_pct": 0.36,
    "avgCornersPerMatch": 9.00,
    "avgShotsPerMatch": 22.0,
    "bts1H_pct": 0.25,
    "matchesPlayed": 0,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "monday",
    "typicalKickoffs": ["15:00 CET", "17:30 CET"],
    "timezone": "Europe/Stockholm",
    "utcOffset": 1,
    "windowA": true,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.01,
    "correlationAdj": 0.02,
    "cornersBaseline": 9.00,
    "goalsBaseline": 1.30,
    "shotsBaseline": 22.0,
    "bookmakerQuality": "low"
  },
  "notes": "Temporada verano. Juego abierto, defensas vulnerables. Activar cuando arranque en abril 2026."
}
```

### 9. La Liga 2 (España)

```json
{
  "name": "La Liga 2",
  "country": "Spain",
  "division": 2,
  "tier": 2,
  "isActive": true,
  "apiFootballId": 141,
  "oddsApiSportKey": "soccer_spain_segunda_division",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-16",
  "seasonEnd": "2026-05-31",
  "stats": {
    "avgGoals1H": 1.10,
    "over05_1H_pct": 0.72,
    "over15_1H_pct": 0.30,
    "avgCornersPerMatch": 9.00,
    "avgShotsPerMatch": 22.5,
    "bts1H_pct": 0.22,
    "matchesPlayed": 320,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["16:00 CET", "18:30 CET", "21:00 CET"],
    "timezone": "Europe/Madrid",
    "utcOffset": 1,
    "windowA": true,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.01,
    "correlationAdj": 0.01,
    "cornersBaseline": 9.00,
    "goalsBaseline": 1.10,
    "shotsBaseline": 22.5,
    "bookmakerQuality": "low"
  },
  "notes": "Avg goles 1H bajo (1.10) pero cubierta completa. Más útil para corners que para goles 1H."
}
```

### 10. Ligue 2 (Francia)

```json
{
  "name": "Ligue 2",
  "country": "France",
  "division": 2,
  "tier": 2,
  "isActive": true,
  "apiFootballId": 62,
  "oddsApiSportKey": "soccer_france_ligue_two",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-16",
  "seasonEnd": "2026-05-16",
  "stats": {
    "avgGoals1H": 1.15,
    "over05_1H_pct": 0.74,
    "over15_1H_pct": 0.32,
    "avgCornersPerMatch": 9.00,
    "avgShotsPerMatch": 22.0,
    "bts1H_pct": 0.23,
    "matchesPlayed": 290,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "monday",
    "typicalKickoffs": ["19:00 CET"],
    "timezone": "Europe/Paris",
    "utcOffset": 1,
    "windowA": false,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.01,
    "correlationAdj": 0.01,
    "cornersBaseline": 9.00,
    "goalsBaseline": 1.15,
    "shotsBaseline": 22.0,
    "bookmakerQuality": "low"
  },
  "notes": "Similar a La Liga 2. Partidos típicamente de noche (19:00 CET = 11 AM SV). Ventana B."
}
```

### 11. Serie B (Italia)

```json
{
  "name": "Serie B",
  "country": "Italy",
  "division": 2,
  "tier": 2,
  "isActive": true,
  "apiFootballId": 136,
  "oddsApiSportKey": "soccer_italy_serie_b",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-16",
  "seasonEnd": "2026-05-09",
  "stats": {
    "avgGoals1H": 1.10,
    "over05_1H_pct": 0.71,
    "over15_1H_pct": 0.30,
    "avgCornersPerMatch": 9.00,
    "avgShotsPerMatch": 22.0,
    "bts1H_pct": 0.22,
    "matchesPlayed": 300,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["15:00 CET", "17:15 CET", "20:30 CET"],
    "timezone": "Europe/Rome",
    "utcOffset": 1,
    "windowA": true,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.01,
    "correlationAdj": 0.00,
    "cornersBaseline": 9.00,
    "goalsBaseline": 1.10,
    "shotsBaseline": 22.0,
    "bookmakerQuality": "low"
  },
  "notes": "Cultura defensiva italiana. Avg bajo pero cubierta completa. Correlación goles-corners baja."
}
```

### 12. Brazil Série B

```json
{
  "name": "Série B",
  "country": "Brazil",
  "division": 2,
  "tier": 2,
  "isActive": false,
  "apiFootballId": 72,
  "oddsApiSportKey": "soccer_brazil_serie_b",
  "hasOddsApi": true,
  "season": "2026",
  "seasonType": "summer",
  "seasonStart": "2026-04-19",
  "seasonEnd": "2026-11-22",
  "stats": {
    "avgGoals1H": 1.20,
    "over05_1H_pct": 0.76,
    "over15_1H_pct": 0.34,
    "avgCornersPerMatch": 8.80,
    "avgShotsPerMatch": 21.0,
    "bts1H_pct": 0.24,
    "matchesPlayed": 0,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "tuesday",
    "typicalKickoffs": ["16:00 BRT", "19:00 BRT", "21:30 BRT"],
    "timezone": "America/Sao_Paulo",
    "utcOffset": -3,
    "windowA": false,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.01,
    "correlationAdj": 0.02,
    "cornersBaseline": 8.80,
    "goalsBaseline": 1.20,
    "shotsBaseline": 21.0,
    "bookmakerQuality": "low"
  },
  "notes": "Temporada abril-noviembre. Errores defensivos comunes. Activar cuando arranque."
}
```

---

## TIER 3 — LIGAS DE VERANO + TERCERAS/CUARTAS DIVISIONES

### 13. Eliteserien (Noruega)

```json
{
  "name": "Eliteserien",
  "country": "Norway",
  "division": 1,
  "tier": 3,
  "isActive": false,
  "apiFootballId": 103,
  "oddsApiSportKey": "soccer_norway_eliteserien",
  "hasOddsApi": true,
  "season": "2026",
  "seasonType": "summer",
  "seasonStart": "2026-03-30",
  "seasonEnd": "2026-11-29",
  "stats": {
    "avgGoals1H": 1.25,
    "over05_1H_pct": 0.78,
    "over15_1H_pct": 0.35,
    "avgCornersPerMatch": 8.90,
    "avgShotsPerMatch": 22.0,
    "bts1H_pct": 0.25,
    "matchesPlayed": 0,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "sunday",
    "secondaryDay": "wednesday",
    "typicalKickoffs": ["17:00 CET", "19:00 CET"],
    "timezone": "Europe/Oslo",
    "utcOffset": 1,
    "windowA": false,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.00,
    "correlationAdj": 0.02,
    "cornersBaseline": 8.90,
    "goalsBaseline": 1.25,
    "shotsBaseline": 22.0,
    "bookmakerQuality": "low"
  },
  "notes": "Temporada verano. Cubre vacío cuando Europa para. Activar en abril."
}
```

### 14. Allsvenskan (Suecia)

```json
{
  "name": "Allsvenskan",
  "country": "Sweden",
  "division": 1,
  "tier": 3,
  "isActive": false,
  "apiFootballId": 113,
  "oddsApiSportKey": "soccer_sweden_allsvenskan",
  "hasOddsApi": true,
  "season": "2026",
  "seasonType": "summer",
  "seasonStart": "2026-04-05",
  "seasonEnd": "2026-11-08",
  "stats": {
    "avgGoals1H": 1.20,
    "over05_1H_pct": 0.76,
    "over15_1H_pct": 0.33,
    "avgCornersPerMatch": 9.00,
    "avgShotsPerMatch": 22.5,
    "bts1H_pct": 0.24,
    "matchesPlayed": 0,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["15:00 CET", "17:30 CET"],
    "timezone": "Europe/Stockholm",
    "utcOffset": 1,
    "windowA": true,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.00,
    "correlationAdj": 0.02,
    "cornersBaseline": 9.00,
    "goalsBaseline": 1.20,
    "shotsBaseline": 22.5,
    "bookmakerQuality": "low"
  },
  "notes": "Temporada verano. Activar en abril. Cae en Ventana A los sábados."
}
```

### 15. Veikkausliiga (Finlandia)

```json
{
  "name": "Veikkausliiga",
  "country": "Finland",
  "division": 1,
  "tier": 3,
  "isActive": false,
  "apiFootballId": 244,
  "oddsApiSportKey": "soccer_finland_veikkausliiga",
  "hasOddsApi": true,
  "season": "2026",
  "seasonType": "summer",
  "seasonStart": "2026-04-11",
  "seasonEnd": "2026-10-25",
  "stats": {
    "avgGoals1H": 1.30,
    "over05_1H_pct": 0.80,
    "over15_1H_pct": 0.38,
    "avgCornersPerMatch": 9.10,
    "avgShotsPerMatch": 22.0,
    "bts1H_pct": 0.26,
    "matchesPlayed": 0,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "tuesday",
    "typicalKickoffs": ["17:00 EEST"],
    "timezone": "Europe/Helsinki",
    "utcOffset": 2,
    "windowA": true,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.00,
    "correlationAdj": 0.02,
    "cornersBaseline": 9.10,
    "goalsBaseline": 1.30,
    "shotsBaseline": 22.0,
    "bookmakerQuality": "low"
  },
  "notes": "Temporada verano. Liga con buenas stats pero muestra chica. Activar en abril."
}
```

### 16. League One (Inglaterra)

```json
{
  "name": "League One",
  "country": "England",
  "division": 3,
  "tier": 3,
  "isActive": true,
  "apiFootballId": 41,
  "oddsApiSportKey": "soccer_england_league1",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-09",
  "seasonEnd": "2026-05-03",
  "stats": {
    "avgGoals1H": 1.16,
    "over05_1H_pct": 0.71,
    "over15_1H_pct": 0.31,
    "avgCornersPerMatch": 9.00,
    "avgShotsPerMatch": 21.5,
    "bts1H_pct": 0.22,
    "matchesPlayed": 460,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "tuesday",
    "typicalKickoffs": ["15:00 GMT"],
    "timezone": "Europe/London",
    "utcOffset": 0,
    "windowA": true,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.00,
    "correlationAdj": 0.01,
    "cornersBaseline": 9.00,
    "goalsBaseline": 1.16,
    "shotsBaseline": 21.5,
    "bookmakerQuality": "low"
  },
  "notes": "3ra div inglesa. Dato Footiqo verificado: 1.16 avg 1H, 71% Over 0.5. Volumen alto (460 partidos)."
}
```

### 17. League Two (Inglaterra)

```json
{
  "name": "League Two",
  "country": "England",
  "division": 4,
  "tier": 3,
  "isActive": true,
  "apiFootballId": 42,
  "oddsApiSportKey": "soccer_england_league2",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-09",
  "seasonEnd": "2026-05-03",
  "stats": {
    "avgGoals1H": 1.14,
    "over05_1H_pct": 0.67,
    "over15_1H_pct": 0.33,
    "avgCornersPerMatch": 8.80,
    "avgShotsPerMatch": 20.5,
    "bts1H_pct": 0.20,
    "matchesPlayed": 463,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "tuesday",
    "typicalKickoffs": ["15:00 GMT"],
    "timezone": "Europe/London",
    "utcOffset": 0,
    "windowA": true,
    "windowB": false
  },
  "modelConfig": {
    "leagueBonus": 0.00,
    "correlationAdj": 0.01,
    "cornersBaseline": 8.80,
    "goalsBaseline": 1.14,
    "shotsBaseline": 20.5,
    "bookmakerQuality": "low"
  },
  "notes": "4ta div inglesa. Over 0.5 1H solo 67% — más bajo. Pero cuotas MÁS desfasadas que cualquier otra liga."
}
```

---

## TIER 4 — PRIMERAS DIVISIONES PRINCIPALES (poco value, alto volumen)

### 18. Premier League (Inglaterra)

```json
{
  "name": "Premier League",
  "country": "England",
  "division": 1,
  "tier": 4,
  "isActive": true,
  "apiFootballId": 39,
  "oddsApiSportKey": "soccer_epl",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-16",
  "seasonEnd": "2026-05-24",
  "stats": {
    "avgGoals1H": 1.30,
    "over05_1H_pct": 0.78,
    "over15_1H_pct": 0.36,
    "avgCornersPerMatch": 9.85,
    "avgShotsPerMatch": 25.0,
    "bts1H_pct": 0.27,
    "matchesPlayed": 290,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["15:00 GMT", "17:30 GMT"],
    "timezone": "Europe/London",
    "utcOffset": 0,
    "windowA": true,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": -0.01,
    "correlationAdj": 0.03,
    "cornersBaseline": 9.85,
    "goalsBaseline": 1.30,
    "shotsBaseline": 25.0,
    "bookmakerQuality": "high"
  },
  "notes": "Cuotas perfectamente modeladas. Poco value. Solo apostar cuando filtros son EXCEPCIONALES. West Ham 11.57 crn, Newcastle 6.5 crn a favor."
}
```

### 19. La Liga (España)

```json
{
  "name": "La Liga",
  "country": "Spain",
  "division": 1,
  "tier": 4,
  "isActive": true,
  "apiFootballId": 140,
  "oddsApiSportKey": "soccer_spain_la_liga",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-16",
  "seasonEnd": "2026-05-24",
  "stats": {
    "avgGoals1H": 1.20,
    "over05_1H_pct": 0.78,
    "over15_1H_pct": 0.33,
    "avgCornersPerMatch": 9.40,
    "avgShotsPerMatch": 24.0,
    "bts1H_pct": 0.25,
    "matchesPlayed": 280,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["16:15 CET", "18:30 CET", "21:00 CET"],
    "timezone": "Europe/Madrid",
    "utcOffset": 1,
    "windowA": true,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": -0.01,
    "correlationAdj": 0.01,
    "cornersBaseline": 9.40,
    "goalsBaseline": 1.20,
    "shotsBaseline": 24.0,
    "bookmakerQuality": "high"
  },
  "notes": "Variable (70-82% Over 0.5 1H). Equipos como Getafe/Leganés destruyen la estadística. Solo matchups top."
}
```

### 20. Serie A (Italia)

```json
{
  "name": "Serie A",
  "country": "Italy",
  "division": 1,
  "tier": 4,
  "isActive": true,
  "apiFootballId": 135,
  "oddsApiSportKey": "soccer_italy_serie_a",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-17",
  "seasonEnd": "2026-05-24",
  "stats": {
    "avgGoals1H": 1.15,
    "over05_1H_pct": 0.74,
    "over15_1H_pct": 0.30,
    "avgCornersPerMatch": 9.50,
    "avgShotsPerMatch": 24.5,
    "bts1H_pct": 0.23,
    "matchesPlayed": 280,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["15:00 CET", "18:00 CET", "20:45 CET"],
    "timezone": "Europe/Rome",
    "utcOffset": 1,
    "windowA": true,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": -0.01,
    "correlationAdj": -0.05,
    "cornersBaseline": 9.50,
    "goalsBaseline": 1.15,
    "shotsBaseline": 24.5,
    "bookmakerQuality": "high"
  },
  "notes": "Cultura defensiva. correlationAdj NEGATIVO porque defensas italianas rompen la correlación goles-corners. Muchos 0-0 al descanso."
}
```

### 21. Ligue 1 (Francia)

```json
{
  "name": "Ligue 1",
  "country": "France",
  "division": 1,
  "tier": 4,
  "isActive": true,
  "apiFootballId": 61,
  "oddsApiSportKey": "soccer_france_ligue_one",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-08-09",
  "seasonEnd": "2026-05-24",
  "stats": {
    "avgGoals1H": 1.18,
    "over05_1H_pct": 0.76,
    "over15_1H_pct": 0.31,
    "avgCornersPerMatch": 9.32,
    "avgShotsPerMatch": 23.5,
    "bts1H_pct": 0.24,
    "matchesPlayed": 270,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["17:00 CET", "21:00 CET"],
    "timezone": "Europe/Paris",
    "utcOffset": 1,
    "windowA": false,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": -0.01,
    "correlationAdj": -0.02,
    "cornersBaseline": 9.32,
    "goalsBaseline": 1.18,
    "shotsBaseline": 23.5,
    "bookmakerQuality": "high"
  },
  "notes": "Nice 10.74 crn/partido, Lens 5.85 crn a favor. Sin PSG la liga baja mucho. Partidos tarde (Ventana B)."
}
```

---

## LIGAS CON COBERTURA PARCIAL (solo API-Football odds)

### 22. 1.NL Croacia

```json
{
  "name": "1. HNL",
  "country": "Croatia",
  "division": 1,
  "tier": 3,
  "isActive": true,
  "apiFootballId": 210,
  "oddsApiSportKey": null,
  "hasOddsApi": false,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-07-19",
  "seasonEnd": "2026-05-30",
  "stats": {
    "avgGoals1H": 1.54,
    "over05_1H_pct": 0.82,
    "over15_1H_pct": 0.42,
    "avgCornersPerMatch": 9.20,
    "avgShotsPerMatch": 22.0,
    "bts1H_pct": 0.28,
    "matchesPlayed": 200,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["17:00 CET", "19:15 CET"],
    "timezone": "Europe/Zagreb",
    "utcOffset": 1,
    "windowA": false,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.00,
    "correlationAdj": 0.03,
    "cornersBaseline": 9.20,
    "goalsBaseline": 1.54,
    "shotsBaseline": 22.0,
    "bookmakerQuality": "low"
  },
  "notes": "SORPRESA: 1.54 avg goles 1H. Sin The Odds API — usar odds de API-Football. Distribución desigual (goleadas)."
}
```

### 23. NB I (Hungría)

```json
{
  "name": "NB I",
  "country": "Hungary",
  "division": 1,
  "tier": 3,
  "isActive": true,
  "apiFootballId": 271,
  "oddsApiSportKey": null,
  "hasOddsApi": false,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-07-26",
  "seasonEnd": "2026-05-30",
  "stats": {
    "avgGoals1H": 1.20,
    "over05_1H_pct": 0.80,
    "over15_1H_pct": 0.35,
    "avgCornersPerMatch": 9.00,
    "avgShotsPerMatch": 21.0,
    "bts1H_pct": 0.24,
    "matchesPlayed": 190,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["17:00 CET", "19:30 CET"],
    "timezone": "Europe/Budapest",
    "utcOffset": 1,
    "windowA": false,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.00,
    "correlationAdj": 0.02,
    "cornersBaseline": 9.00,
    "goalsBaseline": 1.20,
    "shotsBaseline": 21.0,
    "bookmakerQuality": "low"
  },
  "notes": "Infravalora por casas = más value. Sin The Odds API — usar odds de API-Football."
}
```

### 24. Swiss Super League

```json
{
  "name": "Super League",
  "country": "Switzerland",
  "division": 1,
  "tier": 3,
  "isActive": true,
  "apiFootballId": 207,
  "oddsApiSportKey": "soccer_switzerland_superleague",
  "hasOddsApi": true,
  "season": "2025",
  "seasonType": "winter",
  "seasonStart": "2025-07-19",
  "seasonEnd": "2026-05-21",
  "stats": {
    "avgGoals1H": 1.25,
    "over05_1H_pct": 0.79,
    "over15_1H_pct": 0.34,
    "avgCornersPerMatch": 9.10,
    "avgShotsPerMatch": 22.0,
    "bts1H_pct": 0.25,
    "matchesPlayed": 180,
    "lastUpdated": "2026-03-23"
  },
  "schedule": {
    "primaryDay": "saturday",
    "secondaryDay": "sunday",
    "typicalKickoffs": ["18:00 CET", "20:30 CET"],
    "timezone": "Europe/Zurich",
    "utcOffset": 1,
    "windowA": false,
    "windowB": true
  },
  "modelConfig": {
    "leagueBonus": 0.00,
    "correlationAdj": 0.02,
    "cornersBaseline": 9.10,
    "goalsBaseline": 1.25,
    "shotsBaseline": 22.0,
    "bookmakerQuality": "low"
  },
  "notes": "Liga compacta, equipos atacantes. Young Boys y Basel inflan stats. Cobertura completa en Odds API."
}
```

---

## RESUMEN DE 24 LIGAS

| # | Liga | País | Div | Tier | API-Football ID | Odds API Key | hasOddsApi | Activa |
|---|------|------|-----|------|----------------|-------------|-----------|--------|
| 1 | Eredivisie | Netherlands | 1 | 1 | 88 | soccer_netherlands_eredivisie | ✓ | ✓ |
| 2 | Bundesliga | Germany | 1 | 1 | 78 | soccer_germany_bundesliga | ✓ | ✓ |
| 3 | Superligaen | Denmark | 1 | 1 | 119 | soccer_denmark_superliga | ✓ | ✓ |
| 4 | Süper Lig | Turkey | 1 | 1 | 203 | soccer_turkey_super_league | ✓ | ✓ |
| 5 | Championship | England | 2 | 2 | 40 | soccer_efl_champ | ✓ | ✓ |
| 6 | 2. Bundesliga | Germany | 2 | 2 | 79 | soccer_germany_bundesliga2 | ✓ | ✓ |
| 7 | 3. Liga | Germany | 3 | 2 | 80 | soccer_germany_liga3 | ✓ | ✓ |
| 8 | Superettan | Sweden | 2 | 2 | 114 | soccer_sweden_superettan | ✓ | ✗ (verano) |
| 9 | La Liga 2 | Spain | 2 | 2 | 141 | soccer_spain_segunda_division | ✓ | ✓ |
| 10 | Ligue 2 | France | 2 | 2 | 62 | soccer_france_ligue_two | ✓ | ✓ |
| 11 | Serie B | Italy | 2 | 2 | 136 | soccer_italy_serie_b | ✓ | ✓ |
| 12 | Série B | Brazil | 2 | 2 | 72 | soccer_brazil_serie_b | ✓ | ✗ (verano) |
| 13 | Eliteserien | Norway | 1 | 3 | 103 | soccer_norway_eliteserien | ✓ | ✗ (verano) |
| 14 | Allsvenskan | Sweden | 1 | 3 | 113 | soccer_sweden_allsvenskan | ✓ | ✗ (verano) |
| 15 | Veikkausliiga | Finland | 1 | 3 | 244 | soccer_finland_veikkausliiga | ✓ | ✗ (verano) |
| 16 | League One | England | 3 | 3 | 41 | soccer_england_league1 | ✓ | ✓ |
| 17 | League Two | England | 4 | 3 | 42 | soccer_england_league2 | ✓ | ✓ |
| 18 | Premier League | England | 1 | 4 | 39 | soccer_epl | ✓ | ✓ |
| 19 | La Liga | Spain | 1 | 4 | 140 | soccer_spain_la_liga | ✓ | ✓ |
| 20 | Serie A | Italy | 1 | 4 | 135 | soccer_italy_serie_a | ✓ | ✓ |
| 21 | Ligue 1 | France | 1 | 4 | 61 | soccer_france_ligue_one | ✓ | ✓ |
| 22 | 1. HNL | Croatia | 1 | 3 | 210 | — | ✗ | ✓ |
| 23 | NB I | Hungary | 1 | 3 | 271 | — | ✗ | ✓ |
| 24 | Super League | Switzerland | 1 | 3 | 207 | soccer_switzerland_superleague | ✓ | ✓ |

**Ligas activas ahora (marzo 2026): 19**
**Ligas de verano (se activan abril-mayo): 5** (Superettan, Série B Brazil, Eliteserien, Allsvenskan, Veikkausliiga)

---

*Seed data generado el 23 de marzo de 2026.*
*Stats basados en datos verificados de SoccerStats, APWin, FootyStats, Footiqo y Over25Tips.*
*El campo stats debe actualizarse semanalmente via cron job.*
*El campo modelConfig se calibra manualmente después de backtesting.*
