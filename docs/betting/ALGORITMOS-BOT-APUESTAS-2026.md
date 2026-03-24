# ALGORITMOS Y LÓGICA DEL BOT
## Especificación Técnica Detallada — El Cerebro del Sistema
### Documento complementario al Documento Maestro — Marzo 2026

---

# ÍNDICE

1. ARQUITECTURA DEL SISTEMA DE DECISIÓN
2. ALGORITMO DE SCORING — GOLES PRIMERA MITAD
3. ALGORITMO DE SCORING — CORNERS
4. ALGORITMO DE VALUE DETECTION
5. ALGORITMO DE COMBINADAS INTELIGENTES
6. SISTEMA DE CONFIANZA Y STAKE SIZING
7. ALGORITMO DE STEAM MOVES
8. CLV TRACKER — VALIDACIÓN DEL SISTEMA
9. FILTROS Y REGLAS DE NEGOCIO
10. PSEUDOCÓDIGO COMPLETO DEL BOT
11. DATOS REQUERIDOS POR ENDPOINT

---

# 1. ARQUITECTURA DEL SISTEMA DE DECISIÓN

## 1.1 Flujo de decisión (resumen)

```
FIXTURES DEL DÍA
      ↓
FILTRO DE LIGA (solo Tier 1-2)
      ↓
OBTENER STATS DE EQUIPOS
      ↓
┌─────────────────────┐   ┌─────────────────────┐
│  SCORING GOLES 1H   │   │  SCORING CORNERS     │
│  (calcular prob)     │   │  (calcular prob)     │
└─────────┬───────────┘   └─────────┬───────────┘
          ↓                         ↓
┌─────────────────────┐   ┌─────────────────────┐
│  VALUE DETECTION     │   │  VALUE DETECTION     │
│  (prob vs cuota)     │   │  (prob vs línea)     │
└─────────┬───────────┘   └─────────┬───────────┘
          ↓                         ↓
          └────────┬────────────────┘
                   ↓
         GENERADOR DE COMBINADAS
                   ↓
         SISTEMA DE CONFIANZA
                   ↓
         STEAM MOVE CHECK
                   ↓
              ALERTAR
```

## 1.2 Tipos de output del bot

El bot genera 3 tipos de recomendaciones:

| Tipo | Descripción | Stake |
|------|-------------|-------|
| PICK INDIVIDUAL | Un solo mercado, un solo partido | 1-2% bankroll |
| COMBO CORRELACIONADO | 2 mercados del mismo partido | 1% bankroll |
| COMBO CROSS | 2-3 picks de diferentes partidos | 0.5-1% bankroll |

---

# 2. ALGORITMO DE SCORING — GOLES PRIMERA MITAD

## 2.1 Variables de entrada

Para cada partido, el bot necesita estos datos de AMBOS equipos:

```
team_a = {
  over05_1h_pct: float,    // % partidos con Over 0.5 1H (temporada)
  avg_goals_1h: float,     // promedio goles anotados en 1H
  avg_conceded_1h: float,  // promedio goles recibidos en 1H
  bts_1h_pct: float,       // % partidos con BTS en 1H
  form_goals_1h: int,      // de últimos 5 partidos, cuántos con gol en 1H
  is_home: boolean,        // si juega de local
  home_over05_1h: float,   // % Over 0.5 1H cuando juega en casa
  away_over05_1h: float,   // % Over 0.5 1H cuando juega fuera
}
team_b = { ...mismo... }
h2h = {
  last_5_goals_1h: int,    // de últimos 5 H2H, cuántos tuvieron gol en 1H
  avg_goals_1h: float,     // promedio goles 1H en últimos 5 H2H
}
```

## 2.2 Cálculo de probabilidad base

### Over 0.5 Primera Mitad

```python
# PASO 1: Probabilidad base (promedio de ambos equipos ajustado por localía)
if team_a.is_home:
    prob_a = team_a.home_over05_1h
    prob_b = team_b.away_over05_1h
else:
    prob_a = team_a.away_over05_1h
    prob_b = team_b.home_over05_1h

prob_base = (prob_a + prob_b) / 2

# PASO 2: Ajuste por forma reciente (peso: 15%)
form_score = (team_a.form_goals_1h + team_b.form_goals_1h) / 10  # 0.0 a 1.0
form_adjustment = (form_score - 0.6) * 0.15  # si forma > 0.6, sube; si < 0.6, baja

# PASO 3: Ajuste por H2H (peso: 10%)
h2h_score = h2h.last_5_goals_1h / 5  # 0.0 a 1.0
h2h_adjustment = (h2h_score - 0.7) * 0.10  # si H2H > 0.7, sube

# PASO 4: Ajuste por liga (peso: 5%)
league_adjustment = get_league_bonus(league_id)
# Tier 1: +0.02, Tier 2: +0.01, Tier 3: 0, Tier 4: -0.01

# PROBABILIDAD FINAL
prob_over05_1h = prob_base + form_adjustment + h2h_adjustment + league_adjustment

# Clamp entre 0.50 y 0.99
prob_over05_1h = max(0.50, min(0.99, prob_over05_1h))
```

### Over 1.5 Primera Mitad

```python
# Probabilidad base: usar avg de goles 1H con modelo Poisson simplificado
expected_goals_1h = team_a.avg_goals_1h + team_b.avg_conceded_1h  # lambda equipo A
                  + team_b.avg_goals_1h + team_a.avg_conceded_1h  # lambda equipo B
expected_goals_1h = expected_goals_1h / 2  # ajustar por doble conteo

# Poisson: P(X >= 2) = 1 - P(X=0) - P(X=1)
import math
lam = expected_goals_1h
p_0 = math.exp(-lam)
p_1 = lam * math.exp(-lam)
prob_over15_1h = 1 - p_0 - p_1

# Ajustes de forma y H2H (mismo método, peso reducido: 10% y 5%)
form_adj = (form_score - 0.6) * 0.10
h2h_adj = (h2h_score - 0.7) * 0.05

prob_over15_1h = prob_over15_1h + form_adj + h2h_adj

# Solo recomendar si BTS 1H > 25% (ambos equipos atacan)
if (team_a.bts_1h_pct + team_b.bts_1h_pct) / 2 < 0.25:
    prob_over15_1h = 0  # descartar, no hay suficiente ataque bilateral
```

