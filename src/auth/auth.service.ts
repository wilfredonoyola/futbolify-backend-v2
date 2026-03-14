import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
  ConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument, UserRole, AuthProvider, LinkedProvider } from 'src/users/schemas/user.schema'
import { ConfirmSignupInputDto, LinkedProviderInfo, LinkAccountResponse } from './dto'
import { CurrentUserPayload } from './current-user-payload.interface'
import axios from 'axios'
import { OAuth2Client } from 'google-auth-library'
import { UpdateProfileInputDto } from './dto/update-profile-input.dto'
import { BunnyStorageService } from '../bunny/bunny-storage.service'
import * as jwt from 'jsonwebtoken'

@Injectable()
export class AuthService {
  private client: CognitoIdentityProviderClient
  private clientId: string
  private googleClient: OAuth2Client

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private bunnyStorage: BunnyStorageService,
  ) {
    this.client = new CognitoIdentityProviderClient({
      region: process.env.AWS_COGNITO_REGION,
      credentials: {
        accessKeyId: process.env.AMZ_ACCESS_KEY_ID,
        secretAccessKey: process.env.AMZ_SECRET_ACCESS_KEY,
      },
    })
    this.clientId = process.env.AWS_COGNITO_CLIENT_ID
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  }
  async deleteUser(email: string): Promise<void> {
    const command = new AdminDeleteUserCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      Username: email,
    })
    await this.client.send(command)
  }
  async login(email: string, password: string): Promise<any> {
    const command = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    })
    const response = await this.client.send(command)

    const idToken = response.AuthenticationResult?.IdToken

    const user = await this.userModel.findOne({ email })

    if (!user) {
      throw new Error('User not found')
    }

    return {
      id: user._id.toString(),
      email: user.email,
      avatarUrl: user.avatarUrl,
      access_token: idToken,
      isOnboardingCompleted: user.isOnboardingCompleted,
      roles: user.roles, // Roles from MongoDB, not Cognito groups
      name: user.name || user.userName,
      userName: user.userName,
    }
  }

  async register(email: string, password: string): Promise<any> {
    // Usamos el email como placeholder para el atributo 'name' requerido por Cognito
    const namePlaceholder = email.split('@')[0]

    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: namePlaceholder },
      ],
    })
    const response = await this.client.send(command)

    return {
      message:
        'Verification code sent to your email. Please confirm to complete registration.',
      userSub: response.UserSub,
    }
  }

  async forgotPassword(email: string): Promise<boolean> {
    const command = new ForgotPasswordCommand({
      ClientId: this.clientId,
      Username: email,
    })

    await this.client.send(command)
    return true
  }

  async confirmForgotPassword(
    email: string,
    verificationCode: string,
    newPassword: string
  ): Promise<boolean> {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: this.clientId,
      Username: email,
      ConfirmationCode: verificationCode,
      Password: newPassword,
    })

    await this.client.send(command)
    return true
  }

  async resendVerificationCode(email: string): Promise<boolean> {
    const command = new ResendConfirmationCodeCommand({
      ClientId: this.clientId,
      Username: email,
    })

    await this.client.send(command)
    return true
  }

  async confirmRegistration(input: ConfirmSignupInputDto): Promise<any> {
    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: input.email,
      ConfirmationCode: input.verificationCode,
    })
    await this.client.send(confirmCommand)

    const createdUser = new this.userModel({
      ...input,
      isOnboardingCompleted: false,
      roles: [UserRole.USER],
    })

    await createdUser.save()

    const loginCommand = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: input.email,
        PASSWORD: input.password,
      },
    })
    const response = await this.client.send(loginCommand)

    const idToken = response.AuthenticationResult?.IdToken

    return {
      id: createdUser._id.toString(),
      email: createdUser.email,
      isOnboardingCompleted: false,
      access_token: idToken,
      roles: createdUser.roles,
      name: createdUser.name || createdUser.userName,
      userName: createdUser.userName,
      avatarUrl: createdUser.avatarUrl || '',
    }
  }

  async addUser(
    email: string,
    name: string,
    password: string,
    phone: number,
    role: UserRole,
    user: CurrentUserPayload
  ): Promise<any> {
    const command = new AdminCreateUserCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    })
    await this.client.send(command)

    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    })
    await this.client.send(setPasswordCommand)

    // Los roles se manejan únicamente en la base de datos local
    const createdUser = new this.userModel({
      email,
      phone,
      name,
      roles: [role],
    })
    await createdUser.save()

    return createdUser
  }
  async validateGoogleToken(token: string): Promise<any> {
    try {
      let email: string | undefined
      let name: string = ''
      let userName: string = 'UsuarioGoogle'
      let googleAvatarUrl: string = ''
      let googleId: string | undefined

      // First, try to verify as id_token
      try {
        const ticket = await this.googleClient.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
        })
        const payload = ticket.getPayload()
        email = payload?.email
        name = payload?.name || ''
        userName = payload?.name || 'UsuarioGoogle'
        googleAvatarUrl = payload?.picture || ''
        googleId = payload?.sub
      } catch (idTokenError) {
        // If id_token verification fails, try as access_token
        console.log('ID token verification failed, trying as access_token...')
        try {
          const response = await axios.get(
            `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`
          )
          const userInfo = response.data
          email = userInfo.email
          name = userInfo.name || ''
          userName = userInfo.name || 'UsuarioGoogle'
          googleAvatarUrl = userInfo.picture || ''
          googleId = userInfo.sub
        } catch (accessTokenError) {
          console.error('Access token verification also failed:', accessTokenError)
          throw new HttpException(
            'Invalid Google token',
            HttpStatus.UNAUTHORIZED
          )
        }
      }

      if (!email || !googleId) {
        throw new HttpException(
          'Google token does not contain valid email or ID',
          HttpStatus.UNAUTHORIZED
        )
      }

      userName = userName.replace(/\s+/g, '_').toLowerCase()

      // Check if user already exists in our DB
      let user = await this.userModel.findOne({ email })

      if (user) {
        // User EXISTS - check if Google is already linked
        const hasGoogleLinked = user.googleId === googleId ||
          user.linkedProviders?.some(lp => lp.provider === AuthProvider.GOOGLE && lp.providerId === googleId)

        if (!hasGoogleLinked) {
          // AUTO-LINK: User registered with email/password, now logging in with Google
          const linkedProvider: LinkedProvider = {
            provider: AuthProvider.GOOGLE,
            providerId: googleId,
            email: email,
            linkedAt: new Date(),
          }

          user.googleId = googleId
          user.linkedProviders = [...(user.linkedProviders || []), linkedProvider]

          // Upload Google avatar to Bunny if user doesn't have one
          if (!user.avatarUrl && googleAvatarUrl) {
            const bunnyAvatarUrl = await this.uploadGoogleAvatarToBunny(googleAvatarUrl, user._id.toString())
            user.avatarUrl = bunnyAvatarUrl || googleAvatarUrl
          }

          // Update name from Google if user doesn't have one
          if (!user.name && name) {
            user.name = name
          }

          // Mark profile as completed since user already has an account
          // and Google provides all necessary info
          user.isProfileCompleted = true

          await user.save()
        }

        // For existing users, always return isProfileCompleted: true
        // since they already have an account (linking doesn't require new profile)
        return {
          id: user._id.toString(),
          email: user.email,
          userName: user.userName,
          name: user.name || name,
          avatarUrl: user.avatarUrl || googleAvatarUrl,
          isProfileCompleted: true,
          roles: user.roles || [UserRole.USER],
        }
      }

      // User does NOT exist - create new user with Google as primary
      // Check if username already exists
      const existingUserName = await this.userModel.findOne({ userName })
      if (existingUserName) {
        userName = `${userName}_${Math.floor(Math.random() * 10000)}`
      }

      // Generate a temporary user ID for avatar upload
      const tempUserId = new Date().getTime().toString()

      // Upload Google avatar to Bunny CDN
      let avatarUrl = googleAvatarUrl
      if (googleAvatarUrl) {
        const bunnyAvatarUrl = await this.uploadGoogleAvatarToBunny(googleAvatarUrl, tempUserId)
        if (bunnyAvatarUrl) {
          avatarUrl = bunnyAvatarUrl
        }
      }

      // Create user in MongoDB with Google as primary provider
      const linkedProvider: LinkedProvider = {
        provider: AuthProvider.GOOGLE,
        providerId: googleId,
        email: email,
        linkedAt: new Date(),
      }

      user = new this.userModel({
        email,
        userName,
        name,
        avatarUrl,
        googleId,
        authProvider: AuthProvider.GOOGLE,
        primaryProvider: AuthProvider.GOOGLE,
        linkedProviders: [linkedProvider],
        isProfileCompleted: true, // Auto-complete profile for Google users
        roles: [UserRole.USER],
      })

      await user.save()

      return {
        id: user._id.toString(),
        email,
        userName,
        name,
        avatarUrl,
        isProfileCompleted: true, // Skip complete-profile screen
        roles: user.roles || [UserRole.USER],
      }
    } catch (error) {
      console.error('Google validation error:', error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        'Invalid token or error processing user',
        HttpStatus.UNAUTHORIZED
      )
    }
  }

  /**
   * Generate a JWT token for Google-authenticated users
   */
  generateGoogleUserToken(user: { id: string; email: string; roles: UserRole[] }): string {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      iss: 'futbolify-google-auth',
    }

    return jwt.sign(payload, process.env.JWT_SECRET || 'futbolify-secret-key', {
      expiresIn: '7d',
    })
  }

  /**
   * Downloads Google profile picture and uploads to Bunny CDN
   */
  private async uploadGoogleAvatarToBunny(googleAvatarUrl: string, userId: string): Promise<string | null> {
    try {
      // Download image from Google
      const response = await axios.get(googleAvatarUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      })

      const buffer = Buffer.from(response.data)

      // Upload to Bunny Storage
      const result = await this.bunnyStorage.uploadAvatar(buffer, 'avatar.jpg', userId)

      console.log(`[Auth] Uploaded Google avatar to Bunny: ${result.cdnUrl}`)
      return result.cdnUrl
    } catch (error) {
      console.error('[Auth] Failed to upload Google avatar to Bunny:', error.message)
      // Return null to fall back to Google URL
      return null
    }
  }

  async completeProfile(
    email: string,
    updateData: UpdateProfileInputDto
  ): Promise<boolean> {
    try {
      const user = await this.userModel.findOne({ email })
      if (!user) {
        throw new HttpException('User not found.', HttpStatus.NOT_FOUND)
      }
      user.userName = updateData.userName
      user.birthday = updateData.birthday
      user.phone = updateData.phone || null
      user.isProfileCompleted = true

      await user.save()

      return true
    } catch (error) {
      throw new HttpException(
        'Error completing profile.',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Link a Google account to an existing user
   * This allows users who registered with email/password to also login with Google
   */
  async linkGoogleAccount(userId: string, idToken: string): Promise<LinkAccountResponse> {
    try {
      // 1. Verify Google token
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      const googlePayload = ticket.getPayload()
      const googleEmail = googlePayload?.email
      const googleId = googlePayload?.sub

      if (!googleEmail || !googleId) {
        throw new HttpException('Invalid Google token', HttpStatus.BAD_REQUEST)
      }

      // 2. Get the current user
      const user = await this.userModel.findById(userId)
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND)
      }

      // 3. Check if this Google account is already linked to another user
      const existingUserWithGoogle = await this.userModel.findOne({ googleId })
      if (existingUserWithGoogle && existingUserWithGoogle._id.toString() !== userId) {
        throw new HttpException(
          'This Google account is already linked to another user',
          HttpStatus.CONFLICT
        )
      }

      // 4. Check if user already has Google linked
      const alreadyLinked = user.linkedProviders?.some(
        (lp) => lp.provider === AuthProvider.GOOGLE
      )
      if (alreadyLinked) {
        throw new HttpException(
          'Google account is already linked',
          HttpStatus.CONFLICT
        )
      }

      // 5. Update user in MongoDB (Cognito linking not used - Google auth is direct)
      const linkedProvider: LinkedProvider = {
        provider: AuthProvider.GOOGLE,
        providerId: googleId,
        email: googleEmail,
        linkedAt: new Date(),
      }

      user.googleId = googleId
      user.linkedProviders = [...(user.linkedProviders || []), linkedProvider]
      await user.save()

      return {
        success: true,
        message: 'Google account linked successfully',
        linkedProviders: this.mapLinkedProviders(user),
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new HttpException(
        'Failed to link Google account',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Unlink a provider from user account
   */
  async unlinkProvider(userId: string, provider: string): Promise<boolean> {
    try {
      const user = await this.userModel.findById(userId)
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND)
      }

      // Check that user has at least 2 providers (can't unlink the only one)
      const totalProviders = (user.linkedProviders?.length || 0) + 1 // +1 for primary
      if (totalProviders <= 1) {
        throw new HttpException(
          'Cannot unlink the only login method',
          HttpStatus.BAD_REQUEST
        )
      }

      // Can't unlink primary provider
      if (user.primaryProvider === provider) {
        throw new HttpException(
          'Cannot unlink primary login method',
          HttpStatus.BAD_REQUEST
        )
      }

      // Find and remove the provider
      const providerIndex = user.linkedProviders?.findIndex(
        (lp) => lp.provider === provider
      )
      if (providerIndex === -1 || providerIndex === undefined) {
        throw new HttpException('Provider not found', HttpStatus.NOT_FOUND)
      }

      // Update MongoDB (Cognito unlinking not used - Google auth is direct)
      user.linkedProviders.splice(providerIndex, 1)
      if (provider === AuthProvider.GOOGLE) {
        user.googleId = undefined
      }
      await user.save()

      return true
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new HttpException(
        'Failed to unlink provider',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Get all linked providers for a user
   */
  async getLinkedProviders(userId: string): Promise<LinkedProviderInfo[]> {
    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND)
    }
    return this.mapLinkedProviders(user)
  }

  /**
   * Helper to map user's linked providers to response format
   */
  private mapLinkedProviders(user: UserDocument): LinkedProviderInfo[] {
    const providers: LinkedProviderInfo[] = []

    // Add primary provider (email/cognito)
    if (user.email) {
      providers.push({
        provider: AuthProvider.COGNITO,
        email: user.email,
        linkedAt: new Date(user.createdAt * 1000),
        isPrimary: user.primaryProvider === AuthProvider.COGNITO,
      })
    }

    // Add linked providers
    if (user.linkedProviders) {
      for (const lp of user.linkedProviders) {
        providers.push({
          provider: lp.provider,
          email: lp.email || user.email || '',
          linkedAt: lp.linkedAt,
          isPrimary: user.primaryProvider === lp.provider,
        })
      }
    }

    return providers
  }
}
