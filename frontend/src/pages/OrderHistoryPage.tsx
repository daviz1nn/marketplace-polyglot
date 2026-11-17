import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientsApi } from '../api/clients';
import { ORDER_STATUSES, OrderStatus, OrdersApi } from '../api/orders';

const selectCls = 'w-full border border-slate-300 rounded px-2 py-1 text-sm';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-800',
  shipped: 'bg-blue-100 text-blue-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  canceled: 'bg-red-100 text-red-800',
};

const errorMessage = (err: unknown) =>
  (err as any)?.response?.data?.message ?? (err as Error)?.message ?? 'falha na operação';

export default function OrderHistoryPage() {
  const params = useParams<{ id?: string }>();
  const [clientId, setClientId] = useState<string>(params.id ?? '');
  const qc = useQueryClient();

  const clientsQ = useQuery({ queryKey: ['clients'], queryFn: ClientsApi.list });
  const ordersQ = useQuery({
    queryKey: ['orders', clientId],
    queryFn: () => OrdersApi.getByClient(clientId),
    enabled: !!clientId,
  });

  // Status e exclusão podem devolver estoque → invalida produtos também.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['orders', clientId] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const statusM = useMutation({
    mutationFn: (v: { orderId: string; status: OrderStatus }) =>
      OrdersApi.updateStatus(v.orderId, v.status),
    onSuccess: refresh,
  });

  const deleteM = useMutation({
    mutationFn: (orderId: string) => OrdersApi.remove(orderId),
    onSuccess: refresh,
  });

  const onDelete = (orderId: string) => {
    if (window.confirm(`Excluir o pedido ${orderId}? Pedidos pending/paid devolvem o estoque.`)) {
      deleteM.mutate(orderId);
    }
  };

  const mutationError = statusM.error ?? deleteM.error;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Histórico de pedidos</h2>
      <p className="text-sm text-slate-600 max-w-2xl">
        Esta tela executa a <strong>query estrela do Cassandra</strong>:{' '}
        <code className="bg-slate-200 px-1 rounded text-xs">
          SELECT ... FROM orders_by_client WHERE client_id = ? ORDER BY order_id DESC
        </code>
        — lê uma única partição com ordenação cronológica nativa via TIMEUUID. Mudar o status
        ou excluir um pedido grava nas duas tabelas (<code>orders</code> e{' '}
        <code>orders_by_client</code>) num <strong>LOGGED BATCH</strong>.
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

      {mutationError && (
        <p className="text-sm text-red-600">Erro: {String(errorMessage(mutationError))}</p>
      )}

      {clientId && (
        <section>
          <h3 className="font-bold mb-2">Pedidos do cliente</h3>
          {ordersQ.isLoading && <p className="text-slate-500 text-sm">Carregando...</p>}
          {ordersQ.isError && (
            <p className="text-red-600 text-sm">Erro: {String(errorMessage(ordersQ.error))}</p>
          )}
          {ordersQ.data && ordersQ.data.length === 0 && (
            <p className="text-slate-500 text-sm">Nenhum pedido encontrado para este cliente.</p>
          )}
          <ul className="space-y-2">
            {ordersQ.data?.map((o) => {
              const busy =
                (statusM.isPending && statusM.variables?.orderId === o.order_id) ||
                (deleteM.isPending && deleteM.variables === o.order_id);
              return (
                <li key={o.order_id} className="bg-white p-3 rounded shadow text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-500 break-all">
                      {o.order_id}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        STATUS_STYLE[o.status] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>
                  <div className="mt-1">{o.items_summary}</div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <span className="font-bold text-blue-700">
                      Total: R$ {Number(o.total).toFixed(2)}
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500" htmlFor={`st-${o.order_id}`}>
                        Status
                      </label>
                      <select
                        id={`st-${o.order_id}`}
                        value={o.status}
                        disabled={busy || o.status === 'canceled'}
                        onChange={(e) =>
                          statusM.mutate({
                            orderId: o.order_id,
                            status: e.target.value as OrderStatus,
                          })
                        }
                        className="border border-slate-300 rounded px-1 py-0.5 text-xs"
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onDelete(o.order_id)}
                        disabled={busy}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        excluir
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
