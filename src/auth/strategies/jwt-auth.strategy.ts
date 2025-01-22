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

      // Verificar que el token fue emitido por tu Cognito User Pool
      const issuer = `https://cognito-idp.${process.env.AWS_COGNITO_REGION}.amazonaws.com/${process.env.AWS_COGNITO_USER_POOL_ID}`;
      if (decodedToken.iss !== issuer) {
        return this.fail(
          new UnauthorizedException('Token issuer is invalid'),
          401,
        );
      }

      // Obtener los roles del token
      const roles = decodedToken['cognito:groups'] || [];

      // Buscar al usuario en la base de datos
      let user;
      if (roles.includes('SUPER_ADMIN')) {
        // Si es SUPER_ADMIN, no intentamos asociar una empresa
        user = await this.userModel
          .findOne({ email: decodedToken.email })
          .exec();
      } else {
        // Para otros roles, buscar al usuario y populamos la empresa
        user = await this.userModel
          .findOne({ email: decodedToken.email })
          .populate('company') // Incluir la empresa si no es SUPER_ADMIN
          .exec();
      }

      if (!user) {
        return this.fail(
          new UnauthorizedException('User not found in database'),
          401,
        );
      }

      // Preparar la información del usuario
      const userInfo = {
        id: user._id,
        username: user.email,
        roles: roles,
        company: roles.includes('SUPER_ADMIN') ? null : user.company, // Si es SUPER_ADMIN, no tiene empresa
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
