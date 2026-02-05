import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

export interface MatchEventContext {
  // Event info
  eventType: 'goal' | 'card' | 'substitution' | 'var' | 'halftime' | 'fulltime' | 'kickoff';
  minute: number;
  playerName?: string;
  assistName?: string;
  detail?: string; // "Penalty", "Own Goal", "Yellow Card", "Red Card"

  // Match info
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition: string;
  round?: string;
  venue?: string;

  // Context
  isHome: boolean; // Is OUR team home?
  ourTeam: string; // The team we're creating content for

  // Stats (optional)
  possession?: { home: number; away: number };
  shots?: { home: number; away: number };
  shotsOnTarget?: { home: number; away: number };
}

export interface ViralContentOption {
  angle: string; // "celebración", "polémico", "dato", "meme", "pregunta"
  emoji: string;
  content: string;
  hashtags: string[];
}

export interface ViralContentResponse {
  eventSummary: string;
  options: ViralContentOption[];
  generatedAt: Date;
}

@Injectable()
export class ViralContentService {
  private readonly logger = new Logger(ViralContentService.name);
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate viral content options for a match event
   */
  async generateViralContent(context: MatchEventContext): Promise<ViralContentResponse> {
    const prompt = this.buildPrompt(context);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || '';
      const options = this.parseResponse(content);

      this.logger.log(`🔥 Generated ${options.length} viral content options for ${context.eventType}`);

      return {
        eventSummary: this.getEventSummary(context),
        options,
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error generating viral content: ${error.message}`);
      // Return fallback content
      return {
        eventSummary: this.getEventSummary(context),
        options: this.getFallbackContent(context),
        generatedAt: new Date(),
      };
    }
  }

  private getSystemPrompt(): string {
    return `Eres un experto en crear contenido viral para páginas de fútbol en Facebook/Instagram.

Tu objetivo es generar posts que:
- Generen MUCHOS comentarios y shares
- Capturen la EMOCIÓN del momento
- Usen el CONTEXTO del partido (minuto, marcador, competición)
- Sean RÁPIDOS de leer (máximo 3 líneas + hashtags)
- Incluyan emojis estratégicamente

Debes generar 5 opciones con diferentes ángulos:
1. CELEBRACIÓN - Emoción pura, celebrar el momento
2. POLÉMICO - Opinión divisiva que genere debate
3. DATO - Estadística o contexto que sorprenda
4. MEME - Humor, referencias que los fans entiendan
5. PREGUNTA - Involucrar a la audiencia directamente

IMPORTANTE:
- Escribe en ESPAÑOL
- Usa jerga de fútbol latinoamericano/español
- NO inventes estadísticas que no te doy
- Mantén el tono de FAN apasionado, no de periodista
- Los hashtags deben ser relevantes y populares`;
  }

  private buildPrompt(ctx: MatchEventContext): string {
    const scoreText = ctx.isHome
      ? `${ctx.ourTeam} ${ctx.homeScore}-${ctx.awayScore} ${ctx.awayTeam}`
      : `${ctx.homeTeam} ${ctx.homeScore}-${ctx.awayScore} ${ctx.ourTeam}`;

    const ourScore = ctx.isHome ? ctx.homeScore : ctx.awayScore;
    const theirScore = ctx.isHome ? ctx.awayScore : ctx.homeScore;
    const isWinning = ourScore > theirScore;
    const isLosing = ourScore < theirScore;
    const isDraw = ourScore === theirScore;

    let eventDescription = '';
    switch (ctx.eventType) {
      case 'goal':
        const goalType = ctx.detail === 'Penalty' ? ' de PENAL' :
                        ctx.detail === 'Own Goal' ? ' en PROPIA PUERTA' : '';
        eventDescription = `⚽ GOL${goalType} de ${ctx.playerName || 'jugador desconocido'}${ctx.assistName ? ` (asistencia de ${ctx.assistName})` : ''} en el minuto ${ctx.minute}'`;
        break;
      case 'card':
        const cardType = ctx.detail === 'Red Card' ? 'ROJA' : 'AMARILLA';
        eventDescription = `🟨 Tarjeta ${cardType} para ${ctx.playerName || 'jugador'} en el minuto ${ctx.minute}'`;
        break;
      case 'halftime':
        eventDescription = `⏱️ MEDIO TIEMPO - Marcador: ${scoreText}`;
        break;
      case 'fulltime':
        eventDescription = `🏁 FINAL DEL PARTIDO - Marcador: ${scoreText}`;
        break;
      default:
        eventDescription = `Evento en el minuto ${ctx.minute}'`;
    }

    let statsContext = '';
    if (ctx.possession) {
      const ourPossession = ctx.isHome ? ctx.possession.home : ctx.possession.away;
      statsContext += `\n- Posesión: ${ourPossession}%`;
    }
    if (ctx.shots) {
      const ourShots = ctx.isHome ? ctx.shots.home : ctx.shots.away;
      const theirShots = ctx.isHome ? ctx.shots.away : ctx.shots.home;
      statsContext += `\n- Tiros: ${ourShots} (rival: ${theirShots})`;
    }

    return `EVENTO: ${eventDescription}

CONTEXTO DEL PARTIDO:
- Competición: ${ctx.competition}${ctx.round ? ` - ${ctx.round}` : ''}
- Marcador actual: ${scoreText}
- Minuto: ${ctx.minute}'
- Nuestro equipo: ${ctx.ourTeam} (${ctx.isHome ? 'LOCAL' : 'VISITANTE'})
- Situación: ${isWinning ? 'GANANDO' : isLosing ? 'PERDIENDO' : 'EMPATE'}
${ctx.venue ? `- Estadio: ${ctx.venue}` : ''}
${statsContext}

Genera 5 opciones de posts virales para este momento. Para cada opción incluye:
- El ángulo (CELEBRACIÓN, POLÉMICO, DATO, MEME, o PREGUNTA)
- El emoji principal
- El texto del post (máximo 280 caracteres)
- 3-4 hashtags relevantes

Formato de respuesta:
---
ÁNGULO: [nombre]
EMOJI: [emoji]
TEXTO: [contenido del post]
HASHTAGS: #tag1 #tag2 #tag3
---`;
  }

