import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Product, ProductDocument } from './product.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

export interface FindAllParams {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly model: Model<ProductDocument>) {}

  async create(dto: CreateProductDto) {
    try {
      const created = await this.model.create({
        id: uuidv4(),
        name: dto.name,
        description: dto.description,
        category: dto.category,
        price: Types.Decimal128.fromString(String(dto.price)),
        stock: dto.stock,
        attributes: dto.attributes ?? {},
        images: dto.images ?? [],
      });
      return this.serialize(created);
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException('Produto com id duplicado (improvável colisão de UUID)');
      }
      throw err;
    }
  }

  async findAll(params: FindAllParams) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const filter: Record<string, unknown> = {};

    if (params.category) filter.category = params.category;
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      const range: Record<string, unknown> = {};
      if (params.minPrice !== undefined)
        range.$gte = Types.Decimal128.fromString(String(params.minPrice));
      if (params.maxPrice !== undefined)
        range.$lte = Types.Decimal128.fromString(String(params.maxPrice));
      filter.price = range;
    }
    if (params.q) filter.$text = { $search: params.q };

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);

    return { items: items.map((i) => this.serializeLean(i)), total, page, limit };
  }

  async findOne(id: string) {
    const product = await this.model.findOne({ id }).lean();
    if (!product) throw new NotFoundException(`Produto ${id} não encontrado`);
    return this.serializeLean(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const updates: Record<string, unknown> = { ...dto };
    if (dto.price !== undefined) {
      updates.price = Types.Decimal128.fromString(String(dto.price));
    }
    const updated = await this.model.findOneAndUpdate({ id }, updates, { new: true }).lean();
    if (!updated) throw new NotFoundException(`Produto ${id} não encontrado`);
    return this.serializeLean(updated);
  }

  async remove(id: string) {
    const res = await this.model.deleteOne({ id });
    if (res.deletedCount === 0) throw new NotFoundException(`Produto ${id} não encontrado`);
  }

  /**
   * Aplica delta de estoque ATOMICAMENTE.
   *
   * Se delta < 0 (reserva), exige que stock + delta >= 0 (não permite negativo).
   * O filtro garante atomicidade: a query inteira é uma única operação no Mongo,
   * sem janela de race entre check e update.
   *
   * Retorna o documento atualizado ou lança ConflictException se estoque insuficiente.
   */
  async applyStockDelta(id: string, delta: number) {
    if (delta === 0) return this.findOne(id);

    const filter: Record<string, unknown> = { id };
    if (delta < 0) {
      // só atualiza se stock + delta >= 0, i.e., stock >= -delta
      filter.stock = { $gte: -delta };
    }

    const updated = await this.model
      .findOneAndUpdate(filter, { $inc: { stock: delta } }, { new: true })
      .lean();

    if (!updated) {
      // Distinção entre "não existe" e "estoque insuficiente":
      const exists = await this.model.exists({ id });
      if (!exists) throw new NotFoundException(`Produto ${id} não encontrado`);
      throw new ConflictException(`Estoque insuficiente para produto ${id} (delta=${delta})`);
    }

    return this.serializeLean(updated);
  }

  // Conversão para resposta REST: Decimal128 → number
  private serialize(doc: ProductDocument) {
    return this.serializeLean(doc.toObject());
  }
  private serializeLean(obj: any) {
    if (!obj) throw new InternalServerErrorException('serialize on null');
    return {
      id: obj.id,
      name: obj.name,
      description: obj.description ?? null,
      category: obj.category,
      price: obj.price ? Number(obj.price.toString()) : 0,
      stock: obj.stock,
      attributes: obj.attributes ?? {},
      images: obj.images ?? [],
      created_at: obj.created_at,
      updated_at: obj.updated_at,
    };
  }
}
