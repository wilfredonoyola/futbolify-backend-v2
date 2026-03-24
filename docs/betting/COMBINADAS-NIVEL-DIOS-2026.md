# COMBINADAS INTELIGENTES — NIVEL DIOS
## Algoritmo Avanzado de Apuestas Combinadas con Correlación
### Reemplaza la Sección 5 del documento de Algoritmos

---

# ÍNDICE

1. MATRIZ DE CORRELACIÓN ENTRE MERCADOS
2. MOTOR DE PROBABILIDAD CONJUNTA
3. CLASIFICACIÓN DE COMBINADAS (7 TIPOS)
4. SELECTOR ÓPTIMO DE COMBINADAS (OPTIMIZER)
5. EXPECTED VALUE AJUSTADO POR CORRELACIÓN
6. SISTEMA DE SCORING DE COMBINADAS (0-100)
7. KELLY CRITERION PARA COMBINADAS CORRELACIONADAS
8. ÁRBOL DE DECISIÓN COMPLETO
9. LÓGICA DE CONTEXTO DE PARTIDO
10. DETECCIÓN DE TRAMPAS (ANTI-PATTERNS)
11. HEDGE LOGIC (COBERTURA IN-PLAY)
12. BACKTESTING FRAMEWORK
13. PSEUDOCÓDIGO COMPLETO DEL MOTOR DE COMBINADAS

---

# 1. MATRIZ DE CORRELACIÓN ENTRE MERCADOS

## 1.1 Concepto fundamental

Las casas de apuestas calculan las combinadas multiplicando las cuotas individuales como si los eventos fueran INDEPENDIENTES. Pero en fútbol, muchos mercados están CORRELACIONADOS. Si sabés cuánto, podés calcular la probabilidad REAL de la combinada — y si es mayor que lo que la cuota implica, hay edge escondido.

## 1.2 Matriz de correlación empírica

Correlación entre mercados DENTRO DEL MISMO PARTIDO.
Escala: -1.0 (inversamente correlacionados) a +1.0 (perfectamente correlacionados).
Valores estimados basados en análisis histórico de ligas europeas.

```
MATRIZ DE CORRELACIÓN (mismo partido):

                    | Over 0.5 1H | Over 1.5 1H | Over 9.5 crn | Over 4.5 crn 1H | Corners HC |
Over 0.5 Goles 1H  |    1.00     |    0.65      |    0.35       |      0.40        |    0.15    |
Over 1.5 Goles 1H  |    0.65     |    1.00      |    0.45       |      0.50        |    0.20    |
Over 9.5 Corners    |    0.35     |    0.45      |    1.00       |      0.75        |    0.55    |
Over 4.5 Corners 1H |    0.40     |    0.50      |    0.75       |      1.00        |    0.50    |
Corners HC Equipo   |    0.15     |    0.20      |    0.55       |      0.50        |    1.00    |
```

## 1.3 Por qué existe esta correlación

```
GOLES 1H ←→ CORNERS (correlación: 0.35-0.50)

Mecanismo causal:
  Partido abierto → más ataques → más tiros → más corners + más goles
  Partido cerrado → menos ataques → menos tiros → menos corners + menos goles

La correlación NO es perfecta (1.0) porque:
  - Un equipo puede sacar 8 corners y no meter gol (tiros bloqueados)
  - Un gol puede venir de contraataque (0 corners involucrados)
  - Gol temprano puede cerrar el partido (menos corners después)
```

## 1.4 Factores que AUMENTAN la correlación

| Factor | Efecto en correlación | Ajuste |
|--------|----------------------|--------|
| Ambos equipos atacantes (avg posesión similar ~50/50) | +0.10 | Partido abierto en ambas direcciones |
| Partido de alta intensidad (derby, descenso, título) | +0.08 | Más presión = más ataques = más de todo |
| Ambos equipos con pressing alto | +0.12 | Transiciones rápidas generan corners Y goles |
| Liga de juego abierto (Eredivisie, Bundesliga) | +0.05 | Estilo de liga favorece correlación |

## 1.5 Factores que REDUCEN la correlación

| Factor | Efecto en correlación | Ajuste |
|--------|----------------------|--------|
| Un equipo muy favorito (>75% prob ganar) | -0.10 | Dominio = muchos corners pero gol puede no llegar en 1H |
| Equipo que juega contraataque | -0.08 | Goles sin corners (contraataque directo) |
| Partido con viento/lluvia fuerte | -0.05 | Corners altos pero goles bajos (centros al área imprecisos) |
| Liga defensiva (Serie A, Ligue 1) | -0.05 | Cultura de bloquear, no de atacar |

## 1.6 Cálculo dinámico de correlación

```python
def calculate_dynamic_correlation(fixture, market_a, market_b):
    """
    Calcula la correlación ajustada entre dos mercados para un partido específico.
    No usa un valor fijo — lo ajusta al contexto del partido.
    """
    # Base: correlación empírica de la matriz
    base_corr = CORRELATION_MATRIX[market_a][market_b]
    
    # Ajuste 1: Estilo de equipos
    team_a = fixture.team_a_stats
    team_b = fixture.team_b_stats
    
    # ¿Ambos equipos atacantes? (posesión similar = partido abierto)
    possession_diff = abs(team_a.avg_possession - team_b.avg_possession)
    if possession_diff < 8:  # posesión similar → partido abierto
        base_corr += 0.10
    elif possession_diff > 15:  # un equipo domina → menos correlación
        base_corr -= 0.08
    
    # Ajuste 2: Intensidad del partido
    intensity = calculate_match_intensity(fixture)
    # Derby: +0.08, pelea por título: +0.06, descenso: +0.08, mid-table: 0
    base_corr += intensity
    
    # Ajuste 3: Pressing alto
    combined_pressing = (team_a.avg_shots + team_b.avg_shots)
    if combined_pressing > 28:  # muchos tiros = pressing alto
        base_corr += 0.12
    elif combined_pressing > 24:
        base_corr += 0.06
    elif combined_pressing < 18:
        base_corr -= 0.08
    
    # Ajuste 4: Liga
    league_adj = get_league_correlation_adjustment(fixture.league_id)
    # Eredivisie/Bundesliga: +0.05, Serie A/Ligue 1: -0.05, otros: 0
    base_corr += league_adj
    
    # Ajuste 5: Favoritismo extremo
    prob_favorite = max(fixture.prob_home, fixture.prob_away)
    if prob_favorite > 0.75:
        base_corr -= 0.10
    elif prob_favorite > 0.65:
        base_corr -= 0.05
    
    # Clamp entre -0.30 y +0.80
    return max(-0.30, min(0.80, base_corr))


def calculate_match_intensity(fixture):
    """
    Calcula la intensidad esperada del partido basado en contexto.
    Retorna un ajuste de correlación.
    """
    intensity = 0.0
    
    # Derby / rivalidad histórica
    if is_derby(fixture.team_a_id, fixture.team_b_id):
        intensity += 0.08
    
    # Posición en tabla: ambos en top 5
    if fixture.team_a_position <= 5 and fixture.team_b_position <= 5:
        intensity += 0.06
    
    # Pelea por descenso: ambos en últimos 4
    total_teams = get_league_teams_count(fixture.league_id)
    relegation_zone = total_teams - 3
    if fixture.team_a_position >= relegation_zone and fixture.team_b_position >= relegation_zone:
        intensity += 0.08
    
    # Final de temporada (últimas 5 jornadas)
    if fixture.matchday >= total_teams * 2 - 5:
        intensity += 0.04
    
    # Mid-table sin nada en juego (ambos entre posición 8-14)
    if 8 <= fixture.team_a_position <= 14 and 8 <= fixture.team_b_position <= 14:
        intensity -= 0.04
    
    return intensity
```

