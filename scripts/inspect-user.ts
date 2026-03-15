import { MongoClient } from 'mongodb'
import * as dotenv from 'dotenv'

dotenv.config()

async function inspectUser() {
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
      console.log('User document:')
      console.log(JSON.stringify(user, null, 2))
    } else {
      console.log('User not found')
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.close()
  }
}

inspectUser()
