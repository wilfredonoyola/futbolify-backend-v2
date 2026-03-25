import { Injectable, Logger } from '@nestjs/common'
import { RedisCacheService } from '../../common/redis-cache.service'

/**
 * Cache TTL: 3 hours (weather doesn't change rapidly)
 */
const CACHE_TTL = 10800 // 3 hours in seconds

/**
 * Weather data relevant for betting analysis
 */
export interface WeatherData {
  latitude: number
  longitude: number
  date: string // YYYY-MM-DD
  hour: number // 0-23

  // Core weather metrics for betting
  temperature: number // Celsius
  windSpeed: number // km/h
  precipitation: number // mm
  precipitationProbability: number // %

  // Additional context
  humidity: number // %
  cloudCover: number // %
  weatherCode: number // WMO code
  weatherDescription: string

  // Computed flags for betting
  isRainy: boolean
  isWindy: boolean
  isExtreme: boolean // extreme conditions
}

/**
 * Stadium location for weather lookup
 */
export interface StadiumLocation {
  name: string
  city: string
  latitude: number
  longitude: number
}

/**
 * Well-known stadium locations
 */
const STADIUM_LOCATIONS: Record<string, StadiumLocation> = {
  // Netherlands - Eredivisie
  'Johan Cruijff Arena': { name: 'Johan Cruijff Arena', city: 'Amsterdam', latitude: 52.3140, longitude: 4.9411 },
  'De Kuip': { name: 'De Kuip', city: 'Rotterdam', latitude: 51.8940, longitude: 4.5230 },
  'Philips Stadion': { name: 'Philips Stadion', city: 'Eindhoven', latitude: 51.4417, longitude: 5.4675 },
  // Germany - Bundesliga
  'Allianz Arena': { name: 'Allianz Arena', city: 'Munich', latitude: 48.2188, longitude: 11.6247 },
  'Signal Iduna Park': { name: 'Signal Iduna Park', city: 'Dortmund', latitude: 51.4926, longitude: 7.4518 },
  'Olympiastadion': { name: 'Olympiastadion', city: 'Berlin', latitude: 52.5148, longitude: 13.2395 },
  // England - Premier League
  'Old Trafford': { name: 'Old Trafford', city: 'Manchester', latitude: 53.4631, longitude: -2.2914 },
  'Anfield': { name: 'Anfield', city: 'Liverpool', latitude: 53.4308, longitude: -2.9608 },
  'Emirates Stadium': { name: 'Emirates Stadium', city: 'London', latitude: 51.5549, longitude: -0.1084 },
  'Stamford Bridge': { name: 'Stamford Bridge', city: 'London', latitude: 51.4817, longitude: -0.1909 },
  'Etihad Stadium': { name: 'Etihad Stadium', city: 'Manchester', latitude: 53.4831, longitude: -2.2004 },
  // Spain - La Liga
  'Santiago Bernabéu': { name: 'Santiago Bernabéu', city: 'Madrid', latitude: 40.4530, longitude: -3.6883 },
  'Camp Nou': { name: 'Camp Nou', city: 'Barcelona', latitude: 41.3809, longitude: 2.1228 },
  'Wanda Metropolitano': { name: 'Wanda Metropolitano', city: 'Madrid', latitude: 40.4362, longitude: -3.5993 },
  // Italy - Serie A
  'San Siro': { name: 'San Siro', city: 'Milan', latitude: 45.4781, longitude: 9.1240 },
  'Allianz Stadium': { name: 'Allianz Stadium', city: 'Turin', latitude: 45.1096, longitude: 7.6413 },
  'Stadio Olimpico': { name: 'Stadio Olimpico', city: 'Rome', latitude: 41.9341, longitude: 12.4547 },
  // France - Ligue 1
  'Parc des Princes': { name: 'Parc des Princes', city: 'Paris', latitude: 48.8414, longitude: 2.2530 },
  'Groupama Stadium': { name: 'Groupama Stadium', city: 'Lyon', latitude: 45.7653, longitude: 4.9822 },
  'Stade Vélodrome': { name: 'Stade Vélodrome', city: 'Marseille', latitude: 43.2697, longitude: 5.3959 },
}

/**
 * City coordinates fallback
 */
