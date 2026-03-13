import { Resolver, Query, Mutation, Subscription, Args, ID, Int, Context, ObjectType, Field } from '@nestjs/graphql'
import { UseGuards, Inject } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'

import { GqlAuthGuard } from '../auth/gql-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { SmartNotification } from './schemas/smart-notification.schema'
import {
  NotificationPreferences,
  UpdateNotificationPreferencesInput,
} from './schemas/notification-preferences.schema'
import { NotificationDispatcherService, NOTIFICATION_EVENTS } from './notification-dispatcher.service'
import { SmartNotificationJobs } from './jobs/smart-notification.jobs'

// Result type for match processing
@ObjectType()
export class ProcessMatchResultOutput {
  @Field(() => Int)
  processed: number

  @Field(() => Int)
  notifications: number

  @Field()
  success: boolean

  @Field({ nullable: true })
  error?: string
}

@Resolver(() => SmartNotification)
export class SmartNotificationsResolver {
  constructor(
    private readonly dispatcherService: NotificationDispatcherService,
    private readonly notificationJobs: SmartNotificationJobs,

    @Inject('PUB_SUB')
    private pubSub: PubSub,
  ) {}

  // ============================================
  // QUERIES
  // ============================================

  /**
   * Get user's smart notifications
   */
  @Query(() => [SmartNotification], { name: 'smartNotifications' })
  @UseGuards(GqlAuthGuard)
  async getSmartNotifications(
    @CurrentUser() user: { userId: string },
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ): Promise<SmartNotification[]> {
    return this.dispatcherService.getUserNotifications(user.userId, limit)
  }

  /**
   * Get unread notification count
   */
  @Query(() => Int, { name: 'smartUnreadCount' })
  @UseGuards(GqlAuthGuard)
  async getSmartUnreadCount(
    @CurrentUser() user: { userId: string },
  ): Promise<number> {
    return this.dispatcherService.getUnreadCount(user.userId)
  }

  /**
   * Get user's notification preferences
   */
  @Query(() => NotificationPreferences, { name: 'notificationPreferences' })
  @UseGuards(GqlAuthGuard)
  async getNotificationPreferences(
    @CurrentUser() user: { userId: string },
  ): Promise<NotificationPreferences> {
    return this.dispatcherService.getOrCreatePreferences(user.userId)
  }

  // ============================================
  // MUTATIONS
  // ============================================

  /**
   * Mark a notification as read
   */
  @Mutation(() => SmartNotification, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async markSmartNotificationAsRead(
    @CurrentUser() user: { userId: string },
    @Args('notificationId', { type: () => ID }) notificationId: string,
  ): Promise<SmartNotification | null> {
    return this.dispatcherService.markAsRead(notificationId, user.userId)
  }

  /**
   * Mark all notifications as read
   */
  @Mutation(() => Int)
  @UseGuards(GqlAuthGuard)
  async markAllSmartNotificationsAsRead(
    @CurrentUser() user: { userId: string },
  ): Promise<number> {
    return this.dispatcherService.markAllAsRead(user.userId)
  }

  /**
   * Update notification preferences
   */
  @Mutation(() => NotificationPreferences)
  @UseGuards(GqlAuthGuard)
  async updateNotificationPreferences(
    @CurrentUser() user: { userId: string },
    @Args('input') input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferences> {
    return this.dispatcherService.updatePreferences(user.userId, input as any)
  }

  /**
   * Add favorite team (for extra notifications)
   */
  @Mutation(() => NotificationPreferences)
  @UseGuards(GqlAuthGuard)
  async addFavoriteTeam(
    @CurrentUser() user: { userId: string },
    @Args('teamCode') teamCode: string,
  ): Promise<NotificationPreferences> {
    const prefs = await this.dispatcherService.getOrCreatePreferences(user.userId)
    const favorites = new Set(prefs.favoriteTeams || [])
    favorites.add(teamCode.toUpperCase())
    return this.dispatcherService.updatePreferences(user.userId, {
      favoriteTeams: Array.from(favorites),
    })
  }

  /**
   * Remove favorite team
   */
  @Mutation(() => NotificationPreferences)
  @UseGuards(GqlAuthGuard)
  async removeFavoriteTeam(
    @CurrentUser() user: { userId: string },
    @Args('teamCode') teamCode: string,
  ): Promise<NotificationPreferences> {
    const prefs = await this.dispatcherService.getOrCreatePreferences(user.userId)
    const favorites = new Set(prefs.favoriteTeams || [])
    favorites.delete(teamCode.toUpperCase())
    return this.dispatcherService.updatePreferences(user.userId, {
      favoriteTeams: Array.from(favorites),
    })
  }

  /**
   * Process match result (Admin only)
   *
   * Call this when a match finishes to:
   * - Update points for all quiniela members
   * - Recalculate rankings
   * - Send post-match notifications
   * - Send ranking change notifications
   */
  @Mutation(() => ProcessMatchResultOutput)
  @UseGuards(GqlAuthGuard)
  async processMatchResult(
    @Args('matchId') matchId: string,
    @Args('homeScore', { type: () => Int }) homeScore: number,
    @Args('awayScore', { type: () => Int }) awayScore: number,
  ): Promise<ProcessMatchResultOutput> {
    try {
      const result = await this.notificationJobs.processMatchResult(
        matchId,
        homeScore,
        awayScore,
      )
      return {
        ...result,
        success: true,
      }
    } catch (error) {
      return {
        processed: 0,
        notifications: 0,
        success: false,
        error: error.message,
      }
    }
  }

  // ============================================
  // SUBSCRIPTIONS
  // ============================================

  /**
   * Real-time notification subscription
   *
   * Clients subscribe to this to receive notifications instantly.
   * Filter ensures user only receives their own notifications.
   */
  @Subscription(() => SmartNotification, {
    name: 'notificationReceived',
    filter: (payload, variables, context) => {
      // Only send to the notification's recipient
      const notification = payload.notificationReceived
      const userId = context.req?.headers?.authorization
        ? context.userId // Set by subscription context
        : null

      return notification.userId.toString() === userId
    },
  })
  subscribeToNotifications(): AsyncIterator<SmartNotification> {
    return this.pubSub.asyncIterator(NOTIFICATION_EVENTS.NOTIFICATION_RECEIVED)
  }
}
