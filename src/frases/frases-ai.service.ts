import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { FraseCategory, FraseTone } from './schemas/frase.schema';
import { GenerateFraseInput } from './dto/frases.dto';

const SYSTEM_PROMPT = `Eres un experto en cultura futbolera latinoamericana.
Conoces todas las polémicas del Real Madrid, Barcelona, Champions League,
mundiales, ligas locales y el fútbol amateur/mejenga.

REGLAS ESTRICTAS:
- Frases CORTAS y contundentes (máximo 25 palabras)
- Lenguaje natural latinoamericano (no español de España)
- NUNCA uses hashtags, emojis ni signos de exclamación excesivos en la frase
- Sé auténtico: que suene como algo que alguien diría de verdad
- Varía el estilo: no repitas estructuras
- El campo "autor" es null para frases genéricas/anónimas
- El "tag" es una etiqueta de 1-2 palabras máximo
- Responde SIEMPRE en JSON válido, nada más`;

const CATEGORY_PROMPTS: Record<FraseCategory, string> = {
  [FraseCategory.CANCHA]: `Genera frases de fútbol amateur / mejenga / cancha.
Temas: llegar primero y ser suplente, pagar el arbitraje siendo el malo,
armar equipos disparejos, excusas por jugar mal, el gordito de portero,
zapatos prestados, el que nunca paga la cuota, el que falta siempre,
quejas del árbitro del barrio, faltas que "no son faltas".
Que suenen como algo que dirías con tus amigos después de jugar.`,

  [FraseCategory.TECNICOS]: `Genera frases estilo conferencia de prensa de director técnico.
Estilos: Mourinho (sarcástico, indirectas), Simeone (intenso, corto),
Guardiola (filosófico, repetitivo), Ancelotti (calmado, irónico),
Klopp (emocional, dramático), Zidane (minimalista, evasivo).
Temas: excusas post derrota, evasión sobre el árbitro, frases genéricas
que no dicen nada, indirectas al rival, quejas veladas.`,

  [FraseCategory.FUTBOLISTAS]: `Genera frases de futbolistas en entrevistas pre
o post partido. Estilo: respuestas robotizadas que todos dan igual,
"dimos todo en la cancha", indirectas a rivales disfrazadas de respeto,
excusas por perder, elogios falsos al rival, "el míster me dio confianza",
"salimos a proponer", "ellos se encerraron atrás".`,

  [FraseCategory.PERIODISTAS]: `Genera frases de periodistas deportivos FANÁTICOS y parciales.
Dos bandos: pro-Real Madrid y pro-Barcelona.
Estilo: exagerado, conspiranoico, parcial sin disimular.
Temas: el VAR siempre favorece al otro, el árbitro comprado,
"X Champions son de suerte", Uefalona vs Uefarma,
Messi vs Cristiano debate eterno, "mi equipo es humilde y el otro
tiene ayuda". Que suenen como tertulia de TV española a las 2am.`,

  [FraseCategory.ARROGANCIA]: `Genera frases ARROGANTES de futbolistas cracks.
Estilos: Zlatan (dios autoproclamado), Cristiano (el mejor y lo sabe),
Mbappé (nueva generación arrogante), Piqué (provocador intelectual),
Benzema (silencioso pero letal), Neymar (showman).
Que sean frases que un crack diría sin pestañear.
Ejemplo de nivel: "Este año vamos por la sexta, los demás que se preparen."`,

  [FraseCategory.POLEMICAS]: `Genera frases sobre jugadas polémicas en el fútbol.
Temas: penales inventados, offsides milimétricos, manos no cobradas,
goles fantasma, expulsiones injustas, el VAR que "no funciona",
árbitros parciales, "eso en mi barrio es roja directa".
Que suenen como comentario de bar o grupo de WhatsApp post partido.`,

  [FraseCategory.MEMES]: `Genera frases estilo meme/humor sobre futbolistas reales.
Referencias: Hazard y su peso en el Madrid, Bale y el golf,
Neymar y sus lesiones teatrales, Ramos y sus tarjetas rojas,
Piqué y su vida post-retiro, Pogba y TikTok, Dembelé llegando tarde,
Courtois y los goles por abajo, Griezmann y sus celebraciones.
Humor sarcástico, viral, de cuenta de memes de Instagram.`,

  [FraseCategory.MOTIVACIONAL]: `Genera frases motivacionales épicas sobre fútbol.
Estilo: discurso de vestidor antes de una final, frases que pondrías
en una pared, filosofía del deporte. Pueden ser originales o inspiradas
en el estilo de Maradona, Cruyff, Ferguson, Guardiola.
Profundas pero accesibles, que den ganas de salir a jugar.`,

  [FraseCategory.PERSONAL]: `Genera frases desde la perspectiva de alguien que:
- SIEMPRE organiza la mejenga/partido
- Paga el arbitraje, pone los petos, lleva el balón
- Es considerado "el malo" o "el mandón" del grupo
- Sin él no hay partido pero nadie lo reconoce
- Todos le deben plata de la cuota
- Llega primero pero termina de suplente
Tono: queja graciosa pero real, frustración cómica, antihéroe.`,
};

@Injectable()
export class FrasesAiService {
  private readonly logger = new Logger(FrasesAiService.name);
  private readonly openai: OpenAI;
  private readonly model = 'gpt-4o-mini';

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateFrases(input: GenerateFraseInput) {
    const { categoria, tono, equipo, count = 3 } = input;

    const categoryPrompt = CATEGORY_PROMPTS[categoria];
    const toneInstruction = tono
      ? `Tono obligatorio: ${tono.toLowerCase()}. `
      : '';
    const teamInstruction = equipo
      ? `Contexto/equipo: ${equipo}. `
      : '';

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.9,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `
${categoryPrompt}

${toneInstruction}${teamInstruction}

Genera exactamente ${count} frase(s).

Responde SOLO con este JSON:
{
  "frases": [
    {
      "texto": "la frase aquí (máximo 2 líneas, sin hashtags ni emojis en el texto)",
      "autor": "nombre del autor o null si es anónima/genérica",
      "tag": "etiqueta corta de 1-2 palabras que describa el vibe",
      "emoji": "un solo emoji representativo"
    }
  ]
}`,
          },
        ],
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }

      const parsed = JSON.parse(content);
      
      this.logger.log(`Generated ${parsed.frases.length} frases for category ${categoria}`);
      
      return parsed.frases;
    } catch (error) {
      this.logger.error(`Error generating frases: ${error.message}`, error.stack);
      throw error;
    }
  }
}
