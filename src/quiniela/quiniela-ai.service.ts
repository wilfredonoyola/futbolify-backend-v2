// Quiniela AI Service - AI predictions for World Cup 2026
//
// Generates and manages AI predictions for matches.
// Uses deterministic algorithm based on team data for consistent predictions.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AIPredictionDoc, AIPredictionDocument } from './schemas/ai-prediction.schema';
import { Quiniela, QuinielaDocument } from './schemas/quiniela.schema';
import { AIPrediction, AIScoreData, AIScoreStreak } from './dto/quiniela.dto';

// Team strength ratings (simplified - in production would come from real data)
const TEAM_STRENGTH: Record<string, number> = {
  // Tier 1 - Elite (85-95)
  ARG: 94, FRA: 93, BRA: 92, ENG: 91, ESP: 90, GER: 89, POR: 88, NED: 87, BEL: 86, ITA: 85,
  // Tier 2 - Strong (75-84)
  CRO: 84, URU: 83, COL: 82, MEX: 81, USA: 80, SUI: 79, DEN: 78, SEN: 77, JPN: 76, KOR: 75,
  // Tier 3 - Competitive (65-74)
  MAR: 74, AUS: 73, POL: 72, UKR: 71, EGY: 70, CAN: 69, QAT: 68, ECU: 67, IRN: 66, SRB: 65,
  // Tier 4 - Others (55-64)
  TUN: 64, CMR: 63, GHA: 62, NGA: 61, CRC: 60, PAN: 59, SAU: 58, PER: 57, CHL: 56, VEN: 55,
};

// Reasoning templates
const REASONING_TEMPLATES = {
  es: {
    strongFavorite: (home: string, away: string) =>
      `${home} es claro favorito con mejor ranking FIFA y plantel más experimentado. Se espera dominio en posesión.`,
    slightFavorite: (home: string, away: string) =>
      `Partido parejo pero ${home} tiene ligera ventaja por localía y forma reciente.`,
    upset: (home: string, away: string) =>
      `${away} podría dar la sorpresa. Llegan en mejor momento y tienen historial favorable.`,
    balanced: (home: string, away: string) =>
      `Encuentro muy equilibrado. Ambos equipos en forma similar, se esperan pocos goles.`,
    highScoring: (home: string, away: string) =>
      `Ambos equipos con estilo ofensivo. Las defensas han mostrado vulnerabilidades.`,
  },
  en: {
    strongFavorite: (home: string, away: string) =>
      `${home} is the clear favorite with better FIFA ranking and more experienced squad. Expected to dominate possession.`,
    slightFavorite: (home: string, away: string) =>
      `Close match but ${home} has a slight edge with home advantage and recent form.`,
    upset: (home: string, away: string) =>
      `${away} could cause an upset. They're in better form and have favorable history.`,
    balanced: (home: string, away: string) =>
      `Very balanced encounter. Both teams in similar form, low-scoring game expected.`,
    highScoring: (home: string, away: string) =>
      `Both teams play offensive football. Defenses have shown vulnerabilities.`,
  },
};

@Injectable()
export class QuinielaAIService {
  constructor(
    @InjectModel(AIPredictionDoc.name)
    private aiPredictionModel: Model<AIPredictionDocument>,
    @InjectModel(Quiniela.name)
    private quinielaModel: Model<QuinielaDocument>,
  ) {}

  /**
   * Get team strength (0-100)
   */
  private getTeamStrength(teamCode: string): number {
    return TEAM_STRENGTH[teamCode?.toUpperCase()] || 60;
  }

