import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private app: admin.app.App;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    if (!admin.apps.length) {
      // Use environment variables for credentials
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
      const databaseURL = this.configService.get<string>('FIREBASE_DATABASE_URL');

      if (!projectId || !clientEmail || !privateKey) {
        console.warn('Firebase credentials not configured. Firebase features will be disabled.');
        return;
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        databaseURL: databaseURL || `https://${projectId}.firebaseio.com`,
      });

      console.log('✅ Firebase Admin initialized successfully');
    } else {
      this.app = admin.app();
    }
  }

  /**
   * Generate a custom token for a user to authenticate with Firebase
   * @param userId - The unique user ID from your auth system
   * @param additionalClaims - Optional additional claims to include in the token
   */
  async createCustomToken(
    userId: string,
    additionalClaims?: Record<string, any>,
  ): Promise<string> {
    if (!this.app) {
      throw new Error('Firebase not initialized');
    }

    try {
      const token = await admin.auth().createCustomToken(userId, additionalClaims);
      return token;
    } catch (error) {
      console.error('Error creating custom token:', error);
      throw error;
    }
  }

  /**
   * Verify a Firebase ID token
   * @param idToken - The Firebase ID token to verify
   */
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.app) {
      throw new Error('Firebase not initialized');
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Error verifying ID token:', error);
      throw error;
    }
  }

  /**
   * Get Firebase Admin app instance
   */
  getApp(): admin.app.App {
    return this.app;
  }

  /**
   * Get Firebase Realtime Database reference
   */
  getDatabase(): admin.database.Database {
    return admin.database();
  }

  /**
   * Check if Firebase is initialized
   */
  isInitialized(): boolean {
    return !!this.app;
  }
}
