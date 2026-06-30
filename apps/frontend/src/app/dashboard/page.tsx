'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';

// ── Type labels ───────────────────────────────────────────────────────────
const TX_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  INCOME:      { label: 'Ingreso',       color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  OUTCOME:     { label: 'Egreso',        color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  FX_TRADE:    { label: 'C/V Dólares',   color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20' },
  CHECK_TRADE: { label: 'C/V Cheques',   color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/20' },
  TRANSFER:    { label: 'Transferencia', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
};

interface DashboardData {
  date: string;
  metrics: {
    checksBalanceARS: number;
    checksBalanceUSD: number;
    checksInPortfolio: number;
  };
  treasuryStatus: Array<{
    name: string;
    closingBalance: { ARS: number; USD: number };
    movementsToday: number;
  }>;
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

interface Check {
  id: string;
  check_number: string;
  bank_name: string;
  amount: number;
  currency: string;
  due_date: string;
  source_client?: { name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = (n: number, currency: 'ARS' | 'USD' = 'ARS') =>
  currency === 'USD'
    ? `U$S ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const daysUntil = (dateStr: string) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData]         = useState<DashboardData | null>(null);
  const [checks, setChecks]     = useState<Check[]>([]);
  const [now, setNow]           = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [fxPos, setFxPos]       = useState<{ comprasUSD: number; ventasUSD: number; comprasARS: number; ventasARS: number; netUSD: number; totalOps: number } | null>(null);
  const [fxTc, setFxTc]         = useState<string>('');

  // Live clock
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
      // Checks expiring within 7 days (IN_PORTFOLIO only)
      const soon = allChecks
        .filter((c: any) => c.status === 'IN_PORTFOLIO')
        .filter((c: any) => {
          const d = daysUntil(c.due_date);
          return d >= 0 && d <= 7;
        })
        .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
      setChecks(soon);
    } catch (e) { console.error(e); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCajasARS = data?.treasuryStatus.reduce((acc, t) => acc + (t.closingBalance?.ARS || 0), 0) ?? 0;
  const totalCajasUSD = data?.treasuryStatus.reduce((acc, t) => acc + (t.closingBalance?.USD || 0), 0) ?? 0;
  const totalMovsHoy  = data?.treasuryStatus.reduce((acc, t) => acc + (t.movementsToday || 0), 0) ?? 0;

  const isLoading = !data;

  return (
    <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500 max-w-7xl mx-auto pb-12">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#d1dded] mb-1 tracking-tight">Panel Central</h1>
          <p className="text-[#aab6c7] text-sm">
            {now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.date && (
            <span className="text-xs text-[#475569]">
              Actualizado: {new Date(data.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={refreshing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-[#334155]/50 text-sm font-medium transition-all ${refreshing ? 'opacity-50 cursor-not-allowed text-[#475569]' : 'text-[#94a3b8] hover:text-white hover:bg-white/5'}`}
          >
            <span className={refreshing ? 'animate-spin' : ''}>↻</span>
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </header>

      {/* ── KPI GRID ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Caja ARS */}
        <div className="glass-panel hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(14,165,233,0.12)] transition-all duration-300 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all duration-500" />
          <div className="flex items-start justify-between relative z-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-3">Cajas ARS</p>
            <span className="text-lg">💵</span>
          </div>
          <p className={`text-2xl font-bold tracking-tight relative z-10 ${isLoading ? 'text-[#334155] animate-pulse' : 'text-[#f8fafc]'}`}>
            {isLoading ? '—' : fmt(totalCajasARS)}
          </p>
          <p className="text-xs text-[#475569] mt-2 relative z-10">{totalMovsHoy} mov. hoy</p>
        </div>

        {/* Caja USD */}
        <div className="glass-panel hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(52,211,153,0.12)] transition-all duration-300 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-500" />
          <div className="flex items-start justify-between relative z-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-3">Cajas USD</p>
            <span className="text-lg">💲</span>
          </div>
          <p className={`text-2xl font-bold tracking-tight relative z-10 ${isLoading ? 'text-[#334155] animate-pulse' : 'text-emerald-300'}`}>
            {isLoading ? '—' : fmt(totalCajasUSD, 'USD')}
          </p>
          <p className="text-xs text-[#475569] mt-2 relative z-10">Dólares físicos en caja</p>
        </div>

        {/* Cheques en Cartera */}
        <div className="glass-panel hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(139,92,246,0.12)] transition-all duration-300 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all duration-500" />
          <div className="flex items-start justify-between relative z-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-3">Cheques en Cartera</p>
            <span className="text-lg">🏦</span>
          </div>
          <p className={`text-2xl font-bold tracking-tight relative z-10 ${isLoading ? 'text-[#334155] animate-pulse' : 'text-violet-300'}`}>
            {isLoading ? '—' : fmt(data.metrics.checksBalanceARS)}
          </p>
          <p className="text-xs text-[#475569] mt-2 relative z-10">
            {isLoading ? '—' : `${data.metrics.checksInPortfolio} cheque(s)`}
            {data?.metrics.checksBalanceUSD ? ` · U$S ${data.metrics.checksBalanceUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
          </p>
        </div>

        {/* Cheques Próximos a Vencer (alerta) */}
        <div
          onClick={() => router.push('/dashboard/checks')}
          className={`cursor-pointer glass-panel hover:scale-[1.02] transition-all duration-300 rounded-2xl p-5 relative overflow-hidden group ${checks.length > 0 ? 'hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] border-amber-500/20' : 'border-[#334155]/50'}`}
        >
          <div className={`absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl transition-all duration-500 ${checks.length > 0 ? 'bg-amber-500/10 group-hover:bg-amber-500/20' : 'bg-[#334155]/10'}`} />
          <div className="flex items-start justify-between relative z-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-3">Vencen en 7 días</p>
            <span className="text-lg">{checks.length > 0 ? '⚠️' : '✅'}</span>
          </div>
          <p className={`text-2xl font-bold tracking-tight relative z-10 ${checks.length > 0 ? 'text-amber-300' : 'text-[#475569]'}`}>
            {checks.length} cheque{checks.length !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-[#475569] mt-2 relative z-10">
            {checks.length > 0
              ? `Total: ${fmt(checks.reduce((a, c) => a + Number(c.amount), 0))}`
              : 'Sin vencimientos próximos'}
          </p>
        </div>
      </div>

      {/* ── CHEQUES PRÓXIMOS A VENCER ────────────────────────────────── */}
      {checks.length > 0 && (
        <section className="glass-panel rounded-2xl p-5 mb-8 border border-amber-500/20 bg-amber-500/5 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              ⚠️ Cheques próximos a vencer (7 días)
            </h2>
            <button
              onClick={() => router.push('/dashboard/checks')}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium underline underline-offset-2"
            >
              Ver todos →
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {checks.map(c => {
              const d = daysUntil(c.due_date);
              return (
                <div key={c.id} className={`flex items-center justify-between p-3 rounded-xl border text-sm ${d === 0 ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/20 bg-amber-500/5'}`}>
                  <div>
                    <p className="font-semibold text-[#f8fafc]">{c.bank_name} <span className="text-[#64748b] font-normal">#{c.check_number}</span></p>
                    <p className="text-xs text-[#64748b] mt-0.5">{c.source_client?.name ?? 'Ventanilla'}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold font-mono ${d === 0 ? 'text-red-400' : 'text-amber-300'}`}>
                      {fmt(Number(c.amount))}
                    </p>
                    <p className={`text-xs font-bold mt-0.5 ${d === 0 ? 'text-red-400' : 'text-amber-500'}`}>
                      {d === 0 ? 'Vence HOY' : `${d} día${d !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── GRÁFICO ─────────────────────────────────────────────────────── */}
      <section className="glass-panel rounded-2xl p-6 mb-8" style={{ height: '340px' }}>
        <h2 className="text-base font-bold text-[#d1dded] mb-1">Flujo de Fondos — Últimos 30 días (ARS)</h2>
        <p className="text-xs text-[#475569] mb-5">Ingresos vs. Egresos diarios en pesos.</p>
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={data?.chartData || []} margin={{ top: 0, right: 0, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d40" vertical={false} />
            <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dy={8} interval="preserveStartEnd" />
            <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
            <Tooltip
              cursor={{ fill: '#1e2d40', opacity: 0.6 }}
              contentStyle={{ backgroundColor: '#0a1324', borderColor: '#334155', borderRadius: '10px', color: '#d1dded', fontSize: 12 }}
              formatter={(v: any) => [`$ ${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, undefined]}
            />
            <Legend wrapperStyle={{ paddingTop: '12px', fontSize: 12 }} />
            <Bar dataKey="Ingresos" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Egresos"  fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* ── POSICIÓN NETA FX ─────────────────────────────────────── */}
      {fxPos && (
        <section className="glass-panel rounded-2xl border border-violet-500/30 bg-violet-500/5 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-violet-500/20 flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-violet-400 uppercase tracking-wider">Posición Neta FX</h2>
              <p className="text-xs text-[#64748b] mt-0.5">Acumulado histórico de compras y ventas de divisas · {fxPos.totalOps} operaciones</p>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${fxPos.netUSD >= 0 ? 'bg-violet-500/20 text-violet-300' : 'bg-rose-500/20 text-rose-300'}`}>
              {fxPos.netUSD >= 0 ? 'Posición Vendedora' : 'Posición Compradora'}
            </span>
          </div>
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#0f172a]/40 rounded-xl p-4 border border-[#334155]/30">
              <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Compras USD</p>
              <p className="text-lg font-bold font-mono text-sky-400">U$S {fxPos.comprasUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs font-mono text-[#475569] mt-1">$ {fxPos.comprasARS.toLocaleString('en-US', { minimumFractionDigits: 2 })} pagados</p>
            </div>
            <div className="bg-[#0f172a]/40 rounded-xl p-4 border border-[#334155]/30">
              <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Ventas USD</p>
              <p className="text-lg font-bold font-mono text-emerald-400">U$S {fxPos.ventasUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs font-mono text-[#475569] mt-1">$ {fxPos.ventasARS.toLocaleString('en-US', { minimumFractionDigits: 2 })} cobrados</p>
            </div>
            <div className="bg-[#0f172a]/40 rounded-xl p-4 border border-[#334155]/30">
              <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Diferencial USD</p>
              <p className={`text-lg font-bold font-mono ${fxPos.netUSD >= 0 ? 'text-violet-300' : 'text-rose-400'}`}>U$S {Math.abs(fxPos.netUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-[#475569] mt-1">{fxPos.netUSD >= 0 ? 'Vendidos neto' : 'Comprados neto'}</p>
            </div>
            <div className="bg-[#0f172a]/40 rounded-xl p-4 border border-[#334155]/30">
              <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Diferencial ARS</p>
              <p className={`text-lg font-bold font-mono ${(fxPos.ventasARS - fxPos.comprasARS) >= 0 ? 'text-violet-300' : 'text-rose-400'}`}>$ {Math.abs(fxPos.ventasARS - fxPos.comprasARS).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-[#475569] mt-1">{(fxPos.ventasARS - fxPos.comprasARS) >= 0 ? 'ARS cobrados neto' : 'ARS pagados neto'}</p>
            </div>
          </div>
          {/* TC de referencia + resultado */}
          {(() => {
            const netUSDheld     = fxPos.comprasUSD - fxPos.ventasUSD;
            const netARSreceived = fxPos.ventasARS  - fxPos.comprasARS;
            const tcImplicito = Math.abs(netUSDheld) > 0.001 ? Math.abs(netARSreceived) / Math.abs(netUSDheld) : null;
            const tc = parseFloat(fxTc);
            const resultado = !isNaN(tc) && tc > 0 ? netARSreceived + netUSDheld * tc : null;
            return (
              <div className="border-t border-violet-500/10">
                {tcImplicito !== null && (
                  <div className="px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-violet-500/10">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider">TC de la posición</span>
                      <span className="text-xl font-bold font-mono text-violet-300">{tcImplicito.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-xs text-[#64748b] italic">
                      {netUSDheld < 0 ? 'Comprá por debajo de este TC → ganás · Comprá por encima → perdés' : 'Vendé por encima de este TC → ganás · Vendé por debajo → perdés'}
                    </p>
                  </div>
                )}
                <div className="px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">TC de referencia</label>
                    <div className="flex items-center bg-[#0f172a]/60 border border-[#334155]/50 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-[#475569] mr-1">$</span>
                      <input type="number" min="0" step="1" placeholder="ej. 1400" value={fxTc} onChange={e => setFxTc(e.target.value)} className="bg-transparent text-sm font-mono text-[#d1dded] w-28 focus:outline-none" />
                    </div>
                  </div>
                  {resultado !== null && (
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${resultado >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                      <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">Resultado a TC {tc.toLocaleString('es-AR')}</span>
                      <span className={`text-xl font-bold font-mono ${resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{resultado >= 0 ? '+' : ''}$ {resultado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {resultado === null && <p className="text-xs text-[#475569] italic">Ingresá un TC para calcular la ganancia o pérdida sobre el diferencial</p>}
                </div>
              </div>
            );
          })()}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pb-4">

        {/* ── ÚLTIMOS MOVIMIENTOS ───────────────────────────────────────── */}
        <section className="lg:col-span-3 glass-panel rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-[#d1dded]">Últimos Movimientos</h2>
            <button onClick={() => router.push('/dashboard/transactions')}
              className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium underline underline-offset-2">
              Ver todo →
            </button>
          </div>
          <div className="flex-1 space-y-2">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-[#0a1324]/60 animate-pulse" />
              ))
            ) : data.recentTransactions.length === 0 ? (
              <p className="text-[#475569] text-sm text-center py-8">Sin movimientos recientes.</p>
            ) : data.recentTransactions.map(tx => {
              const txStyle = TX_LABELS[tx.type] ?? { label: tx.type, color: 'text-[#94a3b8]', bg: 'bg-[#334155]/30 border-[#334155]/50' };
              const mainMov = tx.movements.find(m => m.type === (tx.type === 'INCOME' ? 'DEBIT' : 'CREDIT')) ?? tx.movements[0];
              const isPositive = tx.type === 'INCOME';
              return (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-[#081329]/60 border border-[#1e2d40] hover:border-[#334155] hover:bg-[#0a1324]/80 transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${txStyle.bg} ${txStyle.color}`}>
                      {txStyle.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-[#d1dded] font-medium truncate">{tx.description || '—'}</p>
                      <p className="text-[10px] text-[#475569]">
                        {new Date(tx.operation_date).toLocaleDateString('es-AR')}
                        {tx.user?.name ? ` · ${tx.user.name}` : ''}
                      </p>
                    </div>
                  </div>
                  <p className={`shrink-0 ml-3 font-bold font-mono text-sm ${isPositive ? 'text-emerald-400' : tx.type === 'TRANSFER' ? 'text-amber-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : tx.type !== 'TRANSFER' ? '−' : ''}
                    {mainMov?.currency === 'USD' ? 'U$S ' : '$ '}{Number(mainMov?.amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── ACCIONES RÁPIDAS ──────────────────────────────────────────── */}
        <section className="lg:col-span-2 glass-panel rounded-2xl p-6">
          <h2 className="text-base font-bold text-[#d1dded] mb-5">Acciones Rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '↑', label: 'Nuevo Ingreso',   sub: 'Pesos, dólares o cheque',   href: '/dashboard/incomes',     color: 'hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:shadow-[0_0_12px_rgba(16,185,129,0.1)]' },
              { icon: '↓', label: 'Nuevo Egreso',    sub: 'Registrar salida de fondos', href: '/dashboard/expenses',    color: 'hover:border-red-500/40 hover:bg-red-500/5 hover:shadow-[0_0_12px_rgba(239,68,68,0.1)]' },
              { icon: '💱', label: 'C/V Dólares',    sub: 'Compra y venta de USD',      href: '/dashboard/fx',          color: 'hover:border-sky-500/40 hover:bg-sky-500/5' },
              { icon: '🏦', label: 'C/V Cheques',    sub: 'Operar cheques en cartera',  href: '/dashboard/check-trade', color: 'hover:border-violet-500/40 hover:bg-violet-500/5' },
              { icon: '📋', label: 'Caja Diaria',   sub: 'Caja y movimientos del día', href: '/dashboard/daily-ledger',color: 'hover:border-amber-500/40 hover:bg-amber-500/5' },
              { icon: '👥', label: 'Clientes',       sub: 'Fichas y extractos',         href: '/dashboard/clients',     color: 'hover:border-[#0ea5e9]/40 hover:bg-[#0ea5e9]/5' },
            ].map(a => (
              <button
                key={a.href}
                onClick={() => router.push(a.href)}
                className={`flex flex-col items-start p-3.5 rounded-xl bg-[#081329]/60 border border-[#1e2d40] transition-all duration-200 text-left ${a.color}`}
              >
                <span className="text-xl mb-1.5 leading-none">{a.icon}</span>
                <span className="text-sm font-semibold text-[#d1dded] leading-tight">{a.label}</span>
                <span className="text-[10px] text-[#475569] mt-0.5 leading-tight">{a.sub}</span>
              </button>
            ))}
          </div>

          {/* Estado de Cajas */}
          <div className="mt-5 pt-5 border-t border-[#1e2d40]">
            <p className="text-xs font-bold uppercase tracking-wider text-[#475569] mb-3">Estado de Cajas</p>
            <div className="space-y-2">
              {isLoading ? (
                <div className="h-8 rounded-lg bg-[#0a1324]/60 animate-pulse" />
              ) : data.treasuryStatus.length === 0 ? (
                <p className="text-xs text-[#475569]">Sin cajas configuradas.</p>
              ) : data.treasuryStatus.map((box, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-[#64748b] font-medium">{box.name}</span>
                  <div className="text-right">
                    <span className="text-[#d1dded] font-mono font-bold">
                      {fmt(box.closingBalance?.ARS || 0)}
                    </span>
                    {(box.closingBalance?.USD || 0) !== 0 && (
                      <span className="text-emerald-400 font-mono font-bold ml-2">
                        {fmt(box.closingBalance?.USD || 0, 'USD')}
                      </span>
                    )}
                    <span className="text-[#334155] ml-2">· {box.movementsToday} mov.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
