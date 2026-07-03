'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from '@/components/ui/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    } else {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const logout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const currentTitle =
    pathname.includes('/dashboard/boxes') ? 'Gestión de Cajas' :
    pathname.includes('/dashboard/checks') ? 'Cartera de Cheques' :
    pathname.includes('/dashboard/clients') ? 'Cajas de Clientes' :
    pathname.includes('/dashboard/incomes') ? 'Ingreso de Valores' :
    pathname.includes('/dashboard/expenses') ? 'Egreso de Valores' :
    pathname.includes('/dashboard/reports') ? 'Saldos y Reportes' :
    pathname.includes('/dashboard/fx') ? 'Compra/Venta Dólares' :
    pathname.includes('/dashboard/check-trade') ? 'Compra/Venta Cheques' :
    pathname.includes('/dashboard/commissions') ? 'Comisiones Varias' :
    pathname.includes('/dashboard/daily-ledger') ? 'Caja Diaria' :
    pathname.includes('/dashboard/transactions') ? 'Libro Mayor' :
    pathname.includes('/dashboard/settings') ? 'Usuarios y Operadores' :
    'Panel Central';

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-ink">
      {/* Overlay del menú móvil */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 md:hidden ${
          mobileMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar móvil */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[258px] max-w-[85vw] transform border-r border-line-strong bg-surface shadow-2xl transition-transform duration-300 md:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onNavigate={() => setMobileMenuOpen(false)} onLogout={logout} />
      </aside>

      {/* Sidebar desktop */}
      <aside className="hidden w-[258px] shrink-0 border-r border-line-strong md:block">
        <Sidebar onLogout={logout} />
      </aside>

      {/* Contenido */}
      <main className="flex-1 overflow-y-auto">
        {/* Barra superior móvil */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex items-center gap-2 rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-track"
          >
            <span className="text-lg leading-none">☰</span>
            Menú
          </button>
          <div className="text-[13px] font-semibold text-ink">{currentTitle}</div>
          <button
            onClick={logout}
            className="rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] text-muted transition-colors hover:text-ink"
          >
            Salir
          </button>
        </div>

        {/* El ancho máximo lo define cada página (el dashboard usa 1180px;
            las vistas con tablas densas usan más). */}
        <div className="px-5 py-6 md:px-10 md:pt-[30px] md:pb-14">
          {children}
        </div>
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#ffffff', color: '#1c1c19', border: '1px solid #ececea' },
          success: { iconTheme: { primary: '#0a7a52', secondary: '#ffffff' } },
          error: { iconTheme: { primary: '#b42318', secondary: '#ffffff' } },
        }}
      />
    </div>
  );
}
