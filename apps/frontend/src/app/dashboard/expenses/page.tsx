'use client';
import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import OverdraftConfirmModal, { OverdraftInfo } from '@/components/OverdraftConfirmModal';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

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
      <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-8">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Egresos de Caja</h1>
            <p className="mt-1 text-[13.5px] text-muted">Gastos operativos, sueldos, retiros y pagos de obligaciones.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setFormMode('expense'); setIsFormOpen(true); }} className="rounded-[9px] bg-negative px-5 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90">
              - Nuevo Egreso
            </button>
            <button onClick={() => { setFormMode('check-return'); setIsFormOpen(true); }} className="rounded-[9px] bg-warn px-5 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90">
              ✕ Rechazar Cheque
            </button>
          </div>
        </header>

        {/* FILTER BAR */}
        <Card className="mb-4 space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Filtros</p>
            {hasEFilter && <button onClick={() => { setESearch(''); setECategory(''); setEClient(''); setECurrency(''); setEDateFrom(''); setEDateTo(''); }} className="text-xs font-medium text-accent transition-colors hover:underline">✕ Limpiar</button>}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">🔍</span>
              <input type="text" value={eSearch} onChange={e => setESearch(e.target.value)} placeholder="Buscar descripción..."
                className={`${inputClass} pl-9`} />
            </div>
            <select value={eCategory} onChange={e => setECategory(e.target.value)} className={selectClass}>
              <option value="">Todas las categorías</option>
              <option value="OPERATING_EXPENSE">Gasto Operativo / Fijo</option>
              <option value="SALARY">Sueldos y Honorarios</option>
              <option value="COMMISSION">Comisiones</option>
              <option value="CLIENT_FUNDING">Pago a Cliente (Cancelación de Deuda)</option>
              <option value="PARTNER_WITHDRAWAL">Retiro de Socios</option>
              <option value="OTHER">Otro</option>
            </select>
            <select value={eClient} onChange={e => setEClient(e.target.value)} className={selectClass}>
              <option value="">Todos los clientes/prov.</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={eCurrency} onChange={e => setECurrency(e.target.value)} className={selectClass}>
              <option value="">Toda moneda</option>
              <option value="ARS">ARS — Pesos</option>
              <option value="USD">USD — Dólares</option>
            </select>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Desde</label>
              <input type="date" value={eDateFrom} onChange={e => setEDateFrom(e.target.value)}
                className={`${inputClass} py-2 text-xs`} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Hasta</label>
              <input type="date" value={eDateTo} onChange={e => setEDateTo(e.target.value)}
                className={`${inputClass} py-2 text-xs`} />
            </div>
          </div>
        </Card>

        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm text-muted"><span className="font-bold text-ink">{expFiltered.length}</span> resultado{expFiltered.length !== 1 ? 's' : ''}{hasEFilter && <span className="ml-1 text-negative">(filtrado)</span>}</p>
          {expFiltered.length > 0 && (
            <div className="flex items-center gap-4">
              {expTotalARS > 0 && <p className="text-sm text-muted">ARS: <span className="font-mono font-bold text-negative">-$ {expTotalARS.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>}
              {expTotalUSD > 0 && <p className="text-sm text-muted">USD: <span className="font-mono font-bold text-negative">-U$S {expTotalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>}
            </div>
          )}
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-track text-xs uppercase tracking-wider text-muted">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Categoría</th>
                <th className="p-4 font-semibold">Cliente Adjunto</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 text-right font-semibold">Importe</th>
                <th className="w-24 p-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {expFiltered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-faint">{hasEFilter ? '⚠ Sin resultados.' : 'No hay egresos registrados.'}</td></tr>
              ) : expFiltered.slice(0, expVisible).map((t: any, idx: number) => {
                const mov = t.movements?.[0];
                return (
                  <tr key={t.id} className={`border-b border-line transition-colors hover:bg-row-hover ${idx % 2 === 0 ? 'bg-transparent' : 'bg-canvas'}`}>
                    <td className="whitespace-nowrap p-4 text-ink">{new Date(t.operation_date).toLocaleDateString()}</td>
                    <td className="p-4"><span className="whitespace-nowrap rounded border border-line bg-track px-2 py-1 text-xs font-medium text-muted">{t.category}</span></td>
                    <td className="p-4 text-ink">{mov?.client?.name || '-'}</td>
                    <td className="p-4">
                      <p className={t.is_reversed ? 'text-faint line-through' : 'text-ink'}>{t.description}</p>
                      {t.reversal_of && <span className="mt-1 inline-block rounded border border-line bg-track px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Reversión</span>}
                    </td>
                    <td className="whitespace-nowrap p-4 text-right font-mono font-bold text-negative">-{mov?.currency === 'USD' ? 'U$S ' : '$ '}{Number(mov?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="p-4 text-right">
                      {!t.is_reversed && !t.reversal_of && (
                        <button onClick={() => setRevertTarget(t)} className="rounded-lg border border-negative/30 px-3 py-1.5 text-xs font-medium text-negative transition-colors hover:bg-negative-bg">
                          Revertir
                        </button>
                      )}
                      {t.is_reversed && <span className="text-[10px] font-bold uppercase tracking-wider text-negative/70">Revertida</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {expVisible < expFiltered.length && (
            <div className="border-t border-line p-4 text-center">
              <button onClick={() => setExpVisible(v => v + 10)} className="text-sm font-medium text-accent transition-colors hover:underline">
                Ver más ({expFiltered.length - expVisible} restantes)
              </button>
            </div>
          )}
        </Card>
        {revertTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-lg rounded-[14px] border border-line bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-line p-6">
                <h2 className="text-xl font-semibold tracking-tight text-ink">Revertir Transacción</h2>
                <button onClick={() => setRevertTarget(null)} className="text-xl font-bold text-faint transition-colors hover:text-ink">×</button>
              </div>
              <div className="space-y-4 p-6">
                <p className="text-sm leading-relaxed text-muted">Esta acción creará asientos de contrapartida que <strong className="text-ink">anulan todos los efectos contables</strong> de la operación original. La transacción quedará marcada como <span className="font-semibold text-negative">REVERTIDA</span>.</p>
                <div className="rounded-xl border border-line bg-canvas px-4 py-3">
                  <p className="mb-1 text-xs uppercase tracking-wider text-faint">Operación a revertir</p>
                  <p className="font-medium text-ink">{revertTarget.description}</p>
                  <p className="mt-1 text-xs text-faint">{new Date(revertTarget.operation_date).toLocaleDateString()} · ID: {revertTarget.id.split('-')[0]}..</p>
                </div>
                <p className="text-xs text-warn">⚠ Esta acción no puede deshacerse.</p>
              </div>
              <div className="flex justify-end gap-3 border-t border-line p-6">
                <button onClick={() => setRevertTarget(null)} disabled={reverting} className="px-5 py-2.5 font-medium text-muted transition-colors hover:text-ink">Cancelar</button>
                <button onClick={handleRevert} disabled={reverting} className="rounded-lg bg-negative px-6 py-2.5 font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50">
                  {reverting ? 'Revirtiendo...' : 'Confirmar Reversión'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Check return form view ────────────────────────────────────────────
  if (isFormOpen && formMode === 'check-return') {
    return (
      <div className="mx-auto w-full max-w-4xl animate-in slide-in-from-bottom-8 duration-500">
        <header className="mb-8">
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Rechazar Cheque</h1>
          <p className="mt-1 text-[13.5px] text-muted">Devuelve un cheque entregado a un cliente y lo marca como rechazado.</p>
        </header>

        <form onSubmit={handleCheckReturnSubmit}>
          <Card className="p-8">
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted">Cliente que tiene el cheque</label>
                <select
                  required
                  value={returnForm.ownerClientId}
                  onChange={e => setReturnForm({ ...returnForm, ownerClientId: e.target.value, checkId: '' })}
                  className={selectClass}
                >
                  <option value="">Seleccionar cliente...</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {returnForm.ownerClientId && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">
                    Cheque a rechazar
                    {clientChecks.length === 0 && <span className="ml-2 text-xs text-warn">(Sin cheques entregados a este cliente)</span>}
                  </label>
                  <select
                    required
                    value={returnForm.checkId}
                    onChange={e => setReturnForm({ ...returnForm, checkId: e.target.value })}
                    className={selectClass}
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
                <div className="rounded-xl border border-warn/30 bg-warn-bg p-4 text-sm text-ink">
                  <p className="mb-1 font-bold text-warn">Cheque seleccionado</p>
                  <p>{selectedCheck.bank_name} · N° {selectedCheck.check_number} · <strong>$ {Number(selectedCheck.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></p>
                  <p className="mt-1 text-xs text-muted">Este cheque volverá a la agencia marcado como RECHAZADO.</p>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-muted">
                  Comisión por rechazo
                  <span className="ml-1 text-xs text-faint">— porcentaje sobre el importe del cheque</span>
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <NumericFormat
                      value={returnForm.rejectionFeePercentage}
                      onValueChange={v => setReturnForm({ ...returnForm, rejectionFeePercentage: v.value })}
                      decimalSeparator="." decimalScale={4} suffix="%"
                      className={inputClass}
                      placeholder="Ej: 2"
                      disabled={!selectedCheck}
                    />
                    {!selectedCheck && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">Seleccioná un cheque primero</span>
                    )}
                  </div>
                  {selectedCheck && (
                    <div className="min-w-[160px] rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-right">
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-warn/70">Comisión calculada</p>
                      <p className="font-mono text-lg font-bold text-warn">
                        $ {rejectionFeeAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </p>
                      {Number(returnForm.rejectionFeePercentage) > 0 && (
                        <p className="mt-0.5 text-[10px] text-faint">
                          $ {Number(selectedCheck.amount).toLocaleString('es-AR')} × {returnForm.rejectionFeePercentage}%
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {rejectionFeeAmount > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Descripción del cargo de rechazo</label>
                  <input
                    type="text"
                    value={returnForm.rejectionFeeDescription}
                    onChange={e => setReturnForm({ ...returnForm, rejectionFeeDescription: e.target.value })}
                    placeholder="Ej: Comisión x rechazo de cheque"
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-end space-x-4 border-t border-line pt-6">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-3 font-medium text-muted transition-colors hover:text-ink">Volver</button>
              <button
                type="submit"
                disabled={loading || !returnForm.checkId}
                className={`rounded-xl px-8 py-3 font-bold text-white shadow-sm transition-all duration-300 ${loading || !returnForm.checkId ? 'cursor-not-allowed bg-faint opacity-60' : 'bg-warn hover:opacity-90'}`}
              >
                {loading ? 'Procesando...' : 'Confirmar Rechazo'}
              </button>
            </div>
          </Card>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl animate-in slide-in-from-bottom-8 duration-500">
      <header className="mb-8">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Cargar Egreso (Ticket)</h1>
        <p className="mt-1 text-[13.5px] text-muted">Extrae liquidez física de una de las cajas operativas.</p>
      </header>

      <form onSubmit={handleSubmit}>
        <Card className="p-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Proveedor / Cliente (Opcional)</label>
              <select
                value={form.clientId}
                onChange={e => setForm(prev => ({...prev, clientId: e.target.value}))}
                className={selectClass}
              >
                <option value="">Egreso Libre (Ej: Gasto operativo)</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
               <label className="mb-2 block text-sm font-medium text-muted">Caja Pagadora</label>
               <select
                  required disabled
                  value={form.agencyBoxId}
                  className={`${selectClass} cursor-not-allowed opacity-60`}
               >
                  <option value="">{boxes.length > 0 ? "Autocompletado..." : "Cree Caja Principal"}</option>
                  {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
               </select>
            </div>

            <div>
               <label className="mb-2 block text-sm font-medium text-muted">Moneda</label>
               <select
                 value={form.currency}
                 onChange={e => setForm(prev => ({...prev, currency: e.target.value}))}
                 className={`${selectClass} font-bold`}
               >
                 <option value="ARS">Pesos Argentinos (ARS)</option>
                 <option value="USD">Dólares (USD)</option>
               </select>
            </div>

            <div>
               <label className="mb-2 block text-sm font-medium text-muted">Categoría del Gasto</label>
               <select
                 value={form.category}
                 onChange={e => setForm(prev => ({...prev, category: e.target.value}))}
                 className={selectClass}
               >
                 <option value="OPERATING_EXPENSE">Gasto Operativo / Fijo</option>
                 <option value="SALARY">Sueldos y Honorarios</option>
                 <option value="COMMISSION">Comisiones</option>
                 <option value="CLIENT_FUNDING">Pago a Cliente (Cancelación de Deuda)</option>
                 <option value="PARTNER_WITHDRAWAL">Retiro de Socios</option>
                 <option value="OTHER">Otro Egreso</option>
               </select>
            </div>

            <div className="col-span-1 mt-2 rounded-2xl border border-line bg-canvas p-6 md:col-span-2">
               <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-negative">Monto Extraído</label>
               <NumericFormat
                   value={form.amount}
                   onValueChange={(values) => setForm(prev => ({...prev, amount: values.value}))}
                   thousandSeparator=","
                   decimalSeparator="."
                   prefix={form.currency === 'USD' ? 'U$S ' : '$ '}
                   className="w-full border-b-2 bg-transparent py-2 text-4xl font-bold text-ink transition-colors focus:outline-none"
                   style={{ borderBottomColor: '#b42318' } as any}
                   placeholder="0.00"
               />
            </div>

            <div className="col-span-1 md:col-span-2">
               <label className="mb-2 block text-sm font-medium text-muted">Descripción y Motivo</label>
               <input
                 type="text" required
                 value={form.description}
                 onChange={e => setForm(prev => ({...prev, description: e.target.value}))}
                 placeholder="Ej: Pago de alquiler del mes, sucursal norte."
                 className={inputClass}
               />
            </div>

            <div className="col-span-1 md:col-span-2">
               <label className="mb-2 block text-sm font-medium text-muted">
                 Fecha de operación
                 {operationDate !== todayStr && (
                   <span className="ml-2 text-xs font-normal text-warn">← fecha retroactiva</span>
                 )}
               </label>
               <input
                 type="date"
                 value={operationDate}
                 max={todayStr}
                 onChange={e => setOperationDate(e.target.value)}
                 className={inputClass}
               />
            </div>
          </div>

          <div className="mt-8 flex justify-end space-x-4 border-t border-line pt-6">
             <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-3 font-medium text-muted transition-colors hover:text-ink">Volver</button>
             <button
               type="submit"
               disabled={loading}
               className={`rounded-xl px-8 py-3 font-bold text-white shadow-sm transition-all duration-300 ${loading ? 'cursor-not-allowed bg-faint opacity-60' : 'bg-negative hover:opacity-90'}`}
             >
               {loading ? 'Impactando en Caja...' : 'Confirmar Egreso'}
             </button>
          </div>
        </Card>
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
