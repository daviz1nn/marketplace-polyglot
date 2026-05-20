import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import ClientsPage from './pages/ClientsPage';
import ProductsPage from './pages/ProductsPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderHistoryPage from './pages/OrderHistoryPage';

export default function App() {
  const linkBase = 'px-4 py-2 rounded-md text-sm font-medium transition';
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'}`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
          <h1 className="text-lg font-bold text-slate-900">
            Marketplace <span className="text-blue-600">Polyglot</span>
          </h1>
          <nav className="flex gap-1">
            <NavLink to="/clients" className={linkClass}>Clientes</NavLink>
            <NavLink to="/products" className={linkClass}>Produtos</NavLink>
            <NavLink to="/checkout" className={linkClass}>Checkout</NavLink>
            <NavLink to="/orders" className={linkClass}>Histórico</NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/clients" replace />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
          <Route path="/clients/:id/orders" element={<OrderHistoryPage />} />
        </Routes>
      </main>

      <footer className="text-center text-xs text-slate-500 py-4">
        Projeto acadêmico — Persistência Poliglota · Postgres + MongoDB + Cassandra
      </footer>
    </div>
  );
}
