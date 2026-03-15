/**
 * Cognito Pre-Signup Lambda Trigger
 *
 * This Lambda function handles the linking of federated identity providers
 * (like Google) to existing Cognito users.
 *
 * Flow:
 * 1. User clicks "Sign in with Google"
 * 2. Cognito triggers this Lambda before creating a new user
 * 3. Lambda checks if a user with this email already exists
 * 4. If exists: Links the Google identity to the existing user
 * 5. If not exists: Allows Cognito to create a new user
 */

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from 'aws-lambda'
import { randomBytes } from 'crypto'

const cognitoClient = new CognitoIdentityProviderClient({})

// Map lowercase provider names to the exact casing Cognito expects
const PROVIDER_NAME_MAP: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  loginwithamazon: 'LoginWithAmazon',
  signinwithapple: 'SignInWithApple',
}

interface ProviderInfo {
  providerName: string
  providerUserId: string
}

/**
 * Extract provider info from Cognito username
 * Username format: "Google_108986458847054040795"
 */
function extractProviderInfo(userName: string): ProviderInfo | null {
  const parts = userName.split('_')
  if (parts.length < 2) return null

  const providerNameLower = parts[0].toLowerCase()
  const providerName = PROVIDER_NAME_MAP[providerNameLower]

  if (!providerName) return null

  // The user ID is everything after the first underscore
  const providerUserId = parts.slice(1).join('_')

  return { providerName, providerUserId }
}

/**
 * Find existing user by email
 */
async function findUserByEmail(userPoolId: string, email: string): Promise<string | null> {
  try {
    const command = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 1,
    })

    const response = await cognitoClient.send(command)

    if (response.Users && response.Users.length > 0) {
      return response.Users[0].Username || null
    }

    return null
  } catch (error) {
    console.error('Error finding user by email:', error)
    return null
  }
}

/**
 * Link external provider to existing Cognito user
 */
async function linkProviderToUser(
  userPoolId: string,
  cognitoUsername: string,
  providerName: string,
  providerUserId: string
): Promise<void> {
  const command = new AdminLinkProviderForUserCommand({
    UserPoolId: userPoolId,
    DestinationUser: {
      ProviderName: 'Cognito',
      ProviderAttributeValue: cognitoUsername,
    },
    SourceUser: {
      ProviderName: providerName,
      ProviderAttributeName: 'Cognito_Subject',
      ProviderAttributeValue: providerUserId,
    },
  })

  await cognitoClient.send(command)
  console.log(`Successfully linked ${providerName} to user ${cognitoUsername}`)
}

/**
 * Create a native Cognito user with a random password
 * This is needed when we want to link a federated identity to a new user
 */
async function createNativeUser(
  userPoolId: string,
  email: string,
  name?: string
): Promise<string> {
  // Generate a random password (won't be used, just for Cognito requirements)
  const randomPassword = randomBytes(32).toString('hex') + 'Aa1!'

  // Create the user
  const createCommand = new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      ...(name ? [{ Name: 'name', Value: name }] : []),
    ],
    MessageAction: 'SUPPRESS', // Don't send welcome email
  })

  const createResponse = await cognitoClient.send(createCommand)
  const username = createResponse.User?.Username

  if (!username) {
    throw new Error('Failed to create user')
  }

  // Set permanent password to avoid FORCE_CHANGE_PASSWORD status
  const setPasswordCommand = new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: username,
    Password: randomPassword,
    Permanent: true,
  })

  await cognitoClient.send(setPasswordCommand)

  console.log(`Created native user: ${username}`)
  return username
}

/**
 * Main handler for Pre-Signup trigger
 */
export const handler: PreSignUpTriggerHandler = async (event: PreSignUpTriggerEvent) => {
  console.log('Pre-Signup trigger event:', JSON.stringify(event, null, 2))

  const { triggerSource, userPoolId, userName, request } = event
  const email = request.userAttributes?.email
  const name = request.userAttributes?.name

  // Only handle external provider signups (Google, Facebook, etc.)
  if (triggerSource !== 'PreSignUp_ExternalProvider') {
    console.log('Not an external provider signup, skipping')
    // For regular signups, auto-confirm if needed
    if (triggerSource === 'PreSignUp_SignUp') {
      // You can auto-confirm users here if needed
      // event.response.autoConfirmUser = true
      // event.response.autoVerifyEmail = true
    }
    return event
  }

  if (!email) {
    console.error('No email in user attributes')
    throw new Error('Email is required for external provider signup')
  }

  // Extract provider info from username (e.g., "Google_123456789")
  const providerInfo = extractProviderInfo(userName)

  if (!providerInfo) {
    console.error('Could not extract provider info from username:', userName)
    throw new Error('Invalid external provider username format')
  }

  console.log('Provider info:', providerInfo)

  // Check if a user with this email already exists
  const existingUsername = await findUserByEmail(userPoolId, email)

  if (existingUsername) {
    console.log(`Found existing user: ${existingUsername}, linking provider...`)

    // Link the external provider to the existing user
    await linkProviderToUser(
      userPoolId,
      existingUsername,
      providerInfo.providerName,
      providerInfo.providerUserId
    )

    // Throw an error to prevent Cognito from creating a duplicate user
    // The user will be signed in with their existing account
    throw new Error('User already exists, provider has been linked. Please sign in again.')
  }

  // No existing user found - allow Cognito to create the new user
  console.log('No existing user found, allowing new user creation')

  // Auto-confirm and auto-verify for external providers
  event.response.autoConfirmUser = true
  event.response.autoVerifyEmail = true

  return event
}
