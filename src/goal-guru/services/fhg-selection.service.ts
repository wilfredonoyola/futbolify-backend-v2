import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import { FhgSelection, FhgSelectionDocument } from '../schemas/fhg-selection.schema'
import { FhgMatch, FhgMatchDocument } from '../schemas/fhg-match.schema'
import { FhgOdds, FhgOddsDocument } from '../schemas/fhg-odds.schema'
import { FhgPrediction, FhgPredictionDocument } from '../schemas/fhg-prediction.schema'
import { FhgPredictionService } from './fhg-prediction.service'
import { FhgValueService, ValueResult } from './fhg-value.service'
import { FhgLogService } from './fhg-log.service'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'
import { FhgSignal } from '../enums/fhg-signal.enum'
import { FhgOutcome } from '../enums/fhg-outcome.enum'
import {
  MAX_DAILY_SELECTIONS,
  MAX_DAILY_EXPOSURE,
  getActiveFhgLeagues,
} from '../constants/fhg-config'
import {
  FhgSelectionDto,
  FhgSelectionHistoryDto,
} from '../dto/fhg-selection.dto'
import {
  DailyPipelineResultDto,
  SettlementResultDto,
  FhgMatchCandidateDto,
  FhgPipelineOptionsInput,
} from '../dto/fhg-pipeline-result.dto'

/**
 * FHG Selection Service
 * Handles the daily pipeline and settlement process
 *
 * Daily Pipeline Steps:
 * 1. Fetch matches for today (active leagues)
 * 2. Generate predictions for each match
 * 3. Fetch odds for each match
 * 4. Evaluate value (filter NONE signals)
 * 5. Create selections (max 5, max 8% exposure)
 *
 * Settlement:
 * - Find PENDING selections with FINISHED matches
 * - Calculate outcome (goals_1h > 0 ? WON : LOST)
 * - Calculate CLV = (oddsAtSelection - closingOdds) / closingOdds
 * - Calculate profitLoss
 */
@Injectable()
export class FhgSelectionService {
  private readonly logger = new Logger(FhgSelectionService.name)

  constructor(
    @InjectModel(FhgSelection.name)
    private selectionModel: Model<FhgSelectionDocument>,
    @InjectModel(FhgMatch.name)
    private matchModel: Model<FhgMatchDocument>,
    @InjectModel(FhgOdds.name)
    private oddsModel: Model<FhgOddsDocument>,
    @InjectModel(FhgPrediction.name)
    private predictionModel: Model<FhgPredictionDocument>,
    private predictionService: FhgPredictionService,
    private valueService: FhgValueService,
    private logService: FhgLogService
  ) {}

