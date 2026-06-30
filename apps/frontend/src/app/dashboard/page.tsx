'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/services/api';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { Badge, Pill, type Tone } from '@/components/ui/Badge';

// ── Metadatos de tipo de movimiento (badge + color de monto) ──────────────
const TX_META: Record<string, { label: string; tone: Tone }> = {
  INCOME:      { label: 'Ingreso',       tone: 'positive' },
  OUTCOME:     { label: 'Egreso',        tone: 'negative' },
  FX_TRADE:    { label: 'C/V USD',       tone: 'warn' },
  CHECK_TRADE: { label: 'Cheque',        tone: 'accent' },
  TRANSFER:    { label: 'Transferencia', tone: 'neutral' },
};

const DEMO_MONTHLY_CHART = [
  { month: 'Nov', ingresos: 92,  egresos: 61 },
  { month: 'Dic', ingresos: 104, egresos: 72 },
  { month: 'Ene', ingresos: 88,  egresos: 65 },
  { month: 'Feb', ingresos: 118, egresos: 79 },
  { month: 'Mar', ingresos: 96,  egresos: 70 },
  { month: 'Abr', ingresos: 132, egresos: 74 },
  { month: 'May', ingresos: 110, egresos: 68 },
  { month: 'Jun', ingresos: 128, egresos: 72 },
];
const DEMO_CATEGORIES = [
  { name: 'Proveedores', pct: 38, amt: '$ 27,3M' },
  { name: 'Sueldos',     pct: 24, amt: '$ 17,2M' },
  { name: 'Impuestos',   pct: 16, amt: '$ 11,5M' },
  { name: 'Servicios',   pct: 12, amt: '$ 8,6M' },
  { name: 'Alquiler',    pct: 6,  amt: '$ 4,3M' },
  { name: 'Otros',       pct: 4,  amt: '$ 2,9M' },
];
const CAT_MAX = Math.max(...DEMO_CATEGORIES.map(c => c.pct));

interface DashboardData {
  date: string;
  metrics: { checksBalanceARS: number; checksBalanceUSD: number; checksInPortfolio: number };
  treasuryStatus: Array<{ name: string; closingBalance: { ARS: number; USD: number }; movementsToday: number }>;
  recentTransactions: Array<{
    id: string;
    description: string;
    type: string;
    category: string;
    operation_date: string;
    user?: { name: string };
    movements: Array<{ amount: number; type: string; currency: string }>;
  }>;
  chartData: Array<{ date: string; Ingresos: number; Egresos: number }>;
}

