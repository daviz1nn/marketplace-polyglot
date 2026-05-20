import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './product.schema';

describe('ProductsService — atomic stock', () => {
  let service: ProductsService;
  let model: any;

  beforeEach(async () => {
    model = {
      findOneAndUpdate: jest.fn(),
      exists: jest.fn(),
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, { provide: getModelToken(Product.name), useValue: model }],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  it('aplica delta negativo quando há estoque', async () => {
    model.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        id: 'p1',
        name: 'P',
        category: 'c',
        price: { toString: () => '10.0' },
        stock: 7,
        attributes: {},
        images: [],
        created_at: new Date(),
        updated_at: new Date(),
      }),
    });
    const r = await service.applyStockDelta('p1', -3);
    expect(r.stock).toBe(7);

    // O filtro DEVE incluir stock>=3 (i.e., stock>=-delta) — é o que garante atomicidade
    const calledFilter = model.findOneAndUpdate.mock.calls[0][0];
    expect(calledFilter.stock).toEqual({ $gte: 3 });
  });

  it('lança ConflictException quando estoque insuficiente e produto existe', async () => {
    model.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    model.exists.mockResolvedValue({ _id: 'x' });
    await expect(service.applyStockDelta('p1', -100)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lança NotFoundException quando produto não existe', async () => {
    model.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    model.exists.mockResolvedValue(null);
    await expect(service.applyStockDelta('p1', -1)).rejects.toBeInstanceOf(NotFoundException);
  });
});