const CITY_LOCATIONS: Record<string, { latitude: number; longitude: number }> = {
  // Netherlands
  'Amsterdam': { latitude: 52.3676, longitude: 4.9041 },
  'Rotterdam': { latitude: 51.9244, longitude: 4.4777 },
  'Eindhoven': { latitude: 51.4416, longitude: 5.4697 },
  // Germany
  'Munich': { latitude: 48.1351, longitude: 11.5820 },
  'Dortmund': { latitude: 51.5136, longitude: 7.4653 },
  'Berlin': { latitude: 52.5200, longitude: 13.4050 },
  'Frankfurt': { latitude: 50.1109, longitude: 8.6821 },
  'Hamburg': { latitude: 53.5511, longitude: 9.9937 },
  'Leipzig': { latitude: 51.3397, longitude: 12.3731 },
  'Stuttgart': { latitude: 48.7758, longitude: 9.1829 },
  'Cologne': { latitude: 50.9375, longitude: 6.9603 },
  // England - Premier League & Championship
  'Manchester': { latitude: 53.4808, longitude: -2.2426 },
  'Liverpool': { latitude: 53.4084, longitude: -2.9916 },
  'London': { latitude: 51.5074, longitude: -0.1278 },
  'Birmingham': { latitude: 52.4862, longitude: -1.8904 },
  'Leeds': { latitude: 53.8008, longitude: -1.5491 },
  'Newcastle': { latitude: 54.9783, longitude: -1.6178 },
  'Sheffield': { latitude: 53.3811, longitude: -1.4701 },
  'Nottingham': { latitude: 52.9548, longitude: -1.1581 },
  'Leicester': { latitude: 52.6369, longitude: -1.1398 },
  'Southampton': { latitude: 50.9097, longitude: -1.4044 },
  'Brighton': { latitude: 50.8225, longitude: -0.1372 },
  'Wolverhampton': { latitude: 52.5870, longitude: -2.1288 },
  'Bristol': { latitude: 51.4545, longitude: -2.5879 },
  // England - League One & Two
  'Doncaster': { latitude: 53.5228, longitude: -1.1285 },
  'Port Vale': { latitude: 53.0027, longitude: -2.1794 }, // Stoke-on-Trent area
  'Stoke': { latitude: 53.0027, longitude: -2.1794 },
  'Bolton': { latitude: 53.5780, longitude: -2.4282 },
  'Wigan': { latitude: 53.5448, longitude: -2.6318 },
  'Blackpool': { latitude: 53.8175, longitude: -3.0357 },
  'Preston': { latitude: 53.7632, longitude: -2.7031 },
  'Burnley': { latitude: 53.7897, longitude: -2.2480 },
  'Blackburn': { latitude: 53.7469, longitude: -2.4851 },
  'Huddersfield': { latitude: 53.6450, longitude: -1.7798 },
  'Barnsley': { latitude: 53.5529, longitude: -1.4790 },
  'Rotherham': { latitude: 53.4326, longitude: -1.3635 },
  'Derby': { latitude: 52.9225, longitude: -1.4746 },
  'Coventry': { latitude: 52.4068, longitude: -1.5197 },
  'Sunderland': { latitude: 54.9069, longitude: -1.3838 },
  'Middlesbrough': { latitude: 54.5742, longitude: -1.2350 },
  'Hull': { latitude: 53.7676, longitude: -0.3274 },
  'Ipswich': { latitude: 52.0567, longitude: 1.1482 },
  'Norwich': { latitude: 52.6309, longitude: 1.2974 },
  'Plymouth': { latitude: 50.3755, longitude: -4.1427 },
  'Exeter': { latitude: 50.7184, longitude: -3.5339 },
  'Portsmouth': { latitude: 50.8198, longitude: -1.0880 },
  'Reading': { latitude: 51.4543, longitude: -0.9781 },
  'Oxford': { latitude: 51.7520, longitude: -1.2577 },
  'Cambridge': { latitude: 52.2053, longitude: 0.1218 },
  'Peterborough': { latitude: 52.5695, longitude: -0.2405 },
  'Milton Keynes': { latitude: 52.0406, longitude: -0.7594 },
  'Luton': { latitude: 51.8787, longitude: -0.4200 },
  'Watford': { latitude: 51.6565, longitude: -0.3903 },
  // Spain
  'Madrid': { latitude: 40.4168, longitude: -3.7038 },
  'Barcelona': { latitude: 41.3851, longitude: 2.1734 },
  'Seville': { latitude: 37.3891, longitude: -5.9845 },
  'Valencia': { latitude: 39.4699, longitude: -0.3763 },
  'Bilbao': { latitude: 43.2630, longitude: -2.9350 },
  // Italy
  'Milan': { latitude: 45.4642, longitude: 9.1900 },
  'Turin': { latitude: 45.0703, longitude: 7.6869 },
  'Rome': { latitude: 41.9028, longitude: 12.4964 },
  'Naples': { latitude: 40.8518, longitude: 14.2681 },
  'Florence': { latitude: 43.7696, longitude: 11.2558 },
  // France
  'Paris': { latitude: 48.8566, longitude: 2.3522 },
  'Lyon': { latitude: 45.7640, longitude: 4.8357 },
  'Marseille': { latitude: 43.2965, longitude: 5.3698 },
  'Lille': { latitude: 50.6292, longitude: 3.0573 },
  'Nice': { latitude: 43.7102, longitude: 7.2620 },
  'Monaco': { latitude: 43.7384, longitude: 7.4246 },
  // Portugal
  'Lisbon': { latitude: 38.7223, longitude: -9.1393 },
  'Porto': { latitude: 41.1579, longitude: -8.6291 },
  // Mexico
  'Mexico City': { latitude: 19.4326, longitude: -99.1332 },
  'Guadalajara': { latitude: 20.6597, longitude: -103.3496 },
  'Monterrey': { latitude: 25.6866, longitude: -100.3161 },
}

