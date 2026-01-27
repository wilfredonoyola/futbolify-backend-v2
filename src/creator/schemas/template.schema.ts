import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Field, ObjectType, ID, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@Schema({ timestamps: true })
@ObjectType()
export class Template extends Document {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Field(() => ID, { nullable: true })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Brand' })
  brandId?: MongooseSchema.Types.ObjectId;

  @Field()
  @Prop({ required: true })
  name: string;

  @Field({ nullable: true })
  @Prop()
  description?: string;

  @Field()
  @Prop({ required: true })
  category: string;

  @Field({ nullable: true })
  @Prop()
  thumbnail?: string;

  @Field(() => Int)
  @Prop({ required: true })
  width: number;

  @Field(() => Int)
  @Prop({ required: true })
  height: number;

  @Field()
  @Prop({ required: true })
  backgroundColor: string;

  // Store template data as JSON (elements, metadata, etc.)
  @Field(() => GraphQLJSON)
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  templateData: Record<string, any>;

  // Tags for searching
  @Field(() => [String], { nullable: true })
  @Prop({ type: [String] })
  tags?: string[];

  @Field()
  @Prop({ default: false })
  isPublished: boolean;

  @Field()
  @Prop({ default: false })
  isPreset: boolean;

  @Field({ nullable: true })
  @Prop()
  presetId?: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);

// Indexes
TemplateSchema.index({ userId: 1 });
TemplateSchema.index({ brandId: 1 });
TemplateSchema.index({ category: 1 });
TemplateSchema.index({ tags: 1 });
TemplateSchema.index({ isPublished: 1 });
TemplateSchema.index({ userId: 1, category: 1 });
