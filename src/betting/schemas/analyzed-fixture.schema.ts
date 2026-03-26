import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type AnalyzedFixtureDocument = AnalyzedFixture & Document

/**
 * AnalyzedFixture Schema
 *
 * Tracks which fixtures have been analyzed to avoid redundant API calls.
 * This is the core of the "smart scanning" optimization that reduces
 * API-Football usage by ~95%.
 *
 * Logic:
 * - When a fixture is analyzed, we record it here with a timestamp
 * - On subsequent scans, we skip fixtures that are already in this collection
 * - We re-analyze if:
 *   1. The fixture is within 3 hours of kickoff (odds stabilize closer to match)
 *   2. Last analysis was > 6 hours ago (catch significant odds movements)
 * - Records are auto-deleted after 2 days (TTL index)
 *
 * API Savings Example:
 * - Without tracking: 48 scans/day × 320 requests = 15,360 requests/day
 * - With tracking: ~600 requests/day (first scan + new fixtures only)
 */
@Schema({
  collection: 'betting_analyzed_fixtures',
  timestamps: true,
})
export class AnalyzedFixture {
  /**
   * API-Football fixture ID
   */
  @Prop({ required: true, index: true })
  fixtureId: number

  /**
   * Date of the match (YYYY-MM-DD format)
   * Used to query fixtures for a specific day
   */
  @Prop({ required: true, index: true })
  date: string

  /**
   * League ID for reference
   */
  @Prop({ required: true })
  leagueId: number

  /**
   * Match kickoff time
   */
  @Prop({ required: true })
  kickoff: Date

  /**
   * When this fixture was last analyzed
   */
  @Prop({ required: true, default: () => new Date() })
  lastAnalyzedAt: Date

  /**
   * Number of times this fixture has been analyzed
   */
  @Prop({ default: 1 })
  analysisCount: number

  /**
   * Whether a pick was generated from this fixture
   */
  @Prop({ default: false })
  pickGenerated: boolean

  /**
   * Home team name (for debugging/logs)
   */
  @Prop()
  homeTeam: string

  /**
   * Away team name (for debugging/logs)
   */
  @Prop()
  awayTeam: string

  /**
   * Auto-delete after 2 days (TTL index)
   * MongoDB will automatically remove old records
   */
  @Prop({
    type: Date,
    default: () => new Date(),
    expires: 172800 // 2 days in seconds
  })
  expiresAt: Date
}

export const AnalyzedFixtureSchema = SchemaFactory.createForClass(AnalyzedFixture)

// Compound index for efficient lookups
AnalyzedFixtureSchema.index({ fixtureId: 1, date: 1 }, { unique: true })
AnalyzedFixtureSchema.index({ date: 1, lastAnalyzedAt: 1 })
