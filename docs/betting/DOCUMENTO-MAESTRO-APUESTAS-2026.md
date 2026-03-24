# DOCUMENTO MAESTRO: SISTEMA DE APUESTAS DEPORTIVAS
## Goles Primera Mitad + Corners + Sharp Betting
### Base de Conocimiento para Bot Automatizado — Marzo 2026

---

# ÍNDICE

1. FILOSOFÍA Y PRINCIPIOS FUNDAMENTALES
2. MÓDULO 1: GOLES PRIMERA MITAD
3. MÓDULO 2: CORNERS
4. MÓDULO 3: ESTRATEGIA SHARP (CLV / VALUE BETTING)
5. COBERTURA DE APIs — MAPA COMPLETO
6. CLASIFICACIÓN DE LIGAS POR TIER
7. DIVISIONES INFERIORES — EL EDGE OCULTO
8. VARIABLES PREDICTORAS
9. PIPELINE OPERATIVO DEL BOT
10. COMBINADAS INTELIGENTES — LÓGICA DE CORRELACIÓN
11. VENTANAS DE TIEMPO — HORARIOS PARA COMBINADAS
12. BANKROLL Y GESTIÓN
13. CALENDARIO OPERATIVO
14. FUENTES DE DATOS Y URLS

---

# 1. FILOSOFÍA Y PRINCIPIOS FUNDAMENTALES

## Verdades que toman años aprender:

**1. No predecimos quién gana — identificamos cuándo las casas se equivocan.**
El negocio no es acertar resultados. Es encontrar las veces que la probabilidad REAL supera lo que las cuotas implican. Eso se llama VALUE y es la ÚNICA forma de ganar a largo plazo.

**2. Closing Line Value (CLV) es el indicador REAL, no el win rate.**
Si apostás a cuota 2.5 y cuando cierra el mercado la cuota bajó a 2.2, estás "ganándole" al mercado consistentemente. Los sharps miden CLV, no victorias a corto plazo.

**3. Las casas de apuestas NO son invencibles — pero son muy buenas en ligas principales.**
En Premier League, Bundesliga, La Liga: casi cero value. Sus modelos son perfectos. Pero en segundas divisiones, terceras divisiones, ligas nórdicas de verano: dedican una fracción del recurso. AHÍ es donde un bot con datos puede ganar.

**4. Dos mercados complementarios son mejor que uno.**
Goles primera mitad y corners usan variables predictoras DIFERENTES (finalización vs presión ofensiva). No se canibalizan — se multiplican las oportunidades de value.

**5. La consistencia mata la espectacularidad.**
Apostamos 1-3% del bankroll por pick. Sin "apuesta del siglo". Sin parlays de 10 patas. Matemáticas frías, 100+ apuestas para validar.

---

# 2. MÓDULO 1: GOLES PRIMERA MITAD

## 2.1 Contexto estadístico

- Aproximadamente el 75% de todos los partidos tienen al menos 1 gol en el primer tiempo
- El 44% de TODOS los goles del partido caen en primera mitad
- Los goles explotan entre el minuto 30 y el 45+ (período más goleador)
- Los primeros 15 minutos son los más secos

## 2.2 Ranking global — Ligas con más goles en primera mitad (2025/26)

Fuente: Over25Tips.com, actualizado 21 de marzo 2026 (últimas 200 jornadas por liga).

### TOP 20 GLOBAL (incluye ligas menores):

| Rank | Liga | Avg Goles 1H | Nota |
|------|------|-------------|------|
| 1 | Finland Kolmonen | 1.86 | Liga menor, sin odds confiables |
| 2 | Germany Verbandsliga | 1.78 | Liga regional, sin odds |
| 3 | Wales Championship North | 1.76 | Sin odds |
| 11 | **Denmark Superligaen** | **1.55** | **ELITE — La #1 entre ligas con odds** |
| 13 | **Croatia 1.NL** | **1.54** | **Sorpresa de la temporada** |
| 20 | **Holland Eredivisie** | **1.40** | **Consistente top** |
| ~25 | **Germany Bundesliga** | **~1.35** | **Alta pero cuotas ajustadas** |
| ~30 | **England Premier League** | **~1.30** | **Bien modelada, poco value** |

## 2.3 Datos detallados: Eredivisie 2025/26 (Primera Mitad)

Fuente: SoccerStats.com — 25 jornadas (datos al 22/mar/2026)

**Promedios de liga:**
- Over 0.5 1H: **81.3%**
- Over 1.5 1H: **41.8%**
- Over 2.5 1H: **16.9%**
- BTS 1H: **27.6%**

#### Equipos por Over 0.5 Primera Mitad:

| Equipo | GP | Avg Goles 1H | Over 0.5 1H | Over 1.5 1H | BTS 1H |
|--------|-----|-------------|-------------|-------------|--------|
| PSV Eindhoven | 25 | 2.16 | **96%** | 68% | 40% |
| Fortuna Sittard | 25 | 1.76 | **96%** | 48% | 44% |
| NEC Nijmegen | 25 | 1.80 | **92%** | 60% | 52% |
| Ajax Amsterdam | 25 | 1.64 | **92%** | 52% | 28% |
| Feyenoord | 25 | 1.68 | **92%** | 40% | 24% |
| PEC Zwolle | 25 | 1.84 | **88%** | 60% | 40% |
| Heracles Almelo | 25 | 1.80 | **88%** | 44% | 32% |
| Heerenveen | 25 | 1.44 | 84% | 44% | 32% |
| FC Volendam | 25 | 1.32 | 84% | 44% | 20% |
| FC Utrecht | 25 | 1.16 | 84% | 32% | 8% |
| NAC Breda | 25 | 1.12 | 76% | 24% | 20% |
| Sparta | 25 | 0.96 | 76% | 16% | 8% |
| AZ Alkmaar | 25 | 1.68 | 72% | 60% | 36% |
| Go Ahead Eagles | 25 | 1.36 | 72% | 40% | 28% |
| Telstar | 25 | 1.24 | 72% | 36% | 24% |
| FC Twente | 25 | 0.88 | **68%** | 20% | 12% |
| Excelsior | 25 | 1.20 | 68% | 32% | 20% |
| FC Groningen | 25 | 1.12 | 64% | 32% | 28% |

