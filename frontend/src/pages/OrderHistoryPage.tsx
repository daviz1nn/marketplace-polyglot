import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClientsApi } from '../api/clients';
import { OrdersApi } from '../api/orders';

const selectCls = 'w-full border border-slate-300 rounded px-2 py-1 text-sm';

export default function OrderHistoryPage() {
  const params = useParams<{ id?: string }>();
  const [clientId, setClientId] = useState<string>(params.id ?? '');

  const clientsQ = useQuery({ queryKey: ['clients'], queryFn: ClientsApi.list });
  const ordersQ = useQuery({
    queryKey: ['orders', clientId],
    queryFn: () => OrdersApi.getByClient(clientId),
    enabled: !!clientId,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Histórico de pedidos</h2>
      <p className="text-sm text-slate-600 max-w-2xl">
        Esta tela executa a <strong>query estrela do Cassandra</strong>:{' '}
        <code className="bg-slate-200 px-1 rounded text-xs">
          SELECT ... FROM orders_by_client WHERE client_id = ? ORDER BY order_id DESC
        </code>
        — lê uma única partição com ordenação cronológica nativa via TIMEUUID.
      </p>

      <div className="bg-white p-4 rounded shadow max-w-md">
        <label className="block text-sm mb-1 font-medium">Selecione um cliente:</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={selectCls}
        >
          <option value="">— selecione —</option>
          {clientsQ.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </select>
      </div>

      {clientId && (
        <section>
          <h3 className="font-bold mb-2">Pedidos do cliente</h3>
          {ordersQ.isLoading && <p className="text-slate-500 text-sm">Carregando...</p>}
          {ordersQ.data && ordersQ.data.length === 0 && (
            <p className="text-slate-500 text-sm">Nenhum pedido encontrado para este cliente.</p>
          )}
          <ul className="space-y-2">
            {ordersQ.data?.map((o) => (
              <li key={o.order_id} className="bg-white p-3 rounded shadow text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500">{o.order_id}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      o.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {o.status}
                  </span>
                </div>
                <div className="mt-1">{o.items_summary}</div>
                <div className="font-bold text-blue-700">
                  Total: R$ {Number(o.total).toFixed(2)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
