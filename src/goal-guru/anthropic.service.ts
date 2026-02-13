import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name)
  private readonly anthropicApiKey: string
  private readonly anthropicApiUrl = 'https://api.anthropic.com/v1/messages'
  private readonly openai: OpenAI
  private readonly retryAttempts = 2
  private readonly retryDelay = 1000
  private readonly fetchTimeoutMs = 60_000 // 60s timeout per request

  constructor(private readonly configService: ConfigService) {
    this.anthropicApiKey = this.configService.get<string>('ANTHROPIC_API_KEY')
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY')
    
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey })
    }
  }

  async callAI<T>(
    prompt: string,
    useSearch = false
  ): Promise<T | null> {
    // If web_search is needed, must use Anthropic (OpenAI doesn't have it)
    if (useSearch && this.anthropicApiKey) {
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

    if (this.anthropicApiKey) {
      const result = await this.callAnthropicWithRetry<T>(prompt, useSearch)
      if (result !== null) return result
    }

    this.logger.error('All AI services failed')
    return null
  }

  private async callAnthropicWithRetry<T>(
    prompt: string,
    useSearch: boolean,
    attempt = 1
  ): Promise<T | null> {
    try {
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
        throw new Error(`Anthropic API ${response.status}: ${errorBody.slice(0, 200)}`)
      }

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

      if (attempt < this.retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * attempt)
        )
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
      this.logger.error(
        `OpenAI attempt ${attempt} failed: ${error.message}`
      )

      if (attempt < this.retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * attempt)
        )
        return this.callOpenAIWithRetry<T>(prompt, attempt + 1)
      }

      return null
    }
  }
}