  /**
   * Run the daily pipeline
   */
  async runDailyPipeline(
    options?: FhgPipelineOptionsInput
  ): Promise<DailyPipelineResultDto> {
    const startTime = Date.now()
    const pipelineId = uuidv4()
    const targetDate = options?.date
      ? new Date(options.date)
      : new Date()

    // Set to start of day
    targetDate.setHours(0, 0, 0, 0)
    const endDate = new Date(targetDate)
    endDate.setHours(23, 59, 59, 999)

    await this.logService.info(
      FhgLogCategory.PIPELINE,
      `Starting daily pipeline for ${targetDate.toISOString().split('T')[0]}`,
      { pipelineId, targetDate },
      { pipelineId }
    )

    const skippedReasons: string[] = []
    const createdSelections: FhgSelection[] = []

    try {
      // Step 1: Fetch matches
      await this.logService.logPipelineStep(
        pipelineId,
        1,
        5,
        'Fetching matches for active leagues'
      )

      const activeLeagues = getActiveFhgLeagues()
      const leagueCodes = options?.leagueCode
        ? [options.leagueCode]
        : activeLeagues.map((l) => l.code)

      const matches = await this.matchModel
        .find({
          date: { $gte: targetDate, $lte: endDate },
          leagueCode: { $in: leagueCodes },
          status: 'SCHEDULED',
        })
        .exec()

      await this.logService.info(
        FhgLogCategory.PIPELINE,
        `Found ${matches.length} matches`,
        { matchCount: matches.length, leagues: leagueCodes },
        { pipelineId }
      )

      if (matches.length === 0) {
        return {
          pipelineId,
          date: targetDate,
          matchesAnalyzed: 0,
          candidatesFound: 0,
          selectionsCreated: 0,
          selections: [],
          skippedReasons: ['No matches found for today'],
          executionTimeMs: Date.now() - startTime,
          success: true,
        }
      }

      // Step 2: Generate predictions
      await this.logService.logPipelineStep(
        pipelineId,
        2,
        5,
        'Generating predictions'
      )

      const predictions: Map<
        string,
        { prediction: FhgPrediction; match: FhgMatch }
      > = new Map()

      for (const match of matches) {
        const result = await this.predictionService.calculateProbability(
          match._id.toString()
        )
        if (result) {
          predictions.set(match._id.toString(), {
            prediction: result.prediction,
            match,
          })
        } else {
          skippedReasons.push(
            `${match.homeTeam} vs ${match.awayTeam}: No prediction generated`
          )
        }
      }

      await this.logService.info(
        FhgLogCategory.PIPELINE,
        `Generated ${predictions.size} predictions`,
        undefined,
        { pipelineId }
      )

      // Step 3: Fetch odds
      await this.logService.logPipelineStep(pipelineId, 3, 5, 'Fetching odds')

      const matchIds = Array.from(predictions.keys())
      const oddsList = await this.oddsModel
        .find({
          matchId: { $in: matchIds.map((id) => new Types.ObjectId(id)) },
        })
        .exec()

      const oddsMap = new Map<string, FhgOdds>()
      for (const odds of oddsList) {
        oddsMap.set(odds.matchId.toString(), odds)
      }

      await this.logService.info(
        FhgLogCategory.PIPELINE,
        `Found odds for ${oddsMap.size} matches`,
        undefined,
        { pipelineId }
      )

      // Step 4: Evaluate value
      await this.logService.logPipelineStep(pipelineId, 4, 5, 'Evaluating value')

      const valuePairs: Array<{
        predictionId: string
        oddsId: string
        match: FhgMatch
      }> = []

      for (const [matchId, { prediction, match }] of predictions) {
        const odds = oddsMap.get(matchId)
        if (odds) {
          valuePairs.push({
            predictionId: prediction._id.toString(),
            oddsId: odds._id.toString(),
            match,
          })
        } else {
          skippedReasons.push(
            `${match.homeTeam} vs ${match.awayTeam}: No odds available`
          )
        }
      }

      const valueResults = await this.valueService.evaluateMultiple(
        valuePairs.map((p) => ({
          predictionId: p.predictionId,
          oddsId: p.oddsId,
        }))
      )

      const candidates = valueResults.filter((v) => v.isCandidate)
      const skipped = valueResults.filter((v) => !v.isCandidate)

      for (const skip of skipped) {
        const pair = valuePairs.find((p) => p.predictionId === skip.predictionId)
        if (pair) {
          skippedReasons.push(
            `${pair.match.homeTeam} vs ${pair.match.awayTeam}: ${skip.skipReason}`
          )
        }
      }

      await this.logService.info(
        FhgLogCategory.PIPELINE,
        `Found ${candidates.length} candidates, skipped ${skipped.length}`,
        undefined,
        { pipelineId }
      )

      // Step 5: Create selections
      await this.logService.logPipelineStep(
        pipelineId,
        5,
        5,
        'Creating selections'
      )

      // Sort by marginValor descending
      candidates.sort((a, b) => b.marginValor - a.marginValor)

      // Apply limits
      let totalExposure = 0
      let selectionCount = 0

      for (const candidate of candidates) {
        if (selectionCount >= MAX_DAILY_SELECTIONS) {
          skippedReasons.push(
            `Max selections reached (${MAX_DAILY_SELECTIONS})`
          )
          break
        }

        if (totalExposure + candidate.stakePercentage > MAX_DAILY_EXPOSURE) {
          skippedReasons.push(
            `Max exposure would be exceeded (${MAX_DAILY_EXPOSURE * 100}%)`
          )
          continue
        }

        // Check if selection already exists for this match
        const existing = await this.selectionModel.findOne({
          matchId: new Types.ObjectId(candidate.matchId),
        })
        if (existing) {
          skippedReasons.push(`Selection already exists for match ${candidate.matchId}`)
          continue
        }

        // Get match and odds for denormalization
        const matchData = predictions.get(candidate.matchId)
        const odds = oddsMap.get(candidate.matchId)

        if (!matchData || !odds) continue

        if (options?.dryRun) {
          // In dry run mode, don't persist
          selectionCount++
          totalExposure += candidate.stakePercentage
          continue
        }

        // Create selection
        const selection = await this.selectionModel.create({
          matchId: new Types.ObjectId(candidate.matchId),
          predictionId: new Types.ObjectId(candidate.predictionId),
          oddsId: new Types.ObjectId(candidate.oddsId),
          homeTeam: matchData.match.homeTeam,
          awayTeam: matchData.match.awayTeam,
          leagueCode: matchData.match.leagueCode,
          date: matchData.match.date,
          kickoffTime: matchData.match.kickoffTime,
          signal: candidate.signal,
          marginValor: candidate.marginValor,
          pReal: candidate.pReal,
          edgeScore: candidate.edgeScore,
          stakePercentage: candidate.stakePercentage,
          oddsAtSelection: candidate.bestOdds,
          bookmakerUsed: candidate.bookmaker,
          outcome: FhgOutcome.PENDING,
          pipelineId,
          pipelineRank: selectionCount + 1,
        })

        await this.logService.logSelection(
          selection._id.toString(),
          candidate.matchId,
          matchData.match.homeTeam,
          matchData.match.awayTeam,
          candidate.signal,
          candidate.marginValor,
          candidate.stakePercentage
        )

        createdSelections.push(selection)
        selectionCount++
        totalExposure += candidate.stakePercentage
      }

      const executionTimeMs = Date.now() - startTime

      await this.logService.info(
        FhgLogCategory.PIPELINE,
        `Pipeline completed: ${selectionCount} selections created, ${totalExposure * 100}% exposure`,
        {
          selectionsCreated: selectionCount,
          totalExposure,
          executionTimeMs,
        },
        { pipelineId }
      )

      return {
        pipelineId,
        date: targetDate,
        matchesAnalyzed: matches.length,
        candidatesFound: candidates.length,
        selectionsCreated: createdSelections.length,
        selections: createdSelections.map((s) => this.toDto(s)),
        skippedReasons,
        executionTimeMs,
        success: true,
      }
    } catch (error) {
      await this.logService.error(
        FhgLogCategory.PIPELINE,
        `Pipeline failed: ${error}`,
        { error: String(error) },
        { pipelineId }
      )

      return {
        pipelineId,
        date: targetDate,
        matchesAnalyzed: 0,
        candidatesFound: 0,
        selectionsCreated: 0,
        selections: [],
        skippedReasons,
        executionTimeMs: Date.now() - startTime,
        success: false,
        error: String(error),
      }
    }
  }

