import { InputType, Field, ID } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsEnum, IsMongoId, IsBoolean } from 'class-validator';
import { MediaCategory } from '../../teams/schemas/media.schema';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { FileUpload } from 'graphql-upload/Upload.mjs';

@InputType()
export class UploadPhotoInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsMongoId()
  matchId: string;

  @Field(() => GraphQLUpload)
  file: Promise<FileUpload>;

  @Field(() => MediaCategory, { nullable: true })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  isHighlight?: boolean;
}

@InputType()
export class UploadVideoInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsMongoId()
  matchId: string;

  @Field(() => GraphQLUpload)
  file: Promise<FileUpload>;

  @Field(() => MediaCategory, { nullable: true })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  isHighlight?: boolean;
}
