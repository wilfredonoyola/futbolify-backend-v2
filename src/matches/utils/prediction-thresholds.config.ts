// src/matches/config/prediction-thresholds.config.ts

export const PredictionThresholds = {
  // Umbral mínimo para mostrar un partido en el Sniper
  SHOW_MATCHES_FROM: parseFloat(
    process.env.THRESHOLD_SHOW_MATCHES_FROM || '50'
  ),

  // Confianza mínima del análisis para mostrar (OpenAI)
  CONFIDENCE_MIN: parseInt(process.env.THRESHOLD_MIN_CONFIDENCE || '60'),

  // Rango de tiempo en minutos para considerar predicciones recientes (SniperView)
  MAX_MINUTES_AGO: parseInt(process.env.THRESHOLD_RECENT_MINUTES || '8'),
}