---

# 2. MOTOR DE PROBABILIDAD CONJUNTA

## 2.1 Fórmula de probabilidad conjunta con correlación

Las casas calculan:
```
P_casa(A y B) = P(A) × P(B)     ← ASUMEN INDEPENDENCIA
```

Nosotros calculamos:
```
P_real(A y B) = P(A) × P(B) + ρ × √(P(A)×(1-P(A))) × √(P(B)×(1-P(B)))
```

Donde `ρ` (rho) es la correlación dinámica calculada en la sección 1.

## 2.2 Implementación

```python
import math

def joint_probability(prob_a, prob_b, correlation):
    """
    Calcula la probabilidad conjunta de dos eventos correlacionados.
    
    Usa la fórmula de la cópula Gaussiana simplificada:
    P(A ∩ B) = P(A) × P(B) + ρ × σ(A) × σ(B)
    
    donde σ(X) = √(P(X) × (1 - P(X)))  (desviación estándar de Bernoulli)
    """
    # Probabilidad independiente
    p_independent = prob_a * prob_b
    
    # Ajuste por correlación
    sigma_a = math.sqrt(prob_a * (1 - prob_a))
    sigma_b = math.sqrt(prob_b * (1 - prob_b))
    correlation_adjustment = correlation * sigma_a * sigma_b
    
    # Probabilidad conjunta real
    p_joint = p_independent + correlation_adjustment
    
    # Clamp: no puede ser mayor que el mínimo de las dos, ni negativa
    p_joint = max(0.01, min(p_joint, min(prob_a, prob_b)))
    
    return p_joint


def joint_probability_triple(prob_a, prob_b, prob_c, corr_ab, corr_ac, corr_bc):
    """
    Probabilidad conjunta de 3 eventos.
    Para triples: 2 del mismo partido (correlacionados) + 1 independiente.
    """
    # Primero: probabilidad conjunta de A y B (correlacionados)
    p_ab = joint_probability(prob_a, prob_b, corr_ab)
    
    # Segundo: C es independiente de A y B (diferente partido)
    # Pero podría haber correlación menor por factores externos (misma liga, mismo día)
    # Usamos correlación mínima para cross-partido
    cross_corr = max(corr_ac, corr_bc) * 0.1  # solo 10% de la correlación dentro del partido
    
    p_abc = joint_probability(p_ab, prob_c, cross_corr)
    
    return p_abc
```

## 2.3 Ejemplo numérico completo

```
PARTIDO: PSV vs NEC (Eredivisie, sábado 16:45 CET)

Pick A: Over 0.5 Goles 1H
  - prob_own = 0.92
  - cuota = @1.18
  - prob_implícita = 1/1.18 = 0.847

Pick B: Over 9.5 Corners
  - prob_own = 0.58
  - cuota = @1.65
  - prob_implícita = 1/1.65 = 0.606

Correlación dinámica:
  - Base: 0.35
  - Ambos atacantes (posesión 52/48): +0.10
  - Liga Eredivisie: +0.05
  - Combined shots > 28: +0.06
  - No es derby: +0.00
  - Correlación final: 0.56

CÁLCULO:

La casa dice:
  P_combinada_casa = 0.847 × 0.606 = 0.513
  Cuota combinada = 1.18 × 1.65 = 1.947
  EV_casa = (0.513 × 1.947) - 1 = -0.001 (sin edge)

Nosotros calculamos:
  P_independiente = 0.92 × 0.58 = 0.5336
  sigma_a = √(0.92 × 0.08) = 0.2713
  sigma_b = √(0.58 × 0.42) = 0.4936
  correlación_adj = 0.56 × 0.2713 × 0.4936 = 0.0750
  P_real = 0.5336 + 0.0750 = 0.6086

  EV_real = (0.6086 × 1.947) - 1 = +0.185 (+18.5% edge)

RESULTADO: La combinada tiene 18.5% de edge que NO EXISTE
en ninguno de los picks individuales por separado.
Edge del pick A individual = 0.92 - 0.847 = 7.3%
Edge del pick B individual = 0.58 - 0.606 = -2.6% (¡SIN VALUE solo!)
Edge de la COMBINADA = 18.5% (¡MUCHO MÁS que la suma!)

ESTO ES LO QUE LOS SINDICATOS EXPLOTAN.
Un pick que NO tiene value individual (corners -2.6%)
se vuelve rentable DENTRO de una combinada correlacionada
porque la correlación sube la probabilidad conjunta por encima
de lo que la casa calculó.
```

---

# 3. CLASIFICACIÓN DE COMBINADAS (7 TIPOS)

## Tipo 1: GEMELA (mismo partido, goles + corners)

```
Estructura: [Goles 1H partido X] + [Corners partido X]
Correlación: ALTA (ρ = 0.35-0.65 ajustado)
Cuotas típicas: @1.80 - @2.50
Edge típico: 8-20% (el más alto)
Frecuencia: 2-4 por fin de semana
Prioridad: #1 (siempre preferida)
```

**Regla de activación:**
```python
if goals_value.edge >= 0.03 and corners_value.edge >= -0.05:
    # Nota: corners puede tener edge NEGATIVO individual
    # y aún funcionar en la combinada gracias a la correlación
    correlation = calculate_dynamic_correlation(fixture, "goals_1h", "corners")
    p_joint = joint_probability(goals_prob, corners_prob, correlation)
    p_implied = 1 / (goals_odds * corners_odds)
    combo_edge = p_joint - p_implied
    if combo_edge >= 0.05:
        return COMBO_GEMELA
```

## Tipo 2: GEMELA INVERTIDA (mismo partido, Over goles + Under corners)

```
Estructura: [Over 0.5 Goles 1H partido X] + [Under 9.5 Corners partido X]
Correlación: NEGATIVA débil (ρ = -0.10 a -0.25)
Cuotas típicas: @2.00 - @3.00
Edge típico: 3-8%
Frecuencia: 1-2 por fin de semana
Prioridad: #5
```

**Cuándo funciona:** Partidos donde un equipo muy superior marca goles tempranos de contraataque (pocos corners) y luego el partido se cierra (menos corners totales). Ejemplo: Bayern visitando a un equipo de relegación.

```python
if goals_value.edge >= 0.05 and corners_under_value.edge >= 0.02:
    # Correlación es NEGATIVA: gol temprano → partido se cierra → menos corners
    correlation = calculate_dynamic_correlation(fixture, "goals_1h", "under_corners")
    # La correlación negativa AYUDA: P(A y B) = P(A)×P(B) + ρ×σA×σB
    # Con ρ negativo y "Under", el signo se invierte → probabilidad SUBE
    if combo_edge >= 0.03:
        return COMBO_GEMELA_INVERTIDA
```

## Tipo 3: CROSS-LIGA (diferentes partidos, mismo mercado)