#### Insights para el bot:
- PSV y Fortuna Sittard: 96% Over 0.5 1H — las máquinas
- NEC Nijmegen: dato oculto — 52% BTS 1H, ideal para Over 1.5 1H
- PEC Zwolle: perfil VISITANTE brutal — 2.23 avg goles 1H fuera (92% Over 0.5 away)
- FC Twente: TRAMPA — solo 68% Over 0.5 1H, 0.88 avg. EVITAR
- AZ Alkmaar: volátil — avg alto (1.68) pero solo 72% Over 0.5 1H

#### LOCAL vs VISITANTE:

| Equipo | Over 0.5 1H Casa | Over 0.5 1H Fuera |
|--------|-----------------|-------------------|
| PSV Eindhoven | 100% | 92% |
| Ajax Amsterdam | 100% | 83% |
| Fortuna Sittard | 92% | 100% |
| PEC Zwolle | 83% | 92% |
| FC Twente | 69% | 67% |

## 2.4 Mercados específicos para goles 1H

### Over 0.5 Primera Mitad (al menos 1 gol)
- Win rate esperado: 78-85% en ligas Tier 1
- Cuotas típicas: @1.10 - @1.30
- Necesitás: >85% win rate para ser rentable a @1.15
- Uso: Alta confianza, bajo riesgo. Ideal para accas de 3-4 picks

### Over 1.5 Primera Mitad (al menos 2 goles)
- Win rate esperado: 38-48% en ligas Tier 1
- Cuotas típicas: @2.00 - @3.00
- Necesitás: >40% win rate para ser rentable a @2.50
- Uso: MÁS riesgo pero MUCHO más retorno. Aquí está el VALUE real.
- Filtro extra: Solo cuando AMBOS equipos tienen avg >1.4 goles 1H combinados + BTS 1H >30%

### Cuándo usar Over 1.5 vs Over 0.5:

| Escenario | Mercado | Por qué |
|-----------|---------|---------|
| PSV vs NEC (ambos >90%) | Over 1.5 1H | Ambos atacan. NEC 60% Over 1.5 |
| PSV vs Twente (96% vs 68%) | Over 0.5 1H | Twente cierra partidos |
| NEC vs PEC Zwolle (ambos >88%) | Over 1.5 1H | Ambos ofensivos |
| Ajax vs Groningen (92% vs 64%) | Over 0.5 1H o SKIP | Groningen baja el avg |

---

# 3. MÓDULO 2: CORNERS

## 3.1 Por qué corners es un mercado ELITE para sharps

- Las casas dedican su MEJOR talento a modelar goles (mercado principal, 80% del dinero)
- Corners es mercado secundario: modelado con MENOS precisión, cuotas con MÁS ineficiencias
- Corners son MÁS predecibles que goles: dependen de presión ofensiva, posesión, estilo de juego — variables más estables
- Los corners en los últimos 10 minutos son 1.5x más frecuentes que en otros períodos
- Los corners correlacionan con tiros y ataques, no con calidad de finalización

## 3.2 Ranking de ligas por corners por partido (2025/26)

Fuentes: APWin.com, FootyStats, datos verificados marzo 2026.

| Liga | Avg Corners/Partido | Equipo más corners | Equipo menos corners |
|------|--------------------|--------------------|---------------------|
| **Eredivisie** | **10.43** | PSV (11.55) | Twente (9.19) |
| **Premier League** | **9.85** | West Ham (11.57) | Sunderland (8.60) |
| **Championship** | **~9.80** | — | — |
| **Bundesliga** | **9.64** | Wolfsburg (11.34) | E. Frankfurt (8.54) |
| **Superligaen** | **~9.60** | — | — |
| **Serie A** | **~9.50** | — | — |
| **Champions League** | **9.49** | — | — |
| **La Liga** | **~9.40** | — | — |
| **Ligue 1** | **9.32** | Nice (10.74) | Strasbourg (8.43) |
| **Liga Portugal** | **9.24** | Nacional (10.37) | Braga (8.28) |
| **2. Bundesliga** | **~9.20** | — | — |
| **Veikkausliiga** | **~9.10** | — | — |
| **3. Liga** | **~9.10** | — | — |

## 3.3 Equipos destacados para corners (datos verificados)

### Eredivisie — Corners a favor por equipo:
- Feyenoord: 7.59 corners/partido (más que cualquier equipo)
- PSV: partido promedio total = 11.55 corners
- Twente: 9.19 corners totales (el más bajo — UNDER candidate)

### Premier League — Extremos:
- Newcastle: 6.5 corners a favor/partido (máximo)
- Wolverhampton: 3.19 corners a favor/partido (mínimo)
- West Ham: 6.57 corners EN CONTRA/partido (concede más que nadie)
- Arsenal: 3.26 corners en contra/partido (concede menos)

### Bundesliga:
- Bayern München: 6.17 corners a favor/partido
- Wolfsburg: 11.34 corners totales (partido promedio más alto)
- Eintracht Frankfurt: 8.54 corners totales (más bajo)

### Ligue 1:
- Lens: 5.85 corners a favor/partido (máximo)
- Nice: 10.74 corners totales/partido

## 3.4 Mercados de corners para el bot

