import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Auth Guard for REST endpoints
 * Uses the same 'cognito' strategy as GqlAuthGuard but for HTTP requests
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('cognito') {}
