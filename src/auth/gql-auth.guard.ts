import { Injectable, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GqlAuthGuard extends AuthGuard('cognito') {
  // Use the 'cognito' strategy we've configured for Amazon Cognito
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;
    const info = ctx.getInfo();
    console.log('[GqlAuthGuard] Operation:', info?.fieldName, '| req exists:', !!req);
    if (!req) {
      console.error('[GqlAuthGuard] ERROR: req is undefined for operation:', info?.fieldName);
    }
    return req;
  }
}
