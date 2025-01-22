import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { ServiceService } from './service.service';
import { CreateServiceInput, ServiceOutput, UpdateServiceInput } from './dto';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from 'src/auth/gql-auth.guard';

@Resolver(() => ServiceOutput)
export class ServiceResolver {
  constructor(private readonly serviceService: ServiceService) {}

  @Mutation(() => ServiceOutput)
  @UseGuards(GqlAuthGuard)
  createService(
    @CurrentUser() user: CurrentUserPayload,
    @Args('createServiceInput') createServiceInput: CreateServiceInput,
  ) {
    return this.serviceService.create(createServiceInput, user);
  }

  @Query(() => [ServiceOutput], { name: 'services' })
  @UseGuards(GqlAuthGuard)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.serviceService.findAll(user);
  }

  @Query(() => ServiceOutput, { name: 'service' })
  @UseGuards(GqlAuthGuard)
  findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Args('serviceId') serviceId: string,
  ) {
    return this.serviceService.findOne(serviceId, user);
  }

  @Mutation(() => ServiceOutput)
  @UseGuards(GqlAuthGuard)
  updateService(
    @CurrentUser() user: CurrentUserPayload,
    @Args('serviceId') serviceId: string,
    @Args('updateServiceInput') updateServiceInput: UpdateServiceInput,
  ) {
    return this.serviceService.update(serviceId, updateServiceInput, user);
  }

  @Mutation(() => ServiceOutput)
  @UseGuards(GqlAuthGuard)
  removeService(
    @CurrentUser() user: CurrentUserPayload,
    @Args('serviceId') serviceId: string,
  ) {
    return this.serviceService.remove(serviceId, user);
  }
}
