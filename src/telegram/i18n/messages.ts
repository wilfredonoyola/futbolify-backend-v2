// Telegram Bot Internationalization - Spanish & English

export type Lang = 'es' | 'en';

export const messages = {
  // Welcome & Start
  welcome: {
    es: (name: string) => `¡Hola ${name}! 👋\n\nSoy el bot de Futbolify para quinielas ⚽🏆`,
    en: (name: string) => `Hello ${name}! 👋\n\nI'm the Futbolify bot for prediction pools ⚽🏆`,
  },
  commands: {
    es: `Comandos disponibles:\n/crear [nombre] - Crear una quiniela\n/unirse [código] - Unirse a una quiniela\n/predecir - Hacer predicciones\n/ranking - Ver el leaderboard\n/partidos - Próximos partidos\n/misquinielas - Ver tus quinielas`,
    en: `Available commands:\n/crear [name] - Create a pool\n/unirse [code] - Join a pool\n/predecir - Make predictions\n/ranking - View leaderboard\n/partidos - Upcoming matches\n/misquinielas - View your pools`,
  },

  // Auto-join via deep link
  autoJoinSuccess: {
    es: (name: string, quinielaName: string, memberCount: number) =>
      `✅ ¡Bienvenido ${name}! Te uniste automáticamente.\n\n📋 *${quinielaName}*\n👥 ${memberCount} participantes\n\nUsa /predecir para hacer tus predicciones.`,
    en: (name: string, quinielaName: string, memberCount: number) =>
      `✅ Welcome ${name}! You joined automatically.\n\n📋 *${quinielaName}*\n👥 ${memberCount} participants\n\nUse /predecir to make your predictions.`,
  },
  autoJoinError: {
    es: (error: string) => `${error}\n\nUsa /misquinielas para ver tus quinielas.`,
    en: (error: string) => `${error}\n\nUse /misquinielas to see your pools.`,
  },

  // Create quiniela
  createNoName: {
    es: '❌ Debes indicar el nombre de la quiniela.\n\nEjemplo: /crear Mi Quiniela del Mundial',
    en: '❌ You must provide a name for the pool.\n\nExample: /crear My World Cup Pool',
  },
  createSuccess: {
    es: (name: string, code: string, telegramLink: string, webLink: string) =>
      `✅ ¡Quiniela creada!\n\n📋 *${name}*\n🔑 Código: \`${code}\`\n\n*Comparte para invitar:*\n\n📱 Telegram:\n${telegramLink}\n\n🌐 Web:\n${webLink}`,
    en: (name: string, code: string, telegramLink: string, webLink: string) =>
      `✅ Pool created!\n\n📋 *${name}*\n🔑 Code: \`${code}\`\n\n*Share to invite:*\n\n📱 Telegram:\n${telegramLink}\n\n🌐 Web:\n${webLink}`,
  },
  createError: {
    es: '❌ Error al crear la quiniela. Intenta de nuevo.',
    en: '❌ Error creating pool. Please try again.',
  },

  // Join quiniela
  joinNoCode: {
    es: '❌ Debes indicar el código de la quiniela.\n\nEjemplo: /unirse ABC123',
    en: '❌ You must provide the pool code.\n\nExample: /unirse ABC123',
  },
  joinSuccess: {
    es: (quinielaName: string, memberCount: number) =>
      `✅ ¡Te uniste a la quiniela!\n\n📋 *${quinielaName}*\n👥 ${memberCount} participantes\n\nUsa /predecir para hacer tus predicciones.`,
    en: (quinielaName: string, memberCount: number) =>
      `✅ You joined the pool!\n\n📋 *${quinielaName}*\n👥 ${memberCount} participants\n\nUse /predecir to make your predictions.`,
  },
  joinNotFound: {
    es: 'Quiniela no encontrada. Verifica el código.',
    en: 'Pool not found. Please check the code.',
  },
  joinAlreadyMember: {
    es: 'Ya eres miembro de esta quiniela.',
    en: 'You are already a member of this pool.',
  },

  // Predict
  predictNoQuinielas: {
    es: '❌ No estás en ninguna quiniela.\n\nUsa /crear para crear una o /unirse para unirte a una existente.',
    en: '❌ You are not in any pool.\n\nUse /crear to create one or /unirse to join an existing one.',
  },
  predictSelectQuiniela: {
    es: '📊 *Selecciona una quiniela:*',
    en: '📊 *Select a pool:*',
  },
  predictComingSoon: {
    es: '🔜 Próximamente podrás predecir directamente aquí.',
    en: '🔜 Soon you will be able to predict directly here.',
  },

  // Ranking
  rankingNoQuinielas: {
    es: '❌ No estás en ninguna quiniela.',
    en: '❌ You are not in any pool.',
  },
  rankingSelectQuiniela: {
    es: '🏆 *Selecciona una quiniela para ver el ranking:*',
    en: '🏆 *Select a pool to view the ranking:*',
  },
  rankingTitle: {
    es: (name: string) => `🏆 *Ranking: ${name}*`,
    en: (name: string) => `🏆 *Ranking: ${name}*`,
  },
  rankingNotFound: {
    es: '❌ Quiniela no encontrada.',
    en: '❌ Pool not found.',
  },
  rankingNoParticipants: {
    es: 'Sin participantes aún.',
    en: 'No participants yet.',
  },

  // My quinielas
  myQuinielasEmpty: {
    es: '📭 No tienes quinielas aún.\n\nUsa /crear para crear una o /unirse para unirte.',
    en: '📭 You have no pools yet.\n\nUse /crear to create one or /unirse to join.',
  },
  myQuinielasTitle: {
    es: '📋 *Tus Quinielas:*',
    en: '📋 *Your Pools:*',
  },

  // Matches
  matchesComingSoon: {
    es: '⚽ *Próximos Partidos*\n\n🔜 Esta función estará disponible cuando comience el Mundial 2026.\n\nPor ahora, puedes crear o unirte a quinielas para estar listo.',
    en: '⚽ *Upcoming Matches*\n\n🔜 This feature will be available when the 2026 World Cup begins.\n\nFor now, you can create or join pools to get ready.',
  },

  // Callback responses
  callbackRankingFor: {
    es: (name: string) => `Ranking de ${name}`,
    en: (name: string) => `Ranking for ${name}`,
  },
  callbackPredictFor: {
    es: (name: string) => `Predicciones para ${name}`,
    en: (name: string) => `Predictions for ${name}`,
  },
};

/**
 * Get user language from Telegram context
 * Defaults to Spanish if not English
 */
export function getLang(languageCode?: string): Lang {
  if (languageCode?.startsWith('en')) {
    return 'en';
  }
  return 'es'; // Default to Spanish
}
