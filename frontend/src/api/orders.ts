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

export const OrdersApi = {
  create: async (payload: {
    client_id: string;
    items: Array<{ product_id: string; quantity: number }>;
  }): Promise<Order> => {
    const idempotencyKey = uuidv4();
    const { data } = await ordersApi.post('/orders', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return data;
  },
  getByClient: async (clientId: string, limit = 20): Promise<Order[]> => {
    const { data } = await ordersApi.get(`/orders/by-client/${clientId}`, { params: { limit } });
    return data;
  },
};
