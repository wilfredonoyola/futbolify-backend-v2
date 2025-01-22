import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UserRole } from 'src/users/schemas/user.schema';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<UserRole[]>('roles', context.getHandler());
    if (!roles) {
      return true;
    }

    const ctx = GqlExecutionContext.create(context);
    const { req } = ctx.getContext();
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return false;

    const decoded = this.jwtService.decode(token) as any;

    // Detect and map roles based on token origin
    let userRoles: UserRole[] = [];

    if (decoded.roles) {
      // Local JWT case
      userRoles = decoded.roles;
    } else if (decoded['cognito:groups']) {
      // Cognito Case Study: Map Cognito Groups to UserRole
      userRoles = this.mapCognitoGroupsToUserRoles(decoded['cognito:groups']);
    }

    console.log('userRoles , ', userRoles);

    return roles.some((role) => userRoles.includes(role));
  }

  // Method to map Cognito groups to UserRole enum
  private mapCognitoGroupsToUserRoles(groups: string[]): UserRole[] {
    return groups.map((group) => {
      switch (group) {
        case 'admins':
          return UserRole.ADMIN;
        case 'super_admins':
          return UserRole.SUPER_ADMIN;
        default:
          return UserRole.USER;
      }
    });
  }
}