/**
 * WMO Weather interpretation codes
 */
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
}

@Injectable()
export class OpenMeteoService {
  private readonly logger = new Logger(OpenMeteoService.name)
  private readonly baseUrl = 'https://api.open-meteo.com/v1/forecast'

  constructor(private readonly redisCache: RedisCacheService) {}

  /**
   * Get weather data for a specific location and date/time
   *
   * @param latitude - Latitude of the location
   * @param longitude - Longitude of the location
   * @param date - Date in YYYY-MM-DD format
   * @param hour - Hour of day (0-23), defaults to 15:00 (typical match time)
   */
  async getWeather(
    latitude: number,
    longitude: number,
    date: string,
    hour: number = 15
  ): Promise<WeatherData | null> {
    const cacheKey = `weather:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${date}:${hour}`

    const cached = await this.redisCache.get<WeatherData>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for weather at ${latitude},${longitude}`)
      return cached
    }

    try {
      const url = new URL(this.baseUrl)
      url.searchParams.set('latitude', latitude.toString())
      url.searchParams.set('longitude', longitude.toString())
      url.searchParams.set('start_date', date)
      url.searchParams.set('end_date', date)
      url.searchParams.set(
        'hourly',
        'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,cloud_cover'
      )
      url.searchParams.set('timezone', 'auto')

      const response = await fetch(url.toString())

      if (!response.ok) {
        this.logger.error(`Open-Meteo API error: ${response.status}`)
        return null
      }

      const data = await response.json()
      const hourlyData = data.hourly

      if (!hourlyData || !hourlyData.time || hourlyData.time.length === 0) {
        this.logger.warn('No hourly data returned from Open-Meteo')
        return null
      }

      // Find the index for the requested hour
      const hourIndex = Math.min(hour, hourlyData.time.length - 1)

      const temperature = hourlyData.temperature_2m?.[hourIndex] ?? 15
      const windSpeed = hourlyData.wind_speed_10m?.[hourIndex] ?? 0
      const precipitation = hourlyData.precipitation?.[hourIndex] ?? 0
      const precipitationProbability =
        hourlyData.precipitation_probability?.[hourIndex] ?? 0
      const humidity = hourlyData.relative_humidity_2m?.[hourIndex] ?? 50
      const cloudCover = hourlyData.cloud_cover?.[hourIndex] ?? 0
      const weatherCode = hourlyData.weather_code?.[hourIndex] ?? 0

      const result: WeatherData = {
        latitude,
        longitude,
        date,
        hour,
        temperature,
        windSpeed,
        precipitation,
        precipitationProbability,
        humidity,
        cloudCover,
        weatherCode,
        weatherDescription: WMO_CODES[weatherCode] || 'Unknown',
        isRainy: precipitation > 0.5 || precipitationProbability > 50,
        isWindy: windSpeed > 30, // >30 km/h considered windy
        isExtreme:
          temperature < 0 ||
          temperature > 35 ||
          windSpeed > 50 ||
          precipitation > 10,
      }

      await this.redisCache.set(cacheKey, result, CACHE_TTL)
      this.logger.log(
        `Fetched weather for ${latitude.toFixed(2)},${longitude.toFixed(2)} on ${date}: ${result.weatherDescription}`
      )

      return result
    } catch (error) {
      this.logger.error(`Error fetching weather: ${error.message}`)
      return null
    }
  }

  /**
   * Get weather for a stadium by name
   */
  async getWeatherForStadium(
    stadiumName: string,
    date: string,
    hour: number = 15
  ): Promise<WeatherData | null> {
    const stadium = STADIUM_LOCATIONS[stadiumName]
    if (stadium) {
      return this.getWeather(stadium.latitude, stadium.longitude, date, hour)
    }

    this.logger.warn(`Stadium not found: ${stadiumName}`)
    return null
  }

  /**
   * Get weather for a city
   */
  async getWeatherForCity(
    city: string,
    date: string,
    hour: number = 15
  ): Promise<WeatherData | null> {
    const location = CITY_LOCATIONS[city]
    if (location) {
      return this.getWeather(location.latitude, location.longitude, date, hour)
    }

    // Try to find partial match
    const cityLower = city.toLowerCase()
    for (const [name, coords] of Object.entries(CITY_LOCATIONS)) {
      if (name.toLowerCase().includes(cityLower) || cityLower.includes(name.toLowerCase())) {
        return this.getWeather(coords.latitude, coords.longitude, date, hour)
      }
    }

    this.logger.warn(`City not found: ${city}`)
    return null
  }

  /**
   * Calculate weather impact multipliers for betting
   * Returns multipliers that can be applied to base probabilities
   */
  calculateWeatherMultipliers(weather: WeatherData): {
    goalsMultiplier: number
    cornersMultiplier: number
    correlationAdj: number
    flags: string[]
  } {
    const flags: string[] = []
    let goalsMultiplier = 1.0
    let cornersMultiplier = 1.0
    let correlationAdj = 0

    // Rain impact
    if (weather.isRainy) {
      flags.push('RAIN')
      // Rain slightly reduces goal scoring but increases corners
      goalsMultiplier *= 0.95
      cornersMultiplier *= 1.08
      correlationAdj += 0.02 // Goals and corners become more correlated in rain
    }

    // Wind impact
    if (weather.isWindy) {
      flags.push('WINDY')
      // Strong wind reduces accuracy, slightly fewer goals
      goalsMultiplier *= 0.92
      cornersMultiplier *= 1.05 // More crosses, more corners
      correlationAdj += 0.03
    }

    // Extreme conditions
    if (weather.isExtreme) {
      flags.push('EXTREME')
      // Extreme conditions generally reduce scoring
      goalsMultiplier *= 0.88
      cornersMultiplier *= 0.95
      correlationAdj += 0.05
    }

    // Temperature effects
    if (weather.temperature > 30) {
      flags.push('HOT')
      // Hot weather can slow down play
      goalsMultiplier *= 0.96
      cornersMultiplier *= 0.98
    } else if (weather.temperature < 5) {
      flags.push('COLD')
      // Cold weather can make play more direct
      goalsMultiplier *= 0.97
      cornersMultiplier *= 1.02
    }

    // Heavy precipitation
    if (weather.precipitation > 5) {
      flags.push('HEAVY_RAIN')
      goalsMultiplier *= 0.90
      cornersMultiplier *= 1.12 // Slippery conditions = more corners
    }

    return {
      goalsMultiplier: Math.round(goalsMultiplier * 100) / 100,
      cornersMultiplier: Math.round(cornersMultiplier * 100) / 100,
      correlationAdj: Math.round(correlationAdj * 100) / 100,
      flags,
    }
  }

  /**
   * Get default weather (no impact) when weather data unavailable
   */
  getDefaultWeatherMultipliers(): {
    goalsMultiplier: number
    cornersMultiplier: number
    correlationAdj: number
    flags: string[]
  } {
    return {
      goalsMultiplier: 1.0,
      cornersMultiplier: 1.0,
      correlationAdj: 0,
      flags: ['WEATHER_UNAVAILABLE'],
    }
  }

  /**
   * Check if Open-Meteo API is available
   * Open-Meteo is free and doesn't require authentication
   */
  async getApiStatus(): Promise<{
    configured: boolean
    available: boolean
    message?: string
  }> {
    try {
      // Make a simple request to verify API is reachable
      const url = new URL(this.baseUrl)
      url.searchParams.set('latitude', '52.52')
      url.searchParams.set('longitude', '13.41')
      url.searchParams.set('current', 'temperature_2m')

      const response = await fetch(url.toString())

      if (!response.ok) {
        return {
          configured: true,
          available: false,
          message: `API error: ${response.status}`,
        }
      }

      return {
        configured: true, // No key needed, always "configured"
        available: true,
      }
    } catch (error) {
      return {
        configured: true,
        available: false,
        message: `Connection error: ${error.message}`,
      }
    }
  }
}