```
Estructura: [Goles 1H partido X liga A] + [Goles 1H partido Y liga B]
Correlación: CERO (eventos independientes)
Cuotas típicas: @1.40 - @2.20
Edge típico: 5-12% (suma de edges individuales)
Frecuencia: 3-5 por fin de semana
Prioridad: #3
```

**Ventaja:** Cada pick tiene value individual. La combinada no tiene edge de correlación pero sí edge acumulado.

## Tipo 4: CROSS-MERCADO (diferentes partidos, diferentes mercados)

```
Estructura: [Goles 1H partido X] + [Corners partido Y]
Correlación: CERO (eventos independientes + mercados diferentes)
Cuotas típicas: @1.80 - @3.00
Edge típico: 5-15%
Frecuencia: 2-4 por fin de semana
Prioridad: #2 (diversificación natural)
```

**Ventaja triple:**
1. Edge individual en cada pata
2. Diversificación de mercado (camuflaje orgánico)
3. Mayor cuota combinada que Cross-Liga

## Tipo 5: TRIPLE CORRELACIONADO (2 gemelas + 1 independiente)

```
Estructura: [Goles 1H partido X] + [Corners partido X] + [Pick partido Y]
Correlación: ALTA entre patas 1-2, CERO con pata 3
Cuotas típicas: @3.00 - @5.00
Edge típico: 10-25%
Frecuencia: 1-2 por fin de semana
Prioridad: #4
```

**La combinada más rentable en términos absolutos.** La correlación entre patas 1-2 sube la probabilidad conjunta, y la pata 3 independiente multiplica la cuota sin destruir el edge.

## Tipo 6: DOBLE GEMELA (2 partidos, cada uno con goles + corners)

```
Estructura: [Goles partido X + Corners partido X] + [Goles partido Y + Corners partido Y]
Correlación: ALTA dentro de cada par, CERO entre pares
Cuotas típicas: @4.00 - @8.00
Patas: 4 (excepción al máximo de 3 — justificado por correlación interna)
Edge típico: 15-35%
Frecuencia: 0-1 por fin de semana (raro, necesita 2 partidos perfectos)
Prioridad: #6 (solo cuando ambos partidos son excepcionales)
```

**EXCEPCIÓN a la regla de 3 patas:** Porque internamente son 2 "paquetes" correlacionados. El riesgo real es equivalente a una combinada de 2 picks fuertes, no de 4 independientes.

```python
def detect_double_gemela(gemela_combos, time_window=180):
    """
    Busca 2 combos GEMELA en la misma ventana que se puedan fusionar.
    Solo si ambas tienen confidence >= 70 y EV >= 0.10
    """
    if len(gemela_combos) < 2:
        return None
    
    for i, g1 in enumerate(gemela_combos):
        for g2 in gemela_combos[i+1:]:
            if g1.fixture_id == g2.fixture_id:
                continue
            
            time_diff = abs(g1.kickoff - g2.kickoff)
            if time_diff > timedelta(minutes=time_window):
                continue
            
            if g1.confidence < 70 or g2.confidence < 70:
                continue
            if g1.ev < 0.10 or g2.ev < 0.10:
                continue
            
            # Calcular probabilidad de la doble gemela
            # Cada gemela ya tiene su P_joint con correlación
            # Entre las dos gemelas: independientes
            p_double = g1.p_joint * g2.p_joint
            combined_odds = g1.combined_odds * g2.combined_odds
            ev = (p_double * combined_odds) - 1
            
            if ev >= 0.15:
                return {
                    "type": "DOBLE_GEMELA",
                    "legs": g1.legs + g2.legs,
                    "combined_odds": combined_odds,
                    "p_joint": p_double,
                    "ev": ev,
                    "note": "4 patas pero riesgo equivalente a combo de 2"
                }
    return None
```

## Tipo 7: SHARP CONFIRMADA (cualquier combo + steam move en al menos 1 pata)

```
Estructura: Cualquier Tipo 1-6 donde al menos 1 pata tiene steam move confirmado
Correlación: La del tipo base + boost de confianza
Edge típico: El del tipo base + 5-10% adicional
Prioridad: Sube 1 nivel (ej: Tipo 4 con steam → prioridad #1)
```

**No es un tipo de combo en sí — es un MODIFIER que se aplica sobre cualquier otro tipo.**

```python
def apply_sharp_modifier(combo):
    """
    Si alguna pata tiene steam move confirmado, sube la prioridad y confianza.
    """
    has_steam = any(
        leg.steam_move and leg.steam_move.confirms 
        for leg in combo.legs
    )
    
    if has_steam:
        combo.type = f"SHARP_{combo.type}"
        combo.confidence += 20
        combo.priority_boost = 1  # sube 1 nivel de prioridad
        combo.stake_multiplier = 1.25  # 25% más stake
    
    return combo
```

---

# 4. SELECTOR ÓPTIMO DE COMBINADAS (OPTIMIZER)

## 4.1 El problema de optimización

Cada fin de semana el bot puede generar 10-20 combinadas posibles. Necesita seleccionar las MEJORES 3-5 que maximicen el Expected Value total sin exceder el bankroll.

Esto es un problema de optimización combinatoria: "Portfolio Optimization" aplicado a apuestas.

## 4.2 Función objetivo

```python
def optimize_combo_portfolio(candidates, bankroll, max_combos=5, max_exposure_pct=0.15):
    """
    Selecciona el portafolio óptimo de combinadas que maximiza EV total
    sujeto a restricciones de bankroll y diversificación.
    
    Usa un enfoque greedy con ajuste por Sharpe Ratio adaptado.
    """
    max_exposure = bankroll * max_exposure_pct
    
    # Paso 1: Calcular Sharpe Ratio adaptado para cada combo
    for combo in candidates:
        # EV ajustado por riesgo
        # Sharpe = EV / volatilidad
        # Volatilidad ≈ √(p × (1-p)) × cuota (mayor cuota = más volátil)
        volatility = math.sqrt(combo.p_joint * (1 - combo.p_joint)) * combo.combined_odds
        combo.sharpe = combo.ev / volatility if volatility > 0 else 0
    
    # Paso 2: Ordenar por Sharpe (no por EV bruto)
    # Sharpe prioriza combos con buen EV Y baja varianza
    candidates.sort(key=lambda x: x.sharpe, reverse=True)
    
    # Paso 3: Selección greedy con restricciones
    selected = []
    used_fixtures = set()
    used_leagues = {}  # league_id → count
    remaining_budget = max_exposure
    
    for combo in candidates:
        if len(selected) >= max_combos:
            break
        
        # Restricción: no repetir fixture
        combo_fixtures = get_fixtures(combo)
        if combo_fixtures & used_fixtures:
            continue
        
        # Restricción: máximo 2 combos de la misma liga
        combo_leagues = get_leagues(combo)
        league_ok = all(used_leagues.get(l, 0) < 2 for l in combo_leagues)
        if not league_ok:
            continue
        
        # Restricción: cabe en el presupuesto
        stake = calculate_combo_stake(combo, remaining_budget)
        if stake < 1.0:  # mínimo $1
            continue
        
        # Seleccionar
        combo.stake = stake
        selected.append(combo)
        used_fixtures |= combo_fixtures
        for l in combo_leagues:
            used_leagues[l] = used_leagues.get(l, 0) + 1
        remaining_budget -= stake
    
    # Paso 4: Verificar diversificación final
    goals_count = sum(1 for c in selected if has_goals_leg(c))
    corners_count = sum(1 for c in selected if has_corners_leg(c))
    
    # Ideal: 40-60% goals, 40-60% corners
    # Si está desequilibrado, swapear el último seleccionado
    if goals_count > 0 and corners_count == 0:
        # Buscar el mejor combo con corners que no viola restricciones
        swap_candidate = find_best_corners_combo(candidates, selected)
        if swap_candidate:
            selected[-1] = swap_candidate
    
    return selected
```

