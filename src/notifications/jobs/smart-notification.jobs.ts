import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'

import { NotificationDispatcherService } from '../notification-dispatcher.service'
import {
  SmartNotificationType,
  NotificationPreferences,
  NotificationPreferencesDocument,
} from '../schemas/notification-preferences.schema'

// WorldCup data
import { QueriesService, RawMatch, RawTeam } from '../../worldcup/queries/queries.service'

// Quiniela data
import { Quiniela, QuinielaDocument, QuinielaMember } from '../../quiniela/schemas/quiniela.schema'

/**
 * SmartNotificationJobs
 *
 * Cron jobs for scheduled notifications:
 * - Morning Briefing: 8am local time - "Today's matches"
 * - Pre-Match Reminder: 2 hours before - "Don't forget to predict!"
 * - Post-Match Result: After match ends - "Results + your points"
 */
@Injectable()
export class SmartNotificationJobs {
  private readonly logger = new Logger(SmartNotificationJobs.name)

  constructor(
    private readonly dispatcherService: NotificationDispatcherService,
    private readonly queriesService: QueriesService,

    @InjectModel(NotificationPreferences.name)
    private preferencesModel: Model<NotificationPreferencesDocument>,

    @InjectModel(Quiniela.name)
    private quinielaModel: Model<QuinielaDocument>,
  ) {}

  // ============================================
  // MORNING BRIEFING (8am daily during World Cup)
  // ============================================

  /**
   * Morning Briefing - Daily at 8am (server time)
   *
   * Sends summary of today's matches to users who have this enabled.
   */
  @Cron('0 8 * * *') // 8:00 AM every day
  async sendMorningBriefing(): Promise<void> {
    this.logger.log('Starting Morning Briefing job...')

    try {
      // Get today's matches
      const todayMatches = this.getTodayMatches()

      if (todayMatches.length === 0) {
        this.logger.debug('No matches today, skipping morning briefing')
        return
      }

      // Build briefing message
      const matchList = todayMatches
        .map((m) => {
          const homeTeam = this.queriesService.getTeamById(m.homeTeamId)
          const awayTeam = this.queriesService.getTeamById(m.awayTeamId)
          const time = new Date(m.dateTimeUTC).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Mexico_City',
          })
          return `• ${homeTeam?.name.es || m.homeTeamId} vs ${awayTeam?.name.es || m.awayTeamId} (${time})`
        })
        .join('\n')

      const title = `Buenos días! Hoy hay ${todayMatches.length} partido${todayMatches.length > 1 ? 's' : ''}`
      const message = `Partidos de hoy:\n\n${matchList}\n\n¿Ya hiciste tus predicciones?`
      const shortMessage = `${todayMatches.length} partido${todayMatches.length > 1 ? 's' : ''} hoy - ¡Predice ahora!`

      // Get all users with quiniela memberships who have morning briefing enabled
      const usersToNotify = await this.getQuinielaUsersWithPreference('morningBriefing')

      if (usersToNotify.length === 0) {
        this.logger.debug('No users to notify for morning briefing')
        return
      }

      // Send batch notification
      await this.dispatcherService.dispatchBatch({
        userIds: usersToNotify,
        type: SmartNotificationType.MORNING_BRIEFING,
        title,
        message,
        shortMessage,
        actionUrl: '/quiniela',
      })

