import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({
  collection: 'products',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class Product {
  // ID externo cross-banco (UUID v4) — separado do _id ObjectId interno do Mongo
  @Prop({ type: String, required: true, unique: true, index: true })
  id!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: String, required: true, index: true })
  category!: string;

  // Decimal128 preserva precisão monetária (~equivalente a DECIMAL do SQL)
  @Prop({ type: Types.Decimal128, required: true })
  price!: Types.Decimal128;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  stock!: number;

  // Campo deliberadamente aberto — justifica o uso de document store
  @Prop({ type: Object, default: {} })
  attributes!: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  images!: string[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ category: 1, price: 1 });
ProductSchema.index({ name: 'text' });