## 4.3 Tabla de prioridad de tipos

| Prioridad | Tipo | Sharpe típico | Razón |
|-----------|------|--------------|-------|
| #1 | SHARP_GEMELA | 0.45-0.60 | Correlación + confirmación de mercado |
| #2 | GEMELA | 0.35-0.50 | Mayor edge por correlación |
| #3 | SHARP_CROSS_MERCADO | 0.30-0.45 | Diversificación + steam move |
| #4 | CROSS_MERCADO | 0.25-0.40 | Diversificación natural |
| #5 | TRIPLE_CORRELACIONADO | 0.25-0.35 | Alto EV pero más varianza |
| #6 | CROSS_LIGA | 0.20-0.30 | Segura pero menos edge |
| #7 | DOBLE_GEMELA | 0.20-0.35 | Rara vez disponible |
| #8 | GEMELA_INVERTIDA | 0.15-0.25 | Edge moderado, contexto específico |

---

# 5. EXPECTED VALUE AJUSTADO POR CORRELACIÓN

## 5.1 EV de la casa vs EV real

```python
def calculate_real_ev(combo):
    """
    Calcula el EV REAL considerando correlación,
    comparado con el EV que la casa CREE que tiene.
    """
    legs = combo.legs
    
    if len(legs) == 2:
        # 2 patas
        corr = calculate_dynamic_correlation(
            combo.fixture if combo.same_match else None,
            legs[0].market,
            legs[1].market
        )
        
        # EV según la casa (independencia)
        p_casa = (1/legs[0].odds) * (1/legs[1].odds)
        ev_casa = (p_casa * combo.combined_odds) - 1
        
        # EV real (con correlación)
        p_real = joint_probability(legs[0].prob, legs[1].prob, corr)
        ev_real = (p_real * combo.combined_odds) - 1
        
        # Edge oculto = diferencia
        hidden_edge = ev_real - ev_casa
        
    elif len(legs) == 3:
        # 3 patas: calcular pares
        corr_01 = get_correlation(legs[0], legs[1])
        corr_02 = get_correlation(legs[0], legs[2])
        corr_12 = get_correlation(legs[1], legs[2])
        
        p_real = joint_probability_triple(
            legs[0].prob, legs[1].prob, legs[2].prob,
            corr_01, corr_02, corr_12
        )
        ev_real = (p_real * combo.combined_odds) - 1
        
        p_casa = (1/legs[0].odds) * (1/legs[1].odds) * (1/legs[2].odds)
        ev_casa = (p_casa * combo.combined_odds) - 1
        hidden_edge = ev_real - ev_casa
    
    elif len(legs) == 4:
        # 4 patas (Doble Gemela): 2 pares correlacionados, independientes entre sí
        p_pair_1 = joint_probability(legs[0].prob, legs[1].prob, 
                                      get_correlation(legs[0], legs[1]))
        p_pair_2 = joint_probability(legs[2].prob, legs[3].prob,
                                      get_correlation(legs[2], legs[3]))
        p_real = p_pair_1 * p_pair_2  # pares independientes
        ev_real = (p_real * combo.combined_odds) - 1
        
        p_casa = product(1/leg.odds for leg in legs)
        ev_casa = (p_casa * combo.combined_odds) - 1
        hidden_edge = ev_real - ev_casa
    
    return {
        "ev_real": ev_real,
        "ev_casa": ev_casa,
        "hidden_edge": hidden_edge,
        "p_real": p_real,
        "p_casa": p_casa,
        "correlation_value": hidden_edge  # cuánto "regalo" la correlación
    }
```

## 5.2 Umbrales de EV para cada tipo

| Tipo de combo | EV mínimo para apostar | EV objetivo | Stake máximo |
|---------------|----------------------|-------------|-------------|
| GEMELA | 5% | 15%+ | 1.5% bankroll |
| GEMELA_INVERTIDA | 3% | 8%+ | 1.0% bankroll |
| CROSS_MERCADO | 5% | 10%+ | 1.0% bankroll |
| CROSS_LIGA | 5% | 8%+ | 1.0% bankroll |
| TRIPLE | 8% | 15%+ | 0.75% bankroll |
| DOBLE_GEMELA | 15% | 25%+ | 0.75% bankroll |
| Cualquier SHARP_ | Tipo base -2% | Tipo base | Tipo base × 1.25 |

---

# 6. SISTEMA DE SCORING DE COMBINADAS (0-100)

```python
def score_combo(combo):
    """
    Score de 0-100 que determina la calidad global de la combinada.
    Considera: EV, correlación, confianza de patas, contexto, diversificación.
    """
    score = 0
    
    # ==========================================
    # BLOQUE 1: EV REAL (0-30 puntos)
    # ==========================================
    ev = combo.ev_real
    if ev >= 0.25: score += 30
    elif ev >= 0.20: score += 27
    elif ev >= 0.15: score += 24
    elif ev >= 0.10: score += 20
    elif ev >= 0.08: score += 16
    elif ev >= 0.05: score += 12
    elif ev >= 0.03: score += 8
    else: score += 0
    
    # ==========================================
    # BLOQUE 2: EDGE OCULTO DE CORRELACIÓN (0-20 puntos)
    # ==========================================
    # Cuánto edge extra aporta la correlación que la casa no ve
    hidden = combo.hidden_edge
    if hidden >= 0.15: score += 20
    elif hidden >= 0.10: score += 16
    elif hidden >= 0.05: score += 12
    elif hidden >= 0.02: score += 8
    elif hidden > 0: score += 4
    else: score += 0  # sin correlación (cross-partido)
    
    # ==========================================
    # BLOQUE 3: CONFIANZA DE PATAS INDIVIDUALES (0-20 puntos)
    # ==========================================
    # La combo es tan fuerte como su pata más débil
    min_confidence = min(leg.confidence_score for leg in combo.legs)
    avg_confidence = sum(leg.confidence_score for leg in combo.legs) / len(combo.legs)
    
    conf_score = min_confidence * 0.6 + avg_confidence * 0.4  # weighted
    score += int(conf_score / 5)  # max 20 puntos (100/5)
    
    # ==========================================
    # BLOQUE 4: STEAM MOVE (0-15 puntos)
    # ==========================================
    steam_legs = sum(1 for leg in combo.legs if leg.steam_move and leg.steam_move.confirms)
    
    if steam_legs == len(combo.legs):
        score += 15  # TODAS las patas tienen steam confirmado
    elif steam_legs >= 1:
        score += 10  # al menos 1 pata con steam
    
    # Penalizar si alguna pata tiene steam EN CONTRA
    contra_legs = sum(1 for leg in combo.legs 
                      if leg.steam_move and not leg.steam_move.confirms)
    if contra_legs > 0:
        score -= 20  # penalización fuerte
    
    # ==========================================
    # BLOQUE 5: DIVERSIFICACIÓN (0-10 puntos)
    # ==========================================
    markets = set(leg.market for leg in combo.legs)
    leagues = set(leg.league_id for leg in combo.legs)
    
    # Bonus por mezclar mercados (goals + corners)
    if len(markets) >= 2:
        score += 5
    
    # Bonus por mezclar ligas
    if len(leagues) >= 2:
        score += 5
    
    # ==========================================
    # BLOQUE 6: PENALIZACIONES
    # ==========================================
    
    # Penalizar si cuota combinada > 5.0 (demasiado riesgo)
    if combo.combined_odds > 5.0:
        score -= 10
    elif combo.combined_odds > 4.0:
        score -= 5
    
    # Penalizar si muestra estadística es chica en alguna pata
    min_games = min(leg.team_games_played for leg in combo.legs)
    if min_games < 10:
        score -= 10
    elif min_games < 15:
        score -= 5
    
    # Penalizar si hay más de 3 patas (excepto Doble Gemela justificada)
    if len(combo.legs) > 3 and combo.type != "DOBLE_GEMELA":
        score -= 15
    
    return max(0, min(100, score))
```