### Over 9.5 Corners totales (línea más común)
- Línea estándar en la mayoría de casas
- En Eredivisie (avg 10.43): probabilidad base ~55-60%
- En Premier League (avg 9.85): probabilidad base ~50%
- Donde hay VALUE: segundas divisiones donde la casa usa avg de liga pero el matchup específico es mucho más alto

### Over 4.5 Corners primera mitad
- Mercado menos líquido = cuotas peor modeladas = más value
- El 44% de corners totales caen en primera mitad (~4.3 de 9.8 avg)
- Matchups con equipos de presión alta en 1H son el sweet spot

### Asian Corners Handicap
- Equipos con mucha diferencia de corners a favor vs en contra
- Ejemplo: Newcastle (6.5 a favor) vs Wolverhampton (3.19 a favor) = handicap claro
- Las casas a veces no ajustan bien el handicap por matchup

## 3.5 Variables predictoras para corners (orden de importancia)

| # | Variable | Qué mide | Fuente |
|---|----------|----------|--------|
| 1 | Avg corners totales por equipo | Cuántos corners genera el matchup | API-Football statistics |
| 2 | Avg corners a favor por equipo | Poder ofensivo de bandas/tiros | API-Football statistics |
| 3 | Avg corners en contra por equipo | Presión que recibe | API-Football statistics |
| 4 | Tiros por partido (shots) | Correlaciona directamente con corners | API-Football statistics |
| 5 | Posesión % | Equipos con >55% posesión sacan más corners | API-Football statistics |
| 6 | Forma reciente (últimos 5 partidos) | Corners en últimos 5 | API-Football fixtures |
| 7 | H2H corners | Historial directo de corners | API-Football H2H |
| 8 | Local vs Visitante | Locales sacan más corners en promedio | API-Football fixtures |

**Diferencia clave con goles 1H:** Los corners NO dependen de calidad de finalización. Dependen de PRESIÓN OFENSIVA. Un equipo puede no meter goles pero sacar 8 corners porque ataca mucho y sus tiros son bloqueados/desviados.

---

# 4. MÓDULO 3: ESTRATEGIA SHARP (CLV / VALUE BETTING)

## 4.1 Concepto central

No apostamos "porque Eredivisie tiene muchos goles." Apostamos cuando NUESTRA probabilidad calculada supera la probabilidad implícita en la cuota. Eso es VALUE.

## 4.2 Cálculo de Value

```
probabilidad_implícita = 1 / cuota_decimal
```

Si `prob_propia > probabilidad_implícita + 0.05` → HAY VALUE → APOSTAR
Si `prob_propia > probabilidad_implícita` pero < 0.05 → NO HAY VALUE → SKIP
Si `prob_propia < probabilidad_implícita` → CUOTA CORRECTA → SKIP

**Ejemplo Goles 1H:**
- PSV vs NEC → prob propia: 94% → cuota @1.20 (implica 83.3%) → VALUE 10.7% → APOSTAR

**Ejemplo Corners:**
- Newcastle vs West Ham → avg combinado 12.0+ corners → prob Over 9.5: ~80% → cuota @1.60 (implica 62.5%) → VALUE 17.5% → APOSTAR FUERTE

## 4.3 Steam Moves (Movimientos bruscos de cuota)

Cuando una cuota se mueve >10% en menos de 2 horas antes del partido, "dinero inteligente" está entrando.

- Si cuota de Over BAJA >10% → CONFIRMA la señal
- Si cuota de Over SUBE >10% → PELIGRO, puede haber info oculta (lesión, rotación)

## 4.4 CLV Tracking (Closing Line Value)

Después de cada apuesta, registrar:
- Cuota al momento de apostar
- Cuota de cierre (última cuota antes del partido)
- CLV = (1/cuota_apostada) - (1/cuota_cierre)

Si CLV promedio es POSITIVO después de 50+ apuestas → el sistema FUNCIONA.

## 4.5 Camuflaje orgánico

Ver sección 10.4 — el camuflaje se logra de forma natural con la diversificación multi-mercado (goles + corners) y combinadas cross-liga. No se necesitan apuestas recreativas de relleno.

---

# 5. COBERTURA DE APIs — MAPA COMPLETO

## 5.1 API-Football (stats, fixtures, lineups, odds integradas)

- URL: https://www.api-football.com/coverage
- Docs: https://www.api-football.com/documentation-v3
- Cobertura: **1,232 ligas y copas**
- Todas las competiciones incluidas en todos los planes
- Stats de corners por partido: SÍ
- Stats de primera mitad: SÍ (scores por mitad en fixtures)
- Odds integradas: SÍ (Bet365, 1xBet, William Hill, etc.)

## 5.2 The Odds API (cuotas multi-bookmaker)

- URL: https://the-odds-api.com/sports-odds-data/sports-apis.html
- Docs: https://the-odds-api.com/liveapi/guides/v4/
- Football: https://the-odds-api.com/sports-odds-data/football-odds.html
- Cobertura: más selectiva, solo ligas principales + algunas secundarias

## 5.3 Tabla de cobertura cruzada — LIGAS CONFIRMADAS

### COBERTURA COMPLETA (ambas APIs = IDEAL)

