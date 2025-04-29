export interface GptAnalysisCheckInput {
  minute: number
  scoreHome: number
  scoreAway: number
  pressureScore?: number
  marketAvailable: boolean
}

/**
 * Decide si un partido debe ser analizado con GPT en base a reglas del sistema Gol Tardío NG.
 */
export function shouldAnalyzeWithGPT(input: GptAnalysisCheckInput): boolean {
  const { minute, scoreHome, scoreAway, pressureScore, marketAvailable } = input

  const goalDifference = Math.abs(scoreHome - scoreAway)
  const totalGoals = scoreHome + scoreAway

  if (!marketAvailable) return false // ❌ Si no está en mercado en vivo
  if (minute < 60) return false // ❌ Muy temprano
  if (goalDifference > 1) return false // ❌ Partido no parejo (ej: 2-0, 3-1)
  if (totalGoals > 4) return false // ❌ Muy resuelto (ej: 4-1)

  if (pressureScore !== undefined && pressureScore < 5.5) {
    return false // ❌ Baja presión, poco valor analizar
  }

  return true // ✅ Cumple condiciones clave
}
