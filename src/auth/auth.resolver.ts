import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { UseGuards, SetMetadata } from '@nestjs/common';
import { UserRole } from 'src/users/schemas/user.schema';
import { RolesGuard } from './roles.guard';
import {
  ConfirmSignupInputDto,
  ConfirmPasswordInputDto,
  SigninInputDto,
  SignupInputDto,
  SigninOutputDto,
  AddUserInputDto,
} from './dto';
import { UserOutputDto } from 'src/users/dto';
import { CurrentUser } from './current-user.decorator';
import { CurrentUserPayload } from './current-user-payload.interface';
import { GqlAuthGuard } from './gql-auth.guard';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => SigninOutputDto)
  async signin(
    @Args('userInput') userInput: SigninInputDto,
  ): Promise<SigninOutputDto> {
    const login = await this.authService.login(
      userInput.email,
      userInput.password,
    );
    return login;
  }

  @Mutation(() => Boolean)
  async Signup(@Args('userInput') userInput: SignupInputDto): Promise<boolean> {
    try {
      await this.authService.register(userInput.email, userInput.password);
      return true;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  @Mutation(() => SigninOutputDto)
  async ConfirmSignup(
    @Args('confirmInput') confirmInput: ConfirmSignupInputDto,
  ): Promise<SigninOutputDto> {
    const confirm = await this.authService.confirmRegistration(confirmInput);
    return {
      isOnboardingCompleted: confirm.isOnboardingCompleted,
      access_token: confirm.access_token,
      roles: confirm.roles,
    };
  }

  @Mutation(() => Boolean)
  async forgotPassword(@Args('email') email: string): Promise<boolean> {
    return await this.authService.forgotPassword(email);
  }

  @Mutation(() => Boolean)
  async confirmForgotPassword(
    @Args({ name: 'userInput', type: () => ConfirmPasswordInputDto })
    userInput: ConfirmPasswordInputDto,
  ): Promise<boolean> {
    return await this.authService.confirmForgotPassword(
      userInput.email,
      userInput.verificationCode,
      userInput.newPassword,
    );
  }

  @Mutation(() => Boolean)
  async resendVerificationCode(@Args('email') email: string): Promise<boolean> {
    return await this.authService.resendVerificationCode(email);
  }

  @Mutation(() => UserOutputDto)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseGuards(GqlAuthGuard)
  @UseGuards(RolesGuard)
  async addUser(
    @Args({ name: 'userInput', type: () => AddUserInputDto })
    userInput: AddUserInputDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<UserOutputDto> {
    const createdUser = await this.authService.addUser(
      userInput.email,
      userInput.name,
      userInput.password,
      userInput.phone,
      userInput.role,
      user,
    );
    return this.mapUserToDto(createdUser);
  }

  private mapUserToDto(user: any): UserOutputDto {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name, // Asegúrate de incluir el campo name aquí
      phone: user.phone,
      roles: user.roles as UserRole[],
    };
  }
}