| Liga | Div | API-Football Stats | API-Football Odds | The Odds API | Sport Key (Odds API) |
|------|-----|-------------------|-------------------|-------------|---------------------|
| Eredivisie | 1ra | ✓ Full | ✓ | ✓ | soccer_netherlands_eredivisie |
| Bundesliga | 1ra | ✓ Full | ✓ | ✓ | soccer_germany_bundesliga |
| Superligaen | 1ra | ✓ Full | ✓ | ✓ | soccer_denmark_superliga |
| Süper Lig | 1ra | ✓ Full | ✓ | ✓ | soccer_turkey_super_league |
| Premier League | 1ra | ✓ Full | ✓ | ✓ | soccer_epl |
| La Liga | 1ra | ✓ Full | ✓ | ✓ | soccer_spain_la_liga |
| Serie A | 1ra | ✓ Full | ✓ | ✓ | soccer_italy_serie_a |
| Ligue 1 | 1ra | ✓ Full | ✓ | ✓ | soccer_france_ligue_one |
| Championship | 2da | ✓ Full | ✓ | ✓ | soccer_efl_champ |
| 2. Bundesliga | 2da | ✓ Full | ✓ | ✓ | soccer_germany_bundesliga2 |
| **3. Liga** | **3ra** | **✓ Full** | **✓** | **✓** | **soccer_germany_liga3** |
| La Liga 2 | 2da | ✓ Full | ✓ | ✓ | soccer_spain_segunda_division |
| Ligue 2 | 2da | ✓ Full | ✓ | ✓ | soccer_france_ligue_two |
| Serie B | 2da | ✓ Full | ✓ | ✓ | soccer_italy_serie_b |
| Brazil Série B | 2da | ✓ Full | ✓ | ✓ | soccer_brazil_serie_b |
| Superettan | 2da | ✓ Full | ✓ | ✓ | soccer_sweden_superettan |
| Eliteserien | 1ra | ✓ Full | ✓ | ✓ | soccer_norway_eliteserien |
| Allsvenskan | 1ra | ✓ Full | ✓ | ✓ | soccer_sweden_allsvenskan |
| Veikkausliiga | 1ra | ✓ Full | ✓ | ✓ | soccer_finland_veikkausliiga |
| League One | 3ra | ✓ Full | ✓ | ✓ | soccer_england_league1 |
| League Two | 4ta | ✓ Full | ✓ | ✓ | soccer_england_league2 |
| Swiss Super League | 1ra | ✓ Full | ✓ | ✓ | soccer_switzerland_superleague |
| Ekstraklasa | 1ra | ✓ Full | ✓ | ✓ | soccer_poland_ekstraklasa |
| Super League Greece | 1ra | ✓ Full | ✓ | ✓ | soccer_greece_super_league |

### COBERTURA PARCIAL (solo API-Football tiene odds)

| Liga | Div | API-Football Stats | API-Football Odds | The Odds API | Avg Goles 1H |
|------|-----|-------------------|-------------------|-------------|-------------|
| 1. Lig (Turquía) | 2da | ✓ Full | ✓ | ✗ | ~1.22 |
| Eerste Divisie (Holanda) | 2da | ✓ Full | ✓ | ✗ | ~1.25 |
| 1.NL (Croacia) | 1ra | ✓ Full | ✓ | ✗ | 1.54 |
| NB I (Hungría) | 1ra | ✓ Full | ✓ | ✗ | ~1.20 |
| Norway 1. Division | 2da | ✓ Full | ✓ | ✗ | ~1.30 |
| Czech Liga | 1ra | ✓ Full | ✓ | ✗ | ~1.20 |

### IDs de ligas en API-Football:

| Liga | ID |
|------|----|
| Eredivisie | 88 |
| Bundesliga | 78 |
| Superligaen | 119 |
| Süper Lig | 203 |
| Premier League | 39 |
| La Liga | 140 |
| Serie A | 135 |
| Ligue 1 | 61 |
| Championship | 40 |
| 2. Bundesliga | 79 |
| 3. Liga | 80 |
| La Liga 2 | 141 |
| Ligue 2 | 62 |
| Serie B | 136 |
| League One | 41 |
| League Two | 42 |
| Eliteserien | 103 |
| Allsvenskan | 113 |
| Veikkausliiga | 244 |
| Superettan | 114 |
| Ekstraklasa | 106 |
| Swiss Super League | 207 |
| 1.NL Croacia | 210 |
| NB I Hungría | 271 |
| 1. Lig Turquía | 204 |
| Eerste Divisie | 89 |

---

# 6. CLASIFICACIÓN DE LIGAS POR TIER

## TIER 1 — PRIORIDAD MÁXIMA

Ligas con alta tasa de goles 1H + alta tasa de corners + cobertura COMPLETA en ambas APIs.

| Liga | Div | Avg Goles 1H | Avg Corners | Por qué Tier 1 |
|------|-----|-------------|-------------|----------------|
| Superligaen (Dinamarca) | 1ra | 1.55 | ~9.60 | #1 en goles 1H con odds |
| Eredivisie (Holanda) | 1ra | 1.40 | 10.43 | #1 en corners, top en goles |
| Bundesliga (Alemania) | 1ra | ~1.35 | 9.64 | Consistente en ambos mercados |
| Süper Lig (Turquía) | 1ra | ~1.28 | ~9.30 | Buena en goles 1H, cuotas con más value |

## TIER 2 — SEGUNDAS DIVISIONES (EL ORO REAL)

Ligas con cobertura completa donde las casas modelan PEOR las cuotas.

| Liga | Div | Avg Goles 1H | Avg Corners | Por qué Tier 2 |
|------|-----|-------------|-------------|----------------|
| Championship (Inglaterra) | 2da | ~1.30 | ~9.80 | Alto volumen + corners altos |
| 2. Bundesliga (Alemania) | 2da | 1.27 | ~9.20 | Datos verificados, buena base |
| **3. Liga (Alemania)** | **3ra** | **~1.25** | **~9.10** | **JOYA: 3ra div con ambas APIs** |
| Superettan (Suecia) | 2da | ~1.30 | ~9.00 | Verano + juego abierto |
| La Liga 2 (España) | 2da | ~1.10 | ~9.00 | Cubierta pero avg más bajo |
| Ligue 2 (Francia) | 2da | ~1.15 | ~9.00 | Similar a La Liga 2 |
| Serie B (Italia) | 2da | ~1.10 | ~9.00 | Cubierta, defensiva |
| Brazil Série B | 2da | ~1.20 | ~8.80 | Temporada larga, errores |

