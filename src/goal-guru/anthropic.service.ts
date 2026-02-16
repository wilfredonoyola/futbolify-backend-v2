import { Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { FhgLogService } from './services/fhg-log.service'
import { FhgLogCategory } from './enums/fhg-log-category.enum'

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name)
  private readonly anthropicApiKey: string
  private readonly anthropicApiUrl = 'https://api.anthropic.com/v1/messages'
  private readonly openai: OpenAI
  private readonly retryAttempts = 3
  private readonly baseRetryDelay = 2000
  private readonly fetchTimeoutMs = 60_000 // 60s timeout per request

  // Rate limit tracking
  private lastAnthropicCall = 0
  private readonly minCallInterval = 3000 // 3 seconds between calls
  private isRateLimited = false
  private rateLimitResetTime = 0

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly fhgLogService?: FhgLogService
  ) {
    this.anthropicApiKey = this.configService.get<string>('ANTHROPIC_API_KEY')
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY')

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey })
    }
  }

  /**
   * Log to both console and FHG dashboard (if available)
   */
  private async logToFhg(
    level: 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    // Always log to console
    if (level === 'error') {
      this.logger.error(message)
    } else if (level === 'warn') {
      this.logger.warn(message)
    } else {
      this.logger.log(message)
    }

    // Also log to FHG dashboard if available
    if (this.fhgLogService) {
      try {
        if (level === 'error') {
          await this.fhgLogService.error(FhgLogCategory.PREDICTION, message, data)
        } else if (level === 'warn') {
          await this.fhgLogService.warn(FhgLogCategory.PREDICTION, message, data)
        } else {
          await this.fhgLogService.info(FhgLogCategory.PREDICTION, message, data)
        }
      } catch {
        // Ignore FHG logging errors
      }
    }
  }

  /**
   * Wait for rate limit to reset or minimum interval between calls
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now()

    // If rate limited, wait until reset time
    if (this.isRateLimited && now < this.rateLimitResetTime) {
      const waitTime = this.rateLimitResetTime - now
      this.logger.warn(`⏳ Rate limited, waiting ${Math.ceil(waitTime / 1000)}s...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      this.isRateLimited = false
    }

    // Ensure minimum interval between calls
    const timeSinceLastCall = now - this.lastAnthropicCall
    if (timeSinceLastCall < this.minCallInterval) {
      const waitTime = this.minCallInterval - timeSinceLastCall
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    this.lastAnthropicCall = Date.now()
  }

  async callAI<T>(
    prompt: string,
    useSearch = false
  ): Promise<T | null> {
    // If currently rate limited on Anthropic, skip directly to OpenAI
    if (this.isRateLimited && Date.now() < this.rateLimitResetTime) {
      this.logger.warn('⚠️ Anthropic rate limited, using OpenAI directly')
      if (this.openai) {
        const result = await this.callOpenAIWithRetry<T>(prompt)
        if (result !== null) return result
      }
    }

    // If web_search is needed, must use Anthropic (OpenAI doesn't have it)
    if (useSearch && this.anthropicApiKey && !this.isRateLimited) {
      const result = await this.callAnthropicWithRetry<T>(prompt, true)
      if (result !== null) {
        return result
      }
      this.logger.warn('Anthropic web_search failed, trying OpenAI without search...')
    }

    // For non-search calls, prefer OpenAI (faster, no rate limit issues)
    if (!useSearch && this.openai) {
      const result = await this.callOpenAIWithRetry<T>(prompt)
      if (result !== null) {
        return result
      }
      this.logger.warn('OpenAI failed, trying Anthropic...')
    }

    // Fallback chain
    if (this.openai) {
      const result = await this.callOpenAIWithRetry<T>(prompt)
      if (result !== null) return result
    }

    if (this.anthropicApiKey && !this.isRateLimited) {
      const result = await this.callAnthropicWithRetry<T>(prompt, useSearch)
      if (result !== null) return result
    }

    await this.logToFhg(
      'error',
      `❌ ALL AI SERVICES FAILED: Both Claude and GPT unavailable. Check API keys and credits.`,
      { providers: ['anthropic', 'openai'] }
    )
    return null
  }

  private async callAnthropicWithRetry<T>(
    prompt: string,
    useSearch: boolean,
    attempt = 1
  ): Promise<T | null> {
    try {
      // Wait for rate limit before making call
      await this.waitForRateLimit()

      const body: Record<string, unknown> = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }

      if (useSearch) {
        body.tools = [{ type: 'web_search_20250305', name: 'web_search' }]
      }

      this.logger.log(`🤖 Anthropic call (attempt ${attempt}, search=${useSearch})...`)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs)

      const response = await fetch(this.anthropicApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'no body')

        // Handle rate limit specifically
        if (response.status === 429) {
          this.isRateLimited = true
          // Wait 60 seconds for rate limit to reset (30k tokens/min)
          this.rateLimitResetTime = Date.now() + 60_000
          await this.logToFhg(
            'error',
            `⚠️ CLAUDE RATE LIMIT: Too many requests. Waiting 60s before retry.`,
            { provider: 'anthropic', status: 429 }
          )

          // For rate limit, use exponential backoff with longer delays
          if (attempt < this.retryAttempts) {
            const waitTime = Math.min(30_000, this.baseRetryDelay * Math.pow(2, attempt))
            await new Promise(resolve => setTimeout(resolve, waitTime))
            return this.callAnthropicWithRetry<T>(prompt, useSearch, attempt + 1)
          }

          throw new Error(`Rate limit exceeded after ${attempt} attempts`)
        }

        // Handle other specific errors
        if (response.status === 401) {
          await this.logToFhg(
            'error',
            `❌ CLAUDE AUTH ERROR: Invalid API key. Check ANTHROPIC_API_KEY in .env`,
            { provider: 'anthropic', status: 401 }
          )
        } else if (response.status === 402) {
          await this.logToFhg(
            'error',
            `❌ CLAUDE BILLING ERROR: Insufficient credits. Add credits at console.anthropic.com`,
            { provider: 'anthropic', status: 402 }
          )
        } else if (response.status === 500 || response.status === 503) {
          await this.logToFhg(
            'warn',
            `⚠️ CLAUDE SERVER ERROR: API temporarily unavailable (${response.status})`,
            { provider: 'anthropic', status: response.status }
          )
        } else {
          await this.logToFhg(
            'error',
            `❌ CLAUDE ERROR: ${response.status} - ${errorBody.slice(0, 100)}`,
            { provider: 'anthropic', status: response.status }
          )
        }

        throw new Error(`Anthropic API ${response.status}: ${errorBody.slice(0, 200)}`)
      }

      // Reset rate limit flag on success
      this.isRateLimited = false

      const data = await response.json()

      // Extract text content and parse JSON from it
      const textContent = data.content
        .map((item: { text?: string }) => item.text || '')
        .join('')
        .replace(/```json|```/g, '')
        .trim()

      const jsonMatch = textContent.match(/\{[\s\S]*\}|\[[\s\S]*\]/)

      if (!jsonMatch) {
        this.logger.warn(`No JSON found in Anthropic response. Raw text: ${textContent.slice(0, 300)}`)
        throw new Error('No JSON found in Anthropic response')
      }

      const parsed = JSON.parse(jsonMatch[0]) as T
      this.logger.log(`✅ Anthropic response parsed successfully`)
      return parsed
    } catch (error) {
      this.logger.error(
        `Anthropic attempt ${attempt} failed: ${error.message}`
      )

      // Don't retry if already rate limited
      if (this.isRateLimited) {
        return null
      }

      if (attempt < this.retryAttempts) {
        const waitTime = this.baseRetryDelay * attempt
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        return this.callAnthropicWithRetry<T>(prompt, useSearch, attempt + 1)
      }

      return null
    }
  }

  private async callOpenAIWithRetry<T>(
    prompt: string,
    attempt = 1
  ): Promise<T | null> {
    try {
      this.logger.log(`🤖 OpenAI call (attempt ${attempt})...`)

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert football betting analyst. You ONLY analyze football matches and betting markets. You ALWAYS respond with valid JSON (no markdown, no backticks, no extra text). You NEVER respond about anything other than football analysis. If the prompt asks about football matches, analyze them with statistical rigor.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenAI response')
      }

      const cleaned = content.replace(/```json|```/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)

      if (!jsonMatch) {
        this.logger.warn(`No JSON in OpenAI response. Raw: ${cleaned.slice(0, 300)}`)
        throw new Error('No JSON found in OpenAI response')
      }

      const parsed = JSON.parse(jsonMatch[0]) as T
      this.logger.log(`✅ OpenAI response parsed successfully`)
      return parsed
    } catch (error) {
      const errorMsg = error.message || String(error)
      const errorCode = error.status || error.code

      // Log specific OpenAI errors to FHG dashboard
      if (errorCode === 429 || errorMsg.includes('rate_limit')) {
        await this.logToFhg(
          'error',
          `⚠️ OPENAI RATE LIMIT: Too many requests. Try again later.`,
          { provider: 'openai', error: errorMsg }
        )
      } else if (errorCode === 401 || errorMsg.includes('invalid_api_key')) {
        await this.logToFhg(
          'error',
          `❌ OPENAI AUTH ERROR: Invalid API key. Check OPENAI_API_KEY in .env`,
          { provider: 'openai', error: errorMsg }
        )
      } else if (errorCode === 402 || errorMsg.includes('insufficient_quota')) {
        await this.logToFhg(
          'error',
          `❌ OPENAI QUOTA ERROR: Insufficient credits. Add credits at platform.openai.com`,
          { provider: 'openai', error: errorMsg }
        )
      } else if (errorCode === 500 || errorCode === 503) {
        await this.logToFhg(
          'warn',
          `⚠️ OPENAI SERVER ERROR: API temporarily unavailable`,
          { provider: 'openai', error: errorMsg }
        )
      } else {
        this.logger.error(`OpenAI attempt ${attempt} failed: ${errorMsg}`)
      }

      if (attempt < this.retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.baseRetryDelay * attempt)
        )
        return this.callOpenAIWithRetry<T>(prompt, attempt + 1)
      }

      // Final failure - log to dashboard
      if (attempt >= this.retryAttempts) {
        await this.logToFhg(
          'error',
          `❌ OPENAI FAILED: All ${this.retryAttempts} attempts failed`,
          { provider: 'openai', error: errorMsg }
        )
      }

      return null
    }
  }
}
