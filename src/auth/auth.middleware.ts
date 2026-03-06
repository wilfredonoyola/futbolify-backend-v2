// src/auth/auth.middleware.ts
// Middleware that parses JWT token and sets req.user for all requests
// This enables optional authentication - req.user will be set if valid token, undefined otherwise

import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import { User, UserDocument } from '../users/schemas/user.schema';

interface DecodedToken {
  email?: string;
  'cognito:username'?: string;
  iss?: string;
  sub?: string;
}

interface AuthenticatedUser {
  userId: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  roles: string[];
  phone?: string;
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async use(req: any, res: any, next: () => void) {
    try {
      const authHeader = req.headers?.authorization;
      if (!authHeader) {
        return next();
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        return next();
      }

      // Decode token (without verification - Cognito handles that)
      const decodedToken = jwt.decode(token) as DecodedToken;
      if (!decodedToken) {
        return next();
      }

      // Optional: Verify issuer matches our Cognito User Pool
      const issuer = `https://cognito-idp.${process.env.AWS_COGNITO_REGION}.amazonaws.com/${process.env.AWS_COGNITO_USER_POOL_ID}`;
      if (decodedToken.iss && decodedToken.iss !== issuer) {
        // Invalid issuer, skip auth
        return next();
      }

      const email = decodedToken.email || decodedToken['cognito:username'];
      if (!email) {
        return next();
      }

      // Look up user in database
      const user = await this.userModel.findOne({ email }).exec();
      if (!user) {
        return next();
      }

      // Set req.user with user info
      req.user = {
        userId: user._id.toString(),
        username: user.email,
        name: user.name || user.email,
        avatarUrl: user.avatarUrl || '',
        roles: user.roles || [],
        phone: user.phone,
      } as AuthenticatedUser;

    } catch (err) {
      // Silent fail - just continue without auth
      console.error('[AuthMiddleware] Error parsing token:', err?.message);
    }

    next();
  }
}
