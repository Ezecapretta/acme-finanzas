'use client';
import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

const COMMISSION_LABELS: Record<string, string> = {
  RECHAZO:           'Por gastos de rechazo',
  COSTO_TRANSACCION: 'Por costo de transacción',
  OTRO:              'Otro concepto',
};

export default function CheckTradePage() {
  const [clients, setClients]         = useState<any[]>([]);
  const [agencyBoxes, setAgencyBoxes] = useState<any[]>([]);
  const [availableChecks, setAvailableChecks] = useState<any[]>([]);
  const [allChecks, setAllChecks]     = useState<any[]>([]);
  const [checkTradeTxs, setCheckTradeTxs] = useState<any[]>([]);
  const [revertTarget, setRevertTarget]   = useState<any | null>(null);
  const [reverting, setReverting]         = useState(false);

  // ── Operation form ─────────────────────────────────────────────────────
  const [form, setForm] = useState({
    sellerId: '',
    buyerId: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [selectedChecks, setSelectedChecks] = useState<any[]>([]);
  const [checkSearch, setCheckSearch]       = useState('');

  // ── Commission form (manual) ───────────────────────────────────────────
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commType, setCommType]       = useState('COSTO_TRANSACCION');
  const [commPercentage, setCommPercentage] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading]       = useState(false);

  // ── Total of selected checks ───────────────────────────────────────────
  const totalChecks = selectedChecks.reduce((acc, c) => acc + Number(c.amount), 0);
  const commissionAmount = commissionEnabled
    ? (totalChecks * (Number(commPercentage) || 0)) / 100
    : 0;

  const loadData = () => {
    fetchApi('/checks').then(data => {
      const all = Array.isArray(data) ? data : (data.checks || []);
      setAllChecks(all);
      setAvailableChecks(all.filter((c: any) => c.status === 'IN_PORTFOLIO' || c.status === 'PENDING_PURCHASE'));
    }).catch(console.error);
    fetchApi('/transactions?type=CHECK_TRADE').then(data => {
      const all = Array.isArray(data) ? data : [];
      setCheckTradeTxs(all.filter((t: any) => t.category !== 'CHECK_DEPOSIT'));
    }).catch(console.error);
  };

  useEffect(() => {
    loadData();
    Promise.all([fetchApi('/clients'), fetchApi('/boxes')])
      .then(([clientData, boxData]) => {
        setClients(Array.isArray(clientData) ? clientData : (clientData.clients || []));
        setAgencyBoxes((boxData.boxes || []).filter((b: any) => !b.client_id));
      }).catch(console.error);
  }, []);

  // ── When seller changes, clear selected checks ─────────────────────────
  useEffect(() => {
    setSelectedChecks([]);
    setCheckSearch('');
  }, [form.sellerId]);

  // Determinar tipo de operación según quién es el vendedor
  const isBuyOperation  = !!form.sellerId && !form.sellerId.startsWith('BOX:');
  const isSellOperation = !!form.sellerId && form.sellerId.startsWith('BOX:');

  // ── Checks filtrados según tipo de operación ─────────────────────────
  const clientPortfolioChecks = useMemo(() => {
    if (!form.sellerId) return [];
    if (isSellOperation) {
      return availableChecks.filter((c: any) => c.status === 'IN_PORTFOLIO');
    }
    return availableChecks.filter(
      (c: any) => c.status === 'PENDING_PURCHASE' && c.source_client?.id === form.sellerId
    );
  }, [availableChecks, form.sellerId, isBuyOperation, isSellOperation]);

  const unselectedPortfolioChecks = clientPortfolioChecks.filter(
    ac => !selectedChecks.find(sc => sc.id === ac.id)
  );

  // ── Helpers ────────────────────────────────────────────────────────────
  const getPartyLabel = (id: string) => {
    if (!id) return '—';
    if (id.startsWith('BOX:')) {
      const box = agencyBoxes.find(b => b.id === id.replace('BOX:', ''));
      return box ? `🏦 ${box.name} (Agencia)` : 'Caja Agencia';
    }
    const c = clients.find(c => c.id === id);
    return c?.box?.name || (id ? 'Sin caja asignada' : '—');
  };

  const partyOptions = (
    <>
      {agencyBoxes.length > 0 && (
        <optgroup label="── AGENCIA (Cajas propias)">
          {agencyBoxes.map(b => (
            <option key={`BOX:${b.id}`} value={`BOX:${b.id}`}>🏦 {b.name}</option>
          ))}
        </optgroup>
      )}
      <optgroup label="── CLIENTES">
        {clients.map(c => (
          <option key={c.id} value={c.id}>{c.name}{c.tax_id ? ` (${c.tax_id})` : ''}</option>
        ))}
      </optgroup>
    </>
  );

  const getCheckSellerLabel = (check: any) => check.source_client?.name || 'Acme / Mis Cheques';
  const getCheckBuyerLabel  = (check: any) => {
    if (check.destination_client?.name) return check.destination_client.name;
    if (check.status === 'IN_PORTFOLIO') return 'En Cartera';
    return 'Acme / Mis Cheques';
  };

  const addExistingCheck = (check: any) => {
    if (selectedChecks.find(c => c.id === check.id)) { toast.error('El cheque ya fue agregado.'); return; }
    setSelectedChecks(prev => [...prev, check]);
  };
  const removeCheck = (id: string) => setSelectedChecks(prev => prev.filter(c => c.id !== id));

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.sellerId || !form.buyerId) { toast.error('Seleccione Vendedor y Comprador.'); return; }
    if (form.sellerId === form.buyerId)  { toast.error('Vendedor y Comprador no pueden ser el mismo.'); return; }
    if (selectedChecks.length === 0)     { toast.error('Seleccioná al menos un cheque de la cartera.'); return; }
    if (commissionEnabled && commissionAmount <= 0) {
      toast.error('El monto de comisión debe ser mayor a cero, o deshabilita la comisión.');
      return;
    }

    const sellerClientId = form.sellerId.startsWith('BOX:') ? null : form.sellerId;
    const buyerIsAgency  = form.buyerId.startsWith('BOX:');
    const buyerClientId  = buyerIsAgency ? null : form.buyerId;
    const rawBoxId = form.sellerId.startsWith('BOX:')
      ? form.sellerId.replace('BOX:', '')
      : form.buyerId.startsWith('BOX:')
        ? form.buyerId.replace('BOX:', '')
        : agencyBoxes[0]?.id;

    const userId = getUserId();
    if (!userId) { toast.error('Sesión inválida. Por favor volvé a iniciar sesión.'); return; }

    setLoading(true);
    try {
      await fetchApi('/transactions/check-trade', {
        method: 'POST',
        body: JSON.stringify({
          checkIds:         selectedChecks.map((c: any) => c.id),
          sellerClientId,
          buyerClientId,
          description:      `${isBuyOperation ? 'Compra' : 'Venta'} Cheques${form.notes ? ` — ${form.notes}` : ''}`,
          userId,
          ...(commissionEnabled && commissionAmount > 0 && rawBoxId
            ? { commissionAmount, agencyBoxId: rawBoxId }
            : {}),
        }),
      });
      toast.success(
        `Operación registrada. ${selectedChecks.length} cheque(s) procesado(s)${commissionEnabled && commissionAmount > 0 ? ` + comisión $ ${commissionAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : ''}.`
      );
      setIsFormOpen(false);
      setSelectedChecks([]);
      setCheckSearch('');
      setCommissionEnabled(false);
      setCommPercentage('');
      loadData();
      setForm(prev => ({ ...prev, sellerId: '', buyerId: '', notes: '' }));
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
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al revertir la transacción.');
    } finally {
      setReverting(false);
    }
  };

  // ─── FILTER STATE (list view) ──────────────────────────────────────────
  const [filterText, setFilterText]           = useState('');
  const [filterStatus, setFilterStatus]       = useState('');
  const [filterClient, setFilterClient]       = useState('');
  const [filterDueFrom, setFilterDueFrom]     = useState('');
  const [filterDueTo, setFilterDueTo]         = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [checksVisible, setChecksVisible] = useState(10);
  const [opsVisible, setOpsVisible] = useState(10);

  const statusLabel: Record<string, { label: string; cls: string }> = {
    PENDING_PURCHASE: { label: 'Pend. Compra', cls: 'bg-warn-bg text-warn' },
    IN_PORTFOLIO:     { label: 'En Cartera',   cls: 'bg-positive-bg text-positive' },
    DELIVERED:        { label: 'Entregado',    cls: 'bg-accent-bg text-accent' },
    DEPOSITED:        { label: 'Depositado',   cls: 'bg-track text-ink-soft' },
    REJECTED:         { label: 'Rechazado',    cls: 'bg-negative-bg text-negative' },
  };

  const filtered = allChecks.filter(c => {
    const text = filterText.toLowerCase();
    if (text && !c.bank_name?.toLowerCase().includes(text) && !c.check_number?.toLowerCase().includes(text)) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterClient && c.source_client?.id !== filterClient && c.destination_client?.id !== filterClient) return false;
    if (filterDueFrom && new Date(c.due_date) < new Date(filterDueFrom)) return false;
    if (filterDueTo   && new Date(c.due_date) > new Date(filterDueTo))   return false;
    if (filterMinAmount && Number(c.amount) < Number(filterMinAmount)) return false;
    return true;
  });
  const filteredTotal   = filtered.reduce((acc, c) => acc + Number(c.amount), 0);
  const hasActiveFilter = filterText || filterStatus || filterClient || filterDueFrom || filterDueTo || filterMinAmount;

  const clearFilters = () => {
    setFilterText(''); setFilterStatus(''); setFilterClient('');
    setFilterDueFrom(''); setFilterDueTo(''); setFilterMinAmount('');
  };

  const selectedClient = form.sellerId && !form.sellerId.startsWith('BOX:')
    ? clients.find(c => c.id === form.sellerId)
    : null;

  // ─── MASTER VIEW ───────────────────────────────────────────────────────
  if (!isFormOpen) {
    return (
      <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-8">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Compra/Venta de Cheques</h1>
            <p className="mt-1 text-[13.5px] text-muted">Historial de cheques físicos cruzados e ingresados al sistema.</p>
          </div>
          <button
            onClick={() => setIsFormOpen(true)}
            className="rounded-[9px] bg-ink px-6 py-3 font-bold text-white shadow-sm transition-all hover:opacity-85"
          >
            + Nueva Operación
          </button>
        </header>

        {/* FILTER BAR */}
        <Card className="mb-4 space-y-4 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Filtros</p>
            {hasActiveFilter && (
              <button onClick={clearFilters} className="text-xs font-medium text-accent transition-colors hover:underline">
                ✕ Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">🔍</span>
              <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
                placeholder="Buscar banco o N° cheque..."
                className={`${inputClass} pl-9`} />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
              <option value="">Todos los estados</option>
              <option value="PENDING_PURCHASE">Pendiente de Compra</option>
              <option value="IN_PORTFOLIO">En Cartera</option>
              <option value="DELIVERED">Entregado</option>
              <option value="DEPOSITED">Depositado</option>
              <option value="REJECTED">Rechazado</option>
            </select>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className={selectClass}>
              <option value="">Todos los clientes</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Vencimiento desde</label>
              <input type="date" value={filterDueFrom} onChange={e => setFilterDueFrom(e.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Vencimiento hasta</label>
              <input type="date" value={filterDueTo} onChange={e => setFilterDueTo(e.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Importe mínimo ($)</label>
              <input type="number" value={filterMinAmount} onChange={e => setFilterMinAmount(e.target.value)}
                placeholder="0.00"
                className={inputClass} />
            </div>
          </div>
        </Card>

        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm text-muted">
            <span className="font-bold text-ink">{filtered.length}</span> resultado{filtered.length !== 1 ? 's' : ''}
            {hasActiveFilter && <span className="ml-1 text-accent">(filtrado)</span>}
          </p>
          {filtered.length > 0 && (
            <p className="text-sm text-muted">
              Total: <span className="font-mono font-bold text-positive">$ {filteredTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </p>
          )}
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-track text-xs uppercase tracking-wider text-muted">
                <th className="p-4 font-semibold">F. Emisión</th>
                <th className="p-4 font-semibold">F. Cobro</th>
                <th className="p-4 font-semibold">Vendedor</th>
                <th className="p-4 font-semibold">Comprador</th>
                <th className="p-4 font-semibold">Banco / Nro</th>
                <th className="p-4 font-semibold">Estado</th>
                <th className="p-4 text-right font-semibold">Importe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-10 text-center text-faint">
                  {hasActiveFilter ? '⚠ Sin resultados para los filtros actuales.' : 'No hay cheques ingresados.'}
                </td></tr>
              ) : filtered.slice(0, checksVisible).map((c, idx) => {
                const st = statusLabel[c.status] || { label: c.status, cls: 'bg-track text-muted' };
                return (
                  <tr key={c.id} className={`border-b border-line transition-colors hover:bg-row-hover ${idx % 2 === 0 ? 'bg-transparent' : 'bg-canvas'}`}>
                    <td className="p-4 text-ink">{new Date(c.issue_date).toLocaleDateString('es-AR')}</td>
                    <td className="p-4 font-bold text-accent">{new Date(c.due_date).toLocaleDateString('es-AR')}</td>
                    <td className="p-4 text-ink">{getCheckSellerLabel(c)}</td>
                    <td className="p-4 text-ink">{getCheckBuyerLabel(c)}</td>
                    <td className="p-4 text-ink">
                      {c.bank_name} <span className="ml-1 rounded border border-line bg-track px-2 py-0.5 text-xs text-muted">#{c.check_number}</span>
                    </td>
                    <td className="p-4"><span className={`rounded px-2 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span></td>
                    <td className="p-4 text-right font-mono font-bold text-ink">
                      $ {Number(c.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {checksVisible < filtered.length && (
            <div className="border-t border-line p-4 text-center">
              <button onClick={() => setChecksVisible(v => v + 10)} className="text-sm font-medium text-accent transition-colors hover:underline">
                Ver más ({filtered.length - checksVisible} restantes)
              </button>
            </div>
          )}
        </Card>
        {/* HISTORIAL DE OPERACIONES C/V CHEQUES */}
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold tracking-tight text-ink">Historial de Operaciones</h2>
          <Card className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-track text-xs uppercase tracking-wider text-muted">
                  <th className="p-4 font-semibold">Fecha</th>
                  <th className="p-4 font-semibold">Descripción</th>
                  <th className="p-4 font-semibold">Cliente</th>
                  <th className="p-4 font-semibold">N° Cheque</th>
                  <th className="p-4 font-semibold">Operador</th>
                  <th className="w-24 p-4 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {checkTradeTxs.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-faint">No hay operaciones de compra/venta registradas.</td></tr>
                ) : checkTradeTxs.slice(0, opsVisible).map((t: any, idx: number) => {
                  const movs: any[] = t.movements || [];
                  const clients = [...new Map(movs.filter((m: any) => m.client?.name).map((m: any) => [m.client.id, m.client.name])).values()];
                  const checkNums = [...new Set(movs.filter((m: any) => m.check?.check_number).map((m: any) => m.check.check_number))];
                  return (
                  <tr key={t.id} className={`border-b border-line transition-colors hover:bg-row-hover ${idx % 2 === 0 ? 'bg-transparent' : 'bg-canvas'}`}>
                    <td className="whitespace-nowrap p-4 text-ink">{new Date(t.operation_date).toLocaleDateString('es-AR')}</td>
                    <td className="p-4">
                      <p className={t.is_reversed ? 'text-faint line-through' : 'text-ink'}>{t.description}</p>
                      {t.reversal_of && <span className="mt-1 inline-block rounded border border-line bg-track px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Reversión</span>}
                    </td>
                    <td className="p-4 text-sm text-muted">
                      {clients.length > 0 ? clients.join(', ') : <span className="text-faint">—</span>}
                    </td>
                    <td className="p-4 font-mono text-sm text-muted">
                      {checkNums.length > 0 ? checkNums.join(', ') : <span className="text-faint">—</span>}
                    </td>
                    <td className="p-4 text-sm text-faint">{t.user?.name || 'Sistema'}</td>
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
            {opsVisible < checkTradeTxs.length && (
              <div className="border-t border-line p-4 text-center">
                <button onClick={() => setOpsVisible(v => v + 10)} className="text-sm font-medium text-accent transition-colors hover:underline">
                  Ver más ({checkTradeTxs.length - opsVisible} restantes)
                </button>
              </div>
            )}
          </Card>
        </div>

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

  // ─── FORM VIEW ─────────────────────────────────────────────────────────
  const netToClient = isBuyOperation && commissionEnabled ? Math.max(totalChecks - commissionAmount, 0) : 0;

  return (
    <div className="mx-auto w-full max-w-5xl animate-in slide-in-from-bottom-8 duration-500 pb-12">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Nueva Operación — Compra/Venta de Cheques</h1>
          {isBuyOperation && (
            <span className="rounded-full bg-positive-bg px-3 py-1 text-xs font-bold text-positive">
              COMPRA
            </span>
          )}
          {isSellOperation && (
            <span className="rounded-full bg-accent-bg px-3 py-1 text-xs font-bold text-accent">
              VENTA
            </span>
          )}
        </div>
        <p className="text-[13.5px] text-muted">
          {isBuyOperation
            ? 'La agencia adquiere los cheques. La comisión se registra como ingreso; el neto se le debe al cliente.'
            : isSellOperation
              ? 'La agencia vende cheques de cartera. La comisión del tercero se registra como gasto.'
              : 'Seleccioná el vendedor para detectar el tipo de operación.'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── PASO 1: PARTES ──────────────────────────────────────────── */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">1</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">Partes de la Operación</h3>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* VENDEDOR */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-negative" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-negative">Vendedor — Entrega Cheques</h3>
              </div>
              <select required value={form.sellerId} onChange={e => setForm({ ...form, sellerId: e.target.value })}
                className={selectClass}>
                <option value="">Seleccione vendedor...</option>
                {partyOptions}
              </select>
              <input readOnly value={getPartyLabel(form.sellerId)} placeholder="Caja Vendedor"
                className="w-full cursor-not-allowed rounded-lg border border-line bg-track px-4 py-2.5 text-sm italic text-faint" />
            </div>

            {/* COMPRADOR */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-accent">Comprador — Recibe Cheques</h3>
              </div>
              <select required value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })}
                className={selectClass}>
                <option value="">Seleccione comprador...</option>
                {partyOptions}
              </select>
              <input readOnly value={getPartyLabel(form.buyerId)} placeholder="Caja Comprador"
                className="w-full cursor-not-allowed rounded-lg border border-line bg-track px-4 py-2.5 text-sm italic text-faint" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">Fecha</label>
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">Notas (Opcional)</label>
              <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Observaciones..."
                className={inputClass} />
            </div>
          </div>
        </Card>

        {/* ── PASO 2: CHEQUES ─────────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-canvas px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">2</span>
              <div>
                <h3 className="font-bold text-ink">Cheques de la Operación</h3>
                <p className="text-xs text-muted">
                  {selectedChecks.length} seleccionado{selectedChecks.length !== 1 ? 's' : ''} · Total:
                  <span className="ml-1 font-bold text-accent">
                    $ {totalChecks.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Unified checkbox list */}
          {clientPortfolioChecks.length === 0 ? (
            <div className="px-6 py-8 text-center">
              {!form.sellerId ? (
                <p className="text-sm text-faint">Seleccioná el vendedor en el Paso 1 para ver sus cheques.</p>
              ) : form.sellerId.startsWith('BOX:') ? (
                <>
                  <p className="mb-3 text-3xl">📭</p>
                  <p className="text-sm font-medium text-muted">La agencia no tiene cheques propios en cartera.</p>
                  <p className="mt-1 text-xs text-faint">Comprá cheques a un cliente primero para poder revenderlos.</p>
                </>
              ) : (
                <>
                  <p className="mb-3 text-3xl">📭</p>
                  <p className="text-sm font-medium text-muted">{selectedClient?.name} no tiene cheques pendientes de compra.</p>
                  <p className="mt-1 text-xs text-faint">
                    Ingresalos desde{' '}
                    <a href="/dashboard/incomes" className="font-semibold text-accent hover:underline">Ingreso de Valores → Cheque</a>.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between border-t border-line bg-canvas px-6 py-3">
                <button type="button"
                  onClick={() => selectedChecks.length === clientPortfolioChecks.length
                    ? setSelectedChecks([])
                    : setSelectedChecks(clientPortfolioChecks)}
                  className="text-xs font-medium text-accent transition-colors hover:underline">
                  {selectedChecks.length === clientPortfolioChecks.length ? '✕ Deseleccionar todos' : '✓ Seleccionar todos'}
                </button>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-faint">🔍</span>
                  <input type="text" value={checkSearch} onChange={e => setCheckSearch(e.target.value)}
                    placeholder="Filtrar..."
                    className={`${inputClass} w-36 py-1.5 pl-8 text-xs`} />
                </div>
              </div>

              {/* Check rows */}
              <div className="max-h-80 divide-y divide-line overflow-y-auto">
                {clientPortfolioChecks
                  .filter(c =>
                    !checkSearch ||
                    c.bank_name?.toLowerCase().includes(checkSearch.toLowerCase()) ||
                    c.check_number?.toLowerCase().includes(checkSearch.toLowerCase()) ||
                    c.source_client?.name?.toLowerCase().includes(checkSearch.toLowerCase())
                  )
                  .map(c => {
                    const isSelected = !!selectedChecks.find(sc => sc.id === c.id);
                    return (
                      <div key={c.id}
                        onClick={() => isSelected ? removeCheck(c.id) : addExistingCheck(c)}
                        className={`flex cursor-pointer items-center px-6 py-3 transition-all duration-150 ${isSelected ? 'bg-positive-bg/50' : 'hover:bg-row-hover'}`}>
                        {/* Checkbox indicator */}
                        <div className={`mr-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-150 ${isSelected ? 'border-positive bg-positive-bg' : 'border-line bg-canvas'}`}>
                          {isSelected && <span className="text-sm font-bold text-positive">✓</span>}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">
                            {c.bank_name} <span className="font-mono text-xs text-faint">#{c.check_number}</span>
                            {c.source_client?.name && <span className="ml-2 text-[10px] text-faint">· {c.source_client.name}</span>}
                          </p>
                          <p className="text-xs text-faint">Vto: {new Date(c.due_date).toLocaleDateString('es-AR')}</p>
                        </div>
                        {/* Amount */}
                        <span className="mr-4 font-mono text-sm font-bold text-ink">
                          $ {Number(c.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        {/* X button */}
                        <button type="button"
                          onClick={e => { e.stopPropagation(); removeCheck(c.id); }}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm transition-all ${isSelected ? 'border-negative/20 bg-negative-bg text-negative hover:opacity-80' : 'pointer-events-none border-transparent opacity-0'}`}>
                          ✕
                        </button>
                      </div>
                    );
                  })
                }
              </div>
            </>
          )}
        </Card>

        {/* ── PASO 3: COMISIÓN (Opcional) ─────────────────────────────── */}
        <div className={`overflow-hidden rounded-[14px] border transition-all duration-300 ${commissionEnabled ? 'border-warn/30 bg-warn-bg' : 'border-line bg-surface'}`}>
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warn text-xs font-bold text-white">3</span>
              <div>
                <h3 className="text-sm font-bold text-ink">Comisión (Opcional)</h3>
                <p className="text-xs text-muted">
                  {isBuyOperation ? '📥 Ingreso para la agencia (se descuenta del neto al cliente)' : isSellOperation ? '📤 Gasto para la agencia (costo cobrado por el tercero)' : 'Aplicar comisión porcentual sobre el total de cheques.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCommissionEnabled(v => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${commissionEnabled ? 'bg-warn' : 'bg-line-hover'}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${commissionEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {commissionEnabled && (
            <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Tipo</label>
                  <select value={commType} onChange={e => setCommType(e.target.value)}
                    className={selectClass}>
                    {Object.entries(COMMISSION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Base (Total cheques)</label>
                  <input readOnly value={`$ ${totalChecks.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                    className="w-full cursor-not-allowed rounded-lg border border-line bg-track px-4 py-3 font-mono text-faint" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted">Porcentaje (%)</label>
                  <NumericFormat
                    value={commPercentage}
                    onValueChange={v => setCommPercentage(v.value)}
                    decimalSeparator="." suffix="%" decimalScale={4}
                    className={inputClass}
                    placeholder="Ej: 0.5"
                  />
                </div>
              </div>

              {/* Result */}
              <div className="flex items-center justify-between rounded-xl border border-warn/25 bg-warn-bg p-4">
                <div className="text-sm text-muted">
                  $ {totalChecks.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  <span className="mx-2 text-faint">×</span>
                  <span className="font-bold text-warn">{commPercentage || 0}%</span>
                  <span className="mx-2 text-faint">=</span>
                </div>
                <p className="font-mono text-2xl font-bold text-warn">
                  $ {commissionAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              {isBuyOperation && netToClient > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-positive/20 bg-positive-bg p-4">
                  <p className="text-sm text-muted">Neto a entregar al cliente (AP registrada)</p>
                  <p className="font-mono text-xl font-bold text-positive">
                    $ {netToClient.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={() => setIsFormOpen(false)}
            className="px-6 py-3 font-medium text-muted transition-colors hover:text-ink">
            ← Volver
          </button>
          <div className="flex items-center gap-3">
            {commissionEnabled && commissionAmount > 0 && (
              <p className="text-sm font-medium text-warn">
                + Comisión: $ {commissionAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || selectedChecks.length === 0}
              className={`rounded-xl px-8 py-3 font-bold text-white shadow-sm transition-all duration-300 ${
                (loading || selectedChecks.length === 0)
                  ? 'cursor-not-allowed bg-faint opacity-60'
                  : 'bg-ink hover:opacity-85'
              }`}
            >
              {loading
                ? 'Procesando...'
                : `Confirmar (${selectedChecks.length} cheque${selectedChecks.length !== 1 ? 's' : ''}${commissionEnabled && commissionAmount > 0 ? ' + comisión' : ''})`}
            </button>
          </div>
        </div>
      </form>

    </div>
  );
}