## 2.3 Tabla de pesos por variable

| Variable | Peso en Over 0.5 1H | Peso en Over 1.5 1H | Justificación |
|----------|---------------------|---------------------|---------------|
| Over 0.5 1H % (localía) | 70% | 40% | La base más confiable para 0.5 |
| Avg goles 1H (Poisson) | 0% | 35% | Poisson necesita lambda, no % |
| Forma reciente (5 partidos) | 15% | 10% | Captura momentum actual |
| H2H goles 1H | 10% | 5% | Patrón histórico del matchup |
| Liga (tier bonus) | 5% | 5% | Ajuste contextual |
| BTS 1H % | 0% (no aplica) | 5% + filtro | Filtro obligatorio para Over 1.5 |

## 2.4 Umbrales de decisión

| Métrica | Umbral mínimo | Acción |
|---------|--------------|--------|
| prob_over05_1h | > 0.78 | Candidato |
| prob_over05_1h | > 0.85 | Candidato fuerte |
| prob_over15_1h | > 0.40 | Candidato |
| prob_over15_1h | > 0.50 | Candidato fuerte |
| Mínimo partidos jugados por equipo | >= 8 | Debajo de 8, muestra insuficiente |

---

# 3. ALGORITMO DE SCORING — CORNERS

## 3.1 Variables de entrada

```
team_a = {
  avg_corners_for: float,      // corners a favor por partido
  avg_corners_against: float,  // corners en contra por partido
  avg_corners_total: float,    // corners totales en sus partidos
  avg_shots: float,            // tiros por partido
  avg_possession: float,       // posesión % promedio
  form_corners_5: float,       // avg corners totales últimos 5 partidos
  is_home: boolean,
  home_corners_total: float,   // avg corners totales en partidos de local
  away_corners_total: float,   // avg corners totales en partidos visitante
}
team_b = { ...mismo... }
h2h = {
  avg_corners: float,          // promedio corners en últimos 5 H2H
  over95_count: int,           // de últimos 5, cuántos tuvieron Over 9.5
}
```

## 3.2 Cálculo de corners esperados

```python
# PASO 1: Corners esperados base
# Método: Cruzar corners a favor de A con corners en contra de B, y viceversa
corners_a_expected = (team_a.avg_corners_for + team_b.avg_corners_against) / 2
corners_b_expected = (team_b.avg_corners_for + team_a.avg_corners_against) / 2
corners_total_expected = corners_a_expected + corners_b_expected

# PASO 2: Ajuste por localía (peso: 10%)
if team_a.is_home:
    home_factor = team_a.home_corners_total / team_a.avg_corners_total
    away_factor = team_b.away_corners_total / team_b.avg_corners_total
else:
    home_factor = team_b.home_corners_total / team_b.avg_corners_total
    away_factor = team_a.away_corners_total / team_a.avg_corners_total

locality_adj = ((home_factor + away_factor) / 2 - 1.0) * corners_total_expected * 0.10

# PASO 3: Ajuste por forma reciente (peso: 15%)
avg_form = (team_a.form_corners_5 + team_b.form_corners_5) / 2
league_avg_corners = get_league_avg_corners(league_id)
form_adj = (avg_form - league_avg_corners) * 0.15

# PASO 4: Ajuste por tiros (peso: 10%)
# Tiros correlacionan con corners: más tiros = más chances de corner
combined_shots = team_a.avg_shots + team_b.avg_shots
shots_baseline = 24  # promedio de tiros combinados en ligas europeas
shots_adj = (combined_shots - shots_baseline) / shots_baseline * corners_total_expected * 0.10

# PASO 5: Ajuste por H2H (peso: 10%)
if h2h.avg_corners > 0:
    h2h_adj = (h2h.avg_corners - corners_total_expected) * 0.10
else:
    h2h_adj = 0

# CORNERS ESPERADOS FINAL
corners_final = corners_total_expected + locality_adj + form_adj + shots_adj + h2h_adj

# Clamp: mínimo 6, máximo 16
corners_final = max(6.0, min(16.0, corners_final))
```

## 3.3 Convertir corners esperados a probabilidad Over/Under

```python
# Usar distribución de Poisson para calcular probabilidad de Over X.5

def prob_over(line, expected):
    """Calcula P(corners >= line + 1) usando Poisson"""
    import math
    threshold = int(line + 0.5)  # Over 9.5 → necesita >= 10
    prob_under = 0
    for k in range(threshold):
        prob_under += (expected ** k * math.exp(-expected)) / math.factorial(k)
    return 1 - prob_under

# Ejemplo: corners_final = 10.5, línea Over 9.5
prob_over_95 = prob_over(9.5, corners_final)  # ~0.58

# Ejemplo: corners_final = 10.5, línea Over 10.5
prob_over_105 = prob_over(10.5, corners_final)  # ~0.49

# El bot calcula para TODAS las líneas disponibles:
lines = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]
for line in lines:
    prob = prob_over(line, corners_final)
    # pasar a value detection...
```

## 3.4 Corners primera mitad

```python
# Regla empírica: ~44% de corners totales caen en primera mitad
corners_1h_expected = corners_final * 0.44

# Calcular Over 4.5 corners 1H
prob_over_45_1h = prob_over(4.5, corners_1h_expected)
```

## 3.5 Asian Corners Handicap

```python
# Asian corners handicap = corners esperados equipo A - corners esperados equipo B
handicap_line = corners_a_expected - corners_b_expected

# Si la casa ofrece handicap -1.5 para equipo A:
# Necesitamos P(corners_A - corners_B >= 2)
# Simplificación: usar diferencia esperada vs línea
edge = handicap_line - (-1.5)  # si handicap_line = 2.0, edge = 3.5
# Si edge > 0.8, hay value
```

## 3.6 Tabla de pesos por variable — Corners

| Variable | Peso | Justificación |
|----------|------|---------------|
| Corners a favor vs en contra (cruzado) | 55% | La base más sólida |
| Forma reciente (5 partidos) | 15% | Momentum táctico |
| Localía | 10% | Locales sacan más corners |
| Tiros por partido | 10% | Correlación directa con corners |
| H2H corners | 10% | Patrón del matchup |

---

# 4. ALGORITMO DE VALUE DETECTION

