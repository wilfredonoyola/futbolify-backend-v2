import { Resolver, Query, Mutation } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { UserSubscription } from '../schemas/subscription.schema'
import { SubscriptionService } from '../services/subscription.service'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { CurrentUser } from '../../auth/current-user.decorator'
import { User } from '../../users/schemas/user.schema'
import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class CheckoutSessionOutput {
  @Field()
  url: string
}

@Resolver(() => UserSubscription)
export class SubscriptionResolver {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Query(() => UserSubscription, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async mySubscription(@CurrentUser() user: User): Promise<UserSubscription | null> {
    return this.subscriptionService.getSubscription(user.userId)
  }

  @Mutation(() => CheckoutSessionOutput)
  @UseGuards(GqlAuthGuard)
  async createCheckoutSession(
    @CurrentUser() user: User,
  ): Promise<CheckoutSessionOutput> {
    return this.subscriptionService.createCheckoutSession(user.userId)
  }

  @Mutation(() => UserSubscription)
  @UseGuards(GqlAuthGuard)
  async cancelSubscription(
    @CurrentUser() user: User,
  ): Promise<UserSubscription> {
    return this.subscriptionService.cancelSubscription(user.userId)
  }
}
