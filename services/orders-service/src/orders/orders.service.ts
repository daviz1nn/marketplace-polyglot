import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { types } from 'cassandra-driver';
import { CassandraService } from '../cassandra/cassandra.service';
import { CreateOrderDto } from './dto/create-order.dto';

// ---- Tipos cross-service (espelham os contratos dos outros serviços) ----
export interface ClientSnapshot {
  client_id: string;
  name: string;
  email: string;
}
export interface ProductDoc {
  id: string;
  name: string;
  price: number;
  stock: number;
}
export interface OrderItemSnapshot {
  product_id: string;
  name: string;
  unit_price: string; // string para preservar precisão decimal no UDT
  quantity: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly clientsUrl: string;
  private readonly productsUrl: string;

  constructor(
    private readonly cassandra: CassandraService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.clientsUrl =
      this.config.get<string>('CLIENTS_SERVICE_URL') ?? 'http://clients-service:3001';
    this.productsUrl =
      this.config.get<string>('PRODUCTS_SERVICE_URL') ?? 'http://products-service:3002';
  }

  // =========================================================================
  // POST /orders — fluxo principal
  // 1. Se Idempotency-Key existe → retorna pedido existente (replay)
  // 2. Valida cliente (GET cross-service)
  // 3. Reserva estoque atomicamente (PATCH cross-service por item)
  // 4. Monta snapshot + total
  // 5. LOGGED BATCH no Cassandra (orders + orders_by_client + orders_by_idem_key)
  // =========================================================================
  async create(dto: CreateOrderDto, idempotencyKey: string | undefined, correlationId: string) {
    if (!idempotencyKey) {
      throw new BadRequestException('Header Idempotency-Key é obrigatório');
    }

    // ----- 1. Idempotency check -----
    const existing = await this.findByIdemKey(idempotencyKey);
    if (existing) {
      this.logger.log({ msg: 'idempotent replay', idempotencyKey, orderId: existing });
      return this.findOne(existing);
    }

    // ----- 2. Valida cliente -----
    const clientSnap = await this.fetchClientSnapshot(dto.client_id, correlationId);

    // ----- 3. Reserva estoque + busca dados dos produtos (atômico por item) -----
    const itemSnapshots: OrderItemSnapshot[] = [];
    let total = 0;

    for (const item of dto.items) {
      const product = await this.reserveStock(item.product_id, item.quantity, correlationId);
      const unitPrice = Number(product.price);
      total += unitPrice * item.quantity;
      itemSnapshots.push({
        product_id: product.id,
        name: product.name,
        unit_price: unitPrice.toFixed(2),
        quantity: item.quantity,
      });
    }

    // ----- 4. Gera order_id (TIMEUUID) -----
    const orderId = types.TimeUuid.now();
    const itemsSummary = itemSnapshots
      .map((i) => `${i.quantity}x ${i.name}`)
      .join(', ')
      .slice(0, 255);

    // ----- 5. LOGGED BATCH no Cassandra -----
    // Atomicidade entre as 3 inserções: se uma falha, todas falham (via batchlog).
    const queries = [
      {
        query: `INSERT INTO orders (order_id, client_id, status, total, client_snapshot, items)
                VALUES (?, ?, ?, ?, ?, ?)`,
        params: [
          orderId,
          types.Uuid.fromString(dto.client_id),
          'pending',
          types.BigDecimal.fromString(total.toFixed(2)),
          {
            client_id: types.Uuid.fromString(clientSnap.client_id),
            name: clientSnap.name,
            email: clientSnap.email,
          },
          itemSnapshots.map((it) => ({
            product_id: types.Uuid.fromString(it.product_id),
            name: it.name,
            unit_price: types.BigDecimal.fromString(it.unit_price),
            quantity: it.quantity,
          })),
        ],
      },
      {
        query: `INSERT INTO orders_by_client (client_id, order_id, status, total, items_summary)
                VALUES (?, ?, ?, ?, ?)`,
        params: [
          types.Uuid.fromString(dto.client_id),
          orderId,
          'pending',
          types.BigDecimal.fromString(total.toFixed(2)),
          itemsSummary,
        ],
      },
      {
        query: `INSERT INTO orders_by_idem_key (idem_key, order_id, created_at)
                VALUES (?, ?, toTimestamp(now()))`,
        params: [idempotencyKey, orderId],
      },
    ];

    await this.cassandra.client.batch(queries, { prepare: true, logged: true });

    this.logger.log({
      msg: 'order created',
      orderId: orderId.toString(),
      clientId: dto.client_id,
      total,
      itemCount: itemSnapshots.length,
      correlationId,
    });

    return {
      order_id: orderId.toString(),
      client_id: dto.client_id,
      status: 'pending',
      total,
      items: itemSnapshots,
    };
  }

