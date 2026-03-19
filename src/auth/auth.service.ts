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
  AdminLinkProviderForUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument, UserRole, AuthProvider, LinkedProvider } from 'src/users/schemas/user.schema'
import { ConfirmSignupInputDto, LinkedProviderInfo, LinkAccountResponse, AddPasswordToAccountInput, CheckEmailResponse } from './dto'
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

    // Case-insensitive email lookup
    const user = await this.userModel.findOne({
      email: { $regex: new RegExp(`^${email.toLowerCase()}$`, 'i') }
    })

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
  async validateGoogleToken(token: string, providedPicture?: string): Promise<any> {
    try {
      let email: string | undefined
      let name: string = ''
      let userName: string = 'UsuarioGoogle'
      let googleAvatarUrl: string = ''
      let googleId: string | undefined

      // Decode the token to check if it's a Cognito token
      const decoded = jwt.decode(token) as any

      if (!decoded) {
        throw new HttpException(
          'Invalid token format',
          HttpStatus.UNAUTHORIZED
        )
      }

      // Check if it's a Cognito token by looking at the issuer
      const isCognitoToken = decoded.iss?.includes('cognito-idp')

      if (isCognitoToken) {
        // Handle Cognito token (from Amplify OAuth flow)

        email = decoded.email
        name = decoded.name || ''
        userName = decoded.name || 'UsuarioGoogle'

        // Get Google ID from identities array (for federated users)
        if (decoded.identities && decoded.identities.length > 0) {
          const googleIdentity = decoded.identities.find(
            (id: any) => id.providerName === 'Google' || id.providerType === 'Google'
          )
          if (googleIdentity) {
            googleId = googleIdentity.userId
          }
        }

        // Fallback: use Cognito sub if no Google identity found
        if (!googleId) {
          googleId = decoded.sub
        }

        // Try to get avatar from: 1) provided by frontend, 2) Cognito token
        googleAvatarUrl = providedPicture || decoded.picture || ''
      } else {
        // Handle direct Google token (legacy flow)
        console.log('[Auth] Processing direct Google token')
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
      }

      if (!email || !googleId) {
        throw new HttpException(
          'Token does not contain valid email or ID',
          HttpStatus.UNAUTHORIZED
        )
      }

      userName = userName.replace(/\s+/g, '_').toLowerCase()

      // Normalize email to lowercase for consistent matching
      const normalizedEmail = email.toLowerCase()

      // Check if user already exists in our DB (case-insensitive email search)
      let user = await this.userModel.findOne({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }
      })

      if (user) {
        // User EXISTS - check if Google is already linked
        const hasGoogleLinked = user.googleId === googleId ||
          user.linkedProviders?.some(lp => lp.provider === AuthProvider.GOOGLE && lp.providerId === googleId)

        if (!hasGoogleLinked) {
          // AUTO-LINK: User registered with email/password, now logging in with Google
          console.log(`[Auth] Linking Google account to existing user: ${user.email}`)

          // 1. Link Google in Cognito (if user has Cognito account)
          const hasCognitoAccount = !user.authProvider || user.authProvider === AuthProvider.COGNITO
          if (hasCognitoAccount) {
            try {
              await this.linkGoogleInCognito(user.email, googleId)
              console.log(`[Auth] Successfully linked Google in Cognito for: ${user.email}`)
            } catch (cognitoError) {
              // Log but don't fail - Cognito linking is optional
              console.error(`[Auth] Failed to link Google in Cognito:`, cognitoError.message)
            }
          }

          // 2. Link Google in MongoDB
          const linkedProvider: LinkedProvider = {
            provider: AuthProvider.GOOGLE,
            providerId: googleId,
            email: normalizedEmail,
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
        email: normalizedEmail,
        linkedAt: new Date(),
      }

      user = new this.userModel({
        email: normalizedEmail,
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
        email: normalizedEmail,
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
   * Generate a JWT token for Apple-authenticated users
   */
  generateAppleUserToken(user: { id: string; email: string; roles: UserRole[] }): string {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      iss: 'futbolify-apple-auth',
    }

    return jwt.sign(payload, process.env.JWT_SECRET || 'futbolify-secret-key', {
      expiresIn: '7d',
    })
  }

  /**
   * Validate Apple Sign In token from Cognito
   * Apple tokens come through Cognito OAuth flow (SignInWithApple identity provider)
   */
  async validateAppleToken(token: string): Promise<any> {
    try {
      let email: string | undefined
      let name: string = ''
      let userName: string = 'UsuarioApple'
      let appleId: string | undefined

      // Decode the token
      const decoded = jwt.decode(token) as any

      if (!decoded) {
        throw new HttpException(
          'Invalid token format',
          HttpStatus.UNAUTHORIZED
        )
      }

      // Check if it's a Cognito token
      const isCognitoToken = decoded.iss?.includes('cognito-idp')

      if (!isCognitoToken) {
        throw new HttpException(
          'Apple Sign In must use Cognito OAuth flow',
          HttpStatus.UNAUTHORIZED
        )
      }

      // Handle Cognito token from Apple OAuth flow
      email = decoded.email
      name = decoded.name || ''
      userName = decoded.name || 'UsuarioApple'

      // Get Apple ID from identities array (for federated users)
      if (decoded.identities && decoded.identities.length > 0) {
        const appleIdentity = decoded.identities.find(
          (id: any) => id.providerName === 'SignInWithApple' || id.providerType === 'SignInWithApple'
        )
        if (appleIdentity) {
          appleId = appleIdentity.userId
        }
      }

      // Fallback: use Cognito sub if no Apple identity found
      if (!appleId) {
        appleId = decoded.sub
      }

      if (!email || !appleId) {
        throw new HttpException(
          'Token does not contain valid email or ID',
          HttpStatus.UNAUTHORIZED
        )
      }

      userName = userName.replace(/\s+/g, '_').toLowerCase()

      // Normalize email to lowercase
      const normalizedEmail = email.toLowerCase()

      // Check if user already exists
      let user = await this.userModel.findOne({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }
      })

      if (user) {
        // User EXISTS - check if Apple is already linked
        const hasAppleLinked = user.appleId === appleId ||
          user.linkedProviders?.some(lp => lp.provider === AuthProvider.APPLE && lp.providerId === appleId)

        if (!hasAppleLinked) {
          // AUTO-LINK: User registered with other provider, now logging in with Apple
          console.log(`[Auth] Linking Apple account to existing user: ${user.email}`)

          // 1. Link Apple in Cognito (if user has Cognito account)
          const hasCognitoAccount = !user.authProvider || user.authProvider === AuthProvider.COGNITO
          if (hasCognitoAccount) {
            try {
              await this.linkAppleInCognito(user.email, appleId)
              console.log(`[Auth] Successfully linked Apple in Cognito for: ${user.email}`)
            } catch (cognitoError) {
              // Log but don't fail - Cognito linking is optional
              console.error(`[Auth] Failed to link Apple in Cognito:`, cognitoError.message)
            }
          }

          // 2. Link Apple in MongoDB
          const linkedProvider: LinkedProvider = {
            provider: AuthProvider.APPLE,
            providerId: appleId,
            email: normalizedEmail,
            linkedAt: new Date(),
          }

          user.appleId = appleId
          user.linkedProviders = [...(user.linkedProviders || []), linkedProvider]

          // Update name from Apple if user doesn't have one
          if (!user.name && name) {
            user.name = name
          }

          user.isProfileCompleted = true
          await user.save()
        }

        return {
          id: user._id.toString(),
          email: user.email,
          userName: user.userName,
          name: user.name || name,
          avatarUrl: user.avatarUrl || '',
          isProfileCompleted: true,
          roles: user.roles || [UserRole.USER],
        }
      }

      // User does NOT exist - create new user with Apple as primary
      const existingUserName = await this.userModel.findOne({ userName })
      if (existingUserName) {
        userName = `${userName}_${Math.floor(Math.random() * 10000)}`
      }

      // Create user with Apple as primary provider
      const linkedProvider: LinkedProvider = {
        provider: AuthProvider.APPLE,
        providerId: appleId,
        email: normalizedEmail,
        linkedAt: new Date(),
      }

      user = new this.userModel({
        email: normalizedEmail,
        userName,
        name,
        appleId,
        authProvider: AuthProvider.APPLE,
        primaryProvider: AuthProvider.APPLE,
        linkedProviders: [linkedProvider],
        isProfileCompleted: true,
        roles: [UserRole.USER],
      })

      await user.save()

      return {
        id: user._id.toString(),
        email: normalizedEmail,
        userName,
        name,
        avatarUrl: '',
        isProfileCompleted: true,
        roles: user.roles || [UserRole.USER],
      }
    } catch (error) {
      console.error('Apple validation error:', error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        'Invalid token or error processing user',
        HttpStatus.UNAUTHORIZED
      )
    }
  }

  /**
   * Link Google identity to existing Cognito user
   * This allows users to sign in with Google through Cognito OAuth
   *
   * IMPORTANT: Requires Google to be configured as an Identity Provider in Cognito
   */
  private async linkGoogleInCognito(email: string, googleId: string): Promise<void> {
    try {
      // Find ALL Cognito users with this email
      const listUsersCommand = new ListUsersCommand({
        UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
        Filter: `email = "${email}"`,
        Limit: 10,
      })

      const listUsersResponse = await this.client.send(listUsersCommand)
      const users = listUsersResponse.Users || []

      console.log(`[Auth] Found ${users.length} Cognito users with email: ${email}`)

      // Separate native user from federated users
      const federatedPrefixes = ['google_', 'Google_', 'facebook_', 'Facebook_', 'signinwithapple_', 'SignInWithApple_']

      const nativeUser = users.find(user => {
        const username = user.Username || ''
        return !federatedPrefixes.some(prefix => username.toLowerCase().startsWith(prefix.toLowerCase()))
      })

      const federatedUsers = users.filter(user => {
        const username = user.Username || ''
        return federatedPrefixes.some(prefix => username.toLowerCase().startsWith(prefix.toLowerCase()))
      })

      if (!nativeUser || !nativeUser.Username) {
        console.log(`[Auth] No native Cognito user found for email: ${email}`)
        return
      }

      console.log(`[Auth] Native user found: ${nativeUser.Username}`)
      console.log(`[Auth] Federated users found: ${federatedUsers.map(u => u.Username).join(', ')}`)

      // IMPORTANT: First DELETE the federated users, then link
      // Cognito cannot link a SourceUser that already exists ("Merging not supported")
      // So we delete google_xxx first, then link Google to the native user

      // Step 1: Delete the federated duplicate users (google_xxx)
      for (const federatedUser of federatedUsers) {
        try {
          const deleteCommand = new AdminDeleteUserCommand({
            UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
            Username: federatedUser.Username,
          })
          await this.client.send(deleteCommand)
          console.log(`[Auth] Deleted federated duplicate user: ${federatedUser.Username}`)
        } catch (deleteError: any) {
          console.error(`[Auth] Failed to delete federated user ${federatedUser.Username}:`, deleteError.message)
        }
      }

      // Step 2: Link Google to the native Cognito user
      try {
        const linkCommand = new AdminLinkProviderForUserCommand({
          UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
          DestinationUser: {
            ProviderName: 'Cognito',
            ProviderAttributeValue: nativeUser.Username,
          },
          SourceUser: {
            ProviderName: 'Google',
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: googleId,
          },
        })

        await this.client.send(linkCommand)
        console.log(`[Auth] Linked Google (${googleId}) to native user: ${nativeUser.Username}`)
      } catch (linkError: any) {
        // If already linked, that's fine
        if (linkError.message?.includes('already exists')) {
          console.log(`[Auth] Google already linked to native user: ${nativeUser.Username}`)
        } else {
          console.error(`[Auth] Failed to link Google:`, linkError.message)
          // Don't throw - we still want to continue with MongoDB linking
        }
      }
    } catch (error) {
      console.error(`[Auth] linkGoogleInCognito error:`, error.message || error)
      throw error
    }
  }

  /**
   * Link Apple identity to existing Cognito user
   * This allows users to sign in with Apple through Cognito OAuth
   *
   * IMPORTANT: Requires Apple to be configured as an Identity Provider in Cognito
   */
  private async linkAppleInCognito(email: string, appleId: string): Promise<void> {
    try {
      // Find ALL Cognito users with this email
      const listUsersCommand = new ListUsersCommand({
        UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
        Filter: `email = "${email}"`,
        Limit: 10,
      })

      const listUsersResponse = await this.client.send(listUsersCommand)
      const users = listUsersResponse.Users || []

      console.log(`[Auth] Found ${users.length} Cognito users with email: ${email}`)

      // Separate native user from federated users
      const federatedPrefixes = ['google_', 'Google_', 'facebook_', 'Facebook_', 'signinwithapple_', 'SignInWithApple_']

      const nativeUser = users.find(user => {
        const username = user.Username || ''
        return !federatedPrefixes.some(prefix => username.toLowerCase().startsWith(prefix.toLowerCase()))
      })

      // Only get Apple federated users for deletion
      const appleFederatedUsers = users.filter(user => {
        const username = user.Username || ''
        return username.toLowerCase().startsWith('signinwithapple_')
      })

      if (!nativeUser || !nativeUser.Username) {
        console.log(`[Auth] No native Cognito user found for email: ${email}`)
        return
      }

      console.log(`[Auth] Native user found: ${nativeUser.Username}`)
      console.log(`[Auth] Apple federated users found: ${appleFederatedUsers.map(u => u.Username).join(', ')}`)

      // IMPORTANT: First DELETE the Apple federated users, then link
      // Cognito cannot link a SourceUser that already exists ("Merging not supported")

      // Step 1: Delete the Apple federated duplicate users (signinwithapple_xxx)
      for (const federatedUser of appleFederatedUsers) {
        try {
          const deleteCommand = new AdminDeleteUserCommand({
            UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
            Username: federatedUser.Username,
          })
          await this.client.send(deleteCommand)
          console.log(`[Auth] Deleted Apple federated duplicate user: ${federatedUser.Username}`)
        } catch (deleteError: any) {
          console.error(`[Auth] Failed to delete Apple federated user ${federatedUser.Username}:`, deleteError.message)
        }
      }

      // Step 2: Link Apple to the native Cognito user
      try {
        const linkCommand = new AdminLinkProviderForUserCommand({
          UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
          DestinationUser: {
            ProviderName: 'Cognito',
            ProviderAttributeValue: nativeUser.Username,
          },
          SourceUser: {
            ProviderName: 'SignInWithApple',
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: appleId,
          },
        })

        await this.client.send(linkCommand)
        console.log(`[Auth] Linked Apple (${appleId}) to native user: ${nativeUser.Username}`)
      } catch (linkError: any) {
        // If already linked, that's fine
        if (linkError.message?.includes('already exists')) {
          console.log(`[Auth] Apple already linked to native user: ${nativeUser.Username}`)
        } else {
          console.error(`[Auth] Failed to link Apple:`, linkError.message)
          // Don't throw - we still want to continue with MongoDB linking
        }
      }
    } catch (error) {
      console.error(`[Auth] linkAppleInCognito error:`, error.message || error)
      throw error
    }
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

    // Add Cognito provider only if user registered with email/password
    // (primaryProvider is 'cognito' or authProvider is not set/cognito)
    const hasCognitoAccount = user.primaryProvider === AuthProvider.COGNITO ||
      (!user.authProvider || user.authProvider === AuthProvider.COGNITO)

    if (user.email && hasCognitoAccount) {
      providers.push({
        provider: AuthProvider.COGNITO,
        email: user.email,
        linkedAt: new Date(user.createdAt * 1000),
        isPrimary: user.primaryProvider === AuthProvider.COGNITO,
      })
    }

    // Add linked providers (e.g., Google)
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

  /**
   * Check if an email exists and what providers are associated with it
   * Used to detect if user should add password vs create new account
   */
  async checkEmailExists(email: string): Promise<CheckEmailResponse> {
    const normalizedEmail = email.toLowerCase()

    const user = await this.userModel.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }
    })

    if (!user) {
      return {
        exists: false,
        hasPassword: false,
        hasGoogle: false,
        hasApple: false,
        primaryProvider: null,
      }
    }

    // Check if user has Cognito (password) account
    const hasCognitoProvider = user.linkedProviders?.some(
      lp => lp.provider === AuthProvider.COGNITO
    )
    const hasPassword = user.primaryProvider === AuthProvider.COGNITO ||
      user.authProvider === AuthProvider.COGNITO ||
      (!user.authProvider && !user.primaryProvider) ||
      hasCognitoProvider

    // Check if user has Google account
    const hasGoogle = !!user.googleId ||
      user.authProvider === AuthProvider.GOOGLE ||
      user.linkedProviders?.some(lp => lp.provider === AuthProvider.GOOGLE)

    // Check if user has Apple account
    const hasApple = !!user.appleId ||
      user.authProvider === AuthProvider.APPLE ||
      user.linkedProviders?.some(lp => lp.provider === AuthProvider.APPLE)

    return {
      exists: true,
      hasPassword,
      hasGoogle,
      hasApple,
      primaryProvider: user.primaryProvider || user.authProvider || AuthProvider.COGNITO,
    }
  }

  /**
   * Add a password (Cognito account) to an OAuth-only user (Google or Apple)
   * This allows users who registered with OAuth to also login with email/password
   */
  async addPasswordToOAuthAccount(input: AddPasswordToAccountInput): Promise<LinkAccountResponse> {
    try {
      const { email, password, idToken, googleIdToken } = input
      // Support both new idToken and deprecated googleIdToken for backwards compatibility
      const token = idToken || googleIdToken
      const normalizedEmail = email.toLowerCase()

      if (!token) {
        throw new HttpException('OAuth token required', HttpStatus.BAD_REQUEST)
      }

      // 1. Decode token and detect provider (Google or Apple)
      const decoded = jwt.decode(token) as any
      if (!decoded) {
        throw new HttpException('Invalid token format', HttpStatus.UNAUTHORIZED)
      }

      const isCognitoToken = decoded?.iss?.includes('cognito-idp')
      let verifiedProviderId: string
      let verifiedEmail: string
      let provider: AuthProvider

      if (isCognitoToken) {
        verifiedEmail = decoded.email?.toLowerCase()

        // Detect provider from identities array
        if (decoded.identities && decoded.identities.length > 0) {
          const googleIdentity = decoded.identities.find(
            (id: any) => id.providerName === 'Google' || id.providerType === 'Google'
          )
          const appleIdentity = decoded.identities.find(
            (id: any) => id.providerName === 'SignInWithApple' || id.providerType === 'SignInWithApple'
          )

          if (googleIdentity) {
            provider = AuthProvider.GOOGLE
            verifiedProviderId = googleIdentity.userId
          } else if (appleIdentity) {
            provider = AuthProvider.APPLE
            verifiedProviderId = appleIdentity.userId
          } else {
            verifiedProviderId = decoded.sub
            provider = AuthProvider.GOOGLE // Default fallback
          }
        } else {
          verifiedProviderId = decoded.sub
          provider = AuthProvider.GOOGLE // Default for non-federated Cognito tokens
        }
      } else {
        // Direct Google token (not from Cognito)
        provider = AuthProvider.GOOGLE
        const ticket = await this.googleClient.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
        })
        const payload = ticket.getPayload()
        verifiedEmail = payload?.email?.toLowerCase()
        verifiedProviderId = payload?.sub
      }

      if (!verifiedEmail || !verifiedProviderId) {
        throw new HttpException('Invalid OAuth token', HttpStatus.UNAUTHORIZED)
      }

      // 2. Verify the email matches
      if (verifiedEmail !== normalizedEmail) {
        throw new HttpException(
          'Email does not match OAuth account',
          HttpStatus.BAD_REQUEST
        )
      }

      // 3. Find the user
      const user = await this.userModel.findOne({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }
      })

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND)
      }

      // 4. Verify user has the OAuth account (Google or Apple)
      const hasOAuthAccount = provider === AuthProvider.GOOGLE
        ? (!!user.googleId || user.authProvider === AuthProvider.GOOGLE)
        : (!!user.appleId || user.authProvider === AuthProvider.APPLE)

      if (!hasOAuthAccount) {
        throw new HttpException(
          `User does not have a ${provider} account linked`,
          HttpStatus.BAD_REQUEST
        )
      }

      // 5. Check if user already has password
      const hasCognitoProvider = user.linkedProviders?.some(
        lp => lp.provider === AuthProvider.COGNITO
      )
      const isOAuthPrimary = user.authProvider === AuthProvider.GOOGLE || user.authProvider === AuthProvider.APPLE
      if (hasCognitoProvider || (user.primaryProvider === AuthProvider.COGNITO && !isOAuthPrimary)) {
        throw new HttpException(
          'User already has a password set',
          HttpStatus.CONFLICT
        )
      }

      // 6. Create Cognito user with password
      try {
        const createCommand = new AdminCreateUserCommand({
          UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
          Username: normalizedEmail,
          UserAttributes: [
            { Name: 'email', Value: normalizedEmail },
            { Name: 'email_verified', Value: 'true' },
          ],
          MessageAction: 'SUPPRESS',
        })
        await this.client.send(createCommand)

        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
          Username: normalizedEmail,
          Password: password,
          Permanent: true,
        })
        await this.client.send(setPasswordCommand)

        console.log(`[Auth] Created Cognito account for ${provider} user: ${normalizedEmail}`)
      } catch (cognitoError: any) {
        if (cognitoError.name === 'UsernameExistsException') {
          console.log(`[Auth] Cognito user exists, setting password for: ${normalizedEmail}`)
          const setPasswordCommand = new AdminSetUserPasswordCommand({
            UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
            Username: normalizedEmail,
            Password: password,
            Permanent: true,
          })
          await this.client.send(setPasswordCommand)
        } else {
          console.error('[Auth] Failed to create Cognito user:', cognitoError.message)
          throw new HttpException(
            'Failed to create password account',
            HttpStatus.INTERNAL_SERVER_ERROR
          )
        }
      }

      // 7. Link the OAuth provider to the Cognito user
      try {
        if (provider === AuthProvider.GOOGLE) {
          await this.linkGoogleInCognito(normalizedEmail, verifiedProviderId)
        } else if (provider === AuthProvider.APPLE) {
          await this.linkAppleInCognito(normalizedEmail, verifiedProviderId)
        }
      } catch (linkError) {
        console.error(`[Auth] Failed to link ${provider} in Cognito:`, linkError.message)
        // Continue anyway - the user can still login with password
      }

      // 8. Update MongoDB - add Cognito as linked provider
      const cognitoLinkedProvider: LinkedProvider = {
        provider: AuthProvider.COGNITO,
        providerId: normalizedEmail,
        email: normalizedEmail,
        linkedAt: new Date(),
      }

      user.linkedProviders = [...(user.linkedProviders || []), cognitoLinkedProvider]
      await user.save()

      console.log(`[Auth] Added password to ${provider} account: ${normalizedEmail}`)

      return {
        success: true,
        message: `Password added successfully. You can now login with email/password or ${provider}.`,
        linkedProviders: this.mapLinkedProviders(user),
      }
    } catch (error) {
      console.error('[Auth] addPasswordToOAuthAccount error:', error.message || error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        'Failed to add password to account',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * @deprecated Use addPasswordToOAuthAccount instead
   */
  async addPasswordToGoogleAccount(input: AddPasswordToAccountInput): Promise<LinkAccountResponse> {
    return this.addPasswordToOAuthAccount(input)
  }
}
