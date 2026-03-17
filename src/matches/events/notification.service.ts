import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as admin from 'firebase-admin'
import {
  MatchEvent,
  MatchEventType,
  EVENT_PRIORITY,
  EVENT_TEMPLATES,
} from './match-event.types'
import { RedisCacheService } from '../../common/redis-cache.service'

/**
 * Subscription types
 */
export interface MatchSubscription {
  oderId: string
  fixtureId: number
  homeTeam: string
  awayTeam: string
  leagueId?: string
  // Notification preferences
  notifyGoals: boolean
  notifyCards: boolean
  notifyStatus: boolean
  // User info
  fcmToken?: string
  locale: 'es' | 'en'
}

export interface TeamSubscription {
  userId: string
  teamId: string
  teamName: string
  // Notification preferences
  notifyAllMatches: boolean
  notifyGoals: boolean
  fcmToken?: string
  locale: 'es' | 'en'
}

const SUBSCRIPTIONS_KEY = 'match-subscriptions:'
const TEAM_SUBSCRIPTIONS_KEY = 'team-subscriptions:'
const SUBSCRIPTION_TTL = 86400 * 7 // 7 days

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name)
  private firebaseInitialized = false

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisCacheService
  ) {}

  onModuleInit() {
    this.initializeFirebase()
  }

  /**
   * Initialize Firebase Admin SDK
   */
  private initializeFirebase(): void {
    // Check if already initialized
    if (admin.apps.length > 0) {
      this.firebaseInitialized = true
      this.logger.log('✅ Firebase Admin SDK already initialized')
      return
    }

    // Try to initialize from environment variables
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID')
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL')
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')

    if (projectId && clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            // Replace escaped newlines with actual newlines
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        })
        this.firebaseInitialized = true
        this.logger.log('✅ Firebase Admin SDK initialized successfully')
      } catch (error) {
        this.logger.error(`❌ Failed to initialize Firebase: ${error.message}`)
      }
    } else {
      this.logger.warn(
        '⚠️ Firebase credentials not configured - push notifications disabled. ' +
        'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY'
      )
    }
  }

  /**
   * Process detected events and send notifications
   */
  async processEvents(events: MatchEvent[]): Promise<void> {
    if (!events.length) return

    this.logger.log(`📤 Processing ${events.length} events for notifications`)

    for (const event of events) {
      await this.notifyEvent(event)
    }
  }

  /**
   * Send notifications for a single event
   */
  private async notifyEvent(event: MatchEvent): Promise<void> {
    const priority = EVENT_PRIORITY[event.type]

    // Get subscribers for this match
    const matchSubscribers = await this.getMatchSubscribers(event.fixtureId)

    // Get subscribers for teams
    const homeTeamSubscribers = await this.getTeamSubscribers(event.homeTeam)
    const awayTeamSubscribers = await this.getTeamSubscribers(event.awayTeam)

    // Combine and deduplicate
    const allSubscribers = this.mergeSubscribers(
      matchSubscribers,
      homeTeamSubscribers,
      awayTeamSubscribers
    )

    if (!allSubscribers.length) {
      this.logger.debug(`No subscribers for fixture ${event.fixtureId}`)
      return
    }

    // Filter based on notification preferences and priority
    const eligibleSubscribers = allSubscribers.filter((sub) => {
      // Check event type preferences
      if (this.isGoalEvent(event.type) && !sub.notifyGoals) return false
      if (this.isCardEvent(event.type) && !sub.notifyCards) return false
      if (this.isStatusEvent(event.type) && !sub.notifyStatus) return false

      // For low priority events, only notify if explicitly opted in
      if (priority === 'low' && !sub.notifyCards) return false

      return true
    })

    this.logger.log(
      `📨 Sending ${event.type} notification to ${eligibleSubscribers.length} subscribers`
    )

    // Send notifications
    for (const subscriber of eligibleSubscribers) {
      if (!subscriber.fcmToken) continue

      const message = this.formatMessage(event, subscriber.locale)
      await this.sendPushNotification(subscriber.fcmToken, {
        title: this.getNotificationTitle(event, subscriber.locale),
        body: message,
        data: {
          fixtureId: String(event.fixtureId),
          eventType: event.type,
          homeTeam: event.homeTeam,
          awayTeam: event.awayTeam,
          scoreHome: String(event.scoreHome),
          scoreAway: String(event.scoreAway),
        },
      })
    }
  }

  /**
   * Format notification message
   */
  private formatMessage(event: MatchEvent, locale: 'es' | 'en'): string {
    const template = EVENT_TEMPLATES[event.type]?.[locale] || EVENT_TEMPLATES[event.type]?.en

    if (!template) {
      return `${event.type}: ${event.homeTeam} vs ${event.awayTeam}`
    }

    return template
      .replace('{player}', event.player || 'Unknown')
      .replace('{team}', event.teamName)
      .replace('{home}', event.homeTeam)
      .replace('{away}', event.awayTeam)
      .replace('{scoreHome}', String(event.scoreHome))
      .replace('{scoreAway}', String(event.scoreAway))
  }

  /**
   * Get notification title
   */
  private getNotificationTitle(event: MatchEvent, locale: 'es' | 'en'): string {
    const matchTitle = `${event.homeTeam} vs ${event.awayTeam}`

    if (this.isGoalEvent(event.type)) {
      return locale === 'es' ? `⚽ ¡Gol! ${matchTitle}` : `⚽ Goal! ${matchTitle}`
    }
    if (event.type === MatchEventType.RED_CARD) {
      return locale === 'es' ? `🟥 Expulsión - ${matchTitle}` : `🟥 Red Card - ${matchTitle}`
    }
    if (event.type === MatchEventType.MATCH_END) {
      return locale === 'es' ? `🔚 Final - ${matchTitle}` : `🔚 Full Time - ${matchTitle}`
    }

    return matchTitle
  }

  /**
   * Send push notification via FCM (Firebase Admin SDK v1)
   */
  private async sendPushNotification(
    token: string,
    notification: { title: string; body: string; data?: Record<string, string> }
  ): Promise<boolean> {
    if (!this.firebaseInitialized) {
      this.logger.debug('Firebase not initialized, skipping push')
      return false
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'match-events',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }

      const response = await admin.messaging().send(message)
      this.logger.debug(`Push sent successfully: ${response}`)
      return true
    } catch (error) {
      // Handle invalid tokens
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        this.logger.warn(`Invalid FCM token, should be removed: ${token.substring(0, 20)}...`)
      } else {
        this.logger.error(`Failed to send push: ${error.message}`)
      }
      return false
    }
  }

  /**
   * Subscribe to a match
   */
  async subscribeToMatch(subscription: MatchSubscription): Promise<void> {
    const key = `${SUBSCRIPTIONS_KEY}${subscription.fixtureId}`

    // Get existing subscribers
    const existing = (await this.redis.get<MatchSubscription[]>(key)) || []

    // Remove existing subscription for this user
    const filtered = existing.filter((s) => s.oderId !== subscription.oderId)

    // Add new subscription
    filtered.push(subscription)

    await this.redis.set(key, filtered, SUBSCRIPTION_TTL)
    this.logger.log(
      `✅ User ${subscription.oderId} subscribed to fixture ${subscription.fixtureId}`
    )
  }

  /**
   * Unsubscribe from a match
   */
  async unsubscribeFromMatch(oderId: string, fixtureId: number): Promise<void> {
    const key = `${SUBSCRIPTIONS_KEY}${fixtureId}`
    const existing = (await this.redis.get<MatchSubscription[]>(key)) || []
    const filtered = existing.filter((s) => s.oderId !== oderId)
    await this.redis.set(key, filtered, SUBSCRIPTION_TTL)
  }

  /**
   * Subscribe to a team
   */
  async subscribeToTeam(subscription: TeamSubscription): Promise<void> {
    const key = `${TEAM_SUBSCRIPTIONS_KEY}${subscription.teamName.toLowerCase()}`
    const existing = (await this.redis.get<TeamSubscription[]>(key)) || []
    const filtered = existing.filter((s) => s.userId !== subscription.userId)
    filtered.push(subscription)
    await this.redis.set(key, filtered, SUBSCRIPTION_TTL)
  }

  /**
   * Get match subscribers
   */
  private async getMatchSubscribers(fixtureId: number): Promise<MatchSubscription[]> {
    return (await this.redis.get<MatchSubscription[]>(`${SUBSCRIPTIONS_KEY}${fixtureId}`)) || []
  }

  /**
   * Get team subscribers
   */
  private async getTeamSubscribers(teamName: string): Promise<TeamSubscription[]> {
    return (
      (await this.redis.get<TeamSubscription[]>(
        `${TEAM_SUBSCRIPTIONS_KEY}${teamName.toLowerCase()}`
      )) || []
    )
  }

  /**
   * Merge and deduplicate subscribers
   */
  private mergeSubscribers(
    matchSubs: MatchSubscription[],
    homeTeamSubs: TeamSubscription[],
    awayTeamSubs: TeamSubscription[]
  ): Array<{
    oderId: string
    fcmToken?: string
    locale: 'es' | 'en'
    notifyGoals: boolean
    notifyCards: boolean
    notifyStatus: boolean
  }> {
    const map = new Map<string, any>()

    for (const sub of matchSubs) {
      map.set(sub.oderId, {
        oderId: sub.oderId,
        fcmToken: sub.fcmToken,
        locale: sub.locale,
        notifyGoals: sub.notifyGoals,
        notifyCards: sub.notifyCards,
        notifyStatus: sub.notifyStatus,
      })
    }

    for (const sub of [...homeTeamSubs, ...awayTeamSubs]) {
      if (!map.has(sub.userId)) {
        map.set(sub.userId, {
          oderId: sub.userId,
          fcmToken: sub.fcmToken,
          locale: sub.locale,
          notifyGoals: sub.notifyGoals,
          notifyCards: true,
          notifyStatus: true,
        })
      }
    }

    return Array.from(map.values())
  }

  /**
   * Check if event is a goal event
   */
  private isGoalEvent(type: MatchEventType): boolean {
    return [
      MatchEventType.GOAL,
      MatchEventType.OWN_GOAL,
      MatchEventType.PENALTY,
    ].includes(type)
  }

  /**
   * Check if event is a card event
   */
  private isCardEvent(type: MatchEventType): boolean {
    return [MatchEventType.RED_CARD, MatchEventType.YELLOW_CARD].includes(type)
  }

  /**
   * Check if event is a status event
   */
  private isStatusEvent(type: MatchEventType): boolean {
    return [
      MatchEventType.MATCH_START,
      MatchEventType.MATCH_END,
      MatchEventType.HALF_TIME,
      MatchEventType.SECOND_HALF_START,
    ].includes(type)
  }
}
