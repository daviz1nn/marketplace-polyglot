import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { OrdersService } from './orders.service';
import { CassandraService } from '../cassandra/cassandra.service';

describe('OrdersService — fluxo crítico', () => {
  let service: OrdersService;
  let httpMock: { get: jest.Mock; patch: jest.Mock };
  let clientMock: { execute: jest.Mock; batch: jest.Mock };

  beforeEach(async () => {
    httpMock = { get: jest.fn(), patch: jest.fn() };
    clientMock = { execute: jest.fn(), batch: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: HttpService, useValue: httpMock },
        { provide: CassandraService, useValue: { client: clientMock } },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'CLIENTS_SERVICE_URL' ? 'http://c' : 'http://p') },
        },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);

    // Default: idempotency key não existe
    clientMock.execute.mockResolvedValue({
      rowLength: 0,
      rows: [],
      first: () => null,
    });
  });

  it('rejeita criação sem Idempotency-Key', async () => {
    await expect(
      service.create(
        {
          client_id: '11111111-1111-1111-1111-111111111111',
          items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 1 }],
        },
        undefined,
        'corr-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falha quando cliente não existe (404 do clients-service)', async () => {
    httpMock.get.mockReturnValue(throwError(() => ({ response: { status: 404 } })));
    await expect(
      service.create(
        {
          client_id: '11111111-1111-1111-1111-111111111111',
          items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 1 }],
        },
        'idem-1',
        'corr-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('falha com 503 quando clients-service está down', async () => {
    httpMock.get.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));
    await expect(
      service.create(
        {
          client_id: '11111111-1111-1111-1111-111111111111',
          items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 1 }],
        },
        'idem-1',
        'corr-1',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('falha com Conflict quando estoque é insuficiente (409 do products-service)', async () => {
    httpMock.get.mockReturnValue(
      of({ data: { id: '11111111-1111-1111-1111-111111111111', name: 'C', email: 'c@x.com' } }),
    );
    httpMock.patch.mockReturnValue(throwError(() => ({ response: { status: 409 } })));
    await expect(
      service.create(
        {
          client_id: '11111111-1111-1111-1111-111111111111',
          items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 100 }],
        },
        'idem-1',
        'corr-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cria pedido com total correto, snapshot e LOGGED BATCH', async () => {
    httpMock.get.mockReturnValue(
      of({
        data: {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Ana',
          email: 'ana@example.com',
        },
      }),
    );
    httpMock.patch.mockReturnValueOnce(
      of({
        data: {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Camiseta',
          price: 49.9,
          stock: 119,
        },
      }),
    );

    const result = await service.create(
      {
        client_id: '11111111-1111-1111-1111-111111111111',
        items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 2 }],
      },
      'idem-key-abc',
      'corr-xyz',
    );

    // Total correto
    expect(result.total).toBeCloseTo(99.8, 2);
    // Snapshot do produto preservado
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Camiseta');
    expect(result.items[0].unit_price).toBe('49.90');
    // BATCH disparado
    expect(clientMock.batch).toHaveBeenCalledTimes(1);
    const [queries, opts] = clientMock.batch.mock.calls[0];
    // 3 inserções: orders, orders_by_client, orders_by_idem_key
    expect(queries).toHaveLength(3);
    // Deve ser LOGGED (default já é true, mas validamos explicitamente)
    expect(opts.logged).toBe(true);
    expect(opts.prepare).toBe(true);
  });

  it('é idempotente — chave repetida retorna pedido existente sem novo BATCH', async () => {
    // Simula que a idem_key já existe — primeira chamada ao execute retorna order_id
    const existingOrderId = { toString: () => '00000000-0000-0000-0000-000000000001' };
    clientMock.execute
      .mockResolvedValueOnce({
        rowLength: 1,
        rows: [{ order_id: existingOrderId }],
        first: () => ({ order_id: existingOrderId }),
      })
      // Em seguida, findOne é chamado e retorna o pedido completo
      .mockResolvedValueOnce({
        rowLength: 1,
        rows: [
          {
            order_id: existingOrderId,
            client_id: { toString: () => '11111111-1111-1111-1111-111111111111' },
            status: 'pending',
            total: { toString: () => '99.80' },
            client_snapshot: null,
            items: [],
          },
        ],
        first: () => ({
          order_id: existingOrderId,
          client_id: { toString: () => '11111111-1111-1111-1111-111111111111' },
          status: 'pending',
          total: { toString: () => '99.80' },
          client_snapshot: null,
          items: [],
        }),
      });

    const result = await service.create(
      {
        client_id: '11111111-1111-1111-1111-111111111111',
        items: [{ product_id: '22222222-2222-2222-2222-222222222222', quantity: 2 }],
      },
      'duplicate-key',
      'corr-1',
    );

    // Nenhum BATCH foi disparado (idempotência funcionou)
    expect(clientMock.batch).not.toHaveBeenCalled();
    // Nenhuma chamada cross-service (não validou cliente/produto)
    expect(httpMock.get).not.toHaveBeenCalled();
    expect(httpMock.patch).not.toHaveBeenCalled();
    // Resultado é o pedido existente
    expect(result.order_id).toBe('00000000-0000-0000-0000-000000000001');
  });
});
