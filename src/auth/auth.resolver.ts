import { Resolver, Mutation, Args, Query } from '@nestjs/graphql'
import { AuthService } from './auth.service'
import {
  UseGuards,
  SetMetadata,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { UserRole } from 'src/users/schemas/user.schema'
import { RolesGuard } from './roles.guard'
import {
  ConfirmSignupInputDto,
  ConfirmPasswordInputDto,
  SigninInputDto,
  SignupInputDto,
  SigninOutputDto,
  AddUserInputDto,
  LinkedProviderInfo,
  LinkAccountResponse,
  AddPasswordToAccountInput,
  CheckEmailResponse,
} from './dto'
import { UserOutputDto } from 'src/users/dto'
import { CurrentUser } from './current-user.decorator'
import { CurrentUserPayload } from './current-user-payload.interface'
import { GqlAuthGuard } from './gql-auth.guard'
import { GoogleSigninResponse } from './dto/google-signin-response-output'
import { UpdateProfileInputDto } from './dto/update-profile-input.dto'

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles)

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => SigninOutputDto)
  async signin(
    @Args('userInput') userInput: SigninInputDto
  ): Promise<SigninOutputDto> {
    const login = await this.authService.login(
      userInput.email,
      userInput.password
    )
    return login
  }

  @Mutation(() => Boolean)
  async Signup(@Args('userInput') userInput: SignupInputDto): Promise<boolean> {
    try {
      await this.authService.register(userInput.email, userInput.password)
      return true
    } catch (error) {
      throw new Error(error.message)
    }
  }

  @Mutation(() => SigninOutputDto)
  async ConfirmSignup(
    @Args('confirmInput') confirmInput: ConfirmSignupInputDto
  ): Promise<SigninOutputDto> {
    const confirm = await this.authService.confirmRegistration(confirmInput)
    return {
      id: confirm.id,
      isOnboardingCompleted: confirm.isOnboardingCompleted,
      access_token: confirm.access_token,
      avatarUrl: confirm.avatarUrl,
      name: confirm.name,
      userName: confirm.userName,
      roles: confirm.roles,
    }
  }

  @Mutation(() => Boolean)
  async forgotPassword(@Args('email') email: string): Promise<boolean> {
    return await this.authService.forgotPassword(email)
  }

  @Mutation(() => Boolean)
  async confirmForgotPassword(
    @Args({ name: 'userInput', type: () => ConfirmPasswordInputDto })
    userInput: ConfirmPasswordInputDto
  ): Promise<boolean> {
    return await this.authService.confirmForgotPassword(
      userInput.email,
      userInput.verificationCode,
      userInput.newPassword
    )
  }

  @Mutation(() => Boolean)
  async resendVerificationCode(@Args('email') email: string): Promise<boolean> {
    return await this.authService.resendVerificationCode(email)
  }

  @Mutation(() => UserOutputDto)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseGuards(GqlAuthGuard)
  @UseGuards(RolesGuard)
  async addUser(
    @Args({ name: 'userInput', type: () => AddUserInputDto })
    userInput: AddUserInputDto,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<UserOutputDto> {
    const createdUser = await this.authService.addUser(
      userInput.email,
      userInput.name,
      userInput.password,
      userInput.phone,
      userInput.role,
      user
    )
    return this.mapUserToDto(createdUser)
  }

  private mapUserToDto(user: any): UserOutputDto {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      phone: user.phone,
      roles: user.roles as UserRole[],
    }
  }
  @Mutation(() => GoogleSigninResponse)
  async googleSignin(
    @Args('idToken') idToken: string,
    @Args('picture', { nullable: true }) picture?: string
  ): Promise<GoogleSigninResponse> {
    try {
      const verifiedUser = await this.authService.validateGoogleToken(idToken, picture)

      // Generate JWT token for Google user
      const accessToken = this.authService.generateGoogleUserToken({
        id: verifiedUser.id,
        email: verifiedUser.email,
        roles: verifiedUser.roles,
      })

      return {
        id: verifiedUser.id,
        email: verifiedUser.email,
        userName: verifiedUser.userName,
        name: verifiedUser.name,
        avatarUrl: verifiedUser.avatarUrl,
        isProfileCompleted: verifiedUser.isProfileCompleted,
        access_token: accessToken,
        roles: verifiedUser.roles,
      }
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.UNAUTHORIZED)
    }
  }

  @Mutation(() => GoogleSigninResponse)
  async appleSignin(
    @Args('idToken') idToken: string
  ): Promise<GoogleSigninResponse> {
    try {
      const verifiedUser = await this.authService.validateAppleToken(idToken)

      // Generate JWT token for Apple user
      const accessToken = this.authService.generateAppleUserToken({
        id: verifiedUser.id,
        email: verifiedUser.email,
        roles: verifiedUser.roles,
      })

      return {
        id: verifiedUser.id,
        email: verifiedUser.email,
        userName: verifiedUser.userName,
        name: verifiedUser.name,
        avatarUrl: verifiedUser.avatarUrl,
        isProfileCompleted: verifiedUser.isProfileCompleted,
        access_token: accessToken,
        roles: verifiedUser.roles,
      }
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.UNAUTHORIZED)
    }
  }

  @Mutation(() => Boolean)
  async completeProfile(
    @Args('updateProfileInput') updateProfileInput: UpdateProfileInputDto
  ): Promise<boolean> {
    try {
      const verifiedUser = await this.authService.validateGoogleToken(
        updateProfileInput.idToken
      )

      if (!verifiedUser || !verifiedUser.email) {
        throw new HttpException(
          'User not authenticated.',
          HttpStatus.UNAUTHORIZED
        )
      }

      return await this.authService.completeProfile(
        verifiedUser.email,
        updateProfileInput
      )
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.UNAUTHORIZED)
    }
  }

  // ============ ACCOUNT LINKING ============

  /**
   * Link a Google account to an existing user
   * User must be authenticated
   */
  @Mutation(() => LinkAccountResponse)
  @UseGuards(GqlAuthGuard)
  async linkGoogleAccount(
    @Args('idToken') idToken: string,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<LinkAccountResponse> {
    return await this.authService.linkGoogleAccount(user.userId, idToken)
  }

  /**
   * Unlink a provider from user account
   * Cannot unlink the primary provider or the only login method
   */
  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async unlinkProvider(
    @Args('provider') provider: string,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<boolean> {
    return await this.authService.unlinkProvider(user.userId, provider)
  }

  /**
   * Get all linked providers for the current user
   */
  @Query(() => [LinkedProviderInfo])
  @UseGuards(GqlAuthGuard)
  async getLinkedProviders(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<LinkedProviderInfo[]> {
    return await this.authService.getLinkedProviders(user.userId)
  }

  // ============ PASSWORD ADDITION FOR GOOGLE USERS ============

  /**
   * Check if an email exists and what providers are associated
   * This helps the frontend decide whether to show signup, signin, or "add password" flow
   * No authentication required - used during signup/signin flow
   */
  @Query(() => CheckEmailResponse)
  async checkEmailExists(
    @Args('email') email: string
  ): Promise<CheckEmailResponse> {
    return await this.authService.checkEmailExists(email)
  }

  /**
   * Add a password to a Google-only account
   * This allows users who registered with Google to also login with email/password
   * Requires a valid Google token to verify ownership
   */
  @Mutation(() => LinkAccountResponse)
  async addPasswordToAccount(
    @Args('input') input: AddPasswordToAccountInput
  ): Promise<LinkAccountResponse> {
    return await this.authService.addPasswordToGoogleAccount(input)
  }
}
