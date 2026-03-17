// Constants for Football Chat

// Message limits (balance user experience vs API costs - Claude + Football APIs)
// Anonymous: Enough to try the feature, encourage signup
// Authenticated: Generous daily limit, resets every 24h
export const ANONYMOUS_MESSAGE_LIMIT = 10;
export const AUTHENTICATED_MESSAGE_LIMIT = 30;
export const MESSAGE_LIMIT_RESET_HOURS = 24;

// Cache TTL in milliseconds
export const CACHE_TTL = {
  FIXTURES: 30 * 60 * 1000, // 30 minutes
  STANDINGS: 60 * 60 * 1000, // 1 hour
  LIVE_SCORES: 30 * 1000, // 30 seconds
  TEAM_INFO: 24 * 60 * 60 * 1000, // 24 hours
};

// API-Football season calculation
export function getCurrentSeason(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month < 8 ? year - 1 : year;
}

export const CURRENT_SEASON = getCurrentSeason();
