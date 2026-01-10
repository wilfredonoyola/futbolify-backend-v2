import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsEnum } from 'class-validator';
import { TeamColor } from '../schemas/team.schema';

@InputType()
export class CreateTeamInput {
  @Field()
  @IsNotEmpty()
  name: string;

  @Field(() => TeamColor)
  @IsEnum(TeamColor)
  color: TeamColor;
}

