'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Toaster } from 'react-hot-toast';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sidebar Accordion states
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    cuentas: false,
    finanzas: false,
    reportes: false,
    configuracion: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Auto-open sections based on current path
  useEffect(() => {
    if (pathname.includes('/clients')) {
      setOpenSections(prev => ({ ...prev, cuentas: true }));
    } else if (pathname.includes('/fx') || pathname.includes('/check-trade') || pathname.includes('/commissions') || pathname.includes('/boxes')) {
      setOpenSections(prev => ({ ...prev, finanzas: true }));
    } else if (
      pathname.includes('/daily-ledger') ||
      pathname.includes('/transactions') ||
      pathname.includes('/checks') ||
      pathname.includes('/reports')
    ) {
      setOpenSections(prev => ({ ...prev, reportes: true }));
    } else if (pathname.includes('/settings')) {
      setOpenSections(prev => ({ ...prev, configuracion: true }));
    }
  }, [pathname]);

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

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-transparent">
        <div className="w-8 h-8 rounded-full border-2 border-[#0ea5e9] border-t-transparent animate-spin"></div>
      </div>
    );
  }

  const linkBase =
    'block px-4 py-3 rounded-xl font-medium transition-all duration-300 relative group overflow-hidden mt-1';
  const getLinkClass = (path: string) =>
    pathname === path
      ? `${linkBase} bg-gradient-to-r from-[#0ea5e9]/20 to-transparent text-[#f8fafc] border border-[#0ea5e9]/30 shadow-[0_0_15px_rgba(14,165,233,0.15)]`
      : `${linkBase} text-[#94a3b8] hover:text-[#f8fafc] hover:bg-white/5 border border-transparent`;

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
    'Resumen Financiero';

  // ── Shared nav content (renders inside both desktop + mobile sidebars) ───
  const NavContent = ({ onClose }: { onClose?: () => void }) => (
    <>
      <Link
        href="/dashboard"
        onClick={onClose}
        className={`${getLinkClass('/dashboard')} mt-4 mb-4 flex items-center justify-center border-[#0ea5e9]/30 bg-gradient-to-r from-[#0ea5e9]/10 to-transparent shadow-sm border`}
      >
        🏠 Panel Central
      </Link>

      {/* ── ACCESOS RÁPIDOS ──────────────────────────────────────── */}
      <div className="mb-3 px-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#475569] mb-2 px-1">
          Accesos Rápidos
        </p>
        <Link
          href="/dashboard/incomes"
          onClick={onClose}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-200 mt-1 border ${
            pathname === '/dashboard/incomes'
              ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/40'
          }`}
        >
          <span className="text-base leading-none font-black">↑</span>
          <span>+ Nuevo Ingreso</span>
        </Link>
        <Link
          href="/dashboard/expenses"
          onClick={onClose}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-200 mt-1 border ${
            pathname === '/dashboard/expenses'
              ? 'bg-red-500/25 text-red-300 border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
              : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40'
          }`}
        >
          <span className="text-base leading-none font-black">↓</span>
          <span>+ Nuevo Egreso</span>
        </Link>
      </div>

      {/* ── FINANZAS ──────────────────────────────────────────────── */}
      <div className="mb-2 border border-[#334155]/50 rounded-xl overflow-hidden bg-[#0a1324]/50">
        <button
          onClick={() => toggleSection('finanzas')}
          className="w-full flex items-center justify-between px-5 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider hover:bg-[#141f32]/50 transition-colors"
        >
          <span className="flex items-center gap-2">💹 Finanzas</span>
          <span className={`transform transition-transform ${openSections.finanzas ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {openSections.finanzas && (
          <div className="space-y-1 px-2 pb-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <Link href="/dashboard/boxes" onClick={onClose} className={getLinkClass('/dashboard/boxes')}>
              Gestión de Cajas
            </Link>
            <Link href="/dashboard/fx" onClick={onClose} className={getLinkClass('/dashboard/fx')}>
              Compra/Venta USD
            </Link>
            <Link href="/dashboard/check-trade" onClick={onClose} className={getLinkClass('/dashboard/check-trade')}>
              Compra/Venta Cheques
            </Link>
            <Link href="/dashboard/commissions" onClick={onClose} className={getLinkClass('/dashboard/commissions')}>
              Comisiones Varias
            </Link>
          </div>
        )}
      </div>

      {/* ── CUENTAS / CLIENTES ────────────────────────────────────── */}
      <div className="mb-2 border border-[#334155]/50 rounded-xl overflow-hidden bg-[#0a1324]/50">
        <button
          onClick={() => toggleSection('cuentas')}
          className="w-full flex items-center justify-between px-5 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider hover:bg-[#141f32]/50 transition-colors"
        >
          <span className="flex items-center gap-2">👥 Cuentas / Clientes</span>
          <span className={`transform transition-transform ${openSections.cuentas ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {openSections.cuentas && (
          <div className="space-y-1 px-2 pb-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <Link href="/dashboard/clients" onClick={onClose} className={getLinkClass('/dashboard/clients')}>
              Cajas de Clientes
            </Link>
          </div>
        )}
      </div>

      {/* ── REPORTES ──────────────────────────────────────────────── */}
      <div className="mb-2 border border-[#334155]/50 rounded-xl overflow-hidden bg-[#0a1324]/50">
        <button
          onClick={() => toggleSection('reportes')}
          className="w-full flex items-center justify-between px-5 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider hover:bg-[#141f32]/50 transition-colors"
        >
          <span className="flex items-center gap-2">📊 Reportes</span>
          <span className={`transform transition-transform ${openSections.reportes ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {openSections.reportes && (
          <div className="space-y-1 px-2 pb-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <Link href="/dashboard/daily-ledger" onClick={onClose} className={getLinkClass('/dashboard/daily-ledger')}>
              Caja Diaria
            </Link>
            <Link href="/dashboard/transactions" onClick={onClose} className={getLinkClass('/dashboard/transactions')}>
              Libro Mayor
            </Link>
            <Link href="/dashboard/checks" onClick={onClose} className={getLinkClass('/dashboard/checks')}>
              Cartera de Cheques
            </Link>
            <Link href="/dashboard/reports" onClick={onClose} className={getLinkClass('/dashboard/reports')}>
              Saldos y Reportes
            </Link>
          </div>
        )}
      </div>

      {/* ── CONFIGURACIÓN ─────────────────────────────────────────── */}
      <div className="mb-2 border border-[#334155]/50 rounded-xl overflow-hidden bg-[#0a1324]/50">
        <button
          onClick={() => toggleSection('configuracion')}
          className="w-full flex items-center justify-between px-5 py-4 text-xs font-bold text-[#64748b] uppercase tracking-wider hover:bg-[#141f32]/50 transition-colors"
        >
          <span className="flex items-center gap-2">⚙️ Configuración</span>
          <span className={`transform transition-transform ${openSections.configuracion ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {openSections.configuracion && (
          <div className="space-y-1 px-2 pb-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <Link href="/dashboard/settings/users" onClick={onClose} className={getLinkClass('/dashboard/settings/users')}>
              Usuarios y Operadores
            </Link>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-transparent text-[#f8fafc] overflow-hidden">
      {/* Mobile menu overlay */}
      <div
        className={`fixed inset-0 bg-black/80 z-40 transition-opacity duration-300 md:hidden ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[#050B14] border-r border-[#334155]/70 shadow-2xl transform transition-transform duration-300 md:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-[#334155]/50">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-center">
              <img src="/logo.svg" alt="Acme" className="h-14 w-auto drop-shadow-md" />
            </Link>
            <button onClick={() => setMobileMenuOpen(false)} className="text-[#94a3b8] hover:text-[#f8fafc]">
              ✕
            </button>
          </div>
        </div>
        <nav className="px-4 pb-4 space-y-2 overflow-y-auto h-[calc(100%-140px)]">
          <NavContent onClose={() => setMobileMenuOpen(false)} />
        </nav>
        <div className="p-4 border-t border-[#334155]/50">
          <button
            onClick={() => { localStorage.removeItem('token'); router.push('/login'); }}
            className="w-full text-left px-4 py-2 text-[#64748b] hover:text-[#f8fafc] transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside className="w-64 glass-panel border-r border-[#334155]/50 hidden md:flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
        <div className="p-6 flex items-center justify-center">
          <Link href="/dashboard" className="flex items-center justify-center w-full">
            <img
              src="/logo.svg"
              alt="Acme Finanzas"
              className="w-[180px] h-auto drop-shadow-md hover:drop-shadow-xl transition-all cursor-pointer"
            />
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-2 relative z-10 overflow-y-auto">
          <NavContent />
        </nav>
        <div className="p-4 border-t border-[#334155]/50 relative z-10">
          <button
            onClick={() => { localStorage.removeItem('token'); router.push('/login'); }}
            className="w-full text-left px-4 py-2 text-[#64748b] hover:text-[#f8fafc] transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full relative z-10">
        {/* Background ambient light */}
        <div className="fixed top-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#0ea5e9]/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#38bdf8]/5 rounded-full blur-[150px] pointer-events-none"></div>

        <div className="p-4 md:p-8 relative z-10 w-full h-full max-w-7xl mx-auto">
          <div className="md:hidden mb-6 flex items-center justify-between gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#0ea5e9]/15 border border-[#0ea5e9]/30 text-sm font-semibold text-[#f8fafc] hover:bg-[#0ea5e9]/25 transition"
            >
              <span className="text-xl leading-none">☰</span>
              Menú
            </button>
            <div className="text-sm font-semibold text-[#d1dded]">{currentTitle}</div>
            <button
              onClick={() => { localStorage.removeItem('token'); router.push('/login'); }}
              className="px-4 py-2 text-sm rounded-2xl bg-white/5 border border-[#334155] text-[#94a3b8] hover:text-[#f8fafc] transition"
            >
              Salir
            </button>
          </div>
          {children}
        </div>
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#081329', color: '#f8fafc', border: '1px solid #2c394a' },
          success: { iconTheme: { primary: '#10b981', secondary: '#f8fafc' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#f8fafc' } },
        }}
      />
    </div>
  );
}
