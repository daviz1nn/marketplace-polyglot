import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// URLs configuradas via Vite env. Em docker-compose, o FE roda no browser do
// host, então usa localhost (host)
export const URLS = {
  clients: import.meta.env.VITE_CLIENTS_URL ?? 'http://localhost:3001',
  products: import.meta.env.VITE_PRODUCTS_URL ?? 'http://localhost:3002',
  orders: import.meta.env.VITE_ORDERS_URL ?? 'http://localhost:3003',
};

function buildClient(baseURL: string) {
  const inst = axios.create({ baseURL, timeout: 10_000 });
  inst.interceptors.request.use((config) => {
    config.headers = config.headers ?? {};
    if (!config.headers['X-Correlation-Id']) {
      config.headers['X-Correlation-Id'] = uuidv4();
    }
    return config;
  });
  return inst;
}

export const clientsApi = buildClient(URLS.clients);
export const productsApi = buildClient(URLS.products);
export const ordersApi = buildClient(URLS.orders);
