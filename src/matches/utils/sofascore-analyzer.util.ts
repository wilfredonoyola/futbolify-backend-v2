import { MatchState, TimelineEventDto } from '../dto'
import {
  PressureScoreParams,
  MatchStateParams,
} from '../interfaces/pressure-params.interface'

/**
 * Calcula la puntuación de presión para un partido
 * @param params Parámetros para el cálculo
 * @returns Puntuación de presión
 */
export function calculatePressureScore(params: PressureScoreParams): number {
  const {
    // Extracción de todos los parámetros con valores por defecto
    totalShots,
    shotsOnTarget,
    dangerousAttacks,
    corners,
    totalShotsTeams = { home: 0, away: 0 },
    shotsOnTargetTeams = { home: 0, away: 0 },
    shotsInsideBoxTeams = { home: 0, away: 0 },
    shotsOnTargetRatio = 0,
    possession = { home: 50, away: 50 },
    possessionDifference = 0,
    attacks = { home: 0, away: 0 },
    bigChancesTeams = { home: 0, away: 0 },
    xG = { home: 0, away: 0 },
    dangerFactor = 0.5,
    shotsInsideBoxRatio = 0.5,
    minute,
    lastEventTypes = [],
    scoreHome = 0,
    scoreAway = 0,
  } = params

  // Base score
  let score = 0

  // 1. CANTIDAD Y CALIDAD DE TIROS

  // Shots metrics - cantidad total
  if (totalShots >= 25) score += 4
  else if (totalShots >= 20) score += 3.5
  else if (totalShots >= 15) score += 3
  else if (totalShots >= 10) score += 2
  else if (totalShots >= 5) score += 1

  // Shots on target - precisión
  if (shotsOnTarget >= 12) score += 4
  else if (shotsOnTarget >= 9) score += 3.5
  else if (shotsOnTarget >= 7) score += 3
  else if (shotsOnTarget >= 5) score += 2
  else if (shotsOnTarget >= 3) score += 1

  // Ratio de tiros a puerta - eficiencia
  if (shotsOnTargetRatio >= 0.6) score += 1.5
  else if (shotsOnTargetRatio >= 0.5) score += 1
  else if (shotsOnTargetRatio >= 0.4) score += 0.5

  // Big chances - oportunidades claras
  const totalBigChances = bigChancesTeams.home + bigChancesTeams.away
  if (totalBigChances >= 6) score += 3
  else if (totalBigChances >= 4) score += 2
  else if (totalBigChances >= 2) score += 1

  // 2. PELIGROSIDAD Y ATAQUES

  // Dangerous attacks - volumen ofensivo
  if (dangerousAttacks >= 150) score += 4.5
  else if (dangerousAttacks >= 120) score += 4
  else if (dangerousAttacks >= 100) score += 3.5
  else if (dangerousAttacks >= 80) score += 3
  else if (dangerousAttacks >= 60) score += 2
  else if (dangerousAttacks >= 40) score += 1

  // Corner kicks - presión en área
  if (corners >= 12) score += 3
  else if (corners >= 9) score += 2.5
  else if (corners >= 7) score += 2
  else if (corners >= 5) score += 1.5
  else if (corners >= 3) score += 1
  else if (corners >= 1) score += 0.5

  // Danger factor (tiros dentro del área) - calidad de oportunidades
  if (dangerFactor >= 0.8) score += 2
  else if (dangerFactor >= 0.7) score += 1.5
  else if (dangerFactor >= 0.6) score += 1
  else if (dangerFactor >= 0.5) score += 0.5

  // Shots inside box ratio - calidad de oportunidades
  if (shotsInsideBoxRatio >= 0.8) score += 1.5
  else if (shotsInsideBoxRatio >= 0.7) score += 1
  else if (shotsInsideBoxRatio >= 0.6) score += 0.5

  // 3. EQUILIBRIO Y DOMINIO

  // Possession difference - si es muy desigual o muy equilibrado
  if (possessionDifference <= 10) {
    // Juego equilibrado = más probabilidad de goles
    score += 1.5
  } else if (possessionDifference >= 30) {
    // Dominio excesivo de un equipo
    score += 0.5
  }

  // Distribución de tiros entre equipos - partido equilibrado u ofensivo
  const shotsDiff = Math.abs(totalShotsTeams.home - totalShotsTeams.away)
  const shotsRatio =
    Math.min(totalShotsTeams.home, totalShotsTeams.away) /
    (Math.max(totalShotsTeams.home, totalShotsTeams.away) || 1)

  if (shotsRatio >= 0.7 && totalShots >= 15) {
    // Ambos equipos tirando mucho = partido abierto
    score += 1.5
  } else if (shotsDiff >= 15) {
    // Un equipo dominando completamente = puede estar cerca de marcar
    score += 1
  }

  // 4. MÉTRICAS AVANZADAS

  // xG total (Expected Goals) - calidad científica de oportunidades
  const totalXG = xG.home + xG.away
  if (totalXG >= 4) score += 4
  else if (totalXG >= 3) score += 3
  else if (totalXG >= 2) score += 2
  else if (totalXG >= 1) score += 1
  else if (totalXG >= 0.5) score += 0.5

  // 5. FACTORES CONTEXTUALES

  // Estado del marcador
  const scoreDifference = Math.abs(scoreHome - scoreAway)
  if (scoreDifference === 1) {
    // Partido ajustado = el equipo perdiendo buscará empatar
    score += 1
  } else if (scoreDifference === 0 && minute >= 70) {
    // Empate en minutos finales = ambos buscarán ganar
    score += 1.5
  }

  // Factor tiempo - en partidos tardíos, la presión es más significativa
  if (minute >= 80) {
    score *= 1.3 // 30% boost para últimos 10 minutos
  } else if (minute >= 75) {
    score *= 1.2 // 20% boost para minutos 75-80
  } else if (minute >= 65) {
    score *= 1.1 // 10% boost para minutos 65-75
  }

  // 6. EVENTOS RECIENTES

  // Bonus por eventos recientes importantes
  const recentCorners = lastEventTypes.filter(
    (type) => type === 'Corner'
  ).length
  const recentShots = lastEventTypes.filter((type) =>
    ['Shot', 'Shot on Target'].includes(type)
  ).length
  const hasVAR = lastEventTypes.includes('VAR')

  if (recentCorners >= 2 && minute >= 65) {
    score += 1.5 // Córners acumulados = presión
  } else if (recentCorners === 1 && minute >= 75) {
    score += 0.8
  }

  if (recentShots >= 3 && minute >= 65) {
    score += 2 // Varios tiros recientes = momentum
  } else if (recentShots >= 2 && minute >= 70) {
    score += 1.5
  } else if (recentShots >= 1 && minute >= 80) {
    score += 1
  }

  if (hasVAR && minute >= 70) {
    score += 1 // VAR = posible momento clave
  }

  return score
}

