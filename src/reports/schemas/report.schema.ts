import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum ReportType {
  COMMENT = 'COMMENT_REPORT',
  POST = 'POST_REPORT',
  USER = 'USER_REPORT',
  QUINIELA = 'QUINIELA_REPORT',
  MESSAGE = 'MESSAGE_REPORT',
}

registerEnumType(ReportType, {
  name: 'ReportType',
  description: 'Type of content being reported',
});

export enum ReportStatus {
  PENDING = 'PENDING',
  REVIEWED = 'REVIEWED',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

registerEnumType(ReportStatus, {
  name: 'ReportStatus',
  description: 'Status of the report',
});

export enum ReportReason {
  SPAM = 'SPAM',
  HARASSMENT = 'HARASSMENT',
  HATE_SPEECH = 'HATE_SPEECH',
  VIOLENCE = 'VIOLENCE',
  NUDITY = 'NUDITY',
  FALSE_INFORMATION = 'FALSE_INFORMATION',
  SCAM = 'SCAM',
  INAPPROPRIATE = 'INAPPROPRIATE',
  COPYRIGHT = 'COPYRIGHT',
  OTHER = 'OTHER',
}

registerEnumType(ReportReason, {
  name: 'ReportReason',
  description: 'Reason for reporting',
});

@Schema({ timestamps: true, collection: 'reports' })
@ObjectType()
export class Report extends Document {
  @Field(() => ID)
  id: string;

  @Field(() => ReportType)
  @Prop({ required: true, enum: ReportType, index: true })
  reportType: ReportType;

  @Field()
  @Prop({ required: true, index: true })
  referenceId: string;

  @Field(() => ReportReason)
  @Prop({ required: true, enum: ReportReason })
  reason: ReportReason;

  @Field({ nullable: true })
  @Prop()
  additionalInfo?: string;

  @Field()
  @Prop({ required: true, index: true })
  reporterId: string;

  @Field({ nullable: true })
  @Prop()
  reporterEmail?: string;

  @Field(() => ReportStatus)
  @Prop({ default: ReportStatus.PENDING, enum: ReportStatus, index: true })
  status: ReportStatus;

  @Field({ nullable: true })
  @Prop()
  reviewedBy?: string;

  @Field({ nullable: true })
  @Prop()
  reviewedAt?: Date;

  @Field({ nullable: true })
  @Prop()
  resolution?: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

// Index for finding duplicate reports
ReportSchema.index({ reportType: 1, referenceId: 1, reporterId: 1 }, { unique: true });

// Index for admin queries
ReportSchema.index({ status: 1, createdAt: -1 });
