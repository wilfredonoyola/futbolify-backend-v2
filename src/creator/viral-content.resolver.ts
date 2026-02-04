import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { ViralContentService } from './viral-content.service';
import {
  GenerateViralContentInput,
  ViralContentResponse,
} from './dto/viral-content.dto';

@Resolver()
export class ViralContentResolver {
  constructor(private readonly viralContentService: ViralContentService) {}

  /**
   * Generate viral content options for a match event
   */
  @Mutation(() => ViralContentResponse)
  @UseGuards(GqlAuthGuard)
  async generateViralContent(
    @Args('input') input: GenerateViralContentInput
  ): Promise<ViralContentResponse> {
    try {
      const result = await this.viralContentService.generateViralContent({
        eventType: input.eventType as any,
        minute: input.minute,
        playerName: input.playerName,
        assistName: input.assistName,
        detail: input.detail,
        homeTeam: input.homeTeam,
        awayTeam: input.awayTeam,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        competition: input.competition,
        round: input.round,
        venue: input.venue,
        isHome: input.isHome,
        ourTeam: input.ourTeam,
        possession: input.possession,
        shots: input.shots,
        shotsOnTarget: input.shotsOnTarget,
      });

      return {
        success: true,
        eventSummary: result.eventSummary,
        options: result.options,
        generatedAt: result.generatedAt,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