## 4.1 Cálculo de value para mercados de goles 1H

```python
def detect_value_goals(prob_own, odds_decimal):
    """
    prob_own: probabilidad calculada por nuestro modelo (0.0 a 1.0)
    odds_decimal: cuota decimal de la casa (ej: 1.20)
    
    Retorna: (has_value: bool, edge: float, confidence: str)
    """
    # Probabilidad implícita de la cuota
    prob_implied = 1 / odds_decimal
    
    # Edge = diferencia entre nuestra prob y la implícita
    edge = prob_own - prob_implied
    
    # Clasificación
    if edge >= 0.10:
        return (True, edge, "ALTA")      # 10%+ edge → apuesta fuerte
    elif edge >= 0.05:
        return (True, edge, "MEDIA")     # 5-10% edge → apuesta normal
    elif edge >= 0.02:
        return (True, edge, "BAJA")      # 2-5% edge → solo en combinadas
    else:
        return (False, edge, "SIN VALUE")  # < 2% → skip
```

## 4.2 Cálculo de value para mercados de corners

```python
def detect_value_corners(corners_expected, line, odds_over, odds_under):
    """
    corners_expected: corners totales esperados por nuestro modelo
    line: línea del mercado (ej: 9.5)
    odds_over: cuota del Over
    odds_under: cuota del Under
    
    Retorna: (direction: str, edge: float, confidence: str)
    """
    prob_over_own = prob_over(line, corners_expected)
    prob_under_own = 1 - prob_over_own
    
    # Value en Over
    prob_implied_over = 1 / odds_over
    edge_over = prob_over_own - prob_implied_over
    
    # Value en Under
    prob_implied_under = 1 / odds_under
    edge_under = prob_under_own - prob_implied_under
    
    # Elegir dirección con más edge
    if edge_over > edge_under and edge_over >= 0.05:
        return ("OVER", edge_over, classify_confidence(edge_over))
    elif edge_under > edge_over and edge_under >= 0.05:
        return ("UNDER", edge_under, classify_confidence(edge_under))
    else:
        return ("SKIP", 0, "SIN VALUE")

def classify_confidence(edge):
    if edge >= 0.10: return "ALTA"
    elif edge >= 0.05: return "MEDIA"
    elif edge >= 0.02: return "BAJA"
    else: return "SIN VALUE"
```

## 4.3 Multi-bookmaker comparison

```python
def find_best_odds(fixture_id, market, direction):
    """
    Compara cuotas de múltiples casas para encontrar la mejor.
    
    fixture_id: ID del partido
    market: "over_05_1h", "over_15_1h", "over_95_corners", etc.
    direction: "OVER" o "UNDER"
    """
    # Obtener cuotas de The Odds API (múltiples bookmakers)
    odds_data = odds_api.get(sport_key, markets=market)
    
    best_odds = 0
    best_bookmaker = None
    
    for bookmaker in odds_data.bookmakers:
        for market_data in bookmaker.markets:
            for outcome in market_data.outcomes:
                if outcome.name == direction and outcome.price > best_odds:
                    best_odds = outcome.price
                    best_bookmaker = bookmaker.key
    
    # Pinnacle como referencia sharp
    pinnacle_odds = get_pinnacle_odds(fixture_id, market, direction)
    
    return {
        "best_odds": best_odds,
        "best_bookmaker": best_bookmaker,
        "pinnacle_odds": pinnacle_odds,
        "edge_vs_pinnacle": (1/pinnacle_odds) - (1/best_odds)
        # Si edge_vs_pinnacle > 0, la cuota del bookmaker es más generosa
        # que la del sharp book → hay value adicional
    }
```

## 4.4 Tabla de decisión final

| prob_own | edge vs cuota | Confianza | Acción |
|----------|--------------|-----------|--------|
| > 0.85 | > 10% | ALTA | APOSTAR (2-3% bankroll) |
| > 0.80 | > 5% | MEDIA | APOSTAR (1-2% bankroll) |
| > 0.75 | > 5% | MEDIA | APOSTAR (1% bankroll) |
| > 0.75 | 2-5% | BAJA | Solo en COMBINADAS |
| < 0.75 | cualquier | — | SKIP |
| cualquier | < 2% | — | SKIP |

---

# 5. ALGORITMO DE COMBINADAS INTELIGENTES

## 5.1 Detección de Combo Tipo 1 (mismo partido, correlacionado)

```python
def detect_combo_same_match(fixture):
    """
    Busca si el mismo partido tiene value en goles 1H Y corners.
    Si ambos tienen value, es Combo Tipo 1 (correlación positiva).
    """
    goals_result = score_goals_1h(fixture)
    corners_result = score_corners(fixture)
    
    goals_value = detect_value_goals(
        goals_result.prob, 
        goals_result.best_odds
    )
    corners_value = detect_value_corners(
        corners_result.expected,
        corners_result.best_line,
        corners_result.odds_over,
        corners_result.odds_under
    )
    
    # Combo Tipo 1: ambos tienen value >= 2%
    if goals_value.has_value and corners_value.direction != "SKIP":
        
        # BONUS DE CORRELACIÓN
        # Goles y corners están positivamente correlacionados
        # La probabilidad conjunta REAL es mayor que el producto
        # Factor de correlación empírico: 1.08 (conservador)
        correlation_bonus = 1.08
        
        combined_odds = goals_result.best_odds * corners_result.best_odds_selected
        
        # Probabilidad conjunta SIN correlación
        prob_independent = goals_value.prob * corners_value.prob_selected
        
        # Probabilidad conjunta CON correlación
        prob_correlated = min(prob_independent * correlation_bonus, 0.95)
        
        # EV de la combinada
        ev = (prob_correlated * combined_odds) - 1
        
        if ev > 0.05:  # EV > 5%
            return {
                "type": "COMBO_1",
                "fixture": fixture,
                "legs": [
                    {"market": "goals_1h", "pick": goals_result},
                    {"market": "corners", "pick": corners_result}
                ],
                "combined_odds": combined_odds,
                "ev": ev,
                "correlation_bonus": correlation_bonus,
                "confidence": "ALTA" if ev > 0.10 else "MEDIA"
            }
    
    return None
```

## 5.2 Detección de Combo Tipo 2 (cross-partido)

