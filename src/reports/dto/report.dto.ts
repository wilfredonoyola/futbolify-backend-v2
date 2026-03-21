import { Field, InputType, ObjectType, ID, Int } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportType, ReportReason, ReportStatus } from '../schemas/report.schema';

// ============================================
// Input DTOs
// ============================================

@InputType()
export class GenerateReportInput {
  @Field(() => ReportType)
  @IsEnum(ReportType)
  @IsNotEmpty()
  reportType: ReportType;

  @Field()
  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @Field(() => ReportReason)
  @IsEnum(ReportReason)
  @IsNotEmpty()
  reason: ReportReason;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  additionalInfo?: string;
}

// Legacy input format (for backwards compatibility with old app)
@InputType()
export class LegacyGenerateReportInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  reportType: string; // "COMMENT_REPORT", "POST_REPORT", etc.

  @Field()
  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  reasonId: string; // Maps to ReportReason enum
}

// ============================================
// Output DTOs
// ============================================

@ObjectType()
export class ReportReasonOutput {
  @Field(() => ID)
  id: string;

  @Field()
  value: string;

  @Field()
  title: string;

  @Field()
  description: string;
}

@ObjectType()
export class GenerateReportData {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  reportId?: string;
}

@ObjectType()
export class GenerateReportResponse {
  @Field(() => GenerateReportData, { nullable: true })
  data?: GenerateReportData;

  @Field(() => [String], { nullable: true })
  errors?: string[];

  @Field({ nullable: true })
  message?: string;
}

@ObjectType()
export class ReportOutput {
  @Field(() => ID)
  id: string;

  @Field(() => ReportType)
  reportType: ReportType;

  @Field()
  referenceId: string;

  @Field(() => ReportReason)
  reason: ReportReason;

  @Field({ nullable: true })
  additionalInfo?: string;

  @Field()
  reporterId: string;

  @Field(() => ReportStatus)
  status: ReportStatus;

  @Field()
  createdAt: Date;
}

@ObjectType()
export class ReportsListResponse {
  @Field(() => [ReportOutput])
  reports: ReportOutput[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

// ============================================
// Helper: Map legacy reason IDs to enum
// ============================================

export const LEGACY_REASON_MAP: Record<string, ReportReason> = {
  // Spanish reasons from old app
  'spam': ReportReason.SPAM,
  'acoso': ReportReason.HARASSMENT,
  'odio': ReportReason.HATE_SPEECH,
  'violencia': ReportReason.VIOLENCE,
  'desnudez': ReportReason.NUDITY,
  'informacion_falsa': ReportReason.FALSE_INFORMATION,
  'estafa': ReportReason.SCAM,
  'inapropiado': ReportReason.INAPPROPRIATE,
  'derechos_autor': ReportReason.COPYRIGHT,
  'otro': ReportReason.OTHER,
  // English reasons
  'harassment': ReportReason.HARASSMENT,
  'hate_speech': ReportReason.HATE_SPEECH,
  'violence': ReportReason.VIOLENCE,
  'nudity': ReportReason.NUDITY,
  'false_information': ReportReason.FALSE_INFORMATION,
  'scam': ReportReason.SCAM,
  'inappropriate': ReportReason.INAPPROPRIATE,
  'copyright': ReportReason.COPYRIGHT,
  'other': ReportReason.OTHER,
  // Numeric IDs (if used)
  '1': ReportReason.SPAM,
  '2': ReportReason.HARASSMENT,
  '3': ReportReason.HATE_SPEECH,
  '4': ReportReason.VIOLENCE,
  '5': ReportReason.NUDITY,
  '6': ReportReason.FALSE_INFORMATION,
  '7': ReportReason.SCAM,
  '8': ReportReason.INAPPROPRIATE,
  '9': ReportReason.COPYRIGHT,
  '10': ReportReason.OTHER,
};

export const LEGACY_TYPE_MAP: Record<string, ReportType> = {
  'COMMENT_REPORT': ReportType.COMMENT,
  'POST_REPORT': ReportType.POST,
  'USER_REPORT': ReportType.USER,
  'QUINIELA_REPORT': ReportType.QUINIELA,
  'MESSAGE_REPORT': ReportType.MESSAGE,
};
