'use client';
import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import OverdraftConfirmModal, { OverdraftInfo } from '@/components/OverdraftConfirmModal';

export default function ExpensesPage() {
  const router = useRouter();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'expense' | 'check-return'>('expense');
  const [loading, setLoading] = useState(false);
  const [overdraftData, setOverdraftData] = useState<{ overdrafts: OverdraftInfo[]; payload: any } | null>(null);
  const [revertTarget, setRevertTarget] = useState<any | null>(null);
  const [reverting, setReverting]       = useState(false);
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [allChecks, setAllChecks] = useState<any[]>([]);

  // ── Expense form ────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const [operationDate, setOperationDate] = useState(todayStr);
  const [form, setForm] = useState({
    clientId: '',
    agencyBoxId: '',
    amount: '',
    currency: 'ARS',
    category: 'OPERATING_EXPENSE',
    description: ''
  });

  // ── Check return form ───────────────────────────────────────────────────
  const [returnForm, setReturnForm] = useState({
    ownerClientId: '',
    checkId: '',
    rejectionFeePercentage: '',
    rejectionFeeDescription: '',
  });

  // Checks that belong to a specific client (DELIVERED to them)
  const clientChecks = useMemo(() => {
    if (!returnForm.ownerClientId) return [];
    return allChecks.filter((c: any) => c.destination_client?.id === returnForm.ownerClientId && c.status === 'DELIVERED');
  }, [allChecks, returnForm.ownerClientId]);

  const selectedCheck = allChecks.find((c: any) => c.id === returnForm.checkId);

  // Fee derived from check amount × percentage
  const rejectionFeeAmount = (() => {
    const pct = Number(returnForm.rejectionFeePercentage);
    if (!selectedCheck || !pct) return 0;
    return Number(selectedCheck.amount) * (pct / 100);
  })();

  const loadTransactions = () => {
    fetchApi('/transactions?type=OUTCOME')
      .then(setTransactions)
      .catch(console.error);
  };

  useEffect(() => {
    loadTransactions();
    
    Promise.all([
      fetchApi('/clients'),
      fetchApi('/boxes'),
      fetchApi('/checks'),
    ]).then(([clientData, boxData, checkData]) => {
      setClients(Array.isArray(clientData) ? clientData : (clientData.clients || []));
      setAllChecks(Array.isArray(checkData) ? checkData : (checkData.checks || []));
      const agencyBoxes = (boxData.boxes || []).filter((b: any) => !b.client_id);
      setBoxes(agencyBoxes);
      if (agencyBoxes.length > 0) {
         setForm(prev => ({ ...prev, agencyBoxId: agencyBoxes[0].id }));
      }
    }).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agencyBoxId || !form.amount || !form.category || !form.description) {
      if (!form.agencyBoxId) toast.error("Cree una 'Caja Principal' en Finanzas primero.", { duration: 6000 });
      else toast.error("Por favor complete todos los campos obligatorios.");
      return;
    }

    const userId = getUserId();
    if (!userId) { toast.error("Sesión inválida."); return; }

    const payload = {
      boxId: form.agencyBoxId,
      clientId: form.clientId || null,
      amount: Number(form.amount),
      currency: form.currency,
      category: form.category,
      description: form.description,
      userId,
      operationDate: operationDate !== todayStr ? operationDate : undefined,
    };

    await doOutcomeSubmit(payload, false);
  };

  const doOutcomeSubmit = async (payload: any, confirm: boolean) => {
    setLoading(true);
    try {
      await fetchApi('/transactions/outcome', {
        method: 'POST',
        body: JSON.stringify({ ...payload, confirm }),
      });
      toast.success("Egreso registrado exitosamente.");
      setIsFormOpen(false);
      setOverdraftData(null);
      loadTransactions();
      setForm({ ...form, amount: '', description: '', clientId: '' });
      setOperationDate(new Date().toISOString().split('T')[0]);
    } catch (error: any) {
      if (error.requiresConfirmation) {
        setOverdraftData({ overdrafts: error.overdrafts, payload });
      } else {
        toast.error("Error registrando egreso: " + (error.message || 'Error desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnForm.ownerClientId || !returnForm.checkId) {
      toast.error('Seleccione el cliente y el cheque a rechazar.');
      return;
    }
    const userId = getUserId();
    if (!userId) { toast.error('Sesión inválida.'); return; }
    setLoading(true);
    try {
      await fetchApi('/transactions/check-return', {
        method: 'POST',
        body: JSON.stringify({
          checkId: returnForm.checkId,
          ownerClientId: returnForm.ownerClientId,
          rejectionFee: rejectionFeeAmount || 0,
          rejectionFeeDescription: returnForm.rejectionFeeDescription || undefined,
          userId,
        }),
      });
      toast.success('Cheque rechazado y devuelto a la agencia.');
      setIsFormOpen(false);
      setReturnForm({ ownerClientId: '', checkId: '', rejectionFeePercentage: '', rejectionFeeDescription: '' });
      loadTransactions();
      // Reload checks list
      fetchApi('/checks').then(d => setAllChecks(Array.isArray(d) ? d : (d.checks || []))).catch(console.error);
    } catch (error: any) {
      toast.error('Error: ' + (error.message || 'desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async () => {
    if (!revertTarget) return;
    setReverting(true);
    try {
      const userId = getUserId();
      if (!userId) { toast.error('Sesión inválida.'); return; }
      await fetchApi(`/transactions/${revertTarget.id}/revert`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      toast.success('Transacción revertida correctamente.');
      setRevertTarget(null);
      loadTransactions();
    } catch (err: any) {
      toast.error(err.message || 'Error al revertir la transacción.');
    } finally {
      setReverting(false);
    }
  };

  // ─── FILTER STATE ──────────────────────────────────────────────────
  const [eSearch, setESearch] = useState('');
  const [eCategory, setECategory] = useState('');
  const [eClient, setEClient] = useState('');
  const [eCurrency, setECurrency] = useState('');
  const [eDateFrom, setEDateFrom] = useState('');
  const [eDateTo, setEDateTo] = useState('');
  const [expVisible, setExpVisible] = useState(10);

  const expFiltered = transactions.filter((t: any) => {
    const mov = t.movements?.[0];
    if (eSearch   && !t.description?.toLowerCase().includes(eSearch.toLowerCase())) return false;
    if (eCategory && t.category !== eCategory) return false;
    if (eClient   && mov?.client?.id !== eClient) return false;
    if (eCurrency && mov?.currency !== eCurrency) return false;
    if (eDateFrom && new Date(t.operation_date) < new Date(eDateFrom)) return false;
    if (eDateTo   && new Date(t.operation_date) > new Date(eDateTo))   return false;
    return true;
  });
  const expTotalARS = expFiltered.filter((t: any) => t.movements?.[0]?.currency === 'ARS').reduce((s: number, t: any) => s + Number(t.movements?.[0]?.amount || 0), 0);
  const expTotalUSD = expFiltered.filter((t: any) => t.movements?.[0]?.currency === 'USD').reduce((s: number, t: any) => s + Number(t.movements?.[0]?.amount || 0), 0);
  const hasEFilter = eSearch || eCategory || eClient || eCurrency || eDateFrom || eDateTo;

  if (!isFormOpen) {
    return (
      <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto pb-8">
        <header className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Egresos de Caja</h1>
            <p className="text-[#94a3b8]">Gastos operativos, sueldos, retiros y pagos de obligaciones.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setFormMode('expense'); setIsFormOpen(true); }} className="px-5 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/40 hover:-translate-y-0.5">
              - Nuevo Egreso
            </button>
            <button onClick={() => { setFormMode('check-return'); setIsFormOpen(true); }} className="px-5 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-600/20 hover:-translate-y-0.5">
              ✕ Rechazar Cheque
            </button>
          </div>
        </header>

        {/* FILTER BAR */}
        <div className="glass-panel rounded-2xl border border-[#334155]/50 p-5 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]">Filtros</p>
            {hasEFilter && <button onClick={() => { setESearch(''); setECategory(''); setEClient(''); setECurrency(''); setEDateFrom(''); setEDateTo(''); }} className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">✕ Limpiar</button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-sm">🔍</span>
              <input type="text" value={eSearch} onChange={e => setESearch(e.target.value)} placeholder="Buscar descripción..."
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-red-400 placeholder:text-[#334155]" />
            </div>
            <select value={eCategory} onChange={e => setECategory(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-red-400">
              <option value="">Todas las categorías</option>
              <option value="OPERATING_EXPENSE">Gasto Operativo / Fijo</option>
              <option value="SALARY">Sueldos y Honorarios</option>
              <option value="COMMISSION">Comisiones</option>
              <option value="CLIENT_FUNDING">Pago a Cliente (Cancelación de Deuda)</option>
              <option value="PARTNER_WITHDRAWAL">Retiro de Socios</option>
              <option value="OTHER">Otro</option>
            </select>
            <select value={eClient} onChange={e => setEClient(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-red-400">
              <option value="">Todos los clientes/prov.</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={eCurrency} onChange={e => setECurrency(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-red-400">
              <option value="">Toda moneda</option>
              <option value="ARS">ARS — Pesos</option>
              <option value="USD">USD — Dólares</option>
            </select>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Desde</label>
              <input type="date" value={eDateFrom} onChange={e => setEDateFrom(e.target.value)}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Hasta</label>
              <input type="date" value={eDateTo} onChange={e => setEDateTo(e.target.value)}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-red-400" />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-3 px-1">
          <p className="text-sm text-[#64748b]"><span className="text-[#d1dded] font-bold">{expFiltered.length}</span> resultado{expFiltered.length !== 1 ? 's' : ''}{hasEFilter && <span className="text-red-400 ml-1">(filtrado)</span>}</p>
          {expFiltered.length > 0 && (
            <div className="flex items-center gap-4">
              {expTotalARS > 0 && <p className="text-sm text-[#64748b]">ARS: <span className="text-red-400 font-bold font-mono">-$ {expTotalARS.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>}
              {expTotalUSD > 0 && <p className="text-sm text-[#64748b]">USD: <span className="text-red-400 font-bold font-mono">-U$S {expTotalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl overflow-x-auto border border-[#334155]/50 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#334155]/50 bg-[#0a1324]/50 text-[#94a3b8] text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Categoría</th>
                <th className="p-4 font-semibold">Cliente Adjunto</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 font-semibold text-right">Importe</th>
                <th className="p-4 font-semibold w-24"></th>
              </tr>
            </thead>
            <tbody>
              {expFiltered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-[#64748b]">{hasEFilter ? '⚠ Sin resultados.' : 'No hay egresos registrados.'}</td></tr>
              ) : expFiltered.slice(0, expVisible).map((t: any, idx: number) => {
                const mov = t.movements?.[0];
                return (
                  <tr key={t.id} className={`border-b border-[#334155]/30 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0a1324]/30'}`}>
                    <td className="p-4 text-[#d1dded] whitespace-nowrap">{new Date(t.operation_date).toLocaleDateString()}</td>
                    <td className="p-4"><span className="px-2 py-1 bg-black/30 rounded text-xs font-medium text-[#94a3b8] border border-[#334155]/50">{t.category}</span></td>
                    <td className="p-4 text-[#d1dded]">{mov?.client?.name || '-'}</td>
                    <td className="p-4">
                      <p className={t.is_reversed ? 'text-[#677383] line-through' : 'text-[#d1dded]'}>{t.description}</p>
                      {t.reversal_of && <span className="mt-1 inline-block text-[10px] text-[#7e8b9d] bg-[#2c394a] px-1.5 py-0.5 rounded border border-[#4d596b] font-bold uppercase tracking-wider">Reversión</span>}
                    </td>
                    <td className="p-4 font-bold font-mono text-right text-red-400">-{mov?.currency === 'USD' ? 'U$S ' : '$ '}{Number(mov?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="p-4 text-right">
                      {!t.is_reversed && !t.reversal_of && (
                        <button onClick={() => setRevertTarget(t)} className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors font-medium">
                          Revertir
                        </button>
                      )}
                      {t.is_reversed && <span className="text-[10px] text-red-400/70 font-bold uppercase tracking-wider">Revertida</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>          {expVisible < expFiltered.length && (
            <div className="p-4 text-center border-t border-[#334155]/30">
              <button onClick={() => setExpVisible(v => v + 10)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                Ver más ({expFiltered.length - expVisible} restantes)
              </button>
            </div>
          )}        </div>
        {revertTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050B14]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="glass-panel shadow-[0_0_50px_rgba(0,0,0,0.6)] border-t border-t-white/10 rounded-3xl w-full max-w-lg">
              <div className="p-6 border-b border-[#334155]/50 flex justify-between items-center">
                <h2 className="text-xl font-bold text-[#f8fafc] tracking-tight">Revertir Transacción</h2>
                <button onClick={() => setRevertTarget(null)} className="text-[#64748b] hover:text-white font-bold text-xl transition-colors">×</button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-[#94a3b8] text-sm leading-relaxed">Esta acción creará asientos de contrapartida que <strong className="text-[#d1dded]">anulan todos los efectos contables</strong> de la operación original. La transacción quedará marcada como <span className="text-red-400 font-semibold">REVERTIDA</span>.</p>
                <div className="bg-[#081329] border border-[#2c394a] rounded-xl px-4 py-3">
                  <p className="text-xs text-[#64748b] uppercase tracking-wider mb-1">Operación a revertir</p>
                  <p className="text-[#d1dded] font-medium">{revertTarget.description}</p>
                  <p className="text-[#7e8b9d] text-xs mt-1">{new Date(revertTarget.operation_date).toLocaleDateString()} · ID: {revertTarget.id.split('-')[0]}..</p>
                </div>
                <p className="text-yellow-400/80 text-xs">⚠ Esta acción no puede deshacerse.</p>
              </div>
              <div className="p-6 border-t border-[#334155]/50 flex justify-end gap-3">
                <button onClick={() => setRevertTarget(null)} disabled={reverting} className="px-5 py-2.5 text-[#aab6c7] hover:text-white font-medium transition-colors">Cancelar</button>
                <button onClick={handleRevert} disabled={reverting} className="bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-all shadow-lg">
                  {reverting ? 'Revirtiendo...' : 'Confirmar Reversión'}
                </button>
              </div>
            </div>
          </div>
        )}      </div>
    );
  }

  // ── Check return form view ────────────────────────────────────────────
  if (isFormOpen && formMode === 'check-return') {
    return (
      <div className="w-full h-full animate-in slide-in-from-bottom-8 duration-500 max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Rechazar Cheque</h1>
          <p className="text-[#94a3b8]">Devuelve un cheque entregado a un cliente y lo marca como rechazado.</p>
        </header>

        <form onSubmit={handleCheckReturnSubmit} className="glass-panel p-8 rounded-2xl shadow-xl border-t border-t-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-amber-500/10 pointer-events-none"></div>

          <div className="grid grid-cols-1 gap-6 relative z-10">
            <div>
              <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Cliente que tiene el cheque</label>
              <select
                required
                value={returnForm.ownerClientId}
                onChange={e => setReturnForm({ ...returnForm, ownerClientId: e.target.value, checkId: '' })}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-500"
              >
                <option value="">Seleccionar cliente...</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {returnForm.ownerClientId && (
              <div>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">
                  Cheque a rechazar
                  {clientChecks.length === 0 && <span className="ml-2 text-amber-400 text-xs">(Sin cheques entregados a este cliente)</span>}
                </label>
                <select
                  required
                  value={returnForm.checkId}
                  onChange={e => setReturnForm({ ...returnForm, checkId: e.target.value })}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-500"
                >
                  <option value="">Seleccionar cheque...</option>
                  {clientChecks.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.bank_name} — N° {c.check_number} — $ {Number(c.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })} — Vto: {new Date(c.due_date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedCheck && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-[#d1dded]">
                <p className="font-bold text-amber-300 mb-1">Cheque seleccionado</p>
                <p>{selectedCheck.bank_name} · N° {selectedCheck.check_number} · <strong>$ {Number(selectedCheck.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></p>
                <p className="text-[#94a3b8] text-xs mt-1">Este cheque volverá a la agencia marcado como RECHAZADO.</p>
              </div>
            )}

            <div>
              <label className="block text-sm text-[#aab6c7] mb-2 font-medium">
                Comisión por rechazo
                <span className="ml-1 text-[#64748b] text-xs">— porcentaje sobre el importe del cheque</span>
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <NumericFormat
                    value={returnForm.rejectionFeePercentage}
                    onValueChange={v => setReturnForm({ ...returnForm, rejectionFeePercentage: v.value })}
                    decimalSeparator="." decimalScale={4} suffix="%"
                    className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-500"
                    placeholder="Ej: 2"
                    disabled={!selectedCheck}
                  />
                  {!selectedCheck && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#475569]">Seleccioná un cheque primero</span>
                  )}
                </div>
                {selectedCheck && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-right min-w-[160px]">
                    <p className="text-[10px] text-amber-400/70 uppercase font-bold tracking-wider mb-0.5">Comisión calculada</p>
                    <p className="text-amber-300 font-bold font-mono text-lg">
                      $ {rejectionFeeAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                    {Number(returnForm.rejectionFeePercentage) > 0 && (
                      <p className="text-[10px] text-[#64748b] mt-0.5">
                        $ {Number(selectedCheck.amount).toLocaleString('es-AR')} × {returnForm.rejectionFeePercentage}%
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {rejectionFeeAmount > 0 && (
              <div>
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Descripción del cargo de rechazo</label>
                <input
                  type="text"
                  value={returnForm.rejectionFeeDescription}
                  onChange={e => setReturnForm({ ...returnForm, rejectionFeeDescription: e.target.value })}
                  placeholder="Ej: Comisión x rechazo de cheque"
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-[#334155]/50 flex justify-end space-x-4">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-3 text-[#aab6c7] hover:text-white transition-colors font-medium">Volver</button>
            <button
              type="submit"
              disabled={loading || !returnForm.checkId}
              className={`px-8 py-3 rounded-xl font-bold text-white transition-all duration-300 shadow-lg ${loading || !returnForm.checkId ? 'opacity-50 cursor-not-allowed bg-gray-500' : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:scale-105 hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]'}`}
            >
              {loading ? 'Procesando...' : 'Confirmar Rechazo'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full h-full animate-in slide-in-from-bottom-8 duration-500 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Cargar Egreso (Ticket)</h1>
        <p className="text-[#94a3b8]">Extrae liquidez física de una de las cajas operativas.</p>
      </header>

      <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-2xl shadow-xl border-t border-t-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-red-500/10 pointer-events-none"></div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
          <div>
            <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Proveedor / Cliente (Opcional)</label>
            <select 
              value={form.clientId} 
              onChange={e => setForm(prev => ({...prev, clientId: e.target.value}))} 
              className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-500"
            >
              <option value="">Egreso Libre (Ej: Gasto operativo)</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
             <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Caja Pagadora</label>
             <select 
                required disabled
                value={form.agencyBoxId} 
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-500 opacity-70 cursor-not-allowed"
             >
                <option value="">{boxes.length > 0 ? "Autocompletado..." : "Cree Caja Principal"}</option>
                {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
             </select>
          </div>

          <div>
             <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Moneda</label>
             <select 
               value={form.currency} 
               onChange={e => setForm(prev => ({...prev, currency: e.target.value}))} 
               className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-500 font-bold"
             >
               <option value="ARS">Pesos Argentinos (ARS)</option>
               <option value="USD">Dólares (USD)</option>
             </select>
          </div>

          <div>
             <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Categoría del Gasto</label>
             <select 
               value={form.category} 
               onChange={e => setForm(prev => ({...prev, category: e.target.value}))} 
               className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-500"
             >
               <option value="OPERATING_EXPENSE">Gasto Operativo / Fijo</option>
               <option value="SALARY">Sueldos y Honorarios</option>
               <option value="COMMISSION">Comisiones</option>
               <option value="CLIENT_FUNDING">Pago a Cliente (Cancelación de Deuda)</option>
               <option value="PARTNER_WITHDRAWAL">Retiro de Socios</option>
               <option value="OTHER">Otro Egreso</option>
             </select>
          </div>

          <div className="col-span-1 md:col-span-2 bg-[#141f32]/50 border border-[#2c394a] rounded-2xl p-6 mt-2">
             <label className="block text-xs uppercase font-bold text-red-400 mb-3 tracking-wider">Monto Extraído</label>
             <NumericFormat 
                 value={form.amount}
                 onValueChange={(values) => setForm(prev => ({...prev, amount: values.value}))}
                 thousandSeparator=","
                 decimalSeparator="."
                 prefix={form.currency === 'USD' ? 'U$S ' : '$ '}
                 className="w-full bg-transparent border-b-2 border-[#334155] focus:border-red-400 text-4xl text-[#f8fafc] font-bold py-2 focus:outline-none transition-colors"
                 placeholder="0.00"
             />
          </div>

          <div className="col-span-1 md:col-span-2">
             <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Descripción y Motivo</label>
             <input 
               type="text" required
               value={form.description} 
               onChange={e => setForm(prev => ({...prev, description: e.target.value}))} 
               placeholder="Ej: Pago de alquiler del mes, sucursal norte." 
               className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-500" 
             />
          </div>

          <div className="col-span-1 md:col-span-2">
             <label className="block text-sm text-[#aab6c7] mb-2 font-medium">
               Fecha de operación
               {operationDate !== todayStr && (
                 <span className="ml-2 text-xs text-amber-400 font-normal">← fecha retroactiva</span>
               )}
             </label>
             <input
               type="date"
               value={operationDate}
               max={todayStr}
               onChange={e => setOperationDate(e.target.value)}
               className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-500"
             />
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-[#334155]/50 flex justify-end space-x-4">
           <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-3 text-[#aab6c7] hover:text-white transition-colors font-medium">Volver</button>
           <button 
             type="submit" 
             disabled={loading}
             className={`px-8 py-3 rounded-xl font-bold text-white transition-all duration-300 shadow-lg ${loading ? 'opacity-50 cursor-not-allowed bg-gray-500' : 'bg-gradient-to-r from-red-500 to-red-600 hover:scale-105 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]'}`}
           >
             {loading ? 'Impactando en Caja...' : 'Confirmar Egreso'}
           </button>
        </div>
      </form>

      {overdraftData && (
        <OverdraftConfirmModal
          overdrafts={overdraftData.overdrafts}
          onCancel={() => setOverdraftData(null)}
          onConfirm={() => doOutcomeSubmit(overdraftData.payload, true)}
        />
      )}
    </div>
  );
}