```python
def detect_combo_cross(value_picks, time_window):
    """
    Busca las mejores combinaciones de 2 picks de DIFERENTES partidos
    que estén en la misma ventana de tiempo.
    
    value_picks: lista de picks con value detectado
    time_window: ventana de tiempo en minutos (máximo 180)
    """
    combos = []
    
    for i, pick_a in enumerate(value_picks):
        for pick_b in value_picks[i+1:]:
            # Verificar que son de DIFERENTES partidos
            if pick_a.fixture_id == pick_b.fixture_id:
                continue
            
            # Verificar ventana de tiempo
            time_diff = abs(pick_a.kickoff - pick_b.kickoff)
            if time_diff > timedelta(minutes=time_window):
                continue
            
            # Calcular EV combinada (sin correlación — son independientes)
            combined_odds = pick_a.best_odds * pick_b.best_odds
            prob_combined = pick_a.prob * pick_b.prob
            ev = (prob_combined * combined_odds) - 1
            
            if ev > 0.05:
                combos.append({
                    "type": "COMBO_2",
                    "legs": [pick_a, pick_b],
                    "combined_odds": combined_odds,
                    "prob_combined": prob_combined,
                    "ev": ev,
                    "time_diff_minutes": time_diff.total_seconds() / 60
                })
    
    # Ordenar por EV descendente
    combos.sort(key=lambda x: x["ev"], reverse=True)
    
    # Retornar top 3 mejores combinadas
    return combos[:3]
```

## 5.3 Detección de Combo Tipo 4 (triple: 2+1)

```python
def detect_combo_triple(combo1_picks, individual_picks, time_window):
    """
    Si hay un Combo Tipo 1 (mismo partido), busca un tercer pick
    independiente para formar un triple.
    """
    triples = []
    
    for combo1 in combo1_picks:
        combo1_kickoff = combo1["fixture"].kickoff
        
        for pick in individual_picks:
            # No puede ser del mismo partido que el Combo 1
            if pick.fixture_id == combo1["fixture"].id:
                continue
            
            # Verificar ventana de tiempo
            time_diff = abs(pick.kickoff - combo1_kickoff)
            if time_diff > timedelta(minutes=time_window):
                continue
            
            # Calcular EV del triple
            # Combo 1 (correlacionado) × pick independiente
            combined_odds = combo1["combined_odds"] * pick.best_odds
            prob_triple = combo1["prob_correlated"] * pick.prob
            ev = (prob_triple * combined_odds) - 1
            
            if ev > 0.08:  # umbral más alto para triples
                triples.append({
                    "type": "COMBO_4",
                    "legs": combo1["legs"] + [{"market": pick.market, "pick": pick}],
                    "combined_odds": combined_odds,
                    "ev": ev,
                    "confidence": "ALTA" if ev > 0.15 else "MEDIA"
                })
    
    triples.sort(key=lambda x: x["ev"], reverse=True)
    return triples[:2]
```

## 5.4 Selector final de combinadas

```python
def select_daily_combos(all_combos, max_combos=3, max_exposure=0.05):
    """
    Selecciona las mejores combinadas del día.
    
    max_combos: máximo 3 combinadas por día
    max_exposure: máximo 5% del bankroll en combinadas total
    """
    selected = []
    used_fixtures = set()
    total_stake = 0
    
    # Prioridad: Combo 1 > Combo 4 > Combo 2
    priority_order = ["COMBO_1", "COMBO_4", "COMBO_2"]
    
    for combo_type in priority_order:
        type_combos = [c for c in all_combos if c["type"] == combo_type]
        type_combos.sort(key=lambda x: x["ev"], reverse=True)
        
        for combo in type_combos:
            if len(selected) >= max_combos:
                break
            
            # Verificar que no se repite fixture
            combo_fixtures = set(leg.get("fixture_id", leg.get("pick", {}).get("fixture_id")) 
                               for leg in combo["legs"])
            if combo_fixtures & used_fixtures:
                continue
            
            # Calcular stake
            stake = calculate_combo_stake(combo, max_exposure - total_stake)
            if stake <= 0:
                continue
            
            combo["stake"] = stake
            selected.append(combo)
            used_fixtures |= combo_fixtures
            total_stake += stake
    
    return selected
```

---

# 6. SISTEMA DE CONFIANZA Y STAKE SIZING

## 6.1 Score de confianza (0-100)

```python
def calculate_confidence_score(pick):
    """
    Calcula un score de confianza de 0 a 100 basado en múltiples señales.
    """
    score = 0
    
    # SEÑAL 1: Edge vs cuota (0-30 puntos)
    edge = pick.edge
    if edge >= 0.15: score += 30
    elif edge >= 0.10: score += 25
    elif edge >= 0.07: score += 20
    elif edge >= 0.05: score += 15
    elif edge >= 0.03: score += 10
    else: score += 5
    
    # SEÑAL 2: Muestra estadística (0-15 puntos)
    min_games = min(pick.team_a.games_played, pick.team_b.games_played)
    if min_games >= 20: score += 15
    elif min_games >= 15: score += 12
    elif min_games >= 10: score += 8
    elif min_games >= 8: score += 5
    else: score += 0  # muestra insuficiente
    
    # SEÑAL 3: Consistencia entre variables (0-20 puntos)
    # Si TODAS las variables apuntan en la misma dirección
    signals_aligned = count_aligned_signals(pick)
    score += min(signals_aligned * 4, 20)  # max 5 señales × 4 = 20
    
    # SEÑAL 4: Edge vs Pinnacle (0-15 puntos)
    # Si nuestra cuota es mejor que la de Pinnacle (sharp book)
    if pick.edge_vs_pinnacle > 0.05: score += 15
    elif pick.edge_vs_pinnacle > 0.02: score += 10
    elif pick.edge_vs_pinnacle > 0: score += 5
    
    # SEÑAL 5: Steam move (0-20 puntos)
    if pick.steam_move and pick.steam_move_confirms:
        score += 20  # cuota se movió a nuestro favor
    elif pick.steam_move and not pick.steam_move_confirms:
        score -= 15  # cuota se movió EN CONTRA — peligro
    
    return max(0, min(100, score))
```

## 6.2 Stake sizing basado en confianza