## TIER 3 — LIGAS DE VERANO (abril–noviembre)

Cubren el vacío cuando Europa para. CRÍTICO para el Mundial 2026.

| Liga | Div | Avg Goles 1H | Avg Corners | Temporada |
|------|-----|-------------|-------------|-----------|
| Eliteserien (Noruega) | 1ra | ~1.25 | ~8.90 | abr–nov |
| Allsvenskan (Suecia) | 1ra | ~1.20 | ~9.00 | abr–nov |
| Veikkausliiga (Finlandia) | 1ra | ~1.30 | ~9.10 | abr–oct |

## TIER 4 — PRIMERAS DIVISIONES PRINCIPALES (poco value, alto volumen)

Cuotas perfectamente modeladas. Solo apostar cuando los filtros son EXCEPCIONALES.

| Liga | Div | Avg Goles 1H | Avg Corners | Nota |
|------|-----|-------------|-------------|------|
| Premier League | 1ra | ~1.30 | 9.85 | Cuotas perfectas. Solo matchups top |
| La Liga | 1ra | ~1.20 | ~9.40 | Variable. Solo equipos >80% |
| Serie A | 1ra | ~1.15 | ~9.50 | Defensiva en 1H |
| Ligue 1 | 1ra | ~1.18 | 9.32 | Sin PSG baja mucho |

## LIGAS A EVITAR:

- Liga MX — Ritmo lento en primeros 30 minutos
- K-League (Corea del Sur) — Fútbol conservador en primera mitad
- Serie A equipos de media tabla abajo — Muchos 0-0 al descanso

---

# 7. DIVISIONES INFERIORES — EL EDGE OCULTO

## Por qué las divisiones inferiores son MEJORES para apostar:

Las casas de apuestas tienen equipos enteros dedicados a Premier League, Bundesliga, La Liga. Cada partido tiene 50+ modelos. Las cuotas están PERFECTAMENTE ajustadas.

Pero en la 2. Bundesliga, la 3. Liga, la Superettan: dedican una fracción del recurso. Las cuotas se ponen MAL y un bot con datos específicos por equipo puede encontrar edge.

## El ejemplo concreto:

Si en la 2. Bundesliga un equipo que tiene 90% Over 0.5 1H juega contra otro con 85%:
- Probabilidad real: ~88%
- La casa pone cuota @1.25 (implica 80%) porque usa avg de liga (70%)
- Edge: 8%
- En Premier League ese desfase NO existe

## La 3. Liga alemana es la joya absoluta:

- Tercera división
- Cobertura COMPLETA en ambas APIs (raro para 3ra div)
- ~1.25 avg goles 1H, ~9.10 avg corners
- Las casas casi no ponen recursos
- Edge potencial: ALTO

---

# 8. VARIABLES PREDICTORAS

## 8.1 Para Goles Primera Mitad (orden de poder predictivo)

| # | Variable | Umbral FUERTE | Umbral MEDIO | Fuente API |
|---|----------|--------------|-------------|-----------|
| 1 | Over 0.5 1H % ambos equipos | Ambos >80% | Uno >85% | API-Football stats |
| 2 | Avg goles 1H (sum ambos) | >1.4 combinado | >1.0 | API-Football stats |
| 3 | Minuto promedio primer gol | 1 equipo <28 min | Ambos <35 min | API-Football fixtures |
| 4 | xG primera mitad | xG combinado >1.0 | >0.8 | FBref (scraping) |
| 5 | BTS 1H % | >30% matchup | >20% | API-Football stats |
| 6 | Forma reciente (últimos 5) | Gol 1H en 4/5 | 3/5 | API-Football fixtures |
| 7 | H2H goles 1H | 4/5 con gol | 3/5 | API-Football H2H |
| 8 | Movimiento de cuotas | Baja >10% pre-partido | Baja >5% | The Odds API |

## 8.2 Para Corners (orden de poder predictivo)

| # | Variable | Umbral FUERTE | Umbral MEDIO | Fuente API |
|---|----------|--------------|-------------|-----------|
| 1 | Avg corners totales ambos equipos | Sum >20 | Sum >18 | API-Football statistics |
| 2 | Avg corners a favor equipo A | >6.0 | >5.0 | API-Football statistics |
| 3 | Avg corners en contra equipo B | >5.5 | >4.5 | API-Football statistics |
| 4 | Tiros por partido (shots) | Combinados >25 | >20 | API-Football statistics |
| 5 | Posesión % | >55% un equipo | >52% | API-Football statistics |
| 6 | Forma reciente corners (últimos 5) | Avg >10 corners | >9 | API-Football fixtures |
| 7 | H2H corners | 4/5 partidos Over 9.5 | 3/5 | API-Football H2H |
| 8 | Local vs Visitante | Local saca más corners | — | API-Football fixtures |

---

# 9. PIPELINE OPERATIVO DEL BOT

## Flujo diario automatizado:

