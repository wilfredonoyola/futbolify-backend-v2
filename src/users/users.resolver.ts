import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from './schemas/user.schema';
import { UseGuards, SetMetadata } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { UserOutputDto } from './dto';
import { UpdateUserInput } from './dto/update-user.input';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';
import { GqlAuthGuard } from 'src/auth/gql-auth.guard';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

@Resolver(() => UserOutputDto)
export class UsersResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}
  @Query(() => UserOutputDto, { nullable: true })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async user(
    @Args('email') email: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<UserOutputDto | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }
    return this.mapUserToDto(user);
  }
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Query(() => [UserOutputDto])
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async users(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<UserOutputDto[]> {
    if (!user) {
      throw new Error('User is not defined');
    }

    try {
      const users = await this.usersService.findAll(user);
      return users.map((user) => this.mapUserToDto(user));
    } catch (error) {
      // Manejo de errores
      throw new Error(`Error retrieving users: ${error.message}`);
    }
  }

  @Mutation(() => UserOutputDto)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async updateUser(
    @Args('id') id: string,
    @Args('updateUserInput') updateUserInput: UpdateUserInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<UserOutputDto> {
    const updatedUser = await this.usersService.update(
      id,
      updateUserInput,
      user,
    );
    return this.mapUserToDto(updatedUser);
  }

  @Mutation(() => Boolean)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async removeUser(
    @Args('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    await this.usersService.remove(id, user);
    return true;
  }

  private mapUserToDto(user: any): UserOutputDto {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      phone: user?.phone,
      roles: user.roles.map((role: string) => this.mapRoleToEnum(role)),
    };
  }

  private mapRoleToEnum(role: string): UserRole {
    switch (role) {
      case 'ADMIN':
        return UserRole.ADMIN;
      case 'SUPER_ADMIN':
        return UserRole.SUPER_ADMIN;
      case 'USER':
      default:
        return UserRole.USER;
    }
  }
}