```python
def calculate_stake(confidence_score, bankroll, pick_type):
    """
    Calcula el monto a apostar basado en el score de confianza.
    
    Kelly Criterion modificado (fracción de Kelly):
    - Usamos 25% Kelly para ser conservadores
    """
    # Kelly completo: f* = (bp - q) / b
    # donde b = cuota - 1, p = prob_own, q = 1 - p
    b = pick.best_odds - 1
    p = pick.prob
    q = 1 - p
    kelly_full = (b * p - q) / b
    
    # Fracción de Kelly (25% para control de varianza)
    kelly_fraction = kelly_full * 0.25
    
    # Ajustar por confianza
    if confidence_score >= 80:
        multiplier = 1.0    # Kelly completo (fraccional)
    elif confidence_score >= 60:
        multiplier = 0.75
    elif confidence_score >= 40:
        multiplier = 0.50
    else:
        multiplier = 0.25
    
    # Ajustar por tipo de apuesta
    type_multiplier = {
        "INDIVIDUAL": 1.0,
        "COMBO_1": 0.75,      # combo mismo partido
        "COMBO_2": 0.60,      # combo cross-partido
        "COMBO_4": 0.50,      # triple
    }
    
    stake = bankroll * kelly_fraction * multiplier * type_multiplier.get(pick_type, 0.5)
    
    # LÍMITES DUROS
    max_stake = bankroll * 0.03  # nunca más del 3%
    min_stake = 1.0  # mínimo $1
    
    stake = max(min_stake, min(max_stake, stake))
    
    return round(stake, 2)
```

## 6.3 Tabla de stakes esperados

Para un bankroll de $100:

| Confianza | Kelly × 0.25 | Pick individual | Combo 1 | Combo 2 | Triple |
|-----------|-------------|-----------------|---------|---------|--------|
| 80-100 | ~2.5% | $2.50 | $1.88 | $1.50 | $1.25 |
| 60-79 | ~1.8% | $1.35 | $1.01 | $0.81 | $0.68 |
| 40-59 | ~1.2% | $0.60 | $0.45 | $0.36 | $0.30 |
| < 40 | — | SKIP | SKIP | SKIP | SKIP |

---

# 7. ALGORITMO DE STEAM MOVES

## 7.1 Detección de movimientos de cuota

```python
def detect_steam_move(fixture_id, market, direction):
    """
    Monitorea cuotas cada 30 min y detecta movimientos bruscos.
    Un steam move es cuando la cuota se mueve >10% en < 2 horas.
    """
    # Obtener historial de cuotas (últimas 4 lecturas = 2 horas)
    odds_history = get_odds_history(fixture_id, market, last_n=4)
    
    if len(odds_history) < 2:
        return None
    
    first_odds = odds_history[0].price
    current_odds = odds_history[-1].price
    
    # Calcular cambio porcentual en probabilidad implícita
    prob_first = 1 / first_odds
    prob_current = 1 / current_odds
    prob_change = prob_current - prob_first
    pct_change = abs(prob_change) / prob_first
    
    if pct_change < 0.10:  # menos del 10% de movimiento
        return None
    
    # Determinar dirección del movimiento
    if direction == "OVER":
        # Si cuota Over BAJA → dinero entrando al Over → CONFIRMA
        confirms = current_odds < first_odds
    else:
        # Si cuota Under BAJA → dinero entrando al Under → CONFIRMA
        confirms = current_odds < first_odds
    
    return {
        "detected": True,
        "confirms_our_pick": confirms,
        "pct_change": pct_change,
        "direction": "FAVORABLE" if confirms else "CONTRA",
        "first_odds": first_odds,
        "current_odds": current_odds,
        "hours_elapsed": len(odds_history) * 0.5,  # cada 30 min
        "action": "CONFIRMAR_APUESTA" if confirms else "CANCELAR_O_REDUCIR"
    }
```

## 7.2 Reglas de acción ante steam moves

| Steam move | Dirección | Acción |
|-----------|-----------|--------|
| >10% movimiento | A FAVOR de nuestro pick | CONFIRMAR + subir confianza +20 puntos |
| >10% movimiento | EN CONTRA de nuestro pick | CANCELAR pick o reducir stake 50% |
| 5-10% movimiento | A FAVOR | Solo registrar, no cambiar acción |
| 5-10% movimiento | EN CONTRA | Reducir stake 25% |
| <5% movimiento | Cualquier | Ignorar, fluctuación normal |

---

# 8. CLV TRACKER — VALIDACIÓN DEL SISTEMA

## 8.1 Registro post-apuesta

```python
def record_bet(bet):
    """Registra cada apuesta para tracking de CLV."""
    return {
        "id": generate_id(),
        "timestamp": now(),
        "fixture_id": bet.fixture_id,
        "market": bet.market,          # "over_05_1h", "over_95_corners", etc.
        "direction": bet.direction,     # "OVER" / "UNDER"
        "odds_at_bet": bet.odds,        # cuota al momento de apostar
        "odds_at_close": None,          # se llena post-partido
        "prob_own": bet.prob,           # nuestra probabilidad
        "edge": bet.edge,
        "confidence": bet.confidence,
        "stake": bet.stake,
        "result": None,                 # WIN / LOSE / VOID
        "profit": None,
        "clv": None,
        "type": bet.type,              # INDIVIDUAL / COMBO_1 / COMBO_2 / COMBO_4
    }
```

## 8.2 Cálculo de CLV post-partido

```python
def calculate_clv(bet):
    """
    CLV = diferencia entre nuestra cuota y la cuota de cierre.
    Positivo = ganamos al mercado. Negativo = el mercado nos ganó.
    """
    if bet.odds_at_close is None:
        return None
    
    # CLV en probabilidad implícita
    prob_at_bet = 1 / bet.odds_at_bet
    prob_at_close = 1 / bet.odds_at_close
    clv = prob_at_close - prob_at_bet
    
    # CLV positivo: apostamos a cuota MEJOR que el cierre → BIEN
    # CLV negativo: apostamos a cuota PEOR que el cierre → MAL
    
    return {
        "clv_prob": clv,
        "clv_pct": clv / prob_at_bet * 100,  # en porcentaje
        "interpretation": "POSITIVO" if clv > 0 else "NEGATIVO"
    }
```

## 8.3 Métricas de validación del sistema

