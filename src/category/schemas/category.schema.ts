import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose'; // Importamos Types para manejar ObjectId
import { Field, ObjectType, ID, Int } from '@nestjs/graphql';
import { Company } from 'src/company/schemas/company.schema'; // Asegúrate de importar correctamente el modelo Company
import { User } from 'src/users/schemas/user.schema';

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class Category extends Document {
  @Field(() => ID)
  get categoryId(): string {
    return this._id.toString();
  }

  @Prop()
  @Field()
  name: string;

  @Prop({ nullable: true })
  @Field({ nullable: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  @Field(() => Company)
  company: Company;

  // Nuevo campo para registrar el usuario que crea el servicio
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => User)
  createdBy: User;

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop()
  @Field(() => Int)
  updatedAt: number;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
