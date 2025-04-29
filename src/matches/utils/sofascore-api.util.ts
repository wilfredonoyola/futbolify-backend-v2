import axios, { AxiosInstance } from 'axios'
import { CacheService } from '../cache.service'
import { ConfigService } from '@nestjs/config'

const API_CACHE = {
  liveMatches: 30,
  matchStats: 60,
  timeline: 60,
}

function createSofascoreApi(configService: ConfigService): AxiosInstance {
  const apiKey = configService.get<string>('RAPIDAPI_KEY_SOFA')
  const apiHost = 'sofascore.p.rapidapi.com'

  if (!apiKey) {
    const msg = '❌ RAPIDAPI_KEY_SOFA no definido.'
    if (configService.get('NODE_ENV') === 'production') throw new Error(msg)
    console.warn(`⚠️ ${msg} Continuando sin clave en desarrollo.`)
  }

  return axios.create({
    baseURL: 'https://sofascore.p.rapidapi.com',
    headers: {
      'X-RapidAPI-Key': apiKey || '',
      'X-RapidAPI-Host': apiHost,
    },
    timeout: 5000,
  })
}

const RETRY_ATTEMPTS = 3
const RETRY_DELAY = 1000

async function makeRequestWithRetry<T>(
  requestFn: () => Promise<T>,
  attempts = RETRY_ATTEMPTS
): Promise<T> {
  try {
    return await requestFn()
  } catch (error: any) {
    const status = error.response?.status
    const message = error.response?.data?.message || error.message

    console.error(`❌ Error en petición: [${status}] ${message}`)

    if (status === 401) {
      console.error('🚫 Clave RapidAPI inválida o sin permisos.')
      throw error
    }

    if (attempts <= 1) throw error

    const wait = RETRY_DELAY * (RETRY_ATTEMPTS - attempts + 1)
    console.log(`🔁 Reintentando en ${wait}ms... (${attempts - 1} restantes)`)

    await new Promise((res) => setTimeout(res, wait))
    return makeRequestWithRetry(requestFn, attempts - 1)
  }
}

// === LIVE MATCHES ===
export async function fetchLiveMatches(
  cacheService: CacheService,
  configService: ConfigService
): Promise<any[]> {
  const cacheKey = 'live-matches'
  const cached = cacheService.get<any[]>(cacheKey)
  if (cached) {
    console.log('♻️ [CACHE] live matches')
    return cached
  }

  const api = createSofascoreApi(configService)

  try {
    const res = await makeRequestWithRetry(() =>
      api.get('/tournaments/get-live-events', {
        params: { sport: 'football' },
      })
    )

    const matches = res.data.events || []
    cacheService.set(cacheKey, matches, API_CACHE.liveMatches)
    return matches
  } catch (err) {
    console.error('❌ No se pudieron obtener los partidos en vivo.')
    return []
  }
}

// === STATS ===
export async function fetchMatchStatistics(
  matchId: number,
  cacheService: CacheService,
  configService: ConfigService
): Promise<any> {
  const cacheKey = `stats-${matchId}`
  const cached = cacheService.get<any>(cacheKey)
  if (cached) {
    console.log(`♻️ [CACHE] stats-${matchId}`)
    return cached
  }

  const api = createSofascoreApi(configService)

  try {
    const res = await makeRequestWithRetry(() =>
      api.get('/matches/get-statistics', {
        params: { matchId },
      })
    )

    cacheService.set(cacheKey, res.data, API_CACHE.matchStats)
    return res.data
  } catch (err) {
    console.warn(`⚠️ No se pudieron obtener stats para ${matchId}`)
    throw err
  }
}

// === TIMELINE ===
export async function fetchMatchTimeline(
  matchId: number,
  cacheService: CacheService,
  configService: ConfigService
): Promise<any> {
  const cacheKey = `timeline-${matchId}`
  const cached = cacheService.get<any>(cacheKey)
  if (cached) {
    console.log(`♻️ [CACHE] timeline-${matchId}`)
    return cached
  }

  const api = createSofascoreApi(configService)

  try {
    const res = await makeRequestWithRetry(() =>
      api.get('/matches/get-incidents', {
        params: { matchId },
      })
    )

    cacheService.set(cacheKey, res.data, API_CACHE.timeline)
    return res.data
  } catch (err) {
    console.warn(`⚠️ No se pudo obtener timeline para ${matchId}`)
    throw err
  }
}