  /**
   * Generate deterministic prediction based on team codes
   * Uses seeded random for consistency (same match = same prediction)
   */
  private generatePrediction(
    matchId: string,
    homeTeamCode: string,
    awayTeamCode: string,
    locale: 'es' | 'en' = 'es',
  ): Omit<AIPrediction, 'matchId'> {
    const homeStrength = this.getTeamStrength(homeTeamCode);
    const awayStrength = this.getTeamStrength(awayTeamCode);

    // Home advantage bonus (3-5 points)
    const homeAdvantage = 4;
    const adjustedHomeStrength = homeStrength + homeAdvantage;

    // Calculate win probabilities
    const strengthDiff = adjustedHomeStrength - awayStrength;
    const homeWinProb = 0.35 + (strengthDiff / 100) * 0.3;
    const drawProb = 0.25 - Math.abs(strengthDiff) / 200;
    const awayWinProb = 1 - homeWinProb - drawProb;

    // Generate deterministic "random" based on matchId
    const seed = this.hashCode(matchId);
    const rand = this.seededRandom(seed);

    // Predict score based on probabilities
    let homeScore: number;
    let awayScore: number;
    let isUpset = false;

    if (rand < homeWinProb) {
      // Home win
      homeScore = Math.floor(this.seededRandom(seed + 1) * 2) + 1; // 1-2
      awayScore = Math.max(0, homeScore - 1 - Math.floor(this.seededRandom(seed + 2) * 2)); // 0 to homeScore-1
    } else if (rand < homeWinProb + drawProb) {
      // Draw
      const baseScore = Math.floor(this.seededRandom(seed + 3) * 2); // 0-1
      homeScore = baseScore;
      awayScore = baseScore;
    } else {
      // Away win (potential upset if away team is weaker)
      awayScore = Math.floor(this.seededRandom(seed + 4) * 2) + 1; // 1-2
      homeScore = Math.max(0, awayScore - 1 - Math.floor(this.seededRandom(seed + 5) * 2));
      isUpset = awayStrength < homeStrength;
    }

    // Calculate confidence (based on strength difference)
    const confidence = Math.min(85, Math.max(45, 55 + Math.abs(strengthDiff) / 2));

    // Select reasoning
    const templates = REASONING_TEMPLATES[locale];
    let reasoning: string;

    if (isUpset) {
      reasoning = templates.upset(homeTeamCode, awayTeamCode);
    } else if (Math.abs(strengthDiff) > 15) {
      reasoning = templates.strongFavorite(
        strengthDiff > 0 ? homeTeamCode : awayTeamCode,
        strengthDiff > 0 ? awayTeamCode : homeTeamCode,
      );
    } else if (Math.abs(strengthDiff) > 5) {
      reasoning = templates.slightFavorite(
        strengthDiff > 0 ? homeTeamCode : awayTeamCode,
        strengthDiff > 0 ? awayTeamCode : homeTeamCode,
      );
    } else if (homeScore + awayScore > 2) {
      reasoning = templates.highScoring(homeTeamCode, awayTeamCode);
    } else {
      reasoning = templates.balanced(homeTeamCode, awayTeamCode);
    }

    return {
      homeScore,
      awayScore,
      confidence: Math.round(confidence),
      reasoning,
      isUpset,
    };
  }

  /**
   * Simple hash function for string to number
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Seeded pseudo-random number generator (0-1)
   */
  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Get or create AI prediction for a match
   */
  async getAIPrediction(
    matchId: string,
    homeTeamCode: string,
    awayTeamCode: string,
    homeTeamId: string,
    awayTeamId: string,
    locale: 'es' | 'en' = 'es',
  ): Promise<AIPrediction> {
    // Check if prediction already exists
    let existing = await this.aiPredictionModel.findOne({ matchId });

    if (!existing) {
      // Generate and save new prediction
      const prediction = this.generatePrediction(matchId, homeTeamCode, awayTeamCode, locale);

      existing = await this.aiPredictionModel.create({
        matchId,
        homeTeamId,
        awayTeamId,
        ...prediction,
      });
    }

    return {
      matchId: existing.matchId,
      homeScore: existing.homeScore,
      awayScore: existing.awayScore,
      confidence: existing.confidence,
      reasoning: existing.reasoning,
      isUpset: existing.isUpset,
    };
  }

  /**
   * Get AI predictions for multiple matches
   */
  async getAIPredictionsForMatches(
    matches: Array<{
      matchId: string;
      homeTeamCode: string;
      awayTeamCode: string;
      homeTeamId: string;
      awayTeamId: string;
    }>,
    locale: 'es' | 'en' = 'es',
  ): Promise<AIPrediction[]> {
    const predictions: AIPrediction[] = [];

    for (const match of matches) {
      const prediction = await this.getAIPrediction(
        match.matchId,
        match.homeTeamCode,
        match.awayTeamCode,
        match.homeTeamId,
        match.awayTeamId,
        locale,
      );
      predictions.push(prediction);
    }

    return predictions;
  }

