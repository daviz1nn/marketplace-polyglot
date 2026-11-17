import { ordersApi } from './http';
import { v4 as uuidv4 } from 'uuid';

export interface OrderItem {
  product_id: string;
  name?: string;
  unit_price?: number | string;
  quantity: number;
}

export interface Order {
  order_id: string;
  client_id: string;
  status: string;
  total: number;
  items_summary?: string;
  items?: OrderItem[];
}

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'canceled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const OrdersApi = {
  /**
   * A Idempotency-Key deve ser a MESMA em todas as tentativas do mesmo
   * checkout (duplo clique, retry após timeout). Quem chama gera a chave uma
   * vez por carrinho e só troca depois de um pedido criado com sucesso.
   */
  create: async (
    payload: {
      client_id: string;
      items: Array<{ product_id: string; quantity: number }>;
    },
    idempotencyKey: string = uuidv4(),
  ): Promise<Order> => {
    const { data } = await ordersApi.post('/orders', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return data;
  },
  get: async (orderId: string): Promise<Order> => {
    const { data } = await ordersApi.get(`/orders/${orderId}`);
    return data;
  },
  getByClient: async (clientId: string, limit = 20): Promise<Order[]> => {
    const { data } = await ordersApi.get(`/orders/by-client/${clientId}`, { params: { limit } });
    return data;
  },
  updateStatus: async (orderId: string, status: OrderStatus): Promise<Order> => {
    const { data } = await ordersApi.patch(`/orders/${orderId}/status`, { status });
    return data;
  },
  remove: async (orderId: string): Promise<void> => {
    await ordersApi.delete(`/orders/${orderId}`);
  },
};
