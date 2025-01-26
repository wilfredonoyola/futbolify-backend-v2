import { Injectable } from "@nestjs/common";
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
} from "@aws-sdk/client-cognito-identity-provider";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument, UserRole } from "src/users/schemas/user.schema";
import * as jwt from "jsonwebtoken";
import { ConfirmSignupInputDto } from "./dto";
import { CurrentUserPayload } from "./current-user-payload.interface";

@Injectable()
export class AuthService {
  private client: CognitoIdentityProviderClient;
  private clientId: string;

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {
    this.client = new CognitoIdentityProviderClient({
      region: process.env.AWS_COGNITO_REGION,
      credentials: {
        accessKeyId: process.env.AMZ_ACCESS_KEY_ID,
        secretAccessKey: process.env.AMZ_SECRET_ACCESS_KEY,
      },
    });
    this.clientId = process.env.AWS_COGNITO_CLIENT_ID;
  }
  async deleteUser(email: string): Promise<void> {
    const command = new AdminDeleteUserCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      Username: email,
    });
    await this.client.send(command);
  }
  async login(email: string, password: string): Promise<any> {
    const command = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });
    const response = await this.client.send(command);

    const idToken = response.AuthenticationResult?.IdToken;
    const decodedToken = jwt.decode(idToken) as any;

    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new Error("User not found");
    }

    // Map roles from Cognito token to UserRole enum
    const cognitoRoles = decodedToken["cognito:groups"] || [];
    const mappedCognitoRoles: UserRole[] =
      this.mapCognitoGroupsToUserRoles(cognitoRoles);

    // Validate that at least one Cognito role matches the roles in the database
    const hasValidRole = mappedCognitoRoles.some((role) =>
      user.roles.includes(role)
    );

    if (!hasValidRole) {
      throw new Error(
        "User roles from Cognito do not match with the database roles"
      );
    }

    return {
      access_token: idToken,
      isOnboardingCompleted: user.isOnboardingCompleted,
      roles: mappedCognitoRoles,
    };
  }

  // Method to map Cognito groups to the UserRole enum
  private mapCognitoGroupsToUserRoles(groups: string[]): UserRole[] {
    return groups.map((group) => {
      switch (group) {
        case "admins":
          return UserRole.ADMIN;
        case "super_admins":
          return UserRole.SUPER_ADMIN;
        case "users":
          return UserRole.USER;
        default:
          throw new Error(`Unrecognized group: ${group}`);
      }
    });
  }

  async register(email: string, password: string): Promise<any> {
    // Start the registration process in Cognito
    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }],
    });
    const response = await this.client.send(command);

    // Assign user to "admins" group in Cognito
    const groupCommand = new AdminAddUserToGroupCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      GroupName: "admins", // Assign the ADMIN role in Cognito
      Username: email,
    });
    await this.client.send(groupCommand);

    return {
      message:
        "Verification code sent to your email. Please confirm to complete registration.",
      userSub: response.UserSub, // User ID in Cognito
    };
  }

  // Method to initiate the forgot password process
  async forgotPassword(email: string): Promise<boolean> {
    const command = new ForgotPasswordCommand({
      ClientId: this.clientId,
      Username: email,
    });

    await this.client.send(command);
    return true;
  }

  // Method to confirm the new password using the verification code
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
    });

    await this.client.send(command);
    return true;
  }

  // Method to resend the confirmation code
  async resendVerificationCode(email: string): Promise<boolean> {
    const command = new ResendConfirmationCodeCommand({
      ClientId: this.clientId,
      Username: email,
    });

    await this.client.send(command);
    return true;
  }

  async confirmRegistration(input: ConfirmSignupInputDto): Promise<any> {
    // Confirmar el código de verificación en Cognito
    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: input.email,
      ConfirmationCode: input.verificationCode,
    });
    await this.client.send(confirmCommand);

    // Crear el usuario en MongoDB con rol ADMIN
    const createdUser = new this.userModel({
      ...input,
      isOnboardingCompleted: false,
      roles: [UserRole.USER], // Se asigna rol ADMIN por defecto
    });

    await createdUser.save();

    // Iniciar sesión automáticamente después de la confirmación
    const loginCommand = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: input.email,
        PASSWORD: input.password,
      },
    });
    const response = await this.client.send(loginCommand);

    const idToken = response.AuthenticationResult?.IdToken;
    const decodedToken = jwt.decode(idToken) as any;

    // Mapear roles desde Cognito
    const cognitoRoles = decodedToken["cognito:groups"] || [];
    const mappedCognitoRoles: UserRole[] =
      this.mapCognitoGroupsToUserRoles(cognitoRoles);

    return {
      isOnboardingCompleted: false,
      access_token: idToken,
      roles: mappedCognitoRoles,
    };
  }

  async addUser(
    email: string,
    name: string,
    password: string,
    phone: number,
    role: UserRole,
    user: CurrentUserPayload
  ): Promise<any> {
    // Create user in Cognito without requiring email confirmation
    const command = new AdminCreateUserCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID, // User Pool ID
      Username: email,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" }, // Mark email as verified
      ],
      MessageAction: "SUPPRESS", // Suppress the welcome email
    });
    await this.client.send(command);

    // Set the user's password
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true, // Password is set as permanent
    });
    await this.client.send(setPasswordCommand);

    let groupName = "users";

    if (role === UserRole.SUPER_ADMIN) {
      groupName = "super_admins";
    } else if (role === UserRole.ADMIN) {
      groupName = "admins";
    }

    const groupCommand = new AdminAddUserToGroupCommand({
      UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      GroupName: groupName,
      Username: email,
    });
    await this.client.send(groupCommand);

    // Save the user in your database with the specified role
    const createdUser = new this.userModel({
      email,
      phone,
      name,
      roles: [role],
    });
    await createdUser.save();

    return createdUser;
  }
}
