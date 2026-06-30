'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '@/services/api';

// Argentina es UTC-3 fijo (sin cambio de horario de verano)
const todayArg = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

export default function DailyLedgerPage() {
  const [selectedDate, setSelectedDate] = useState(todayArg());
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [pl, setPl]                     = useState<{ totalIncome: number; totalExpense: number; netResult: number } | null>(null);
  const [cumulativeBalance, setCumulativeBalance] = useState<{ ARS: number; USD: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(`${selectedDate}T00:00:00-03:00`).toISOString();
      const end   = new Date(`${selectedDate}T23:59:59.999-03:00`).toISOString();
      const [txData, plData, balanceData] = await Promise.all([
        fetchApi(`/transactions?startDate=${start}&endDate=${end}`),
        fetchApi(`/reports/daily-pl?startDate=${start}&endDate=${end}`),
        fetchApi(`/reports/agency-balance?date=${selectedDate}`),
      ]);
      setTransactions(Array.isArray(txData) ? txData : (txData.data || []));
      setPl(plData);
      setCumulativeBalance(balanceData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ──────────────────────────────────────────────────────
  // Solo movimientos de caja efectiva (excluir operaciones de cartera de cheques)
  const cashTransactions = transactions.filter(t => t.type !== 'CHECK_TRADE');

  const incomes  = cashTransactions.filter(t => t.type === 'INCOME');
  const outcomes = cashTransactions.filter(t => t.type === 'OUTCOME');
  // FX_TRADE ventanilla (sin cliente) — mueve caja física → incluir en totales del día
  // FX_TRADE con cliente — la operación se asienta en la caja del cliente, no impacta caja diaria
  const fxTrades = cashTransactions.filter(t =>
    t.type === 'FX_TRADE' && !t.movements.some((m: any) => m.client_id)
  );

  const sumBoxMovements = (txs: any[], movType: 'DEBIT' | 'CREDIT') => {
    let ARS = 0, USD = 0;
    for (const t of txs) {
      for (const mov of (t.movements || [])) {
        // Solo contar movimientos en cajas de agencia (sin cliente), no cajas de clientes.
        // Un FX trade con cliente genera movimientos en Caja Propia Y en Caja-Cliente;
        // sumar ambos duplicaría los totales del día.
        if (mov.box_id && !mov.box?.client_id && mov.type === movType) {
          if (mov.currency === 'ARS') ARS += Number(mov.amount);
          if (mov.currency === 'USD') USD += Number(mov.amount);
        }
      }
    }
    return { ARS, USD };
  };

  // Para ingresos: INCOME DEBIT + FX DEBIT (la divisa que entra a caja)
  const incomeTotals = (() => {
    const base = sumBoxMovements(incomes, 'DEBIT');
    const fx   = sumBoxMovements(fxTrades, 'DEBIT');
    return { ARS: base.ARS + fx.ARS, USD: base.USD + fx.USD };
  })();
  // Para egresos: OUTCOME CREDIT + FX CREDIT (la divisa que sale de caja)
  const outcomeTotals = (() => {
    const base = sumBoxMovements(outcomes, 'CREDIT');
    const fx   = sumBoxMovements(fxTrades, 'CREDIT');
    return { ARS: base.ARS + fx.ARS, USD: base.USD + fx.USD };
  })();

  const fmt = (n: number, cur: string) =>
    `${cur === 'USD' ? 'U$S' : '$'} ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const typeBadge = (type: string) => {
    const map: Record<string, string> = {
      INCOME:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      OUTCOME:   'bg-red-500/15 text-red-400 border-red-500/30',
      TRANSFER:  'bg-sky-500/15 text-sky-400 border-sky-500/30',
      FX_TRADE:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
      CHECK_TRADE:'bg-violet-500/15 text-violet-400 border-violet-500/30',
    };
    const labels: Record<string, string> = {
      INCOME: 'Ingreso', OUTCOME: 'Egreso', TRANSFER: 'Transferencia',
      FX_TRADE: 'FX', CHECK_TRADE: 'Cheques',
    };
    return (
      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${map[type] ?? 'bg-white/5 text-[#94a3b8] border-white/10'}`}>
        {labels[type] ?? type}
      </span>
    );
  };

  const isToday = selectedDate === todayArg();

  return (
    <div className="w-full animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#f8fafc] mb-1 tracking-tight">Caja Diaria</h1>
          <p className="text-[#94a3b8]">
            Movimientos de caja del día — ingresos y egresos de efectivo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">Fecha</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={todayArg()}
            className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]"
          />
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayArg())}
              className="px-4 py-2.5 text-xs bg-[#0ea5e9]/10 border border-[#0ea5e9]/30 rounded-lg text-[#0ea5e9] hover:bg-[#0ea5e9]/20 transition font-semibold"
            >
              Hoy
            </button>
          )}
        </div>
      </header>

      {/* ── Tarjetas CAJA EFECTIVA ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
        {[
          { label: 'Ingresos ARS',  value: fmt(incomeTotals.ARS, 'ARS'),  color: 'emerald', icon: '↑' },
          { label: 'Ingresos USD',  value: fmt(incomeTotals.USD, 'USD'),  color: 'emerald', icon: '↑' },
          { label: 'Egresos ARS',   value: fmt(outcomeTotals.ARS, 'ARS'), color: 'red',     icon: '↓' },
          { label: 'Egresos USD',   value: fmt(outcomeTotals.USD, 'USD'), color: 'red',     icon: '↓' },
        ].map(card => (
          <div
            key={card.label}
            className={`glass-panel rounded-2xl p-5 border ${
              card.color === 'emerald'
                ? 'border-emerald-500/20 bg-emerald-500/5'
                : 'border-red-500/20 bg-red-500/5'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]">{card.label}</p>
              <span className={`text-lg font-black ${card.color === 'emerald' ? 'text-emerald-400' : 'text-red-400'}`}>
                {card.icon}
              </span>
            </div>
            <p className={`text-xl font-bold font-mono ${card.color === 'emerald' ? 'text-emerald-300' : 'text-red-300'}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Saldo del día ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {[
          {
            label: 'Saldo ARS',
            value: cumulativeBalance?.ARS ?? 0,
            cur: 'ARS',
          },
          {
            label: 'Saldo USD',
            value: cumulativeBalance?.USD ?? 0,
            cur: 'USD',
          },
        ].map(card => {
          const positive = card.value >= 0;
          return (
            <div
              key={card.label}
              className={`glass-panel rounded-2xl p-5 border ${
                positive ? 'border-sky-500/25 bg-sky-500/5' : 'border-orange-500/25 bg-orange-500/5'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]">{card.label}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  positive ? 'bg-sky-500/15 text-sky-400' : 'bg-orange-500/15 text-orange-400'
                }`}>
                  Saldo Acumulado
                </span>
              </div>
              <p className={`text-2xl font-black font-mono ${
                positive ? 'text-sky-300' : 'text-orange-300'
              }`}>
                {positive ? '' : '−'}{fmt(Math.abs(card.value), card.cur)}
              </p>
            </div>
          );
        })}
      </div>
      {/* ── Resultado Diario (P&L) ── */}
      {pl && (
        <div className={`glass-panel rounded-2xl p-5 mb-6 border ${
          pl.netResult >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <p className="text-xs font-bold uppercase tracking-wider text-[#64748b] mb-3">Resultado del Día</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] text-[#64748b] mb-1">Ingresos (comisiones + efectivo)</p>
              <p className="text-lg font-bold font-mono text-emerald-400">
                $ {pl.totalIncome.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#64748b] mb-1">Gastos (costos + egresos)</p>
              <p className="text-lg font-bold font-mono text-red-400">
                $ {pl.totalExpense.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`rounded-xl p-3 ${pl.netResult >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <p className="text-[11px] text-[#64748b] mb-1">Ganancia Neta</p>
              <p className={`text-2xl font-bold font-mono ${pl.netResult >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {pl.netResult >= 0 ? '+' : ''}$ {pl.netResult.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transactions table */}
      <div className="glass-panel rounded-2xl overflow-x-auto border border-[#334155]/50 shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155]/50">
          <p className="text-sm font-bold text-[#d1dded]">
            {loading ? 'Cargando…' : `${transactions.length} movimiento${transactions.length !== 1 ? 's' : ''} · ${isToday ? 'Hoy' : formatDate(selectedDate)}`}
          </p>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#0ea5e9]/10 border border-[#0ea5e9]/30 text-[#0ea5e9] hover:bg-[#0ea5e9]/20 transition font-semibold disabled:opacity-50"
          >
            {loading ? '…' : '↺ Actualizar'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-[#0ea5e9] border-t-transparent animate-spin" />
          </div>
        ) : cashTransactions.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-[#64748b] font-medium">Sin movimientos en esta fecha.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#334155]/50 bg-[#0a1324]/50 text-[#94a3b8] text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">Hora</th>
                <th className="p-4 font-semibold">Tipo</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 font-semibold">Cliente</th>
                <th className="p-4 font-semibold">Operador</th>
                <th className="p-4 font-semibold text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {cashTransactions
                .filter((t: any) => !(t.type === 'FX_TRADE' && t.movements?.some((m: any) => m.client_id)))
                .map((t: any, idx: number) => {
                const boxMov = t.movements?.find((m: any) => m.box_id) || t.movements?.[0];
                const amount = Number(boxMov?.amount || 0);
                const isIncome = t.type === 'INCOME';
                return (
                  <tr key={t.id} className={`border-b border-[#334155]/30 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0a1324]/30'}`}>
                    <td className="p-4 text-[#64748b] text-sm font-mono whitespace-nowrap">{formatTime(t.created_at)}</td>
                    <td className="p-4">{typeBadge(t.type)}</td>
                    <td className="p-4 text-[#d1dded] text-sm max-w-50 truncate">{t.description}</td>
                    <td className="p-4 text-[#94a3b8] text-sm">{boxMov?.client?.name || '—'}</td>
                    <td className="p-4 text-[#94a3b8] text-sm">{t.user?.name || '—'}</td>
                    <td className={`p-4 font-bold font-mono text-right text-sm ${isIncome ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isIncome ? '+' : '-'} {fmt(amount, boxMov?.currency || 'ARS')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
