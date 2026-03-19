import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-strategy';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import { User, UserDocument } from 'src/users/schemas/user.schema'; // Make sure to correctly import your user schema

@Injectable()
export class AwsCognitoAuthStrategy extends PassportStrategy(
  Strategy,
  'cognito',
) {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>, // Modelo de usuario
  ) {
    super();
  }

  async authenticate(req: any, options?: any): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log('[JWT-Auth] No authorization header found');
      return this.fail(
        new UnauthorizedException('Authorization header not found'),
        401,
      );
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log('[JWT-Auth] No token found in header');
      return this.fail(new UnauthorizedException('Token not found'), 401);
    }

    try {
      const decodedToken = jwt.decode(token) as any;

      console.log('[JWT-Auth] Decoded token:', {
        iss: decodedToken?.iss,
        email: decodedToken?.email,
        sub: decodedToken?.sub,
        exp: decodedToken?.exp,
      });

      // Check token issuer - accept Cognito, Google-auth, and Apple-auth tokens
      const cognitoIssuer = `https://cognito-idp.${process.env.AWS_COGNITO_REGION}.amazonaws.com/${process.env.AWS_COGNITO_USER_POOL_ID}`;
      const googleAuthIssuer = 'futbolify-google-auth';
      const appleAuthIssuer = 'futbolify-apple-auth';

      console.log('[JWT-Auth] Expected issuers:', { cognitoIssuer, googleAuthIssuer, appleAuthIssuer });

      const isValidIssuer = decodedToken.iss === cognitoIssuer ||
        decodedToken.iss === googleAuthIssuer ||
        decodedToken.iss === appleAuthIssuer;

      if (!isValidIssuer) {
        console.log('[JWT-Auth] Invalid issuer:', decodedToken.iss);
        return this.fail(
          new UnauthorizedException('Token issuer is invalid'),
          401,
        );
      }

      const tokenType = decodedToken.iss === googleAuthIssuer ? 'google-auth' :
        decodedToken.iss === appleAuthIssuer ? 'apple-auth' : 'cognito';
      console.log('[JWT-Auth] Issuer valid, type:', tokenType);

      // For Google-auth and Apple-auth tokens, verify the signature
      if (decodedToken.iss === googleAuthIssuer || decodedToken.iss === appleAuthIssuer) {
        console.log(`[JWT-Auth] Verifying ${tokenType} token signature...`);
        try {
          jwt.verify(token, process.env.JWT_SECRET || 'futbolify-secret-key');
          console.log(`[JWT-Auth] ${tokenType} token signature valid`);
        } catch (verifyError) {
          console.log(`[JWT-Auth] ${tokenType} token signature INVALID:`, verifyError.message);
          return this.fail(
            new UnauthorizedException('Invalid token signature'),
            401,
          );
        }
      }

      // Buscar al usuario en la base de datos (case-insensitive)
      console.log('[JWT-Auth] Looking up user by email:', decodedToken.email);
      const user = await this.userModel
        .findOne({
          email: { $regex: new RegExp(`^${decodedToken.email}$`, 'i') }
        })
        .exec();

      if (!user) {
        console.log('[JWT-Auth] User NOT FOUND in database for email:', decodedToken.email);
        return this.fail(
          new UnauthorizedException('User not found in database'),
          401,
        );
      }

      console.log('[JWT-Auth] User found:', { id: user._id.toString(), email: user.email });

      // Preparar la información del usuario con roles de la base de datos
      const userInfo = {
        userId: user._id.toString(),
        username: user.email,
        roles: user.roles || [],
        phone: user.phone,
      };

      console.log('[JWT-Auth] Authentication SUCCESS for:', userInfo.userId);
      return this.success(userInfo); // Autenticación exitosa
    } catch (err) {
      console.log('[JWT-Auth] Token validation FAILED:', err.message);
      return this.fail(
        new UnauthorizedException('Token validation failed'),
        401,
      );
    }
  }
}
