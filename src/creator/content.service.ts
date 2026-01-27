import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContentSuggestion,
  ContentSuggestionsResponse,
  ContentMeta,
  ContentType,
  ContentPriority,
  PageType,
} from './dto/content-suggestion.output';
import { FetchContentInput } from './dto/fetch-content.input';

// ============================================================================
// TYPES
// ============================================================================

interface ContentSource {
  id: string;
  name: string;
  type: 'rss' | 'api' | 'scrape';
  url: string;
  language: string;
  category: 'news' | 'transfers' | 'stats' | 'general';
  leagues?: string[];
  refreshInterval: number;
  priority: number;
  active: boolean;
}

interface RawContentItem {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceLanguage: string;
  title: string;
  description: string;
  link: string;
  pubDate: Date;
  imageUrl?: string;
  category?: string;
}

interface ProcessedContent {
  id: string;
  type: ContentType;
  priority: ContentPriority;
  title: string;
  description: string;
  source: string;
  sourceUrl: string;
  originalLanguage: string;
  imageUrl?: string;
  pubDate: Date;
  suggestedTemplates: string[];
  suggestedCaption?: string;
  hashtags: string[];
  relevanceScore: number;
  templateData?: Record<string, string>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTENT_SOURCES: ContentSource[] = [
  // Spanish sources
  {
    id: 'marca-futbol',
    name: 'MARCA Fútbol',
    type: 'rss',
    url: 'https://e00-xlk-ue-marca.uecdn.es/rss/googlenews/portada.xml',
    language: 'es',
    category: 'news',
    leagues: ['la-liga'],
    refreshInterval: 15,
    priority: 8,
    active: true,
  },
  {
    id: 'as-futbol',
    name: 'AS Fútbol',
    type: 'rss',
    url: 'https://feeds.as.com/mrss-s/pages/as/site/as.com/section/futbol/portada/',
    language: 'es',
    category: 'news',
    leagues: ['la-liga'],
    refreshInterval: 15,
    priority: 8,
    active: true,
  },
  {
    id: 'mundo-deportivo',
    name: 'Mundo Deportivo',
    type: 'rss',
    url: 'https://www.mundodeportivo.com/rss/futbol',
    language: 'es',
    category: 'news',
    leagues: ['la-liga'],
    refreshInterval: 15,
    priority: 7,
    active: true,
  },
  // English sources
  {
    id: 'bbc-sport-football',
    name: 'BBC Sport Football',
    type: 'rss',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    language: 'en',
    category: 'news',
    refreshInterval: 10,
    priority: 9,
    active: true,
  },
  {
    id: 'sky-sports-football',
    name: 'Sky Sports Football',
    type: 'rss',
    url: 'https://www.skysports.com/rss/12040',
    language: 'en',
    category: 'news',
    refreshInterval: 10,
    priority: 9,
    active: true,
  },
  {
    id: 'espn-football',
    name: 'ESPN FC',
    type: 'rss',
    url: 'https://www.espn.com/espn/rss/soccer/news',
    language: 'en',
    category: 'news',
    refreshInterval: 10,
    priority: 8,
    active: true,
  },
  {
    id: 'guardian-football',
    name: 'The Guardian Football',
    type: 'rss',
    url: 'https://www.theguardian.com/football/rss',
    language: 'en',
    category: 'news',
    refreshInterval: 15,
    priority: 8,
    active: true,
  },
  // Italian
  {
    id: 'gazzetta-calcio',
    name: 'Gazzetta dello Sport',
    type: 'rss',
    url: 'https://www.gazzetta.it/rss/calcio.xml',
    language: 'it',
    category: 'news',
    leagues: ['serie-a'],
    refreshInterval: 15,
    priority: 8,
    active: true,
  },
];

const TEAM_KEYWORDS: Record<string, Record<string, string[]>> = {
  'real-madrid': {
    es: ['real madrid', 'madrid', 'merengues', 'blancos', 'bernabéu', 'bernabeu', 'rmcf', 'madridista'],
    en: ['real madrid', 'madrid', 'los blancos', 'bernabeu', 'real'],
  },
  'barcelona': {
    es: ['barcelona', 'barça', 'barca', 'blaugrana', 'culés', 'cules', 'fcb', 'camp nou'],
    en: ['barcelona', 'barca', 'blaugrana', 'fcb', 'camp nou'],
  },
  'atletico-madrid': {
    es: ['atlético', 'atletico', 'atleti', 'colchoneros', 'rojiblanco'],
    en: ['atletico madrid', 'atletico', 'atleti'],
  },
  'manchester-city': {
    es: ['manchester city', 'man city', 'city', 'ciudadanos', 'citizens'],
    en: ['manchester city', 'man city', 'city', 'citizens', 'cityzens', 'mcfc'],
  },
  'manchester-united': {
    es: ['manchester united', 'man united', 'united', 'diablos rojos'],
    en: ['manchester united', 'man united', 'united', 'red devils', 'mufc', 'man utd'],
  },
  'liverpool': {
    es: ['liverpool', 'reds', 'anfield'],
    en: ['liverpool', 'reds', 'lfc', 'anfield', 'the kop'],
  },
  'bayern-munich': {
    es: ['bayern', 'bayern múnich', 'bayern munich', 'bávaros'],
    en: ['bayern munich', 'bayern', 'bavarians', 'fcb'],
  },
  'psg': {
    es: ['psg', 'paris saint-germain', 'paris', 'parisinos'],
    en: ['psg', 'paris saint-germain', 'paris'],
  },
  'juventus': {
    es: ['juventus', 'juve', 'vecchia signora'],
    en: ['juventus', 'juve', 'old lady', 'bianconeri'],
  },
  'inter-milan': {
    es: ['inter', 'inter de milán', 'nerazzurri'],
    en: ['inter milan', 'inter', 'nerazzurri', 'internazionale'],
  },
  'ac-milan': {
    es: ['milan', 'ac milan', 'rossoneri'],
    en: ['ac milan', 'milan', 'rossoneri'],
  },
  // Women's teams
  'barcelona-femeni': {
    es: ['barcelona femenino', 'barça femenino', 'barça femení', 'barcelona femeni'],
    en: ['barcelona women', 'barca women', 'barcelona femeni'],
  },
  'real-madrid-femenino': {
    es: ['real madrid femenino', 'madrid femenino', 'real madrid women'],
    en: ['real madrid women', 'madrid women'],
  },
  'chelsea-women': {
    es: ['chelsea femenino', 'chelsea women'],
    en: ['chelsea women', 'chelsea fc women', 'chelsea ladies'],
  },
  'arsenal-women': {
    es: ['arsenal femenino', 'arsenal women'],
    en: ['arsenal women', 'arsenal wfc', 'arsenal ladies'],
  },
  'lyon-feminin': {
    es: ['lyon femenino', 'olympique lyon femenino'],
    en: ['lyon women', 'olympique lyonnais women'],
    fr: ['ol féminin', 'lyon féminin'],
  },
};

const TYPE_INDICATORS: Record<ContentType, string[]> = {
  [ContentType.BREAKING]: ['breaking', 'última hora', 'urgente', 'just in', 'alert', 'official', 'confirmed', 'breaking news'],
  [ContentType.MATCHDAY]: ['match', 'partido', 'lineup', 'alineación', 'kick off', 'vs', 'preview', 'previa'],
  [ContentType.RESULT]: ['result', 'resultado', 'final score', 'gol', 'goal', 'victoria', 'derrota', 'empate', 'win', 'loss', 'draw'],
  [ContentType.TRANSFER]: ['transfer', 'fichaje', 'signing', 'deal', 'contract', 'bid', 'offer', 'target', 'linked'],
  [ContentType.INJURY]: ['injury', 'lesión', 'injured', 'ruled out', 'sidelined', 'fitness', 'surgery', 'recuperación'],
  [ContentType.STATS]: ['stats', 'estadísticas', 'record', 'récord', 'numbers', 'data', 'histórico'],
  [ContentType.QUOTE]: ['says', 'dice', 'declaraciones', 'interview', 'entrevista', 'claims', 'afirma', 'reveals'],
  [ContentType.MEME]: ['meme', 'viral', 'funny', 'gracioso', 'humor'],
  [ContentType.THROWBACK]: ['throwback', 'on this day', 'tal día', 'anniversary', 'aniversario', 'años', 'years ago'],
  [ContentType.RUMOR]: ['rumor', 'rumour', 'reportedly', 'según', 'podría', 'could', 'might', 'speculation'],
  [ContentType.GENERAL]: [],
};

const TYPE_TO_TEMPLATES: Record<ContentType, string[]> = {
  [ContentType.BREAKING]: ['preset-ultima-hora-pro', 'preset-breaking-sidebar', 'preset-breaking-minimal', 'preset-bomba-pro'],
  [ContentType.MATCHDAY]: ['preset-match-day-pro', 'preset-match-day-sidebar', 'preset-match-day-minimal', 'preset-match-day-countdown'],
  [ContentType.RESULT]: ['preset-resultado-pro', 'preset-resultado-minimal', 'preset-resultado-editorial', 'preset-resultado-scoreboard'],
  [ContentType.TRANSFER]: ['preset-fichaje-pro', 'preset-fichaje-centered', 'preset-fichaje-minimal', 'preset-fichaje-diagonal'],
  [ContentType.INJURY]: ['preset-ultima-hora-pro', 'preset-breaking-minimal'],
  [ContentType.STATS]: ['preset-stats-pro', 'preset-stats-cards', 'preset-stats-horizontal'],
  [ContentType.QUOTE]: ['preset-cita-pro', 'preset-cita-doble-pro', 'preset-cita-minimal', 'preset-cita-sidebar'],
  [ContentType.MEME]: ['preset-meme-pro', 'preset-meme-minimal'],
  [ContentType.THROWBACK]: ['preset-throwback-pro', 'preset-throwback-film', 'preset-throwback-polaroid'],
  [ContentType.RUMOR]: ['preset-fichaje-pro', 'preset-ultima-hora-pro'],
  [ContentType.GENERAL]: ['preset-ultima-hora-pro', 'preset-breaking-minimal'],
};

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(private readonly configService: ConfigService) {}

