import { Field, InputType, ID } from '@nestjs/graphql'
import { IsNotEmpty, IsString, IsOptional, IsEnum, MaxLength } from 'class-validator'
import { MessageType } from '../schemas/message.schema'

@InputType()
export class SendMessageInput {
  @Field(() => ID)
  @IsNotEmpty()
  streamId: string

  @Field()
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  content: string

  @Field(() => MessageType, { nullable: true, defaultValue: MessageType.TEXT })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType
}
