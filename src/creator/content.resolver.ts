import { Resolver, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ContentService } from './content.service';
import { GenerationService } from './generation.service';
import { ContentSuggestionsResponse } from './dto/content-suggestion.output';
import { FetchContentInput } from './dto/fetch-content.input';
import { BrandService } from './brand.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class ContentResolver {
  constructor(
    private readonly contentService: ContentService,
    private readonly brandService: BrandService,
    private readonly generationService: GenerationService,
  ) {}

  /**
   * Fetch content suggestions based on input parameters
   */
  @Query(() => ContentSuggestionsResponse, { name: 'contentSuggestions' })
  async getContentSuggestions(
    @CurrentUser() user: any,
    @Args('input') input: FetchContentInput,
  ): Promise<ContentSuggestionsResponse> {
    let response: ContentSuggestionsResponse;

    // If brandId is provided, get the brand's content preferences
    if (input.brandId) {
      const brand = await this.brandService.findOne(input.brandId, user.userId);
      if (brand && brand.contentPreferences) {
        // Use brand preferences if not overridden in input
        response = await this.contentService.fetchContent({
          pageType: input.pageType || brand.contentPreferences.pageType || 'single-team',
          teamId: input.teamId || brand.contentPreferences.teamId,
          teamIds: input.teamIds || brand.contentPreferences.additionalTeams || [],
          leagueId: input.leagueId || brand.contentPreferences.leagueId,
          sourceLanguages: input.sourceLanguages || brand.contentPreferences.sourceLanguages,
          limit: input.limit,
        });
      } else {
        response = await this.contentService.fetchContent(input);
      }
    } else {
      response = await this.contentService.fetchContent(input);
    }

    // Cache suggestions for post generation
    if (response.success && response.content.length > 0) {
      this.generationService.cacheSuggestions(response.content);
    }

    return response;
  }

  /**
   * Fetch content for the user's active brand
   */
  @Query(() => ContentSuggestionsResponse, { name: 'activeBrandContent' })
  async getActiveBrandContent(
    @CurrentUser() user: any,
    @Args('limit', { nullable: true, defaultValue: 25 }) limit: number,
  ): Promise<ContentSuggestionsResponse> {
    const activeBrand = await this.brandService.findActiveBrand(user.userId);

    if (!activeBrand) {
      return {
        success: false,
        content: [],
        meta: {
          pageType: 'single-team' as any,
          totalItems: 0,
          urgentCount: 0,
          highPriorityCount: 0,
          fetchedAt: new Date(),
        },
        error: 'No active brand found. Please complete onboarding first.',
      };
    }

    const contentPrefs = activeBrand.contentPreferences;

    const response = await this.contentService.fetchContent({
      pageType: contentPrefs?.pageType || 'single-team',
      teamId: contentPrefs?.teamId,
      teamIds: contentPrefs?.additionalTeams || [],
      leagueId: contentPrefs?.leagueId,
      sourceLanguages: contentPrefs?.sourceLanguages || ['es', 'en'],
      limit,
    });

    // Cache suggestions for post generation
    if (response.success && response.content.length > 0) {
      this.generationService.cacheSuggestions(response.content);
    }

    return response;
  }
}