  private parseResponse(content: string): ViralContentOption[] {
    const options: ViralContentOption[] = [];
    const blocks = content.split('---').filter(b => b.trim());

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const option: Partial<ViralContentOption> = {};

      for (const line of lines) {
        if (line.startsWith('ÁNGULO:') || line.startsWith('ANGULO:')) {
          option.angle = line.replace(/^[ÁA]NGULO:\s*/i, '').trim().toLowerCase();
        } else if (line.startsWith('EMOJI:')) {
          option.emoji = line.replace('EMOJI:', '').trim();
        } else if (line.startsWith('TEXTO:')) {
          option.content = line.replace('TEXTO:', '').trim();
        } else if (line.startsWith('HASHTAGS:')) {
          option.hashtags = line.replace('HASHTAGS:', '').trim().split(/\s+/).filter(h => h.startsWith('#'));
        }
      }

      if (option.angle && option.content) {
        options.push({
          angle: option.angle,
          emoji: option.emoji || '⚽',
          content: option.content,
          hashtags: option.hashtags || [],
        });
      }
    }

    return options;
  }

  private getEventSummary(ctx: MatchEventContext): string {
    switch (ctx.eventType) {
      case 'goal':
        return `⚽ GOL de ${ctx.playerName || 'Jugador'} (${ctx.minute}')`;
      case 'card':
        return `🟨 Tarjeta para ${ctx.playerName || 'Jugador'} (${ctx.minute}')`;
      case 'halftime':
        return `⏱️ Medio Tiempo: ${ctx.homeTeam} ${ctx.homeScore}-${ctx.awayScore} ${ctx.awayTeam}`;
      case 'fulltime':
        return `🏁 Final: ${ctx.homeTeam} ${ctx.homeScore}-${ctx.awayScore} ${ctx.awayTeam}`;
      default:
        return `Evento en minuto ${ctx.minute}'`;
    }
  }

  private getFallbackContent(ctx: MatchEventContext): ViralContentOption[] {
    const score = `${ctx.homeTeam} ${ctx.homeScore}-${ctx.awayScore} ${ctx.awayTeam}`;

    if (ctx.eventType === 'goal') {
      return [
        {
          angle: 'celebración',
          emoji: '🔥',
          content: `GOOOOOL de ${ctx.playerName}! 🔥⚽\n${score}\n${ctx.competition} | Min ${ctx.minute}'`,
          hashtags: ['#Gol', `#${ctx.ourTeam.replace(/\s+/g, '')}`, '#Futbol'],
        },
        {
          angle: 'pregunta',
          emoji: '🤔',
          content: `${ctx.playerName} marca el ${ctx.homeScore + ctx.awayScore}° gol!\n¿Cómo lo calificas? 🔥 o 👏?\n${score}`,
          hashtags: ['#Gol', `#${ctx.ourTeam.replace(/\s+/g, '')}`],
        },
      ];
    }

    return [
      {
        angle: 'info',
        emoji: '📊',
        content: `${score}\n${ctx.competition} | Min ${ctx.minute}'`,
        hashtags: [`#${ctx.ourTeam.replace(/\s+/g, '')}`, '#Futbol'],
      },
    ];
  }
}
