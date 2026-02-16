import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GqlAuthGuard extends AuthGuard('cognito') {
  // Use the 'cognito' strategy we've configured for Amazon Cognito
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    const gqlContext = ctx.getContext();
    const req = gqlContext.req;
    const info = ctx.getInfo();

    if (!req) {
      console.error('[GqlAuthGuard] ERROR: req is undefined for operation:', info?.fieldName);
      // Return a minimal request object to prevent Passport crash
      return {
        headers: {},
        // Add stub methods that Passport expects
        logIn: () => Promise.resolve(),
        logOut: () => {},
        isAuthenticated: () => false,
        isUnauthenticated: () => true,
      };
    }

    // For synthetic req objects (WebSocket subscriptions), add missing Passport methods
    if (!req.logIn) {
      req.logIn = (user: unknown, callback?: (err?: Error) => void) => {
        req.user = user;
        if (callback) callback();
        return Promise.resolve();
      };
    }
    if (!req.logOut) {
      req.logOut = (callback?: (err?: Error) => void) => {
        req.user = undefined;
        if (callback) callback();
      };
    }
    if (!req.isAuthenticated) {
      req.isAuthenticated = () => !!req.user;
    }
    if (!req.isUnauthenticated) {
      req.isUnauthenticated = () => !req.user;
    }

    return req;
  }

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext
  ): TUser {
    const ctx = GqlExecutionContext.create(context);
    const gqlInfo = ctx.getInfo();

    if (err || !user) {
      console.error(
        '[GqlAuthGuard] Auth failed for operation:',
        gqlInfo?.fieldName,
        '| Error:',
        err?.message || 'No user'
      );
      throw err || new UnauthorizedException('Authentication required');
    }

    return user;
  }
}
