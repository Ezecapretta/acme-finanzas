'use client';

import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

// ── Types ──────────────────────────────────────────────────────────────────
type CommissionType = 'RECHAZO' | 'COSTO_TRANSACCION' | 'OTRO';

const COMMISSION_LABELS: Record<CommissionType, string> = {
  RECHAZO:          'Por gastos de rechazo',
  COSTO_TRANSACCION:'Por costo de transacción',
  OTRO:             'Otro concepto',
};

// ── Component ──────────────────────────────────────────────────────────────
export default function CommissionsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [boxes, setBoxes]     = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientLoading, setClientLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [gastoMode, setGastoMode] = useState(false);

  // Gasto Libre form state
  const [gastoAmount, setGastoAmount]       = useState('');
  const [gastoCurrency, setGastoCurrency]   = useState<'ARS' | 'USD'>('ARS');
  const [gastoDesc, setGastoDesc]           = useState('');
  const [gastoClientId, setGastoClientId]   = useState('');
  const [gastoLoading, setGastoLoading]     = useState(false);

  const loadTransactions = () => {
    fetchApi('/transactions?category=COMMISSION').then(setTransactions).catch(console.error);
  };

  // ── Form state ────────────────────────────────────────────────────────────
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientBalance, setClientBalance] = useState<{ ARS: number; USD: number } | null>(null);
  const [commType, setCommType]     = useState<CommissionType>('COSTO_TRANSACCION');
  const [currency, setCurrency]     = useState<'ARS' | 'USD'>('ARS');
  const [baseAmount, setBaseAmount] = useState('');
  const [percentage, setPercentage] = useState('');
  const [agencyBoxId, setAgencyBoxId] = useState('');
  const [description, setDescription] = useState('');

  // Computed commission amount
  const base = Number(baseAmount) || 0;
  const pct  = Number(percentage) || 0;
  const commissionAmount = (base * pct) / 100;

  // ── Load clients + agency boxes on mount ─────────────────────────────────
  useEffect(() => {
    loadTransactions();
    Promise.all([fetchApi('/clients'), fetchApi('/boxes')])
      .then(([clientData, boxData]) => {
        setClients(Array.isArray(clientData) ? clientData : []);
        const agencyBoxes = (boxData.boxes || []).filter((b: any) => !b.client_id);
        setBoxes(agencyBoxes);
        if (agencyBoxes.length > 0) setAgencyBoxId(agencyBoxes[0].id);
      })
      .catch(console.error);
  }, []);

  // ── Load client balance when client is selected ───────────────────────────
  useEffect(() => {
    if (!selectedClientId) { setClientBalance(null); return; }
    setClientLoading(true);
    fetchApi(`/clients/${selectedClientId}`)
      .then((data: any) => {
        // Calculate balance from movements (same DEBIT/CREDIT logic as backend)
        const movs: any[] = data.movements || [];
        let ARS = 0, USD = 0;
        for (const mov of movs) {
          const effect = mov.type === 'DEBIT' ? Number(mov.amount) : -Number(mov.amount);
          if (mov.currency === 'ARS') ARS += effect;
          if (mov.currency === 'USD') USD += effect;
        }
        setClientBalance({ ARS, USD });
        // Auto-fill base amount from client balance for the selected currency
        setBaseAmount(currency === 'ARS' ? String(Math.abs(ARS)) : String(Math.abs(USD)));
      })
      .catch(console.error)
      .finally(() => setClientLoading(false));
  }, [selectedClientId, currency]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleGastoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userId = getUserId();
    if (!userId) { toast.error('Sesión inválida.'); return; }
    if (!gastoAmount || Number(gastoAmount) <= 0) { toast.error('Ingresá un monto válido.'); return; }
    if (!gastoDesc.trim()) { toast.error('Ingresá una descripción.'); return; }
    setGastoLoading(true);
    try {
      await fetchApi('/transactions/gasto-virtual', {
        method: 'POST',
        body: JSON.stringify({
          amount:      Number(gastoAmount),
          currency:    gastoCurrency,
          description: gastoDesc,
          userId,
          clientId:    gastoClientId || undefined,
        }),
      });
      toast.success('Gasto registrado exitosamente.');
      setIsFormOpen(false);
      setGastoMode(false);
      loadTransactions();
      setGastoAmount('');
      setGastoDesc('');
      setGastoClientId('');
    } catch (err: any) {
      toast.error('Error: ' + (err.message || 'Error desconocido'));
    } finally {
      setGastoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !agencyBoxId || commissionAmount <= 0) {
      toast.error('Completá todos los campos y verificá que la comisión sea mayor a cero.');
      return;
    }

    const userId = getUserId();
    if (!userId) { toast.error('Sesión inválida.'); return; }

    setLoading(true);
    try {
      const client = clients.find(c => c.id === selectedClientId);
      const autoDesc = description ||
        `Comisión — ${COMMISSION_LABELS[commType]} · ${pct}% sobre ${
          currency === 'ARS' ? '$ ' : 'U$S '
        }${base.toLocaleString('es-AR', { minimumFractionDigits: 2 })} · Cte: ${client?.name}`;

      await fetchApi('/transactions/income', {
        method: 'POST',
        body: JSON.stringify({
          boxId: agencyBoxId,
          clientId: selectedClientId,
          amount: commissionAmount,
          currency,
          category: 'COMMISSION',
          description: autoDesc,
          userId,
        }),
      });

      toast.success('Comisión registrada exitosamente.');
      setIsFormOpen(false);
      loadTransactions();
      // Reset form
      setSelectedClientId('');
      setClientBalance(null);
      setBaseAmount('');
      setPercentage('');
      setDescription('');
      setCommType('COSTO_TRANSACCION');
    } catch (err: any) {
      toast.error('Error: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number, cur: string) =>
    `${cur === 'USD' ? 'U$S' : '$'} ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Comisiones Varias</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Calculá y registrá comisiones automáticamente en base a un porcentaje sobre el saldo o monto operado.
          </p>
        </div>
        {!isFormOpen && (
          <div className="flex gap-3">
            <button
              onClick={() => { setGastoMode(false); setIsFormOpen(true); }}
              className="rounded-[9px] bg-warn px-5 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90"
            >
              + Nueva Comisión
            </button>
            <button
              onClick={() => { setGastoMode(true); setIsFormOpen(true); }}
              className="rounded-[9px] bg-negative px-5 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90"
            >
              + Gasto Libre
            </button>
          </div>
        )}
      </header>

      {/* ── FORM ────────────────────────────────────────────────────────────── */}
      {isFormOpen && gastoMode && (
        <div className="mb-8 animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleGastoSubmit}>
            <Card className="p-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink">Gasto Libre (sin egreso de caja)</h2>
                <button type="button" onClick={() => { setIsFormOpen(false); setGastoMode(false); }} className="text-xl text-faint transition-colors hover:text-ink">✕</button>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Descripción */}
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-muted">Descripción *</label>
                  <input
                    type="text" required
                    value={gastoDesc} onChange={e => setGastoDesc(e.target.value)}
                    placeholder="Ej: Costo por venta de cheque — Banco X"
                    className={inputClass}
                  />
                </div>
                {/* Moneda */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Moneda *</label>
                  <select value={gastoCurrency} onChange={e => setGastoCurrency(e.target.value as 'ARS' | 'USD')}
                    className={`${selectClass} font-bold`}>
                    <option value="ARS">Pesos (ARS)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                {/* Monto */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Monto *</label>
                  <NumericFormat
                    value={gastoAmount} onValueChange={v => setGastoAmount(v.value)}
                    thousandSeparator="," decimalSeparator="." prefix={gastoCurrency === 'USD' ? 'U$S ' : '$ '}
                    className={inputClass}
                    placeholder="0.00" />
                </div>
                {/* Cliente (opcional) */}
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-muted">Cliente <span className="text-xs font-normal text-faint">(opcional)</span></label>
                  <select value={gastoClientId} onChange={e => setGastoClientId(e.target.value)}
                    className={selectClass}>
                    <option value="">— Sin cliente vinculado —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-4 border-t border-line pt-6">
                <button type="button" onClick={() => { setIsFormOpen(false); setGastoMode(false); }} className="px-6 py-3 font-medium text-muted transition-colors hover:text-ink">Cancelar</button>
                <button type="submit" disabled={gastoLoading || !Number(gastoAmount)}
                  className={`rounded-xl px-8 py-3 font-bold text-white shadow-sm transition-all duration-300 ${
                    gastoLoading || !Number(gastoAmount)
                      ? 'cursor-not-allowed bg-faint opacity-60'
                      : 'bg-negative hover:opacity-90'
                  }`}>
                  {gastoLoading ? 'Registrando…' : `Registrar ${gastoCurrency === 'USD' ? 'U$S' : '$'} ${Number(gastoAmount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                </button>
              </div>
            </Card>
          </form>
        </div>
      )}

      {isFormOpen && !gastoMode && (
        <div className="mb-8 animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleSubmit}>
            <Card className="p-8">
              <h2 className="mb-6 text-lg font-bold text-ink">Calcular Comisión</h2>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Cliente */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Cliente *</label>
                  <select
                    required
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">— Seleccionar cliente —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Tipo de comisión */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Tipo de comisión *</label>
                  <select
                    value={commType}
                    onChange={e => setCommType(e.target.value as CommissionType)}
                    className={selectClass}
                  >
                    {(Object.entries(COMMISSION_LABELS) as [CommissionType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Moneda */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Moneda *</label>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value as 'ARS' | 'USD')}
                    className={`${selectClass} font-bold`}
                  >
                    <option value="ARS">Pesos (ARS)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>

                {/* Client balance info */}
                {selectedClientId && (
                  <div className="md:col-span-1">
                    <label className="mb-2 block text-sm font-medium text-muted">Saldo del cliente</label>
                    <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
                      {clientLoading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-warn border-t-transparent" />
                      ) : clientBalance ? (
                        <div className="space-y-0.5">
                          <p className="font-mono text-sm font-bold text-positive">
                            ARS: {fmt(clientBalance.ARS, 'ARS')}
                          </p>
                          <p className="font-mono text-sm font-bold text-accent">
                            USD: {fmt(clientBalance.USD, 'USD')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-faint">Sin datos</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Monto base */}
                <div className={selectedClientId ? 'md:col-span-2' : ''}>
                  <label className="mb-2 block text-sm font-medium text-muted">
                    Monto base *
                    <span className="ml-2 text-xs font-normal text-faint">(sobre el que se aplicará el %)</span>
                  </label>
                  <NumericFormat
                    value={baseAmount}
                    onValueChange={v => setBaseAmount(v.value)}
                    thousandSeparator=","
                    decimalSeparator="."
                    prefix={currency === 'USD' ? 'U$S ' : '$ '}
                    className={inputClass}
                    placeholder="0.00"
                  />
                </div>

                {/* Porcentaje */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Porcentaje (%) *</label>
                  <div className="relative">
                    <NumericFormat
                      value={percentage}
                      onValueChange={v => setPercentage(v.value)}
                      decimalSeparator="."
                      suffix="%"
                      decimalScale={4}
                      className={inputClass}
                      placeholder="Ej: 0.5"
                    />
                  </div>
                </div>

                {/* RESULTADO CALCULADO */}
                <div className="rounded-2xl border border-warn/25 bg-warn-bg p-6 md:col-span-2">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-warn">
                    Comisión calculada
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted">
                      {currency === 'ARS' ? '$ ' : 'U$S '}
                      {base.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      <span className="mx-2 text-faint">×</span>
                      <span className="font-bold text-warn">{pct}%</span>
                      <span className="mx-2 text-faint">=</span>
                    </div>
                    <p className="font-mono text-3xl font-bold text-warn">
                      {fmt(commissionAmount, currency)}
                    </p>
                  </div>
                </div>

                {/* Descripción opcional */}
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-muted">
                    Descripción adicional
                    <span className="ml-2 text-xs font-normal text-faint">(opcional, se genera automáticamente)</span>
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Ej: Comisión por cheque rechazado — lote enero"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-4 border-t border-line pt-6">
                <button
                  type="button"
                  onClick={() => { setIsFormOpen(false); setGastoMode(false); }}
                  className="px-6 py-3 font-medium text-muted transition-colors hover:text-ink"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || commissionAmount <= 0}
                  className={`rounded-xl px-8 py-3 font-bold text-white shadow-sm transition-all duration-300 ${
                    loading || commissionAmount <= 0
                      ? 'cursor-not-allowed bg-faint opacity-60'
                      : 'bg-warn hover:opacity-90'
                  }`}
                >
                  {loading ? 'Registrando…' : `Registrar ${fmt(commissionAmount, currency)}`}
                </button>
              </div>
            </Card>
          </form>
        </div>
      )}

      {/* ── HISTORIAL ───────────────────────────────────────────────────────── */}
      <Card className="overflow-x-auto">
        <div className="border-b border-line px-6 py-4">
          <p className="text-sm font-bold text-ink">
            Historial de Comisiones (Global)
          </p>
          <p className="mt-0.5 text-xs text-faint">
            Últimas comisiones registradas en el sistema (incluidos otros módulos como Cheques).
          </p>
        </div>
        {transactions.length === 0 ? (
          <div className="py-14 text-center">
            <p className="mb-3 text-4xl">💰</p>
            <p className="text-faint">Aún no hay comisiones registradas en el sistema.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-track text-xs uppercase tracking-wider text-muted">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Cliente Adjunto</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 text-right font-semibold">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, idx) => {
                // boxMov ya no existe (comisión no genera movimiento de caja directo).
                // Detectamos BUY vs SELL desde el movimiento del cheque:
                //   BUY  → check movement type = CREDIT (cheque sale del vendedor) → ingreso
                //   SELL → check movement type = DEBIT  (cheque entra al comprador) → gasto
                const checkMov     = t.movements?.find((m: any) => m.check_id);
                const clientMov    = t.movements?.find((m: any) => m.client_id && !m.check_id);
                const commAmount   = t.commission ?? 0;
                const anyMov       = t.movements?.find((m: any) => !m.check_id);
                const commCurrency = checkMov?.currency || clientMov?.currency || anyMov?.currency || 'ARS';
                const clientName   = clientMov?.client?.name || checkMov?.client?.name || '-';
                // BUY (CREDIT) = ingreso · SELL (DEBIT) = gasto · manual sin cheque = ingreso
                const isIncome     = t.type !== 'OUTCOME' && (!checkMov || checkMov.type === 'CREDIT');
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-line transition-colors hover:bg-row-hover ${idx % 2 === 0 ? 'bg-transparent' : 'bg-canvas'}`}
                  >
                    <td className="whitespace-nowrap p-4 font-mono text-sm text-faint">
                      {new Date(t.operation_date).toLocaleString('es-AR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="p-4 text-sm font-medium text-ink">{clientName}</td>
                    <td className="p-4 text-sm text-muted">{t.description}</td>
                    <td className={`p-4 text-right font-mono text-sm font-bold ${isIncome ? 'text-warn' : 'text-negative'}`}>
                      {isIncome ? '+' : '-'}{commCurrency === 'USD' ? 'U$S' : '$'} {Number(commAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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
