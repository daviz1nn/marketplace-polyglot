import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClientsApi } from '../api/clients';
import { ProductsApi } from '../api/products';
import { OrdersApi } from '../api/orders';

const inputCls = 'w-full border border-slate-300 rounded px-2 py-1 text-sm';
const btnCls =
  'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50';

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

export default function CheckoutPage() {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  // Toca os 3 serviços nesta tela — demonstração viva da polyglot persistence
  const clientsQ = useQuery({ queryKey: ['clients'], queryFn: ClientsApi.list });
  const productsQ = useQuery({ queryKey: ['products', ''], queryFn: () => ProductsApi.list({}) });

  const mutation = useMutation({
    mutationFn: () =>
      OrdersApi.create({
        client_id: clientId,
        items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      }),
    onSuccess: (order) => {
      setLastOrderId(order.order_id);
      setCart([]);
      qc.invalidateQueries({ queryKey: ['orders', clientId] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const total = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  const addToCart = (productId: string) => {
    const p = productsQ.data?.items.find((x) => x.id === productId);
    if (!p) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === productId);
      if (existing) {
        return prev.map((i) =>
          i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { product_id: p.id, name: p.name, price: Number(p.price), quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.product_id !== productId));

  const canCheckout = clientId && cart.length > 0 && !mutation.isPending;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Checkout</h2>
      <p className="text-sm text-slate-600 max-w-2xl">
        Esta tela toca os <strong>três serviços</strong>: lê clientes do Postgres,
        produtos do Mongo, e cria pedido no Cassandra (via LOGGED BATCH em duas tabelas
        + tabela de idempotência).
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">1. Cliente</h3>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={inputCls}
          >
            <option value="">— selecione —</option>
            {clientsQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>

          <h3 className="font-bold mt-4 mb-2">2. Adicionar produtos</h3>
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {productsQ.data?.items.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between text-sm border-b border-slate-100 py-1"
              >
                <span>
                  {p.name}{' '}
                  <span className="text-slate-400 text-xs">
                    ({p.category}, estoque {p.stock})
                  </span>
                </span>
                <button
                  onClick={() => addToCart(p.id)}
                  className="text-xs bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-700"
                  disabled={p.stock < 1}
                >
                  + R$ {Number(p.price).toFixed(2)}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">3. Carrinho</h3>
          {cart.length === 0 ? (
            <p className="text-sm text-slate-500">vazio</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b">
                <tr>
                  <th className="text-left py-1">Produto</th>
                  <th className="text-right">Qtd</th>
                  <th className="text-right">Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((i) => (
                  <tr key={i.product_id} className="border-b border-slate-100">
                    <td className="py-1">{i.name}</td>
                    <td className="text-right">{i.quantity}</td>
                    <td className="text-right">R$ {(i.price * i.quantity).toFixed(2)}</td>
                    <td className="text-right">
                      <button
                        onClick={() => removeFromCart(i.product_id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={2} className="pt-2">
                    Total
                  </td>
                  <td className="text-right pt-2 text-blue-700">R$ {total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          <button
            onClick={() => mutation.mutate()}
            disabled={!canCheckout}
            className={`${btnCls} w-full mt-4`}
          >
            {mutation.isPending ? 'Processando...' : 'Finalizar pedido'}
          </button>

          {mutation.isError && (
            <p className="text-sm text-red-600 mt-2">
              Erro: {(mutation.error as any)?.response?.data?.message ?? 'falha no pedido'}
            </p>
          )}
          {lastOrderId && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm">
              Pedido criado: <span className="font-mono">{lastOrderId}</span>
              <br />
              <Link
                to={`/clients/${clientId}/orders`}
                className="text-blue-600 hover:underline text-xs"
              >
                Ver histórico do cliente →
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
