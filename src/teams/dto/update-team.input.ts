import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsEnum } from 'class-validator';
import { TeamColor } from '../schemas/team.schema';

@InputType()
export class UpdateTeamInput {
  @Field({ nullable: true })
  @IsOptional()
  name?: string;

  @Field(() => TeamColor, { nullable: true })
  @IsOptional()
  @IsEnum(TeamColor)
  color?: TeamColor;
}

