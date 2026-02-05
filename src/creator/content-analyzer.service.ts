import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ContentSuggestion, ContentType, ContentPriority } from './dto/content-suggestion.output';

/**
 * Response from AI content analysis
 */
interface ContentAnalysis {
  isRelevant: boolean;
  relevanceReason: string;
  viralScore: number;
  viralReason: string;
  rewrittenTitle: string;
  suggestedCaption: string;
  suggestedHashtags: string[];
  contentType: ContentType;
  priority: ContentPriority;
}

/**
 * Raw content item to analyze
 */
interface RawContentForAnalysis {
  id: string;
  title: string;
  description: string;
  source: string;
  sourceUrl?: string;
  imageUrl?: string;
  pubDate: Date;
  originalLanguage: string;
}

const ANALYSIS_SYSTEM_PROMPT = `Eres un analista de contenido experto para una página de fútbol en Facebook con millones de seguidores.

Tu trabajo es analizar noticias de fútbol y determinar:
1. Si es RELEVANTE para una página de fans (no solo informativo, sino que genere engagement)
2. Su POTENCIAL VIRAL (qué tanto engagement generará)
3. Reescribir el título para hacerlo más atractivo
4. Sugerir un caption para Facebook

CRITERIOS DE RELEVANCIA:
- Noticias sobre jugadores estrella = MUY relevante
- Fichajes confirmados o rumores fuertes = MUY relevante
- Resultados de partidos importantes = Relevante
- Declaraciones polémicas = MUY relevante
- Estadísticas impresionantes = Relevante
- Noticias administrativas/financieras = POCO relevante
- Lesiones menores = POCO relevante

CRITERIOS DE VIRALIDAD (0-100):
- 90-100: Bomba absoluta (fichaje galáctico, gol histórico, polémica enorme)
- 70-89: Muy viral (gol importante, declaración polémica, rumor fuerte)
- 50-69: Buen engagement (noticias relevantes del equipo)
- 30-49: Engagement moderado (noticias rutinarias)
- 0-29: Bajo engagement (noticias menores)

TIPOS DE CONTENIDO:
- breaking: Última hora, urgente
- transfer: Fichajes y rumores de mercado
- result: Resultados de partidos
- matchday: Día de partido, alineaciones
- injury: Lesiones
- quote: Declaraciones
- stats: Estadísticas
- rumor: Rumores no confirmados
- general: Otros

PRIORIDAD:
- urgent: Noticias que DEBEN publicarse YA (fichajes oficiales, goles en vivo)
- high: Noticias importantes del día
- normal: Noticias relevantes pero no urgentes
- low: Contenido de relleno

Responde SIEMPRE en JSON válido con esta estructura exacta:
{
  "isRelevant": true/false,
  "relevanceReason": "Explicación breve",
  "viralScore": 0-100,
  "viralReason": "Por qué este score",
  "rewrittenTitle": "Título reescrito más atractivo",
  "suggestedCaption": "Caption para Facebook (max 280 chars, incluir emojis, terminar con pregunta)",
  "suggestedHashtags": ["hashtag1", "hashtag2"],
  "contentType": "breaking|transfer|result|matchday|injury|quote|stats|rumor|general",
  "priority": "urgent|high|normal|low"
}`;

@Injectable()
export class ContentAnalyzerService {
  private readonly logger = new Logger(ContentAnalyzerService.name);
  private readonly openai: OpenAI;
  private readonly model = 'gpt-4o-mini';

  // Cache for analyzed content to avoid re-analyzing
  private readonly analysisCache = new Map<string, { analysis: ContentAnalysis; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  // Match context service (injected from module)
  private matchContextService: any;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Set the match context service (called from module to avoid circular deps)
   */
  setMatchContextService(service: any): void {
    this.matchContextService = service;
  }

  /**
   * Analyze a single content item with AI
   */
  async analyzeContent(
    content: RawContentForAnalysis,
    teamContext?: string,
  ): Promise<ContentAnalysis> {
    const cacheKey = `${content.id}-${teamContext || 'general'}`;

    // Check cache first
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(`Cache hit for content ${content.id}`);
      return cached.analysis;
    }

    try {
      const userPrompt = this.buildAnalysisPrompt(content, teamContext);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const responseText = response.choices[0]?.message?.content || '{}';
      const analysis = this.parseAnalysisResponse(responseText, content);

      // Cache the result
      this.analysisCache.set(cacheKey, {
        analysis,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      this.logger.log(
        `Analyzed content "${content.title.substring(0, 50)}..." - ` +
        `Relevant: ${analysis.isRelevant}, Viral: ${analysis.viralScore}, Type: ${analysis.contentType}`
      );

      return analysis;
    } catch (error: any) {
      this.logger.error(`Error analyzing content: ${error.message}`);
      // Return default analysis on error
      return this.getDefaultAnalysis(content);
    }
  }

  /**
   * Analyze multiple content items in batch (more efficient)
   */
  async analyzeBatch(
    contents: RawContentForAnalysis[],
    teamContext?: string,
  ): Promise<Map<string, ContentAnalysis>> {
    const results = new Map<string, ContentAnalysis>();

    // Process in parallel with concurrency limit
    const BATCH_SIZE = 5;
    for (let i = 0; i < contents.length; i += BATCH_SIZE) {
      const batch = contents.slice(i, i + BATCH_SIZE);
      const promises = batch.map(content =>
        this.analyzeContent(content, teamContext)
          .then(analysis => ({ id: content.id, analysis }))
      );

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ id, analysis }) => {
        results.set(id, analysis);
      });
    }

