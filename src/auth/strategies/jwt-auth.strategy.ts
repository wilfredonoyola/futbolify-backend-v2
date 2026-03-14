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
      return this.fail(
        new UnauthorizedException('Authorization header not found'),
        401,
      );
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return this.fail(new UnauthorizedException('Token not found'), 401);
    }

    try {
      const decodedToken = jwt.decode(token) as any;

      // Check token issuer - accept both Cognito and Google-auth tokens
      const cognitoIssuer = `https://cognito-idp.${process.env.AWS_COGNITO_REGION}.amazonaws.com/${process.env.AWS_COGNITO_USER_POOL_ID}`;
      const googleAuthIssuer = 'futbolify-google-auth';

      const isValidIssuer = decodedToken.iss === cognitoIssuer || decodedToken.iss === googleAuthIssuer;

      if (!isValidIssuer) {
        return this.fail(
          new UnauthorizedException('Token issuer is invalid'),
          401,
        );
      }

      // For Google-auth tokens, verify the signature
      if (decodedToken.iss === googleAuthIssuer) {
        try {
          jwt.verify(token, process.env.JWT_SECRET || 'futbolify-secret-key');
        } catch (verifyError) {
          return this.fail(
            new UnauthorizedException('Invalid token signature'),
            401,
          );
        }
      }

      // Buscar al usuario en la base de datos (case-insensitive)
      const user = await this.userModel
        .findOne({
          email: { $regex: new RegExp(`^${decodedToken.email}$`, 'i') }
        })
        .exec();

      if (!user) {
        return this.fail(
          new UnauthorizedException('User not found in database'),
          401,
        );
      }

      // Preparar la información del usuario con roles de la base de datos
      const userInfo = {
        userId: user._id.toString(),
        username: user.email,
        roles: user.roles || [],
        phone: user.phone,
      };

      return this.success(userInfo); // Autenticación exitosa
    } catch (err) {
      return this.fail(
        new UnauthorizedException('Token validation failed'),
        401,
      );
    }
  }
}