/**
 * Calcula la puntuación de actividad reciente
 * @param events Eventos recientes
 * @param minute Minuto actual del partido
 * @returns Puntuación de actividad reciente
 */
export function calculateRecentActivityScore(
  events: TimelineEventDto[],
  minute: number
): number {
  let score = 0

  // Si no hay eventos recientes, retornamos 0
  if (!events.length) return 0

  // Ordenar eventos del más reciente al más antiguo
  const sortedEvents = [...events].sort((a, b) => b.minute - a.minute)

  // Ponderar eventos por recencia e importancia
  sortedEvents.forEach((event, index) => {
    // Calcular cuán reciente es el evento (más reciente = más importante)
    // Valor entre 0.1 y 1 (escala no lineal que da más peso a eventos muy recientes)
    const minutesDiff = minute - event.minute
    const recencyFactor = Math.max(0.1, Math.pow(0.9, minutesDiff))

    // Calcular la importancia base del evento
    let eventScore = 0

    switch (event.type) {
      case 'Goal':
        // Los goles recientes son relevantes pero no para predecir nuevos goles
        eventScore = 0.5
        break
      case 'Corner':
        eventScore = 2.0
        break
      case 'Shot on Target':
        eventScore = 2.5
        break
      case 'Shot':
        eventScore = 1.5
        break
      case 'Dangerous Attack':
        eventScore = 0.7
        break
      case 'VAR':
        eventScore = 1.5 // VAR puede significar un momento clave
        break
      case 'Card':
        eventScore = 0.8 // Las tarjetas pueden cambiar el ritmo
        break
      case 'Substitution':
        // Las sustituciones tardías son tácticamente ofensivas
        eventScore = minute >= 75 ? 1.0 : 0.3
        break
      default:
        eventScore = 0.2
    }

    // Aplicar factor de recencia
    score += eventScore * recencyFactor

    // Penalizar ligeramente eventos adicionales para no sobrevalorar
    // una serie de eventos menos importantes vs un evento muy importante
    if (index > 0) {
      score *= 0.9
    }
  })

  // Aplicar bonificación para partidos tardíos con alta actividad reciente
  if (minute >= 80 && sortedEvents.length >= 3) {
    score *= 1.2 // 20% extra por mucha actividad en minutos finales
  } else if (minute >= 70 && sortedEvents.length >= 4) {
    score *= 1.15 // 15% extra
  }

  return score
}

/**
 * Determina si un partido es bueno para apuestas de más de 0.5 goles
 * @param pressureScore Puntuación de presión
 * @param minute Minuto actual
 * @param currentGoals Goles actuales
 * @returns True si es bueno para apuestas de más de 0.5 goles
 */
