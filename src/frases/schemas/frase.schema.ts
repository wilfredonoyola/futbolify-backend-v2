import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';

export type FraseDocument = Frase & Document;

export enum FraseCategory {
  CANCHA = 'CANCHA',
  TECNICOS = 'TECNICOS',
  FUTBOLISTAS = 'FUTBOLISTAS',
  PERIODISTAS = 'PERIODISTAS',
  ARROGANCIA = 'ARROGANCIA',
  POLEMICAS = 'POLEMICAS',
  MEMES = 'MEMES',
  MOTIVACIONAL = 'MOTIVACIONAL',
  PERSONAL = 'PERSONAL',
}

export enum FraseTone {
  SARCASTICO = 'SARCASTICO',
  EPICO = 'EPICO',
  GRACIOSO = 'GRACIOSO',
  POLEMICO = 'POLEMICO',
  MOTIVACIONAL = 'MOTIVACIONAL',
  ARROGANTE = 'ARROGANTE',
  DRAMATICO = 'DRAMATICO',
}

// Register enums for GraphQL
registerEnumType(FraseCategory, {
  name: 'FraseCategory',
  description: 'Categorias de frases de futbol',
});

registerEnumType(FraseTone, {
  name: 'FraseTone',
  description: 'Tonos de las frases',
});

@Schema({ timestamps: true, collection: 'frases' })
@ObjectType()
export class Frase {
  @Field(() => ID)
  id: string;

  @Prop({ required: true })
  @Field()
  texto: string;

  @Prop()
  @Field({ nullable: true })
  autor?: string;

  @Prop({ type: String, enum: FraseCategory, required: true })
  @Field(() => FraseCategory)
  categoria: FraseCategory;

  @Prop({ type: String, enum: FraseTone })
  @Field(() => FraseTone, { nullable: true })
  tono?: FraseTone;

  @Prop()
  @Field({ nullable: true })
  equipo?: string;

  @Prop()
  @Field({ nullable: true })
  emoji?: string;

  @Prop()
  @Field({ nullable: true })
  tag?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: string;

  @Prop({ default: false })
  @Field()
  isPublic: boolean;

  @Prop({ default: 0 })
  @Field(() => Int)
  likesCount: number;

  @Prop()
  @Field({ nullable: true })
  exportedImageUrl?: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export const FraseSchema = SchemaFactory.createForClass(Frase);

// Indexes para búsqueda eficiente
FraseSchema.index({ userId: 1, categoria: 1 });
FraseSchema.index({ isPublic: 1, likesCount: -1 });
FraseSchema.index({ userId: 1, createdAt: -1 });
FraseSchema.index({ texto: 'text', autor: 'text' }); // Full-text search