  // --------------------------------------------------------------------------
  // Main fetch method
  // --------------------------------------------------------------------------

  async fetchContent(input: FetchContentInput): Promise<ContentSuggestionsResponse> {
    const {
      pageType = 'single-team',
      teamId,
      teamIds = [],
      leagueId,
      sourceLanguages = ['es', 'en'],
      limit = 25,
    } = input;

    try {
      let rawContent: RawContentItem[];
      let teamKeywords: string[] = [];

      // Fetch content based on page type
      switch (pageType) {
        case 'single-team':
          if (!teamId) {
            return this.errorResponse('teamId is required for single-team page type', pageType as PageType);
          }
          teamKeywords = this.getTeamKeywords(teamId);
          rawContent = await this.fetchContentForTeam(teamId, leagueId, sourceLanguages);
          break;

        case 'league':
          if (!leagueId) {
            return this.errorResponse('leagueId is required for league page type', pageType as PageType);
          }
          rawContent = await this.fetchContentForLeague(leagueId, sourceLanguages);
          break;

        case 'multi-team':
        case 'womens':
          if (!teamIds || teamIds.length === 0) {
            return this.errorResponse('teamIds is required for multi-team/womens page type', pageType as PageType);
          }
          teamKeywords = teamIds.flatMap(id => this.getTeamKeywords(id));
          rawContent = await this.fetchContentForTeams(teamIds, sourceLanguages);
          break;

        case 'general':
          rawContent = await this.fetchGeneralContent(sourceLanguages);
          break;

        default:
          return this.errorResponse(`Unknown page type: ${pageType}`, PageType.SINGLE_TEAM);
      }

      // Process content
      const contextTeamId = teamId || teamIds[0] || '';
      const processedContent = this.processContent(rawContent, contextTeamId, teamKeywords);

      // Convert to ContentSuggestion format
      const suggestions = processedContent.slice(0, limit).map(item => this.toContentSuggestion(item));

      // Calculate stats
      const urgentCount = suggestions.filter(c => c.priority === ContentPriority.URGENT).length;
      const highPriorityCount = suggestions.filter(c => c.priority === ContentPriority.HIGH).length;

      return {
        success: true,
        content: suggestions,
        meta: {
          pageType: pageType as PageType,
          teamId,
          teamIds: teamIds.length > 0 ? teamIds : undefined,
          leagueId,
          totalItems: suggestions.length,
          urgentCount,
          highPriorityCount,
          fetchedAt: new Date(),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching content:', error);
      return this.errorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        (input.pageType as PageType) || PageType.SINGLE_TEAM,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Content fetching methods
  // --------------------------------------------------------------------------

  private async fetchContentForTeam(
    teamId: string,
    leagueId: string | undefined,
    sourceLanguages: string[],
  ): Promise<RawContentItem[]> {
    const sources = this.getSourcesByLanguage(sourceLanguages);
    const allContent = await this.fetchFromSources(sources);
    const teamContent = this.filterByTeam(allContent, teamId);
    return this.deduplicateContent(teamContent).slice(0, 30);
  }

  private async fetchContentForTeams(
    teamIds: string[],
    sourceLanguages: string[],
  ): Promise<RawContentItem[]> {
    const sources = this.getSourcesByLanguage(sourceLanguages);
    const allContent = await this.fetchFromSources(sources);
    const teamContent = this.filterByTeams(allContent, teamIds);
    return this.deduplicateContent(teamContent).slice(0, 40);
  }

  private async fetchContentForLeague(
    leagueId: string,
    sourceLanguages: string[],
  ): Promise<RawContentItem[]> {
    const leagueSources = this.getSourcesForLeague(leagueId);
    const filteredSources = leagueSources.filter(s =>
      sourceLanguages.length === 0 || sourceLanguages.includes(s.language),
    );
    const generalSources = this.getSourcesByLanguage(sourceLanguages).filter(
      s => !s.leagues || s.leagues.length === 0,
    );
    const allSources = [...new Map([...filteredSources, ...generalSources].map(s => [s.id, s])).values()];
    const allContent = await this.fetchFromSources(allSources);
    return this.deduplicateContent(allContent).slice(0, 40);
  }

  private async fetchGeneralContent(sourceLanguages: string[]): Promise<RawContentItem[]> {
    const sources = this.getSourcesByLanguage(sourceLanguages);
    const allContent = await this.fetchFromSources(sources, { maxPerSource: 10, maxAge: 24 });
    return this.deduplicateContent(allContent).slice(0, 50);
  }

  // --------------------------------------------------------------------------
  // RSS Fetching
  // --------------------------------------------------------------------------

  private async fetchFromSources(
    sources: ContentSource[],
    options?: { maxPerSource?: number; maxAge?: number },
  ): Promise<RawContentItem[]> {
    const maxPerSource = options?.maxPerSource || 15;
    const maxAge = options?.maxAge || 48;
    const cutoffDate = new Date(Date.now() - maxAge * 60 * 60 * 1000);

    const fetchPromises = sources.map(source => this.fetchRSSFeed(source));
    const results = await Promise.all(fetchPromises);

    let allItems: RawContentItem[] = [];
    results.forEach(items => {
      const filteredItems = items
        .filter(item => item.pubDate >= cutoffDate)
        .slice(0, maxPerSource);
      allItems.push(...filteredItems);
    });

    allItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    return allItems;
  }

  private async fetchRSSFeed(source: ContentSource): Promise<RawContentItem[]> {
    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FutbolifyBot/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Failed to fetch ${source.name}: ${response.status}`);
        return [];
      }

      const xml = await response.text();
      const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];

      const items: RawContentItem[] = [];
      for (const itemXml of itemMatches) {
        const item = this.parseRSSItem(itemXml, source.id, source.name, source.language);
        if (item) {
          items.push(item);
        }
      }

      return items;
    } catch (error) {
      this.logger.error(`Error fetching ${source.name}:`, error);
      return [];
    }
  }

  private parseRSSItem(
    itemXml: string,
    sourceId: string,
    sourceName: string,
    sourceLanguage: string,
  ): RawContentItem | null {
    try {
      const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      let title = titleMatch ? titleMatch[1].trim() : '';
      title = this.decodeHTMLEntities(title);
      title = title.replace(/<[^>]*>/g, '').trim();

      const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
      let description = descMatch ? descMatch[1].trim() : '';
      description = this.decodeHTMLEntities(description);
      description = description.replace(/<[^>]*>/g, '').trim();
      if (description.length > 500) {
        description = description.substring(0, 500) + '...';
      }

      const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      const link = linkMatch ? linkMatch[1].trim() : '';

      const dateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      const pubDate = dateMatch ? new Date(dateMatch[1].trim()) : new Date();

      let imageUrl: string | undefined;
      const enclosureMatch = itemXml.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image/i);
      if (enclosureMatch) {
        imageUrl = enclosureMatch[1];
      } else {
        const mediaMatch = itemXml.match(/<media:content[^>]*url=["']([^"']+)["']/i);
        if (mediaMatch) {
          imageUrl = mediaMatch[1];
        } else {
          const imgMatch = itemXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
          if (imgMatch) {
            imageUrl = imgMatch[1];
          }
        }
      }

      if (!title || !link) {
        return null;
      }

      const linkHash = Buffer.from(link).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
      const dateHash = pubDate.getTime().toString(36);

      return {
        id: `${sourceId}-${linkHash}-${dateHash}`,
        sourceId,
        sourceName,
        sourceLanguage,
        title,
        description,
        link,
        pubDate,
        imageUrl,
      };
    } catch (error) {
      this.logger.error('Error parsing RSS item:', error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Content Processing
  // --------------------------------------------------------------------------

  private processContent(
    items: RawContentItem[],
    teamId: string,
    teamKeywords: string[],
  ): ProcessedContent[] {
    return items.map(item => {
      const type = this.detectContentType(item.title, item.description);
      const priority = this.calculatePriority(item, type);
      const relevanceScore = this.calculateRelevanceScore(item, teamKeywords);
      const suggestedTemplates = TYPE_TO_TEMPLATES[type] || TYPE_TO_TEMPLATES[ContentType.GENERAL];
      const hashtags = this.generateHashtags(item, teamId);
      const suggestedCaption = this.generateCaption(item, type);

      return {
        id: item.id,
        type,
        priority,
        title: item.title,
        description: item.description,
        source: item.sourceName,
        sourceUrl: item.link,
        originalLanguage: item.sourceLanguage,
        imageUrl: item.imageUrl,
        pubDate: item.pubDate,
        suggestedTemplates,
        suggestedCaption,
        hashtags,
        relevanceScore,
      };
    });
  }

  private detectContentType(title: string, description: string): ContentType {
    const text = `${title} ${description}`.toLowerCase();

    for (const [type, keywords] of Object.entries(TYPE_INDICATORS)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return type as ContentType;
      }
    }

    return ContentType.GENERAL;
  }

  private calculatePriority(item: RawContentItem, type: ContentType): ContentPriority {
    const ageInHours = (Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60);

    if (type === ContentType.BREAKING && ageInHours < 2) {
      return ContentPriority.URGENT;
    }

    if (
      (type === ContentType.RESULT && ageInHours < 6) ||
      type === ContentType.TRANSFER
    ) {
      return ContentPriority.HIGH;
    }

    if (ageInHours > 24) {
      return ContentPriority.LOW;
    }

    return ContentPriority.NORMAL;
  }

  private calculateRelevanceScore(item: RawContentItem, teamKeywords: string[]): number {
    if (teamKeywords.length === 0) return 50;

    const title = item.title.toLowerCase();
    const description = item.description.toLowerCase();
    let score = 0;

    for (const keyword of teamKeywords) {
      if (title.includes(keyword.toLowerCase())) {
        score += 30;
      }
      if (description.includes(keyword.toLowerCase())) {
        score += 15;
      }
    }

    return Math.min(score, 100);
  }

  private generateHashtags(item: RawContentItem, teamId: string): string[] {
    const hashtags: string[] = [];

    if (teamId) {
      const teamName = teamId.replace(/-/g, '');
      hashtags.push(`#${teamName}`);
    }

    hashtags.push('#futbol', '#football');

    return hashtags;
  }

  private generateCaption(item: RawContentItem, type: ContentType): string {
    const emoji = this.getTypeEmoji(type);
    return `${emoji} ${item.title}\n\n${item.description.substring(0, 200)}...`;
  }

  private getTypeEmoji(type: ContentType): string {
    const emojis: Record<ContentType, string> = {
      [ContentType.BREAKING]: '🚨',
      [ContentType.MATCHDAY]: '📅',
      [ContentType.RESULT]: '⚽',
      [ContentType.TRANSFER]: '✨',
      [ContentType.INJURY]: '🏥',
      [ContentType.STATS]: '📊',
      [ContentType.QUOTE]: '💬',
      [ContentType.MEME]: '😂',
      [ContentType.THROWBACK]: '📸',
      [ContentType.RUMOR]: '👀',
      [ContentType.GENERAL]: '📰',
    };
    return emojis[type] || '📰';
  }

  // --------------------------------------------------------------------------
  // Filtering
  // --------------------------------------------------------------------------

  private filterByTeam(items: RawContentItem[], teamId: string): RawContentItem[] {
    return items.filter(item => {
      const textToCheck = `${item.title} ${item.description}`.toLowerCase();
      return this.textMentionsTeam(textToCheck, teamId);
    });
  }

  private filterByTeams(items: RawContentItem[], teamIds: string[]): RawContentItem[] {
    return items.filter(item => {
      const textToCheck = `${item.title} ${item.description}`.toLowerCase();
      return teamIds.some(teamId => this.textMentionsTeam(textToCheck, teamId));
    });
  }

  private textMentionsTeam(text: string, teamId: string): boolean {
    const keywords = this.getTeamKeywords(teamId);
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  // --------------------------------------------------------------------------
  // Deduplication
  // --------------------------------------------------------------------------

  private deduplicateContent(items: RawContentItem[]): RawContentItem[] {
    const seen = new Set<string>();
    const deduplicated: RawContentItem[] = [];

    for (const item of items) {
      const words = item.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 5)
        .sort()
        .join('');

      if (!seen.has(words)) {
        seen.add(words);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getSourcesByLanguage(languages: string[]): ContentSource[] {
    return CONTENT_SOURCES.filter(s => s.active && languages.includes(s.language));
  }

  private getSourcesForLeague(leagueId: string): ContentSource[] {
    return CONTENT_SOURCES.filter(
      s => s.active && (!s.leagues || s.leagues.length === 0 || s.leagues.includes(leagueId)),
    );
  }

  private getTeamKeywords(teamId: string): string[] {
    const keywords = TEAM_KEYWORDS[teamId];
    if (!keywords) return [teamId.replace(/-/g, ' ')];

    const allKeywords: string[] = [];
    Object.values(keywords).forEach(langKeywords => {
      allKeywords.push(...langKeywords);
    });
    return [...new Set(allKeywords)];
  }

  private decodeHTMLEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#039;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
      '&#x27;': "'",
      '&#x2F;': '/',
      '&ndash;': '-',
      '&mdash;': '-',
      '&lsquo;': "'",
      '&rsquo;': "'",
      '&ldquo;': '"',
      '&rdquo;': '"',
      '&hellip;': '...',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'gi'), char);
    }
    decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    return decoded;
  }

  private toContentSuggestion(item: ProcessedContent): ContentSuggestion {
    return {
      id: item.id,
      type: item.type,
      priority: item.priority,
      title: item.title,
      description: item.description,
      source: item.source,
      sourceLanguage: item.originalLanguage,
      sourceUrl: item.sourceUrl,
      imageUrl: item.imageUrl,
      timestamp: item.pubDate,
      suggestedTemplates: item.suggestedTemplates,
      suggestedCaption: item.suggestedCaption,
      hashtags: item.hashtags,
      relevanceScore: item.relevanceScore,
    };
  }

  private errorResponse(error: string, pageType: PageType): ContentSuggestionsResponse {
    return {
      success: false,
      content: [],
      meta: {
        pageType,
        totalItems: 0,
        urgentCount: 0,
        highPriorityCount: 0,
        fetchedAt: new Date(),
      },
      error,
    };
  }
}