```python
def validate_system(bets, min_sample=50):
    """
    Después de N apuestas, evaluar si el sistema funciona.
    """
    if len(bets) < min_sample:
        return {"status": "INSUFICIENTE", "message": f"Necesitás {min_sample - len(bets)} apuestas más"}
    
    # CLV promedio
    clv_values = [b.clv_prob for b in bets if b.clv_prob is not None]
    avg_clv = sum(clv_values) / len(clv_values)
    
    # Win rate
    wins = sum(1 for b in bets if b.result == "WIN")
    win_rate = wins / len(bets)
    
    # ROI
    total_staked = sum(b.stake for b in bets)
    total_profit = sum(b.profit for b in bets if b.profit is not None)
    roi = total_profit / total_staked if total_staked > 0 else 0
    
    # Yield (profit per unit staked)
    yield_pct = roi * 100
    
    # Evaluación
    if avg_clv > 0.02:
        system_status = "EXCELENTE"
        action = "ESCALAR stakes gradualmente"
    elif avg_clv > 0:
        system_status = "POSITIVO"
        action = "Mantener, acumular más data"
    elif avg_clv > -0.02:
        system_status = "NEUTRO"
        action = "Revisar variables y umbrales"
    else:
        system_status = "NEGATIVO"
        action = "PARAR. Revisar modelo completo."
    
    # Breakdown por mercado
    goals_bets = [b for b in bets if "goals" in b.market or "1h" in b.market]
    corners_bets = [b for b in bets if "corner" in b.market]
    combo_bets = [b for b in bets if b.type != "INDIVIDUAL"]
    
    return {
        "total_bets": len(bets),
        "avg_clv": avg_clv,
        "win_rate": win_rate,
        "roi": roi,
        "yield_pct": yield_pct,
        "system_status": system_status,
        "recommended_action": action,
        "breakdown": {
            "goals_1h": {
                "count": len(goals_bets),
                "avg_clv": avg([b.clv_prob for b in goals_bets]),
                "roi": calc_roi(goals_bets)
            },
            "corners": {
                "count": len(corners_bets),
                "avg_clv": avg([b.clv_prob for b in corners_bets]),
                "roi": calc_roi(corners_bets)
            },
            "combos": {
                "count": len(combo_bets),
                "avg_clv": avg([b.clv_prob for b in combo_bets]),
                "roi": calc_roi(combo_bets)
            }
        }
    }
```

## 8.4 Umbrales de evaluación

| Métrica | Excelente | Bueno | Neutro | Malo | Desastre |
|---------|-----------|-------|--------|------|----------|
| CLV promedio | > +2% | +0.5% a +2% | -0.5% a +0.5% | -2% a -0.5% | < -2% |
| ROI | > +8% | +3% a +8% | 0% a +3% | -5% a 0% | < -5% |
| Win rate (Over 0.5 1H) | > 82% | 78-82% | 74-78% | 70-74% | < 70% |
| Win rate (Corners Over 9.5) | > 58% | 52-58% | 48-52% | 44-48% | < 44% |

---

# 9. FILTROS Y REGLAS DE NEGOCIO

## 9.1 Filtros obligatorios (NUNCA apostar si no se cumplen)

```python
FILTERS = {
    # Muestra mínima
    "min_games_played": 8,              # equipo con menos de 8 partidos → skip
    
    # Calidad de cuota
    "min_edge": 0.02,                    # menos del 2% edge → skip
    "min_odds": 1.05,                    # cuota menor a 1.05 → no vale la pena
    "max_odds": 5.00,                    # cuota mayor a 5.00 → demasiado riesgo
    
    # Combinadas
    "max_legs": 3,                       # nunca más de 3 patas
    "max_time_window_minutes": 180,      # 3 horas máximo entre primer y último partido
    "min_combo_ev": 0.05,                # EV mínimo del 5% para combinadas
    
    # Bankroll
    "max_single_stake_pct": 0.03,        # máximo 3% del bankroll por apuesta
    "max_daily_exposure_pct": 0.15,      # máximo 15% del bankroll expuesto por día
    "max_combos_per_day": 3,             # máximo 3 combinadas por día
    "max_individual_per_day": 5,         # máximo 5 picks individuales por día
    
    # Anti-tilt
    "stop_loss_daily_pct": 0.10,         # si pierdes 10% del bankroll en un día → parar
    "max_consecutive_losses": 7,          # después de 7 losses seguidos → parar 24h
}
```

## 9.2 Filtros por mercado

```python
# Over 0.5 Primera Mitad
GOALS_05_FILTERS = {
    "min_prob_own": 0.78,                # probabilidad propia mínima
    "min_both_teams_over05": 0.70,       # ambos equipos > 70% Over 0.5 1H individual
    "exclude_teams": ["FC Twente"],      # equipos con datos atípicos
}

# Over 1.5 Primera Mitad
GOALS_15_FILTERS = {
    "min_prob_own": 0.40,
    "min_bts_1h_combined": 0.25,         # BTS 1H promedio > 25%
    "min_combined_avg_goals_1h": 1.0,    # suma de avg goles 1H > 1.0
}

# Corners Over X.5
CORNERS_FILTERS = {
    "min_prob_own": 0.52,                # apenas por encima del 50%
    "min_combined_corners_avg": 18.0,    # ambos equipos combinan > 18 corners avg
    "min_shots_combined": 20,            # al menos 20 tiros combinados
}
```

## 9.3 Regla de diversificación

```python
def enforce_diversification(daily_picks):
    """
    El bot no puede concentrar todas las apuestas en un solo mercado o liga.
    """
    # Máximo 60% de picks del día en un solo mercado
    goals_picks = [p for p in daily_picks if "goals" in p.market]
    corners_picks = [p for p in daily_picks if "corner" in p.market]
    
    max_per_market = len(daily_picks) * 0.60
    
    if len(goals_picks) > max_per_market:
        # Quitar los de menor EV
        goals_picks.sort(key=lambda x: x.ev)
        excess = len(goals_picks) - int(max_per_market)
        for p in goals_picks[:excess]:
            daily_picks.remove(p)
    
    # Máximo 40% de picks en una sola liga
    by_league = group_by(daily_picks, "league_id")
    max_per_league = len(daily_picks) * 0.40
    
    for league_id, picks in by_league.items():
        if len(picks) > max_per_league:
            picks.sort(key=lambda x: x.ev)
            excess = len(picks) - int(max_per_league)
            for p in picks[:excess]:
                daily_picks.remove(p)
    
    return daily_picks
```