  // =========================================================================
  // GET /orders/:id
  // =========================================================================
  async findOne(orderId: string) {
    const row = await this.cassandra.client.execute(
      `SELECT order_id, client_id, status, total, client_snapshot, items
       FROM orders WHERE order_id = ?`,
      [types.TimeUuid.fromString(orderId)],
      { prepare: true },
    );
    if (row.rowLength === 0) throw new NotFoundException(`Pedido ${orderId} não encontrado`);
    const r = row.first();
    return this.serialize(r);
  }

  // =========================================================================
  // GET /orders/by-client/:client_id — a query estrela do Cassandra
  // Lê UMA partição, ordenação cronológica nativa via CLUSTERING ORDER DESC
  // =========================================================================
  async findByClient(clientId: string, limit = 20) {
    const result = await this.cassandra.client.execute(
      `SELECT client_id, order_id, status, total, items_summary
       FROM orders_by_client WHERE client_id = ? LIMIT ?`,
      [types.Uuid.fromString(clientId), limit],
      { prepare: true },
    );
    return result.rows.map((r) => ({
      order_id: r.order_id.toString(),
      client_id: r.client_id.toString(),
      status: r.status,
      total: r.total ? Number(r.total.toString()) : 0,
      items_summary: r.items_summary,
    }));
  }

  // =========================================================================
  // PATCH /orders/:id/status — atualiza nas DUAS tabelas via BATCH
  // =========================================================================
  async updateStatus(orderId: string, status: string) {
    const order = await this.findOne(orderId); // confirma que existe, traz client_id
    const queries = [
      {
        query: 'UPDATE orders SET status = ? WHERE order_id = ?',
        params: [status, types.TimeUuid.fromString(orderId)],
      },
      {
        query: 'UPDATE orders_by_client SET status = ? WHERE client_id = ? AND order_id = ?',
        params: [
          status,
          types.Uuid.fromString(order.client_id),
          types.TimeUuid.fromString(orderId),
        ],
      },
    ];
    await this.cassandra.client.batch(queries, { prepare: true, logged: true });
    return { ...order, status };
  }

  // =========================================================================
  // Helpers privados
  // =========================================================================
  private async findByIdemKey(idemKey: string): Promise<string | null> {
    const rs = await this.cassandra.client.execute(
      'SELECT order_id FROM orders_by_idem_key WHERE idem_key = ?',
      [idemKey],
      { prepare: true },
    );
    if (rs.rowLength === 0) return null;
    return rs.first().order_id.toString();
  }

  private async fetchClientSnapshot(
    clientId: string,
    correlationId: string,
  ): Promise<ClientSnapshot> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.clientsUrl}/clients/${clientId}`, {
          headers: { 'x-correlation-id': correlationId },
        }),
      );
      return { client_id: data.id, name: data.name, email: data.email };
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new NotFoundException(`Cliente ${clientId} não encontrado`);
      }
      throw new ServiceUnavailableException(
        `clients-service indisponível: ${err?.message ?? err}`,
      );
    }
  }

  private async reserveStock(
    productId: string,
    quantity: number,
    correlationId: string,
  ): Promise<ProductDoc> {
    try {
      const { data } = await firstValueFrom(
        this.http.patch(
          `${this.productsUrl}/products/${productId}/stock`,
          { delta: -quantity },
          { headers: { 'x-correlation-id': correlationId } },
        ),
      );
      return data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        throw new NotFoundException(`Produto ${productId} não encontrado`);
      }
      if (status === 409) {
        throw new ConflictException(
          `Estoque insuficiente para produto ${productId} (quantidade=${quantity})`,
        );
      }
      if (err instanceof HttpException) throw err;
      throw new ServiceUnavailableException(
        `products-service indisponível: ${err?.message ?? err}`,
      );
    }
  }

  private serialize(r: any) {
    return {
      order_id: r.order_id.toString(),
      client_id: r.client_id.toString(),
      status: r.status,
      total: r.total ? Number(r.total.toString()) : 0,
      client_snapshot: r.client_snapshot
        ? {
            client_id: r.client_snapshot.client_id?.toString(),
            name: r.client_snapshot.name,
            email: r.client_snapshot.email,
          }
        : null,
      items: (r.items ?? []).map((it: any) => ({
        product_id: it.product_id?.toString(),
        name: it.name,
        unit_price: it.unit_price ? Number(it.unit_price.toString()) : 0,
        quantity: it.quantity,
      })),
    };
  }
}
