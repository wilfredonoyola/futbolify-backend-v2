import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ObjectType, ID, Float, Int } from '@nestjs/graphql';
import { CategoryOutput } from 'src/category/dto/category.output';
import { Company } from 'src/company/schemas/company.schema';
import { User } from 'src/users/schemas/user.schema'; // Importamos el esquema de User

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class Service extends Document {
  @Field(() => ID)
  get serviceId(): string {
    return this._id.toString();
  }

  @Prop({ required: true })
  @Field()
  name: string;

  @Prop({ nullable: true })
  @Field({ nullable: true })
  description?: string;

  @Prop({ required: true })
  @Field(() => Float)
  price: number;

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop()
  @Field(() => Int)
  updatedAt: number;

  @Prop({ required: false, type: Types.ObjectId, ref: 'Category' })
  @Field(() => CategoryOutput, { nullable: true })
  category: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  @Field(() => Company)
  company: Company;

  // Nuevo campo para registrar el usuario que crea el servicio
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => User)
  createdBy: User;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);
