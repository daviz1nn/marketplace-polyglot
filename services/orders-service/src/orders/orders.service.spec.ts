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
import { types } from 'cassandra-driver';
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

  // ---------------------------------------------------------------------
  // Saga com compensação
  // ---------------------------------------------------------------------
  const CLIENT_OK = {
    data: { id: '11111111-1111-1111-1111-111111111111', name: 'Ana', email: 'ana@example.com' },
  };
  const PRODUCT_A = {
    data: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', name: 'Camiseta', price: 49.9, stock: 10 },
  };

  it('devolve o estoque do 1º item quando o 2º item falha por estoque insuficiente', async () => {
    httpMock.get.mockReturnValue(of(CLIENT_OK));
    httpMock.patch
      .mockReturnValueOnce(of(PRODUCT_A)) // reserva item 1
      .mockReturnValueOnce(throwError(() => ({ response: { status: 409 } }))) // item 2 falha
      .mockReturnValueOnce(of(PRODUCT_A)); // compensação do item 1

    await expect(
      service.create(
        {
          client_id: '11111111-1111-1111-1111-111111111111',
          items: [
            { product_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', quantity: 3 },
            { product_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', quantity: 999 },
          ],
        },
        'idem-saga',
        'corr-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(httpMock.patch).toHaveBeenCalledTimes(3);
    const [url, body] = httpMock.patch.mock.calls[2];
    expect(url).toBe('http://p/products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/stock');
    expect(body).toEqual({ delta: 3 });
    expect(clientMock.batch).not.toHaveBeenCalled();
  });

  it('devolve o estoque quando o LOGGED BATCH no Cassandra falha', async () => {
    httpMock.get.mockReturnValue(of(CLIENT_OK));
    httpMock.patch.mockReturnValue(of(PRODUCT_A));
    clientMock.batch.mockRejectedValueOnce(new Error('WriteTimeout'));

    await expect(
      service.create(
        {
          client_id: '11111111-1111-1111-1111-111111111111',
          items: [{ product_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', quantity: 2 }],
        },
        'idem-batch-fail',
        'corr-1',
      ),
    ).rejects.toThrow('WriteTimeout');

    expect(httpMock.patch).toHaveBeenCalledTimes(2);
    expect(httpMock.patch.mock.calls[1][1]).toEqual({ delta: 2 });
  });

  // ---------------------------------------------------------------------
  // Update de status e DELETE
  // ---------------------------------------------------------------------
  const ORDER_ID = types.TimeUuid.now().toString();
  const orderRow = (status: string) => {
    const row = {
      order_id: { toString: () => ORDER_ID },
      client_id: { toString: () => '11111111-1111-1111-1111-111111111111' },
      status,
      total: { toString: () => '99.80' },
      client_snapshot: null,
      items: [
        {
          product_id: { toString: () => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' },
          name: 'Camiseta',
          unit_price: { toString: () => '49.90' },
          quantity: 2,
        },
      ],
    };
    return { rowLength: 1, rows: [row], first: () => row };
  };

  it('DELETE de pedido pending remove das 2 tabelas e devolve estoque', async () => {
    clientMock.execute.mockResolvedValueOnce(orderRow('pending'));
    httpMock.patch.mockReturnValue(of(PRODUCT_A));

    await service.remove(ORDER_ID, 'corr-del');

    const [queries, opts] = clientMock.batch.mock.calls[0];
    expect(queries).toHaveLength(2);
    expect(queries[0].query).toContain('DELETE FROM orders');
    expect(queries[1].query).toContain('DELETE FROM orders_by_client');
    expect(opts.logged).toBe(true);
    expect(httpMock.patch).toHaveBeenCalledWith(
      'http://p/products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/stock',
      { delta: 2 },
      expect.anything(),
    );
  });

  it('DELETE de pedido delivered não devolve estoque', async () => {
    clientMock.execute.mockResolvedValueOnce(orderRow('delivered'));
    await service.remove(ORDER_ID, 'corr-del');
    expect(clientMock.batch).toHaveBeenCalledTimes(1);
    expect(httpMock.patch).not.toHaveBeenCalled();
  });

  it('DELETE de pedido inexistente retorna 404', async () => {
    await expect(service.remove(ORDER_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(clientMock.batch).not.toHaveBeenCalled();
  });

  it('cancelar pedido pending devolve estoque', async () => {
    clientMock.execute.mockResolvedValueOnce(orderRow('pending'));
    httpMock.patch.mockReturnValue(of(PRODUCT_A));
    const result = await service.updateStatus(ORDER_ID, 'canceled');
    expect(result.status).toBe('canceled');
    expect(httpMock.patch.mock.calls[0][1]).toEqual({ delta: 2 });
  });

  it('não permite reabrir pedido cancelado', async () => {
    clientMock.execute.mockResolvedValueOnce(orderRow('canceled'));
    await expect(service.updateStatus(ORDER_ID, 'paid')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(clientMock.batch).not.toHaveBeenCalled();
  });
});
