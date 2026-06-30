'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fetchApi } from '@/services/api';

interface NavItem {
  label: string;
  href: string;
  /** Si es true, muestra el badge de aviso (conteo de cheques por vencer). */
  alert?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Navegación agrupada en tres secciones (General / Operaciones / Reportes),
 * tal como pide el diseño. Se incluyen todas las rutas reales existentes para
 * no perder navegación; los ítems que el prototipo no listaba se ubicaron en
 * la sección más afín.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    title: 'General',
    items: [{ label: 'Panel Central', href: '/dashboard' }],
  },
  {
    title: 'Operaciones',
    items: [
      { label: 'Ingresos', href: '/dashboard/incomes' },
      { label: 'Egresos', href: '/dashboard/expenses' },
      { label: 'Cambio USD', href: '/dashboard/fx' },
      { label: 'Compra/Venta Cheques', href: '/dashboard/check-trade' },
      { label: 'Comisiones', href: '/dashboard/commissions' },
      { label: 'Cheques', href: '/dashboard/checks', alert: true },
      { label: 'Clientes', href: '/dashboard/clients' },
    ],
  },
  {
    title: 'Reportes',
    items: [
      { label: 'Caja Diaria', href: '/dashboard/daily-ledger' },
      { label: 'Libro Mayor', href: '/dashboard/transactions' },
      { label: 'Saldos y Reportes', href: '/dashboard/reports' },
      { label: 'Gestión de Cajas', href: '/dashboard/boxes' },
      { label: 'Usuarios y Operadores', href: '/dashboard/settings/users' },
    ],
  },
];

const daysUntil = (dateStr: string) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
};

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar({ onNavigate, onLogout }: { onNavigate?: () => void; onLogout?: () => void }) {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState(0);

  // Badge de aviso en "Cheques": cheques en cartera que vencen dentro de 7 días.
  useEffect(() => {
    let active = true;
    fetchApi('/checks')
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        const soon = list.filter((c: any) => {
          if (c.status !== 'IN_PORTFOLIO') return false;
          const d = daysUntil(c.due_date);
          return d >= 0 && d <= 7;
        });
        setAlertCount(soon.length);
      })
      .catch(() => { /* silencioso: el badge simplemente no se muestra */ });
    return () => { active = false; };
  }, []);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* ── Marca ── */}
      <div className="flex items-center gap-[11px] px-[22px] pt-[22px] pb-5">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-[11px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-ink text-[16px] font-bold text-white">
            A
          </span>
          <span className="leading-[1.15]">
            <span className="block text-[15px] font-semibold tracking-[-0.01em] text-ink">Acme Finanzas</span>
            <span className="block text-[11px] text-placeholder">Tesorería</span>
          </span>
        </Link>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto px-[14px] pt-[6px] pb-[14px]">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-[18px]">
            <div className="px-[10px] pb-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-section">
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`mb-[2px] flex items-center gap-[11px] rounded-[9px] px-[10px] py-[9px] text-[14px] transition-colors duration-150 ${
                    active
                      ? 'bg-track font-semibold text-ink'
                      : 'font-medium text-muted hover:bg-[#f7f7f5] hover:text-ink'
                  }`}
                >
                  <span
                    className={`h-[7px] w-[7px] shrink-0 rounded-[2px] ${active ? 'bg-accent' : 'bg-[#d4d4cf]'}`}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.alert && alertCount > 0 && (
                    <span className="rounded-full bg-warn-bg px-[6px] py-[1px] font-mono text-[10px] font-semibold text-warn">
                      {alertCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Usuario ── */}
      <div className="flex items-center gap-[11px] border-t border-line-strong px-[18px] py-[14px]">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#e7e7e3] text-[12px] font-semibold text-muted">
          VM
        </span>
        <span className="flex-1 leading-[1.25]">
          <span className="block text-[13px] font-medium text-ink">Valentín M.</span>
          <span className="block text-[11px] text-placeholder">Administrador</span>
        </span>
        <button
          onClick={onLogout}
          className="text-[12px] text-section transition-colors hover:text-ink"
        >
          Salir
        </button>
      </div>
    </div>
  );
}
