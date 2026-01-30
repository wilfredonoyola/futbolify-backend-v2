import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsDate } from 'class-validator'
import { StreamSport } from '../schemas/stream.schema'

@InputType()
export class CreateStreamInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  title: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string

  @Field(() => StreamSport, { nullable: true, defaultValue: StreamSport.SOCCER })
  @IsOptional()
  @IsEnum(StreamSport)
  sport?: StreamSport

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  homeTeam?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  awayTeam?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsDate()
  scheduledAt?: Date
}