```
PASO 1: OBTENER FIXTURES DEL DÍA
→ API-Football: GET /fixtures?date={hoy}&league={ids_tier1_tier2}

PASO 2: FILTRAR POR LIGA (solo Tier 1 y Tier 2)

PASO 3: OBTENER STATS DE AMBOS EQUIPOS
→ API-Football: GET /teams/statistics?league={id}&team={id}

PASO 4: CALCULAR PROBABILIDAD PROPIA
→ Módulo Goles 1H: fórmula basada en variables predictoras
→ Módulo Corners: fórmula basada en variables de corners

PASO 5: OBTENER CUOTAS
→ The Odds API: GET /sports/{sport_key}/odds?markets=totals_h1,totals
→ API-Football: GET /odds?fixture={id} (para ligas sin cobertura en Odds API)

PASO 6: COMPARAR prob_propia vs prob_implícita
→ Si diferencia > 5% → APOSTAR
→ Si diferencia < 5% → SKIP

PASO 7: DETECTAR STEAM MOVES
→ Monitorear cuotas cada 30 min pre-partido
→ Si movimiento >10% → CONFIRMAR o CANCELAR señal

PASO 8: REGISTRAR APUESTA
→ Guardar: fixture, mercado, cuota, prob_propia, timestamp

PASO 9: POST-PARTIDO — CALCULAR CLV
→ Comparar cuota apostada vs cuota de cierre
→ Acumular CLV promedio
```

## Fórmula simplificada para goles 1H:

```
prob_base = (over05_1h_team_a + over05_1h_team_b) / 2
```

Multiplicadores:
- Ambos en forma (4/5 últimos con gol 1H): × 1.05
- H2H confirma (4/5 con gol 1H): × 1.03
- Liga Tier 1: × 1.02
- Visitante con mejor stat away: × 1.02

## Fórmula simplificada para corners:

```
corners_esperados = (avg_corners_total_team_a + avg_corners_total_team_b) / 2
```

Comparar con línea del mercado:
- Si corners_esperados > línea + 0.8 → value en OVER
- Si corners_esperados < línea - 0.8 → value en UNDER

---

# 10. COMBINADAS INTELIGENTES — LÓGICA DE CORRELACIÓN

## 10.1 Por qué combinadas inteligentes y no parlays aleatorios

El 99% de la gente hace parlays metiendo 5+ picks al azar porque la cuota combinada "se ve jugosa". La probabilidad se multiplica y se destruye.

Lo que hacemos nosotros es diferente: combinamos picks de DIFERENTES mercados que se REFUERZAN entre sí basado en datos. Las casas tratan goles 1H y corners como mercados independientes, pero están CORRELACIONADOS POSITIVAMENTE — si el partido es abierto, ambos se cumplen.

## 10.2 Los 5 tipos de combinadas del sistema

### COMBO 1: Mismo partido, mercados diferentes (LA JOYA)

La combinada más poderosa. Si el modelo detecta value en Over 0.5 goles 1H Y TAMBIÉN en Over 9.5 corners para el MISMO partido, eso no es coincidencia — el partido va a ser abierto.

- Ejemplo: PSV vs NEC → Over 0.5 1H @1.20 + Over 9.5 corners @1.65 = @1.98 combinada
- Las casas calculan la combinada multiplicando cuotas (como si fueran independientes)
- Pero la probabilidad conjunta es MAYOR porque están correlacionados
- Edge escondido en la combinada que no existe en picks individuales

**Regla del bot:** Si un partido tiene value >5% en goles 1H Y value >5% en corners → generar Combo 1 automáticamente.

### COMBO 2: Cross-partido, mercados diferentes

Combinar picks de DIFERENTES partidos y DIFERENTES ligas. Son eventos genuinamente independientes.

- Ejemplo: PSV Over 0.5 1H @1.20 + Wolfsburg Over 10.5 corners @1.80 = @2.16
- La cuota combinada es matemáticamente justa
- Pero cada pick tiene value individual → edge acumulado
- Si cada pick tiene 5% edge, la combinada tiene ~10% edge

**Regla del bot:** Combinar picks de diferentes ligas que caen en la MISMA ventana de tiempo.

### COMBO 3: Sharp-confirmado (máxima convicción)

No es combinada sino señal de confianza. Cuando el modelo dice value Y ADEMÁS la cuota se mueve >10% (steam move) confirmando dinero inteligente.

- Stats dicen value + cuota baja 10% = doble confirmación
- En este caso: apostar 3% del bankroll (en vez del 1-2% estándar)
- Es la apuesta de máxima convicción del día

**Regla del bot:** Si un pick tiene value >5% + steam move >10% → marcar como "alta confianza" y aumentar stake.

### COMBO 4: Triple (2+1)

Máximo 3 patas. 2 picks del mismo partido (goles + corners que se refuerzan) + 1 pick independiente de otro partido.

- Ejemplo: PSV goles 1H + PSV corners + Bayern corners = @3.50+
- El par del mismo partido aporta correlación positiva
- El tercer pick independiente sube la cuota sin destruir la probabilidad
- NUNCA más de 3 patas

**Regla del bot:** Si hay un Combo 1 fuerte + un pick independiente en la misma ventana → generar Combo 4.

### COMBO 5: AI-optimizado (futuro)

Un modelo de AI que recibe TODOS los picks del día con su edge individual, y calcula cuál combinación de 2-3 picks maximiza el Expected Value considerando correlaciones.

- No es necesario al inicio — las reglas de Combos 1-4 funcionan
- Implementar después de tener 100+ apuestas de data histórica
- El modelo aprende qué combinaciones de ligas/mercados tienen mayor correlación real

## 10.3 Reglas de oro para combinadas

1. **NUNCA más de 3 patas.** Cada pata multiplica la varianza. Con 2-3 patas + value, la matemática trabaja. Con 6+ patas, la varianza te destruye.
2. **Todos los partidos deben estar en la MISMA ventana de tiempo** (dentro de 2-3 horas entre sí). No mezclar partido del sábado con partido del martes.
3. **Cada pata individual DEBE tener value positivo.** No meter un pick "relleno" solo para subir la cuota.
4. **Combo 1 (mismo partido) SIEMPRE es preferida** sobre Combo 2 (cross-partido) porque tiene edge de correlación.
5. **El stake de combinadas es MENOR que el de picks individuales.** Si pick individual = 2% bankroll, combinada = 1% bankroll.

