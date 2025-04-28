import { Injectable } from '@nestjs/common'
import { LiveMatchOutputDto } from './dto'

@Injectable()
export class GoalOpportunityAnalyzerService {
  analyze(match: LiveMatchOutputDto): {
    shouldBet: boolean
    market: 'OVER_0_5' | 'OVER_1_5' | null
    pressureScore: number
    notes: string
  } {
    if (!match.minute || match.minute < 68) {
      return {
        shouldBet: false,
        market: null,
        pressureScore: 0,
        notes: 'Minuto insuficiente.',
      }
    }

    const marcadorCerrado =
      match.scoreHome === match.scoreAway ||
      Math.abs(match.scoreHome - match.scoreAway) === 1
    if (!marcadorCerrado) {
      return {
        shouldBet: false,
        market: null,
        pressureScore: 0,
        notes: 'Marcador no cerrado.',
      }
    }

    const totalShots = match.shots ?? 0
    const shotsOnTarget = match.shotsOnTarget ?? 0
    const dangerousAttacks = match.dangerousAttacks ?? 0

    let pressureScore = 0

    if (totalShots >= 10 && shotsOnTarget >= 5) {
      pressureScore = 6.5
    }
    if (totalShots >= 14 && shotsOnTarget >= 6 && dangerousAttacks >= 80) {
      pressureScore = 8.5
    }

    if (pressureScore >= 8) {
      return {
        shouldBet: true,
        market: 'OVER_1_5',
        pressureScore,
        notes: 'Presión extrema detectada.',
      }
    } else if (pressureScore >= 6.5) {
      return {
        shouldBet: true,
        market: 'OVER_0_5',
        pressureScore,
        notes: 'Presión media-alta detectada.',
      }
    } else {
      return {
        shouldBet: false,
        market: null,
        pressureScore,
        notes: 'Presión insuficiente.',
      }
    }
  }
}
