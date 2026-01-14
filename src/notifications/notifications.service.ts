import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument, NotificationType } from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  imageUrl?: string;
  actionUrl?: string;
  actorId?: string;
  mediaId?: string;
  teamId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Create a new notification
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = new this.notificationModel({
      userId: new Types.ObjectId(input.userId),
      type: input.type,
      title: input.title,
      message: input.message,
      imageUrl: input.imageUrl,
      actionUrl: input.actionUrl,
      actorId: input.actorId ? new Types.ObjectId(input.actorId) : undefined,
      mediaId: input.mediaId ? new Types.ObjectId(input.mediaId) : undefined,
      teamId: input.teamId ? new Types.ObjectId(input.teamId) : undefined,
      isRead: false,
      emailSent: false,
    });

    const saved = await notification.save();

    // Send email notification asynchronously (don't block)
    this.sendEmailNotification(saved).catch(err => {
      console.error('Failed to send email notification:', err);
    });

    return saved;
  }

  /**
   * Get all notifications for a user
   */
  async getUserNotifications(userId: string, limit = 50): Promise<Notification[]> {
    return this.notificationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Get unread notifications count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification | null> {
    return this.notificationModel.findOneAndUpdate(
      { 
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      { isRead: true },
      { new: true },
    );
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationModel.updateMany(
      { 
        userId: new Types.ObjectId(userId),
        isRead: false,
      },
      { isRead: true },
    );
    return result.modifiedCount;
  }

  /**
   * Delete old notifications (cleanup job)
   */
  async deleteOldNotifications(daysOld = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.notificationModel.deleteMany({
      createdAt: { $lt: cutoffDate },
      isRead: true,
    });
    return result.deletedCount;
  }

  // ============================================
  // NOTIFICATION CREATORS (called from other services)
  // ============================================

  /**
   * Create notification when someone is tagged in media
   */
  async notifyUserTagged(
    taggedUserId: string,
    taggerId: string,
    taggerName: string,
    mediaId: string,
    mediaType: 'video' | 'photo',
    thumbnailUrl?: string,
    teamName?: string,
  ): Promise<Notification> {
    // Don't notify if user tags themselves
    if (taggedUserId === taggerId) {
      return null;
    }

    const mediaTypeText = mediaType === 'video' ? 'un video' : 'una foto';
    
    return this.create({
      userId: taggedUserId,
      type: NotificationType.TAG,
      title: '¡Te etiquetaron! 🏷️',
      message: `${taggerName} te etiquetó en ${mediaTypeText}${teamName ? ` de ${teamName}` : ''}`,
      imageUrl: thumbnailUrl,
      actionUrl: `/media/${mediaId}`,
      actorId: taggerId,
      mediaId: mediaId,
    });
  }

  /**
   * Create notification when someone joins a team
   */
  async notifyTeamJoin(
    teamAdminIds: string[],
    newMemberId: string,
    newMemberName: string,
    teamId: string,
    teamName: string,
  ): Promise<void> {
    const promises = teamAdminIds
      .filter(adminId => adminId !== newMemberId) // Don't notify the person who joined
      .map(adminId => 
        this.create({
          userId: adminId,
          type: NotificationType.TEAM_JOIN,
          title: 'Nuevo miembro 👋',
          message: `${newMemberName} se unió a ${teamName}`,
          actionUrl: `/equipo/${teamId}`,
          actorId: newMemberId,
          teamId: teamId,
        })
      );

    await Promise.all(promises);
  }

  /**
   * Create notification when an invite is accepted
   */
  async notifyInviteAccepted(
    inviterId: string,
    acceptedUserId: string,
    acceptedUserName: string,
    mediaId: string,
    thumbnailUrl?: string,
  ): Promise<Notification> {
    return this.create({
      userId: inviterId,
      type: NotificationType.INVITE_ACCEPTED,
      title: '¡Invitación aceptada! 🎉',
      message: `${acceptedUserName} aceptó tu invitación y ya puede ver el video`,
      imageUrl: thumbnailUrl,
      actionUrl: `/media/${mediaId}`,
      actorId: acceptedUserId,
      mediaId: mediaId,
    });
  }

  // ============================================
  // EMAIL NOTIFICATIONS
  // ============================================

  /**
   * Send email notification (implement with your email provider)
   */
  private async sendEmailNotification(notification: Notification): Promise<void> {
    try {
      // Get user email
      const user = await this.userModel.findById(notification.userId);
      if (!user || !user.email) {
        return;
      }

      // TODO: Implement with Resend, SendGrid, or AWS SES
      // For now, just log
      console.log(`📧 Would send email to ${user.email}:`, {
        subject: notification.title,
        body: notification.message,
      });

      // Mark as email sent
      await this.notificationModel.findByIdAndUpdate(notification._id, {
        emailSent: true,
      });

      // Example with Resend (uncomment when ready):
      /*
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      await resend.emails.send({
        from: 'Futbolify <noreply@futbolify.com>',
        to: user.email,
        subject: notification.title,
        html: this.generateEmailHtml(notification),
      });
      */
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  /**
   * Generate HTML email template
   */
  private generateEmailHtml(notification: Notification): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            ${notification.imageUrl ? `
              <div style="width: 100%; height: 200px; overflow: hidden;">
                <img src="${notification.imageUrl}" alt="" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
            ` : ''}
            <div style="padding: 24px;">
              <h1 style="margin: 0 0 8px; font-size: 20px; color: #1a1a1a;">
                ${notification.title}
              </h1>
              <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.5;">
                ${notification.message}
              </p>
              ${notification.actionUrl ? `
                <a href="${process.env.FRONTEND_URL}${notification.actionUrl}" 
                   style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
                  Ver ahora
                </a>
              ` : ''}
            </div>
            <div style="padding: 16px 24px; background: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                Recibiste este email porque tienes una cuenta en Futbolify.
                <a href="${process.env.FRONTEND_URL}/settings/notifications" style="color: #666;">
                  Gestionar notificaciones
                </a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