## 10.4 Camuflaje orgánico

Al operar en DOS mercados diferentes (goles 1H + corners) con combinadas cross-liga, el perfil de apuestas se diversifica naturalmente. No se necesitan apuestas recreativas de relleno.

- Un día: Over 0.5 1H en Eredivisie
- Siguiente: Combo goles + corners en Bundesliga
- Después: Over 1.5 goles 1H en 3. Liga
- Luego: Combo cross PSV corners + Bayern goles

Para Bet365, esto parece un apostador diversificado, no un sharp con un solo ángulo.
Cada apuesta de corners ES camuflaje para las de goles, y viceversa.
TODAS las apuestas tienen value positivo — cero dinero desperdiciado en ruido.

---

# 11. VENTANAS DE TIEMPO — HORARIOS PARA COMBINADAS

## 11.1 Horarios por liga (hora El Salvador, UTC-6)

### SÁBADO — DÍA PRINCIPAL

| Liga | Hora local | Hora El Salvador | Ventana |
|------|-----------|-----------------|---------|
| 2. Bundesliga | 13:00 CET | 5:00 AM | Temprano |
| 3. Liga | 14:00 CET | 6:00 AM | VENTANA A |
| Bundesliga (temprano) | 15:30 CET | 7:30 AM | VENTANA A |
| Süper Lig | 16:00-19:00 TRT | 7:00-10:00 AM | VENTANA A |
| Superligaen (Dinamarca) | 16:00-18:00 CET | 8:00-10:00 AM | VENTANA A |
| La Liga / La Liga 2 | 16:15-21:00 CET | 8:15 AM-1:00 PM | VENTANA A-B |
| Eredivisie | 16:45-21:00 CET | 8:45 AM-1:00 PM | VENTANA A-B |
| Serie A | 15:00-20:45 CET | 7:00 AM-12:45 PM | VENTANA A-B |
| Championship / League 1-2 | 15:00 GMT | 9:00 AM | VENTANA A |
| Premier League | 15:00 GMT | 9:00 AM | VENTANA A |
| Ligue 1 / Ligue 2 | 17:00-21:00 CET | 9:00 AM-1:00 PM | VENTANA A-B |
| Bundesliga (late) | 18:30 CET | 10:30 AM | VENTANA B |

### DOMINGO — DÍA SECUNDARIO

| Liga | Hora local | Hora El Salvador | Ventana |
|------|-----------|-----------------|---------|
| Eredivisie | 12:15-16:45 CET | 4:15-8:45 AM | Mañana |
| Bundesliga | 15:30-19:30 CET | 7:30-11:30 AM | VENTANA C |
| La Liga | 14:00-21:00 CET | 6:00 AM-1:00 PM | VENTANA C |
| Serie A | 12:30-20:45 CET | 4:30 AM-12:45 PM | VENTANA C |
| Serie B | 15:00-20:45 CET | 7:00 AM-12:45 PM | VENTANA C |

### ENTRE SEMANA

| Liga | Día | Hora El Salvador |
|------|-----|-----------------|
| Champions League | Mar/Mié | 1:00 PM |
| Europa League | Jueves | 10:45 AM-1:00 PM |
| Championship midweek | Mar/Mié | 1:45 PM |
| 2. Bundesliga midweek | Viernes | 12:30 PM |

### VERANO (junio-agosto) — Ligas nórdicas

| Liga | Día típico | Hora El Salvador |
|------|-----------|-----------------|
| Allsvenskan (Suecia) | Sáb/Dom | 7:00-9:30 AM |
| Veikkausliiga (Finlandia) | Sábado | 8:00 AM |
| Eliteserien (Noruega) | Domingo | 9:00-11:00 AM |
| Superettan (Suecia) | Sábado | 7:00-9:00 AM |

## 11.2 Las 3 ventanas de combinadas

### VENTANA A — La dorada (Sábados 7:00-9:00 AM hora El Salvador)

**6-8 ligas jugando simultáneamente:**
- Bundesliga + 3. Liga + Eredivisie + Championship + League One/Two + La Liga + Süper Lig + Superligaen + Premier League

Esta es la ventana donde el bot tiene MÁXIMAS opciones para construir combinadas inteligentes. Todos los partidos arrancan dentro de ~2 horas entre sí.

**Ejemplo de combo en Ventana A:**
- 7:30 AM: Bundesliga — Bayern vs Union Berlin → Over 0.5 1H @1.15
- 8:45 AM: Eredivisie — PSV vs NEC → Over 9.5 corners @1.65
- 9:00 AM: Championship — Leeds vs Norwich → Over 0.5 1H @1.25
- Combo 2 patas: Bayern goles + PSV corners = @1.90
- Combo 3 patas: Bayern goles + PSV corners + Leeds goles = @2.37

### VENTANA B — La extensión (Sábados 9:00 AM-1:00 PM)

**Late games de ligas principales:**
- Eredivisie (partidos de 20:00 CET), La Liga, Serie A, Ligue 1, Bundesliga late (18:30 CET)

Menos opciones simultáneas pero cuotas a veces mejores porque las casas han ajustado durante el día.

### VENTANA C — Domingos (7:00 AM-1:00 PM)

**Segundas oportunidades:**
- Partidos que no se jugaron el sábado en Bundesliga, La Liga, Serie A
- Menos volumen pero picks individuales fuertes
- Buena para picks individuales, menos ideal para combinadas (menos ligas simultáneas)

## 11.3 Pipeline del bot para combinadas (flujo completo)

