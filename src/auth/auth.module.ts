import { Module, forwardRef, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthResolver } from './auth.resolver';
import { UsersModule } from '../users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from 'src/users/schemas/user.schema';
import { AwsCognitoAuthStrategy } from './strategies/jwt-auth.strategy';
import { AuthMiddleware } from './auth.middleware';
import { BunnyModule } from '../bunny/bunny.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    PassportModule,
    JwtModule.register({
      secret: 'secretKey',
      signOptions: { expiresIn: '1h' },
    }),
    BunnyModule,
  ],
  providers: [AuthService, AuthResolver, AwsCognitoAuthStrategy, AuthMiddleware],
  exports: [AuthService, JwtModule, AuthMiddleware],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply auth middleware to all GraphQL requests
    consumer.apply(AuthMiddleware).forRoutes('graphql');
  }
}