      this.logger.log(`Morning briefing sent to ${usersToNotify.length} users`)
    } catch (error) {
      this.logger.error('Failed to send morning briefing:', error)
    }
  }

  // ============================================
  // PRE-MATCH REMINDER (2 hours before)
  // ============================================

  /**
   * Pre-Match Reminder - Every 30 minutes
   *
   * Checks for matches starting in 1.5-2.5 hours.
   * Sends reminder to users who haven't predicted yet.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendPreMatchReminders(): Promise<void> {
    this.logger.debug('Checking for upcoming matches...')

    try {
      // Find matches starting in 1.5-2.5 hours (90-150 minutes)
      const upcomingMatches = this.getMatchesInTimeWindow(90, 150)

      if (upcomingMatches.length === 0) {
        return
      }

      this.logger.log(`Found ${upcomingMatches.length} matches starting soon`)

      for (const match of upcomingMatches) {
        await this.sendPreMatchReminderForMatch(match)
      }
    } catch (error) {
      this.logger.error('Failed to send pre-match reminders:', error)
    }
  }

  /**
   * Send reminder for a specific match
   */
  private async sendPreMatchReminderForMatch(match: RawMatch): Promise<void> {
    const homeTeam = this.queriesService.getTeamById(match.homeTeamId)
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId)

    if (!homeTeam || !awayTeam) {
      this.logger.warn(`Teams not found for match ${match.id}`)
      return
    }

    const title = `${homeTeam.name.es} vs ${awayTeam.name.es} en 2 horas!`
    const message = `El partido empieza pronto. ¿Ya hiciste tu predicción?`
    const shortMessage = `${homeTeam.code} vs ${awayTeam.code} - ¡Predice ahora!`

    // Get users who haven't predicted for this match
    const usersToNotify = await this.getUsersWithoutPrediction(match.id)

    if (usersToNotify.length === 0) {
      this.logger.debug(`All users have predicted for match ${match.id}`)
      return
    }

    await this.dispatcherService.dispatchBatch({
      userIds: usersToNotify,
      type: SmartNotificationType.PRE_MATCH_REMINDER,
      title,
      message,
      shortMessage,
      actionUrl: `/quiniela`,
      matchContext: {
        matchId: match.id,
        homeTeamCode: homeTeam.code,
        awayTeamCode: awayTeam.code,
        homeTeamName: homeTeam.name.es,
        awayTeamName: awayTeam.name.es,
        matchDateUTC: new Date(match.dateTimeUTC),
      },
    })

    this.logger.log(`Pre-match reminder sent to ${usersToNotify.length} users for ${homeTeam.code} vs ${awayTeam.code}`)
  }

  // ============================================
  // PREDICTION DEADLINE (30 min before)
  // ============================================

  /**
   * Prediction Deadline - Every 15 minutes
   *
   * Urgent reminder 30 minutes before match starts.
   */
  @Cron('*/15 * * * *') // Every 15 minutes
  async sendPredictionDeadlineReminders(): Promise<void> {
    this.logger.debug('Checking for prediction deadlines...')

    try {
      // Find matches starting in 25-35 minutes
      const upcomingMatches = this.getMatchesInTimeWindow(25, 35)

      if (upcomingMatches.length === 0) {
        return
      }

      for (const match of upcomingMatches) {
        const homeTeam = this.queriesService.getTeamById(match.homeTeamId)
        const awayTeam = this.queriesService.getTeamById(match.awayTeamId)

        if (!homeTeam || !awayTeam) continue

        const usersToNotify = await this.getUsersWithoutPrediction(match.id)

        if (usersToNotify.length === 0) continue

        await this.dispatcherService.dispatchBatch({
          userIds: usersToNotify,
          type: SmartNotificationType.PREDICTION_DEADLINE,
          title: `⏰ Última oportunidad!`,
          message: `${homeTeam.name.es} vs ${awayTeam.name.es} empieza en 30 minutos. ¡Predice ahora o nunca!`,
          shortMessage: `30 min para predecir ${homeTeam.code} vs ${awayTeam.code}`,
          actionUrl: `/quiniela`,
          matchContext: {
            matchId: match.id,
            homeTeamCode: homeTeam.code,
            awayTeamCode: awayTeam.code,
            homeTeamName: homeTeam.name.es,
            awayTeamName: awayTeam.name.es,
            matchDateUTC: new Date(match.dateTimeUTC),
          },
        })

        this.logger.log(`Deadline reminder sent to ${usersToNotify.length} users for ${homeTeam.code} vs ${awayTeam.code}`)
      }
    } catch (error) {
      this.logger.error('Failed to send deadline reminders:', error)
    }
  }

  // ============================================
  // POST-MATCH RESULT (triggered by event)
  // ============================================

  /**
   * Send post-match notifications
   *
   * Called when a match result is finalized.
   * This should be called from an external service when results come in.
   */
  async sendPostMatchNotifications(
    matchId: string,
    homeScore: number,
    awayScore: number,
  ): Promise<void> {
    const match = this.queriesService.getMatchById(matchId)
    if (!match) {
      this.logger.error(`Match ${matchId} not found`)
      return
    }

    const homeTeam = this.queriesService.getTeamById(match.homeTeamId)
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId)

    if (!homeTeam || !awayTeam) return

    this.logger.log(`Sending post-match notifications for ${homeTeam.code} ${homeScore}-${awayScore} ${awayTeam.code}`)

    try {
      // Get all quinielas that have this match in predictions
      const quinielas = await this.quinielaModel.find({
        'members.predictions.matchId': matchId,
      })

      for (const quiniela of quinielas) {
        for (const member of quiniela.members) {
          const prediction = member.predictions.find((p) => p.matchId === matchId)
          if (!prediction || !member.userId) continue

          const userId = member.userId.toString()
          const predictedHome = prediction.homeScore ?? 0
          const predictedAway = prediction.awayScore ?? 0

          // Calculate points
          let points = 0
          let message: string

          const exactMatch = predictedHome === homeScore && predictedAway === awayScore
          const directionMatch =
            Math.sign(predictedHome - predictedAway) === Math.sign(homeScore - awayScore)

          if (exactMatch) {
            points = quiniela.rules.exactScore
            message = `¡Increíble! Acertaste el marcador exacto ${predictedHome}-${predictedAway}. +${points} puntos!`
          } else if (directionMatch) {
            points = quiniela.rules.correctResult
            message = `Acertaste el resultado! Tu predicción: ${predictedHome}-${predictedAway}. +${points} puntos.`
          } else {
            message = `Resultado: ${homeScore}-${awayScore}. Tu predicción: ${predictedHome}-${predictedAway}. Próxima vez!`
          }

          await this.dispatcherService.dispatch({
            userId,
            type: SmartNotificationType.POST_MATCH_RESULT,
            title: `${homeTeam.code} ${homeScore} - ${awayScore} ${awayTeam.code}`,
            message,
            shortMessage: `Final: ${homeTeam.code} ${homeScore}-${awayScore} ${awayTeam.code}`,
            actionUrl: `/quiniela/${quiniela._id}`,
            matchContext: {
              matchId,
              homeTeamCode: homeTeam.code,
              awayTeamCode: awayTeam.code,
              homeTeamName: homeTeam.name.es,
              awayTeamName: awayTeam.name.es,
              homeScore,
              awayScore,
              matchDateUTC: new Date(match.dateTimeUTC),
            },
            quinielaContext: {
              quinielaId: quiniela._id.toString(),
              quinielaName: quiniela.name,
              quinielaCode: quiniela.code,
              userPoints: member.totalPoints + points,
              userRank: member.rank,
            },
          })
        }
      }

      this.logger.log(`Post-match notifications sent for match ${matchId}`)
    } catch (error) {
      this.logger.error('Failed to send post-match notifications:', error)
    }
  }

  // ============================================
  // RANKING UPDATE
  // ============================================

  /**
   * Send ranking update notification
   *
   * Called when rankings are recalculated after a match.
   */
  async sendRankingUpdate(
    userId: string,
    quinielaId: string,
    quinielaName: string,
    newRank: number,
    previousRank: number,
    passedByName?: string,
  ): Promise<void> {
    if (newRank === previousRank) return // No change

    const wentUp = newRank < previousRank
    const wentDown = newRank > previousRank

    let title: string
    let message: string

    if (wentUp) {
      title = `🎉 ¡Subiste al #${newRank}!`
      message = `En ${quinielaName} subiste del #${previousRank} al #${newRank}. ¡Sigue así!`
    } else if (wentDown && passedByName) {
      title = `${passedByName} te superó`
      message = `Bajaste al #${newRank} en ${quinielaName}. ¡Recupera tu lugar!`
    } else {
      title = `Bajaste al #${newRank}`
      message = `En ${quinielaName} ahora estás #${newRank}. ¡A por ellos!`
    }

    await this.dispatcherService.dispatch({
      userId,
      type: SmartNotificationType.RANKING_UPDATE,
      title,
      message,
      shortMessage: title,
      actionUrl: `/quiniela/${quinielaId}`,
      quinielaContext: {
        quinielaId,
        quinielaName,
        userRank: newRank,
        previousRank,
      },
    })
  }

  // ============================================
  // AI INSIGHTS
  // ============================================

  /**
   * Send AI insight for upcoming match
   *
   * Called when AI generates a prediction insight.
   */
  async sendAIInsight(
    userId: string,
    matchId: string,
    aiPrediction: string,
    confidence: number,
    reasoning: string,
  ): Promise<void> {
    const match = this.queriesService.getMatchById(matchId)
    if (!match) return

    const homeTeam = this.queriesService.getTeamById(match.homeTeamId)
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId)
    if (!homeTeam || !awayTeam) return

    await this.dispatcherService.dispatch({
      userId,
      type: SmartNotificationType.AI_INSIGHT,
      title: `🤖 AI Prediction: ${homeTeam.code} vs ${awayTeam.code}`,
      message: `La AI predice ${aiPrediction} con ${confidence}% confianza. ${reasoning}`,
      shortMessage: `AI: ${aiPrediction} (${confidence}%)`,
      actionUrl: `/quiniela`,
      matchContext: {
        matchId,
        homeTeamCode: homeTeam.code,
        awayTeamCode: awayTeam.code,
        homeTeamName: homeTeam.name.es,
        awayTeamName: awayTeam.name.es,
        matchDateUTC: new Date(match.dateTimeUTC),
      },
      aiContext: {
        aiPrediction,
        aiConfidence: confidence,
        aiReasoning: reasoning,
      },
    })
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Get today's matches
   */
  private getTodayMatches(): RawMatch[] {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD

    return this.queriesService.getAllMatches().filter((m) => {
      return m.dateTimeUTC.startsWith(todayStr)
    })
  }

  /**
   * Get matches in time window (minutes from now)
   */
  private getMatchesInTimeWindow(minMinutes: number, maxMinutes: number): RawMatch[] {
    const now = new Date()
    const minTime = new Date(now.getTime() + minMinutes * 60 * 1000)
    const maxTime = new Date(now.getTime() + maxMinutes * 60 * 1000)

    return this.queriesService.getAllMatches().filter((m) => {
      const matchTime = new Date(m.dateTimeUTC)
      return matchTime >= minTime && matchTime <= maxTime
    })
  }

  /**
   * Get all users in quinielas who have a specific preference enabled
   */
  private async getQuinielaUsersWithPreference(
    prefType: 'morningBriefing' | 'preMatchReminder' | 'postMatchResult' | 'rankingUpdate' | 'predictionDeadline',
  ): Promise<string[]> {
    // Get all unique user IDs from all quinielas
    const quinielas = await this.quinielaModel.find({
      status: { $ne: 'closed' },
      memberCount: { $gt: 0 },
    })

    const userIds = new Set<string>()
    for (const q of quinielas) {
      for (const member of q.members) {
        if (member.userId) {
          userIds.add(member.userId.toString())
        }
      }
    }

    if (userIds.size === 0) return []

    // Filter by preference
    const userIdArray = Array.from(userIds)
    const preferences = await this.preferencesModel.find({
      userId: { $in: userIdArray.map((id) => new Types.ObjectId(id)) },
      globalEnabled: true,
      [`${prefType}.push`]: true, // At least push enabled
    })

    const enabledUserIds = new Set(preferences.map((p) => p.userId.toString()))

    // Include users without preferences (they get defaults which have push enabled)
    const usersWithoutPrefs = userIdArray.filter(
      (id) => !preferences.find((p) => p.userId.toString() === id),
    )

    return [...enabledUserIds, ...usersWithoutPrefs]
  }

  /**
   * Get users who haven't predicted for a specific match
   */
  private async getUsersWithoutPrediction(matchId: string): Promise<string[]> {
    // Get all quinielas
    const quinielas = await this.quinielaModel.find({
      status: { $ne: 'closed' },
    })

    const usersWithoutPrediction = new Set<string>()

    for (const quiniela of quinielas) {
      for (const member of quiniela.members) {
        if (!member.userId) continue

        const userId = member.userId.toString()
        const hasPrediction = member.predictions.some((p) => p.matchId === matchId)

        if (!hasPrediction) {
          usersWithoutPrediction.add(userId)
        }
      }
    }

    if (usersWithoutPrediction.size === 0) return []

    // Filter by preference (preMatchReminder enabled)
    const userIdArray = Array.from(usersWithoutPrediction)
    const preferences = await this.preferencesModel.find({
      userId: { $in: userIdArray.map((id) => new Types.ObjectId(id)) },
      globalEnabled: true,
      'preMatchReminder.push': true,
    })

    const enabledUserIds = new Set(preferences.map((p) => p.userId.toString()))

    // Include users without preferences (defaults have push enabled)
    const usersWithoutPrefs = userIdArray.filter(
      (id) => !preferences.find((p) => p.userId.toString() === id),
    )

    return [...enabledUserIds, ...usersWithoutPrefs]
  }

  // ============================================
  // MATCH RESULT PROCESSOR (call when results come in)
  // ============================================

  /**
   * Process a match result - updates points and sends notifications
   *
   * Call this method when a match finishes:
   * - From an admin dashboard
   * - From a cron job that fetches results
   * - From a webhook from an external data provider
   */
  async processMatchResult(
    matchId: string,
    homeScore: number,
    awayScore: number,
  ): Promise<{ processed: number; notifications: number }> {
    this.logger.log(`Processing match result: ${matchId} (${homeScore}-${awayScore})`)

    const match = this.queriesService.getMatchById(matchId)
    if (!match) {
      this.logger.error(`Match ${matchId} not found`)
      return { processed: 0, notifications: 0 }
    }

    const homeTeam = this.queriesService.getTeamById(match.homeTeamId)
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId)
    if (!homeTeam || !awayTeam) {
      this.logger.error(`Teams not found for match ${matchId}`)
      return { processed: 0, notifications: 0 }
    }

    // Get all quinielas that have predictions for this match
    const quinielas = await this.quinielaModel.find({
      'members.predictions.matchId': matchId,
    })

    let totalProcessed = 0
    let totalNotifications = 0
    const rankingChanges: Array<{
      userId: string
      quinielaId: string
      quinielaName: string
      newRank: number
      previousRank: number
    }> = []

    for (const quiniela of quinielas) {
      // Store previous ranks
      const previousRanks = new Map<string, number>()
      quiniela.members.forEach((m, i) => {
        if (m.userId) {
          previousRanks.set(m.userId.toString(), m.rank || i + 1)
        }
      })

      // Calculate and update points for each member
      for (const member of quiniela.members) {
        const prediction = member.predictions.find((p) => p.matchId === matchId)
        if (!prediction) continue

        const predictedHome = prediction.homeScore ?? 0
        const predictedAway = prediction.awayScore ?? 0

        // Calculate points
        let pointsEarned = 0
        const exactMatch = predictedHome === homeScore && predictedAway === awayScore
        const directionMatch =
          Math.sign(predictedHome - predictedAway) === Math.sign(homeScore - awayScore)

        if (exactMatch) {
          pointsEarned = quiniela.rules.exactScore
          member.exactScores = (member.exactScores || 0) + 1
          member.correctPredictions = (member.correctPredictions || 0) + 1
        } else if (directionMatch) {
          pointsEarned = quiniela.rules.correctResult
          member.correctPredictions = (member.correctPredictions || 0) + 1
        }

        member.totalPoints = (member.totalPoints || 0) + pointsEarned
        totalProcessed++
      }

      // Recalculate rankings
      const sortedMembers = [...quiniela.members].sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) {
          return b.totalPoints - a.totalPoints
        }
        return (b.exactScores || 0) - (a.exactScores || 0)
      })

      sortedMembers.forEach((m, index) => {
        const memberInQuiniela = quiniela.members.find(
          (qm) => qm._id.toString() === m._id.toString(),
        )
        if (memberInQuiniela) {
          memberInQuiniela.rank = index + 1

          // Track ranking changes
          if (memberInQuiniela.userId) {
            const userId = memberInQuiniela.userId.toString()
            const prevRank = previousRanks.get(userId) || index + 1
            if (prevRank !== index + 1) {
              rankingChanges.push({
                userId,
                quinielaId: quiniela._id.toString(),
                quinielaName: quiniela.name,
                newRank: index + 1,
                previousRank: prevRank,
              })
            }
          }
        }
      })

      // Save the updated quiniela
      await quiniela.save()
    }

    // Send post-match notifications
    await this.sendPostMatchNotifications(matchId, homeScore, awayScore)
    totalNotifications += quinielas.reduce((acc, q) => acc + q.members.length, 0)

    // Send ranking update notifications
    for (const change of rankingChanges) {
      await this.sendRankingUpdate(
        change.userId,
        change.quinielaId,
        change.quinielaName,
        change.newRank,
        change.previousRank,
      )
      totalNotifications++
    }

    this.logger.log(
      `Processed ${totalProcessed} predictions, sent ${totalNotifications} notifications`,
    )

    return { processed: totalProcessed, notifications: totalNotifications }
  }
}
