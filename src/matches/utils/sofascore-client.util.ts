import axios, { AxiosInstance } from 'axios'
import { ConfigService } from '@nestjs/config'
import {
  SofaScoreStatsResponse,
  SofaScoreIncidentsResponse,
} from '../dto/sofascore-api.dto'

const TIMEOUT_MS = 15000

function getRandomUserAgent(): string {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X)...',
    'Mozilla/5.0 (Linux; Android 10; SM-G975F)...',
  ]
  return agents[Math.floor(Math.random() * agents.length)]
}

function buildScraperApiUrl(apiKey: string, targetUrl: string): string {
  return `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(
    targetUrl
  )}`
}

async function makeRequestWithFallback<T>(
  requestFn: (api: AxiosInstance) => Promise<T>,
  configService: ConfigService
): Promise<T> {
  const useScraper = configService.get<string>('USE_SCRAPERAPI') === 'true'
  const scraperKey = configService.get<string>('SCRAPERAPI_KEY') || ''
  const useRapid = configService.get<string>('USE_RAPIDAPI_SOFA') === 'true'

  const rapidApi = axios.create({
    baseURL: 'https://sofascore.p.rapidapi.com',
    headers: {
      'X-RapidAPI-Key': configService.get<string>('RAPIDAPI_KEY_SOFA') || '',
      'X-RapidAPI-Host': 'sofascore.p.rapidapi.com',
    },
    timeout: TIMEOUT_MS,
  })

  const directApi = axios.create({
    baseURL: 'https://api.sofascore.com/api/v1',
    headers: {
      'User-Agent': getRandomUserAgent(),
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.sofascore.com/',
    },
    timeout: TIMEOUT_MS,
  })

  // Usar ScraperAPI si está habilitado
  if (useScraper && scraperKey) {
    const scraperApi = {
      get: async (url: string) => {
        const scraperUrl = buildScraperApiUrl(
          scraperKey,
          `https://api.sofascore.com/api/v1${url}`
        )
        const res = await axios.get(scraperUrl, { timeout: TIMEOUT_MS })
        return res
      },
    }
    return requestFn(scraperApi as AxiosInstance)
  }

  // Fallback estándar
  try {
    return useRapid ? await requestFn(rapidApi) : await requestFn(directApi)
  } catch (error: any) {
    const status = error.response?.status
    if (useRapid && [401, 403, 429].includes(status)) {
      console.warn(
        `⚠️ RapidAPI falló con ${status}, usando fallback directo...`
      )
      return await requestFn(directApi)
    }
    throw error
  }
}

export async function fetchLiveMatches(
  configService: ConfigService
): Promise<any[]> {
  const res = await makeRequestWithFallback(
    (api) => api.get('/sport/football/events/live').then((res) => res.data),
    configService
  )
  return res.events || []
}

export async function fetchMatchStatistics(
  matchId: number,
  configService: ConfigService
): Promise<SofaScoreStatsResponse> {
  const res = await makeRequestWithFallback(
    (api) => api.get(`/event/${matchId}/statistics`).then((res) => res.data),
    configService
  )
  return res
}

export async function fetchMatchTimeline(
  matchId: number,
  configService: ConfigService
): Promise<SofaScoreIncidentsResponse> {
  const res = await makeRequestWithFallback(
    (api) => api.get(`/event/${matchId}/incidents`).then((res) => res.data),
    configService
  )
  return res
}