### Tabla de acción por score

| Score | Clasificación | Acción | Stake |
|-------|--------------|--------|-------|
| 80-100 | ELITE | Apostar sin dudar | 1.5-2% bankroll |
| 65-79 | FUERTE | Apostar | 1-1.5% bankroll |
| 50-64 | SÓLIDA | Apostar con stake reducido | 0.5-1% bankroll |
| 35-49 | MARGINAL | Solo si no hay mejores opciones | 0.5% bankroll |
| < 35 | DESCARTAR | No apostar | $0 |

---

# 7. KELLY CRITERION PARA COMBINADAS CORRELACIONADAS

## 7.1 Kelly adaptado

```python
def kelly_combo(combo, bankroll, fraction=0.20):
    """
    Kelly Criterion adaptado para combinadas.
    
    Usamos 20% de Kelly (más conservador que para picks individuales)
    porque la varianza de combinadas es mayor.
    """
    p = combo.p_real           # probabilidad real (con correlación)
    b = combo.combined_odds - 1  # cuota neta
    q = 1 - p
    
    # Kelly completo
    kelly_full = (b * p - q) / b
    
    if kelly_full <= 0:
        return 0  # Kelly negativo = no apostar
    
    # Fracción de Kelly
    kelly_adj = kelly_full * fraction
    
    # Ajustar por score de combo
    score = combo.score
    if score >= 80:
        multiplier = 1.0
    elif score >= 65:
        multiplier = 0.80
    elif score >= 50:
        multiplier = 0.60
    else:
        multiplier = 0.40
    
    # Ajustar por número de patas (más patas = más conservador)
    legs_penalty = {2: 1.0, 3: 0.80, 4: 0.65}
    legs_mult = legs_penalty.get(len(combo.legs), 0.50)
    
    stake = bankroll * kelly_adj * multiplier * legs_mult
    
    # Límites duros
    max_stake = bankroll * 0.02  # nunca más del 2% en una combinada
    min_stake = 1.0
    
    return max(min_stake, min(max_stake, round(stake, 2)))
```

## 7.2 Tabla de stakes esperados (bankroll $100)

| Tipo combo | Score | Kelly × 0.20 | Ajustes | Stake final |
|-----------|-------|-------------|---------|-------------|
| GEMELA (2 patas) score 85 | 85 | ~2.0% | × 1.0 × 1.0 | $2.00 |
| GEMELA (2 patas) score 65 | 65 | ~1.5% | × 0.80 × 1.0 | $1.20 |
| TRIPLE (3 patas) score 75 | 75 | ~1.8% | × 0.80 × 0.80 | $1.15 |
| DOBLE_GEMELA (4 patas) score 80 | 80 | ~2.0% | × 1.0 × 0.65 | $1.30 |
| CROSS_MERCADO score 55 | 55 | ~1.2% | × 0.60 × 1.0 | $0.72 |

---

# 8. ÁRBOL DE DECISIÓN COMPLETO

```
PARA CADA PARTIDO CON VALUE DETECTADO:

¿Tiene value en goles 1H Y corners?
├── SÍ → ¿Correlación dinámica > 0.30?
│   ├── SÍ → ¿EV combinada (con correlación) > 5%?
│   │   ├── SÍ → GENERAR COMBO GEMELA
│   │   │   └── ¿Hay steam move en alguna pata?
│   │   │       ├── SÍ → MARCAR COMO SHARP_GEMELA (prioridad #1)
│   │   │       └── NO → GEMELA normal (prioridad #2)
│   │   └── NO → APOSTAR COMO PICKS INDIVIDUALES
│   └── NO → ¿Un pick tiene value y el otro no?
│       ├── SÍ → APOSTAR SOLO EL PICK CON VALUE (individual)
│       └── NO → SKIP AMBOS
├── SÍ (goles + under corners) → ¿Favorito > 75%?
│   ├── SÍ → ¿Correlación invertida > 0.15?
│   │   ├── SÍ → GENERAR COMBO GEMELA_INVERTIDA
│   │   └── NO → PICKS INDIVIDUALES
│   └── NO → NO APLICA INVERTIDA
└── NO (solo un mercado tiene value)
    └── AGREGAR A POOL DE PICKS INDIVIDUALES
        └── DISPONIBLE PARA COMBOS CROSS


PARA EL POOL DE PICKS INDIVIDUALES:

¿Hay 2+ picks en la misma ventana de tiempo?
├── SÍ → ¿Son de diferentes ligas?
│   ├── SÍ → ¿Son de diferentes mercados?
│   │   ├── SÍ → GENERAR COMBO CROSS_MERCADO (prioridad #4)
│   │   └── NO → GENERAR COMBO CROSS_LIGA (prioridad #6)
│   └── NO → SKIP COMBO (misma liga = correlación por factores externos)
└── NO → SOLO PICKS INDIVIDUALES


PARA COMBOS GEMELAS YA GENERADAS:

¿Hay 2+ Gemelas en la misma ventana?
├── SÍ → ¿Ambas tienen score >= 70 y EV >= 10%?
│   ├── SÍ → GENERAR DOBLE_GEMELA (4 patas, prioridad #7)
│   └── NO → MANTENER COMO GEMELAS SEPARADAS
└── NO → MANTENER COMO GEMELA INDIVIDUAL


¿Hay Gemela + pick individual en misma ventana?
├── SÍ → ¿EV del triple > 8%?
│   ├── SÍ → GENERAR TRIPLE_CORRELACIONADO (prioridad #5)
│   └── NO → MANTENER GEMELA + PICK SEPARADOS
└── NO → MANTENER SEPARADOS
```

---

# 9. LÓGICA DE CONTEXTO DE PARTIDO

## 9.1 Factores contextuales que afectan la combinada

