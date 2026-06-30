'use client';
import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import toast from 'react-hot-toast';

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
  // BUY  = cliente vende a la agencia (agencia compra → PENDING_PURCHASE → IN_PORTFOLIO)
  // SELL = agencia vende a un cliente (IN_PORTFOLIO → DELIVERED)
  const isBuyOperation  = !!form.sellerId && !form.sellerId.startsWith('BOX:');
  const isSellOperation = !!form.sellerId && form.sellerId.startsWith('BOX:');

  // ── Checks filtrados según tipo de operación ─────────────────────────
  // BUY:  mostrar cheques PENDING_PURCHASE del cliente vendedor
  // SELL: mostrar cheques IN_PORTFOLIO de la agencia
  const clientPortfolioChecks = useMemo(() => {
    if (!form.sellerId) return [];
    if (isSellOperation) {
      return availableChecks.filter((c: any) => c.status === 'IN_PORTFOLIO');
    }
    // BUY: cheques pendientes de compra asociados al cliente vendedor
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
    // Usar la caja seleccionada como agencyBoxId (vendedor BOX en SELL, comprador BOX en BUY)
    const rawBoxId = form.sellerId.startsWith('BOX:')
      ? form.sellerId.replace('BOX:', '')
      : form.buyerId.startsWith('BOX:')
        ? form.buyerId.replace('BOX:', '')
        : agencyBoxes[0]?.id;

    const userId = getUserId();
    if (!userId) { toast.error('Sesión inválida. Por favor volvé a iniciar sesión.'); return; }

    setLoading(true);
    try {
      // Compraventa + comisión en un único request atómico
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
    PENDING_PURCHASE: { label: 'Pend. Compra', cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
    IN_PORTFOLIO:     { label: 'En Cartera',   cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
    DELIVERED:        { label: 'Entregado',    cls: 'bg-violet-500/10 text-violet-400 border border-violet-500/20' },
    DEPOSITED:        { label: 'Depositado',   cls: 'bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/20' },
    REJECTED:         { label: 'Rechazado',    cls: 'bg-red-500/10 text-red-400 border border-red-500/20' },
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

  // Cliente vendedor (null si la agencia vende)
  const selectedClient = form.sellerId && !form.sellerId.startsWith('BOX:')
    ? clients.find(c => c.id === form.sellerId)
    : null;

  // ─── MASTER VIEW ───────────────────────────────────────────────────────
  if (!isFormOpen) {
    return (
      <div className="w-full animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto pb-8">
        <header className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Compra/Venta de Cheques</h1>
            <p className="text-[#94a3b8]">Historial de cheques físicos cruzados e ingresados al sistema.</p>
          </div>
          <button
            onClick={() => setIsFormOpen(true)}
            className="px-6 py-3 bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#0ea5e9]/20 hover:shadow-[#0ea5e9]/40 hover:-translate-y-0.5"
          >
            + Nueva Operación
          </button>
        </header>

        {/* FILTER BAR */}
        <div className="glass-panel rounded-2xl border border-[#334155]/50 p-5 mb-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]">Filtros</p>
            {hasActiveFilter && (
              <button onClick={clearFilters} className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                ✕ Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-sm">🔍</span>
              <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
                placeholder="Buscar banco o N° cheque..."
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] placeholder:text-[#334155]" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
              <option value="">Todos los estados</option>
              <option value="PENDING_PURCHASE">Pendiente de Compra</option>
              <option value="IN_PORTFOLIO">En Cartera</option>
              <option value="DELIVERED">Entregado</option>
              <option value="DEPOSITED">Depositado</option>
              <option value="REJECTED">Rechazado</option>
            </select>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
              <option value="">Todos los clientes</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Vencimiento desde</label>
              <input type="date" value={filterDueFrom} onChange={e => setFilterDueFrom(e.target.value)}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Vencimiento hasta</label>
              <input type="date" value={filterDueTo} onChange={e => setFilterDueTo(e.target.value)}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Importe mínimo ($)</label>
              <input type="number" value={filterMinAmount} onChange={e => setFilterMinAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] placeholder:text-[#334155]" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-sm text-[#64748b]">
            <span className="text-[#d1dded] font-bold">{filtered.length}</span> resultado{filtered.length !== 1 ? 's' : ''}
            {hasActiveFilter && <span className="text-[#0ea5e9] ml-1">(filtrado)</span>}
          </p>
          {filtered.length > 0 && (
            <p className="text-sm text-[#64748b]">
              Total: <span className="text-emerald-400 font-bold font-mono">$ {filteredTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </p>
          )}
        </div>

        <div className="glass-panel rounded-2xl overflow-x-auto border border-[#334155]/50 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#334155]/50 bg-[#0a1324]/50 text-[#94a3b8] text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">F. Emisión</th>
                <th className="p-4 font-semibold">F. Cobro</th>
                <th className="p-4 font-semibold">Vendedor</th>
                <th className="p-4 font-semibold">Comprador</th>
                <th className="p-4 font-semibold">Banco / Nro</th>
                <th className="p-4 font-semibold">Estado</th>
                <th className="p-4 font-semibold text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-10 text-center text-[#64748b]">
                  {hasActiveFilter ? '⚠ Sin resultados para los filtros actuales.' : 'No hay cheques ingresados.'}
                </td></tr>
              ) : filtered.slice(0, checksVisible).map((c, idx) => {
                const st = statusLabel[c.status] || { label: c.status, cls: 'bg-[#334155]/50 text-[#64748b]' };
                return (
                  <tr key={c.id} className={`border-b border-[#334155]/30 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0a1324]/30'}`}>
                    <td className="p-4 text-[#d1dded]">{new Date(c.issue_date).toLocaleDateString('es-AR')}</td>
                    <td className="p-4 text-[#0ea5e9] font-bold">{new Date(c.due_date).toLocaleDateString('es-AR')}</td>
                    <td className="p-4 text-[#d1dded]">{getCheckSellerLabel(c)}</td>
                    <td className="p-4 text-[#d1dded]">{getCheckBuyerLabel(c)}</td>
                    <td className="p-4 text-[#d1dded]">
                      {c.bank_name} <span className="text-[#64748b] ml-1 px-2 py-0.5 bg-[#141f32] rounded text-xs border border-[#334155]/50">#{c.check_number}</span>
                    </td>
                    <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${st.cls}`}>{st.label}</span></td>
                    <td className="p-4 text-[#f8fafc] font-bold font-mono text-right">
                      $ {Number(c.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {checksVisible < filtered.length && (
            <div className="p-4 text-center border-t border-[#334155]/30">
              <button onClick={() => setChecksVisible(v => v + 10)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                Ver más ({filtered.length - checksVisible} restantes)
              </button>
            </div>
          )}
        </div>
        {/* HISTORIAL DE OPERACIONES C/V CHEQUES */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-[#f8fafc] mb-3 tracking-tight">Historial de Operaciones</h2>
          <div className="glass-panel rounded-2xl overflow-x-auto border border-[#334155]/50 shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#334155]/50 bg-[#0a1324]/50 text-[#94a3b8] text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Fecha</th>
                  <th className="p-4 font-semibold">Descripción</th>
                  <th className="p-4 font-semibold">Cliente</th>
                  <th className="p-4 font-semibold">N° Cheque</th>
                  <th className="p-4 font-semibold">Operador</th>
                  <th className="p-4 font-semibold w-24"></th>
                </tr>
              </thead>
              <tbody>
                {checkTradeTxs.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-[#64748b]">No hay operaciones de compra/venta registradas.</td></tr>
                ) : checkTradeTxs.slice(0, opsVisible).map((t: any, idx: number) => {
                  const movs: any[] = t.movements || [];
                  const clients = [...new Map(movs.filter((m: any) => m.client?.name).map((m: any) => [m.client.id, m.client.name])).values()];
                  const checkNums = [...new Set(movs.filter((m: any) => m.check?.check_number).map((m: any) => m.check.check_number))];
                  return (
                  <tr key={t.id} className={`border-b border-[#334155]/30 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0a1324]/30'}`}>
                    <td className="p-4 text-[#d1dded] whitespace-nowrap">{new Date(t.operation_date).toLocaleDateString('es-AR')}</td>
                    <td className="p-4">
                      <p className={t.is_reversed ? 'text-[#677383] line-through' : 'text-[#d1dded]'}>{t.description}</p>
                      {t.reversal_of && <span className="mt-1 inline-block text-[10px] text-[#7e8b9d] bg-[#2c394a] px-1.5 py-0.5 rounded border border-[#4d596b] font-bold uppercase tracking-wider">Reversión</span>}
                    </td>
                    <td className="p-4 text-[#94a3b8] text-sm">
                      {clients.length > 0 ? clients.join(', ') : <span className="text-[#4d596b]">—</span>}
                    </td>
                    <td className="p-4 text-[#94a3b8] text-sm font-mono">
                      {checkNums.length > 0 ? checkNums.join(', ') : <span className="text-[#4d596b]">—</span>}
                    </td>
                    <td className="p-4 text-[#64748b] text-sm">{t.user?.name || 'Sistema'}</td>
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
            </table>
            {opsVisible < checkTradeTxs.length && (
              <div className="p-4 text-center border-t border-[#334155]/30">
                <button onClick={() => setOpsVisible(v => v + 10)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                  Ver más ({checkTradeTxs.length - opsVisible} restantes)
                </button>
              </div>
            )}
          </div>
        </div>

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

  // ─── FORM VIEW ─────────────────────────────────────────────────────────
  const netToClient = isBuyOperation && commissionEnabled ? Math.max(totalChecks - commissionAmount, 0) : 0;

  return (
    <div className="w-full animate-in slide-in-from-bottom-8 duration-500 max-w-5xl mx-auto pb-12">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-[#f8fafc] tracking-tight">Nueva Operación — Compra/Venta de Cheques</h1>
          {isBuyOperation && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              COMPRA
            </span>
          )}
          {isSellOperation && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-violet-500/15 text-violet-400 border border-violet-500/30">
              VENTA
            </span>
          )}
        </div>
        <p className="text-[#94a3b8]">
          {isBuyOperation
            ? 'La agencia adquiere los cheques. La comisión se registra como ingreso; el neto se le debe al cliente.'
            : isSellOperation
              ? 'La agencia vende cheques de cartera. La comisión del tercero se registra como gasto.'
              : 'Seleccioná el vendedor para detectar el tipo de operación.'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── PASO 1: PARTES ──────────────────────────────────────────── */}
        <div className="glass-panel p-6 rounded-2xl border border-[#334155]/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-[#0ea5e9]/8 pointer-events-none" />
          <div className="flex items-center gap-2 mb-4 relative z-10">
            <span className="w-6 h-6 rounded-full bg-[#0ea5e9] flex items-center justify-center text-xs font-bold text-black">1</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#64748b]">Partes de la Operación</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10">
            {/* VENDEDOR */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-red-400">Vendedor — Entrega Cheques</h3>
              </div>
              <select required value={form.sellerId} onChange={e => setForm({ ...form, sellerId: e.target.value })}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-400">
                <option value="">Seleccione vendedor...</option>
                {partyOptions}
              </select>
              <input readOnly value={getPartyLabel(form.sellerId)} placeholder="Caja Vendedor"
                className="w-full bg-[#050d1c] border border-[#1e2d40] rounded-lg px-4 py-2.5 text-[#64748b] cursor-not-allowed text-sm italic" />
            </div>

            {/* COMPRADOR */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#0ea5e9]" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#0ea5e9]">Comprador — Recibe Cheques</h3>
              </div>
              <select required value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
                <option value="">Seleccione comprador...</option>
                {partyOptions}
              </select>
              <input readOnly value={getPartyLabel(form.buyerId)} placeholder="Caja Comprador"
                className="w-full bg-[#050d1c] border border-[#1e2d40] rounded-lg px-4 py-2.5 text-[#64748b] cursor-not-allowed text-sm italic" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4 relative z-10">
            <div>
              <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Fecha</label>
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
            </div>
            <div>
              <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Notas (Opcional)</label>
              <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Observaciones..."
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
            </div>
          </div>
        </div>

        {/* ── PASO 3: CHEQUES ─────────────────────────────────────────── */}
        <div className="glass-panel rounded-2xl overflow-hidden border border-[#334155]/50">
          <div className="bg-[#0a1324]/80 px-6 py-4 flex items-center justify-between border-b border-[#0ea5e9]/20">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0ea5e9] flex items-center justify-center text-xs font-bold text-black">2</span>
              <div>
                <h3 className="font-bold text-[#f8fafc]">Cheques de la Operación</h3>
                <p className="text-xs text-[#64748b]">
                  {selectedChecks.length} seleccionado{selectedChecks.length !== 1 ? 's' : ''} · Total:
                  <span className="text-[#0ea5e9] font-bold ml-1">
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
                <p className="text-[#64748b] text-sm">Seleccioná el vendedor en el Paso 1 para ver sus cheques.</p>
              ) : form.sellerId.startsWith('BOX:') ? (
                <>
                  <p className="text-3xl mb-3">📭</p>
                  <p className="text-[#64748b] text-sm font-medium">La agencia no tiene cheques propios en cartera.</p>
                  <p className="text-[#475569] text-xs mt-1">Comprá cheques a un cliente primero para poder revenderlos.</p>
                </>
              ) : (
                <>
                  <p className="text-3xl mb-3">📭</p>
                  <p className="text-[#64748b] text-sm font-medium">{selectedClient?.name} no tiene cheques pendientes de compra.</p>
                  <p className="text-[#475569] text-xs mt-1">
                    Ingresalos desde{' '}
                    <a href="/dashboard/incomes" className="text-[#0ea5e9] hover:underline font-semibold">Ingreso de Valores → Cheque</a>.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="px-6 py-3 bg-[#0a1324]/40 border-t border-[#334155]/30 flex items-center justify-between">
                <button type="button"
                  onClick={() => selectedChecks.length === clientPortfolioChecks.length
                    ? setSelectedChecks([])
                    : setSelectedChecks(clientPortfolioChecks)}
                  className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                  {selectedChecks.length === clientPortfolioChecks.length ? '✕ Deseleccionar todos' : '✓ Seleccionar todos'}
                </button>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-xs">🔍</span>
                  <input type="text" value={checkSearch} onChange={e => setCheckSearch(e.target.value)}
                    placeholder="Filtrar..."
                    className="bg-[#081329] border border-[#2c394a] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] w-36" />
                </div>
              </div>

              {/* Check rows */}
              <div className="divide-y divide-[#334155]/20 max-h-80 overflow-y-auto">
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
                        className={`flex items-center px-6 py-3 cursor-pointer transition-all duration-150 ${isSelected ? 'bg-emerald-500/5' : 'hover:bg-white/2'}`}>
                        {/* Checkbox indicator */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-4 shrink-0 border transition-all duration-150 ${isSelected ? 'bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.15)]' : 'bg-[#0a1324] border-[#334155]/60'}`}>
                          {isSelected && <span className="text-emerald-400 text-sm font-bold">✓</span>}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#d1dded]">
                            {c.bank_name} <span className="text-[#64748b] font-mono text-xs">#{c.check_number}</span>
                            {c.source_client?.name && <span className="ml-2 text-[10px] text-[#475569]">· {c.source_client.name}</span>}
                          </p>
                          <p className="text-xs text-[#64748b]">Vto: {new Date(c.due_date).toLocaleDateString('es-AR')}</p>
                        </div>
                        {/* Amount */}
                        <span className="font-bold font-mono text-[#f8fafc] text-sm mr-4">
                          $ {Number(c.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        {/* X button */}
                        <button type="button"
                          onClick={e => { e.stopPropagation(); removeCheck(c.id); }}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all border shrink-0 ${isSelected ? 'bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border-red-500/20' : 'opacity-0 pointer-events-none border-transparent'}`}>
                          ✕
                        </button>
                      </div>
                    );
                  })
                }
              </div>
            </>
          )}
        </div>

        {/* ── PASO 4: COMISIÓN (Opcional) ─────────────────────────────── */}
        <div className={`rounded-2xl overflow-hidden border transition-all duration-300 ${commissionEnabled ? 'border-amber-500/30 bg-amber-500/5' : 'border-[#334155]/50 glass-panel'}`}>
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black">3</span>
              <div>
                <h3 className="font-bold text-[#f8fafc] text-sm">Comisión (Opcional)</h3>
                <p className="text-xs text-[#64748b]">
                  {isBuyOperation ? '📥 Ingreso para la agencia (se descuenta del neto al cliente)' : isSellOperation ? '📤 Gasto para la agencia (costo cobrado por el tercero)' : 'Aplicar comisión porcentual sobre el total de cheques.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCommissionEnabled(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${commissionEnabled ? 'bg-amber-500' : 'bg-[#334155]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${commissionEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {commissionEnabled && (
            <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Tipo</label>
                  <select value={commType} onChange={e => setCommType(e.target.value)}
                    className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-400">
                    {Object.entries(COMMISSION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Base (Total cheques)</label>
                  <input readOnly value={`$ ${totalChecks.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                    className="w-full bg-[#050d1c] border border-[#1e2d40] rounded-lg px-4 py-3 text-[#64748b] cursor-not-allowed font-mono" />
                </div>
                <div>
                  <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Porcentaje (%)</label>
                  <NumericFormat
                    value={commPercentage}
                    onValueChange={v => setCommPercentage(v.value)}
                    decimalSeparator="." suffix="%" decimalScale={4}
                    className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-400"
                    placeholder="Ej: 0.5"
                  />
                </div>
              </div>

              {/* Result */}
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 flex items-center justify-between">
                <div className="text-[#94a3b8] text-sm">
                  $ {totalChecks.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  <span className="mx-2 text-[#475569]">×</span>
                  <span className="text-amber-400 font-bold">{commPercentage || 0}%</span>
                  <span className="mx-2 text-[#475569]">=</span>
                </div>
                <p className="text-2xl font-bold font-mono text-amber-300">
                  $ {commissionAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              {isBuyOperation && netToClient > 0 && (
                <div className="mt-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                  <p className="text-sm text-[#64748b]">Neto a entregar al cliente (AP registrada)</p>
                  <p className="text-xl font-bold font-mono text-emerald-400">
                    $ {netToClient.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
        <div className="flex justify-between items-center pt-2">
          <button type="button" onClick={() => setIsFormOpen(false)}
            className="px-6 py-3 text-[#aab6c7] hover:text-white transition-colors font-medium">
            ← Volver
          </button>
          <div className="flex items-center gap-3">
            {commissionEnabled && commissionAmount > 0 && (
              <p className="text-sm text-amber-400 font-medium">
                + Comisión: $ {commissionAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || selectedChecks.length === 0}
              className={`px-8 py-3 rounded-xl font-bold text-white transition-all duration-300 shadow-lg ${
                (loading || selectedChecks.length === 0)
                  ? 'opacity-40 cursor-not-allowed bg-gray-600'
                  : 'bg-linear-to-r from-[#0ea5e9] to-[#0284c7] hover:scale-105 hover:shadow-[0_0_20px_rgba(14,165,233,0.4)]'
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