---

# 10. PSEUDOCÓDIGO COMPLETO DEL BOT

## 10.1 Flujo principal (se ejecuta diariamente)

```python
def run_daily_bot(date, bankroll):
    """
    Flujo completo del bot — se ejecuta la noche anterior.
    """
    
    # ========================================
    # FASE 1: RECOLECCIÓN DE DATOS
    # ========================================
    
    # 1.1 Obtener fixtures del día
    leagues = get_active_leagues(date)  # solo Tier 1-2 activas
    fixtures = []
    for league in leagues:
        fixtures += api_football.get_fixtures(date=date, league=league.id)
    
    print(f"Encontrados {len(fixtures)} partidos en {len(leagues)} ligas")
    
    # 1.2 Obtener stats de equipos
    for fixture in fixtures:
        fixture.team_a_stats = api_football.get_team_stats(
            league=fixture.league_id, 
            team=fixture.team_a_id
        )
        fixture.team_b_stats = api_football.get_team_stats(
            league=fixture.league_id, 
            team=fixture.team_b_id
        )
        fixture.h2h = api_football.get_h2h(
            team_a=fixture.team_a_id, 
            team_b=fixture.team_b_id,
            last=5
        )
    
    # 1.3 Filtrar por muestra mínima
    fixtures = [f for f in fixtures 
                if f.team_a_stats.games >= FILTERS["min_games_played"]
                and f.team_b_stats.games >= FILTERS["min_games_played"]]
    
    print(f"Después de filtro muestra: {len(fixtures)} partidos")
    
    # ========================================
    # FASE 2: SCORING
    # ========================================
    
    value_picks = []
    
    for fixture in fixtures:
        # 2.1 Scoring Goles 1H
        goals_result = score_goals_1h(fixture)
        
        # 2.2 Scoring Corners
        corners_result = score_corners(fixture)
        
        # 2.3 Obtener cuotas
        odds = get_best_odds(fixture)
        
        # 2.4 Value detection — Goles 1H
        for market in ["over_05_1h", "over_15_1h"]:
            if market in odds:
                value = detect_value_goals(
                    goals_result.get_prob(market),
                    odds[market].best_price
                )
                if value.has_value and value.edge >= FILTERS["min_edge"]:
                    pick = create_pick(fixture, market, "OVER", value, odds[market])
                    pick.confidence_score = calculate_confidence_score(pick)
                    if pick.confidence_score >= 40:
                        value_picks.append(pick)
        
        # 2.5 Value detection — Corners
        for line in [7.5, 8.5, 9.5, 10.5, 11.5]:
            market_key = f"over_{line}_corners"
            if market_key in odds:
                value = detect_value_corners(
                    corners_result.expected,
                    line,
                    odds[market_key].over_price,
                    odds[market_key].under_price
                )
                if value.direction != "SKIP" and value.edge >= FILTERS["min_edge"]:
                    pick = create_pick(fixture, market_key, value.direction, value, odds[market_key])
                    pick.confidence_score = calculate_confidence_score(pick)
                    if pick.confidence_score >= 40:
                        value_picks.append(pick)
    
    print(f"Encontrados {len(value_picks)} picks con value")
    
    # ========================================
    # FASE 3: COMBINADAS
    # ========================================
    
    # 3.1 Agrupar por ventana de tiempo
    windows = group_by_time_window(value_picks, window_minutes=180)
    
    all_combos = []
    
    for window_name, window_picks in windows.items():
        # 3.2 Detectar Combo Tipo 1 (mismo partido)
        combo1_list = []
        fixtures_in_window = set(p.fixture_id for p in window_picks)
        for fixture_id in fixtures_in_window:
            fixture_picks = [p for p in window_picks if p.fixture_id == fixture_id]
            goals_picks = [p for p in fixture_picks if "goals" in p.market or "1h" in p.market]
            corner_picks = [p for p in fixture_picks if "corner" in p.market]
            
            if goals_picks and corner_picks:
                best_goal = max(goals_picks, key=lambda x: x.ev)
                best_corner = max(corner_picks, key=lambda x: x.ev)
                combo1 = create_combo_1(best_goal, best_corner)
                if combo1:
                    combo1_list.append(combo1)
                    all_combos.append(combo1)
        
        # 3.3 Detectar Combo Tipo 2 (cross-partido)
        cross_combos = detect_combo_cross(window_picks, time_window=180)
        all_combos.extend(cross_combos)
        
        # 3.4 Detectar Combo Tipo 4 (triple)
        if combo1_list:
            individual_in_window = [p for p in window_picks 
                                    if p.fixture_id not in 
                                    set(c["fixture_id"] for c in combo1_list)]
            triples = detect_combo_triple(combo1_list, individual_in_window, 180)
            all_combos.extend(triples)
    
    print(f"Generadas {len(all_combos)} combinadas posibles")
    
    # ========================================
    # FASE 4: SELECCIÓN FINAL
    # ========================================
    
    # 4.1 Seleccionar mejores picks individuales
    individual_picks = sorted(value_picks, key=lambda x: x.ev, reverse=True)
    individual_picks = individual_picks[:FILTERS["max_individual_per_day"]]
    
    # 4.2 Seleccionar mejores combinadas
    selected_combos = select_daily_combos(all_combos, max_combos=3)
    
    # 4.3 Aplicar diversificación
    all_daily = individual_picks + [leg for c in selected_combos for leg in c["legs"]]
    all_daily = enforce_diversification(all_daily)
    
    # 4.4 Calcular stakes
    for pick in individual_picks:
        pick.stake = calculate_stake(pick.confidence_score, bankroll, "INDIVIDUAL")
    for combo in selected_combos:
        combo["stake"] = calculate_stake(
            min(leg.confidence_score for leg in combo["legs"]),
            bankroll,
            combo["type"]
        )
    
    # 4.5 Verificar exposición total
    total_exposure = sum(p.stake for p in individual_picks) + sum(c["stake"] for c in selected_combos)
    max_exposure = bankroll * FILTERS["max_daily_exposure_pct"]
    if total_exposure > max_exposure:
        # Reducir stakes proporcionalmente
        factor = max_exposure / total_exposure
        for p in individual_picks:
            p.stake = round(p.stake * factor, 2)
        for c in selected_combos:
            c["stake"] = round(c["stake"] * factor, 2)
    
    # ========================================
    # FASE 5: OUTPUT
    # ========================================
    
    return {
        "date": date,
        "individual_picks": format_picks(individual_picks),
        "combos": format_combos(selected_combos),
        "total_picks": len(individual_picks) + len(selected_combos),
        "total_exposure": total_exposure,
        "exposure_pct": total_exposure / bankroll * 100,
        "summary": generate_summary(individual_picks, selected_combos)
    }
```

