import { MongoClient } from 'mongodb'
import * as dotenv from 'dotenv'

dotenv.config()

enum AuthProvider {
  COGNITO = 'cognito',
  GOOGLE = 'google',
}

interface LinkedProviderInfo {
  provider: string
  email: string
  linkedAt: Date
  isPrimary: boolean
}

function mapLinkedProviders(user: any): LinkedProviderInfo[] {
  const providers: LinkedProviderInfo[] = []

  console.log('Debug values:')
  console.log('  user.primaryProvider:', user.primaryProvider)
  console.log('  user.authProvider:', user.authProvider)
  console.log('  AuthProvider.COGNITO:', AuthProvider.COGNITO)
  console.log('  user.email:', user.email)
  console.log('  user.linkedProviders:', user.linkedProviders)

  // Add Cognito provider only if user registered with email/password
  const hasCognitoAccount = user.primaryProvider === AuthProvider.COGNITO ||
    (!user.authProvider || user.authProvider === AuthProvider.COGNITO)

  console.log('  hasCognitoAccount:', hasCognitoAccount)

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

async function testLinkedProviders() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/futbolify'
  const client = new MongoClient(mongoUri)

  try {
    await client.connect()
    const db = client.db()
    const usersCollection = db.collection('users')

    const user = await usersCollection.findOne({
      email: { $regex: /^wilfredon163@gmail\.com$/i }
    })

    if (user) {
      console.log('\n--- Testing mapLinkedProviders ---\n')
      const result = mapLinkedProviders(user)
      console.log('\nResult:')
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log('User not found')
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.close()
  }
}

testLinkedProviders()