```
VIERNES NOCHE (automático):

PASO 1: Obtener TODOS los fixtures del sábado
→ API-Football: GET /fixtures?date={sábado}&league={todas_las_ids}

PASO 2: Calcular value individual para cada partido
→ Módulo Goles 1H: prob_propia vs cuota
→ Módulo Corners: corners_esperados vs línea

PASO 3: Filtrar picks con value >5%

PASO 4: Agrupar por VENTANA DE TIEMPO
→ Ventana A (7:00-9:00 AM): partidos que arrancan en esa franja
→ Ventana B (9:00 AM-1:00 PM): late games

PASO 5: Dentro de cada ventana, generar combinadas:
→ Buscar Combo 1 (mismo partido con value en goles Y corners)
→ Buscar Combo 2 (cross-partido, diferentes ligas)
→ Si hay Combo 1 + pick independiente → generar Combo 4 (triple)

PASO 6: Calcular Expected Value de cada combinada
→ EV = (prob_combinada × cuota_combinada) - 1
→ Solo recomendar combinadas con EV > 0.05

PASO 7: ALERTAR
→ Enviar al usuario: picks individuales + combinadas sugeridas
→ Incluir: partidos, mercados, cuotas, hora de kickoff, EV estimado
→ Todo listo para meter en Bet365 el sábado temprano

SÁBADO MAÑANA (30 min antes de Ventana A):

PASO 8: Verificar cuotas actualizadas
→ The Odds API: consulta final de cuotas
→ Si cuota se movió y ya no hay value → CANCELAR pick
→ Si cuota se movió a favor (steam move) → CONFIRMAR con más confianza

PASO 9: Ejecutar apuestas
→ El usuario mete las apuestas en Bet365
→ Picks individuales primero, luego combinadas
```

## 11.4 Regla de ventana para el bot

**Un pick SOLO puede entrar en una combinada si su partido arranca dentro de la MISMA ventana de 3 horas que los otros picks de esa combinada.**

Ejemplos válidos:
- Bundesliga 7:30 AM + Eredivisie 8:45 AM + Championship 9:00 AM → ✓ (todos en Ventana A)
- La Liga 8:15 AM + Premier League 9:00 AM → ✓ (ambos en Ventana A)

Ejemplos INVÁLIDOS:
- Bundesliga 7:30 AM + La Liga late 1:00 PM → ✗ (5.5 horas de diferencia)
- Sábado Premier League + Domingo La Liga → ✗ (diferente día)
- Championship 9:00 AM + Champions League martes → ✗ (diferente día)

---

# 12. BANKROLL Y GESTIÓN

| Concepto | Valor |
|----------|-------|
| Bankroll inicial | $50-100 USD |
| Apuesta por pick | 1-3% del bankroll ($1-3) |
| Meta de CLV | Positivo después de 50 apuestas |
| Revisión | Cada 50 apuestas |
| Escalada | Solo después de 100+ con CLV positivo |
| Máximo apuestas/día | 5-8 (entre ambos mercados) |
| Camuflaje | Orgánico — la diversificación de mercados (goles + corners) ya crea perfil natural |

---

# 13. CALENDARIO OPERATIVO

| Período | Ligas activas | Foco principal |
|---------|--------------|----------------|
| Ago–May | Eredivisie, Bundesliga, Superligaen, Süper Lig, Championship, 2. Bundesliga, 3. Liga, La Liga 2, Ligue 2, Serie B, Premier League, La Liga | Temporada europea — máximo volumen |
| Abr–Nov | Eliteserien, Allsvenskan, Veikkausliiga, Superettan | Ligas nórdicas de verano |
| Jun 11 – Jul 19, 2026 | **COPA MUNDIAL 2026** | Evento especial. Grupos = goleadores. Eliminatorias = cerradas |
| Todo el año | Croacia 1.NL, NB I Hungría, Czech Liga | Ligas "under the radar" |

---

# 14. FUENTES DE DATOS Y URLS

## APIs principales:
- API-Football Coverage: https://www.api-football.com/coverage
- API-Football Docs v3: https://www.api-football.com/documentation-v3
- API-Football Dashboard: https://dashboard.api-football.com
- The Odds API Sports: https://the-odds-api.com/sports-odds-data/sports-apis.html
- The Odds API Docs v4: https://the-odds-api.com/liveapi/guides/v4/
- The Odds API Football: https://the-odds-api.com/sports-odds-data/football-odds.html

## Estadísticas gratuitas (verificación manual):
- FootyStats: https://footystats.org/stats/corner-stats
- SoccerStats: https://www.soccerstats.com
- Over25Tips: https://www.over25tips.com/soccer-stats/
- APWin (corners): https://www.apwin.com
- StatsChecker: https://www.statschecker.com/stats/corners-per-game/
- Betaminic: https://www.betaminic.com/statistics/
- TheStatBible: https://www.thestatbible.com/stats/first-half-goals
- WinDrawWin: https://www.windrawwin.com/statistics/corners/
- Footiqo: https://footiqo.com/statistics/leagues/goals/first-half/
- FBref (xG): https://fbref.com
- TotalCorner: https://www.totalcorner.com
- BetOnCorners: https://www.betoncorners.com

## Para el equipo:
- Spec técnico del módulo Sharp (NestJS): conversación previa en Claude
- Biblia de Goles 1H (versión anterior): conversación previa en Claude

---

*Documento maestro generado el 23 de marzo de 2026.*
*Datos de Eredivisie verificados al 22/mar/2026 (Jornada 25).*
*Rankings globales de Over25Tips actualizados al 21/mar/2026.*
*Datos de corners verificados de APWin y FootyStats al 23/mar/2026.*
*Cobertura de APIs verificada directamente de las páginas oficiales al 23/mar/2026.*
