import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ClientsApi } from '../api/clients';

const inputCls = 'w-full border border-slate-300 rounded px-2 py-1 text-sm';
const btnCls =
  'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50';

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(160),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos numéricos'),
  phone: z.string().optional(),
  street: z.string().min(1),
  number: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(8).max(10),
});
type FormData = z.infer<typeof schema>;

export default function ClientsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['clients'], queryFn: ClientsApi.list });
  const mutation = useMutation({
    mutationFn: (payload: FormData) =>
      ClientsApi.create({
        name: payload.name,
        email: payload.email,
        cpf: payload.cpf,
        phone: payload.phone || undefined,
        address: {
          street: payload.street,
          number: payload.number,
          city: payload.city,
          state: payload.state,
          zip: payload.zip,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      reset();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (formData: FormData) => mutation.mutate(formData);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <section>
        <h2 className="text-xl font-bold mb-3">Cadastrar cliente</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 bg-white p-4 rounded shadow">
          <Field label="Nome" error={errors.name?.message}>
            <input {...register('name')} className={inputCls} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <input {...register('email')} type="email" className={inputCls} />
          </Field>
          <Field label="CPF (11 dígitos)" error={errors.cpf?.message}>
            <input {...register('cpf')} className={inputCls} />
          </Field>
          <Field label="Telefone (opcional)" error={errors.phone?.message}>
            <input {...register('phone')} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rua" error={errors.street?.message}>
              <input {...register('street')} className={inputCls} />
            </Field>
            <Field label="Número" error={errors.number?.message}>
              <input {...register('number')} className={inputCls} />
            </Field>
            <Field label="Cidade" error={errors.city?.message}>
              <input {...register('city')} className={inputCls} />
            </Field>
            <Field label="UF" error={errors.state?.message}>
              <input {...register('state')} maxLength={2} className={`${inputCls} uppercase`} />
            </Field>
            <Field label="CEP" error={errors.zip?.message}>
              <input {...register('zip')} className={inputCls} />
            </Field>
          </div>
          <button type="submit" disabled={isSubmitting || mutation.isPending} className={btnCls}>
            {mutation.isPending ? 'Salvando...' : 'Criar cliente'}
          </button>
          {mutation.isError && (
            <p className="text-sm text-red-600">
              Erro: {(mutation.error as any)?.response?.data?.message ?? 'falha ao criar'}
            </p>
          )}
        </form>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">Clientes cadastrados (Postgres)</h2>
        {isLoading && <p className="text-slate-500">Carregando...</p>}
        <ul className="space-y-2">
          {data?.items.map((c) => (
            <li key={c.id} className="bg-white p-3 rounded shadow text-sm">
              <div className="font-medium">{c.name}</div>
              <div className="text-slate-500">
                {c.email} · CPF {c.cpf}
              </div>
              <div className="text-xs text-slate-400 mt-1">id: {c.id}</div>
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