```python
def get_match_context(fixture):
    """
    Analiza el contexto del partido para ajustar las predicciones.
    Retorna multiplicadores que se aplican a las probabilidades.
    """
    context = {
        "goals_multiplier": 1.0,
        "corners_multiplier": 1.0,
        "correlation_adj": 0.0,
        "flags": []
    }
    
    # DERBY
    if is_derby(fixture):
        context["goals_multiplier"] *= 1.05  # derbis son más goleadores
        context["corners_multiplier"] *= 1.08  # mucha más intensidad
        context["correlation_adj"] += 0.08
        context["flags"].append("DERBY")
    
    # ÚLTIMA JORNADA / JORNADA DECISIVA
    if is_decisive_matchday(fixture):
        context["goals_multiplier"] *= 1.08
        context["corners_multiplier"] *= 1.10
        context["correlation_adj"] += 0.06
        context["flags"].append("DECISIVE")
    
    # PARTIDO ENTRE SEMANA (fatiga)
    if is_midweek(fixture):
        context["goals_multiplier"] *= 0.95  # menos goles por fatiga
        context["corners_multiplier"] *= 0.97
        context["flags"].append("MIDWEEK_FATIGUE")
    
    # EQUIPO EN RACHA GOLEADORA (últimos 3 partidos > 2 goles cada uno)
    if team_on_scoring_streak(fixture.team_a) or team_on_scoring_streak(fixture.team_b):
        context["goals_multiplier"] *= 1.06
        context["flags"].append("SCORING_STREAK")
    
    # PRIMER PARTIDO POST-PARÓN INTERNACIONAL
    if is_post_international_break(fixture):
        context["goals_multiplier"] *= 0.92  # partidos post-parón son más cerrados
        context["corners_multiplier"] *= 0.95
        context["correlation_adj"] -= 0.05
        context["flags"].append("POST_BREAK")
    
    # CLIMA EXTREMO
    weather = get_weather(fixture)
    if weather and weather.wind_speed > 40:  # km/h
        context["goals_multiplier"] *= 0.93
        context["corners_multiplier"] *= 1.05  # viento = más centros fallidos = más corners
        context["correlation_adj"] -= 0.10  # ROMPE la correlación goles-corners
        context["flags"].append("STRONG_WIND")
    
    if weather and weather.rain_heavy:
        context["goals_multiplier"] *= 0.95
        context["corners_multiplier"] *= 1.03
        context["flags"].append("HEAVY_RAIN")
    
    # ROTACIÓN (si el equipo juega Champions/Europa entre semana)
    if has_european_fixture_within_3_days(fixture.team_a):
        context["goals_multiplier"] *= 0.90
        context["corners_multiplier"] *= 0.93
        context["flags"].append(f"ROTATION_{fixture.team_a.name}")
    
    if has_european_fixture_within_3_days(fixture.team_b):
        context["goals_multiplier"] *= 0.90
        context["corners_multiplier"] *= 0.93
        context["flags"].append(f"ROTATION_{fixture.team_b.name}")
    
    return context
```

## 9.2 Aplicación del contexto a la combinada

```python
def apply_context_to_combo(combo, contexts):
    """
    Aplica los factores contextuales a cada pata de la combinada.
    """
    for leg in combo.legs:
        ctx = contexts[leg.fixture_id]
        
        if "goals" in leg.market or "1h" in leg.market:
            leg.prob *= ctx["goals_multiplier"]
        elif "corner" in leg.market:
            leg.prob *= ctx["corners_multiplier"]
        
        # Ajustar correlación si es combo de mismo partido
        if combo.same_match:
            combo.correlation += ctx["correlation_adj"]
    
    # Re-calcular EV con probabilidades ajustadas
    combo.recalculate_ev()
    
    # Agregar flags al output para que el usuario sepa POR QUÉ
    combo.context_flags = []
    for fixture_id, ctx in contexts.items():
        combo.context_flags.extend(ctx["flags"])
    
    return combo
```

---

# 10. DETECCIÓN DE TRAMPAS (ANTI-PATTERNS)

## 10.1 Patrones que el bot debe EVITAR

```python
ANTI_PATTERNS = [
    {
        "name": "FALSA_CORRELACIÓN",
        "description": "Combo donde la correlación parece alta pero el mecanismo causal no existe",
        "ejemplo": "Over 0.5 goles 1H + Under 8.5 corners en partido de favorito extremo (85%+). El favorito puede meter gol de penalty sin generar corners.",
        "detección": "prob_favorite > 0.85 AND combo_type == GEMELA AND corners_direction == OVER",
        "acción": "DESCARTAR combo, apostar picks individuales"
    },
    {
        "name": "TRAMPA_DE_PROMEDIO",
        "description": "Equipo con avg alto de corners pero distribución bimodal (3 partidos con 15 corners + 5 partidos con 5)",
        "detección": "corners_std_dev > corners_avg * 0.5",
        "acción": "Reducir confianza -15 puntos"
    },
    {
        "name": "MUESTRA_CONTAMINADA",
        "description": "Equipo que cambió de técnico recientemente — stats históricas no reflejan el estilo actual",
        "detección": "coach_change_within_last_5_games",
        "acción": "Solo usar datos POST cambio de técnico. Si < 5 partidos, SKIP"
    },
    {
        "name": "EFECTO_CAMPEÓN",
        "description": "Equipo ya campeón sin motivación en últimas jornadas",
        "detección": "team_is_champion AND remaining_games <= 3",
        "acción": "Reducir goals_multiplier × 0.85, corners_multiplier × 0.90"
    },
    {
        "name": "EFECTO_DESCENDIDO",
        "description": "Equipo ya descendido, puede jugar sin presión (a veces más abierto, a veces desganado)",
        "detección": "team_is_relegated AND remaining_games <= 3",
        "acción": "Aumentar varianza. NO apostar en combinadas, solo picks individuales con edge alto"
    },
    {
        "name": "COMBO_INFLADA",
        "description": "Combinada con cuota atractiva pero edge real < 3% en cada pata",
        "detección": "all legs have edge < 0.03 individually",
        "acción": "DESCARTAR. La correlación no salva picks sin edge individual"
    },
    {
        "name": "CONCENTRACIÓN_EXCESIVA",
        "description": "3+ picks del mismo partido o misma liga en un día",
        "detección": "count(picks_same_fixture) > 2 OR count(picks_same_league) > 3",
        "acción": "Forzar diversificación. Quitar picks con menor EV"
    }
]

def check_anti_patterns(combo, daily_picks):
    """
    Verifica si la combinada cae en algún anti-pattern.
    Retorna warnings y ajustes.
    """
    warnings = []
    
    for pattern in ANTI_PATTERNS:
        if evaluate_pattern(pattern, combo, daily_picks):
            warnings.append({
                "pattern": pattern["name"],
                "description": pattern["description"],
                "action": pattern["acción"]
            })
            apply_pattern_action(combo, pattern)
    
    return warnings
```

---

# 11. HEDGE LOGIC (COBERTURA IN-PLAY)

## 11.1 Cuándo hacer hedge

