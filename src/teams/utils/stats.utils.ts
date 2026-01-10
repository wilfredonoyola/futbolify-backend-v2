import { Model, Types } from 'mongoose';
import { TeamDocument } from '../schemas/team.schema';
import { TeamMatchDocument } from '../schemas/team-match.schema';
import { MediaDocument } from '../schemas/media.schema';
import { TeamMemberDocument } from '../schemas/team-member.schema';
import { MediaTagDocument } from '../schemas/media-tag.schema';

export class StatsUtils {
  /**
   * Get statistics for a team
   */
  static async getTeamStats(
    teamId: string,
    matchModel: Model<TeamMatchDocument>,
    mediaModel: Model<MediaDocument>,
    memberModel: Model<TeamMemberDocument>,
  ): Promise<{ matchCount: number; mediaCount: number; memberCount: number }> {
    const teamObjectId = new Types.ObjectId(teamId);

    // Count matches
    const matchCount = await matchModel.countDocuments({ teamId: teamObjectId });

    // Get all match IDs for this team
    const matches = await matchModel.find({ teamId: teamObjectId }).select('_id');
    const matchIds = matches.map((m) => m._id);

    // Count media for all matches
    const mediaCount = await mediaModel.countDocuments({
      matchId: { $in: matchIds },
    });

    // Count members
    const memberCount = await memberModel.countDocuments({ teamId: teamObjectId });

    return { matchCount, mediaCount, memberCount };
  }

  /**
   * Get statistics for a match
   */
  static async getMatchStats(
    matchId: string,
    mediaModel: Model<MediaDocument>,
  ): Promise<{ photoCount: number; videoCount: number; highlightCount: number }> {
    const matchObjectId = new Types.ObjectId(matchId);

    const [photoCount, videoCount, highlightCount] = await Promise.all([
      mediaModel.countDocuments({ matchId: matchObjectId, type: 'PHOTO' }),
      mediaModel.countDocuments({ matchId: matchObjectId, type: 'VIDEO' }),
      mediaModel.countDocuments({ matchId: matchObjectId, isHighlight: true }),
    ]);

    return { photoCount, videoCount, highlightCount };
  }

  /**
   * Get profile statistics for a user
   */
  static async getProfileStats(
    userId: string,
    mediaTagModel: Model<MediaTagDocument>,
    mediaModel: Model<MediaDocument>,
  ): Promise<{ goalCount: number; videoCount: number; photoCount: number }> {
    const userObjectId = new Types.ObjectId(userId);

    // Get all media where user is tagged
    const tags = await mediaTagModel.find({ userId: userObjectId }).select('mediaId');
    const mediaIds = tags.map((t) => t.mediaId);

    if (mediaIds.length === 0) {
      return { goalCount: 0, videoCount: 0, photoCount: 0 };
    }

    const [goalCount, videoCount, photoCount] = await Promise.all([
      mediaModel.countDocuments({
        _id: { $in: mediaIds },
        category: 'GOAL',
      }),
      mediaModel.countDocuments({
        _id: { $in: mediaIds },
        type: 'VIDEO',
      }),
      mediaModel.countDocuments({
        _id: { $in: mediaIds },
        type: 'PHOTO',
      }),
    ]);

    return { goalCount, videoCount, photoCount };
  }
}

