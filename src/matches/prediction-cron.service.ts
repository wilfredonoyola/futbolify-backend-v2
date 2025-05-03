import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { MatchesService } from './matches.service'

@Injectable()
export class PredictionCronService {
  private readonly logger = new Logger(PredictionCronService.name)

  constructor(private readonly matchesService: MatchesService) {}

  @Cron('*/2 * * * *') // cada 2 minutos
  async handleCron() {
    this.logger.log('🔁 Ejecutando cronjob de predicciones tardías...')

    try {
      const matches = await this.matchesService.getLateMatches()
      this.logger.log(`📊 ${matches.length} partidos analizados por cron.`)
    } catch (error) {
      this.logger.error(`❌ Error en cronjob de predicción: ${error.message}`)
    }
  }
}
