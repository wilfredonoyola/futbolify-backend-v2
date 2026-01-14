import { Resolver, Query, Mutation, Args, Int, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Notification } from './schemas/notification.schema';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/schemas/user.schema';

@Resolver(() => Notification)
export class NotificationsResolver {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get all notifications for the current user
   */
  @Query(() => [Notification], { name: 'notifications' })
  @UseGuards(JwtAuthGuard)
  async getNotifications(
    @CurrentUser() user: User,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ): Promise<Notification[]> {
    return this.notificationsService.getUserNotifications(user._id.toString(), limit);
  }

  /**
   * Get unread notification count
   */
  @Query(() => Int, { name: 'unreadNotificationCount' })
  @UseGuards(JwtAuthGuard)
  async getUnreadCount(@CurrentUser() user: User): Promise<number> {
    return this.notificationsService.getUnreadCount(user._id.toString());
  }

  /**
   * Mark a single notification as read
   */
  @Mutation(() => Notification, { nullable: true })
  @UseGuards(JwtAuthGuard)
  async markNotificationAsRead(
    @CurrentUser() user: User,
    @Args('notificationId', { type: () => ID }) notificationId: string,
  ): Promise<Notification | null> {
    return this.notificationsService.markAsRead(notificationId, user._id.toString());
  }

  /**
   * Mark all notifications as read
   */
  @Mutation(() => Int)
  @UseGuards(JwtAuthGuard)
  async markAllNotificationsAsRead(@CurrentUser() user: User): Promise<number> {
    return this.notificationsService.markAllAsRead(user._id.toString());
  }
}