  /**
   * Evaluate AI prediction after match ends
   */
  async evaluateMatchResult(
    matchId: string,
    actualHomeScore: number,
    actualAwayScore: number,
  ): Promise<void> {
    const prediction = await this.aiPredictionModel.findOne({ matchId });
    if (!prediction || prediction.isEvaluated) return;

    // Determine actual result direction
    const actualDirection = Math.sign(actualHomeScore - actualAwayScore);
    const predictedDirection = Math.sign(prediction.homeScore - prediction.awayScore);

    const wasCorrectDirection = actualDirection === predictedDirection;
    const wasExactScore =
      prediction.homeScore === actualHomeScore &&
      prediction.awayScore === actualAwayScore;

    await this.aiPredictionModel.updateOne(
      { _id: prediction._id },
      {
        $set: {
          actualHomeScore,
          actualAwayScore,
          isEvaluated: true,
          wasCorrectDirection,
          wasExactScore,
        },
      },
    );
  }

  /**
   * Calculate AI vs User score for a quiniela
   */
  async getAIScore(quinielaId: string, userId: string): Promise<AIScoreData> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      return this.emptyScoreData();
    }

    // Find user's member record
    const member = quiniela.members.find(
      (m) => m.userId.toString() === userId,
    );
    if (!member) {
      return this.emptyScoreData();
    }

    // Get all evaluated AI predictions
    const evaluatedPredictions = await this.aiPredictionModel.find({
      isEvaluated: true,
    });

    if (evaluatedPredictions.length === 0) {
      return this.emptyScoreData();
    }

    // Create map of AI predictions
    const aiPredictionMap = new Map(
      evaluatedPredictions.map((p) => [p.matchId, p]),
    );

    let userCorrect = 0;
    let aiCorrect = 0;
    let userExact = 0;
    let aiExact = 0;
    let totalMatches = 0;

    // Track streak
    const results: Array<'user' | 'ai' | 'both' | 'none'> = [];

    // Compare user predictions with AI for evaluated matches
    for (const userPrediction of member.predictions) {
      const aiPrediction = aiPredictionMap.get(userPrediction.matchId);
      if (!aiPrediction || aiPrediction.actualHomeScore === undefined) continue;

      totalMatches++;

      const actualHomeScore = aiPrediction.actualHomeScore;
      const actualAwayScore = aiPrediction.actualAwayScore!;
      const actualDirection = Math.sign(actualHomeScore - actualAwayScore);

      // User evaluation
      const userHomeScore = userPrediction.homeScore ?? 0;
      const userAwayScore = userPrediction.awayScore ?? 0;
      const userDirection = Math.sign(userHomeScore - userAwayScore);
      const userWasCorrect = userDirection === actualDirection;
      const userWasExact =
        userHomeScore === actualHomeScore &&
        userAwayScore === actualAwayScore;

      if (userWasCorrect) userCorrect++;
      if (userWasExact) userExact++;

      // AI evaluation
      if (aiPrediction.wasCorrectDirection) aiCorrect++;
      if (aiPrediction.wasExactScore) aiExact++;

      // Track for streak
      const userPoint = userWasCorrect;
      const aiPoint = aiPrediction.wasCorrectDirection;

      if (userPoint && !aiPoint) {
        results.push('user');
      } else if (!userPoint && aiPoint) {
        results.push('ai');
      } else if (userPoint && aiPoint) {
        results.push('both');
      } else {
        results.push('none');
      }
    }

    // Calculate streak
    const streak = this.calculateStreak(results);

    return {
      userCorrect,
      aiCorrect,
      userExact,
      aiExact,
      totalMatches,
      streak,
    };
  }

  /**
   * Calculate current streak
   */
  private calculateStreak(
    results: Array<'user' | 'ai' | 'both' | 'none'>,
  ): AIScoreStreak {
    if (results.length === 0) {
      return { type: 'none', count: 0 };
    }

    let currentType: 'user' | 'ai' | 'none' = 'none';
    let count = 0;

    // Go backwards from most recent
    for (let i = results.length - 1; i >= 0; i--) {
      const result = results[i];

      if (result === 'both' || result === 'none') {
        // Streak broken or tie
        if (count > 0) break;
        continue;
      }

      if (currentType === 'none') {
        currentType = result;
        count = 1;
      } else if (result === currentType) {
        count++;
      } else {
        break;
      }
    }

    return { type: currentType, count };
  }

  /**
   * Empty score data
   */
  private emptyScoreData(): AIScoreData {
    return {
      userCorrect: 0,
      aiCorrect: 0,
      userExact: 0,
      aiExact: 0,
      totalMatches: 0,
      streak: { type: 'none', count: 0 },
    };
  }
}
