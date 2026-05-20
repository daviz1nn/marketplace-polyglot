import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClientsService } from './clients.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let prisma: {
    client: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [ClientsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ClientsService);
  });

  it('cria um cliente', async () => {
    prisma.client.create.mockResolvedValue({ id: 'x', email: 'a@b.com' });
    const result = await service.create({
      name: 'A',
      email: 'a@b.com',
      cpf: '12345678901',
      address: { street: 'X', number: '1', city: 'SP', state: 'SP', zip: '01000-000' } as any,
    });
    expect(result.email).toBe('a@b.com');
  });

  it('converte P2002 em ConflictException', async () => {
    prisma.client.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['email'] },
      }),
    );

    await expect(
      service.create({
        name: 'A',
        email: 'a@b.com',
        cpf: '12345678901',
        address: { street: 'X', number: '1', city: 'SP', state: 'SP', zip: '01000-000' } as any,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lança NotFoundException quando id não existe', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(service.findOne('non-existent')).rejects.toBeInstanceOf(NotFoundException);
  });
});
