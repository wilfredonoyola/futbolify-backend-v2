import { MongoClient } from 'mongodb'
import * as dotenv from 'dotenv'

dotenv.config()

async function deleteDuplicateGoogleAccount() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/futbolify'

  console.log('Connecting to MongoDB...')
  const client = new MongoClient(mongoUri)

  try {
    await client.connect()
    const db = client.db()
    const usersCollection = db.collection('users')

    // Find both accounts
    const accounts = await usersCollection.find({
      email: { $regex: /^wilfredon163@gmail\.com$/i }
    }).toArray()

    console.log(`Found ${accounts.length} account(s) with email wilfredon163@gmail.com:`)
    accounts.forEach((acc, i) => {
      console.log(`  ${i + 1}. ID: ${acc._id}, authProvider: ${acc.authProvider || 'cognito'}, googleId: ${acc.googleId || 'none'}`)
    })

    // Find and delete the Google-only account
    const googleAccount = accounts.find(acc => acc.authProvider === 'google')

    if (googleAccount) {
      console.log(`\nDeleting Google-only account: ${googleAccount._id}`)
      const result = await usersCollection.deleteOne({ _id: googleAccount._id })
      console.log(`Deleted ${result.deletedCount} account(s)`)
    } else {
      console.log('\nNo Google-only account found to delete.')
    }

    // Show remaining accounts
    const remaining = await usersCollection.find({
      email: { $regex: /^wilfredon163@gmail\.com$/i }
    }).toArray()

    console.log(`\nRemaining accounts: ${remaining.length}`)
    remaining.forEach((acc, i) => {
      console.log(`  ${i + 1}. ID: ${acc._id}, authProvider: ${acc.authProvider || 'cognito'}, googleId: ${acc.googleId || 'none'}`)
    })

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.close()
    console.log('\nDone!')
  }
}

deleteDuplicateGoogleAccount()