## 10.2 Flujo de verificación pre-partido (30 min antes)

```python
def pre_match_check(picks, combos, bankroll):
    """
    Se ejecuta 30 min antes de la Ventana A.
    Verifica cuotas actualizadas y steam moves.
    """
    
    final_picks = []
    cancelled = []
    
    for pick in picks:
        # Obtener cuota actualizada
        current_odds = get_current_odds(pick.fixture_id, pick.market)
        
        # Detectar steam move
        steam = detect_steam_move(pick.fixture_id, pick.market, pick.direction)
        
        if steam and steam["direction"] == "CONTRA":
            # Steam move en contra → cancelar o reducir
            if steam["pct_change"] > 0.15:
                pick.status = "CANCELADO"
                pick.reason = f"Steam move {steam['pct_change']:.0%} en contra"
                cancelled.append(pick)
                continue
            else:
                pick.stake = pick.stake * 0.50  # reducir 50%
                pick.note = f"Stake reducido por steam move {steam['pct_change']:.0%}"
        
        elif steam and steam["direction"] == "FAVORABLE":
            # Steam move a favor → aumentar confianza
            pick.confidence_score += 20
            pick.note = f"Steam move confirma: {steam['pct_change']:.0%} a favor"
        
        # Re-calcular edge con cuota actualizada
        new_edge = pick.prob - (1 / current_odds)
        if new_edge < FILTERS["min_edge"]:
            pick.status = "CANCELADO"
            pick.reason = f"Edge cayó a {new_edge:.2%} (cuota se ajustó)"
            cancelled.append(pick)
            continue
        
        pick.odds_final = current_odds
        pick.edge_final = new_edge
        final_picks.append(pick)
    
    # Verificar combos (si alguna pata fue cancelada, cancelar combo)
    final_combos = []
    for combo in combos:
        legs_ok = all(
            leg.fixture_id not in [c.fixture_id for c in cancelled]
            for leg in combo["legs"]
        )
        if legs_ok:
            final_combos.append(combo)
        else:
            combo["status"] = "CANCELADO"
            combo["reason"] = "Una pata fue cancelada"
    
    return {
        "active_picks": final_picks,
        "active_combos": final_combos,
        "cancelled": cancelled,
        "message": f"{len(final_picks)} picks + {len(final_combos)} combos listos para ejecutar"
    }
```

---

# 11. DATOS REQUERIDOS POR ENDPOINT

## 11.1 API-Football — Endpoints necesarios

| Endpoint | Datos que extraemos | Frecuencia |
|----------|-------------------|-----------|
| `GET /fixtures?date={date}&league={id}` | Fixtures del día, kickoff times, scores por mitad | Diario |
| `GET /teams/statistics?league={id}&team={id}&season=2025` | Avg goles 1H, corners, tiros, posesión, Over 0.5 %, BTS % | Diario |
| `GET /fixtures/statistics?fixture={id}` | Stats por partido: corners, tiros, posesión (para calcular formas) | Post-partido |
| `GET /fixtures/headtohead?h2h={teamA}-{teamB}&last=5` | Últimos 5 H2H: scores, corners, goles por mitad | Pre-partido |
| `GET /odds?fixture={id}` | Cuotas de múltiples bookmakers para todos los mercados | Pre-partido (cada 30 min) |
| `GET /odds/live?fixture={id}` | Cuotas live para steam move detection | Cada 30 min pre-partido |

## 11.2 The Odds API — Endpoints necesarios

| Endpoint | Datos que extraemos | Frecuencia |
|----------|-------------------|-----------|
| `GET /sports/{sport_key}/odds?markets=totals&regions=eu` | Cuotas Over/Under totales (goles) | Pre-partido |
| `GET /sports/{sport_key}/odds?markets=totals_h1` | Cuotas Over/Under primera mitad | Pre-partido |
| `GET /sports/{sport_key}/odds?markets=alternate_totals` | Líneas alternativas (0.5, 1.5, etc.) | Pre-partido |

**NOTA:** The Odds API no tiene mercado específico de "corners" como endpoint separado. Para cuotas de corners, usar las odds integradas de API-Football que sí incluyen mercados de corners de bookmakers como Bet365 y 1xBet.

## 11.3 Cálculo de API calls por día

### API-Football (plan Free: 100 calls/día; Pro: 7,500/día)

| Operación | Calls estimados | Nota |
|-----------|----------------|------|
| Fixtures del día (15 ligas) | 15 | Una call por liga |
| Stats de equipos (30 partidos × 2) | 60 | 2 equipos por partido |
| H2H (30 partidos) | 30 | 1 call por matchup |
| Odds pre-partido (30 partidos) | 30 | 1 call por fixture |
| Odds check 30 min antes (10 picks) | 10 | Solo picks seleccionados |
| Post-partido stats (30 partidos) | 30 | Para CLV tracking |
| **TOTAL DIARIO** | **~175** | **Necesita plan Pro ($29.99/mes)** |

### The Odds API (plan Free: 500 calls/mes)

| Operación | Calls estimados | Nota |
|-----------|----------------|------|
| Odds por liga (15 ligas × 2 markets) | 30 | Una call por liga/mercado |
| Re-check pre-partido | 10 | Solo picks seleccionados |
| **TOTAL DIARIO** | **~40** | **~1,200/mes. Necesita plan Starter ($19/mes)** |

---

*Documento de algoritmos generado el 23 de marzo de 2026.*
*Complementa el Documento Maestro de Apuestas 2026.*
*Las fórmulas y pesos deben calibrarse con data real después de 50+ apuestas.*
*Los factores de correlación (1.08 para Combo 1) son estimaciones conservadoras — ajustar con backtesting.*
