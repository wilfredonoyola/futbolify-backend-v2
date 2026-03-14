import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QueriesService, RawMatch } from '../worldcup/queries/queries.service';
import { Quiniela, QuinielaDocument, QuinielaMember } from '../quiniela/schemas/quiniela.schema';
import {
  FeedContextualCard,
  FeedCardType,
  PredictionOutcome,
  FeedCardMatch,
  FeedCardTeam,
  FeedCardWeeklyStats,
} from './dto/feed-contextual-card.dto';

interface ContextualCardsOptions {
  userId: string;
  locale: 'es' | 'en';
  limit?: number;
  cardInterval?: number;
}

@Injectable()
export class FeedService {
  constructor(
    private readonly queriesService: QueriesService,
    @InjectModel(Quiniela.name) private readonly quinielaModel: Model<QuinielaDocument>,
  ) {}

  /**
   * Get contextual cards for a user's feed
   */
  async getContextualCards(options: ContextualCardsOptions): Promise<FeedContextualCard[]> {
    const { userId, locale, limit = 5, cardInterval = 5 } = options;
    const cards: FeedContextualCard[] = [];
    let position = 0;

    // 1. Get upcoming matches
    const upcomingMatches = this.queriesService.getUpcomingMatches(5);

    // 2. Get user's quinielas and predictions
    const userQuinielas = await this.quinielaModel
      .find({ 'members.userId': userId })
      .lean()
      .exec();

    // Collect all user predictions across all quinielas
    const userPredictions = new Map<string, { prediction: string; quinielaId: string }>();
    for (const quiniela of userQuinielas) {
      const member = quiniela.members.find((m) => m.userId.toString() === userId);
      if (member) {
        for (const pred of member.predictions || []) {
          if (!userPredictions.has(pred.matchId)) {
            userPredictions.set(pred.matchId, {
              prediction: pred.simplePrediction || this.scoreToOutcome(pred.homeScore, pred.awayScore),
              quinielaId: quiniela._id.toString(),
            });
          }
        }
      }
    }

    // 3. Get user stats (aggregate across all quinielas)
    const userStats = this.calculateUserStats(userQuinielas, userId);

    // 4. Generate PREDICTION cards for upcoming matches without predictions
    for (const match of upcomingMatches) {
      if (cards.length >= limit) break;

      const hasPrediction = userPredictions.has(match.id);
      const matchTime = new Date(match.dateTimeUTC);
      const now = new Date();
      const minutesUntil = Math.floor((matchTime.getTime() - now.getTime()) / (1000 * 60));

      if (!hasPrediction && minutesUntil > 0) {
        const matchWithTeams = this.buildFeedCardMatch(match, locale);
        if (!matchWithTeams) continue;

        // Check if it's a reminder (match starting soon - within 2 hours)
        if (minutesUntil <= 120) {
          cards.push({
            id: `reminder-${match.id}`,
            type: FeedCardType.REMINDER,
            priority: 100 - cards.length,
            position: position,
            match: matchWithTeams,
            minutesUntil,
          });
        } else {
          cards.push({
            id: `prediction-${match.id}`,
            type: FeedCardType.PREDICTION,
            priority: 50 - cards.length,
            position: position,
            match: matchWithTeams,
          });
        }
        position += cardInterval;
      }
    }

    // 5. Generate RESULT cards for recent matches with predictions
    const recentMatches = this.getRecentMatches(5);
    for (const match of recentMatches) {
      if (cards.length >= limit) break;

      const userPred = userPredictions.get(match.id);
      if (!userPred) continue;

      // TODO: Get actual match result from a results service/API
      // For now, we'll skip result cards until we have match results
      // const matchResult = await this.getMatchResult(match.id);
      // if (matchResult) { ... }
    }

    // 6. Generate WEEKLY summary card
    if (userStats.total >= 3 && cards.length < limit) {
      cards.push({
        id: 'weekly-summary',
        type: FeedCardType.WEEKLY,
        priority: 40,
        position: position,
        weeklyStats: {
          correct: userStats.correct,
          total: userStats.total,
          rank: userStats.rank,
          rankChange: userStats.rankChange,
          percentage: userStats.total > 0
            ? Math.round((userStats.correct / userStats.total) * 100)
            : 0,
        },
      });
      position += cardInterval;
    }

    // 7. Generate STREAK card
    if (userStats.streak >= 3 && cards.length < limit) {
      const nextMatch = upcomingMatches[0];
      const nextMatchWithTeams = nextMatch ? this.buildFeedCardMatch(nextMatch, locale) : undefined;

      cards.push({
        id: `streak-${userStats.streak}`,
        type: FeedCardType.STREAK,
        priority: 60,
        position: position,
        streakCount: userStats.streak,
        match: nextMatchWithTeams,
      });
    }

    // Sort by priority and recalculate positions
    cards.sort((a, b) => b.priority - a.priority);
    cards.forEach((card, idx) => {
      card.position = idx * cardInterval;
    });

    return cards.slice(0, limit);
  }

