import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContentSuggestion, ContentStatus, ClaimedBy } from './dto/content-suggestion.output';

export interface ContentClaim {
  contentId: string;
  brandId: string;
  claimedBy: string; // userId
  claimedByName: string;
  claimedByAvatar?: string;
  claimedAt: Date;
  status: ContentStatus;
  seenBy: string[]; // array of userIds
  completedAt?: Date;
  expiresAt?: Date; // auto-release after 24h
}

export interface ContentClaimDocument extends ContentClaim, Document {}

@Injectable()
export class ContentClaimService {
  // In-memory storage (replace with MongoDB later)
  private claims: Map<string, ContentClaim> = new Map();

  /**
   * Claim content for a user
   */
  async claimContent(
    contentId: string,
    brandId: string,
    userId: string,
    userName: string,
    userAvatar?: string,
  ): Promise<ContentClaim> {
    const key = `${brandId}:${contentId}`;
    const existingClaim = this.claims.get(key);

    // Check if already claimed by someone else
    if (existingClaim && existingClaim.status === ContentStatus.CLAIMED) {
      if (existingClaim.claimedBy !== userId) {
        throw new ForbiddenException('Content already claimed by another user');
      }
      // Already claimed by this user, return existing
      return existingClaim;
    }

    // Check if already completed
    if (existingClaim && existingClaim.status === ContentStatus.DONE) {
      throw new BadRequestException('Content already completed');
    }

    const now = new Date();
    const claim: ContentClaim = {
      contentId,
      brandId,
      claimedBy: userId,
      claimedByName: userName,
      claimedByAvatar: userAvatar,
      claimedAt: now,
      status: ContentStatus.CLAIMED,
      seenBy: existingClaim?.seenBy || [],
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h expiry
    };

    this.claims.set(key, claim);
    return claim;
  }

  /**
   * Unclaim/release content
   */
  async unclaimContent(
    contentId: string,
    brandId: string,
    userId: string,
  ): Promise<ContentClaim> {
    const key = `${brandId}:${contentId}`;
    const claim = this.claims.get(key);

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    // Only the user who claimed it can unclaim (or admin)
    if (claim.claimedBy !== userId) {
      throw new ForbiddenException('You can only unclaim your own content');
    }

    claim.status = ContentStatus.AVAILABLE;
    claim.claimedBy = '';
    claim.claimedByName = '';
    claim.claimedByAvatar = undefined;
    claim.claimedAt = new Date();

    this.claims.set(key, claim);
    return claim;
  }

  /**
   * Mark content as done
   */
  async markContentDone(
    contentId: string,
    brandId: string,
    userId: string,
  ): Promise<ContentClaim> {
    const key = `${brandId}:${contentId}`;
    const claim = this.claims.get(key);

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    // Only the user who claimed it can mark as done
    if (claim.claimedBy !== userId) {
      throw new ForbiddenException('You can only complete your own claimed content');
    }

    claim.status = ContentStatus.DONE;
    claim.completedAt = new Date();

    this.claims.set(key, claim);
    return claim;
  }

  /**
   * Mark content as seen by a user
   */
  async markContentSeen(
    contentId: string,
    brandId: string,
    userId: string,
  ): Promise<ContentClaim> {
    const key = `${brandId}:${contentId}`;
    let claim = this.claims.get(key);

    if (!claim) {
      // Create initial claim record for tracking
      claim = {
        contentId,
        brandId,
        claimedBy: '',
        claimedByName: '',
        claimedAt: new Date(),
        status: ContentStatus.AVAILABLE,
        seenBy: [],
      };
    }

    if (!claim.seenBy.includes(userId)) {
      claim.seenBy.push(userId);
      this.claims.set(key, claim);
    }

    return claim;
  }

  /**
   * Get claim for content
   */
  async getClaim(contentId: string, brandId: string): Promise<ContentClaim | null> {
    const key = `${brandId}:${contentId}`;
    return this.claims.get(key) || null;
  }

  /**
   * Get all claims for a brand
   */
  async getBrandClaims(brandId: string): Promise<ContentClaim[]> {
    const claims: ContentClaim[] = [];
    
    for (const [key, claim] of this.claims.entries()) {
      if (claim.brandId === brandId) {
        claims.push(claim);
      }
    }

    return claims;
  }

  /**
   * Clean up expired claims (run periodically)
   */
  async cleanExpiredClaims(): Promise<void> {
    const now = new Date();

    for (const [key, claim] of this.claims.entries()) {
      if (claim.expiresAt && claim.expiresAt < now && claim.status === ContentStatus.CLAIMED) {
        // Auto-release expired claims
        claim.status = ContentStatus.AVAILABLE;
        claim.claimedBy = '';
        claim.claimedByName = '';
        claim.claimedByAvatar = undefined;
        this.claims.set(key, claim);
      }
    }
  }

  /**
   * Enrich content suggestions with claim data
   */
  enrichContentWithClaims(
    suggestions: ContentSuggestion[],
    claims: ContentClaim[],
  ): ContentSuggestion[] {
    const claimMap = new Map<string, ContentClaim>();
    claims.forEach((claim) => {
      claimMap.set(claim.contentId, claim);
    });

    return suggestions.map((suggestion) => {
      const claim = claimMap.get(suggestion.id);
      
      if (claim) {
        return {
          ...suggestion,
          status: claim.status,
          claimedBy: claim.claimedBy ? {
            id: claim.claimedBy,
            name: claim.claimedByName,
            avatar: claim.claimedByAvatar,
          } : undefined,
          claimedAt: claim.claimedAt,
          seenBy: claim.seenBy,
        };
      }

      return {
        ...suggestion,
        status: ContentStatus.AVAILABLE,
        seenBy: [],
      };
    });
  }
}