  /**
   * Settle pending selections
   */
  async settleSelections(): Promise<SettlementResultDto> {
    await this.logService.info(
      FhgLogCategory.SETTLEMENT,
      'Starting settlement process'
    )

    try {
      // Find pending selections with finished matches
      const pendingSelections = await this.selectionModel
        .find({ outcome: FhgOutcome.PENDING })
        .exec()

      const settledSelections: FhgSelection[] = []
      let won = 0
      let lost = 0
      let voided = 0

      for (const selection of pendingSelections) {
        // Get match result
        const match = await this.matchModel.findById(selection.matchId)
        if (!match) continue

        // Skip if match is still in progress
        const settleableStatuses = ['FINISHED', 'CANCELLED', 'POSTPONED']
        if (!settleableStatuses.includes(match.status)) continue

        // Get closing odds
        const odds = await this.oddsModel.findById(selection.oddsId)
        const closingOdds = odds?.closingG1hYes || selection.oddsAtSelection

        // Determine outcome
        let outcome: FhgOutcome
        let profitLoss: number

        if (match.status === 'CANCELLED' || match.status === 'POSTPONED') {
          outcome = FhgOutcome.VOID
          profitLoss = 0
          voided++
        } else {
          // match.status === 'FINISHED'
          const totalGoals1H = (match.homeScore1H || 0) + (match.awayScore1H || 0)
          const hadG1H = totalGoals1H > 0

          if (hadG1H) {
            outcome = FhgOutcome.WON
            profitLoss = (selection.oddsAtSelection - 1) * selection.stakePercentage
            won++
          } else {
            outcome = FhgOutcome.LOST
            profitLoss = -selection.stakePercentage
            lost++
          }
        }

        // Calculate CLV
        let clv: number | null = null
        if (closingOdds && closingOdds !== selection.oddsAtSelection) {
          clv =
            (selection.oddsAtSelection - closingOdds) / closingOdds
        }

        // Update selection
        await this.selectionModel.updateOne(
          { _id: selection._id },
          {
            $set: {
              outcome,
              closingOdds,
              clv,
              profitLoss,
              settledAt: new Date(),
              actualGoals1H:
                (match.homeScore1H || 0) + (match.awayScore1H || 0),
              minuteFirstGoal: match.minuteFirstGoal,
            },
          }
        )

        const updated = await this.selectionModel.findById(selection._id)
        if (updated) {
          settledSelections.push(updated)

          await this.logService.logSettlement(
            selection._id.toString(),
            selection.matchId.toString(),
            outcome,
            clv,
            profitLoss
          )
        }
      }

      await this.logService.info(
        FhgLogCategory.SETTLEMENT,
        `Settlement completed: ${settledSelections.length} settled (${won}W, ${lost}L, ${voided}V)`,
        { total: settledSelections.length, won, lost, voided }
      )

      return {
        settled: settledSelections.length,
        won,
        lost,
        voided,
        settledSelections: settledSelections.map((s) => this.toDto(s)),
        success: true,
      }
    } catch (error) {
      await this.logService.error(
        FhgLogCategory.SETTLEMENT,
        `Settlement failed: ${error}`,
        { error: String(error) }
      )

      return {
        settled: 0,
        won: 0,
        lost: 0,
        voided: 0,
        settledSelections: [],
        success: false,
        error: String(error),
      }
    }
  }