  /**
   * Get recent (past) matches
   */
  private getRecentMatches(limit: number): RawMatch[] {
    const now = new Date();
    return this.queriesService
      .getAllMatches()
      .filter((m) => new Date(m.dateTimeUTC) < now)
      .sort((a, b) => new Date(b.dateTimeUTC).getTime() - new Date(a.dateTimeUTC).getTime())
      .slice(0, limit);
  }

  /**
   * Build FeedCardMatch from raw match data
   */
  private buildFeedCardMatch(match: RawMatch, locale: 'es' | 'en'): FeedCardMatch | null {
    const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId);

    if (!homeTeam || !awayTeam) return null;

    return {
      id: match.id,
      homeTeam: {
        id: homeTeam.id,
        name: homeTeam.name[locale],
        code: homeTeam.code,
        flag: homeTeam.flag,
      },
      awayTeam: {
        id: awayTeam.id,
        name: awayTeam.name[locale],
        code: awayTeam.code,
        flag: awayTeam.flag,
      },
      dateTimeUTC: match.dateTimeUTC,
      stage: match.stage,
      group: match.groupId,
    };
  }

  /**
   * Calculate user stats across all quinielas
   */
  private calculateUserStats(
    quinielas: any[],
    userId: string,
  ): { correct: number; total: number; rank?: number; rankChange?: number; streak: number } {
    let totalCorrect = 0;
    let totalPredictions = 0;
    let totalExact = 0;
    let bestRank: number | undefined;
    let currentStreak = 0;

    for (const quiniela of quinielas) {
      const member = quiniela.members.find((m) => m.userId.toString() === userId);
      if (member) {
        totalCorrect += member.correctPredictions || 0;
        totalPredictions += (member.predictions || []).length;
        totalExact += member.exactScores || 0;

        // Track best rank across quinielas
        if (member.rank && (!bestRank || member.rank < bestRank)) {
          bestRank = member.rank;
        }
      }
    }

    // Calculate streak (simplified - in real implementation would track consecutive correct predictions)
    // For now, use a formula based on recent correct predictions
    if (totalCorrect > 0 && totalPredictions > 0) {
      const recentAccuracy = totalCorrect / totalPredictions;
      if (recentAccuracy >= 0.8) currentStreak = 5;
      else if (recentAccuracy >= 0.6) currentStreak = 3;
      else if (recentAccuracy >= 0.4) currentStreak = 2;
    }

    return {
      correct: totalCorrect,
      total: totalPredictions,
      rank: bestRank,
      rankChange: bestRank ? Math.floor(Math.random() * 5) + 1 : undefined, // Mock for now
      streak: currentStreak,
    };
  }

  /**
   * Convert score prediction to outcome
   */
  private scoreToOutcome(homeScore?: number, awayScore?: number): string {
    if (homeScore === undefined || awayScore === undefined) return 'draw';
    if (homeScore > awayScore) return 'home';
    if (homeScore < awayScore) return 'away';
    return 'draw';
  }

  /**
   * Convert string outcome to enum
   */
  private stringToOutcome(outcome: string): PredictionOutcome {
    switch (outcome.toLowerCase()) {
      case 'home':
        return PredictionOutcome.HOME;
      case 'away':
        return PredictionOutcome.AWAY;
      default:
        return PredictionOutcome.DRAW;
    }
  }
}
