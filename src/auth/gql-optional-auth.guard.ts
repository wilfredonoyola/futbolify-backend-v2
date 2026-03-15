import { Injectable, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional Auth Guard - attempts to authenticate but doesn't fail if no token
 * Use this for endpoints that work for both authenticated and anonymous users
 */
@Injectable()
export class GqlOptionalAuthGuard extends AuthGuard('cognito') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    const gqlContext = ctx.getContext();
    const req = gqlContext.req;

    if (!req) {
      return {
        headers: {},
        logIn: () => Promise.resolve(),
        logOut: () => {},
        isAuthenticated: () => false,
        isUnauthenticated: () => true,
      };
    }

    // Add missing Passport methods
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
  ): TUser | null {
    // Don't throw error - just return null if not authenticated
    // This allows the resolver to handle both authenticated and anonymous users
    if (err || !user) {
      return null;
    }
    return user;
  }
}