```python
def evaluate_hedge(combo, live_state):
    """
    Durante el partido, evalúa si conviene hacer cashout parcial
    o apostar en contra para asegurar ganancia.
    
    Solo aplica a combinadas donde la primera pata ya ganó.
    """
    completed_legs = [l for l in combo.legs if l.result is not None]
    pending_legs = [l for l in combo.legs if l.result is None]
    
    if not completed_legs or not pending_legs:
        return None
    
    # Todas las patas completadas ganaron
    all_won = all(l.result == "WIN" for l in completed_legs)
    
    if not all_won:
        return {"action": "COMBO_PERDIDA", "hedge": False}
    
    # Calcular ganancia potencial
    potential_profit = combo.stake * combo.combined_odds - combo.stake
    
    # Calcular probabilidad de que las patas pendientes ganen
    pending_prob = 1.0
    for leg in pending_legs:
        pending_prob *= leg.live_prob  # probabilidad actualizada in-play
    
    # ¿Vale la pena hacer hedge?
    # Hedge si: ganancia potencial > $X Y probabilidad pendiente < 60%
    if potential_profit > combo.stake * 2 and pending_prob < 0.60:
        # Calcular apuesta de hedge
        # Apostar al CONTRA de las patas pendientes
        hedge_odds = get_live_odds_against(pending_legs)
        hedge_stake = (combo.stake * combo.combined_odds) / (hedge_odds + 1)
        guaranteed_profit = combo.stake * combo.combined_odds - combo.stake - hedge_stake
        
        if guaranteed_profit > 0:
            return {
                "action": "HEDGE_RECOMENDADO",
                "hedge_stake": round(hedge_stake, 2),
                "guaranteed_profit": round(guaranteed_profit, 2),
                "potential_profit_without_hedge": round(potential_profit, 2),
                "pending_probability": pending_prob,
                "reasoning": f"Asegurar ${guaranteed_profit:.2f} vs arriesgar por ${potential_profit:.2f}"
            }
    
    return {"action": "MANTENER", "hedge": False, "reason": "Probabilidad pendiente alta o ganancia insuficiente"}
```

---

# 12. BACKTESTING FRAMEWORK

## 12.1 Simulación histórica

```python
def backtest_combo_strategy(historical_data, start_date, end_date, initial_bankroll=100):
    """
    Simula la estrategia de combinadas sobre datos históricos.
    Usa datos de API-Football de temporadas pasadas.
    """
    bankroll = initial_bankroll
    all_bets = []
    daily_results = []
    
    for date in date_range(start_date, end_date):
        # Simular el bot con datos históricos
        fixtures = historical_data.get_fixtures(date)
        
        if not fixtures:
            continue
        
        # Ejecutar scoring y value detection
        picks = []
        for fixture in fixtures:
            goals_score = score_goals_1h(fixture, historical=True)
            corners_score = score_corners(fixture, historical=True)
            
            # Obtener cuotas históricas de cierre
            odds = historical_data.get_closing_odds(fixture.id)
            
            value_goals = detect_value_goals(goals_score.prob, odds.get("over_05_1h", {}).get("price", 99))
            value_corners = detect_value_corners(corners_score.expected, 9.5, 
                                                  odds.get("over_95_corners", {}).get("over", 99),
                                                  odds.get("over_95_corners", {}).get("under", 99))
            
            if value_goals.has_value:
                picks.append(create_pick(fixture, "goals_1h", "OVER", value_goals, odds))
            if value_corners.direction != "SKIP":
                picks.append(create_pick(fixture, "corners", value_corners.direction, value_corners, odds))
        
        # Generar combinadas
        combos = generate_all_combos(picks)
        selected = optimize_combo_portfolio(combos, bankroll)
        
        # Simular resultados
        day_profit = 0
        for combo in selected:
            result = simulate_combo_result(combo, historical_data)
            profit = result.profit
            day_profit += profit
            bankroll += profit
            all_bets.append({
                "date": date,
                "type": combo.type,
                "legs": len(combo.legs),
                "odds": combo.combined_odds,
                "stake": combo.stake,
                "result": result.outcome,
                "profit": profit,
                "bankroll_after": bankroll
            })
        
        daily_results.append({
            "date": date,
            "combos_placed": len(selected),
            "day_profit": day_profit,
            "bankroll": bankroll
        })
    
    # Métricas finales
    total_bets = len(all_bets)
    wins = sum(1 for b in all_bets if b["result"] == "WIN")
    total_staked = sum(b["stake"] for b in all_bets)
    total_profit = bankroll - initial_bankroll
    
    return {
        "period": f"{start_date} to {end_date}",
        "total_combos": total_bets,
        "win_rate": wins / total_bets if total_bets > 0 else 0,
        "roi": total_profit / total_staked if total_staked > 0 else 0,
        "total_profit": total_profit,
        "final_bankroll": bankroll,
        "max_drawdown": calculate_max_drawdown(daily_results),
        "sharpe_ratio": calculate_sharpe(daily_results),
        "breakdown_by_type": breakdown_by_combo_type(all_bets),
        "best_combo_type": get_best_performing_type(all_bets),
        "worst_combo_type": get_worst_performing_type(all_bets),
        "monthly_results": aggregate_monthly(daily_results)
    }
```

## 12.2 Métricas de backtesting

| Métrica | Excelente | Bueno | Neutro | Malo |
|---------|-----------|-------|--------|------|
| ROI combinadas | > +12% | +5-12% | 0-5% | < 0% |
| Win rate GEMELA (2 patas) | > 45% | 38-45% | 30-38% | < 30% |
| Win rate TRIPLE (3 patas) | > 30% | 22-30% | 15-22% | < 15% |
| Max drawdown | < 15% | 15-25% | 25-35% | > 35% |
| Sharpe ratio | > 1.5 | 1.0-1.5 | 0.5-1.0 | < 0.5 |
| Hidden edge avg (correlación) | > 5% | 3-5% | 1-3% | < 1% |

## 12.3 Calibración de pesos

```python
def calibrate_weights(backtest_results):
    """
    Después del backtesting, ajustar los pesos del modelo.
    Esto se hace MANUALMENTE revisando los resultados, no automáticamente.
    """
    recommendations = []
    
    # Si Combo GEMELA tiene mejor ROI que CROSS
    if backtest_results.gemela_roi > backtest_results.cross_roi * 1.5:
        recommendations.append("Aumentar correlación base en +0.05 para GEMELA")
    
    # Si algún mercado sistemáticamente pierde
    for market, stats in backtest_results.by_market.items():
        if stats.roi < -0.05:
            recommendations.append(f"REVISAR modelo de {market}: ROI negativo {stats.roi:.1%}")
    
    # Si alguna liga sistemáticamente pierde
    for league, stats in backtest_results.by_league.items():
        if stats.roi < -0.05:
            recommendations.append(f"QUITAR liga {league}: ROI negativo {stats.roi:.1%}")
    
    # Si max drawdown es alto
    if backtest_results.max_drawdown > 0.25:
        recommendations.append("Reducir Kelly fraction de 0.20 a 0.15")
        recommendations.append("Reducir max_combos_per_day de 5 a 3")
    
    return recommendations
```

---

# 13. PSEUDOCÓDIGO COMPLETO DEL MOTOR DE COMBINADAS

