import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  UserSubscription,
  UserSubscriptionDocument,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../schemas/subscription.schema'

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(UserSubscription.name)
    private subscriptionModel: Model<UserSubscriptionDocument>,
  ) {}

  async getSubscription(userId: string): Promise<UserSubscriptionDocument | null> {
    return this.subscriptionModel.findOne({ userId: new Types.ObjectId(userId) })
  }

  async getOrCreateSubscription(userId: string): Promise<UserSubscriptionDocument> {
    let subscription = await this.getSubscription(userId)

    if (!subscription) {
      subscription = await this.subscriptionModel.create({
        userId: new Types.ObjectId(userId),
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
      })
    }

    return subscription
  }

  async createCheckoutSession(userId: string): Promise<{ url: string }> {
    const subscription = await this.getOrCreateSubscription(userId)

    // Placeholder for Stripe integration
    // In production, this would create a Stripe Checkout Session
    const checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?user=${userId}&plan=pro`

    return { url: checkoutUrl }
  }

  async updateSubscription(
    userId: string,
    plan: SubscriptionPlan,
    stripeCustomerId?: string,
    stripeSubscriptionId?: string,
    currentPeriodEnd?: Date,
  ): Promise<UserSubscriptionDocument> {
    const subscription = await this.getOrCreateSubscription(userId)

    subscription.plan = plan
    subscription.status = SubscriptionStatus.ACTIVE

    if (stripeCustomerId) {
      subscription.stripeCustomerId = stripeCustomerId
    }
    if (stripeSubscriptionId) {
      subscription.stripeSubscriptionId = stripeSubscriptionId
    }
    if (currentPeriodEnd) {
      subscription.currentPeriodEnd = currentPeriodEnd
    }

    await subscription.save()
    return subscription
  }

  async cancelSubscription(userId: string): Promise<UserSubscriptionDocument> {
    const subscription = await this.getSubscription(userId)

    if (!subscription) {
      throw new NotFoundException('Subscription not found')
    }

    subscription.status = SubscriptionStatus.CANCELED
    await subscription.save()

    // In production, this would also cancel the Stripe subscription
    // if (subscription.stripeSubscriptionId) {
    //   await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    // }

    return subscription
  }

  async handleStripeWebhook(event: {
    type: string
    data: { object: Record<string, unknown> }
  }): Promise<void> {
    // Placeholder for Stripe webhook handling
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.client_reference_id as string
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        if (userId) {
          await this.updateSubscription(
            userId,
            SubscriptionPlan.PRO,
            customerId,
            subscriptionId,
          )
        }
        break
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const stripeSubscriptionId = subscription.id as string

        const userSub = await this.subscriptionModel.findOne({
          stripeSubscriptionId,
        })

        if (userSub) {
          const status = subscription.status as string
          if (status === 'active') {
            userSub.status = SubscriptionStatus.ACTIVE
          } else if (status === 'past_due') {
            userSub.status = SubscriptionStatus.PAST_DUE
          } else if (status === 'canceled') {
            userSub.status = SubscriptionStatus.CANCELED
          }

          if (subscription.current_period_end) {
            userSub.currentPeriodEnd = new Date(
              (subscription.current_period_end as number) * 1000,
            )
          }

          await userSub.save()
        }
        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const stripeSubscriptionId = subscription.id as string

        await this.subscriptionModel.findOneAndUpdate(
          { stripeSubscriptionId },
          {
            status: SubscriptionStatus.CANCELED,
            plan: SubscriptionPlan.FREE,
          },
        )
        break
      }
    }
  }
}