    return results;
  }

  /**
   * Analyze multiple content items with match context
   */
  async analyzeBatchWithMatchContext(
    contents: RawContentForAnalysis[],
    teamContext?: string,
    matchContextPrompt?: string,
  ): Promise<Map<string, ContentAnalysis>> {
    const results = new Map<string, ContentAnalysis>();

    // Process in parallel with concurrency limit
    const BATCH_SIZE = 5;
    for (let i = 0; i < contents.length; i += BATCH_SIZE) {
      const batch = contents.slice(i, i + BATCH_SIZE);
      const promises = batch.map(content =>
        this.analyzeContentWithMatchContext(content, teamContext, matchContextPrompt)
          .then(analysis => ({ id: content.id, analysis }))
      );

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ id, analysis }) => {
        results.set(id, analysis);
      });
    }

    return results;
  }

  /**
   * Analyze a single content item with match context
   */
  private async analyzeContentWithMatchContext(
    content: RawContentForAnalysis,
    teamContext?: string,
    matchContextPrompt?: string,
  ): Promise<ContentAnalysis> {
    const cacheKey = `${content.id}-${teamContext || 'general'}-${matchContextPrompt ? 'match' : 'nomatch'}`;

    // Check cache first
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(`Cache hit for content ${content.id}`);
      return cached.analysis;
    }

    try {
      const userPrompt = this.buildAnalysisPromptWithMatchContext(content, teamContext, matchContextPrompt);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const responseText = response.choices[0]?.message?.content || '{}';
      const analysis = this.parseAnalysisResponse(responseText, content);

      // Cache the result
      this.analysisCache.set(cacheKey, {
        analysis,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      return analysis;
    } catch (error: any) {
      this.logger.error(`Error analyzing content: ${error.message}`);
      return this.getDefaultAnalysis(content);
    }
  }

  /**
   * Build the prompt for content analysis with match context
   */
  private buildAnalysisPromptWithMatchContext(
    content: RawContentForAnalysis,
    teamContext?: string,
    matchContextPrompt?: string,
  ): string {
    let prompt = `Analiza esta noticia de fútbol:\n\n`;
    prompt += `TÍTULO: ${content.title}\n`;
    prompt += `DESCRIPCIÓN: ${content.description}\n`;
    prompt += `FUENTE: ${content.source}\n`;
    prompt += `IDIOMA ORIGINAL: ${content.originalLanguage}\n`;
    prompt += `FECHA: ${content.pubDate.toISOString()}\n`;

    if (teamContext) {
      prompt += `\n🎯 CONTEXTO DE PÁGINA: Esta es una página de fans de "${teamContext}".\n`;
      prompt += `Prioriza contenido sobre este equipo y sus jugadores.\n`;
    }

    if (matchContextPrompt) {
      prompt += `\n🏟️ CONTEXTO DE PARTIDO:\n${matchContextPrompt}\n`;
      prompt += `\nIMPORTANTE: Si es día de partido, el contenido relacionado al partido debe tener prioridad URGENT o HIGH.\n`;
    }

    prompt += `\nResponde con el análisis en formato JSON.`;

    return prompt;
  }

  /**
   * Enrich ContentSuggestions with AI analysis
   */
  async enrichSuggestions(
    suggestions: ContentSuggestion[],
    teamContext?: string,
    teamId?: string,
  ): Promise<ContentSuggestion[]> {
    // Get match context if available
    let matchContextPrompt = '';
    if (this.matchContextService && teamId) {
      try {
        const matchContext = await this.matchContextService.getMatchContext(teamId);
        matchContextPrompt = this.matchContextService.buildContextPrompt(matchContext, teamContext || teamId);
        if (matchContextPrompt) {
          this.logger.log(`🏟️ Match context loaded: ${matchContext.isMatchday ? 'MATCHDAY' : 'Normal day'}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to get match context: ${error.message}`);
      }
    }

    // Convert to raw format for analysis
    const rawContents: RawContentForAnalysis[] = suggestions.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      source: s.source || 'Unknown',
      sourceUrl: s.sourceUrl,
      imageUrl: s.imageUrl,
      pubDate: s.timestamp,
      originalLanguage: s.sourceLanguage || 'es',
    }));

    // Analyze all content with match context
    const analyses = await this.analyzeBatchWithMatchContext(rawContents, teamContext, matchContextPrompt);

    // Enrich suggestions with analysis
    return suggestions.map(suggestion => {
      const analysis = analyses.get(suggestion.id);
      if (!analysis) return suggestion;

      return {
        ...suggestion,
        // Override with AI analysis
        type: analysis.contentType,
        priority: analysis.priority,
        viralScore: analysis.viralScore,
        isRelevant: analysis.isRelevant,
        wasProcessedByAI: true,
        // Keep original, add rewritten
        originalTitle: suggestion.title,
        rewrittenTitle: analysis.rewrittenTitle,
        title: analysis.rewrittenTitle, // Use rewritten as main title
        // Enhanced suggestions
        suggestedCaption: analysis.suggestedCaption,
        hashtags: analysis.suggestedHashtags,
      };
    });
  }

  /**
   * Filter and sort suggestions by relevance and viral potential
   */
  filterAndSort(suggestions: ContentSuggestion[]): ContentSuggestion[] {
    return suggestions
      // Filter out irrelevant content
      .filter(s => s.isRelevant !== false)
      // Sort by priority first, then viral score
      .sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        const priorityDiff =
          (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);

        if (priorityDiff !== 0) return priorityDiff;

        // If same priority, sort by viral score
        return (b.viralScore || 0) - (a.viralScore || 0);
      });
  }

  /**
   * Build the prompt for content analysis
   */
  private buildAnalysisPrompt(
    content: RawContentForAnalysis,
    teamContext?: string,
  ): string {
    let prompt = `Analiza esta noticia de fútbol:\n\n`;
    prompt += `TÍTULO: ${content.title}\n`;
    prompt += `DESCRIPCIÓN: ${content.description}\n`;
    prompt += `FUENTE: ${content.source}\n`;
    prompt += `IDIOMA ORIGINAL: ${content.originalLanguage}\n`;
    prompt += `FECHA: ${content.pubDate.toISOString()}\n`;

    if (teamContext) {
      prompt += `\nCONTEXTO: Esta página es de fans de "${teamContext}". `;
      prompt += `Prioriza contenido sobre este equipo y sus jugadores.\n`;
    }

    prompt += `\nResponde con el análisis en formato JSON.`;

    return prompt;
  }

  /**
   * Parse the AI response and validate
   */
  private parseAnalysisResponse(
    responseText: string,
    originalContent: RawContentForAnalysis,
  ): ContentAnalysis {
    try {
      const parsed = JSON.parse(responseText);

      return {
        isRelevant: Boolean(parsed.isRelevant),
        relevanceReason: String(parsed.relevanceReason || ''),
        viralScore: Math.min(100, Math.max(0, Number(parsed.viralScore) || 50)),
        viralReason: String(parsed.viralReason || ''),
        rewrittenTitle: String(parsed.rewrittenTitle || originalContent.title),
        suggestedCaption: String(parsed.suggestedCaption || ''),
        suggestedHashtags: Array.isArray(parsed.suggestedHashtags)
          ? parsed.suggestedHashtags.map(String)
          : [],
        contentType: this.validateContentType(parsed.contentType),
        priority: this.validatePriority(parsed.priority),
      };
    } catch (error) {
      this.logger.warn(`Failed to parse AI response: ${error}`);
      return this.getDefaultAnalysis(originalContent);
    }
  }

  /**
   * Validate and normalize content type
   */
  private validateContentType(type: string): ContentType {
    const validTypes: ContentType[] = [
      ContentType.BREAKING,
      ContentType.TRANSFER,
      ContentType.RESULT,
      ContentType.MATCHDAY,
      ContentType.INJURY,
      ContentType.QUOTE,
      ContentType.STATS,
      ContentType.RUMOR,
      ContentType.GENERAL,
    ];

    const normalized = String(type).toLowerCase() as ContentType;
    return validTypes.includes(normalized) ? normalized : ContentType.GENERAL;
  }

  /**
   * Validate and normalize priority
   */
  private validatePriority(priority: string): ContentPriority {
    const validPriorities: ContentPriority[] = [
      ContentPriority.URGENT,
      ContentPriority.HIGH,
      ContentPriority.NORMAL,
      ContentPriority.LOW,
    ];

    const normalized = String(priority).toLowerCase() as ContentPriority;
    return validPriorities.includes(normalized) ? normalized : ContentPriority.NORMAL;
  }

  /**
   * Get default analysis when AI fails
   */
  private getDefaultAnalysis(content: RawContentForAnalysis): ContentAnalysis {
    return {
      isRelevant: true,
      relevanceReason: 'Default - AI analysis failed',
      viralScore: 50,
      viralReason: 'Default score',
      rewrittenTitle: content.title,
      suggestedCaption: `📰 ${content.title}`,
      suggestedHashtags: ['#futbol', '#football'],
      contentType: ContentType.GENERAL,
      priority: ContentPriority.NORMAL,
    };
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.analysisCache.entries()) {
      if (now > entry.expiresAt) {
        this.analysisCache.delete(key);
      }
    }
  }

  /**
   * Get cache stats for monitoring
   */
  getCacheStats(): { size: number; hitRate: string } {
    return {
      size: this.analysisCache.size,
      hitRate: 'N/A', // Could implement hit/miss tracking
    };
  }
}
