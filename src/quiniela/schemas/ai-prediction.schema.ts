// MongoDB Schema for AI Predictions (World Cup 2026 Quiniela)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'ai_predictions' })
export class AIPredictionDoc {
  _id: Types.ObjectId;

  @Prop({ required: true, index: true })
  matchId: string;

  @Prop({ required: true })
  homeTeamId: string;

  @Prop({ required: true })
  awayTeamId: string;

  @Prop({ required: true })
  homeScore: number;

  @Prop({ required: true })
  awayScore: number;

  @Prop({ required: true, min: 0, max: 100 })
  confidence: number;

  @Prop({ required: true })
  reasoning: string;

  @Prop({ default: false })
  isUpset: boolean;

  // Match result (filled after match ends)
  @Prop()
  actualHomeScore?: number;

  @Prop()
  actualAwayScore?: number;

  @Prop({ default: false })
  isEvaluated: boolean;

  @Prop()
  wasCorrectDirection?: boolean; // AI predicted correct winner/draw

  @Prop()
  wasExactScore?: boolean; // AI predicted exact score

  createdAt: Date;
  updatedAt: Date;
}

export type AIPredictionDocument = AIPredictionDoc & Document;

export const AIPredictionSchema = SchemaFactory.createForClass(AIPredictionDoc);

// Indexes
AIPredictionSchema.index({ matchId: 1 }, { unique: true });
AIPredictionSchema.index({ isEvaluated: 1 });
AIPredictionSchema.index({ createdAt: -1 });
