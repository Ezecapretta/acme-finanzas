'use client';

import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import toast from 'react-hot-toast';

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
    <div className="w-full animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#f8fafc] mb-1 tracking-tight">Comisiones Varias</h1>
          <p className="text-[#94a3b8]">
            Calculá y registrá comisiones automáticamente en base a un porcentaje sobre el saldo o monto operado.
          </p>
        </div>
        {!isFormOpen && (
          <div className="flex gap-3">
            <button
              onClick={() => { setGastoMode(false); setIsFormOpen(true); }}
              className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:-translate-y-0.5"
            >
              + Nueva Comisión
            </button>
            <button
              onClick={() => { setGastoMode(true); setIsFormOpen(true); }}
              className="px-5 py-3 bg-red-500/80 hover:bg-red-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/40 hover:-translate-y-0.5"
            >
              + Gasto Libre
            </button>
          </div>
        )}
      </header>

      {/* ── FORM ────────────────────────────────────────────────────────────── */}
      {isFormOpen && gastoMode && (
        <div className="mb-8 animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleGastoSubmit} className="glass-panel p-8 rounded-2xl shadow-xl border border-red-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-red-500/8 pointer-events-none" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#f8fafc]">Gasto Libre (sin egreso de caja)</h2>
              <button type="button" onClick={() => { setIsFormOpen(false); setGastoMode(false); }} className="text-[#64748b] hover:text-white text-xl transition-colors">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
              {/* Descripción */}
              <div className="md:col-span-2">
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Descripción *</label>
                <input
                  type="text" required
                  value={gastoDesc} onChange={e => setGastoDesc(e.target.value)}
                  placeholder="Ej: Costo por venta de cheque — Banco X"
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-400"
                />
              </div>
              {/* Moneda */}
              <div>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Moneda *</label>
                <select value={gastoCurrency} onChange={e => setGastoCurrency(e.target.value as 'ARS' | 'USD')}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-400 font-bold">
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
              {/* Monto */}
              <div>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Monto *</label>
                <NumericFormat
                  value={gastoAmount} onValueChange={v => setGastoAmount(v.value)}
                  thousandSeparator="," decimalSeparator="." prefix={gastoCurrency === 'USD' ? 'U$S ' : '$ '}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-400"
                  placeholder="0.00" />
              </div>
              {/* Cliente (opcional) */}
              <div className="md:col-span-2">
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Cliente <span className="text-[#64748b] font-normal text-xs">(opcional)</span></label>
                <select value={gastoClientId} onChange={e => setGastoClientId(e.target.value)}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-400">
                  <option value="">— Sin cliente vinculado —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-[#334155]/50 flex justify-end gap-4">
              <button type="button" onClick={() => { setIsFormOpen(false); setGastoMode(false); }} className="px-6 py-3 text-[#aab6c7] hover:text-white transition-colors font-medium">Cancelar</button>
              <button type="submit" disabled={gastoLoading || !Number(gastoAmount)}
                className={`px-8 py-3 rounded-xl font-bold text-white transition-all duration-300 shadow-lg ${
                  gastoLoading || !Number(gastoAmount)
                    ? 'opacity-50 cursor-not-allowed bg-gray-500'
                    : 'bg-red-500 hover:scale-105 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                }`}>
                {gastoLoading ? 'Registrando…' : `Registrar ${gastoCurrency === 'USD' ? 'U$S' : '$'} ${Number(gastoAmount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {isFormOpen && !gastoMode && (
        <div className="mb-8 animate-in slide-in-from-top-4 duration-300">
          <form
            onSubmit={handleSubmit}
            className="glass-panel p-8 rounded-2xl shadow-xl border border-[#334155]/50 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-amber-500/8 pointer-events-none" />

            <h2 className="text-lg font-bold text-[#f8fafc] mb-6">Calcular Comisión</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
              {/* Cliente */}
              <div>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Cliente *</label>
                <select
                  required
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-400"
                >
                  <option value="">— Seleccionar cliente —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Tipo de comisión */}
              <div>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Tipo de comisión *</label>
                <select
                  value={commType}
                  onChange={e => setCommType(e.target.value as CommissionType)}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-400"
                >
                  {(Object.entries(COMMISSION_LABELS) as [CommissionType, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Moneda */}
              <div>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Moneda *</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as 'ARS' | 'USD')}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-400 font-bold"
                >
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>

              {/* Client balance info */}
              {selectedClientId && (
                <div className="md:col-span-1">
                  <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Saldo del cliente</label>
                  <div className="bg-[#0a1324]/80 border border-[#2c394a] rounded-lg px-4 py-3 flex items-center gap-3">
                    {clientLoading ? (
                      <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                    ) : clientBalance ? (
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold text-emerald-400 font-mono">
                          ARS: {fmt(clientBalance.ARS, 'ARS')}
                        </p>
                        <p className="text-sm font-bold text-sky-400 font-mono">
                          USD: {fmt(clientBalance.USD, 'USD')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[#64748b] text-sm">Sin datos</p>
                    )}
                  </div>
                </div>
              )}

              {/* Monto base */}
              <div className={selectedClientId ? 'md:col-span-2' : ''}>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">
                  Monto base *
                  <span className="text-[#64748b] ml-2 font-normal text-xs">(sobre el que se aplicará el %)</span>
                </label>
                <NumericFormat
                  value={baseAmount}
                  onValueChange={v => setBaseAmount(v.value)}
                  thousandSeparator=","
                  decimalSeparator="."
                  prefix={currency === 'USD' ? 'U$S ' : '$ '}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-400"
                  placeholder="0.00"
                />
              </div>

              {/* Porcentaje */}
              <div>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Porcentaje (%) *</label>
                <div className="relative">
                  <NumericFormat
                    value={percentage}
                    onValueChange={v => setPercentage(v.value)}
                    decimalSeparator="."
                    suffix="%"
                    decimalScale={4}
                    className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 pr-12 text-[#d1dded] focus:outline-none focus:border-amber-400"
                    placeholder="Ej: 0.5"
                  />
                </div>
              </div>

              {/* RESULTADO CALCULADO */}
              <div className="md:col-span-2 bg-amber-500/8 border border-amber-500/25 rounded-2xl p-6">
                <p className="text-xs uppercase font-bold tracking-wider text-amber-400 mb-3">
                  Comisión calculada
                </p>
                <div className="flex items-center justify-between">
                  <div className="text-[#94a3b8] text-sm">
                    {currency === 'ARS' ? '$ ' : 'U$S '}
                    {base.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    <span className="mx-2 text-[#475569]">×</span>
                    <span className="text-amber-400 font-bold">{pct}%</span>
                    <span className="mx-2 text-[#475569]">=</span>
                  </div>
                  <p className="text-3xl font-bold font-mono text-amber-300">
                    {fmt(commissionAmount, currency)}
                  </p>
                </div>
              </div>

              {/* Descripción opcional */}
              <div className="md:col-span-2">
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">
                  Descripción adicional
                  <span className="text-[#64748b] ml-2 font-normal text-xs">(opcional, se genera automáticamente)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ej: Comisión por cheque rechazado — lote enero"
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[#334155]/50 flex justify-end gap-4">
              <button
                type="button"
                onClick={() => { setIsFormOpen(false); setGastoMode(false); }}
                className="px-6 py-3 text-[#aab6c7] hover:text-white transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || commissionAmount <= 0}
                className={`px-8 py-3 rounded-xl font-bold text-black transition-all duration-300 shadow-lg ${
                  loading || commissionAmount <= 0
                    ? 'opacity-50 cursor-not-allowed bg-gray-500 text-white'
                    : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:scale-105 hover:shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                }`}
              >
                {loading ? 'Registrando…' : `Registrar ${fmt(commissionAmount, currency)}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── HISTORIAL ───────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl overflow-x-auto border border-[#334155]/50 shadow-xl">
        <div className="px-6 py-4 border-b border-[#334155]/50">
          <p className="text-sm font-bold text-[#d1dded]">
            Historial de Comisiones (Global)
          </p>
          <p className="text-xs text-[#64748b] mt-0.5">
            Últimas comisiones registradas en el sistema (incluidos otros módulos como Cheques).
          </p>
        </div>
        {transactions.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-4xl mb-3">💰</p>
            <p className="text-[#64748b]">Aún no hay comisiones registradas en el sistema.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#334155]/50 bg-[#0a1324]/50 text-[#94a3b8] text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Cliente Adjunto</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 font-semibold text-right">Comisión</th>
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
                    className={`border-b border-[#334155]/30 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0a1324]/30'}`}
                  >
                    <td className="p-4 text-[#64748b] text-sm font-mono whitespace-nowrap">
                      {new Date(t.operation_date).toLocaleString('es-AR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="p-4 text-[#d1dded] text-sm font-medium">{clientName}</td>
                    <td className="p-4 text-[#94a3b8] text-sm">{t.description}</td>
                    <td className={`p-4 font-bold font-mono text-sm text-right ${isIncome ? 'text-amber-400' : 'text-red-400'}`}>
                      {isIncome ? '+' : '-'}{commCurrency === 'USD' ? 'U$S' : '$'} {Number(commAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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
