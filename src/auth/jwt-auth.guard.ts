import { Injectable, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Auth Guard for REST and GraphQL endpoints
 * Uses the 'cognito' strategy for Amazon Cognito authentication
 * Handles both HTTP requests and GraphQL context
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('cognito') {
  getRequest(context: ExecutionContext) {
    // Check if this is a GraphQL context
    const contextType = context.getType<string>();

    if (contextType === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      const gqlContext = ctx.getContext();
      const req = gqlContext.req;

      if (!req) {
        // Return a minimal request object to prevent Passport crash
        return {
          headers: {},
          logIn: () => Promise.resolve(),
          logOut: () => {},
          isAuthenticated: () => false,
          isUnauthenticated: () => true,
        };
      }

      // Add missing Passport methods for synthetic req objects
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

    // For HTTP requests, use the default behavior
    return context.switchToHttp().getRequest();
  }
}
