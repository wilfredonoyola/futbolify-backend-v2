import axios, { AxiosInstance } from 'axios'
import { ConfigService } from '@nestjs/config'
import {
  SofaScoreStatsResponse,
  SofaScoreIncidentsResponse,
} from '../dto/sofascore-api.dto'

const TIMEOUT_MS = 5000

async function makeRequestWithFallback<T>(
  requestFn: (api: AxiosInstance) => Promise<T>,
  configService: ConfigService
): Promise<T> {
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
      'User-Agent': 'Mozilla/5.0',
    },
    timeout: TIMEOUT_MS,
  })

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