export function isGoodForOver05(
  pressureScore: number,
  minute: number,
  currentGoals: number
): boolean {
  // Criterios más estrictos a medida que avanza el partido
  if (currentGoals > 0) return false

  if (minute < 60) {
    return pressureScore >= 6.5
  } else if (minute < 70) {
    return pressureScore >= 7.5
  } else if (minute < 80) {
    return pressureScore >= 8.5
  } else {
    return pressureScore >= 9.5
  }
}

/**
 * Determina si un partido es bueno para apuestas de más de 1.5 goles
 * @param pressureScore Puntuación de presión
 * @param minute Minuto actual
 * @param currentGoals Goles actuales
 * @returns True si es bueno para apuestas de más de 1.5 goles
 */
export function isGoodForOver15(
  pressureScore: number,
  minute: number,
  currentGoals: number
): boolean {
  if (currentGoals > 1) return false

  if (minute < 60) {
    return pressureScore >= 8.0
  } else if (minute < 70) {
    return pressureScore >= 9.0
  } else if (minute < 80) {
    return pressureScore >= 10.0
  } else {
    return pressureScore >= 11.0
  }
}

/**
 * Determina si un partido tardío es bueno para apuestas de más de 0.5 goles
 * @param pressureScore Puntuación de presión
 * @param minute Minuto actual
 * @param totalGoals Goles totales
 * @param hasRecentActivity Si hay actividad reciente
 * @returns True si es bueno para apuestas de más de 0.5 goles
 */
export function isGoodLateMatchForOver05(
  pressureScore: number,
  minute: number,
  totalGoals: number,
  hasRecentActivity: boolean
): boolean {
  if (totalGoals > 0) return false

  // Criterios específicos para partidos tardíos (0-0)
  if (minute >= 80) {
    return pressureScore >= 10.0 && hasRecentActivity
  } else if (minute >= 70) {
    return pressureScore >= 9.0
  } else {
    return pressureScore >= 8.0
  }
}

/**
 * Determina si un partido tardío es bueno para apuestas de más de 1.5 goles
 * @param pressureScore Puntuación de presión
 * @param minute Minuto actual
 * @param totalGoals Goles totales
 * @param hasRecentActivity Si hay actividad reciente
 * @returns True si es bueno para apuestas de más de 1.5 goles
 */
export function isGoodLateMatchForOver15(
  pressureScore: number,
  minute: number,
  totalGoals: number,
  hasRecentActivity: boolean
): boolean {
  if (totalGoals > 1) return false

  // Para partidos 0-0
  if (totalGoals === 0) {
    if (minute >= 80) {
      return pressureScore >= 12.0 && hasRecentActivity
    } else if (minute >= 70) {
      return pressureScore >= 10.5
    } else {
      return pressureScore >= 9.5
    }
  }

  // Para partidos 1-0 o 0-1
  else {
    if (minute >= 80) {
      return pressureScore >= 11.0 && hasRecentActivity
    } else if (minute >= 70) {
      return pressureScore >= 9.5
    } else {
      return pressureScore >= 8.5
    }
  }
}

/**
 * Determina el estado de un partido
 * @param params Parámetros para determinar el estado
 * @returns Estado del partido
 */
export function determineMatchState(params: MatchStateParams): MatchState {
  const {
    minute,
    scoreHome,
    scoreAway,
    pressureScore,
    isGoodForOver05,
    isGoodForOver15,
    lastPeriod,
    isLateMatch = false,
  } = params

  if (lastPeriod === 'half_time') {
    return MatchState.HalfTime
  }

  if (minute === 0) {
    return MatchState.NotStarted
  }

  if (minute >= 90) {
    return MatchState.Finished
  }

  if (lastPeriod === 'period1') {
    return MatchState.FirstHalf
  }

  if (lastPeriod === 'period2') {
    return MatchState.SecondHalf
  }

  // Reglas específicas para partidos tardíos
  if (isLateMatch) {
    const totalGoals = scoreHome + scoreAway

    // Partidos con muchos goles
    if (totalGoals >= 4) {
      return MatchState.NoBet
    }

    // Si no hay acción reciente en los últimos minutos del partido, mejor no apostar
    if (minute >= 80 && !isGoodForOver05 && !isGoodForOver15) {
      return MatchState.NoLateValue
    }

    // Partidos 0-0 con alta presión en minutos tardíos
    if (totalGoals === 0 && minute >= 75 && isGoodForOver05) {
      return isGoodForOver15
        ? MatchState.HighLateValue
        : MatchState.ModerateLateValue
    }

    // Partidos 1-0 con alta presión en minutos tardíos
    if (totalGoals === 1 && minute >= 75 && isGoodForOver15) {
      return MatchState.HighLateValue
    }
  }

  // Reglas generales
  if (scoreHome + scoreAway >= 4) {
    return MatchState.NoBet
  }

  if (!isGoodForOver05 && !isGoodForOver15) {
    return MatchState.Normal
  }

  if (isGoodForOver15) {
    return MatchState.ReadyToBet
  }

  if (isGoodForOver05) {
    return MatchState.Potential
  }

  return MatchState.Normal
}
