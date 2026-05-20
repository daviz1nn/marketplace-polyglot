import { clientsApi } from './http';

export interface Client {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone?: string | null;
  address: {
    street: string;
    number: string;
    complement?: string;
    city: string;
    state: string;
    zip: string;
  };
  created_at: string;
  updated_at: string;
}

export const ClientsApi = {
  list: async (): Promise<{ items: Client[]; total: number }> => {
    const { data } = await clientsApi.get('/clients', { params: { limit: 100 } });
    return data;
  },
  create: async (payload: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<Client> => {
    const { data } = await clientsApi.post('/clients', payload);
    return data;
  },
  getOne: async (id: string): Promise<Client> => {
    const { data } = await clientsApi.get(`/clients/${id}`);
    return data;
  },
};