interface Check { id: string; status: string; due_date: string; }

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = (n: number, currency: 'ARS' | 'USD' = 'ARS') =>
  currency === 'USD'
    ? `U$S ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const daysUntil = (dateStr: string) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [now, setNow] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [fxPos, setFxPos] = useState<{ comprasUSD: number; ventasUSD: number; comprasARS: number; ventasARS: number; netUSD: number; totalOps: number } | null>(null);
  const [fxTc, setFxTc] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [dashData, checksData, bsData] = await Promise.all([
        fetchApi('/reports/daily-closing'),
        fetchApi('/checks'),
        fetchApi('/reports/balance-sheet'),
      ]);
      setData(dashData);
      setFxPos(bsData?.fxPosition ?? null);
      const allChecks = Array.isArray(checksData) ? checksData : [];
      setChecks(allChecks.filter((c: any) => {
        if (c.status !== 'IN_PORTFOLIO') return false;
        const d = daysUntil(c.due_date);
        return d >= 0 && d <= 7;
      }));
    } catch (e) { console.error(e); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isLoading = !data;

  const totalCajasARS = data?.treasuryStatus.reduce((acc, t) => acc + (t.closingBalance?.ARS || 0), 0) ?? 0;
  const totalCajasUSD = data?.treasuryStatus.reduce((acc, t) => acc + (t.closingBalance?.USD || 0), 0) ?? 0;
  const sumIngresos = data?.chartData.reduce((acc, c) => acc + c.Ingresos, 0) ?? 0;
  const sumEgresos = data?.chartData.reduce((acc, c) => acc + c.Egresos, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1180px] animate-in fade-in duration-500">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="mb-[26px] flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Panel Central</h1>
          <p className="mt-[5px] text-[13.5px] text-subtle">
            {now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {data?.date && ` · Actualizado ${new Date(data.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <div className="flex gap-[10px]">
          <button
            onClick={load}
            disabled={refreshing}
            className="rounded-[9px] border border-line bg-surface px-[15px] py-[9px] text-[13px] font-medium text-ink-soft transition-colors hover:bg-track disabled:opacity-50"
          >
            <span className={`mr-1 inline-block ${refreshing ? 'animate-spin' : ''}`}>↻</span>
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button
            onClick={() => router.push('/dashboard/incomes')}
            className="rounded-[9px] bg-ink px-[16px] py-[9px] text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            + Movimiento
          </button>
        </div>
      </header>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-[14px] lg:grid-cols-4">
        <KpiCard
          label="Balance total"
          value={fmt(totalCajasARS)}
          delta={totalCajasUSD ? fmt(totalCajasUSD, 'USD') : undefined}
          deltaTone="accent"
          sub={totalCajasUSD ? 'en dólares' : 'en cajas'}
          loading={isLoading}
        />
        <KpiCard
          label="Ingresos (30 días)"
          value={fmt(sumIngresos)}
          sub="flujo de los últimos 30 días"
          loading={isLoading}
        />
        <KpiCard
          label="Egresos (30 días)"
          value={fmt(sumEgresos)}
          sub="flujo de los últimos 30 días"
          loading={isLoading}
        />
        <KpiCard
          label="Cheques en cartera"
          value={isLoading ? '' : fmt(data.metrics.checksBalanceARS)}
          delta={isLoading ? undefined : `${data.metrics.checksInPortfolio} cheques`}
          deltaTone="accent"
          sub={checks.length > 0 ? `· ${checks.length} esta semana` : undefined}
          loading={isLoading}
        />
      </div>

      {/* ── GRÁFICO ────────────────────────────────────────────────────── */}
      <Card className="mb-4 px-6 py-[22px]">
        <div className="mb-[10px] flex items-start justify-between">
          <div>
            <div className="text-[15.5px] font-semibold text-ink">Ingresos vs. Egresos</div>
            <div className="mt-[2px] text-[12.5px] text-subtle">Últimos 8 meses · en millones de ARS</div>
          </div>
          <div className="flex items-center gap-[18px]">
            <span className="flex items-center gap-[7px] text-[12.5px] text-ink-soft">
              <span className="h-[11px] w-[11px] rounded-[3px] bg-accent" />Ingresos
            </span>
            <span className="flex items-center gap-[7px] text-[12.5px] text-ink-soft">
              <span className="h-[11px] w-[11px] rounded-[3px] bg-accent-soft" />Egresos
            </span>
          </div>
        </div>
        {/* Nota: datos de demo (DEMO_MONTHLY_CHART) — ver comentario arriba. */}
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={DEMO_MONTHLY_CHART} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#f2f2ef" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#b4b4ac', fontSize: 11.5 }} dy={8} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #efefec', borderRadius: 10, fontSize: 12, color: '#1c1c19' }}
              formatter={(v: any) => [`${v} M`, undefined]}
            />
            <Area type="linear" dataKey="ingresos" name="Ingresos" stroke="#5e5ce6" strokeWidth={2.5} fill="#5e5ce6" fillOpacity={0.07} />
            <Area type="linear" dataKey="egresos" name="Egresos" stroke="#cbcbf6" strokeWidth={2.5} fill="transparent" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ── POSICIÓN FX ────────────────────────────────────────────────── */}
      {fxPos && (() => {
        const netUSDheld = fxPos.comprasUSD - fxPos.ventasUSD;      // > 0 = comprador neto
        const netARSreceived = fxPos.ventasARS - fxPos.comprasARS;
        const tcImplicito = Math.abs(netUSDheld) > 0.001 ? Math.abs(netARSreceived) / Math.abs(netUSDheld) : null;
        const tc = parseFloat(fxTc);
        const resultado = !isNaN(tc) && tc > 0 ? netARSreceived + netUSDheld * tc : null;
        const fxCells = [
          { label: 'Compras USD', value: fmt(fxPos.comprasUSD, 'USD'), color: 'text-ink', sub: `${fmt(fxPos.comprasARS)} pagados` },
          { label: 'Ventas USD', value: fmt(fxPos.ventasUSD, 'USD'), color: 'text-ink', sub: `${fmt(fxPos.ventasARS)} cobrados` },
          { label: 'Diferencial USD', value: fmt(Math.abs(netUSDheld), 'USD'), color: 'text-accent', sub: netUSDheld >= 0 ? 'Comprados neto' : 'Vendidos neto' },
          { label: 'Diferencial ARS', value: fmt(Math.abs(netARSreceived)), color: 'text-accent', sub: netARSreceived >= 0 ? 'ARS cobrados neto' : 'ARS pagados neto' },
        ];
        return (
          <Card className="mb-4 px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[15.5px] font-semibold text-ink">Posición neta de cambio (FX)</div>
                <div className="mt-[2px] text-[12.5px] text-subtle">Acumulado histórico · {fxPos.totalOps} operaciones</div>
              </div>
              <Pill tone="accent">{fxPos.netUSD >= 0 ? 'Posición vendedora' : 'Posición compradora'}</Pill>
            </div>
            <div className="grid grid-cols-2 overflow-hidden rounded-[11px] border border-[#f0f0ec] sm:grid-cols-4">
              {fxCells.map((c, i) => (
                <div key={c.label} className={`px-[18px] py-[15px] ${i < fxCells.length - 1 ? 'sm:border-r' : ''} border-[#f0f0ec]`}>
                  <div className="mb-[9px] text-[11px] font-medium uppercase tracking-[0.03em] text-placeholder">{c.label}</div>
                  <div className={`font-mono text-[16.5px] font-semibold ${c.color}`}>{c.value}</div>
                  <div className="mt-1 text-[11.5px] text-faint">{c.sub}</div>
                </div>
              ))}
            </div>

            {/* TC de la posición + calculadora de referencia (reutiliza fxTc) */}
            <div className="mt-[14px] flex flex-col gap-3 border-t border-[#f0f0ec] pt-[14px] sm:flex-row sm:flex-wrap sm:items-center">
              {tcImplicito !== null && (
                <div className="flex items-center gap-3">
                  <span className="text-[12.5px] font-medium text-muted">TC de la posición</span>
                  <span className="font-mono text-[18px] font-semibold text-accent">
                    {tcImplicito.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="hidden text-[12px] italic text-faint lg:inline">
                    {netUSDheld < 0 ? 'Comprá por debajo → ganás · por encima → perdés' : 'Vendé por encima → ganás · por debajo → perdés'}
                  </span>
                </div>
              )}
              <div className="flex flex-1 items-center justify-end gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-[12px] font-medium text-muted">TC de referencia</label>
                  <div className="flex items-center rounded-[9px] border border-line bg-surface px-3 py-[6px]">
                    <span className="mr-1 text-[12px] text-faint">$</span>
                    <input
                      type="number" min="0" step="1" placeholder="ej. 1400"
                      value={fxTc} onChange={e => setFxTc(e.target.value)}
                      className="w-24 bg-transparent font-mono text-[13px] text-ink focus:outline-none"
                    />
                  </div>
                </div>
                {resultado !== null && (
                  <span className={`font-mono text-[15px] font-semibold ${resultado >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {resultado >= 0 ? '+' : ''}{fmt(resultado)}
                  </span>
                )}
              </div>
            </div>
          </Card>
        );
      })()}

      {/* ── FILA INFERIOR ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">

        {/* Egresos por categoría (datos de demo) */}
        <Card className="px-[22px] py-5">
          <div className="mb-[18px] text-[15.5px] font-semibold text-ink">Egresos por categoría</div>
          {DEMO_CATEGORIES.map(cat => {
            const w = (cat.pct / CAT_MAX) * 100;
            const op = 0.4 + (cat.pct / CAT_MAX) * 0.6;
            return (
              <div key={cat.name} className="mb-[14px]">
                <div className="mb-[6px] flex justify-between text-[12.5px]">
                  <span className="font-medium text-ink-soft">{cat.name}</span>
                  <span className="font-mono text-subtle">{cat.amt} · {cat.pct}%</span>
                </div>
                <div className="h-[7px] overflow-hidden rounded-[4px] bg-track">
                  <div className="h-full rounded-[4px] bg-accent" style={{ width: `${w}%`, opacity: op }} />
                </div>
              </div>
            );
          })}
        </Card>

        {/* Movimientos recientes (datos reales) */}
        <Card className="px-[22px] py-5">
          <div className="mb-[14px] flex items-center justify-between">
            <div className="text-[15.5px] font-semibold text-ink">Movimientos recientes</div>
            <button
              onClick={() => router.push('/dashboard/transactions')}
              className="text-[12.5px] font-medium text-accent hover:underline"
            >
              Ver todo
            </button>
          </div>

          {isLoading ? (
            [...Array(5)].map((_, i) => <div key={i} className="my-2 h-[44px] rounded-[9px] bg-track animate-pulse" />)
          ) : data.recentTransactions.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-faint">Sin movimientos recientes.</p>
          ) : data.recentTransactions.map((tx, i) => {
            const meta = TX_META[tx.type] ?? { label: tx.type, tone: 'neutral' as Tone };
            const mainMov = tx.movements.find(m => m.type === (tx.type === 'INCOME' ? 'DEBIT' : 'CREDIT')) ?? tx.movements[0];
            const isPositive = tx.type === 'INCOME';
            const amtColor = isPositive ? 'text-positive' : tx.type === 'OUTCOME' ? 'text-negative' : 'text-ink';
            return (
              <div
                key={tx.id}
                className={`-mx-2 flex items-center justify-between rounded-[9px] px-2 py-[11px] transition-colors hover:bg-row-hover ${i > 0 ? 'border-t border-[#f4f4f1]' : ''}`}
              >
                <div className="flex min-w-0 items-center gap-[13px]">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink-body">{tx.description || '—'}</div>
                    <div className="text-[11.5px] text-faint">
                      {new Date(tx.operation_date).toLocaleDateString('es-AR')}
                      {tx.user?.name ? ` · ${tx.user.name}` : ''}
                    </div>
                  </div>
                </div>
                <span className={`shrink-0 font-mono text-[13.5px] font-semibold ${amtColor}`}>
                  {isPositive ? '+' : tx.type === 'OUTCOME' ? '−' : ''}
                  {mainMov?.currency === 'USD' ? 'U$S ' : '$ '}
                  {Number(mainMov?.amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
