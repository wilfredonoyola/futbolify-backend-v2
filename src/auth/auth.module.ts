import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthResolver } from './auth.resolver';
import { UsersModule } from '../users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from 'src/users/schemas/user.schema';
import { AwsCognitoAuthStrategy } from './strategies/jwt-auth.strategy';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    PassportModule,
    JwtModule.register({
      secret: 'secretKey',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [AuthService, AuthResolver, AwsCognitoAuthStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