  /**
   * Get today's selections
   */
  async getTodaySelections(): Promise<FhgSelectionDto[]> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const selections = await this.selectionModel
      .find({
        date: { $gte: today, $lt: tomorrow },
      })
      .sort({ createdAt: -1 })
      .exec()

    return selections.map((s) => this.toDto(s))
  }

  /**
   * Get selections by date
   */
  async getSelectionsByDate(date: string): Promise<FhgSelectionDto[]> {
    const targetDate = new Date(date)
    targetDate.setHours(0, 0, 0, 0)
    const nextDay = new Date(targetDate)
    nextDay.setDate(nextDay.getDate() + 1)

    const selections = await this.selectionModel
      .find({
        date: { $gte: targetDate, $lt: nextDay },
      })
      .sort({ createdAt: -1 })
      .exec()

    return selections.map((s) => this.toDto(s))
  }

  /**
   * Get selection history with pagination
   */
  async getSelectionHistory(
    limit = 50,
    offset = 0
  ): Promise<FhgSelectionHistoryDto> {
    const [selections, total] = await Promise.all([
      this.selectionModel
        .find()
        .sort({ date: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      this.selectionModel.countDocuments(),
    ])

    return {
      selections: selections.map((s) => this.toDto(s)),
      total,
      offset,
      limit,
    }
  }

  /**
   * Get match candidates for today
   */
  async getMatchCandidates(date?: string): Promise<FhgMatchCandidateDto[]> {
    const targetDate = date ? new Date(date) : new Date()
    targetDate.setHours(0, 0, 0, 0)
    const endDate = new Date(targetDate)
    endDate.setHours(23, 59, 59, 999)

    const activeLeagues = getActiveFhgLeagues()
    const leagueCodes = activeLeagues.map((l) => l.code)

    const matches = await this.matchModel
      .find({
        date: { $gte: targetDate, $lte: endDate },
        leagueCode: { $in: leagueCodes },
        status: 'SCHEDULED',
      })
      .exec()

    const candidates: FhgMatchCandidateDto[] = []

    for (const match of matches) {
      const [prediction, odds] = await Promise.all([
        this.predictionModel.findOne({ matchId: match._id }),
        this.oddsModel.findOne({ matchId: match._id }),
      ])

      let marginValor: number | undefined
      let signal: string | undefined

      if (prediction && odds?.bestG1hYes) {
        marginValor = odds.bestG1hYes * prediction.pReal - 1
        signal = this.valueService.calculateSignal(marginValor)
      }

      candidates.push({
        matchId: match._id.toString(),
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        leagueCode: match.leagueCode,
        date: match.date,
        kickoffTime: match.kickoffTime,
        pReal: prediction?.pReal,
        edgeScore: prediction?.edgeScore,
        bestOdds: odds?.bestG1hYes,
        marginValor,
        signal,
        hasOdds: !!odds?.bestG1hYes,
        hasPrediction: !!prediction,
      })
    }

    return candidates.sort((a, b) => {
      if (a.marginValor === undefined && b.marginValor === undefined) return 0
      if (a.marginValor === undefined) return 1
      if (b.marginValor === undefined) return -1
      return b.marginValor - a.marginValor
    })
  }

  /**
   * Convert selection document to DTO
   */
  private toDto(selection: FhgSelection): FhgSelectionDto {
    return {
      id: selection._id.toString(),
      matchId: selection.matchId.toString(),
      predictionId: selection.predictionId.toString(),
      homeTeam: selection.homeTeam,
      awayTeam: selection.awayTeam,
      leagueCode: selection.leagueCode,
      date: selection.date,
      kickoffTime: selection.kickoffTime,
      signal: selection.signal,
      marginValor: selection.marginValor,
      pReal: selection.pReal,
      edgeScore: selection.edgeScore,
      stakePercentage: selection.stakePercentage,
      oddsAtSelection: selection.oddsAtSelection,
      bookmakerUsed: selection.bookmakerUsed,
      outcome: selection.outcome,
      closingOdds: selection.closingOdds,
      clv: selection.clv,
      profitLoss: selection.profitLoss,
      settledAt: selection.settledAt,
      actualGoals1H: selection.actualGoals1H,
      minuteFirstGoal: selection.minuteFirstGoal,
      createdAt: selection.createdAt,
    }
  }
}
