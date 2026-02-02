import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import OpenAI from 'openai';
import { ContentSuggestion, ContentType } from './dto/content-suggestion.output';

const SYSTEM_PROMPT = `
Eres un generador de contenido para una página de fútbol en Facebook.

Tu objetivo es crear posts que:
1. Generen ENGAGEMENT (comentarios, shares)
2. Sean informativos pero con PERSONALIDAD
3. Inviten al DEBATE sin ser ofensivos
4. Tengan el TONO de un fan apasionado

Reglas:
- Máximo 280 caracteres
- Incluir 1-2 emojis relevantes
- Terminar con pregunta o llamada a la acción
- Nunca inventar datos
- Nunca insultar jugadores/equipos
- Escribe en español

Responde SOLO con el texto del post, sin comillas ni explicaciones adicionales.
`;

const PROMPT_TEMPLATES: Record<ContentType, string> = {
  [ContentType.BREAKING]: `
Noticia URGENTE de última hora. Genera un post que transmita urgencia y emoción.
Usa emojis como 🚨 o 🔴 al inicio.
`,
  [ContentType.MATCHDAY]: `
Es día de partido. Genera un post que motive a los fans antes del juego.
Usa emojis como ⚽ o 🔥.
Incluye una pregunta sobre el resultado esperado.
`,
  [ContentType.RESULT]: `
Resultado de partido. Genera un post celebrando o analizando el resultado.
Usa emojis acordes al sentimiento (victoria, derrota, empate).
Invita a comentar sobre el rendimiento del equipo.
`,
  [ContentType.TRANSFER]: `
Noticia de fichaje/transferencia. Genera un post emocionante sobre el movimiento.
Usa emojis como ✨ o 🆕.
Pregunta a los fans su opinión sobre el fichaje.
`,
  [ContentType.INJURY]: `
Noticia de lesión. Genera un post informativo pero respetuoso.
Desea pronta recuperación al jugador.
`,
  [ContentType.STATS]: `
Estadísticas o récords. Genera un post destacando los números impresionantes.
Usa emojis como 📊 o 🏆.
`,
  [ContentType.QUOTE]: `
Declaraciones de jugador/entrenador. Genera un post que resalte las palabras clave.
Usa emojis como 💬 o 🗣️.
Invita a los fans a opinar sobre lo dicho.
`,
  [ContentType.MEME]: `
Contenido viral/meme. Genera un post divertido y ligero.
Usa emojis como 😂 o 🤣.
`,
  [ContentType.THROWBACK]: `
Contenido nostálgico. Genera un post que evoque buenos recuerdos.
Usa emojis como 📸 o 🕰️.
Pregunta a los fans si recuerdan ese momento.
`,
  [ContentType.RUMOR]: `
Rumor de mercado. Genera un post intrigante pero con tono de especulación.
Usa emojis como 👀 o 🤔.
Pregunta a los fans qué opinan del rumor.
`,
  [ContentType.GENERAL]: `
Noticia general de fútbol. Genera un post informativo y engaging.
`,
};

export interface GenerationResult {
  text: string;
  model: string;
  promptVersion: string;
  tokensUsed: number;
}

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly openai: OpenAI;
  private readonly model = 'gpt-4o-mini';
  private readonly promptVersion = 'v1';

  // In-memory cache for suggestions with TTL
  private readonly suggestionCache = new Map<
    string,
    { suggestion: ContentSuggestion; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Cache a suggestion for later retrieval when generating a post
   */
  cacheSuggestion(suggestion: ContentSuggestion): void {
    this.suggestionCache.set(suggestion.id, {
      suggestion,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  /**
   * Cache multiple suggestions at once
   */
  cacheSuggestions(suggestions: ContentSuggestion[]): void {
    for (const suggestion of suggestions) {
      this.cacheSuggestion(suggestion);
    }
  }

  /**
   * Retrieve a cached suggestion by ID
   */
  getSuggestion(suggestionId: string): ContentSuggestion | null {
    const cached = this.suggestionCache.get(suggestionId);
    if (!cached) {
      return null;
    }
    if (Date.now() > cached.expiresAt) {
      this.suggestionCache.delete(suggestionId);
      return null;
    }
    return cached.suggestion;
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [id, entry] of this.suggestionCache.entries()) {
      if (now > entry.expiresAt) {
        this.suggestionCache.delete(id);
      }
    }
  }

  /**
   * Generate a post from a ContentSuggestion
   */
  async generateFromSuggestion(
    suggestion: ContentSuggestion,
  ): Promise<GenerationResult> {
    const prompt = this.buildPrompt(suggestion);
    return this.callOpenAI(prompt);
  }

  /**
   * Generate a post from a cached suggestion ID
   */
  async generateFromSuggestionId(
    suggestionId: string,
  ): Promise<{ suggestion: ContentSuggestion; result: GenerationResult }> {
    const suggestion = this.getSuggestion(suggestionId);
    if (!suggestion) {
      throw new NotFoundException(
        `Suggestion ${suggestionId} not found in cache. It may have expired or was never cached.`,
      );
    }
    const result = await this.generateFromSuggestion(suggestion);
    return { suggestion, result };
  }

  /**
   * Build the user prompt based on content type
   */
  private buildPrompt(suggestion: ContentSuggestion): string {
    const typePrompt =
      PROMPT_TEMPLATES[suggestion.type] || PROMPT_TEMPLATES[ContentType.GENERAL];

    return `
${typePrompt}

Tipo de contenido: ${suggestion.type}
Prioridad: ${suggestion.priority}
Título de la noticia: ${suggestion.title}
Descripción: ${suggestion.description}
Fuente: ${suggestion.source || 'No especificada'}

Genera un post para Facebook.
    `.trim();
  }

  /**
   * Call OpenAI to generate the post text
   */
  private async callOpenAI(userPrompt: string): Promise<GenerationResult> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT.trim() },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      const text = response.choices[0]?.message?.content?.trim() || '';
      const tokensUsed =
        (response.usage?.prompt_tokens || 0) +
        (response.usage?.completion_tokens || 0);

      return {
        text,
        model: this.model,
        promptVersion: this.promptVersion,
        tokensUsed,
      };
    } catch (error: any) {
      this.logger.error(`Error calling OpenAI: ${error.message}`, error.stack);
      throw error;
    }
  }
}
