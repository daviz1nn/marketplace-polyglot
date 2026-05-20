import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProductsApi } from '../api/products';

const inputCls = 'w-full border border-slate-300 rounded px-2 py-1 text-sm';
const btnCls =
  'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50';

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0),
  attributesJson: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (!v?.trim()) return true;
        try {
          const obj = JSON.parse(v);
          return typeof obj === 'object' && obj !== null;
        } catch {
          return false;
        }
      },
      { message: 'attributes deve ser JSON válido (objeto)' },
    ),
});
type FormData = z.infer<typeof schema>;

export default function ProductsPage() {
  const [category, setCategory] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', category],
    queryFn: () => ProductsApi.list({ category: category || undefined }),
  });

  const mutation = useMutation({
    mutationFn: (payload: FormData) =>
      ProductsApi.create({
        name: payload.name,
        description: payload.description,
        category: payload.category,
        price: payload.price,
        stock: payload.stock,
        attributes: payload.attributesJson ? JSON.parse(payload.attributesJson) : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      reset();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <section>
        <h2 className="text-xl font-bold mb-3">Cadastrar produto</h2>
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="space-y-3 bg-white p-4 rounded shadow"
        >
          <Field label="Nome" error={errors.name?.message}>
            <input {...register('name')} className={inputCls} />
          </Field>
          <Field label="Descrição" error={errors.description?.message}>
            <input {...register('description')} className={inputCls} />
          </Field>
          <Field label="Categoria" error={errors.category?.message}>
            <input {...register('category')} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço (R$)" error={errors.price?.message}>
              <input
                {...register('price')}
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
              />
            </Field>
            <Field label="Estoque" error={errors.stock?.message}>
              <input {...register('stock')} type="number" min="0" className={inputCls} />
            </Field>
          </div>
          <Field
            label='attributes (JSON — schema livre, ex.: {"tamanho":"M","cor":"azul"})'
            error={errors.attributesJson?.message}
          >
            <textarea
              {...register('attributesJson')}
              rows={3}
              className={`${inputCls} font-mono`}
              placeholder='{"tamanho":"M","cor":"azul"}'
            />
          </Field>
          <button type="submit" disabled={isSubmitting || mutation.isPending} className={btnCls}>
            {mutation.isPending ? 'Salvando...' : 'Criar produto'}
          </button>
          {mutation.isError && (
            <p className="text-sm text-red-600">
              Erro: {(mutation.error as any)?.response?.data?.message ?? 'falha'}
            </p>
          )}
        </form>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">Catálogo (MongoDB)</h2>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm">Filtrar por categoria:</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="ex.: vestuario, livros, eletronicos"
            className={inputCls}
          />
        </div>
        {isLoading && <p className="text-slate-500">Carregando...</p>}
        <ul className="space-y-2">
          {data?.items.map((p) => (
            <li key={p.id} className="bg-white p-3 rounded shadow text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.name}</span>
                <span className="text-blue-700 font-mono">
                  R$ {Number(p.price).toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                <span className="bg-slate-100 rounded px-1 py-0.5 mr-2">{p.category}</span>
                estoque: {p.stock}
              </div>
              {Object.keys(p.attributes).length > 0 && (
                <div className="text-xs text-slate-600 mt-1 font-mono">
                  {JSON.stringify(p.attributes)}
                </div>
              )}
              <div className="text-xs text-slate-400 mt-1">id: {p.id}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700 font-medium">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600 block mt-0.5">{error}</span>}
    </label>
  );
}
