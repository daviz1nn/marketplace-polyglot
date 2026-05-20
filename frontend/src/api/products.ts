import { productsApi } from './http';

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  price: number;
  stock: number;
  attributes: Record<string, unknown>;
  images: string[];
  created_at: string;
  updated_at: string;
}

export const ProductsApi = {
  list: async (params: { category?: string; minPrice?: number; maxPrice?: number; q?: string }) => {
    const { data } = await productsApi.get<{ items: Product[]; total: number }>('/products', {
      params: { ...params, limit: 100 },
    });
    return data;
  },
  create: async (payload: {
    name: string;
    description?: string;
    category: string;
    price: number;
    stock: number;
    attributes?: Record<string, unknown>;
    images?: string[];
  }): Promise<Product> => {
    const { data } = await productsApi.post('/products', payload);
    return data;
  },
};
