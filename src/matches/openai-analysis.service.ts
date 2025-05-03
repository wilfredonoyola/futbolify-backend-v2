import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PredictionSnapshotDto } from './dto/prediction-snapshot.dto'

export interface HistoricalSimilarityResult {
  similarMatches: number
  withGoals: number
  percentage: number
  comment: string
}

@Injectable()
export class OpenAiAnalysisService {
  private readonly logger = new Logger(OpenAiAnalysisService.name)
  private readonly openai: OpenAI

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  async analyzeMatch(matchData: any): Promise<{
    recommendedBet: string
    confidence: number
    reason: string
    odds: number
    timestamp: string
  } | null> {
    const recentMinute = matchData.minute || 0
    const events = matchData.lastEvents || []

    const recentEvents = events.filter(
      (e: any) =>
        ['goal', 'shot', 'corner'].includes(e.type) &&
        recentMinute - e.minute <= 8
    )

    if (recentEvents.length === 0) {
      return {
        recommendedBet: 'no_bet',
        confidence: 0,
        reason: 'Sin eventos ofensivos recientes en los últimos 8 minutos.',
        odds: 0,
        timestamp: new Date().toISOString(),
      }
    }

    const prompt = [
      {
        role: 'system' as const,
        content: `
⚽ Eres un asistente sniper especializado en apuestas en vivo, siguiendo las instrucciones del sistema Gol Tardío NG – UltraLive v3.1.0 (Abril 2025).

🎯 Tu tarea es analizar un partido con datos reales de SofaScore y decidir si hay condiciones sólidas para apostar al mercado:
- Over 0.5 Goles
- Over 1.5 Goles
- O NO apostar

📊 Evalúa con base en:
- Remates totales y tiros al arco
- Ataques peligrosos
- Córners recientes
- xG
- Minuto del partido
- Marcador actual
- Actividad reciente (últimos 8 minutos)

🚦 Criterios base:
- Minuto 55+ (ideal 68+)
- Partido activo (ej: 0-0, 1-0, 1-1, 2-1)
- Mercado disponible (se asume true si 'marketAvailable' es true)

🧠 Lógica de presión:
- Over 0.5 si presión ≥6.5 y al menos 1 evento ofensivo
- Over 1.5 si presión ≥8.0 y al menos 2 eventos ofensivos
- No apostar si presión <6.0 o hay red flags

🚨 Red flags:
- <25% de tiros a puerta
- >70% de tiros desde fuera del área
- >65% de posesión con pocas ocasiones

💬 Devuelve siempre un JSON con:
{
  "recommendedBet": "over_0.5" | "over_1.5" | "under_2.5" | "no_bet",
  "confidence": 0–100,
  "reason": "explicación basada en los datos",
  "odds": número estimado entre 1.40 y 2.50,
  "timestamp": ISO date actual
}

⚠️ Si no hay suficiente información ➔ responde "no_bet".
NO uses comillas invertidas ni Markdown. Devuelve solo JSON plano sin formato.
        `.trim(),
      },
      {
        role: 'user' as const,
        content: JSON.stringify(matchData),
      },
    ]

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: prompt,
        temperature: 0.2,
      })

      const content = response.choices[0]?.message?.content
      const cleanContent = content?.replace(/```(json)?|```/g, '').trim()
      return cleanContent ? JSON.parse(cleanContent) : null
    } catch (error: any) {
      this.logger.error(`Error en análisis GPT: ${error.message}`)
      return null
    }
  }

  async findSimilarMatches(
    snapshot: PredictionSnapshotDto
  ): Promise<HistoricalSimilarityResult | null> {
    const prompt = [
      {
        role: 'system' as const,
        content: `
Sos un analista deportivo con acceso a una base histórica de +10.000 partidos.

Te voy a dar los datos en vivo de un partido (presión ofensiva, marcador, minuto y eventos recientes). Tu tarea es buscar partidos similares en tu base y responder cuántos de ellos tuvieron al menos 1 gol desde el minuto actual hasta el final del partido.

⚽ Datos relevantes:
- Marcador (ej: 0-0, 1-1)
- Presión ofensiva (ej: 9.2)
- Actividad reciente
- Minuto actual

📊 Devuelvo un JSON con:
{
  "similarMatches": número total de partidos similares,
  "withGoals": cuántos tuvieron gol después del minuto actual,
  "percentage": % de goles (con 1 decimal),
  "comment": explicación simple
}
NO uses comillas invertidas ni Markdown. Devuelve solo JSON plano sin formato.
        `.trim(),
      },
      {
        role: 'user' as const,
        content: JSON.stringify(snapshot),
      },
    ]

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: prompt,
        temperature: 0.2,
      })

      const content = response.choices[0]?.message?.content
      const cleanContent = content?.replace(/```(json)?|```/g, '').trim()
      return cleanContent ? JSON.parse(cleanContent) : null
    } catch (error: any) {
      this.logger.error(
        `❌ Error en análisis OpenAI (similares): ${error.message}`
      )
      return null
    }
  }
}
