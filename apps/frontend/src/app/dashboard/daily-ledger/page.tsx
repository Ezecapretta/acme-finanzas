'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/forms';

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
      INCOME:     'bg-positive-bg text-positive',
      OUTCOME:    'bg-negative-bg text-negative',
      TRANSFER:   'bg-track text-muted',
      FX_TRADE:   'bg-warn-bg text-warn',
      CHECK_TRADE:'bg-accent-bg text-accent',
    };
    const labels: Record<string, string> = {
      INCOME: 'Ingreso', OUTCOME: 'Egreso', TRANSFER: 'Transferencia',
      FX_TRADE: 'FX', CHECK_TRADE: 'Cheques',
    };
    return (
      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${map[type] ?? 'bg-track text-muted'}`}>
        {labels[type] ?? type}
      </span>
    );
  };

  const isToday = selectedDate === todayArg();

  return (
    <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Caja Diaria</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Movimientos de caja del día — ingresos y egresos de efectivo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">Fecha</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={todayArg()}
            className={`${inputClass} w-auto py-2`}
          />
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayArg())}
              className="rounded-lg border border-accent/30 bg-accent-bg px-4 py-2.5 text-xs font-semibold text-accent transition hover:opacity-80"
            >
              Hoy
            </button>
          )}
        </div>
      </header>

      {/* ── Tarjetas CAJA EFECTIVA ── */}
      <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Ingresos ARS',  value: fmt(incomeTotals.ARS, 'ARS'),  positive: true,  icon: '↑' },
          { label: 'Ingresos USD',  value: fmt(incomeTotals.USD, 'USD'),  positive: true,  icon: '↑' },
          { label: 'Egresos ARS',   value: fmt(outcomeTotals.ARS, 'ARS'), positive: false, icon: '↓' },
          { label: 'Egresos USD',   value: fmt(outcomeTotals.USD, 'USD'), positive: false, icon: '↓' },
        ].map(card => (
          <Card key={card.label} className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">{card.label}</p>
              <span className={`text-lg font-black ${card.positive ? 'text-positive' : 'text-negative'}`}>
                {card.icon}
              </span>
            </div>
            <p className={`font-mono text-xl font-bold ${card.positive ? 'text-positive' : 'text-negative'}`}>
              {card.value}
            </p>
          </Card>
        ))}
      </div>

      {/* ── Saldo del día ── */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { label: 'Saldo ARS', value: cumulativeBalance?.ARS ?? 0, cur: 'ARS' },
          { label: 'Saldo USD', value: cumulativeBalance?.USD ?? 0, cur: 'USD' },
        ].map(card => {
          const positive = card.value >= 0;
          return (
            <Card key={card.label} className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">{card.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${positive ? 'bg-accent-bg text-accent' : 'bg-warn-bg text-warn'}`}>
                  Saldo Acumulado
                </span>
              </div>
              <p className={`font-mono text-2xl font-black ${positive ? 'text-accent' : 'text-warn'}`}>
                {positive ? '' : '−'}{fmt(Math.abs(card.value), card.cur)}
              </p>
            </Card>
          );
        })}
      </div>
      {/* ── Resultado Diario (P&L) ── */}
      {pl && (
        <Card className="mb-6 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Resultado del Día</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="mb-1 text-[11px] text-faint">Ingresos (comisiones + efectivo)</p>
              <p className="font-mono text-lg font-bold text-positive">
                $ {pl.totalIncome.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-faint">Gastos (costos + egresos)</p>
              <p className="font-mono text-lg font-bold text-negative">
                $ {pl.totalExpense.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`rounded-xl p-3 ${pl.netResult >= 0 ? 'bg-positive-bg' : 'bg-negative-bg'}`}>
              <p className="mb-1 text-[11px] text-faint">Ganancia Neta</p>
              <p className={`font-mono text-2xl font-bold ${pl.netResult >= 0 ? 'text-positive' : 'text-negative'}`}>
                {pl.netResult >= 0 ? '+' : ''}$ {pl.netResult.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Transactions table */}
      <Card className="overflow-x-auto">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <p className="text-sm font-bold text-ink">
            {loading ? 'Cargando…' : `${transactions.length} movimiento${transactions.length !== 1 ? 's' : ''} · ${isToday ? 'Hoy' : formatDate(selectedDate)}`}
          </p>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-accent/30 bg-accent-bg px-3 py-1.5 text-xs font-semibold text-accent transition hover:opacity-80 disabled:opacity-50"
          >
            {loading ? '…' : '↺ Actualizar'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : cashTransactions.length === 0 ? (
          <div className="py-16 text-center">
            <p className="mb-3 text-4xl">📋</p>
            <p className="font-medium text-faint">Sin movimientos en esta fecha.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-track text-xs uppercase tracking-wider text-muted">
                <th className="p-4 font-semibold">Hora</th>
                <th className="p-4 font-semibold">Tipo</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 font-semibold">Cliente</th>
                <th className="p-4 font-semibold">Operador</th>
                <th className="p-4 text-right font-semibold">Importe</th>
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
                  <tr key={t.id} className={`border-b border-line transition-colors hover:bg-row-hover ${idx % 2 === 0 ? 'bg-transparent' : 'bg-canvas'}`}>
                    <td className="whitespace-nowrap p-4 font-mono text-sm text-faint">{formatTime(t.created_at)}</td>
                    <td className="p-4">{typeBadge(t.type)}</td>
                    <td className="max-w-50 truncate p-4 text-sm text-ink">{t.description}</td>
                    <td className="p-4 text-sm text-muted">{boxMov?.client?.name || '—'}</td>
                    <td className="p-4 text-sm text-muted">{t.user?.name || '—'}</td>
                    <td className={`p-4 text-right font-mono text-sm font-bold ${isIncome ? 'text-positive' : 'text-negative'}`}>
                      {isIncome ? '+' : '-'} {fmt(amount, boxMov?.currency || 'ARS')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
