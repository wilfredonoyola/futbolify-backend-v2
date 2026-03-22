import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Firebase')
@Controller('firebase')
export class FirebaseController {
  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * Get a Firebase custom token for the authenticated user
   * This token can be used to authenticate with Firebase services (Realtime Database, etc.)
   */
  @Get('token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Firebase custom token for authenticated user' })
  async getFirebaseToken(@Request() req): Promise<{ token: string }> {
    const userId = req.user.id || req.user.sub || req.user.userId;

    // Include user info as additional claims
    const additionalClaims = {
      email: req.user.email,
      username: req.user.username,
    };

    const token = await this.firebaseService.createCustomToken(
      userId,
      additionalClaims,
    );

    return { token };
  }
}