```python
def run_combo_engine(date, bankroll, value_picks):
    """
    Motor completo de combinadas.
    Recibe los picks con value ya detectado y genera las mejores combinadas.
    """
    
    # ==========================================
    # FASE 1: OBTENER CONTEXTO DE CADA PARTIDO
    # ==========================================
    contexts = {}
    for pick in value_picks:
        if pick.fixture_id not in contexts:
            contexts[pick.fixture_id] = get_match_context(pick.fixture)
    
    # Aplicar contexto a probabilidades
    for pick in value_picks:
        ctx = contexts[pick.fixture_id]
        if "goals" in pick.market:
            pick.prob_adjusted = pick.prob * ctx["goals_multiplier"]
        elif "corner" in pick.market:
            pick.prob_adjusted = pick.prob * ctx["corners_multiplier"]
    
    # ==========================================
    # FASE 2: AGRUPAR POR VENTANA DE TIEMPO
    # ==========================================
    windows = group_by_time_window(value_picks, window_minutes=180)
    
    all_combos = []
    
    for window_name, window_picks in windows.items():
        
        # ==========================================
        # FASE 3: DETECTAR COMBOS GEMELAS (mismo partido)
        # ==========================================
        fixtures_in_window = set(p.fixture_id for p in window_picks)
        
        for fixture_id in fixtures_in_window:
            fixture_picks = [p for p in window_picks if p.fixture_id == fixture_id]
            goals_picks = [p for p in fixture_picks if "goals" in p.market or "1h" in p.market]
            corner_picks = [p for p in fixture_picks if "corner" in p.market]
            
            # GEMELA: goles + corners Over
            if goals_picks and corner_picks:
                for gp in goals_picks:
                    for cp in corner_picks:
                        if cp.direction == "OVER":
                            combo = build_gemela(gp, cp, contexts[fixture_id])
                            if combo and combo.ev >= 0.05:
                                all_combos.append(combo)
            
            # GEMELA INVERTIDA: goles Over + corners Under
            if goals_picks:
                corner_under = [p for p in corner_picks if p.direction == "UNDER"]
                if corner_under:
                    prob_fav = max(fixture_picks[0].fixture.prob_home, 
                                   fixture_picks[0].fixture.prob_away)
                    if prob_fav > 0.65:  # solo en partidos con favorito claro
                        for gp in goals_picks:
                            for cp in corner_under:
                                combo = build_gemela_invertida(gp, cp, contexts[fixture_id])
                                if combo and combo.ev >= 0.03:
                                    all_combos.append(combo)
        
        # ==========================================
        # FASE 4: DETECTAR COMBOS CROSS
        # ==========================================
        
        # CROSS-MERCADO: goles de partido A + corners de partido B
        for i, pick_a in enumerate(window_picks):
            for pick_b in window_picks[i+1:]:
                if pick_a.fixture_id == pick_b.fixture_id:
                    continue
                if pick_a.league_id == pick_b.league_id:
                    continue  # evitar misma liga (correlación externa)
                
                # Preferir diferentes mercados
                different_markets = (("goals" in pick_a.market) != ("goals" in pick_b.market))
                
                combined_odds = pick_a.best_odds * pick_b.best_odds
                p_joint = pick_a.prob_adjusted * pick_b.prob_adjusted
                ev = (p_joint * combined_odds) - 1
                
                if ev >= 0.05:
                    combo_type = "CROSS_MERCADO" if different_markets else "CROSS_LIGA"
                    combo = {
                        "type": combo_type,
                        "legs": [pick_a, pick_b],
                        "combined_odds": combined_odds,
                        "p_joint": p_joint,
                        "ev": ev,
                        "same_match": False,
                        "correlation": 0,
                        "window": window_name
                    }
                    all_combos.append(combo)
        
        # ==========================================
        # FASE 5: DETECTAR TRIPLES
        # ==========================================
        gemelas = [c for c in all_combos if c["type"] in ("GEMELA", "SHARP_GEMELA")]
        individual_remaining = [p for p in window_picks 
                                if p.fixture_id not in 
                                set(l.fixture_id for g in gemelas for l in g.get("legs", []))]
        
        for gemela in gemelas:
            for pick in individual_remaining:
                if pick.fixture_id in [l.fixture_id for l in gemela["legs"]]:
                    continue
                if pick.league_id in [l.league_id for l in gemela["legs"]]:
                    continue
                
                combined_odds = gemela["combined_odds"] * pick.best_odds
                p_triple = gemela["p_joint"] * pick.prob_adjusted
                ev = (p_triple * combined_odds) - 1
                
                if ev >= 0.08:
                    triple = {
                        "type": "TRIPLE_CORRELACIONADO",
                        "legs": gemela["legs"] + [pick],
                        "combined_odds": combined_odds,
                        "p_joint": p_triple,
                        "ev": ev,
                        "same_match": False,
                        "correlation": gemela["correlation"],
                        "window": window_name
                    }
                    all_combos.append(triple)
        
        # ==========================================
        # FASE 6: DETECTAR DOBLE GEMELA
        # ==========================================
        if len(gemelas) >= 2:
            doble = detect_double_gemela(gemelas)
            if doble:
                all_combos.append(doble)
    
    # ==========================================
    # FASE 7: APLICAR SHARP MODIFIER
    # ==========================================
    for combo in all_combos:
        combo = apply_sharp_modifier(combo)
    
    # ==========================================
    # FASE 8: CHECK ANTI-PATTERNS
    # ==========================================
    clean_combos = []
    for combo in all_combos:
        warnings = check_anti_patterns(combo, value_picks)
        combo["warnings"] = warnings
        
        # Si tiene anti-pattern crítico, descartar
        critical_patterns = ["FALSA_CORRELACIÓN", "COMBO_INFLADA"]
        if any(w["pattern"] in critical_patterns for w in warnings):
            continue
        
        clean_combos.append(combo)
    
    # ==========================================
    # FASE 9: SCORING Y OPTIMIZACIÓN
    # ==========================================
    for combo in clean_combos:
        combo["score"] = score_combo(combo)
        combo["stake"] = kelly_combo(combo, bankroll)
    
    # Filtrar por score mínimo
    clean_combos = [c for c in clean_combos if c["score"] >= 35]
    
    # Optimizar portafolio
    selected = optimize_combo_portfolio(clean_combos, bankroll, max_combos=5)
    
    # ==========================================
    # FASE 10: OUTPUT FINAL
    # ==========================================
    return {
        "date": date,
        "total_candidates": len(all_combos),
        "after_anti_patterns": len(clean_combos),
        "selected_combos": selected,
        "total_stake": sum(c["stake"] for c in selected),
        "total_ev_weighted": sum(c["ev"] * c["stake"] for c in selected),
        "alerts": generate_combo_alerts(selected),
        "summary": {
            "gemelas": len([c for c in selected if "GEMELA" in c["type"]]),
            "cross": len([c for c in selected if "CROSS" in c["type"]]),
            "triples": len([c for c in selected if "TRIPLE" in c["type"]]),
            "sharp_confirmed": len([c for c in selected if "SHARP" in c["type"]]),
            "avg_score": sum(c["score"] for c in selected) / len(selected) if selected else 0,
            "avg_ev": sum(c["ev"] for c in selected) / len(selected) if selected else 0,
        }
    }
```

---

*Documento de Combinadas Nivel Dios — generado 23 de marzo de 2026.*
*Los factores de correlación empíricos (0.35-0.65) son estimaciones iniciales.*
*DEBEN calibrarse con backtesting sobre data real de 2024/25.*
*El factor de correlación 1.08 del documento anterior se reemplaza por el cálculo dinámico de esta sección.*
