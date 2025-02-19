/** @format */

import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminAddUserToGroupCommand,
  InitiateAuthCommand,
  AuthFlowType,
  ConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument, UserRole } from 'src/users/schemas/user.schema'
import * as jwt from 'jsonwebtoken'
import { ConfirmSignupInputDto } from './dto'
import { CurrentUserPayload } from './current-user-payload.interface'
import axios from 'axios'
import { OAuth2Client } from 'google-auth-library'
import { UpdateProfileInputDto } from './dto/update-profile-input.dto'

@Injectable()
export class AuthService {
  private client: CognitoIdentityProviderClient
  private clientId: string
  private googleClient: OAuth2Client

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {
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
    const decodedToken = jwt.decode(idToken) as any

    const user = await this.userModel.findOne({ email })

    if (!user) {
      throw new Error('User not found')
    }

    const cognitoRoles = decodedToken['cognito:groups'] || []
    const mappedCognitoRoles: UserRole[] =
      this.mapCognitoGroupsToUserRoles(cognitoRoles)

    const hasValidRole = mappedCognitoRoles.some((role) =>
      user.roles.includes(role)
    )

    if (!hasValidRole) {
      throw new Error(
        'User roles from Cognito do not match with the database roles'
      )
    }

    return {
      avatarUrl: user.avatarUrl,
      access_token: idToken,
      isOnboardingCompleted: user.isOnboardingCompleted,
      roles: mappedCognitoRoles,
    }
  }

  private mapCognitoGroupsToUserRoles(groups: string[]): UserRole[] {
    return groups.map((group) => {
      switch (group) {
        case 'admins':
          return UserRole.ADMIN
        case 'super_admins':
          return UserRole.SUPER_ADMIN
        case 'users':
          return UserRole.USER
        default:
          throw new Error(`Unrecognized group: ${group}`)
      }
    })
  }

  async register(email: string, password: string): Promise<any> {
    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }],
    })
    const response = await this.client.send(command)

    const groupCommand = new AdminAddUserToGroupCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      GroupName: 'users',
      Username: email,
    })
    await this.client.send(groupCommand)

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
    const decodedToken = jwt.decode(idToken) as any

    const cognitoRoles = decodedToken['cognito:groups'] || []
    const mappedCognitoRoles: UserRole[] =
      this.mapCognitoGroupsToUserRoles(cognitoRoles)

    return {
      isOnboardingCompleted: false,
      access_token: idToken,
      roles: mappedCognitoRoles,
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

    let groupName = 'users'

    if (role === UserRole.SUPER_ADMIN) {
      groupName = 'super_admins'
    } else if (role === UserRole.ADMIN) {
      groupName = 'admins'
    }

    const groupCommand = new AdminAddUserToGroupCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      GroupName: groupName,
      Username: email,
    })
    await this.client.send(groupCommand)

    const createdUser = new this.userModel({
      email,
      phone,
      name,
      roles: [role],
    })
    await createdUser.save()

    return createdUser
  }
  async validateGoogleToken(idToken: string): Promise<any> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      })

      const payload = ticket.getPayload()

      const email = payload?.email
      let userName = payload?.name || 'UsuarioGoogle'
      const avatarUrl = payload?.picture || ''
      const googleId = payload?.sub
      const authProvider = 'google'

      if (!email) {
        throw new HttpException(
          'Google token does not contain a valid email',
          HttpStatus.UNAUTHORIZED
        )
      }

      userName = userName.replace(/\s+/g, '_').toLowerCase()

      let existingUserName = await this.userModel.findOne({ userName })

      if (existingUserName) {
        userName = `${userName}_${Math.floor(Math.random() * 10000)}`
      }

      let isUserInCognito = true
      try {
        await this.client.send(
          new AdminGetUserCommand({
            UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
            Username: email,
          })
        )
      } catch (error) {
        isUserInCognito = false
      }

      if (!isUserInCognito) {
        const createUserCommand = new AdminCreateUserCommand({
          UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: userName },
            { Name: 'picture', Value: avatarUrl },
          ],
          MessageAction: 'SUPPRESS',
        })

        await this.client.send(createUserCommand)
      }

      let user = await this.userModel.findOne({ email })

      if (!user) {
        user = new this.userModel({
          email,
          userName,
          avatarUrl,
          googleId,
          authProvider,
          isProfileCompleted: false,
          roles: [UserRole.USER],
        })

        await user.save()

        return {
          email,
          userName,
          avatarUrl,
          isProfileCompleted: false,
        }
      }

      return {
        email: user.email,
        userName: user.userName,
        avatarUrl: user.avatarUrl,
        isProfileCompleted: user.isProfileCompleted,
      }
    } catch (error) {
      throw new HttpException(
        'Invalid token or error processing user',
        HttpStatus.UNAUTHORIZED
      )
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
}
